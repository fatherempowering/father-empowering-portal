begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select has_table('public','week_zero_acquisitions','the additive Week Zero acquisition table exists');
select ok(
  (select relrowsecurity and relforcerowsecurity from pg_class where oid='public.week_zero_acquisitions'::regclass),
  'Week Zero acquisitions force RLS'
);
select ok(
  not has_table_privilege('authenticated','public.week_zero_acquisitions','INSERT,UPDATE,DELETE'),
  'authenticated browsers cannot write acquisition rows directly'
);
select ok(
  not has_table_privilege('authenticated','app_private.week_zero_acquisition_command_receipts','SELECT'),
  'retry receipts remain private'
);
select ok(
  has_function_privilege('authenticated','public.save_own_week_zero_acquisition(jsonb,bigint,uuid)','EXECUTE')
  and has_function_privilege('authenticated','public.attach_own_week_zero_photo(text,uuid,bigint,uuid)','EXECUTE')
  and has_function_privilege('authenticated','public.submit_own_week_zero_acquisition(bigint,uuid)','EXECUTE'),
  'authenticated actors may invoke only the guarded Week Zero commands'
);
select ok(
  not has_function_privilege('anon','public.save_own_week_zero_acquisition(jsonb,bigint,uuid)','EXECUTE')
  and not has_function_privilege('anon','public.attach_own_week_zero_photo(text,uuid,bigint,uuid)','EXECUTE')
  and not has_function_privilege('anon','public.submit_own_week_zero_acquisition(bigint,uuid)','EXECUTE'),
  'anonymous callers cannot invoke Week Zero commands'
);
select is(
  (select "public"::text from storage.buckets where id='week-zero-photos'),
  'false',
  'the Week Zero photo bucket is private'
);
select is(
  (select file_size_limit from storage.buckets where id='week-zero-photos'),
  4194304::bigint,
  'the private bucket limits each stored photo to four MiB'
);
select is(
  (select allowed_mime_types from storage.buckets where id='week-zero-photos'),
  array['image/jpeg','image/png','image/webp']::text[],
  'the private bucket allows only the three reviewed image MIME types'
);
select is(
  (
    select count(*)
    from pg_policies
    where schemaname='storage' and tablename='objects'
      and policyname like 'week_zero_photos_%'
      and cmd in ('INSERT','UPDATE','DELETE','ALL')
  ),
  0::bigint,
  'no browser write policy exists for private Week Zero photos'
);

