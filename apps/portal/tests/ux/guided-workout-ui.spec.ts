import { expect, test, type Page } from "@playwright/test";
import type { SaveWorkoutRequest } from "../../src/lib/contracts/training-results";

const publicationId = "19200000-0000-4000-8000-000000000001";
const sessionId = "19200000-0000-4000-8000-000000000004";
function url(state = "guided-standard") { return `/?screen=client-workout&state=${state}&publicationId=${publicationId}&weekNumber=1&sessionId=${sessionId}`; }
function setRow(page: Page, name: string, number: number) { return page.getByRole("region", { name: `${name} · série ${number}`, exact: true }); }
async function fillSet(page: Page, name: string, number: number, reps = "8", load = "40") {
  const row = setRow(page, name, number);
  await row.getByRole("spinbutton", { name: /^Répétitions/ }).fill(reps);
  await row.getByRole("spinbutton", { name: /^Charge/ }).fill(load);
}
async function requests(page: Page) {
  return page.evaluate(() => (window as unknown as { __workoutRequests: SaveWorkoutRequest[] }).__workoutRequests);
}

test("one set at a time, real results, rest then superset round, immutable final summary", async ({ page }, info) => {
  await page.goto(url());
  await expect(page.getByRole("heading", { name: "Le plan de ta séance", exact: true })).toBeVisible();
  expect(await requests(page)).toHaveLength(0);
  await page.getByRole("button", { name: "Commencer la séance", exact: true }).click();
  await expect(setRow(page, "Dumbbell Press", 1)).toBeVisible();
  await expect(setRow(page, "Dumbbell Press", 2)).toHaveCount(0);
  await expect(setRow(page, "Dumbbell Press", 1).getByRole("spinbutton", { name: /^Charge/ })).toHaveValue("");
  await expect(page.getByRole("progressbar", { name: "Séries enregistrées", exact: true })).toHaveAttribute("value", "0");
  await page.getByRole("button", { name: "Valider la série", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Indique les répétitions et la charge");
  expect(await requests(page)).toHaveLength(1);
  await fillSet(page, "Dumbbell Press", 1);
  await page.getByRole("button", { name: "Liste des exercices", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Liste des exercices", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Retour à la séance", exact: true }).click();
  await expect(setRow(page, "Dumbbell Press", 1).getByRole("spinbutton", { name: /^Charge/ })).toHaveValue("40");
  await page.getByRole("button", { name: "Valider la série", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Respire. Récupère.", exact: true })).toBeVisible();
  await expect(page.getByText("Repos terminé. Continue quand tu es prêt.", { exact: true })).toBeVisible();
  expect(await requests(page)).toHaveLength(2);
  await expect(setRow(page, "Dumbbell Press", 2)).toHaveCount(0);
  await page.getByRole("button", { name: "Continuer", exact: true }).click();
  await expect(setRow(page, "Dumbbell Press", 2)).toBeVisible();
  await fillSet(page, "Dumbbell Press", 2, "7", "40");
  await page.screenshot({ path: info.outputPath("guided-set.png"), fullPage: true });
  await page.getByRole("button", { name: "Valider la série", exact: true }).click();
  await page.getByRole("button", { name: "Exercice suivant", exact: true }).click();
  await expect(page.getByRole("heading", { name: "SUPERSET", exact: true })).toBeVisible();
  await fillSet(page, "Cable Row", 1, "10", "30");
  await page.getByRole("button", { name: "Valider le tour", exact: true }).click();
  expect(await requests(page)).toHaveLength(3); // Partial round never reaches the server.
  await fillSet(page, "Band Pull-apart", 1, "12", "0");
  await page.getByRole("button", { name: "Valider le tour", exact: true }).click();
  const round = (await requests(page)).at(-1)!;
  expect(round.sets.filter(set => set.status === "DONE")).toHaveLength(4);
  await expect(page.getByRole("heading", { name: "Respire. Récupère.", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Voir le résumé de ma séance", exact: true }).click();
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Terminer la séance", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Ta séance est conservée.", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Terminer la séance", exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Retour à mon programme", exact: true })).toHaveAttribute("href", `/client/program?publicationId=${publicationId}&weekNumber=1&sessionId=${sessionId}&language=fr`);
  expect((await requests(page)).map(item => item.status)).toEqual(["IN_PROGRESS", "IN_PROGRESS", "IN_PROGRESS", "IN_PROGRESS", "COMPLETED"]);
  await page.screenshot({ path: info.outputPath("guided-completed.png"), fullPage: true });
});

test("guided response loss keeps progress unconfirmed and retries the identical command", async ({ page }) => {
  await page.goto(url("guided-response-lost"));
  await page.getByRole("button", { name: "Commencer la séance", exact: true }).click();
  await fillSet(page, "Dumbbell Press", 1);
  await page.getByRole("button", { name: "Valider la série", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("reste à vérifier");
  await expect(page.getByRole("progressbar", { name: "Séries enregistrées", exact: true })).toHaveAttribute("value", "0");
  await expect(page.getByRole("heading", { name: "Respire. Récupère.", exact: true })).toHaveCount(0);
  await expect(setRow(page, "Dumbbell Press", 1).getByRole("spinbutton", { name: /^Charge/ })).toBeDisabled();
  await page.getByRole("button", { name: "Réessayer pour confirmer", exact: true }).click();
  await expect(page.getByRole("progressbar", { name: "Séries enregistrées", exact: true })).toHaveAttribute("value", "1");
  const commands = await requests(page);
  expect(commands).toHaveLength(3);
  expect(commands[1]).toEqual(commands[2]);
});

test("resume uses saved progress, skip requires a note and narrow layouts stay contained", async ({ page }) => {
  await page.goto(url("workout-in-progress"));
  await page.getByRole("button", { name: "Reprendre ma séance", exact: true }).click();
  await expect(setRow(page, "Dumbbell Press", 2)).toBeVisible();
  await expect(setRow(page, "Dumbbell Press", 1)).toHaveCount(0);
  await page.getByRole("button", { name: "Ignorer cette série", exact: true }).click();
  await page.getByRole("button", { name: "Valider la série", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Ajoute une note");
  expect(await requests(page)).toHaveLength(0);
  await page.getByRole("textbox", { name: /Contexte utile/ }).fill("Fatigue, arrêt de la série.");
  await page.getByRole("button", { name: "Valider la série", exact: true }).click();
  expect((await requests(page))[0].sets[1].status).toBe("SKIPPED");
  await page.getByRole("button", { name: "Voir le résumé de ma séance", exact: true }).click();
  for (const width of [1280, 390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  }
  await page.getByRole("button", { name: "English", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Review, then finish your workout.", exact: true })).toBeVisible();
});

test("partly saved superset resumes without changing confirmed results or inventing partner extras", async ({ page }) => {
  await page.goto(url("guided-partial"));
  await page.getByRole("button", { name: "Reprendre ma séance", exact: true }).click();
  await expect(page.getByRole("heading", { name: "SUPERSET", exact: true })).toBeVisible();
  const confirmed = setRow(page, "Cable Row", 1).getByRole("spinbutton", { name: /^Charge/ });
  await expect(confirmed).toHaveValue("30");
  await expect(confirmed).toBeDisabled();
  await fillSet(page, "Band Pull-apart", 1, "12", "0");
  await page.getByRole("button", { name: "Valider le tour", exact: true }).click();
  await page.getByRole("button", { name: "Ajouter une série extra · Cable Row", exact: true }).click();
  await expect(setRow(page, "Cable Row", 2)).toBeVisible();
  await expect(setRow(page, "Band Pull-apart", 2)).toHaveCount(0);
  await fillSet(page, "Cable Row", 2, "6", "25");
  await page.getByRole("button", { name: "Valider la série", exact: true }).click();
  const commands = await requests(page);
  expect(commands).toHaveLength(2);
  expect(commands[1].sets).toHaveLength(5);
  expect(commands[1].sets.find(set => set.exerciseId === "19600000-0000-4000-8000-000000000201" && set.setNumber === 1)).toMatchObject({ load: 30, reps: 8, status: "DONE" });
  expect(commands[1].sets.filter(set => set.exerciseId === "19600000-0000-4000-8000-000000000202")).toHaveLength(1);
  await expect(page.getByRole("progressbar", { name: "Séries enregistrées", exact: true })).toHaveAttribute("value", "5");
});

test("unvalidated guided input is protected on links and browser Back without becoming a saved result", async ({ page }) => {
  await page.goto("/?screen=client-program&state=program-published");
  await page.goto(url());
  await page.getByRole("button", { name: "Commencer la séance", exact: true }).click();
  await fillSet(page, "Dumbbell Press", 1, "8", "42.5");
  await expect(page.getByText("Résultats non enregistrés", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Revoir/modifier mes résultats", exact: true })).toBeDisabled();
  page.once("dialog", dialog => dialog.dismiss());
  await page.getByRole("link", { name: "← Mon programme", exact: true }).click();
  await expect(setRow(page, "Dumbbell Press", 1).getByRole("spinbutton", { name: /^Charge/ })).toHaveValue("42.5");
  const currentUrl = page.url();
  const prompt = page.waitForEvent("dialog");
  await page.evaluate(() => history.back());
  const dialog = await prompt;
  expect(dialog.type()).toBe("beforeunload");
  await dialog.dismiss();
  await expect(page).toHaveURL(currentUrl);
  await expect(setRow(page, "Dumbbell Press", 1).getByRole("spinbutton", { name: /^Charge/ })).toHaveValue("42.5");
  expect(await requests(page)).toHaveLength(1);
  await expect(page.getByRole("progressbar", { name: "Séries enregistrées", exact: true })).toHaveAttribute("value", "0");
});

test("explicit guide transitions and validation errors restore visible focus without stealing typing focus", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(url());
  await page.getByRole("button", { name: "Commencer la séance", exact: true }).click();
  const title = page.locator("#guided-current-title");
  await expect(title).toBeFocused();
  expect((await title.boundingBox())!.y).toBeGreaterThanOrEqual(60);
  expect((await title.boundingBox())!.y).toBeLessThan(500);
  const load = setRow(page, "Dumbbell Press", 1).getByRole("spinbutton", { name: /^Charge/ });
  await load.fill("40");
  await expect(load).toBeFocused();
  await page.getByRole("button", { name: "Valider la série", exact: true }).click();
  const alert = page.getByRole("alert");
  await expect(alert).toContainText("Indique les répétitions et la charge");
  expect((await alert.boundingBox())!.y).toBeGreaterThanOrEqual(60);
  expect((await alert.boundingBox())!.y).toBeLessThan(500);
  await fillSet(page, "Dumbbell Press", 1);
  await page.getByRole("button", { name: "Valider la série", exact: true }).click();
  await expect(page.locator("#rest-timer-title")).toBeFocused();
  await expect(page.getByRole("button", { name: "Continuer", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Continuer", exact: true }).click();
  await expect(title).toBeFocused();
  expect((await title.boundingBox())!.y).toBeLessThan(500);
});
