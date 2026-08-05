#!/usr/bin/env node

const fs=require('fs');
const path=require('path');
const vm=require('vm');
const repo=path.resolve(__dirname,'..');
let failed=0;
function assert(name,condition,detail){
  if(condition)console.log('PASS '+name);
  else{failed++;console.error('FAIL '+name+(detail?' - '+detail:''));}
}

const source=fs.readFileSync(path.join(repo,'i18n.js'),'utf8');
const context={window:{}};
vm.createContext(context);
vm.runInContext(source,context);
const i18n=context.window.FE_I18N;
assert('language-engine-is-exported',!!i18n);
assert('fr-ca-normalizes-to-french',i18n.normalizeLanguage('fr-ca')==='fr');
assert('english-normalizes-to-english',i18n.normalizeLanguage('en-CA')==='en');
assert('french-static-translation',i18n.t('TRAINING',null,'fr')==='ENTRAÎNEMENT');
assert('english-static-translation',i18n.t('TRAINING',null,'en')==='TRAINING');
assert('interpolated-translation',i18n.t('Welcome back, {name}.',{name:'Max'},'fr')==='Bon retour, Max.');
assert('pattern-translation',i18n.t('WEEK 3',null,'fr')==='SEMAINE 3');
assert('localized-object-french',i18n.localized({en:'Training',fr:'Entraînement'},'fr')==='Entraînement');
assert('localized-object-english',i18n.localized({en:'Training',fr:'Entraînement'},'en')==='Training');

let textWrites=0;
let currentNodeValue='TRAINING';
const textNode={nodeType:3};
Object.defineProperty(textNode,'nodeValue',{get(){return currentNodeValue;},set(value){textWrites++;currentNodeValue=value;}});
const bodyNode={nodeType:1,hasAttribute(){return false;}};
const domContext={
  window:{},
  localStorage:{getItem(){return null;},setItem(){}},
  NodeFilter:{SHOW_ELEMENT:1,SHOW_TEXT:4},
  CustomEvent:function(){},
  MutationObserver:function(){this.observe=function(){};},
  document:{
    body:bodyNode,
    documentElement:{setAttribute(){}},
    createTreeWalker(){let sent=false;return{nextNode(){if(sent)return null;sent=true;return textNode;}};},
    querySelectorAll(){return[];},
    dispatchEvent(){}
  }
};
vm.createContext(domContext);
vm.runInContext(source,domContext);
domContext.window.FE_I18N.configure({storageKey:'test-language',defaultLanguage:'fr'});
const writesAfterFirstTranslation=textWrites;
domContext.window.FE_I18N.apply('fr');
assert('same-language-application-is-idempotent',textWrites===writesAfterFirstTranslation,'repeated text writes can trigger an observer loop');
domContext.window.FE_I18N.apply('en');
const writesAfterEnglish=textWrites;
domContext.window.FE_I18N.apply('en');
assert('english-application-is-idempotent',textWrites===writesAfterEnglish,'repeated text writes can trigger an observer loop');

const portal=fs.readFileSync(path.join(repo,'index.html'),'utf8');
const sw=fs.readFileSync(path.join(repo,'sw.js'),'utf8');
const generator=fs.readFileSync(path.join(repo,'generate-portal.js'),'utf8');
assert('settings-has-two-language-buttons',portal.includes('data-language-choice="fr"')&&portal.includes('data-language-choice="en"'));
assert('preference-has-client-specific-storage-key',portal.includes("'_language_v1'"));
assert('language-survives-offline',sw.includes("'./i18n.js'"));
assert('generator-copies-language-engine',generator.includes("'i18n.js'"));

for(const file of ['training-program.json','templates/client-package/training-program.example.json','clients/maxime-bourdon/training-program.json']){
  const data=JSON.parse(fs.readFileSync(path.join(repo,file),'utf8'));
  const phase=data.training.phase.label;
  assert(file+'-has-bilingual-phase',phase&&typeof phase==='object'&&phase.en&&phase.fr);
  let exerciseNamesAreStable=true;
  for(const week of data.training.weeks||[])for(const session of Object.values(week.sessions||{}))for(const block of session.blocks||[])for(const exercise of block.exercises||[])exerciseNamesAreStable=exerciseNamesAreStable&&typeof exercise.name==='string';
  assert(file+'-keeps-exercise-names-in-english-field',exerciseNamesAreStable);
}

const maximeTraining=JSON.parse(fs.readFileSync(path.join(repo,'clients/maxime-bourdon/training-program.json'),'utf8'));
assert('maxime-phase-has-real-english-and-french',maximeTraining.training.phase.label.en==='PHASE 1 — CLASSIC PHYSIQUE PREP'&&maximeTraining.training.phase.label.fr==='PHASE 1 — PRÉPARATION CLASSIC PHYSIQUE');
assert('maxime-update-version-will-reach-installed-app',maximeTraining.programVersion==='training-maxime-bourdon-phase-1-v2');

if(failed){console.error('\n'+failed+' bilingual test(s) failed.');process.exit(1);}
console.log('\nAll bilingual tests passed.');
