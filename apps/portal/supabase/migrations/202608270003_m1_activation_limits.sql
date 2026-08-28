begin;

-- Invitation and OTP throttling is server-owned. The browser never receives
-- direct access to this table or function; the BFF invokes it with the local
-- service-role client only after resolving a valid invitation digest.
create table app_private.activation_rate_limits (
  invitation_id uuid not null references public.client_invitations(id) on delete cascade,
  fingerprint_hash text not null check (fingerprint_hash ~ '^[0-9a-f]{64}$'),
  kind text not null check (kind in ('REQUEST_OTP', 'VERIFY_OTP')),
  window_started_at timestamptz not null default now(),
  attempts integer not null default 1 check (attempts > 0),
  updated_at timestamptz not null default now(),
  primary key (invitation_id, fingerprint_hash, kind)
);

revoke all on table app_private.activation_rate_limits from public, anon, authenticated;

create table app_private.client_otp_rate_limits (
  email_hash text not null check (email_hash ~ '^[0-9a-f]{64}$'),
  fingerprint_hash text not null check (fingerprint_hash ~ '^[0-9a-f]{64}$'),
  kind text not null check (kind in ('REQUEST_OTP', 'VERIFY_OTP')),
  window_started_at timestamptz not null default now(),
  attempts integer not null default 1 check (attempts > 0),
  updated_at timestamptz not null default now(),
  primary key (email_hash, fingerprint_hash, kind)
);

revoke all on table app_private.client_otp_rate_limits from public, anon, authenticated;

create or replace function public.consume_m1_activation_limit(
  p_invitation_id uuid,
  p_fingerprint_hash text,
  p_kind text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempts integer;
  v_global_attempts integer;
  v_limit integer;
  v_window interval := interval '15 minutes';
begin
  if p_fingerprint_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = 'P0001', message = 'FE_INVALID_FINGERPRINT';
  end if;
  if p_kind not in ('REQUEST_OTP', 'VERIFY_OTP') then
    raise exception using errcode = 'P0001', message = 'FE_INVALID_RATE_LIMIT_KIND';
  end if;
  if not exists (
    select 1
    from public.client_invitations invitation
    where invitation.id = p_invitation_id
      and invitation.status = 'SENT'
      and invitation.expires_at > now()
  ) then
    raise exception using errcode = 'P0001', message = 'FE_INVITATION_NOT_FOUND';
  end if;

  v_limit := case p_kind when 'REQUEST_OTP' then 5 else 10 end;

  -- Fingerprints provide useful abuse evidence, but IP and User-Agent values
  -- are not trusted identities. Serialize and cap the whole invitation bucket
  -- so rotating either value cannot reset the OTP allowance.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      concat_ws(':', 'm1-activation-limit', p_invitation_id::text, p_kind),
      0
    )
  );

  delete from app_private.activation_rate_limits rate
  where rate.invitation_id = p_invitation_id
    and rate.kind = p_kind
    and rate.window_started_at <= now() - v_window;

  select coalesce(sum(rate.attempts), 0)::integer into v_global_attempts
  from app_private.activation_rate_limits rate
  where rate.invitation_id = p_invitation_id
    and rate.kind = p_kind
    and rate.window_started_at > now() - v_window;

  if v_global_attempts >= v_limit then
    raise exception using errcode = 'P0001', message = 'FE_RATE_LIMITED';
  end if;

  insert into app_private.activation_rate_limits (
    invitation_id,
    fingerprint_hash,
    kind,
    window_started_at,
    attempts,
    updated_at
  ) values (
    p_invitation_id,
    p_fingerprint_hash,
    p_kind,
    now(),
    1,
    now()
  )
  on conflict (invitation_id, fingerprint_hash, kind) do update
    set attempts = case
          when app_private.activation_rate_limits.window_started_at <= now() - v_window then 1
          else app_private.activation_rate_limits.attempts + 1
        end,
        window_started_at = case
          when app_private.activation_rate_limits.window_started_at <= now() - v_window then now()
          else app_private.activation_rate_limits.window_started_at
        end,
        updated_at = now()
  returning attempts into v_attempts;

  if v_attempts > v_limit then
    raise exception using errcode = 'P0001', message = 'FE_RATE_LIMITED';
  end if;
end;
$$;

revoke all on function public.consume_m1_activation_limit(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.consume_m1_activation_limit(uuid, text, text)
  to service_role;

create or replace function public.consume_m1_client_otp_limit(
  p_email_hash text,
  p_fingerprint_hash text,
  p_kind text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempts integer;
  v_global_attempts integer;
  v_limit integer;
  v_window interval := interval '15 minutes';
begin
  if p_email_hash !~ '^[0-9a-f]{64}$'
     or p_fingerprint_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = 'P0001', message = 'FE_INVALID_FINGERPRINT';
  end if;
  if p_kind not in ('REQUEST_OTP', 'VERIFY_OTP') then
    raise exception using errcode = 'P0001', message = 'FE_INVALID_RATE_LIMIT_KIND';
  end if;

  v_limit := case p_kind when 'REQUEST_OTP' then 5 else 10 end;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      concat_ws(':', 'm1-client-otp-limit', p_email_hash, p_kind),
      0
    )
  );

  delete from app_private.client_otp_rate_limits rate
  where rate.email_hash = p_email_hash
    and rate.kind = p_kind
    and rate.window_started_at <= now() - v_window;

  select coalesce(sum(rate.attempts), 0)::integer into v_global_attempts
  from app_private.client_otp_rate_limits rate
  where rate.email_hash = p_email_hash
    and rate.kind = p_kind;

  if v_global_attempts >= v_limit then
    raise exception using errcode = 'P0001', message = 'FE_RATE_LIMITED';
  end if;

  insert into app_private.client_otp_rate_limits (
    email_hash,
    fingerprint_hash,
    kind,
    window_started_at,
    attempts,
    updated_at
  ) values (
    p_email_hash,
    p_fingerprint_hash,
    p_kind,
    now(),
    1,
    now()
  )
  on conflict (email_hash, fingerprint_hash, kind) do update
    set attempts = app_private.client_otp_rate_limits.attempts + 1,
        updated_at = now()
  returning attempts into v_attempts;

  if v_attempts > v_limit then
    raise exception using errcode = 'P0001', message = 'FE_RATE_LIMITED';
  end if;
end;
$$;

revoke all on function public.consume_m1_client_otp_limit(text, text, text)
  from public, anon, authenticated;
grant execute on function public.consume_m1_client_otp_limit(text, text, text)
  to service_role;

-- A digest is not a raw token, but it is still security-sensitive and is not
-- needed by Coach/Admin reads. Keep only the presentation columns available.
revoke select on table public.client_invitations from authenticated;
grant select (
  id,
  organization_id,
  client_id,
  email,
  expires_at,
  status,
  sent_at,
  accepted_at,
  accepted_by,
  created_at,
  updated_at,
  row_version,
  archived_at
) on table public.client_invitations to authenticated;

alter table public.audit_events
  add constraint audit_context_m1_safe_size
  check (octet_length(context::text) <= 4096),
  add constraint audit_context_m1_no_secret_keys
  check (
    context::text !~* '"(password|otp|secret|token|tokenhash|token_hash|signedurl|signed_url)"[[:space:]]*:'
  );

create unique index audit_client_invitation_viewed_once_idx
  on public.audit_events (entity_id, command)
  where command = 'ClientInvitationViewed' and result = 'SUCCEEDED';

commit;
