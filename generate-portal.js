#!/usr/bin/env node
/*
  FATHER EMPOWERING — CANONICAL CLIENT PORTAL GENERATOR

  Usage:
    node generate-portal.js clients/<client-slug> [output-folder]

  The input directory must contain:
    client-info.json
    training-program.json          (when Training is enabled)
    nutrition-program.json         (when Nutrition is enabled)

  With no output folder, the portal is built in place so its permanent URL can
  remain /clients/<client-slug>/. The package is validated before and after.
*/
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = __dirname;
const args = process.argv.slice(2);
if (!args[0]) {
  console.error('Usage: node generate-portal.js <client-package-folder> [output-folder]');
  process.exit(1);
}

const packageDir = path.resolve(args[0]);
if (!fs.existsSync(packageDir) || !fs.statSync(packageDir).isDirectory()) {
  console.error('ERROR: input must be a client package folder containing client-info.json.');
  console.error('The historical program.example.json format is no longer accepted.');
  process.exit(1);
}

function readJson(file, required = true) {
  const fullPath = path.join(packageDir, file);
  if (!fs.existsSync(fullPath)) {
    if (!required) return null;
    throw new Error('Missing required file: ' + file);
  }
  try {
    return JSON.parse(fs.readFileSync(fullPath, 'utf8'));
  } catch (error) {
    throw new Error(file + ' is not valid JSON: ' + error.message);
  }
}

function runValidator(folder, strict) {
  const validator = path.join(repoRoot, 'scripts', 'validate-client-package.js');
  const result = spawnSync(process.execPath, [validator, folder].concat(strict ? ['--strict'] : []), { encoding: 'utf8' });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) throw new Error('Client package validation failed.');
}

function deepMerge(target, source) {
  Object.keys(source || {}).forEach((key) => {
    const value = source[key];
    if (value && typeof value === 'object' && !Array.isArray(value)
      && target[key] && typeof target[key] === 'object' && !Array.isArray(target[key])) {
      deepMerge(target[key], value);
    } else {
      target[key] = value;
    }
  });
  return target;
}

