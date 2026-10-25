import { expect, test, type Page } from "@playwright/test";

async function prepareFollowupLogout(page: Page, screen: string, status = 401, failLogout = false, destination = "/login", mutation = false) {
  await page.addInitScript(({ status, failLogout, destination, mutation }) => {
    const state = { held: false, attempts: 0, reads: 0, logouts: 0, release: () => {} };
    (window as unknown as { __followupLogout: typeof state }).__followupLogout = state;
    const wrap = (next: typeof fetch): typeof fetch => async (input, init) => {
      const path = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, location.origin).pathname;
      if (path === "/api/v1/auth/client-logout") {
        state.logouts += 1;
        if (failLogout && state.logouts === 1) throw new TypeError("Synthetic transport failure");
        const response = new Response(JSON.stringify({ data: { redirectTo: destination } }), { status: 200 });
        response.json = async () => { queueMicrotask(() => queueMicrotask(() => state.release())); return { data: { redirectTo: destination } }; };
        return response;
      }
      const scoped = ["/api/v1/client/nutrition", "/api/v1/client/check-ins", "/api/v1/client/progression"].includes(path);
      if (scoped && init?.method !== "POST") state.reads += 1;
      if (scoped && (mutation ? init?.method === "POST" : init?.method !== "POST") && ++state.attempts === 1) {
        const committed = mutation ? await next(input, init) : null;
        state.held = true;
        return new Promise<Response>(resolve => { state.release = () => resolve(committed ?? new Response("{}", { status })); });
      }
      return next(input, init);
    };
    let transport = wrap(window.fetch.bind(window));
    Object.defineProperty(window, "fetch", { configurable: true, get: () => transport, set: (next: typeof fetch) => { transport = wrap(next); } });
  }, { status, failLogout, destination, mutation });
  await page.goto(`/?screen=${screen}&state=followup-empty`);
  if (!mutation) await page.waitForFunction(() => (window as unknown as { __followupLogout: { held: boolean } }).__followupLogout.held);
}
async function followupSignOut(page: Page) {
  const menu = page.getByRole("button", { name: /^(Ouvrir le menu|Menu)$/ });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole("button", { name: "Se déconnecter", exact: true }).click({ noWaitAfter: true });
}
for (const screen of ["client-nutrition", "client-progression", "client-check-in"]) for (const status of [401, 403]) {
  test(`${screen} logout preserves server destination despite late ${status}`, async ({ page }) => {
    let release = () => {};
    const gate = new Promise<void>(resolve => { release = resolve; });
    await page.route("**/login", async route => { await gate; await route.fulfill({ body: "<h1>Coach login</h1>", contentType: "text/html" }).catch(() => {}); });
    await prepareFollowupLogout(page, screen, status);
    const wrong: string[] = [];
    page.on("request", request => { if (new URL(request.url()).pathname === "/client-login") wrong.push(request.url()); });
    const login = page.waitForRequest(request => new URL(request.url()).pathname === "/login");
    await followupSignOut(page); await login; release();
    await expect(page).toHaveURL(/\/login$/); expect(wrong).toEqual([]);
  });
  test(`${screen} active ${status} without logout still redirects to Client Auth`, async ({ page }) => {
    await prepareFollowupLogout(page, screen, status);
    await page.evaluate(() => (window as unknown as { __followupLogout: { release(): void } }).__followupLogout.release());
    await expect(page).toHaveURL(/\/client-login$/);
  });
}
for (const screen of ["client-nutrition", "client-progression", "client-check-in"]) {
  test(`${screen} resumes reads after failed logout without accepting stale unauthorized data`, async ({ page }) => {
    await prepareFollowupLogout(page, screen, 401, true);
    await followupSignOut(page);
    await expect(page.getByRole("alert")).toContainText("Déconnexion impossible");
    await page.waitForFunction(() => (window as unknown as { __followupLogout: { attempts: number } }).__followupLogout.attempts > 1);
    await page.evaluate(() => (window as unknown as { __followupLogout: { release(): void } }).__followupLogout.release());
    await expect(page.getByText("Chargement de tes informations…", { exact: true })).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(`screen=${screen}`));
    await followupSignOut(page); await expect(page).toHaveURL(/\/login$/);
  });
  test(`${screen} preserves normal Client logout destination`, async ({ page }) => {
    await prepareFollowupLogout(page, screen, 401, false, "/client-login");
    await followupSignOut(page); await expect(page).toHaveURL(/\/client-login$/);
  });
}

