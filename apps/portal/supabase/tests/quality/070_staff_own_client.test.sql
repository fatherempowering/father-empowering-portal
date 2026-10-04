begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

select has_function(
  'app_private', 'has_own_client_access', array['uuid', 'uuid'],
  'own Client access has one canonical SQL guard'
);
select has_function(
  'public', 'create_own_client_profile', array['text', 'text', 'text', 'text', 'uuid'],
  'verified Staff can create a bounded personal Client profile'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.create_own_client_profile(text,text,text,text,uuid)',
    'EXECUTE'
  ),
  'the personal profile command is exposed only as an authenticated RPC'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.create_own_client_profile(text,text,text,text,uuid)',
    'EXECUTE'
  ),
  'anonymous sessions cannot invoke personal profile creation'
);
select ok(
  not has_table_privilege(
    'authenticated', 'app_private.staff_own_client_command_receipts', 'SELECT'
  ),
  'personal profile idempotency receipts remain private'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new
) values
  ('00000000-0000-0000-0000-000000000000','17000000-0000-4000-8000-000000000001','authenticated','authenticated','staff.owner@example.test','',now(),'{}','{}',now(),now(),'','','',''),
  ('00000000-0000-0000-0000-000000000000','17000000-0000-4000-8000-000000000002','authenticated','authenticated','client.normal@example.test','',now(),'{}','{}',now(),now(),'','','',''),
  ('00000000-0000-0000-0000-000000000000','17000000-0000-4000-8000-000000000003','authenticated','authenticated','coach.other@example.test','',now(),'{}','{}',now(),now(),'','','',''),
  ('00000000-0000-0000-0000-000000000000','17000000-0000-4000-8000-000000000004','authenticated','authenticated','admin.cross@example.test','',now(),'{}','{}',now(),now(),'','','',''),
  ('00000000-0000-0000-0000-000000000000','17000000-0000-4000-8000-000000000005','authenticated','authenticated','staff.conflict@example.test','',now(),'{}','{}',now(),now(),'','','',''),
  ('00000000-0000-0000-0000-000000000000','17000000-0000-4000-8000-000000000006','authenticated','authenticated','staff.suspended@example.test','',now(),'{}','{}',now(),now(),'','','',''),
  ('00000000-0000-0000-0000-000000000000','17000000-0000-4000-8000-000000000007','authenticated','authenticated','client.suspended@example.test','',now(),'{}','{}',now(),now(),'','','',''),
  ('00000000-0000-0000-0000-000000000000','17000000-0000-4000-8000-000000000008','authenticated','authenticated','staff.old-profile@example.test','',now(),'{}','{}',now(),now(),'','','','');

insert into auth.sessions (id, user_id, created_at, updated_at) values
  ('87000000-0000-4000-8000-000000000001','17000000-0000-4000-8000-000000000001',now(),now()),
  ('87000000-0000-4000-8000-000000000002','17000000-0000-4000-8000-000000000001',now(),now()),
  ('87000000-0000-4000-8000-000000000003','17000000-0000-4000-8000-000000000001',now(),now()),
  ('87000000-0000-4000-8000-000000000004','17000000-0000-4000-8000-000000000001',now(),now()),
  ('87000000-0000-4000-8000-000000000005','17000000-0000-4000-8000-000000000003',now(),now()),
  ('87000000-0000-4000-8000-000000000006','17000000-0000-4000-8000-000000000004',now(),now()),
  ('87000000-0000-4000-8000-000000000007','17000000-0000-4000-8000-000000000005',now(),now()),
  ('87000000-0000-4000-8000-000000000008','17000000-0000-4000-8000-000000000006',now(),now()),
  ('87000000-0000-4000-8000-000000000009','17000000-0000-4000-8000-000000000008',now(),now());

insert into public.organizations (id, name, created_by) values
  ('27000000-0000-4000-8000-000000000001','Staff personal portal','17000000-0000-4000-8000-000000000001'),
  ('27000000-0000-4000-8000-000000000002','Other organization','17000000-0000-4000-8000-000000000004');

