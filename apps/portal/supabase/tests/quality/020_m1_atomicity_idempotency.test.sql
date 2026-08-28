begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

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
  ('00000000-0000-0000-0000-000000000000', '11000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'max.atomic@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '11000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'activate@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '11000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'rollback@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');

insert into public.organizations (id, name, created_by)
values ('21000000-0000-4000-8000-000000000001', 'Father Empowering Atomic', '11000000-0000-4000-8000-000000000001');

insert into public.organization_memberships (
  id,
  organization_id,
  user_id,
  role,
  status,
  activated_at,
  created_by
)
values (
  '31000000-0000-4000-8000-000000000001',
  '21000000-0000-4000-8000-000000000001',
  '11000000-0000-4000-8000-000000000001',
  'COACH',
  'ACTIVE',
  now(),
  '11000000-0000-4000-8000-000000000001'
);

set local role authenticated;
set local request.jwt.claim.sub = '11000000-0000-4000-8000-000000000001';
set local "request.jwt.claims" = '{"sub":"11000000-0000-4000-8000-000000000001","role":"authenticated","email":"max.atomic@example.test","aal":"aal2"}';

create temporary table m1_create_result as
select public.create_invited_client(
  '21000000-0000-4000-8000-000000000001',
  'activate@example.test',
  'Activate',
  'Client',
  'fr-CA',
  'America/Montreal',
  repeat('a', 64),
  now() + interval '2 days',
  '61000000-0000-4000-8000-000000000001',
  null
) as value;

select is(
  (select count(*) from public.clients where email = 'activate@example.test'),
  1::bigint,
  'create_invited_client creates one client'
);
select is(
  (select count(*) from public.coach_client_assignments assignment
   join public.clients client on client.id = assignment.client_id
   where client.email = 'activate@example.test' and assignment.is_primary),
  1::bigint,
  'create_invited_client creates one primary assignment'
);
select is(
  (select count(*) from public.client_invitations where email = 'activate@example.test'),
  1::bigint,
  'create_invited_client creates one invitation'
);
select is(
  (select count(*) from public.audit_events where command = 'CreateInvitedClient'),
  1::bigint,
  'create_invited_client creates one audit event'
);
select is(
  (select count(*) from public.outbox_events where event_type = 'ClientInvitationCreated'),
  1::bigint,
  'create_invited_client creates one outbox event'
);
select ok(
  position(repeat('a', 64) in (select value::text from m1_create_result)) = 0,
  'create result does not return the invitation hash'
);

-- An identical retry returns the original resource without duplicate effects.
select lives_ok(
  $$select public.create_invited_client(
    '21000000-0000-4000-8000-000000000001',
    'activate@example.test',
    'Activate',
    'Client',
    'fr-CA',
    'America/Montreal',
    repeat('a', 64),
    now() + interval '2 days',
    '61000000-0000-4000-8000-000000000001',
    null
  )$$,
  'identical creation retry succeeds'
);
select is(
  (select count(*) from public.clients where email = 'activate@example.test'),
  1::bigint,
  'identical retry does not duplicate the client'
);
select is(
  (select count(*) from public.audit_events where command = 'CreateInvitedClient'),
  1::bigint,
  'identical retry does not duplicate audit'
);
select is(
  (select count(*) from public.outbox_events where event_type = 'ClientInvitationCreated'),
  1::bigint,
  'identical retry does not duplicate outbox delivery'
);

-- A key reused for a different payload must be rejected, not replayed.
select throws_ok(
  $$select public.create_invited_client(
    '21000000-0000-4000-8000-000000000001',
    'different@example.test',
    'Different',
    'Payload',
    'fr-CA',
    'America/Montreal',
    repeat('b', 64),
    now() + interval '2 days',
    '61000000-0000-4000-8000-000000000001',
    null
  )$$,
  'P0001',
  'FE_IDEMPOTENCY_CONFLICT',
  'same idempotency key with another payload is rejected'
);
select is(
  (select count(*) from public.clients where email = 'different@example.test'),
  0::bigint,
  'idempotency conflict leaves no client behind'
);

-- A failure after entering the RPC rolls back every M1 aggregate write.
select throws_ok(
  $$select public.create_invited_client(
    '21000000-0000-4000-8000-000000000001',
    'rollback.create@example.test',
    'Rollback',
    'Create',
    'fr-CA',
    'America/Montreal',
    repeat('a', 64),
    now() + interval '2 days',
    '61000000-0000-4000-8000-000000000002',
    null
  )$$,
  'P0001',
  'FE_DUPLICATE',
  'duplicate invitation digest rolls back creation'
);
select is(
  (select count(*) from public.clients where email = 'rollback.create@example.test'),
  0::bigint,
  'failed creation leaves no partial client'
);

-- Revocation and resend remain retry-safe and a revoked invited client can be
-- invited again without creating another client or assignment.
select lives_ok(
  $$select public.create_invited_client(
    '21000000-0000-4000-8000-000000000001',
    'lifecycle@example.test',
    'Invitation',
    'Lifecycle',
    'fr-CA',
    'America/Montreal',
    repeat('b', 64),
    now() + interval '2 days',
    '61000000-0000-4000-8000-000000000010',
    null
  )$$,
  'a second invited client is created for invitation lifecycle tests'
);
select lives_ok(
  $$select public.revoke_client_invitation_for_client(
    (select id from public.clients where email = 'lifecycle@example.test'),
    'Coach cancelled invitation',
    '61000000-0000-4000-8000-000000000011'
  )$$,
  'Coach revokes the current invitation by client id'
);
select lives_ok(
  $$select public.revoke_client_invitation_for_client(
    (select id from public.clients where email = 'lifecycle@example.test'),
    'Coach cancelled invitation',
    '61000000-0000-4000-8000-000000000011'
  )$$,
  'an identical revocation retry succeeds after state became REVOKED'
);
select is(
  (select count(*) from public.audit_events
   where command = 'RevokeClientInvitation'
     and context ->> 'clientId' = (
       select id::text from public.clients where email = 'lifecycle@example.test'
     )),
  1::bigint,
  'revocation retry does not duplicate audit'
);
select is(
  (select count(*) from public.outbox_events
   where event_type = 'ClientInvitationRevoked'
     and payload ->> 'clientId' = (
       select id::text from public.clients where email = 'lifecycle@example.test'
     )),
  1::bigint,
  'revocation retry does not duplicate outbox delivery'
);
select throws_ok(
  $$select public.revoke_client_invitation_for_client(
    (select id from public.clients where email = 'lifecycle@example.test'),
    'Different command payload',
    '61000000-0000-4000-8000-000000000011'
  )$$,
  'P0001',
  'FE_IDEMPOTENCY_CONFLICT',
  'revocation key reuse with another payload is rejected'
);
select lives_ok(
  $$select public.resend_client_invitation(
    (select id from public.clients where email = 'lifecycle@example.test'),
    repeat('f', 64),
    now() + interval '2 days',
    '61000000-0000-4000-8000-000000000012'
  )$$,
  'a revoked invited client can receive a new invitation'
);
select lives_ok(
  $$select public.resend_client_invitation(
    (select id from public.clients where email = 'lifecycle@example.test'),
    repeat('f', 64),
    now() + interval '2 days',
    '61000000-0000-4000-8000-000000000012'
  )$$,
  'an identical resend retry succeeds'
);
select is(
  (select count(*) from public.audit_events
   where command = 'ResendClientInvitation'
     and context ->> 'clientId' = (
       select id::text from public.clients where email = 'lifecycle@example.test'
     )),
  1::bigint,
  'resend retry does not duplicate audit'
);
select is(
  (select count(*) from public.outbox_events
   where event_type = 'ClientInvitationResent'
     and payload ->> 'clientId' = (
       select id::text from public.clients where email = 'lifecycle@example.test'
     )),
  1::bigint,
  'resend retry does not duplicate outbox delivery'
);
select is(
  (select count(*) from public.client_invitations invitation
   join public.clients client on client.id = invitation.client_id
   where client.email = 'lifecycle@example.test' and invitation.status = 'PENDING'),
  1::bigint,
  'resend leaves exactly one current pending invitation'
);
select lives_ok(
  $$select public.revoke_client_invitation_for_client(
    (select id from public.clients where email = 'lifecycle@example.test'),
    'Second revocation',
    '61000000-0000-4000-8000-000000000013'
  )$$,
  'the resent invitation can be revoked'
);
select lives_ok(
  $$select public.resend_client_invitation(
    (select id from public.clients where email = 'lifecycle@example.test'),
    repeat('d', 64),
    now() + interval '2 days',
    '61000000-0000-4000-8000-000000000014'
  )$$,
  'the UI-supported revoke then resend lifecycle succeeds'
);
select is(
  (select count(*) from public.client_invitations invitation
   join public.clients client on client.id = invitation.client_id
   where client.email = 'lifecycle@example.test' and invitation.status = 'PENDING'),
  1::bigint,
  'revoke then resend again leaves one current invitation'
);

-- Simulate the trusted delivery worker. Activation is intentionally forbidden
-- until the invitation has actually reached SENT.
reset role;
update public.client_invitations
set status = 'SENT', sent_at = now()
where token_hash = repeat('a', 64);

-- Activate the delivered invitation as the invitation-owned Auth identity.
set local role authenticated;
set local request.jwt.claim.sub = '11000000-0000-4000-8000-000000000002';
set local "request.jwt.claims" = '{"sub":"11000000-0000-4000-8000-000000000002","role":"authenticated","email":"activate@example.test","aal":"aal1"}';
select lives_ok(
  $$select public.accept_client_invitation(repeat('a', 64))$$,
  'invitation-owned identity activates atomically'
);

select is(
  (select status::text from public.clients where email = 'activate@example.test'),
  'ACTIVE',
  'activation marks the client active'
);
select is(
  (select auth_user_id from public.clients where email = 'activate@example.test'),
  '11000000-0000-4000-8000-000000000002'::uuid,
  'activation links the invitation-owned Auth user'
);
select is(
  (select role::text from public.organization_memberships
   where user_id = '11000000-0000-4000-8000-000000000002'),
  'CLIENT',
  'activation creates the CLIENT membership'
);
select is(
  (select status::text from public.coach_client_assignments assignment
   join public.clients client on client.id = assignment.client_id
   where client.email = 'activate@example.test'),
  'ACTIVE',
  'activation activates the primary assignment'
);
select is(
  (select status::text from public.client_invitations where token_hash = repeat('a', 64)),
  'ACCEPTED',
  'activation accepts the invitation'
);
select is(
  (select count(*) from public.audit_events where command = 'AcceptClientInvitation'),
  1::bigint,
  'activation writes exactly one audit event'
);
select is(
  (select count(*) from public.outbox_events where event_type = 'ClientActivated'),
  1::bigint,
  'activation writes exactly one outbox event'
);

-- Replaying acceptance as the same identity is idempotent.
select lives_ok(
  $$select public.accept_client_invitation(repeat('a', 64))$$,
  'same identity can safely replay activation'
);
select is(
  (select count(*) from public.audit_events where command = 'AcceptClientInvitation'),
  1::bigint,
  'activation replay does not duplicate audit'
);
select is(
  (select count(*) from public.outbox_events where event_type = 'ClientActivated'),
  1::bigint,
  'activation replay does not duplicate outbox delivery'
);

-- Prepare an inconsistent invitation so the activation fails after initial
-- writes. The RPC must roll back the membership, profile and client update.
reset role;
insert into public.clients (
  id,
  organization_id,
  email,
  first_name,
  last_name,
  locale,
  time_zone,
  status,
  created_by
)
values (
  '41000000-0000-4000-8000-000000000003',
  '21000000-0000-4000-8000-000000000001',
  'rollback@example.test',
  'Rollback',
  'Activation',
  'fr-CA',
  'America/Montreal',
  'INVITED',
  '11000000-0000-4000-8000-000000000001'
);
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
values (
  '51000000-0000-4000-8000-000000000003',
  '21000000-0000-4000-8000-000000000001',
  '11000000-0000-4000-8000-000000000001',
  '41000000-0000-4000-8000-000000000003',
  'ACTIVE',
  true,
  now(),
  '11000000-0000-4000-8000-000000000001'
);
insert into public.client_invitations (
  id,
  organization_id,
  client_id,
  email,
  token_hash,
  expires_at,
  status,
  idempotency_key,
  request_fingerprint,
  created_by
)
values (
  '71000000-0000-4000-8000-000000000003',
  '21000000-0000-4000-8000-000000000001',
  '41000000-0000-4000-8000-000000000003',
  'rollback@example.test',
  repeat('c', 64),
  now() + interval '2 days',
  'SENT',
  '61000000-0000-4000-8000-000000000003',
  repeat('d', 64),
  '11000000-0000-4000-8000-000000000001'
);
update public.client_invitations
set sent_at = now()
where id = '71000000-0000-4000-8000-000000000003';

set local role authenticated;
set local request.jwt.claim.sub = '11000000-0000-4000-8000-000000000003';
set local "request.jwt.claims" = '{"sub":"11000000-0000-4000-8000-000000000003","role":"authenticated","email":"rollback@example.test","aal":"aal1"}';
select throws_ok(
  $$select public.accept_client_invitation(repeat('c', 64))$$,
  'P0001',
  'FE_ASSIGNMENT_NOT_PENDING',
  'failed activation raises its invariant error'
);

reset role;
select is(
  (select status::text from public.clients where id = '41000000-0000-4000-8000-000000000003'),
  'INVITED',
  'failed activation rolls back client status'
);
select is(
  (select auth_user_id from public.clients where id = '41000000-0000-4000-8000-000000000003'),
  null::uuid,
  'failed activation rolls back Auth linkage'
);
select is(
  (select count(*) from public.organization_memberships
   where user_id = '11000000-0000-4000-8000-000000000003'),
  0::bigint,
  'failed activation rolls back membership creation'
);
select is(
  (select count(*) from public.profiles
   where auth_user_id = '11000000-0000-4000-8000-000000000003'),
  0::bigint,
  'failed activation rolls back profile creation'
);
select is(
  (select status::text from public.client_invitations where id = '71000000-0000-4000-8000-000000000003'),
  'SENT',
  'failed activation leaves the delivered invitation unconsumed'
);

-- The clear invitation sentinel must not appear anywhere persisted by M1.
select is(
  (
    select count(*)
    from (
      select to_jsonb(invitation)::text as value from public.client_invitations invitation
      union all
      select to_jsonb(audit)::text from public.audit_events audit
      union all
      select to_jsonb(outbox)::text from public.outbox_events outbox
    ) persisted
    where persisted.value like '%m1-raw-invitation-secret%'
  ),
  0::bigint,
  'raw invitation sentinel is absent from invitations, audit and outbox'
);

select * from finish();
rollback;
