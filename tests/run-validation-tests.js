#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const validator = path.resolve(__dirname, '..', 'scripts', 'validate-client-package.js');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fe-client-validation-'));

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

const baseClient = {
  schemaVersion: 'fe-client-info-v2',
  updatedAt: '2026-07-21T00:00:00-04:00',
  client: {
    id: 'clt_valid_001',
    slug: 'valid-client',
    displayName: 'Valid Client',
    shortName: 'Valid',
    language: 'en',
    timezone: 'America/Montreal',
    startDate: '',
    coachingState: {
      phase: 'onboarding',
      initialStatus: 'week-zero-required'
    }
  },
  portal: {
    appTitle: 'Legacy Protocol',
    documentTitle: 'Father Empowering Protocol - Valid Client',
    protocolLabel: 'FATHER EMPOWERING - VALID CLIENT',
    homeKicker: 'PROTOCOL PHASE: BUILD',
    sidebarTitleHtml: 'FE<br>PROTOCOL',
    sidebarSubtitle: 'VALID CLIENT - BUILD',
    messageSignature: '- Coach Max',
    metadata: {
      protocolVersionLabel: 'Block 1',
      lastUpdatedLabel: '2026-07-21'
    }
  },
  features: {
    training: true,
    nutrition: true,
    weekZero: true,
    checkins: true,
    progression: true,
    history: true,
    resultPoster: true,
    tallyOnboarding: false,
    coachReports: false,
    installPrompt: true
  },
  measurements: {
    fields: [],
    iconMap: {}
  },
  integrations: {},
  migration: {
    enabled: false,
    reason: '',
    sourcePortal: '',
    preserveOriginalData: true,
    legacyStorage: {
      localStorageKeys: [],
      sessionStorageKeys: [],
      indexedDbNames: []
    }
  },
  storage: {
    namespace: 'valid_client',
    strategy: 'client-namespace-v1',
    overrides: {}
  },
  environment: {
    profile: 'test',
    trainingProgramUrl: 'training-program.json',
    nutritionProgramUrl: 'nutrition-program.json'
  }
};

const baseTraining = {
  schemaVersion: 1,
  programVersion: 'training-test-v1',
  updatedAt: '2026-07-21T00:00:00-04:00',
  training: {
    sessionCatalog: [
      { id: 'a', label: 'SESSION A', title: 'Strength A', suggestedDay: 'MON', order: 1 },
      { id: 'b', label: 'SESSION B', title: 'Strength B', suggestedDay: 'WED', order: 2 }
    ],
    weeks: [
      {
        week: 1,
        phase: 'FOUNDATION',
        sessions: {
          a: {
            title: 'Strength A',
            blocks: [
              {
                label: 'MAIN',
                exercises: [
                  { name: 'Trap Bar Deadlift', key: 'trap_bar_deadlift', sets: 3, reps: '6' }
                ]
              }
            ]
          }
        }
      },
      {
        week: 2,
        phase: 'FOUNDATION',
        sessions: {
          b: {
            title: 'Strength B',
            blocks: [
              {
                label: 'MAIN',
                exercises: [
                  { name: 'DB Bench Press', key: 'db_bench_press', sets: 3, reps: '8' }
                ]
              }
            ]
          }
        }
      }
    ]
  },
  updateTitle: 'Training ready',
  updateMessage: 'Training package ready',
  releaseNotes: []
};

const baseNutrition = {
  schemaVersion: 1,
  programVersion: 'nutrition-test-v1',
  updatedAt: '2026-07-21T00:00:00-04:00',
  nutrition: {
    kicker: 'NUTRITION',
    title: 'NUTRITION PLAN',
    phase: 'BUILD',
    desc: 'Test nutrition',
    targets: [],
    plans: [
      { id: 'plan-1', label: 'PLAN 1', title: 'CLASSIC', sections: [] }
    ],
    rules: [],
    meals: [],
    futureNote: ''
  },
  updateTitle: 'Nutrition ready',
  updateMessage: 'Nutrition package ready',
  releaseNotes: []
};

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
}

function writePackage(name, client, training, nutrition, options = {}) {
  const dir = path.join(root, name);
  fs.mkdirSync(dir, { recursive: true });
  const suffix = options.exampleFiles ? '.example.json' : '.json';
  writeJson(path.join(dir, 'client-info' + suffix), client);
  if (training) writeJson(path.join(dir, 'training-program' + suffix), training);
  if (nutrition) writeJson(path.join(dir, 'nutrition-program' + suffix), nutrition);
  return dir;
}

