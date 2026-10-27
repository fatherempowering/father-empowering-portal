import { expect, test, type Page } from "@playwright/test";

type WithdrawalCommand = { expectedPublicationId: string; clientMutationId: string; action?: string };
async function prepare(page: Page, mode = "success", nutrition = false) {
  await page.addInitScript(({ mode, nutrition }) => {
    let retired = false, failedOnce = false;
    const requests: WithdrawalCommand[] = [];
    Object.assign(window, { __withdrawRequests: requests });
    const response = (data: unknown, status = 200) => new Response(JSON.stringify(status === 200 ? { data } : { error: { code: "VERSION_CONFLICT" } }), { status });
    const wrap = (next: typeof fetch): typeof fetch => async (input, init) => {
      const path = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, location.origin).pathname;
      const body = init?.method === "POST" ? JSON.parse(String(init.body ?? "{}")) : null;
      const isWithdrawal = nutrition ? path.endsWith("/nutrition") && body?.action === "withdraw" : path.endsWith("/program/withdraw");
      if (isWithdrawal) {
        requests.push(structuredClone(body));
        if (mode === "conflict") return response(null, 409);
        const committed = nutrition ? await next(input, init) : response({ program: null });
        retired = true;
        if (mode === "lost" && !failedOnce) { failedOnce = true; throw new TypeError("Synthetic response loss after commit"); }
        return committed;
      }
      if (!nutrition && (retired || mode === "retired") && path.endsWith("/program")) return response({ program: null });
      const original = await next(input, init);
      if (mode === "retired" && path.endsWith("/workouts/session")) {
        const result = await original.json(); result.data.publication.withdrawnAt = "2026-10-26T12:00:00Z";
        return response(result.data);
      }
      return original;
    };
    let transport = wrap(window.fetch.bind(window));
    Object.defineProperty(window, "fetch", { configurable: true, get: () => transport, set: (next: typeof fetch) => { transport = wrap(next); } });
  }, { mode, nutrition });
}
const commands = (page: Page) => page.evaluate(() => (window as unknown as { __withdrawRequests: WithdrawalCommand[] }).__withdrawRequests);

for (const nutrition of [false, true]) {
  const kind = nutrition ? "nutrition" : "training";
  const url = nutrition ? "/?screen=coach-followup&state=followup-filled" : "/?screen=coach-workouts&state=coach-workout-completed";
  const title = nutrition ? "Retirer ce plan nutritionnel?" : "Retirer ce programme?";
  test(`${kind} withdrawal uses a centered cancellable dialog and preserves history`, async ({ page }, info) => {
    await prepare(page, "success", nutrition); await page.goto(url);
    const trigger = page.getByRole("button", { name: "Retirer le plan actif", exact: true });
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: title, exact: true });
    await expect(dialog).toContainText("restent conservés dans l’historique");
    await expect(dialog.getByRole("button", { name: "Annuler", exact: true })).toBeFocused();
    const box = await dialog.boundingBox(); const viewport = page.viewportSize()!;
    expect(Math.abs(box!.x + box!.width / 2 - viewport.width / 2)).toBeLessThan(2);
    expect(Math.abs(box!.y + box!.height / 2 - viewport.height / 2)).toBeLessThan(2);
    await page.screenshot({ path: info.outputPath(`${kind}-withdraw-confirm.png`) });
    await dialog.getByRole("button", { name: "Annuler", exact: true }).click();
    await expect(trigger).toBeFocused(); expect(await commands(page)).toHaveLength(0);
    if (nutrition) await page.locator("#nutrition-instructions-fr").fill("Consigne non enregistrée conservée");
    await trigger.click(); await dialog.getByRole("button", { name: "Confirmer le retrait", exact: true }).click();
    await expect(page.getByRole("status")).toContainText(nutrition ? "Plan nutritionnel retiré" : "Programme retiré");
    await expect(trigger).toHaveCount(0); expect(await commands(page)).toHaveLength(1);
    if (nutrition) {
      await expect(page.locator("#nutrition-instructions-fr")).toHaveValue("Consigne non enregistrée conservée");
      await page.getByText("Publications conservées (2)", { exact: true }).click();
      await expect(page.getByText(/Version 2 · Plan test.*Plan retiré/)).toBeVisible();
      await expect(page.getByText(/Version 1 · Ancien plan/)).toBeVisible();
    } else {
      await expect(page.getByRole("heading", { name: "Historique des séances", exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Voir la prescription et les résultats", exact: true }).click();
      await expect(page.getByText("Série 1 : 8 répétitions · 40 lb · RIR 2", { exact: true })).toBeVisible();
    }
  });
  test(`${kind} lost withdrawal response retries the identical command without losing history`, async ({ page }) => {
    await prepare(page, "lost", nutrition); await page.goto(url);
    await page.getByRole("button", { name: "Retirer le plan actif", exact: true }).click();
    await page.getByRole("dialog", { name: title }).getByRole("button", { name: "Confirmer le retrait" }).click();
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page.getByRole("button", { name: "Retirer le plan actif", exact: true })).toBeDisabled();
    await page.getByRole("button", { name: nutrition ? "Réessayer la même demande" : "Réessayer le retrait", exact: true }).click();
    await expect(page.getByRole("status")).toContainText(nutrition ? "Plan nutritionnel retiré" : "Programme retiré");
    const sent = await commands(page); expect(sent).toHaveLength(2); expect(sent[1]).toEqual(sent[0]);
    if (nutrition) {
      await expect(page.getByRole("button", { name: "Publier le plan nutritionnel", exact: true })).toBeDisabled();
      await expect(page.getByText("Modifie puis enregistre le brouillon pour publier une nouvelle version.", { exact: true })).toBeVisible();
    }
  });
  test(`${kind} withdrawal conflict leaves the current plan and history intact`, async ({ page }) => {
    await prepare(page, "conflict", nutrition); await page.goto(url);
    await page.getByRole("button", { name: "Retirer le plan actif", exact: true }).click();
    await page.getByRole("dialog", { name: title }).getByRole("button", { name: "Confirmer le retrait" }).click();
    await expect(page.getByRole("alert")).toContainText(nutrition ? "Une autre version existe déjà" : "Une autre publication est active");
    await page.getByRole("button", { name: nutrition ? "Recharger l’état enregistré" : "Recharger le plan actif", exact: true }).click();
    await expect(page.getByRole("button", { name: "Retirer le plan actif", exact: true })).toBeEnabled();
    expect(await commands(page)).toHaveLength(1);
  });
}