function htmlText(value) {
  return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function endpointForReference(reference) {
  const known = {
    'legacy-telegram-backend': 'https://legacy-telegram-backend.vercel.app/api/send-report'
  };
  return known[reference] || '';
}

function copyFile(source, destination) {
  if (path.resolve(source) === path.resolve(destination)) return;
  fs.copyFileSync(source, destination);
}

function copyDirectoryFiles(sourceDir, destinationDir) {
  if (!fs.existsSync(sourceDir)) return;
  fs.mkdirSync(destinationDir, { recursive: true });
  fs.readdirSync(sourceDir).forEach((name) => {
    const source = path.join(sourceDir, name);
    if (fs.statSync(source).isFile()) copyFile(source, path.join(destinationDir, name));
  });
}

runValidator(packageDir, true);

const clientInfo = readJson('client-info.json');
const features = clientInfo.features || {};
const trainingRecord = readJson('training-program.json', features.training !== false);
const nutritionRecord = readJson('nutrition-program.json', features.nutrition !== false);
const training = trainingRecord ? trainingRecord.training : null;
const nutrition = nutritionRecord ? nutritionRecord.nutrition : null;
const client = clientInfo.client || {};
const portal = clientInfo.portal || {};
const metadata = portal.metadata || {};
const storage = clientInfo.storage || {};
const overrides = storage.overrides || {};
const integrations = clientInfo.integrations || {};
const environment = clientInfo.environment || {};
const migration = clientInfo.migration || {};
const legacy = migration.legacyStorage || {};
const phase = training && training.phase;
const totalWeeks = training && Array.isArray(training.weeks) && training.weeks.length
  ? training.weeks.length
  : 12;
const endpointRef = environment.coachMaxEndpointRef
  || (integrations.coachmax && integrations.coachmax.endpointRef)
  || '';
const coachEndpoint = endpointForReference(endpointRef);
const reportsEnabled = features.coachReports !== false;

const templatePath = path.join(repoRoot, 'index.html');
let html = fs.readFileSync(templatePath, 'utf8');
const START = '/*FE_CONFIG_START*/';
const END = '/*FE_CONFIG_END*/';
const start = html.indexOf(START);
const end = html.indexOf(END);
if (start === -1 || end === -1 || end <= start) {
  throw new Error('FE_CONFIG markers were not found in index.html.');
}

const defaultBlock = html.slice(start + START.length, end);
const sandbox = {};
new Function(defaultBlock + '; this.__cfg = TEMPLATE_CONFIG;').call(sandbox);
const defaults = sandbox.__cfg;

const generatedConfig = {
  client: {
    clientId: client.id,
    athleteName: client.displayName,
    shortName: client.shortName || client.displayName,
    clientSlug: client.slug,
    programSlug: (phase && phase.id) || 'onboarding',
    appTitle: portal.appTitle || defaults.client.appTitle,
    documentTitle: portal.documentTitle || defaults.client.documentTitle,
    protocolLabel: portal.protocolLabel || defaults.client.protocolLabel,
    homeKicker: portal.homeKicker || defaults.client.homeKicker,
    sidebarTitleHtml: portal.sidebarTitleHtml || defaults.client.sidebarTitleHtml,
    sidebarSubtitle: portal.sidebarSubtitle || defaults.client.sidebarSubtitle,
    messageSignature: portal.messageSignature || defaults.client.messageSignature,
    totalWeeks,
    portalVersion: metadata.portalVersion || defaults.client.portalVersion,
    protocolVersion: metadata.protocolVersionLabel || ((phase && phase.label) || defaults.client.protocolVersion),
    lastUpdated: metadata.lastUpdatedLabel || clientInfo.updatedAt,
    language: client.language || 'en',
    timezone: client.timezone || 'America/Montreal',
    startDate: client.startDate || ''
  },
  features,
  integrations: {
    tally: {
      publicFormUrl: (integrations.tally && integrations.tally.publicFormUrl) || ''
    }
  },
  storage: {
    keyPrefix: storage.namespace,
    dataKey: overrides.data || '',
    themeKey: overrides.theme || '',
    coachSessionKey: overrides.coachSession || '',
    photoDb: overrides.photoDb || '',
    legacyDataKeys: legacy.localStorageKeys || [],
    legacyThemeKeys: [],
    legacyCoachSessionKeys: legacy.sessionStorageKeys || [],
    legacyPhotoDbs: legacy.indexedDbNames || [],
    reportEndpoint: reportsEnabled ? (coachEndpoint || defaults.storage.reportEndpoint) : '',
    coachMaxEndpoint: reportsEnabled ? (coachEndpoint || defaults.storage.coachMaxEndpoint) : '',
    trainingProgramUrl: environment.trainingProgramUrl || 'training-program.json',
    nutritionProgramUrl: environment.nutritionProgramUrl || 'nutrition-program.json',
    backupSchema: defaults.storage.backupSchema
  },
  checkin: {
    maxCheckins: totalWeeks
  },
  weekZero: {
    openOnLoad: features.weekZero !== false,
    showIntroOnLoad: features.weekZero !== false
      && features.tallyOnboarding !== false
      && (!client.coachingState || client.coachingState.initialStatus === 'week-zero-required')
  },
  measurements: clientInfo.measurements || defaults.measurements
};
if (training) generatedConfig.training = training;
if (nutrition) generatedConfig.nutrition = nutrition;

const finalConfig = deepMerge(JSON.parse(JSON.stringify(defaults)), generatedConfig);
const newBlock = '\nconst TEMPLATE_CONFIG=' + JSON.stringify(finalConfig, null, 2) + ';\n';
html = html.slice(0, start + START.length) + newBlock + html.slice(end);
html = html.replace(/<title>[^<]*<\/title>/, '<title>' + htmlText(finalConfig.client.documentTitle) + '</title>');
html = html.replace(/<html lang="[^"]*"/, '<html lang="' + htmlText(finalConfig.client.language) + '"');
html = html.replace(/<meta name="apple-mobile-web-app-title" content="[^"]*">/, '<meta name="apple-mobile-web-app-title" content="' + htmlText(finalConfig.client.shortName + ' Protocol') + '">');
html = html.replace(/<meta name="application-name" content="[^"]*">/, '<meta name="application-name" content="' + htmlText(finalConfig.client.shortName + ' Protocol') + '">');

const outputDir = args[1] ? path.resolve(args[1]) : packageDir;
fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, 'index.html'), html);

