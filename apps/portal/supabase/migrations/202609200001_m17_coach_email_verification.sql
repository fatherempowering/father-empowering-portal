begin;

-- A Coach email verification is an application assurance bound to one
-- Supabase password session. It is deliberately not represented as aal2:
-- Supabase remains the sole authority for the JWT aal claim.
create table app_private.coach_session_attestations (
  session_id uuid primary key references auth.sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  method text not null default 'email_otp' check (method = 'email_otp'),
  verified_at timestamptz not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at > verified_at),
  check (expires_at <= verified_at + interval '180 days')
);

create index coach_session_attestations_user_idx
  on app_private.coach_session_attestations (user_id, expires_at);

revoke all on table app_private.coach_session_attestations
  from public, anon, authenticated;

create table app_private.coach_email_otp_rate_limits (
  session_id uuid not null references auth.sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  fingerprint_hash text not null check (fingerprint_hash ~ '^[0-9a-f]{64}$'),
  kind text not null check (kind in ('REQUEST_OTP', 'VERIFY_OTP')),
  window_started_at timestamptz not null default now(),
  attempts integer not null default 1 check (attempts > 0),
  updated_at timestamptz not null default now(),
  primary key (session_id, fingerprint_hash, kind)
);

create index coach_email_otp_rate_limits_window_idx
  on app_private.coach_email_otp_rate_limits (window_started_at);
create index coach_email_otp_rate_limits_fingerprint_idx
  on app_private.coach_email_otp_rate_limits (fingerprint_hash, kind, window_started_at);

revoke all on table app_private.coach_email_otp_rate_limits
  from public, anon, authenticated;

-- Supabase owns the OTP value and verifies it. This table stores no code or
-- email: it only binds an active request window to the password session that
-- initiated delivery, so another session for the same account cannot consume
-- a code without first initiating its own request. The Supabase code remains
-- account-bound, not cryptographically session-bound; this is the fail-closed
-- application binding available without implementing a parallel OTP system.
create table app_private.coach_email_otp_challenges (
  session_id uuid primary key references auth.sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  requested_at timestamptz not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  check (expires_at > requested_at),
  check (expires_at <= requested_at + interval '10 minutes')
);

create index coach_email_otp_challenges_user_idx
  on app_private.coach_email_otp_challenges (user_id, expires_at);

revoke all on table app_private.coach_email_otp_challenges
  from public, anon, authenticated;

create or replace function app_private.jwt_session_id()
returns uuid
language sql
stable
set search_path = ''
as $$
  select case
    when coalesce(auth.jwt() ->> 'session_id', '')
      ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
    then (auth.jwt() ->> 'session_id')::uuid
    else null
  end;
$$;

create or replace function app_private.jwt_has_password_amr()
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
    from jsonb_array_elements(
      case
        when jsonb_typeof(auth.jwt() -> 'amr') = 'array' then auth.jwt() -> 'amr'
        else '[]'::jsonb
      end
    ) authentication_method
    where authentication_method ->> 'method' = 'password'
  );
$$;

create or replace function app_private.has_active_staff_password_session()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and app_private.jwt_session_id() is not null
    and app_private.jwt_has_password_amr()
    and exists (
      select 1
      from auth.sessions session
      where session.id = app_private.jwt_session_id()
        and session.user_id = auth.uid()
        and (session.not_after is null or session.not_after > now())
    )
    and 1 = (
      select count(*)
      from public.organization_memberships membership
      where membership.user_id = auth.uid()
        and membership.status = 'ACTIVE'
        and membership.role in ('ADMIN', 'COACH')
    );
$$;

create or replace function app_private.has_verified_coach_session()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app_private.has_active_staff_password_session()
    and exists (
      select 1
      from app_private.coach_session_attestations attestation
      where attestation.session_id = app_private.jwt_session_id()
        and attestation.user_id = auth.uid()
        and attestation.method = 'email_otp'
        and attestation.revoked_at is null
        and attestation.expires_at > now()
    );
$$;

revoke all on function app_private.jwt_session_id() from public, anon, authenticated;
revoke all on function app_private.jwt_has_password_amr() from public, anon, authenticated;
revoke all on function app_private.has_active_staff_password_session()
  from public, anon, authenticated;
revoke all on function app_private.has_verified_coach_session()
  from public, anon, authenticated;

create or replace function public.get_coach_email_verification_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_expires_at timestamptz;
begin
  if not app_private.has_active_staff_password_session() then
    raise exception using errcode = 'P0001', message = 'FE_COACH_PASSWORD_SESSION_REQUIRED';
  end if;

  select attestation.expires_at into v_expires_at
  from app_private.coach_session_attestations attestation
  where attestation.session_id = app_private.jwt_session_id()
    and attestation.user_id = auth.uid()
    and attestation.method = 'email_otp'
    and attestation.revoked_at is null
    and attestation.expires_at > now();

  return jsonb_build_object(
    'verified', v_expires_at is not null,
    'expiresAt', v_expires_at
  );
