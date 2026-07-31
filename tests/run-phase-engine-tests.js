#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const indexPath = path.resolve(__dirname, '..', 'index.html');
const source = fs.readFileSync(indexPath, 'utf8');
let failed = false;

function pass(name) {
  console.log('PASS ' + name);
}

function fail(name, detail) {
  failed = true;
  console.error('FAIL ' + name + (detail ? ' - ' + detail : ''));
}

function assert(name, condition, detail) {
  if (condition) pass(name);
  else fail(name, detail);
}

function extractFunction(name) {
  const marker = 'function ' + name + '(';
  const start = source.indexOf(marker);
  if (start < 0) throw new Error('Missing function ' + name);
  const declarationStart = source.slice(Math.max(0, start - 6), start) === 'async ' ? start - 6 : start;
  const brace = source.indexOf('{', start);
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let i = brace; i < source.length; i++) {
    const char = source[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }
    if (char === '{') depth++;
    if (char === '}' && --depth === 0) return source.slice(declarationStart, i + 1);
  }
  throw new Error('Unclosed function ' + name);
}

const inlineScripts = [...source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
  .map((match) => match[1])
  .filter((script) => script.trim());

inlineScripts.forEach((script, index) => {
  try {
    new vm.Script(script, { filename: 'index-inline-' + (index + 1) + '.js' });
    pass('inline-script-' + (index + 1) + '-syntax');
  } catch (error) {
    fail('inline-script-' + (index + 1) + '-syntax', error.message);
  }
});

const context = {
  phaseId(value) {
    return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }
};
vm.createContext(context);
vm.runInContext(extractFunction('phaseDescriptorForTrainingRecord'), context);
vm.runInContext(extractFunction('phaseTransitionRequired'), context);

const phase1v1 = { training: { plan: { phase: { id: 'phase-1', label: 'PHASE 1', order: 1 } }, version: 'p1-v1' } };
const phase1v2 = { training: { plan: { phase: { id: 'phase-1', label: 'PHASE 1', order: 1 } }, version: 'p1-v2' } };
const phase2v1 = { training: { plan: { phase: { id: 'phase-2', label: 'PHASE 2', order: 2 } }, version: 'p2-v1' } };

assert('same-phase-version-update-does-not-transition', !context.phaseTransitionRequired(phase1v2, phase1v1));
assert('different-phase-id-requires-transition', context.phaseTransitionRequired(phase2v1, phase1v1));
assert('missing-explicit-phase-does-not-transition', !context.phaseTransitionRequired({ training: { plan: {}, version: 'legacy-v2' } }, phase1v1));
assert('phase-archive-keeps-program-snapshot', source.includes('program:phaseClone((currentRecord&&currentRecord.plan)||TRAINING_CONFIG)'));
assert('phase-transition-resets-active-results', source.includes('D.seances={};') && source.includes('D.checkins=[];') && source.includes('D.unlockedWeek=1;'));
assert('phase-transition-preserves-week-zero', !/transitionToTrainingPhase[\s\S]*?D\.weekZero\s*=/.test(source.slice(source.indexOf('async function transitionToTrainingPhase'), source.indexOf('async function rollbackLastPhaseTransition'))));
assert('phase-transition-is-client-confirmed', source.includes("confirmText:isPhaseTransition?'START NEW PHASE':'UPDATE NOW'"));
assert('photos-use-phase-archive-prefix', source.includes("'phase_'+slugPart(phaseId)+'_photo_s'"));
assert('transition-backup-is-written', source.includes('PHASE_TRANSITION_BACKUP_KEY'));
assert('rollback-path-is-present', source.includes('rollbackLastPhaseTransition(before.training)'));

const updateContext = {
  pendingPortalUpdate: phase1v2,
  currentPlanRecords() { return phase1v1; },
  phaseTransitionRequired() { return false; },
  phaseDescriptorForTrainingRecord() { return { id: 'phase-1', label: 'PHASE 1', order: 1 }; },
  updateMessageFor() { return 'Program update'; },
  async appConfirm() { return true; },
  async transitionToTrainingPhase() {},
  applyAndStorePortalUpdate(records) {
    updateContext.pendingPortalUpdate = null;
    return records;
  },
  D: { activePhase: { id: 'phase-1', label: 'PHASE 1', order: 1 } },
  save() {},
  async rollbackLastPhaseTransition() {},
  console,
  updateAlert: '',
  async appAlert(title) { updateContext.updateAlert = title; },
  refreshPortalAfterPlanUpdate() {},
  navigator: {},
  localStorage: { setItem() {} },
  PLAN_NOTICE_KEY: 'test-plan-notice',
  planFingerprint() { return 'p1-v2'; },
  markSaveStatus() {}
};
vm.createContext(updateContext);
vm.runInContext(extractFunction('confirmAndApplyPendingUpdate'), updateContext);

(async () => {
  try {
    const applied = await updateContext.confirmAndApplyPendingUpdate();
    assert('same-phase-update-survives-pending-state-clear', applied === true, 'Update returned false after clearing pending state.');
    assert('same-phase-update-reaches-success-message', updateContext.updateAlert === 'PORTAL UPDATED', 'Unexpected alert: ' + updateContext.updateAlert);
  } catch (error) {
    fail('same-phase-update-survives-pending-state-clear', error.message);
  }

  if (failed) process.exit(1);
  console.log('\nAll phase engine tests passed.');
})();
