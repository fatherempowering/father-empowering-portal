import { expect, test, type Locator } from "@playwright/test";
import type { SaveWorkoutRequest } from "../../src/lib/contracts/training-results";

const publicationId = "19200000-0000-4000-8000-000000000001";
const sessionId = "19200000-0000-4000-8000-000000000004";
const workoutUrl = `/?screen=client-workout&state=pilot-program&publicationId=${publicationId}&weekNumber=1&sessionId=${sessionId}`;

function firstSet(exercise: Locator) { return exercise.getByRole("region", { name: / · série 1$/ }); }

test("Client receives the 15 frozen pilot exercises with complete bilingual instructions", async ({ page }) => {
  await page.goto("/?screen=client-program&state=pilot-program");
  await page.getByText("Voir le plan de la séance", { exact: true }).click();
  await expect(page.getByRole("heading", { name: "Curl alterné avec haltères", exact: true })).toBeVisible();
  await expect(page.getByText("Exercice pilote · test staging.", { exact: false })).toHaveCount(15);
  const curl = page.getByRole("heading", { name: "Curl alterné avec haltères", exact: true }).locator("..");
  await curl.getByText("Voir les trois étapes du mouvement", { exact: true }).click();
  await expect(curl.getByText(/Comptez les répétitions pour chaque bras séparément/)).toBeVisible();
  await expect(curl.locator("ol > li")).toHaveCount(3);
  await page.getByRole("button", { name: "English", exact: true }).click();
  await expect(page.getByText(/Count repetitions for each arm separately/)).toBeVisible();
  for (const width of [1280, 390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  }
  await expect(page.getByRole("region", { name: "Exercise instructions", exact: true }).locator("img, video, iframe")).toHaveCount(0);
});

test("Client records per-arm reps, carry weights, duration and band setup without invented resistance", async ({ page }) => {
  await page.goto(workoutUrl);
  await page.getByRole("button", { name: "Commencer la séance", exact: true }).click();
  await page.getByRole("button", { name: "Revoir/modifier mes résultats", exact: true }).click();
  const curl = firstSet(page.getByRole("article", { name: "Curl alterné avec haltères", exact: true }));
  await curl.getByRole("combobox").selectOption("DONE");
  await curl.getByRole("spinbutton", { name: /^Répétitions par bras/ }).fill("8");
  await curl.getByRole("spinbutton", { name: /^Charge \(lb\)/ }).fill("20");

  const carry = firstSet(page.getByRole("article", { name: "Marche du fermier avec haltères", exact: true }));
  await carry.getByRole("combobox").selectOption("DONE");
  await carry.getByRole("spinbutton", { name: /^Distance \(m\)/ }).fill("25");
  await page.getByRole("button", { name: "Enregistrer les résultats", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("charges transportées");
  await carry.getByRole("textbox", { name: /^Charges transportées et unités/ }).fill("2 haltères de 20 lb");

  const plank = firstSet(page.getByRole("article", { name: "Planche sur avant-bras", exact: true }));
  await plank.getByRole("combobox").selectOption("DONE");
  await plank.getByRole("spinbutton", { name: /^Durée \(sec\)/ }).fill("42");

  const band = firstSet(page.getByRole("article", { name: "Pallof press debout avec bande", exact: true }));
  await band.getByRole("combobox").selectOption("DONE");
  await band.getByRole("spinbutton", { name: /^Répétitions par côté/ }).fill("10");
  await expect(band.getByRole("spinbutton", { name: /^Charge/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Enregistrer les résultats", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("configuration utilisée");
  await band.getByRole("textbox", { name: /^Configuration utilisée/ }).fill("Bande rouge, ancrage poitrine");
  await page.getByRole("button", { name: "Enregistrer les résultats", exact: true }).click();
  await expect(page.getByText("Résultats enregistrés.", { exact: true })).toBeVisible();

  const requests = await page.evaluate(() => (window as unknown as { __workoutRequests: SaveWorkoutRequest[] }).__workoutRequests);
  const done = requests.at(-1)!.sets.filter(set => set.status === "DONE");
  expect(done).toHaveLength(4);
  expect(done).toEqual(expect.arrayContaining([
    expect.objectContaining({ reps: 8, load: 20 }),
    expect.objectContaining({ reps: null, load: 25, details: "2 haltères de 20 lb" }),
    expect.objectContaining({ reps: null, load: 42 }),
    expect.objectContaining({ reps: 10, load: null, details: "Bande rouge, ancrage poitrine" }),
  ]));
  for (const set of done) expect(Object.keys(set)).not.toEqual(expect.arrayContaining(["unit", "kind"]));
});

test("completed pilot history retains setup details and instructions without editable results", async ({ page }) => {
  await page.goto(workoutUrl.replace("state=pilot-program", "state=pilot-program-completed"));
  await expect(page.getByText("Terminée", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Consulter mes résultats", exact: true }).click();
  const band = firstSet(page.getByRole("article", { name: "Pallof press debout avec bande", exact: true }));
  await expect(band.getByRole("textbox", { name: /^Configuration utilisée/ })).toBeDisabled();
  await expect(band.getByRole("textbox", { name: /^Configuration utilisée/ })).not.toHaveValue("");
  const carry = firstSet(page.getByRole("article", { name: "Marche du fermier avec haltères", exact: true }));
  await expect(carry.getByRole("textbox", { name: /^Charges transportées et unités/ })).toBeDisabled();
  await expect(carry.getByRole("textbox", { name: /^Charges transportées et unités/ })).not.toHaveValue("");
  await expect(page.getByRole("button", { name: "Enregistrer les résultats", exact: true })).toHaveCount(0);
  const curl = page.getByRole("article", { name: "Curl alterné avec haltères", exact: true });
  await curl.getByText("Voir les trois étapes du mouvement", { exact: true }).click();
  await expect(curl.getByText(/Comptez les répétitions pour chaque bras séparément/)).toBeVisible();
  await page.getByRole("button", { name: "English", exact: true }).click();
  await expect(page.getByText(/Count repetitions for each arm separately/)).toBeVisible();
});
