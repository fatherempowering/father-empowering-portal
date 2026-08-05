#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { validateTrainingModel } = require('./validate-training-model');

const cliArgs = process.argv.slice(2);
const strict = cliArgs.includes('--strict');
const rootArg = cliArgs.find((arg) => !arg.startsWith('--'));
const root = path.resolve(rootArg || process.cwd());
const errors = [];
const warnings = [];
const infos = [];

function exists(file) {
  return fs.existsSync(file) && fs.statSync(file).isFile();
}

function readJson(candidates, label, options = {}) {
  for (const name of candidates) {
    const file = path.join(root, name);
    if (!exists(file)) continue;
    try {
      return { file, name, data: JSON.parse(fs.readFileSync(file, 'utf8')) };
    } catch (err) {
      errors.push(`${label}: invalid JSON in ${name} - ${err.message}`);
      return null;
    }
  }
  if (options.required) {
    errors.push(`${label}: missing file. Looked for ${candidates.join(' or ')}`);
  } else {
    infos.push(`${label}: optional file not present`);
  }
  return null;
}

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function validateLocalizedContent(value, label, options = {}) {
  if (value == null || value === '') return;
  if (typeof value === 'string') {
    if (options.requireBilingual) warnings.push(`${label} uses a legacy single-language string; new content should include en and fr`);
    return;
  }
  if (!isObject(value)) return errors.push(`${label} must be a string or an { en, fr } object`);
  ['en', 'fr'].forEach((language) => {
    if (!String(value[language] || '').trim()) errors.push(`${label}.${language} is required`);
  });
}

function unique(values) {
  return new Set(values).size === values.length;
}

function duplicateItems(items) {
  const seen = new Set();
  const dupes = new Set();
  for (const item of items) {
    if (seen.has(item)) dupes.add(item);
    seen.add(item);
  }
  return [...dupes];
}

function storageSlug(value) {
  return String(value || 'client')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'client';
}

function publicSlug(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function isPublicSlug(value) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(value || ''));
}

function isStorageNamespace(value) {
  return /^[a-z0-9]+(?:_[a-z0-9]+)*$/.test(String(value || ''));
}

function validateUrl(value, label, options = {}) {
  if (!value) return;
  if (options.allowRelative && !/^[a-z][a-z0-9+.-]*:/i.test(value)) {
    if (!/\.json(?:[?#].*)?$/i.test(value)) {
      errors.push(`${label}: relative program URLs should point to a JSON file`);
    }
    return;
  }
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) {
      errors.push(`${label}: URL must use http or https`);
    }
  } catch (_err) {
    errors.push(`${label}: invalid URL`);
  }
}

function walk(value, callback, trail = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => walk(item, callback, trail.concat(String(index))));
    return;
  }
  if (!isObject(value)) {
    callback(value, trail);
    return;
  }
  Object.entries(value).forEach(([key, child]) => {
    callback(child, trail.concat(key), key);
    walk(child, callback, trail.concat(key));
  });
}

function findForbiddenClientInfoKeys(data) {
  const forbidden = new Set([
    'totalWeeks',
    'sessionIds',
    'sessionDays',
    'sessionCatalog',
    'weeks',
    'calories',
    'macros',
    'meals',
    'plans',
    'appVersion',
    'technicalVersion'
  ]);
  const hits = [];
  walk(data, (_value, trail, key) => {
    if (key && forbidden.has(key)) hits.push(trail.join('.'));
  });
  return hits;
}

function findLocalPaths(data) {
  const hits = [];
  walk(data, (value, trail) => {
    if (typeof value !== 'string') return;
    if (/^(\/Users\/|\/home\/|\/var\/|\/tmp\/|\/private\/|\/Volumes\/|[A-Za-z]:\\)/.test(value)) {
      hits.push(`${trail.join('.')}: ${value}`);
    }
  });
  return hits;
}

