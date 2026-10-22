begin;

-- A Client membership and a verified Staff session may each own exactly one
-- active Client record. Staff access remains tied to the existing password +
-- email-verification attestation; an email-OTP/recovery session alone cannot
-- unlock the personal Client surface.
create or replace function app_private.has_own_client_access(
  p_organization_id uuid,
  p_client_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.clients client
    join public.organization_memberships membership
      on membership.organization_id = client.organization_id
     and membership.user_id = client.auth_user_id
    where client.organization_id = p_organization_id
      and client.id = p_client_id
      and client.auth_user_id = auth.uid()
      and client.status = 'ACTIVE'
      and membership.status = 'ACTIVE'
      and (
        membership.role = 'CLIENT'
        or (
          membership.role in ('ADMIN', 'COACH')
          and app_private.has_verified_coach_session()
        )
      )
  );
$$;

revoke all on function app_private.has_own_client_access(uuid, uuid)
  from public, anon, authenticated;
grant execute on function app_private.has_own_client_access(uuid, uuid)
  to authenticated;

create table app_private.staff_own_client_command_receipts (
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  idempotency_key uuid not null,
  request_fingerprint text not null check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  client_id uuid not null references public.clients(id) on delete restrict,
  result_snapshot jsonb not null check (jsonb_typeof(result_snapshot) = 'object'),
  created_at timestamptz not null default clock_timestamp(),
  primary key (actor_user_id, idempotency_key)
);

revoke all on table app_private.staff_own_client_command_receipts
  from public, anon, authenticated;

drop policy clients_select_authorized on public.clients;
create policy clients_select_authorized
on public.clients for select to authenticated
using (
  app_private.has_org_role(organization_id, array['ADMIN']::public.app_role[])
  or app_private.is_assigned_coach(organization_id, id)
  or app_private.has_own_client_access(organization_id, id)
);

drop policy assignments_select_authorized on public.coach_client_assignments;
create policy assignments_select_authorized
on public.coach_client_assignments for select to authenticated
using (
  app_private.has_org_role(organization_id, array['ADMIN']::public.app_role[])
  or (
    coach_user_id = auth.uid()
    and app_private.has_org_role(organization_id, array['ADMIN', 'COACH']::public.app_role[])
  )
  or app_private.has_own_client_access(organization_id, client_id)
);

drop policy week_zero_assessments_select_authorized on public.week_zero_assessments;
create policy week_zero_assessments_select_authorized
on public.week_zero_assessments for select to authenticated
using (
  app_private.has_own_client_access(organization_id, client_id)
  or (
    status = 'SUBMITTED'
    and (
      app_private.has_org_role(organization_id, array['ADMIN']::public.app_role[])
      or app_private.is_assigned_coach(organization_id, client_id)
    )
  )
);

drop policy client_onboarding_intakes_select_authorized
  on public.client_onboarding_intakes;
create policy client_onboarding_intakes_select_authorized
on public.client_onboarding_intakes for select to authenticated
using (
  app_private.has_own_client_access(organization_id, client_id)
  or (
    status = 'SUBMITTED'
    and (
      app_private.has_org_role(organization_id, array['ADMIN']::public.app_role[])
      or app_private.is_assigned_coach(organization_id, client_id)
    )
  )
);

