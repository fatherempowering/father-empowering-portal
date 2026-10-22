begin;

create type public.onboarding_intake_status as enum ('DRAFT', 'SUBMITTED');

-- The V1 questionnaire contract is frozen with the migration so browser
-- validation and direct RPC validation cannot drift silently.
create table app_private.onboarding_question_contracts (
  question_key text primary key,
  ordinal smallint not null unique check (ordinal between 1 and 64),
  response_type text not null check (
    response_type in ('text', 'email', 'tel', 'number', 'textarea', 'scale', 'single', 'multi')
  ),
  required boolean not null,
  minimum numeric,
  maximum numeric,
  step numeric check (step is null or step > 0),
  max_length integer check (max_length is null or max_length > 0),
  allowed_values text[] not null default '{}',
  check (minimum is null or maximum is null or minimum <= maximum),
  check (
    (response_type in ('single', 'multi') and cardinality(allowed_values) > 0)
    or (response_type not in ('single', 'multi') and cardinality(allowed_values) = 0)
  )
);

insert into app_private.onboarding_question_contracts (
  question_key, ordinal, response_type, required,
  minimum, maximum, step, max_length, allowed_values
) values
  ('fullName', 1, 'text', true, null, null, null, 241, '{}'::text[]),
  ('email', 2, 'email', true, null, null, null, 320, '{}'::text[]),
  ('phoneNumber', 3, 'tel', true, null, null, null, 40, '{}'::text[]),
  ('age', 4, 'text', true, null, null, null, 120, '{}'::text[]),
  ('height', 5, 'text', true, null, null, null, 120, '{}'::text[]),
  ('currentBodyweight', 6, 'text', true, null, null, null, 120, '{}'::text[]),
  ('whyNow', 7, 'textarea', true, null, null, null, 1500, '{}'::text[]),
  ('hundredDayGoals', 8, 'textarea', true, null, null, null, 1500, '{}'::text[]),
  ('noLongerTolerate', 9, 'textarea', true, null, null, null, 1500, '{}'::text[]),
  ('lifeChanges', 10, 'textarea', true, null, null, null, 1500, '{}'::text[]),
  ('fatherVision', 11, 'textarea', true, null, null, null, 1500, '{}'::text[]),
  ('commitmentScore', 12, 'scale', true, 1, 10, 1, null, '{}'::text[]),
  ('commitmentReason', 13, 'textarea', true, null, null, null, 1500, '{}'::text[]),
  ('trainingYears', 14, 'number', true, 0, 100, null, null, '{}'::text[]),
  ('currentTrainingDays', 15, 'number', true, 0, 7, 1, null, '{}'::text[]),
  ('currentTrainingType', 16, 'textarea', true, null, null, null, 1500, '{}'::text[]),
  ('trainingWorked', 17, 'textarea', true, null, null, null, 1500, '{}'::text[]),
  ('trainingNotWorked', 18, 'textarea', true, null, null, null, 1500, '{}'::text[]),
  ('trainingLocations', 19, 'multi', true, null, null, null, null, array['COMMERCIAL_GYM', 'HOME_GYM', 'BOTH']::text[]),
  ('availableEquipment', 20, 'textarea', true, null, null, null, 1500, '{}'::text[]),
  ('realisticTrainingDays', 21, 'number', true, 0, 7, 1, null, '{}'::text[]),
  ('availableDays', 22, 'multi', true, null, null, null, null, array['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']::text[]),
  ('workSchedule', 23, 'textarea', true, null, null, null, 1500, '{}'::text[]),
  ('preferredTrainingTime', 24, 'single', true, null, null, null, null, array['EARLY_MORNING', 'MORNING', 'LUNCH', 'AFTERNOON', 'EVENING', 'NO_PREFERENCE']::text[]),
  ('doesCardio', 25, 'single', true, null, null, null, null, array['YES', 'NO']::text[]),
  ('cardioDetails', 26, 'textarea', false, null, null, null, 1500, '{}'::text[]),
  ('hadCoach', 27, 'single', true, null, null, null, null, array['YES', 'NO']::text[]),
  ('coachExperience', 28, 'textarea', false, null, null, null, 1500, '{}'::text[]),
  ('currentInjuries', 29, 'textarea', true, null, null, null, 1500, '{}'::text[]),
  ('pastInjuriesSurgeries', 30, 'textarea', true, null, null, null, 1500, '{}'::text[]),
  ('exercisesToAvoid', 31, 'textarea', true, null, null, null, 1500, '{}'::text[]),
  ('enjoyedExercises', 32, 'textarea', true, null, null, null, 1500, '{}'::text[]),
  ('mobilityRating', 33, 'single', true, null, null, null, null, array['VERY_POOR', 'POOR', 'AVERAGE', 'GOOD', 'EXCELLENT']::text[]),
  ('recoveryRating', 34, 'single', true, null, null, null, null, array['VERY_POOR', 'POOR', 'AVERAGE', 'GOOD', 'EXCELLENT', 'DONT_KNOW']::text[]),
  ('sleepHours', 35, 'number', true, 0, 24, null, null, '{}'::text[]),
  ('sleepQuality', 36, 'scale', true, 0, 10, 1, null, '{}'::text[]),
  ('stressLevel', 37, 'scale', true, 0, 10, 1, null, '{}'::text[]),
  ('stressSources', 38, 'textarea', true, null, null, null, 1500, '{}'::text[]),
  ('medications', 39, 'textarea', false, null, null, null, 1500, '{}'::text[]),
  ('supplements', 40, 'textarea', false, null, null, null, 1500, '{}'::text[]),
  ('healthNotes', 41, 'textarea', false, null, null, null, 1500, '{}'::text[]),
  ('breakfast', 42, 'textarea', true, null, null, null, 1500, '{}'::text[]),
  ('lunch', 43, 'textarea', true, null, null, null, 1500, '{}'::text[]),
  ('dinner', 44, 'textarea', true, null, null, null, 1500, '{}'::text[]),
  ('snacks', 45, 'textarea', false, null, null, null, 1500, '{}'::text[]),
  ('mealsPerDay', 46, 'number', true, 0, 24, 1, null, '{}'::text[]),
  ('waterIntake', 47, 'text', true, null, null, null, 120, '{}'::text[]),
  ('alcoholFrequency', 48, 'single', true, null, null, null, null, array['NEVER', 'RARELY', '1_2_TIMES_PER_WEEK', '3_4_TIMES_PER_WEEK', '5_PLUS_TIMES_PER_WEEK']::text[]),
  ('takeoutFrequency', 49, 'single', true, null, null, null, null, array['RARELY', '1_2_TIMES_PER_WEEK', '3_4_TIMES_PER_WEEK', '5_PLUS_TIMES_PER_WEEK']::text[]),
  ('nutritionStruggle', 50, 'textarea', true, null, null, null, 1500, '{}'::text[]),
  ('nutritionDifficultTimes', 51, 'multi', true, null, null, null, null, array['MORNING', 'MID_MORNING', 'AFTERNOON', 'EVENING', 'LATE_NIGHT', 'WEEKENDS']::text[]),
  ('trackedMacros', 52, 'single', true, null, null, null, null, array['YES', 'NO']::text[]),
  ('trackingExperience', 53, 'textarea', false, null, null, null, 1500, '{}'::text[]),
  ('allergiesDigestion', 54, 'textarea', false, null, null, null, 1500, '{}'::text[]),
  ('refusedFoods', 55, 'textarea', false, null, null, null, 1500, '{}'::text[]),
  ('nutritionSuccess', 56, 'textarea', true, null, null, null, 1500, '{}'::text[]),
  ('nutritionPriority', 57, 'textarea', true, null, null, null, 1500, '{}'::text[]),
  ('biggestObstacle', 58, 'textarea', true, null, null, null, 1500, '{}'::text[]),
  ('offTrackCauses', 59, 'textarea', true, null, null, null, 1500, '{}'::text[]),
  ('supportNeeded', 60, 'textarea', true, null, null, null, 1500, '{}'::text[]),
  ('additionalNotes', 61, 'textarea', false, null, null, null, 1500, '{}'::text[]),
  ('protocolCommitment', 62, 'single', true, null, null, null, null, array['YES']::text[]),
  ('confidenceScore', 63, 'scale', true, 1, 10, 1, null, '{}'::text[]),
  ('confidenceReason', 64, 'textarea', true, null, null, null, 1500, '{}'::text[]);