function findApparentSecrets(data) {
  const hits = [];
  const secretKeyPattern = /(secret|token|password|private|api[_-]?key|access[_-]?key|bearer|authorization)/i;
  const secretValuePattern = /(sk-[A-Za-z0-9_-]{12,}|ghp_[A-Za-z0-9_]{12,}|xox[baprs]-[A-Za-z0-9-]{12,}|AIza[0-9A-Za-z_-]{20,}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})/;
  walk(data, (value, trail, key) => {
    const pathName = trail.join('.');
    if (key && secretKeyPattern.test(key)) hits.push(`${pathName}: secret-like field name`);
    if (typeof value === 'string' && secretValuePattern.test(value)) hits.push(`${pathName}: secret-like value`);
  });
  return hits;
}

function storageKeyMap(namespace) {
  return {
    data: `faem_${namespace}_data_v1`,
    theme: `faem_${namespace}_theme`,
    coachSession: `faem_${namespace}_manual_mode`,
    photoDb: `faem_${namespace}_photos_v1`,
    tallyCompletion: `faem_${namespace}_tally_completion_notified_v1`,
    trainingPlanCache: `faem_${namespace}_training_plan_v1`,
    nutritionPlanCache: `faem_${namespace}_nutrition_plan_v1`,
    planMeta: `faem_${namespace}_plan_meta_v1`,
    planNotice: `faem_${namespace}_last_update_notice_v1`,
    popupMilestones: `faem_${namespace}_data_v1_popup_milestones`,
    popupStreaks: `faem_${namespace}_data_v1_popup_streaks`,
    checkinOutbox: `faem_${namespace}_checkin_outbox_v1`,
    iosInstallSeen: `faem_${namespace}_ios_install_seen_v1`,
    resultProgress: `faem_${namespace}_result_progress_v1`,
    groceryPlanExample: `faem_${namespace}_grocery_plan_1_v1`
  };
}

function proposedStorageKey(namespace, name) {
  if (name === 'photos') return `faem_${namespace}_photos_v1`;
  return `faem_${namespace}_${String(name).replace(/[^a-z0-9]+/gi, '_').toLowerCase()}_v1`;
}

function validateStorageOverride(value, namespace, label) {
  if (!value) return;
  if (typeof value !== 'string') {
    errors.push(`${label}: override must be a string`);
    return;
  }
  const allowedPrefixes = [`faem_${namespace}_`, `fe_${namespace}_`];
  if (!allowedPrefixes.some((prefix) => value.startsWith(prefix))) {
    errors.push(`${label}: storage override is not namespaced. Expected prefix faem_${namespace}_`);
  }
}

