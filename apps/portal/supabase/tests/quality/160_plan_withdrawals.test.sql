begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='public.training_program_publications'::regclass),'publication RLS forced');
select ok(not has_table_privilege('authenticated','public.training_program_publications','INSERT,UPDATE,DELETE'),'no direct publication mutation');
select ok(not has_table_privilege('anon','public.training_program_publications','SELECT'),'anonymous publication read denied');
select ok(not has_function_privilege('anon','public.publish_training_program(uuid,uuid,bigint,uuid,uuid)','EXECUTE'),'anonymous publication RPC denied');
select ok(not has_table_privilege('authenticated','app_private.training_publication_receipts','SELECT'),'receipts private');
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new)
select ('1d100000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','publish.'||n||'@example.test','',now(),'{}','{}',now(),now(),'','','','' from generate_series(1,6)n;
insert into auth.sessions(id,user_id,created_at,updated_at)
select ('8d100000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,('1d100000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,now(),now() from generate_series(1,6)n;
insert into public.organizations(id,name,created_by) values
('2d100000-0000-4000-8000-000000000001','Publication tests','1d100000-0000-4000-8000-000000000004'),
('2d100000-0000-4000-8000-000000000002','Other publication org','1d100000-0000-4000-8000-000000000003');
insert into public.organization_memberships(organization_id,user_id,role,status,activated_at,created_by)
select case when n=3 then '2d100000-0000-4000-8000-000000000002' else '2d100000-0000-4000-8000-000000000001' end::uuid,
('1d100000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,case when n in(5,6) then 'CLIENT' when n in(3,4) then 'ADMIN' else 'COACH' end::public.app_role,'ACTIVE',now(),'1d100000-0000-4000-8000-000000000004' from generate_series(1,6)n;
insert into app_private.coach_session_attestations(session_id,user_id,method,verified_at,expires_at)
select ('8d100000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,('1d100000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'email_otp',now(),now()+interval '1 day' from generate_series(1,4)n;
insert into public.clients(id,organization_id,auth_user_id,email,first_name,last_name,status,created_by)
select ('5d100000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'2d100000-0000-4000-8000-000000000001',('1d100000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'publish.'||n||'@example.test','Client',n::text,'ACTIVE','1d100000-0000-4000-8000-000000000001' from unnest(array[1,5,6]) n;
insert into public.coach_client_assignments(organization_id,client_id,coach_user_id,status,created_by)
select organization_id,id,'1d100000-0000-4000-8000-000000000001','ACTIVE','1d100000-0000-4000-8000-000000000001' from public.clients where organization_id='2d100000-0000-4000-8000-000000000001';
insert into public.training_exercises(id,organization_id,name,default_unit,created_by) values('7d100000-0000-4000-8000-000000000050','2d100000-0000-4000-8000-000000000001','Press','lb','1d100000-0000-4000-8000-000000000001');
create function pg_temp.become(n integer,method text default 'password') returns void language plpgsql as $$ begin
perform set_config('request.jwt.claim.sub','1d100000-0000-4000-8000-'||lpad(n::text,12,'0'),true);
perform set_config('request.jwt.claims',jsonb_build_object('sub','1d100000-0000-4000-8000-'||lpad(n::text,12,'0'),'role','authenticated','aal','aal1','session_id','8d100000-0000-4000-8000-'||lpad(n::text,12,'0'),'amr',jsonb_build_array(jsonb_build_object('method',method)))::text,true);
end $$;
create function pg_temp.document() returns jsonb language sql as $$ select '{"schemaVersion":1,"phaseId":"7d100000-0000-4000-8000-000000000001","title":{"fr":"Force","en":"Strength"},"weeks":[{"number":1,"objective":{"fr":"","en":""},"sessions":[{"id":"7d100000-0000-4000-8000-000000000002","title":{"fr":"A","en":"A"},"type":"training","required":true,"schedule":{"mode":"flexible","day":null},"warmup":{"fr":"","en":""},"blocks":[{"id":"7d100000-0000-4000-8000-000000000003","label":{"fr":"","en":""},"mode":"standard","restSeconds":90,"exercises":[{"id":"7d100000-0000-4000-8000-000000000004","libraryExerciseId":"7d100000-0000-4000-8000-000000000050","name":"Press","cue":{"fr":"","en":""},"media":null,"prescription":{"sets":3,"reps":"8-10","targetRir":2,"restSeconds":90,"tempo":"","loadTarget":"40 lb","unit":"lb"}}]}]}]}]}'::jsonb $$;
create temp table results(label text primary key,snapshot jsonb);
grant select,insert on results to authenticated; grant select on results to service_role;
create function pg_temp.draft_id() returns uuid language sql as $$ select (snapshot->>'id')::uuid from results where label='draft' $$;
create function pg_temp.pub_id() returns uuid language sql as $$ select (snapshot->>'id')::uuid from results where label='published' $$;
create function pg_temp.publish(v bigint default 1,prior uuid default null,k uuid default '6d100000-0000-4000-8000-000000000001',c uuid default '5d100000-0000-4000-8000-000000000005') returns jsonb language sql as $$ select public.publish_training_program(c,pg_temp.draft_id(),v,prior,k) $$;

create function pg_temp.followup_nutrition() returns jsonb language sql immutable as $$
 select '{"title":{"fr":"Plan QA","en":"QA plan"},"targets":{"calories":null,"proteinG":null,"carbohydrateG":null,"fatG":null},"meals":[{"id":"b1550000-0000-4000-8000-000000000001","title":{"fr":"Repas QA","en":"QA meal"},"portions":{"fr":"Une portion test","en":"One test portion"},"notes":{"fr":"","en":""}}],"instructions":{"fr":"","en":""},"preparation":{"fr":"","en":""},"grocery":{"fr":"","en":""}}'::jsonb
$$;

-- Append-only facts are readable only through each publication's own capability.
select ok((select bool_and(relrowsecurity and relforcerowsecurity) from pg_class where oid in('public.training_program_withdrawals'::regclass,'public.nutrition_plan_withdrawals'::regclass)),'both withdrawal tables force RLS');
select ok(not has_table_privilege('authenticated','public.training_program_withdrawals','INSERT,UPDATE,DELETE'),'Training fact writes are RPC-only');
select ok(not has_table_privilege('authenticated','public.nutrition_plan_withdrawals','INSERT,UPDATE,DELETE'),'Nutrition fact writes are RPC-only');
select ok(not has_table_privilege('anon','public.training_program_withdrawals','SELECT'),'anonymous cannot read withdrawal metadata');
select ok(not has_table_privilege('authenticated','app_private.training_withdrawal_receipts','SELECT'),'withdrawal receipts stay private');
select ok(not has_function_privilege('anon','public.withdraw_training_program(uuid,uuid,uuid)','EXECUTE'),'anonymous cannot withdraw');
create function pg_temp.latest_pub() returns uuid language sql as $$ select (snapshot->>'id')::uuid from results where label='latest' $$;
create function pg_temp.withdraw_training(k uuid default '6d100000-0000-4000-8000-000000000010',p uuid default null) returns jsonb language sql as $$ select public.withdraw_training_program('5d100000-0000-4000-8000-000000000005',coalesce(p,pg_temp.latest_pub()),k) $$;
create function pg_temp.nutrition_id() returns uuid language sql as $$ select (snapshot->>'publicationId')::uuid from results where label='nutrition' $$;
create function pg_temp.withdraw_nutrition(k uuid default '6d100000-0000-4000-8000-000000000020') returns jsonb language sql as $$ select public.mutate_coach_nutrition('5d100000-0000-4000-8000-000000000005',jsonb_build_object('action','withdraw','expectedPublicationId',pg_temp.nutrition_id(),'clientMutationId',k)) $$;
set local role authenticated;
select pg_temp.become(1);
insert into results values('draft',public.save_training_program_draft(null,pg_temp.document(),0,gen_random_uuid()));
insert into results values('published',pg_temp.publish());
select lives_ok('select public.save_training_program_draft(pg_temp.draft_id(),pg_temp.document(),1,gen_random_uuid())','save a separate second draft version');
insert into results values('latest',pg_temp.publish(2,pg_temp.pub_id(),gen_random_uuid()));
select pg_temp.become(5,'otp');
insert into results values('workout',public.save_training_session_result(pg_temp.latest_pub(),1,'7d100000-0000-4000-8000-000000000002',0,'6d100000-0000-4000-8000-000000000030','IN_PROGRESS','[]',''));
select throws_ok('select pg_temp.withdraw_training()','P0001','FE_FORBIDDEN','Client cannot withdraw a Coach plan');
select pg_temp.become(2);
select throws_ok('select pg_temp.withdraw_training()','P0001','FE_NOT_FOUND','unassigned Coach cannot withdraw');
select pg_temp.become(3);
select throws_ok('select pg_temp.withdraw_training()','P0001','FE_NOT_FOUND','other organization Admin cannot withdraw');
select pg_temp.become(1,'otp');
select throws_ok('select pg_temp.withdraw_training()','P0001','FE_FORBIDDEN','unverified staff session cannot withdraw');
select pg_temp.become(1);
select throws_ok('select pg_temp.withdraw_training(gen_random_uuid(),pg_temp.pub_id())','P0001','FE_VERSION_CONFLICT','cannot withdraw superseded revision A');
select is(pg_temp.withdraw_training(),' {"program":null}'::jsonb,'withdraw B without deleting it');
select is(pg_temp.withdraw_training(),' {"program":null}'::jsonb,'identical withdrawal is idempotent');
select throws_ok('select pg_temp.withdraw_training(gen_random_uuid())','P0001','FE_VERSION_CONFLICT','a distinct stale withdrawal conflicts');
select throws_ok($$select pg_temp.withdraw_training('6d100000-0000-4000-8000-000000000010',pg_temp.pub_id())$$,'P0001','FE_IDEMPOTENCY_CONFLICT','same key cannot target another publication');
select is(public.get_training_publication_for_coach('5d100000-0000-4000-8000-000000000005')->'program','null'::jsonb,'older A never resurrects when B withdrawn');
select is((select count(*) from public.training_program_publications),2::bigint,'all publication history retained');
select is((select count(*) from public.training_program_withdrawals),1::bigint,'only one append-only fact');
select throws_ok('update public.training_program_withdrawals set withdrawn_at=now()','42501',null,'browser cannot alter a withdrawal');
select pg_temp.become(5,'otp');
select is((select count(*) from public.training_program_withdrawals),1::bigint,'own Client sees retirement metadata');
select ok(public.get_training_session_result(pg_temp.latest_pub(),1,'7d100000-0000-4000-8000-000000000002')#>>'{publication,withdrawnAt}' is not null,'historical result explicitly exposes retirement');
select is(public.get_training_session_result(pg_temp.latest_pub(),1,'7d100000-0000-4000-8000-000000000002')->'workout',(select snapshot-'session' from results where label='workout'),'saved historical workout preserved exactly');
select throws_ok($$select public.save_training_session_result(pg_temp.latest_pub(),1,'7d100000-0000-4000-8000-000000000002',1,gen_random_uuid(),'IN_PROGRESS','[]','')$$,'P0001','FE_WITHDRAWN_PUBLICATION','cannot update an existing workout on withdrawn plan');
select throws_ok($$select public.save_training_session_result(pg_temp.latest_pub(),1,'7d100000-0000-4000-8000-000000000002',0,'6d100000-0000-4000-8000-000000000030','IN_PROGRESS','[]','')$$,'P0001','FE_WITHDRAWN_PUBLICATION','even old save receipt cannot authorize withdrawn mutation');
select pg_temp.become(6,'otp');
select is((select count(*) from public.training_program_withdrawals),0::bigint,'another Client sees no retirement facts');
select pg_temp.become(2);
select is((select count(*) from public.training_program_withdrawals),0::bigint,'unassigned Coach sees no retirement facts');
select pg_temp.become(1);
select throws_ok('select pg_temp.publish(2,null,gen_random_uuid())','P0001','FE_ALREADY_PUBLISHED','withdrawal does not remove unique draft-version publication constraint');
select lives_ok('select public.save_training_program_draft(pg_temp.draft_id(),pg_temp.document(),2,gen_random_uuid())','save new version before republishing');
insert into results values('replacement',pg_temp.publish(3,null,gen_random_uuid()));
select is((select snapshot->>'revision' from results where label='replacement'),'3','publication revisions remain monotone after withdrawal');
select lives_ok('select pg_temp.withdraw_training()','old withdrawal replay remains valid after new publication');
select is(public.get_training_publication_for_coach('5d100000-0000-4000-8000-000000000005')->'program',(select snapshot from results where label='replacement'),'replay cannot withdraw the new C publication');

select lives_ok($$select public.mutate_coach_nutrition('5d100000-0000-4000-8000-000000000005',jsonb_build_object('action','save','expectedVersion',0,'clientMutationId',gen_random_uuid(),'document',pg_temp.followup_nutrition()))$$,'save native Nutrition');
insert into results values('nutrition',public.mutate_coach_nutrition('5d100000-0000-4000-8000-000000000005',jsonb_build_object('action','publish','expectedVersion',1,'expectedPublicationId',null,'clientMutationId',gen_random_uuid())));
select pg_temp.become(5,'otp');
select throws_ok('select pg_temp.withdraw_nutrition()','P0001','FE_FORBIDDEN','Client cannot withdraw Nutrition');
select pg_temp.become(2);
select throws_ok('select pg_temp.withdraw_nutrition()','P0001','FE_NOT_FOUND','unassigned Coach cannot withdraw Nutrition');
select pg_temp.become(3);
select throws_ok('select pg_temp.withdraw_nutrition()','P0001','FE_NOT_FOUND','foreign Admin cannot withdraw Nutrition');
select pg_temp.become(1,'otp');
select throws_ok('select pg_temp.withdraw_nutrition()','P0001','FE_FORBIDDEN','unverified staff cannot withdraw Nutrition');
select pg_temp.become(1);
select lives_ok('select pg_temp.withdraw_nutrition()','withdraw Nutrition without requiring a draft version');
select lives_ok('select pg_temp.withdraw_nutrition()','identical Nutrition withdrawal is idempotent');
select throws_ok('select pg_temp.withdraw_nutrition(gen_random_uuid())','P0001','FE_VERSION_CONFLICT','stale different-key Nutrition withdrawal conflicts');
select is(public.get_followup_for_coach('5d100000-0000-4000-8000-000000000005','nutrition')->'publication','null'::jsonb,'Nutrition has no current plan after withdrawal');
select ok(public.get_followup_for_coach('5d100000-0000-4000-8000-000000000005','nutrition')#>>'{history,0,withdrawnAt}' is not null,'retired Nutrition remains explicitly marked in history');
select pg_temp.become(5,'otp');
select is((select count(*) from public.nutrition_plan_withdrawals),1::bigint,'own Client sees Nutrition retirement metadata');
select pg_temp.become(6,'otp');
select is((select count(*) from public.nutrition_plan_withdrawals),0::bigint,'another Client cannot see Nutrition retirement');
select pg_temp.become(1);
select lives_ok($$select public.mutate_coach_nutrition('5d100000-0000-4000-8000-000000000005',jsonb_build_object('action','save','expectedVersion',1,'clientMutationId',gen_random_uuid(),'document',pg_temp.followup_nutrition()))$$,'Nutrition draft remains usable');
insert into results values('nutrition-replacement',public.mutate_coach_nutrition('5d100000-0000-4000-8000-000000000005',jsonb_build_object('action','publish','expectedVersion',2,'expectedPublicationId',null,'clientMutationId',gen_random_uuid())));
select is((select snapshot->>'revision' from results where label='nutrition-replacement'),'2','Nutrition revisions remain monotone after withdrawal');
select lives_ok('select pg_temp.withdraw_nutrition()','old Nutrition withdrawal replay does not mutate state');
select is(public.get_followup_for_coach('5d100000-0000-4000-8000-000000000005','nutrition')#>>'{publication,id}',(select snapshot->>'publicationId' from results where label='nutrition-replacement'),'replay cannot hide new Nutrition publication');
reset role;
select throws_ok('delete from public.training_program_withdrawals','P0001','FE_IMMUTABLE_FOLLOWUP','even privileged accidental deletion of withdrawal refused');
select throws_ok('update public.nutrition_plan_withdrawals set withdrawn_at=now()','P0001','FE_IMMUTABLE_FOLLOWUP','even privileged accidental edit refused');
update public.coach_client_assignments set status='PAUSED' where client_id='5d100000-0000-4000-8000-000000000005';
set local role authenticated;
select pg_temp.become(1);
select throws_ok('select pg_temp.withdraw_training()','P0001','FE_NOT_FOUND','revoked assignment blocks Training receipt replay');
select throws_ok('select pg_temp.withdraw_nutrition()','P0001','FE_NOT_FOUND','revoked assignment blocks Nutrition receipt replay');
reset role;
set local role service_role;
select is((select count(*) from public.audit_events where organization_id='2d100000-0000-4000-8000-000000000001' and command='WITHDRAW_TRAINING_PROGRAM'),1::bigint,'one safe Training withdrawal audit despite retries');
select is((select count(*) from public.audit_events where organization_id='2d100000-0000-4000-8000-000000000001' and command='WITHDRAW_NUTRITION_PLAN'),1::bigint,'one safe Nutrition withdrawal audit despite retries');
reset role;
select * from finish();
rollback;

