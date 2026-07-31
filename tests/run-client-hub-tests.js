#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const repo = path.resolve(__dirname, '..');
const hubPath = path.join(repo, 'clients', 'index.html');
const registryPath = path.join(repo, 'clients', 'registry.json');
const syncScript = path.join(repo, 'scripts', 'sync-client-registry.js');
const hubSource = fs.readFileSync(hubPath, 'utf8');
let failed = 0;

function assert(name, condition, detail) {
  if (condition) console.log('PASS ' + name);
  else { failed++; console.error('FAIL ' + name + (detail ? ' - ' + detail : '')); }
}
function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function writeJson(file, value) { fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n'); }
function run(args) { return spawnSync(process.execPath, [syncScript].concat(args), { encoding: 'utf8' }); }
function output(result) { return (result.stdout || '') + (result.stderr || ''); }

assert('hub-page-exists', fs.existsSync(hubPath));
assert('hub-is-not-indexed-by-search-engines', hubSource.includes('name="robots" content="noindex,nofollow,noarchive"'));
assert('hub-loads-canonical-registry', hubSource.includes("fetch('./registry.json?ts='"));
assert('hub-has-search-filter-and-sort', ['client-search', 'status-filter', 'sort-order'].every((id) => hubSource.includes('id="' + id + '"')));
assert('hub-has-responsive-client-grid', hubSource.includes('.client-grid') && hubSource.includes('@media(max-width:640px)'));
assert('hub-builds-cards-with-safe-dom-apis', hubSource.includes('textContent=text') && !hubSource.includes('innerHTML'));
assert('hub-does-not-request-private-client-data', !/email|photos|measurements|mensurations/i.test(hubSource));
assert('hub-links-use-relative-client-slugs', hubSource.includes("new URL('./'+encodeURIComponent(slug)+'/',window.location.href)"));

const inlineScripts = [...hubSource.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]);
assert('hub-has-one-inline-application-script', inlineScripts.length === 1);
try { new Function(inlineScripts[0]); assert('hub-inline-script-syntax', true); }
catch (error) { assert('hub-inline-script-syntax', false, error.message); }

const rootRegistry = readJson(registryPath);
assert('root-registry-schema-is-valid', rootRegistry.schemaVersion === 'fe-client-registry-v1' && Array.isArray(rootRegistry.clients));
assert('root-registry-has-no-private-email', !JSON.stringify(rootRegistry).toLowerCase().includes('email'));

const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'fe-client-hub-tests-'));
const clientsDir = path.join(workspace, 'clients');
const clientDir = path.join(clientsDir, 'hub-test');
fs.mkdirSync(clientDir, { recursive: true });

const clientInfo = readJson(path.join(repo, 'templates', 'client-package', 'client-info.example.json'));
clientInfo.updatedAt = '2026-07-30T12:00:00-04:00';
clientInfo.client.id = 'clt_hub_test_001';
clientInfo.client.slug = 'hub-test';
clientInfo.client.displayName = 'Hub Test';
clientInfo.client.shortName = 'Hub';
clientInfo.client.startDate = '2026-08-01';
clientInfo.storage.namespace = 'hub_test';
writeJson(path.join(clientDir, 'client-info.json'), clientInfo);

const training = readJson(path.join(repo, 'docs', 'examples', 'training-program.two-week.example.json'));
training.programVersion = 'training-hub-test-phase-1-v2';
training.updatedAt = '2026-07-31T08:00:00-04:00';
training.training.phase = { id: 'transition', label: 'TRANSITION', order: 1 };
writeJson(path.join(clientDir, 'training-program.json'), training);

const nutrition = readJson(path.join(repo, 'templates', 'client-package', 'nutrition-program.example.json'));
nutrition.programVersion = 'nutrition-hub-test-v1';
nutrition.updatedAt = '2026-07-29T08:00:00-04:00';
writeJson(path.join(clientDir, 'nutrition-program.json'), nutrition);

writeJson(path.join(clientsDir, 'registry.json'), {
  schemaVersion: 'fe-client-registry-v1',
  updatedAt: '',
  clients: [{
    id: 'clt_hub_test_001', slug: 'hub-test', displayName: 'Old Name', shortName: 'Old', namespace: 'hub_test',
    status: 'onboarding', createdAt: '2026-07-01T00:00:00-04:00', startDate: '', path: 'clients/hub-test', urlPath: '/clients/hub-test/'
  }]
});

const synchronized = run(['--workspace', workspace]);
assert('registry-sync-succeeds', synchronized.status === 0 && output(synchronized).includes('CLIENT REGISTRY UPDATED'), output(synchronized));
const synced = readJson(path.join(clientsDir, 'registry.json')).clients[0];
assert('registry-sync-refreshes-public-identity', synced.displayName === 'Hub Test' && synced.shortName === 'Hub' && synced.namespace === 'hub_test');
assert('registry-sync-detects-active-program', synced.status === 'active' && synced.totalWeeks === 2);
assert('registry-sync-records-phase-and-version', synced.phaseId === 'transition' && synced.phaseLabel === 'TRANSITION' && synced.programVersion === 'training-hub-test-phase-1-v2');
assert('registry-sync-records-nutrition-state', synced.nutritionEnabled === true && synced.nutritionVersion === 'nutrition-hub-test-v1');
assert('registry-sync-preserves-created-at', synced.createdAt === '2026-07-01T00:00:00-04:00');
assert('registry-sync-keeps-no-email', !JSON.stringify(synced).toLowerCase().includes('email'));

const dryRun = run(['--workspace', workspace, '--dry-run']);
assert('registry-dry-run-validates-without-writing', dryRun.status === 0 && output(dryRun).includes('CLIENT REGISTRY VALID'), output(dryRun));

if (failed) {
  console.error('\n' + failed + ' client hub test(s) failed.');
  process.exit(1);
}
console.log('\nAll client hub tests passed.');
