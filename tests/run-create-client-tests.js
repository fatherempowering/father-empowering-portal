#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const repo = path.resolve(__dirname, '..');
const creator = path.join(repo, 'scripts', 'create-client.js');
const validator = path.join(repo, 'scripts', 'validate-client-package.js');
const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'fe-create-client-tests-'));
let failed = 0;

function run(script, args) {
  return spawnSync(process.execPath, [script].concat(args), { encoding: 'utf8' });
}

function output(result) {
  return (result.stdout || '') + (result.stderr || '');
}

function assert(name, condition, detail) {
  if (condition) console.log('PASS ' + name);
  else {
    failed++;
    console.error('FAIL ' + name + (detail ? ' - ' + detail : ''));
  }
}

const first = run(creator, [
  '--name', 'Émile Test',
  '--short-name', 'Émile',
  '--client-id', 'clt_emile_test_001',
  '--language', 'fr-ca',
  '--timezone', 'America/Montreal',
  '--start-date', '2026-08-10',
  '--slogan', 'BÂTIR UN PÈRE PLUS FORT',
  '--tally-url', 'https://tally.so/r/test123',
  '--workspace', workspace
]);
assert('client-creation-succeeds', first.status === 0, output(first));
assert('client-creation-reports-ready', output(first).includes('CLIENT PORTAL READY'), output(first));

const clientDir = path.join(workspace, 'clients', 'emile-test');
assert('accented-name-produces-safe-slug', fs.existsSync(clientDir));
[
  'client-info.json',
  'training-program.json',
  'nutrition-program.json',
  'index.html',
  'i18n.js',
  'site.webmanifest',
  'sw.js',
  'fe-logo-home.png'
].forEach((name) => assert('created-file-' + name, fs.existsSync(path.join(clientDir, name))));

const info = JSON.parse(fs.readFileSync(path.join(clientDir, 'client-info.json'), 'utf8'));
assert('permanent-id-is-preserved', info.client.id === 'clt_emile_test_001');
assert('identity-fields-are-filled', info.client.displayName === 'Émile Test' && info.client.shortName === 'Émile');
assert('namespace-is-derived', info.storage.namespace === 'emile_test');
assert('onboarding-is-initial-state', info.client.coachingState.phase === 'onboarding' && info.client.coachingState.initialStatus === 'week-zero-required');
assert('tally-is-configured', info.integrations.tally.publicFormUrl === 'https://tally.so/r/test123');
assert('administrative-email-is-not-published', !JSON.stringify(info).toLowerCase().includes('email'));

const registryPath = path.join(workspace, 'clients', 'registry.json');
const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
assert('registry-has-one-client', registry.clients.length === 1);
assert('registry-has-no-email', !JSON.stringify(registry).toLowerCase().includes('email'));
assert('registry-has-permanent-url-path', registry.clients[0].urlPath === '/clients/emile-test/');
assert('registry-has-card-summary', registry.clients[0].phaseId === 'phase-1' && registry.clients[0].phaseLabel === 'PHASE 1' && registry.clients[0].totalWeeks === 0);
assert('registry-has-program-versions', registry.clients[0].programVersion === 'training-emile-test-onboarding-v1' && registry.clients[0].nutritionVersion === 'nutrition-emile-test-onboarding-v1');
assert('registry-has-public-update-date', registry.clients[0].updatedAt === registry.updatedAt);

const validation = run(validator, [clientDir, '--strict']);
assert('created-client-passes-strict-validation', validation.status === 0, output(validation));

const duplicateSlug = run(creator, [
  '--name', 'Émile Test',
  '--client-id', 'clt_other_001',
  '--workspace', workspace
]);
assert('duplicate-slug-is-blocked', duplicateSlug.status !== 0 && output(duplicateSlug).includes('already exists'), output(duplicateSlug));

const duplicateId = run(creator, [
  '--name', 'Different Client',
  '--client-id', 'clt_emile_test_001',
  '--workspace', workspace
]);
assert('duplicate-id-is-blocked', duplicateId.status !== 0 && output(duplicateId).includes('already exists'), output(duplicateId));

const badUrl = run(creator, [
  '--name', 'Invalid Tally',
  '--tally-url', 'http://insecure.example.com',
  '--workspace', workspace
]);
assert('non-https-tally-is-blocked', badUrl.status !== 0 && output(badUrl).includes('valid HTTPS URL'), output(badUrl));
assert('failed-client-leaves-no-folder', !fs.existsSync(path.join(workspace, 'clients', 'invalid-tally')));

const noNutrition = run(creator, [
  '--name', 'Training Only',
  '--client-id', 'clt_training_only_001',
  '--disable-nutrition',
  '--workspace', workspace
]);
assert('nutrition-can-be-disabled', noNutrition.status === 0, output(noNutrition));
assert('disabled-nutrition-file-is-absent', !fs.existsSync(path.join(workspace, 'clients', 'training-only', 'nutrition-program.json')));

const unknownEmail = run(creator, [
  '--name', 'Email Test',
  '--email', 'private@example.com',
  '--workspace', workspace
]);
assert('email-argument-is-refused', unknownEmail.status !== 0 && output(unknownEmail).includes('Unknown argument: --email'), output(unknownEmail));

const remainingTemps = fs.readdirSync(path.join(workspace, 'clients')).filter((name) => name.startsWith('.creating-'));
assert('no-temporary-client-folders-remain', remainingTemps.length === 0);

if (failed) {
  console.error('\n' + failed + ' create-client test(s) failed.');
  process.exit(1);
}
console.log('\nAll create-client tests passed.');
