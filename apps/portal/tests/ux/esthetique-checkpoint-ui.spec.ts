import { expect, test, type Page } from "@playwright/test";

async function showSteps(page: Page, french = true) {
  const toggle = page.getByRole("button", { name: french ? /Voir les étapes/ : /View steps/ });
  if (await toggle.isVisible()) await toggle.click();
}

for (const language of ["fr", "en"] as const) {
  const french = language === "fr";
  test(`V1.1 Week Zero: graphite, real states and usable first field in ${language}`, async ({ page }, info) => {
    for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }, { width: 320, height: 820 }]) {
      await page.setViewportSize(viewport);
      await page.goto(`/?screen=client-week-zero&language=${language}`);
      const weight = page.getByLabel(french ? /Poids au réveil/ : /Morning bodyweight/);
      await expect(weight).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      const bounds = (await weight.boundingBox())!;
      // The handoff's 600px first-field requirement is for mobile widths.
      expect(bounds.y + bounds.height, `first field visible without scrolling (${viewport.width}, ${language})`).toBeLessThan(viewport.width < 1024 ? 600 : viewport.height);
      expect(bounds.height).toBeGreaterThanOrEqual(48);
      expect(await weight.evaluate(el => getComputedStyle(el).fontSize)).toBe("16px");
      expect(await weight.evaluate(el => getComputedStyle(el).backgroundColor)).toBe("rgb(18, 26, 32)");
      await expect(page.locator('[data-client-visual="week-zero"]')).toHaveAttribute("lang", language);
      await expect(page.getByRole("progressbar")).toHaveCount(0);
      await expect(page.locator('[data-state="not_started"]')).toBeVisible();
      await expect(page.getByRole("link", { name: "Clients", exact: true })).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      await page.screenshot({ path: info.outputPath(`week-zero-${language}-${viewport.width}.png`), fullPage: true });

      await showSteps(page, french);
      const next = page.getByRole("button", { name: french ? "2. Mobilité" : "2. Mobility", exact: true });
      await next.click();
      await expect(page.getByRole("heading", { name: french ? "Mobilité" : "Mobility", exact: true })).toBeFocused();
      await expect(page.getByText(french ? /sans provoquer une douleur/ : /do not cause pain/)).toBeVisible();
      await expect(page.getByRole("progressbar")).toHaveCount(0);
    }
  });

  test(`V1.1 optional values survive folding and step changes in ${language}`, async ({ page }) => {
    await page.goto(`/?screen=client-week-zero&language=${language}`);
    const summary = page.getByText(french ? "Tes mensurations de départ" : "Your starting measurements", { exact: true });
    await summary.click();
    const chest = page.getByLabel(french ? "Poitrine (po)" : "Chest (in)", { exact: true });
    const note = page.getByRole("textbox", { name: french ? "Autres précisions (facultatif)" : "Other details (optional)", exact: true });
    await chest.fill("42.25");
    await note.fill("Synthétique — valeurs conservées.");
    await summary.click();
    await page.getByRole("button", { name: french ? "Continuer" : "Continue", exact: true }).click();
    await page.getByRole("button", { name: french ? "Précédent" : "Previous", exact: true }).click();
    await summary.click();
    await expect(chest).toHaveValue("42.25");
    await expect(note).toHaveValue("Synthétique — valeurs conservées.");
    await page.getByRole("button", { name: french ? "Enregistrer mon brouillon" : "Save my draft", exact: true }).click();
    await expect(page.locator('[data-state="draft"]')).toBeVisible();
    await expect(chest).toHaveValue("42.25");
    await expect(note).toHaveValue("Synthétique — valeurs conservées.");
  });

  test(`V1.1 invalid folded field is revealed, focused and never saved in ${language}`, async ({ page }) => {
    await page.goto(`/?screen=client-week-zero&language=${language}`);
    const summary = page.getByText(french ? "Tes mensurations de départ" : "Your starting measurements", { exact: true });
    await summary.click();
    const chest = page.getByLabel(french ? "Poitrine (po)" : "Chest (in)", { exact: true });
    await chest.fill("201");
    await summary.click();
    await expect(chest).not.toBeVisible();
    await page.getByRole("button", { name: french ? "Enregistrer mon brouillon" : "Save my draft", exact: true }).click();
    await expect(chest).toBeVisible();
    await expect(chest).toBeFocused();
    await expect(chest).toHaveValue("201");
    await expect(page.locator('[data-state="dirty"]')).toBeVisible();
    await expect(page.locator('[data-state="draft"]')).toHaveCount(0);
  });

  test(`starting measurements stay noticeable and optional on mobile in ${language}`, async ({ page }, info) => {
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto(`/?screen=client-week-zero&language=${language}`);
      const title = page.getByText(french ? "Tes mensurations de départ" : "Your starting measurements", { exact: true });
      await expect(title).toBeVisible();
      await expect(title).toHaveCSS("font-size", "20px");
      const summary = page.locator("summary").filter({ has: title });
      await expect(summary.getByText(french ? "Facultatif" : "Optional", { exact: true })).toBeVisible();
      await expect(summary.getByText(french ? /prends ces mesures dès aujourd’hui/ : /take these measurements today/)).toHaveCSS("font-size", "16px");
      await expect(page.getByLabel(french ? "Poitrine (po)" : "Chest (in)", { exact: true })).not.toBeVisible();
      await summary.focus();
      await page.keyboard.press("Enter");
      const chest = page.getByLabel(french ? "Poitrine (po)" : "Chest (in)", { exact: true });
      await expect(chest).toBeVisible();
      await expect(chest).not.toHaveAttribute("required");
      await summary.focus();
      await page.keyboard.press("Enter");
      await expect(chest).not.toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      await page.screenshot({ path: info.outputPath(`measurements-${language}-${width}.png`), fullPage: true });
    }
  });
}

