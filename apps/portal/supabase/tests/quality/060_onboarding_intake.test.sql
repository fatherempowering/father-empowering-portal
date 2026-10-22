begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

select has_table('public', 'client_onboarding_intakes', 'native onboarding has a dedicated table');
select ok(
  (select relrowsecurity and relforcerowsecurity
   from pg_class where oid = 'public.client_onboarding_intakes'::regclass),
  'native onboarding enforces RLS'
);
select ok(
  not has_table_privilege('authenticated', 'public.client_onboarding_intakes', 'INSERT')
  and not has_table_privilege('authenticated', 'public.client_onboarding_intakes', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.client_onboarding_intakes', 'DELETE'),
  'browser roles cannot write onboarding rows directly'
);
select ok(
  not has_table_privilege('authenticated', 'app_private.onboarding_question_contracts', 'SELECT')
  and not has_table_privilege('authenticated', 'app_private.client_onboarding_command_receipts', 'SELECT'),
  'question contracts and retry snapshots stay private'
);
select is(
  (select count(*) from app_private.onboarding_question_contracts),
  64::bigint,
  'the SQL contract contains all 64 stable questions'
);
select is(
  (select count(*) from app_private.onboarding_question_contracts where required),
  54::bigint,
  'the SQL contract preserves the 54 required questions'
);
select is(
  (select array_agg(ordinal order by ordinal) from app_private.onboarding_question_contracts),
  array(select generate_series(1, 64)::smallint),
  'the SQL contract preserves a complete unique question order'
);

create temp table onboarding_samples (name text primary key, responses jsonb);
insert into onboarding_samples (name, responses)
select
  'empty',
  jsonb_object_agg(
    contract.question_key,
    case when contract.response_type = 'multi' then '[]'::jsonb else 'null'::jsonb end
    order by contract.ordinal
  )
from app_private.onboarding_question_contracts contract;
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
      when contract.response_type = 'email' then to_jsonb('different.contact@example.test'::text)
      when contract.response_type = 'tel' then to_jsonb('+1 514 555 0100'::text)
      else to_jsonb('Réponse complète'::text)
    end
    order by contract.ordinal
  )
from app_private.onboarding_question_contracts contract;

grant select on table onboarding_samples to authenticated;

select ok(
  app_private.onboarding_responses_valid(
    (select responses from onboarding_samples where name = 'empty'), false
  ),
  'all 64 explicit empty values form a valid draft'
);
select ok(
  app_private.onboarding_responses_valid(
    (select responses from onboarding_samples where name = 'complete'), true
  ),
  'all required explicit values form a complete intake'
);
select ok(
  not app_private.onboarding_responses_valid(
    (select responses - 'fullName' from onboarding_samples where name = 'empty'), false
  ),
  'a missing stable key is rejected'
);
select ok(
  not app_private.onboarding_responses_valid(
    (select responses || '{"unexpected":"value"}'::jsonb
     from onboarding_samples where name = 'empty'), false
  ),
  'an extra key is rejected'
);
select ok(
  not app_private.onboarding_responses_valid(
    jsonb_set(
      (select responses from onboarding_samples where name = 'complete'),
      '{availableDays}', '["MONDAY","MONDAY"]'::jsonb
    ), false
  ),
  'duplicate multi-select values are rejected'
);
select ok(
  not app_private.onboarding_responses_valid(
    jsonb_set(
      (select responses from onboarding_samples where name = 'complete'),
      '{preferredTrainingTime}', '"INVALID"'::jsonb
    ), false
  ),
  'a value outside its option allowlist is rejected'
);
select ok(
  not app_private.onboarding_responses_valid(
    jsonb_set(
      (select responses from onboarding_samples where name = 'complete'),
      '{email}', '"a..b@example.test"'::jsonb
    ), false
  ),
  'a malformed email rejected by Zod is also rejected by direct RPC validation'
);
select ok(
  not app_private.onboarding_responses_valid(
    jsonb_set(
      (select responses from onboarding_samples where name = 'complete'),
      '{whyNow}', to_jsonb(E'\n\t'::text)
    ), false
  ),
  'whitespace-only direct RPC text is rejected'
);
select ok(
  app_private.onboarding_responses_valid(
    jsonb_set(
      (select responses from onboarding_samples where name = 'complete'),
      '{whyNow}', to_jsonb(repeat('💪', 1500))
    ), false
  ),
  'the exact Unicode character limit is accepted'
);
select ok(
  not app_private.onboarding_responses_valid(
    jsonb_set(
      (select responses from onboarding_samples where name = 'complete'),
      '{whyNow}', to_jsonb(repeat('💪', 1501))
    ), false
  ),
  'one Unicode character over the limit is rejected'
);
select ok(
  not app_private.onboarding_responses_valid(
    jsonb_set(
      (select responses from onboarding_samples where name = 'complete'),
      '{whyNow}', to_jsonb(repeat('x', 262145))
    ), false
  ),
  'the SQL validator enforces the same 256 KiB body ceiling'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new
) values
  ('00000000-0000-0000-0000-000000000000','16000000-0000-4000-8000-000000000001','authenticated','authenticated','onboarding.a@example.test','',now(),'{}','{}',now(),now(),'','','',''),
  ('00000000-0000-0000-0000-000000000000','16000000-0000-4000-8000-000000000002','authenticated','authenticated','onboarding.b@example.test','',now(),'{}','{}',now(),now(),'','','',''),
  ('00000000-0000-0000-0000-000000000000','16000000-0000-4000-8000-000000000003','authenticated','authenticated','onboarding.coach@example.test','',now(),'{}','{}',now(),now(),'','','',''),
  ('00000000-0000-0000-0000-000000000000','16000000-0000-4000-8000-000000000004','authenticated','authenticated','onboarding.other@example.test','',now(),'{}','{}',now(),now(),'','','','');

