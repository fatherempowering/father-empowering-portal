begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

-- Fixed, synthetic identities. This transaction is rolled back by pgTAP.
insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  recovery_token,
  email_change,
  email_change_token_new
)
values
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'max@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'other.coach@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'admin@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'client.a@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'client.b@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-000000000006', 'authenticated', 'authenticated', 'cross.coach@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-000000000007', 'authenticated', 'authenticated', 'client.c@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');

insert into public.organizations (id, name, created_by)
values
  ('20000000-0000-4000-8000-000000000001', 'Father Empowering A', '10000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-000000000002', 'Father Empowering B', '10000000-0000-4000-8000-000000000006');

insert into public.organization_memberships (
  id,
  organization_id,
  user_id,
  role,
  status,
  activated_at,
  created_by
)
values
  ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'COACH', 'ACTIVE', now(), '10000000-0000-4000-8000-000000000001'),
  ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', 'COACH', 'ACTIVE', now(), '10000000-0000-4000-8000-000000000001'),
  ('30000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003', 'ADMIN', 'ACTIVE', now(), '10000000-0000-4000-8000-000000000003'),
  ('30000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000004', 'CLIENT', 'ACTIVE', now(), '10000000-0000-4000-8000-000000000004'),
  ('30000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000005', 'CLIENT', 'ACTIVE', now(), '10000000-0000-4000-8000-000000000005'),
  ('30000000-0000-4000-8000-000000000006', '20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000006', 'COACH', 'ACTIVE', now(), '10000000-0000-4000-8000-000000000006'),
  ('30000000-0000-4000-8000-000000000007', '20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000007', 'CLIENT', 'ACTIVE', now(), '10000000-0000-4000-8000-000000000007');

insert into public.clients (
  id,
  organization_id,
  auth_user_id,
  email,
  first_name,
  last_name,
  locale,
  time_zone,
  status,
  created_by
)
values
  ('40000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000004', 'client.a@example.test', 'Client', 'A', 'fr-CA', 'America/Montreal', 'ACTIVE', '10000000-0000-4000-8000-000000000001'),
  ('40000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000005', 'client.b@example.test', 'Client', 'B', 'fr-CA', 'America/Montreal', 'ACTIVE', '10000000-0000-4000-8000-000000000002'),
  ('40000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000007', 'client.c@example.test', 'Client', 'C', 'en-CA', 'America/Toronto', 'ACTIVE', '10000000-0000-4000-8000-000000000006');

