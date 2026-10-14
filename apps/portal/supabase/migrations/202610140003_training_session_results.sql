begin;

-- New Training-result surfaces fail closed if an identity ever acquires more
-- than the single active membership assumed by the M1 actor contract.
create function app_private.training_result_actor_unambiguous()
returns boolean language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and (
    select count(*) from public.organization_memberships m
    where m.user_id=auth.uid() and m.status='ACTIVE'
  )=1
$$;
revoke all on function app_private.training_result_actor_unambiguous() from public,anon,authenticated;
grant execute on function app_private.training_result_actor_unambiguous() to authenticated;

-- A browser submits measurements only. Set kind and unit are always rebuilt
-- from the immutable publication snapshot and persisted with the result.
create function app_private.training_result_sets_shape_valid(p_sets jsonb)
returns boolean language plpgsql immutable set search_path='' as $$
declare item jsonb;
begin
  if p_sets is null or jsonb_typeof(p_sets)<>'array'
     or jsonb_array_length(p_sets)>24000 then return false; end if;
  if (select count(*)<>count(distinct lower(value->>'exerciseId')||':'||(value->>'setNumber'))
      from jsonb_array_elements(p_sets)) then return false; end if;
  for item in select value from jsonb_array_elements(p_sets) loop
    if jsonb_typeof(item)<>'object'
       or not item ?& array['exerciseId','setNumber','status','reps','load','rir','kind','unit']
       or item-array['exerciseId','setNumber','status','reps','load','rir','kind','unit']<>'{}'::jsonb
       or not app_private.training_draft_uuid_valid(item->'exerciseId')
       or not app_private.training_draft_int_valid(item->'setNumber',1,40)
       or jsonb_typeof(item->'status')<>'string' or item->>'status' not in ('PENDING','DONE','SKIPPED')
       or jsonb_typeof(item->'kind')<>'string' or item->>'kind' not in ('PRESCRIBED','EXTRA')
       or jsonb_typeof(item->'unit')<>'string' or item->>'unit' not in ('lb','min','sec','distance','level')
       or not ((item->'reps'='null'::jsonb) or app_private.training_draft_int_valid(item->'reps',0,10000))
       or not ((item->'rir'='null'::jsonb) or app_private.training_draft_int_valid(item->'rir',0,10))
       or not ((item->'load'='null'::jsonb) or (
         jsonb_typeof(item->'load')='number'
         and (item->>'load')::numeric between 0 and 100000
         and (item->>'load')::numeric=round((item->>'load')::numeric,6)
       ))
       or (item->>'status'='DONE' and (item->'load'='null'::jsonb or (item->>'unit'='lb' and item->'reps'='null'::jsonb)))
       or (item->>'status'<>'DONE' and (item->'reps'<>'null'::jsonb or item->'load'<>'null'::jsonb or item->'rir'<>'null'::jsonb))
       then return false; end if;
  end loop;
  return true;
exception when others then return false;
end $$;
revoke all on function app_private.training_result_sets_shape_valid(jsonb) from public,anon,authenticated;

