#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function fail(message) {
  console.error('BLOCKED: ' + message);
  process.exit(1);
}

function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--dry-run') { options.dryRun = true; continue; }
    if (arg === '--workspace') {
      const value = argv[++i];
      if (!value || value.startsWith('--')) fail('Missing value for --workspace');
      options.workspace = value;
      continue;
    }
    fail('Unknown argument: ' + arg);
  }
  return options;
}

function readJson(file, required = true) {
  if (!fs.existsSync(file)) {
    if (required) fail('Missing file: ' + file);
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    fail(path.basename(file) + ' is invalid JSON: ' + error.message);
  }
}

function writeJsonAtomic(file, value) {
  const temporary = file + '.tmp-' + process.pid;
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n');
  fs.renameSync(temporary, file);
}

function newestTimestamp(values) {
  return values.filter(Boolean).map(String).sort((a, b) => {
    const aTime=Date.parse(a),bTime=Date.parse(b);
    if (Number.isNaN(aTime) || Number.isNaN(bTime)) return a.localeCompare(b);
    return aTime-bTime;
  }).pop() || '';
}

function publicText(value, fallback = '') {
  if (value && typeof value === 'object' && !Array.isArray(value)) return String(value.fr || value.en || fallback);
  return String(value || fallback);
}

function publicStatus(clientInfo, training) {
  const declared = String((((clientInfo || {}).client || {}).coachingState || {}).phase || '').toLowerCase();
  if (declared === 'paused' || declared === 'archived') return declared;
  const weeks = training && training.training && Array.isArray(training.training.weeks) ? training.training.weeks.length : 0;
  return weeks > 0 ? 'active' : 'onboarding';
}

function registrySummary(entry, clientInfo, training, nutrition) {
  const client = clientInfo.client || {};
  const features = clientInfo.features || {};
  const phase = training && training.training && training.training.phase || {};
  const weeks = training && training.training && Array.isArray(training.training.weeks) ? training.training.weeks : [];
  const slug = String(client.slug || entry.slug || '').trim();
  return {
    id: client.id || entry.id,
    slug,
    displayName: client.displayName || entry.displayName,
    shortName: client.shortName || entry.shortName || client.displayName || entry.displayName,
    namespace: ((clientInfo.storage || {}).namespace) || entry.namespace,
    status: publicStatus(clientInfo, training),
    phaseId: phase.id || '',
    phaseLabel: publicText(phase.label, 'PROGRAMME EN PRÉPARATION'),
    phaseOrder: Number.isInteger(phase.order) ? phase.order : null,
    programVersion: training && training.programVersion || '',
    totalWeeks: weeks.length,
    nutritionEnabled: features.nutrition !== false,
    nutritionVersion: nutrition && nutrition.programVersion || '',
    createdAt: entry.createdAt || clientInfo.updatedAt || '',
    startDate: client.startDate || entry.startDate || '',
    updatedAt: newestTimestamp([clientInfo.updatedAt, training && training.updatedAt, nutrition && nutrition.updatedAt, entry.updatedAt]),
    path: 'clients/' + slug,
    urlPath: '/clients/' + slug + '/'
  };
}

const args = parseArgs(process.argv.slice(2));
const workspace = path.resolve(args.workspace || path.join(__dirname, '..'));
const clientsRoot = path.join(workspace, 'clients');
const registryPath = path.join(clientsRoot, 'registry.json');
const registry = readJson(registryPath);
if (registry.schemaVersion !== 'fe-client-registry-v1' || !Array.isArray(registry.clients)) {
  fail('clients/registry.json must use schema fe-client-registry-v1 with clients[].');
}

const seenIds = new Set();
const seenSlugs = new Set();
const summaries = registry.clients.map((entry) => {
  if (!entry || !entry.id || !entry.slug) fail('Every registry entry needs a permanent id and slug.');
  if (seenIds.has(entry.id)) fail('Duplicate client id in registry: ' + entry.id);
  if (seenSlugs.has(entry.slug)) fail('Duplicate client slug in registry: ' + entry.slug);
  seenIds.add(entry.id);seenSlugs.add(entry.slug);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.slug)) fail('Unsafe client slug: ' + entry.slug);
  const clientDir = path.join(clientsRoot, entry.slug);
  const relative = path.relative(clientsRoot, clientDir);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) fail('Unsafe client path for ' + entry.slug);
  const clientInfo = readJson(path.join(clientDir, 'client-info.json'));
  if (!clientInfo.client || clientInfo.client.id !== entry.id || clientInfo.client.slug !== entry.slug) {
    fail('Registry identity does not match clients/' + entry.slug + '/client-info.json.');
  }
  const trainingRequired = !clientInfo.features || clientInfo.features.training !== false;
  const nutritionRequired = !clientInfo.features || clientInfo.features.nutrition !== false;
  const training = readJson(path.join(clientDir, 'training-program.json'), trainingRequired);
  const nutrition = readJson(path.join(clientDir, 'nutrition-program.json'), nutritionRequired);
  return registrySummary(entry, clientInfo, training, nutrition);
}).sort((a, b) => a.slug.localeCompare(b.slug));

const next = {
  schemaVersion: 'fe-client-registry-v1',
  updatedAt: new Date().toISOString(),
  clients: summaries
};
if (!args.dryRun) writeJsonAtomic(registryPath, next);
console.log(args.dryRun ? 'CLIENT REGISTRY VALID' : 'CLIENT REGISTRY UPDATED');
console.log('Clients:', summaries.length);
summaries.forEach((entry) => console.log('  - ' + entry.slug + ' · ' + entry.status + ' · ' + entry.phaseLabel + ' · ' + entry.totalWeeks + ' week(s)'));
