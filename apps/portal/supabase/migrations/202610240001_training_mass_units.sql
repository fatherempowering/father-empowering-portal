-- Explicit mass units; existing immutable documents and authorization are unchanged.
begin;

alter table public.training_exercises drop constraint training_exercises_default_unit_check;
alter table public.training_exercises add constraint training_exercises_default_unit_check check(default_unit in ('lb','kg','min','sec','distance','level','configuration'));

create or replace function public.save_training_exercise(
  p_exercise_id uuid,
  p_name text,
  p_equipment text,
  p_cue_fr text,
  p_cue_en text,
  p_default_unit text,
  p_archived boolean,
  p_expected_version bigint,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_membership public.organization_memberships%rowtype;
  v_exercise public.training_exercises%rowtype;
  v_receipt app_private.training_exercise_receipts%rowtype;
  v_fingerprint text;
  v_snapshot jsonb;
begin
  if v_actor is null then
    raise exception using errcode='P0001', message='FE_UNAUTHENTICATED';
  end if;
  if not app_private.has_verified_coach_session() or (
    select count(*) from public.organization_memberships
    where user_id=v_actor and status='ACTIVE'
  ) <> 1 then
    raise exception using errcode='P0001', message='FE_FORBIDDEN';
  end if;
  select * into v_membership from public.organization_memberships
  where user_id=v_actor and status='ACTIVE' and role in ('ADMIN','COACH');
  if not found then
    raise exception using errcode='P0001', message='FE_FORBIDDEN';
  end if;
  if p_idempotency_key is null or p_name is null
     or char_length(btrim(p_name)) not between 1 and 160
     or p_equipment is null or char_length(btrim(p_equipment)) > 120
     or p_cue_fr is null or char_length(btrim(p_cue_fr)) > 300
     or p_cue_en is null or char_length(btrim(p_cue_en)) > 300
     or p_default_unit is null or p_default_unit not in ('lb','kg','min','sec','distance','level')
     or p_archived is null or p_expected_version is null
     or p_expected_version < 0 or p_expected_version > 9007199254740991
     or (p_exercise_id is null and (p_expected_version <> 0 or p_archived))
     or (p_exercise_id is not null and p_expected_version < 1) then
    raise exception using errcode='P0001', message='FE_INVALID_TRAINING_EXERCISE';
  end if;

  v_fingerprint := encode(extensions.digest(convert_to(jsonb_build_object(
    'organization',v_membership.organization_id,'id',p_exercise_id,
    'name',btrim(p_name),'equipment',btrim(p_equipment),'fr',btrim(p_cue_fr),
    'en',btrim(p_cue_en),'unit',p_default_unit,'archived',p_archived,
    'version',p_expected_version
  )::text,'UTF8'),'sha256'),'hex');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    concat_ws(':','training-exercise',v_actor::text,p_idempotency_key::text),0
  ));

  select * into v_receipt from app_private.training_exercise_receipts
  where actor_user_id=v_actor and idempotency_key=p_idempotency_key;
  if found then
    -- Authorization is rechecked even when replaying a successful command.
    if not exists (select 1 from public.training_exercises
      where id=v_receipt.exercise_id and organization_id=v_membership.organization_id
        and (created_by=v_actor or v_membership.role='ADMIN')) then
      raise exception using errcode='P0001', message='FE_NOT_FOUND';
    end if;
    if v_receipt.request_fingerprint <> v_fingerprint then
      raise exception using errcode='P0001', message='FE_IDEMPOTENCY_CONFLICT';
    end if;
    return v_receipt.result_snapshot;
  end if;

  if p_exercise_id is null then
    insert into public.training_exercises
      (organization_id,name,equipment,cue_fr,cue_en,default_unit,created_by)
    values (v_membership.organization_id,btrim(p_name),btrim(p_equipment),
      btrim(p_cue_fr),btrim(p_cue_en),p_default_unit,v_actor)
    returning * into v_exercise;
  else
    select * into v_exercise from public.training_exercises
    where id=p_exercise_id and organization_id=v_membership.organization_id
      and (created_by=v_actor or v_membership.role='ADMIN') for update;
    if not found then
      raise exception using errcode='P0001', message='FE_NOT_FOUND';
    end if;
    if v_exercise.row_version <> p_expected_version then
      raise exception using errcode='P0001', message='FE_VERSION_CONFLICT';
    end if;
    update public.training_exercises set
      name=btrim(p_name),equipment=btrim(p_equipment),cue_fr=btrim(p_cue_fr),
      cue_en=btrim(p_cue_en),default_unit=p_default_unit,archived=p_archived,
      row_version=row_version+1,updated_at=clock_timestamp()
    where id=p_exercise_id returning * into v_exercise;
  end if;
  v_snapshot := jsonb_build_object(
    'id',v_exercise.id,'name',v_exercise.name,'equipment',v_exercise.equipment,
    'cue',jsonb_build_object('fr',v_exercise.cue_fr,'en',v_exercise.cue_en),
    'defaultUnit',v_exercise.default_unit,'archived',v_exercise.archived,
    'version',v_exercise.row_version,'createdBy',v_exercise.created_by,
    'updatedAt',v_exercise.updated_at,'canEdit',true
  );
  insert into app_private.training_exercise_receipts
    (actor_user_id,idempotency_key,request_fingerprint,exercise_id,result_snapshot)
  values (v_actor,p_idempotency_key,v_fingerprint,v_exercise.id,v_snapshot);
  insert into public.audit_events
    (organization_id,actor_user_id,actor_role,command,entity_type,entity_id,
     entity_version,result,correlation_id)
  values (v_membership.organization_id,v_actor,v_membership.role,'SAVE_TRAINING_EXERCISE',
    'training_exercise',v_exercise.id,v_exercise.row_version,'SUCCEEDED',p_idempotency_key);
  return v_snapshot;
