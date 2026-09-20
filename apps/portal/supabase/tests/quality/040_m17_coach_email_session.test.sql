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
) values (
  '00000000-0000-0000-0000-000000000000',
  '14000000-0000-4000-8000-000000000001',
  'authenticated',
  'authenticated',
  'coach.session@example.test',
  '',
  now(),
  '{"provider":"email","providers":["email"]}',
  '{}',
  now(),
  now(),
  '',
  '',
  '',
  ''
);

insert into auth.sessions (id, user_id, created_at, updated_at)
values
  ('84000000-0000-4000-8000-000000000001', '14000000-0000-4000-8000-000000000001', now(), now()),
  ('84000000-0000-4000-8000-000000000002', '14000000-0000-4000-8000-000000000001', now(), now());

insert into public.organizations (id, name, created_by)
values (
  '24000000-0000-4000-8000-000000000001',
  'Father Empowering Session Assurance',
  '14000000-0000-4000-8000-000000000001'
);

insert into public.organization_memberships (
  id,
  organization_id,
  user_id,
  role,
  status,
  activated_at,
  created_by
) values (
  '34000000-0000-4000-8000-000000000001',
  '24000000-0000-4000-8000-000000000001',
  '14000000-0000-4000-8000-000000000001',
  'ADMIN',
  'ACTIVE',
  now(),
  '14000000-0000-4000-8000-000000000001'
);

set local role authenticated;
set local request.jwt.claim.sub = '14000000-0000-4000-8000-000000000001';
set local "request.jwt.claims" = '{"sub":"14000000-0000-4000-8000-000000000001","role":"authenticated","email":"coach.session@example.test","aal":"aal1","session_id":"84000000-0000-4000-8000-000000000001","amr":[{"method":"password","timestamp":1789930000}]}';

select is(
  (public.get_coach_email_verification_status() ->> 'verified')::boolean,
  false,
  'a fresh active password session is not verified'
);
select throws_ok(
  $$select public.consume_m1_coach_email_otp_limit(
    repeat('a', 64),
    'VERIFY_OTP'
  )$$,
  'P0001',
  'FE_OTP_CHALLENGE_REQUIRED',
  'verification requires a prior request from the current password session'
);
select lives_ok(
  $$select public.consume_m1_coach_email_otp_limit(
    repeat('a', 64),
    'REQUEST_OTP'
  )$$,
  'the password session can consume its request rate-limit allowance'
);
select throws_ok(
  $$select public.open_coach_email_otp_challenge(
    '14000000-0000-4000-8000-000000000001',
    '84000000-0000-4000-8000-000000000001'
  )$$,
  '42501',
  null,
  'an authenticated browser cannot claim that email delivery succeeded'
);

set local role service_role;
select lives_ok(
  $$select public.open_coach_email_otp_challenge(
    '14000000-0000-4000-8000-000000000001',
    '84000000-0000-4000-8000-000000000001'
  )$$,
  'the trusted server opens a window only after Supabase accepts delivery'
);

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"14000000-0000-4000-8000-000000000001","role":"authenticated","email":"coach.session@example.test","aal":"aal1","session_id":"84000000-0000-4000-8000-000000000002","amr":[{"method":"password","timestamp":1789930000}]}';
select throws_ok(
  $$select public.consume_m1_coach_email_otp_limit(
    repeat('b', 64),
    'VERIFY_OTP'
  )$$,
  'P0001',
  'FE_OTP_CHALLENGE_REQUIRED',
  'an account-level Supabase code cannot be consumed by a session without its own request window'
);

set local "request.jwt.claims" = '{"sub":"14000000-0000-4000-8000-000000000001","role":"authenticated","email":"coach.session@example.test","aal":"aal1","session_id":"84000000-0000-4000-8000-000000000001","amr":[{"method":"password","timestamp":1789930000}]}';
select lives_ok(
  $$select public.consume_m1_coach_email_otp_limit(
    repeat('a', 64),
    'VERIFY_OTP'
  )$$,
  'the requesting session can submit its Supabase-verified code'
);
select throws_ok(
  $$select public.attest_coach_email_session(
    '14000000-0000-4000-8000-000000000001',
    '84000000-0000-4000-8000-000000000001'
  )$$,
  '42501',
  null,
  'an authenticated browser cannot forge its own attestation'
);

set local role service_role;
select lives_ok(
  $$select public.attest_coach_email_session(
    '14000000-0000-4000-8000-000000000001',
    '84000000-0000-4000-8000-000000000001'
  )$$,
  'the trusted server can attest an active staff session'
);
select ok(
  (
    select challenge.consumed_at is not null
    from app_private.coach_email_otp_challenges challenge
    where challenge.session_id = '84000000-0000-4000-8000-000000000001'
  ),
  'the request window is consumed atomically with the attestation'
);
create temporary table first_attestation_expiry as
select expires_at
from app_private.coach_session_attestations
where session_id = '84000000-0000-4000-8000-000000000001';
select lives_ok(
  $$select public.open_coach_email_otp_challenge(
    '14000000-0000-4000-8000-000000000001',
    '84000000-0000-4000-8000-000000000001'
  )$$,
  'a later successful delivery opens a fresh window for the same session'
);
select lives_ok(
  $$select public.attest_coach_email_session(
    '14000000-0000-4000-8000-000000000001',
    '84000000-0000-4000-8000-000000000001'
  )$$,
  'repeating verification is idempotent for the same active session'
);
select is(
  (
    select attestation.expires_at
    from app_private.coach_session_attestations attestation
    where attestation.session_id = '84000000-0000-4000-8000-000000000001'
  ),
  (select expires_at from first_attestation_expiry),
  'repeating verification cannot extend the absolute attestation lifetime'
);
select is(
  (
    select count(*)
    from public.audit_events
    where command = 'CoachEmailVerified'
      and actor_user_id = '14000000-0000-4000-8000-000000000001'
  ),
  1::bigint,
  'attestation and its safe audit are committed together'
);