function validateClientInfo(record) {
  if (!record) return null;
  const data = record.data;

  if (data.schemaVersion !== 'fe-client-info-v2') {
    errors.push('client-info: schemaVersion must be "fe-client-info-v2"');
  }
  if (!data.updatedAt || typeof data.updatedAt !== 'string') {
    errors.push('client-info: updatedAt is required');
  }

  const forbidden = findForbiddenClientInfoKeys(data);
  if (forbidden.length) {
    errors.push(`client-info: these fields belong in training/nutrition/program files, not client-info.json: ${forbidden.join(', ')}`);
  }
  if (Object.prototype.hasOwnProperty.call(data, 'training')) {
    errors.push('client-info: top-level training content belongs in training-program.json');
  }
  if (Object.prototype.hasOwnProperty.call(data, 'nutrition')) {
    errors.push('client-info: top-level nutrition content belongs in nutrition-program.json');
  }

  findLocalPaths(data).forEach((hit) => errors.push(`client-info: local absolute path is not portable - ${hit}`));
  findApparentSecrets(data).forEach((hit) => errors.push(`client-info: apparent secret detected - ${hit}`));

  const client = data.client || {};
  const portal = data.portal || {};
  const features = data.features || {};
  const storage = data.storage || {};
  const migration = data.migration || {};
  const integrations = data.integrations || {};

  if (!client.id) errors.push('client-info: client.id is required and must remain stable forever');
  if (client.id && !/^[a-z][a-z0-9_:-]{2,}$/i.test(client.id)) {
    errors.push('client-info: client.id must be a stable machine-readable identifier such as clt_example_001');
  }
  if (!client.slug) errors.push('client-info: client.slug is required');
  if (client.slug && !isPublicSlug(client.slug)) {
    errors.push('client-info: client.slug must use lowercase letters, numbers and hyphens only');
  }
  if (client.slug) {
    warnings.push('client-info: changing client.slug after deployment requires an explicit migration plan for localStorage and IndexedDB');
  }
  if (!client.displayName) errors.push('client-info: client.displayName is required');
  if (!client.shortName) warnings.push('client-info: client.shortName is recommended');
  if (!client.language) warnings.push('client-info: client.language is recommended');
  if (!client.timezone) warnings.push('client-info: client.timezone is recommended');

  if (!portal.appTitle) warnings.push('client-info: portal.appTitle is recommended');
  if (!portal.documentTitle) warnings.push('client-info: portal.documentTitle is recommended');

  const expectedNamespace = storageSlug(client.slug || client.displayName || 'client');
  if (!storage.namespace) {
    errors.push(`client-info: storage.namespace is required. Suggested value: ${expectedNamespace}`);
  } else if (!isStorageNamespace(storage.namespace)) {
    errors.push('client-info: storage.namespace must use lowercase letters, numbers and underscores only');
  } else if (storage.namespace !== expectedNamespace) {
    warnings.push(`client-info: storage.namespace differs from the slug-derived namespace (${expectedNamespace}). This is valid only for deliberate migration/preservation.`);
  }

  const namespace = storage.namespace || expectedNamespace;
  const derived = storageKeyMap(namespace);
  Object.entries(storage.overrides || {}).forEach(([key, value]) => {
    validateStorageOverride(value, namespace, `client-info storage.overrides.${key}`);
  });

  const legacy = migration.legacyStorage || {};
  const legacyValues = []
    .concat(asArray(legacy.localStorageKeys))
    .concat(asArray(legacy.sessionStorageKeys))
    .concat(asArray(legacy.indexedDbNames));
  const activeValues = Object.values(derived);
  const collisions = legacyValues.filter((key) => activeValues.includes(key));
  if (collisions.length) {
    errors.push(`client-info: migration legacy keys collide with active namespace keys: ${collisions.join(', ')}`);
  }
  if (migration.enabled && !legacyValues.length) {
    warnings.push('client-info: migration.enabled is true but no legacyStorage keys are listed');
  }

  validateUrl(((integrations.tally || {}).publicFormUrl), 'client-info integrations.tally.publicFormUrl');
  if (features.tallyOnboarding && !(integrations.tally && integrations.tally.publicFormUrl)) {
    warnings.push('client-info: tallyOnboarding is enabled but integrations.tally.publicFormUrl is empty');
  }
  if (features.coachReports && !(integrations.coachmax && integrations.coachmax.endpointRef)) {
    warnings.push('client-info: coachReports is enabled but integrations.coachmax.endpointRef is empty');
  }

  infos.push(`client identity: ${client.id || '(missing id)'} / ${client.slug || '(missing slug)'}`);
  infos.push(`storage namespace: ${namespace}`);
  Object.entries(derived).forEach(([key, value]) => infos.push(`storage.${key}: ${value}`));
  infos.push(`future storageKey(name): storageKey("data") -> ${proposedStorageKey(namespace, 'data')}`);
  infos.push(`future storageKey(name): storageKey("grocery:plan-1") -> ${proposedStorageKey(namespace, 'grocery:plan-1')}`);

  return {
    client,
    portal,
    features,
    storage,
    namespace,
    derived
  };
}

function readTrainingRecord(features) {
  const required = !features || features.training !== false;
  return readJson(['training-program.json', 'training-program.example.json'], 'training-program', { required });
}

function readNutritionRecord(features) {
  const required = !features || features.nutrition !== false;
  return readJson(['nutrition-program.json', 'nutrition-program.example.json'], 'nutrition-program', { required });
}

