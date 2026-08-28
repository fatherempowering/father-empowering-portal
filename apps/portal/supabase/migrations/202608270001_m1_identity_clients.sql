begin;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create type public.app_role as enum ('ADMIN', 'COACH', 'CLIENT');
create type public.account_status as enum ('INVITED', 'ACTIVE', 'SUSPENDED', 'ARCHIVED');
create type public.assignment_status as enum ('PENDING', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED');
create type public.invitation_status as enum ('PENDING', 'SENT', 'ACCEPTED', 'EXPIRED', 'REVOKED');
create type public.outbox_status as enum ('PENDING', 'PROCESSING', 'PROCESSED', 'FAILED');

create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated;

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  locale text not null default 'fr-CA' check (locale in ('fr-CA', 'en-CA')),
  default_time_zone text not null default 'America/Montreal' check (char_length(default_time_zone) between 1 and 100),
  status account_status not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete restrict,
  updated_at timestamptz not null default now(),
  row_version bigint not null default 1,
  archived_at timestamptz
);

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete restrict,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 160),
  locale text not null default 'fr-CA' check (locale in ('fr-CA', 'en-CA')),
  time_zone text not null default 'America/Montreal' check (char_length(time_zone) between 1 and 100),
  status account_status not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete restrict,
  updated_at timestamptz not null default now(),
  row_version bigint not null default 1,
  archived_at timestamptz
);

create table public.organization_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  role app_role not null,
  status account_status not null default 'ACTIVE',
  activated_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete restrict,
  updated_at timestamptz not null default now(),
  row_version bigint not null default 1,
  archived_at timestamptz,
  unique (organization_id, user_id)
);

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  auth_user_id uuid unique references auth.users(id) on delete restrict,
  email text not null check (email = lower(btrim(email)) and char_length(email) between 3 and 320),
  first_name text not null check (char_length(btrim(first_name)) between 1 and 120),
  last_name text not null check (char_length(btrim(last_name)) between 1 and 120),
  locale text not null default 'fr-CA' check (locale in ('fr-CA', 'en-CA')),
  time_zone text not null default 'America/Montreal' check (char_length(time_zone) between 1 and 100),
  status account_status not null default 'INVITED',
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_at timestamptz not null default now(),
  row_version bigint not null default 1,
  archived_at timestamptz,
  unique (organization_id, id)
);
create unique index clients_organization_email_unique on public.clients (organization_id, lower(email));

create table public.coach_client_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  coach_user_id uuid not null references auth.users(id) on delete restrict,
  client_id uuid not null,
  status assignment_status not null default 'PENDING',
  is_primary boolean not null default true,
  starts_at timestamptz,
  paused_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_at timestamptz not null default now(),
  row_version bigint not null default 1,
  archived_at timestamptz,
  constraint coach_client_assignments_organization_client_fkey
    foreign key (organization_id, client_id)
    references public.clients (organization_id, id) on delete restrict,
  unique (organization_id, coach_user_id, client_id)
);
create unique index coach_client_one_primary_idx
  on public.coach_client_assignments (organization_id, client_id)
  where is_primary and status in ('PENDING', 'ACTIVE', 'PAUSED');

create table public.client_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  client_id uuid not null,
  email text not null check (email = lower(btrim(email)) and char_length(email) between 3 and 320),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  status invitation_status not null default 'PENDING',
  sent_at timestamptz,
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id) on delete restrict,
  idempotency_key uuid not null,
  request_fingerprint text not null check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_at timestamptz not null default now(),
  row_version bigint not null default 1,
  archived_at timestamptz,
  constraint client_invitations_organization_client_fkey
    foreign key (organization_id, client_id)
    references public.clients (organization_id, id) on delete restrict,
  unique (organization_id, created_by, idempotency_key)
);
comment on column public.client_invitations.token_hash is 'SHA-256 lowercase hex digest only. Raw invitation tokens must never be persisted.';

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  actor_user_id uuid references auth.users(id) on delete restrict,
  actor_role app_role,
  command text not null check (char_length(command) between 1 and 120),
  entity_type text not null check (char_length(entity_type) between 1 and 80),
  entity_id uuid,
  entity_version bigint,
  result text not null check (result in ('SUCCEEDED', 'REJECTED', 'FAILED')),
  reason text check (reason is null or char_length(reason) <= 500),
  correlation_id uuid not null default gen_random_uuid(),
  context jsonb not null default '{}'::jsonb check (jsonb_typeof(context) = 'object'),
  created_at timestamptz not null default now()
);
create unique index audit_idempotent_command_idx
  on public.audit_events (organization_id, actor_user_id, command, correlation_id)
  where actor_user_id is not null;

create table public.outbox_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  event_type text not null check (char_length(event_type) between 1 and 120),
  schema_version smallint not null default 1 check (schema_version > 0),
  aggregate_type text not null check (char_length(aggregate_type) between 1 and 80),
  aggregate_id uuid not null,
  actor_user_id uuid references auth.users(id) on delete restrict,
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  status outbox_status not null default 'PENDING',
  attempts smallint not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by uuid,
  processed_at timestamptz,
  last_error text check (last_error is null or char_length(last_error) <= 1000),
  created_at timestamptz not null default now()
);
create index outbox_pending_idx on public.outbox_events (next_attempt_at, created_at)
  where status in ('PENDING', 'FAILED');

create or replace function app_private.touch_versioned_row()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.row_version := old.row_version + 1;
  return new;
end;
$$;

create trigger organizations_touch before update on public.organizations
for each row execute function app_private.touch_versioned_row();
create trigger profiles_touch before update on public.profiles
for each row execute function app_private.touch_versioned_row();
create trigger memberships_touch before update on public.organization_memberships
for each row execute function app_private.touch_versioned_row();
create trigger clients_touch before update on public.clients
for each row execute function app_private.touch_versioned_row();
create trigger assignments_touch before update on public.coach_client_assignments
for each row execute function app_private.touch_versioned_row();
create trigger invitations_touch before update on public.client_invitations
for each row execute function app_private.touch_versioned_row();

commit;