insert into auth.users(
  id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at,
  confirmation_token,recovery_token,email_change,email_change_token_new
)
select
  ('a1000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  '00000000-0000-0000-0000-000000000000','authenticated','authenticated',
  'wz.'||n||'@example.test','',now(),'{}','{}',now(),now(),'','','',''
from generate_series(1,8)n;

insert into auth.sessions(id,user_id,created_at,updated_at)
select
  ('a8000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  ('a1000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  now(),now()
from generate_series(1,8)n;

insert into public.organizations(id,name,created_by) values
('a2000000-0000-4000-8000-000000000001','Week Zero org','a1000000-0000-4000-8000-000000000005'),
('a2000000-0000-4000-8000-000000000002','Foreign Week Zero org','a1000000-0000-4000-8000-000000000006');

insert into public.organization_memberships(
  organization_id,user_id,role,status,activated_at,created_by
) values
('a2000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','CLIENT','ACTIVE',now(),'a1000000-0000-4000-8000-000000000005'),
('a2000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000002','CLIENT','ACTIVE',now(),'a1000000-0000-4000-8000-000000000005'),
('a2000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000003','COACH','ACTIVE',now(),'a1000000-0000-4000-8000-000000000005'),
('a2000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000004','COACH','ACTIVE',now(),'a1000000-0000-4000-8000-000000000005'),
('a2000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000005','ADMIN','ACTIVE',now(),'a1000000-0000-4000-8000-000000000005'),
('a2000000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-000000000006','ADMIN','ACTIVE',now(),'a1000000-0000-4000-8000-000000000006'),
('a2000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000007','COACH','ACTIVE',now(),'a1000000-0000-4000-8000-000000000005'),
('a2000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000008','CLIENT','SUSPENDED',now(),'a1000000-0000-4000-8000-000000000005');

insert into app_private.coach_session_attestations(
  session_id,user_id,method,verified_at,expires_at
) values
('a8000000-0000-4000-8000-000000000003','a1000000-0000-4000-8000-000000000003','email_otp',now(),now()+interval '1 day'),
('a8000000-0000-4000-8000-000000000004','a1000000-0000-4000-8000-000000000004','email_otp',now(),now()+interval '1 day'),
('a8000000-0000-4000-8000-000000000005','a1000000-0000-4000-8000-000000000005','email_otp',now(),now()+interval '1 day'),
('a8000000-0000-4000-8000-000000000006','a1000000-0000-4000-8000-000000000006','email_otp',now(),now()+interval '1 day'),
('a8000000-0000-4000-8000-000000000007','a1000000-0000-4000-8000-000000000007','email_otp',now(),now()+interval '1 day');

insert into public.clients(
  id,organization_id,auth_user_id,email,first_name,last_name,status,created_by
) values
('a5000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','wz.1@example.test','Target','Client','ACTIVE','a1000000-0000-4000-8000-000000000005'),
('a5000000-0000-4000-8000-000000000002','a2000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000002','wz.2@example.test','Other','Client','ACTIVE','a1000000-0000-4000-8000-000000000005'),
('a5000000-0000-4000-8000-000000000007','a2000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000007','wz.7@example.test','Staff','Personal','ACTIVE','a1000000-0000-4000-8000-000000000007'),
('a5000000-0000-4000-8000-000000000008','a2000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000008','wz.8@example.test','Suspended','Client','ACTIVE','a1000000-0000-4000-8000-000000000005');

insert into public.coach_client_assignments(
  organization_id,client_id,coach_user_id,status,created_by
) values (
  'a2000000-0000-4000-8000-000000000001','a5000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000003','ACTIVE','a1000000-0000-4000-8000-000000000005'
);

create function pg_temp.wz_become(n integer, method text default 'otp')
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-'||lpad(n::text,12,'0'),true);
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub','a1000000-0000-4000-8000-'||lpad(n::text,12,'0'),
      'role','authenticated','aal','aal1',
      'session_id','a8000000-0000-4000-8000-'||lpad(n::text,12,'0'),
      'amr',jsonb_build_array(jsonb_build_object('method',method))
    )::text,
    true
  );
end $$;

create function pg_temp.wz_empty() returns jsonb language sql immutable as $$
  select '{
    "instructionsAccepted":false,
    "photos":{"front":null,"side":null,"back":null,"notes":null},
    "measurements":{"bodyWeightLb":null,"waistIn":null,"chestIn":null,"hipsIn":null,"rightArmIn":null,"rightThighIn":null,"other":null},
    "loads":{
      "squat":{"status":"NOT_STARTED","variant":null,"load":null,"unit":null,"mode":null,"reps":null,"rir":null,"reason":null,"note":null},
      "deadlift":{"status":"NOT_STARTED","variant":null,"load":null,"unit":null,"mode":null,"reps":null,"rir":null,"reason":null,"note":null},
      "horizontalPress":{"status":"NOT_STARTED","variant":null,"load":null,"unit":null,"mode":null,"reps":null,"rir":null,"reason":null,"note":null},
      "verticalPress":{"status":"NOT_STARTED","variant":null,"load":null,"unit":null,"mode":null,"reps":null,"rir":null,"reason":null,"note":null},
      "cableRow":{"status":"NOT_STARTED","variant":null,"load":null,"unit":null,"mode":null,"reps":null,"rir":null,"reason":null,"note":null},
      "pullUps":{"status":"NOT_STARTED","variant":null,"load":null,"unit":null,"mode":null,"reps":null,"rir":null,"reason":null,"note":null},
      "lunge":{"status":"NOT_STARTED","variant":null,"load":null,"unit":null,"mode":null,"reps":null,"rir":null,"reason":null,"note":null},
      "legPress":{"status":"NOT_STARTED","variant":null,"load":null,"unit":null,"mode":null,"reps":null,"rir":null,"reason":null,"note":null}
    },
    "cardio":{"status":"NOT_STARTED","reason":null,"age":null,"weightKg":null,"sex":null,"trainingLevel":null,"totalSeconds":null,"notes":null},
    "mobility":{"painSquat":"NOT_ASSESSED","painHinge":"NOT_ASSESSED","painPush":"NOT_ASSESSED","painPull":"NOT_ASSESSED","painCardio":"NOT_ASSESSED","limitedMovement":null,"comfortableMovement":null,"tightArea":null}
  }'::jsonb
$$;