function getTrainingConfig(data) {
  return data.training || (data.config && data.config.training) || null;
}

function validateTraining(record) {
  if (!record) return null;
  const data = record.data;
  const officialModel = validateTrainingModel(data, { allowEmptyWeeks: true, allowLegacy: true });
  officialModel.errors.forEach((message) => errors.push('training-program: ' + message));
  officialModel.warnings.forEach((message) => warnings.push('training-program: ' + message));
  officialModel.infos.forEach((message) => infos.push('training-program: ' + message));
  if (data.schemaVersion !== 1) errors.push('training-program: schemaVersion must be 1');
  if (!data.programVersion) errors.push('training-program: programVersion is required');
  if (!data.updatedAt || typeof data.updatedAt !== 'string') errors.push('training-program: updatedAt is required');

  if (Object.prototype.hasOwnProperty.call(data, 'totalWeeks')) {
    errors.push('training-program: totalWeeks must not be declared. It is derived from training.weeks.length.');
  }

  const training = getTrainingConfig(data);
  if (!isObject(training)) {
    errors.push('training-program: training object is required');
    return null;
  }
  if (Object.prototype.hasOwnProperty.call(training, 'totalWeeks')) {
    errors.push('training-program: training.totalWeeks must not be declared. It is derived from training.weeks.length.');
  }
  const phase = training.phase;
  if (!isObject(phase)) {
    errors.push('training-program: training.phase object is required');
  } else {
    if (!phase.id || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(phase.id)) {
      errors.push('training-program: training.phase.id must be a stable lowercase kebab-case identifier');
    }
    if (!phase.label || !(typeof phase.label === 'string' || isObject(phase.label))) {
      errors.push('training-program: training.phase.label is required');
    }
    if (!Number.isInteger(phase.order) || phase.order < 1) {
      errors.push('training-program: training.phase.order must be a positive integer');
    }
  }

  const catalog = asArray(training.sessionCatalog);
  const catalogIds = catalog.map((session) => session && session.id).filter(Boolean);
  const legacySessionIds = asArray(training.sessionIds);
  const knownSessionIds = catalogIds.length ? catalogIds : legacySessionIds;

  if (!catalogIds.length && legacySessionIds.length) {
    warnings.push('training-program: sessionIds/sessionDays are legacy fallbacks. New packages should use sessionCatalog.');
  }
  if (catalogIds.length !== catalog.length) {
    errors.push('training-program: every sessionCatalog item needs an id');
  }
  duplicateItems(catalogIds).forEach((id) => errors.push(`training-program: duplicate sessionCatalog id "${id}"`));
  catalog.forEach((session) => {
    if (!session || typeof session !== 'object') return;
    if (!session.label) warnings.push(`training-program: sessionCatalog ${session.id || '(missing id)'} should include label`);
    if (!session.title) warnings.push(`training-program: sessionCatalog ${session.id || '(missing id)'} should include title`);
    if (session.suggestedDay && !/^(MON|TUE|WED|THU|FRI|SAT|SUN)$/i.test(session.suggestedDay)) {
      warnings.push(`training-program: sessionCatalog ${session.id} has non-standard suggestedDay "${session.suggestedDay}"`);
    }
  });
  if (legacySessionIds.length) {
    duplicateItems(legacySessionIds).forEach((id) => errors.push(`training-program: duplicate legacy sessionIds value "${id}"`));
  }
  if (catalogIds.length && legacySessionIds.length) {
    const mismatch = legacySessionIds.filter((id) => !catalogIds.includes(id));
    if (mismatch.length) {
      errors.push(`training-program: sessionIds contains values missing from sessionCatalog: ${mismatch.join(', ')}`);
    }
  }

  const weeks = asArray(training.weeks);
  if (!weeks.length) {
    warnings.push('training-program: training.weeks is empty. This is valid for a blank template only.');
  }
  const weekNumbers = weeks.map((week) => week && week.week).filter((week) => week != null);
  duplicateItems(weekNumbers).forEach((week) => errors.push(`training-program: duplicate week identifier "${week}"`));
  infos.push(`training totalWeeks derived from training.weeks.length: ${weeks.length}`);

  const usedSessionIds = new Set();
  weeks.forEach((week, weekIndex) => {
    const label = `training-program week[${weekIndex}]`;
    if (!Number.isInteger(week.week) || week.week < 1) {
      errors.push(`${label}: week must be a positive integer`);
    }
    if (!isObject(week.sessions)) {
      errors.push(`${label}: sessions object is required`);
      return;
    }
    Object.entries(week.sessions).forEach(([sessionId, session]) => {
      usedSessionIds.add(sessionId);
      if (knownSessionIds.length && !knownSessionIds.includes(sessionId)) {
        errors.push(`${label}: unknown session id "${sessionId}"`);
      }
      if (!isObject(session)) {
        errors.push(`${label} session ${sessionId}: session must be an object`);
        return;
      }
      const exerciseKeys = [];
      asArray(session.blocks).forEach((block) => {
        asArray(block.exercises).forEach((exercise) => {
          if (!exercise || typeof exercise !== 'object') return;
          if (!exercise.name) warnings.push(`${label} session ${sessionId}: exercise without name`);
          if (!exercise.key) warnings.push(`${label} session ${sessionId}: exercise "${exercise.name || 'unnamed'}" has no stable key`);
          if (exercise.key) exerciseKeys.push(exercise.key);
        });
      });
      duplicateItems(exerciseKeys).forEach((key) => errors.push(`${label} session ${sessionId}: duplicate exercise key "${key}"`));
    });
  });

  if (catalogIds.length) {
    [...usedSessionIds].forEach((id) => {
      if (!catalogIds.includes(id)) errors.push(`training-program: session "${id}" is used but missing from sessionCatalog`);
    });
  }

  return {
    totalWeeks: weeks.length,
    sessionIds: knownSessionIds,
    usedSessionIds: [...usedSessionIds]
  };
}

