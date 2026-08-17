const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repo = path.resolve(__dirname, '..');
const portal = fs.readFileSync(path.join(repo, 'index.html'), 'utf8');
const client = fs.readFileSync(path.join(repo, 'clients', 'maxime-bourdon', 'index.html'), 'utf8');
let failed = 0;

function assert(name, condition) {
  if (condition) console.log('PASS ' + name);
  else { failed += 1; console.error('FAIL ' + name); }
}

function extractFunction(source, name) {
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

for (const [label, source] of [['portal', portal], ['client', client]]) {
  assert(label + '-has-guided-overview', source.includes('function guidedOverviewHTML('));
  assert(label + '-has-full-plan-toggle', source.includes('guidedToggleOverviewPlan'));
  assert(label + '-groups-finisher', source.includes('guidedFinisher:isFinisher') && source.includes('finisherExercises:items'));
  assert(label + '-supports-explicit-supersets', source.includes("mode==='superset'") && source.includes('guidedSuperset:isSuperset') && source.includes('VALIDATE SUPERSET ROUND'));
  assert(label + '-records-load-reps-rir', source.includes("guidedSyncField(sid,'load'") && source.includes("guidedSyncField(sid,'reps'") && source.includes("guidedSyncField(sid,'rir'"));
  assert(label + '-uses-picker-controls', source.includes('guidedSelectOptions(10,rir)') && source.includes('guided-reps-'));
  assert(label + '-uses-prescribed-rest', source.includes('startTimer(ex.name,rest)'));
  assert(label + '-labels-exercise-list', source.includes("guidedText('EXERCISE LIST','LISTE DES EXERCICES')"));
  assert(label + '-uses-unambiguous-rest-unit', source.includes("return seconds+' SEC';") && source.includes("tr('Rest: {seconds} SEC'"));
  assert(label + '-validate-action-starts-dark', source.includes('class="guided-primary-btn dark" onclick="guidedValidateSet('));
  assert(label + '-timer-ring-counts-down', source.includes('--timer-angle') && source.includes('_timerTotal') && source.includes("ring.style.setProperty('--timer-angle'"));
  assert(label + '-timer-ring-empties-clockwise', source.includes('conic-gradient(rgba(255,255,255,.18) 0deg var(--timer-angle),var(--green)') && source.includes('((1-ratio)*360)'));
  assert(label + '-shows-next-exercise-media', source.includes('NEXT EXERCISE IMAGE') && source.includes('guided-next-card'));
  assert(label + '-next-exercise-label-is-simple', source.includes("guidedText('NEXT EXERCISE','PROCHAIN EXERCICE')") && !source.includes('PROCHAIN EXERCICE PRÊT'));
  assert(label + '-keeps-continuous-session-notes', source.includes('function guidedInlineNotesHTML(') && source.includes('guidedInlineNotesHTML(sid)'));
  assert(label + '-recenters-guided-card', source.includes('function guidedFocusSession(') && source.includes('guidedShowPlan(sid)'));
  assert(label + '-prescription-uses-aligned-black-header', source.includes('guided-prescription-head') && source.includes('function guidedStatsGridHTML(') && source.includes('background:var(--black)'));
  assert(label + '-has-dark-mode-surface-hierarchy', source.includes('[data-theme="dark"] .guided-session') && source.includes('--guided-surface-raised:#2A2927') && source.includes('[data-theme="dark"] .guided-entry input'));
  assert(label + '-records-real-duration', source.includes('durationSeconds') && source.includes('startedAt') && source.includes('endedAt'));
  assert(label + '-archives-guided-state', source.includes('guidedSessions:phaseClone(D.guidedSessions||{})'));
  assert(label + '-demo-is-local-only', source.includes("const GUIDED_DEMO_MODE=isLocalPortalPreview()") && source.includes("get('guided_demo')==='1'"));
}

const supersetContext = {
  WEEKS: { 1: { seances: { test: { blocs: [{ label: 'ARMS SUPERSET', mode: 'superset', restSeconds: 75, exs: [
    { key: 'curl', name: 'Barbell Curl', sets: 3, reps: '10', restSeconds: 0 },
    { key: 'pushdown', name: 'Rope Pushdown', sets: 3, reps: '12', restSeconds: 0 }
  ] }] } } } },
  guidedText(en) { return en; },
  normalizeRestTimerSeconds(value) { return Math.max(0, Number(value) || 0); },
  prescribedSetCount(value) { return Math.max(1, parseInt(value) || 1); }
};
vm.createContext(supersetContext);
vm.runInContext(extractFunction(portal, 'guidedSessionExercises'), supersetContext);
const grouped = supersetContext.guidedSessionExercises(1, 'test');
assert('superset-renders-as-one-guided-group', grouped.length === 1 && grouped[0].guidedSuperset === true && grouped[0].finisherExercises.length === 2);
assert('superset-uses-block-rest-after-round', grouped[0].restSeconds === 75 && grouped[0].sets === 3);

if (failed) {
  console.error('\n' + failed + ' guided workout test(s) failed.');
  process.exit(1);
}

console.log('\nAll guided workout tests passed.');