insert into public.organization_memberships (
  id, organization_id, user_id, role, status, activated_at, created_by
) values
  ('37000000-0000-4000-8000-000000000001','27000000-0000-4000-8000-000000000001','17000000-0000-4000-8000-000000000001','ADMIN','ACTIVE',now(),'17000000-0000-4000-8000-000000000001'),
  ('37000000-0000-4000-8000-000000000002','27000000-0000-4000-8000-000000000001','17000000-0000-4000-8000-000000000002','CLIENT','ACTIVE',now(),'17000000-0000-4000-8000-000000000001'),
  ('37000000-0000-4000-8000-000000000003','27000000-0000-4000-8000-000000000001','17000000-0000-4000-8000-000000000003','COACH','ACTIVE',now(),'17000000-0000-4000-8000-000000000001'),
  ('37000000-0000-4000-8000-000000000004','27000000-0000-4000-8000-000000000002','17000000-0000-4000-8000-000000000004','ADMIN','ACTIVE',now(),'17000000-0000-4000-8000-000000000004'),
  ('37000000-0000-4000-8000-000000000005','27000000-0000-4000-8000-000000000001','17000000-0000-4000-8000-000000000005','COACH','ACTIVE',now(),'17000000-0000-4000-8000-000000000001'),
  ('37000000-0000-4000-8000-000000000006','27000000-0000-4000-8000-000000000001','17000000-0000-4000-8000-000000000006','COACH','SUSPENDED',now(),'17000000-0000-4000-8000-000000000001'),
  ('37000000-0000-4000-8000-000000000007','27000000-0000-4000-8000-000000000001','17000000-0000-4000-8000-000000000007','CLIENT','SUSPENDED',now(),'17000000-0000-4000-8000-000000000001'),
  ('37000000-0000-4000-8000-000000000008','27000000-0000-4000-8000-000000000001','17000000-0000-4000-8000-000000000008','COACH','ACTIVE',now(),'17000000-0000-4000-8000-000000000001');

insert into public.clients (
  id, organization_id, auth_user_id, email, first_name, last_name,
  locale, time_zone, status, created_by
) values
  ('47000000-0000-4000-8000-000000000002','27000000-0000-4000-8000-000000000001','17000000-0000-4000-8000-000000000002','client.normal@example.test','Client','Normal','fr-CA','America/Montreal','ACTIVE','17000000-0000-4000-8000-000000000001'),
  ('47000000-0000-4000-8000-000000000005','27000000-0000-4000-8000-000000000001',null,'staff.conflict@example.test','Existing','Conflict','fr-CA','America/Montreal','ACTIVE','17000000-0000-4000-8000-000000000001'),
  ('47000000-0000-4000-8000-000000000006','27000000-0000-4000-8000-000000000001','17000000-0000-4000-8000-000000000006','staff.suspended@example.test','Staff','Suspended','fr-CA','America/Montreal','ACTIVE','17000000-0000-4000-8000-000000000001'),
  ('47000000-0000-4000-8000-000000000007','27000000-0000-4000-8000-000000000001','17000000-0000-4000-8000-000000000007','client.suspended@example.test','Client','Suspended','fr-CA','America/Montreal','ACTIVE','17000000-0000-4000-8000-000000000001'),
  ('47000000-0000-4000-8000-000000000008','27000000-0000-4000-8000-000000000001','17000000-0000-4000-8000-000000000008','staff.old-profile@example.test','Old','Profile','fr-CA','America/Montreal','SUSPENDED','17000000-0000-4000-8000-000000000001');

