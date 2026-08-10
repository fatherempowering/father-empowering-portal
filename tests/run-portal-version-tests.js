#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const repo = path.resolve(__dirname, '..');
const release = JSON.parse(fs.readFileSync(path.join(repo, 'version.json'), 'utf8'));
const portal = fs.readFileSync(path.join(repo, 'index.html'), 'utf8');
const worker = fs.readFileSync(path.join(repo, 'sw.js'), 'utf8');
const generator = fs.readFileSync(path.join(repo, 'generate-portal.js'), 'utf8');
let failed = 0;

function assert(name, condition, detail) {
  if (condition) console.log('PASS ' + name);
  else {
    failed++;
    console.error('FAIL ' + name + (detail ? ' - ' + detail : ''));
  }
}

assert('release-schema-is-official', release.schemaVersion === 'fe-portal-release-v1');
assert('release-version-is-semver', /^\d+\.\d+\.\d+$/.test(release.version));
assert('release-date-is-iso', /^\d{4}-\d{2}-\d{2}$/.test(release.releasedAt));
assert('release-channel-is-production', release.channel === 'production');
assert('template-version-matches-release', portal.includes("portalVersion:'" + release.version + "'") && portal.includes("portalReleasedAt:'" + release.releasedAt + "'"));
assert('about-shows-installed-version', portal.includes('function showAbout()') && portal.includes("tr('Portal Version')") && portal.includes('CLIENT_PROFILE.portalVersion'));
assert('settings-do-not-duplicate-version', !portal.includes('id="portal-version-value"') && !portal.includes('id="portal-version-date"') && !portal.includes('id="portal-version-status"'));
assert('release-check-bypasses-http-cache', portal.includes("fetch('./version.json?portal_check='+Date.now(),{cache:'no-store'})"));
assert('service-worker-update-bypasses-script-cache', portal.includes("register('./sw.js',{updateViaCache:'none'})") && portal.includes('await registration.update()'));
assert('client-data-is-preserved-during-reload', portal.includes('Your training results and local data will stay saved.') && !portal.includes("reloadIntoPortalRelease(release){\n  localStorage.clear"));
assert('release-update-is-client-confirmed', portal.includes("confirmText:'UPDATE NOW'") && portal.includes("cancelText:'LATER'"));
assert('release-file-is-offline-capable', worker.includes("'./version.json'") && worker.includes("url.pathname.endsWith('/version.json')"));
assert('navigation-bypasses-ten-minute-cache', worker.includes("fetch(req,{cache:'no-store'}).then(res=>{"));
assert('generator-copies-and-compiles-release', generator.includes("readRepoJson('version.json')") && generator.includes("'version.json'") && generator.includes('portalReleasedAt'));

if (failed) {
  console.error('\n' + failed + ' portal version test(s) failed.');
  process.exit(1);
}

console.log('\nAll portal version tests passed.');
