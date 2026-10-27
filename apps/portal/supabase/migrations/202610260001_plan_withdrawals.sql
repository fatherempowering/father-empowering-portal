begin;

-- Append-only withdrawal facts. Immutable publications and workout results are
-- never deleted or rewritten; an older revision never becomes current again.
create table public.training_program_withdrawals (
 publication_id uuid primary key references public.training_program_publications(id) on delete restrict,
 withdrawn_at timestamptz not null default clock_timestamp(),
 withdrawn_by uuid not null references auth.users(id) on delete restrict
);
create table public.nutrition_plan_withdrawals (
 publication_id uuid primary key references public.nutrition_plan_publications(id) on delete restrict,
 withdrawn_at timestamptz not null default clock_timestamp(),
 withdrawn_by uuid not null references auth.users(id) on delete restrict
);
alter table public.training_program_withdrawals enable row level security;
alter table public.training_program_withdrawals force row level security;
alter table public.nutrition_plan_withdrawals enable row level security;
alter table public.nutrition_plan_withdrawals force row level security;
revoke all on public.training_program_withdrawals,public.nutrition_plan_withdrawals from public,anon,authenticated,service_role;
grant select on public.training_program_withdrawals,public.nutrition_plan_withdrawals to authenticated,service_role;
create policy training_withdrawal_read on public.training_program_withdrawals for select to authenticated using (
 app_private.training_result_actor_unambiguous() and exists(select 1 from public.training_program_publications p
   where p.id=publication_id and (app_private.has_own_client_access(p.organization_id,p.client_id) or app_private.can_publish_training(p.organization_id,p.client_id)))
);
create policy nutrition_withdrawal_read on public.nutrition_plan_withdrawals for select to authenticated using (
 app_private.training_result_actor_unambiguous() and exists(select 1 from public.nutrition_plan_publications p
   where p.id=publication_id and (app_private.has_own_client_access(p.organization_id,p.client_id) or app_private.followup_coach_access(p.organization_id,p.client_id)))
);
create trigger training_withdrawal_immutable before update or delete on public.training_program_withdrawals
 for each row execute function app_private.followup_immutable();
create trigger nutrition_withdrawal_immutable before update or delete on public.nutrition_plan_withdrawals
 for each row execute function app_private.followup_immutable();
create table app_private.training_withdrawal_receipts (
 actor_user_id uuid not null references auth.users(id) on delete restrict,
 idempotency_key uuid not null,request_fingerprint text not null,publication_id uuid not null references public.training_program_publications(id) on delete restrict,
 primary key(actor_user_id,idempotency_key)
);
revoke all on app_private.training_withdrawal_receipts from public,anon,authenticated,service_role;

create or replace function app_private.training_publication_snapshot(p public.training_program_publications) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object('id',p.id,'clientId',p.client_id,'programId',p.program_id,'draftVersion',p.draft_version,
   'revision',p.revision,'document',p.document,'publishedAt',p.published_at,
   'withdrawnAt',(select w.withdrawn_at from public.training_program_withdrawals w where w.publication_id=p.id))
$$;
create or replace function app_private.nutrition_publication_json(p public.nutrition_plan_publications) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object('id',p.id,'clientId',p.client_id,'revision',p.revision,'draftVersion',p.draft_version,'document',p.document,'publishedAt',p.published_at,
   'withdrawnAt',(select w.withdrawn_at from public.nutrition_plan_withdrawals w where w.publication_id=p.id))
$$;

