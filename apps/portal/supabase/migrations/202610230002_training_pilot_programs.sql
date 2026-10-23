begin;

-- Disabled by default. Only an explicitly provisioned staging organization AND
-- test recipient can use these exercises. No production records are seeded.
create table app_private.training_pilot_organizations (
  organization_id uuid primary key references public.organizations(id) on delete restrict
);
create table app_private.training_pilot_clients (
  organization_id uuid not null references app_private.training_pilot_organizations(organization_id) on delete restrict,
  client_id uuid not null,
  primary key(organization_id,client_id),
  foreign key(organization_id,client_id) references public.clients(organization_id,id) on delete restrict
);
revoke all on app_private.training_pilot_organizations,app_private.training_pilot_clients from public,anon,authenticated;
grant all on app_private.training_pilot_organizations,app_private.training_pilot_clients to service_role;

-- Operational provisioning only, never called with a Coach/Client session.
-- CI callers are loopback-only; the staging operator pins its project reference.
create function public.provision_training_pilot_test_access(p_organization_id uuid,p_client_id uuid default null)
returns void language plpgsql security definer set search_path='' as $$
begin
 if p_organization_id is null or not exists(select 1 from public.organizations where id=p_organization_id and status='ACTIVE')
   or (p_client_id is not null and not exists(select 1 from public.clients where organization_id=p_organization_id and id=p_client_id and status='ACTIVE')) then
   raise exception using errcode='P0001',message='FE_INVALID_PILOT_RECIPIENT'; end if;
 insert into app_private.training_pilot_organizations values(p_organization_id) on conflict do nothing;
 if p_client_id is not null then insert into app_private.training_pilot_clients values(p_organization_id,p_client_id) on conflict do nothing; end if;
end $$;
revoke all on function public.provision_training_pilot_test_access(uuid,uuid) from public,anon,authenticated;
grant execute on function public.provision_training_pilot_test_access(uuid,uuid) to service_role;

create function app_private.training_pilot_text_valid(p jsonb) returns boolean
language sql immutable set search_path='' as $$
 select coalesce(jsonb_typeof(p)='object' and p ?& array['fr','en'] and p-array['fr','en']='{}'::jsonb
   and jsonb_typeof(p->'fr')='string' and char_length(btrim(p->>'fr')) between 1 and 2000
   and jsonb_typeof(p->'en')='string' and char_length(btrim(p->>'en')) between 1 and 2000,false)