create function pg_temp.wz_complete() returns jsonb language sql immutable as $$
  select jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(
              jsonb_set(
                jsonb_set(
                  jsonb_set(
                    jsonb_set(
                      jsonb_set(
                        jsonb_set(pg_temp.wz_empty(),'{instructionsAccepted}','true'),
                        '{photos,front}','"a9000000-0000-4000-8000-000000000001"'),
                      '{photos,side}','"a9000000-0000-4000-8000-000000000002"'),
                    '{photos,back}','"a9000000-0000-4000-8000-000000000003"'),
                  '{measurements,bodyWeightLb}','200'),
                '{measurements,waistIn}','40'),
              '{cardio}','{"status":"NOT_PERFORMED","reason":"No rower","age":null,"weightKg":null,"sex":null,"trainingLevel":null,"totalSeconds":null,"notes":null}'),
            '{mobility}','{"painSquat":"NOT_PERFORMED","painHinge":"NOT_PERFORMED","painPush":"NOT_PERFORMED","painPull":"NOT_PERFORMED","painCardio":"NOT_PERFORMED","limitedMovement":"N.A.","comfortableMovement":"N.A.","tightArea":"N.A."}'),
          '{loads,squat}','{"status":"NOT_PERFORMED","variant":null,"load":null,"unit":null,"mode":null,"reps":null,"rir":null,"reason":"Not tested","note":null}'),
        '{loads,deadlift}','{"status":"NOT_PERFORMED","variant":null,"load":null,"unit":null,"mode":null,"reps":null,"rir":null,"reason":"Not tested","note":null}'),
      '{loads,horizontalPress}','{"status":"NOT_PERFORMED","variant":null,"load":null,"unit":null,"mode":null,"reps":null,"rir":null,"reason":"Not tested","note":null}'),
    '{loads,verticalPress}','{"status":"NOT_PERFORMED","variant":null,"load":null,"unit":null,"mode":null,"reps":null,"rir":null,"reason":"Not tested","note":null}')
  || jsonb_build_object('loads', (pg_temp.wz_empty()->'loads') || '{
    "squat":{"status":"NOT_PERFORMED","variant":null,"load":null,"unit":null,"mode":null,"reps":null,"rir":null,"reason":"Not tested","note":null},
    "deadlift":{"status":"NOT_PERFORMED","variant":null,"load":null,"unit":null,"mode":null,"reps":null,"rir":null,"reason":"Not tested","note":null},
    "horizontalPress":{"status":"NOT_PERFORMED","variant":null,"load":null,"unit":null,"mode":null,"reps":null,"rir":null,"reason":"Not tested","note":null},
    "verticalPress":{"status":"NOT_PERFORMED","variant":null,"load":null,"unit":null,"mode":null,"reps":null,"rir":null,"reason":"Not tested","note":null},
    "cableRow":{"status":"NOT_PERFORMED","variant":null,"load":null,"unit":null,"mode":null,"reps":null,"rir":null,"reason":"Not tested","note":null},
    "pullUps":{"status":"NOT_PERFORMED","variant":null,"load":null,"unit":null,"mode":null,"reps":null,"rir":null,"reason":"Not tested","note":null},
    "lunge":{"status":"NOT_PERFORMED","variant":null,"load":null,"unit":null,"mode":null,"reps":null,"rir":null,"reason":"Not tested","note":null},
    "legPress":{"status":"NOT_PERFORMED","variant":null,"load":null,"unit":null,"mode":null,"reps":null,"rir":null,"reason":"Not tested","note":null}
  }'::jsonb)
$$;

