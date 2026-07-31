#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');
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
  else { failed++; console.error('FAIL ' + name + (detail ? ' - ' + detail : '')); }
}

const portal = {};
vm.createContext(portal);
['prescribedSetCount', 'exactTargetNumber', 'strictActualNumber', 'legacySetResults', 'setResultVolume', 'setResultLoadTotal', 'setResultBestLoad'].forEach((name) => {
  vm.runInContext(extractFunction(name), portal);
});

assert('fixed-prescription-creates-three-rows', portal.prescribedSetCount(3) === 3);
assert('set-range-uses-maximum-row-count', portal.prescribedSetCount('2-3') === 3);
assert('exact-pound-target-is-prefilled', portal.exactTargetNumber('120 lb', 'lb') === '120');
assert('target-range-is-not-treated-as-actual-load', portal.exactTargetNumber('100-120 lb', 'lb') === '');
assert('strict-number-accepts-decimal-pounds', portal.strictActualNumber('120.5 lb', true) === 120.5);
assert('strict-number-rejects-repetition-range', portal.strictActualNumber('8-10', false) === null);

const results = [
  { set: 1, load: '120', reps: '10', rir: '3' },
  { set: 2, load: '130', reps: '9', rir: '2' },
  { set: 3, load: '125', reps: '8', rir: '1' }
];
assert('volume-is-summed-per-series', portal.setResultVolume(results) === 3370, String(portal.setResultVolume(results)));
assert('weekly-load-indicator-sums-series-loads', portal.setResultLoadTotal(results) === 375);
assert('best-load-preserves-key-lift-tracking', portal.setResultBestLoad(results) === 130);
assert('incomplete-range-result-does-not-add-volume', portal.setResultVolume([{ load: '120', reps: '8-10', rir: '3' }]) === 0);

const legacyRecord = { charges: { cable_row: '120' }, actuals: { cable_row: { sets: '3', reps: '10' } } };
const migrated = portal.legacySetResults({ key: 'cable_row', sets: 3, reps: '10', targetRir: 3 }, legacyRecord);
assert('legacy-aggregate-result-remains-readable', migrated.length === 3 && portal.setResultVolume(migrated) === 3600);
assert('legacy-record-is-not-destructively-rewritten', !Object.prototype.hasOwnProperty.call(legacyRecord, 'setResults'));

assert('prescription-is-rendered-as-static-text', source.includes('class="ex-prescribed"') && source.includes('class="ex-prescribed-reps"'));
assert('results-store-load-reps-and-rir-only', source.includes('setResults[key]=rows') && source.includes("rir:((rirInputs[index]&&rirInputs[index].value)||'').trim()"));
assert('no-pain-or-per-exercise-note-field-is-added', !source.includes('set-pain-input') && !source.includes('set-note-input'));
assert('general-session-note-remains', source.includes('SESSION NOTES') && source.includes('id="notes-'));
assert('new-results-appear-in-history', source.includes('formatSetResultsHTML(w,rec.setResults)'));
assert('new-results-appear-in-coach-report', source.includes("if(rec.setResults&&Object.keys(rec.setResults).length)"));

if (failed) {
  console.error('\n' + failed + ' set-results test(s) failed.');
  process.exit(1);
}
console.log('\nAll per-set result tests passed.');
