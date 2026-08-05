#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const DEFAULT_TALLY_URL = 'https://tally.so/r/44zdvk';

function fail(message) {
  console.error('BLOCKED: ' + message);
  process.exit(1);
}

function parseArgs(argv) {
  const options = {};
  const allowed = new Set(['name', 'short-name', 'slug', 'client-id', 'language', 'timezone', 'start-date', 'slogan', 'tally-url', 'workspace']);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help') {
      options.help = true;
      continue;
    }
    if (arg === '--disable-nutrition') {
      options.disableNutrition = true;
      continue;
    }
    if (!arg.startsWith('--')) fail('Unknown argument: ' + arg);
    const key = arg.slice(2);
    if (!allowed.has(key)) fail('Unknown argument: --' + key);
    const value = argv[++i];
    if (!value || value.startsWith('--')) fail('Missing value for --' + key);
    options[key] = value;
  }
  return options;
}

function slugify(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function namespaceFor(slug) {
  return slug.replace(/-/g, '_');
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    fail(path.basename(file) + ' could not be read: ' + error.message);
  }
}

function writeJson(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
}

function publicText(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return String(value.fr || value.en || '');
  return String(value || '');
}

function validDate(value) {
  return !value || /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function validateUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:';
  } catch (error) {
    return false;
  }
}

function usage() {
  console.log(`Father Empowering — Create Client

Required:
  --name "Full Name"

Optional:
  --short-name "First name"
  --slug "permanent-client-slug"
  --client-id "clt_permanent_id"
  --language en
  --timezone America/Montreal
  --start-date YYYY-MM-DD
  --slogan "Personal portal message"
  --tally-url https://tally.so/r/...
  --disable-nutrition

Administrative email is intentionally not accepted or stored in this public repository.`);
}

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  usage();
  process.exit(0);
}

const displayName = String(args.name || '').trim();
if (!displayName) {
  usage();
  fail('--name is required.');
}
const shortName = String(args['short-name'] || displayName.split(/\s+/)[0] || '').trim();
const slug = String(args.slug || slugify(displayName)).trim();
if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) fail('The slug must use lowercase letters, numbers and hyphens only.');
const namespace = namespaceFor(slug);
const clientId = String(args['client-id'] || ('clt_' + crypto.randomUUID().replace(/-/g, '').slice(0, 12))).trim();
if (!/^[a-z][a-z0-9_:-]{2,}$/i.test(clientId)) fail('The client ID is invalid.');
const language = String(args.language || 'en').trim().toLowerCase();
if (!/^[a-z]{2}(?:-[a-z]{2})?$/.test(language)) fail('Language must look like en or fr-ca.');
const timezone = String(args.timezone || 'America/Montreal').trim();
const startDate = String(args['start-date'] || '').trim();
if (!validDate(startDate)) fail('Start date must use YYYY-MM-DD.');
const tallyUrl = String(args['tally-url'] || DEFAULT_TALLY_URL).trim();
if (!validateUrl(tallyUrl)) fail('Tally URL must be a valid HTTPS URL.');
const slogan = String(args.slogan || 'CLIENT PROTOCOL').trim();
const workspaceRoot = path.resolve(args.workspace || repoRoot);
const clientsDir = path.join(workspaceRoot, 'clients');
const registryPath = path.join(clientsDir, 'registry.json');
const templateDir = path.join(repoRoot, 'templates', 'client-package');
const finalDir = path.join(clientsDir, slug);
const temporaryDir = path.join(clientsDir, '.creating-' + slug + '-' + process.pid);
const now = new Date().toISOString();

fs.mkdirSync(clientsDir, { recursive: true });
const registry = fs.existsSync(registryPath)
  ? readJson(registryPath)
  : { schemaVersion: 'fe-client-registry-v1', updatedAt: '', clients: [] };
if (registry.schemaVersion !== 'fe-client-registry-v1' || !Array.isArray(registry.clients)) fail('The client registry is invalid.');

const duplicate = registry.clients.find((entry) => entry.id === clientId || entry.slug === slug || entry.namespace === namespace);
if (duplicate) fail('Client identity already exists in the registry: ' + duplicate.slug + '.');
if (fs.existsSync(finalDir)) fail('Client folder already exists: clients/' + slug + '.');