const cases = [
  {
    name: 'valid-package',
    expectPass: true,
    setup() {
      return [clone(baseClient), clone(baseTraining), clone(baseNutrition), { args: ['--strict'] }];
    },
    mustContain: 'Result: OK'
  },
  {
    name: 'strict-rejects-example-files',
    expectPass: false,
    setup() {
      return [clone(baseClient), clone(baseTraining), clone(baseNutrition), { exampleFiles: true, args: ['--strict'] }];
    },
    mustContain: 'Create client-info.json for a real client package'
  },
  {
    name: 'invalid-slug',
    expectPass: false,
    setup() {
      const client = clone(baseClient);
      client.client.slug = 'Invalid Slug';
      return [client, clone(baseTraining), clone(baseNutrition)];
    },
    mustContain: 'client.slug'
  },
  {
    name: 'missing-client-id',
    expectPass: false,
    setup() {
      const client = clone(baseClient);
      delete client.client.id;
      return [client, clone(baseTraining), clone(baseNutrition)];
    },
    mustContain: 'client.id is required'
  },
  {
    name: 'duplicate-plans',
    expectPass: false,
    setup() {
      const nutrition = clone(baseNutrition);
      nutrition.nutrition.plans.push({ id: 'plan-1', label: 'PLAN 1B', title: 'DUPLICATE', sections: [] });
      return [clone(baseClient), clone(baseTraining), nutrition];
    },
    mustContain: 'duplicate nutrition plan id'
  },
  {
    name: 'unknown-session',
    expectPass: false,
    setup() {
      const training = clone(baseTraining);
      training.training.weeks[0].sessions.z = training.training.weeks[0].sessions.a;
      delete training.training.weeks[0].sessions.a;
      return [clone(baseClient), training, clone(baseNutrition)];
    },
    mustContain: 'unknown session id'
  },
  {
    name: 'invalid-training-schema',
    expectPass: false,
    setup() {
      const training = clone(baseTraining);
      training.schemaVersion = 2;
      return [clone(baseClient), training, clone(baseNutrition)];
    },
    mustContain: 'schemaVersion must be 1'
  },
  {
    name: 'weeks-contradiction',
    expectPass: false,
    setup() {
      const client = clone(baseClient);
      client.client.totalWeeks = 12;
      return [client, clone(baseTraining), clone(baseNutrition)];
    },
    mustContain: 'totalWeeks'
  },
  {
    name: 'unnamespaced-storage-key',
    expectPass: false,
    setup() {
      const client = clone(baseClient);
      client.storage.overrides = { data: 'legacy_data_key' };
      return [client, clone(baseTraining), clone(baseNutrition)];
    },
    mustContain: 'not namespaced'
  },
  {
    name: 'apparent-secret',
    expectPass: false,
    setup() {
      const client = clone(baseClient);
      client.integrations.coachmax = { endpointRef: 'legacy-telegram-backend', token: 'sk-testtoken1234567890' };
      return [client, clone(baseTraining), clone(baseNutrition)];
    },
    mustContain: 'apparent secret'
  },
  {
    name: 'nutrition-disabled-missing-file',
    expectPass: true,
    setup() {
      const client = clone(baseClient);
      client.features.nutrition = false;
      return [client, clone(baseTraining), null];
    },
    mustContain: 'Result: OK'
  },
  {
    name: 'nutrition-enabled-missing-file',
    expectPass: false,
    setup() {
      const client = clone(baseClient);
      client.features.nutrition = true;
      return [client, clone(baseTraining), null];
    },
    mustContain: 'nutrition-program: missing file'
  }
];

let failed = 0;

for (const testCase of cases) {
  const [client, training, nutrition, options = {}] = testCase.setup();
  const dir = writePackage(testCase.name, client, training, nutrition, options);
  const result = spawnSync(process.execPath, [validator, dir].concat(options.args || []), { encoding: 'utf8' });
  const passed = result.status === 0;
  const output = `${result.stdout || ''}${result.stderr || ''}`;
  const contains = !testCase.mustContain || output.includes(testCase.mustContain);
  const ok = passed === testCase.expectPass && contains;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${testCase.name}`);
  if (!ok) {
    failed += 1;
    console.log(output);
  }
}

if (failed) {
  console.error(`\n${failed} validation test(s) failed.`);
  process.exit(1);
}

console.log('\nAll validation tests passed.');
