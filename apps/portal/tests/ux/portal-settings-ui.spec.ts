import { expect, test, type Page } from "@playwright/test";

for (const entry of ["/?screen=landing-en", "/client/program?language=en"]) test(`English entry ${entry} persists into Auth without a redundant language click`, async ({ page }) => {
  await page.goto(entry);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await page.goto("/?screen=login");
  await expect(page.getByRole("heading", { name: "Return to your portal.", exact: true })).toBeVisible();
});

async function settings(page: Page) { await page.getByRole("button", { name: /^(Ouvrir les réglages|Open settings)$/ }).click(); }
async function closeSettings(page: Page) { await page.getByRole("button", { name: /^(Fermer les réglages|Close settings)$/ }).click(); }

test("Client gear restores the five Legacy settings and remembers language/theme across pages", async ({ page }) => {
  await page.goto("/client?language=fr");
  const gear = page.getByRole("button", { name: "Ouvrir les réglages", exact: true });
  const box = await gear.boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(44); expect(box!.height).toBeGreaterThanOrEqual(44);
  await settings(page);
  const dialog = page.getByRole("dialog", { name: "Réglages", exact: true });
  for (const heading of ["Langue", "Actualiser le portail", "Exporter mes données", "Apparence"]) await expect(dialog.getByRole("heading", { name: heading, exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "À propos", exact: true }).click();
  await expect(dialog.getByRole("heading", { name: "Father Empowering — Legacy Protocol" })).toBeVisible();
  await dialog.getByRole("button", { name: "English", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Settings", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Dark", exact: true }).click();
  await closeSettings(page);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.goto("/client/program");
  await expect(page.getByRole("navigation", { name: "Portal navigation" })).toBeVisible();
  await expect(page.getByRole("group", { name: "Program weeks" })).toBeVisible();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await settings(page); await page.getByRole("button", { name: "Light", exact: true }).click(); await closeSettings(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});

test("English persists into Client Auth and does not change the anti-enumeration message", async ({ page }) => {
  await page.goto("/?screen=login");
  await page.getByRole("button", { name: "English", exact: true }).click();
  await page.getByRole("textbox", { name: "Email", exact: true }).fill("test@example.test");
  await page.getByRole("button", { name: "Send my code", exact: true }).click();
  await expect(page.getByText("If this account is active, the code has been sent.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Français", exact: true }).click();
  await expect(page.getByText("Si ce compte est actif, le code a été envoyé.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "English", exact: true }).click();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Return to your portal." })).toBeVisible();
});

test("Coach language changes neither authored draft input nor publication and excludes client export", async ({ page }) => {
  await page.goto("/?screen=program-builder");
  await page.getByLabel("Titre du programme · français").fill("Mon plan non traduit");
  await settings(page);
  await expect(page.getByRole("button", { name: "Télécharger mes progrès", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "English", exact: true }).click();
  await closeSettings(page);
  await expect(page.getByRole("heading", { name: "Program builder", exact: true })).toBeVisible();
  await expect(page.getByLabel("Program title · French")).toHaveValue("Mon plan non traduit");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByText("Draft saved. No client can see these changes.", { exact: true })).toBeVisible();
  const requests = await page.evaluate(() => (window as unknown as { __programRequests: { document: { title: { fr: string } } }[] }).__programRequests);
  expect(requests).toHaveLength(1); expect(requests[0].document.title.fr).toBe("Mon plan non traduit");
});

test("gear closes with Escape and restores keyboard focus", async ({ page }) => {
  await page.goto("/client");
  await settings(page);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Ouvrir les réglages", exact: true })).toBeFocused();
});

test("public home has an immediate bilingual entry and preserves the choice on reload", async ({ page }) => {
  await page.goto("/?screen=landing-fr");
  await page.getByRole("button", { name: "English", exact: true }).click();
  await expect(page.getByRole("link", { name: "Client login", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Coach login", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("link", { name: "Client login", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Français", exact: true }).click();
  await expect(page.getByRole("link", { name: "Connexion client", exact: true })).toBeVisible();
});
