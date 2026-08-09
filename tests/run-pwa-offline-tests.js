#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repo = path.resolve(__dirname, '..');
const swSource = fs.readFileSync(path.join(repo, 'sw.js'), 'utf8');
const portalSource = fs.readFileSync(path.join(repo, 'index.html'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(repo, 'site.webmanifest'), 'utf8'));
let failed = 0;

function assert(name, condition, detail) {
  if (condition) console.log('PASS ' + name);
  else {
    failed++;
    console.error('FAIL ' + name + (detail ? ' - ' + detail : ''));
  }
}

function pngSize(file) {
  const data = fs.readFileSync(file);
  if (data.toString('ascii', 1, 4) !== 'PNG') return null;
  return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
}

function makeServiceWorkerHarness() {
  const scopeUrl = 'https://example.test/clients/test-client/';
  const listeners = {};
  const stores = new Map();
  let networkOnline = true;
  let networkBody = 'network';
  let skipWaitingCalled = false;
  let claimCalled = false;

  function keyFor(input, options = {}) {
    const raw = typeof input === 'string' ? input : input.url;
    const url = new URL(raw, scopeUrl);
    if (options.ignoreSearch) url.search = '';
    return url.href;
  }

  function cacheFor(name) {
    if (!stores.has(name)) stores.set(name, new Map());
    const store = stores.get(name);
    return {
      async addAll(items) {
        for (const item of items) store.set(keyFor(item), new Response('cached:' + item, { status: 200 }));
      },
      async add(item) {
        store.set(keyFor(item), new Response('cached:' + item, { status: 200 }));
      },
      async put(request, response) {
        store.set(keyFor(request), response.clone());
      },
      async match(request, options) {
        const direct = store.get(keyFor(request, options));
        return direct ? direct.clone() : undefined;
      }
    };
  }

  const caches = {
    open: async (name) => cacheFor(name),
    keys: async () => [...stores.keys()],
    delete: async (name) => stores.delete(name),
    async match(request, options) {
      for (const name of stores.keys()) {
        const match = await cacheFor(name).match(request, options);
        if (match) return match;
      }
      return undefined;
    }
  };

  async function fetchMock(request) {
    if (!networkOnline) throw new Error('offline');
    return new Response(networkBody + ':' + keyFor(request), {
      status: 200,
      headers: { 'Content-Type': keyFor(request).endsWith('.json') ? 'application/json' : 'text/plain' }
    });
  }

  const self = {
    registration: { scope: scopeUrl },
    location: { origin: new URL(scopeUrl).origin },
    clients: { claim: async () => { claimCalled = true; } },
    skipWaiting: async () => { skipWaitingCalled = true; },
    addEventListener(type, handler) { listeners[type] = handler; }
  };
  const context = { self, caches, fetch: fetchMock, URL, Request, Response, Promise, Error };
  vm.createContext(context);
  vm.runInContext(swSource + '\nself.__pwa={APP_SHELL,OPTIONAL_SHELL,CACHE_NAME,CACHE_PREFIX,CACHE_VERSION,TRUSTED_EXTERNAL_ORIGINS};', context);

  async function lifecycle(type) {
    let pending = Promise.resolve();
    listeners[type]({ waitUntil(value) { pending = Promise.resolve(value); } });
    await pending;
  }

  async function request(url, mode = 'cors') {
    let response;
    listeners.fetch({
      request: { method: 'GET', url: new URL(url, scopeUrl).href, mode },
      respondWith(value) { response = Promise.resolve(value); }
    });
    return response;
  }

  return {
    self,
    stores,
    cacheFor,
    lifecycle,
    request,
    setNetwork(online, body = networkBody) { networkOnline = online; networkBody = body; },
    wasSkipWaitingCalled: () => skipWaitingCalled,
    wasClaimCalled: () => claimCalled
  };
}