$$;
create function app_private.training_pilot_valid(p jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare lang text; step text; v jsonb;
begin
 if p is null or jsonb_typeof(p)<>'object' or not p ?& array['sourceId','sourceVersion','sourceCatalogVersion','integrationVersion','usage','name','equipment','instructions','performance']
   or p-array['sourceId','sourceVersion','sourceCatalogVersion','integrationVersion','usage','name','equipment','instructions','performance']<>'{}'::jsonb
   or jsonb_typeof(p->'sourceId')<>'string' or p->>'sourceId' !~ '^(DB|BB|CA|MA|BW|KB|BA)_[0-9]{3}$'
   or jsonb_typeof(p->'sourceVersion')<>'string' or p->>'sourceVersion' !~ '^[0-9]+\.[0-9]+\.[0-9]+$'
   or p->'sourceCatalogVersion' is distinct from '"3.1.0-pilot.1"'::jsonb or p->'integrationVersion' is distinct from '"fe-program-pilot.1"'::jsonb
   or p->'usage' is distinct from '"STAGING_TEST"'::jsonb or not app_private.training_pilot_text_valid(p->'name') then return false; end if;
 v:=p->'equipment';
 if jsonb_typeof(v)<>'object' or not v ?& array['id','labels'] or v-array['id','labels']<>'{}'::jsonb
   or not coalesce(v->>'id' in ('dumbbell','barbell','cable','machine','bodyweight','kettlebell','band'),false)
   or not app_private.training_pilot_text_valid(v->'labels') then return false; end if;
 v:=p->'instructions';
 if jsonb_typeof(v)<>'object' or not v ?& array['fr','en'] or v-array['fr','en']<>'{}'::jsonb then return false; end if;
 foreach lang in array array['fr','en'] loop
   if jsonb_typeof(v->lang)<>'object' or not (v->lang) ?& array['setup','execution','finish']
     or (v->lang)-array['setup','execution','finish']<>'{}'::jsonb then return false; end if;
   foreach step in array array['setup','execution','finish'] loop
     if jsonb_typeof(v#>array[lang,step])<>'string' or char_length(btrim(v#>>array[lang,step])) not between 1 and 2000 then return false; end if;
   end loop;
 end loop;
 v:=p->'performance';
 if jsonb_typeof(v)<>'object' or not v ?& array['measure','counting','load','countingDecision','notes','loadEntryBasis']
   or v-array['measure','counting','load','countingDecision','notes','loadEntryBasis']<>'{}'::jsonb
   or not coalesce(v->>'measure' in ('repetitions','duration','distance'),false)
   or not coalesce(v->>'countingDecision' in ('PROPOSED','MAX_PER_ARM_2026_10_23'),false)
   or not coalesce(v->>'loadEntryBasis' in ('per_implement','total_external_mass','displayed_stack_setting','band_configuration','not_applicable','to_confirm'),false)
   or not app_private.training_pilot_text_valid(v->'counting') or not app_private.training_pilot_text_valid(v->'load')
   or not app_private.training_pilot_text_valid(v->'notes') then return false; end if;
 return true;
exception when others then return false;
end $$;
create function app_private.training_pilot_unit(p jsonb) returns text
language sql immutable set search_path='' as $$
 select case when p#>>'{performance,measure}'='duration' then 'sec'
   when p#>>'{performance,measure}'='distance' then 'distance'
   when p#>>'{performance,loadEntryBasis}' in ('band_configuration','to_confirm') then 'configuration'
   else 'lb' end
$$;
revoke all on function app_private.training_pilot_text_valid(jsonb),app_private.training_pilot_valid(jsonb),app_private.training_pilot_unit(jsonb) from public,anon,authenticated;

create table app_private.training_pilot_catalog (
 source_id text primary key,
 pilot jsonb not null check(app_private.training_pilot_valid(pilot) and pilot->>'sourceId'=source_id),
 default_unit text not null check(default_unit=app_private.training_pilot_unit(pilot))
);
revoke all on app_private.training_pilot_catalog from public,anon,authenticated;
grant select on app_private.training_pilot_catalog to service_role;
alter table public.training_exercises add column pilot jsonb check(pilot is null or app_private.training_pilot_valid(pilot));
alter table public.training_exercises drop constraint training_exercises_default_unit_check;
alter table public.training_exercises add constraint training_exercises_default_unit_check check(default_unit in ('lb','min','sec','distance','level','configuration'));
alter table public.training_exercises add constraint training_exercises_configuration_pilot_check check(default_unit<>'configuration' or pilot is not null);
create unique index training_exercises_pilot_source_idx on public.training_exercises
 (organization_id,(pilot->>'sourceId'),(pilot->>'sourceVersion'),(pilot->>'integrationVersion')) where pilot is not null;

create function app_private.training_pilot_exercise_guard() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' and old.pilot is not null then
   raise exception using errcode='P0001',message='FE_READ_ONLY_PILOT_EXERCISE';
 end if;
 if new.pilot is not null and (not exists(select 1 from app_private.training_pilot_organizations where organization_id=new.organization_id)
   or not exists(select 1 from app_private.training_pilot_catalog c where c.pilot=new.pilot and c.default_unit=new.default_unit)
   or new.name<>new.pilot#>>'{name,fr}' or new.equipment<>new.pilot#>>'{equipment,labels,fr}') then
   raise exception using errcode='P0001',message='FE_INVALID_PILOT_EXERCISE';
 end if;
 return new;
end $$;
revoke all on function app_private.training_pilot_exercise_guard() from public,anon,authenticated;
create trigger training_pilot_exercise_guard before insert or update on public.training_exercises for each row execute function app_private.training_pilot_exercise_guard();

create function public.select_training_pilot_exercise(p_source_id text,p_source_version text,p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); m public.organization_memberships%rowtype; c app_private.training_pilot_catalog%rowtype;
 x public.training_exercises%rowtype; r app_private.training_exercise_receipts%rowtype; fingerprint text; snapshot jsonb;
begin
 if actor is null then raise exception using errcode='P0001',message='FE_UNAUTHENTICATED'; end if;
 if not app_private.has_verified_coach_session() or (select count(*) from public.organization_memberships where user_id=actor and status='ACTIVE')<>1 then
   raise exception using errcode='P0001',message='FE_FORBIDDEN'; end if;
 select * into m from public.organization_memberships where user_id=actor and status='ACTIVE' and role in ('COACH','ADMIN');
 if not found then raise exception using errcode='P0001',message='FE_FORBIDDEN'; end if;
 if not exists(select 1 from app_private.training_pilot_organizations where organization_id=m.organization_id) then
   raise exception using errcode='P0001',message='FE_PILOT_DISABLED'; end if;
 select * into c from app_private.training_pilot_catalog where source_id=p_source_id and pilot->>'sourceVersion'=p_source_version;
 if not found or p_idempotency_key is null then raise exception using errcode='P0001',message='FE_INVALID_PILOT_EXERCISE'; end if;
 fingerprint:=encode(extensions.digest(convert_to(jsonb_build_object('command','SELECT_TRAINING_PILOT','org',m.organization_id,'source',p_source_id,'version',p_source_version)::text,'UTF8'),'sha256'),'hex');
 perform pg_advisory_xact_lock(hashtextextended(concat_ws(':','training-exercise',actor::text,p_idempotency_key::text),0));
 select * into r from app_private.training_exercise_receipts where actor_user_id=actor and idempotency_key=p_idempotency_key;
 if found then
   if r.request_fingerprint<>fingerprint then raise exception using errcode='P0001',message='FE_IDEMPOTENCY_CONFLICT'; end if;
   return r.result_snapshot;
 end if;
 perform pg_advisory_xact_lock(hashtextextended(concat_ws(':','training-pilot',m.organization_id::text,p_source_id,p_source_version),0));
 select * into x from public.training_exercises where organization_id=m.organization_id and pilot=c.pilot;
 if not found then
   insert into public.training_exercises(organization_id,name,equipment,cue_fr,cue_en,default_unit,created_by,pilot)
   values(m.organization_id,c.pilot#>>'{name,fr}',c.pilot#>>'{equipment,labels,fr}','','',c.default_unit,actor,c.pilot) returning * into x;
 end if;
 snapshot:=jsonb_build_object('id',x.id,'name',x.name,'equipment',x.equipment,'cue',jsonb_build_object('fr',x.cue_fr,'en',x.cue_en),
   'defaultUnit',x.default_unit,'archived',x.archived,'version',x.row_version,'createdBy',x.created_by,'updatedAt',x.updated_at,'canEdit',false,'pilot',x.pilot);
 insert into app_private.training_exercise_receipts(actor_user_id,idempotency_key,request_fingerprint,exercise_id,result_snapshot)
   values(actor,p_idempotency_key,fingerprint,x.id,snapshot);
 insert into public.audit_events(organization_id,actor_user_id,actor_role,command,entity_type,entity_id,entity_version,result,correlation_id)
   values(m.organization_id,actor,m.role,'SELECT_TRAINING_PILOT','training_exercise',x.id,x.row_version,'SUCCEEDED',p_idempotency_key);
 return snapshot;
end $$;
revoke all on function public.select_training_pilot_exercise(text,text,uuid) from public,anon,authenticated;
grant execute on function public.select_training_pilot_exercise(text,text,uuid) to authenticated;

-- Additional validators and guards below preserve the original role/RLS gates.

create function app_private.training_pilot_document_valid(p jsonb,p_org uuid) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare e jsonb; x public.training_exercises%rowtype; pr jsonb;
begin
 for e in select e.value from jsonb_array_elements(p->'weeks') w
   cross join lateral jsonb_array_elements(w.value->'sessions') s
   cross join lateral jsonb_array_elements(s.value->'blocks') b
   cross join lateral jsonb_array_elements(b.value->'exercises') e loop
   select * into x from public.training_exercises where id=(e->>'libraryExerciseId')::uuid;
   if e ? 'pilot' or x.pilot is not null then
     if x.pilot is null or x.organization_id is distinct from p_org or not (e ? 'pilot') or x.pilot<>e->'pilot'
       or e->>'name'<>x.name or x.archived then return false; end if;
     for pr in select e->'prescription' union all select value from jsonb_array_elements(coalesce(e#>'{prescription,prescribedSets}','[]'::jsonb)) loop
       if pr->>'unit'<>x.default_unit then return false; end if;
     end loop;
   elsif e#>>'{prescription,unit}'='configuration' or exists(select 1 from jsonb_array_elements(coalesce(e#>'{prescription,prescribedSets}','[]'::jsonb)) pr where pr->>'unit'='configuration') then return false;
   end if;
 end loop;
 return true;
exception when others then return false;
end $$;
revoke all on function app_private.training_pilot_document_valid(jsonb,uuid) from public,anon,authenticated;

create function app_private.training_pilot_draft_guard() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if not app_private.training_pilot_document_valid(new.document,new.organization_id) then raise exception using errcode='P0001',message='FE_INVALID_PILOT_SNAPSHOT'; end if;
 if jsonb_path_exists(new.document,'$.weeks[*].sessions[*].blocks[*].exercises[*].pilot') and
   not exists(select 1 from app_private.training_pilot_organizations where organization_id=new.organization_id) then
   raise exception using errcode='P0001',message='FE_PILOT_DISABLED'; end if;
 return new;
end $$;
revoke all on function app_private.training_pilot_draft_guard() from public,anon,authenticated;
create trigger training_pilot_draft_guard before insert or update on public.training_program_drafts for each row execute function app_private.training_pilot_draft_guard();

create function app_private.training_pilot_publication_guard() returns trigger
language plpgsql security definer set search_path='' as $$
declare e jsonb; pr jsonb;
begin
 if not app_private.training_pilot_document_valid(new.document,new.organization_id) then raise exception using errcode='P0001',message='FE_INVALID_PILOT_SNAPSHOT'; end if;
 if jsonb_path_exists(new.document,'$.weeks[*].sessions[*].blocks[*].exercises[*].pilot') then
   if not exists(select 1 from app_private.training_pilot_clients where organization_id=new.organization_id and client_id=new.client_id) then
     raise exception using errcode='P0001',message='FE_PILOT_RECIPIENT_DISABLED'; end if;
   for e in select e.value from jsonb_array_elements(new.document->'weeks') w
     cross join lateral jsonb_array_elements(w.value->'sessions') s
     cross join lateral jsonb_array_elements(s.value->'blocks') b
     cross join lateral jsonb_array_elements(b.value->'exercises') e where e.value ? 'pilot' loop
     for pr in select e->'prescription' union all select value from jsonb_array_elements(coalesce(e#>'{prescription,prescribedSets}','[]'::jsonb)) loop
       if pr->>'unit' in ('configuration','sec','distance') and regexp_replace(pr->>'loadTarget','[[:space:]]','','g')=''  then
         raise exception using errcode='P0001',message='FE_INVALID_TRAINING_PUBLICATION'; end if;
     end loop;
   end loop;
 end if;
 return new;
end $$;
revoke all on function app_private.training_pilot_publication_guard() from public,anon,authenticated;
create trigger training_pilot_publication_guard before insert on public.training_program_publications for each row execute function app_private.training_pilot_publication_guard();

create or replace function app_private.training_draft_set_valid(p jsonb) returns boolean
language sql immutable set search_path='' as $$
 select coalesce(jsonb_typeof(p)='object'
   and p ?& array['reps','targetRir','restSeconds','tempo','loadTarget','unit']
   and p - array['reps','targetRir','restSeconds','tempo','loadTarget','unit']='{}'::jsonb
   and jsonb_typeof(p->'reps')='string' and char_length(btrim(p->>'reps')) between 1 and 40
   and app_private.training_draft_int_valid(p->'targetRir',0,10)
   and app_private.training_draft_int_valid(p->'restSeconds',0,3600)
   and jsonb_typeof(p->'tempo')='string' and char_length(p->>'tempo')<=40
   and jsonb_typeof(p->'loadTarget')='string' and char_length(p->>'loadTarget')<=120
   and jsonb_typeof(p->'unit')='string' and p->>'unit' in ('lb','min','sec','distance','level','configuration'),false)
$$;

create function app_private.training_draft_without_pilot_valid(p jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare w jsonb; s jsonb; b jsonb; e jsonb; pr jsonb; st jsonb; n integer:=0; ids text[];
begin
  if p is null or octet_length(p::text)>512000 or jsonb_typeof(p)<>'object'
     or not p ?& array['schemaVersion','phaseId','title','weeks']
     or p - array['schemaVersion','phaseId','title','weeks'] <> '{}'::jsonb
     or p->'schemaVersion' <> '1'::jsonb or not app_private.training_draft_uuid_valid(p->'phaseId')
     or not app_private.training_draft_text_valid(p->'title')
     or (btrim(p#>>'{title,fr}')='' and btrim(p#>>'{title,en}')='')
     or jsonb_typeof(p->'weeks')<>'array' or jsonb_array_length(p->'weeks') not between 1 and 52 then return false; end if;
  for w in select value from jsonb_array_elements(p->'weeks') loop
    n:=n+1; ids:=array[lower(p->>'phaseId')];
    if jsonb_typeof(w)<>'object' or not w ?& array['number','objective','sessions']
       or w - array['number','objective','sessions'] <> '{}'::jsonb
       or not app_private.training_draft_int_valid(w->'number',n,n)
       or not app_private.training_draft_text_valid(w->'objective')
       or jsonb_typeof(w->'sessions')<>'array' or jsonb_array_length(w->'sessions')>14 then return false; end if;
    for s in select value from jsonb_array_elements(w->'sessions') loop
      if jsonb_typeof(s)<>'object' or not s ?& array['id','title','type','required','schedule','warmup','blocks']
         or s - array['id','title','type','required','schedule','warmup','blocks'] <> '{}'::jsonb
         or not app_private.training_draft_uuid_valid(s->'id') or lower(s->>'id')=any(ids)
         or not app_private.training_draft_text_valid(s->'title') or not app_private.training_draft_text_valid(s->'warmup')
         or jsonb_typeof(s->'type')<>'string' or s->>'type' not in ('training','active-recovery','complete-rest','posing','mobility')
         or jsonb_typeof(s->'required')<>'boolean' or jsonb_typeof(s->'schedule')<>'object'
         or not (s->'schedule') ?& array['mode','day'] or (s->'schedule') - array['mode','day'] <> '{}'::jsonb
         or jsonb_typeof(s#>'{schedule,mode}')<>'string' or s#>>'{schedule,mode}' not in ('fixed','suggested','flexible')
         or (s#>>'{schedule,mode}'='flexible' and s#>'{schedule,day}'<>'null'::jsonb)
         or (s#>>'{schedule,mode}'<>'flexible' and not app_private.training_draft_int_valid(s#>'{schedule,day}',1,7))
         or jsonb_typeof(s->'blocks')<>'array' or jsonb_array_length(s->'blocks')>20
         or (s->>'type'='complete-rest' and jsonb_array_length(s->'blocks')>0) then return false; end if;
      ids:=array_append(ids,lower(s->>'id'));
      for b in select value from jsonb_array_elements(s->'blocks') loop
        if jsonb_typeof(b)<>'object' or not b ?& array['id','label','mode','restSeconds','exercises']
           or b - array['id','label','mode','restSeconds','exercises'] <> '{}'::jsonb
           or not app_private.training_draft_uuid_valid(b->'id') or lower(b->>'id')=any(ids)
           or not app_private.training_draft_text_valid(b->'label') or jsonb_typeof(b->'mode')<>'string' or b->>'mode' not in ('standard','superset','finisher')
           or not app_private.training_draft_int_valid(b->'restSeconds',0,3600)
           or jsonb_typeof(b->'exercises')<>'array' or jsonb_array_length(b->'exercises')>30 then return false; end if;
        ids:=array_append(ids,lower(b->>'id'));
        for e in select value from jsonb_array_elements(b->'exercises') loop
          if jsonb_typeof(e)<>'object' or not e ?& array['id','libraryExerciseId','name','cue','media','prescription']
             or e - array['id','libraryExerciseId','name','cue','media','prescription'] <> '{}'::jsonb
             or not app_private.training_draft_uuid_valid(e->'id') or lower(e->>'id')=any(ids)
             or not app_private.training_draft_uuid_valid(e->'libraryExerciseId')
             or jsonb_typeof(e->'name')<>'string' or char_length(btrim(e->>'name')) not between 1 and 160
             or not app_private.training_draft_text_valid(e->'cue') or e->'media'<>'null'::jsonb then return false; end if;
          ids:=array_append(ids,lower(e->>'id')); pr:=e->'prescription';
          if jsonb_typeof(pr)<>'object' or not pr ?& array['sets','reps','targetRir','restSeconds','tempo','loadTarget','unit']
             or not app_private.training_draft_int_valid(pr->'sets',1,20)
             or not app_private.training_draft_set_valid(pr - array['sets','prescribedSets']) then return false; end if;
          if pr ? 'prescribedSets' then
            if jsonb_typeof(pr->'prescribedSets')<>'array' or jsonb_array_length(pr->'prescribedSets')<>(pr->>'sets')::integer then return false; end if;
            for st in select value from jsonb_array_elements(pr->'prescribedSets') loop
              if not app_private.training_draft_set_valid(st) then return false; end if;
            end loop;
            if (select count(distinct value) from jsonb_array_elements(pr->'prescribedSets'))<2 then return false; end if;
          end if;
        end loop;
      end loop;
    end loop;
  end loop;
  return true;
exception when others then return false;
end $$;

create or replace function app_private.training_draft_valid(p jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare cleaned jsonb:=p; w record; s record; b record; e record;
begin
 if p is null or octet_length(p::text)>512000 then return false; end if;
 for w in select value,ordinality-1 i from jsonb_array_elements(p->'weeks') with ordinality loop
  for s in select value,ordinality-1 i from jsonb_array_elements(w.value->'sessions') with ordinality loop
   for b in select value,ordinality-1 i from jsonb_array_elements(s.value->'blocks') with ordinality loop
    for e in select value,ordinality-1 i from jsonb_array_elements(b.value->'exercises') with ordinality loop
     if e.value ? 'pilot' then
      if not app_private.training_pilot_valid(e.value->'pilot') then return false; end if;
      cleaned:=jsonb_set(cleaned,array['weeks',w.i::text,'sessions',s.i::text,'blocks',b.i::text,'exercises',e.i::text],e.value-'pilot');
     end if;
    end loop;
   end loop;
  end loop;
 end loop;
 return app_private.training_draft_without_pilot_valid(cleaned);
exception when others then return false;
end $$;
revoke all on function app_private.training_draft_without_pilot_valid(jsonb) from public,anon,authenticated;

create or replace function app_private.training_result_sets_shape_valid(p_sets jsonb)
returns boolean language plpgsql immutable set search_path='' as $$
declare item jsonb;
begin
  if p_sets is null or jsonb_typeof(p_sets)<>'array'
     or jsonb_array_length(p_sets)>24000 then return false; end if;
  if (select count(*)<>count(distinct lower(value->>'exerciseId')||':'||(value->>'setNumber'))
      from jsonb_array_elements(p_sets)) then return false; end if;
  for item in select value from jsonb_array_elements(p_sets) loop
    if jsonb_typeof(item)<>'object'
       or not item ?& array['exerciseId','setNumber','status','reps','load','rir','kind','unit']
       or item-array['exerciseId','setNumber','status','reps','load','rir','kind','unit','details']<>'{}'::jsonb
       or not app_private.training_draft_uuid_valid(item->'exerciseId')
       or not app_private.training_draft_int_valid(item->'setNumber',1,40)
       or jsonb_typeof(item->'status')<>'string' or item->>'status' not in ('PENDING','DONE','SKIPPED')
       or jsonb_typeof(item->'kind')<>'string' or item->>'kind' not in ('PRESCRIBED','EXTRA')
       or jsonb_typeof(item->'unit')<>'string' or item->>'unit' not in ('lb','min','sec','distance','level','configuration')
       or not ((item->'reps'='null'::jsonb) or app_private.training_draft_int_valid(item->'reps',0,10000))
       or not ((item->'rir'='null'::jsonb) or app_private.training_draft_int_valid(item->'rir',0,10))
       or not ((item->'load'='null'::jsonb) or (
         jsonb_typeof(item->'load')='number'
         and (item->>'load')::numeric between 0 and 100000
         and (item->>'load')::numeric=round((item->>'load')::numeric,6)
       ))
       or (item ? 'details' and not (item->'details'='null'::jsonb or (jsonb_typeof(item->'details')='string' and char_length(item->>'details')<=500)))
       or (item->>'status'='DONE' and case when item->>'unit'='configuration' then
         item->'load'<>'null'::jsonb or item->'reps'='null'::jsonb or coalesce(regexp_replace(item->>'details','[[:space:]]','','g'),'')=''
         else item->'load'='null'::jsonb or (item->>'unit'='lb' and item->'reps'='null'::jsonb) end)
       or (item->>'status'<>'DONE' and (item->'reps'<>'null'::jsonb or item->'load'<>'null'::jsonb or item->'rir'<>'null'::jsonb or coalesce(item->'details','null'::jsonb)<>'null'::jsonb))
       then return false; end if;
  end loop;
  return true;
exception when others then return false;
end $$;

create or replace function app_private.training_result_enrich_sets(
  p_sets jsonb,p_session jsonb,p_status text,p_note text
) returns jsonb language plpgsql immutable set search_path='' as $$
declare enriched jsonb; valid boolean; has_skipped boolean;
begin
  if p_status is null or p_status not in ('IN_PROGRESS','COMPLETED')
     or p_sets is null or jsonb_typeof(p_sets)<>'array'
     or jsonb_array_length(p_sets)>24000 then
    raise exception using errcode='P0001',message='FE_INVALID_WORKOUT';
  end if;
  with catalog as (
    select lower(e.value->>'id') exercise_id,e.value exercise
    from jsonb_array_elements(p_session->'blocks') b
    cross join lateral jsonb_array_elements(b.value->'exercises') e
  ), raw as (
    select input.value item,input.ordinal
    from jsonb_array_elements(p_sets) with ordinality as input(value,ordinal)
  ), matched as (
    select raw.*,
      case when app_private.training_draft_int_valid(item->'setNumber',1,40)
        then (item->>'setNumber')::integer end set_number,
      catalog.exercise
    from raw left join catalog on catalog.exercise_id=lower(raw.item->>'exerciseId')
  ), prescribed as (
    select matched.*,
      case when exercise is not null then (exercise#>>'{prescription,sets}')::integer end prescribed_count
    from matched
  ), derived as (
    select prescribed.*,
      case when set_number<=prescribed_count and jsonb_typeof(exercise#>'{prescription,prescribedSets}')='array'
        then exercise#>>array['prescription','prescribedSets',(set_number-1)::text,'unit']
        else exercise#>>'{prescription,unit}' end unit
    from prescribed
  )
  select
    coalesce(bool_and(coalesce(
      jsonb_typeof(item)='object'
      and item ?& array['exerciseId','setNumber','status','reps','load','rir']
      and item-array['exerciseId','setNumber','status','reps','load','rir','details']='{}'::jsonb
      and app_private.training_draft_uuid_valid(item->'exerciseId')
      and set_number is not null and exercise is not null and set_number<=prescribed_count+20
      and jsonb_typeof(item->'status')='string' and item->>'status' in ('PENDING','DONE','SKIPPED')
      and ((item->'reps'='null'::jsonb) or app_private.training_draft_int_valid(item->'reps',0,10000))
      and ((item->'rir'='null'::jsonb) or app_private.training_draft_int_valid(item->'rir',0,10))
      and ((item->'load'='null'::jsonb) or (
        jsonb_typeof(item->'load')='number'
        and case when jsonb_typeof(item->'load')='number' then (item->>'load')::numeric end between 0 and 100000
        and case when jsonb_typeof(item->'load')='number' then (item->>'load')::numeric end
          =round(case when jsonb_typeof(item->'load')='number' then (item->>'load')::numeric end,6)
      ))
      and (not (item ? 'details') or item->'details'='null'::jsonb or (jsonb_typeof(item->'details')='string' and char_length(item->>'details')<=500))
      and (
        (item->>'status'='DONE' and case when unit='configuration' then
          item->'load'='null'::jsonb and item->'reps'<>'null'::jsonb and coalesce(regexp_replace(item->>'details','[[:space:]]','','g'),'')<>''
          else item->'load'<>'null'::jsonb and (unit<>'lb' or item->'reps'<>'null'::jsonb) end
          and (not (exercise ? 'pilot') or unit<>'distance' or coalesce(regexp_replace(item->>'details','[[:space:]]','','g'),'')<>''))
        or (item->>'status'<>'DONE' and item->'reps'='null'::jsonb and item->'load'='null'::jsonb and item->'rir'='null'::jsonb and coalesce(item->'details','null'::jsonb)='null'::jsonb)
      )
      and (p_status<>'COMPLETED' or item->>'status'<>'PENDING')
    ,false)),true)
      and count(*)=count(distinct lower(item->>'exerciseId')||':'||(item->>'setNumber')),
    coalesce(jsonb_agg(item||jsonb_build_object(
      'exerciseId',exercise->>'id',
      'kind',case when set_number<=prescribed_count then 'PRESCRIBED' else 'EXTRA' end,
      'unit',unit
    ) order by ordinal),'[]'::jsonb),
    coalesce(bool_or(item->>'status'='SKIPPED'),false)
  into valid,enriched,has_skipped from derived;
  if not valid then raise exception using errcode='P0001',message='FE_INVALID_WORKOUT'; end if;
  if has_skipped and (
    p_note is null
    or regexp_replace(p_note,'[[:space:]]','','g')=''
  ) then
    raise exception using errcode='P0001',message='FE_INVALID_WORKOUT'; end if;
  if p_status='COMPLETED' and exists(
    select 1 from (
      (select lower(e.value->>'id') exercise_id,n set_number
       from jsonb_array_elements(p_session->'blocks') b
       cross join lateral jsonb_array_elements(b.value->'exercises') e
       cross join lateral generate_series(1,(e.value#>>'{prescription,sets}')::integer) n)
      except
      (select lower(result.value->>'exerciseId'),(result.value->>'setNumber')::integer
       from jsonb_array_elements(enriched) result
       where result.value->>'status' in ('DONE','SKIPPED'))
    ) missing
  ) then raise exception using errcode='P0001',message='FE_INVALID_WORKOUT'; end if;
  return enriched;
exception when sqlstate 'P0001' then raise;
  when others then raise exception using errcode='P0001',message='FE_INVALID_WORKOUT';
end $$;

commit;