insert into app_private.coach_session_attestations (
  session_id, user_id, method, verified_at, expires_at
) values
  ('87000000-0000-4000-8000-000000000001','17000000-0000-4000-8000-000000000001','email_otp',now(),now()+interval '1 day'),
  ('87000000-0000-4000-8000-000000000005','17000000-0000-4000-8000-000000000003','email_otp',now(),now()+interval '1 day'),
  ('87000000-0000-4000-8000-000000000006','17000000-0000-4000-8000-000000000004','email_otp',now(),now()+interval '1 day'),
  ('87000000-0000-4000-8000-000000000007','17000000-0000-4000-8000-000000000005','email_otp',now(),now()+interval '1 day'),
  ('87000000-0000-4000-8000-000000000008','17000000-0000-4000-8000-000000000006','email_otp',now(),now()+interval '1 day'),
  ('87000000-0000-4000-8000-000000000009','17000000-0000-4000-8000-000000000008','email_otp',now(),now()+interval '1 day');

create temp table assessment_samples (name text primary key, responses jsonb);
insert into assessment_samples values
('complete','{
  "measurements":{"bodyWeightLb":210,"waistIn":38,"chestIn":null,"hipsIn":null,"rightArmIn":null,"rightThighIn":null,"other":null},
  "mobility":{"painSquat":"NO","painHinge":"NO","painPush":"NO","painPull":"NO","painCardio":"NO","limitedMovement":"N.A.","comfortableMovement":"Marche","tightArea":"Hanches"},
  "availability":{"days":[],"bestTime":null,"sessionDurationMinutes":null,"sessionsPerWeek":null,"constraints":null}
}'::jsonb);
grant select on table assessment_samples to authenticated;

create temp table onboarding_samples (name text primary key, responses jsonb);
insert into onboarding_samples (name, responses)
select
  'complete',
  jsonb_object_agg(
    contract.question_key,
    case
      when not contract.required then
        case when contract.response_type = 'multi' then '[]'::jsonb else 'null'::jsonb end
      when contract.response_type = 'multi' then to_jsonb(array[contract.allowed_values[1]])
      when contract.response_type = 'single' then to_jsonb(contract.allowed_values[1])
      when contract.response_type in ('number', 'scale') then to_jsonb(coalesce(contract.minimum, 1))
      when contract.response_type = 'email' then to_jsonb('staff.owner@example.test'::text)
      when contract.response_type = 'tel' then to_jsonb('+1 514 555 0100'::text)
      else to_jsonb('Réponse personnelle'::text)
    end
    order by contract.ordinal
  )
from app_private.onboarding_question_contracts contract;
grant select on table onboarding_samples to authenticated;

-- Client membership remains unchanged.
set local role authenticated;
set local request.jwt.claim.sub = '17000000-0000-4000-8000-000000000002';
set local "request.jwt.claims" = '{"sub":"17000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}';
select ok(
  app_private.has_own_client_access(
    '27000000-0000-4000-8000-000000000001',
    '47000000-0000-4000-8000-000000000002'
  ),
  'an active Client membership keeps normal own-client access'
);
select is(
  (select count(*) from public.clients where id='47000000-0000-4000-8000-000000000002'),
  1::bigint,
  'the active Client reads only its own Client record through the self branch'
);

set local request.jwt.claim.sub = '17000000-0000-4000-8000-000000000007';
set local "request.jwt.claims" = '{"sub":"17000000-0000-4000-8000-000000000007","role":"authenticated","aal":"aal1"}';
select ok(
  not app_private.has_own_client_access(
    '27000000-0000-4000-8000-000000000001',
    '47000000-0000-4000-8000-000000000007'
  ),
  'a suspended Client membership loses own-client access'
);
select is(
  (select count(*) from public.clients where id='47000000-0000-4000-8000-000000000007'),
  0::bigint,
  'a suspended Client cannot read its linked Client record'
);
select throws_ok(
  $$select public.save_own_initial_assessment(
    (select responses from assessment_samples where name='complete'),0,
    '67000000-0000-4000-8000-000000000001'
  )$$,
  'P0001','FE_FORBIDDEN',
  'a suspended Client cannot mutate its initial assessment'
);

