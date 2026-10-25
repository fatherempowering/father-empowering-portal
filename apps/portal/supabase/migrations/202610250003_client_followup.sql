begin;

-- Additive only: the existing identity, assignment and staff-verification
-- policies are reused, never widened. Direct browser writes remain forbidden.
create function app_private.followup_coach_access(p_org uuid,p_client uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select app_private.training_result_actor_unambiguous() and app_private.has_verified_coach_session()
   and app_private.can_publish_training(p_org,p_client)
$$;
revoke all on function app_private.followup_coach_access(uuid,uuid) from public,anon,authenticated;
grant execute on function app_private.followup_coach_access(uuid,uuid) to authenticated;

create function app_private.followup_text_valid(p jsonb) returns boolean
language sql immutable set search_path='' as $$
 select coalesce(jsonb_typeof(p)='object' and p ?& array['fr','en'] and p-array['fr','en']='{}'::jsonb
   and jsonb_typeof(p->'fr')='string' and jsonb_typeof(p->'en')='string'
   and char_length(p->>'fr')<=4000 and char_length(p->>'en')<=4000,false)
$$;
create function app_private.followup_number_valid(p jsonb,p_min numeric,p_max numeric,p_integer boolean default false) returns boolean
language plpgsql immutable set search_path='' as $$
begin
 if p='null'::jsonb then return true; end if;
 if p is null or jsonb_typeof(p)<>'number' then return false; end if;
 return (p::text)::numeric between p_min and p_max and (not p_integer or (p::text)::numeric=trunc((p::text)::numeric));
exception when others then return false;
end $$;
-- The explicit trim set matches ECMAScript String.trim(), including NBSP and
-- Unicode separators. POSIX whitespace alone depends on the database locale.
create function app_private.followup_text_has_content(p text) returns boolean
language sql immutable set search_path='' as $$
 select coalesce(char_length(btrim(p,U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'))>0,false)
$$;
create function app_private.nutrition_document_valid(p jsonb,p_publish boolean default false) returns boolean
language plpgsql immutable set search_path='' as $$
declare meal jsonb; k text;
begin
 if p is null or octet_length(p::text)>700000 or jsonb_typeof(p)<>'object' or not p ?& array['title','targets','meals','instructions','preparation','grocery']
   or p-array['title','targets','meals','instructions','preparation','grocery']<>'{}'::jsonb then return false; end if;
 foreach k in array array['title','instructions','preparation','grocery'] loop
   if not app_private.followup_text_valid(p->k) then return false; end if;
 end loop;
 if jsonb_typeof(p->'targets')<>'object' or not (p->'targets') ?& array['calories','proteinG','carbohydrateG','fatG']
   or (p->'targets')-array['calories','proteinG','carbohydrateG','fatG']<>'{}'::jsonb
   or not app_private.followup_number_valid(p#>'{targets,calories}',0,15000)
   or not app_private.followup_number_valid(p#>'{targets,proteinG}',0,1000)
   or not app_private.followup_number_valid(p#>'{targets,carbohydrateG}',0,2000)
   or not app_private.followup_number_valid(p#>'{targets,fatG}',0,1000)
   or jsonb_typeof(p->'meals')<>'array' or jsonb_array_length(p->'meals')>20 then return false; end if;
 if (select count(*)<>count(distinct lower(value->>'id')) from jsonb_array_elements(p->'meals')) then return false; end if;
 for meal in select value from jsonb_array_elements(p->'meals') loop
   if jsonb_typeof(meal)<>'object' or not meal ?& array['id','title','portions','notes']
     or meal-array['id','title','timeLabel','portions','notes']<>'{}'::jsonb
     or not app_private.training_draft_uuid_valid(meal->'id') then return false; end if;
   foreach k in array array['title','portions','notes'] loop
     if not app_private.followup_text_valid(meal->k) then return false; end if;
   end loop;
   if meal ? 'timeLabel' and not app_private.followup_text_valid(meal->'timeLabel') then return false; end if;
   if p_publish and ((not app_private.followup_text_has_content(meal#>>'{title,fr}') and not app_private.followup_text_has_content(meal#>>'{title,en}'))
     or (not app_private.followup_text_has_content(meal#>>'{portions,fr}') and not app_private.followup_text_has_content(meal#>>'{portions,en}'))) then return false; end if;
 end loop;
 return not p_publish or (jsonb_array_length(p->'meals')>0 and (app_private.followup_text_has_content(p#>>'{title,fr}') or app_private.followup_text_has_content(p#>>'{title,en}')));
exception when others then return false;
end $$;
create function app_private.checkin_document_valid(p jsonb,p_submit boolean default false) returns boolean
language plpgsql immutable set search_path='' as $$
declare k text; d date; measurements jsonb;
begin
 if p is null or octet_length(p::text)>20000 or jsonb_typeof(p)<>'object'
   or not p ?& array['observedOn','measurements','sleepHours','sleepQuality','energy','stress','soreness','cardioMinutes','cardioZone','notes']
   or p-array['observedOn','measurements','sleepHours','sleepQuality','energy','stress','soreness','cardioMinutes','cardioZone','notes']<>'{}'::jsonb
   or jsonb_typeof(p->'observedOn')<>'string' or p->>'observedOn' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then return false; end if;
 d:=(p->>'observedOn')::date;
 if d<date '2000-01-01' or d>date '2100-12-31' or to_char(d,'YYYY-MM-DD')<>p->>'observedOn' then return false; end if;
 measurements:=p->'measurements';
 if jsonb_typeof(measurements)<>'object' or not measurements ?& array['bodyWeightLb','waistIn','chestIn','hipsIn','leftArmIn','rightArmIn','leftThighIn','rightThighIn','leftCalfIn','rightCalfIn']
   or measurements-array['bodyWeightLb','waistIn','chestIn','hipsIn','leftArmIn','rightArmIn','leftThighIn','rightThighIn','leftCalfIn','rightCalfIn']<>'{}'::jsonb then return false; end if;
 if not app_private.followup_number_valid(measurements->'bodyWeightLb',1,1500) then return false; end if;
 foreach k in array array['waistIn','chestIn','hipsIn','leftArmIn','rightArmIn','leftThighIn','rightThighIn','leftCalfIn','rightCalfIn'] loop
   if not app_private.followup_number_valid(measurements->k,0.1,200) then return false; end if;
 end loop;
 foreach k in array array['sleepQuality','energy','stress','soreness'] loop
   if not app_private.followup_number_valid(p->k,1,10,true) then return false; end if;
 end loop;
 if not app_private.followup_number_valid(p->'sleepHours',0,24)
   or not app_private.followup_number_valid(p->'cardioMinutes',0,1440)
   or not app_private.followup_number_valid(p->'cardioZone',1,5,true)
   or jsonb_typeof(p->'notes')<>'string' or char_length(p->>'notes')>4000 then return false; end if;
 return not p_submit or (measurements->'bodyWeightLb'<>'null'::jsonb and p->'sleepHours'<>'null'::jsonb);
exception when others then return false;
end $$;
revoke all on function app_private.followup_text_valid(jsonb),app_private.followup_text_has_content(text),app_private.followup_number_valid(jsonb,numeric,numeric,boolean),app_private.nutrition_document_valid(jsonb,boolean),app_private.checkin_document_valid(jsonb,boolean) from public,anon,authenticated;

create table public.nutrition_plan_drafts(
 organization_id uuid not null, client_id uuid not null, document jsonb not null check(app_private.nutrition_document_valid(document)),
 row_version bigint not null check(row_version between 1 and 9007199254740991), updated_at timestamptz not null default clock_timestamp(),
 updated_by uuid not null references auth.users(id) on delete restrict,
 primary key(organization_id,client_id), foreign key(organization_id,client_id) references public.clients(organization_id,id) on delete restrict
);
create table public.nutrition_plan_publications(
 id uuid primary key default gen_random_uuid(), organization_id uuid not null,client_id uuid not null,
 revision bigint not null check(revision between 1 and 9007199254740991),draft_version bigint not null check(draft_version between 1 and 9007199254740991),
 document jsonb not null check(app_private.nutrition_document_valid(document,true)),
 published_at timestamptz not null default clock_timestamp(), published_by uuid not null references auth.users(id) on delete restrict,
 foreign key(organization_id,client_id) references public.clients(organization_id,id) on delete restrict,
 unique(organization_id,client_id,revision),unique(organization_id,client_id,draft_version)
);
create table public.client_checkin_drafts(
 organization_id uuid not null,client_id uuid not null,document jsonb not null check(app_private.checkin_document_valid(document)),
 row_version bigint not null check(row_version between 1 and 9007199254740991),active boolean not null default true,
 updated_at timestamptz not null default clock_timestamp(),
 primary key(organization_id,client_id),foreign key(organization_id,client_id) references public.clients(organization_id,id) on delete restrict
);
create table public.client_checkin_submissions(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,client_id uuid not null,
 observed_on date not null,document jsonb not null check(app_private.checkin_document_valid(document,true)),
 submitted_at timestamptz not null default clock_timestamp(),submitted_by uuid not null references auth.users(id) on delete restrict,
 check(observed_on=(document->>'observedOn')::date),
 foreign key(organization_id,client_id) references public.clients(organization_id,id) on delete restrict
);
create index client_checkin_history_idx on public.client_checkin_submissions(organization_id,client_id,observed_on desc,submitted_at desc,id);
alter table public.nutrition_plan_drafts enable row level security;
alter table public.nutrition_plan_drafts force row level security;
alter table public.nutrition_plan_publications enable row level security;
alter table public.nutrition_plan_publications force row level security;
alter table public.client_checkin_drafts enable row level security;
alter table public.client_checkin_drafts force row level security;
alter table public.client_checkin_submissions enable row level security;
alter table public.client_checkin_submissions force row level security;
revoke all on public.nutrition_plan_drafts,public.nutrition_plan_publications,public.client_checkin_drafts,public.client_checkin_submissions from public,anon,authenticated;
grant select on public.nutrition_plan_drafts,public.nutrition_plan_publications,public.client_checkin_drafts,public.client_checkin_submissions to authenticated;
create policy nutrition_draft_read on public.nutrition_plan_drafts for select to authenticated using(app_private.followup_coach_access(organization_id,client_id));
create policy nutrition_publication_read on public.nutrition_plan_publications for select to authenticated using(
 app_private.training_result_actor_unambiguous() and (app_private.has_own_client_access(organization_id,client_id) or app_private.followup_coach_access(organization_id,client_id)));
create policy checkin_draft_read on public.client_checkin_drafts for select to authenticated using(
 app_private.training_result_actor_unambiguous() and app_private.has_own_client_access(organization_id,client_id));
create policy checkin_submission_read on public.client_checkin_submissions for select to authenticated using(
 app_private.training_result_actor_unambiguous() and (app_private.has_own_client_access(organization_id,client_id) or app_private.followup_coach_access(organization_id,client_id)));
create function app_private.followup_immutable() returns trigger language plpgsql set search_path='' as $$
begin raise exception using errcode='P0001',message='FE_IMMUTABLE_FOLLOWUP'; end $$;
revoke all on function app_private.followup_immutable() from public,anon,authenticated;
create trigger nutrition_publication_immutable before update or delete on public.nutrition_plan_publications for each row execute function app_private.followup_immutable();
create trigger checkin_submission_immutable before update or delete on public.client_checkin_submissions for each row execute function app_private.followup_immutable();

create table app_private.followup_command_receipts(
 actor_user_id uuid not null references auth.users(id) on delete restrict,idempotency_key uuid not null,
 request_fingerprint text not null,result_snapshot jsonb not null,primary key(actor_user_id,idempotency_key)
);
revoke all on app_private.followup_command_receipts from public,anon,authenticated;

create function app_private.nutrition_publication_json(p public.nutrition_plan_publications) returns jsonb
language sql immutable set search_path='' as $$
 select jsonb_build_object('id',p.id,'clientId',p.client_id,'revision',p.revision,'draftVersion',p.draft_version,'document',p.document,'publishedAt',p.published_at)
$$;
create function app_private.checkin_submission_json(p public.client_checkin_submissions) returns jsonb
language sql immutable set search_path='' as $$
 select jsonb_build_object('id',p.id,'clientId',p.client_id,'document',p.document,'submittedAt',p.submitted_at)
$$;
revoke all on function app_private.nutrition_publication_json(public.nutrition_plan_publications),app_private.checkin_submission_json(public.client_checkin_submissions) from public,anon,authenticated;

create function public.get_followup_for_coach(p_client_id uuid,p_kind text,p_page integer default 0) returns jsonb
language plpgsql security definer set search_path='' as $$
declare m public.organization_memberships%rowtype; d public.nutrition_plan_drafts%rowtype; latest public.nutrition_plan_publications%rowtype; history jsonb; total bigint;
begin
 if auth.uid() is null then raise exception using errcode='P0001',message='FE_UNAUTHENTICATED'; end if;
 if not app_private.training_result_actor_unambiguous() or not app_private.has_verified_coach_session() then raise exception using errcode='P0001',message='FE_FORBIDDEN'; end if;
 select * into m from public.organization_memberships where user_id=auth.uid() and status='ACTIVE' and role in ('ADMIN','COACH');
 if not found then raise exception using errcode='P0001',message='FE_FORBIDDEN'; end if;
 if p_client_id is null or not app_private.followup_coach_access(m.organization_id,p_client_id) then raise exception using errcode='P0001',message='FE_NOT_FOUND'; end if;
 if p_kind is null or p_kind not in ('nutrition','check-ins') or p_page is null or p_page not between 0 and 10000 then raise exception using errcode='P0001',message='FE_INVALID_FOLLOWUP'; end if;
 if p_kind='nutrition' then
   select * into d from public.nutrition_plan_drafts where organization_id=m.organization_id and client_id=p_client_id;
   select * into latest from public.nutrition_plan_publications where organization_id=m.organization_id and client_id=p_client_id order by revision desc limit 1;
   select count(*) into total from public.nutrition_plan_publications where organization_id=m.organization_id and client_id=p_client_id;
   select coalesce(jsonb_agg(app_private.nutrition_publication_json(x) order by x.revision desc),'[]'::jsonb) into history from
     (select * from public.nutrition_plan_publications where organization_id=m.organization_id and client_id=p_client_id order by revision desc limit 50) x;
   return jsonb_build_object('draft',case when d.client_id is null then null else jsonb_build_object('version',d.row_version,'document',d.document,'updatedAt',d.updated_at) end,
     'publication',case when latest.id is null then null else app_private.nutrition_publication_json(latest) end,'history',history,'historyTruncated',total>50);
 end if;
 select count(*) into total from public.client_checkin_submissions where organization_id=m.organization_id and client_id=p_client_id;
 select coalesce(jsonb_agg(app_private.checkin_submission_json(x) order by x.observed_on desc,x.submitted_at desc,x.id),'[]'::jsonb) into history from
   (select * from public.client_checkin_submissions where organization_id=m.organization_id and client_id=p_client_id order by observed_on desc,submitted_at desc,id limit 50 offset p_page*50) x;
 return jsonb_build_object('history',history,'historyTruncated',total>(p_page+1)*50,'total',total,'page',p_page);
end $$;
revoke all on function public.get_followup_for_coach(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.get_followup_for_coach(uuid,text,integer) to authenticated;

create function public.mutate_coach_nutrition(p_client_id uuid,p_input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare m public.organization_memberships%rowtype; d public.nutrition_plan_drafts%rowtype; latest public.nutrition_plan_publications%rowtype;
 publication public.nutrition_plan_publications%rowtype; receipt app_private.followup_command_receipts%rowtype;
 fingerprint text; action text; command_id uuid; expected bigint; result jsonb;
begin
 -- Guard before receipts: revoked access can never replay privileged content.
 perform public.get_followup_for_coach(p_client_id,'nutrition',0);
 select * into m from public.organization_memberships where user_id=auth.uid() and status='ACTIVE';
 if p_input is null or jsonb_typeof(p_input)<>'object' or not p_input ?& array['action','expectedVersion','clientMutationId']
   or not app_private.training_draft_uuid_valid(p_input->'clientMutationId')
   or jsonb_typeof(p_input->'expectedVersion')<>'number' or not app_private.followup_number_valid(p_input->'expectedVersion',0,9007199254740991,true) then raise exception using errcode='P0001',message='FE_INVALID_FOLLOWUP'; end if;
 action:=p_input->>'action';command_id:=(p_input->>'clientMutationId')::uuid;expected:=(p_input->>'expectedVersion')::bigint;
 if action='save' then
   if not p_input ? 'document' or p_input-array['action','document','expectedVersion','clientMutationId']<>'{}'::jsonb or not app_private.nutrition_document_valid(p_input->'document') then raise exception using errcode='P0001',message='FE_INVALID_FOLLOWUP'; end if;
 elsif action='publish' then
   if not p_input ? 'expectedPublicationId' or p_input-array['action','expectedVersion','expectedPublicationId','clientMutationId']<>'{}'::jsonb
     or not ((p_input->'expectedPublicationId'='null'::jsonb) or app_private.training_draft_uuid_valid(p_input->'expectedPublicationId')) or expected=0 then raise exception using errcode='P0001',message='FE_INVALID_FOLLOWUP'; end if;
 else raise exception using errcode='P0001',message='FE_INVALID_FOLLOWUP'; end if;
 fingerprint:=encode(extensions.digest(convert_to(jsonb_build_object('command','nutrition','organization',m.organization_id,'client',p_client_id,'input',p_input)::text,'UTF8'),'sha256'),'hex');
 perform pg_advisory_xact_lock(hashtextextended(concat_ws(':','followup-command',auth.uid(),command_id),0));
 select * into receipt from app_private.followup_command_receipts where actor_user_id=auth.uid() and idempotency_key=command_id;
 if found then
   if receipt.request_fingerprint<>fingerprint then raise exception using errcode='P0001',message='FE_IDEMPOTENCY_CONFLICT'; end if;
   return receipt.result_snapshot;
 end if;
 perform pg_advisory_xact_lock(hashtextextended(concat_ws(':','nutrition-client',m.organization_id,p_client_id),0));
 select * into d from public.nutrition_plan_drafts where organization_id=m.organization_id and client_id=p_client_id for update;
 if coalesce(d.row_version,0)<>expected then raise exception using errcode='P0001',message='FE_VERSION_CONFLICT'; end if;
 if action='save' then
   insert into public.nutrition_plan_drafts(organization_id,client_id,document,row_version,updated_by) values(m.organization_id,p_client_id,p_input->'document',expected+1,auth.uid())
   on conflict(organization_id,client_id) do update set document=excluded.document,row_version=excluded.row_version,updated_by=excluded.updated_by,updated_at=clock_timestamp() returning * into d;
   result:=jsonb_build_object('version',d.row_version);
 else
   if not app_private.nutrition_document_valid(d.document,true) then raise exception using errcode='P0001',message='FE_NUTRITION_INCOMPLETE'; end if;
   select * into latest from public.nutrition_plan_publications where organization_id=m.organization_id and client_id=p_client_id order by revision desc limit 1;
   if latest.id is distinct from (p_input->>'expectedPublicationId')::uuid then raise exception using errcode='P0001',message='FE_VERSION_CONFLICT'; end if;
   if exists(select 1 from public.nutrition_plan_publications where organization_id=m.organization_id and client_id=p_client_id and draft_version=expected) then raise exception using errcode='P0001',message='FE_ALREADY_PUBLISHED'; end if;
   insert into public.nutrition_plan_publications(organization_id,client_id,revision,draft_version,document,published_by)
     values(m.organization_id,p_client_id,coalesce(latest.revision,0)+1,d.row_version,d.document,auth.uid()) returning * into publication;
   result:=jsonb_build_object('publicationId',publication.id,'revision',publication.revision);
 end if;
 insert into app_private.followup_command_receipts values(auth.uid(),command_id,fingerprint,result);
 insert into public.audit_events(organization_id,actor_user_id,actor_role,command,entity_type,entity_id,entity_version,result,correlation_id)
 values(m.organization_id,auth.uid(),m.role,case when action='save' then 'SAVE_NUTRITION_DRAFT' else 'PUBLISH_NUTRITION_PLAN' end,'client',p_client_id,expected,'SUCCEEDED',command_id);
 return result;
end $$;
revoke all on function public.mutate_coach_nutrition(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.mutate_coach_nutrition(uuid,jsonb) to authenticated;

create function public.mutate_own_checkin(p_input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.clients%rowtype; m public.organization_memberships%rowtype; d public.client_checkin_drafts%rowtype;
 submission public.client_checkin_submissions%rowtype; receipt app_private.followup_command_receipts%rowtype;
 action text;command_id uuid;expected bigint;fingerprint text;result jsonb;
begin
 if auth.uid() is null then raise exception using errcode='P0001',message='FE_UNAUTHENTICATED'; end if;
 if not app_private.training_result_actor_unambiguous() then raise exception using errcode='P0001',message='FE_FORBIDDEN'; end if;
 select * into m from public.organization_memberships where user_id=auth.uid() and status='ACTIVE';
 select * into c from public.clients where organization_id=m.organization_id and auth_user_id=auth.uid() and status='ACTIVE';
 if not found or not app_private.has_own_client_access(c.organization_id,c.id) then raise exception using errcode='P0001',message='FE_FORBIDDEN'; end if;
 if p_input is null or jsonb_typeof(p_input)<>'object' or not p_input ?& array['action','expectedVersion','clientMutationId']
   or not app_private.training_draft_uuid_valid(p_input->'clientMutationId') or jsonb_typeof(p_input->'expectedVersion')<>'number' or not app_private.followup_number_valid(p_input->'expectedVersion',0,9007199254740991,true) then raise exception using errcode='P0001',message='FE_INVALID_FOLLOWUP'; end if;
 action:=p_input->>'action';command_id:=(p_input->>'clientMutationId')::uuid;expected:=(p_input->>'expectedVersion')::bigint;
 if action='save' then
   if not p_input ? 'document' or p_input-array['action','document','expectedVersion','clientMutationId']<>'{}'::jsonb or not app_private.checkin_document_valid(p_input->'document') then raise exception using errcode='P0001',message='FE_INVALID_FOLLOWUP'; end if;
 elsif action='submit' then
   if p_input-array['action','expectedVersion','clientMutationId']<>'{}'::jsonb or expected=0 then raise exception using errcode='P0001',message='FE_INVALID_FOLLOWUP'; end if;
 else raise exception using errcode='P0001',message='FE_INVALID_FOLLOWUP'; end if;
 fingerprint:=encode(extensions.digest(convert_to(jsonb_build_object('command','checkin','organization',c.organization_id,'client',c.id,'input',p_input)::text,'UTF8'),'sha256'),'hex');
 perform pg_advisory_xact_lock(hashtextextended(concat_ws(':','followup-command',auth.uid(),command_id),0));
 select * into receipt from app_private.followup_command_receipts where actor_user_id=auth.uid() and idempotency_key=command_id;
 if found then
   if receipt.request_fingerprint<>fingerprint then raise exception using errcode='P0001',message='FE_IDEMPOTENCY_CONFLICT'; end if;
   return receipt.result_snapshot;
 end if;
 perform pg_advisory_xact_lock(hashtextextended(concat_ws(':','checkin-client',c.organization_id,c.id),0));
 select * into d from public.client_checkin_drafts where organization_id=c.organization_id and client_id=c.id for update;
 if coalesce(d.row_version,0)<>expected then raise exception using errcode='P0001',message='FE_VERSION_CONFLICT'; end if;
 if action='save' then
   insert into public.client_checkin_drafts(organization_id,client_id,document,row_version) values(c.organization_id,c.id,p_input->'document',expected+1)
   on conflict(organization_id,client_id) do update set document=excluded.document,row_version=excluded.row_version,active=true,updated_at=clock_timestamp() returning * into d;
   result:=jsonb_build_object('version',d.row_version);
 else
   if not d.active or not app_private.checkin_document_valid(d.document,true) or (d.document->>'observedOn')::date>(clock_timestamp() at time zone 'UTC')::date+1 then raise exception using errcode='P0001',message='FE_CHECKIN_INCOMPLETE'; end if;
   insert into public.client_checkin_submissions(organization_id,client_id,observed_on,document,submitted_by)
     values(c.organization_id,c.id,(d.document->>'observedOn')::date,d.document,auth.uid()) returning * into submission;
   update public.client_checkin_drafts set active=false,row_version=row_version+1,updated_at=clock_timestamp() where organization_id=c.organization_id and client_id=c.id;
   result:=jsonb_build_object('submissionId',submission.id,'version',expected+1);
 end if;
 insert into app_private.followup_command_receipts values(auth.uid(),command_id,fingerprint,result);
 insert into public.audit_events(organization_id,actor_user_id,actor_role,command,entity_type,entity_id,entity_version,result,correlation_id)
 values(c.organization_id,auth.uid(),m.role,case when action='save' then 'SAVE_CHECKIN_DRAFT' else 'SUBMIT_CHECKIN' end,'client',c.id,expected+1,'SUCCEEDED',command_id);
 return result;
end $$;
revoke all on function public.mutate_own_checkin(jsonb) from public,anon,authenticated;
grant execute on function public.mutate_own_checkin(jsonb) to authenticated;

commit;
