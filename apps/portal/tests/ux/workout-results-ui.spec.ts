import { expect, test, type Page } from "@playwright/test";

import type { SaveWorkoutRequest } from "../../src/lib/contracts/training-results";

const publicationId = "19200000-0000-4000-8000-000000000001";
const previousPublicationId = "19200000-0000-4000-8000-000000000002";
const sessionId = "19200000-0000-4000-8000-000000000004";
const uppercaseSessionId = "19200000-0000-4000-8000-00000000ABCD";

function workoutUrl(state: string, selectedSessionId = sessionId) {
  const query = new URLSearchParams({
    screen: "client-workout",
    state,
    publicationId,
    weekNumber: "1",
    sessionId: selectedSessionId,
  });
  return `/?${query.toString()}`;
}

function workoutSet(page: Page, setNumber: number) {
  return page.getByRole("region", { name: `Dumbbell Press · série ${setNumber}`, exact: true });
}

async function reviewResults(page: Page) {
  await page.getByRole("button", { name: "Revoir/modifier mes résultats", exact: true }).click();
}

test("program uses explicit week and session rails before opening the authoritative workout", async ({ page }) => {
  await page.goto("/?screen=client-program&state=program-published");
  await expect(page.getByRole("heading", { name: "Phase force", exact: true })).toBeVisible();
  await expect(page.getByRole("group", { name: "Semaines du programme", exact: true }).getByRole("button", { pressed: true })).toContainText("Semaine 1");
  await expect(page.getByRole("group", { name: "Séances de la semaine 1", exact: true }).getByRole("button", { pressed: true })).toContainText("Séance A");
  await expect(page.getByText("Choisis ta semaine, puis ta séance.", { exact: true })).toBeVisible();
  await page.getByText("Voir le plan de la séance", { exact: true }).click();
  await expect(page.locator("p").filter({ hasText: "Série 1" })).toContainText("40");
  const open = page.getByRole("link", { name: "Ouvrir la séance", exact: true });
  await expect(open).toHaveAttribute("data-document-navigation", "");
  await expect(open).toHaveAttribute(
    "href",
    `/client/workout?publicationId=${publicationId}&weekNumber=1&sessionId=${sessionId}`,
  );
  const requests = await page.evaluate(
    () => (window as unknown as { __workoutRequests: SaveWorkoutRequest[] }).__workoutRequests,
  );
  expect(requests).toHaveLength(0);
});

