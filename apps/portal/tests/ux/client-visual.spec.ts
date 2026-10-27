import { expect, test } from "@playwright/test";

for (const language of ["fr", "en"] as const) {
  test(`submitted questionnaire shows the ${language} video slot, not another summary`, async ({ page }, info) => {
    for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }, { width: 320, height: 820 }]) {
      await page.setViewportSize(viewport);
      await page.goto(`/?screen=client-onboarding&state=onboarding-submitted&language=${language}`);
      const completion = page.locator("[data-onboarding-completion]");
      await expect(completion).toBeVisible();
      await expect(page.locator("form, details, video, iframe")).toHaveCount(0);
      await expect(page.getByRole("navigation", { name: /Sections du questionnaire|Questionnaire sections/ })).toHaveCount(0);
      const video = completion.locator("[data-video-language]");
      await expect(video).toHaveAttribute("data-video-language", language);
      await expect(video).toContainText(language === "fr" ? "La vidéo en français sera disponible ici." : "The English video will be available here.");
      const home = page.getByRole("link", { name: language === "fr" ? "Retour à mon accueil" : "Back to my home", exact: true });
      await expect(home).toHaveAttribute("href", "/client");
      const area = (await video.boundingBox())!;
      expect((await home.boundingBox())!.y).toBeGreaterThanOrEqual(area.y + area.height);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      await page.screenshot({ path: info.outputPath(`questionnaire-completed-${language}-${viewport.width}.png`) });
      await page.reload();
      await expect(completion).toBeVisible();
      await expect(page.locator("details")).toHaveCount(0);
    }
  });

  test(`review before submission is preserved, but not repeated after sending in ${language}`, async ({ page }) => {
    // Even entering a draft from landmarks must advance after a real success.
    await page.goto(`/?screen=client-onboarding&state=onboarding-complete-draft&language=${language}&view=responses`);
    await page.getByRole("button", { name: language === "fr" ? "Relire et envoyer" : "Review and send", exact: true }).click();
    await expect(page.locator("details")).toHaveCount(6);
    const send = page.getByRole("button", { name: language === "fr" ? "Envoyer mes réponses à Max" : "Send my answers to Max", exact: true });
    await expect(send).toBeEnabled();
    await send.click();
    await expect(page.locator("[data-onboarding-completion]")).toBeVisible();
    await expect(page.locator("h1")).toBeFocused();
    expect(new URL(page.url()).searchParams.has("view")).toBe(false);
    await expect(page.locator("details, form")).toHaveCount(0);
    await expect(page.locator("[data-video-language]")).toHaveAttribute("data-video-language", language);
  });
}

