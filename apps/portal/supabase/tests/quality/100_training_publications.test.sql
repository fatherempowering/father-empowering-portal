begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='public.training_program_publications'::regclass),'publication RLS forced');
select ok(not has_table_privilege('authenticated','public.training_program_publications','INSERT,UPDATE,DELETE'),'no direct publication mutation');
select ok(not has_table_privilege('anon','public.training_program_publications','SELECT'),'anonymous publication read denied');
select ok(not has_function_privilege('anon','public.publish_training_program(uuid,uuid,bigint,uuid,uuid)','EXECUTE'),'anonymous publication RPC denied');
select ok(not has_table_privilege('authenticated','app_private.training_publication_receipts','SELECT'),'receipts private');
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new)
select ('19100000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','publish.'||n||'@example.test','',now(),'{}','{}',now(),now(),'','','','' from generate_series(1,6)n;
insert into auth.sessions(id,user_id,created_at,updated_at)
select ('89100000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,('19100000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,now(),now() from generate_series(1,6)n;
insert into public.organizations(id,name,created_by) values
('29100000-0000-4000-8000-000000000001','Publication tests','19100000-0000-4000-8000-000000000004'),
('29100000-0000-4000-8000-000000000002','Other publication org','19100000-0000-4000-8000-000000000003');
insert into public.organization_memberships(organization_id,user_id,role,status,activated_at,created_by)
select case when n=3 then '29100000-0000-4000-8000-000000000002' else '29100000-0000-4000-8000-000000000001' end::uuid,
('19100000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,case when n in(5,6) then 'CLIENT' when n in(3,4) then 'ADMIN' else 'COACH' end::public.app_role,'ACTIVE',now(),'19100000-0000-4000-8000-000000000004' from generate_series(1,6)n;
insert into app_private.coach_session_attestations(session_id,user_id,method,verified_at,expires_at)
select ('89100000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,('19100000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'email_otp',now(),now()+interval '1 day' from generate_series(1,4)n;
insert into public.clients(id,organization_id,auth_user_id,email,first_name,last_name,status,created_by)
select ('59100000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'29100000-0000-4000-8000-000000000001',('19100000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'publish.'||n||'@example.test','Client',n::text,'ACTIVE','19100000-0000-4000-8000-000000000001' from unnest(array[1,5,6]) n;
insert into public.coach_client_assignments(organization_id,client_id,coach_user_id,status,created_by)
select organization_id,id,'19100000-0000-4000-8000-000000000001','ACTIVE','19100000-0000-4000-8000-000000000001' from public.clients where organization_id='29100000-0000-4000-8000-000000000001';
insert into public.training_exercises(id,organization_id,name,default_unit,created_by) values('79100000-0000-4000-8000-000000000050','29100000-0000-4000-8000-000000000001','Press','lb','19100000-0000-4000-8000-000000000001');
create function pg_temp.become(n integer,method text default 'password') returns void language plpgsql as $$ begin
perform set_config('request.jwt.claim.sub','19100000-0000-4000-8000-'||lpad(n::text,12,'0'),true);
perform set_config('request.jwt.claims',jsonb_build_object('sub','19100000-0000-4000-8000-'||lpad(n::text,12,'0'),'role','authenticated','aal','aal1','session_id','89100000-0000-4000-8000-'||lpad(n::text,12,'0'),'amr',jsonb_build_array(jsonb_build_object('method',method)))::text,true);
end $$;
create function pg_temp.document() returns jsonb language sql as $$ select '{"schemaVersion":1,"phaseId":"79100000-0000-4000-8000-000000000001","title":{"fr":"Force","en":"Strength"},"weeks":[{"number":1,"objective":{"fr":"","en":""},"sessions":[{"id":"79100000-0000-4000-8000-000000000002","title":{"fr":"A","en":"A"},"type":"training","required":true,"schedule":{"mode":"flexible","day":null},"warmup":{"fr":"","en":""},"blocks":[{"id":"79100000-0000-4000-8000-000000000003","label":{"fr":"","en":""},"mode":"standard","restSeconds":90,"exercises":[{"id":"79100000-0000-4000-8000-000000000004","libraryExerciseId":"79100000-0000-4000-8000-000000000050","name":"Press","cue":{"fr":"","en":""},"media":null,"prescription":{"sets":3,"reps":"8-10","targetRir":2,"restSeconds":90,"tempo":"","loadTarget":"40 lb","unit":"lb"}}]}]}]}]}'::jsonb $$;
create temp table results(label text primary key,snapshot jsonb);
grant select,insert on results to authenticated; grant select on results to service_role;
create function pg_temp.draft_id() returns uuid language sql as $$ select (snapshot->>'id')::uuid from results where label='draft' $$;
create function pg_temp.pub_id() returns uuid language sql as $$ select (snapshot->>'id')::uuid from results where label='published' $$;
create function pg_temp.publish(v bigint default 1,prior uuid default null,k uuid default '69100000-0000-4000-8000-000000000001',c uuid default '59100000-0000-4000-8000-000000000005') returns jsonb language sql as $$ select public.publish_training_program(c,pg_temp.draft_id(),v,prior,k) $$;

select ok(app_private.training_program_publishable(pg_temp.document()),'complete prescription publishable');
select ok(not app_private.training_program_publishable(jsonb_set(pg_temp.document(),'{weeks,0,sessions}','[]')),'empty week unpublishable');
select ok(not app_private.training_program_publishable(jsonb_set(pg_temp.document(),'{weeks,0,sessions,0,title}','{"fr":"","en":""}')),'unnamed session unpublishable');
select ok(not app_private.training_program_publishable(jsonb_set(pg_temp.document(),'{weeks,0,sessions,0,blocks,0,mode}','"superset"')),'one-exercise superset unpublishable');

set local role authenticated;
select pg_temp.become(1);
insert into results values('draft',public.save_training_program_draft(null,jsonb_set(pg_temp.document(),'{weeks,0,sessions}','[]'),0,gen_random_uuid()));
select throws_ok('select pg_temp.publish()','P0001','FE_INVALID_TRAINING_PUBLICATION','incomplete draft denied by RPC');
select lives_ok('select public.save_training_program_draft(pg_temp.draft_id(),pg_temp.document(),1,gen_random_uuid())','complete draft version saved');
select is((public.list_training_recipients()->>'total')::integer,3,'only eligible recipients listed');
select pg_temp.become(1,'otp');
select throws_ok('select pg_temp.publish(2)','P0001','FE_FORBIDDEN','OTP-only staff cannot publish');
select throws_ok('select public.list_training_recipients()','P0001','FE_FORBIDDEN','OTP-only staff cannot enumerate recipients');
select pg_temp.become(5);
select throws_ok('select pg_temp.publish(2)','P0001','FE_FORBIDDEN','Client cannot publish');
select pg_temp.become(2);
select is((public.list_training_recipients()->>'total')::integer,0,'unassigned Coach has no recipients');
select throws_ok('select pg_temp.publish(2)','P0001','FE_NOT_FOUND','unassigned Coach cannot publish');
select pg_temp.become(3);
select throws_ok('select pg_temp.publish(2)','P0001','FE_NOT_FOUND','foreign Admin cannot publish');
select pg_temp.become(1);
select throws_ok('select pg_temp.publish(1)','P0001','FE_VERSION_CONFLICT','stale draft version denied');
insert into results values('published',pg_temp.publish(2));
select is(pg_temp.publish(2),(select snapshot from results where label='published'),'retry returns identical publication');
select throws_ok('select pg_temp.publish(3)','P0001','FE_IDEMPOTENCY_CONFLICT','key reuse with different payload denied');
select is((select count(*) from public.training_program_publications),1::bigint,'owner sees publication');
select throws_ok('update public.training_program_publications set revision=10','42501',null,'authenticated cannot mutate publication');
select pg_temp.become(5,'otp');
select is((select count(*) from public.training_program_publications),1::bigint,'recipient sees own publication');
select is((select count(*) from public.training_program_drafts),0::bigint,'recipient never sees drafts');
select pg_temp.become(6,'otp');
select is((select count(*) from public.training_program_publications),0::bigint,'other Client sees none');
select pg_temp.become(2);
select is((select count(*) from public.training_program_publications),0::bigint,'unassigned same-org Coach sees none');
select pg_temp.become(3);
select is((select count(*) from public.training_program_publications),0::bigint,'foreign Admin sees none');
select pg_temp.become(4);
select is((select count(*) from public.training_program_publications),1::bigint,'same-org verified Admin sees publication');
select pg_temp.become(1);
select lives_ok($$select public.save_training_program_draft(pg_temp.draft_id(),jsonb_set(pg_temp.document(),'{weeks,0,sessions,0,blocks,0,exercises,0,prescription,loadTarget}','"45 lb"'),2,gen_random_uuid())$$,'edit published source as private draft');
select is((select document#>>'{weeks,0,sessions,0,blocks,0,exercises,0,prescription,loadTarget}' from public.training_program_publications),'40 lb','published snapshot does not change with draft');
select throws_ok('select pg_temp.publish(3,null,gen_random_uuid())','P0001','FE_VERSION_CONFLICT','must acknowledge current publication');
select lives_ok('select pg_temp.publish(3,pg_temp.pub_id(),gen_random_uuid())','explicit replacement publishes a new immutable revision');
select is((select count(*) from public.training_program_publications),2::bigint,'previous revision retained');
select is(pg_temp.publish(2),(select snapshot from results where label='published'),'old receipt remains exact after later revision');
select throws_ok('select pg_temp.publish(3,(select id from public.training_program_publications order by revision desc limit 1),gen_random_uuid())','P0001','FE_ALREADY_PUBLISHED','same draft cannot create duplicate revision');
select lives_ok($$select pg_temp.publish(3,null,gen_random_uuid(),'59100000-0000-4000-8000-000000000001')$$,'verified Coach publishes for own personal Client');
select pg_temp.become(1,'otp');
select is((select count(*) from public.training_program_publications),0::bigint,'OTP-only staff cannot read personal plan');
reset role;
select throws_ok('update public.training_program_publications set revision=99','P0001','FE_IMMUTABLE_PUBLICATION','immutable even for accidental privileged update');
select throws_ok('delete from public.training_program_publications','P0001','FE_IMMUTABLE_PUBLICATION','immutable history cannot be deleted');
update public.coach_client_assignments set status='PAUSED' where client_id='59100000-0000-4000-8000-000000000005';
set local role authenticated;
select pg_temp.become(1);
select throws_ok('select pg_temp.publish(2)','P0001','FE_NOT_FOUND','paused assignment blocks receipt replay too');
select is((public.list_training_recipients()->>'total')::integer,2,'paused assignment removed from picker');
select pg_temp.become(5,'otp');
select is((select count(*) from public.training_program_publications),2::bigint,'Client retains their published history while coaching paused');
reset role;
update public.clients set status='SUSPENDED' where id='59100000-0000-4000-8000-000000000005';
set local role authenticated;
select pg_temp.become(5,'otp');
select is((select count(*) from public.training_program_publications),0::bigint,'suspended Client loses publication access');
reset role;
set local role service_role;
select is((select count(*) from public.audit_events where organization_id='29100000-0000-4000-8000-000000000001' and command='PUBLISH_TRAINING_PROGRAM'),3::bigint,'one audit per committed publication');
select is((select count(*) from public.outbox_events where organization_id='29100000-0000-4000-8000-000000000001'),0::bigint,'no unsolicited email or fake outbox event');
reset role;
select * from finish();
rollback;