test("Client starts explicitly, records real sets and extras, saves, then confirms immutable completion", async ({ page }) => {
  await page.goto(workoutUrl("workout-new"));
  await expect(page.getByRole("heading", { name: "Séance A", exact: true })).toBeVisible();
  await expect(page.getByText("Non commencée", { exact: true })).toBeVisible();
  await expect(page.getByText(/aucun résultat n’est prérempli/i)).toBeVisible();
  await page.getByRole("button", { name: "Commencer la séance", exact: true }).click();
  await expect(page.getByText("Séance commencée. Tu peux maintenant saisir tes résultats.")).toBeVisible();
  await reviewResults(page);

  const first = workoutSet(page, 1);
  await first.getByRole("combobox", { name: "Statut de la série", exact: true }).selectOption("DONE");
  await expect(first.getByRole("spinbutton", { name: /^Répétitions/ })).toHaveValue("");
  await expect(first.getByRole("spinbutton", { name: /^Charge \(lb\)/ })).toHaveValue("");
  await first.getByRole("spinbutton", { name: /^Répétitions/ }).fill("8");
  await first.getByRole("spinbutton", { name: /^Charge \(lb\)/ }).fill("42.5");
  await first.getByRole("spinbutton", { name: /^RIR/ }).fill("2");

  const second = workoutSet(page, 2);
  await second.getByRole("combobox", { name: "Statut de la série", exact: true }).selectOption("SKIPPED");
  await page.getByRole("button", { name: "Ajouter une série extra", exact: true }).click();
  const extra = workoutSet(page, 3);
  await expect(extra.getByText("Extra", { exact: true })).toBeVisible();
  await extra.getByRole("combobox", { name: "Statut de la série", exact: true }).selectOption("DONE");
  await extra.getByRole("spinbutton", { name: /^Répétitions/ }).fill("6");
  await extra.getByRole("spinbutton", { name: /^Charge \(lb\)/ }).fill("35");

  await page.getByRole("button", { name: "Enregistrer les résultats", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Ajoute une note");
  await page.getByLabel(/Contexte utile pour ton suivi/).fill("Épaule sensible; deuxième série ignorée.");
  await page.getByRole("button", { name: "Enregistrer les résultats", exact: true }).click();
  await expect(page.getByText("Résultats enregistrés.", { exact: true })).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Terminer la séance", exact: true }).click();
  await expect(page.getByText(/Résultats conservés en lecture seule/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Ajouter une série extra" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Enregistrer les résultats" })).toHaveCount(0);

  const requests = await page.evaluate(
    () => (window as unknown as { __workoutRequests: SaveWorkoutRequest[] }).__workoutRequests,
  );
  expect(requests).toHaveLength(3);
  expect(requests.map((request) => request.status)).toEqual(["IN_PROGRESS", "IN_PROGRESS", "COMPLETED"]);
  expect(requests[1].sets).toHaveLength(3);
  expect(requests[1].sets[2]).toMatchObject({ setNumber: 3, status: "DONE", reps: 6, load: 35 });
  expect(Object.keys(requests[1].sets[0]).sort()).toEqual([
    "exerciseId",
    "load",
    "reps",
    "rir",
    "setNumber",
    "status",
  ]);
});

test("real browser back cancellation preserves unsaved workout values", async ({ page }) => {
  await page.goto("/?screen=client-program&state=program-published");
  await page.goto(workoutUrl("workout-new"));
  await page.getByRole("button", { name: "Commencer la séance", exact: true }).click();
  await reviewResults(page);
  const first = workoutSet(page, 1);
  await first.getByRole("combobox", { name: "Statut de la série", exact: true }).selectOption("DONE");
  await first.getByRole("spinbutton", { name: /^Répétitions/ }).fill("8");
  await first.getByRole("spinbutton", { name: /^Charge \(lb\)/ }).fill("40");
  const unchangedUrl = page.url();
  const prompt = page.waitForEvent("dialog", { timeout: 10_000 });
  await page.evaluate(() => history.back());
  const dialog = await prompt;
  expect(dialog.type()).toBe("beforeunload");
  await dialog.dismiss();
  await expect(page).toHaveURL(unchangedUrl);
  await expect(first.getByRole("spinbutton", { name: /^Charge \(lb\)/ })).toHaveValue("40");
  await expect(page.getByText("Résultats non enregistrés", { exact: true })).toBeVisible();
});

test("lost response locks entries and retries the identical command and idempotency key", async ({ page }) => {
  await page.goto(workoutUrl("workout-response-lost"));
  await reviewResults(page);
  await page.getByLabel(/Contexte utile pour ton suivi/).fill("Saisie à confirmer.");
  await page.getByRole("button", { name: "Enregistrer les résultats", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("reste à vérifier");
  await expect(page.getByLabel(/Contexte utile pour ton suivi/)).toBeDisabled();
  await page.getByRole("button", { name: "Réessayer pour confirmer", exact: true }).click();
  await expect(page.getByText("Résultats enregistrés.", { exact: true })).toBeVisible();
  const requests = await page.evaluate(
    () => (window as unknown as { __workoutRequests: SaveWorkoutRequest[] }).__workoutRequests,
  );
  expect(requests).toHaveLength(2);
  expect(requests[0]).toEqual(requests[1]);
});

test("version conflict retains visible input until an explicit server reload", async ({ page }) => {
  await page.goto(workoutUrl("workout-conflict"));
  await reviewResults(page);
  const note = page.getByLabel(/Contexte utile pour ton suivi/);
  await note.fill("Ne pas perdre cette saisie.");
  await page.getByRole("button", { name: "Enregistrer les résultats", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Tes saisies restent affichées");
  await expect(note).toHaveValue("Ne pas perdre cette saisie.");
  await expect(note).toBeDisabled();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Recharger la version enregistrée", exact: true }).click();
  await reviewResults(page);
  await expect(note).toHaveValue("");
});

test("a first-start race offers an explicit authoritative reload", async ({ page }) => {
  await page.goto(workoutUrl("workout-start-conflict"));
  await page.getByRole("button", { name: "Commencer la séance", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("L’état de cette séance a changé");
  await expect(page.getByRole("button", { name: "Recharger l’état de la séance", exact: true })).toBeEnabled();
});

for (const sample of [
  { field: /^Répétitions/, value: "1.5" },
  { field: /^Charge \(lb\)/, value: "-1" },
  { field: /^Charge \(lb\)/, value: "0.0000001" },
  { field: /^RIR/, value: "11" },
]) {
  test(`invalid numeric boundary ${sample.value} is rejected without issuing a save`, async ({ page }) => {
    await page.goto(workoutUrl("workout-in-progress"));
    await reviewResults(page);
    const first = workoutSet(page, 1);
    await first.getByRole("spinbutton", { name: sample.field }).fill(sample.value);
    await page.getByRole("button", { name: "Enregistrer les résultats", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("Vérifie les valeurs de la série 1");
    const requests = await page.evaluate(
      () => (window as unknown as { __workoutRequests: SaveWorkoutRequest[] }).__workoutRequests,
    );
    expect(requests).toHaveLength(0);
  });
}

test("a load with exactly six decimal places remains valid", async ({ page }) => {
  await page.goto(workoutUrl("workout-in-progress"));
  await reviewResults(page);
  const first = workoutSet(page, 1);
  await first.getByRole("spinbutton", { name: /^Charge \(lb\)/ }).fill("1.000001");
  await page.getByRole("button", { name: "Enregistrer les résultats", exact: true }).click();
  await expect(page.getByText("Résultats enregistrés.", { exact: true })).toBeVisible();
  const requests = await page.evaluate(
    () => (window as unknown as { __workoutRequests: SaveWorkoutRequest[] }).__workoutRequests,
  );
  expect(requests).toHaveLength(1);
  expect(requests[0].sets[0].load).toBe(1.000001);
});

test("mixed-case session UUIDs match history, start and saved workout responses", async ({ page }) => {
  await page.goto("/?screen=client-program&state=workout-uppercase-session");
  const resume = page.getByRole("link", { name: "Reprendre la séance", exact: true });
  await expect(resume).toHaveAttribute(
    "href",
    `/client/workout?publicationId=${publicationId}&weekNumber=1&sessionId=${uppercaseSessionId}`,
  );

  await page.goto(workoutUrl("workout-uppercase-session-new", uppercaseSessionId));
  await page.getByRole("button", { name: "Commencer la séance", exact: true }).click();
  await expect(page.getByText("Séance commencée. Tu peux maintenant saisir tes résultats.")).toBeVisible();
  await reviewResults(page);
  const note = page.getByLabel(/Contexte utile pour ton suivi/);
  await note.fill("UUID de séance mixte confirmé.");
  await page.getByRole("button", { name: "Enregistrer les résultats", exact: true }).click();
  await expect(page.getByText("Résultats enregistrés.", { exact: true })).toBeVisible();

  await page.goto(workoutUrl("workout-uppercase-session", uppercaseSessionId));
  await expect(page.getByText("En cours", { exact: true })).toBeVisible();
  await reviewResults(page);
  await expect(
    workoutSet(page, 1).getByRole("spinbutton", { name: /^Charge \(lb\)/ }),
  ).toHaveValue("40");
});

test("dirty results survive visibility events and block sidebar or back navigation", async ({ page }) => {
  await page.goto(workoutUrl("workout-dirty"));
  await reviewResults(page);
  const note = page.getByLabel(/Contexte utile pour ton suivi/);
  await note.fill("Résultat non enregistré.");
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect(note).toHaveValue("Résultat non enregistré.");
  let protectedNavigation = false;
  page.once("dialog", async (dialog) => {
    protectedNavigation = dialog.type() === "confirm";
    await dialog.dismiss();
  });
  await page.locator('a[href^="/client/program"]:visible').first().click();
  expect(protectedNavigation).toBe(true);
  await expect(page).toHaveURL(/screen=client-workout/);
  await expect(note).toHaveValue("Résultat non enregistré.");
});

test("completed workout is read-only, bilingual and reflows on narrow screens", async ({ page }) => {
  await page.goto(workoutUrl("workout-completed"));
  await expect(page.getByText("Terminée", { exact: true })).toBeVisible();
  await expect(page.getByText(/résultats conservés en lecture seule/i)).toBeVisible();
  await page.getByRole("button", { name: "Consulter mes résultats", exact: true }).click();
  await expect(page.getByLabel(/Contexte utile pour ton suivi/)).toBeDisabled();
  await expect(workoutSet(page, 1).getByLabel("Statut de la série")).toBeDisabled();
  await page.getByRole("button", { name: "English", exact: true }).click();
  await expect(page.getByRole("heading", { name: "My workout.", exact: true })).toBeVisible();
  await expect(page.getByText(/Results are saved read-only/)).toBeVisible();
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
  }
});

test("program history keeps a completed previous publication readable without guessing a new start", async ({ page }) => {
  await page.goto("/?screen=client-program&state=workout-history");
  await expect(page.getByRole("heading", { name: "Phase force", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Historique des séances", exact: true })).toBeVisible();
  await expect(page.getByText(/Phase fondation · Semaine 1/)).toBeVisible();
  const historical = page.getByRole("region", { name: "Historique des séances", exact: true })
    .getByRole("link", { name: "Voir le résultat", exact: true });
  await expect(historical).toHaveAttribute(
    "href",
    `/client/workout?publicationId=${previousPublicationId}&weekNumber=1&sessionId=${sessionId}`,
  );
  await expect(page.getByRole("link", { name: "Ouvrir la séance", exact: true })).toBeVisible();
});

test("lookbook history distinguishes saved work from completion and keeps the original publication", async ({ page }) => {
  await page.goto("/?screen=client-program&state=workout-history");
  const history = page.getByRole("region", { name: "Historique des séances", exact: true });
  await expect(history.getByText("1 séance enregistrée", { exact: true })).toBeVisible();
  await expect(history.getByText("Terminée", { exact: true })).toBeVisible();
  await expect(history.getByText("En cours", { exact: true })).toHaveCount(0);
  await expect(history.getByText("Phase fondation · Semaine 1 · Publication 1", { exact: true })).toBeVisible();
  await expect(history.getByText(/Dernier enregistrement :/)).toBeVisible();
  await expect(history.locator("time")).toHaveAttribute("datetime", /T.*Z$/);
  const result = history.getByRole("link", { name: "Voir le résultat", exact: true });
  await expect(result).toHaveAccessibleDescription("Séance A");
  await expect(result).toHaveAttribute("data-document-navigation", "");
  await result.focus();
  await expect(result).toBeFocused();
  expect(await result.evaluate(element => getComputedStyle(element).outlineStyle)).toBe("solid");
  expect(await history.evaluate(element => getComputedStyle(element).backgroundColor)).toBe("rgb(16, 20, 22)");
  expect(await history.locator('[data-status="COMPLETED"]').evaluate(element => getComputedStyle(element).color)).toBe("rgb(96, 232, 138)");

  await page.getByRole("button", { name: "English", exact: true }).click();
  const english = page.getByRole("region", { name: "Workout history", exact: true });
  await expect(english.getByText("Completed", { exact: true })).toBeVisible();
  await expect(english.getByText("1 saved workout", { exact: true })).toBeVisible();
  await expect(english.getByText("Foundation phase · Week 1 · Publication 1", { exact: true })).toBeVisible();
  await expect(english.getByText(/Last saved:/)).toBeVisible();
  await expect(english.getByRole("link", { name: "View result", exact: true })).toHaveAccessibleDescription("Session A");

  await page.goto("/?screen=client-program&state=workout-in-progress");
  await expect(history.getByText("En cours", { exact: true })).toBeVisible();
  await expect(history.getByText("Terminée", { exact: true })).toHaveCount(0);
  await expect(history.getByRole("link", { name: "Reprendre", exact: true })).toHaveAttribute(
    "href", `/client/workout?publicationId=${publicationId}&weekNumber=1&sessionId=${sessionId}`,
  );
  expect(await history.locator('[data-status="IN_PROGRESS"]').evaluate(element => getComputedStyle(element).color)).toBe("rgb(255, 122, 26)");
  expect(await page.evaluate(() => (window as unknown as { __workoutRequests: SaveWorkoutRequest[] }).__workoutRequests)).toHaveLength(0);
});

test("lookbook history reflows at 390 and 320 px with legible labels, touch targets and enlarged text", async ({ page }, info) => {
  await page.goto("/?screen=client-program&state=workout-history");
  const history = page.getByRole("region", { name: "Historique des séances", exact: true });
  await expect(history.getByText("Terminée", { exact: true })).toBeVisible();
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    const box = await history.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    const link = await history.getByRole("link", { name: "Voir le résultat", exact: true }).boundingBox();
    expect(link!.height).toBeGreaterThanOrEqual(44);
    expect(link!.width).toBeGreaterThanOrEqual(44);
    expect(await history.locator("time").evaluate(element => Number.parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(14);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await history.screenshot({ path: info.outputPath(`history-fr-${width}.png`) });
  }
  await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
  await expect(history.getByText("Terminée", { exact: true })).toBeVisible();
  await history.screenshot({ path: info.outputPath("history-fr-320-text-200.png") });
  const overflowing = await page.evaluate(() => Array.from(document.querySelectorAll("body *"))
    .filter(element => { const r = element.getBoundingClientRect(); return r.width > 0 && r.left >= 0 && r.right > document.documentElement.clientWidth + 1; })
    .map(element => ({ tag: element.tagName, className: element.className })));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), JSON.stringify(overflowing)).toBe(true);
  for (const language of ["fr", "en"]) {
    if (language === "en") await page.getByRole("button", { name: "English", exact: true }).click();
    const splitWords = await page.locator("[data-workout-history] h2, [data-workout-history] [data-status], [data-workout-history] a").evaluateAll(elements => {
      const split: string[] = [];
      for (const element of elements) {
        const text = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
        while (text.nextNode()) {
          for (const match of (text.currentNode.textContent ?? "").matchAll(/\S+/g)) {
            const range = document.createRange();
            range.setStart(text.currentNode, match.index!);
            range.setEnd(text.currentNode, match.index! + match[0].length);
            if (range.getClientRects().length > 1) split.push(match[0]);
          }
        }
      }
      return split;
    });
    expect(splitWords, `${language}: headings, statuses and action words must not split at 200%`).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  }
  await page.locator("[data-workout-history]").screenshot({ path: info.outputPath("history-en-320-text-200.png") });
});

test("empty history does not invent progress or expose future destinations", async ({ page }) => {
  await page.goto("/?screen=client-program&state=program-published");
  const history = page.getByRole("region", { name: "Historique des séances", exact: true });
  await expect(history.getByText("Aucune séance enregistrée pour le moment.", { exact: true })).toBeVisible();
  await expect(history.locator('[data-status], progress, [role="progressbar"], canvas')).toHaveCount(0);
  await expect(page.locator('a[href^="/client/nutrition"], a[href^="/client/progression"], a[href^="/client/history"]')).toHaveCount(0);
});

test("workout load failure is recoverable and never masquerades as an empty result", async ({ page }) => {
  await page.goto(workoutUrl("workout-load-error"));
  await expect(page.getByRole("alert")).toContainText("n’a pas pu être chargée");
  await expect(page.getByText("Non commencée", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Réessayer", exact: true })).toBeEnabled();
});

test("Coach distinguishes current publication from historical results and lazily reads the snapshot", async ({ page }) => {
  await page.goto("/?screen=coach-workouts&state=coach-workout-history");
  await expect(page.getByRole("heading", { name: "Entraînements et résultats." })).toBeVisible();
  await expect(page.getByText(/Phase force · Publication 2/)).toBeVisible();
  await expect(page.getByText(/Phase fondation · Publication 1/)).toBeVisible();
  await expect(page.getByText(/publication précédente/)).toBeVisible();
  await page.getByRole("button", { name: "Voir la prescription et les résultats" }).click();
  await expect(page.getByRole("heading", { name: "Dumbbell Press" })).toBeVisible();
  await expect(page.getByText(/8 répétitions · 40 lb/)).toBeVisible();
});

test("Coach failure and denied states stay distinct from an empty history and reflow", async ({ page }) => {
  await page.goto("/?screen=coach-workouts&state=coach-workout-error");
  await expect(page.getByRole("alert")).toContainText("Impossible de charger les résultats");
  await expect(page.getByText(/Aucune séance enregistrée/)).toHaveCount(0);
  await page.goto("/?screen=coach-workouts&state=coach-workout-forbidden");
  await expect(page.getByRole("alert")).toContainText("Ce suivi est inaccessible");
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
  }
});
