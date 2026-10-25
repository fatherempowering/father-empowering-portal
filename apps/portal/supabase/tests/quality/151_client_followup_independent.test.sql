begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- Independent actor/mutation gate. All identities and content are disposable.
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,
 raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new)
select ('b1510000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 '00000000-0000-0000-0000-000000000000','authenticated','authenticated',
 'independent-followup.'||n||'@example.test','',now(),'{}','{}',now(),now(),'','','',''
from generate_series(1,7)n;
insert into auth.sessions(id,user_id,created_at,updated_at)
select ('b1520000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 ('b1510000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,now(),now() from generate_series(1,7)n;
insert into public.organizations(id,name,created_by) values
 ('b1530000-0000-4000-8000-000000000001','Followup QA','b1510000-0000-4000-8000-000000000005'),
 ('b1530000-0000-4000-8000-000000000002','Foreign followup QA','b1510000-0000-4000-8000-000000000006');
insert into public.organization_memberships(organization_id,user_id,role,status,activated_at,created_by)
select case when n=6 then 'b1530000-0000-4000-8000-000000000002' else 'b1530000-0000-4000-8000-000000000001' end::uuid,
 ('b1510000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 (case when n in (1,2,7) then 'CLIENT' when n in (3,4) then 'COACH' else 'ADMIN' end)::public.app_role,
 (case when n=7 then 'SUSPENDED' else 'ACTIVE' end)::public.account_status,now(),'b1510000-0000-4000-8000-000000000005'
from generate_series(1,7)n;
insert into app_private.coach_session_attestations(session_id,user_id,method,verified_at,expires_at)
select ('b1520000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 ('b1510000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'email_otp',now(),now()+interval '1 day'
from generate_series(3,6)n;
insert into public.clients(id,organization_id,auth_user_id,email,first_name,last_name,status,created_by)
select ('b1540000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'b1530000-0000-4000-8000-000000000001',
 ('b1510000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'independent-followup.'||n||'@example.test',
 'Synthetic','Followup','ACTIVE','b1510000-0000-4000-8000-000000000005' from unnest(array[1,2,7])n;
insert into public.coach_client_assignments(organization_id,client_id,coach_user_id,status,created_by)
values('b1530000-0000-4000-8000-000000000001','b1540000-0000-4000-8000-000000000001',
 'b1510000-0000-4000-8000-000000000003','ACTIVE','b1510000-0000-4000-8000-000000000005');

create function pg_temp.followup_actor(n integer,verified boolean default true) returns void language plpgsql as $$
begin
 perform set_config('request.jwt.claim.sub','b1510000-0000-4000-8000-'||lpad(n::text,12,'0'),true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub','b1510000-0000-4000-8000-'||lpad(n::text,12,'0'),
  'role','authenticated','aal','aal1','session_id',case when verified then 'b1520000-0000-4000-8000-'||lpad(n::text,12,'0') else 'b1520000-0000-4000-8000-000000000099' end,
  'amr',jsonb_build_array(jsonb_build_object('method','password')))::text,true);
end $$;
create function pg_temp.followup_nutrition() returns jsonb language sql immutable as $$
 select '{"title":{"fr":"Plan QA","en":"QA plan"},"targets":{"calories":null,"proteinG":null,"carbohydrateG":null,"fatG":null},"meals":[{"id":"b1550000-0000-4000-8000-000000000001","title":{"fr":"Repas QA","en":"QA meal"},"portions":{"fr":"Une portion test","en":"One test portion"},"notes":{"fr":"","en":""}}],"instructions":{"fr":"","en":""},"preparation":{"fr":"","en":""},"grocery":{"fr":"","en":""}}'::jsonb
$$;
create function pg_temp.followup_checkin() returns jsonb language sql immutable as $$
 select '{"observedOn":"2020-01-02","measurements":{"bodyWeightLb":200,"waistIn":40,"chestIn":null,"hipsIn":null,"leftArmIn":null,"rightArmIn":null,"leftThighIn":null,"rightThighIn":null,"leftCalfIn":null,"rightCalfIn":null},"sleepHours":7.5,"sleepQuality":null,"energy":null,"stress":null,"soreness":null,"cardioMinutes":0,"cardioZone":null,"notes":"PRIVATE_SYNTHETIC_CHECKIN_SENTINEL"}'::jsonb
$$;

set local role authenticated;
select pg_temp.followup_actor(3);
select is(public.mutate_coach_nutrition('b1540000-0000-4000-8000-000000000001',jsonb_build_object('action','save','document',pg_temp.followup_nutrition(),'expectedVersion',0,'clientMutationId','b1560000-0000-4000-8000-000000000001'))->>'version','1','assigned verified Coach saves Nutrition');
select is(public.mutate_coach_nutrition('b1540000-0000-4000-8000-000000000001',jsonb_build_object('action','save','document',pg_temp.followup_nutrition(),'expectedVersion',0,'clientMutationId','b1560000-0000-4000-8000-000000000001'))->>'version','1','exact RPC retry returns original outcome without incrementing');
select throws_ok($$select public.mutate_coach_nutrition('b1540000-0000-4000-8000-000000000001',jsonb_build_object('action','save','document',jsonb_set(pg_temp.followup_nutrition(),'{title,fr}','"Changed"'),'expectedVersion',0,'clientMutationId','b1560000-0000-4000-8000-000000000001'))$$,'P0001','FE_IDEMPOTENCY_CONFLICT','same key with different content is rejected');
select throws_ok($$select public.mutate_coach_nutrition('b1540000-0000-4000-8000-000000000001',jsonb_build_object('action','save','document',pg_temp.followup_nutrition(),'expectedVersion',0,'clientMutationId','b1560000-0000-4000-8000-000000000002'))$$,'P0001','FE_VERSION_CONFLICT','stale save cannot overwrite Nutrition');
select throws_ok($$update public.nutrition_plan_drafts set row_version=99$$,'42501',null,'direct authenticated draft update is forbidden');
select pg_temp.followup_actor(1);
select is((select count(*) from public.nutrition_plan_drafts),0::bigint,'Client cannot read unpublished Nutrition');
select throws_ok($$select public.get_followup_for_coach('b1540000-0000-4000-8000-000000000001','nutrition')$$,'P0001','FE_FORBIDDEN','Client cannot impersonate Coach RPC');
select is(public.mutate_own_checkin(jsonb_build_object('action','save','document',pg_temp.followup_checkin(),'expectedVersion',0,'clientMutationId','b1560000-0000-4000-8000-000000000010'))->>'version','1','Client saves own Check-in draft');
select is((select count(*) from public.client_checkin_drafts),1::bigint,'Client sees own draft');
select throws_ok($$select public.mutate_own_checkin(jsonb_build_object('action','save','document',pg_temp.followup_checkin(),'expectedVersion',1,'clientMutationId','b1560000-0000-4000-8000-000000000019','clientId','b1540000-0000-4000-8000-000000000002'))$$,'P0001','FE_INVALID_FOLLOWUP','Client cannot inject a destination identity');
select pg_temp.followup_actor(2);
select is((select count(*) from public.client_checkin_drafts),0::bigint,'another Client sees no foreign draft');
select pg_temp.followup_actor(3);
select is((select count(*) from public.client_checkin_drafts),0::bigint,'assigned Coach cannot SELECT private Client drafts');
select is(jsonb_array_length(public.get_followup_for_coach('b1540000-0000-4000-8000-000000000001','check-ins')->'history'),0,'Coach API projection has no unsubmitted data');
select ok(not(public.get_followup_for_coach('b1540000-0000-4000-8000-000000000001','check-ins') ? 'draft'),'Coach projection has no draft field');
select pg_temp.followup_actor(5);
select is((select count(*) from public.client_checkin_drafts),0::bigint,'organization Admin cannot read another Client draft');
select is(public.mutate_coach_nutrition('b1540000-0000-4000-8000-000000000002',jsonb_build_object('action','save','document',jsonb_set(jsonb_set(pg_temp.followup_nutrition(),'{title,fr}',to_jsonb(E'\t\n'::text)),'{title,en}','""'),'expectedVersion',0,'clientMutationId','b1560000-0000-4000-8000-000000000030'))->>'version','1','whitespace title may be saved as an incomplete draft');
select throws_ok($$select public.mutate_coach_nutrition('b1540000-0000-4000-8000-000000000002','{"action":"publish","expectedVersion":1,"expectedPublicationId":null,"clientMutationId":"b1560000-0000-4000-8000-000000000031"}')$$,'P0001','FE_NUTRITION_INCOMPLETE','direct RPC cannot publish a tab/newline-only title');
select is(public.mutate_coach_nutrition('b1540000-0000-4000-8000-000000000002',jsonb_build_object('action','save','document',jsonb_set(jsonb_set(pg_temp.followup_nutrition(),'{meals,0,portions,fr}',to_jsonb(E'\t\n'::text)),'{meals,0,portions,en}','""'),'expectedVersion',1,'clientMutationId','b1560000-0000-4000-8000-000000000032'))->>'version','2','whitespace portion stays draft-saveable');
select throws_ok($$select public.mutate_coach_nutrition('b1540000-0000-4000-8000-000000000002','{"action":"publish","expectedVersion":2,"expectedPublicationId":null,"clientMutationId":"b1560000-0000-4000-8000-000000000033"}')$$,'P0001','FE_NUTRITION_INCOMPLETE','direct RPC cannot publish a tab/newline-only portion');
select pg_temp.followup_actor(4);
select is((select count(*) from public.nutrition_plan_drafts),0::bigint,'unassigned Coach cannot SELECT Nutrition drafts');
select throws_ok($$select public.get_followup_for_coach('b1540000-0000-4000-8000-000000000001','nutrition')$$,'P0001','FE_NOT_FOUND','unassigned Coach receives no dossier');
select pg_temp.followup_actor(6);
select throws_ok($$select public.get_followup_for_coach('b1540000-0000-4000-8000-000000000001','check-ins')$$,'P0001','FE_NOT_FOUND','foreign organization Admin receives no dossier');
select pg_temp.followup_actor(3,false);
select throws_ok($$select public.get_followup_for_coach('b1540000-0000-4000-8000-000000000001','nutrition')$$,'P0001','FE_FORBIDDEN','unverified Coach cannot read Nutrition');
select pg_temp.followup_actor(7);
select throws_ok($$select public.mutate_own_checkin(jsonb_build_object('action','save','document',pg_temp.followup_checkin(),'expectedVersion',0,'clientMutationId','b1560000-0000-4000-8000-000000000020'))$$,'P0001','FE_FORBIDDEN','suspended member cannot save own Check-in');

select pg_temp.followup_actor(3);
select is(public.mutate_coach_nutrition('b1540000-0000-4000-8000-000000000001','{"action":"publish","expectedVersion":1,"expectedPublicationId":null,"clientMutationId":"b1560000-0000-4000-8000-000000000003"}')->>'revision','1','Nutrition publication snapshots draft version 1');
select is(public.mutate_coach_nutrition('b1540000-0000-4000-8000-000000000001','{"action":"publish","expectedVersion":1,"expectedPublicationId":null,"clientMutationId":"b1560000-0000-4000-8000-000000000003"}')->>'revision','1','publication retry creates no second revision');
select is(public.mutate_coach_nutrition('b1540000-0000-4000-8000-000000000001',jsonb_build_object('action','save','document',jsonb_set(pg_temp.followup_nutrition(),'{title,fr}','"Revision deux"'),'expectedVersion',1,'clientMutationId','b1560000-0000-4000-8000-000000000004'))->>'version','2','new draft changes separately');
select is((select document#>>'{title,fr}' from public.nutrition_plan_publications where revision=1),'Plan QA','published snapshot remains unchanged after draft changes');
select throws_ok($$select public.mutate_coach_nutrition('b1540000-0000-4000-8000-000000000001','{"action":"publish","expectedVersion":2,"expectedPublicationId":null,"clientMutationId":"b1560000-0000-4000-8000-000000000005"}')$$,'P0001','FE_VERSION_CONFLICT','stale expected publication cannot replace current snapshot');
select pg_temp.followup_actor(1);
select is((select count(*) from public.nutrition_plan_publications),1::bigint,'owner Client reads own published Nutrition');
select is((select document#>>'{title,fr}' from public.nutrition_plan_publications),'Plan QA','owner still sees published content, never Coach draft');
select is(public.mutate_own_checkin('{"action":"submit","expectedVersion":1,"clientMutationId":"b1560000-0000-4000-8000-000000000011"}')->>'version','2','submission advances monotonic Check-in version');
select is(public.mutate_own_checkin('{"action":"submit","expectedVersion":1,"clientMutationId":"b1560000-0000-4000-8000-000000000011"}')->>'version','2','submit retry preserves original outcome');
select is((select count(*) from public.client_checkin_submissions),1::bigint,'submit retry has one immutable observation');
select ok((select not active and row_version=2 from public.client_checkin_drafts),'submitted draft is inactive with monotonic version');
select throws_ok($$select public.mutate_own_checkin(jsonb_build_object('action','save','document',pg_temp.followup_checkin(),'expectedVersion',0,'clientMutationId','b1560000-0000-4000-8000-000000000012'))$$,'P0001','FE_VERSION_CONFLICT','old tab cannot recreate version zero after submission (ABA)');
select is(public.mutate_own_checkin(jsonb_build_object('action','save','document',jsonb_set(pg_temp.followup_checkin(),'{observedOn}','"2100-12-31"'),'expectedVersion',2,'clientMutationId','b1560000-0000-4000-8000-000000000013'))->>'version','3','future observation may remain a private draft');
select throws_ok($$select public.mutate_own_checkin('{"action":"submit","expectedVersion":3,"clientMutationId":"b1560000-0000-4000-8000-000000000014"}')$$,'P0001','FE_CHECKIN_INCOMPLETE','far-future draft cannot become a submitted observation');
select is((select count(*) from public.client_checkin_submissions),1::bigint,'failed future submission creates no extra history');
select pg_temp.followup_actor(2);
select is((select count(*) from public.client_checkin_submissions),0::bigint,'other Client cannot read submitted observations');
select is((select count(*) from public.nutrition_plan_publications),0::bigint,'other Client cannot read published Nutrition');
select pg_temp.followup_actor(3);
select is((select count(*) from public.client_checkin_submissions),1::bigint,'assigned verified Coach reads only submitted observation');
select is((public.get_followup_for_coach('b1540000-0000-4000-8000-000000000001','check-ins')->>'total')::int,1,'Coach total excludes later private draft');

reset role;
select throws_ok($$update public.nutrition_plan_publications set document=document where client_id='b1540000-0000-4000-8000-000000000001'$$,'P0001','FE_IMMUTABLE_FOLLOWUP','publication immutable even under privileged test write');
select throws_ok($$delete from public.client_checkin_submissions where client_id='b1540000-0000-4000-8000-000000000001'$$,'P0001','FE_IMMUTABLE_FOLLOWUP','submitted observation cannot be deleted through ordinary privileged write');
select is((select count(*) from public.audit_events where entity_id='b1540000-0000-4000-8000-000000000001' and command='SUBMIT_CHECKIN'),1::bigint,'exact submit retry adds no duplicate audit event');
select ok(not exists(select 1 from public.audit_events where entity_id='b1540000-0000-4000-8000-000000000001' and to_jsonb(audit_events)::text like '%PRIVATE_SYNTHETIC_CHECKIN_SENTINEL%'),'audit excludes Client observation contents');
update public.coach_client_assignments set status='COMPLETED' where client_id='b1540000-0000-4000-8000-000000000001';
set local role authenticated;
select pg_temp.followup_actor(3);
select throws_ok($$select public.mutate_coach_nutrition('b1540000-0000-4000-8000-000000000001','{"action":"publish","expectedVersion":1,"expectedPublicationId":null,"clientMutationId":"b1560000-0000-4000-8000-000000000003"}')$$,'P0001','FE_NOT_FOUND','revoked assignment cannot replay a formerly authorized receipt');
select is((select count(*) from public.client_checkin_submissions),0::bigint,'revoked assignment loses submitted observation access');
reset role;
select * from finish();
rollback;
