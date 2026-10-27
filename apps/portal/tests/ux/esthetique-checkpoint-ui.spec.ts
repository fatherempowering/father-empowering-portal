import { expect, test, type Page } from "@playwright/test";

async function showSteps(page: Page, french = true) {
  await expect(page.getByRole("navigation", { name: french ? /Étapes de la semaine zéro/ : /Week Zero steps/ })).toBeVisible();
  const toggle = page.getByRole("button", { name: french ? /Voir les étapes/ : /View steps/ });
  if (await toggle.isVisible()) await toggle.click();
}

for (const language of ["fr", "en"] as const) {
  const french = language === "fr";
  test(`V1.1 Week Zero: graphite, real states and usable first field in ${language}`, async ({ page }, info) => {
    for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }, { width: 320, height: 820 }]) {
      await page.setViewportSize(viewport);
      await page.goto(`/?screen=client-week-zero&language=${language}`);
      await showSteps(page, french);
      await page.getByRole("button", { name: french ? "3. Mesures" : "3. Measurements", exact: true }).click();
      const weight = page.getByRole("spinbutton", { name: french ? /Poids au réveil/ : /Morning bodyweight/ });
      await expect(weight).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await weight.scrollIntoViewIfNeeded();
      const bounds = (await weight.boundingBox())!;
      expect(bounds.y, `measurement reachable (${viewport.width}, ${language})`).toBeGreaterThanOrEqual(0);
      expect(bounds.y + bounds.height, `measurement reachable (${viewport.width}, ${language})`).toBeLessThanOrEqual(viewport.height);
      expect(bounds.height).toBeGreaterThanOrEqual(48);
      expect(await weight.evaluate(el => getComputedStyle(el).fontSize)).toBe("16px");
      expect(await weight.evaluate(el => getComputedStyle(el).backgroundColor)).toBe("rgb(18, 26, 32)");
      await expect(page.locator('[data-client-visual="week-zero"]')).toHaveAttribute("lang", language);
      await expect(page.getByRole("progressbar", { name: french ? /Progression de la semaine zéro/ : /Week Zero progress/ })).toBeVisible();
      await expect(page.locator('[data-state="not_started"]')).toBeVisible();
      await expect(page.getByRole("link", { name: "Clients", exact: true })).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      await page.screenshot({ path: info.outputPath(`week-zero-${language}-${viewport.width}.png`), fullPage: true });

      await showSteps(page, french);
      const next = page.getByRole("button", { name: french ? "6. Mobilité" : "6. Mobility", exact: true });
      await next.click();
      await expect(page.getByRole("heading", { name: french ? "Ton corps après la séance" : "Your body after training", exact: true })).toBeFocused();
      await expect(page.getByText(french ? /Après ta séance de gym/ : /After your gym session/)).toBeVisible();
      await expect(page.getByRole("progressbar")).toBeVisible();
    }
  });

  test(`V1.1 optional values survive step changes in ${language}`, async ({ page }) => {
    await page.goto(`/?screen=client-week-zero&language=${language}`);
    await showSteps(page, french);
    await page.getByRole("button", { name: french ? "3. Mesures" : "3. Measurements", exact: true }).click();
    const chest = page.getByRole("spinbutton", { name: french ? /Poitrine \(po\)/ : /Chest \(in\)/ });
    const note = page.getByRole("textbox", { name: french ? "Une précision à ajouter ? (facultatif)" : "Anything to add? (optional)", exact: true });
    await chest.fill("42.25");
    await note.fill("Synthétique — valeurs conservées.");
    await page.getByRole("button", { name: french ? "On continue" : "Let’s continue", exact: true }).click();
    await page.getByRole("button", { name: french ? "Précédent" : "Previous", exact: true }).click();
    await expect(chest).toHaveValue("42.25");
    await expect(note).toHaveValue("Synthétique — valeurs conservées.");
    await page.getByRole("button", { name: french ? "Enregistrer mon brouillon" : "Save my draft", exact: true }).click();
    await expect(page.locator('[data-state="draft"]')).toBeVisible();
    await expect(chest).toHaveValue("42.25");
    await expect(note).toHaveValue("Synthétique — valeurs conservées.");
  });

  test(`V1.1 invalid measurement is focused and never saved in ${language}`, async ({ page }) => {
    await page.goto(`/?screen=client-week-zero&language=${language}`);
    await showSteps(page, french);
    await page.getByRole("button", { name: french ? "3. Mesures" : "3. Measurements", exact: true }).click();
    const chest = page.getByRole("spinbutton", { name: french ? /Poitrine \(po\)/ : /Chest \(in\)/ });
    await chest.fill("201");
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
      await showSteps(page, french);
      await page.getByRole("button", { name: french ? "3. Mesures" : "3. Measurements", exact: true }).click();
      const title = page.getByText(french ? "Tes mensurations de départ" : "Your starting measurements", { exact: true });
      await expect(title).toBeVisible();
      await expect(title).toHaveCSS("font-size", "20px");
      await expect(page.getByText(french ? /sont facultatifs/ : /are optional/)).toBeVisible();
      const chest = page.getByRole("spinbutton", { name: french ? /Poitrine \(po\)/ : /Chest \(in\)/ });
      await expect(chest).toBeVisible();
      await expect(chest).not.toHaveAttribute("required");
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
  await showSteps(page, false);
  await page.getByRole("button", { name: "3. Measurements", exact: true }).click();
  const weight = page.getByRole("spinbutton", { name: /Morning bodyweight/ });
  await expect(weight).toHaveCSS("font-size", "32px");
  // No overflow alone is insufficient: the step must not become one letter per line.
  const stepPosition = page.getByText("3 of 7 · Measurements", { exact: true });
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
      await expect(page.getByRole("status")).toContainText("Chargement de la semaine zéro");
    } else if (state === "assessment-load-error") {
      await expect(page.getByRole("alert")).toContainText("Impossible de charger");
      await expect(page.getByRole("button", { name: "Réessayer", exact: true })).toBeEnabled();
    } else if (state === "assessment-submitted") {
      await expect(page.locator('[data-state="not_started"]')).toBeVisible();
      await expect(page.getByText("Ton ancien bilan", { exact: true })).toBeVisible();
      await expect(page.locator('[data-state="submitted"]')).toHaveCount(0);
    } else {
      await expect(page.locator('[data-state="submitted"]')).toBeVisible();
      await expect(page.getByText(/ne peuvent plus être modifiées/)).toBeVisible();
      await expect(page.getByText(/Ton programme n’est pas encore publié/)).toHaveCount(0);
    }
    await expect(page.locator("video, iframe")).toHaveCount(0);
    // Only the pre-existing brand/logo assets are allowed in this checkpoint.
    const sources = await page.locator("img").evaluateAll(images => images.map(image => image.getAttribute("src")));
    expect(sources.every(src => src === "/brand/fe-logo-splash.png" || src === "/icon-192.png")).toBe(true);
    await page.screenshot({ path: info.outputPath(`week-zero-${state}.png`), fullPage: true });
  });
}

test("program label never claims publication while empty, failed or loading", async ({ page }) => {
  await page.goto("/?screen=client-program");
  await expect(page.getByText("PROGRAMME EN PRÉPARATION", { exact: true })).toBeVisible();
  await expect(page.getByText("TRAINING · PROGRAMME DISPONIBLE", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "English", exact: true }).click();
  await expect(page.getByText("PROGRAM IN PREPARATION", { exact: true })).toBeVisible();
  await page.goto("/?screen=client-program&state=publication-load-error");
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByText(/PROGRAMME DISPONIBLE|PROGRAMME EN PRÉPARATION/)).toHaveCount(0);
  await page.goto("/?screen=client-program&state=program-published");
  await expect(page.getByText("TRAINING · PROGRAMME DISPONIBLE", { exact: true })).toBeVisible();
  // No generalized new theme before the first-page visual checkpoint is approved.
  await expect(page.locator("[data-client-visual]")).toHaveCount(0);
});
