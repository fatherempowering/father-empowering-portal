begin;

create type public.week_zero_acquisition_status as enum ('DRAFT', 'SUBMITTED');

create table public.week_zero_acquisitions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  client_id uuid not null,
  kind text not null default 'WEEK_ZERO_ACQUISITION' check (kind = 'WEEK_ZERO_ACQUISITION'),
  schema_version smallint not null default 1 check (schema_version = 1),
  status public.week_zero_acquisition_status not null default 'DRAFT',
  responses jsonb not null check (jsonb_typeof(responses) = 'object'),
  row_version bigint not null default 1 check (row_version > 0),
  last_saved_at timestamptz not null default clock_timestamp(),
  submitted_at timestamptz,
  submitted_by uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint week_zero_acquisitions_organization_client_fkey
    foreign key (organization_id, client_id)
    references public.clients (organization_id, id) on delete restrict,
  constraint week_zero_acquisitions_one_per_client unique (client_id),
  constraint week_zero_acquisitions_submission_consistent check (
    (status = 'DRAFT' and submitted_at is null and submitted_by is null)
    or (status = 'SUBMITTED' and submitted_at is not null and submitted_by is not null)
  )
);

create index week_zero_acquisitions_organization_status_idx
  on public.week_zero_acquisitions (organization_id, status, updated_at desc);

create table app_private.week_zero_acquisition_command_receipts (
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  command text not null check (command in ('SAVE_DRAFT', 'ATTACH_PHOTO', 'SUBMIT')),
  idempotency_key uuid not null,
  request_fingerprint text not null check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  acquisition_id uuid not null references public.week_zero_acquisitions(id) on delete cascade,
  result_version bigint not null check (result_version > 0),
  result_snapshot jsonb not null check (jsonb_typeof(result_snapshot) = 'object'),
  created_at timestamptz not null default clock_timestamp(),
  primary key (actor_user_id, command, idempotency_key)
);

revoke all on table app_private.week_zero_acquisition_command_receipts
  from public, anon, authenticated;

