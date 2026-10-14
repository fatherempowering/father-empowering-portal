begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='public.training_program_drafts'::regclass),'draft RLS enabled and forced');
select ok(not has_table_privilege('anon','public.training_program_drafts','SELECT'),'anonymous read denied');
select ok(not has_table_privilege('authenticated','public.training_program_drafts','INSERT,UPDATE,DELETE'),'direct writes denied');
select ok(not has_table_privilege('authenticated','app_private.training_program_receipts','SELECT'),'receipts private');
select ok(not has_function_privilege('anon','public.save_training_program_draft(uuid,jsonb,bigint,uuid)','EXECUTE'),'anonymous RPC denied');
select ok((select prosecdef and proconfig @> array['search_path=""'] from pg_proc where oid='public.save_training_program_draft(uuid,jsonb,bigint,uuid)'::regprocedure),'mutation fixed search path');

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new)
select ('19000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','draft.'||n||'@example.test','',now(),'{}','{}',now(),now(),'','','','' from generate_series(1,5)n;
insert into auth.sessions(id,user_id,created_at,updated_at)
select ('89000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,('19000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,now(),now() from generate_series(1,5)n;
insert into public.organizations(id,name,created_by) values
('29000000-0000-4000-8000-000000000001','Draft tests','19000000-0000-4000-8000-000000000004'),
('29000000-0000-4000-8000-000000000002','Other org','19000000-0000-4000-8000-000000000003');
insert into public.organization_memberships(organization_id,user_id,role,status,activated_at,created_by)
select case when n=3 then '29000000-0000-4000-8000-000000000002' else '29000000-0000-4000-8000-000000000001' end::uuid,
('19000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,case when n=5 then 'CLIENT' when n in(3,4) then 'ADMIN' else 'COACH' end::public.app_role,'ACTIVE',now(),'19000000-0000-4000-8000-000000000004' from generate_series(1,5)n;
insert into app_private.coach_session_attestations(session_id,user_id,method,verified_at,expires_at)
select ('89000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,('19000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'email_otp',now(),now()+interval '1 day' from generate_series(1,4)n;
create function pg_temp.become(n integer,method text default 'password') returns void language plpgsql as $$ begin
perform set_config('request.jwt.claim.sub','19000000-0000-4000-8000-'||lpad(n::text,12,'0'),true);
perform set_config('request.jwt.claims',jsonb_build_object('sub','19000000-0000-4000-8000-'||lpad(n::text,12,'0'),'role','authenticated','aal','aal1','session_id','89000000-0000-4000-8000-'||lpad(n::text,12,'0'),'amr',jsonb_build_array(jsonb_build_object('method',method)))::text,true);
end $$;
create function pg_temp.document() returns jsonb language sql as $$ select '{"schemaVersion":1,"phaseId":"79000000-0000-4000-8000-000000000001","title":{"fr":"Phase brouillon","en":"Draft phase"},"weeks":[{"number":1,"objective":{"fr":"","en":""},"sessions":[]}]}'::jsonb $$;
create function pg_temp.save(p_id uuid default null,p_doc jsonb default pg_temp.document(),p_version bigint default 0,p_key uuid default '69000000-0000-4000-8000-000000000001') returns jsonb language sql as $$ select public.save_training_program_draft(p_id,p_doc,p_version,p_key) $$;
create temp table draft_results(label text primary key,snapshot jsonb);
grant select,insert on draft_results to authenticated; grant select on draft_results to service_role;
create function pg_temp.id() returns uuid language sql as $$ select (snapshot->>'id')::uuid from draft_results where label='created' $$;

set local role authenticated;
select pg_temp.become(1,'otp');
select throws_ok('select pg_temp.save()','P0001','FE_FORBIDDEN','OTP-only Coach cannot save draft');
select pg_temp.become(1,'recovery');
select throws_ok('select pg_temp.save()','P0001','FE_FORBIDDEN','recovery does not authorize drafts');
select pg_temp.become(5);
select throws_ok('select pg_temp.save()','P0001','FE_FORBIDDEN','Client cannot save draft');
select pg_temp.become(1);
select lives_ok($$insert into draft_results values('created',pg_temp.save())$$,'verified Coach saves an incomplete draft');
select is((select count(*) from public.training_program_drafts),1::bigint,'creator reads own draft');
select is(pg_temp.save(),(select snapshot from draft_results where label='created'),'idempotent retry returns exact snapshot');
select throws_ok($$select pg_temp.save(p_doc=>jsonb_set(pg_temp.document(),'{title,fr}','"Changed"'))$$,'P0001','FE_IDEMPOTENCY_CONFLICT','different content cannot reuse receipt');
select throws_ok($$update public.training_program_drafts set document=pg_temp.document()$$,'42501',null,'authenticated cannot update table directly');
select throws_ok($$delete from public.training_program_drafts$$,'42501',null,'authenticated cannot delete drafts');
select throws_ok($$select pg_temp.save(p_doc=>null)$$,'P0001','FE_INVALID_TRAINING_DRAFT','SQL null document denied');
select throws_ok($$select pg_temp.save(p_doc=>'null')$$,'P0001','FE_INVALID_TRAINING_DRAFT','JSON null document denied');
select throws_ok($$select pg_temp.save(p_doc=>pg_temp.document()||'{"organizationId":"forged"}')$$,'P0001','FE_INVALID_TRAINING_DRAFT','unknown fields denied');
select throws_ok($$select pg_temp.save(p_doc=>jsonb_set(pg_temp.document(),'{weeks,0,number}','2'))$$,'P0001','FE_INVALID_TRAINING_DRAFT','nonconsecutive weeks denied');
select pg_temp.become(2);
select is((select count(*) from public.training_program_drafts),0::bigint,'other Coach in same org cannot read private draft');
select throws_ok('select pg_temp.save(pg_temp.id(),pg_temp.document(),1,gen_random_uuid())','P0001','FE_NOT_FOUND','other Coach cannot edit');
select pg_temp.become(3);
select is((select count(*) from public.training_program_drafts),0::bigint,'other org Admin cannot read');
select throws_ok('select pg_temp.save(pg_temp.id(),pg_temp.document(),1,gen_random_uuid())','P0001','FE_NOT_FOUND','other org Admin cannot edit');
select pg_temp.become(5);
select is((select count(*) from public.training_program_drafts),0::bigint,'Client cannot read own org draft');
select pg_temp.become(1);
select lives_ok($$insert into draft_results values('updated',pg_temp.save(pg_temp.id(),jsonb_set(pg_temp.document(),'{title,fr}','"Version deux"'),1,'69000000-0000-4000-8000-000000000002'))$$,'owner updates with expected version');
select is((select row_version from public.training_program_drafts),2::bigint,'version incremented');
select throws_ok('select pg_temp.save(pg_temp.id(),pg_temp.document(),1,gen_random_uuid())','P0001','FE_VERSION_CONFLICT','stale update blocked');
select throws_ok($$select pg_temp.save(pg_temp.id(),jsonb_set(pg_temp.document(),'{phaseId}','"79000000-0000-4000-8000-000000000099"'),2,gen_random_uuid())$$,'P0001','FE_INVALID_TRAINING_DRAFT','phase identity stable on update');
select pg_temp.become(4);
select is((select count(*) from public.training_program_drafts),1::bigint,'same org Admin may read');
select lives_ok('select pg_temp.save(pg_temp.id(),pg_temp.document(),2,gen_random_uuid())','same org Admin may edit');

reset role;
-- Validator is private; exercise its nested fail-closed rules as the test owner.
create temp table document_example(value jsonb);
insert into document_example values(jsonb_set(pg_temp.document(),'{weeks,0,sessions}',
'[{"id":"79000000-0000-4000-8000-000000000002","title":{"fr":"A","en":"A"},"type":"training","required":true,"schedule":{"mode":"flexible","day":null},"warmup":{"fr":"","en":""},"blocks":[{"id":"79000000-0000-4000-8000-000000000003","label":{"fr":"","en":""},"mode":"superset","restSeconds":90,"exercises":[{"id":"79000000-0000-4000-8000-000000000004","libraryExerciseId":"79000000-0000-4000-8000-000000000050","name":"Press","cue":{"fr":"","en":""},"media":null,"prescription":{"sets":3,"reps":"8-10","targetRir":2,"restSeconds":90,"tempo":"","loadTarget":"","unit":"lb"}}]}]}]'));
select ok(app_private.training_draft_valid((select value from document_example)),'incomplete superset allowed only in draft');
select ok(not app_private.training_draft_valid(jsonb_set((select value from document_example),'{weeks,0,sessions,0,type}','null')),'null session type denied');
select ok(not app_private.training_draft_valid(jsonb_set((select value from document_example),'{weeks,0,sessions,0,schedule,mode}','null')),'null schedule mode denied');
select ok(not app_private.training_draft_valid(jsonb_set((select value from document_example),'{weeks,0,sessions,0,blocks,0,mode}','null')),'null block mode denied');
select ok(not app_private.training_draft_valid(jsonb_set((select value from document_example),'{weeks,0,sessions,0,blocks,0,exercises,0,prescription,unit}','null')),'null unit denied');
select ok(not app_private.training_draft_valid(jsonb_set((select value from document_example),'{weeks,0,sessions,0,blocks,0,exercises,0,prescription,sets}','21')),'excessive sets denied');
select ok(not app_private.training_draft_valid(jsonb_set((select value from document_example),'{weeks,0,sessions,0,id}','"79000000-0000-4000-8000-000000000001"')),'duplicate phase/session id denied');
select ok(not app_private.training_draft_valid(jsonb_set((select value from document_example),'{weeks,0,sessions,0,type}','"complete-rest"')),'rest cannot hide exercises');
select ok(not app_private.training_draft_valid(jsonb_set((select value from document_example),'{weeks,0,sessions,0,blocks,0,exercises,0,media}','{"assetId":"79000000-0000-4000-8000-000000000050","kind":"VIDEO"}')),'unsupported private media cannot enter draft');
grant select on document_example to authenticated;
set local role authenticated;
select pg_temp.become(1);
select throws_ok('select pg_temp.save(p_doc=>(select value from document_example),p_key=>gen_random_uuid())','P0001','FE_INVALID_TRAINING_DRAFT','unknown library exercise denied');
reset role;
insert into public.training_exercises(id,organization_id,name,default_unit,created_by) values('79000000-0000-4000-8000-000000000050','29000000-0000-4000-8000-000000000002','Other org Press','lb','19000000-0000-4000-8000-000000000003');
set local role authenticated;
select pg_temp.become(1);
select throws_ok('select pg_temp.save(p_doc=>(select value from document_example),p_key=>gen_random_uuid())','P0001','FE_INVALID_TRAINING_DRAFT','cross-org library exercise denied');
reset role;
update public.training_exercises set organization_id='29000000-0000-4000-8000-000000000001' where id='79000000-0000-4000-8000-000000000050';
set local role authenticated;
select pg_temp.become(1);
select lives_ok('select pg_temp.save(p_doc=>(select value from document_example),p_key=>gen_random_uuid())','same org library exercise allowed');
reset role;
set local role service_role;
select is((select count(*) from public.audit_events where entity_id=pg_temp.id()),3::bigint,'one audit per successful version, no retry audit');
select is((select count(*) from public.outbox_events where organization_id='29000000-0000-4000-8000-000000000001'),0::bigint,'draft never queues Client publication or email');
reset role;
update public.organization_memberships set status='SUSPENDED' where user_id='19000000-0000-4000-8000-000000000001';
set local role authenticated;
select pg_temp.become(1);
select is((select count(*) from public.training_program_drafts),0::bigint,'suspended owner loses read');
select throws_ok('select pg_temp.save()','P0001','FE_FORBIDDEN','receipt cannot bypass revoked authorization');
reset role;
select * from finish();
rollback;