insert into auth.sessions (id, user_id, created_at, updated_at) values
  ('86000000-0000-4000-8000-000000000003','16000000-0000-4000-8000-000000000003',now(),now()),
  ('86000000-0000-4000-8000-000000000004','16000000-0000-4000-8000-000000000004',now(),now());

insert into public.organizations (id, name, created_by)
values ('26000000-0000-4000-8000-000000000001','Onboarding Quality','16000000-0000-4000-8000-000000000003');

insert into public.organization_memberships (
  id, organization_id, user_id, role, status, activated_at, created_by
) values
  ('36000000-0000-4000-8000-000000000001','26000000-0000-4000-8000-000000000001','16000000-0000-4000-8000-000000000001','CLIENT','ACTIVE',now(),'16000000-0000-4000-8000-000000000003'),
  ('36000000-0000-4000-8000-000000000002','26000000-0000-4000-8000-000000000001','16000000-0000-4000-8000-000000000002','CLIENT','ACTIVE',now(),'16000000-0000-4000-8000-000000000003'),
  ('36000000-0000-4000-8000-000000000003','26000000-0000-4000-8000-000000000001','16000000-0000-4000-8000-000000000003','COACH','ACTIVE',now(),'16000000-0000-4000-8000-000000000003'),
  ('36000000-0000-4000-8000-000000000004','26000000-0000-4000-8000-000000000001','16000000-0000-4000-8000-000000000004','COACH','ACTIVE',now(),'16000000-0000-4000-8000-000000000003');

insert into public.clients (
  id, organization_id, auth_user_id, email, first_name, last_name, status, created_by
) values
  ('46000000-0000-4000-8000-000000000001','26000000-0000-4000-8000-000000000001','16000000-0000-4000-8000-000000000001','onboarding.a@example.test','Client','A','ACTIVE','16000000-0000-4000-8000-000000000003'),
  ('46000000-0000-4000-8000-000000000002','26000000-0000-4000-8000-000000000001','16000000-0000-4000-8000-000000000002','onboarding.b@example.test','Client','B','ACTIVE','16000000-0000-4000-8000-000000000003');

insert into public.coach_client_assignments (
  id, organization_id, coach_user_id, client_id, status, is_primary, created_by
) values (
  '56000000-0000-4000-8000-000000000001','26000000-0000-4000-8000-000000000001',
  '16000000-0000-4000-8000-000000000003','46000000-0000-4000-8000-000000000001',
  'ACTIVE',true,'16000000-0000-4000-8000-000000000003'
);

set local role authenticated;
set local request.jwt.claim.sub = '16000000-0000-4000-8000-000000000001';
set local "request.jwt.claims" = '{"sub":"16000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}';

select is(
  (public.save_own_onboarding_intake(
    (select responses from onboarding_samples where name='empty'), 0,
    '66000000-0000-4000-8000-000000000001'
  )->>'version')::bigint,
  1::bigint,
  'an active Client creates its own 64-key draft with version zero CAS'
);
select is(
  public.save_own_onboarding_intake(
    (select responses from onboarding_samples where name='empty'), 0,
    '66000000-0000-4000-8000-000000000001'
  )->>'version',
  '1',
  'an exact save retry returns its original stable snapshot'
);
select throws_ok(
  $$select public.submit_own_onboarding_intake(1,'66000000-0000-4000-8000-000000000002')$$,
  'P0001','FE_ONBOARDING_INTAKE_INCOMPLETE',
  'an incomplete intake cannot be submitted'
);
select is(
  (public.save_own_onboarding_intake(
    (select responses from onboarding_samples where name='complete'), 1,
    '66000000-0000-4000-8000-000000000003'
  )->>'version')::bigint,
  2::bigint,
  'a complete current-version draft advances the CAS version'
);
select is(
  public.save_own_onboarding_intake(
    (select responses from onboarding_samples where name='empty'), 0,
    '66000000-0000-4000-8000-000000000001'
  )->>'version',
  '1',
  'a delayed exact retry never falsely acknowledges the newer version'
);
select throws_ok(
  $$select public.save_own_onboarding_intake(
    (select responses from onboarding_samples where name='complete'), 1,
    '66000000-0000-4000-8000-000000000004'
  )$$,
  'P0001','FE_VERSION_CONFLICT',
  'a stale Client write is rejected'
);