revoke all on table app_private.onboarding_question_contracts
  from public, anon, authenticated;

create table public.client_onboarding_intakes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  client_id uuid not null,
  kind text not null default 'ONBOARDING_INTAKE' check (kind = 'ONBOARDING_INTAKE'),
  schema_version smallint not null default 1 check (schema_version = 1),
  status public.onboarding_intake_status not null default 'DRAFT',
  responses jsonb not null check (jsonb_typeof(responses) = 'object'),
  row_version bigint not null default 1 check (row_version > 0),
  last_saved_at timestamptz not null default clock_timestamp(),
  submitted_at timestamptz,
  submitted_by uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint client_onboarding_intakes_organization_client_fkey
    foreign key (organization_id, client_id)
    references public.clients (organization_id, id) on delete restrict,
  constraint client_onboarding_intakes_one_per_client unique (client_id),
  constraint client_onboarding_intakes_submission_consistent check (
    (status = 'DRAFT' and submitted_at is null and submitted_by is null)
    or (status = 'SUBMITTED' and submitted_at is not null and submitted_by is not null)
  )
);

create index client_onboarding_intakes_organization_status_idx
  on public.client_onboarding_intakes (organization_id, status, updated_at desc);

create table app_private.client_onboarding_command_receipts (
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  command text not null check (command in ('SAVE_DRAFT', 'SUBMIT')),
  idempotency_key uuid not null,
  request_fingerprint text not null check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  intake_id uuid not null references public.client_onboarding_intakes(id) on delete cascade,
  result_version bigint not null check (result_version > 0),
  result_snapshot jsonb not null check (jsonb_typeof(result_snapshot) = 'object'),
  created_at timestamptz not null default clock_timestamp(),
  primary key (actor_user_id, command, idempotency_key)
);