try {
  fs.mkdirSync(temporaryDir, { recursive: false });
  const clientInfo = readJson(path.join(templateDir, 'client-info.example.json'));
  clientInfo.updatedAt = now;
  clientInfo.client.id = clientId;
  clientInfo.client.slug = slug;
  clientInfo.client.displayName = displayName;
  clientInfo.client.shortName = shortName;
  clientInfo.client.language = language;
  clientInfo.client.timezone = timezone;
  clientInfo.client.startDate = startDate;
  clientInfo.client.coachingState = { phase: 'onboarding', initialStatus: 'week-zero-required' };
  clientInfo.portal.documentTitle = 'Father Empowering Protocol - ' + displayName;
  clientInfo.portal.protocolLabel = 'FATHER EMPOWERING - ' + displayName.toUpperCase();
  clientInfo.portal.homeKicker = slogan;
  clientInfo.portal.sidebarSubtitle = displayName.toUpperCase() + ' - ONBOARDING';
  clientInfo.portal.metadata.protocolVersionLabel = 'ONBOARDING';
  clientInfo.portal.metadata.lastUpdatedLabel = now.slice(0, 10);
  clientInfo.features.nutrition = !args.disableNutrition;
  clientInfo.integrations.tally.publicFormUrl = tallyUrl;
  clientInfo.storage.namespace = namespace;
  clientInfo.migration.enabled = false;
  clientInfo.migration.reason = '';
  clientInfo.migration.sourcePortal = '';
  clientInfo.migration.legacyStorage = { localStorageKeys: [], sessionStorageKeys: [], indexedDbNames: [] };
  writeJson(path.join(temporaryDir, 'client-info.json'), clientInfo);

  const training = readJson(path.join(templateDir, 'training-program.example.json'));
  training.programVersion = 'training-' + slug + '-onboarding-v1';
  training.updatedAt = now;
  training.training.phase = { id: 'phase-1', label: { en: 'PHASE 1', fr: 'PHASE 1' }, order: 1 };
  training.training.weeks = [];
  writeJson(path.join(temporaryDir, 'training-program.json'), training);

  if (!args.disableNutrition) {
    const nutrition = readJson(path.join(templateDir, 'nutrition-program.example.json'));
    nutrition.programVersion = 'nutrition-' + slug + '-onboarding-v1';
    nutrition.updatedAt = now;
    writeJson(path.join(temporaryDir, 'nutrition-program.json'), nutrition);
  }

  const generator = spawnSync(process.execPath, [path.join(repoRoot, 'generate-portal.js'), temporaryDir], { encoding: 'utf8' });
  if (generator.stdout) process.stdout.write(generator.stdout);
  if (generator.stderr) process.stderr.write(generator.stderr);
  if (generator.status !== 0) throw new Error('Portal generation failed.');

  fs.renameSync(temporaryDir, finalDir);
  const entry = {
    id: clientId,
    slug,
    displayName,
    shortName,
    namespace,
    status: 'onboarding',
    phaseId: training.training.phase.id,
    phaseLabel: publicText(training.training.phase.label),
    phaseOrder: training.training.phase.order,
    programVersion: training.programVersion,
    totalWeeks: training.training.weeks.length,
    nutritionEnabled: !args.disableNutrition,
    nutritionVersion: args.disableNutrition ? '' : ('nutrition-' + slug + '-onboarding-v1'),
    createdAt: now,
    startDate,
    updatedAt: now,
    path: 'clients/' + slug,
    urlPath: '/clients/' + slug + '/'
  };
  registry.clients.push(entry);
  registry.clients.sort((a, b) => a.slug.localeCompare(b.slug));
  registry.updatedAt = now;
  const registryTemp = registryPath + '.tmp-' + process.pid;
  writeJson(registryTemp, registry);
  fs.renameSync(registryTemp, registryPath);

  console.log('CLIENT PORTAL READY');
  console.log('Client:  ' + displayName);
  console.log('ID:      ' + clientId);
  console.log('Slug:    ' + slug);
  console.log('Folder:  ' + finalDir);
  console.log('URL path:/clients/' + slug + '/');
  console.log('Next:    Send the permanent URL, then wait for Tally and Week 0.');
} catch (error) {
  if (fs.existsSync(temporaryDir)) fs.rmSync(temporaryDir, { recursive: true, force: true });
  let registeredOnDisk = false;
  if (fs.existsSync(registryPath)) {
    try {
      const diskRegistry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
      registeredOnDisk = Array.isArray(diskRegistry.clients) && diskRegistry.clients.some((entry) => entry.slug === slug);
    } catch (_error) {}
  }
  if (fs.existsSync(finalDir) && !registeredOnDisk) fs.rmSync(finalDir, { recursive: true, force: true });
  fail(error.message);
}