reset role;
select is(
  (select email from public.clients where id='46000000-0000-4000-8000-000000000001'),
  'onboarding.a@example.test',
  'the contact email answer never changes the Client identity email'
);
select is(
  (select email from auth.users where id='16000000-0000-4000-8000-000000000001'),
  'onboarding.a@example.test',
  'the contact email answer never changes the Auth identity'
);

set local role authenticated;
set local request.jwt.claim.sub = '16000000-0000-4000-8000-000000000002';
set local "request.jwt.claims" = '{"sub":"16000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}';
select is((select count(*) from public.client_onboarding_intakes),0::bigint,'another Client cannot read the draft');

set local request.jwt.claim.sub = '16000000-0000-4000-8000-000000000003';
set local "request.jwt.claims" = '{"sub":"16000000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal1","session_id":"86000000-0000-4000-8000-000000000003","amr":[{"method":"password"}]}';
select is((select count(*) from public.client_onboarding_intakes),0::bigint,'an unverified assigned Coach cannot read a draft');

reset role;
insert into app_private.coach_session_attestations (
  session_id,user_id,verified_at,expires_at
) values
  ('86000000-0000-4000-8000-000000000003','16000000-0000-4000-8000-000000000003',now(),now()+interval '1 day'),
  ('86000000-0000-4000-8000-000000000004','16000000-0000-4000-8000-000000000004',now(),now()+interval '1 day');

set local role authenticated;
set local request.jwt.claim.sub = '16000000-0000-4000-8000-000000000003';
set local "request.jwt.claims" = '{"sub":"16000000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal1","session_id":"86000000-0000-4000-8000-000000000003","amr":[{"method":"password"}]}';
select is((select count(*) from public.client_onboarding_intakes),0::bigint,'a verified assigned Coach still cannot read a draft');

set local request.jwt.claim.sub = '16000000-0000-4000-8000-000000000001';
set local "request.jwt.claims" = '{"sub":"16000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}';
select is(
  public.submit_own_onboarding_intake(2,'66000000-0000-4000-8000-000000000005')->>'status',
  'SUBMITTED','the Client submits one immutable onboarding intake'
);
select is(
  public.submit_own_onboarding_intake(2,'66000000-0000-4000-8000-000000000005')->>'version',
  '3','an exact submit retry returns the same submitted snapshot'
);
select throws_ok(
  $$select public.submit_own_onboarding_intake(3,'66000000-0000-4000-8000-000000000006')$$,
  'P0001','FE_ONBOARDING_INTAKE_SUBMITTED',
  'a submitted intake is immutable to a new command'
);

set local request.jwt.claim.sub = '16000000-0000-4000-8000-000000000003';
set local "request.jwt.claims" = '{"sub":"16000000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal1","session_id":"86000000-0000-4000-8000-000000000003","amr":[{"method":"password"}]}';
select is((select count(*) from public.client_onboarding_intakes),1::bigint,'the verified assigned Coach reads the submitted intake');

set local request.jwt.claim.sub = '16000000-0000-4000-8000-000000000004';
set local "request.jwt.claims" = '{"sub":"16000000-0000-4000-8000-000000000004","role":"authenticated","aal":"aal1","session_id":"86000000-0000-4000-8000-000000000004","amr":[{"method":"password"}]}';
select is((select count(*) from public.client_onboarding_intakes),0::bigint,'a non-assigned Coach cannot read the submitted intake');

reset role;
select is(
  (select count(*) from public.audit_events where command='SubmitOnboardingIntake'),
  1::bigint,
  'submission creates one idempotent audit event'
);
select ok(
  not exists (
    select 1 from public.audit_events
    where command='SubmitOnboardingIntake'
      and context::text ~* '(name|email|phone|injur|health|medication|nutrition|answer|response)'
  ),
  'the audit event contains no contact, health, nutrition or response data'
);

update public.organization_memberships
set status = 'SUSPENDED'
where user_id = '16000000-0000-4000-8000-000000000001';
set local role authenticated;
set local request.jwt.claim.sub = '16000000-0000-4000-8000-000000000001';
set local "request.jwt.claims" = '{"sub":"16000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}';
select is(
  (select count(*) from public.client_onboarding_intakes),0::bigint,
  'a suspended Client membership cannot read a submitted intake directly'
);
select throws_ok(
  $$select public.save_own_onboarding_intake(
    (select responses from onboarding_samples where name='complete'), 3,
    '66000000-0000-4000-8000-000000000007'
  )$$,
  'P0001','FE_FORBIDDEN',
  'a suspended Client cannot mutate through the RPC'
);

reset role;
select * from finish();
rollback;
