#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { validateTrainingModel } = require('../scripts/validate-training-model');

const repo = path.resolve(__dirname, '..');
const example = JSON.parse(fs.readFileSync(path.join(repo, 'docs', 'examples', 'training-program.two-week.example.json'), 'utf8'));
const portalSource = fs.readFileSync(path.join(repo, 'index.html'), 'utf8');
let failed = 0;

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function extractFunction(name) {
  const start = portalSource.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('Missing portal function ' + name);
  const brace = portalSource.indexOf('{', start);
  let depth = 0, quote = '', escaped = false;
  for (let i = brace; i < portalSource.length; i++) {
    const char = portalSource[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'" || char === '`') { quote = char; continue; }
    if (char === '{') depth++;
    if (char === '}' && --depth === 0) return portalSource.slice(start, i + 1);
  }
  throw new Error('Unclosed portal function ' + name);
}
function assert(name, condition, detail) {
  if (condition) console.log('PASS ' + name);
  else { failed++; console.error('FAIL ' + name + (detail ? ' - ' + detail : '')); }
}
function invalid(name, mutate, expected) {
  const value = clone(example);
  mutate(value);
  const result = validateTrainingModel(value, { allowEmptyWeeks: false });
  assert(name, result.errors.some((message) => message.includes(expected)), result.errors.join(' | '));
}

const valid = validateTrainingModel(example, { allowEmptyWeeks: false });
assert('official-two-week-example-is-valid', valid.errors.length === 0, valid.errors.join(' | '));
assert('two-distinct-weeks', example.training.weeks.length === 2);
assert('four-required-training-sessions', example.training.sessionCatalog.filter((item) => item.type === 'training' && item.required).length === 4);
assert('one-optional-training-session', example.training.sessionCatalog.filter((item) => item.type === 'training' && !item.required).length === 1);
assert('active-and-complete-rest-exist', ['active-recovery', 'complete-rest'].every((type) => example.training.sessionCatalog.some((item) => item.type === type)));
assert('posing-is-flexible', example.training.complementaryProtocols.some((item) => item.type === 'posing' && item.scheduleMode === 'flexible'));
assert('week-rir-can-change', example.training.weeks[0].targetRir !== example.training.weeks[1].targetRir);
assert('prescription-and-results-are-separated', !JSON.stringify(example).includes('actualLoad'));
assert('progression-requires-confirmation', example.training.progression.mode === 'coach-confirmed' && example.training.progression.clientConfirmationRequired === true);
assert('per-set-results-are-declared', ['load', 'reps', 'rir', 'pain', 'notes'].every((field) => example.training.resultTracking.perSetFields.includes(field)));

const portal = {};
vm.createContext(portal);
vm.runInContext(extractFunction('_e'), portal);
vm.runInContext(extractFunction('normalizeExercise'), portal);
const canonicalExercise = example.training.weeks[0].sessions['upper-a'].blocks[0].exercises[0];
const normalized = portal.normalizeExercise(canonicalExercise, 1, 'upper-a', 0, 0);
assert('portal-reads-canonical-prescription', normalized.sets === 3 && normalized.reps === '8-10' && normalized.target === 'Calibration load' && normalized.unit === 'lb');
assert('portal-displays-rir-rest-and-tempo', ['Target RIR 3', 'Rest 120 sec', 'Tempo 3-1-1-0'].every((part) => normalized.note.includes(part)), normalized.note);
assert('optional-session-is-excluded-from-required-completion', portalSource.includes('definition.required!==false'));

invalid('automatic-progression-is-blocked', (value) => { value.training.progression.mode = 'automatic'; }, 'coach-confirmed');
invalid('missing-per-set-pain-is-blocked', (value) => { value.training.resultTracking.perSetFields = ['load', 'reps', 'rir', 'notes']; }, '"pain"');
invalid('declared-total-weeks-is-blocked', (value) => { value.training.totalWeeks = 2; }, 'totalWeeks');
invalid('client-results-in-prescription-are-blocked', (value) => { value.training.weeks[0].sessions['upper-a'].blocks[0].exercises[0].actualLoad = 150; }, 'actualLoad');
invalid('non-sequential-weeks-are-blocked', (value) => { value.training.weeks[1].week = 3; }, 'sequential');
invalid('invalid-week-rir-is-blocked', (value) => { value.training.weeks[0].targetRir = 8; }, 'targetRir');
invalid('flexible-session-cannot-impose-day', (value) => { value.training.sessionCatalog[4].schedule.suggestedDay = 'SAT'; }, 'flexible session');
invalid('unknown-session-is-blocked', (value) => { value.training.weeks[0].sessions.unknown = { blocks: [] }; }, 'missing from sessionCatalog');
invalid('legacy-block-names-are-blocked', (value) => { value.training.weeks[0].sessions['upper-a'].blocs = []; }, 'legacy blocs/exs');
invalid('kilograms-are-blocked', (value) => { value.training.weeks[0].sessions['upper-a'].blocks[0].exercises[0].prescription.unit = 'kg'; }, 'must be lb, min, sec, distance or level');
invalid('machine-settings-are-blocked', (value) => { value.training.weeks[0].sessions['upper-a'].blocks[0].exercises[0].prescription.machineSetup = 'Seat 4'; }, 'machineSetup');

if (failed) {
  console.error('\n' + failed + ' Training model test(s) failed.');
  process.exit(1);
}
console.log('\nAll Training model tests passed.');
