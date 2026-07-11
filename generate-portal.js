#!/usr/bin/env node
/*
  FATHER EMPOWERING — PORTAL GENERATOR
  Usage:  node generate-portal.js program.json [output-folder]

  Reads a program.json ({ config: {...} } — same shape as TEMPLATE_CONFIG,
  only include the keys you want to override) and produces a ready-to-deploy
  client portal from the master template (index.html in this folder).

  From 2 hours of manual editing to under 1 minute per client.
*/
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
if (!args[0]) {
  console.error('Usage: node generate-portal.js program.json [output-folder]');
  process.exit(1);
}

const programPath = args[0];
const pkg = JSON.parse(fs.readFileSync(programPath, 'utf8'));
const config = pkg.config || pkg; // accept {config:{...}} or bare config

const templatePath = path.join(__dirname, 'index.html');
let html = fs.readFileSync(templatePath, 'utf8');

const START = '/*FE_CONFIG_START*/';
const END = '/*FE_CONFIG_END*/';
const s = html.indexOf(START);
const e = html.indexOf(END);
if (s === -1 || e === -1) {
  console.error('ERROR: FE_CONFIG markers not found in template index.html');
  process.exit(1);
}

// Extract the default TEMPLATE_CONFIG by evaluating the marked block
const defaultBlock = html.slice(s + START.length, e);
const sandbox = {};
new Function(defaultBlock + '; this.__cfg = TEMPLATE_CONFIG;').call(sandbox);
const defaults = sandbox.__cfg;

// Deep-merge overrides into defaults (objects merge, arrays/values replace)
function merge(target, src) {
  for (const k of Object.keys(src)) {
    if (src[k] && typeof src[k] === 'object' && !Array.isArray(src[k])
      && target[k] && typeof target[k] === 'object' && !Array.isArray(target[k])) {
      merge(target[k], src[k]);
    } else {
      target[k] = src[k];
    }
  }
  return target;
}
const finalConfig = merge(JSON.parse(JSON.stringify(defaults)), config);
finalConfig.storage = finalConfig.storage || {};
finalConfig.storage.trainingProgramUrl = finalConfig.storage.trainingProgramUrl || 'training-program.json';
finalConfig.storage.nutritionProgramUrl = finalConfig.storage.nutritionProgramUrl || 'nutrition-program.json';

// Safety checks: unique slugs are mandatory (storage-key collisions)
const c = finalConfig.client || {};
if (!c.clientSlug || c.clientSlug === 'client-template') {
  console.error('ERROR: program.json must set client.clientSlug (unique per client).');
  process.exit(1);
}
if (!c.programSlug || c.programSlug === 'protocol-template') {
  console.error('ERROR: program.json must set client.programSlug.');
  process.exit(1);
}
// Client portals should not run template legacy migration
if (finalConfig.storage) {
  finalConfig.storage.legacyDataKeys = [];
  finalConfig.storage.legacyThemeKeys = [];
  finalConfig.storage.legacyCoachSessionKeys = [];
  finalConfig.storage.legacyPhotoDbs = [];
}

const newBlock = '\nconst TEMPLATE_CONFIG=' + JSON.stringify(finalConfig, null, 2) + ';\n';
html = html.slice(0, s + START.length) + newBlock + html.slice(e);

// Personalize <title>
if (c.documentTitle) {
  html = html.replace(/<title>[^<]*<\/title>/, '<title>' + c.documentTitle + '</title>');
}

// Write output
const outDir = args[1] || path.join(__dirname, 'clients', c.clientSlug);
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'index.html'), html);

// Programs are deployed separately so they can change without erasing client history.
const now = new Date().toISOString();
const trainingVersion = (pkg.trainingProgramVersion || (finalConfig.training && finalConfig.training.programVersion) || ('training-' + now.slice(0,10)));
const nutritionVersion = (pkg.nutritionProgramVersion || (finalConfig.nutrition && finalConfig.nutrition.programVersion) || ('nutrition-' + now.slice(0,10)));
fs.writeFileSync(path.join(outDir, 'training-program.json'), JSON.stringify({
  schemaVersion: 1,
  programVersion: trainingVersion,
  updatedAt: now,
  updateTitle: pkg.updateTitle || 'CoachMax has prepared an update for your protocol.',
  updateMessage: pkg.trainingUpdateMessage || pkg.updateMessage || 'A new training phase or adjustment is ready.',
  releaseNotes: pkg.trainingReleaseNotes || pkg.releaseNotes || [],
  training: finalConfig.training
}, null, 2) + '\n');
fs.writeFileSync(path.join(outDir, 'nutrition-program.json'), JSON.stringify({
  schemaVersion: 1,
  programVersion: nutritionVersion,
  updatedAt: now,
  updateTitle: pkg.updateTitle || 'CoachMax has prepared an update for your protocol.',
  updateMessage: pkg.nutritionUpdateMessage || pkg.updateMessage || 'Your nutrition plan has been adjusted.',
  releaseNotes: pkg.nutritionReleaseNotes || pkg.releaseNotes || [],
  nutrition: finalConfig.nutrition
}, null, 2) + '\n');

// Copy static assets + bump SW cache per client
const assets = ['site.webmanifest', 'apple-touch-icon.png', 'favicon-16x16.png', 'favicon-32x32.png',
  'icon-192.png', 'icon-512.png', 'fe-logo-home.png', 'fe-logo-splash.png',
  'fe-logo-part-f.png', 'fe-logo-part-e.png', 'fe-logo-part-wordbar.png'];
for (const a of assets) {
  const src = path.join(__dirname, a);
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(outDir, a));
}
const iconsDir = path.join(__dirname, 'measure-icons');
if (fs.existsSync(iconsDir)) {
  fs.mkdirSync(path.join(outDir, 'measure-icons'), { recursive: true });
  for (const f of fs.readdirSync(iconsDir)) {
    fs.copyFileSync(path.join(iconsDir, f), path.join(outDir, 'measure-icons', f));
  }
}
const swSrc = path.join(__dirname, 'sw.js');
if (fs.existsSync(swSrc)) {
  let sw = fs.readFileSync(swSrc, 'utf8');
  const stamp = new Date().toISOString().slice(0, 10);
  sw = sw.replace(/const CACHE_NAME='[^']*'/,
    "const CACHE_NAME='fe-" + c.clientSlug + "-" + stamp + "-" + Date.now().toString(36) + "'");
  fs.writeFileSync(path.join(outDir, 'sw.js'), sw);
}

console.log('✓ Portal generated: ' + outDir);
console.log('  Client:  ' + (c.athleteName || '?'));
console.log('  Slug:    ' + c.clientSlug + ' / ' + c.programSlug);
console.log('  Weeks:   ' + (c.totalWeeks || defaults.client.totalWeeks));
console.log('  Endpoint:' + ((finalConfig.storage && finalConfig.storage.reportEndpoint) || ' (NOT SET — reports will use clipboard fallback)'));
