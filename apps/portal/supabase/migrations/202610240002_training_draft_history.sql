-- Read existing saved snapshots. No public access to idempotency receipts and
-- no change to ownership, role, RLS, publication or version-write rules.
begin;
create index training_program_receipts_program_idx on app_private.training_program_receipts(program_id);

create function public.read_training_program_history(p_program_id uuid,p_version bigint default null,p_page integer default 0)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); m public.organization_memberships%rowtype;
  d public.training_program_drafts%rowtype; result jsonb; total bigint; items jsonb;
begin
  if actor is null then raise exception using errcode='P0001',message='FE_UNAUTHENTICATED'; end if;
  if not app_private.has_verified_coach_session() or (select count(*) from public.organization_memberships where user_id=actor and status='ACTIVE')<>1 then
    raise exception using errcode='P0001',message='FE_FORBIDDEN'; end if;
  select * into m from public.organization_memberships where user_id=actor and status='ACTIVE' and role in ('COACH','ADMIN');
  if not found then raise exception using errcode='P0001',message='FE_FORBIDDEN'; end if;
  if p_page is null or p_page not between 0 and 10000 or (p_version is not null and p_version not between 1 and 9007199254740991) then
    raise exception using errcode='P0001',message='FE_INVALID_TRAINING_DRAFT'; end if;
  select * into d from public.training_program_drafts where id=p_program_id and organization_id=m.organization_id and (created_by=actor or m.role='ADMIN');
  if not found then raise exception using errcode='P0001',message='FE_NOT_FOUND'; end if;
  if p_version is not null then
    if p_version=d.row_version then
      return jsonb_build_object('id',d.id,'version',d.row_version,'document',d.document,'createdBy',d.created_by,'updatedAt',d.updated_at);
    end if;
    select result_snapshot into result from app_private.training_program_receipts
      where program_id=d.id and (result_snapshot->>'version')::bigint=p_version order by created_at desc limit 1;
    if result is null then raise exception using errcode='P0001',message='FE_NOT_FOUND'; end if;
    return result;
  end if;
  with versions as (
    select distinct on(version) version,updated_at from (
      select (result_snapshot->>'version')::bigint version,(result_snapshot->>'updatedAt')::timestamptz updated_at
        from app_private.training_program_receipts where program_id=d.id
      union all select d.row_version,d.updated_at
    ) saved order by version,updated_at desc
  ), page as (select * from versions order by version desc limit 20 offset p_page*20)
  select (select count(*) from versions),coalesce(jsonb_agg(jsonb_build_object('version',version,'updatedAt',updated_at) order by version desc),'[]'::jsonb)
    into total,items from page;
  return jsonb_build_object('items',items,'total',total,'page',p_page,'pageSize',20);
end $$;
revoke all on function public.read_training_program_history(uuid,bigint,integer) from public,anon,authenticated;
grant execute on function public.read_training_program_history(uuid,bigint,integer) to authenticated;
commit;