test("withdrawn Client nutrition waits for a new plan and opens history only on explicit selection", async ({ page }) => {
  await page.goto("/?screen=client-nutrition&state=followup-withdrawn");
  await expect(page.getByRole("heading", { name: "Ton plan est en préparation.", exact: true })).toBeVisible();
  await expect(page.getByText(/Aucun plan nutritionnel actif/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Tes repas", exact: true })).toHaveCount(0);
  await page.getByRole("combobox", { name: "Version du plan", exact: true }).selectOption("76000000-0000-4000-8000-000000000030");
  await expect(page.getByText("Plan retiré · consultation uniquement.", { exact: true })).toBeVisible();
  await expect(page.getByText("Poulet, riz et légumes", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "English", exact: true }).click();
  await expect(page.getByText("Withdrawn plan · view only.", { exact: true })).toBeVisible();
  await expect(page.getByText(/No active nutrition plan right now/)).toBeVisible();
});

test("Client training history remains reachable after the active plan is withdrawn", async ({ page }) => {
  await prepare(page, "retired"); await page.goto("/?screen=client-program&state=workout-completed");
  await expect(page.getByText(/Aucun programme actif pour le moment/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Voir le résultat", exact: true })).toBeVisible();
});

test("withdrawn in-progress workout is read-only without being called completed", async ({ page }) => {
  await prepare(page, "retired");
  await page.goto("/?screen=client-workout&state=workout-in-progress&publicationId=19200000-0000-4000-8000-000000000001&weekNumber=1&sessionId=19200000-0000-4000-8000-000000000004");
  await expect(page.getByText("PLAN RETIRÉ", { exact: true })).toBeVisible();
  await expect(page.getByText("Plan retiré. Résultats conservés en lecture seule.", { exact: true })).toBeVisible();
  await expect(page.getByText(/Séance terminée le/)).toHaveCount(0);
  await page.getByRole("button", { name: "Consulter mes résultats", exact: true }).click();
  await expect(page.getByRole("button", { name: "Enregistrer les résultats", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Terminer la séance", exact: true })).toHaveCount(0);
  const fields = page.locator('input[type="number"]'); expect(await fields.count()).toBeGreaterThan(0);
  for (const field of await fields.all()) await expect(field).toBeDisabled();
  expect(await page.evaluate(() => (window as unknown as { __workoutRequests: unknown[] }).__workoutRequests)).toHaveLength(0);
});
