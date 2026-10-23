begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- This fixture is disposable. Neither allowlist ships enabled in a migration.
select is((select count(*) from app_private.training_pilot_catalog),15::bigint,'exactly fifteen fixed pilot templates are seeded');
select is((select count(*) from app_private.training_pilot_organizations),0::bigint,'pilot organizations are disabled by default');
select is((select count(*) from app_private.training_pilot_clients),0::bigint,'pilot recipients are disabled by default');
select ok(not has_table_privilege('authenticated','app_private.training_pilot_catalog','SELECT,INSERT,UPDATE,DELETE'),'browser cannot read or rewrite source templates');
select ok(not has_table_privilege('authenticated','app_private.training_pilot_organizations','SELECT,INSERT,UPDATE,DELETE'),'browser cannot enable an organization');
select ok(not has_table_privilege('authenticated','app_private.training_pilot_clients','SELECT,INSERT,UPDATE,DELETE'),'browser cannot approve a recipient');
select ok(not has_table_privilege('anon','app_private.training_pilot_catalog','SELECT'),'anonymous caller cannot enumerate templates');
select ok(not has_function_privilege('anon','public.select_training_pilot_exercise(text,text,uuid)','EXECUTE'),'anonymous caller cannot select a pilot');
select ok(has_function_privilege('authenticated','public.select_training_pilot_exercise(text,text,uuid)','EXECUTE'),'authenticated caller invokes the guarded selection RPC');
select ok((select prosecdef and proconfig @> array['search_path=""'] from pg_proc where oid='public.select_training_pilot_exercise(text,text,uuid)'::regprocedure),'selection RPC has a fixed search path');
select ok(not has_function_privilege('authenticated','public.provision_training_pilot_test_access(uuid,uuid)','EXECUTE'),'Coach cannot invoke deployment-only test provisioning');
select ok(not has_function_privilege('anon','public.provision_training_pilot_test_access(uuid,uuid)','EXECUTE'),'anonymous caller cannot invoke test provisioning');
select ok(has_function_privilege('service_role','public.provision_training_pilot_test_access(uuid,uuid)','EXECUTE'),'server service role may provision an explicit test scope');
select ok((select bool_and(app_private.training_pilot_valid(pilot)) from app_private.training_pilot_catalog),'all seeded templates satisfy the strict shape contract');
select ok(not app_private.training_pilot_valid(jsonb_set(
  (select pilot from app_private.training_pilot_catalog where source_id='DB_034'),string_to_array(path,','),'null'::jsonb
)), 'JSON null fails closed for '||path)
from unnest(array[
  'sourceId','sourceVersion','sourceCatalogVersion','integrationVersion','usage','name','name,fr','equipment','equipment,id',
  'equipment,labels,fr','instructions','instructions,fr','instructions,fr,setup','instructions,fr,execution','instructions,fr,finish',
  'performance','performance,measure','performance,counting','performance,countingDecision','performance,loadEntryBasis','performance,load','performance,notes'
]) path;
select ok(not app_private.training_pilot_valid(
  (select pilot from app_private.training_pilot_catalog where source_id='DB_034')-'instructions'
),'missing instructions fail closed');
select ok(not app_private.training_pilot_valid(
  (select pilot from app_private.training_pilot_catalog where source_id='DB_034')||'{"approved":true}'
),'unexpected approval metadata fails closed');

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new)
select ('1f000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','pilot.'||n||'@example.test','',now(),'{}','{}',now(),now(),'','','','' from generate_series(1,7)n;
insert into auth.sessions(id,user_id,created_at,updated_at)
select ('8f000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,('1f000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,now(),now() from generate_series(1,7)n;
insert into public.organizations(id,name,created_by) values
('2f000000-0000-4000-8000-000000000001','Pilot fixture','1f000000-0000-4000-8000-000000000004'),
('2f000000-0000-4000-8000-000000000002','Foreign pilot fixture','1f000000-0000-4000-8000-000000000003');
insert into public.organization_memberships(organization_id,user_id,role,status,activated_at,created_by)
select case when n=3 then '2f000000-0000-4000-8000-000000000002' else '2f000000-0000-4000-8000-000000000001' end::uuid,
('1f000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
case when n in(5,6) then 'CLIENT' when n in(3,4) then 'ADMIN' else 'COACH' end::public.app_role,
'ACTIVE',now(),'1f000000-0000-4000-8000-000000000004' from generate_series(1,7)n;
insert into app_private.coach_session_attestations(session_id,user_id,method,verified_at,expires_at)
select ('8f000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,('1f000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'email_otp',now(),now()+interval '1 day' from generate_series(1,4)n;
insert into public.clients(id,organization_id,auth_user_id,email,first_name,last_name,status,created_by)
select ('5f000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'2f000000-0000-4000-8000-000000000001',('1f000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'pilot.'||n||'@example.test','Pilot',n::text,'ACTIVE','1f000000-0000-4000-8000-000000000001' from unnest(array[5,6])n;
insert into public.coach_client_assignments(organization_id,client_id,coach_user_id,status,created_by)
select organization_id,id,'1f000000-0000-4000-8000-000000000001','ACTIVE','1f000000-0000-4000-8000-000000000001' from public.clients where organization_id='2f000000-0000-4000-8000-000000000001';
insert into public.training_exercises(id,organization_id,name,default_unit,created_by) values
('7f000000-0000-4000-8000-000000000050','2f000000-0000-4000-8000-000000000001','Existing normal exercise','lb','1f000000-0000-4000-8000-000000000001');

create function pg_temp.become(n integer,method text default 'password') returns void language plpgsql as $$ begin
perform set_config('request.jwt.claim.sub','1f000000-0000-4000-8000-'||lpad(n::text,12,'0'),true);
perform set_config('request.jwt.claims',jsonb_build_object('sub','1f000000-0000-4000-8000-'||lpad(n::text,12,'0'),'role','authenticated','aal','aal1','session_id','8f000000-0000-4000-8000-'||lpad(n::text,12,'0'),'amr',jsonb_build_array(jsonb_build_object('method',method)))::text,true);
end $$;
create temp table pilot_sources as select source_id,pilot->>'sourceVersion' as version from app_private.training_pilot_catalog;
create temp table selected_pilots(source_id text primary key,snapshot jsonb);
create temp table pilot_results(label text primary key,snapshot jsonb);
grant select on pilot_sources to authenticated;
grant select,insert on selected_pilots,pilot_results to authenticated;
grant select on selected_pilots,pilot_results to service_role;
create function pg_temp.pick(source text default 'DB_034',version text default '1.2.0',key uuid default '6f000000-0000-4000-8000-000000000001') returns jsonb language sql as $$ select public.select_training_pilot_exercise(source,version,key) $$;
create function pg_temp.snapshot(source text) returns jsonb language sql as $$ select snapshot from selected_pilots where source_id=source $$;
create function pg_temp.library_id(source text) returns uuid language sql as $$ select (pg_temp.snapshot(source)->>'id')::uuid $$;

set local role authenticated;
select pg_temp.become(1);
select throws_ok('select pg_temp.pick()','P0001','FE_PILOT_DISABLED','verified Coach cannot select before organization enablement');
select throws_ok($$insert into app_private.training_pilot_organizations values('2f000000-0000-4000-8000-000000000001')$$,'42501',null,'Coach cannot self-enable the pilot');
reset role;
set local role service_role;
select public.provision_training_pilot_test_access('2f000000-0000-4000-8000-000000000001');
reset role;
set local role authenticated;
select pg_temp.become(1,'otp');
select throws_ok('select pg_temp.pick()','P0001','FE_FORBIDDEN','OTP-only Coach cannot select a pilot');
select pg_temp.become(1,'recovery');
select throws_ok('select pg_temp.pick()','P0001','FE_FORBIDDEN','recovery session cannot select a pilot');
select pg_temp.become(7);
select throws_ok('select pg_temp.pick()','P0001','FE_FORBIDDEN','password-only unverified Coach cannot select a pilot');
select pg_temp.become(5,'otp');
select throws_ok('select pg_temp.pick()','P0001','FE_FORBIDDEN','Client cannot select a library exercise');
select pg_temp.become(3);
select throws_ok('select pg_temp.pick()','P0001','FE_PILOT_DISABLED','foreign organization is not implicitly enabled');
select pg_temp.become(1);
select throws_ok($$select pg_temp.pick('UNKNOWN','1.0.0',gen_random_uuid())$$,'P0001','FE_INVALID_PILOT_EXERCISE','unknown pilot identifier denied');
select throws_ok($$select pg_temp.pick('DB_034','9.0.0',gen_random_uuid())$$,'P0001','FE_INVALID_PILOT_EXERCISE','unknown source revision denied');
select throws_ok($$select pg_temp.pick('DB_034','1.2.0',null)$$,'P0001','FE_INVALID_PILOT_EXERCISE','missing idempotency key denied');
insert into selected_pilots values('DB_034',pg_temp.pick());
insert into selected_pilots select source_id,pg_temp.pick(source_id,version,gen_random_uuid()) from pilot_sources where source_id<>'DB_034';
select is((select count(*) from selected_pilots),15::bigint,'all fifteen generic variants can be selected in the approved organization');
select is((select count(*) from public.training_exercises where pilot is not null),15::bigint,'selection produces exactly fifteen library rows');
select is(pg_temp.pick(),pg_temp.snapshot('DB_034'),'same command returns its exact original snapshot');
select is((pg_temp.pick('DB_034','1.2.0',gen_random_uuid())->>'id')::uuid,pg_temp.library_id('DB_034'),'new command reuses the same organization/source identity');
select throws_ok($$select pg_temp.pick('DB_025','1.2.0','6f000000-0000-4000-8000-000000000001')$$,'P0001','FE_IDEMPOTENCY_CONFLICT','reusing a command for a different exercise is rejected');
select ok((select bool_and(snapshot->>'canEdit'='false') from selected_pilots),'imported pilot rows are explicitly immutable to Coach editing');
select ok((select bool_and(snapshot#>>'{pilot,usage}'='STAGING_TEST') from selected_pilots),'every imported snapshot remains marked as staging test data');
select ok((select bool_and(not (snapshot->'pilot' ? 'machines')) from selected_pilots),'unapproved named machine alternatives never enter prescription snapshots');
select ok(pg_temp.snapshot('DB_034')#>>'{pilot,performance,counting,fr}' like '%bras%','per-arm counting is retained explicitly');
select ok(char_length(pg_temp.snapshot('MA_028')#>>'{pilot,instructions,fr,setup}')+char_length(pg_temp.snapshot('MA_028')#>>'{pilot,instructions,fr,execution}')+char_length(pg_temp.snapshot('MA_028')#>>'{pilot,instructions,fr,finish}')>300,'full instructions are not truncated into the legacy 300-character cue');
select throws_ok($$select public.save_training_exercise(pg_temp.library_id('DB_034'),'Changed','','','','lb',false,1,gen_random_uuid())$$,'P0001','FE_READ_ONLY_PILOT_EXERCISE','ordinary exercise editor cannot mutate imported pilot content');
select throws_ok($$select public.save_training_exercise(pg_temp.library_id('DB_034'),'Changed','','','','lb',true,1,gen_random_uuid())$$,'P0001','FE_READ_ONLY_PILOT_EXERCISE','ordinary exercise editor cannot archive and erase pilot provenance');
select pg_temp.become(2);
select is((pg_temp.pick('DB_034','1.2.0',gen_random_uuid())->>'id')::uuid,pg_temp.library_id('DB_034'),'second verified Coach reuses the organization catalogue without duplicate imports');
select pg_temp.become(1);
reset role;

-- The helper builds the actual wire document from RPC-returned snapshots.
create function pg_temp.document(source text default null) returns jsonb language sql as $$
select jsonb_build_object('schemaVersion',1,'phaseId','7f000000-0000-4000-8000-000000000001','title',jsonb_build_object('fr','Semaine pilote','en','Pilot week'),'weeks',jsonb_build_array(jsonb_build_object(
  'number',1,'objective',jsonb_build_object('fr','','en',''),'sessions',jsonb_build_array(jsonb_build_object(
    'id','7f000000-0000-4000-8000-000000000002','title',jsonb_build_object('fr','Séance pilote','en','Pilot session'),'type','training','required',true,'schedule',jsonb_build_object('mode','flexible','day',null),'warmup',jsonb_build_object('fr','','en',''),
    'blocks',jsonb_build_array(jsonb_build_object('id','7f000000-0000-4000-8000-000000000003','label',jsonb_build_object('fr','','en',''),'mode','standard','restSeconds',60,'exercises',(
      select jsonb_agg(jsonb_build_object('id','7f100000-0000-4000-8000-'||lpad(position::text,12,'0'),'libraryExerciseId',snapshot->'id','name',snapshot->'name','cue',snapshot->'cue','media',null,'pilot',snapshot->'pilot','prescription',jsonb_build_object('sets',1,'reps','8','targetRir',2,'restSeconds',60,'tempo','','loadTarget',case snapshot->>'defaultUnit' when 'configuration' then 'Describe actual setup; no inferred mass' when 'distance' then '25 m with two 20 lb dumbbells' when 'sec' then '30 seconds' else '20 lb' end,'unit',snapshot->'defaultUnit')) order by position)
      from (select *,row_number() over(order by source_id) position from selected_pilots) s where source is null or s.source_id=source
    )))
  ))
))) $$;
create function pg_temp.save(doc jsonb default pg_temp.document()) returns jsonb language sql as $$ select public.save_training_program_draft(null,doc,0,gen_random_uuid()) $$;
create function pg_temp.draft_id() returns uuid language sql as $$ select (snapshot->>'id')::uuid from pilot_results where label='draft' $$;
create function pg_temp.publication_id() returns uuid language sql as $$ select (snapshot->>'id')::uuid from pilot_results where label='publication' $$;
create function pg_temp.publish(client uuid default '5f000000-0000-4000-8000-000000000005',key uuid default '6f000000-0000-4000-8000-000000000002') returns jsonb language sql as $$ select public.publish_training_program(client,pg_temp.draft_id(),1,null,key) $$;
select ok(app_private.training_program_publishable(pg_temp.document()),'complete fifteen-exercise document satisfies the structural publication validator');
set local role authenticated;
select pg_temp.become(1);
insert into pilot_results values('draft',pg_temp.save());
select is((select snapshot->'document' from pilot_results where label='draft'),pg_temp.document(),'saved draft preserves every full pilot snapshot');
select throws_ok($$select pg_temp.save(pg_temp.document('DB_034')#-'{weeks,0,sessions,0,blocks,0,exercises,0,pilot}')$$,'P0001',null,'pilot identity cannot be submitted without its provenance');
select throws_ok($$select pg_temp.save(jsonb_set(pg_temp.document('DB_034'),'{weeks,0,sessions,0,blocks,0,exercises,0,pilot,instructions,fr,finish}','"Invented instruction"'))$$,'P0001',null,'browser cannot replace canonical exercise instructions');
select throws_ok($$select pg_temp.save(jsonb_set(pg_temp.document('DB_034'),'{weeks,0,sessions,0,blocks,0,exercises,0,pilot,sourceVersion}','"9.0.0"'))$$,'P0001',null,'browser cannot forge source version');
select throws_ok($$select pg_temp.save(jsonb_set(pg_temp.document('DB_034'),'{weeks,0,sessions,0,blocks,0,exercises,0,pilot,usage}','"PRODUCTION"'))$$,'P0001',null,'browser cannot elevate staging usage');
select throws_ok($$select pg_temp.save(jsonb_set(pg_temp.document('MA_028'),'{weeks,0,sessions,0,blocks,0,exercises,0,pilot,modelId}','"HST_RS2700"'))$$,'P0001',null,'named machine approval cannot be forged into a generic variant');
select throws_ok($$select pg_temp.save(jsonb_set(pg_temp.document('DB_034'),'{weeks,0,sessions,0,blocks,0,exercises,0,libraryExerciseId}','"7f000000-0000-4000-8000-000000000050"'))$$,'P0001',null,'normal library identity cannot carry a forged pilot snapshot');
select throws_ok($$select pg_temp.save(jsonb_set(pg_temp.document('BA_027'),'{weeks,0,sessions,0,blocks,0,exercises,0,prescription,unit}','"lb"'))$$,'P0001',null,'band configuration cannot be silently converted to pounds');
select throws_ok($$select pg_temp.save(jsonb_set(pg_temp.document('DB_045'),'{weeks,0,sessions,0,blocks,0,exercises,0,prescription,unit}','"lb"'))$$,'P0001',null,'distance exercise keeps its explicit measurement convention');
select throws_ok('select pg_temp.publish()','P0001','FE_PILOT_RECIPIENT_DISABLED','assigned active Client is still denied before test-recipient approval');
reset role;
set local role service_role;
select public.provision_training_pilot_test_access('2f000000-0000-4000-8000-000000000001','5f000000-0000-4000-8000-000000000005');
reset role;
set local role authenticated;
select pg_temp.become(2);
select throws_ok('select pg_temp.publish()','P0001','FE_NOT_FOUND','unassigned Coach cannot publish even to an approved test Client');
select pg_temp.become(3);
select throws_ok('select pg_temp.publish()','P0001','FE_NOT_FOUND','foreign Admin cannot publish into the approved organization');
select pg_temp.become(1);
select throws_ok($$select pg_temp.publish('5f000000-0000-4000-8000-000000000006',gen_random_uuid())$$,'P0001','FE_PILOT_RECIPIENT_DISABLED','another assigned Client remains excluded from the pilot');
insert into pilot_results values('publication',pg_temp.publish());
select is(pg_temp.publish(),(select snapshot from pilot_results where label='publication'),'publication retry is idempotent');
select is((select snapshot->'document' from pilot_results where label='publication'),pg_temp.document(),'published snapshot retains all fifteen exercise contracts intact');
select pg_temp.become(5,'otp');
select is((select count(*) from public.training_program_publications),1::bigint,'approved Client sees own published pilot');
select is((select count(*) from public.training_exercises),0::bigint,'Client cannot read the library even after receiving a pilot');
select is((select count(*) from public.training_program_drafts),0::bigint,'Client never reads Coach drafts');
select pg_temp.become(6,'otp');
select is((select count(*) from public.training_program_publications),0::bigint,'other Client cannot read the pilot publication');
select throws_ok($$select public.get_training_session_result(pg_temp.publication_id(),1,'7f000000-0000-4000-8000-000000000002')$$,'P0001','FE_NOT_FOUND','other Client cannot query the pilot workout by identifier');
reset role;

create function pg_temp.exercise_id(source text) returns text language sql as $$ select e->>'id' from jsonb_array_elements(pg_temp.document(source)#>'{weeks,0,sessions,0,blocks,0,exercises}') e $$;
create function pg_temp.result_set(source text,measurement jsonb default 'null',detail text default null,repetitions jsonb default '8',state text default 'DONE') returns jsonb language sql as $$
select jsonb_build_object('exerciseId',pg_temp.exercise_id(source),'setNumber',1,'status',state,'reps',repetitions,'load',measurement,'rir',null)
  || case when detail is null then '{}'::jsonb else jsonb_build_object('details',detail) end $$;
create function pg_temp.result(sets jsonb,key uuid default '6f000000-0000-4000-8000-000000000003') returns jsonb language sql as $$
select public.save_training_session_result(pg_temp.publication_id(),1,'7f000000-0000-4000-8000-000000000002',0,key,'IN_PROGRESS',sets,null) $$;
set local role authenticated;
select pg_temp.become(5,'otp');
select throws_ok($$select pg_temp.result(jsonb_build_array(pg_temp.result_set('BA_027')))$$,'P0001','FE_INVALID_WORKOUT','band result requires a real configuration description');
select throws_ok($$select pg_temp.result(jsonb_build_array(pg_temp.result_set('BA_027','20','red band')))$$,'P0001','FE_INVALID_WORKOUT','configuration result cannot invent a numeric mass');
select throws_ok($$select pg_temp.result(jsonb_build_array(pg_temp.result_set('BA_027','null','red band','null')))$$,'P0001','FE_INVALID_WORKOUT','configuration result requires actual repetitions');
select throws_ok($$select pg_temp.result(jsonb_build_array(pg_temp.result_set('BA_027','null',E' \n\t ')))$$,'P0001','FE_INVALID_WORKOUT','whitespace is not a configuration');
select throws_ok($$select pg_temp.result(jsonb_build_array(pg_temp.result_set('BA_027','null',repeat('x',501))))$$,'P0001','FE_INVALID_WORKOUT','configuration text has a bounded length');
select throws_ok($$select pg_temp.result(jsonb_build_array(pg_temp.result_set('DB_045','25')))$$,'P0001','FE_INVALID_WORKOUT','farmer carry requires both distance and load context');
select throws_ok($$select pg_temp.result(jsonb_build_array(pg_temp.result_set('DB_045','null','two dumbbells of 20 lb')))$$,'P0001','FE_INVALID_WORKOUT','load context does not replace measured distance');
select throws_ok($$select pg_temp.result(jsonb_build_array(pg_temp.result_set('BA_027','null','red band','null','PENDING')))$$,'P0001','FE_INVALID_WORKOUT','pending set cannot retain measurements or configuration');
insert into pilot_results values('result',pg_temp.result(jsonb_build_array(
  pg_temp.result_set('BA_027','null','red band; standing, anchor at chest'),
  pg_temp.result_set('MA_028','null','assistance setting 4; knee-pad machine'),
  pg_temp.result_set('DB_045','25','two dumbbells of 20 lb','null'),
  pg_temp.result_set('BW_049','30',null,'null'),
  pg_temp.result_set('DB_034','20',null,'8')
)));
select is((select snapshot#>>'{sets,0,unit}' from pilot_results where label='result'),'configuration','configuration unit is derived from publication');
select is((select snapshot#>'{sets,0,load}' from pilot_results where label='result'),'null'::jsonb,'band load remains null rather than fabricated zero');
select is((select snapshot#>>'{sets,0,details}' from pilot_results where label='result'),'red band; standing, anchor at chest','configuration text survives persistence');
select is((select snapshot#>>'{sets,2,load}' from pilot_results where label='result'),'25','farmer carry distance is retained separately from load context');
select is((select snapshot#>>'{sets,2,details}' from pilot_results where label='result'),'two dumbbells of 20 lb','farmer carry loads are retained without conversion');
select is((select snapshot#>>'{sets,3,unit}' from pilot_results where label='result'),'sec','plank results use seconds');
select is((select snapshot#>>'{sets,4,reps}' from pilot_results where label='result'),'8','per-arm repetitions are not halved or doubled');
select is((select snapshot#>>'{sets,4,load}' from pilot_results where label='result'),'20','per-dumbbell load is not multiplied by number of implements');
select pg_temp.become(1);
select lives_ok($$select public.get_training_session_result(pg_temp.publication_id(),1,'7f000000-0000-4000-8000-000000000002')$$,'assigned verified Coach reads the real persisted Client result');
select pg_temp.become(2);
select throws_ok($$select public.get_training_session_result(pg_temp.publication_id(),1,'7f000000-0000-4000-8000-000000000002')$$,'P0001','FE_NOT_FOUND','unassigned Coach cannot read pilot results');
reset role;

select throws_ok($$update public.training_exercises set pilot=null where id=pg_temp.library_id('DB_034')$$,'P0001','FE_READ_ONLY_PILOT_EXERCISE','privileged accidental update cannot strip pilot provenance');
select throws_ok($$update public.training_program_publications set document='{}' where id=pg_temp.publication_id()$$,'P0001','FE_IMMUTABLE_PUBLICATION','published pilot history remains immutable');
set local role service_role;
select is((select count(*) from public.outbox_events where organization_id='2f000000-0000-4000-8000-000000000001'),0::bigint,'selection and publication do not emit unsolicited email');
reset role;
-- Private-table cleanup is performed by the disposable SQL fixture owner,
-- never by widening schema access for the application service or browser roles.
delete from app_private.training_pilot_clients where client_id='5f000000-0000-4000-8000-000000000005';
delete from app_private.training_pilot_organizations where organization_id='2f000000-0000-4000-8000-000000000001';
set local role authenticated;
select pg_temp.become(1);
select throws_ok('select pg_temp.pick()','P0001','FE_PILOT_DISABLED','receipt replay cannot bypass disabled pilot organization');
select throws_ok('select pg_temp.save()','P0001','FE_PILOT_DISABLED','existing pilot identifiers cannot create new drafts after disablement');
insert into pilot_results values('normal-draft',pg_temp.save(jsonb_set(jsonb_set(
  pg_temp.document('DB_034')#-'{weeks,0,sessions,0,blocks,0,exercises,0,pilot}',
  '{weeks,0,sessions,0,blocks,0,exercises,0,libraryExerciseId}','"7f000000-0000-4000-8000-000000000050"'),
  '{weeks,0,sessions,0,blocks,0,exercises,0,name}','"Existing normal exercise"')));
select lives_ok($$select public.publish_training_program('5f000000-0000-4000-8000-000000000006',
  (select (snapshot->>'id')::uuid from pilot_results where label='normal-draft'),1,null,gen_random_uuid())$$,
  'ordinary exercises still publish to an assigned non-pilot Client after pilot disablement');
reset role;
select * from finish();
rollback;
