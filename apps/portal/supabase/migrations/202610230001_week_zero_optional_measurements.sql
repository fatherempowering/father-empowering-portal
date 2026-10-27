-- Additive response fields only. No policy, permission, RPC or stored-row changes.
-- CREATE OR REPLACE preserves the existing validator identity and grants.
begin;

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
       - 'rightArmIn' - 'rightThighIn' - 'other'
       - 'leftArmIn' - 'leftCalfIn' - 'rightCalfIn' <> '{}'::jsonb
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

  -- Optional additions: older snapshots and command receipts remain valid.
  foreach v_field in array array['leftArmIn', 'leftCalfIn', 'rightCalfIn'] loop
    if v_measurements ? v_field then
      v_value := v_measurements -> v_field;
      if jsonb_typeof(v_value) is distinct from 'null' and (
        not app_private.week_zero_json_number_valid(v_value, 0, 200)
        or (v_value #>> '{}')::numeric <= 0
      ) then return false; end if;
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
       - 'trainingLevel' - 'totalSeconds' - 'notes' - 'selfAssessment' <> '{}'::jsonb
     or jsonb_typeof(v_cardio -> 'status') is distinct from 'string'
     or not app_private.week_zero_json_text_valid(v_cardio -> 'reason', 500)
     or not app_private.week_zero_json_text_valid(v_cardio -> 'notes', 1000) then
    return false;
  end if;
  if v_cardio ? 'selfAssessment' and jsonb_typeof(v_cardio -> 'selfAssessment') is distinct from 'null' then
    if jsonb_typeof(v_cardio -> 'selfAssessment') is distinct from 'string'
       or v_cardio ->> 'selfAssessment' not in ('EXCELLENT', 'GOOD', 'POOR', 'NONE')
    then return false; end if;
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

commit;
