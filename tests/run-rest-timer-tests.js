#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repo = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(repo, 'index.html'), 'utf8');
let failed = 0;

function extractFunction(name) {
  const start = source.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('Missing function ' + name);
  const brace = source.indexOf('{', start);
  let depth = 0, quote = '', escaped = false;
  for (let i = brace; i < source.length; i++) {
    const char = source[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'" || char === '`') { quote = char; continue; }
    if (char === '{') depth++;
    if (char === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error('Unclosed function ' + name);
}

function assert(name, condition, detail) {
  if (condition) console.log('PASS ' + name);
  else {
    failed++;
    console.error('FAIL ' + name + (detail ? ' - ' + detail : ''));
  }
}

const context = {};
vm.createContext(context);
vm.runInContext(extractFunction('normalizeRestTimerSeconds'), context);

assert('timer-uses-30-second-prescription', context.normalizeRestTimerSeconds(30) === 30);
assert('timer-uses-75-second-prescription', context.normalizeRestTimerSeconds(75) === 75);
assert('timer-uses-100-second-prescription', context.normalizeRestTimerSeconds(100) === 100);
assert('timer-accepts-json-number-string', context.normalizeRestTimerSeconds('90') === 90);
assert('timer-rounds-fractional-seconds', context.normalizeRestTimerSeconds(60.4) === 60);
assert('timer-rejects-zero-rest', context.normalizeRestTimerSeconds(0) === 0);
assert('timer-rejects-missing-rest', context.normalizeRestTimerSeconds(undefined) === 0);
assert('timer-caps-invalid-long-rest', context.normalizeRestTimerSeconds(5000) === 3600);

const buildStart = source.indexOf('function buildExCard(');
const buildEnd = source.indexOf('function buildSeanceHTML(', buildStart);
const buildSource = source.slice(buildStart, buildEnd);
const timerStart = source.indexOf('function startTimer(');
const timerEnd = source.indexOf('function renderTimer(', timerStart);
const timerSource = source.slice(timerStart, timerEnd);

assert('exercise-passes-prescribed-rest-to-timer', buildSource.includes('normalizeRestTimerSeconds(ex.restSeconds)') && buildSource.includes("+restSeconds+')\""));
assert('zero-rest-exercise-hides-timer-button', buildSource.includes("const timerButton=restSeconds?"));
assert('timer-does-not-reset-to-two-minutes', !timerSource.includes('_timerSec=120'));
assert('timer-starts-from-selected-exercise-rest', timerSource.includes('_timerSec=normalizeRestTimerSeconds(seconds)'));

const clientTraining = JSON.parse(fs.readFileSync(path.join(repo, 'clients/maxime-bourdon/training-program.json'), 'utf8'));
const prescribedRests = [];
for (const week of clientTraining.training.weeks || []) {
  for (const session of Object.values(week.sessions || {})) {
    for (const block of session.blocks || []) {
      for (const exercise of block.exercises || []) prescribedRests.push(exercise.prescription && exercise.prescription.restSeconds);
    }
  }
}
assert('client-plan-has-variable-rest-times', new Set(prescribedRests.filter(value => value > 0)).size > 3);
assert('client-positive-rest-times-are-supported', prescribedRests.filter(value => value > 0).every(value => context.normalizeRestTimerSeconds(value) === value));

if (failed) {
  console.error('\n' + failed + ' rest timer test(s) failed.');
  process.exit(1);
}
console.log('\nAll prescribed rest timer tests passed.');