create function app_private.training_result_enrich_sets(
  p_sets jsonb,p_session jsonb,p_status text,p_note text
) returns jsonb language plpgsql immutable set search_path='' as $$
declare enriched jsonb; valid boolean; has_skipped boolean;
begin
  if p_status is null or p_status not in ('IN_PROGRESS','COMPLETED')
     or p_sets is null or jsonb_typeof(p_sets)<>'array'
     or jsonb_array_length(p_sets)>24000 then
    raise exception using errcode='P0001',message='FE_INVALID_WORKOUT';
  end if;
  with catalog as (
    select lower(e.value->>'id') exercise_id,e.value exercise
    from jsonb_array_elements(p_session->'blocks') b
    cross join lateral jsonb_array_elements(b.value->'exercises') e
  ), raw as (
    select input.value item,input.ordinal
    from jsonb_array_elements(p_sets) with ordinality as input(value,ordinal)
  ), matched as (
    select raw.*,
      case when app_private.training_draft_int_valid(item->'setNumber',1,40)
        then (item->>'setNumber')::integer end set_number,
      catalog.exercise
    from raw left join catalog on catalog.exercise_id=lower(raw.item->>'exerciseId')
  ), prescribed as (
    select matched.*,
      case when exercise is not null then (exercise#>>'{prescription,sets}')::integer end prescribed_count
    from matched
  ), derived as (
    select prescribed.*,
      case when set_number<=prescribed_count and jsonb_typeof(exercise#>'{prescription,prescribedSets}')='array'
        then exercise#>>array['prescription','prescribedSets',(set_number-1)::text,'unit']
        else exercise#>>'{prescription,unit}' end unit
    from prescribed
  )
  select
    coalesce(bool_and(coalesce(
      jsonb_typeof(item)='object'
      and item ?& array['exerciseId','setNumber','status','reps','load','rir']
      and item-array['exerciseId','setNumber','status','reps','load','rir']='{}'::jsonb
      and app_private.training_draft_uuid_valid(item->'exerciseId')
      and set_number is not null and exercise is not null and set_number<=prescribed_count+20
      and jsonb_typeof(item->'status')='string' and item->>'status' in ('PENDING','DONE','SKIPPED')
      and ((item->'reps'='null'::jsonb) or app_private.training_draft_int_valid(item->'reps',0,10000))
      and ((item->'rir'='null'::jsonb) or app_private.training_draft_int_valid(item->'rir',0,10))
      and ((item->'load'='null'::jsonb) or (
        jsonb_typeof(item->'load')='number'
        and case when jsonb_typeof(item->'load')='number' then (item->>'load')::numeric end between 0 and 100000
        and case when jsonb_typeof(item->'load')='number' then (item->>'load')::numeric end
          =round(case when jsonb_typeof(item->'load')='number' then (item->>'load')::numeric end,6)
      ))
      and (
        (item->>'status'='DONE' and item->'load'<>'null'::jsonb and (unit<>'lb' or item->'reps'<>'null'::jsonb))
        or (item->>'status'<>'DONE' and item->'reps'='null'::jsonb and item->'load'='null'::jsonb and item->'rir'='null'::jsonb)
      )
      and (p_status<>'COMPLETED' or item->>'status'<>'PENDING')
    ,false)),true)
      and count(*)=count(distinct lower(item->>'exerciseId')||':'||(item->>'setNumber')),
    coalesce(jsonb_agg(item||jsonb_build_object(
      'exerciseId',exercise->>'id',
      'kind',case when set_number<=prescribed_count then 'PRESCRIBED' else 'EXTRA' end,
      'unit',unit
    ) order by ordinal),'[]'::jsonb),
    coalesce(bool_or(item->>'status'='SKIPPED'),false)
  into valid,enriched,has_skipped from derived;
  if not valid then raise exception using errcode='P0001',message='FE_INVALID_WORKOUT'; end if;
  if has_skipped and (
    p_note is null
    or regexp_replace(p_note,'[[:space:]]','','g')=''
  ) then
    raise exception using errcode='P0001',message='FE_INVALID_WORKOUT'; end if;
  if p_status='COMPLETED' and exists(
    select 1 from (
      (select lower(e.value->>'id') exercise_id,n set_number
       from jsonb_array_elements(p_session->'blocks') b
       cross join lateral jsonb_array_elements(b.value->'exercises') e
       cross join lateral generate_series(1,(e.value#>>'{prescription,sets}')::integer) n)
      except
      (select lower(result.value->>'exerciseId'),(result.value->>'setNumber')::integer
       from jsonb_array_elements(enriched) result
       where result.value->>'status' in ('DONE','SKIPPED'))
    ) missing
  ) then raise exception using errcode='P0001',message='FE_INVALID_WORKOUT'; end if;
  return enriched;
exception when sqlstate 'P0001' then raise;
  when others then raise exception using errcode='P0001',message='FE_INVALID_WORKOUT';
end $$;
revoke all on function app_private.training_result_enrich_sets(jsonb,jsonb,text,text) from public,anon,authenticated;

create table public.training_session_results(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  client_id uuid not null,
  publication_id uuid not null references public.training_program_publications(id) on delete restrict,
  week_number integer not null check(week_number between 1 and 52),
  session_id uuid not null,
  row_version bigint not null default 1 check(row_version>0),
  status text not null check(status in ('IN_PROGRESS','COMPLETED')),
  sets jsonb not null check(app_private.training_result_sets_shape_valid(sets)),
  note text check(note is null or char_length(note)<=2000),
  started_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz,
  foreign key(organization_id,client_id) references public.clients(organization_id,id) on delete restrict,
  unique(publication_id,week_number,session_id),
  check((status='COMPLETED')=(completed_at is not null))
);
create index training_results_client_history_idx
  on public.training_session_results(organization_id,client_id,started_at desc,id desc);
alter table public.training_session_results enable row level security;
alter table public.training_session_results force row level security;
revoke all on public.training_session_results from public,anon,authenticated,service_role;
grant select on public.training_session_results to authenticated;
grant select,insert,update on public.training_session_results to service_role;
create policy training_session_results_authorized_select on public.training_session_results
for select to authenticated using(
  app_private.training_result_actor_unambiguous()
  and (
    app_private.has_own_client_access(organization_id,client_id)
    or app_private.can_publish_training(organization_id,client_id)
  )
);

create function app_private.training_result_guard() returns trigger
language plpgsql security definer set search_path='' as $$
declare publication public.training_program_publications%rowtype; session jsonb; expected jsonb;
begin
  if tg_op='DELETE' then raise exception using errcode='P0001',message='FE_WORKOUT_COMPLETED'; end if;
  if tg_op='INSERT' and new.row_version<>1 then
    raise exception using errcode='P0001',message='FE_INVALID_WORKOUT'; end if;
  if tg_op='UPDATE' then
    if old.status='COMPLETED' then raise exception using errcode='P0001',message='FE_WORKOUT_COMPLETED'; end if;
    if new.id<>old.id or new.organization_id<>old.organization_id or new.client_id<>old.client_id
       or new.publication_id<>old.publication_id or new.week_number<>old.week_number
       or new.session_id<>old.session_id or new.started_at<>old.started_at
       or new.row_version<>old.row_version+1 then
      raise exception using errcode='P0001',message='FE_INVALID_WORKOUT'; end if;
  end if;
  select * into publication from public.training_program_publications p
  where p.id=new.publication_id and p.organization_id=new.organization_id and p.client_id=new.client_id;
  if not found then raise exception using errcode='P0001',message='FE_INVALID_WORKOUT'; end if;
  select s.value into session
  from jsonb_array_elements(publication.document->'weeks') w
  cross join lateral jsonb_array_elements(w.value->'sessions') s
  where (w.value->>'number')::integer=new.week_number and (s.value->>'id')::uuid=new.session_id;
  if not found then raise exception using errcode='P0001',message='FE_INVALID_WORKOUT'; end if;
  select coalesce(jsonb_agg(value-array['kind','unit'] order by ordinal),'[]'::jsonb) into expected
  from jsonb_array_elements(new.sets) with ordinality item(value,ordinal);
  expected:=app_private.training_result_enrich_sets(expected,session,new.status,new.note);
  if expected<>new.sets then raise exception using errcode='P0001',message='FE_INVALID_WORKOUT'; end if;
  return new;
end $$;
revoke all on function app_private.training_result_guard() from public,anon,authenticated;
create trigger training_result_guard before insert or update or delete on public.training_session_results
for each row execute function app_private.training_result_guard();

create table app_private.training_result_receipts(
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  idempotency_key uuid not null,
  request_fingerprint text not null check(request_fingerprint~'^[0-9a-f]{64}$'),
  result_id uuid not null references public.training_session_results(id) on delete restrict,
  result_snapshot jsonb not null check(jsonb_typeof(result_snapshot)='object'),
  created_at timestamptz not null default clock_timestamp(),
  primary key(actor_user_id,idempotency_key)
);
revoke all on app_private.training_result_receipts from public,anon,authenticated;

create function app_private.training_result_snapshot(
  p_result public.training_session_results,p_publication public.training_program_publications
) returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object(
    'id',p_result.id,'publicationId',p_result.publication_id,
    'weekNumber',p_result.week_number,'sessionId',p_result.session_id,
    'version',p_result.row_version,'status',p_result.status,'sets',p_result.sets,
    'note',p_result.note,'startedAt',p_result.started_at,'updatedAt',p_result.updated_at,
    'completedAt',p_result.completed_at,
    'session',(select s.value from jsonb_array_elements(p_publication.document->'weeks') w
      cross join lateral jsonb_array_elements(w.value->'sessions') s
      where (w.value->>'number')::integer=p_result.week_number and (s.value->>'id')::uuid=p_result.session_id),
    'programTitle',p_publication.document->'title','publicationRevision',p_publication.revision
  )
$$;
revoke all on function app_private.training_result_snapshot(public.training_session_results,public.training_program_publications)
  from public,anon,authenticated;

create function public.save_training_session_result(
  p_publication_id uuid,p_week_number integer,p_session_id uuid,p_expected_version bigint,
  p_idempotency_key uuid,p_status text,p_sets jsonb,p_note text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); client public.clients%rowtype; membership public.organization_memberships%rowtype;
  publication public.training_program_publications%rowtype; latest_id uuid; session jsonb;
  result public.training_session_results%rowtype; receipt app_private.training_result_receipts%rowtype;
  normalized_note text:=nullif(regexp_replace(p_note,'^[[:space:]]+|[[:space:]]+$','','g'),'');
  enriched jsonb; fingerprint text; snapshot jsonb;
begin
  if actor is null then raise exception using errcode='P0001',message='FE_UNAUTHENTICATED'; end if;
  if not app_private.training_result_actor_unambiguous() then
    raise exception using errcode='P0001',message='FE_FORBIDDEN'; end if;
  if p_publication_id is null or p_session_id is null or p_idempotency_key is null
     or p_week_number is null or p_week_number not between 1 and 52
     or p_expected_version is null or p_expected_version not between 0 and 9007199254740991
     or p_status is null or p_status not in ('IN_PROGRESS','COMPLETED') or p_sets is null
     or jsonb_typeof(p_sets)<>'array' then
    raise exception using errcode='P0001',message='FE_INVALID_WORKOUT'; end if;
  if jsonb_array_length(p_sets)>24000
     or (normalized_note is not null and char_length(normalized_note)>2000)
     or octet_length(convert_to(jsonb_build_object('sets',p_sets,'note',normalized_note)::text,'UTF8'))>4194304 then
    raise exception using errcode='P0001',message='FE_INVALID_WORKOUT'; end if;
  select c.* into client from public.clients c
  where c.auth_user_id=actor and c.status='ACTIVE'
    and app_private.has_own_client_access(c.organization_id,c.id);
  if not found then raise exception using errcode='P0001',message='FE_FORBIDDEN'; end if;
  select m.* into membership from public.organization_memberships m
  where m.organization_id=client.organization_id and m.user_id=actor and m.status='ACTIVE';
  if not found then raise exception using errcode='P0001',message='FE_FORBIDDEN'; end if;
  select p.* into publication from public.training_program_publications p
  where p.id=p_publication_id and p.organization_id=client.organization_id and p.client_id=client.id;
  if not found then raise exception using errcode='P0001',message='FE_NOT_FOUND'; end if;
  select s.value into session from jsonb_array_elements(publication.document->'weeks') w
  cross join lateral jsonb_array_elements(w.value->'sessions') s
  where (w.value->>'number')::integer=p_week_number and (s.value->>'id')::uuid=p_session_id;
  if not found then raise exception using errcode='P0001',message='FE_NOT_FOUND'; end if;
  enriched:=app_private.training_result_enrich_sets(p_sets,session,p_status,normalized_note);
  fingerprint:=encode(extensions.digest(convert_to(jsonb_build_object(
    'organizationId',client.organization_id,'clientId',client.id,'publicationId',p_publication_id,
    'weekNumber',p_week_number,'sessionId',p_session_id,'expectedVersion',p_expected_version,
    'status',p_status,'sets',enriched,'note',normalized_note
  )::text,'UTF8'),'sha256'),'hex');
  perform pg_advisory_xact_lock(hashtextextended(concat_ws(':','training-result-command',actor::text,p_idempotency_key::text),0));
  select * into receipt from app_private.training_result_receipts
  where actor_user_id=actor and idempotency_key=p_idempotency_key;
  if found then
    if receipt.request_fingerprint<>fingerprint then raise exception using errcode='P0001',message='FE_IDEMPOTENCY_CONFLICT'; end if;
    return receipt.result_snapshot;
  end if;
  -- Same lock and order as publication: a new result cannot race a replacement
  -- publication and accidentally begin against the old current plan.
  perform pg_advisory_xact_lock(hashtextextended(concat_ws(':','training-publication-client',client.organization_id::text,client.id::text),0));
  select * into result from public.training_session_results r
  where r.publication_id=p_publication_id and r.week_number=p_week_number and r.session_id=p_session_id for update;
  if not found then
    if p_expected_version<>0 then raise exception using errcode='P0001',message='FE_VERSION_CONFLICT'; end if;
    select p.id into latest_id from public.training_program_publications p
    where p.organization_id=client.organization_id and p.client_id=client.id order by p.revision desc limit 1;
    if latest_id is distinct from p_publication_id then raise exception using errcode='P0001',message='FE_SUPERSEDED_PUBLICATION'; end if;
    insert into public.training_session_results(
      organization_id,client_id,publication_id,week_number,session_id,status,sets,note,completed_at
    ) values(
      client.organization_id,client.id,p_publication_id,p_week_number,p_session_id,p_status,enriched,normalized_note,
      case when p_status='COMPLETED' then clock_timestamp() else null end
    ) returning * into result;
  else
    if result.organization_id<>client.organization_id or result.client_id<>client.id then
      raise exception using errcode='P0001',message='FE_NOT_FOUND'; end if;
    if result.status='COMPLETED' then raise exception using errcode='P0001',message='FE_WORKOUT_COMPLETED'; end if;
    if result.row_version<>p_expected_version then raise exception using errcode='P0001',message='FE_VERSION_CONFLICT'; end if;
    update public.training_session_results r set
      status=p_status,sets=enriched,note=normalized_note,row_version=r.row_version+1,
      updated_at=clock_timestamp(),completed_at=case when p_status='COMPLETED' then clock_timestamp() else null end
    where r.id=result.id returning r.* into result;
  end if;
  snapshot:=app_private.training_result_snapshot(result,publication);
  insert into app_private.training_result_receipts(actor_user_id,idempotency_key,request_fingerprint,result_id,result_snapshot)
    values(actor,p_idempotency_key,fingerprint,result.id,snapshot);
  insert into public.audit_events(
    organization_id,actor_user_id,actor_role,command,entity_type,entity_id,entity_version,result,correlation_id,context
  ) values(
    client.organization_id,actor,membership.role,
    case when p_status='COMPLETED' then 'COMPLETE_TRAINING_SESSION_RESULT' else 'SAVE_TRAINING_SESSION_RESULT' end,
    'training_session_result',result.id,result.row_version,'SUCCEEDED',p_idempotency_key,
    jsonb_build_object('status',p_status)
  );
  return snapshot;
end $$;
revoke all on function public.save_training_session_result(uuid,integer,uuid,bigint,uuid,text,jsonb,text)
  from public,anon,authenticated;
grant execute on function public.save_training_session_result(uuid,integer,uuid,bigint,uuid,text,jsonb,text)
  to authenticated;

create function public.get_training_session_result(
  p_publication_id uuid,p_week_number integer,p_session_id uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare publication public.training_program_publications%rowtype; result public.training_session_results%rowtype; session jsonb;
begin
  if auth.uid() is null then raise exception using errcode='P0001',message='FE_UNAUTHENTICATED'; end if;
  if not app_private.training_result_actor_unambiguous() then
    raise exception using errcode='P0001',message='FE_FORBIDDEN'; end if;
  if p_publication_id is null or p_session_id is null or p_week_number is null or p_week_number not between 1 and 52 then
    raise exception using errcode='P0001',message='FE_INVALID_WORKOUT'; end if;
  select p.* into publication from public.training_program_publications p
  where p.id=p_publication_id and (
    app_private.has_own_client_access(p.organization_id,p.client_id)
    or app_private.can_publish_training(p.organization_id,p.client_id)
  );
  if not found then raise exception using errcode='P0001',message='FE_NOT_FOUND'; end if;
  select s.value into session from jsonb_array_elements(publication.document->'weeks') w
  cross join lateral jsonb_array_elements(w.value->'sessions') s
  where (w.value->>'number')::integer=p_week_number and (s.value->>'id')::uuid=p_session_id;
  if not found then raise exception using errcode='P0001',message='FE_NOT_FOUND'; end if;
  select r.* into result from public.training_session_results r
  where r.publication_id=p_publication_id and r.week_number=p_week_number and r.session_id=p_session_id;
  return jsonb_build_object(
    'workout',case when result.id is null then null else app_private.training_result_snapshot(result,publication)-'session' end,
    'publication',app_private.training_publication_snapshot(publication)
  );
end $$;
revoke all on function public.get_training_session_result(uuid,integer,uuid) from public,anon,authenticated;
grant execute on function public.get_training_session_result(uuid,integer,uuid) to authenticated;

create function public.list_training_session_results(p_client_id uuid default null,p_page integer default 0)
returns jsonb language plpgsql security definer set search_path='' as $$
declare client public.clients%rowtype; items jsonb; total bigint;
begin
  if auth.uid() is null then raise exception using errcode='P0001',message='FE_UNAUTHENTICATED'; end if;
  if not app_private.training_result_actor_unambiguous() then
    raise exception using errcode='P0001',message='FE_FORBIDDEN'; end if;
  if p_page is null or p_page not between 0 and 10000 then
    raise exception using errcode='P0001',message='FE_INVALID_WORKOUT'; end if;
  if p_client_id is null then
    select c.* into client from public.clients c where c.auth_user_id=auth.uid() and c.status='ACTIVE'
      and app_private.has_own_client_access(c.organization_id,c.id);
  else
    select c.* into client from public.clients c where c.id=p_client_id and c.status='ACTIVE'
      and app_private.can_publish_training(c.organization_id,c.id);
  end if;
  if not found then raise exception using errcode='P0001',message='FE_NOT_FOUND'; end if;
  select count(*) into total from public.training_session_results r
    where r.organization_id=client.organization_id and r.client_id=client.id;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',x.id,'publicationId',x.publication_id,'weekNumber',x.week_number,'sessionId',x.session_id,
    'version',x.row_version,'status',x.status,'startedAt',x.started_at,'updatedAt',x.updated_at,
    'completedAt',x.completed_at,'session',x.session,'programTitle',x.program_title,
    'publicationRevision',x.publication_revision
  ) order by x.started_at desc,x.id desc),'[]'::jsonb) into items from(
      select r.id,r.publication_id,r.week_number,r.session_id,r.row_version,r.status,
        r.started_at,r.updated_at,r.completed_at,p.document->'title' program_title,p.revision publication_revision,
        (select jsonb_build_object('id',s.value->'id','title',s.value->'title','type',s.value->'type')
         from jsonb_array_elements(p.document->'weeks') w
         cross join lateral jsonb_array_elements(w.value->'sessions') s
         where (w.value->>'number')::integer=r.week_number and (s.value->>'id')::uuid=r.session_id) session
      from public.training_session_results r
      join public.training_program_publications p on p.id=r.publication_id
      where r.organization_id=client.organization_id and r.client_id=client.id
      order by r.started_at desc,r.id desc limit 20 offset p_page*20
    ) x;
  return jsonb_build_object('items',items,'total',total,'page',p_page,'pageSize',20);
end $$;
revoke all on function public.list_training_session_results(uuid,integer) from public,anon,authenticated;
grant execute on function public.list_training_session_results(uuid,integer) to authenticated;

commit;
