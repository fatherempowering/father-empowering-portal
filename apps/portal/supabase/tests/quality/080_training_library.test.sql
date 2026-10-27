begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select ok((select relrowsecurity and relforcerowsecurity from pg_class
  where oid='public.training_exercises'::regclass), 'library RLS is enabled and forced');
select ok(not has_table_privilege('anon','public.training_exercises','SELECT'), 'anonymous users cannot read exercises');
select ok(not has_table_privilege('authenticated','public.training_exercises','INSERT'), 'no direct authenticated insert');
select ok(not has_table_privilege('authenticated','public.training_exercises','UPDATE'), 'no direct authenticated update');
select ok(not has_table_privilege('authenticated','public.training_exercises','DELETE'), 'no direct authenticated delete');
select ok(not has_table_privilege('authenticated','app_private.training_exercise_receipts','SELECT'), 'receipts are private');
select ok(not has_function_privilege('anon',
  'public.save_training_exercise(uuid,text,text,text,text,text,boolean,bigint,uuid)','EXECUTE'), 'RPC not callable anonymously');
select ok((select prosecdef and proconfig @> array['search_path=""']
  from pg_proc where oid='public.save_training_exercise(uuid,text,text,text,text,text,boolean,bigint,uuid)'::regprocedure),
  'mutation has a fixed empty search path');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new)
