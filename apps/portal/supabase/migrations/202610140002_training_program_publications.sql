begin;

create function app_private.training_program_publishable(p jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare w jsonb; s jsonb; b jsonb;
begin
  if not app_private.training_draft_valid(p) then return false; end if;
  for w in select value from jsonb_array_elements(p->'weeks') loop
    if jsonb_array_length(w->'sessions')=0 then return false; end if;
    for s in select value from jsonb_array_elements(w->'sessions') loop
      if (btrim(s#>>'{title,fr}')='' and btrim(s#>>'{title,en}')='')
        or (s->>'type'='training' and jsonb_array_length(s->'blocks')=0) then return false; end if;
      for b in select value from jsonb_array_elements(s->'blocks') loop
        if jsonb_array_length(b->'exercises')=0
          or (b->>'mode'='superset' and jsonb_array_length(b->'exercises')<>2)
          or (b->>'mode'='finisher' and jsonb_array_length(b->'exercises')<2)
          or (b->>'mode'<>'standard' and (select count(distinct value#>>'{prescription,sets}') from jsonb_array_elements(b->'exercises'))<>1)
          then return false; end if;
      end loop;
    end loop;
  end loop;
  return true;
exception when others then return false;
end $$;
revoke all on function app_private.training_program_publishable(jsonb) from public,anon,authenticated;

-- Narrow capability for publication: unlike general dossier access, the
-- assignment must be ACTIVE. The existing role and session guards are reused.
create function app_private.can_publish_training(p_org uuid,p_client uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.clients c
   join public.coach_client_assignments a on a.organization_id=c.organization_id and a.client_id=c.id
   join public.organization_memberships cm on cm.organization_id=c.organization_id and cm.user_id=c.auth_user_id
   join public.organization_memberships coach on coach.organization_id=a.organization_id and coach.user_id=a.coach_user_id
   where c.organization_id=p_org and c.id=p_client and c.status='ACTIVE'
     and cm.status='ACTIVE' and coach.status='ACTIVE' and coach.role in ('ADMIN','COACH')
     and a.status='ACTIVE' and a.archived_at is null
     and (app_private.has_org_role(p_org,array['ADMIN']::public.app_role[])
       or (a.coach_user_id=auth.uid() and app_private.has_org_role(p_org,array['COACH']::public.app_role[]))))
$$;
revoke all on function app_private.can_publish_training(uuid,uuid) from public,anon,authenticated;
grant execute on function app_private.can_publish_training(uuid,uuid) to authenticated;

create table public.training_program_publications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  client_id uuid not null,
  program_id uuid not null references public.training_program_drafts(id) on delete restrict,
  draft_version bigint not null check(draft_version>0),
  revision bigint not null check(revision>0),
  document jsonb not null check(app_private.training_program_publishable(document)),
  published_by uuid not null references auth.users(id) on delete restrict,
  published_at timestamptz not null default clock_timestamp(),
  foreign key(organization_id,client_id) references public.clients(organization_id,id) on delete restrict,
  unique(organization_id,client_id,revision),
  unique(organization_id,client_id,program_id,draft_version)
);
create index training_publications_current_idx on public.training_program_publications(organization_id,client_id,revision desc);
alter table public.training_program_publications enable row level security;
alter table public.training_program_publications force row level security;
revoke all on public.training_program_publications from public,anon,authenticated;
grant select on public.training_program_publications to authenticated;
grant select,insert on public.training_program_publications to service_role;
create policy training_publications_authorized_select on public.training_program_publications for select to authenticated
using (app_private.has_own_client_access(organization_id,client_id) or app_private.can_publish_training(organization_id,client_id));

-- Immutable even for a privileged accidental UPDATE; maintenance requires a
-- separately authorized migration. No results are stored in these snapshots.
create function app_private.training_publication_immutable() returns trigger
language plpgsql set search_path='' as $$ begin
  raise exception using errcode='P0001',message='FE_IMMUTABLE_PUBLICATION';
end $$;
revoke all on function app_private.training_publication_immutable() from public,anon,authenticated;
create trigger training_publication_immutable before update or delete on public.training_program_publications
for each row execute function app_private.training_publication_immutable();

create table app_private.training_publication_receipts (
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  idempotency_key uuid not null, request_fingerprint text not null,
  publication_id uuid not null references public.training_program_publications(id) on delete restrict,
  primary key(actor_user_id,idempotency_key)
);
revoke all on app_private.training_publication_receipts from public,anon,authenticated;

create function app_private.training_publication_snapshot(p public.training_program_publications) returns jsonb
language sql immutable set search_path='' as $$
 select jsonb_build_object('id',p.id,'clientId',p.client_id,'programId',p.program_id,'draftVersion',p.draft_version,
   'revision',p.revision,'document',p.document,'publishedAt',p.published_at)
$$;
revoke all on function app_private.training_publication_snapshot(public.training_program_publications) from public,anon,authenticated;

create function public.publish_training_program(p_client_id uuid,p_program_id uuid,p_draft_version bigint,p_expected_publication_id uuid,p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); m public.organization_memberships%rowtype;
  d public.training_program_drafts%rowtype; latest public.training_program_publications%rowtype;
  publication public.training_program_publications%rowtype; receipt app_private.training_publication_receipts%rowtype; fingerprint text;
begin
  if actor is null then raise exception using errcode='P0001',message='FE_UNAUTHENTICATED'; end if;
  if not app_private.has_verified_coach_session() or (select count(*) from public.organization_memberships where user_id=actor and status='ACTIVE')<>1 then
    raise exception using errcode='P0001',message='FE_FORBIDDEN'; end if;
  select * into m from public.organization_memberships where user_id=actor and status='ACTIVE' and role in ('COACH','ADMIN');
  if not found then raise exception using errcode='P0001',message='FE_FORBIDDEN'; end if;
  if p_client_id is null or p_program_id is null or p_idempotency_key is null or p_draft_version is null or p_draft_version not between 1 and 9007199254740991 then
    raise exception using errcode='P0001',message='FE_INVALID_TRAINING_PUBLICATION'; end if;
  if not app_private.can_publish_training(m.organization_id,p_client_id) then raise exception using errcode='P0001',message='FE_NOT_FOUND'; end if;
  fingerprint:=encode(extensions.digest(convert_to(jsonb_build_object('org',m.organization_id,'client',p_client_id,'program',p_program_id,'version',p_draft_version,'previous',p_expected_publication_id)::text,'UTF8'),'sha256'),'hex');
  perform pg_advisory_xact_lock(hashtextextended(concat_ws(':','training-publication-command',actor::text,p_idempotency_key::text),0));
  select * into receipt from app_private.training_publication_receipts where actor_user_id=actor and idempotency_key=p_idempotency_key;
  if found then
    if receipt.request_fingerprint<>fingerprint then raise exception using errcode='P0001',message='FE_IDEMPOTENCY_CONFLICT'; end if;
    select * into publication from public.training_program_publications where id=receipt.publication_id and organization_id=m.organization_id and client_id=p_client_id;
    if not found then raise exception using errcode='P0001',message='FE_NOT_FOUND'; end if;
    return app_private.training_publication_snapshot(publication);
  end if;
  -- Serialize publications for one Client, including two different drafts.
  perform pg_advisory_xact_lock(hashtextextended(concat_ws(':','training-publication-client',m.organization_id::text,p_client_id::text),0));
  select * into d from public.training_program_drafts where id=p_program_id and organization_id=m.organization_id and (created_by=actor or m.role='ADMIN') for share;
  if not found then raise exception using errcode='P0001',message='FE_NOT_FOUND'; end if;
  if d.row_version<>p_draft_version then raise exception using errcode='P0001',message='FE_VERSION_CONFLICT'; end if;
  if not app_private.training_program_publishable(d.document) then raise exception using errcode='P0001',message='FE_INVALID_TRAINING_PUBLICATION'; end if;
  select * into latest from public.training_program_publications where organization_id=m.organization_id and client_id=p_client_id order by revision desc limit 1;
  if latest.id is distinct from p_expected_publication_id then raise exception using errcode='P0001',message='FE_VERSION_CONFLICT'; end if;
  if exists(select 1 from public.training_program_publications where organization_id=m.organization_id and client_id=p_client_id and program_id=p_program_id and draft_version=p_draft_version) then
    raise exception using errcode='P0001',message='FE_ALREADY_PUBLISHED'; end if;
  insert into public.training_program_publications(organization_id,client_id,program_id,draft_version,revision,document,published_by)
    values(m.organization_id,p_client_id,d.id,d.row_version,coalesce(latest.revision,0)+1,d.document,actor) returning * into publication;
  insert into app_private.training_publication_receipts values(actor,p_idempotency_key,fingerprint,publication.id);
  insert into public.audit_events(organization_id,actor_user_id,actor_role,command,entity_type,entity_id,entity_version,result,correlation_id)
    values(m.organization_id,actor,m.role,'PUBLISH_TRAINING_PROGRAM','training_program_publication',publication.id,publication.revision,'SUCCEEDED',p_idempotency_key);
  return app_private.training_publication_snapshot(publication);
end $$;
revoke all on function public.publish_training_program(uuid,uuid,bigint,uuid,uuid) from public,anon,authenticated;
grant execute on function public.publish_training_program(uuid,uuid,bigint,uuid,uuid) to authenticated;

-- Only identifiers and names required by the picker; never email addresses.
create function public.list_training_recipients(p_page integer default 0) returns jsonb
language plpgsql security definer set search_path='' as $$
declare m public.organization_memberships%rowtype; result jsonb; total bigint;
begin
  if not app_private.has_verified_coach_session() or (select count(*) from public.organization_memberships where user_id=auth.uid() and status='ACTIVE')<>1 then raise exception using errcode='P0001',message='FE_FORBIDDEN'; end if;
  select * into m from public.organization_memberships where user_id=auth.uid() and status='ACTIVE' and role in ('COACH','ADMIN');
  if not found then raise exception using errcode='P0001',message='FE_FORBIDDEN'; end if;
  if p_page is null or p_page not between 0 and 10000 then raise exception using errcode='P0001',message='FE_INVALID_TRAINING_PUBLICATION'; end if;
  select count(*) into total from public.clients c where c.organization_id=m.organization_id and app_private.can_publish_training(c.organization_id,c.id);
  select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'name',x.first_name||' '||x.last_name) order by x.last_name,x.first_name,x.id),'[]'::jsonb) into result
    from (select c.id,c.first_name,c.last_name from public.clients c where c.organization_id=m.organization_id and app_private.can_publish_training(c.organization_id,c.id)
      order by c.last_name,c.first_name,c.id limit 20 offset p_page*20) x;
  return jsonb_build_object('clients',result,'total',total,'page',p_page);
end $$;
revoke all on function public.list_training_recipients(integer) from public,anon,authenticated;
grant execute on function public.list_training_recipients(integer) to authenticated;
commit;
