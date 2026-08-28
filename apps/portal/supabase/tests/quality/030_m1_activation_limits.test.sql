begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

select has_table(
  'app_private',
  'activation_rate_limits',
  'M1 owns a private activation rate-limit table'
);
select has_table(
  'app_private',
  'client_otp_rate_limits',
  'M1 owns a private returning-client OTP rate-limit table'
);
select ok(
  not has_table_privilege('anon', 'app_private.activation_rate_limits', 'SELECT'),
  'anonymous cannot read activation rate-limit state'
);
select ok(
  not has_table_privilege('authenticated', 'app_private.activation_rate_limits', 'SELECT'),
  'authenticated browser sessions cannot read activation rate-limit state'
);
select ok(
  not has_table_privilege('authenticated', 'app_private.client_otp_rate_limits', 'SELECT'),
  'authenticated browser sessions cannot read returning-client OTP limits'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.consume_m1_activation_limit(uuid,text,text)',
    'EXECUTE'
  ),
  'anonymous cannot consume or probe activation limits'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.consume_m1_activation_limit(uuid,text,text)',
    'EXECUTE'
  ),
  'authenticated browser sessions cannot consume or probe activation limits'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.consume_m1_activation_limit(uuid,text,text)',
    'EXECUTE'
  ),
  'the trusted service role can enforce activation limits'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.consume_m1_client_otp_limit(text,text,text)',
    'EXECUTE'
  ),
  'authenticated browser sessions cannot consume client login limits'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.consume_m1_client_otp_limit(text,text,text)',
    'EXECUTE'
  ),
  'the trusted service role enforces returning-client OTP limits'
);

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
values (
  '00000000-0000-0000-0000-000000000000',
  '12000000-0000-4000-8000-000000000001',
  'authenticated',
  'authenticated',
  'limits@example.test',
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

insert into public.organizations (id, name, created_by)
values (
  '22000000-0000-4000-8000-000000000001',
  'Father Empowering Limits',
  '12000000-0000-4000-8000-000000000001'
);

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
  '42000000-0000-4000-8000-000000000001',
  '22000000-0000-4000-8000-000000000001',
  'limits@example.test',
  'Rate',
  'Limits',
  'fr-CA',
  'America/Montreal',
  'INVITED',
  '12000000-0000-4000-8000-000000000001'
);

insert into public.client_invitations (
  id,
  organization_id,
  client_id,
  email,
  token_hash,
  expires_at,
  status,
  sent_at,
  idempotency_key,
  request_fingerprint,
  created_by
)
values (
  '72000000-0000-4000-8000-000000000001',
  '22000000-0000-4000-8000-000000000001',
  '42000000-0000-4000-8000-000000000001',
  'limits@example.test',
  repeat('e', 64),
  now() + interval '1 day',
  'SENT',
  now(),
  '62000000-0000-4000-8000-000000000001',
  repeat('d', 64),
  '12000000-0000-4000-8000-000000000001'
);

set local role service_role;
select lives_ok(
  $$select public.consume_m1_activation_limit(
    '72000000-0000-4000-8000-000000000001',
    repeat('f', 64),
    'REQUEST_OTP'
  ) from generate_series(1, 5)$$,
  'five OTP requests are permitted within fifteen minutes'
);
select throws_ok(
  $$select public.consume_m1_activation_limit(
    '72000000-0000-4000-8000-000000000001',
    repeat('f', 64),
    'REQUEST_OTP'
  )$$,
  'P0001',
  'FE_RATE_LIMITED',
  'the sixth OTP request is rate limited'
);
select throws_ok(
  $$select public.consume_m1_activation_limit(
    '72000000-0000-4000-8000-000000000001',
    repeat('b', 64),
    'REQUEST_OTP'
  )$$,
  'P0001',
  'FE_RATE_LIMITED',
  'rotating the request fingerprint does not reset the invitation limit'
);

select lives_ok(
  $$select public.consume_m1_activation_limit(
    '72000000-0000-4000-8000-000000000001',
    repeat('a', 64),
    'VERIFY_OTP'
  ) from generate_series(1, 10)$$,
  'ten OTP verifications are permitted within fifteen minutes'
);
select throws_ok(
  $$select public.consume_m1_activation_limit(
    '72000000-0000-4000-8000-000000000001',
    repeat('a', 64),
    'VERIFY_OTP'
  )$$,
  'P0001',
  'FE_RATE_LIMITED',
  'the eleventh OTP verification is rate limited'
);
select throws_ok(
  $$select public.consume_m1_activation_limit(
    '72000000-0000-4000-8000-000000000001',
    repeat('c', 64),
    'VERIFY_OTP'
  )$$,
  'P0001',
  'FE_RATE_LIMITED',
  'rotating the verification fingerprint does not reset the invitation limit'
);

