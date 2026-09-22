begin;

create type public.initial_assessment_status as enum ('DRAFT', 'SUBMITTED');

create table public.week_zero_assessments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  client_id uuid not null,
  kind text not null default 'INITIAL_ASSESSMENT' check (kind = 'INITIAL_ASSESSMENT'),
  schema_version smallint not null default 1 check (schema_version = 1),
  status public.initial_assessment_status not null default 'DRAFT',
  responses jsonb not null check (jsonb_typeof(responses) = 'object'),
  row_version bigint not null default 1 check (row_version > 0),
  last_saved_at timestamptz not null default clock_timestamp(),
  submitted_at timestamptz,
  submitted_by uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint week_zero_assessments_organization_client_fkey
    foreign key (organization_id, client_id)
    references public.clients (organization_id, id) on delete restrict,
  constraint week_zero_assessments_one_initial_unique unique (client_id),
  constraint week_zero_assessments_submission_consistent check (
    (status = 'DRAFT' and submitted_at is null and submitted_by is null)
    or (status = 'SUBMITTED' and submitted_at is not null and submitted_by is not null)
  )
);

create index week_zero_assessments_organization_status_idx
  on public.week_zero_assessments (organization_id, status, updated_at desc);

-- Receipts are private because the retry-stable result contains the Client's
-- assessment snapshot. They are never selectable by browser roles.
create table app_private.week_zero_command_receipts (
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  command text not null check (command in ('SAVE_DRAFT', 'SUBMIT')),
  idempotency_key uuid not null,
  request_fingerprint text not null check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  assessment_id uuid not null references public.week_zero_assessments(id) on delete cascade,
  result_version bigint not null check (result_version > 0),
  result_snapshot jsonb not null check (jsonb_typeof(result_snapshot) = 'object'),
  created_at timestamptz not null default clock_timestamp(),
  primary key (actor_user_id, command, idempotency_key)
);

revoke all on table app_private.week_zero_command_receipts
  from public, anon, authenticated;

create or replace function app_private.initial_assessment_responses_valid(
  p_responses jsonb,
  p_require_complete boolean default false
)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_measurements jsonb;
  v_mobility jsonb;
  v_availability jsonb;
  v_value jsonb;
  v_field text;
  v_text text;
