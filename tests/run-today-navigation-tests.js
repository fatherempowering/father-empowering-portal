#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');
let failed = 0;

function extractFunction(name) {
  const marker = 'function ' + name + '(';
  const start = source.indexOf(marker);
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

const catalog = [
  { id: 'posterior-lats', schedule: { suggestedDay: 'MON' } },
  { id: 'quads-lats', schedule: { suggestedDay: 'FRI' } },
  { id: 'chest-arms', schedule: { suggestedDay: 'SAT' } },
  { id: 'complete-rest', type: 'complete-rest', schedule: { suggestedDay: 'SUN' } }
];

const context = {
  CLIENT_PROFILE: { timezone: 'America/Montreal' },
  TRAINING_CONFIG: { sessionCatalog: catalog },
  getPortalActiveWeek() { return 1; },
  configuredSessionIdsForWeek(week) {
    return week === 1
      ? ['quads-lats', 'chest-arms', 'complete-rest']
      : ['posterior-lats', 'quads-lats', 'chest-arms', 'complete-rest'];
  },
  trainingSessionCatalog() { return catalog; },
  phaseId(value) {
    return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }
};
vm.createContext(context);
['clientDayCode', 'scheduledSessionIdForDay', 'todaySeanceId'].forEach((name) => {
  vm.runInContext(extractFunction(name), context);
});

assert('client-timezone-controls-calendar-day', context.clientDayCode('2026-08-02T02:00:00Z') === 'SAT');
assert('partial-week-friday-opens-day-4', context.todaySeanceId(1, '2026-07-31T16:00:00-04:00') === 'quads-lats');
assert('partial-week-saturday-opens-day-5', context.todaySeanceId(1, '2026-08-01T16:00:00-04:00') === 'chest-arms');
assert('partial-week-sunday-opens-complete-rest', context.todaySeanceId(1, '2026-08-02T16:00:00-04:00') === 'complete-rest');
assert('partial-week-does-not-open-hidden-monday-session', context.todaySeanceId(1, '2026-08-03T16:00:00-04:00') === null);
assert('full-week-monday-opens-day-1', context.todaySeanceId(2, '2026-08-03T16:00:00-04:00') === 'posterior-lats');

const selectSource = extractFunction('selectTrainingDayForToday');
assert('today-navigation-selects-by-permanent-session-id', selectSource.includes('button.dataset.seance===sid'));
assert('today-navigation-does-not-use-catalog-position', !selectSource.includes('SEANCE_IDS.indexOf(sid)'));
assert('start-button-routes-through-today-selection', extractFunction('startTodaysSession').includes("showPanel('entrainement'"));
assert('training-tab-routes-through-today-selection', source.includes("if(name==='entrainement'&&!(opts&&opts.keepSelectedWeek)){selectTrainingDayForToday();}"));

if (failed) {
  console.error('\n' + failed + ' today-navigation test(s) failed.');
  process.exit(1);
}
console.log('\nAll today-navigation tests passed.');
