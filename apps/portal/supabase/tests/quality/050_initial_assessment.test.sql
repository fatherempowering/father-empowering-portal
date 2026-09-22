begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

select has_table('public', 'week_zero_assessments', 'initial assessments have a dedicated table');
select ok(
  (select relrowsecurity and relforcerowsecurity
   from pg_class where oid = 'public.week_zero_assessments'::regclass),
  'initial assessments enforce RLS'
);
select ok(
  not has_table_privilege('authenticated', 'public.week_zero_assessments', 'INSERT')
  and not has_table_privilege('authenticated', 'public.week_zero_assessments', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.week_zero_assessments', 'DELETE'),
  'browser roles cannot write assessment rows directly'
);
select ok(
  has_function_privilege('authenticated', 'public.save_own_initial_assessment(jsonb,bigint,uuid)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.submit_own_initial_assessment(bigint,uuid)', 'EXECUTE'),
  'authenticated Clients can invoke only the bounded business RPCs'
);
select ok(
  not has_table_privilege('authenticated', 'app_private.week_zero_command_receipts', 'SELECT'),
  'retry snapshots remain private'
);

select ok(
  not app_private.initial_assessment_responses_valid(null, false),
  'SQL null is rejected fail-closed'
);
select ok(
  not app_private.initial_assessment_responses_valid(
    '{"measurements":null,"mobility":{},"availability":{}}'::jsonb, false
  ),
  'a null required section is rejected fail-closed'
);
select ok(
  not app_private.initial_assessment_responses_valid(
    '{
      "measurements":{"bodyWeightLb":null,"waistIn":null,"chestIn":null,"hipsIn":null,"rightArmIn":null,"rightThighIn":null,"other":null},
      "mobility":{"painSquat":null,"painHinge":"NO","painPush":"NO","painPull":"NO","painCardio":"NO","limitedMovement":null,"comfortableMovement":null,"tightArea":null},
      "availability":{"days":[],"bestTime":null,"sessionDurationMinutes":null,"sessionsPerWeek":null,"constraints":null}
    }'::jsonb, false
  ),
  'a null pain answer is rejected fail-closed'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new
) values
  ('00000000-0000-0000-0000-000000000000','15000000-0000-4000-8000-000000000001','authenticated','authenticated','assessment.a@example.test','',now(),'{}','{}',now(),now(),'','','',''),
  ('00000000-0000-0000-0000-000000000000','15000000-0000-4000-8000-000000000002','authenticated','authenticated','assessment.b@example.test','',now(),'{}','{}',now(),now(),'','','',''),
  ('00000000-0000-0000-0000-000000000000','15000000-0000-4000-8000-000000000003','authenticated','authenticated','assessment.coach@example.test','',now(),'{}','{}',now(),now(),'','','',''),
  ('00000000-0000-0000-0000-000000000000','15000000-0000-4000-8000-000000000004','authenticated','authenticated','assessment.other@example.test','',now(),'{}','{}',now(),now(),'','','','');

insert into auth.sessions (id, user_id, created_at, updated_at) values
  ('85000000-0000-4000-8000-000000000003','15000000-0000-4000-8000-000000000003',now(),now()),
  ('85000000-0000-4000-8000-000000000004','15000000-0000-4000-8000-000000000004',now(),now());

insert into public.organizations (id, name, created_by)
values ('25000000-0000-4000-8000-000000000001','Week Zero Quality','15000000-0000-4000-8000-000000000003');

insert into public.organization_memberships (
  id, organization_id, user_id, role, status, activated_at, created_by
) values
  ('35000000-0000-4000-8000-000000000001','25000000-0000-4000-8000-000000000001','15000000-0000-4000-8000-000000000001','CLIENT','ACTIVE',now(),'15000000-0000-4000-8000-000000000003'),
  ('35000000-0000-4000-8000-000000000002','25000000-0000-4000-8000-000000000001','15000000-0000-4000-8000-000000000002','CLIENT','ACTIVE',now(),'15000000-0000-4000-8000-000000000003'),
  ('35000000-0000-4000-8000-000000000003','25000000-0000-4000-8000-000000000001','15000000-0000-4000-8000-000000000003','COACH','ACTIVE',now(),'15000000-0000-4000-8000-000000000003'),
  ('35000000-0000-4000-8000-000000000004','25000000-0000-4000-8000-000000000001','15000000-0000-4000-8000-000000000004','COACH','ACTIVE',now(),'15000000-0000-4000-8000-000000000003');