test("V1.1 mobile menu traps focus, restores it and retains ordinary Client isolation", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 820 });
  await page.goto("/?screen=client-week-zero");
  const toggle = page.getByRole("button", { name: "Menu", exact: true });
  await toggle.click();
  const dialog = page.getByRole("dialog", { name: "Menu Client" });
  await expect(dialog).toBeVisible();
  const close = dialog.getByRole("button", { name: "Fermer le menu", exact: true });
  await expect(close).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(dialog.getByRole("button", { name: "Se déconnecter", exact: true })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(close).toBeFocused();
  await expect(dialog.getByRole("link", { name: "Semaine zéro", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(dialog.locator('a[href="/coach"]')).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(toggle).toBeFocused();
});

test("V1.1 Week Zero supports doubled text and a short keyboard-sized viewport", async ({ page }, info) => {
  await page.setViewportSize({ width: 320, height: 420 });
  await page.goto("/?screen=client-week-zero&language=en");
  await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
  const weight = page.getByLabel(/Morning bodyweight/);
  await expect(weight).toHaveCSS("font-size", "32px");
  // No overflow alone is insufficient: the step must not become one letter per line.
  const stepPosition = page.getByText("1 of 4 · Measurements", { exact: true });
  expect(await stepPosition.evaluate(el => el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight))).toBeLessThanOrEqual(3);
  await weight.fill("198.5");
  await weight.scrollIntoViewIfNeeded();
  const bounds = (await weight.boundingBox())!;
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(420);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await expect(page.getByRole("button", { name: "Save my draft", exact: true })).toBeEnabled();
  await page.screenshot({ path: info.outputPath("week-zero-200-percent.png"), fullPage: true });
});

for (const state of ["assessment-loading", "assessment-load-error", "assessment-submitted", "program-published"]) {
  test(`V1.1 state ${state} stays truthful and does not add exercise assets`, async ({ page }, info) => {
    await page.goto(`/?screen=client-week-zero&state=${state}`);
    await expect(page.locator('[data-client-visual="week-zero"]')).toBeVisible();
    if (state === "assessment-loading") {
      await expect(page.getByRole("status")).toContainText("Chargement du bilan");
    } else if (state === "assessment-load-error") {
      await expect(page.getByRole("alert")).toContainText("Impossible de charger");
      await expect(page.getByRole("button", { name: "Réessayer", exact: true })).toBeEnabled();
    } else {
      await expect(page.locator('[data-state="submitted"]')).toBeVisible();
      await expect(page.getByText(/lecture seule/)).toBeVisible();
      await expect(page.getByText(/La transmission de ce bilan ne publie pas de programme/)).toBeVisible();
      await expect(page.getByText(/Ton programme n’est pas encore publié/)).toHaveCount(0);
    }
    await expect(page.locator("form, video, iframe, progress")).toHaveCount(0);
    // Only the pre-existing brand/logo assets are allowed in this checkpoint.
    const sources = await page.locator("img").evaluateAll(images => images.map(image => image.getAttribute("src")));
    expect(sources.every(src => src === "/brand/fe-logo-splash.png" || src === "/icon-192.png")).toBe(true);
    await page.screenshot({ path: info.outputPath(`week-zero-${state}.png`), fullPage: true });
  });
}

test("program label never claims publication while empty, failed or loading", async ({ page }) => {
  await page.goto("/?screen=client-program");
  await expect(page.getByText("PROGRAMME EN PRÉPARATION", { exact: true })).toBeVisible();
  await expect(page.getByText("TRAINING · PLAN PUBLIÉ", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "English", exact: true }).click();
  await expect(page.getByText("PROGRAM IN PREPARATION", { exact: true })).toBeVisible();
  await page.goto("/?screen=client-program&state=publication-load-error");
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByText(/PLAN PUBLIÉ|PROGRAMME EN PRÉPARATION/)).toHaveCount(0);
  await page.goto("/?screen=client-program&state=program-published");
  await expect(page.getByText("TRAINING · PLAN PUBLIÉ", { exact: true })).toBeVisible();
  // No generalized new theme before the first-page visual checkpoint is approved.
  await expect(page.locator("[data-client-visual]")).toHaveCount(0);
});
