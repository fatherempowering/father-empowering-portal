/* Father Empowering M1 PWA shell.
 *
 * M1 intentionally does not cache authenticated requests or application data.
 * Workout offline support belongs to M5. This worker establishes only the
 * installable shell and safe upgrade path required by M1.
 */
const SHELL_VERSION = "fe-m1-shell-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith("fe-m1-") && key !== SHELL_VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

// No fetch handler by design: private responses must never be cached in M1.