insert into public.clients (
  id, organization_id, auth_user_id, email, first_name, last_name, status, created_by
) values
  ('45000000-0000-4000-8000-000000000001','25000000-0000-4000-8000-000000000001','15000000-0000-4000-8000-000000000001','assessment.a@example.test','Client','A','ACTIVE','15000000-0000-4000-8000-000000000003'),
  ('45000000-0000-4000-8000-000000000002','25000000-0000-4000-8000-000000000001','15000000-0000-4000-8000-000000000002','assessment.b@example.test','Client','B','ACTIVE','15000000-0000-4000-8000-000000000003');

insert into public.coach_client_assignments (
  id, organization_id, coach_user_id, client_id, status, is_primary, created_by
) values (
  '55000000-0000-4000-8000-000000000001','25000000-0000-4000-8000-000000000001',
  '15000000-0000-4000-8000-000000000003','45000000-0000-4000-8000-000000000001',
  'ACTIVE',true,'15000000-0000-4000-8000-000000000003'
);

create temp table assessment_samples (name text primary key, responses jsonb);
insert into assessment_samples values
('draft','{
  "measurements":{"bodyWeightLb":null,"waistIn":null,"chestIn":null,"hipsIn":null,"rightArmIn":null,"rightThighIn":null,"other":null},
  "mobility":{"painSquat":"NOT_ASSESSED","painHinge":"NOT_ASSESSED","painPush":"NOT_ASSESSED","painPull":"NOT_ASSESSED","painCardio":"NOT_ASSESSED","limitedMovement":null,"comfortableMovement":null,"tightArea":null},
  "availability":{"days":[],"bestTime":null,"sessionDurationMinutes":null,"sessionsPerWeek":null,"constraints":null}
}'::jsonb),
('complete','{
  "measurements":{"bodyWeightLb":224.5,"waistIn":41,"chestIn":null,"hipsIn":null,"rightArmIn":null,"rightThighIn":null,"other":null},
  "mobility":{"painSquat":"NO","painHinge":"YES","painPush":"NO","painPull":"NO","painCardio":"NO","limitedMovement":"N.A.","comfortableMovement":"Marche","tightArea":"Hanches"},
  "availability":{"days":[],"bestTime":null,"sessionDurationMinutes":null,"sessionsPerWeek":null,"constraints":null}
}'::jsonb);
grant select on table assessment_samples to authenticated;

set local role authenticated;
set local request.jwt.claim.sub = '15000000-0000-4000-8000-000000000001';
set local "request.jwt.claims" = '{"sub":"15000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}';

select is(
  (public.save_own_initial_assessment(
    (select responses from assessment_samples where name='draft'), 0,
    '65000000-0000-4000-8000-000000000001'
  )->>'version')::bigint,
  1::bigint,
  'an active Client creates its own draft with version zero CAS'
);
select is(
  public.save_own_initial_assessment(
    (select responses from assessment_samples where name='draft'), 0,
    '65000000-0000-4000-8000-000000000001'
  )->>'version',
  '1',
  'an exact retry returns the original stable snapshot'
);
select throws_ok(
  $$select public.save_own_initial_assessment(
    (select responses from assessment_samples where name='complete'), 0,
    '65000000-0000-4000-8000-000000000001'
  )$$,
  'P0001','FE_IDEMPOTENCY_CONFLICT',
  'the same mutation key cannot acknowledge a different request'
);
select throws_ok(
  $$select public.submit_own_initial_assessment(1,'65000000-0000-4000-8000-000000000002')$$,
  'P0001','FE_INITIAL_ASSESSMENT_INCOMPLETE',
  'an incomplete draft cannot be submitted'
);
select is(
  (public.save_own_initial_assessment(
    (select responses from assessment_samples where name='complete'), 1,
    '65000000-0000-4000-8000-000000000003'
  )->>'version')::bigint,
  2::bigint,
  'a current-version draft update advances the CAS version'
);
select is(
  public.save_own_initial_assessment(
    (select responses from assessment_samples where name='draft'), 0,
    '65000000-0000-4000-8000-000000000001'
  )->>'version',
  '1',
  'a delayed exact retry returns its original snapshot rather than falsely acknowledging a newer version'
);
select throws_ok(
  $$select public.save_own_initial_assessment(
    (select responses from assessment_samples where name='complete'), 1,
    '65000000-0000-4000-8000-000000000004'
  )$$,
  'P0001','FE_VERSION_CONFLICT',
  'a stale Client write is rejected'
);

