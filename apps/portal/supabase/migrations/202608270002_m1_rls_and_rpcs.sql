begin;

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
        or coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
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
      and coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
      and assignment.status in ('PENDING', 'ACTIVE', 'PAUSED')
      and membership.status = 'ACTIVE'
      and membership.role in ('ADMIN', 'COACH')
  );
$$;

create or replace function app_private.is_own_client(
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
    where client.organization_id = p_organization_id
      and client.id = p_client_id
      and client.auth_user_id = auth.uid()
      and client.status = 'ACTIVE'
  );
$$;

revoke all on function app_private.has_org_role(uuid, public.app_role[]) from public;
revoke all on function app_private.is_assigned_coach(uuid, uuid) from public;
revoke all on function app_private.is_own_client(uuid, uuid) from public;
grant usage on schema app_private to authenticated;
grant execute on function app_private.has_org_role(uuid, public.app_role[]) to authenticated;
grant execute on function app_private.is_assigned_coach(uuid, uuid) to authenticated;
grant execute on function app_private.is_own_client(uuid, uuid) to authenticated;

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.organization_memberships enable row level security;
alter table public.clients enable row level security;
alter table public.coach_client_assignments enable row level security;
alter table public.client_invitations enable row level security;
alter table public.audit_events enable row level security;
alter table public.outbox_events enable row level security;

alter table public.organizations force row level security;
alter table public.profiles force row level security;
alter table public.organization_memberships force row level security;
alter table public.clients force row level security;
alter table public.coach_client_assignments force row level security;
alter table public.client_invitations force row level security;
alter table public.audit_events force row level security;
alter table public.outbox_events force row level security;

revoke all on table public.organizations from anon, authenticated;
revoke all on table public.profiles from anon, authenticated;
revoke all on table public.organization_memberships from anon, authenticated;
revoke all on table public.clients from anon, authenticated;
revoke all on table public.coach_client_assignments from anon, authenticated;
revoke all on table public.client_invitations from anon, authenticated;
revoke all on table public.audit_events from anon, authenticated;
revoke all on table public.outbox_events from anon, authenticated;

grant select on table public.organizations to authenticated;
grant select on table public.profiles to authenticated;
grant select on table public.organization_memberships to authenticated;
grant select on table public.clients to authenticated;
grant select on table public.coach_client_assignments to authenticated;
grant select on table public.client_invitations to authenticated;
grant select on table public.audit_events to authenticated;

create policy organizations_select_authorized
on public.organizations for select to authenticated
using (app_private.has_org_role(id, array['ADMIN', 'COACH', 'CLIENT']::public.app_role[]));

create policy profiles_select_self
on public.profiles for select to authenticated
using (auth_user_id = auth.uid());

create policy memberships_select_self_or_admin
on public.organization_memberships for select to authenticated
using (
  user_id = auth.uid()
  or app_private.has_org_role(organization_id, array['ADMIN']::public.app_role[])
);

create policy clients_select_authorized
on public.clients for select to authenticated
using (
  app_private.has_org_role(organization_id, array['ADMIN']::public.app_role[])
  or app_private.is_assigned_coach(organization_id, id)
  or app_private.is_own_client(organization_id, id)
);

create policy assignments_select_authorized
on public.coach_client_assignments for select to authenticated
using (
  app_private.has_org_role(organization_id, array['ADMIN']::public.app_role[])
  or (
    coach_user_id = auth.uid()
    and app_private.has_org_role(organization_id, array['ADMIN', 'COACH']::public.app_role[])
  )
  or app_private.is_own_client(organization_id, client_id)
);

create policy invitations_select_coach_or_admin
on public.client_invitations for select to authenticated
using (
  app_private.has_org_role(organization_id, array['ADMIN']::public.app_role[])
  or app_private.is_assigned_coach(organization_id, client_id)
);

create policy audit_select_admin
on public.audit_events for select to authenticated
using (app_private.has_org_role(organization_id, array['ADMIN']::public.app_role[]));

