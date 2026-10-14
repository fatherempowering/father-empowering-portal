import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { getM1TestEnvironment, seedStaffIdentity } from "../harness/m1-local-supabase";
import { extractSixDigitOtp, waitForMail } from "../harness/mailpit";

const environment = getM1TestEnvironment();

test("Coach verified → persistent exercise library → archive → logout", async ({ page }) => {
  const password = "Training-local-test-only!123";
  const coach = await seedStaffIdentity(environment, {
    email: `training.e2e.${randomUUID()}@example.test`, password, role: "COACH",
  });
  await page.goto(`${environment.appUrl}/coach/exercises`);
  await expect(page).toHaveURL(/\/login(?:\?.*)?$/);
  await page.getByLabel(/courriel|email/i).fill(coach.email);
  await page.getByLabel(/^mot de passe$/i).fill(password);
  await page.getByRole("button", { name: /se connecter|sign in|continuer/i }).click();
  await expect(page).toHaveURL(/\/verify-email(?:\?.*)?$/);
  const mail = await waitForMail(environment.mailpitUrl, coach.email, (message) => {
    try { extractSixDigitOtp(message); return true; } catch { return false; }
  });
  await page.getByRole("textbox", { name: /chiffre 1 sur 6/i }).fill(extractSixDigitOtp(mail));
  await page.getByRole("button", { name: /ouvrir mon espace coach/i }).click();
  await expect(page).toHaveURL(/\/coach(?:\?.*)?$/);
  await page.getByRole("link", { name: "Exercices", exact: true }).click();
  await expect(page).toHaveURL(/\/coach\/exercises$/);
  await page.getByLabel("Nom de l’exercice (anglais)").fill("Dumbbell Press");
  await page.getByLabel("Équipement", { exact: true }).fill("Haltères");
  await page.getByRole("button", { name: "Enregistrer l’exercice", exact: true }).click();
  await expect(page.getByText("Exercice enregistré dans la bibliothèque.", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Dumbbell Press", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Modifier Dumbbell Press" }).click();
  await expect(page.getByLabel("Équipement", { exact: true })).toHaveValue("Haltères");
  await page.getByLabel("Archiver cet exercice (sans le supprimer)").check();
  await page.getByRole("button", { name: "Enregistrer l’exercice", exact: true }).click();
  await expect(page.getByText("Exercice archivé. Il reste conservé dans la bibliothèque.")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Dumbbell Press", exact: true })).toHaveCount(0);
  await page.getByLabel("Afficher", { exact: true }).selectOption("true");
  await expect(page.getByRole("heading", { name: "Dumbbell Press", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Se déconnecter", exact: true }).click();
  await expect(page).toHaveURL(/\/login(?:\?.*)?$/);
  await page.goto(`${environment.appUrl}/coach/exercises`);
  await expect(page).toHaveURL(/\/login(?:\?.*)?$/);
});