-- Only the attested password session may create the Staff-owned profile.
reset role;
create temp table created_profile (result jsonb not null);
grant select, insert on table created_profile to authenticated;
set local role authenticated;
set local request.jwt.claim.sub = '17000000-0000-4000-8000-000000000001';
set local "request.jwt.claims" = '{"sub":"17000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1","session_id":"87000000-0000-4000-8000-000000000002","amr":[{"method":"password"}]}';
select throws_ok(
  $$select public.create_own_client_profile('Max','Owner','fr-CA','America/Montreal','67000000-0000-4000-8000-000000000002')$$,
  'P0001','FE_FORBIDDEN',
  'an unverified Staff password session cannot create a personal profile'
);

set local "request.jwt.claims" = '{"sub":"17000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1","session_id":"87000000-0000-4000-8000-000000000003","amr":[{"method":"otp"}]}';
select throws_ok(
  $$select public.create_own_client_profile('Max','Owner','fr-CA','America/Montreal','67000000-0000-4000-8000-000000000003')$$,
  'P0001','FE_FORBIDDEN',
  'an email-OTP-only Staff session cannot create or open the personal capability'
);

set local "request.jwt.claims" = '{"sub":"17000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1","session_id":"87000000-0000-4000-8000-000000000004","amr":[{"method":"recovery"}]}';
select throws_ok(
  $$select public.create_own_client_profile('Max','Owner','fr-CA','America/Montreal','67000000-0000-4000-8000-000000000004')$$,
  'P0001','FE_FORBIDDEN',
  'a recovery-only Staff session cannot create or open the personal capability'
);

set local "request.jwt.claims" = '{"sub":"17000000-0000-4000-8000-000000000001","role":"authenticated","email":"forged@example.test","aal":"aal1","session_id":"87000000-0000-4000-8000-000000000001","amr":[{"method":"password"}]}';
select throws_ok(
  $$select public.create_own_client_profile(
    'Max','Owner','fr-CA','Not/AZone',
    '67000000-0000-4000-8000-000000000015'
  )$$,
  'P0001','FE_INVALID_INPUT',
  'the authenticated RPC rejects a time zone absent from PostgreSQL'
);
insert into created_profile (result)
select public.create_own_client_profile(
  '  Max  ','  Owner  ','fr-CA','  America/Montreal  ',
  '67000000-0000-4000-8000-000000000005'
);
select ok(
  (select (result->>'clientId')::uuid is not null from created_profile),
  'the verified Staff password session creates one personal Client profile'
);
select is(
  public.create_own_client_profile(
    'Max','Owner','fr-CA','America/Montreal',
    '67000000-0000-4000-8000-000000000005'
  ),
  (select result from created_profile),
  'an exact normalized retry returns the stable original result'
);
select throws_ok(
  $$select public.create_own_client_profile(
    'Different','Owner','fr-CA','America/Montreal',
    '67000000-0000-4000-8000-000000000005'
  )$$,
  'P0001','FE_IDEMPOTENCY_CONFLICT',
  'the same creation key cannot acknowledge different intent'
);
select throws_ok(
  $$select public.create_own_client_profile(
    'Max','Owner','fr-CA','America/Montreal',
    '67000000-0000-4000-8000-000000000006'
  )$$,
  'P0001','FE_PERSONAL_PROFILE_EXISTS',
  'a new command never overwrites an existing personal profile'
);