end;
$$;

create or replace function app_private.training_draft_set_valid(p jsonb) returns boolean
language sql immutable set search_path='' as $$
 select coalesce(jsonb_typeof(p)='object'
   and p ?& array['reps','targetRir','restSeconds','tempo','loadTarget','unit']
   and p - array['reps','targetRir','restSeconds','tempo','loadTarget','unit']='{}'::jsonb
   and jsonb_typeof(p->'reps')='string' and char_length(btrim(p->>'reps')) between 1 and 40
   and app_private.training_draft_int_valid(p->'targetRir',0,10)
   and app_private.training_draft_int_valid(p->'restSeconds',0,3600)
   and jsonb_typeof(p->'tempo')='string' and char_length(p->>'tempo')<=40
   and jsonb_typeof(p->'loadTarget')='string' and char_length(p->>'loadTarget')<=120
   and jsonb_typeof(p->'unit')='string' and p->>'unit' in ('lb','kg','min','sec','distance','level','configuration'),false)
$$;

create or replace function app_private.training_pilot_document_valid(p jsonb,p_org uuid) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare e jsonb; x public.training_exercises%rowtype; pr jsonb;
begin
 for e in select e.value from jsonb_array_elements(p->'weeks') w
   cross join lateral jsonb_array_elements(w.value->'sessions') s
   cross join lateral jsonb_array_elements(s.value->'blocks') b
   cross join lateral jsonb_array_elements(b.value->'exercises') e loop
   select * into x from public.training_exercises where id=(e->>'libraryExerciseId')::uuid;
   if e ? 'pilot' or x.pilot is not null then
     if x.pilot is null or x.organization_id is distinct from p_org or not (e ? 'pilot') or x.pilot<>e->'pilot'
       or e->>'name'<>x.name or x.archived then return false; end if;
     for pr in select e->'prescription' union all select value from jsonb_array_elements(coalesce(e#>'{prescription,prescribedSets}','[]'::jsonb)) loop
       if pr->>'unit'<>x.default_unit and not (x.default_unit='lb' and pr->>'unit'='kg'
         and x.pilot#>>'{performance,loadEntryBasis}' in ('per_implement','total_external_mass','displayed_stack_setting')) then return false; end if;
     end loop;
   elsif e#>>'{prescription,unit}'='configuration' or exists(select 1 from jsonb_array_elements(coalesce(e#>'{prescription,prescribedSets}','[]'::jsonb)) as prescribed(value) where prescribed.value->>'unit'='configuration') then return false;
   end if;
 end loop;
 return true;
exception when others then return false;
end $$;

create or replace function app_private.training_result_sets_shape_valid(p_sets jsonb)
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
       or item-array['exerciseId','setNumber','status','reps','load','rir','kind','unit','details']<>'{}'::jsonb
       or not app_private.training_draft_uuid_valid(item->'exerciseId')
       or not app_private.training_draft_int_valid(item->'setNumber',1,40)
       or jsonb_typeof(item->'status')<>'string' or item->>'status' not in ('PENDING','DONE','SKIPPED')
       or jsonb_typeof(item->'kind')<>'string' or item->>'kind' not in ('PRESCRIBED','EXTRA')
       or jsonb_typeof(item->'unit')<>'string' or item->>'unit' not in ('lb','kg','min','sec','distance','level','configuration')
       or not ((item->'reps'='null'::jsonb) or app_private.training_draft_int_valid(item->'reps',0,10000))
       or not ((item->'rir'='null'::jsonb) or app_private.training_draft_int_valid(item->'rir',0,10))
       or not ((item->'load'='null'::jsonb) or (
         jsonb_typeof(item->'load')='number'
         and (item->>'load')::numeric between 0 and 100000
         and (item->>'load')::numeric=round((item->>'load')::numeric,6)
       ))
       or (item ? 'details' and not (item->'details'='null'::jsonb or (jsonb_typeof(item->'details')='string' and char_length(item->>'details')<=500)))
       or (item->>'status'='DONE' and case when item->>'unit'='configuration' then
         item->'load'<>'null'::jsonb or item->'reps'='null'::jsonb or coalesce(regexp_replace(item->>'details','[[:space:]]','','g'),'')=''
         else item->'load'='null'::jsonb or (item->>'unit' in ('lb','kg') and item->'reps'='null'::jsonb) end)
       or (item->>'status'<>'DONE' and (item->'reps'<>'null'::jsonb or item->'load'<>'null'::jsonb or item->'rir'<>'null'::jsonb or coalesce(item->'details','null'::jsonb)<>'null'::jsonb))
       then return false; end if;
  end loop;
  return true;
exception when others then return false;
end $$;

create or replace function app_private.training_result_enrich_sets(
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
      and item-array['exerciseId','setNumber','status','reps','load','rir','details']='{}'::jsonb
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
      and (not (item ? 'details') or item->'details'='null'::jsonb or (jsonb_typeof(item->'details')='string' and char_length(item->>'details')<=500))
      and (
        (item->>'status'='DONE' and case when unit='configuration' then
          item->'load'='null'::jsonb and item->'reps'<>'null'::jsonb and coalesce(regexp_replace(item->>'details','[[:space:]]','','g'),'')<>''
          else item->'load'<>'null'::jsonb and (unit not in ('lb','kg') or item->'reps'<>'null'::jsonb) end
          and (not (exercise ? 'pilot') or unit<>'distance' or coalesce(regexp_replace(item->>'details','[[:space:]]','','g'),'')<>''))
        or (item->>'status'<>'DONE' and item->'reps'='null'::jsonb and item->'load'='null'::jsonb and item->'rir'='null'::jsonb and coalesce(item->'details','null'::jsonb)='null'::jsonb)
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

commit;