select ok(app_private.week_zero_acquisition_responses_valid(pg_temp.wz_empty(),false),'an empty draft is structurally valid');
select ok(not app_private.week_zero_acquisition_responses_valid(pg_temp.wz_empty(),true),'an empty draft is never complete');
select ok(app_private.week_zero_acquisition_responses_valid(pg_temp.wz_complete(),true),'an honest complete payload is accepted');
select ok(
  app_private.week_zero_acquisition_responses_valid(
    jsonb_set(pg_temp.wz_empty(),'{measurements,chestIn}','0.0000001'),false
  ),
  'the SQL boundary preserves the shared contract for every strictly positive measurement'
);
select ok(
  not app_private.week_zero_acquisition_responses_valid(
    jsonb_set(pg_temp.wz_empty(),'{measurements,chestIn}','0'),false
  ),
  'the SQL boundary rejects zero measurements'
);
select ok(
  not app_private.week_zero_acquisition_responses_valid(
    jsonb_set(pg_temp.wz_complete(),'{loads,squat,reason}',to_jsonb(E' \n\t '::text)),true
  ),
  'whitespace-only not-performed reason is rejected at the direct RPC boundary'
);
select ok(
  app_private.week_zero_acquisition_responses_valid(
    jsonb_set(
      jsonb_set(pg_temp.wz_empty(),'{loads,horizontalPress,status}','"DONE"'),
      '{loads,horizontalPress,load}','40'
    ),false
  ),
  'a partially entered DONE load remains draft-saveable'
);
select ok(
  not app_private.week_zero_acquisition_responses_valid(
    jsonb_set(
      jsonb_set(
        jsonb_set(pg_temp.wz_empty(),'{cardio,status}','"DONE"'),
        '{cardio,weightKg}','0.001'
      ),'{cardio,age}','40'
    ),false
  ),
  'the direct RPC boundary rejects implausible weight outside the Legacy range'
);
select ok(
  not app_private.week_zero_acquisition_responses_valid(
    jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(pg_temp.wz_empty(),'{loads,pullUps,status}','"DONE"'),
          '{loads,pullUps,variant}','"PULL_UPS"'
        ),'{loads,pullUps,mode}','"PER_HAND"'
      ),'{loads,pullUps,reps}','5'
    ),false
  ),
  'the SQL boundary rejects a load mode incompatible with the movement variant'
);

set local role authenticated;
select pg_temp.wz_become(1);
select throws_ok(
  $$insert into public.week_zero_acquisitions(organization_id,client_id,responses)
    values('a2000000-0000-4000-8000-000000000001','a5000000-0000-4000-8000-000000000001',pg_temp.wz_empty())$$,
  '42501',null,'authenticated cannot bypass the acquisition RPC'
);
select is(
  public.save_own_week_zero_acquisition(
    pg_temp.wz_empty(),0,'a6000000-0000-4000-8000-000000000001'
  )->>'version','1','the owner creates a private draft through CAS'
);
select is(
  public.save_own_week_zero_acquisition(
    pg_temp.wz_empty(),0,'a6000000-0000-4000-8000-000000000001'
  )->>'version','1','an exact save retry returns the original receipt'
);
select throws_ok(
  $$select public.save_own_week_zero_acquisition(
    jsonb_set(pg_temp.wz_empty(),'{photos,notes}','"changed"'),0,
    'a6000000-0000-4000-8000-000000000001'
  )$$,
  'P0001','FE_IDEMPOTENCY_CONFLICT','one save key cannot acknowledge changed intent'
);
select throws_ok(
  $$select public.submit_own_week_zero_acquisition(1,'a6000000-0000-4000-8000-000000000002')$$,
  'P0001','FE_WEEK_ZERO_ACQUISITION_INCOMPLETE','incomplete acquisition cannot be submitted'
);
select throws_ok(
  $$insert into storage.objects(bucket_id,name,metadata) values(
    'week-zero-photos',
    'a2000000-0000-4000-8000-000000000001/a5000000-0000-4000-8000-000000000001/front/a9000000-0000-4000-8000-000000000099',
    '{"mimetype":"image/jpeg","size":3}'
  )$$,
  '42501',null,'authenticated cannot bypass the server-owned photo upload path'
);

reset role;
insert into storage.objects(bucket_id,name,metadata) values
('week-zero-photos','a2000000-0000-4000-8000-000000000001/a5000000-0000-4000-8000-000000000001/front/a9000000-0000-4000-8000-000000000001','{"mimetype":"image/jpeg","size":1000}'),
('week-zero-photos','a2000000-0000-4000-8000-000000000001/a5000000-0000-4000-8000-000000000001/side/a9000000-0000-4000-8000-000000000002','{"mimetype":"image/jpeg","size":1000}'),
('week-zero-photos','a2000000-0000-4000-8000-000000000001/a5000000-0000-4000-8000-000000000001/back/a9000000-0000-4000-8000-000000000003','{"mimetype":"image/jpeg","size":1000}');
create temp table wz_snapshots(label text primary key,snapshot jsonb not null);
grant select,insert on wz_snapshots to authenticated;

