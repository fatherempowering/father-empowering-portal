begin;
create extension if not exists pgtap with schema extensions;
select plan(31);

-- Fixtures and elevated observations stay in this rolled-back local test.
-- Application roles receive no new permission on persisted tables/helpers.
select ok(
  not has_function_privilege('anon','public.read_training_program_history(uuid,bigint,integer)','EXECUTE')
  and has_function_privilege('authenticated','public.read_training_program_history(uuid,bigint,integer)','EXECUTE')
  and not has_table_privilege('authenticated','app_private.training_program_receipts','SELECT')
  and not has_table_privilege('authenticated','public.training_program_drafts','INSERT,UPDATE,DELETE')
  and not has_function_privilege('authenticated','app_private.training_result_enrich_sets(jsonb,jsonb,text,text)','EXECUTE')
  and (select prosecdef and proconfig @> array['search_path=""'] from pg_proc
       where oid='public.read_training_program_history(uuid,bigint,integer)'::regprocedure),
  'history exposes only the guarded fixed-search-path RPC, not receipt or write access'); -- 1

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new)
select ('14000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'00000000-0000-0000-0000-000000000000',
  'authenticated','authenticated','builder.revision.'||n||'@example.test','',now(),'{}','{}',now(),now(),'','','',''
from generate_series(1,6)n;
insert into auth.sessions(id,user_id,created_at,updated_at)
select ('84000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  ('14000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,now(),now()
from generate_series(1,6)n;
insert into public.organizations(id,name,created_by) values
('24000000-0000-4000-8000-000000000001','Builder revision tests','14000000-0000-4000-8000-000000000004'),
('24000000-0000-4000-8000-000000000002','Foreign builder tests','14000000-0000-4000-8000-000000000003');
insert into public.organization_memberships(organization_id,user_id,role,status,activated_at,created_by)
select case when n=3 then '24000000-0000-4000-8000-000000000002' else '24000000-0000-4000-8000-000000000001' end::uuid,
  ('14000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  case when n=5 then 'CLIENT' when n in(3,4) then 'ADMIN' else 'COACH' end::public.app_role,
  'ACTIVE',now(),'14000000-0000-4000-8000-000000000004'
from generate_series(1,6)n;
insert into app_private.coach_session_attestations(session_id,user_id,method,verified_at,expires_at)
select ('84000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  ('14000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'email_otp',now(),now()+interval '1 day'
from generate_series(1,4)n;
insert into public.clients(id,organization_id,auth_user_id,email,first_name,last_name,status,created_by) values
('54000000-0000-4000-8000-000000000005','24000000-0000-4000-8000-000000000001',
 '14000000-0000-4000-8000-000000000005','builder.revision.5@example.test','Builder','Client','ACTIVE','14000000-0000-4000-8000-000000000001');
insert into public.coach_client_assignments(organization_id,client_id,coach_user_id,status,created_by) values
('24000000-0000-4000-8000-000000000001','54000000-0000-4000-8000-000000000005',
 '14000000-0000-4000-8000-000000000001','ACTIVE','14000000-0000-4000-8000-000000000001');

create function pg_temp.become(n integer,method text default 'password') returns void language plpgsql as $$ begin
  perform set_config('request.jwt.claim.sub','14000000-0000-4000-8000-'||lpad(n::text,12,'0'),true);
  perform set_config('request.jwt.claims',jsonb_build_object(
    'sub','14000000-0000-4000-8000-'||lpad(n::text,12,'0'),'role','authenticated','aal','aal1',
    'session_id','84000000-0000-4000-8000-'||lpad(n::text,12,'0'),
    'amr',jsonb_build_array(jsonb_build_object('method',method)))::text,true);
end $$;
create temp table selected_pilots(source_id text primary key,snapshot jsonb);
create temp table builder_snapshots(label text primary key,snapshot jsonb);
grant select,insert on selected_pilots,builder_snapshots to authenticated;
grant select on selected_pilots,builder_snapshots to service_role;

set local role service_role;
select public.provision_training_pilot_test_access('24000000-0000-4000-8000-000000000001','54000000-0000-4000-8000-000000000005');
reset role;
set local role authenticated;
select pg_temp.become(1);
insert into selected_pilots values
  ('DB_034',public.select_training_pilot_exercise('DB_034','1.2.0',gen_random_uuid())),
  ('BA_027',public.select_training_pilot_exercise('BA_027','1.1.0',gen_random_uuid())),
  ('BW_049',public.select_training_pilot_exercise('BW_049','1.1.0',gen_random_uuid())),
  ('DB_045',public.select_training_pilot_exercise('DB_045','1.1.0',gen_random_uuid())),
  ('MA_028',public.select_training_pilot_exercise('MA_028','1.1.0',gen_random_uuid()));
select is(public.save_training_exercise(null,'Test kilograms','Dumbbell','','','kg',false,0,gen_random_uuid())->>'defaultUnit',
  'kg','ordinary exercise RPC accepts an explicit kg default'); -- 2
reset role;

create function pg_temp.document(source text default 'DB_034',unit text default 'lb') returns jsonb language sql as $$
select jsonb_build_object(
  'schemaVersion',1,'phaseId','74000000-0000-4000-8000-000000000001',
  'title',jsonb_build_object('fr','Version initiale','en','Initial version'),
  'weeks',jsonb_build_array(jsonb_build_object('number',1,'objective',jsonb_build_object('fr','','en',''),
    'sessions',jsonb_build_array(jsonb_build_object(
      'id','74000000-0000-4000-8000-000000000002','title',jsonb_build_object('fr','Séance','en','Session'),
      'type','training','required',true,'schedule',jsonb_build_object('mode','flexible','day',null),
      'warmup',jsonb_build_object('fr','','en',''),'blocks',jsonb_build_array(jsonb_build_object(
        'id','74000000-0000-4000-8000-000000000003','label',jsonb_build_object('fr','','en',''),
        'mode','standard','restSeconds',60,'exercises',jsonb_build_array(jsonb_build_object(
          'id','74000000-0000-4000-8000-000000000004','libraryExerciseId',snapshot->'id',
          'name',snapshot->'name','cue',snapshot->'cue','media',null,'pilot',snapshot->'pilot',
          'prescription',jsonb_build_object('sets',1,'reps','8','targetRir',2,'restSeconds',60,
            'tempo','3010','loadTarget','12.5','unit',unit)
        ))
      ))
    ))
  ))
) from selected_pilots where source_id=source
$$;
create function pg_temp.saved(label_name text) returns jsonb language sql as $$
  select snapshot from builder_snapshots where label=label_name
$$;
create function pg_temp.program_id() returns uuid language sql as $$ select (pg_temp.saved('v1')->>'id')::uuid $$;
create function pg_temp.fresh_draft(doc jsonb) returns jsonb language sql as $$
  select public.save_training_program_draft(null,doc,0,gen_random_uuid())
$$;
create function pg_temp.sets(repetitions jsonb default '8',measurement jsonb default '12.5') returns jsonb language sql as $$
  select jsonb_build_array(jsonb_build_object('exerciseId','74000000-0000-4000-8000-000000000004',
    'setNumber',1,'status','DONE','reps',repetitions,'load',measurement,'rir',2))
$$;
create function pg_temp.result(publication_label text,sets jsonb) returns jsonb language sql as $$
  select public.save_training_session_result((pg_temp.saved(publication_label)->>'id')::uuid,1,
    '74000000-0000-4000-8000-000000000002',0,gen_random_uuid(),'COMPLETED',sets,null)
$$;

set local role authenticated;
select pg_temp.become(1);
insert into builder_snapshots values('v1',public.save_training_program_draft(null,pg_temp.document(),0,'64000000-0000-4000-8000-000000000001'));
insert into builder_snapshots values('lb-publication',public.publish_training_program(
  '54000000-0000-4000-8000-000000000005',pg_temp.program_id(),1,null,gen_random_uuid()));
select pg_temp.become(5,'otp');
insert into builder_snapshots values('lb-result',pg_temp.result('lb-publication',pg_temp.sets('9','20')));
select pg_temp.become(1);
insert into builder_snapshots values('v2',public.save_training_program_draft(pg_temp.program_id(),pg_temp.document('DB_034','kg'),1,'64000000-0000-4000-8000-000000000002'));
select ok(
  pg_temp.saved('v2')#>>'{document,weeks,0,sessions,0,blocks,0,exercises,0,prescription,unit}'='kg'
  and pg_temp.saved('v2')#>'{document,weeks,0,sessions,0,blocks,0,exercises,0,pilot}'=
      (select snapshot->'pilot' from selected_pilots where source_id='DB_034')
  and (select default_unit='lb' from public.training_exercises where id=
      (select (snapshot->>'id')::uuid from selected_pilots where source_id='DB_034')),
  'kg prescription saves without rewriting canonical pilot provenance or library default'); -- 3
select throws_ok($$select pg_temp.fresh_draft(pg_temp.document('BA_027','kg'))$$,'P0001','FE_INVALID_PILOT_SNAPSHOT',
  'a band configuration cannot be reclassified as kg'); -- 4
select throws_ok($$select pg_temp.fresh_draft(pg_temp.document('BW_049','kg'))$$,'P0001','FE_INVALID_PILOT_SNAPSHOT',
  'duration remains seconds, not kg'); -- 5
select throws_ok($$select pg_temp.fresh_draft(pg_temp.document('DB_045','kg'))$$,'P0001','FE_INVALID_PILOT_SNAPSHOT',
  'carry distance cannot become kg'); -- 6
select throws_ok($$select pg_temp.fresh_draft(pg_temp.document('MA_028','kg'))$$,'P0001','FE_INVALID_PILOT_SNAPSHOT',
  'unconfirmed machine setting cannot become inferred mass'); -- 7
select lives_ok($$select pg_temp.fresh_draft(jsonb_set(pg_temp.document('DB_034','kg'),
  '{weeks,0,sessions,0,blocks,0,exercises,0,prescription}',
  '{"sets":2,"reps":"8","targetRir":2,"restSeconds":60,"tempo":"3010","loadTarget":"12.5","unit":"kg","prescribedSets":[
    {"reps":"8","targetRir":2,"restSeconds":60,"tempo":"3010","loadTarget":"12.5","unit":"kg"},
    {"reps":"8","targetRir":2,"restSeconds":60,"tempo":"3010","loadTarget":"20","unit":"lb"}]}'))$$,
  'differing explicit mass units are valid in per-set prescriptions'); -- 8
select throws_ok($$select pg_temp.fresh_draft(jsonb_set(pg_temp.document('BA_027','configuration'),
  '{weeks,0,sessions,0,blocks,0,exercises,0,prescription}',
  '{"sets":2,"reps":"8","targetRir":2,"restSeconds":60,"tempo":"3010","loadTarget":"Band setup","unit":"configuration","prescribedSets":[
    {"reps":"8","targetRir":2,"restSeconds":60,"tempo":"3010","loadTarget":"Band setup","unit":"configuration"},
    {"reps":"8","targetRir":2,"restSeconds":60,"tempo":"3010","loadTarget":"20","unit":"kg"}]}'))$$,
  'P0001','FE_INVALID_PILOT_SNAPSHOT','per-set overrides cannot bypass the band convention'); -- 9
insert into builder_snapshots values('kg-publication',public.publish_training_program(
  '54000000-0000-4000-8000-000000000005',pg_temp.program_id(),2,
  (pg_temp.saved('lb-publication')->>'id')::uuid,gen_random_uuid()));

select pg_temp.become(5,'otp');
select throws_ok($$select pg_temp.result('kg-publication',pg_temp.sets('null','12.5'))$$,
  'P0001','FE_INVALID_WORKOUT','completed kg set requires repetitions'); -- 10
select throws_ok($$select pg_temp.result('kg-publication',pg_temp.sets('8','null'))$$,
  'P0001','FE_INVALID_WORKOUT','completed kg set requires measured load'); -- 11
select throws_ok($$select pg_temp.result('kg-publication',jsonb_set(pg_temp.sets(),'{0,unit}','"lb"'))$$,
  'P0001','FE_INVALID_WORKOUT','Client cannot submit or forge the server-derived measurement unit'); -- 12
select throws_ok($$select pg_temp.result('kg-publication',pg_temp.sets('8','0.0000001'))$$,
  'P0001','FE_INVALID_WORKOUT','kg load retains the six-decimal precision limit'); -- 13
insert into builder_snapshots values('kg-result',pg_temp.result('kg-publication',pg_temp.sets()));
select is(pg_temp.saved('kg-result')->'sets',
  jsonb_build_array((pg_temp.sets()->0)||jsonb_build_object('unit','kg','kind','PRESCRIBED')),
  'published kg, exact measured load and per-arm reps persist without conversion'); -- 14
select ok(
  (select sets from public.training_session_results where id=(pg_temp.saved('lb-result')->>'id')::uuid)=pg_temp.saved('lb-result')->'sets'
  and (select document from public.training_program_publications where id=(pg_temp.saved('lb-publication')->>'id')::uuid)=pg_temp.saved('v1')->'document'
  and pg_temp.saved('lb-result')#>>'{sets,0,unit}'='lb'
  and pg_temp.saved('lb-result')#>>'{sets,0,load}'='20',
  'old lb result and publication remain byte-for-byte unchanged after the kg revision'); -- 15
reset role;
select throws_ok($$update public.training_program_publications set document=pg_temp.document('DB_034','kg')
  where id=(pg_temp.saved('lb-publication')->>'id')::uuid$$,'P0001','FE_IMMUTABLE_PUBLICATION',
  'even privileged maintenance cannot rewrite the historical publication'); -- 16

set local role authenticated;
select pg_temp.become(1);
-- Create real successful saved versions, not fabricated receipt fixtures.
do $$ declare n integer; latest jsonb; begin
  for n in 3..22 loop
    latest:=public.save_training_program_draft(pg_temp.program_id(),
      jsonb_set(pg_temp.document('DB_034','kg'),'{title,fr}',to_jsonb('Version '||n)),n-1,gen_random_uuid());
  end loop;
  insert into builder_snapshots values('v22',latest);
  -- Retry the original v2 command after subsequent saves: no duplicate version.
  perform public.save_training_program_draft(pg_temp.program_id(),pg_temp.document('DB_034','kg'),1,
    '64000000-0000-4000-8000-000000000002');
end $$;
reset role;
create function pg_temp.history_state() returns jsonb language sql as $$
  select jsonb_build_object(
    'drafts',(select jsonb_agg(to_jsonb(d) order by d.id) from public.training_program_drafts d where organization_id='24000000-0000-4000-8000-000000000001'),
    'receipts',(select jsonb_agg(to_jsonb(r) order by r.actor_user_id,r.idempotency_key) from app_private.training_program_receipts r where program_id=pg_temp.program_id()),
    'publications',(select jsonb_agg(to_jsonb(p) order by p.id) from public.training_program_publications p where organization_id='24000000-0000-4000-8000-000000000001'),
    'results',(select jsonb_agg(to_jsonb(r) order by r.id) from public.training_session_results r where organization_id='24000000-0000-4000-8000-000000000001'),
    'audit',(select count(*) from public.audit_events where organization_id='24000000-0000-4000-8000-000000000001'),
    'outbox',(select count(*) from public.outbox_events where organization_id='24000000-0000-4000-8000-000000000001')
  )
$$;
create temp table history_read_baseline as select pg_temp.history_state() as value;
set local role authenticated;
select pg_temp.become(1);
select ok(
  public.read_training_program_history(pg_temp.program_id())-'items'=
    '{"total":22,"page":0,"pageSize":20}'::jsonb
  and (select jsonb_agg(item->'version' order by ordinal)
    from jsonb_array_elements(public.read_training_program_history(pg_temp.program_id())->'items') with ordinality versions(item,ordinal))=
    (select jsonb_agg(n order by n desc) from generate_series(3,22)n)
  and (select bool_and(item-array['version','updatedAt']='{}'::jsonb)
    from jsonb_array_elements(public.read_training_program_history(pg_temp.program_id())->'items') versions(item)),
  'owner sees newest-first real versions and only safe paginated metadata'); -- 17
select is(public.read_training_program_history(pg_temp.program_id(),1),pg_temp.saved('v1'),
  'historical detail returns the exact original saved document, not the current draft'); -- 18
select is(public.read_training_program_history(pg_temp.program_id(),22),pg_temp.saved('v22'),
  'current detail returns the exact current snapshot'); -- 19
select ok(
  public.read_training_program_history(pg_temp.program_id(),null,1)-'items'=
    '{"total":22,"page":1,"pageSize":20}'::jsonb
  and (select jsonb_agg(item->'version' order by ordinal)
    from jsonb_array_elements(public.read_training_program_history(pg_temp.program_id(),null,1)->'items') with ordinality versions(item,ordinal))='[2,1]'::jsonb
  and public.read_training_program_history(pg_temp.program_id(),null,2)='{"items":[],"total":22,"page":2,"pageSize":20}'::jsonb,
  'second and empty pages retain totals, with no duplicate from idempotent retry'); -- 20
select throws_ok('select public.read_training_program_history(pg_temp.program_id(),null,-1)',
  'P0001','FE_INVALID_TRAINING_DRAFT','negative history page is rejected'); -- 21
select throws_ok('select public.read_training_program_history(pg_temp.program_id(),99)',
  'P0001','FE_NOT_FOUND','nonexistent historical revision is not fabricated'); -- 22
select pg_temp.become(2);
select throws_ok('select public.read_training_program_history(pg_temp.program_id())',
  'P0001','FE_NOT_FOUND','another same-organization Coach cannot list owner draft history'); -- 23
select throws_ok('select public.read_training_program_history(pg_temp.program_id(),1)',
  'P0001','FE_NOT_FOUND','knowing a saved revision does not grant another Coach document access'); -- 24
select pg_temp.become(3);
select throws_ok('select public.read_training_program_history(pg_temp.program_id(),1)',
  'P0001','FE_NOT_FOUND','foreign organization Admin cannot read saved snapshots'); -- 25
select pg_temp.become(5,'otp');
select throws_ok('select public.read_training_program_history(pg_temp.program_id(),1)',
  'P0001','FE_FORBIDDEN','assigned Client cannot read Coach draft history'); -- 26
select pg_temp.become(6);
select throws_ok('select public.read_training_program_history(pg_temp.program_id())',
  'P0001','FE_FORBIDDEN','unverified password-only Coach cannot enumerate saved history'); -- 27
select pg_temp.become(1,'otp');
select throws_ok('select public.read_training_program_history(pg_temp.program_id(),1)',
  'P0001','FE_FORBIDDEN','OTP-only session cannot read Coach history even for its owner'); -- 28
select pg_temp.become(4);
select ok(public.read_training_program_history(pg_temp.program_id(),1)=pg_temp.saved('v1')
  and public.read_training_program_history(pg_temp.program_id())->>'total'='22',
  'verified same-organization Admin retains existing owner-equivalent draft read access'); -- 29
reset role;
update public.organization_memberships set status='SUSPENDED' where user_id='14000000-0000-4000-8000-000000000001';
set local role authenticated;
select pg_temp.become(1);
select throws_ok('select public.read_training_program_history(pg_temp.program_id(),1)',
  'P0001','FE_FORBIDDEN','history authorization is rechecked after owner suspension'); -- 30
reset role;
select is(pg_temp.history_state(),(select value from history_read_baseline),
  'all successful and refused history reads leave drafts, receipts, publications, results, audit and outbox unchanged'); -- 31

select * from finish();
rollback;
