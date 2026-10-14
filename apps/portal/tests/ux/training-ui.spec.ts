import { expect, test } from "@playwright/test";

test("Coach creates, edits, searches and archives a reusable exercise", async ({ page }) => {
  await page.goto("/?screen=exercise-library");
  await expect(page.getByRole("heading", { name: "Tes exercices." })).toBeVisible();
  await expect(page.getByText("Ta bibliothèque est vide.", { exact: false })).toBeVisible();
  await page.getByLabel("Nom de l’exercice (anglais)").fill("Dumbbell Press");
  await page.getByLabel("Équipement", { exact: true }).fill("Haltères");
  await page.getByLabel("Consigne courte · français").fill("Contrôle la descente.");
  await page.getByRole("button", { name: "Enregistrer l’exercice", exact: true }).click();
  await expect(page.getByText("Exercice enregistré dans la bibliothèque.", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Dumbbell Press", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Modifier Dumbbell Press" }).click();
  await expect(page.getByLabel("Nom de l’exercice (anglais)")).toBeFocused();
  await page.getByLabel("Nom de l’exercice (anglais)").fill("Incline Dumbbell Press");
  await page.getByRole("button", { name: "Enregistrer l’exercice", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Incline Dumbbell Press", exact: true })).toBeVisible();
  await page.getByLabel("Rechercher par nom").fill("Squat");
  await page.getByRole("button", { name: "Rechercher", exact: true }).click();
  await expect(page.getByText("Aucun exercice ne correspond à cette recherche.")).toBeVisible();
  await page.getByLabel("Rechercher par nom").fill("");
  await page.getByRole("button", { name: "Rechercher", exact: true }).click();
  await page.getByLabel("Archiver cet exercice (sans le supprimer)").check();
  await page.getByRole("button", { name: "Enregistrer l’exercice", exact: true }).click();
  await expect(page.getByText("Exercice archivé. Il reste conservé dans la bibliothèque.")).toBeVisible();
  await page.getByLabel("Afficher", { exact: true }).selectOption("true");
  await expect(page.getByRole("heading", { name: "Incline Dumbbell Press", exact: true })).toBeVisible();
  await page.getByLabel("Archiver cet exercice (sans le supprimer)").uncheck();
  await page.getByRole("button", { name: "Enregistrer l’exercice", exact: true }).click();
  await expect(page.getByText("Aucun exercice archivé.")).toBeVisible();
  const inputs = await page.evaluate(() => (window as unknown as { __exerciseRequests: { id: string | null; expectedVersion: number }[] }).__exerciseRequests);
  expect(inputs.map((input) => input.expectedVersion)).toEqual([0, 1, 2, 3]);
  expect(new Set(inputs.slice(1).map((input) => input.id)).size).toBe(1);
});

test("lost confirmation retries identical mutation without duplicate or optimistic success", async ({ page }) => {
  await page.goto("/?screen=exercise-library&state=exercise-response-lost");
  await page.getByLabel("Nom de l’exercice (anglais)").fill("Dumbbell Press");
  await page.getByRole("button", { name: "Enregistrer l’exercice", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("La confirmation n’est pas arrivée");
  await expect(page.getByLabel("Nom de l’exercice (anglais)")).toBeDisabled();
  await expect(page.getByText("Exercice enregistré dans la bibliothèque.")).toHaveCount(0);
  await page.getByRole("button", { name: "Réessayer l’enregistrement" }).click();
  await expect(page.getByText("Exercice enregistré dans la bibliothèque.")).toBeVisible();
  const inputs = await page.evaluate(() => (window as unknown as { __exerciseRequests: unknown[] }).__exerciseRequests);
  expect(inputs).toHaveLength(2); expect(inputs[0]).toEqual(inputs[1]);
  await expect(page.getByRole("heading", { name: "Dumbbell Press", exact: true })).toHaveCount(1);
});

test("conflict retains user input and blocks overwriting", async ({ page }) => {
  await page.goto("/?screen=exercise-library&state=exercise-conflict");
  await page.getByLabel("Nom de l’exercice (anglais)").fill("My Exercise");
  await page.getByRole("button", { name: "Enregistrer l’exercice", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Tes saisies sont conservées");
  await expect(page.getByLabel("Nom de l’exercice (anglais)")).toHaveValue("My Exercise");
  await expect(page.getByRole("button", { name: "Enregistrer l’exercice", exact: true })).toBeDisabled();
});

test("load failure does not masquerade as empty library and form fits small screens", async ({ page }) => {
  await page.goto("/?screen=exercise-library&state=exercise-load-error");
  await expect(page.getByRole("alert")).toContainText("Impossible de charger la bibliothèque");
  await expect(page.getByText("Ta bibliothèque est vide.", { exact: false })).toHaveCount(0);
  for (const width of [1280, 390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  }
  await expect(page.getByText("Aucun lecteur ni téléversement n’est encore actif.", { exact: false })).toBeVisible();
});
