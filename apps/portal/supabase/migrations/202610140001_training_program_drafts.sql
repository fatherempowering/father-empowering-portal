begin;

-- Draft-only editor. No assignment, publication, Client read or outbox event.
-- SQL validates direct authenticated RPC calls as strictly as the HTTP boundary.
create function app_private.training_draft_text_valid(p jsonb) returns boolean
language sql immutable set search_path='' as $$
 select coalesce(jsonb_typeof(p)='object' and p ?& array['fr','en']
   and p - array['fr','en'] = '{}'::jsonb
   and jsonb_typeof(p->'fr')='string' and char_length(p->>'fr')<=300
   and jsonb_typeof(p->'en')='string' and char_length(p->>'en')<=300,false)
$$;
create function app_private.training_draft_int_valid(p jsonb, lo integer, hi integer) returns boolean
language sql immutable set search_path='' as $$
 select case when jsonb_typeof(p)='number' then
   (p::text)::numeric between lo and hi and (p::text)::numeric=trunc((p::text)::numeric)
 else false end
$$;
create function app_private.training_draft_uuid_valid(p jsonb) returns boolean
language sql immutable set search_path='' as $$
 select coalesce(jsonb_typeof(p)='string' and p#>>'{}' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',false)
$$;
create function app_private.training_draft_set_valid(p jsonb) returns boolean
language sql immutable set search_path='' as $$
 select coalesce(jsonb_typeof(p)='object'
   and p ?& array['reps','targetRir','restSeconds','tempo','loadTarget','unit']
   and p - array['reps','targetRir','restSeconds','tempo','loadTarget','unit']='{}'::jsonb
   and jsonb_typeof(p->'reps')='string' and char_length(btrim(p->>'reps')) between 1 and 40
   and app_private.training_draft_int_valid(p->'targetRir',0,10)
   and app_private.training_draft_int_valid(p->'restSeconds',0,3600)
   and jsonb_typeof(p->'tempo')='string' and char_length(p->>'tempo')<=40
   and jsonb_typeof(p->'loadTarget')='string' and char_length(p->>'loadTarget')<=120
   and jsonb_typeof(p->'unit')='string' and p->>'unit' in ('lb','min','sec','distance','level'),false)
$$;
create function app_private.training_draft_valid(p jsonb) returns boolean
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
revoke all on function app_private.training_draft_text_valid(jsonb), app_private.training_draft_int_valid(jsonb,integer,integer),
  app_private.training_draft_uuid_valid(jsonb), app_private.training_draft_set_valid(jsonb), app_private.training_draft_valid(jsonb)
  from public, anon, authenticated;

create table public.training_program_drafts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  created_by uuid not null references auth.users(id) on delete restrict,
  document jsonb not null check (app_private.training_draft_valid(document)),
  title_fr text generated always as (document#>>'{title,fr}') stored,
  title_en text generated always as (document#>>'{title,en}') stored,
  week_count integer generated always as (jsonb_array_length(document->'weeks')) stored,
  row_version bigint not null default 1 check (row_version>0),
  created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp()
);
create index training_program_drafts_browse_idx on public.training_program_drafts(organization_id,created_by,updated_at desc,id);
alter table public.training_program_drafts enable row level security;
alter table public.training_program_drafts force row level security;
revoke all on public.training_program_drafts from public, anon, authenticated;
grant select on public.training_program_drafts to authenticated;
grant all on public.training_program_drafts to service_role;
create policy training_program_drafts_owner_select on public.training_program_drafts for select to authenticated
using (app_private.has_org_role(organization_id,array['ADMIN']::public.app_role[])
  or (created_by=auth.uid() and app_private.has_org_role(organization_id,array['COACH']::public.app_role[])));

create table app_private.training_program_receipts (
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  idempotency_key uuid not null, request_fingerprint text not null,
  program_id uuid not null references public.training_program_drafts(id) on delete restrict,
  result_snapshot jsonb not null, created_at timestamptz not null default clock_timestamp(),
  primary key(actor_user_id,idempotency_key)
);
revoke all on app_private.training_program_receipts from public, anon, authenticated;

create function public.save_training_program_draft(p_program_id uuid,p_document jsonb,p_expected_version bigint,p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); m public.organization_memberships%rowtype;
  d public.training_program_drafts%rowtype; r app_private.training_program_receipts%rowtype;
  fingerprint text; snapshot jsonb;
begin
  if v_actor is null then raise exception using errcode='P0001',message='FE_UNAUTHENTICATED'; end if;
  if not app_private.has_verified_coach_session() or (select count(*) from public.organization_memberships where user_id=v_actor and status='ACTIVE')<>1 then
    raise exception using errcode='P0001',message='FE_FORBIDDEN'; end if;
  select * into m from public.organization_memberships where user_id=v_actor and status='ACTIVE' and role in ('COACH','ADMIN');
  if not found then raise exception using errcode='P0001',message='FE_FORBIDDEN'; end if;
  if p_idempotency_key is null or p_expected_version is null or p_expected_version not between 0 and 9007199254740991
     or ((p_program_id is null)<>(p_expected_version=0)) or not app_private.training_draft_valid(p_document) then
    raise exception using errcode='P0001',message='FE_INVALID_TRAINING_DRAFT'; end if;
  fingerprint:=encode(extensions.digest(convert_to(jsonb_build_object('org',m.organization_id,'id',p_program_id,'document',p_document,'version',p_expected_version)::text,'UTF8'),'sha256'),'hex');
  perform pg_advisory_xact_lock(hashtextextended(concat_ws(':','training-draft',v_actor::text,p_idempotency_key::text),0));
  select * into r from app_private.training_program_receipts where actor_user_id=v_actor and idempotency_key=p_idempotency_key;
  if found then
    if not exists(select 1 from public.training_program_drafts where id=r.program_id and organization_id=m.organization_id and (created_by=v_actor or m.role='ADMIN')) then
      raise exception using errcode='P0001',message='FE_NOT_FOUND'; end if;
    if fingerprint<>r.request_fingerprint then raise exception using errcode='P0001',message='FE_IDEMPOTENCY_CONFLICT'; end if;
    return r.result_snapshot;
  end if;
  -- A forged cross-organization exercise identifier can never enter a draft.
  if exists(select 1 from jsonb_array_elements(p_document->'weeks') w,
    lateral jsonb_array_elements(w->'sessions') s, lateral jsonb_array_elements(s->'blocks') b,
    lateral jsonb_array_elements(b->'exercises') e
    where not exists(select 1 from public.training_exercises x where x.id=(e->>'libraryExerciseId')::uuid and x.organization_id=m.organization_id)) then
    raise exception using errcode='P0001',message='FE_INVALID_TRAINING_DRAFT'; end if;
  if p_program_id is null then
    insert into public.training_program_drafts(organization_id,created_by,document) values(m.organization_id,v_actor,p_document) returning * into d;
  else
    select * into d from public.training_program_drafts where id=p_program_id and organization_id=m.organization_id and (created_by=v_actor or m.role='ADMIN') for update;
    if not found then raise exception using errcode='P0001',message='FE_NOT_FOUND'; end if;
    if d.row_version<>p_expected_version then raise exception using errcode='P0001',message='FE_VERSION_CONFLICT'; end if;
    if d.document->>'phaseId'<>p_document->>'phaseId' then raise exception using errcode='P0001',message='FE_INVALID_TRAINING_DRAFT'; end if;
    update public.training_program_drafts set document=p_document,row_version=row_version+1,updated_at=clock_timestamp() where id=p_program_id returning * into d;
  end if;
  snapshot:=jsonb_build_object('id',d.id,'version',d.row_version,'document',d.document,'createdBy',d.created_by,'updatedAt',d.updated_at);
  insert into app_private.training_program_receipts(actor_user_id,idempotency_key,request_fingerprint,program_id,result_snapshot) values(v_actor,p_idempotency_key,fingerprint,d.id,snapshot);
  insert into public.audit_events(organization_id,actor_user_id,actor_role,command,entity_type,entity_id,entity_version,result,correlation_id)
    values(m.organization_id,v_actor,m.role,'SAVE_TRAINING_PROGRAM_DRAFT','training_program_draft',d.id,d.row_version,'SUCCEEDED',p_idempotency_key);
  return snapshot;
end $$;
revoke all on function public.save_training_program_draft(uuid,jsonb,bigint,uuid) from public, anon, authenticated;
grant execute on function public.save_training_program_draft(uuid,jsonb,bigint,uuid) to authenticated;
commit;
