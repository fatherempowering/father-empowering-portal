begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='public.training_session_results'::regclass),'Training results force RLS');
select ok(not has_table_privilege('authenticated','public.training_session_results','INSERT,UPDATE,DELETE'),'browser cannot write result rows directly');
select ok(not has_table_privilege('anon','public.training_session_results','SELECT'),'anonymous result reads denied');
select ok(not has_table_privilege('service_role','public.training_session_results','DELETE'),'routine service access cannot delete result history');
select ok(not has_function_privilege('anon','public.save_training_session_result(uuid,integer,uuid,bigint,uuid,text,jsonb,text)','EXECUTE'),'anonymous mutation RPC denied');
select ok(not has_function_privilege('anon','public.get_training_session_result(uuid,integer,uuid)','EXECUTE'),'anonymous detail RPC denied');
select ok(not has_function_privilege('anon','public.list_training_session_results(uuid,integer)','EXECUTE'),'anonymous history RPC denied');
select ok(has_function_privilege('authenticated','public.save_training_session_result(uuid,integer,uuid,bigint,uuid,text,jsonb,text)','EXECUTE'),'authenticated may invoke the guarded mutation RPC');
select ok(has_function_privilege('authenticated','public.get_training_session_result(uuid,integer,uuid)','EXECUTE'),'authenticated may invoke the guarded detail RPC');
select ok(has_function_privilege('authenticated','public.list_training_session_results(uuid,integer)','EXECUTE'),'authenticated may invoke the guarded history RPC');
select ok(not has_table_privilege('authenticated','app_private.training_result_receipts','SELECT'),'idempotency receipts remain private');
select ok(not has_function_privilege('anon','app_private.training_result_actor_unambiguous()','EXECUTE'),'anonymous cannot probe the actor guard');
select ok(not has_function_privilege('authenticated','app_private.training_result_enrich_sets(jsonb,jsonb,text,text)','EXECUTE'),'browser cannot invoke the server derivation helper');

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new)
select ('1b000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','result.'||n||'@example.test','',now(),'{}','{}',now(),now(),'','','','' from generate_series(1,7)n;
insert into auth.sessions(id,user_id,created_at,updated_at)
select ('8b000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,('1b000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,now(),now() from generate_series(1,7)n;
insert into public.organizations(id,name,created_by) values
('2b000000-0000-4000-8000-000000000001','Training result tests','1b000000-0000-4000-8000-000000000004'),
('2b000000-0000-4000-8000-000000000002','Foreign result org','1b000000-0000-4000-8000-000000000003');
insert into public.organization_memberships(organization_id,user_id,role,status,activated_at,created_by)
select case when n=3 then '2b000000-0000-4000-8000-000000000002' else '2b000000-0000-4000-8000-000000000001' end::uuid,
('1b000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
case when n in(5,6) then 'CLIENT' when n in(3,4,7) then 'ADMIN' else 'COACH' end::public.app_role,
'ACTIVE',now(),'1b000000-0000-4000-8000-000000000004' from generate_series(1,7)n;
insert into app_private.coach_session_attestations(session_id,user_id,method,verified_at,expires_at)
select ('8b000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,('1b000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'email_otp',now(),now()+interval '1 day' from unnest(array[1,2,3,4,7]) n;
insert into public.clients(id,organization_id,auth_user_id,email,first_name,last_name,status,created_by) values
('5b000000-0000-4000-8000-000000000005','2b000000-0000-4000-8000-000000000001','1b000000-0000-4000-8000-000000000005','result.5@example.test','Target','Client','ACTIVE','1b000000-0000-4000-8000-000000000004'),
('5b000000-0000-4000-8000-000000000006','2b000000-0000-4000-8000-000000000001','1b000000-0000-4000-8000-000000000006','result.6@example.test','Other','Client','ACTIVE','1b000000-0000-4000-8000-000000000004'),
('5b000000-0000-4000-8000-000000000004','2b000000-0000-4000-8000-000000000001','1b000000-0000-4000-8000-000000000004','result.4@example.test','Admin','Personal','ACTIVE','1b000000-0000-4000-8000-000000000004');
insert into public.coach_client_assignments(organization_id,client_id,coach_user_id,status,created_by)
values('2b000000-0000-4000-8000-000000000001','5b000000-0000-4000-8000-000000000005','1b000000-0000-4000-8000-000000000001','ACTIVE','1b000000-0000-4000-8000-000000000004');

create function pg_temp.become(n integer,method text default 'password') returns void language plpgsql as $$ begin
perform set_config('request.jwt.claim.sub','1b000000-0000-4000-8000-'||lpad(n::text,12,'0'),true);
perform set_config('request.jwt.claims',jsonb_build_object('sub','1b000000-0000-4000-8000-'||lpad(n::text,12,'0'),'role','authenticated','aal','aal1','session_id','8b000000-0000-4000-8000-'||lpad(n::text,12,'0'),'amr',jsonb_build_array(jsonb_build_object('method',method)))::text,true);
end $$;
create function pg_temp.document(title text default 'Revision one') returns jsonb language sql as $$
select jsonb_build_object(
  'schemaVersion',1,'phaseId','7b000000-0000-4000-8000-000000000001',
  'title',jsonb_build_object('fr',title,'en',title),
  'weeks',jsonb_build_array(jsonb_build_object(
    'number',1,'objective',jsonb_build_object('fr','','en',''),'sessions',jsonb_build_array(
      jsonb_build_object(
        'id','7b000000-0000-4000-8000-000000000002','title',jsonb_build_object('fr','Séance A','en','Session A'),
        'type','training','required',true,'schedule',jsonb_build_object('mode','flexible','day',null),
        'warmup',jsonb_build_object('fr','','en',''),'blocks',jsonb_build_array(jsonb_build_object(
          'id','7b000000-0000-4000-8000-000000000003','label',jsonb_build_object('fr','','en',''),
          'mode','standard','restSeconds',90,'exercises',jsonb_build_array(
            jsonb_build_object('id','7b000000-0000-4000-8000-000000000004','libraryExerciseId','7b000000-0000-4000-8000-000000000050','name','Press','cue',jsonb_build_object('fr','','en',''),'media',null,
              'prescription',jsonb_build_object('sets',2,'reps','8','targetRir',2,'restSeconds',90,'tempo','','loadTarget','40 lb','unit','lb')),
            jsonb_build_object('id','7b000000-0000-4000-8000-000000000005','libraryExerciseId','7b000000-0000-4000-8000-000000000051','name','Bike','cue',jsonb_build_object('fr','','en',''),'media',null,
              'prescription',jsonb_build_object('sets',1,'reps','20 min','targetRir',3,'restSeconds',0,'tempo','','loadTarget','20','unit','min'))
          )
        ))
      ),
      jsonb_build_object(
        'id','7b000000-0000-4000-8000-000000000006','title',jsonb_build_object('fr','Séance B','en','Session B'),
        'type','training','required',true,'schedule',jsonb_build_object('mode','flexible','day',null),
        'warmup',jsonb_build_object('fr','','en',''),'blocks',jsonb_build_array(jsonb_build_object(
          'id','7b000000-0000-4000-8000-000000000007','label',jsonb_build_object('fr','','en',''),
          'mode','standard','restSeconds',90,'exercises',jsonb_build_array(
            jsonb_build_object('id','7b000000-0000-4000-8000-000000000008','libraryExerciseId','7b000000-0000-4000-8000-000000000050','name','Press','cue',jsonb_build_object('fr','','en',''),'media',null,
              'prescription',jsonb_build_object('sets',1,'reps','8','targetRir',2,'restSeconds',90,'tempo','','loadTarget','40 lb','unit','lb'))
          )
        ))
      )
    )
  ))
) $$;
create function pg_temp.partial_sets() returns jsonb language sql as $$ select '[{"exerciseId":"7B000000-0000-4000-8000-000000000004","setNumber":1,"status":"PENDING","reps":null,"load":null,"rir":null}]'::jsonb $$;
create function pg_temp.progress_sets() returns jsonb language sql as $$ select '[
 {"exerciseId":"7b000000-0000-4000-8000-000000000004","setNumber":1,"status":"DONE","reps":8,"load":40,"rir":null},
 {"exerciseId":"7b000000-0000-4000-8000-000000000004","setNumber":3,"status":"DONE","reps":6,"load":45,"rir":2}
]'::jsonb $$;
create function pg_temp.complete_sets() returns jsonb language sql as $$ select '[
 {"exerciseId":"7b000000-0000-4000-8000-000000000004","setNumber":1,"status":"DONE","reps":8,"load":40,"rir":null},
 {"exerciseId":"7b000000-0000-4000-8000-000000000004","setNumber":2,"status":"SKIPPED","reps":null,"load":null,"rir":null},
 {"exerciseId":"7b000000-0000-4000-8000-000000000004","setNumber":3,"status":"DONE","reps":6,"load":45,"rir":2},
 {"exerciseId":"7b000000-0000-4000-8000-000000000005","setNumber":1,"status":"DONE","reps":null,"load":20,"rir":null}
]'::jsonb $$;
create function pg_temp.save_result(pub uuid,session uuid,version bigint,key uuid,state text,sets jsonb,note text default null) returns jsonb language sql as $$
  select public.save_training_session_result(pub,1,session,version,key,state,sets,note)
$$;

insert into public.training_program_drafts(id,organization_id,created_by,document) values
('7b000000-0000-4000-8000-000000000101','2b000000-0000-4000-8000-000000000001','1b000000-0000-4000-8000-000000000001',pg_temp.document()),
('7b000000-0000-4000-8000-000000000102','2b000000-0000-4000-8000-000000000001','1b000000-0000-4000-8000-000000000001',pg_temp.document('Revision two'));
insert into public.training_program_publications(id,organization_id,client_id,program_id,draft_version,revision,document,published_by) values
('6b000000-0000-4000-8000-000000000001','2b000000-0000-4000-8000-000000000001','5b000000-0000-4000-8000-000000000005','7b000000-0000-4000-8000-000000000101',1,1,pg_temp.document(),'1b000000-0000-4000-8000-000000000001'),
('6b000000-0000-4000-8000-000000000004','2b000000-0000-4000-8000-000000000001','5b000000-0000-4000-8000-000000000004','7b000000-0000-4000-8000-000000000101',1,1,pg_temp.document(),'1b000000-0000-4000-8000-000000000004');
create temp table workout_snapshots(label text primary key,snapshot jsonb);
grant select,insert on workout_snapshots to authenticated;

-- The largest publishable session (20 blocks x 30 exercises x 40 results)
-- remains closable without quadratic enrichment work or oversized numbers.
create temp table large_result_fixture(session jsonb,sets jsonb);
insert into large_result_fixture
select jsonb_build_object(
  'id','7c000000-0000-4000-8000-000000000001','title',jsonb_build_object('fr','Long','en','Long'),
  'type','training','required',true,'schedule',jsonb_build_object('mode','flexible','day',null),
  'warmup',jsonb_build_object('fr','','en',''),'blocks',(
    select jsonb_agg(jsonb_build_object(
      'id',('7c100000-0000-4000-8000-'||lpad(block_no::text,12,'0'))::text,
      'label',jsonb_build_object('fr','','en',''),'mode','standard','restSeconds',0,
      'exercises',(select jsonb_agg(jsonb_build_object(
        'id','7d000000-0000-4000-8000-'||lpad(n::text,12,'0'),'libraryExerciseId','7e000000-0000-4000-8000-'||lpad(n::text,12,'0'),
        'name','Exercise '||n,'cue',jsonb_build_object('fr','','en',''),'media',null,
        'prescription',jsonb_build_object('sets',20,'reps','1','targetRir',0,'restSeconds',0,'tempo','','loadTarget','','unit','lb')
      ) order by n) from generate_series((block_no-1)*30+1,block_no*30)n)
    ) order by block_no) from generate_series(1,20)block_no
  )
),(
  select jsonb_agg(jsonb_build_object(
    'exerciseId','7d000000-0000-4000-8000-'||lpad(exercise_no::text,12,'0'),
    'setNumber',set_no,'status','DONE','reps',1,'load',99999.999999,'rir',null
  ) order by exercise_no,set_no)
  from generate_series(1,600)exercise_no cross join generate_series(1,40)set_no
);
set local statement_timeout='5s';
select is(jsonb_array_length(app_private.training_result_enrich_sets(
  (select sets from large_result_fixture),(select session from large_result_fixture),'COMPLETED',null
)),24000,'SQL enriches the maximum 24,000 valid results within the five-second guard');
set local statement_timeout=0;

set local role authenticated;
select pg_temp.become(5,'otp');
select throws_ok($$select pg_temp.save_result(
  '6b000000-0000-4000-8000-000000000001','7b000000-0000-4000-8000-000000000002',0,
  gen_random_uuid(),'IN_PROGRESS','{}'::jsonb,null
)$$,'P0001','FE_INVALID_WORKOUT','a direct RPC scalar payload fails closed with the allowlisted validation error');
insert into workout_snapshots values('started',pg_temp.save_result(
  '6b000000-0000-4000-8000-000000000001','7b000000-0000-4000-8000-000000000002',0,
  '6c000000-0000-4000-8000-000000000001','IN_PROGRESS',pg_temp.partial_sets()
));
select is((select snapshot#>>'{sets,0,exerciseId}' from workout_snapshots where label='started'),'7b000000-0000-4000-8000-000000000004','exercise identity is canonicalized from the publication');
select is((select snapshot#>>'{sets,0,kind}' from workout_snapshots where label='started'),'PRESCRIBED','set kind is derived server-side');
select is((select snapshot#>>'{sets,0,unit}' from workout_snapshots where label='started'),'lb','unit is derived server-side');
select is(pg_temp.save_result(
  '6b000000-0000-4000-8000-000000000001','7b000000-0000-4000-8000-000000000002',0,
  '6c000000-0000-4000-8000-000000000001','IN_PROGRESS',pg_temp.partial_sets()
),(select snapshot from workout_snapshots where label='started'),'exact retry returns its original snapshot');
select throws_ok($$select pg_temp.save_result(
  '6b000000-0000-4000-8000-000000000001','7b000000-0000-4000-8000-000000000002',0,
  '6c000000-0000-4000-8000-000000000001','IN_PROGRESS',pg_temp.partial_sets(),'changed'
)$$,'P0001','FE_IDEMPOTENCY_CONFLICT','one mutation key cannot acknowledge different intent');
select throws_ok($$select pg_temp.save_result(
  '6b000000-0000-4000-8000-000000000001','7b000000-0000-4000-8000-000000000002',0,
  gen_random_uuid(),'IN_PROGRESS',pg_temp.partial_sets()
)$$,'P0001','FE_VERSION_CONFLICT','stale expected version is rejected');
select throws_ok($$select pg_temp.save_result(
  '6b000000-0000-4000-8000-000000000001','7b000000-0000-4000-8000-000000000002',1,
  gen_random_uuid(),'IN_PROGRESS','[{"exerciseId":"7b000000-0000-4000-8000-000000000004","setNumber":23,"status":"DONE","reps":1,"load":1,"rir":null}]',null
)$$,'P0001','FE_INVALID_WORKOUT','more than twenty EXTRA sets per exercise is denied');
select throws_ok($$select pg_temp.save_result(
  '6b000000-0000-4000-8000-000000000001','7b000000-0000-4000-8000-000000000002',1,
  gen_random_uuid(),'IN_PROGRESS','[
    {"exerciseId":"7b000000-0000-4000-8000-000000000004","setNumber":1,"status":"DONE","reps":8,"load":40,"rir":null},
    {"exerciseId":"7B000000-0000-4000-8000-000000000004","setNumber":1,"status":"DONE","reps":8,"load":40,"rir":null}
  ]',null
)$$,'P0001','FE_INVALID_WORKOUT','set identity uniqueness is case-insensitive');
select throws_ok($$select pg_temp.save_result(
  '6b000000-0000-4000-8000-000000000001','7b000000-0000-4000-8000-000000000002',1,
  gen_random_uuid(),'IN_PROGRESS','[{"exerciseId":"7b000000-0000-4000-8000-000000000004","setNumber":1,"status":"DONE","reps":null,"load":40,"rir":null}]',null
)$$,'P0001','FE_INVALID_WORKOUT','a completed lb set requires repetitions without inventing RIR');
select throws_ok($$select pg_temp.save_result(
  '6b000000-0000-4000-8000-000000000001','7b000000-0000-4000-8000-000000000002',1,
  gen_random_uuid(),'IN_PROGRESS','[{"exerciseId":"7b000000-0000-4000-8000-000000000004","setNumber":1,"status":"DONE","reps":8,"load":0.0000001,"rir":null}]',null
)$$,'P0001','FE_INVALID_WORKOUT','direct RPC load precision is bounded to six decimal places');
insert into workout_snapshots values('progress',pg_temp.save_result(
  '6b000000-0000-4000-8000-000000000001','7b000000-0000-4000-8000-000000000002',1,
  '6c000000-0000-4000-8000-000000000002','IN_PROGRESS',pg_temp.progress_sets()
));
select is((select snapshot#>>'{sets,1,kind}' from workout_snapshots where label='progress'),'EXTRA','additional set is explicitly derived as EXTRA');
select throws_ok($$insert into public.training_session_results(organization_id,client_id,publication_id,week_number,session_id,status,sets)
values('2b000000-0000-4000-8000-000000000001','5b000000-0000-4000-8000-000000000005','6b000000-0000-4000-8000-000000000001',1,'7b000000-0000-4000-8000-000000000006','IN_PROGRESS','[]')$$,
'42501',null,'authenticated cannot bypass the mutation RPC');

reset role;
insert into public.training_program_publications(id,organization_id,client_id,program_id,draft_version,revision,document,published_by)
values('6b000000-0000-4000-8000-000000000002','2b000000-0000-4000-8000-000000000001','5b000000-0000-4000-8000-000000000005','7b000000-0000-4000-8000-000000000102',1,2,pg_temp.document('Revision two'),'1b000000-0000-4000-8000-000000000001');
set local role authenticated;
select pg_temp.become(5,'otp');
select throws_ok($$select pg_temp.save_result(
  '6b000000-0000-4000-8000-000000000001','7b000000-0000-4000-8000-000000000006',0,
  gen_random_uuid(),'IN_PROGRESS','[]',null
)$$,'P0001','FE_SUPERSEDED_PUBLICATION','a new session cannot start from a superseded publication');
select throws_ok($$select pg_temp.save_result(
  '6b000000-0000-4000-8000-000000000001','7b000000-0000-4000-8000-000000000002',2,
  gen_random_uuid(),'COMPLETED',pg_temp.progress_sets(),null
)$$,'P0001','FE_INVALID_WORKOUT','completion requires every prescribed set');
select throws_ok($$select pg_temp.save_result(
  '6b000000-0000-4000-8000-000000000001','7b000000-0000-4000-8000-000000000002',2,
  gen_random_uuid(),'COMPLETED',pg_temp.complete_sets(),null
)$$,'P0001','FE_INVALID_WORKOUT','a skipped set requires an explicit note');
select throws_ok($$select pg_temp.save_result(
  '6b000000-0000-4000-8000-000000000001','7b000000-0000-4000-8000-000000000002',2,
  gen_random_uuid(),'COMPLETED',pg_temp.complete_sets(),E' \n\t '
)$$,'P0001','FE_INVALID_WORKOUT','a whitespace-only note cannot justify a skipped set');
insert into workout_snapshots values('completed',pg_temp.save_result(
  '6b000000-0000-4000-8000-000000000001','7b000000-0000-4000-8000-000000000002',2,
  '6c000000-0000-4000-8000-000000000003','COMPLETED',pg_temp.complete_sets(),'Knee discomfort'
));
select is((select snapshot->>'status' from workout_snapshots where label='completed'),'COMPLETED','an already-started old publication can be completed');
select is(pg_temp.save_result(
  '6b000000-0000-4000-8000-000000000001','7b000000-0000-4000-8000-000000000002',2,
  '6c000000-0000-4000-8000-000000000003','COMPLETED',pg_temp.complete_sets(),'Knee discomfort'
),(select snapshot from workout_snapshots where label='completed'),'completion retry is exact and idempotent');
select throws_ok($$select pg_temp.save_result(
  '6b000000-0000-4000-8000-000000000001','7b000000-0000-4000-8000-000000000002',3,
  gen_random_uuid(),'COMPLETED',pg_temp.complete_sets(),'Knee discomfort'
)$$,'P0001','FE_WORKOUT_COMPLETED','a completed workout cannot be mutated under a new command');
insert into workout_snapshots values('current',pg_temp.save_result(
  '6b000000-0000-4000-8000-000000000002','7b000000-0000-4000-8000-000000000002',0,
  '6c000000-0000-4000-8000-000000000004','IN_PROGRESS',pg_temp.partial_sets()
));
select is(public.get_training_session_result(
  '6b000000-0000-4000-8000-000000000001',1,'7b000000-0000-4000-8000-000000000002'
)->'workout'->>'id',(select snapshot->>'id' from workout_snapshots where label='completed'),'detail preserves the historical publication result');
select ok(not (public.get_training_session_result(
  '6b000000-0000-4000-8000-000000000001',1,'7b000000-0000-4000-8000-000000000002'
)->'workout' ? 'session'),'GET wire response avoids duplicating the immutable publication session');
select is(public.get_training_session_result(
  '6b000000-0000-4000-8000-000000000002',1,'7b000000-0000-4000-8000-000000000006'
)->'workout','null'::jsonb,'valid scheduled session with no result is explicit');
select is((public.list_training_session_results(null,0)->>'total')::integer,2,'Client history spans immutable publication revisions');
select ok(not (public.list_training_session_results(null,0)#>'{items,0}' ? 'sets'),'history list omits heavy measurements and notes');

select pg_temp.become(6,'otp');
select is((select count(*) from public.training_session_results),0::bigint,'another Client cannot read results');
select throws_ok($$select public.get_training_session_result('6b000000-0000-4000-8000-000000000001',1,'7b000000-0000-4000-8000-000000000002')$$,'P0001','FE_NOT_FOUND','another Client cannot use detail RPC');
select pg_temp.become(2);
select is((select count(*) from public.training_session_results),0::bigint,'unassigned same-org Coach cannot read results');
select throws_ok($$select public.list_training_session_results('5b000000-0000-4000-8000-000000000005',0)$$,'P0001','FE_NOT_FOUND','unassigned Coach cannot list history');
select pg_temp.become(3);
select is((select count(*) from public.training_session_results),0::bigint,'foreign Admin cannot cross organization boundary');
select pg_temp.become(1);
select is((public.list_training_session_results('5b000000-0000-4000-8000-000000000005',0)->>'total')::integer,2,'assigned verified Coach reads Client history');
select pg_temp.become(1,'otp');
select throws_ok($$select public.list_training_session_results('5b000000-0000-4000-8000-000000000005',0)$$,'P0001','FE_NOT_FOUND','OTP-only Coach cannot read through can_publish_training');

-- Verified Staff may use its own explicit personal Client profile; OTP-only
-- Staff cannot inherit that capability.
select pg_temp.become(4);
select lives_ok($$select pg_temp.save_result(
  '6b000000-0000-4000-8000-000000000004','7b000000-0000-4000-8000-000000000006',0,
  '6c000000-0000-4000-8000-000000000005','COMPLETED',
  '[{"exerciseId":"7b000000-0000-4000-8000-000000000008","setNumber":1,"status":"DONE","reps":8,"load":40,"rir":null}]',null
)$$,'verified Staff records its personal workout with the same RPC');
select is((public.list_training_session_results(null,0)->>'total')::integer,1,'Staff personal history resolves without impersonation');
select pg_temp.become(4,'otp');
select throws_ok($$select public.list_training_session_results(null,0)$$,'P0001','FE_NOT_FOUND','OTP-only Staff cannot open personal results');
select is((select count(*) from public.training_session_results),0::bigint,'OTP-only Staff also fails direct result RLS');

reset role;
select throws_ok($$update public.training_session_results set note='tamper',row_version=row_version+1 where publication_id='6b000000-0000-4000-8000-000000000001'$$,
'P0001','FE_WORKOUT_COMPLETED','completed rows are immutable even to direct SQL');
select throws_ok($$delete from public.training_session_results where publication_id='6b000000-0000-4000-8000-000000000001'$$,
'P0001','FE_WORKOUT_COMPLETED','result history cannot be deleted directly');
select throws_ok($$update public.training_session_results set sets=jsonb_set(sets,'{0,unit}','"level"'),row_version=row_version+1 where publication_id='6b000000-0000-4000-8000-000000000002'$$,
'P0001','FE_INVALID_WORKOUT','direct SQL cannot forge publication-derived set metadata');
select is((select count(*) from public.audit_events where command in ('SAVE_TRAINING_SESSION_RESULT','COMPLETE_TRAINING_SESSION_RESULT')),5::bigint,'one safe audit exists per committed mutation and none per retry');
select is((select actor_role::text from public.audit_events where correlation_id='6c000000-0000-4000-8000-000000000005'),'ADMIN','Staff personal workout preserves the real actor role in audit');
select ok(not exists(
  select 1 from public.audit_events where command in ('SAVE_TRAINING_SESSION_RESULT','COMPLETE_TRAINING_SESSION_RESULT')
    and context::text ~* '(reps|load|rir|note|pain|email|name|answer|response)'
),'audits contain no workout measurements, notes or identity data');
select is((select count(*) from public.outbox_events where organization_id='2b000000-0000-4000-8000-000000000001'),0::bigint,'result saves emit no unsolicited outbox event');

-- A second active membership invalidates both RPC and direct RLS access for the
-- new Training-result surface, matching the M1 actor contract.
insert into public.organization_memberships(organization_id,user_id,role,status,activated_at,created_by)
values('2b000000-0000-4000-8000-000000000002','1b000000-0000-4000-8000-000000000005','CLIENT','ACTIVE',now(),'1b000000-0000-4000-8000-000000000003');
set local role authenticated;
select pg_temp.become(5,'otp');
select is((select count(*) from public.training_session_results),0::bigint,'multi-membership identity cannot read through new RLS policy');
select throws_ok($$select public.list_training_session_results(null,0)$$,'P0001','FE_FORBIDDEN','multi-membership identity is rejected before resolution');

reset role;
select * from finish();
rollback;