function getNutritionConfig(data) {
  return data.nutrition || (data.config && data.config.nutrition) || null;
}

function validateNutrition(record, clientInfo) {
  if (!record) return;
  const data = record.data;
  if (data.schemaVersion !== 1) errors.push('nutrition-program: schemaVersion must be 1');
  if (!data.programVersion) errors.push('nutrition-program: programVersion is required');
  if (!data.updatedAt || typeof data.updatedAt !== 'string') errors.push('nutrition-program: updatedAt is required');

  findLocalPaths(data).forEach((hit) => errors.push(`nutrition-program: local absolute path is not portable - ${hit}`));
  findApparentSecrets(data).forEach((hit) => errors.push(`nutrition-program: apparent secret detected - ${hit}`));

  const nutrition = getNutritionConfig(data);
  if (!isObject(nutrition)) {
    errors.push('nutrition-program: nutrition object is required');
    return;
  }

  ['kicker', 'title', 'phase', 'desc', 'futureNote'].forEach((field) => validateLocalizedContent(nutrition[field], `nutrition-program: nutrition.${field}`, { requireBilingual: true }));
  asArray(nutrition.targets).forEach((target, index) => validateLocalizedContent(target && target.label, `nutrition-program: targets[${index}].label`, { requireBilingual: true }));
  asArray(nutrition.rules).forEach((rule, index) => {
    validateLocalizedContent(rule && rule.title, `nutrition-program: rules[${index}].title`, { requireBilingual: true });
    validateLocalizedContent(rule && rule.detail, `nutrition-program: rules[${index}].detail`, { requireBilingual: true });
  });
  asArray(nutrition.meals).forEach((meal, index) => ['time', 'name', 'detail'].forEach((field) => validateLocalizedContent(meal && meal[field], `nutrition-program: meals[${index}].${field}`, { requireBilingual: true })));
  validateLocalizedContent(data.updateTitle, 'nutrition-program: updateTitle', { requireBilingual: true });
  validateLocalizedContent(data.updateMessage, 'nutrition-program: updateMessage', { requireBilingual: true });
  asArray(data.releaseNotes).forEach((note, index) => validateLocalizedContent(note, `nutrition-program: releaseNotes[${index}]`, { requireBilingual: true }));

  const plans = asArray(nutrition.plans);
  if (plans.length) {
    const planIds = plans.map((plan) => plan && plan.id).filter(Boolean);
    if (planIds.length !== plans.length) errors.push('nutrition-program: every nutrition.plans item needs an id');
    duplicateItems(planIds).forEach((id) => errors.push(`nutrition-program: duplicate nutrition plan id "${id}"`));
    plans.forEach((plan) => {
      if (!plan.label) warnings.push(`nutrition-program: plan ${plan.id} should include a label`);
      if (!plan.title) warnings.push(`nutrition-program: plan ${plan.id} should include a title`);
      validateLocalizedContent(plan.label, `nutrition-program: plan ${plan.id}.label`, { requireBilingual: true });
      validateLocalizedContent(plan.title, `nutrition-program: plan ${plan.id}.title`, { requireBilingual: true });
      if (!Array.isArray(plan.sections)) warnings.push(`nutrition-program: plan ${plan.id} should include sections[]`);
      asArray(plan.sections).forEach((section, index) => ['label', 'title', 'detail'].forEach((field) => validateLocalizedContent(section && section[field], `nutrition-program: plan ${plan.id}.sections[${index}].${field}`, { requireBilingual: true })));
    });
    if (clientInfo && clientInfo.features && clientInfo.features.nutrition === false) {
      warnings.push('client-info/nutrition-program: nutrition file exists while features.nutrition is false');
    }
  } else {
    const hasLegacyContent = asArray(nutrition.targets).length || asArray(nutrition.rules).length || asArray(nutrition.meals).length || nutrition.futureNote;
    if (hasLegacyContent) {
      warnings.push('nutrition-program: using legacy nutrition shape without plans[]. This is supported as fallback.');
    } else {
      warnings.push('nutrition-program: no plans[] and no legacy nutrition content. This is valid for a blank template only.');
    }
  }
}

