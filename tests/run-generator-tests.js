#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const repo = path.resolve(__dirname, '..');
const generator = path.join(repo, 'generate-portal.js');
const validator = path.join(repo, 'scripts', 'validate-client-package.js');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fe-generator-tests-'));
let failed = 0;

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
}

function assert(name, condition, detail) {
  if (condition) console.log('PASS ' + name);
  else {
    failed++;
    console.error('FAIL ' + name + (detail ? ' - ' + detail : ''));
  }
}

function run(command, args) {
  return spawnSync(process.execPath, [command].concat(args), { encoding: 'utf8' });
}

function createPackage(name, nutritionEnabled = true) {
  const dir = path.join(root, name);
  fs.mkdirSync(dir, { recursive: true });
  const client = readJson(path.join(repo, 'templates/client-package/client-info.example.json'));
  client.client.id = 'clt_' + name.replace(/-/g, '_');
  client.client.slug = name;
  client.client.displayName = 'Test Client';
  client.client.shortName = 'Test';
  client.portal.documentTitle = 'Father Empowering Protocol - Test Client';
  client.portal.sidebarSubtitle = 'TEST CLIENT - ONBOARDING';
  client.storage.namespace = name.replace(/-/g, '_');
  client.integrations.tally.publicFormUrl = 'https://tally.so/r/test123';
  client.features.nutrition = nutritionEnabled;
  writeJson(path.join(dir, 'client-info.json'), client);

  const training = readJson(path.join(repo, 'templates/client-package/training-program.example.json'));
  writeJson(path.join(dir, 'training-program.json'), training);
  if (nutritionEnabled) {
    const nutrition = readJson(path.join(repo, 'templates/client-package/nutrition-program.example.json'));
    writeJson(path.join(dir, 'nutrition-program.json'), nutrition);
  }
  return dir;
}

const source = createPackage('test-client');
const output = path.join(root, 'output', 'test-client');
const generated = run(generator, [source, output]);
const generatedText = (generated.stdout || '') + (generated.stderr || '');
assert('canonical-package-generates', generated.status === 0, generatedText);
assert('generator-reports-ready', generatedText.includes('PORTAL READY'), generatedText);

[
  'index.html',
  'i18n.js',
  'version.json',
  'client-info.json',
  'training-program.json',
  'nutrition-program.json',
  'site.webmanifest',
  'sw.js',
  'fe-logo-home.png',
  'fe-logo-splash.png',
  'measure-icons/waist.png'
].forEach((name) => assert('generated-file-' + name, fs.existsSync(path.join(output, name))));

const validation = run(validator, [output, '--strict']);
assert('generated-output-passes-strict-validation', validation.status === 0, (validation.stdout || '') + (validation.stderr || ''));

const html = fs.readFileSync(path.join(output, 'index.html'), 'utf8');
assert('client-id-is-compiled', html.includes('"clientId": "clt_test_client"'));
assert('client-name-is-compiled', html.includes('"athleteName": "Test Client"'));
assert('client-slug-is-compiled', html.includes('"clientSlug": "test-client"'));
assert('storage-namespace-is-compiled', html.includes('"keyPrefix": "test_client"'));
assert('tally-url-is-compiled', html.includes('"publicFormUrl": "https://tally.so/r/test123"'));
assert('training-phase-is-compiled', html.includes('"id": "phase-1"'));
assert('portal-release-is-compiled', html.includes('"portalVersion": "3.3.0"') && html.includes('"portalReleasedAt": "2026-08-09"'));
assert('language-engine-is-loaded-with-cache-buster', html.includes('<script src="i18n.js?v=5"></script>'));

const portalRelease = readJson(path.join(output, 'version.json'));
assert('portal-release-file-is-copied', portalRelease.schemaVersion === 'fe-portal-release-v1' && portalRelease.version === '3.3.0');

const manifest = readJson(path.join(output, 'site.webmanifest'));
assert('manifest-is-personalized', manifest.name.includes('Test Client') && manifest.short_name === 'Test Protocol');
assert('manifest-language-is-personalized', manifest.lang === 'en');
assert('manifest-has-stable-install-id', manifest.id === './');

const sw = fs.readFileSync(path.join(output, 'sw.js'), 'utf8');
assert('service-worker-cache-is-unique', /const CACHE_VERSION = 'client-test-client-portal-3-3-0-[^']+';/.test(sw));
assert('service-worker-keeps-programs', sw.includes("'./training-program.json'") && sw.includes("'./nutrition-program.json'"));
assert('service-worker-keeps-versioned-language-engine', sw.includes("'./i18n.js?v=5'"));
assert('service-worker-keeps-release-file-offline', sw.includes("'./version.json'"));
assert('service-worker-keeps-client-info-offline', sw.includes("const OPTIONAL_SHELL=['./client-info.json']"));
assert('installed-app-name-is-personalized', html.includes('<meta name="apple-mobile-web-app-title" content="Test Protocol">') && html.includes('<meta name="application-name" content="Test Protocol">'));

const noNutritionSource = createPackage('training-only', false);
const limitedClient = readJson(path.join(noNutritionSource, 'client-info.json'));
limitedClient.features.tallyOnboarding = false;
limitedClient.features.coachReports = false;
writeJson(path.join(noNutritionSource, 'client-info.json'), limitedClient);
const noNutritionOutput = path.join(root, 'output', 'training-only');
const noNutrition = run(generator, [noNutritionSource, noNutritionOutput]);
assert('nutrition-disabled-package-generates', noNutrition.status === 0, (noNutrition.stdout || '') + (noNutrition.stderr || ''));
const noNutritionSw = fs.readFileSync(path.join(noNutritionOutput, 'sw.js'), 'utf8');
assert('disabled-nutrition-is-not-cached', !noNutritionSw.includes("'./nutrition-program.json'"));
const limitedHtml = fs.readFileSync(path.join(noNutritionOutput, 'index.html'), 'utf8');
assert('disabled-tally-skips-intro', limitedHtml.includes('"showIntroOnLoad": false'));
assert('disabled-coach-reports-remove-endpoint', limitedHtml.includes('"reportEndpoint": ""') && limitedHtml.includes('"coachMaxEndpoint": ""'));

const legacy = run(generator, [path.join(repo, 'program.example.json'), path.join(root, 'legacy-output')]);
assert('historical-combined-format-is-rejected', legacy.status !== 0 && ((legacy.stdout || '') + (legacy.stderr || '')).includes('historical program.example.json'));

if (failed) {
  console.error('\n' + failed + ' generator test(s) failed.');
  process.exit(1);
}
console.log('\nAll generator tests passed.');