select ('18000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  '00000000-0000-0000-0000-000000000000','authenticated','authenticated',
  'training.'||n||'@example.test','',now(),'{}','{}',now(),now(),'','','',''
from generate_series(1,5) n;
insert into auth.sessions (id,user_id,created_at,updated_at)
select ('88000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  ('18000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,now(),now()
from generate_series(1,5) n;
insert into public.organizations (id,name,created_by) values
  ('28000000-0000-4000-8000-000000000001','Training tests','18000000-0000-4000-8000-000000000004'),
  ('28000000-0000-4000-8000-000000000002','Other organization','18000000-0000-4000-8000-000000000003');
insert into public.organization_memberships (organization_id,user_id,role,status,activated_at,created_by)
select case when n=3 then '28000000-0000-4000-8000-000000000002' else '28000000-0000-4000-8000-000000000001' end::uuid,
  ('18000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  case when n=5 then 'CLIENT' when n in (3,4) then 'ADMIN' else 'COACH' end::public.app_role,
  'ACTIVE',now(),'18000000-0000-4000-8000-000000000004'
from generate_series(1,5) n;
insert into app_private.coach_session_attestations (session_id,user_id,method,verified_at,expires_at)
select ('88000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  ('18000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'email_otp',now(),now()+interval '1 day'
from generate_series(1,4) n;

create function pg_temp.become(n integer, method text default 'password') returns void
language plpgsql as $$ begin
  perform set_config('request.jwt.claim.sub','18000000-0000-4000-8000-'||lpad(n::text,12,'0'),true);
  perform set_config('request.jwt.claims',jsonb_build_object(
    'sub','18000000-0000-4000-8000-'||lpad(n::text,12,'0'),
    'role','authenticated','aal','aal1',
    'session_id','88000000-0000-4000-8000-'||lpad(n::text,12,'0'),
    'amr',jsonb_build_array(jsonb_build_object('method',method)))::text,true);
end $$;
create function pg_temp.save_example(
  exercise_id uuid default null, version bigint default 0,
  command_id uuid default '68000000-0000-4000-8000-000000000001',
  title text default 'Dumbbell Press', archived boolean default false
) returns jsonb language sql as $$
  select public.save_training_exercise(exercise_id,title,'Dumbbells','Contrôle','Control','lb',archived,version,command_id);
$$;
create temp table exercise_test_results (label text primary key, snapshot jsonb);
grant select,insert on exercise_test_results to authenticated;
grant select on exercise_test_results to service_role;

set local role authenticated;
select pg_temp.become(1,'otp');
select throws_ok('select pg_temp.save_example()', 'P0001','FE_FORBIDDEN','OTP-only staff session cannot write');
select is((select count(*) from public.training_exercises),0::bigint,'OTP-only staff sees no library');
select pg_temp.become(1,'recovery');
select throws_ok('select pg_temp.save_example()', 'P0001','FE_FORBIDDEN','recovery session cannot write');
select pg_temp.become(5);
select throws_ok('select pg_temp.save_example()', 'P0001','FE_FORBIDDEN','Client cannot write');

select pg_temp.become(1);
select lives_ok($$insert into exercise_test_results values ('created',pg_temp.save_example())$$,'verified Coach creates an exercise');
select is((select count(*) from public.training_exercises),1::bigint,'Coach can read the library');
select is((select (snapshot->>'version')::integer from exercise_test_results where label='created'),1,'first version is one');
select is(pg_temp.save_example(),(select snapshot from exercise_test_results where label='created'),'identical retry returns exact receipt');
select is((select count(*) from public.training_exercises),1::bigint,'retry creates no duplicate');
select throws_ok($$select pg_temp.save_example(title=>'Changed')$$,'P0001','FE_IDEMPOTENCY_CONFLICT','changed payload cannot reuse key');
select throws_ok($$select pg_temp.save_example(command_id=>'68000000-0000-4000-8000-000000000099',title=>' ')$$,'P0001','FE_INVALID_TRAINING_EXERCISE','blank name rejected by SQL');
select throws_ok($$select public.save_training_exercise(null,'Press','','','','ton',false,0,'68000000-0000-4000-8000-000000000099')$$,'P0001','FE_INVALID_TRAINING_EXERCISE','unsupported unit rejected by SQL');
select throws_ok($$select public.save_training_exercise(null,'Press',null,'','','lb',false,0,'68000000-0000-4000-8000-000000000099')$$,'P0001','FE_INVALID_TRAINING_EXERCISE','null cannot bypass validation');
select throws_ok($$select pg_temp.save_example(command_id=>'68000000-0000-4000-8000-000000000099',archived=>true)$$,'P0001','FE_INVALID_TRAINING_EXERCISE','cannot create an already archived exercise');

select pg_temp.become(2);
select is((select count(*) from public.training_exercises),1::bigint,'other verified Coach in same organization can reuse library');
select throws_ok($$select pg_temp.save_example((select (snapshot->>'id')::uuid from exercise_test_results where label='created'),1,'68000000-0000-4000-8000-000000000002')$$,
  'P0001','FE_NOT_FOUND','other Coach cannot edit owner exercise');
select pg_temp.become(3);
select is((select count(*) from public.training_exercises),0::bigint,'other organization Admin cannot read library');
select throws_ok($$select pg_temp.save_example((select (snapshot->>'id')::uuid from exercise_test_results where label='created'),1,'68000000-0000-4000-8000-000000000002')$$,
  'P0001','FE_NOT_FOUND','other organization Admin cannot edit');
select pg_temp.become(5);
select is((select count(*) from public.training_exercises),0::bigint,'Client cannot read library even in same organization');

select pg_temp.become(1);
select lives_ok($$insert into exercise_test_results values ('updated',pg_temp.save_example((select (snapshot->>'id')::uuid from exercise_test_results where label='created'),1,'68000000-0000-4000-8000-000000000002','Incline Dumbbell Press'))$$,'owner can update');
select is((select (snapshot->>'version')::integer from exercise_test_results where label='updated'),2,'update increments version');
select throws_ok($$select pg_temp.save_example((select (snapshot->>'id')::uuid from exercise_test_results where label='created'),1,'68000000-0000-4000-8000-000000000003')$$,
  'P0001','FE_VERSION_CONFLICT','stale update cannot overwrite');
select is((select name from public.training_exercises),'Incline Dumbbell Press','failed update leaves previous value intact');
select pg_temp.become(4);
select lives_ok($$select pg_temp.save_example((select (snapshot->>'id')::uuid from exercise_test_results where label='created'),2,'68000000-0000-4000-8000-000000000004','Incline Dumbbell Press',true)$$,'same organization Admin can archive');
select is((select archived from public.training_exercises),true,'archive retains the row');
select lives_ok($$select pg_temp.save_example((select (snapshot->>'id')::uuid from exercise_test_results where label='created'),3,'68000000-0000-4000-8000-000000000005','Incline Dumbbell Press',false)$$,'archive is reversible');
select is((select row_version from public.training_exercises),4::bigint,'restoration increments version');

reset role;
set local role service_role;
select is((select count(*) from public.audit_events where entity_id=(select (snapshot->>'id')::uuid from exercise_test_results where label='created')),
  4::bigint,'four successful mutations produce four audits, not retries or rejections');
reset role;
update public.organization_memberships set status='SUSPENDED' where user_id='18000000-0000-4000-8000-000000000001';
set local role authenticated;
select pg_temp.become(1);
select is((select count(*) from public.training_exercises),0::bigint,'suspended Coach loses read access');
select throws_ok('select pg_temp.save_example()','P0001','FE_FORBIDDEN','old receipt cannot bypass revoked membership');
reset role;
select * from finish();
rollback;