set local role authenticated;
select pg_temp.wz_become(1);
insert into wz_snapshots values('front',public.attach_own_week_zero_photo(
  'front','a9000000-0000-4000-8000-000000000001',1,'a6000000-0000-4000-8000-000000000003'
));
select is((select snapshot->>'version' from wz_snapshots where label='front'),'2','front photo attaches with CAS');
select is(
  public.attach_own_week_zero_photo(
    'front','a9000000-0000-4000-8000-000000000001',1,'a6000000-0000-4000-8000-000000000003'
  ),
  (select snapshot from wz_snapshots where label='front'),
  'photo attach replay returns the original snapshot even after version advanced'
);
select throws_ok(
  $$select public.attach_own_week_zero_photo(
    'side','a9000000-0000-4000-8000-000000000002',1,
    'a6000000-0000-4000-8000-000000000003'
  )$$,
  'P0001','FE_IDEMPOTENCY_CONFLICT','one photo key cannot be reused for another slot'
);
select is(public.attach_own_week_zero_photo(
  'side','a9000000-0000-4000-8000-000000000002',2,'a6000000-0000-4000-8000-000000000004'
)->>'version','3','side photo attaches');
select is(public.attach_own_week_zero_photo(
  'back','a9000000-0000-4000-8000-000000000003',3,'a6000000-0000-4000-8000-000000000005'
)->>'version','4','back photo attaches');
select is(public.save_own_week_zero_acquisition(
  pg_temp.wz_complete(),4,'a6000000-0000-4000-8000-000000000006'
)->>'version','5','the complete response saves without changing attached photo identities');
insert into wz_snapshots values('submitted',public.submit_own_week_zero_acquisition(
  5,'a6000000-0000-4000-8000-000000000007'
));
select is((select snapshot->>'status' from wz_snapshots where label='submitted'),'SUBMITTED','complete Week Zero submits');
select is(
  public.submit_own_week_zero_acquisition(5,'a6000000-0000-4000-8000-000000000007'),
  (select snapshot from wz_snapshots where label='submitted'),
  'submit replay is exact and idempotent'
);
select throws_ok(
  $$select public.save_own_week_zero_acquisition(
    pg_temp.wz_complete(),6,'a6000000-0000-4000-8000-000000000008'
  )$$,
  'P0001','FE_WEEK_ZERO_ACQUISITION_SUBMITTED','submitted answers are immutable'
);

select is((select count(*) from public.week_zero_acquisitions where client_id='a5000000-0000-4000-8000-000000000001'),1::bigint,'owner reads its submitted acquisition');
select is((select count(*) from storage.objects where bucket_id='week-zero-photos'),3::bigint,'owner reads only its three stored photos after submission');
update storage.objects set metadata='{}' where bucket_id='week-zero-photos';
select is(
  (select count(*) from storage.objects
   where bucket_id='week-zero-photos' and metadata @> '{"mimetype":"image/jpeg","size":1000}'),
  3::bigint,
  'authenticated cannot update stored photos'
);
select throws_ok(
  $$delete from storage.objects where bucket_id='week-zero-photos'$$,
  '42501',
  'Direct deletion from storage tables is not allowed. Use the Storage API instead.',
  'Storage rejects direct photo deletion without disabling its protection'
);
select is(
  (select count(*) from storage.objects where bucket_id='week-zero-photos'),
  3::bigint,
  'authenticated cannot delete stored photos'
);

select pg_temp.wz_become(2);
select is(public.save_own_week_zero_acquisition(
  pg_temp.wz_empty(),0,'a6000000-0000-4000-8000-000000000009'
)->>'status','DRAFT','another Client may create only its own private draft');
select is((select count(*) from public.week_zero_acquisitions where client_id='a5000000-0000-4000-8000-000000000001'),0::bigint,'another Client cannot read the target acquisition');
select is((select count(*) from storage.objects where bucket_id='week-zero-photos'),0::bigint,'another Client cannot read target photos');

select pg_temp.wz_become(3,'password');
select is((select count(*) from public.week_zero_acquisitions where client_id='a5000000-0000-4000-8000-000000000001'),1::bigint,'verified assigned Coach reads the submitted acquisition');
select is((select count(*) from public.week_zero_acquisitions where client_id='a5000000-0000-4000-8000-000000000002'),0::bigint,'Coach cannot read an assigned-independent draft');
select is((select count(*) from storage.objects where bucket_id='week-zero-photos'),3::bigint,'verified assigned Coach reads submitted referenced photos');

reset role;
update public.coach_client_assignments
set status='PAUSED'
where client_id='a5000000-0000-4000-8000-000000000001'
  and coach_user_id='a1000000-0000-4000-8000-000000000003';