create or replace function app_private.week_zero_json_text_valid(
  p_value jsonb,
  p_max_length integer
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(p_value) in ('null', 'string')
    and (
      jsonb_typeof(p_value) = 'null'
      or char_length(p_value #>> '{}') <= p_max_length
    );
$$;

create or replace function app_private.week_zero_json_number_valid(
  p_value jsonb,
  p_min numeric,
  p_max numeric,
  p_decimals integer default null,
  p_integer boolean default false
)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_number numeric;
begin
  if jsonb_typeof(p_value) is distinct from 'number' then return false; end if;
  v_number := (p_value #>> '{}')::numeric;
  if v_number < p_min or v_number > p_max then return false; end if;
  if p_integer and v_number <> trunc(v_number) then return false; end if;
  if p_decimals is not null and v_number <> round(v_number, p_decimals) then return false; end if;
  return true;
exception when others then return false;
end;
$$;

create or replace function app_private.week_zero_acquisition_responses_valid(
  p_responses jsonb,
  p_require_complete boolean default false
)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_photos jsonb;
  v_measurements jsonb;
  v_loads jsonb;
  v_load jsonb;
  v_cardio jsonb;
  v_mobility jsonb;
  v_value jsonb;
  v_field text;
  v_status text;
  v_mode text;
  v_variant text;
  v_allowed_variants text[];
begin
  if jsonb_typeof(p_responses) is distinct from 'object'
     or not (p_responses ?& array[
       'instructionsAccepted', 'photos', 'measurements', 'loads', 'cardio', 'mobility'
     ])
     or p_responses
       - 'instructionsAccepted' - 'photos' - 'measurements' - 'loads' - 'cardio' - 'mobility'
       <> '{}'::jsonb
     or jsonb_typeof(p_responses -> 'instructionsAccepted') is distinct from 'boolean'
     or (p_require_complete and (p_responses ->> 'instructionsAccepted')::boolean is not true) then
    return false;
  end if;

  v_photos := p_responses -> 'photos';
  if jsonb_typeof(v_photos) is distinct from 'object'
     or not (v_photos ?& array['front', 'side', 'back', 'notes'])
     or v_photos - 'front' - 'side' - 'back' - 'notes' <> '{}'::jsonb
     or not app_private.week_zero_json_text_valid(v_photos -> 'notes', 1000) then
    return false;
  end if;
  foreach v_field in array array['front', 'side', 'back'] loop
    v_value := v_photos -> v_field;
    if jsonb_typeof(v_value) is distinct from 'null'
       and (
         jsonb_typeof(v_value) is distinct from 'string'
         or (v_value #>> '{}') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       ) then
      return false;
    end if;
    if p_require_complete and jsonb_typeof(v_value) is distinct from 'string' then return false; end if;
  end loop;

  v_measurements := p_responses -> 'measurements';
  if jsonb_typeof(v_measurements) is distinct from 'object'
     or not (v_measurements ?& array[
       'bodyWeightLb', 'waistIn', 'chestIn', 'hipsIn', 'rightArmIn', 'rightThighIn', 'other'
     ])
     or v_measurements
       - 'bodyWeightLb' - 'waistIn' - 'chestIn' - 'hipsIn'
       - 'rightArmIn' - 'rightThighIn' - 'other' <> '{}'::jsonb
     or not app_private.week_zero_json_text_valid(v_measurements -> 'other', 1000) then
    return false;
  end if;
  foreach v_field in array array[
    'bodyWeightLb', 'waistIn', 'chestIn', 'hipsIn', 'rightArmIn', 'rightThighIn'
  ] loop
    v_value := v_measurements -> v_field;
    if jsonb_typeof(v_value) is distinct from 'null'
       and (
         not app_private.week_zero_json_number_valid(
           v_value, 0, case when v_field = 'bodyWeightLb' then 1500 else 200 end
         )
         or (v_value #>> '{}')::numeric <= 0
       ) then
      return false;
    end if;
    if p_require_complete and v_field in ('bodyWeightLb', 'waistIn')
       and jsonb_typeof(v_value) is distinct from 'number' then
      return false;
    end if;
  end loop;

  v_loads := p_responses -> 'loads';
  if jsonb_typeof(v_loads) is distinct from 'object'
     or not (v_loads ?& array[
       'squat', 'deadlift', 'horizontalPress', 'verticalPress',
       'cableRow', 'pullUps', 'lunge', 'legPress'
     ])
     or v_loads
       - 'squat' - 'deadlift' - 'horizontalPress' - 'verticalPress'
       - 'cableRow' - 'pullUps' - 'lunge' - 'legPress' <> '{}'::jsonb then
    return false;
  end if;

  foreach v_field in array array[
    'squat', 'deadlift', 'horizontalPress', 'verticalPress',
    'cableRow', 'pullUps', 'lunge', 'legPress'
  ] loop
    v_load := v_loads -> v_field;
    if jsonb_typeof(v_load) is distinct from 'object'
       or not (v_load ?& array[
         'status', 'variant', 'load', 'unit', 'mode', 'reps', 'rir', 'reason', 'note'
       ])
       or v_load
         - 'status' - 'variant' - 'load' - 'unit' - 'mode'
         - 'reps' - 'rir' - 'reason' - 'note' <> '{}'::jsonb
       or jsonb_typeof(v_load -> 'status') is distinct from 'string'
       or not app_private.week_zero_json_text_valid(v_load -> 'variant', 80)
       or (
         jsonb_typeof(v_load -> 'variant') = 'string'
         and regexp_replace(v_load ->> 'variant', '[[:space:]]', '', 'g') = ''
       )
       or not app_private.week_zero_json_text_valid(v_load -> 'reason', 500)
       or not app_private.week_zero_json_text_valid(v_load -> 'note', 1000) then
      return false;
    end if;
    v_status := v_load ->> 'status';
    if v_status not in ('NOT_STARTED', 'DONE', 'NOT_PERFORMED') then return false; end if;

    foreach v_value in array array[v_load -> 'unit', v_load -> 'mode'] loop
      if jsonb_typeof(v_value) not in ('null', 'string') then return false; end if;
    end loop;
    if jsonb_typeof(v_load -> 'unit') = 'string'
       and v_load ->> 'unit' not in ('LB', 'KG') then return false; end if;
    if jsonb_typeof(v_load -> 'mode') = 'string'
       and v_load ->> 'mode' not in ('TOTAL', 'PER_HAND', 'BODYWEIGHT', 'ASSISTED', 'ADDED') then
      return false;
    end if;
    if jsonb_typeof(v_load -> 'load') is distinct from 'null'
       and not app_private.week_zero_json_number_valid(v_load -> 'load', 0.001, 10000, 3) then
      return false;
    end if;
    if jsonb_typeof(v_load -> 'reps') is distinct from 'null'
       and not app_private.week_zero_json_number_valid(v_load -> 'reps', 1, 100, null, true) then
      return false;
    end if;
    if jsonb_typeof(v_load -> 'rir') is distinct from 'null'
       and not app_private.week_zero_json_number_valid(v_load -> 'rir', 0, 10, null, true) then
      return false;
    end if;

    v_variant := case when jsonb_typeof(v_load -> 'variant') = 'string'
      then v_load ->> 'variant' else null end;
    v_mode := case when jsonb_typeof(v_load -> 'mode') = 'string'
      then v_load ->> 'mode' else null end;
    v_allowed_variants := case v_field
      when 'squat' then array['BARBELL_SQUAT', 'DUMBBELL_SQUAT']
      when 'deadlift' then array['BARBELL_DEADLIFT', 'DUMBBELL_DEADLIFT']
      when 'horizontalPress' then array['BENCH_PRESS', 'DUMBBELL_PRESS']
      when 'verticalPress' then array['BARBELL_OVERHEAD_PRESS', 'DUMBBELL_SHOULDER_PRESS']
      when 'cableRow' then array['CABLE_ROW']
      when 'pullUps' then array['PULL_UPS']
      when 'lunge' then array['BODYWEIGHT_LUNGE', 'BARBELL_LUNGE', 'DUMBBELL_LUNGE']
      else array['LEG_PRESS']
    end;

    if v_status = 'NOT_STARTED' then
      if jsonb_typeof(v_load -> 'variant') is distinct from 'null'
         or jsonb_typeof(v_load -> 'load') is distinct from 'null'
         or jsonb_typeof(v_load -> 'unit') is distinct from 'null'
         or jsonb_typeof(v_load -> 'mode') is distinct from 'null'
         or jsonb_typeof(v_load -> 'reps') is distinct from 'null'
         or jsonb_typeof(v_load -> 'rir') is distinct from 'null'
         or jsonb_typeof(v_load -> 'reason') is distinct from 'null'
         or p_require_complete then
        return false;
      end if;
    elsif v_status = 'NOT_PERFORMED' then
      if jsonb_typeof(v_load -> 'variant') is distinct from 'null'
         or jsonb_typeof(v_load -> 'load') is distinct from 'null'
         or jsonb_typeof(v_load -> 'unit') is distinct from 'null'
         or jsonb_typeof(v_load -> 'mode') is distinct from 'null'
         or jsonb_typeof(v_load -> 'reps') is distinct from 'null'
         or jsonb_typeof(v_load -> 'rir') is distinct from 'null'
         or (
           p_require_complete and (
             jsonb_typeof(v_load -> 'reason') is distinct from 'string'
             or regexp_replace(v_load ->> 'reason', '[[:space:]]', '', 'g') = ''
           )
         ) then
        return false;
      end if;
    else
      if jsonb_typeof(v_load -> 'reason') is distinct from 'null'
         or (v_variant is not null and not (v_variant = any(v_allowed_variants)))
         or (
           v_variant is not null and v_mode is not null and not case v_variant
             when 'BARBELL_SQUAT' then v_mode = 'TOTAL'
             when 'DUMBBELL_SQUAT' then v_mode = 'PER_HAND'
             when 'BARBELL_DEADLIFT' then v_mode = 'TOTAL'
             when 'DUMBBELL_DEADLIFT' then v_mode = 'PER_HAND'
             when 'BENCH_PRESS' then v_mode = 'TOTAL'
             when 'DUMBBELL_PRESS' then v_mode = 'PER_HAND'
             when 'BARBELL_OVERHEAD_PRESS' then v_mode = 'TOTAL'
             when 'DUMBBELL_SHOULDER_PRESS' then v_mode = 'PER_HAND'
             when 'CABLE_ROW' then v_mode = 'TOTAL'
             when 'PULL_UPS' then v_mode in ('BODYWEIGHT', 'ASSISTED', 'ADDED')
             when 'BODYWEIGHT_LUNGE' then v_mode = 'BODYWEIGHT'
             when 'BARBELL_LUNGE' then v_mode = 'TOTAL'
             when 'DUMBBELL_LUNGE' then v_mode = 'PER_HAND'
             when 'LEG_PRESS' then v_mode = 'TOTAL'
             else false
           end
         )
         or (
           v_mode = 'BODYWEIGHT'
           and (
             jsonb_typeof(v_load -> 'load') is distinct from 'null'
             or jsonb_typeof(v_load -> 'unit') is distinct from 'null'
           )
         ) then
        return false;
      end if;
      if p_require_complete and (
        v_variant is null
        or v_mode is null
        or jsonb_typeof(v_load -> 'reps') is distinct from 'number'
        or (
          v_mode <> 'BODYWEIGHT'
          and (
            jsonb_typeof(v_load -> 'load') is distinct from 'number'
            or jsonb_typeof(v_load -> 'unit') is distinct from 'string'
          )
        )
      ) then return false; end if;
    end if;
  end loop;

  v_cardio := p_responses -> 'cardio';
  if jsonb_typeof(v_cardio) is distinct from 'object'
     or not (v_cardio ?& array[
       'status', 'reason', 'age', 'weightKg', 'sex', 'trainingLevel', 'totalSeconds', 'notes'
     ])
     or v_cardio
       - 'status' - 'reason' - 'age' - 'weightKg' - 'sex'
       - 'trainingLevel' - 'totalSeconds' - 'notes' <> '{}'::jsonb
     or jsonb_typeof(v_cardio -> 'status') is distinct from 'string'
     or not app_private.week_zero_json_text_valid(v_cardio -> 'reason', 500)
     or not app_private.week_zero_json_text_valid(v_cardio -> 'notes', 1000) then
    return false;
  end if;
  v_status := v_cardio ->> 'status';
  if v_status not in ('NOT_STARTED', 'DONE', 'NOT_PERFORMED') then return false; end if;
  if jsonb_typeof(v_cardio -> 'age') is distinct from 'null'
     and not app_private.week_zero_json_number_valid(v_cardio -> 'age', 16, 100, null, true) then return false; end if;
  if jsonb_typeof(v_cardio -> 'weightKg') is distinct from 'null'
     and not app_private.week_zero_json_number_valid(v_cardio -> 'weightKg', 31.75, 317.52, 3) then return false; end if;
  if jsonb_typeof(v_cardio -> 'totalSeconds') is distinct from 'null'
     and not app_private.week_zero_json_number_valid(v_cardio -> 'totalSeconds', 240, 1200, 1) then return false; end if;
  foreach v_field in array array['sex', 'trainingLevel'] loop
    if jsonb_typeof(v_cardio -> v_field) not in ('null', 'string') then return false; end if;
  end loop;
  if jsonb_typeof(v_cardio -> 'sex') = 'string'
     and v_cardio ->> 'sex' not in ('MALE', 'FEMALE') then return false; end if;
  if jsonb_typeof(v_cardio -> 'trainingLevel') = 'string'
     and v_cardio ->> 'trainingLevel' not in ('HIGHLY_TRAINED', 'NOT_HIGHLY_TRAINED') then return false; end if;

  if v_status = 'NOT_STARTED' then
    if p_require_complete
       or jsonb_typeof(v_cardio -> 'reason') is distinct from 'null'
       or jsonb_typeof(v_cardio -> 'age') is distinct from 'null'
       or jsonb_typeof(v_cardio -> 'weightKg') is distinct from 'null'
       or jsonb_typeof(v_cardio -> 'sex') is distinct from 'null'
       or jsonb_typeof(v_cardio -> 'trainingLevel') is distinct from 'null'
       or jsonb_typeof(v_cardio -> 'totalSeconds') is distinct from 'null' then return false; end if;
  elsif v_status = 'NOT_PERFORMED' then
    if jsonb_typeof(v_cardio -> 'age') is distinct from 'null'
       or jsonb_typeof(v_cardio -> 'weightKg') is distinct from 'null'
       or jsonb_typeof(v_cardio -> 'sex') is distinct from 'null'
       or jsonb_typeof(v_cardio -> 'trainingLevel') is distinct from 'null'
       or jsonb_typeof(v_cardio -> 'totalSeconds') is distinct from 'null'
       or (
         p_require_complete and (
           jsonb_typeof(v_cardio -> 'reason') is distinct from 'string'
           or regexp_replace(v_cardio ->> 'reason', '[[:space:]]', '', 'g') = ''
         )
       ) then return false; end if;
  else
    if jsonb_typeof(v_cardio -> 'reason') is distinct from 'null' then return false; end if;
    if p_require_complete and (
      jsonb_typeof(v_cardio -> 'age') is distinct from 'number'
      or jsonb_typeof(v_cardio -> 'weightKg') is distinct from 'number'
      or jsonb_typeof(v_cardio -> 'sex') is distinct from 'string'
      or jsonb_typeof(v_cardio -> 'trainingLevel') is distinct from 'string'
      or jsonb_typeof(v_cardio -> 'totalSeconds') is distinct from 'number'
    ) then return false; end if;
  end if;

  v_mobility := p_responses -> 'mobility';
  if jsonb_typeof(v_mobility) is distinct from 'object'
     or not (v_mobility ?& array[
       'painSquat', 'painHinge', 'painPush', 'painPull', 'painCardio',
       'limitedMovement', 'comfortableMovement', 'tightArea'
     ])
     or v_mobility
       - 'painSquat' - 'painHinge' - 'painPush' - 'painPull' - 'painCardio'
       - 'limitedMovement' - 'comfortableMovement' - 'tightArea' <> '{}'::jsonb then
    return false;
  end if;
  foreach v_field in array array[
    'painSquat', 'painHinge', 'painPush', 'painPull', 'painCardio'
  ] loop
    if jsonb_typeof(v_mobility -> v_field) is distinct from 'string'
       or v_mobility ->> v_field not in ('NOT_ASSESSED', 'NO', 'YES', 'NOT_PERFORMED')
       or (p_require_complete and v_mobility ->> v_field = 'NOT_ASSESSED') then return false; end if;
  end loop;
  foreach v_field in array array['limitedMovement', 'comfortableMovement', 'tightArea'] loop
    v_value := v_mobility -> v_field;
    if not app_private.week_zero_json_text_valid(v_value, 1000)
       or (
         p_require_complete
         and (
           jsonb_typeof(v_value) is distinct from 'string'
           or regexp_replace(v_value #>> '{}', '[[:space:]]', '', 'g') = ''
         )
       ) then return false; end if;
  end loop;

  return true;
exception when others then return false;
end;
$$;

revoke all on function app_private.week_zero_json_text_valid(jsonb, integer)
  from public, anon, authenticated;
revoke all on function app_private.week_zero_json_number_valid(jsonb, numeric, numeric, integer, boolean)
  from public, anon, authenticated;
revoke all on function app_private.week_zero_acquisition_responses_valid(jsonb, boolean)
  from public, anon, authenticated;

alter table public.week_zero_acquisitions
  add constraint week_zero_acquisitions_responses_valid
  check (app_private.week_zero_acquisition_responses_valid(responses, false));

create or replace function app_private.week_zero_acquisition_snapshot(
  p_acquisition public.week_zero_acquisitions
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'kind', p_acquisition.kind,
    'schemaVersion', p_acquisition.schema_version,
    'status', p_acquisition.status,
    'version', p_acquisition.row_version,
    'responses', p_acquisition.responses,
    'updatedAt', p_acquisition.updated_at,
    'submittedAt', p_acquisition.submitted_at
  );
$$;

revoke all on function app_private.week_zero_acquisition_snapshot(public.week_zero_acquisitions)
  from public, anon, authenticated;

create or replace function app_private.week_zero_actor_unambiguous()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and (
    select count(*)
    from public.organization_memberships membership
    where membership.user_id = auth.uid()
      and membership.status = 'ACTIVE'
  ) = 1;
$$;

revoke all on function app_private.week_zero_actor_unambiguous()
  from public, anon, authenticated;
grant execute on function app_private.week_zero_actor_unambiguous() to authenticated;

alter table public.week_zero_acquisitions enable row level security;
alter table public.week_zero_acquisitions force row level security;
revoke all on table public.week_zero_acquisitions from anon, authenticated;
grant select on table public.week_zero_acquisitions to authenticated;

create policy week_zero_acquisitions_select_authorized
on public.week_zero_acquisitions for select to authenticated
using (
  app_private.week_zero_actor_unambiguous()
  and (
    app_private.has_own_client_access(organization_id, client_id)
    or (
      status = 'SUBMITTED'
      and (
        app_private.has_org_role(organization_id, array['ADMIN']::public.app_role[])
        or app_private.is_assigned_coach(organization_id, client_id)
      )
    )
  )
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'week-zero-photos',
  'week-zero-photos',
  false,
  4194304,
  array['image/jpeg', 'image/png', 'image/webp']
);

create or replace function app_private.week_zero_photo_path_parts(p_name text)
returns text[]
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_parts text[];
begin
  v_parts := pg_catalog.string_to_array(p_name, '/');
  if pg_catalog.array_length(v_parts, 1) <> 4
     or v_parts[1] !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or v_parts[2] !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or v_parts[3] not in ('front', 'side', 'back')
     or v_parts[4] !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return null;
  end if;
  return v_parts;
end;
$$;

create or replace function app_private.can_read_week_zero_photo(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_parts text[] := app_private.week_zero_photo_path_parts(p_name);
  v_organization_id uuid;
  v_client_id uuid;
  v_slot text;
  v_asset_id text;
begin
  if v_parts is null then return false; end if;
  v_organization_id := v_parts[1]::uuid;
  v_client_id := v_parts[2]::uuid;
  v_slot := v_parts[3];
  v_asset_id := v_parts[4];
  return app_private.week_zero_actor_unambiguous() and exists (
    select 1
    from public.week_zero_acquisitions acquisition
    where acquisition.organization_id = v_organization_id
      and acquisition.client_id = v_client_id
      and (
        (
          app_private.has_own_client_access(v_organization_id, v_client_id)
          and (
            acquisition.status = 'DRAFT'
            or acquisition.responses #>> array['photos', v_slot] = v_asset_id
          )
        )
        or (
          acquisition.status = 'SUBMITTED'
          and acquisition.responses #>> array['photos', v_slot] = v_asset_id
          and (
            app_private.has_org_role(
              v_organization_id,
              array['ADMIN']::public.app_role[]
            )
            or app_private.is_assigned_coach(v_organization_id, v_client_id)
          )
        )
      )
  );
exception when others then return false;
end;
$$;

revoke all on function app_private.week_zero_photo_path_parts(text)
  from public, anon, authenticated;
revoke all on function app_private.can_read_week_zero_photo(text)
  from public, anon, authenticated;
grant execute on function app_private.can_read_week_zero_photo(text) to authenticated;

create policy week_zero_photos_authorized_select
on storage.objects for select to authenticated
using (
  bucket_id = 'week-zero-photos'
  and app_private.can_read_week_zero_photo(name)
);

create or replace function public.save_own_week_zero_acquisition(
  p_responses jsonb,
  p_expected_version bigint,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_client public.clients%rowtype;
  v_acquisition public.week_zero_acquisitions%rowtype;
  v_receipt app_private.week_zero_acquisition_command_receipts%rowtype;
  v_fingerprint text;
  v_snapshot jsonb;
  v_slot text;
begin
  if v_actor_id is null then
    raise exception using errcode = 'P0001', message = 'FE_UNAUTHENTICATED';
  end if;
  if not app_private.week_zero_actor_unambiguous() then
    raise exception using errcode = 'P0001', message = 'FE_FORBIDDEN';
  end if;
  if p_expected_version is null or p_expected_version < 0 or p_idempotency_key is null then
    raise exception using errcode = 'P0001', message = 'FE_INVALID_INPUT';
  end if;
  if pg_catalog.octet_length(p_responses::text) > 65536
     or not app_private.week_zero_acquisition_responses_valid(p_responses, false) then
    raise exception using errcode = 'P0001', message = 'FE_INVALID_WEEK_ZERO_ACQUISITION';
  end if;

  select client.* into strict v_client
  from public.clients client
  where client.auth_user_id = v_actor_id
    and client.status = 'ACTIVE'
    and app_private.has_own_client_access(client.organization_id, client.id);

  v_fingerprint := encode(extensions.digest(convert_to(jsonb_build_object(
    'command', 'SAVE_DRAFT', 'schemaVersion', 1,
    'organizationId', v_client.organization_id, 'clientId', v_client.id,
    'expectedVersion', p_expected_version, 'responses', p_responses
  )::text, 'UTF8'), 'sha256'), 'hex');

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    concat_ws(':', 'week-zero-acquisition', v_actor_id::text, 'SAVE_DRAFT', p_idempotency_key::text), 0
  ));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    concat_ws(':', 'week-zero-acquisition-client', v_client.id::text), 0
  ));

  select receipt.* into v_receipt
  from app_private.week_zero_acquisition_command_receipts receipt
  where receipt.actor_user_id = v_actor_id
    and receipt.command = 'SAVE_DRAFT'
    and receipt.idempotency_key = p_idempotency_key;
  if found then
    if v_receipt.request_fingerprint <> v_fingerprint then
      raise exception using errcode = 'P0001', message = 'FE_IDEMPOTENCY_CONFLICT';
    end if;
    return v_receipt.result_snapshot;
  end if;

  select acquisition.* into v_acquisition
  from public.week_zero_acquisitions acquisition
  where acquisition.client_id = v_client.id
  for update;

  if not found then
    if p_expected_version <> 0 then
      raise exception using errcode = 'P0001', message = 'FE_VERSION_CONFLICT';
    end if;
    foreach v_slot in array array['front', 'side', 'back'] loop
      if jsonb_typeof(p_responses #> array['photos', v_slot]) is distinct from 'null' then
        raise exception using errcode = 'P0001', message = 'FE_INVALID_WEEK_ZERO_PHOTO';
      end if;
    end loop;
    insert into public.week_zero_acquisitions (organization_id, client_id, responses)
    values (v_client.organization_id, v_client.id, p_responses)
    returning * into v_acquisition;
  else
    if v_acquisition.status = 'SUBMITTED' then
      raise exception using errcode = 'P0001', message = 'FE_WEEK_ZERO_ACQUISITION_SUBMITTED';
    end if;
    if v_acquisition.row_version <> p_expected_version then
      raise exception using errcode = 'P0001', message = 'FE_VERSION_CONFLICT';
    end if;
    foreach v_slot in array array['front', 'side', 'back'] loop
      if p_responses #> array['photos', v_slot]
         is distinct from v_acquisition.responses #> array['photos', v_slot] then
        raise exception using errcode = 'P0001', message = 'FE_INVALID_WEEK_ZERO_PHOTO';
      end if;
    end loop;
    update public.week_zero_acquisitions acquisition
    set responses = p_responses,
        row_version = acquisition.row_version + 1,
        last_saved_at = clock_timestamp(),
        updated_at = clock_timestamp()
    where acquisition.id = v_acquisition.id
    returning acquisition.* into v_acquisition;
  end if;

  v_snapshot := app_private.week_zero_acquisition_snapshot(v_acquisition);
  insert into app_private.week_zero_acquisition_command_receipts (
    actor_user_id, command, idempotency_key, request_fingerprint,
    acquisition_id, result_version, result_snapshot
  ) values (
    v_actor_id, 'SAVE_DRAFT', p_idempotency_key, v_fingerprint,
    v_acquisition.id, v_acquisition.row_version, v_snapshot
  );
  return v_snapshot;
exception
  when no_data_found or too_many_rows then
    raise exception using errcode = 'P0001', message = 'FE_FORBIDDEN';
end;
$$;

create or replace function public.attach_own_week_zero_photo(
  p_slot text,
  p_asset_id uuid,
  p_expected_version bigint,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_role public.app_role;
  v_client public.clients%rowtype;
  v_acquisition public.week_zero_acquisitions%rowtype;
  v_receipt app_private.week_zero_acquisition_command_receipts%rowtype;
  v_fingerprint text;
  v_snapshot jsonb;
  v_object_name text;
begin
  if v_actor_id is null then
    raise exception using errcode = 'P0001', message = 'FE_UNAUTHENTICATED';
  end if;
  if not app_private.week_zero_actor_unambiguous() then
    raise exception using errcode = 'P0001', message = 'FE_FORBIDDEN';
  end if;
  if p_slot not in ('front', 'side', 'back')
     or p_asset_id is null or p_expected_version is null or p_expected_version < 1
     or p_idempotency_key is null then
    raise exception using errcode = 'P0001', message = 'FE_INVALID_INPUT';
  end if;

  select client.* into strict v_client
  from public.clients client
  where client.auth_user_id = v_actor_id
    and client.status = 'ACTIVE'
    and app_private.has_own_client_access(client.organization_id, client.id);
  select membership.role into strict v_actor_role
  from public.organization_memberships membership
  where membership.organization_id = v_client.organization_id
    and membership.user_id = v_actor_id
    and membership.status = 'ACTIVE';

  v_object_name := concat_ws(
    '/', v_client.organization_id::text, v_client.id::text, p_slot, p_asset_id::text
  );
  v_fingerprint := encode(extensions.digest(convert_to(jsonb_build_object(
    'command', 'ATTACH_PHOTO', 'schemaVersion', 1,
    'organizationId', v_client.organization_id, 'clientId', v_client.id,
    'slot', p_slot, 'assetId', p_asset_id, 'expectedVersion', p_expected_version
  )::text, 'UTF8'), 'sha256'), 'hex');

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    concat_ws(':', 'week-zero-acquisition', v_actor_id::text, 'ATTACH_PHOTO', p_idempotency_key::text), 0
  ));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    concat_ws(':', 'week-zero-acquisition-client', v_client.id::text), 0
  ));

  select receipt.* into v_receipt
  from app_private.week_zero_acquisition_command_receipts receipt
  where receipt.actor_user_id = v_actor_id
    and receipt.command = 'ATTACH_PHOTO'
    and receipt.idempotency_key = p_idempotency_key;
  if found then
    if v_receipt.request_fingerprint <> v_fingerprint then
      raise exception using errcode = 'P0001', message = 'FE_IDEMPOTENCY_CONFLICT';
    end if;
    return v_receipt.result_snapshot;
  end if;

  select acquisition.* into v_acquisition
  from public.week_zero_acquisitions acquisition
  where acquisition.client_id = v_client.id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'FE_WEEK_ZERO_ACQUISITION_INCOMPLETE';
  end if;
  if v_acquisition.status = 'SUBMITTED' then
    raise exception using errcode = 'P0001', message = 'FE_WEEK_ZERO_ACQUISITION_SUBMITTED';
  end if;
  if v_acquisition.row_version <> p_expected_version then
    raise exception using errcode = 'P0001', message = 'FE_VERSION_CONFLICT';
  end if;
  if not exists (
    select 1
    from storage.objects object
    where object.bucket_id = 'week-zero-photos'
      and object.name = v_object_name
      and lower(coalesce(object.metadata ->> 'mimetype', '')) in (
        'image/jpeg', 'image/png', 'image/webp'
      )
      and coalesce((object.metadata ->> 'size')::bigint, 0) between 1 and 4194304
  ) then
    raise exception using errcode = 'P0001', message = 'FE_WEEK_ZERO_PHOTO_NOT_FOUND';
  end if;

  update public.week_zero_acquisitions acquisition
  set responses = jsonb_set(
        acquisition.responses,
        array['photos', p_slot],
        to_jsonb(p_asset_id::text),
        false
      ),
      row_version = acquisition.row_version + 1,
      last_saved_at = clock_timestamp(),
      updated_at = clock_timestamp()
  where acquisition.id = v_acquisition.id
  returning acquisition.* into v_acquisition;

  insert into public.audit_events (
    organization_id, actor_user_id, actor_role, command, entity_type, entity_id,
    entity_version, result, correlation_id, context
  ) values (
    v_client.organization_id, v_actor_id, v_actor_role,
    'AttachWeekZeroPhoto', 'week_zero_acquisition', v_acquisition.id,
    v_acquisition.row_version, 'SUCCEEDED', p_idempotency_key,
    jsonb_build_object('kind', 'WEEK_ZERO_ACQUISITION', 'schemaVersion', 1, 'slot', p_slot)
      || case
           when v_actor_role = 'CLIENT' then '{}'::jsonb
           else jsonb_build_object('surface', 'STAFF_SELF_CLIENT')
         end
  );

  v_snapshot := app_private.week_zero_acquisition_snapshot(v_acquisition);
  insert into app_private.week_zero_acquisition_command_receipts (
    actor_user_id, command, idempotency_key, request_fingerprint,
    acquisition_id, result_version, result_snapshot
  ) values (
    v_actor_id, 'ATTACH_PHOTO', p_idempotency_key, v_fingerprint,
    v_acquisition.id, v_acquisition.row_version, v_snapshot
  );
  return v_snapshot;
exception
  when no_data_found or too_many_rows then
    raise exception using errcode = 'P0001', message = 'FE_FORBIDDEN';
  when invalid_text_representation then
    raise exception using errcode = 'P0001', message = 'FE_WEEK_ZERO_PHOTO_NOT_FOUND';
end;
$$;

create or replace function public.submit_own_week_zero_acquisition(
  p_expected_version bigint,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_role public.app_role;
  v_client public.clients%rowtype;
  v_acquisition public.week_zero_acquisitions%rowtype;
  v_receipt app_private.week_zero_acquisition_command_receipts%rowtype;
  v_fingerprint text;
  v_snapshot jsonb;
  v_slot text;
  v_asset_id text;
  v_object_name text;
begin
  if v_actor_id is null then
    raise exception using errcode = 'P0001', message = 'FE_UNAUTHENTICATED';
  end if;
  if not app_private.week_zero_actor_unambiguous() then
    raise exception using errcode = 'P0001', message = 'FE_FORBIDDEN';
  end if;
  if p_expected_version is null or p_expected_version < 1 or p_idempotency_key is null then
    raise exception using errcode = 'P0001', message = 'FE_INVALID_INPUT';
  end if;

  select client.* into strict v_client
  from public.clients client
  where client.auth_user_id = v_actor_id
    and client.status = 'ACTIVE'
    and app_private.has_own_client_access(client.organization_id, client.id);
  select membership.role into strict v_actor_role
  from public.organization_memberships membership
  where membership.organization_id = v_client.organization_id
    and membership.user_id = v_actor_id
    and membership.status = 'ACTIVE';

  v_fingerprint := encode(extensions.digest(convert_to(jsonb_build_object(
    'command', 'SUBMIT', 'schemaVersion', 1,
    'organizationId', v_client.organization_id, 'clientId', v_client.id,
    'expectedVersion', p_expected_version
  )::text, 'UTF8'), 'sha256'), 'hex');

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    concat_ws(':', 'week-zero-acquisition', v_actor_id::text, 'SUBMIT', p_idempotency_key::text), 0
  ));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    concat_ws(':', 'week-zero-acquisition-client', v_client.id::text), 0
  ));

  select receipt.* into v_receipt
  from app_private.week_zero_acquisition_command_receipts receipt
  where receipt.actor_user_id = v_actor_id
    and receipt.command = 'SUBMIT'
    and receipt.idempotency_key = p_idempotency_key;
  if found then
    if v_receipt.request_fingerprint <> v_fingerprint then
      raise exception using errcode = 'P0001', message = 'FE_IDEMPOTENCY_CONFLICT';
    end if;
    return v_receipt.result_snapshot;
  end if;

  select acquisition.* into v_acquisition
  from public.week_zero_acquisitions acquisition
  where acquisition.client_id = v_client.id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'FE_WEEK_ZERO_ACQUISITION_INCOMPLETE';
  end if;
  if v_acquisition.status = 'SUBMITTED' then
    raise exception using errcode = 'P0001', message = 'FE_WEEK_ZERO_ACQUISITION_SUBMITTED';
  end if;
  if v_acquisition.row_version <> p_expected_version then
    raise exception using errcode = 'P0001', message = 'FE_VERSION_CONFLICT';
  end if;
  if not app_private.week_zero_acquisition_responses_valid(v_acquisition.responses, true) then
    raise exception using errcode = 'P0001', message = 'FE_WEEK_ZERO_ACQUISITION_INCOMPLETE';
  end if;

  foreach v_slot in array array['front', 'side', 'back'] loop
    v_asset_id := v_acquisition.responses #>> array['photos', v_slot];
    v_object_name := concat_ws(
      '/', v_client.organization_id::text, v_client.id::text, v_slot, v_asset_id
    );
    if not exists (
      select 1
      from storage.objects object
      where object.bucket_id = 'week-zero-photos'
        and object.name = v_object_name
        and lower(coalesce(object.metadata ->> 'mimetype', '')) in (
          'image/jpeg', 'image/png', 'image/webp'
        )
        and coalesce((object.metadata ->> 'size')::bigint, 0) between 1 and 4194304
    ) then
      raise exception using errcode = 'P0001', message = 'FE_WEEK_ZERO_PHOTO_NOT_FOUND';
    end if;
  end loop;

  update public.week_zero_acquisitions acquisition
  set status = 'SUBMITTED',
      row_version = acquisition.row_version + 1,
      submitted_at = clock_timestamp(),
      submitted_by = v_actor_id,
      updated_at = clock_timestamp()
  where acquisition.id = v_acquisition.id
  returning acquisition.* into v_acquisition;

  insert into public.audit_events (
    organization_id, actor_user_id, actor_role, command, entity_type, entity_id,
    entity_version, result, correlation_id, context
  ) values (
    v_client.organization_id, v_actor_id, v_actor_role,
    'SubmitWeekZeroAcquisition', 'week_zero_acquisition', v_acquisition.id,
    v_acquisition.row_version, 'SUCCEEDED', p_idempotency_key,
    jsonb_build_object('kind', 'WEEK_ZERO_ACQUISITION', 'schemaVersion', 1)
      || case
           when v_actor_role = 'CLIENT' then '{}'::jsonb
           else jsonb_build_object('surface', 'STAFF_SELF_CLIENT')
         end
  );

  v_snapshot := app_private.week_zero_acquisition_snapshot(v_acquisition);
  insert into app_private.week_zero_acquisition_command_receipts (
    actor_user_id, command, idempotency_key, request_fingerprint,
    acquisition_id, result_version, result_snapshot
  ) values (
    v_actor_id, 'SUBMIT', p_idempotency_key, v_fingerprint,
    v_acquisition.id, v_acquisition.row_version, v_snapshot
  );
  return v_snapshot;
exception
  when no_data_found or too_many_rows then
    raise exception using errcode = 'P0001', message = 'FE_FORBIDDEN';
  when invalid_text_representation then
    raise exception using errcode = 'P0001', message = 'FE_WEEK_ZERO_PHOTO_NOT_FOUND';
end;
$$;

revoke all on function public.save_own_week_zero_acquisition(jsonb, bigint, uuid)
  from public, anon, authenticated;
revoke all on function public.attach_own_week_zero_photo(text, uuid, bigint, uuid)
  from public, anon, authenticated;
revoke all on function public.submit_own_week_zero_acquisition(bigint, uuid)
  from public, anon, authenticated;
grant execute on function public.save_own_week_zero_acquisition(jsonb, bigint, uuid)
  to authenticated;
grant execute on function public.attach_own_week_zero_photo(text, uuid, bigint, uuid)
  to authenticated;
grant execute on function public.submit_own_week_zero_acquisition(bigint, uuid)
  to authenticated;

commit;