reset role;
select is(
  (
    select attempts
    from app_private.activation_rate_limits
    where invitation_id = '72000000-0000-4000-8000-000000000001'
      and fingerprint_hash = repeat('f', 64)
      and kind = 'REQUEST_OTP'
  ),
  5,
  'a rejected OTP request does not persist an over-limit increment'
);
select is(
  (
    select attempts
    from app_private.activation_rate_limits
    where invitation_id = '72000000-0000-4000-8000-000000000001'
      and fingerprint_hash = repeat('a', 64)
      and kind = 'VERIFY_OTP'
  ),
  10,
  'a rejected OTP verification does not persist an over-limit increment'
);

set local role service_role;
select lives_ok(
  $$select public.consume_m1_client_otp_limit(
    repeat('d', 64),
    repeat('e', 64),
    'REQUEST_OTP'
  ) from generate_series(1, 5)$$,
  'five returning-client OTP requests are permitted'
);
select throws_ok(
  $$select public.consume_m1_client_otp_limit(
    repeat('d', 64),
    repeat('f', 64),
    'REQUEST_OTP'
  )$$,
  'P0001',
  'FE_RATE_LIMITED',
  'returning-client request limit survives fingerprint rotation'
);
select lives_ok(
  $$select public.consume_m1_client_otp_limit(
    repeat('d', 64),
    repeat('a', 64),
    'VERIFY_OTP'
  ) from generate_series(1, 10)$$,
  'ten returning-client OTP verifications are permitted'
);
select throws_ok(
  $$select public.consume_m1_client_otp_limit(
    repeat('d', 64),
    repeat('b', 64),
    'VERIFY_OTP'
  )$$,
  'P0001',
  'FE_RATE_LIMITED',
  'returning-client verification limit survives fingerprint rotation'
);

select lives_ok(
  $$select public.consume_m1_client_otp_limit(
    lpad(to_hex(candidate), 64, '0'),
    repeat('9', 64),
    'REQUEST_OTP'
  ) from generate_series(1, 20) as candidate$$,
  'a stable fingerprint has a bounded allowance across arbitrary addresses'
);
select throws_ok(
  $$select public.consume_m1_client_otp_limit(
    repeat('8', 64),
    repeat('9', 64),
    'REQUEST_OTP'
  )$$,
  'P0001',
  'FE_RATE_LIMITED',
  'rotating arbitrary addresses cannot bypass the fingerprint-wide cap'
);

reset role;
insert into app_private.client_otp_rate_limits (
  email_hash,
  fingerprint_hash,
  kind,
  window_started_at,
  attempts,
  updated_at
) values (
  repeat('1', 64),
  repeat('2', 64),
  'REQUEST_OTP',
  now() - interval '1 day',
  1,
  now() - interval '1 day'
);

set local role service_role;
select lives_ok(
  $$select public.consume_m1_client_otp_limit(
    repeat('3', 64),
    repeat('4', 64),
    'REQUEST_OTP'
  )$$,
  'a later public attempt can trigger bounded-bucket maintenance'
);

reset role;
select is(
  (
    select count(*)::integer
    from app_private.client_otp_rate_limits
    where email_hash = repeat('1', 64)
      and fingerprint_hash = repeat('2', 64)
  ),
  0,
  'expired arbitrary-address buckets are purged globally'
);

-- Even if bounded maintenance cannot reach this expired target in one pass,
-- its own UPSERT must open a fresh counted window rather than incrementing an
-- expired row that the aggregate queries ignore.
insert into app_private.client_otp_rate_limits (
  email_hash,
  fingerprint_hash,
  kind,
  window_started_at,
  attempts,
  updated_at
)
select
  lpad(to_hex(candidate + 1000), 64, '0'),
  lpad(to_hex(candidate + 3000), 64, '0'),
  'REQUEST_OTP',
  now() - interval '1 day',
  1,
  now() - interval '1 day'
from generate_series(1, 1000) candidate;
insert into app_private.client_otp_rate_limits (
  email_hash,
  fingerprint_hash,
  kind,
  window_started_at,
  attempts,
  updated_at
) values (
  repeat('6', 64),
  repeat('7', 64),
  'REQUEST_OTP',
  now() - interval '1 hour',
  5,
  now() - interval '1 hour'
);

set local role service_role;
select lives_ok(
  $$select public.consume_m1_client_otp_limit(
    repeat('6', 64),
    repeat('7', 64),
    'REQUEST_OTP'
  )$$,
  'an expired target surviving bounded cleanup opens a new window'
);
reset role;
select is(
  (
    select attempts
    from app_private.client_otp_rate_limits
    where email_hash = repeat('6', 64)
      and fingerprint_hash = repeat('7', 64)
      and kind = 'REQUEST_OTP'
  ),
  1,
  'the surviving expired target resets its attempt counter'
);
select ok(
  (
    select window_started_at > now() - interval '1 minute'
    from app_private.client_otp_rate_limits
    where email_hash = repeat('6', 64)
      and fingerprint_hash = repeat('7', 64)
      and kind = 'REQUEST_OTP'
  ),
  'the surviving expired target receives a current window'
);
select * from finish();
rollback;