reset role;
select is(
  (select count(*) from public.clients where auth_user_id='17000000-0000-4000-8000-000000000001'),
  1::bigint,
  'Staff creation persists exactly one new Client row'
);
select is(
  (select email from public.clients where auth_user_id='17000000-0000-4000-8000-000000000001'),
  'staff.owner@example.test',
  'the Client email is derived from Auth rather than the JWT or request body'
);
select is(
  (select first_name || '|' || last_name || '|' || time_zone
   from public.clients where auth_user_id='17000000-0000-4000-8000-000000000001'),
  'Max|Owner|America/Montreal',
  'bounded profile fields are normalized before persistence'
);
select is(
  (select count(*) from public.coach_client_assignments
   where client_id=(select (result->>'clientId')::uuid from created_profile)),
  0::bigint,
  'personal profile creation does not invent a Coach assignment'
);
insert into public.coach_client_assignments (
  organization_id, coach_user_id, client_id, status, is_primary, created_by
) values (
  '27000000-0000-4000-8000-000000000001',
  '17000000-0000-4000-8000-000000000001',
  (select (result->>'clientId')::uuid from created_profile),
  'ACTIVE', true, '17000000-0000-4000-8000-000000000001'
);
select is(
  (select count(*) from public.client_invitations
   where client_id=(select (result->>'clientId')::uuid from created_profile)),
  0::bigint,
  'personal profile creation emits no Client invitation'
);
select is(
  (select count(*) from public.outbox_events
   where aggregate_id=(select (result->>'clientId')::uuid from created_profile)),
  0::bigint,
  'personal profile creation emits no delivery event'
);
select is(
  (select count(*) from public.clients where auth_user_id='17000000-0000-4000-8000-000000000002'),
  1::bigint,
  'the separate existing Client/test identity remains untouched'
);
select is(
  (select count(*) from public.audit_events
   where command='CreateOwnClientProfile'
     and actor_user_id='17000000-0000-4000-8000-000000000001'
     and actor_role='ADMIN'
     and context='{"surface":"STAFF_SELF_CLIENT"}'::jsonb),
  1::bigint,
  'creation is audited once with the real Staff role and safe context only'
);
select ok(
  not exists (
    select 1 from public.audit_events
    where command='CreateOwnClientProfile'
      and context::text ~* '(email|name|time|locale|response|answer)'
  ),
  'the creation audit contains no identity or questionnaire data'
);

-- An occupied contact email never links an existing Client implicitly.
set local role authenticated;
set local request.jwt.claim.sub = '17000000-0000-4000-8000-000000000005';
set local "request.jwt.claims" = '{"sub":"17000000-0000-4000-8000-000000000005","role":"authenticated","aal":"aal1","session_id":"87000000-0000-4000-8000-000000000007","amr":[{"method":"password"}]}';
select throws_ok(
  $$select public.create_own_client_profile(
    'Conflict','Staff','fr-CA','America/Montreal',
    '67000000-0000-4000-8000-000000000007'
  )$$,
  'P0001','FE_EMAIL_IDENTITY_CONFLICT',
  'an occupied email fails closed instead of linking another Client record'
);

set local request.jwt.claim.sub = '17000000-0000-4000-8000-000000000008';
set local "request.jwt.claims" = '{"sub":"17000000-0000-4000-8000-000000000008","role":"authenticated","aal":"aal1","session_id":"87000000-0000-4000-8000-000000000009","amr":[{"method":"password"}]}';
select throws_ok(
  $$select public.create_own_client_profile(
    'Old','Profile','fr-CA','America/Montreal',
    '67000000-0000-4000-8000-000000000014'
  )$$,
  'P0001','FE_PERSONAL_PROFILE_EXISTS',
  'an existing suspended personal profile is never overwritten or recreated'
);

set local request.jwt.claim.sub = '17000000-0000-4000-8000-000000000006';
set local "request.jwt.claims" = '{"sub":"17000000-0000-4000-8000-000000000006","role":"authenticated","aal":"aal1","session_id":"87000000-0000-4000-8000-000000000008","amr":[{"method":"password"}]}';
select ok(
  not app_private.has_own_client_access(
    '27000000-0000-4000-8000-000000000001',
    '47000000-0000-4000-8000-000000000006'
  ),
  'a suspended Staff membership invalidates an otherwise attested session'
);
select is(
  (select count(*) from public.clients where id='47000000-0000-4000-8000-000000000006'),
  0::bigint,
  'suspended Staff cannot read its linked Client row'
);
select throws_ok(
  $$select public.save_own_onboarding_intake(
    (select responses from onboarding_samples where name='complete'),0,
    '67000000-0000-4000-8000-000000000008'
  )$$,
  'P0001','FE_FORBIDDEN',
  'suspended Staff cannot mutate onboarding through the self RPC'
);