end;
$$;

revoke all on function public.get_coach_email_verification_status()
  from public, anon, authenticated;
grant execute on function public.get_coach_email_verification_status()
  to authenticated;

create or replace function public.consume_m1_coach_email_otp_limit(
  p_fingerprint_hash text,
  p_kind text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session_id uuid;
  v_user_id uuid := auth.uid();
  v_attempts integer;
  v_session_attempts integer;
  v_fingerprint_attempts integer;
  v_session_limit integer;
  v_fingerprint_limit integer;
  v_window interval := interval '15 minutes';
begin
  if not app_private.has_active_staff_password_session() then
    raise exception using errcode = 'P0001', message = 'FE_COACH_PASSWORD_SESSION_REQUIRED';
  end if;
  if p_fingerprint_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = 'P0001', message = 'FE_INVALID_FINGERPRINT';
  end if;
  if p_kind not in ('REQUEST_OTP', 'VERIFY_OTP') then
    raise exception using errcode = 'P0001', message = 'FE_INVALID_RATE_LIMIT_KIND';
  end if;

  v_session_id := app_private.jwt_session_id();
  if p_kind = 'VERIFY_OTP' and not exists (
    select 1
    from app_private.coach_email_otp_challenges challenge
    where challenge.session_id = v_session_id
      and challenge.user_id = v_user_id
      and challenge.consumed_at is null
      and challenge.expires_at > now()
  ) then
    raise exception using errcode = 'P0001', message = 'FE_OTP_CHALLENGE_REQUIRED';
  end if;
  v_session_limit := case p_kind when 'REQUEST_OTP' then 5 else 10 end;
  v_fingerprint_limit := case p_kind when 'REQUEST_OTP' then 20 else 40 end;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      concat_ws(':', 'm17-coach-email-otp-fingerprint', p_fingerprint_hash, p_kind),
      0
    )
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      concat_ws(':', 'm17-coach-email-otp-session', v_session_id::text, p_kind),
      0
    )
  );

  delete from app_private.coach_email_otp_rate_limits rate
  where rate.ctid in (
    select expired.ctid
    from app_private.coach_email_otp_rate_limits expired
    where expired.window_started_at <= now() - v_window
    order by expired.window_started_at
    limit 1000
  );

  if p_kind = 'REQUEST_OTP' and exists (
    select 1
    from app_private.coach_email_otp_rate_limits rate
    where rate.session_id = v_session_id
      and rate.kind = p_kind
      and rate.updated_at > now() - interval '60 seconds'
  ) then
    raise exception using errcode = 'P0001', message = 'FE_RATE_LIMITED';
  end if;

  select coalesce(sum(rate.attempts), 0)::integer into v_fingerprint_attempts
  from app_private.coach_email_otp_rate_limits rate
  where rate.fingerprint_hash = p_fingerprint_hash
    and rate.kind = p_kind
    and rate.window_started_at > now() - v_window;

  if v_fingerprint_attempts >= v_fingerprint_limit then
    raise exception using errcode = 'P0001', message = 'FE_RATE_LIMITED';
  end if;

  select coalesce(sum(rate.attempts), 0)::integer into v_session_attempts
  from app_private.coach_email_otp_rate_limits rate
  where rate.session_id = v_session_id
    and rate.kind = p_kind
    and rate.window_started_at > now() - v_window;

  if v_session_attempts >= v_session_limit then
    raise exception using errcode = 'P0001', message = 'FE_RATE_LIMITED';
  end if;

  insert into app_private.coach_email_otp_rate_limits (
    session_id,
    user_id,
    fingerprint_hash,
    kind,
    window_started_at,
    attempts,
    updated_at
  ) values (
    v_session_id,
    v_user_id,
    p_fingerprint_hash,
    p_kind,
    now(),
    1,
    now()
  )
  on conflict (session_id, fingerprint_hash, kind) do update
    set attempts = case
          when app_private.coach_email_otp_rate_limits.window_started_at <= now() - v_window then 1
          else app_private.coach_email_otp_rate_limits.attempts + 1
        end,
        window_started_at = case
          when app_private.coach_email_otp_rate_limits.window_started_at <= now() - v_window then now()
          else app_private.coach_email_otp_rate_limits.window_started_at
        end,
        updated_at = now()
  returning attempts into v_attempts;

  if v_attempts > v_session_limit then
    raise exception using errcode = 'P0001', message = 'FE_RATE_LIMITED';
  end if;

end;
$$;