create or replace function public.create_own_client_profile(
  p_first_name text,
  p_last_name text,
  p_locale text,
  p_time_zone text,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_membership public.organization_memberships%rowtype;
  v_actor_email text;
  v_client public.clients%rowtype;
  v_receipt app_private.staff_own_client_command_receipts%rowtype;
  v_first_name text := btrim(p_first_name);
  v_last_name text := btrim(p_last_name);
  v_time_zone text := btrim(p_time_zone);
  v_fingerprint text;
  v_snapshot jsonb;
begin
  if v_actor_id is null then
    raise exception using errcode = 'P0001', message = 'FE_UNAUTHENTICATED';
  end if;
  if p_idempotency_key is null
     or v_first_name is null
     or char_length(v_first_name) not between 1 and 120
     or v_last_name is null
     or char_length(v_last_name) not between 1 and 120
     or p_locale is null
     or p_locale not in ('fr-CA', 'en-CA')
     or v_time_zone is null
     or char_length(v_time_zone) not between 1 and 100 then
    raise exception using errcode = 'P0001', message = 'FE_INVALID_INPUT';
  end if;
  if not exists (
    select 1
    from pg_catalog.pg_timezone_names
    where name = v_time_zone
  ) then
    raise exception using errcode = 'P0001', message = 'FE_INVALID_INPUT';
  end if;
  if not app_private.has_verified_coach_session() then
    raise exception using errcode = 'P0001', message = 'FE_FORBIDDEN';
  end if;
  if (
    select count(*)
    from public.organization_memberships membership
    where membership.user_id = v_actor_id
      and membership.status = 'ACTIVE'
      and membership.role in ('ADMIN', 'COACH')
  ) <> 1 then
    raise exception using errcode = 'P0001', message = 'FE_FORBIDDEN';
  end if;

  select membership.* into v_membership
  from public.organization_memberships membership
  where membership.user_id = v_actor_id
    and membership.status = 'ACTIVE'
    and membership.role in ('ADMIN', 'COACH');

  select lower(btrim(auth_user.email)) into v_actor_email
  from auth.users auth_user
  where auth_user.id = v_actor_id
    and auth_user.email_confirmed_at is not null;
  if v_actor_email is null or char_length(v_actor_email) not between 3 and 320 then
    raise exception using errcode = 'P0001', message = 'FE_INVALID_IDENTITY';
  end if;

  v_fingerprint := encode(extensions.digest(convert_to(jsonb_build_object(
    'command', 'CREATE_OWN_CLIENT_PROFILE',
    'organizationId', v_membership.organization_id,
    'actorUserId', v_actor_id,
    'firstName', v_first_name,
    'lastName', v_last_name,
    'locale', p_locale,
    'timeZone', v_time_zone
  )::text, 'UTF8'), 'sha256'), 'hex');

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    concat_ws(':', 'staff-own-client', v_actor_id::text), 0
  ));

  select receipt.* into v_receipt
  from app_private.staff_own_client_command_receipts receipt
  where receipt.actor_user_id = v_actor_id
    and receipt.idempotency_key = p_idempotency_key;
  if found then
    if v_receipt.request_fingerprint <> v_fingerprint then
      raise exception using errcode = 'P0001', message = 'FE_IDEMPOTENCY_CONFLICT';
    end if;
    return v_receipt.result_snapshot;
  end if;

  if exists (
    select 1 from public.clients client where client.auth_user_id = v_actor_id
  ) then
    raise exception using errcode = 'P0001', message = 'FE_PERSONAL_PROFILE_EXISTS';
  end if;
  if exists (
    select 1
    from public.clients client
    where client.organization_id = v_membership.organization_id
      and lower(client.email) = v_actor_email
  ) then
    raise exception using errcode = 'P0001', message = 'FE_EMAIL_IDENTITY_CONFLICT';
  end if;

  begin
    insert into public.clients (
      organization_id, auth_user_id, email, first_name, last_name,
      locale, time_zone, status, created_by
    ) values (
      v_membership.organization_id, v_actor_id, v_actor_email,
      v_first_name, v_last_name, p_locale, v_time_zone,
      'ACTIVE', v_actor_id
    ) returning * into v_client;
  exception
    when unique_violation then
      if exists (
        select 1 from public.clients client where client.auth_user_id = v_actor_id
      ) then
        raise exception using errcode = 'P0001', message = 'FE_PERSONAL_PROFILE_EXISTS';
      end if;
      raise exception using errcode = 'P0001', message = 'FE_EMAIL_IDENTITY_CONFLICT';
  end;

  v_snapshot := jsonb_build_object('clientId', v_client.id);
  insert into app_private.staff_own_client_command_receipts (
    actor_user_id, idempotency_key, request_fingerprint, client_id, result_snapshot
  ) values (
    v_actor_id, p_idempotency_key, v_fingerprint, v_client.id, v_snapshot
  );
  insert into public.audit_events (
    organization_id, actor_user_id, actor_role, command, entity_type, entity_id,
    entity_version, result, correlation_id, context
  ) values (
    v_membership.organization_id, v_actor_id, v_membership.role,
    'CreateOwnClientProfile', 'client', v_client.id, v_client.row_version,
    'SUCCEEDED', p_idempotency_key, jsonb_build_object('surface', 'STAFF_SELF_CLIENT')
  );
  return v_snapshot;