test("a failed submission keeps the review and never displays successful completion", async ({ page }) => {
  await page.goto("/?screen=client-onboarding&state=onboarding-submit-error");
  await page.getByRole("button", { name: "Relire et envoyer", exact: true }).click();
  await page.getByRole("button", { name: "Envoyer mes réponses à Max", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("On n’a pas reçu la confirmation");
  await expect(page.locator("[data-onboarding-completion]")).toHaveCount(0);
  await expect(page.locator("details")).toHaveCount(6);
  await expect(page.getByRole("button", { name: "Envoyer mes réponses à Max", exact: true })).toBeEnabled();
});

test("the next-step panel is prominent and questionnaire consultation stays in landmarks", async ({ page }) => {
  await page.goto("/?screen=client-v2&state=onboarding-submitted");
  const panel = page.locator("[data-pilot-primary]");
  const label = panel.getByText("Ta prochaine étape", { exact: true });
  await expect(label).toBeVisible();
  expect(await label.evaluate((element) => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(26);
  await expect(panel.getByRole("heading", { name: "Ta semaine zéro", exact: true })).toBeVisible();
  await expect(panel.locator('a[href*="/client/onboarding"]')).toHaveCount(0);
  const landmarks = page.getByRole("region", { name: "Ton parcours" });
  await expect(landmarks.getByRole("link", { name: /Mon questionnaire/ })).toHaveAttribute("href", "/client/onboarding?view=responses");
});

test("questionnaire consultation is explicit from the unchanged Client screens too", async ({ page }) => {
  for (const screen of ["client-today-staff", "client-week-zero", "client-program"]) {
    await page.goto("/?screen=" + screen);
    const menu = page.getByRole("button", { name: /^(Ouvrir le menu|Menu)$/ });
    if (await menu.isVisible()) await menu.click();
    const questionnaire = page.getByRole("link", { name: /^(Mon questionnaire|Questionnaire d’accueil)$/, exact: true });
    await expect(questionnaire).toHaveAttribute("href", "/client/onboarding?view=responses");
  }
});

for (const language of ["fr", "en"] as const) {
  test(`Client visual checkpoint: real actions and first input above the fold in ${language}`, async ({ page }, info) => {
    for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }, { width: 320, height: 820 }]) {
      await page.setViewportSize(viewport);
      await page.goto(`/?screen=client-v2&state=onboarding-not-started&language=${language}`);
      const start = page.getByRole("link", { name: language === "fr" ? "Commencer mon questionnaire" : "Start my questionnaire", exact: true });
      await expect(start).toHaveAttribute("href", "/client/onboarding");
      await expect(start).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      expect((await start.boundingBox())!.y + (await start.boundingBox())!.height).toBeLessThan(viewport.height);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      await expect(page.getByRole("link", { name: "Clients", exact: true })).toHaveCount(0);
      await expect(page.getByText("Alex Martin").first()).toHaveCount(1);
      const photo = page.locator('img[src="/brand/client/father-child.webp"]');
      await photo.scrollIntoViewIfNeeded();
      await expect(photo).toHaveJSProperty("complete", true);
      expect(await photo.evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
      await page.evaluate(() => window.scrollTo(0,0));
      await page.screenshot({ path: info.outputPath(`home-${language}-${viewport.width}.png`) });

      await page.goto(`/?screen=client-onboarding&state=onboarding-not-started&language=${language}`);
      const name = page.locator("#onboarding-fullName");
      await expect(name).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      const firstInput = (await name.boundingBox())!;
      expect(firstInput.y + firstInput.height, `first input at ${viewport.width}px`).toBeLessThan(viewport.height);
      expect(await name.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe("rgb(18, 26, 32)");
      await expect(page.getByRole("progressbar")).toHaveAttribute("value", "0");
      await expect(page.getByRole("progressbar")).toHaveAttribute("max", "54");
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      await page.screenshot({ path: info.outputPath(`questionnaire-edit-${language}-${viewport.width}.png`) });
      if (viewport.width < 1024) {
        await page.getByRole("combobox", { name: language === "fr" ? "Aller à une section" : "Go to a section" }).selectOption("1");
        await expect(page.getByRole("heading", { name: language === "fr" ? "Le cap que tu veux te donner" : "The direction you want to take", exact: true })).toBeFocused();
      }
      await page.goto(`/?screen=client-onboarding&state=onboarding-submitted&language=${language}&view=responses`);
      await expect(page.locator("form")).toHaveCount(0);
      await expect(page.locator("details")).toHaveCount(6);
      await expect(page.locator("h1")).toHaveText("Alex Martin");
      const currentLink = page.locator('[data-pilot-sidebar] a[aria-current="page"]');
      await expect(currentLink).toHaveAttribute("href", "/client/onboarding?view=responses");
      await expect(page.getByText(/Dossier ouvert|Coach Max/)).toHaveCount(0);
      await page.screenshot({ path: info.outputPath(`questionnaire-readonly-${language}-${viewport.width}.png`) });
    }
  });
}

test("published program is retained and never contradicted by Week Zero copy", async ({ page }) => {
  await page.goto("/?screen=client-v2&state=program-published");
  await expect(page.getByRole("link", { name: "Voir mon programme", exact: true })).toHaveAttribute("href", "/client/program?publicationId=19200000-0000-4000-8000-000000000001&weekNumber=1&sessionId=19200000-0000-4000-8000-000000000004&language=fr");
  await expect(page.getByRole("heading", { name: "Semaine zéro transmise", exact: true })).toBeVisible();
  await expect(page.getByText(/programme n’est pas encore disponible|dans cette version/)).toHaveCount(0);
});

test("Client visual loading and errors do not fabricate progress or active access", async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?screen=client-v2&state=client-request-hang-once");
  await expect(page.locator('[data-pilot-state="loading"]')).toBeVisible();
  await expect(page.getByText("Accès actif", { exact: true })).toHaveCount(0);
  await page.screenshot({ path: info.outputPath("home-loading.png") });
  await page.goto("/?screen=client-onboarding&state=onboarding-action-error");
  await expect(page.getByRole("alert")).toContainText("ne peut pas être chargé");
  await expect(page.getByRole("progressbar")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Réessayer", exact: true })).toBeEnabled();
  expect(await page.locator("[data-client-visual]").evaluate((element) => getComputedStyle(element).backgroundColor)).toBe("rgb(16, 20, 22)");
  await page.screenshot({ path: info.outputPath("questionnaire-error.png") });
});

test("Client questionnaire reflows at 200 percent with keyboard menu and readable controls", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?screen=client-onboarding&state=onboarding-draft&language=en");
  await expect(page.locator("#onboarding-fullName")).toHaveValue("Alex Brouillon");
  await page.locator("html").evaluate((element) => { element.style.fontSize = "200%"; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  const trigger = page.getByRole("button", { name: "Menu", exact: true });
  await trigger.focus(); await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Client menu" });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Shift+Tab");
  await expect(dialog.getByRole("button", { name: "Sign out", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await expect(dialog).toHaveCount(0);
});

test("rotating or enlarging the Client menu restores the interactive desktop", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?screen=client-onboarding&state=onboarding-not-started");
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Menu Client" })).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(page.getByRole("dialog", { name: "Menu Client" })).toHaveCount(0);
  await expect(page.locator("[inert]")).toHaveCount(0);
  expect(await page.locator("body").evaluate((element) => element.style.overflow)).not.toBe("hidden");
  await page.locator("#onboarding-fullName").fill("Test rotation");
  await expect(page.locator("#onboarding-fullName")).toHaveValue("Test rotation");
});

test("failed logout feedback remains visible outside the dismissed mobile menu", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const screen of ["client-v2", "client-onboarding"]) {
    await page.goto(`/?screen=${screen}&state=client-logout-network-error`);
    await expect(page.locator("[data-client-visual]")).toBeVisible();
    await page.getByRole("button", { name: "Menu", exact: true }).click();
    await page.getByRole("button", { name: "Se déconnecter", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("alert")).toContainText(/déconnecter|Déconnexion impossible/);
    await expect(page.locator("[inert]")).toHaveCount(0);
  }
});

test("late questionnaire loading cannot erase a failed logout message", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?screen=client-onboarding&state=onboarding-load-logout-error");
  await expect(page.getByText("Chargement du questionnaire…", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await page.getByRole("button", { name: "Se déconnecter", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Déconnexion impossible");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.evaluate(() => (window as unknown as { __releaseOnboardingLoad: () => void }).__releaseOnboardingLoad());
  await expect(page.locator("#onboarding-fullName")).toBeVisible();
  await expect(page.getByRole("alert")).toContainText("Déconnexion impossible");
  await expect(page.locator("[inert]")).toHaveCount(0);
  await expect(page).toHaveURL(/screen=client-onboarding/);
});