-- The same verified session can use all four existing self-service RPCs.
set local request.jwt.claim.sub = '17000000-0000-4000-8000-000000000001';
set local "request.jwt.claims" = '{"sub":"17000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1","session_id":"87000000-0000-4000-8000-000000000001","amr":[{"method":"password"}]}';
select ok(
  app_private.has_own_client_access(
    '27000000-0000-4000-8000-000000000001',
    (select (result->>'clientId')::uuid from created_profile)
  ),
  'the verified Staff session owns only its explicit personal Client profile'
);
select is(
  (select count(*) from public.coach_client_assignments
   where client_id=(select (result->>'clientId')::uuid from created_profile)),
  1::bigint,
  'the verified owner may read a later explicit assignment for its profile'
);
select is(
  (public.save_own_initial_assessment(
    (select responses from assessment_samples where name='complete'),0,
    '67000000-0000-4000-8000-000000000009'
  )->>'version')::bigint,
  1::bigint,
  'verified Staff saves its personal initial assessment'
);
select is(
  (public.save_own_initial_assessment(
    (select responses from assessment_samples where name='complete'),0,
    '67000000-0000-4000-8000-000000000009'
  )->>'version')::bigint,
  1::bigint,
  'the Staff initial-assessment save retry returns its original snapshot'
);
select is(
  public.submit_own_initial_assessment(
    1,'67000000-0000-4000-8000-000000000010'
  )->>'status',
  'SUBMITTED',
  'verified Staff submits its personal initial assessment'
);
select is(
  (public.save_own_onboarding_intake(
    (select responses from onboarding_samples where name='complete'),0,
    '67000000-0000-4000-8000-000000000011'
  )->>'version')::bigint,
  1::bigint,
  'verified Staff saves its personal onboarding intake'
);
select is(
  (public.save_own_onboarding_intake(
    (select responses from onboarding_samples where name='complete'),0,
    '67000000-0000-4000-8000-000000000011'
  )->>'version')::bigint,
  1::bigint,
  'the Staff onboarding save retry returns its original snapshot'
);
select is(
  public.submit_own_onboarding_intake(
    1,'67000000-0000-4000-8000-000000000012'
  )->>'status',
  'SUBMITTED',
  'verified Staff submits its personal onboarding intake'
);
select is(
  public.submit_own_initial_assessment(
    1,'67000000-0000-4000-8000-000000000010'
  )->>'version',
  '2',
  'the Staff initial-assessment submit retry is idempotent'
);
select is(
  public.submit_own_onboarding_intake(
    1,'67000000-0000-4000-8000-000000000012'
  )->>'version',
  '2',
  'the Staff onboarding submit retry is idempotent'
);
select is(
  (select count(*) from public.week_zero_assessments
   where client_id=(select (result->>'clientId')::uuid from created_profile)),
  1::bigint,
  'verified Staff reads its submitted personal initial assessment'
);
select is(
  (select count(*) from public.client_onboarding_intakes
   where client_id=(select (result->>'clientId')::uuid from created_profile)),
  1::bigint,
  'verified Staff reads its submitted personal onboarding intake'
);

reset role;
select is(
  (select count(*) from public.audit_events
   where actor_user_id='17000000-0000-4000-8000-000000000001'
     and actor_role='ADMIN'
     and command in ('SubmitInitialAssessment','SubmitOnboardingIntake')
     and context->>'surface'='STAFF_SELF_CLIENT'),
  2::bigint,
  'both submissions preserve the real ADMIN actor role and personal surface'
);
select ok(
  not exists (
    select 1 from public.audit_events
    where actor_user_id='17000000-0000-4000-8000-000000000001'
      and command in ('SubmitInitialAssessment','SubmitOnboardingIntake')
      and context::text ~* '(bodyWeight|waist|pain|email|name|phone|health|nutrition|response|answer)'
  ),
  'personal submission audits contain no response or identity data'
);