end;
$$;

revoke all on function public.create_own_client_profile(text, text, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.create_own_client_profile(text, text, text, text, uuid)
  to authenticated;

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
  where client.auth_user_id = v_actor_id
    and client.status = 'ACTIVE'
    and app_private.has_own_client_access(client.organization_id, client.id);
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
    insert into public.week_zero_assessments (organization_id, client_id, responses)
    values (v_client.organization_id, v_client.id, p_responses)
    returning * into v_assessment;
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
  v_actor_role public.app_role;
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
  where client.auth_user_id = v_actor_id
    and client.status = 'ACTIVE'
    and app_private.has_own_client_access(client.organization_id, client.id);
  if not found then
    raise exception using errcode = 'P0001', message = 'FE_FORBIDDEN';
  end if;
  select membership.role into v_actor_role
  from public.organization_memberships membership
  where membership.organization_id = v_client.organization_id
    and membership.user_id = v_actor_id
    and membership.status = 'ACTIVE';
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
    v_client.organization_id, v_actor_id, v_actor_role,
    'SubmitInitialAssessment', 'week_zero_assessment', v_assessment.id,
    v_assessment.row_version, 'SUCCEEDED', p_idempotency_key,
    jsonb_build_object('kind', 'INITIAL_ASSESSMENT', 'schemaVersion', 1)
      || case
           when v_actor_role = 'CLIENT' then '{}'::jsonb
           else jsonb_build_object('surface', 'STAFF_SELF_CLIENT')
         end
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
  where client.auth_user_id = v_actor_id
    and client.status = 'ACTIVE'
    and app_private.has_own_client_access(client.organization_id, client.id);
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
    insert into public.client_onboarding_intakes (organization_id, client_id, responses)
    values (v_client.organization_id, v_client.id, p_responses)
    returning * into v_intake;
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
  v_actor_role public.app_role;
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
  where client.auth_user_id = v_actor_id
    and client.status = 'ACTIVE'
    and app_private.has_own_client_access(client.organization_id, client.id);
  if not found then
    raise exception using errcode = 'P0001', message = 'FE_FORBIDDEN';
  end if;
  select membership.role into v_actor_role
  from public.organization_memberships membership
  where membership.organization_id = v_client.organization_id
    and membership.user_id = v_actor_id
    and membership.status = 'ACTIVE';
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
    v_client.organization_id, v_actor_id, v_actor_role,
    'SubmitOnboardingIntake', 'client_onboarding_intake', v_intake.id,
    v_intake.row_version, 'SUCCEEDED', p_idempotency_key,
    jsonb_build_object('kind', 'ONBOARDING_INTAKE', 'schemaVersion', 1)
      || case
           when v_actor_role = 'CLIENT' then '{}'::jsonb
           else jsonb_build_object('surface', 'STAFF_SELF_CLIENT')
         end
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

revoke all on function public.save_own_initial_assessment(jsonb, bigint, uuid)
  from public, anon, authenticated;
revoke all on function public.submit_own_initial_assessment(bigint, uuid)
  from public, anon, authenticated;
revoke all on function public.save_own_onboarding_intake(jsonb, bigint, uuid)
  from public, anon, authenticated;
revoke all on function public.submit_own_onboarding_intake(bigint, uuid)
  from public, anon, authenticated;
grant execute on function public.save_own_initial_assessment(jsonb, bigint, uuid)
  to authenticated;
grant execute on function public.submit_own_initial_assessment(bigint, uuid)
  to authenticated;
grant execute on function public.save_own_onboarding_intake(jsonb, bigint, uuid)
  to authenticated;
grant execute on function public.submit_own_onboarding_intake(bigint, uuid)
  to authenticated;

commit;