const clientInfoRecord = readJson(['client-info.json', 'client-info.example.json'], 'client-info', { required: true });
if (clientInfoRecord && clientInfoRecord.name !== 'client-info.json') {
  const message = `client-info: using ${clientInfoRecord.name}. Create client-info.json for a real client package.`;
  if (strict) errors.push(message); else warnings.push(message);
}

const clientInfo = validateClientInfo(clientInfoRecord);
const features = clientInfo ? clientInfo.features : {};
const trainingRecord = readTrainingRecord(features);
const nutritionRecord = readNutritionRecord(features);
if (trainingRecord && trainingRecord.name !== 'training-program.json') {
  const message = `training-program: using ${trainingRecord.name}. Create training-program.json for a real client package.`;
  if (strict) errors.push(message); else warnings.push(message);
}
if (nutritionRecord && nutritionRecord.name !== 'nutrition-program.json') {
  const message = `nutrition-program: using ${nutritionRecord.name}. Create nutrition-program.json for a real client package.`;
  if (strict) errors.push(message); else warnings.push(message);
}
const trainingInfo = validateTraining(trainingRecord);
validateNutrition(nutritionRecord, clientInfo);

if (clientInfo && trainingInfo && clientInfo.features && clientInfo.features.training !== false) {
  infos.push(`package active training weeks: ${trainingInfo.totalWeeks}`);
}

console.log('Father Empowering client package validation');
console.log('Package:', root);
console.log('Mode:', strict ? 'strict client package' : 'template-compatible');

if (infos.length) {
  console.log('\nINFO');
  infos.forEach((info) => console.log('  - ' + info));
}

if (warnings.length) {
  console.log('\nWARNING');
  warnings.forEach((warning) => console.log('  - ' + warning));
}

if (errors.length) {
  console.log('\nERROR');
  errors.forEach((error) => console.log('  - ' + error));
  process.exitCode = 1;
} else {
  console.log('\nResult: OK');
}
