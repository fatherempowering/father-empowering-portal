begin;

-- Additive Training foundation. Existing Auth, Client and assignment policies
-- are unchanged. Clients will receive published snapshots, never this library.
create table public.training_exercises (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  name text not null check (char_length(btrim(name)) between 1 and 160),
  equipment text not null default '' check (char_length(equipment) <= 120),
  cue_fr text not null default '' check (char_length(cue_fr) <= 300),
  cue_en text not null default '' check (char_length(cue_en) <= 300),
  default_unit text not null check (default_unit in ('lb','min','sec','distance','level')),
  archived boolean not null default false,
  row_version bigint not null default 1 check (row_version > 0),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (organization_id, id)
);
create index training_exercises_browse_idx
  on public.training_exercises (organization_id, archived, name, id);

alter table public.training_exercises enable row level security;
alter table public.training_exercises force row level security;
revoke all on public.training_exercises from public, anon, authenticated;
grant select on public.training_exercises to authenticated;
grant all on public.training_exercises to service_role;
create policy training_exercises_staff_select
on public.training_exercises for select to authenticated
using (app_private.has_org_role(organization_id, array['ADMIN','COACH']::public.app_role[]));

create table app_private.training_exercise_receipts (
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  idempotency_key uuid not null,
  request_fingerprint text not null check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  exercise_id uuid not null references public.training_exercises(id) on delete restrict,
  result_snapshot jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key (actor_user_id, idempotency_key)
);
revoke all on app_private.training_exercise_receipts from public, anon, authenticated;

create function public.save_training_exercise(
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
     or p_default_unit is null or p_default_unit not in ('lb','min','sec','distance','level')
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
revoke all on function public.save_training_exercise(uuid,text,text,text,text,text,boolean,bigint,uuid)
  from public, anon, authenticated;
grant execute on function public.save_training_exercise(uuid,text,text,text,text,text,boolean,bigint,uuid)
  to authenticated;

commit;