-- A second session or another principal cannot inherit the capability.
set local role authenticated;
set local request.jwt.claim.sub = '17000000-0000-4000-8000-000000000001';
set local "request.jwt.claims" = '{"sub":"17000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1","session_id":"87000000-0000-4000-8000-000000000002","amr":[{"method":"password"}]}';
select ok(
  not app_private.has_own_client_access(
    '27000000-0000-4000-8000-000000000001',
    (select (result->>'clientId')::uuid from created_profile)
  ),
  'the personal capability does not cross into an unverified password session'
);
select is(
  (select count(*) from public.week_zero_assessments
   where client_id=(select (result->>'clientId')::uuid from created_profile)),
  0::bigint,
  'an unverified Staff session cannot read personal assessment data'
);
select is(
  (select count(*) from public.coach_client_assignments
   where client_id=(select (result->>'clientId')::uuid from created_profile)),
  0::bigint,
  'the assignment self branch also fails closed without Staff verification'
);

set local "request.jwt.claims" = '{"sub":"17000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1","session_id":"87000000-0000-4000-8000-000000000003","amr":[{"method":"otp"}]}';
select ok(
  not app_private.has_own_client_access(
    '27000000-0000-4000-8000-000000000001',
    (select (result->>'clientId')::uuid from created_profile)
  ),
  'an email-OTP-only Staff session cannot reopen the personal capability'
);
select is(
  (select count(*) from public.client_onboarding_intakes
   where client_id=(select (result->>'clientId')::uuid from created_profile)),
  0::bigint,
  'email OTP alone cannot read personal onboarding data'
);

set local "request.jwt.claims" = '{"sub":"17000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1","session_id":"87000000-0000-4000-8000-000000000004","amr":[{"method":"recovery"}]}';
select ok(
  not app_private.has_own_client_access(
    '27000000-0000-4000-8000-000000000001',
    (select (result->>'clientId')::uuid from created_profile)
  ),
  'a recovery-only Staff session cannot reopen the personal capability'
);
select throws_ok(
  $$select public.save_own_initial_assessment(
    (select responses from assessment_samples where name='complete'),2,
    '67000000-0000-4000-8000-000000000013'
  )$$,
  'P0001','FE_FORBIDDEN',
  'recovery assurance cannot mutate personal assessment data'
);

set local request.jwt.claim.sub = '17000000-0000-4000-8000-000000000003';
set local "request.jwt.claims" = '{"sub":"17000000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal1","session_id":"87000000-0000-4000-8000-000000000005","amr":[{"method":"password"}]}';
select is(
  (select count(*) from public.week_zero_assessments
   where client_id=(select (result->>'clientId')::uuid from created_profile)),
  0::bigint,
  'a verified unassigned Coach cannot read another Staff personal assessment'
);
select is(
  (select count(*) from public.client_onboarding_intakes
   where client_id=(select (result->>'clientId')::uuid from created_profile)),
  0::bigint,
  'a verified unassigned Coach cannot read another Staff personal onboarding'
);

set local request.jwt.claim.sub = '17000000-0000-4000-8000-000000000004';
set local "request.jwt.claims" = '{"sub":"17000000-0000-4000-8000-000000000004","role":"authenticated","aal":"aal1","session_id":"87000000-0000-4000-8000-000000000006","amr":[{"method":"password"}]}';
select is(
  (select count(*) from public.week_zero_assessments
   where client_id=(select (result->>'clientId')::uuid from created_profile)),
  0::bigint,
  'verified Admin in another organization cannot cross the organization boundary'
);
select is(
  (select count(*) from public.client_onboarding_intakes
   where client_id=(select (result->>'clientId')::uuid from created_profile)),
  0::bigint,
  'cross-organization isolation also protects personal onboarding'
);

reset role;
select * from finish();
rollback;