insert into public.coach_client_assignments (
  id,
  organization_id,
  coach_user_id,
  client_id,
  status,
  is_primary,
  starts_at,
  created_by
)
values
  ('50000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 'ACTIVE', true, now(), '10000000-0000-4000-8000-000000000001'),
  ('50000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000002', 'ACTIVE', true, now(), '10000000-0000-4000-8000-000000000002'),
  ('50000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000006', '40000000-0000-4000-8000-000000000003', 'ACTIVE', true, now(), '10000000-0000-4000-8000-000000000006');

-- Tenant ownership is a database invariant, including for privileged writes
-- that bypass RLS. An organization A row cannot point at organization B's
-- Client even when both standalone UUID foreign keys would otherwise exist.
select throws_ok(
  $$insert into public.coach_client_assignments (
      id, organization_id, coach_user_id, client_id, status, is_primary, created_by
    ) values (
      '50000000-0000-4000-8000-000000000004',
      '20000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000003',
      'ACTIVE', false, '10000000-0000-4000-8000-000000000001'
    )$$,
  '23503',
  null,
  'assignment composite foreign key rejects a cross-organization Client'
);
select throws_ok(
  $$insert into public.client_invitations (
      id, organization_id, client_id, email, token_hash, expires_at,
      idempotency_key, request_fingerprint, created_by
    ) values (
      '70000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000003',
      'cross-tenant@example.test', repeat('e', 64), now() + interval '2 days',
      '60000000-0000-4000-8000-000000000010', repeat('f', 64),
      '10000000-0000-4000-8000-000000000001'
    )$$,
  '23503',
  null,
  'invitation composite foreign key rejects a cross-organization Client'
);

-- Client A sees only Client A, and receives no invitation or audit visibility.
set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000004';
set local "request.jwt.claims" = '{"sub":"10000000-0000-4000-8000-000000000004","role":"authenticated","email":"client.a@example.test","aal":"aal1"}';
select results_eq(
  $$select id from public.clients order by id$$,
  $$values ('40000000-0000-4000-8000-000000000001'::uuid)$$,
  'Client A reads only its own client row'
);
select is(
  (select count(*) from public.clients where id = '40000000-0000-4000-8000-000000000002'),
  0::bigint,
  'Client A cannot read Client B'
);
select is(
  (select count(*) from public.client_invitations),
  0::bigint,
  'Client A cannot read invitations'
);
select is(
  (select count(*) from public.audit_events),
  0::bigint,
  'Client A cannot read audit events'
);

-- Coach data access is denied at aal1, including direct PostgREST-style reads.
reset role;
set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000001';
set local "request.jwt.claims" = '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated","email":"max@example.test","aal":"aal1"}';
select is(
  (select count(*) from public.clients),
  0::bigint,
  'Max at aal1 cannot read assigned client data'
);
select throws_ok(
  $$select public.create_invited_client(
    '20000000-0000-4000-8000-000000000001',
    'aal1.denied@example.test',
    'Aal',
    'One',
    'fr-CA',
    'America/Montreal',
    repeat('a', 64),
    now() + interval '2 days',
    '60000000-0000-4000-8000-000000000001',
    null
  )$$,
  'P0001',
  'FE_MFA_AAL2_REQUIRED',
  'Coach mutations reject aal1'
);
select throws_ok(
  $$select public.revoke_client_invitation_for_client(
    '40000000-0000-4000-8000-000000000001',
    'Denied at aal1',
    '60000000-0000-4000-8000-000000000003'
  )$$,
  'P0001',
  'FE_MFA_AAL2_REQUIRED',
  'Coach revocation rejects aal1 before reading client state'
);

-- Max at aal2 sees only the assigned Client A.
set local "request.jwt.claims" = '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated","email":"max@example.test","aal":"aal2"}';
select results_eq(
  $$select id from public.clients order by id$$,
  $$values ('40000000-0000-4000-8000-000000000001'::uuid)$$,
  'Max at aal2 reads assigned Client A only'
);
select is(
  (select count(*) from public.clients where id = '40000000-0000-4000-8000-000000000002'),
  0::bigint,
  'Max cannot read unassigned Client B'
);

-- The second Coach sees only the client assigned to that Coach.
reset role;
set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000002';
set local "request.jwt.claims" = '{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated","email":"other.coach@example.test","aal":"aal2"}';
select results_eq(
  $$select id from public.clients order by id$$,
  $$values ('40000000-0000-4000-8000-000000000002'::uuid)$$,
  'another Coach reads assigned Client B only'
);
select throws_ok(
  $$select public.revoke_client_invitation_for_client(
    '40000000-0000-4000-8000-000000000001',
    'Not assigned',
    '60000000-0000-4000-8000-000000000004'
  )$$,
  'P0001',
  'FE_FORBIDDEN',
  'another Coach cannot revoke Max client invitation'
);
select throws_ok(
  $$select public.resend_client_invitation(
    '40000000-0000-4000-8000-000000000001',
    repeat('f', 64),
    now() + interval '2 days',
    '60000000-0000-4000-8000-000000000005'
  )$$,
  'P0001',
  'FE_FORBIDDEN',
  'another Coach cannot resend Max client invitation'
);

-- Admin sees the two clients in its organization, never the other organization.
reset role;
set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000003';
set local "request.jwt.claims" = '{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated","email":"admin@example.test","aal":"aal1"}';
select is(
  (select count(*) from public.clients),
  0::bigint,
  'Admin at aal1 cannot read organization client data'
);
select throws_ok(
  $$select public.create_invited_client(
    '20000000-0000-4000-8000-000000000001',
    'admin.aal1.denied@example.test',
    'Admin',
    'Aal One',
    'fr-CA',
    'America/Montreal',
    repeat('b', 64),
    now() + interval '2 days',
    '60000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001'
  )$$,
  'P0001',
  'FE_MFA_AAL2_REQUIRED',
  'Admin mutations reject aal1'
);
set local "request.jwt.claims" = '{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated","email":"admin@example.test","aal":"aal2"}';
select results_eq(
  $$select id from public.clients order by id$$,
  $$values
      ('40000000-0000-4000-8000-000000000001'::uuid),
      ('40000000-0000-4000-8000-000000000002'::uuid)$$,
  'Admin reads all clients in its organization'
);
select is(
  (select count(*) from public.clients where id = '40000000-0000-4000-8000-000000000003'),
  0::bigint,
  'Admin cannot cross organization boundaries'
);

-- The other organization remains isolated.
reset role;
set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000006';
set local "request.jwt.claims" = '{"sub":"10000000-0000-4000-8000-000000000006","role":"authenticated","email":"cross.coach@example.test","aal":"aal2"}';
select results_eq(
  $$select id from public.clients order by id$$,
  $$values ('40000000-0000-4000-8000-000000000003'::uuid)$$,
  'Coach in organization B reads Client C only'
);

select * from finish();
rollback;
