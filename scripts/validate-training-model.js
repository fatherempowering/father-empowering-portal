const SESSION_TYPES = new Set(['training', 'active-recovery', 'complete-rest', 'posing', 'mobility']);
const SCHEDULE_MODES = new Set(['fixed', 'suggested', 'flexible']);
const RESULT_FIELDS = new Set(['load', 'reps', 'rir']);
const TRAINING_UNITS = new Set(['lb', 'min', 'sec', 'distance', 'level']);

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function duplicateItems(values) {
  const seen = new Set();
  const duplicates = new Set();
  values.forEach((value) => {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  });
  return [...duplicates];
}

function stableId(value) {
  return /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/.test(String(value || ''));
}

function validateTrainingModel(data, options = {}) {
  const errors = [];
  const warnings = [];
  const infos = [];
  const allowEmptyWeeks = options.allowEmptyWeeks !== false;
  const allowLegacy = options.allowLegacy === true;
  const training = data && data.training;

  if (!data || data.schemaVersion !== 1) errors.push('schemaVersion must be 1.');
  if (!data || !String(data.programVersion || '').trim()) errors.push('programVersion is required.');
  if (!data || !String(data.updatedAt || '').trim()) errors.push('updatedAt is required.');
  if (!isObject(training)) return { errors: errors.concat('training object is required.'), warnings, infos };
  ['results', 'actuals', 'history', 'completedSets'].forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(training, field)) errors.push(`training.${field} is client result data and must not appear in the prescription.`);
  });
  if (Object.prototype.hasOwnProperty.call(data, 'totalWeeks') || Object.prototype.hasOwnProperty.call(training, 'totalWeeks')) {
    errors.push('totalWeeks must not be declared; it is derived from training.weeks.length.');
  }

  const phase = training.phase;
  if (!isObject(phase)) errors.push('training.phase is required.');
  else {
    if (!stableId(phase.id) || String(phase.id).includes('_')) errors.push('training.phase.id must use lowercase kebab-case.');
    if (!String(phase.label || '').trim()) errors.push('training.phase.label is required.');
    if (!Number.isInteger(phase.order) || phase.order < 1) errors.push('training.phase.order must be a positive integer.');
  }

  const progression = training.progression;
  if (!isObject(progression)) (allowLegacy ? warnings : errors).push('training.progression is required.');
  else {
    if (progression.mode !== 'coach-confirmed') errors.push('training.progression.mode must be "coach-confirmed".');
    if (progression.clientConfirmationRequired !== true) errors.push('training.progression.clientConfirmationRequired must be true.');
  }

  const tracking = training.resultTracking;
  if (!isObject(tracking)) (allowLegacy ? warnings : errors).push('training.resultTracking is required.');
  else {
    if (tracking.scope !== 'per-set') errors.push('training.resultTracking.scope must be "per-set".');
    const fields = Array.isArray(tracking.perSetFields) ? tracking.perSetFields : [];
    ['load', 'reps', 'rir'].forEach((field) => {
      if (!fields.includes(field)) errors.push(`training.resultTracking.perSetFields must include "${field}".`);
    });
    fields.filter((field) => !RESULT_FIELDS.has(field)).forEach((field) => (allowLegacy ? warnings : errors).push(`Unknown result field "${field}" is not part of the official model.`));
  }

  const legacyIds = Array.isArray(training.sessionIds) ? training.sessionIds : [];
  const catalog = Array.isArray(training.sessionCatalog) && training.sessionCatalog.length
    ? training.sessionCatalog
    : (allowLegacy ? legacyIds.map((id, index) => ({ id, label: String(id).toUpperCase(), title: String(id).toUpperCase(), type: 'training', required: true, schedule: { mode: 'flexible' }, order: index + 1 })) : []);
  if (!catalog.length) errors.push('training.sessionCatalog must contain at least one session.');
  if (!Array.isArray(training.sessionCatalog) && legacyIds.length && allowLegacy) warnings.push('training.sessionIds is legacy; use training.sessionCatalog.');
  const catalogIds = catalog.map((session) => session && session.id).filter(Boolean);
  if (catalogIds.length !== catalog.length) errors.push('Every sessionCatalog item needs an id.');
  duplicateItems(catalogIds).forEach((id) => errors.push(`Duplicate session id "${id}".`));
  catalog.forEach((session, index) => {
    const label = `sessionCatalog[${index}]`;
    if (!isObject(session)) return errors.push(`${label} must be an object.`);
    if (!stableId(session.id)) errors.push(`${label}.id must be a stable lowercase identifier.`);
    if (!String(session.label || '').trim()) errors.push(`${label}.label is required.`);
    if (!String(session.title || '').trim()) errors.push(`${label}.title is required.`);
    if (!SESSION_TYPES.has(session.type)) (allowLegacy ? warnings : errors).push(`${label}.type is invalid.`);
    if (typeof session.required !== 'boolean') (allowLegacy ? warnings : errors).push(`${label}.required must be true or false.`);
    if (!isObject(session.schedule) || !SCHEDULE_MODES.has(session.schedule.mode)) (allowLegacy ? warnings : errors).push(`${label}.schedule.mode must be fixed, suggested or flexible.`);
    if (session.schedule && session.schedule.mode === 'flexible' && session.schedule.suggestedDay) errors.push(`${label}: a flexible session cannot impose suggestedDay.`);
  });

  const weeks = Array.isArray(training.weeks) ? training.weeks : [];
  if (!weeks.length && !allowEmptyWeeks) errors.push('training.weeks cannot be empty for a publishable program.');
  if (!weeks.length && allowEmptyWeeks) warnings.push('training.weeks is empty; valid only during onboarding.');
  const numbers = weeks.map((week) => week && week.week).filter((week) => week != null);
  duplicateItems(numbers).forEach((week) => errors.push(`Duplicate week number "${week}".`));
  numbers.forEach((week, index) => { if (week !== index + 1) errors.push('Weeks must be sequential and start at 1.'); });

  const exerciseKeys = new Map();
  weeks.forEach((week, weekIndex) => {
    const weekLabel = `week[${weekIndex}]`;
    if (!isObject(week)) return errors.push(`${weekLabel} must be an object.`);
    if (!Number.isInteger(week.week) || week.week < 1) errors.push(`${weekLabel}.week must be a positive integer.`);
    if (!Number.isInteger(week.targetRir) || week.targetRir < 0 || week.targetRir > 5) (allowLegacy ? warnings : errors).push(`${weekLabel}.targetRir must be an integer from 0 to 5.`);
    if (!isObject(week.sessions)) return errors.push(`${weekLabel}.sessions is required.`);
    Object.entries(week.sessions).forEach(([sessionId, session]) => {
      const sessionLabel = `${weekLabel}.sessions.${sessionId}`;
      if (!catalogIds.includes(sessionId)) errors.push(`${sessionLabel} is missing from sessionCatalog.`);
      if (!isObject(session)) return errors.push(`${sessionLabel} must be an object.`);
      const usesLegacyBlocks = Array.isArray(session.blocs) || (Array.isArray(session.blocks) && session.blocks.some((block) => block && block.exs));
      if (usesLegacyBlocks) {
        const message = `${sessionLabel} uses legacy blocs/exs names; use blocks/exercises.`;
        if (allowLegacy) warnings.push(message); else errors.push(message);
      }
      const blocks = Array.isArray(session.blocks) ? session.blocks : (allowLegacy && Array.isArray(session.blocs) ? session.blocs : []);
      blocks.forEach((block, blockIndex) => {
        const blockLabel = `${sessionLabel}.blocks[${blockIndex}]`;
        if (!isObject(block)) return errors.push(`${blockLabel} must be an object.`);
        if (!String(block.label || '').trim()) errors.push(`${blockLabel}.label is required.`);
        const exercises = Array.isArray(block.exercises) ? block.exercises : (allowLegacy && Array.isArray(block.exs) ? block.exs : []);
        exercises.forEach((exercise, exerciseIndex) => {
          const exerciseLabel = `${blockLabel}.exercises[${exerciseIndex}]`;
          if (!isObject(exercise)) return errors.push(`${exerciseLabel} must be an object.`);
          if (!stableId(exercise.key)) errors.push(`${exerciseLabel}.key must be a stable lowercase identifier.`);
          if (exerciseKeys.has(exercise.key) && exerciseKeys.get(exercise.key) !== exercise.name) errors.push(`Exercise key "${exercise.key}" refers to more than one exercise name.`);
          exerciseKeys.set(exercise.key, exercise.name);
          if (!String(exercise.name || '').trim()) errors.push(`${exerciseLabel}.name is required.`);
          const cue=String(exercise.cue||exercise.note||'').trim();
          if(cue.length>80)(allowLegacy?warnings:errors).push(`${exerciseLabel}.cue must remain 80 characters or fewer for mobile readability.`);
          ['results', 'actuals', 'completedSets', 'actualLoad', 'actualReps', 'actualRir', 'painResult'].forEach((field) => {
            if (Object.prototype.hasOwnProperty.call(exercise, field)) errors.push(`${exerciseLabel}.${field} is a result and must not appear in training-program.json.`);
          });
          const prescription = isObject(exercise.prescription) ? exercise.prescription : (allowLegacy ? exercise : null);
          if (!isObject(prescription)) return errors.push(`${exerciseLabel}.prescription is required.`);
          if (!isObject(exercise.prescription) && allowLegacy) warnings.push(`${exerciseLabel} uses legacy flat prescription fields.`);
          if (!(Number.isInteger(prescription.sets) && prescription.sets > 0)) errors.push(`${exerciseLabel}.prescription.sets must be a positive integer.`);
          if (!String(prescription.reps || '').trim()) errors.push(`${exerciseLabel}.prescription.reps is required.`);
          if (prescription.targetRir != null && !(Number.isInteger(prescription.targetRir) && prescription.targetRir >= 0 && prescription.targetRir <= 5)) errors.push(`${exerciseLabel}.prescription.targetRir must be 0 to 5.`);
          if (prescription.restSeconds != null && !(Number.isInteger(prescription.restSeconds) && prescription.restSeconds >= 0)) errors.push(`${exerciseLabel}.prescription.restSeconds must be a non-negative integer.`);
          if (!String(prescription.unit || '').trim()) errors.push(`${exerciseLabel}.prescription.unit is required.`);
          else if (!TRAINING_UNITS.has(prescription.unit)) (allowLegacy ? warnings : errors).push(`${exerciseLabel}.prescription.unit must be lb, min, sec, distance or level.`);
          ['machineSetup', 'calibrationNotes'].forEach((field) => {
            if (Object.prototype.hasOwnProperty.call(prescription, field)) (allowLegacy ? warnings : errors).push(`${exerciseLabel}.prescription.${field} is not part of the official model.`);
          });
          if (isObject(prescription.progression) && prescription.progression.confirmationRequired !== true) errors.push(`${exerciseLabel}.prescription.progression.confirmationRequired must be true.`);
        });
      });
    });
  });

  const protocols = Array.isArray(training.complementaryProtocols) ? training.complementaryProtocols : [];
  protocols.forEach((protocol, index) => {
    const label = `complementaryProtocols[${index}]`;
    if (!isObject(protocol)) return errors.push(`${label} must be an object.`);
    if (!stableId(protocol.id)) errors.push(`${label}.id must be stable.`);
    if (!['posing', 'mobility', 'cardio'].includes(protocol.type)) errors.push(`${label}.type must be posing, mobility or cardio.`);
    if (!Number.isInteger(protocol.frequencyPerWeek) || protocol.frequencyPerWeek < 1) errors.push(`${label}.frequencyPerWeek must be positive.`);
    if (protocol.scheduleMode !== 'flexible') errors.push(`${label}.scheduleMode must be "flexible".`);
  });

  infos.push(`${weeks.length} week(s), ${catalog.length} catalog session(s), ${exerciseKeys.size} unique exercise key(s).`);
  return { errors, warnings, infos };
}

module.exports = { validateTrainingModel };