async function checkin(page: Page, state = "followup-empty") {
  await page.goto(`/?screen=client-check-in&state=${state}`);
  await expect(page.locator("#checkin-observedOn")).toBeVisible();
}
async function fillMinimum(page: Page) {
  await page.locator("#checkin-observedOn").fill("2026-10-25");
  await page.locator("#checkin-measurements-bodyWeightLb").fill("180");
  await page.locator("#checkin-sleepHours").fill("7");
}
const commands = (page: Page) => page.evaluate(() => (window as unknown as { __followupCommands: { action: string; expectedVersion: number; clientMutationId: string; document?: { measurements: { bodyWeightLb: number; leftArmIn: number }; energy: number | null; sleepQuality: number | null } }[] }).__followupCommands);

test("committed Check-in save after failed logout stays uncertain and retries only the identical command", async ({ page }) => {
  await prepareFollowupLogout(page, "client-check-in", 401, true, "/login", true);
  await expect(page.locator("#checkin-observedOn")).toBeVisible();
  await fillMinimum(page);
  await page.getByRole("button", { name: "Enregistrer le brouillon", exact: true }).click();
  await page.waitForFunction(() => (window as unknown as { __followupLogout: { held: boolean } }).__followupLogout.held);
  const first = await commands(page); expect(first).toHaveLength(1);
  const reads = await page.evaluate(() => (window as unknown as { __followupLogout: { reads: number } }).__followupLogout.reads);
  page.once("dialog", dialog => dialog.accept());
  await followupSignOut(page);
  await expect(page.getByText("Déconnexion impossible. Réessaie.", { exact: true })).toBeVisible();
  await page.evaluate(() => (window as unknown as { __followupLogout: { release(): void } }).__followupLogout.release());
  await expect(page.getByText("La confirmation n’est pas arrivée.", { exact: false })).toBeVisible();
  await expect(page.locator("#checkin-measurements-bodyWeightLb")).toHaveValue("180");
  await expect(page.locator("#checkin-measurements-bodyWeightLb")).toBeDisabled();
  expect(await commands(page)).toEqual(first);
  expect(await page.evaluate(() => (window as unknown as { __followupLogout: { reads: number } }).__followupLogout.reads)).toBe(reads);
  await page.getByRole("button", { name: "Réessayer pour confirmer", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Brouillon enregistré");
  const retried = await commands(page); expect(retried).toHaveLength(2); expect(retried[1]).toEqual(first[0]);
  await expect(page.locator("#checkin-measurements-bodyWeightLb")).toHaveValue("180");
});

test("failed logout never reloads or clears unsaved Check-in input", async ({ page }) => {
  await prepareFollowupLogout(page, "client-check-in", 401, true, "/login", true);
  await expect(page.locator("#checkin-observedOn")).toBeVisible(); await fillMinimum(page);
  const reads = await page.evaluate(() => (window as unknown as { __followupLogout: { reads: number } }).__followupLogout.reads);
  page.once("dialog", dialog => dialog.accept()); await followupSignOut(page);
  await expect(page.getByText("Déconnexion impossible. Réessaie.", { exact: true })).toBeVisible();
  await expect(page.locator("#checkin-measurements-bodyWeightLb")).toHaveValue("180");
  await expect(page.locator("#checkin-measurements-bodyWeightLb")).toBeEnabled();
  expect(await commands(page)).toEqual([]);
  expect(await page.evaluate(() => (window as unknown as { __followupLogout: { reads: number } }).__followupLogout.reads)).toBe(reads);
  page.once("dialog", dialog => dialog.dismiss());
  await page.getByRole("link", { name: /Retrouver mes repères/ }).click();
  await expect(page).toHaveURL(/screen=client-check-in/);
});

test("cancelled dirty logout sends no request and accepted logout asks only once", async ({ page }) => {
  await prepareFollowupLogout(page, "client-check-in", 401, false, "/login", true);
  await expect(page.locator("#checkin-observedOn")).toBeVisible(); await fillMinimum(page);
  page.once("dialog", dialog => dialog.dismiss()); await followupSignOut(page);
  expect(await page.evaluate(() => (window as unknown as { __followupLogout: { logouts: number } }).__followupLogout.logouts)).toBe(0);
  await expect(page.locator("#checkin-measurements-bodyWeightLb")).toHaveValue("180");
  let confirmations = 0;
  page.on("dialog", async dialog => { confirmations += 1; await dialog.accept(); });
  await followupSignOut(page); await expect(page).toHaveURL(/\/login$/);
  expect(confirmations).toBe(1);
});

test("cancelled reload after conflict returns to preserved Check-in data when logout fails", async ({ page }) => {
  await checkin(page, "followup-conflict"); await fillMinimum(page);
  await page.getByRole("button", { name: "Enregistrer le brouillon", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Ce brouillon a changé ailleurs");
  await page.evaluate(() => {
    const existing = window.fetch;
    window.fetch = async (input, init) => {
      const path = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, location.origin).pathname;
      if (path === "/api/v1/auth/client-logout") throw new TypeError("Synthetic transport failure");
      if (path === "/api/v1/client/check-ins" && init?.method !== "POST") return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
      });
      return existing(input, init);
    };
  });
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Recharger la version enregistrée", exact: true }).click();
  await expect(page.getByText("Chargement de tes informations…", { exact: true })).toBeVisible();
  page.once("dialog", dialog => dialog.accept()); await followupSignOut(page);
  await expect(page.getByText("Déconnexion impossible. Réessaie.", { exact: true })).toBeVisible();
  await expect(page.locator("#checkin-measurements-bodyWeightLb")).toBeVisible();
  await expect(page.locator("#checkin-measurements-bodyWeightLb")).toHaveValue("180");
  await expect(page.getByRole("button", { name: "Recharger la version enregistrée", exact: true })).toBeVisible();
  expect((await commands(page)).map(item => item.action)).toEqual(["save"]);
});

test("Nutrition presents only prescribed content, versions and actual preparation", async ({ page }, info) => {
  await page.goto("/?screen=client-nutrition&state=followup-filled");
  await expect(page.getByRole("heading", { name: "Ton plan nutritionnel." })).toBeVisible();
  await expect(page.getByText("Poulet : 150 g cuits", { exact: false })).toBeVisible();
  await expect(page.getByRole("region", { name: "Cibles prescrites" })).toContainText("Non renseignée");
  await expect(page.getByText("Ces valeurs sont prescrites", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Préparation", exact: true }).click();
  await expect(page.getByText("Prépare les aliments indiqués dans les repas.", { exact: true })).toBeVisible();
  await page.getByLabel("Version du plan").selectOption({ label: "V1 · 1 oct. 2026" });
  await expect(page.getByText("Version précédente · consultation uniquement.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Actualiser le plan", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Ancien plan", exact: true })).toBeVisible();
  await page.getByLabel("Version du plan").selectOption({ index: 0 });
  await page.screenshot({ path: info.outputPath("nutrition.png"), fullPage: true });
});

test("Nutrition never invents meal prep, groceries or an unpublished plan", async ({ page }) => {
  await page.goto("/?screen=client-nutrition&state=followup-absent-sections");
  await expect(page.getByRole("heading", { name: "Ton plan nutritionnel." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Préparation", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Épicerie", exact: true })).toHaveCount(0);
  await page.goto("/?screen=client-nutrition&state=followup-empty");
  await expect(page.getByRole("heading", { name: "Ton plan est en préparation." })).toBeVisible();
  await expect(page.getByRole("region", { name: "Cibles prescrites" })).toHaveCount(0);
});

for (const screen of ["client-nutrition", "client-check-in", "client-progression"]) test(`${screen} offers retry after a failed read and does not claim success`, async ({ page }) => {
  await page.goto(`/?screen=${screen}&state=followup-error-once`);
  await expect(page.getByRole("alert")).toContainText("n’ont pas pu être chargées");
  await page.getByRole("button", { name: "Réessayer", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByRole("status")).toHaveCount(0);
});

test("Check-in starts empty, focuses validation and requires weight and sleep only on submission", async ({ page }) => {
  await checkin(page);
  await expect(page.locator("#checkin-observedOn")).toHaveValue("");
  await expect(page.locator("#checkin-energy")).toHaveValue("");
  await expect(page.locator("#checkin-sleepQuality")).toHaveValue("");
  await page.getByRole("button", { name: "Enregistrer le brouillon", exact: true }).click();
  await expect(page.getByRole("button", { name: "Date des observations — complète ou corrige ce champ →", exact: true })).toHaveCount(1);
  await page.getByRole("button", { name: "Date des observations — complète ou corrige ce champ →", exact: true }).click();
  await expect(page.locator("#checkin-observedOn")).toBeFocused();
  await page.locator("#checkin-observedOn").fill("2026-10-25");
  await page.getByRole("button", { name: "Enregistrer le brouillon", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Brouillon enregistré");
  await page.getByRole("button", { name: "Transmettre à mon coach", exact: true }).click();
  await page.getByRole("button", { name: "Poids — complète ou corrige ce champ →", exact: true }).click();
  await expect(page.locator("#checkin-measurements-bodyWeightLb")).toBeFocused();
  expect((await commands(page)).map(item => item.action)).toEqual(["save"]);
});

test("Check-in saves canonical units, submits immutable history and preserves monotone version", async ({ page }, info) => {
  await checkin(page); await fillMinimum(page);
  await page.getByLabel("Unités de saisie").selectOption("metric");
  await page.locator("#checkin-measurements-bodyWeightLb").fill("81.6466266");
  await page.locator("#checkin-measurements-leftArmIn").fill("35.56");
  await page.locator("#checkin-cardioMinutes").fill("0");
  await page.getByRole("button", { name: "Enregistrer le brouillon", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Brouillon enregistré");
  let sent = await commands(page); expect(sent[0].document?.measurements.bodyWeightLb).toBeCloseTo(180, 4); expect(sent[0].document?.measurements.leftArmIn).toBeCloseTo(14, 4); expect(sent[0].document?.energy).toBeNull();
  await page.getByRole("button", { name: "Transmettre à mon coach", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Check-in transmis");
  const history = page.getByRole("region", { name: "Mes check-ins transmis (1)" });
  await history.getByRole("button", { name: /Consulter/ }).click();
  const record = page.getByRole("region", { name: "Check-in transmis — lecture seule" });
  await expect(record).toContainText("35,56 cm"); await expect(record.locator("input")).toHaveCount(0);
  await expect(record.locator("dl > div").filter({ hasText: "Cardio (minutes)" })).toHaveText("Cardio (minutes)0");
  await page.screenshot({ path: info.outputPath("check-in.png"), fullPage: true });
  await page.locator("#checkin-observedOn").fill("2026-10-25");
  await page.getByRole("button", { name: "Enregistrer le brouillon", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Brouillon enregistré");
  sent = await commands(page); expect(sent.map(item => item.expectedVersion)).toEqual([0, 1, 2]);
});

test("uncertain save is locked and retries the same operation without duplicate", async ({ page }) => {
  await checkin(page, "followup-response-lost"); await fillMinimum(page);
  await page.getByRole("button", { name: "Enregistrer le brouillon", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("La confirmation n’est pas arrivée");
  await expect(page.locator("#checkin-observedOn")).toBeDisabled();
  await page.getByRole("button", { name: "Réessayer pour confirmer", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Brouillon enregistré");
  const sent = await commands(page); expect(sent).toHaveLength(2); expect(sent[0]).toEqual(sent[1]);
});

test("conflict preserves entries until the user explicitly accepts reloading", async ({ page }) => {
  await checkin(page, "followup-conflict"); await fillMinimum(page);
  await page.getByRole("button", { name: "Enregistrer le brouillon", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Ce brouillon a changé ailleurs");
  await expect(page.locator("#checkin-measurements-bodyWeightLb")).toHaveValue("180");
  page.once("dialog", dialog => dialog.dismiss());
  await page.getByRole("button", { name: "Recharger la version enregistrée", exact: true }).click();
  await expect(page.locator("#checkin-measurements-bodyWeightLb")).toHaveValue("180");
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Recharger la version enregistrée", exact: true }).click();
  await expect(page.locator("#checkin-measurements-bodyWeightLb")).toHaveValue("");
});

test("history pagination does not overwrite an unsaved check-in", async ({ page }) => {
  await checkin(page, "followup-many"); await fillMinimum(page);
  await page.getByRole("button", { name: "Suivant", exact: true }).click();
  await expect(page.getByText("Page 2", { exact: true })).toBeVisible();
  await expect(page.locator("#checkin-measurements-bodyWeightLb")).toHaveValue("180");
  await expect(page.getByRole("region", { name: "Mes check-ins transmis (53)" }).getByRole("button", { name: /Consulter/ })).toHaveCount(3);
});

test("Progression distinguishes no data, a single reference and multiple dated observations", async ({ page }, info) => {
  await page.goto("/?screen=client-progression&state=followup-empty");
  await expect(page.getByText("Pas encore de mesure de poids enregistrée.", { exact: false })).toBeVisible();
  await expect(page.getByRole("img", { name: /Courbe de poids/ })).toHaveCount(0);
  await page.goto("/?screen=client-progression&state=followup-single");
  await expect(page.getByText("Une seule mesure ne permet pas", { exact: false })).toBeVisible();
  await expect(page.getByText("Semaine zéro transmise le", { exact: false })).toBeVisible();
  await expect(page.getByRole("img", { name: /Courbe de poids/ })).toHaveCount(0);
  await page.goto("/?screen=client-progression&state=followup-filled");
  await expect(page.getByRole("heading", { name: "18 séances terminées", exact: true })).toBeVisible();
  const chart = page.getByRole("img", { name: /Courbe de poids/ }); await expect(chart).toBeVisible();
  await expect(chart.locator("path[stroke='#FF7A1A']")).toHaveCount(1);
  await page.getByText("Voir les valeurs", { exact: false }).click();
  await expect(page.getByRole("table")).toContainText("190 lb"); await expect(page.getByRole("table")).toContainText("180 lb");
  await page.getByText("Comment lire ces données", { exact: true }).click();
  await expect(page.getByText("pas d’une date de mensuration certaine", { exact: false })).toBeVisible();
  await page.getByLabel("Unités d’affichage").selectOption("metric");
  await expect(page.getByRole("table")).toContainText("81,65 kg");
  await page.screenshot({ path: info.outputPath("progression.png"), fullPage: true });
});

for (const screen of ["client-nutrition", "client-check-in", "client-progression"]) test(`${screen} remains readable at 320px and 200% text with keyboard language access`, async ({ page }, info) => {
  await page.goto(`/?screen=${screen}&state=followup-filled`);
  const language = page.getByRole("button", { name: "English", exact: true });
  await language.focus(); await page.keyboard.press("Enter");
  await expect(page.locator(`[data-followup]`)).toHaveAttribute("lang", "en");
  await page.getByRole("button", { name: "Français", exact: true }).click();
  for (const width of [1280, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    const bounds = await language.boundingBox(); expect(bounds!.height).toBeGreaterThanOrEqual(44);
  }
  await page.screenshot({ path: info.outputPath(`${screen}-320.png`), fullPage: true });
  await page.locator("html").evaluate(element => { element.style.fontSize = "32px"; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