create or replace function public.create_invited_client(
  p_organization_id uuid,
  p_email text,
  p_first_name text,
  p_last_name text,
  p_locale text,
  p_time_zone text,
  p_token_hash text,
  p_expires_at timestamptz,
  p_idempotency_key uuid,
  p_coach_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_role public.app_role;
  v_coach_id uuid := coalesce(p_coach_user_id, auth.uid());
  v_email text := lower(btrim(p_email));
  v_request_fingerprint text;
  v_client public.clients%rowtype;
  v_assignment public.coach_client_assignments%rowtype;
  v_invitation public.client_invitations%rowtype;
begin
  if v_actor_id is null then
    raise exception using errcode = 'P0001', message = 'FE_UNAUTHENTICATED';
  end if;

  if coalesce(auth.jwt() ->> 'aal', 'aal1') <> 'aal2' then
    raise exception using errcode = 'P0001', message = 'FE_MFA_AAL2_REQUIRED';
  end if;

  select membership.role into v_actor_role
  from public.organization_memberships membership
  where membership.organization_id = p_organization_id
    and membership.user_id = v_actor_id
    and membership.status = 'ACTIVE';

  if v_actor_role is null or v_actor_role not in ('ADMIN', 'COACH') then
    raise exception using errcode = 'P0001', message = 'FE_FORBIDDEN';
  end if;

  if v_actor_role = 'COACH' and v_coach_id <> v_actor_id then
    raise exception using errcode = 'P0001', message = 'FE_FORBIDDEN_COACH_ASSIGNMENT';
  end if;

  v_request_fingerprint := encode(
    extensions.digest(
      convert_to(
        jsonb_build_object(
          'organizationId', p_organization_id,
          'email', v_email,
          'firstName', btrim(p_first_name),
          'lastName', btrim(p_last_name),
          'locale', p_locale,
          'timeZone', p_time_zone,
          'coachUserId', v_coach_id
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      concat_ws(':', p_organization_id::text, v_actor_id::text, p_idempotency_key::text),
      0
    )
  );

  if not exists (
    select 1 from public.organization_memberships membership
    where membership.organization_id = p_organization_id
      and membership.user_id = v_coach_id
      and membership.status = 'ACTIVE'
      and membership.role in ('ADMIN', 'COACH')
  ) then
    raise exception using errcode = 'P0001', message = 'FE_INVALID_COACH';
  end if;

  select invitation.* into v_invitation
  from public.client_invitations invitation
  where invitation.organization_id = p_organization_id
    and invitation.created_by = v_actor_id
    and invitation.idempotency_key = p_idempotency_key;

  if found then
    if v_invitation.request_fingerprint <> v_request_fingerprint then
      raise exception using errcode = 'P0001', message = 'FE_IDEMPOTENCY_CONFLICT';
    end if;
    select client.* into strict v_client
      from public.clients client
      where client.organization_id = v_invitation.organization_id
        and client.id = v_invitation.client_id;
    select assignment.* into strict v_assignment
      from public.coach_client_assignments assignment
      where assignment.organization_id = v_client.organization_id
        and assignment.client_id = v_client.id
        and assignment.is_primary;
    return jsonb_build_object(
      'client', jsonb_build_object(
        'id', v_client.id,
        'email', v_client.email,
        'firstName', v_client.first_name,
        'lastName', v_client.last_name,
        'locale', v_client.locale,
        'timeZone', v_client.time_zone,
        'status', v_client.status,
        'assignmentStatus', v_assignment.status,
        'primaryCoachId', v_assignment.coach_user_id,
        'authUserId', v_client.auth_user_id
      ),
      'invitationId', v_invitation.id
    );
  end if;

  if position('@' in v_email) < 2 or char_length(v_email) > 320 then
    raise exception using errcode = 'P0001', message = 'FE_INVALID_EMAIL';
  end if;
  if char_length(btrim(p_first_name)) not between 1 and 120
     or char_length(btrim(p_last_name)) not between 1 and 120 then
    raise exception using errcode = 'P0001', message = 'FE_INVALID_NAME';
  end if;
  if p_locale not in ('fr-CA', 'en-CA') then
    raise exception using errcode = 'P0001', message = 'FE_INVALID_LOCALE';
  end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = p_time_zone) then
    raise exception using errcode = 'P0001', message = 'FE_INVALID_TIME_ZONE';
  end if;
  if p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = 'P0001', message = 'FE_INVALID_INVITATION_HASH';
  end if;
  if p_expires_at <= now() or p_expires_at > now() + interval '7 days' then
    raise exception using errcode = 'P0001', message = 'FE_INVALID_EXPIRY';
  end if;

  -- M1 has one active identity context. In particular, never turn a Coach or
  -- Admin email into a passwordless Client login. Idempotent retries returned
  -- above remain valid after the worker creates the invited Auth user.
  if exists (
    select 1
    from auth.users auth_user
    where lower(auth_user.email) = v_email
      and (
        exists (
          select 1 from public.profiles profile
          where profile.auth_user_id = auth_user.id
        )
        or exists (
          select 1 from public.organization_memberships membership
          where membership.user_id = auth_user.id
            and membership.status = 'ACTIVE'
        )
        or exists (
          select 1 from public.clients existing_client
          where existing_client.auth_user_id = auth_user.id
        )
      )
  ) then
    raise exception using errcode = 'P0001', message = 'FE_EMAIL_IDENTITY_CONFLICT';
  end if;

  if exists (
    select 1 from public.clients client
    where client.organization_id = p_organization_id and lower(client.email) = v_email
  ) then
    raise exception using errcode = 'P0001', message = 'FE_DUPLICATE_CLIENT';
  end if;

  insert into public.clients (
    organization_id, email, first_name, last_name, locale, time_zone, status, created_by
  ) values (
    p_organization_id, v_email, btrim(p_first_name), btrim(p_last_name),
    p_locale, p_time_zone, 'INVITED', v_actor_id
  ) returning * into v_client;

  insert into public.coach_client_assignments (
    organization_id, coach_user_id, client_id, status, is_primary, created_by
  ) values (
    p_organization_id, v_coach_id, v_client.id, 'PENDING', true, v_actor_id
  ) returning * into v_assignment;

  insert into public.client_invitations (
    organization_id, client_id, email, token_hash, expires_at, idempotency_key,
    request_fingerprint, created_by
  ) values (
    p_organization_id, v_client.id, v_email, p_token_hash, p_expires_at,
    p_idempotency_key, v_request_fingerprint, v_actor_id
  ) returning * into v_invitation;

  insert into public.audit_events (
    organization_id, actor_user_id, actor_role, command, entity_type, entity_id,
    entity_version, result, correlation_id, context
  ) values (
    p_organization_id, v_actor_id, v_actor_role, 'CreateInvitedClient', 'client',
    v_client.id, v_client.row_version, 'SUCCEEDED', p_idempotency_key,
    jsonb_build_object('invitationId', v_invitation.id, 'assignmentId', v_assignment.id)
  );

  insert into public.outbox_events (
    organization_id, event_type, aggregate_type, aggregate_id, actor_user_id, payload
  ) values (
    p_organization_id, 'ClientInvitationCreated', 'client', v_client.id, v_actor_id,
    jsonb_build_object('clientId', v_client.id, 'invitationId', v_invitation.id)
  );

  return jsonb_build_object(
    'client', jsonb_build_object(
      'id', v_client.id,
      'email', v_client.email,
      'firstName', v_client.first_name,
      'lastName', v_client.last_name,
      'locale', v_client.locale,
      'timeZone', v_client.time_zone,
      'status', v_client.status,
      'assignmentStatus', v_assignment.status,
      'primaryCoachId', v_assignment.coach_user_id,
      'authUserId', v_client.auth_user_id
    ),
    'invitationId', v_invitation.id
  );
exception
  when unique_violation then
    raise exception using errcode = 'P0001', message = 'FE_DUPLICATE';
end;
$$;

create or replace function public.accept_client_invitation(
  p_token_hash text,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := p_user_id;
  v_verified_email text;
  v_invitation_id uuid;
  v_invitation public.client_invitations%rowtype;
  v_client public.clients%rowtype;
  v_membership public.organization_memberships%rowtype;
  v_assignment public.coach_client_assignments%rowtype;
begin
  if v_user_id is null then
    raise exception using errcode = 'P0001', message = 'FE_UNAUTHENTICATED';
  end if;
  select lower(auth_user.email) into v_verified_email
  from auth.users auth_user
  where auth_user.id = v_user_id
    and auth_user.email_confirmed_at is not null;
  if not found then
    raise exception using errcode = 'P0001', message = 'FE_UNAUTHENTICATED';
  end if;
  if p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = 'P0001', message = 'FE_INVALID_INVITATION_HASH';
  end if;

  select invitation.* into v_invitation
  from public.client_invitations invitation
  where invitation.token_hash = p_token_hash;

  if not found then
    raise exception using errcode = 'P0001', message = 'FE_INVITATION_NOT_FOUND';
  end if;
  v_invitation_id := v_invitation.id;

  -- All invitation lifecycle mutations lock the owning Client before the
  -- invitation. Re-read the invitation under lock afterwards so a concurrent
  -- revoke/resend cannot be accepted from the unlocked snapshot.
  select client.* into v_client
  from public.clients client
  where client.organization_id = v_invitation.organization_id
    and client.id = v_invitation.client_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'FE_CLIENT_NOT_FOUND';
  end if;

  select invitation.* into v_invitation
  from public.client_invitations invitation
  where invitation.id = v_invitation_id
    and invitation.organization_id = v_client.organization_id
    and invitation.client_id = v_client.id
    and invitation.token_hash = p_token_hash
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'FE_INVITATION_NOT_FOUND';
  end if;

  if v_invitation.status = 'ACCEPTED' and v_invitation.accepted_by = v_user_id then
    select membership.* into strict v_membership
      from public.organization_memberships membership
      where membership.organization_id = v_invitation.organization_id and membership.user_id = v_user_id;
    select assignment.* into strict v_assignment
      from public.coach_client_assignments assignment
      where assignment.organization_id = v_client.organization_id
        and assignment.client_id = v_client.id
        and assignment.is_primary;
    return jsonb_build_object(
      'clientId', v_client.id,
      'organizationId', v_invitation.organization_id,
      'membershipId', v_membership.id,
      'assignmentId', v_assignment.id,
      'status', 'ACTIVE'
    );
  end if;

  if v_invitation.status <> 'SENT' then
    raise exception using errcode = 'P0001', message = 'FE_INVITATION_NOT_PENDING';
  end if;
  if v_invitation.expires_at <= now() then
    raise exception using errcode = 'P0001', message = 'FE_INVITATION_EXPIRED';
  end if;
  if v_verified_email is null or v_verified_email <> v_invitation.email then
    raise exception using errcode = 'P0001', message = 'FE_INVITATION_EMAIL_MISMATCH';
  end if;

  if v_client.auth_user_id is not null and v_client.auth_user_id <> v_user_id then
    raise exception using errcode = 'P0001', message = 'FE_CLIENT_ALREADY_ACTIVATED';
  end if;

  if exists (
    select 1
    from public.organization_memberships existing_membership
    where existing_membership.user_id = v_user_id
      and existing_membership.status = 'ACTIVE'
      and (
        existing_membership.organization_id <> v_invitation.organization_id
        or existing_membership.role <> 'CLIENT'
      )
  ) then
    raise exception using errcode = 'P0001', message = 'FE_ROLE_CONFLICT';
  end if;

  select membership.* into v_membership
  from public.organization_memberships membership
  where membership.organization_id = v_invitation.organization_id
    and membership.user_id = v_user_id
  for update;

  if found and v_membership.role <> 'CLIENT' then
    raise exception using errcode = 'P0001', message = 'FE_ROLE_CONFLICT';
  elsif found then
    update public.organization_memberships
      set status = 'ACTIVE', activated_at = coalesce(activated_at, now())
      where id = v_membership.id returning * into v_membership;
  else
    insert into public.organization_memberships (
      organization_id, user_id, role, status, activated_at, created_by
    ) values (
      v_invitation.organization_id, v_user_id, 'CLIENT', 'ACTIVE', now(), v_user_id
    ) returning * into v_membership;
  end if;

  insert into public.profiles (auth_user_id, display_name, locale, time_zone, status, created_by)
  values (
    v_user_id,
    concat_ws(' ', v_client.first_name, v_client.last_name),
    v_client.locale,
    v_client.time_zone,
    'ACTIVE',
    v_user_id
  ) on conflict (auth_user_id) do nothing;

  update public.clients
    set auth_user_id = v_user_id, status = 'ACTIVE'
    where organization_id = v_client.organization_id
      and id = v_client.id
    returning * into v_client;

  update public.coach_client_assignments
    set status = 'ACTIVE', starts_at = coalesce(starts_at, now())
    where organization_id = v_client.organization_id
      and client_id = v_client.id
      and is_primary
      and status = 'PENDING'
    returning * into v_assignment;
  if not found then
    raise exception using errcode = 'P0001', message = 'FE_ASSIGNMENT_NOT_PENDING';
  end if;

  update public.client_invitations
    set status = 'ACCEPTED', accepted_at = now(), accepted_by = v_user_id
    where organization_id = v_client.organization_id
      and client_id = v_client.id
      and id = v_invitation.id;

  insert into public.audit_events (
    organization_id, actor_user_id, actor_role, command, entity_type, entity_id,
    entity_version, result, correlation_id, context
  ) values (
    v_invitation.organization_id, v_user_id, 'CLIENT', 'AcceptClientInvitation',
    'client', v_client.id, v_client.row_version, 'SUCCEEDED', v_invitation.id,
    jsonb_build_object('invitationId', v_invitation.id, 'assignmentId', v_assignment.id)
  );

  insert into public.outbox_events (
    organization_id, event_type, aggregate_type, aggregate_id, actor_user_id, payload
  ) values (
    v_invitation.organization_id, 'ClientActivated', 'client', v_client.id, v_user_id,
    jsonb_build_object('clientId', v_client.id, 'assignmentId', v_assignment.id)
  );

  return jsonb_build_object(
    'clientId', v_client.id,
    'organizationId', v_invitation.organization_id,
    'membershipId', v_membership.id,
    'assignmentId', v_assignment.id,
    'status', 'ACTIVE'
  );
end;
$$;

-- The delivery worker may legitimately see the Auth user it created on a
-- previous retry. It may not deliver an invitation to an identity already
-- bound to a profile, active membership, or another Client aggregate.
create or replace function public.assert_m1_invitation_identity_safe(
  p_invitation_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invitation public.client_invitations%rowtype;
  v_auth_user_id uuid;
begin
  select invitation.* into v_invitation
  from public.client_invitations invitation
  where invitation.id = p_invitation_id
    and invitation.status in ('PENDING', 'SENT');
  if not found then
    raise exception using errcode = 'P0001', message = 'FE_INVITATION_NOT_FOUND';
  end if;

  select auth_user.id into v_auth_user_id
  from auth.users auth_user
  where lower(auth_user.email) = v_invitation.email;
  if not found then
    return;
  end if;

  if exists (
       select 1 from public.profiles profile
       where profile.auth_user_id = v_auth_user_id
     )
     or exists (
       select 1 from public.organization_memberships membership
       where membership.user_id = v_auth_user_id
         and membership.status = 'ACTIVE'
     )
     or exists (
       select 1 from public.clients client
       where client.auth_user_id = v_auth_user_id
         and client.id <> v_invitation.client_id
     ) then
    raise exception using errcode = 'P0001', message = 'FE_EMAIL_IDENTITY_CONFLICT';
  end if;
end;
$$;

create or replace function public.resend_client_invitation(
  p_client_id uuid,
  p_token_hash text,
  p_expires_at timestamptz,
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
  v_invitation public.client_invitations%rowtype;
  v_request_fingerprint text;
begin
  if v_actor_id is null then
    raise exception using errcode = 'P0001', message = 'FE_UNAUTHENTICATED';
  end if;
  if coalesce(auth.jwt() ->> 'aal', 'aal1') <> 'aal2' then
    raise exception using errcode = 'P0001', message = 'FE_MFA_AAL2_REQUIRED';
  end if;
  if p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = 'P0001', message = 'FE_INVALID_INVITATION_HASH';
  end if;
  if p_expires_at <= now() or p_expires_at > now() + interval '7 days' then
    raise exception using errcode = 'P0001', message = 'FE_INVALID_EXPIRY';
  end if;

  select client.* into v_client
  from public.clients client
  where client.id = p_client_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'FE_CLIENT_NOT_FOUND';
  end if;

  select membership.role into v_actor_role
  from public.organization_memberships membership
  where membership.organization_id = v_client.organization_id
    and membership.user_id = v_actor_id
    and membership.status = 'ACTIVE';
  if v_actor_role is null or v_actor_role not in ('ADMIN', 'COACH') then
    raise exception using errcode = 'P0001', message = 'FE_FORBIDDEN';
  end if;
  if v_actor_role = 'COACH' and not exists (
    select 1 from public.coach_client_assignments assignment
    where assignment.organization_id = v_client.organization_id
      and assignment.client_id = v_client.id
      and assignment.coach_user_id = v_actor_id
      and assignment.status in ('PENDING', 'ACTIVE', 'PAUSED')
  ) then
    raise exception using errcode = 'P0001', message = 'FE_FORBIDDEN';
  end if;
  v_request_fingerprint := encode(
    extensions.digest(
      convert_to(
        jsonb_build_object('operation', 'resend', 'clientId', v_client.id)::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      concat_ws(':', v_client.organization_id::text, v_actor_id::text, p_idempotency_key::text),
      0
    )
  );

  select invitation.* into v_invitation
  from public.client_invitations invitation
  where invitation.organization_id = v_client.organization_id
    and invitation.created_by = v_actor_id
    and invitation.idempotency_key = p_idempotency_key;
  if found then
    if v_invitation.request_fingerprint <> v_request_fingerprint then
      raise exception using errcode = 'P0001', message = 'FE_IDEMPOTENCY_CONFLICT';
    end if;
    return jsonb_build_object(
      'invitationId', v_invitation.id,
      'expiresAt', v_invitation.expires_at,
      'status', v_invitation.status
    );
  end if;

  -- An exact network retry must replay even when this invitation has activated
  -- the Client since the original command committed.
  if v_client.status <> 'INVITED' or v_client.auth_user_id is not null then
    raise exception using errcode = 'P0001', message = 'FE_CLIENT_ALREADY_ACTIVATED';
  end if;

  update public.client_invitations
    set status = 'REVOKED'
    where organization_id = v_client.organization_id
      and client_id = v_client.id
      and status in ('PENDING', 'SENT');

  insert into public.client_invitations (
    organization_id, client_id, email, token_hash, expires_at, status,
    idempotency_key, request_fingerprint, created_by
  ) values (
    v_client.organization_id, v_client.id, v_client.email, p_token_hash,
    p_expires_at, 'PENDING', p_idempotency_key, v_request_fingerprint, v_actor_id
  ) returning * into v_invitation;

  insert into public.audit_events (
    organization_id, actor_user_id, actor_role, command, entity_type, entity_id,
    entity_version, result, correlation_id, context
  ) values (
    v_client.organization_id, v_actor_id, v_actor_role, 'ResendClientInvitation',
    'client_invitation', v_invitation.id, v_invitation.row_version, 'SUCCEEDED',
    p_idempotency_key, jsonb_build_object('clientId', v_client.id)
  );

  insert into public.outbox_events (
    organization_id, event_type, aggregate_type, aggregate_id, actor_user_id, payload
  ) values (
    v_client.organization_id, 'ClientInvitationResent', 'client', v_client.id,
    v_actor_id, jsonb_build_object('clientId', v_client.id, 'invitationId', v_invitation.id)
  );

  return jsonb_build_object(
    'invitationId', v_invitation.id,
    'expiresAt', v_invitation.expires_at,
    'status', v_invitation.status
  );
exception
  when unique_violation then
    raise exception using errcode = 'P0001', message = 'FE_DUPLICATE';
end;
$$;

create or replace function public.revoke_client_invitation(
  p_invitation_id uuid,
  p_reason text,
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
  v_invitation public.client_invitations%rowtype;
  v_existing_audit public.audit_events%rowtype;
  v_reason text := nullif(btrim(p_reason), '');
  v_request_fingerprint text;
begin
  if v_actor_id is null then
    raise exception using errcode = 'P0001', message = 'FE_UNAUTHENTICATED';
  end if;
  if coalesce(auth.jwt() ->> 'aal', 'aal1') <> 'aal2' then
    raise exception using errcode = 'P0001', message = 'FE_MFA_AAL2_REQUIRED';
  end if;
  if v_reason is null or char_length(v_reason) > 500 then
    raise exception using errcode = 'P0001', message = 'FE_INVALID_REASON';
  end if;

  select invitation.* into v_invitation
  from public.client_invitations invitation
  where invitation.id = p_invitation_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'FE_INVITATION_NOT_FOUND';
  end if;

  select client.* into v_client
  from public.clients client
  where client.organization_id = v_invitation.organization_id
    and client.id = v_invitation.client_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'FE_CLIENT_NOT_FOUND';
  end if;

  select invitation.* into v_invitation
  from public.client_invitations invitation
  where invitation.id = p_invitation_id
    and invitation.organization_id = v_client.organization_id
    and invitation.client_id = v_client.id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'FE_INVITATION_NOT_FOUND';
  end if;

  select membership.role into v_actor_role
  from public.organization_memberships membership
  where membership.organization_id = v_invitation.organization_id
    and membership.user_id = v_actor_id
    and membership.status = 'ACTIVE';
  if v_actor_role is null or v_actor_role not in ('ADMIN', 'COACH') then
    raise exception using errcode = 'P0001', message = 'FE_FORBIDDEN';
  end if;
  if v_actor_role = 'COACH' and not exists (
    select 1 from public.coach_client_assignments assignment
    where assignment.organization_id = v_invitation.organization_id
      and assignment.client_id = v_invitation.client_id
      and assignment.coach_user_id = v_actor_id
      and assignment.status in ('PENDING', 'ACTIVE', 'PAUSED')
  ) then
    raise exception using errcode = 'P0001', message = 'FE_FORBIDDEN';
  end if;

  v_request_fingerprint := encode(
    extensions.digest(
      convert_to(
        jsonb_build_object(
          'operation', 'revoke',
          'invitationId', v_invitation.id,
          'reason', v_reason
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      concat_ws(':', v_invitation.organization_id::text, v_actor_id::text, p_idempotency_key::text),
      0
    )
  );

  select audit.* into v_existing_audit
  from public.audit_events audit
  where audit.organization_id = v_invitation.organization_id
    and audit.actor_user_id = v_actor_id
    and audit.command = 'RevokeClientInvitation'
    and audit.correlation_id = p_idempotency_key;
  if found then
    if v_existing_audit.context ->> 'requestFingerprint' <> v_request_fingerprint then
      raise exception using errcode = 'P0001', message = 'FE_IDEMPOTENCY_CONFLICT';
    end if;
    return jsonb_build_object('invitationId', p_invitation_id, 'status', 'REVOKED');
  end if;

  if v_invitation.status = 'ACCEPTED' then
    raise exception using errcode = 'P0001', message = 'FE_INVITATION_ALREADY_ACCEPTED';
  end if;
  if v_invitation.status not in ('PENDING', 'SENT', 'REVOKED') then
    raise exception using errcode = 'P0001', message = 'FE_INVITATION_NOT_REVOCABLE';
  end if;

  if v_invitation.status in ('PENDING', 'SENT') then
    update public.client_invitations
      set status = 'REVOKED'
      where id = v_invitation.id
      returning * into v_invitation;
  end if;

  insert into public.audit_events (
    organization_id, actor_user_id, actor_role, command, entity_type, entity_id,
    entity_version, result, reason, correlation_id, context
  ) values (
    v_invitation.organization_id, v_actor_id, v_actor_role, 'RevokeClientInvitation',
    'client_invitation', v_invitation.id, v_invitation.row_version, 'SUCCEEDED',
    v_reason, p_idempotency_key,
    jsonb_build_object(
      'clientId', v_invitation.client_id,
      'requestFingerprint', v_request_fingerprint
    )
  );

  insert into public.outbox_events (
    organization_id, event_type, aggregate_type, aggregate_id, actor_user_id, payload
  ) values (
    v_invitation.organization_id, 'ClientInvitationRevoked', 'client',
    v_invitation.client_id, v_actor_id,
    jsonb_build_object('clientId', v_invitation.client_id, 'invitationId', v_invitation.id)
  );

  return jsonb_build_object('invitationId', v_invitation.id, 'status', 'REVOKED');
end;
$$;

create or replace function public.revoke_client_invitation_for_client(
  p_client_id uuid,
  p_reason text,
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
  v_invitation public.client_invitations%rowtype;
  v_existing_audit public.audit_events%rowtype;
  v_reason text := nullif(btrim(p_reason), '');
  v_request_fingerprint text;
begin
  if v_actor_id is null then
    raise exception using errcode = 'P0001', message = 'FE_UNAUTHENTICATED';
  end if;
  if coalesce(auth.jwt() ->> 'aal', 'aal1') <> 'aal2' then
    raise exception using errcode = 'P0001', message = 'FE_MFA_AAL2_REQUIRED';
  end if;
  if v_reason is null or char_length(v_reason) > 500 then
    raise exception using errcode = 'P0001', message = 'FE_INVALID_REASON';
  end if;

  select client.* into v_client
  from public.clients client
  where client.id = p_client_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'FE_CLIENT_NOT_FOUND';
  end if;

  select membership.role into v_actor_role
  from public.organization_memberships membership
  where membership.organization_id = v_client.organization_id
    and membership.user_id = v_actor_id
    and membership.status = 'ACTIVE';
  if v_actor_role is null or v_actor_role not in ('ADMIN', 'COACH') then
    raise exception using errcode = 'P0001', message = 'FE_FORBIDDEN';
  end if;
  if v_actor_role = 'COACH' and not exists (
    select 1 from public.coach_client_assignments assignment
    where assignment.organization_id = v_client.organization_id
      and assignment.client_id = v_client.id
      and assignment.coach_user_id = v_actor_id
      and assignment.status in ('PENDING', 'ACTIVE', 'PAUSED')
  ) then
    raise exception using errcode = 'P0001', message = 'FE_FORBIDDEN';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      concat_ws(':', v_client.organization_id::text, v_actor_id::text, p_idempotency_key::text),
      0
    )
  );

  select audit.* into v_existing_audit
  from public.audit_events audit
  where audit.organization_id = v_client.organization_id
    and audit.actor_user_id = v_actor_id
    and audit.command = 'RevokeClientInvitation'
    and audit.correlation_id = p_idempotency_key;
  if found then
    v_request_fingerprint := encode(
      extensions.digest(
        convert_to(
          jsonb_build_object(
            'operation', 'revoke',
            'invitationId', v_existing_audit.entity_id,
            'reason', v_reason
          )::text,
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    );
    if v_existing_audit.entity_type <> 'client_invitation'
       or v_existing_audit.context ->> 'clientId' is distinct from v_client.id::text
       or v_existing_audit.context ->> 'requestFingerprint' is distinct from v_request_fingerprint then
      raise exception using errcode = 'P0001', message = 'FE_IDEMPOTENCY_CONFLICT';
    end if;
    return jsonb_build_object(
      'invitationId', v_existing_audit.entity_id,
      'status', 'REVOKED'
    );
  end if;

  select invitation.* into v_invitation
  from public.client_invitations invitation
  where invitation.organization_id = v_client.organization_id
    and invitation.client_id = v_client.id
    and invitation.status in ('PENDING', 'SENT')
  order by invitation.created_at desc
  limit 1
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'FE_INVITATION_NOT_FOUND';
  end if;

  return public.revoke_client_invitation(
    v_invitation.id,
    v_reason,
    p_idempotency_key
  );
end;
$$;

create or replace function public.claim_outbox_events(
  p_limit integer,
  p_worker_id uuid
)
returns setof public.outbox_events
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_worker_id is null then
    raise exception using errcode = 'P0001', message = 'FE_WORKER_ID_REQUIRED';
  end if;

  return query
  with candidates as (
    select event.id
    from public.outbox_events event
    where (
      event.status in ('PENDING', 'FAILED') and event.next_attempt_at <= now()
    ) or (
      event.status = 'PROCESSING' and event.locked_at < now() - interval '15 minutes'
    )
    order by event.created_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 25), 100))
  )
  update public.outbox_events event
    set status = 'PROCESSING',
        locked_at = now(),
        locked_by = p_worker_id,
        attempts = event.attempts + 1
  from candidates
  where event.id = candidates.id
  returning event.*;
end;
$$;

create or replace function public.record_m1_auth_event(
  p_command text,
  p_context jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_membership public.organization_memberships%rowtype;
  v_event_id uuid;
begin
  if v_actor_id is null then
    raise exception using errcode = 'P0001', message = 'FE_UNAUTHENTICATED';
  end if;
  if p_command not in ('CoachSignedIn', 'CoachMfaVerified') then
    raise exception using errcode = 'P0001', message = 'FE_INVALID_AUDIT_COMMAND';
  end if;
  if p_command = 'CoachMfaVerified'
     and coalesce(auth.jwt() ->> 'aal', 'aal1') <> 'aal2' then
    raise exception using errcode = 'P0001', message = 'FE_MFA_AAL2_REQUIRED';
  end if;
  if jsonb_typeof(coalesce(p_context, '{}'::jsonb)) <> 'object' then
    raise exception using errcode = 'P0001', message = 'FE_INVALID_AUDIT_CONTEXT';
  end if;

  select membership.* into v_membership
  from public.organization_memberships membership
  where membership.user_id = v_actor_id
    and membership.status = 'ACTIVE'
    and membership.role in ('ADMIN', 'COACH');
  if not found then
    raise exception using errcode = 'P0001', message = 'FE_FORBIDDEN';
  end if;

  insert into public.audit_events (
    organization_id, actor_user_id, actor_role, command, entity_type,
    entity_id, result, context
  ) values (
    v_membership.organization_id, v_actor_id, v_membership.role, p_command,
    'auth_session', v_actor_id, 'SUCCEEDED', coalesce(p_context, '{}'::jsonb)
  ) returning id into v_event_id;
  return v_event_id;
end;
$$;

create or replace function public.complete_outbox_event(
  p_event_id uuid,
  p_worker_id uuid
)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with completed as (
    update public.outbox_events event
      set status = 'PROCESSED', processed_at = now(), locked_at = null,
          locked_by = null, last_error = null
      where event.id = p_event_id
        and event.status = 'PROCESSING'
        and event.locked_by = p_worker_id
      returning 1
  )
  select exists (select 1 from completed);
$$;

create or replace function public.fail_outbox_event(
  p_event_id uuid,
  p_worker_id uuid,
  p_error text,
  p_retry_at timestamptz,
  p_terminal boolean default false
)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with failed as (
    update public.outbox_events event
      set status = 'FAILED',
          next_attempt_at = case
            when p_terminal then '9999-12-31 23:59:59.999+00'::timestamptz
            else greatest(coalesce(p_retry_at, now()), now())
          end,
          locked_at = null,
          locked_by = null,
          last_error = left(coalesce(p_error, 'Unknown outbox error'), 1000)
      where event.id = p_event_id
        and event.status = 'PROCESSING'
        and event.locked_by = p_worker_id
      returning 1
  )
  select exists (select 1 from failed);
$$;

revoke all on function public.create_invited_client(uuid, text, text, text, text, text, text, timestamptz, uuid, uuid) from public, anon;
revoke all on function public.accept_client_invitation(text, uuid) from public, anon, authenticated;
revoke all on function public.assert_m1_invitation_identity_safe(uuid) from public, anon, authenticated;
revoke all on function public.resend_client_invitation(uuid, text, timestamptz, uuid) from public, anon;
revoke all on function public.revoke_client_invitation(uuid, text, uuid) from public, anon;
revoke all on function public.revoke_client_invitation_for_client(uuid, text, uuid) from public, anon;
revoke all on function public.claim_outbox_events(integer, uuid) from public, anon, authenticated;
revoke all on function public.complete_outbox_event(uuid, uuid) from public, anon, authenticated;
revoke all on function public.fail_outbox_event(uuid, uuid, text, timestamptz, boolean) from public, anon, authenticated;
revoke all on function public.record_m1_auth_event(text, jsonb) from public, anon, authenticated;
grant execute on function public.create_invited_client(uuid, text, text, text, text, text, text, timestamptz, uuid, uuid) to authenticated;
grant execute on function public.accept_client_invitation(text, uuid) to service_role;
grant execute on function public.assert_m1_invitation_identity_safe(uuid) to service_role;
grant execute on function public.resend_client_invitation(uuid, text, timestamptz, uuid) to authenticated;
grant execute on function public.revoke_client_invitation(uuid, text, uuid) to authenticated;
grant execute on function public.revoke_client_invitation_for_client(uuid, text, uuid) to authenticated;
grant execute on function public.claim_outbox_events(integer, uuid) to service_role;
grant execute on function public.complete_outbox_event(uuid, uuid) to service_role;
grant execute on function public.fail_outbox_event(uuid, uuid, text, timestamptz, boolean) to service_role;

commit;