begin
  if jsonb_typeof(p_responses) is distinct from 'object'
     or not (p_responses ?& array['measurements', 'mobility', 'availability'])
     or p_responses - 'measurements' - 'mobility' - 'availability' <> '{}'::jsonb then
    return false;
  end if;

  v_measurements := p_responses -> 'measurements';
  v_mobility := p_responses -> 'mobility';
  v_availability := p_responses -> 'availability';

  if jsonb_typeof(v_measurements) is distinct from 'object'
     or not (v_measurements ?& array[
       'bodyWeightLb', 'waistIn', 'chestIn', 'hipsIn', 'rightArmIn', 'rightThighIn', 'other'
     ])
     or v_measurements
       - 'bodyWeightLb' - 'waistIn' - 'chestIn' - 'hipsIn'
       - 'rightArmIn' - 'rightThighIn' - 'other' <> '{}'::jsonb then
    return false;
  end if;

  foreach v_field in array array[
    'bodyWeightLb', 'waistIn', 'chestIn', 'hipsIn', 'rightArmIn', 'rightThighIn'
  ] loop
    v_value := v_measurements -> v_field;
    if jsonb_typeof(v_value) = 'null' then
      if p_require_complete and v_field in ('bodyWeightLb', 'waistIn') then
        return false;
      end if;
    elsif jsonb_typeof(v_value) is distinct from 'number'
       or (v_value #>> '{}')::numeric <= 0
       or (
         v_field = 'bodyWeightLb' and (v_value #>> '{}')::numeric > 1500
       )
       or (
         v_field <> 'bodyWeightLb' and (v_value #>> '{}')::numeric > 200
       ) then
      return false;
    end if;
  end loop;

  v_value := v_measurements -> 'other';
  if jsonb_typeof(v_value) is null
     or jsonb_typeof(v_value) not in ('null', 'string')
     or (jsonb_typeof(v_value) = 'string' and char_length(v_value #>> '{}') > 1000) then
    return false;
  end if;

  if jsonb_typeof(v_mobility) is distinct from 'object'
     or not (v_mobility ?& array[
       'painSquat', 'painHinge', 'painPush', 'painPull', 'painCardio',
       'limitedMovement', 'comfortableMovement', 'tightArea'
     ])
     or v_mobility
       - 'painSquat' - 'painHinge' - 'painPush' - 'painPull' - 'painCardio'
       - 'limitedMovement' - 'comfortableMovement' - 'tightArea' <> '{}'::jsonb then
    return false;
  end if;

  foreach v_field in array array[
    'painSquat', 'painHinge', 'painPush', 'painPull', 'painCardio'
  ] loop
    v_text := v_mobility ->> v_field;
    if jsonb_typeof(v_mobility -> v_field) is distinct from 'string'
       or v_text is null
       or v_text not in ('NOT_ASSESSED', 'NO', 'YES')
       or (p_require_complete and v_text = 'NOT_ASSESSED') then
      return false;
    end if;
  end loop;

  foreach v_field in array array['limitedMovement', 'comfortableMovement', 'tightArea'] loop
    v_value := v_mobility -> v_field;
    if jsonb_typeof(v_value) is null
       or jsonb_typeof(v_value) not in ('null', 'string')
       or (jsonb_typeof(v_value) = 'string' and char_length(v_value #>> '{}') > 1000)
       or (
         p_require_complete
         and (jsonb_typeof(v_value) = 'null' or btrim(v_value #>> '{}') = '')
       ) then
      return false;
    end if;
  end loop;

  if jsonb_typeof(v_availability) is distinct from 'object'
     or not (v_availability ?& array[
       'days', 'bestTime', 'sessionDurationMinutes', 'sessionsPerWeek', 'constraints'
     ])
     or v_availability
       - 'days' - 'bestTime' - 'sessionDurationMinutes'
       - 'sessionsPerWeek' - 'constraints' <> '{}'::jsonb
     or jsonb_typeof(v_availability -> 'days') is distinct from 'array'
     or jsonb_array_length(v_availability -> 'days') > 7
     or exists (
       select 1
       from jsonb_array_elements(v_availability -> 'days') day
       where jsonb_typeof(day) <> 'string'
          or day #>> '{}' not in (
            'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY',
            'FRIDAY', 'SATURDAY', 'SUNDAY'
          )
     )
     or (
       select count(*) <> count(distinct day #>> '{}')
       from jsonb_array_elements(v_availability -> 'days') day
     ) then
    return false;
  end if;

  foreach v_field in array array['bestTime', 'constraints'] loop
    v_value := v_availability -> v_field;
    if jsonb_typeof(v_value) is null
       or jsonb_typeof(v_value) not in ('null', 'string')
       or (
         jsonb_typeof(v_value) = 'string'
         and char_length(v_value #>> '{}') > case v_field when 'bestTime' then 120 else 1000 end
       ) then
      return false;
    end if;
  end loop;

  v_value := v_availability -> 'sessionDurationMinutes';
  if jsonb_typeof(v_value) is distinct from 'null' and (
    jsonb_typeof(v_value) is distinct from 'number'
    or (v_value #>> '{}')::numeric <> trunc((v_value #>> '{}')::numeric)
    or (v_value #>> '{}')::numeric not between 1 and 480
  ) then
    return false;
  end if;

  v_value := v_availability -> 'sessionsPerWeek';
  if jsonb_typeof(v_value) is distinct from 'null' and (
    jsonb_typeof(v_value) is distinct from 'number'
    or (v_value #>> '{}')::numeric <> trunc((v_value #>> '{}')::numeric)
    or (v_value #>> '{}')::numeric not between 1 and 7
  ) then
    return false;
  end if;

  return true;
exception
  when others then
    return false;
end;
$$;

revoke all on function app_private.initial_assessment_responses_valid(jsonb, boolean)
  from public, anon, authenticated;

create or replace function app_private.initial_assessment_snapshot(
  p_assessment public.week_zero_assessments
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'kind', p_assessment.kind,
    'schemaVersion', p_assessment.schema_version,
    'status', p_assessment.status,
    'version', p_assessment.row_version,
    'responses', p_assessment.responses,
    'updatedAt', p_assessment.updated_at,
    'submittedAt', p_assessment.submitted_at
  );
$$;

revoke all on function app_private.initial_assessment_snapshot(public.week_zero_assessments)
  from public, anon, authenticated;

alter table public.week_zero_assessments enable row level security;
alter table public.week_zero_assessments force row level security;
revoke all on table public.week_zero_assessments from anon, authenticated;
grant select on table public.week_zero_assessments to authenticated;

create policy week_zero_assessments_select_authorized
on public.week_zero_assessments for select to authenticated
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

create or replace function public.save_own_initial_assessment(
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
  v_assessment public.week_zero_assessments%rowtype;
  v_receipt app_private.week_zero_command_receipts%rowtype;
  v_fingerprint text;
  v_snapshot jsonb;
begin
  if v_actor_id is null then
    raise exception using errcode = 'P0001', message = 'FE_UNAUTHENTICATED';
  end if;
  if p_expected_version is null or p_expected_version < 0 or p_idempotency_key is null then
    raise exception using errcode = 'P0001', message = 'FE_INVALID_INPUT';
  end if;
  if not app_private.initial_assessment_responses_valid(p_responses, false) then
    raise exception using errcode = 'P0001', message = 'FE_INVALID_INITIAL_ASSESSMENT';
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
    concat_ws(':', 'initial-assessment', v_actor_id::text, 'SAVE_DRAFT', p_idempotency_key::text), 0
  ));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    concat_ws(':', 'initial-assessment-client', v_client.id::text), 0
  ));

  select receipt.* into v_receipt
  from app_private.week_zero_command_receipts receipt
  where receipt.actor_user_id = v_actor_id
    and receipt.command = 'SAVE_DRAFT'
    and receipt.idempotency_key = p_idempotency_key;
  if found then
    if v_receipt.request_fingerprint <> v_fingerprint then
      raise exception using errcode = 'P0001', message = 'FE_IDEMPOTENCY_CONFLICT';
    end if;
    return v_receipt.result_snapshot;
  end if;

  select assessment.* into v_assessment
  from public.week_zero_assessments assessment
  where assessment.client_id = v_client.id
  for update;

  if not found then
    if p_expected_version <> 0 then
      raise exception using errcode = 'P0001', message = 'FE_VERSION_CONFLICT';
    end if;
    insert into public.week_zero_assessments (
      organization_id, client_id, responses
    ) values (
      v_client.organization_id, v_client.id, p_responses
    ) returning * into v_assessment;
  else
    if v_assessment.status = 'SUBMITTED' then
      raise exception using errcode = 'P0001', message = 'FE_INITIAL_ASSESSMENT_SUBMITTED';
    end if;
    if v_assessment.row_version <> p_expected_version then
      raise exception using errcode = 'P0001', message = 'FE_VERSION_CONFLICT';
    end if;
    update public.week_zero_assessments assessment
    set responses = p_responses,
        row_version = assessment.row_version + 1,
        last_saved_at = clock_timestamp(),
        updated_at = clock_timestamp()
    where assessment.id = v_assessment.id
    returning assessment.* into v_assessment;
  end if;

  v_snapshot := app_private.initial_assessment_snapshot(v_assessment);
  insert into app_private.week_zero_command_receipts (
    actor_user_id, command, idempotency_key, request_fingerprint,
    assessment_id, result_version, result_snapshot
  ) values (
    v_actor_id, 'SAVE_DRAFT', p_idempotency_key, v_fingerprint,
    v_assessment.id, v_assessment.row_version, v_snapshot
  );
  return v_snapshot;
end;
$$;

create or replace function public.submit_own_initial_assessment(
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
  v_assessment public.week_zero_assessments%rowtype;
  v_receipt app_private.week_zero_command_receipts%rowtype;
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
    concat_ws(':', 'initial-assessment', v_actor_id::text, 'SUBMIT', p_idempotency_key::text), 0
  ));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    concat_ws(':', 'initial-assessment-client', v_client.id::text), 0
  ));

  select receipt.* into v_receipt
  from app_private.week_zero_command_receipts receipt
  where receipt.actor_user_id = v_actor_id
    and receipt.command = 'SUBMIT'
    and receipt.idempotency_key = p_idempotency_key;
  if found then
    if v_receipt.request_fingerprint <> v_fingerprint then
      raise exception using errcode = 'P0001', message = 'FE_IDEMPOTENCY_CONFLICT';
    end if;
    return v_receipt.result_snapshot;
  end if;

  select assessment.* into v_assessment
  from public.week_zero_assessments assessment
  where assessment.client_id = v_client.id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'FE_INITIAL_ASSESSMENT_INCOMPLETE';
  end if;
  if v_assessment.status = 'SUBMITTED' then
    raise exception using errcode = 'P0001', message = 'FE_INITIAL_ASSESSMENT_SUBMITTED';
  end if;
  if v_assessment.row_version <> p_expected_version then
    raise exception using errcode = 'P0001', message = 'FE_VERSION_CONFLICT';
  end if;
  if not app_private.initial_assessment_responses_valid(v_assessment.responses, true) then
    raise exception using errcode = 'P0001', message = 'FE_INITIAL_ASSESSMENT_INCOMPLETE';
  end if;

  update public.week_zero_assessments assessment
  set status = 'SUBMITTED',
      row_version = assessment.row_version + 1,
      submitted_at = clock_timestamp(),
      submitted_by = v_actor_id,
      updated_at = clock_timestamp()
  where assessment.id = v_assessment.id
  returning assessment.* into v_assessment;

  insert into public.audit_events (
    organization_id, actor_user_id, actor_role, command, entity_type, entity_id,
    entity_version, result, correlation_id, context
  ) values (
    v_client.organization_id, v_actor_id, 'CLIENT', 'SubmitInitialAssessment',
    'week_zero_assessment', v_assessment.id, v_assessment.row_version,
    'SUCCEEDED', p_idempotency_key,
    jsonb_build_object('kind', 'INITIAL_ASSESSMENT', 'schemaVersion', 1)
  );

  v_snapshot := app_private.initial_assessment_snapshot(v_assessment);
  insert into app_private.week_zero_command_receipts (
    actor_user_id, command, idempotency_key, request_fingerprint,
    assessment_id, result_version, result_snapshot
  ) values (
    v_actor_id, 'SUBMIT', p_idempotency_key, v_fingerprint,
    v_assessment.id, v_assessment.row_version, v_snapshot
  );
  return v_snapshot;
end;
$$;

revoke all on function public.save_own_initial_assessment(jsonb, bigint, uuid)
  from public, anon, authenticated;
revoke all on function public.submit_own_initial_assessment(bigint, uuid)
  from public, anon, authenticated;
grant execute on function public.save_own_initial_assessment(jsonb, bigint, uuid)
  to authenticated;
grant execute on function public.submit_own_initial_assessment(bigint, uuid)
  to authenticated;

commit;