revoke all on table app_private.client_onboarding_command_receipts
  from public, anon, authenticated;

create or replace function app_private.onboarding_responses_valid(
  p_responses jsonb,
  p_require_complete boolean default false
)
returns boolean
language plpgsql
stable
set search_path = ''
as $$
declare
  v_contract app_private.onboarding_question_contracts%rowtype;
  v_value jsonb;
  v_number numeric;
begin
  if jsonb_typeof(p_responses) is distinct from 'object'
     or octet_length(convert_to(p_responses::text, 'UTF8')) > 262144
     or (select count(*) from jsonb_object_keys(p_responses)) <> 64
     or exists (
       select 1
       from jsonb_object_keys(p_responses) response_key
       where not exists (
         select 1
         from app_private.onboarding_question_contracts contract
         where contract.question_key = response_key
       )
     ) then
    return false;
  end if;

  for v_contract in
    select contract.*
    from app_private.onboarding_question_contracts contract
    order by contract.ordinal
  loop
    if not (p_responses ? v_contract.question_key) then
      return false;
    end if;
    v_value := p_responses -> v_contract.question_key;

    if v_contract.response_type = 'multi' then
      if jsonb_typeof(v_value) is distinct from 'array'
         or jsonb_array_length(v_value) > cardinality(v_contract.allowed_values)
         or exists (
           select 1
           from jsonb_array_elements(v_value) selected
           where jsonb_typeof(selected) is distinct from 'string'
              or not ((selected #>> '{}') = any (v_contract.allowed_values))
         )
         or (
           select count(*) <> count(distinct selected #>> '{}')
           from jsonb_array_elements(v_value) selected
         )
         or (p_require_complete and v_contract.required and jsonb_array_length(v_value) = 0) then
        return false;
      end if;
    elsif v_contract.response_type in ('number', 'scale') then
      if jsonb_typeof(v_value) = 'null' then
        if p_require_complete and v_contract.required then return false; end if;
      elsif jsonb_typeof(v_value) is distinct from 'number' then
        return false;
      else
        v_number := (v_value #>> '{}')::numeric;
        if (v_contract.minimum is not null and v_number < v_contract.minimum)
           or (v_contract.maximum is not null and v_number > v_contract.maximum)
           or (
             v_contract.step is not null
             and mod(v_number - coalesce(v_contract.minimum, 0), v_contract.step) <> 0
           ) then
          return false;
        end if;
      end if;
    elsif v_contract.response_type = 'single' then
      if jsonb_typeof(v_value) = 'null' then
        if p_require_complete and v_contract.required then return false; end if;
      elsif jsonb_typeof(v_value) is distinct from 'string'
         or not ((v_value #>> '{}') = any (v_contract.allowed_values)) then
        return false;
      end if;
    else
      if jsonb_typeof(v_value) = 'null' then
        if p_require_complete and v_contract.required then return false; end if;
      elsif jsonb_typeof(v_value) is distinct from 'string'
         or (v_value #>> '{}') ~ '^[[:space:]]*$'
         or char_length(v_value #>> '{}') > v_contract.max_length
         or (
           v_contract.response_type = 'email'
           and (v_value #>> '{}') !~
             '^(?!\.)(?!.*\.\.)([A-Za-z0-9_+''\-\.]*)[A-Za-z0-9_+\-]@([A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}$'
         ) then
        return false;
      end if;
    end if;
  end loop;
  return true;
exception
  when others then
    return false;
end;
$$;

revoke all on function app_private.onboarding_responses_valid(jsonb, boolean)
  from public, anon, authenticated;

create or replace function app_private.onboarding_snapshot(
  p_intake public.client_onboarding_intakes
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'kind', p_intake.kind,
    'schemaVersion', p_intake.schema_version,
    'status', p_intake.status,
    'version', p_intake.row_version,
    'responses', p_intake.responses,
    'updatedAt', p_intake.updated_at,
    'submittedAt', p_intake.submitted_at
  );
$$;

revoke all on function app_private.onboarding_snapshot(public.client_onboarding_intakes)
  from public, anon, authenticated;

alter table public.client_onboarding_intakes enable row level security;
alter table public.client_onboarding_intakes force row level security;
revoke all on table public.client_onboarding_intakes from anon, authenticated;
grant select on table public.client_onboarding_intakes to authenticated;

create policy client_onboarding_intakes_select_authorized
on public.client_onboarding_intakes for select to authenticated
using (
  (
    app_private.is_own_client(organization_id, client_id)
    and app_private.has_org_role(organization_id, array['CLIENT']::public.app_role[])
  )
  or (
    status = 'SUBMITTED'
    and (
      app_private.has_org_role(organization_id, array['ADMIN']::public.app_role[])
      or app_private.is_assigned_coach(organization_id, client_id)
    )
  )
);

create or replace function public.save_own_onboarding_intake(
  p_responses jsonb,
  p_expected_version bigint,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_client public.clients%rowtype;
  v_intake public.client_onboarding_intakes%rowtype;
  v_receipt app_private.client_onboarding_command_receipts%rowtype;
  v_fingerprint text;
  v_snapshot jsonb;
begin
  if v_actor_id is null then
    raise exception using errcode = 'P0001', message = 'FE_UNAUTHENTICATED';
  end if;
  if p_expected_version is null or p_expected_version < 0 or p_idempotency_key is null then
    raise exception using errcode = 'P0001', message = 'FE_INVALID_INPUT';
  end if;
  if not app_private.onboarding_responses_valid(p_responses, false) then
    raise exception using errcode = 'P0001', message = 'FE_INVALID_ONBOARDING_INTAKE';
  end if;

  select client.* into v_client
  from public.clients client
  join public.organization_memberships membership
    on membership.organization_id = client.organization_id
   and membership.user_id = v_actor_id
   and membership.role = 'CLIENT'
   and membership.status = 'ACTIVE'
  where client.auth_user_id = v_actor_id
    and client.status = 'ACTIVE';
  if not found then
    raise exception using errcode = 'P0001', message = 'FE_FORBIDDEN';
  end if;

  v_fingerprint := encode(extensions.digest(convert_to(jsonb_build_object(
    'command', 'SAVE_DRAFT', 'schemaVersion', 1,
    'organizationId', v_client.organization_id, 'clientId', v_client.id,
    'expectedVersion', p_expected_version, 'responses', p_responses
  )::text, 'UTF8'), 'sha256'), 'hex');

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    concat_ws(':', 'onboarding-intake', v_actor_id::text, 'SAVE_DRAFT', p_idempotency_key::text), 0
  ));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    concat_ws(':', 'onboarding-intake-client', v_client.id::text), 0
  ));

  select receipt.* into v_receipt
  from app_private.client_onboarding_command_receipts receipt
  where receipt.actor_user_id = v_actor_id
    and receipt.command = 'SAVE_DRAFT'
    and receipt.idempotency_key = p_idempotency_key;
  if found then
    if v_receipt.request_fingerprint <> v_fingerprint then
      raise exception using errcode = 'P0001', message = 'FE_IDEMPOTENCY_CONFLICT';
    end if;
    return v_receipt.result_snapshot;
  end if;

  select intake.* into v_intake
  from public.client_onboarding_intakes intake
  where intake.client_id = v_client.id
  for update;
  if not found then
    if p_expected_version <> 0 then
      raise exception using errcode = 'P0001', message = 'FE_VERSION_CONFLICT';
    end if;
    insert into public.client_onboarding_intakes (
      organization_id, client_id, responses
    ) values (
      v_client.organization_id, v_client.id, p_responses
    ) returning * into v_intake;
  else
    if v_intake.status = 'SUBMITTED' then
      raise exception using errcode = 'P0001', message = 'FE_ONBOARDING_INTAKE_SUBMITTED';
    end if;
    if v_intake.row_version <> p_expected_version then
      raise exception using errcode = 'P0001', message = 'FE_VERSION_CONFLICT';
    end if;
    update public.client_onboarding_intakes intake
    set responses = p_responses,
        row_version = intake.row_version + 1,
        last_saved_at = clock_timestamp(),
        updated_at = clock_timestamp()
    where intake.id = v_intake.id
    returning intake.* into v_intake;
  end if;

  v_snapshot := app_private.onboarding_snapshot(v_intake);
  insert into app_private.client_onboarding_command_receipts (
    actor_user_id, command, idempotency_key, request_fingerprint,
    intake_id, result_version, result_snapshot
  ) values (
    v_actor_id, 'SAVE_DRAFT', p_idempotency_key, v_fingerprint,
    v_intake.id, v_intake.row_version, v_snapshot
  );
  return v_snapshot;
end;
$$;

create or replace function public.submit_own_onboarding_intake(
  p_expected_version bigint,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_client public.clients%rowtype;
  v_intake public.client_onboarding_intakes%rowtype;
  v_receipt app_private.client_onboarding_command_receipts%rowtype;
  v_fingerprint text;
  v_snapshot jsonb;
begin
  if v_actor_id is null then
    raise exception using errcode = 'P0001', message = 'FE_UNAUTHENTICATED';
  end if;
  if p_expected_version is null or p_expected_version < 1 or p_idempotency_key is null then
    raise exception using errcode = 'P0001', message = 'FE_INVALID_INPUT';
  end if;

  select client.* into v_client
  from public.clients client
  join public.organization_memberships membership
    on membership.organization_id = client.organization_id
   and membership.user_id = v_actor_id
   and membership.role = 'CLIENT'
   and membership.status = 'ACTIVE'
  where client.auth_user_id = v_actor_id
    and client.status = 'ACTIVE';
  if not found then
    raise exception using errcode = 'P0001', message = 'FE_FORBIDDEN';
  end if;

  v_fingerprint := encode(extensions.digest(convert_to(jsonb_build_object(
    'command', 'SUBMIT', 'schemaVersion', 1,
    'organizationId', v_client.organization_id, 'clientId', v_client.id,
    'expectedVersion', p_expected_version
  )::text, 'UTF8'), 'sha256'), 'hex');

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    concat_ws(':', 'onboarding-intake', v_actor_id::text, 'SUBMIT', p_idempotency_key::text), 0
  ));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    concat_ws(':', 'onboarding-intake-client', v_client.id::text), 0
  ));

  select receipt.* into v_receipt
  from app_private.client_onboarding_command_receipts receipt
  where receipt.actor_user_id = v_actor_id
    and receipt.command = 'SUBMIT'
    and receipt.idempotency_key = p_idempotency_key;
  if found then
    if v_receipt.request_fingerprint <> v_fingerprint then
      raise exception using errcode = 'P0001', message = 'FE_IDEMPOTENCY_CONFLICT';
    end if;
    return v_receipt.result_snapshot;
  end if;

  select intake.* into v_intake
  from public.client_onboarding_intakes intake
  where intake.client_id = v_client.id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'FE_ONBOARDING_INTAKE_INCOMPLETE';
  end if;
  if v_intake.status = 'SUBMITTED' then
    raise exception using errcode = 'P0001', message = 'FE_ONBOARDING_INTAKE_SUBMITTED';
  end if;
  if v_intake.row_version <> p_expected_version then
    raise exception using errcode = 'P0001', message = 'FE_VERSION_CONFLICT';
  end if;
  if not app_private.onboarding_responses_valid(v_intake.responses, true) then
    raise exception using errcode = 'P0001', message = 'FE_ONBOARDING_INTAKE_INCOMPLETE';
  end if;

  update public.client_onboarding_intakes intake
  set status = 'SUBMITTED',
      row_version = intake.row_version + 1,
      submitted_at = clock_timestamp(),
      submitted_by = v_actor_id,
      updated_at = clock_timestamp()
  where intake.id = v_intake.id
  returning intake.* into v_intake;

  insert into public.audit_events (
    organization_id, actor_user_id, actor_role, command, entity_type, entity_id,
    entity_version, result, correlation_id, context
  ) values (
    v_client.organization_id, v_actor_id, 'CLIENT', 'SubmitOnboardingIntake',
    'client_onboarding_intake', v_intake.id, v_intake.row_version,
    'SUCCEEDED', p_idempotency_key,
    jsonb_build_object('kind', 'ONBOARDING_INTAKE', 'schemaVersion', 1)
  );

  v_snapshot := app_private.onboarding_snapshot(v_intake);
  insert into app_private.client_onboarding_command_receipts (
    actor_user_id, command, idempotency_key, request_fingerprint,
    intake_id, result_version, result_snapshot
  ) values (
    v_actor_id, 'SUBMIT', p_idempotency_key, v_fingerprint,
    v_intake.id, v_intake.row_version, v_snapshot
  );
  return v_snapshot;
end;
$$;

revoke all on function public.save_own_onboarding_intake(jsonb, bigint, uuid)
  from public, anon, authenticated;
revoke all on function public.submit_own_onboarding_intake(bigint, uuid)
  from public, anon, authenticated;
grant execute on function public.save_own_onboarding_intake(jsonb, bigint, uuid)
  to authenticated;
grant execute on function public.submit_own_onboarding_intake(bigint, uuid)
  to authenticated;

commit;