set local role authenticated;
select pg_temp.wz_become(3,'password');
select is((select count(*) from public.week_zero_acquisitions where client_id='a5000000-0000-4000-8000-000000000001'),1::bigint,'verified paused Coach retains historical submitted acquisition read');
select is((select count(*) from storage.objects where bucket_id='week-zero-photos'),3::bigint,'verified paused Coach retains historical submitted photo read');

reset role;
insert into public.organization_memberships(
  organization_id,user_id,role,status,activated_at,created_by
) values(
  'a2000000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-000000000003',
  'COACH','ACTIVE',now(),'a1000000-0000-4000-8000-000000000006'
);
set local role authenticated;
select pg_temp.wz_become(3,'password');
select is((select count(*) from public.week_zero_acquisitions),0::bigint,'an ambiguous multi-membership Coach loses acquisition reads');
select is((select count(*) from storage.objects where bucket_id='week-zero-photos'),0::bigint,'an ambiguous multi-membership Coach loses photo reads');
reset role;
delete from public.organization_memberships
where organization_id='a2000000-0000-4000-8000-000000000002'
  and user_id='a1000000-0000-4000-8000-000000000003';

set local role authenticated;
select pg_temp.wz_become(4,'password');
select is((select count(*) from public.week_zero_acquisitions),0::bigint,'unassigned Coach cannot enumerate acquisitions');
select is((select count(*) from storage.objects where bucket_id='week-zero-photos'),0::bigint,'unassigned Coach cannot enumerate photos');

select pg_temp.wz_become(5,'password');
select is((select count(*) from public.week_zero_acquisitions where client_id='a5000000-0000-4000-8000-000000000001'),1::bigint,'verified same-org Admin reads submitted acquisition');
select is((select count(*) from storage.objects where bucket_id='week-zero-photos'),3::bigint,'verified same-org Admin reads submitted photos');

select pg_temp.wz_become(6,'password');
select is((select count(*) from public.week_zero_acquisitions),0::bigint,'cross-org Admin cannot enumerate acquisitions');
select is((select count(*) from storage.objects where bucket_id='week-zero-photos'),0::bigint,'cross-org Admin cannot enumerate photos');

select pg_temp.wz_become(7,'password');
select is(public.save_own_week_zero_acquisition(
  pg_temp.wz_empty(),0,'a6000000-0000-4000-8000-000000000010'
)->>'status','DRAFT','verified Staff personal surface uses the same own-client capability without a fake Client role');

reset role;
insert into public.organization_memberships(
  organization_id,user_id,role,status,activated_at,created_by
) values(
  'a2000000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-000000000007',
  'COACH','ACTIVE',now(),'a1000000-0000-4000-8000-000000000006'
);
set local role authenticated;
select pg_temp.wz_become(7,'password');
select throws_ok(
  $$select public.save_own_week_zero_acquisition(
    pg_temp.wz_empty(),1,'a6000000-0000-4000-8000-000000000013'
  )$$,
  'P0001','FE_FORBIDDEN','an ambiguous multi-membership Staff owner is refused before mutation'
);
reset role;
delete from public.organization_memberships
where organization_id='a2000000-0000-4000-8000-000000000002'
  and user_id='a1000000-0000-4000-8000-000000000007';

set local role authenticated;
select pg_temp.wz_become(7,'otp');
select throws_ok(
  $$select public.save_own_week_zero_acquisition(
    pg_temp.wz_empty(),1,'a6000000-0000-4000-8000-000000000011'
  )$$,
  'P0001','FE_FORBIDDEN','OTP-only Staff session cannot access the personal Client acquisition'
);

select pg_temp.wz_become(8);
select throws_ok(
  $$select public.save_own_week_zero_acquisition(
    pg_temp.wz_empty(),0,'a6000000-0000-4000-8000-000000000012'
  )$$,
  'P0001','FE_FORBIDDEN','suspended Client membership cannot create an acquisition'
);

reset role;
select is(
  (select actor_role::text from public.audit_events where command='SubmitWeekZeroAcquisition'),
  'CLIENT',
  'submission audit preserves the real actor role'
);
select ok(
  not exists (
    select 1 from public.audit_events
    where command in ('AttachWeekZeroPhoto','SubmitWeekZeroAcquisition')
      and context::text ~* '(responses|bodyWeight|reason|a9000000)'
  ),
  'audit metadata contains no responses, reasons, or photo identifiers'
);
select is((select count(*) from public.week_zero_assessments),0::bigint,'the historical initial-assessment table remains untouched');

select * from finish();
rollback;
