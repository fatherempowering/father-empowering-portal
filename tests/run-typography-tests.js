#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const repo = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(repo, 'index.html'), 'utf8');
let failed = 0;

function assert(name, condition, detail) {
  if (condition) console.log('PASS ' + name);
  else {
    failed++;
    console.error('FAIL ' + name + (detail ? ' - ' + detail : ''));
  }
}

const styleMatch = source.match(/<style id="fe-accessible-typography">([\s\S]*?)<\/style>/);
const style = styleMatch ? styleMatch[1] : '';

assert('accessible-typography-style-exists', Boolean(styleMatch));
assert('light-secondary-text-is-6b6b6b', source.includes('--txt3:#6B6B6B'));
assert('dark-secondary-text-is-brighter', source.includes('[data-theme="dark"]') && source.includes('--txt3:#A3A3A3'));
assert('mobile-readable-body-baseline', style.includes('@media(max-width:759px)') && style.includes('body{font-size:16px;line-height:1.5}'));
assert('compact-label-floor-is-12px', style.includes('.hdr-protocol,.hdr-chip') && style.includes('font-size:12px;'));
assert('supporting-copy-is-13px', style.includes('.hdr-welcome,.settings-sub') && style.includes('font-size:13px;'));
assert('exercise-name-is-16px', style.includes('.ex-name{font-size:16px;line-height:1.35}'));
assert('prescribed-values-are-15px', style.includes('.ex-target,.mens-name,.mens-val') && style.includes('font-size:15px'));
assert('entered-values-are-16px', style.includes('.set-result-input,.ex-input,.duration-input') && style.includes('.ci-input,.ci-select') && style.includes('font-size:16px;'));
assert('supporting-copy-drops-display-spacing', style.includes('letter-spacing:0;') && style.includes('text-transform:none;'));
assert('compact-training-headings-are-separated', source.includes('class="ex-th-short"') && style.includes('.ex-th-full{display:none}') && style.includes('.ex-th-short{display:inline}'));
assert('narrow-phone-cues-use-own-row', style.includes('@media(max-width:359px)') && style.includes('.ex-row .ex-note{grid-column:1/-1;grid-row:3'));

if (failed) {
  console.error('\n' + failed + ' typography test(s) failed.');
  process.exit(1);
}

console.log('\nAll typography tests passed.');
