begin;

create extension if not exists pgtap with schema extensions;
select plan(34);

select has_table('public', 'organizations', 'organizations exists');
select has_table('public', 'profiles', 'profiles exists');
select has_table('public', 'organization_memberships', 'organization_memberships exists');
select has_table('public', 'clients', 'clients exists');
select has_table('public', 'coach_client_assignments', 'coach_client_assignments exists');
select has_table('public', 'client_invitations', 'client_invitations exists');
select has_table('public', 'audit_events', 'audit_events exists');
select has_table('public', 'outbox_events', 'outbox_events exists');

select ok(relrowsecurity and relforcerowsecurity, 'organizations has forced RLS')
from pg_catalog.pg_class where oid = 'public.organizations'::regclass;
select ok(relrowsecurity and relforcerowsecurity, 'profiles has forced RLS')
from pg_catalog.pg_class where oid = 'public.profiles'::regclass;
select ok(relrowsecurity and relforcerowsecurity, 'organization_memberships has forced RLS')
from pg_catalog.pg_class where oid = 'public.organization_memberships'::regclass;
select ok(relrowsecurity and relforcerowsecurity, 'clients has forced RLS')
from pg_catalog.pg_class where oid = 'public.clients'::regclass;
select ok(relrowsecurity and relforcerowsecurity, 'coach_client_assignments has forced RLS')
from pg_catalog.pg_class where oid = 'public.coach_client_assignments'::regclass;
select ok(relrowsecurity and relforcerowsecurity, 'client_invitations has forced RLS')
from pg_catalog.pg_class where oid = 'public.client_invitations'::regclass;
select ok(relrowsecurity and relforcerowsecurity, 'audit_events has forced RLS')
from pg_catalog.pg_class where oid = 'public.audit_events'::regclass;
select ok(relrowsecurity and relforcerowsecurity, 'outbox_events has forced RLS')
from pg_catalog.pg_class where oid = 'public.outbox_events'::regclass;

select has_function(
  'public', 'create_invited_client',
  array['uuid', 'text', 'text', 'text', 'text', 'text', 'text', 'timestamp with time zone', 'uuid', 'uuid'],
  'create_invited_client exists'
);
select has_function('public', 'accept_client_invitation', array['text', 'uuid'], 'accept_client_invitation exists');
select has_function(
  'public', 'resend_client_invitation',
  array['uuid', 'text', 'timestamp with time zone', 'uuid'],
  'resend_client_invitation exists'
);
select has_function(
  'public', 'revoke_client_invitation', array['uuid', 'text', 'uuid'],
  'revoke_client_invitation exists'
);
select has_function(
  'public', 'revoke_client_invitation_for_client', array['uuid', 'text', 'uuid'],
  'revoke_client_invitation_for_client exists'
);

select ok(
  procedure.prosecdef and array_to_string(procedure.proconfig, ',') like '%search_path=%',
  'create_invited_client is security definer with fixed search_path'
) from pg_catalog.pg_proc procedure where procedure.oid =
  'public.create_invited_client(uuid,text,text,text,text,text,text,timestamptz,uuid,uuid)'::regprocedure;
select ok(
  procedure.prosecdef and array_to_string(procedure.proconfig, ',') like '%search_path=%',
  'accept_client_invitation is security definer with fixed search_path'
) from pg_catalog.pg_proc procedure where procedure.oid =
  'public.accept_client_invitation(text,uuid)'::regprocedure;
select ok(
  procedure.prosecdef and array_to_string(procedure.proconfig, ',') like '%search_path=%',
  'resend_client_invitation is security definer with fixed search_path'
) from pg_catalog.pg_proc procedure where procedure.oid =
  'public.resend_client_invitation(uuid,text,timestamptz,uuid)'::regprocedure;
select ok(
  procedure.prosecdef and array_to_string(procedure.proconfig, ',') like '%search_path=%',
  'revoke_client_invitation is security definer with fixed search_path'
) from pg_catalog.pg_proc procedure where procedure.oid =
  'public.revoke_client_invitation(uuid,text,uuid)'::regprocedure;
select ok(
  procedure.prosecdef and array_to_string(procedure.proconfig, ',') like '%search_path=%',
  'revoke_client_invitation_for_client is security definer with fixed search_path'
) from pg_catalog.pg_proc procedure where procedure.oid =
  'public.revoke_client_invitation_for_client(uuid,text,uuid)'::regprocedure;

select ok(
  not has_function_privilege('anon', 'public.create_invited_client(uuid,text,text,text,text,text,text,timestamptz,uuid,uuid)', 'EXECUTE'),
  'anon cannot create an invited client'
);
select ok(
  not has_function_privilege('anon', 'public.accept_client_invitation(text,uuid)', 'EXECUTE'),
  'anon cannot accept an invitation'
);
select ok(
  not has_function_privilege('authenticated', 'public.accept_client_invitation(text,uuid)', 'EXECUTE'),
  'authenticated browsers cannot bypass server-owned invitation acceptance'
);
select ok(
  has_function_privilege('service_role', 'public.accept_client_invitation(text,uuid)', 'EXECUTE'),
  'the trusted server can accept a verified invitation identity'
);
select ok(
  not has_function_privilege('anon', 'public.resend_client_invitation(uuid,text,timestamptz,uuid)', 'EXECUTE'),
  'anon cannot resend an invitation'
);
select ok(
  not has_function_privilege('anon', 'public.revoke_client_invitation(uuid,text,uuid)', 'EXECUTE'),
  'anon cannot revoke an invitation'
);
select ok(
  not has_function_privilege('anon', 'public.revoke_client_invitation_for_client(uuid,text,uuid)', 'EXECUTE'),
  'anon cannot revoke an invitation by client id'
);

select is(
  (select count(*)::bigint from pg_catalog.pg_policies where schemaname = 'public'),
  7::bigint,
  'only the seven explicit read policies exist'
);

select * from finish();
rollback;
