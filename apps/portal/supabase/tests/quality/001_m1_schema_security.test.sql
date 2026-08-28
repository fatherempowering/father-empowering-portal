begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

select has_table('public', 'organizations', 'M1 owns organizations');
select has_table('public', 'profiles', 'M1 owns profiles');
select has_table('public', 'organization_memberships', 'M1 owns memberships');
select has_table('public', 'clients', 'M1 owns clients');
select has_table('public', 'coach_client_assignments', 'M1 owns assignments');
select has_table('public', 'client_invitations', 'M1 owns invitations');
select has_table('public', 'audit_events', 'M1 owns audit events');
select has_table('public', 'outbox_events', 'M1 owns the transactional outbox');

select ok(
  (select relrowsecurity from pg_catalog.pg_class
   where oid = 'public.organizations'::regclass),
  'organizations has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_catalog.pg_class
   where oid = 'public.profiles'::regclass),
  'profiles has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_catalog.pg_class
   where oid = 'public.organization_memberships'::regclass),
  'organization_memberships has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_catalog.pg_class
   where oid = 'public.clients'::regclass),
  'clients has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_catalog.pg_class
   where oid = 'public.coach_client_assignments'::regclass),
  'coach_client_assignments has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_catalog.pg_class
   where oid = 'public.client_invitations'::regclass),
  'client_invitations has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_catalog.pg_class
   where oid = 'public.audit_events'::regclass),
  'audit_events has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_catalog.pg_class
   where oid = 'public.outbox_events'::regclass),
  'outbox_events has RLS enabled'
);

select has_column(
  'public',
  'client_invitations',
  'token_hash',
  'client invitations persist a digest'
);
select has_check(
  'public',
  'audit_events',
  'audit_context_m1_safe_size',
  'audit context has a strict size ceiling'
);
select has_check(
  'public',
  'audit_events',
  'audit_context_m1_no_secret_keys',
  'audit context rejects known secret-bearing keys'
);
select ok(
  exists (
    select 1
    from pg_catalog.pg_indexes
    where schemaname = 'public'
      and tablename = 'audit_events'
      and indexname = 'audit_client_invitation_viewed_once_idx'
  ),
  'invitation view audit is deduplicated in PostgreSQL'
);

select is(
  (
    select count(*)
    from information_schema.columns
    where table_schema in ('public', 'app_private')
      and lower(column_name) in (
        'token',
        'raw_token',
        'invitation_token',
        'opaque_token',
        'otp'
      )
  ),
  0::bigint,
  'no M1 table exposes a raw invitation token or OTP column'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.create_invited_client(uuid,text,text,text,text,text,text,timestamptz,uuid,uuid)',
    'EXECUTE'
  ),
  'anonymous cannot execute create_invited_client'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.create_invited_client(uuid,text,text,text,text,text,text,timestamptz,uuid,uuid)',
    'EXECUTE'
  ),
  'authenticated can invoke create_invited_client and reach its internal authorization'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.accept_client_invitation(text)',
    'EXECUTE'
  ),
  'anonymous cannot execute accept_client_invitation'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.accept_client_invitation(text)',
    'EXECUTE'
  ),
  'authenticated can invoke accept_client_invitation'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.revoke_client_invitation_for_client(uuid,text,uuid)',
    'EXECUTE'
  ),
  'anonymous cannot revoke a client invitation'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.revoke_client_invitation_for_client(uuid,text,uuid)',
    'EXECUTE'
  ),
  'authenticated staff can invoke the guarded client revocation command'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.claim_outbox_events(integer,uuid)',
    'EXECUTE'
  ),
  'authenticated sessions cannot claim the outbox'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.claim_outbox_events(integer,uuid)',
    'EXECUTE'
  ),
  'only the trusted service worker can claim the outbox'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.record_m1_auth_event(text,jsonb)',
    'EXECUTE'
  ),
  'anonymous cannot invoke M1 auth audit recording'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.record_m1_auth_event(text,jsonb)',
    'EXECUTE'
  ),
  'authenticated sessions cannot forge staff authentication audits'
);

select ok(
  not has_table_privilege('anon', 'public.clients', 'SELECT'),
  'anonymous has no direct client read grant'
);
select ok(
  not has_table_privilege('authenticated', 'public.clients', 'INSERT'),
  'authenticated browser sessions cannot insert clients directly'
);
select ok(
  not has_table_privilege('authenticated', 'public.clients', 'UPDATE'),
  'authenticated browser sessions cannot update clients directly'
);
select ok(
  not has_table_privilege('authenticated', 'public.client_invitations', 'INSERT'),
  'authenticated browser sessions cannot insert invitations directly'
);
select ok(
  not has_table_privilege('authenticated', 'public.audit_events', 'INSERT'),
  'authenticated browser sessions cannot forge audits directly'
);
select ok(
  not has_table_privilege('authenticated', 'public.outbox_events', 'SELECT'),
  'authenticated browser sessions cannot read the outbox'
);
select ok(
  not has_column_privilege(
    'authenticated',
    'public.client_invitations',
    'token_hash',
    'SELECT'
  ),
  'authenticated staff cannot read invitation token digests'
);
select ok(
  has_column_privilege(
    'authenticated',
    'public.client_invitations',
    'status',
    'SELECT'
  ),
  'authenticated staff retains invitation presentation access through RLS'
);
select ok(
  not has_schema_privilege('anon', 'app_private', 'USAGE'),
  'anonymous has no access to app_private'
);

select * from finish();
rollback;