set local role authenticated;
select is(
  (public.get_coach_email_verification_status() ->> 'verified')::boolean,
  true,
  'the attested password session is verified'
);

set local "request.jwt.claims" = '{"sub":"14000000-0000-4000-8000-000000000001","role":"authenticated","email":"coach.session@example.test","aal":"aal1","session_id":"84000000-0000-4000-8000-000000000002","amr":[{"method":"password","timestamp":1789930000}]}';
select is(
  (public.get_coach_email_verification_status() ->> 'verified')::boolean,
  false,
  'an attestation never crosses into a second session'
);

set local "request.jwt.claims" = '{"sub":"14000000-0000-4000-8000-000000000001","role":"authenticated","email":"coach.session@example.test","aal":"aal2","session_id":"84000000-0000-4000-8000-000000000001","amr":[{"method":"otp","timestamp":1789930000}]}';
select throws_ok(
  $$select public.get_coach_email_verification_status()$$,
  'P0001',
  'FE_COACH_PASSWORD_SESSION_REQUIRED',
  'aal2 without password AMR cannot use an email attestation'
);

set local "request.jwt.claims" = '{"sub":"14000000-0000-4000-8000-000000000001","role":"authenticated","email":"coach.session@example.test","aal":"aal1","session_id":"84000000-0000-4000-8000-000000000001","amr":[{"method":"password","timestamp":1789930000}]}';
select ok(
  public.revoke_current_coach_email_attestation(),
  'local logout can revoke only the current session attestation'
);
select is(
  (public.get_coach_email_verification_status() ->> 'verified')::boolean,
  false,
  'a revoked attestation fails closed immediately'
);

set local role service_role;
select lives_ok(
  $$select public.open_coach_email_otp_challenge(
    '14000000-0000-4000-8000-000000000001',
    '84000000-0000-4000-8000-000000000001'
  )$$,
  'a fresh delivery window still cannot revive a revoked session grant'
);
select throws_ok(
  $$select public.attest_coach_email_session(
    '14000000-0000-4000-8000-000000000001',
    '84000000-0000-4000-8000-000000000001'
  )$$,
  'P0001',
  'FE_COACH_SESSION_REVOKED',
  'a revoked session cannot be re-attested'
);
update auth.sessions
set not_after = now() + interval '1 day'
where id = '84000000-0000-4000-8000-000000000002';
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"14000000-0000-4000-8000-000000000001","role":"authenticated","email":"coach.session@example.test","aal":"aal1","session_id":"84000000-0000-4000-8000-000000000002","amr":[{"method":"password","timestamp":1789930000}]}';
select lives_ok(
  $$select public.consume_m1_coach_email_otp_limit(
    repeat('b', 64),
    'REQUEST_OTP'
  )$$,
  'the second password session consumes an independent request allowance'
);
set local role service_role;
select lives_ok(
  $$select public.open_coach_email_otp_challenge(
    '14000000-0000-4000-8000-000000000001',
    '84000000-0000-4000-8000-000000000002'
  )$$,
  'a successful delivery opens the second session request window'
);
select lives_ok(
  $$select public.attest_coach_email_session(
    '14000000-0000-4000-8000-000000000001',
    '84000000-0000-4000-8000-000000000002'
  )$$,
  'the second independently verified session can be attested'
);
select ok(
  (
    select attestation.expires_at <= session.not_after
    from app_private.coach_session_attestations attestation
    join auth.sessions session on session.id = attestation.session_id
    where attestation.session_id = '84000000-0000-4000-8000-000000000002'
  ),
  'the attestation never outlives the Supabase session absolute timeout'
);

set local role authenticated;
select ok(
  public.revoke_all_coach_email_attestations(),
  'password recovery can revoke every attestation owned by the user'
);
reset role;
select is(
  (
    select count(*)
    from app_private.coach_session_attestations
    where user_id = '14000000-0000-4000-8000-000000000001'
      and revoked_at is null
  ),
  0::bigint,
  'global recovery revocation leaves no active attestation'
);

delete from auth.sessions
where id = '84000000-0000-4000-8000-000000000001';
select is(
  (
    select count(*)
    from app_private.coach_session_attestations
    where session_id = '84000000-0000-4000-8000-000000000001'
  ),
  0::bigint,
  'deleting a Supabase session cascades to its private attestation'
);

select * from finish();
rollback;