async function run() {
  assert('manifest-has-stable-relative-id', manifest.id === './');
  assert('manifest-is-standalone-and-scoped', manifest.display === 'standalone' && manifest.start_url === './index.html' && manifest.scope === './');
  assert('manifest-is-portrait', manifest.orientation === 'portrait');
  assert('manifest-colors-match-portal', manifest.background_color === '#0B0B0A' && manifest.theme_color === '#0B0B0A');
  assert('manifest-declares-language', typeof manifest.lang === 'string' && manifest.lang.length > 0);

  const requiredIcons = { 'icon-192.png': 192, 'icon-512.png': 512 };
  for (const [name, expected] of Object.entries(requiredIcons)) {
    const icon = manifest.icons.find((item) => item.src === name);
    const dimensions = pngSize(path.join(repo, name));
    assert('manifest-icon-' + expected, !!icon && icon.sizes === expected + 'x' + expected && icon.type === 'image/png' && dimensions.width === expected && dimensions.height === expected);
  }

  const harness = makeServiceWorkerHarness();
  const pwa = harness.self.__pwa;
  assert('app-shell-includes-programs', ['./training-program.json', './nutrition-program.json'].every((item) => pwa.APP_SHELL.includes(item)));
  assert('app-shell-includes-versioned-language-engine', pwa.APP_SHELL.includes('./i18n.js?v=4'));
  assert('app-shell-includes-branding-and-measure-icons', ['./fe-logo-home.png', './fe-logo-splash.png', './measure-icons/waist.png'].every((item) => pwa.APP_SHELL.includes(item)));
  assert('client-info-is-an-offline-optional-source', pwa.OPTIONAL_SHELL.includes('./client-info.json'));
  assert('chart-and-font-origins-are-runtime-cached', ['https://cdn.jsdelivr.net', 'https://fonts.googleapis.com', 'https://fonts.gstatic.com'].every((origin) => pwa.TRUSTED_EXTERNAL_ORIGINS.includes(origin)));
  pwa.APP_SHELL.filter((item) => item !== './').forEach((item) => {
    const fileName = item.replace(/^\.\//, '').split('?')[0];
    assert('shell-file-exists-' + fileName, fs.existsSync(path.join(repo, fileName)));
  });

  const upgradeHarness = makeServiceWorkerHarness();
  await upgradeHarness.cacheFor('legacy-client-cache').put('i18n.js', new Response('broken-legacy-language-engine', { status: 200 }));
  upgradeHarness.setNetwork(true, 'fixed-language-engine');
  const upgradedLanguageEngine = await upgradeHarness.request('i18n.js?v=4');
  assert('installed-app-bypasses-legacy-language-cache', upgradedLanguageEngine && (await upgradedLanguageEngine.text()).startsWith('fixed-language-engine:'));

  await harness.lifecycle('install');
  const activeCache = harness.stores.get(pwa.CACHE_NAME);
  assert('install-populates-cache', activeCache && activeCache.size >= pwa.APP_SHELL.length);
  assert('install-caches-client-info-when-present', activeCache && activeCache.has('https://example.test/clients/test-client/client-info.json'));
  assert('install-calls-skip-waiting', harness.wasSkipWaitingCalled());

  harness.stores.set(pwa.CACHE_PREFIX + 'old-version', new Map());
  harness.stores.set('unrelated-cache', new Map());
  await harness.lifecycle('activate');
  assert('activate-removes-only-old-scoped-cache', !harness.stores.has(pwa.CACHE_PREFIX + 'old-version') && harness.stores.has('unrelated-cache'));
  assert('activate-claims-clients', harness.wasClaimCalled());

  harness.setNetwork(false);
  const offlineProgram = await harness.request('training-program.json?v=offline-test');
  assert('offline-program-ignores-update-query', offlineProgram && offlineProgram.status === 200 && (await offlineProgram.text()).includes('cached:./training-program.json'));

  harness.setNetwork(true, 'fresh-program');
  const freshProgram = await harness.request('training-program.json?v=version-2');
  assert('online-program-is-network-first', freshProgram && (await freshProgram.text()).startsWith('fresh-program:'));
  harness.setNetwork(false);
  const refreshedOfflineProgram = await harness.request('training-program.json?v=version-3');
  assert('latest-program-response-is-reused-offline', refreshedOfflineProgram && (await refreshedOfflineProgram.text()).startsWith('fresh-program:'));

  const offlineNavigation = await harness.request('dashboard/deep-link', 'navigate');
  assert('offline-navigation-falls-back-to-index', offlineNavigation && offlineNavigation.status === 200 && (await offlineNavigation.text()).includes('cached:./index.html'));
  const offlineLogo = await harness.request('fe-logo-home.png');
  assert('offline-static-asset-comes-from-cache', offlineLogo && offlineLogo.status === 200 && (await offlineLogo.text()).includes('cached:./fe-logo-home.png'));
  const missingAsset = await harness.request('missing-image.png');
  assert('missing-static-asset-does-not-return-html', missingAsset && missingAsset.type === 'error');

  harness.setNetwork(true, 'external-asset');
  const externalChart = await harness.request('https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js');
  assert('trusted-chart-library-is-runtime-cached', externalChart && (await externalChart.text()).startsWith('external-asset:'));
  harness.setNetwork(false);
  const offlineChart = await harness.request('https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js');
  assert('trusted-chart-library-is-available-offline-after-cache', offlineChart && (await offlineChart.text()).startsWith('external-asset:'));
  const untrustedExternal = await harness.request('https://untrusted.example/app.js');
  assert('untrusted-cross-origin-request-is-not-intercepted', untrustedExternal === undefined);

  assert('portal-registers-service-worker', portalSource.includes("navigator.serviceWorker.register('./sw.js')"));
  assert('portal-listens-for-network-changes', portalSource.includes("window.addEventListener('online',updateNetworkStatus)") && portalSource.includes("window.addEventListener('offline',updateNetworkStatus)"));
  assert('client-results-persist-locally', portalSource.includes('localStorage.setItem(SK,JSON.stringify(D))') && portalSource.includes('setResults:f.setResults'));
  assert('offline-checkins-use-an-outbox', portalSource.includes('feOutboxEnqueue') && portalSource.includes("window.addEventListener('online',function(){setTimeout(feFlushOutbox,1500);})"));
  assert('charts-are-optional-offline', ['renderHomeChart', 'renderDash', 'renderCharts'].every((name) => portalSource.slice(portalSource.indexOf('function ' + name), portalSource.indexOf('function ' + name) + 220).includes('window.Chart')));

  if (failed) {
    console.error('\n' + failed + ' PWA/offline test(s) failed.');
    process.exit(1);
  }
  console.log('\nAll PWA and offline tests passed.');
}

run().catch((error) => {
  console.error(error.stack || error);
  process.exit(1);
});