set local request.jwt.claim.sub = '15000000-0000-4000-8000-000000000002';
set local "request.jwt.claims" = '{"sub":"15000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}';
select is((select count(*) from public.week_zero_assessments),0::bigint,'another Client cannot read the draft');

set local request.jwt.claim.sub = '15000000-0000-4000-8000-000000000003';
set local "request.jwt.claims" = '{"sub":"15000000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal1","session_id":"85000000-0000-4000-8000-000000000003","amr":[{"method":"password"}]}';
select is((select count(*) from public.week_zero_assessments),0::bigint,'an assigned but unverified Coach cannot read a draft');

reset role;
insert into app_private.coach_session_attestations (
  session_id,user_id,verified_at,expires_at
) values (
  '85000000-0000-4000-8000-000000000003','15000000-0000-4000-8000-000000000003',now(),now()+interval '1 day'
);

set local role authenticated;
set local request.jwt.claim.sub = '15000000-0000-4000-8000-000000000003';
set local "request.jwt.claims" = '{"sub":"15000000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal1","session_id":"85000000-0000-4000-8000-000000000003","amr":[{"method":"password"}]}';
select is((select count(*) from public.week_zero_assessments),0::bigint,'a verified assigned Coach still cannot read a draft');

set local request.jwt.claim.sub = '15000000-0000-4000-8000-000000000001';
set local "request.jwt.claims" = '{"sub":"15000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}';
select is(
  (public.submit_own_initial_assessment(2,'65000000-0000-4000-8000-000000000005')->>'status'),
  'SUBMITTED','the Client submits the complete assessment'
);
select is(
  public.submit_own_initial_assessment(2,'65000000-0000-4000-8000-000000000005')->>'version',
  '3','an exact submit retry returns the same submitted snapshot'
);
select throws_ok(
  $$select public.submit_own_initial_assessment(3,'65000000-0000-4000-8000-000000000006')$$,
  'P0001','FE_INITIAL_ASSESSMENT_SUBMITTED',
  'a submitted assessment is immutable to a new command'
);

set local request.jwt.claim.sub = '15000000-0000-4000-8000-000000000003';
set local "request.jwt.claims" = '{"sub":"15000000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal1","session_id":"85000000-0000-4000-8000-000000000003","amr":[{"method":"password"}]}';
select is((select count(*) from public.week_zero_assessments),1::bigint,'the verified assigned Coach reads the submitted assessment');

set local request.jwt.claim.sub = '15000000-0000-4000-8000-000000000004';
set local "request.jwt.claims" = '{"sub":"15000000-0000-4000-8000-000000000004","role":"authenticated","aal":"aal1","session_id":"85000000-0000-4000-8000-000000000004","amr":[{"method":"password"}]}';
select is((select count(*) from public.week_zero_assessments),0::bigint,'a non-assigned Coach cannot read the submitted assessment');

reset role;
select is(
  (select count(*) from public.audit_events
   where command='SubmitInitialAssessment'
     and entity_id=(select id from public.week_zero_assessments where client_id='45000000-0000-4000-8000-000000000001')),
  1::bigint,'submission creates one idempotent audit event'
);
select ok(
  not exists (
    select 1 from public.audit_events
    where command='SubmitInitialAssessment'
      and context::text ~* '(bodyWeight|waist|pain|movement|constraint|email)'
  ),
  'the audit event contains no assessment payload or identity data'
);

select * from finish();
rollback;