revoke all on function public.consume_m1_coach_email_otp_limit(text, text)
  from public, anon, authenticated;
grant execute on function public.consume_m1_coach_email_otp_limit(text, text)
  to authenticated;

create or replace function public.open_coach_email_otp_challenge(
  p_user_id uuid,
  p_session_id uuid
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_expires_at timestamptz := v_now + interval '10 minutes';
begin
  if not exists (
    select 1
    from auth.sessions session
    where session.id = p_session_id
      and session.user_id = p_user_id
      and (session.not_after is null or session.not_after > v_now)
  ) then
    raise exception using errcode = 'P0001', message = 'FE_COACH_PASSWORD_SESSION_REQUIRED';
  end if;
  if 1 <> (
    select count(*)
    from public.organization_memberships membership
    where membership.user_id = p_user_id
      and membership.status = 'ACTIVE'
      and membership.role in ('ADMIN', 'COACH')
  ) then
    raise exception using errcode = 'P0001', message = 'FE_FORBIDDEN';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      concat_ws(':', 'm17-coach-email-challenge', p_session_id::text),
      0
    )
  );

  insert into app_private.coach_email_otp_challenges (
    session_id,
    user_id,
    requested_at,
    expires_at,
    consumed_at
  ) values (
    p_session_id,
    p_user_id,
    v_now,
    v_expires_at,
    null
  )
  on conflict (session_id) do update
    set user_id = excluded.user_id,
        requested_at = excluded.requested_at,
        expires_at = excluded.expires_at,
        consumed_at = null;

  return v_expires_at;
end;
$$;

revoke all on function public.open_coach_email_otp_challenge(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.open_coach_email_otp_challenge(uuid, uuid)
  to service_role;

create or replace function public.attest_coach_email_session(
  p_user_id uuid,
  p_session_id uuid
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_membership_count integer;
  v_organization_id uuid;
  v_actor_role public.app_role;
  v_now timestamptz := clock_timestamp();
  v_session_not_after timestamptz;
  v_expires_at timestamptz;
  v_existing app_private.coach_session_attestations%rowtype;
  v_challenge app_private.coach_email_otp_challenges%rowtype;
begin
  select session.not_after into v_session_not_after
  from auth.sessions session
  where session.id = p_session_id
    and session.user_id = p_user_id
    and (session.not_after is null or session.not_after > v_now);
  if not found then
    raise exception using errcode = 'P0001', message = 'FE_COACH_PASSWORD_SESSION_REQUIRED';
  end if;
  v_expires_at := least(
    v_now + interval '180 days',
    coalesce(v_session_not_after, v_now + interval '180 days')
  );

  select
    count(*)::integer,
    (array_agg(membership.organization_id order by membership.organization_id))[1],
    (array_agg(membership.role order by membership.organization_id))[1]
  into v_membership_count, v_organization_id, v_actor_role
  from public.organization_memberships membership
  where membership.user_id = p_user_id
    and membership.status = 'ACTIVE'
    and membership.role in ('ADMIN', 'COACH');

  if v_membership_count <> 1 then
    raise exception using errcode = 'P0001', message = 'FE_FORBIDDEN';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      concat_ws(':', 'm17-coach-email-attestation', p_session_id::text),
      0
    )
  );

  select challenge.* into v_challenge
  from app_private.coach_email_otp_challenges challenge
  where challenge.session_id = p_session_id
    and challenge.user_id = p_user_id
    and challenge.consumed_at is null
    and challenge.expires_at > v_now
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'FE_OTP_CHALLENGE_REQUIRED';
  end if;

  select attestation.* into v_existing
  from app_private.coach_session_attestations attestation
  where attestation.session_id = p_session_id
  for update;

  if found then
    if v_existing.user_id <> p_user_id or v_existing.revoked_at is not null then
      raise exception using errcode = 'P0001', message = 'FE_COACH_SESSION_REVOKED';
    end if;
    if v_existing.expires_at <= v_now then
      raise exception using errcode = 'P0001', message = 'FE_COACH_SESSION_EXPIRED';
    end if;
    update app_private.coach_email_otp_challenges challenge
    set consumed_at = v_now
    where challenge.session_id = p_session_id;
    return v_existing.expires_at;
  end if;

  insert into app_private.coach_session_attestations (
    session_id,
    user_id,
    method,
    verified_at,
    expires_at,
    revoked_at,
    updated_at
  ) values (
    p_session_id,
    p_user_id,
    'email_otp',
    v_now,
    v_expires_at,
    null,
    v_now
  );

  insert into public.audit_events (
    organization_id,
    actor_user_id,
    actor_role,
    command,
    entity_type,
    entity_id,
    result,
    context
  ) values (
    v_organization_id,
    p_user_id,
    v_actor_role,
    'CoachEmailVerified',
    'auth_session',
    p_user_id,
    'SUCCEEDED',
    jsonb_build_object(
      'assurance', 'email_otp',
      'supabaseAal', 'aal1'
    )
  );

  update app_private.coach_email_otp_challenges challenge
  set consumed_at = v_now
  where challenge.session_id = p_session_id;

  return v_expires_at;