['client-info.json', 'training-program.json', 'nutrition-program.json'].forEach((name) => {
  const source = path.join(packageDir, name);
  if (fs.existsSync(source)) copyFile(source, path.join(outputDir, name));
});

const staticAssets = [
  'apple-touch-icon.png',
  'favicon-16x16.png',
  'favicon-32x32.png',
  'icon-192.png',
  'icon-512.png',
  'fe-logo-home.png',
  'fe-logo-splash.png',
  'fe-logo-part-f.png',
  'fe-logo-part-e.png',
  'fe-logo-part-wordbar.png'
];
staticAssets.forEach((name) => copyFile(path.join(repoRoot, name), path.join(outputDir, name)));
copyDirectoryFiles(path.join(repoRoot, 'measure-icons'), path.join(outputDir, 'measure-icons'));

const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, 'site.webmanifest'), 'utf8'));
manifest.name = finalConfig.client.appTitle + ' — ' + finalConfig.client.athleteName;
manifest.short_name = finalConfig.client.shortName + ' Protocol';
manifest.description = finalConfig.client.protocolLabel;
manifest.lang = finalConfig.client.language;
fs.writeFileSync(path.join(outputDir, 'site.webmanifest'), JSON.stringify(manifest, null, 2) + '\n');

let sw = fs.readFileSync(path.join(repoRoot, 'sw.js'), 'utf8');
const cacheVersion = 'client-' + client.slug + '-' + Date.now().toString(36);
sw = sw.replace(/const CACHE_VERSION\s*=\s*'[^']*';/, "const CACHE_VERSION = '" + cacheVersion + "';");
if (!nutritionRecord) sw = sw.replace(/\s*'\.\/nutrition-program\.json',?/, '');
if (!trainingRecord) sw = sw.replace(/\s*'\.\/training-program\.json',?/, '');
fs.writeFileSync(path.join(outputDir, 'sw.js'), sw);

runValidator(outputDir, true);

const canonicalClientsDir = path.join(repoRoot, 'clients');
const relativeClientDir = path.relative(canonicalClientsDir, packageDir);
const isCanonicalClient = outputDir === packageDir
  && relativeClientDir
  && !relativeClientDir.startsWith('..')
  && !path.isAbsolute(relativeClientDir)
  && !relativeClientDir.includes(path.sep)
  && !path.basename(packageDir).startsWith('.');
if (isCanonicalClient) {
  const registryPath = path.join(canonicalClientsDir, 'registry.json');
  const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  const registered = Array.isArray(registry.clients) && registry.clients.some((entry) => entry.id === client.id && entry.slug === client.slug);
  if (!registered) throw new Error('Canonical client is missing from clients/registry.json.');
  const sync = spawnSync(process.execPath, [path.join(repoRoot, 'scripts', 'sync-client-registry.js')], { encoding: 'utf8' });
  if (sync.stdout) process.stdout.write(sync.stdout);
  if (sync.stderr) process.stderr.write(sync.stderr);
  if (sync.status !== 0) throw new Error('Client registry synchronization failed.');
}

console.log('PORTAL READY');
console.log('Client:  ' + client.displayName);
console.log('ID:      ' + client.id);
console.log('Slug:    ' + client.slug);
console.log('Phase:   ' + ((phase && phase.id) || 'onboarding'));
console.log('Weeks:   ' + (training && training.weeks ? training.weeks.length : 0));
console.log('Folder:  ' + outputDir);
console.log('URL path:/clients/' + client.slug + '/');