create function public.withdraw_training_program(p_client_id uuid,p_expected_publication_id uuid,p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();m public.organization_memberships%rowtype;latest public.training_program_publications%rowtype;
 receipt app_private.training_withdrawal_receipts%rowtype;fingerprint text;
begin
 if actor is null then raise exception using errcode='P0001',message='FE_UNAUTHENTICATED'; end if;
 if not app_private.training_result_actor_unambiguous() or not app_private.has_verified_coach_session() then raise exception using errcode='P0001',message='FE_FORBIDDEN'; end if;
 select * into m from public.organization_memberships where user_id=actor and status='ACTIVE' and role in ('ADMIN','COACH');
 if not found then raise exception using errcode='P0001',message='FE_FORBIDDEN'; end if;
 if p_client_id is null or p_expected_publication_id is null or p_idempotency_key is null then raise exception using errcode='P0001',message='FE_INVALID_WITHDRAWAL'; end if;
 if not app_private.can_publish_training(m.organization_id,p_client_id) then raise exception using errcode='P0001',message='FE_NOT_FOUND'; end if;
 fingerprint:=encode(extensions.digest(convert_to(jsonb_build_object('organization',m.organization_id,'client',p_client_id,'publication',p_expected_publication_id)::text,'UTF8'),'sha256'),'hex');
 perform pg_advisory_xact_lock(hashtextextended(concat_ws(':','training-withdrawal-command',actor::text,p_idempotency_key::text),0));
 select * into receipt from app_private.training_withdrawal_receipts where actor_user_id=actor and idempotency_key=p_idempotency_key;
 if found then
   if receipt.request_fingerprint<>fingerprint then raise exception using errcode='P0001',message='FE_IDEMPOTENCY_CONFLICT'; end if;
   return jsonb_build_object('program',null);
 end if;
 -- Identical Client lock to publication and workout writes, not a separate lock.
 perform pg_advisory_xact_lock(hashtextextended(concat_ws(':','training-publication-client',m.organization_id::text,p_client_id::text),0));
 select * into latest from public.training_program_publications where organization_id=m.organization_id and client_id=p_client_id order by revision desc limit 1;
 if latest.id is distinct from p_expected_publication_id or exists(select 1 from public.training_program_withdrawals where publication_id=latest.id) then
   raise exception using errcode='P0001',message='FE_VERSION_CONFLICT'; end if;
 insert into public.training_program_withdrawals(publication_id,withdrawn_by) values(latest.id,actor);
 insert into app_private.training_withdrawal_receipts values(actor,p_idempotency_key,fingerprint,latest.id);
 insert into public.audit_events(organization_id,actor_user_id,actor_role,command,entity_type,entity_id,entity_version,result,correlation_id)
 values(m.organization_id,actor,m.role,'WITHDRAW_TRAINING_PROGRAM','training_program_publication',latest.id,latest.revision,'SUCCEEDED',p_idempotency_key);
 return jsonb_build_object('program',null);
end $$;
revoke all on function public.withdraw_training_program(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.withdraw_training_program(uuid,uuid,uuid) to authenticated;

create or replace function public.publish_training_program(p_client_id uuid,p_program_id uuid,p_draft_version bigint,p_expected_publication_id uuid,p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); m public.organization_memberships%rowtype;
  d public.training_program_drafts%rowtype; latest public.training_program_publications%rowtype;
  publication public.training_program_publications%rowtype; receipt app_private.training_publication_receipts%rowtype; fingerprint text;
begin
  if actor is null then raise exception using errcode='P0001',message='FE_UNAUTHENTICATED'; end if;
  if not app_private.has_verified_coach_session() or (select count(*) from public.organization_memberships where user_id=actor and status='ACTIVE')<>1 then
    raise exception using errcode='P0001',message='FE_FORBIDDEN'; end if;
  select * into m from public.organization_memberships where user_id=actor and status='ACTIVE' and role in ('COACH','ADMIN');
  if not found then raise exception using errcode='P0001',message='FE_FORBIDDEN'; end if;
  if p_client_id is null or p_program_id is null or p_idempotency_key is null or p_draft_version is null or p_draft_version not between 1 and 9007199254740991 then
    raise exception using errcode='P0001',message='FE_INVALID_TRAINING_PUBLICATION'; end if;
  if not app_private.can_publish_training(m.organization_id,p_client_id) then raise exception using errcode='P0001',message='FE_NOT_FOUND'; end if;
  fingerprint:=encode(extensions.digest(convert_to(jsonb_build_object('org',m.organization_id,'client',p_client_id,'program',p_program_id,'version',p_draft_version,'previous',p_expected_publication_id)::text,'UTF8'),'sha256'),'hex');
  perform pg_advisory_xact_lock(hashtextextended(concat_ws(':','training-publication-command',actor::text,p_idempotency_key::text),0));
  select * into receipt from app_private.training_publication_receipts where actor_user_id=actor and idempotency_key=p_idempotency_key;
  if found then
    if receipt.request_fingerprint<>fingerprint then raise exception using errcode='P0001',message='FE_IDEMPOTENCY_CONFLICT'; end if;
    select * into publication from public.training_program_publications where id=receipt.publication_id and organization_id=m.organization_id and client_id=p_client_id;
    if not found then raise exception using errcode='P0001',message='FE_NOT_FOUND'; end if;
    return app_private.training_publication_snapshot(publication);
  end if;
  -- Serialize publications for one Client, including two different drafts.
  perform pg_advisory_xact_lock(hashtextextended(concat_ws(':','training-publication-client',m.organization_id::text,p_client_id::text),0));
  select * into d from public.training_program_drafts where id=p_program_id and organization_id=m.organization_id and (created_by=actor or m.role='ADMIN') for share;
  if not found then raise exception using errcode='P0001',message='FE_NOT_FOUND'; end if;
  if d.row_version<>p_draft_version then raise exception using errcode='P0001',message='FE_VERSION_CONFLICT'; end if;
  if not app_private.training_program_publishable(d.document) then raise exception using errcode='P0001',message='FE_INVALID_TRAINING_PUBLICATION'; end if;
  select * into latest from public.training_program_publications where organization_id=m.organization_id and client_id=p_client_id order by revision desc limit 1;
  if (case when exists(select 1 from public.training_program_withdrawals w where w.publication_id=latest.id) then null::uuid else latest.id end) is distinct from p_expected_publication_id then raise exception using errcode='P0001',message='FE_VERSION_CONFLICT'; end if;
  if exists(select 1 from public.training_program_publications where organization_id=m.organization_id and client_id=p_client_id and program_id=p_program_id and draft_version=p_draft_version) then
    raise exception using errcode='P0001',message='FE_ALREADY_PUBLISHED'; end if;
  insert into public.training_program_publications(organization_id,client_id,program_id,draft_version,revision,document,published_by)
    values(m.organization_id,p_client_id,d.id,d.row_version,coalesce(latest.revision,0)+1,d.document,actor) returning * into publication;
  insert into app_private.training_publication_receipts values(actor,p_idempotency_key,fingerprint,publication.id);
  insert into public.audit_events(organization_id,actor_user_id,actor_role,command,entity_type,entity_id,entity_version,result,correlation_id)
    values(m.organization_id,actor,m.role,'PUBLISH_TRAINING_PROGRAM','training_program_publication',publication.id,publication.revision,'SUCCEEDED',p_idempotency_key);
  return app_private.training_publication_snapshot(publication);
end $$;

create or replace function public.get_training_publication_for_coach(p_client_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare m public.organization_memberships%rowtype; publication public.training_program_publications%rowtype;
begin
  if not app_private.has_verified_coach_session() or (select count(*) from public.organization_memberships where user_id=auth.uid() and status='ACTIVE')<>1 then raise exception using errcode='P0001',message='FE_FORBIDDEN'; end if;
  select * into m from public.organization_memberships where user_id=auth.uid() and status='ACTIVE' and role in ('COACH','ADMIN');
  if not found then raise exception using errcode='P0001',message='FE_FORBIDDEN'; end if;
  if not app_private.can_publish_training(m.organization_id,p_client_id) then raise exception using errcode='P0001',message='FE_NOT_FOUND'; end if;
  select * into publication from public.training_program_publications where organization_id=m.organization_id and client_id=p_client_id order by revision desc limit 1;
  return jsonb_build_object('program',case when publication.id is null or exists(select 1 from public.training_program_withdrawals w where w.publication_id=publication.id) then null else app_private.training_publication_snapshot(publication) end);
end $$;

create or replace function public.save_training_session_result(
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
  -- A withdrawn plan is read-only, including retries and existing drafts.
  -- Serialize this check with publication/withdrawal before returning receipts.
  perform pg_advisory_xact_lock(hashtextextended(concat_ws(':','training-publication-client',client.organization_id::text,client.id::text),0));
  if exists(select 1 from public.training_program_withdrawals w where w.publication_id=p_publication_id) then
    raise exception using errcode='P0001',message='FE_WITHDRAWN_PUBLICATION'; end if;
  select * into receipt from app_private.training_result_receipts
  where actor_user_id=actor and idempotency_key=p_idempotency_key;
  if found then
    if receipt.request_fingerprint<>fingerprint then raise exception using errcode='P0001',message='FE_IDEMPOTENCY_CONFLICT'; end if;
    return receipt.result_snapshot;
  end if;
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

create or replace function public.get_followup_for_coach(p_client_id uuid,p_kind text,p_page integer default 0) returns jsonb
language plpgsql security definer set search_path='' as $$
declare m public.organization_memberships%rowtype; d public.nutrition_plan_drafts%rowtype; latest public.nutrition_plan_publications%rowtype; history jsonb; total bigint;
begin
 if auth.uid() is null then raise exception using errcode='P0001',message='FE_UNAUTHENTICATED'; end if;
 if not app_private.training_result_actor_unambiguous() or not app_private.has_verified_coach_session() then raise exception using errcode='P0001',message='FE_FORBIDDEN'; end if;
 select * into m from public.organization_memberships where user_id=auth.uid() and status='ACTIVE' and role in ('ADMIN','COACH');
 if not found then raise exception using errcode='P0001',message='FE_FORBIDDEN'; end if;
 if p_client_id is null or not app_private.followup_coach_access(m.organization_id,p_client_id) then raise exception using errcode='P0001',message='FE_NOT_FOUND'; end if;
 if p_kind is null or p_kind not in ('nutrition','check-ins') or p_page is null or p_page not between 0 and 10000 then raise exception using errcode='P0001',message='FE_INVALID_FOLLOWUP'; end if;
 if p_kind='nutrition' then
   select * into d from public.nutrition_plan_drafts where organization_id=m.organization_id and client_id=p_client_id;
   select * into latest from public.nutrition_plan_publications where organization_id=m.organization_id and client_id=p_client_id order by revision desc limit 1;
   select count(*) into total from public.nutrition_plan_publications where organization_id=m.organization_id and client_id=p_client_id;
   select coalesce(jsonb_agg(app_private.nutrition_publication_json(x) order by x.revision desc),'[]'::jsonb) into history from
     (select * from public.nutrition_plan_publications where organization_id=m.organization_id and client_id=p_client_id order by revision desc limit 50) x;
   return jsonb_build_object('draft',case when d.client_id is null then null else jsonb_build_object('version',d.row_version,'document',d.document,'updatedAt',d.updated_at) end,
     'publication',case when latest.id is null or exists(select 1 from public.nutrition_plan_withdrawals w where w.publication_id=latest.id) then null else app_private.nutrition_publication_json(latest) end,'history',history,'historyTruncated',total>50);
 end if;
 select count(*) into total from public.client_checkin_submissions where organization_id=m.organization_id and client_id=p_client_id;
 select coalesce(jsonb_agg(app_private.checkin_submission_json(x) order by x.observed_on desc,x.submitted_at desc,x.id),'[]'::jsonb) into history from
   (select * from public.client_checkin_submissions where organization_id=m.organization_id and client_id=p_client_id order by observed_on desc,submitted_at desc,id limit 50 offset p_page*50) x;
 return jsonb_build_object('history',history,'historyTruncated',total>(p_page+1)*50,'total',total,'page',p_page);
end $$;

create or replace function public.mutate_coach_nutrition(p_client_id uuid,p_input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare m public.organization_memberships%rowtype; d public.nutrition_plan_drafts%rowtype; latest public.nutrition_plan_publications%rowtype;
 publication public.nutrition_plan_publications%rowtype; receipt app_private.followup_command_receipts%rowtype;
 fingerprint text; action text; command_id uuid; expected bigint; result jsonb;
begin
 -- Guard before receipts: revoked access can never replay privileged content.
 perform public.get_followup_for_coach(p_client_id,'nutrition',0);
 select * into m from public.organization_memberships where user_id=auth.uid() and status='ACTIVE';
 if p_input is null or jsonb_typeof(p_input)<>'object' or not p_input ?& array['action','clientMutationId']
   or not app_private.training_draft_uuid_valid(p_input->'clientMutationId') then raise exception using errcode='P0001',message='FE_INVALID_FOLLOWUP'; end if;
 action:=p_input->>'action';command_id:=(p_input->>'clientMutationId')::uuid;
 if action<>'withdraw' then
   if not p_input ? 'expectedVersion' or jsonb_typeof(p_input->'expectedVersion')<>'number' or not app_private.followup_number_valid(p_input->'expectedVersion',0,9007199254740991,true) then raise exception using errcode='P0001',message='FE_INVALID_FOLLOWUP'; end if;
   expected:=(p_input->>'expectedVersion')::bigint;
 end if;
 if action='save' then
   if not p_input ? 'document' or p_input-array['action','document','expectedVersion','clientMutationId']<>'{}'::jsonb or not app_private.nutrition_document_valid(p_input->'document') then raise exception using errcode='P0001',message='FE_INVALID_FOLLOWUP'; end if;
 elsif action='publish' then
   if not p_input ? 'expectedPublicationId' or p_input-array['action','expectedVersion','expectedPublicationId','clientMutationId']<>'{}'::jsonb
     or not ((p_input->'expectedPublicationId'='null'::jsonb) or app_private.training_draft_uuid_valid(p_input->'expectedPublicationId')) or expected=0 then raise exception using errcode='P0001',message='FE_INVALID_FOLLOWUP'; end if;
 elsif action='withdraw' then
   if not p_input ? 'expectedPublicationId' or p_input-array['action','expectedPublicationId','clientMutationId']<>'{}'::jsonb or not app_private.training_draft_uuid_valid(p_input->'expectedPublicationId') then raise exception using errcode='P0001',message='FE_INVALID_FOLLOWUP'; end if;
 else raise exception using errcode='P0001',message='FE_INVALID_FOLLOWUP'; end if;
 fingerprint:=encode(extensions.digest(convert_to(jsonb_build_object('command','nutrition','organization',m.organization_id,'client',p_client_id,'input',p_input)::text,'UTF8'),'sha256'),'hex');
 perform pg_advisory_xact_lock(hashtextextended(concat_ws(':','followup-command',auth.uid(),command_id),0));
 select * into receipt from app_private.followup_command_receipts where actor_user_id=auth.uid() and idempotency_key=command_id;
 if found then
   if receipt.request_fingerprint<>fingerprint then raise exception using errcode='P0001',message='FE_IDEMPOTENCY_CONFLICT'; end if;
   return receipt.result_snapshot;
 end if;
 perform pg_advisory_xact_lock(hashtextextended(concat_ws(':','nutrition-client',m.organization_id,p_client_id),0));
 select * into d from public.nutrition_plan_drafts where organization_id=m.organization_id and client_id=p_client_id for update;
 if action<>'withdraw' and coalesce(d.row_version,0)<>expected then raise exception using errcode='P0001',message='FE_VERSION_CONFLICT'; end if;
 if action='save' then
   insert into public.nutrition_plan_drafts(organization_id,client_id,document,row_version,updated_by) values(m.organization_id,p_client_id,p_input->'document',expected+1,auth.uid())
   on conflict(organization_id,client_id) do update set document=excluded.document,row_version=excluded.row_version,updated_by=excluded.updated_by,updated_at=clock_timestamp() returning * into d;
   result:=jsonb_build_object('version',d.row_version);
 elsif action='withdraw' then
   select * into latest from public.nutrition_plan_publications where organization_id=m.organization_id and client_id=p_client_id order by revision desc limit 1;
   if latest.id is distinct from (p_input->>'expectedPublicationId')::uuid or exists(select 1 from public.nutrition_plan_withdrawals w where w.publication_id=latest.id) then raise exception using errcode='P0001',message='FE_VERSION_CONFLICT'; end if;
   insert into public.nutrition_plan_withdrawals(publication_id,withdrawn_by) values(latest.id,auth.uid());
   result:=jsonb_build_object('publicationId',latest.id,'withdrawnAt',(select w.withdrawn_at from public.nutrition_plan_withdrawals w where w.publication_id=latest.id));
 else
   if not app_private.nutrition_document_valid(d.document,true) then raise exception using errcode='P0001',message='FE_NUTRITION_INCOMPLETE'; end if;
   select * into latest from public.nutrition_plan_publications where organization_id=m.organization_id and client_id=p_client_id order by revision desc limit 1;
   if (case when exists(select 1 from public.nutrition_plan_withdrawals w where w.publication_id=latest.id) then null::uuid else latest.id end) is distinct from (p_input->>'expectedPublicationId')::uuid then raise exception using errcode='P0001',message='FE_VERSION_CONFLICT'; end if;
   if exists(select 1 from public.nutrition_plan_publications where organization_id=m.organization_id and client_id=p_client_id and draft_version=expected) then raise exception using errcode='P0001',message='FE_ALREADY_PUBLISHED'; end if;
   insert into public.nutrition_plan_publications(organization_id,client_id,revision,draft_version,document,published_by)
     values(m.organization_id,p_client_id,coalesce(latest.revision,0)+1,d.row_version,d.document,auth.uid()) returning * into publication;
   result:=jsonb_build_object('publicationId',publication.id,'revision',publication.revision);
 end if;
 insert into app_private.followup_command_receipts values(auth.uid(),command_id,fingerprint,result);
 insert into public.audit_events(organization_id,actor_user_id,actor_role,command,entity_type,entity_id,entity_version,result,correlation_id)
 values(m.organization_id,auth.uid(),m.role,case when action='save' then 'SAVE_NUTRITION_DRAFT' when action='withdraw' then 'WITHDRAW_NUTRITION_PLAN' else 'PUBLISH_NUTRITION_PLAN' end,'client',p_client_id,case when action='withdraw' then latest.revision else expected end,'SUCCEEDED',command_id);
 return result;
end $$;

commit;