end;
$$;

revoke all on function public.attest_coach_email_session(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.attest_coach_email_session(uuid, uuid)
  to service_role;

create or replace function public.revoke_current_coach_email_attestation()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session_id uuid := app_private.jwt_session_id();
begin
  if auth.uid() is null or v_session_id is null then
    raise exception using errcode = 'P0001', message = 'FE_UNAUTHENTICATED';
  end if;

  update app_private.coach_session_attestations attestation
  set revoked_at = coalesce(attestation.revoked_at, clock_timestamp()),
      updated_at = clock_timestamp()
  where attestation.session_id = v_session_id
    and attestation.user_id = auth.uid();

  return true;
end;
$$;

revoke all on function public.revoke_current_coach_email_attestation()
  from public, anon, authenticated;
grant execute on function public.revoke_current_coach_email_attestation()
  to authenticated;

create or replace function public.revoke_all_coach_email_attestations()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception using errcode = 'P0001', message = 'FE_UNAUTHENTICATED';
  end if;

  update app_private.coach_session_attestations attestation
  set revoked_at = coalesce(attestation.revoked_at, clock_timestamp()),
      updated_at = clock_timestamp()
  where attestation.user_id = auth.uid();

  return true;
end;
$$;

revoke all on function public.revoke_all_coach_email_attestations()
  from public, anon, authenticated;
grant execute on function public.revoke_all_coach_email_attestations()
  to authenticated;

-- Staff authorization now requires the application assurance in addition to
-- the original organization, role and assignment invariants. Client access is
-- unchanged.
create or replace function app_private.has_org_role(
  p_organization_id uuid,
  p_roles public.app_role[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_memberships membership
    where membership.organization_id = p_organization_id
      and membership.user_id = auth.uid()
      and membership.status = 'ACTIVE'
      and membership.role = any (p_roles)
      and (
        membership.role = 'CLIENT'
        or app_private.has_verified_coach_session()
      )
  );
$$;

create or replace function app_private.is_assigned_coach(
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
    from public.coach_client_assignments assignment
    join public.organization_memberships membership
      on membership.organization_id = assignment.organization_id
     and membership.user_id = assignment.coach_user_id
    where assignment.organization_id = p_organization_id
      and assignment.client_id = p_client_id
      and assignment.coach_user_id = auth.uid()
      and app_private.has_verified_coach_session()
      and assignment.status in ('PENDING', 'ACTIVE', 'PAUSED')
      and membership.status = 'ACTIVE'
      and membership.role in ('ADMIN', 'COACH')
  );
$$;

-- Preserve every line of the already-reviewed business RPCs and replace only
-- their former aal2 gate. The migration aborts if the expected predecessor is
-- not present exactly once, preventing a partially weakened deployment.
do $migration$
declare
  v_function regprocedure;
  v_definition text;
  v_old_guard constant text := 'coalesce(auth.jwt() ->> ''aal'', ''aal1'') <> ''aal2''';
  v_new_guard constant text := 'not app_private.has_verified_coach_session()';
  v_old_error constant text := 'FE_MFA_AAL2_REQUIRED';
  v_functions constant regprocedure[] := array[
    'public.create_invited_client(uuid,text,text,text,text,text,text,timestamp with time zone,uuid,uuid)'::regprocedure,
    'public.resend_client_invitation(uuid,text,timestamp with time zone,uuid)'::regprocedure,
    'public.revoke_client_invitation(uuid,text,uuid)'::regprocedure,
    'public.revoke_client_invitation_for_client(uuid,text,uuid)'::regprocedure
  ];
begin
  foreach v_function in array v_functions loop
    v_definition := pg_catalog.pg_get_functiondef(v_function);
    if (
      (length(v_definition) - length(replace(v_definition, v_old_guard, '')))
      / length(v_old_guard)
    ) <> 1 then
      raise exception 'Unexpected predecessor for %', v_function;
    end if;
    if (
      (length(v_definition) - length(replace(v_definition, v_old_error, '')))
      / length(v_old_error)
    ) <> 1 then
      raise exception 'Unexpected MFA error contract for %', v_function;
    end if;

    v_definition := replace(v_definition, v_old_guard, v_new_guard);
    v_definition := replace(
      v_definition,
      v_old_error,
      'FE_COACH_EMAIL_VERIFICATION_REQUIRED'
    );
    execute v_definition;
  end loop;
end;
$migration$;

commit;
