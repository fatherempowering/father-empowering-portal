import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";

const v2CaptureDirectory = resolve(
  process.cwd(),
  "docs/client/captures-v2",
);

for (const landing of [
  {
    screen: "landing-en",
    lang: "en",
    headline: ["Same", "standards.", "Different", "day."],
    coach: "Coach login",
    client: "Client login",
  },
  {
    screen: "landing-fr",
    lang: "fr",
    headline: ["Mêmes", "standards.", "Nouveau", "jour."],
    coach: "Connexion coach",
    client: "Connexion client",
  },
] as const) {
  test(`approved ${landing.lang.toUpperCase()} landing preserves assets, links and responsive crops`, async ({
    page,
  }) => {
    for (const viewport of [
      { width: 1536, height: 1024, asset: "hero-desktop.webp" },
      { width: 390, height: 844, asset: "hero-mobile.webp" },
      { width: 320, height: 820, asset: "hero-mobile.webp" },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto(`/?screen=${landing.screen}`);

      await expect(page.locator("h1 > span")).toHaveText(landing.headline);
      await expect(page.getByRole("link", { name: landing.coach })).toHaveAttribute(
        "href",
        "/login",
      );
      await expect(page.getByRole("link", { name: landing.client })).toHaveAttribute(
        "href",
        "/client-login",
      );
      await expect(page.locator('img[alt="Father Empowering"]')).toHaveAttribute(
        "src",
        "/brand/fe-logo-splash.png",
      );
      await expect(page.locator("picture img")).toHaveJSProperty(
        "complete",
        true,
      );
      expect(
        await page.locator("picture img").evaluate(
          (image, asset) =>
            (image as HTMLImageElement).currentSrc.endsWith(asset),
          viewport.asset,
        ),
      ).toBe(true);
      expect(await page.locator("html").getAttribute("lang")).toBe(landing.lang);
      expect(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth <=
            document.documentElement.clientWidth,
        ),
        `${landing.lang} landing at ${viewport.width}px`,
      ).toBe(true);
    }
  });
}

test("landing keeps focus visible and reflows at 200% on 320px", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 820 });
  await page.goto("/?screen=landing-fr");
  await page.locator("html").evaluate((element) => {
    element.style.fontSize = "200%";
  });

  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
  const skip = page.getByRole("link", { name: "Aller aux options de connexion" });
  await skip.focus();
  await expect(skip).toBeFocused();
  expect(await skip.evaluate((element) => getComputedStyle(element).transform)).toBe(
    "none",
  );
  const client = page.getByRole("link", { name: "Connexion client" });
  await client.focus();
  expect(await client.evaluate((element) => getComputedStyle(element).outlineWidth)).toBe(
    "3px",
  );
});

test("Client V2 pilot preserves the dark FE composition without invented program data", async ({
  page,
}) => {
  for (const viewport of [
    { width: 1672, height: 941, asset: "hero-desktop.webp" },
    { width: 390, height: 844, asset: "hero-mobile.webp" },
    { width: 320, height: 820, asset: "hero-mobile.webp" },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/?screen=client-v2");
    const pilot = page.locator("[data-client-v2-pilot]");
    await expect(page.getByRole("heading", { name: "Ton portail." })).toBeVisible();
    await expect(page.getByText("Bienvenue, Alex Martin.")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Ton accès est confirmé." }),
    ).toBeVisible();
    await expect(
      page.getByText(
        "Aucune action de programme n’est disponible dans ce portail pour le moment. Tu n’as rien à compléter ici.",
      ),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Voir aujourd’hui" })).toHaveCount(0);
    await expect(page.getByText(/87,4 kg|7 h 28|3 \/ 4|score|séance du jour/i)).toHaveCount(0);
    expect(await pilot.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe(
      "rgb(16, 20, 22)",
    );

    const hero = page.locator("[data-pilot-hero]");
    const heroHeight = (await hero.boundingBox())?.height ?? 0;
    expect(heroHeight).toBeGreaterThanOrEqual(180);
    expect(heroHeight).toBeLessThanOrEqual(240);
    expect(
      await hero.locator("picture img").evaluate(
        (image, asset) => (image as HTMLImageElement).currentSrc.endsWith(asset),
        viewport.asset,
      ),
    ).toBe(true);

    const topbarHeight =
      (await page.locator("[data-pilot-topbar]").boundingBox())?.height ?? 0;
    if (viewport.width > 672) {
      const sidebarWidth =
        (await page.locator("[data-pilot-sidebar]").boundingBox())?.width ?? 0;
      expect(sidebarWidth).toBeGreaterThanOrEqual(
        viewport.width > 1024 ? 200 : 160,
      );
      expect(sidebarWidth).toBeLessThanOrEqual(
        viewport.width > 1024 ? 216 : 176,
      );
      expect(topbarHeight).toBeGreaterThanOrEqual(80);
      expect(topbarHeight).toBeLessThanOrEqual(96);
    } else {
      await expect(page.locator("[data-pilot-sidebar]")).toBeHidden();
      expect(topbarHeight).toBeGreaterThanOrEqual(76);
    }
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
      `Client V2 at ${viewport.width}px`,
    ).toBe(true);
  }
});

test("Client V2 mobile menu traps focus, closes with Escape and returns focus", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?screen=client-v2");
  await expect(page.getByRole("heading", { name: "Ton portail." })).toBeVisible();

  const trigger = page.getByRole("button", { name: "Menu" });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Menu Client" });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("link", { name: "Accueil", exact: true }),
  ).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(dialog.getByRole("link", { name: "Aujourd’hui" })).toHaveAttribute(
    "href",
    "/client/today",
  );
  await expect(dialog.getByText("Compte", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Se déconnecter" })).toBeEnabled();
  await page.keyboard.press("Shift+Tab");
  await expect(dialog.getByRole("button", { name: "Se déconnecter" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("Client V2 loading and failure keep the branded shell and real recovery", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?screen=client-v2&state=client-request-hang-once");
  await expect(page.getByRole("status")).toContainText("Chargement de ton portail");
  await expect(page.locator('[data-pilot-state="loading"]')).toBeVisible();
  await expect(page.locator("[data-pilot-hero]")).toBeVisible();

  await page.goto("/?screen=client-v2&state=error");
  await expect(page.locator('[data-pilot-state="error"]')).toBeVisible();
  await expect(page.getByRole("alert")).toContainText(
    "Impossible de charger cette page.",
  );
  await expect(page.getByRole("button", { name: "Réessayer" })).toBeEnabled();
  await expect(page.locator("[data-pilot-hero]")).toBeVisible();
});

test("Client V2 supports English and 200% reflow at 320px", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 820 });
  await page.goto("/?screen=client-v2&state=english");
  await expect(page.getByRole("heading", { name: "Your portal." })).toBeVisible();
  await expect(page.getByText("Welcome, Alex Martin.")).toBeVisible();
  await expect(
    page.getByText(
      "No program action is available in this portal right now. You have nothing to complete here.",
    ),
  ).toBeVisible();
  await page.locator("html").evaluate((element) => {
    element.style.fontSize = "200%";
  });
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
  const menu = page.getByRole("button", { name: "Menu" });
  await menu.focus();
  await expect(menu).toBeFocused();
  expect(await menu.evaluate((element) => getComputedStyle(element).outlineWidth)).toBe(
    "3px",
  );
});

test("captures the Client V2 pilot at the required review viewports", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one DPR 1 capture set is sufficient");
  await mkdir(v2CaptureDirectory, { recursive: true });
  for (const viewport of [
    { width: 1672, height: 941 },
    { width: 390, height: 844 },
    { width: 320, height: 820 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/?screen=client-v2");
    await expect(page.locator('[data-pilot-state="ready"]')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      path: resolve(
        v2CaptureDirectory,
        `client-home-fr-${viewport.width}x${viewport.height}.png`,
      ),
    });
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?screen=client-v2&state=client-request-hang-once");
  await expect(page.locator('[data-pilot-state="loading"]')).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: resolve(v2CaptureDirectory, "client-home-loading-390x844.png"),
  });
  await page.goto("/?screen=client-v2&state=error");
  await expect(page.locator('[data-pilot-state="error"]')).toBeVisible();
  await expect(page.getByRole("button", { name: "Menu" })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: resolve(v2CaptureDirectory, "client-home-error-390x844.png"),
  });
});

test("code preserves zeros, paste, repeated digits and correction without accepting incomplete codes", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Écran").selectOption("code");
  const first = page.getByRole("textbox", { name: "Chiffre 1 sur 6" });
  const third = page.getByRole("textbox", { name: "Chiffre 3 sur 6" });
  // input handles mobile autofill as well as the clipboard paste handler.
  await third.fill("012345");
  await expect(page.getByLabel("Code de test")).toHaveText('"012345"');
  await expect(page.getByRole("button", { name: "Continuer" })).toBeEnabled();
  await page.keyboard.press("Backspace");
  await expect(page.getByRole("button", { name: "Continuer" })).toBeDisabled();
  await page.keyboard.press("Backspace");
  await expect(
    page.getByRole("textbox", { name: "Chiffre 5 sur 6" }),
  ).toBeFocused();
  await first.click();
  await page.keyboard.press("0");
  await expect(
    page.getByRole("textbox", { name: "Chiffre 2 sur 6" }),
  ).toBeFocused();
  await first.fill("000000");
  await expect(page.getByLabel("Code de test")).toHaveText('"000000"');
  await expect(page.getByRole("button", { name: "Continuer" })).toBeEnabled();
});

test("client form keeps focus in its modal, supports a global time zone and inserts the resulting record", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByText("alex@example.test")).toBeVisible();
  const add = page.getByRole("button", { name: "Ajouter un client" });
  await add.click();
  const dialog = page.getByRole("dialog", { name: "Inviter un client" });
  await expect(dialog.getByLabel("Prénom", { exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(add).toBeFocused();
  await add.click();
  await dialog.getByLabel("Prénom", { exact: true }).fill("Émile");
  await dialog.getByLabel("Nom", { exact: true }).fill("Test");
  await dialog
    .getByLabel("Courriel du client", { exact: true })
    .fill("emile@example.test");
  await dialog
    .getByLabel("Fuseau horaire", { exact: true })
    .fill("Asia/Kolkata");
  await dialog.getByRole("button", { name: "Créer et inviter" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("listitem").filter({ hasText: "emile@example.test" }),
  ).toContainText("Activation en attente");
  await expect(
    page.getByRole("status").filter({ hasText: "La fiche de Émile Test" }),
  ).toBeVisible();
});

test("revocation is confirmed and invitation feedback follows the server response", async ({
  page,
}) => {
  await page.goto("/");
  const row = page
    .getByRole("listitem")
    .filter({ hasText: "julien@example.test" });
  await row.getByRole("button", { name: "Révoquer", exact: true }).click();
  const dialog = page.getByRole("dialog", {
    name: "Révoquer cette invitation ?",
  });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Révoquer l’invitation" }).click();
  await expect(row).toContainText("Invitation révoquée");
  await expect(dialog).not.toBeVisible();
  await row.getByRole("button", { name: "Renvoyer" }).click();
  await expect(row).toContainText("Envoi en préparation");
});

test("empty and unavailable lists remain distinct", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("État").selectOption("empty");
  await expect(
    page.getByRole("heading", { name: "Ton premier client commence ici." }),
  ).toBeVisible();
  await page.getByLabel("État").selectOption("network");
  await expect(page.getByRole("alert")).toContainText(
    "Impossible de charger les clients.",
  );
  await expect(
    page.getByRole("heading", { name: "La liste n’a pas pu être chargée." }),
  ).toBeVisible();
});

test("Client loading times out and retry recovers from a suspended request", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("État").selectOption("client-request-hang-once");
  await page.getByLabel("Écran").selectOption("client");

  await expect(page.getByRole("alert")).toContainText(
    "Impossible de charger cette page.",
  );
  const menu = page.getByRole("button", { name: "Menu" });
  if (await menu.isVisible()) await menu.click();
  await expect(page.getByText("Compte", { exact: true }).first()).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Se déconnecter" }),
  ).toBeEnabled();
  const closeMenu = page.getByRole("button", { name: "Fermer le menu" });
  if (await closeMenu.isVisible()) await closeMenu.click();
  const retry = page.getByRole("button", { name: "Réessayer" });
  await expect(retry).toBeEnabled();
  await retry.click();

  await expect(
    page.getByRole("heading", { name: "Ton portail." }),
  ).toBeVisible();
  await expect(page.getByText("Bienvenue, Alex Martin.")).toBeVisible();
});

test("auth, Coach and Client fit small widths and mobile navigation can close by keyboard", async ({
  page,
}) => {
  await page.goto("/");
  for (const width of [320, 390, 736, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    for (const screen of [
      "coach",
      "client",
      "client-today",
      "login",
      "verify-email",
      "code",
    ]) {
      await page.getByLabel("Écran").selectOption(screen);
      await expect(page.locator("main")).toBeVisible();
      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth,
      );
      expect(overflow, `${screen} at ${width}px`).toBe(false);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel("Écran").selectOption("coach");
  await page.getByRole("button", { name: "Ouvrir le menu" }).click();
  await expect(
    page.getByRole("navigation", { name: "Navigation principale" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Ouvrir le menu" }),
  ).toBeFocused();
});

test("Client pilot exposes only factual M1 content and keeps Today outside the dominant panel", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Écran").selectOption("client");

  const menu = page.getByRole("button", { name: "Menu" });
  if (await menu.isVisible()) await menu.click();
  const navigation = page.getByRole("navigation", {
    name: "Navigation principale",
  });
  await expect(navigation.getByRole("link", { name: "Accueil" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(navigation.getByRole("link", { name: "Aujourd’hui" })).toHaveAttribute(
    "href",
    "/client/today",
  );
  await expect(page.getByRole("link", { name: "Voir aujourd’hui" })).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Ton accès est confirmé." }),
  ).toBeVisible();
  await expect(page.getByText(/Tu n’as rien à compléter ici/)).toBeVisible();
  await expect(page.getByText("Compte", { exact: true }).first()).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Se déconnecter" }),
  ).toBeEnabled();
  const closePilotMenu = page.getByRole("button", { name: "Fermer le menu" });
  if (await closePilotMenu.isVisible()) await closePilotMenu.click();

  await page.getByLabel("Écran").selectOption("client-today");
  const todayMenu = page.getByRole("button", { name: "Ouvrir le menu" });
  if (await todayMenu.isVisible()) await todayMenu.click();
  await expect(page.getByRole("heading", { name: "Aujourd’hui" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Ton accès est actif." }),
  ).toBeVisible();
  await expect(page.getByText("Accès actif", { exact: true })).toBeVisible();
  await expect(page.getByText(/ne contient pas encore ton programme/i)).toBeVisible();
  await expect(page.getByText(/à jour|rien à faire/i)).toHaveCount(0);
  await expect(page.getByText("Compte", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Se déconnecter" }),
  ).toBeEnabled();
  const todayNavigation = page.getByRole("navigation", {
    name: "Navigation principale",
  });
  await expect(todayNavigation.getByRole("link", { name: "Aujourd’hui" })).toHaveAttribute(
    "aria-current",
    "page",
  );
});

test("Coach verification explains the emailed code and recovers from a wrong code", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Écran").selectOption("verify-email");

  await expect(
    page.getByRole("heading", { name: "Entre le code reçu par courriel." }),
  ).toBeVisible();
  await expect(page.getByText(/Nous avons envoyé un code à 6 chiffres à/)).toBeVisible();
  await expect(page.getByText("m••••@gmail.com", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Cette vérification protège l’accès aux dossiers de tes clients."),
  ).toBeVisible();
  await expect(page.getByText(/Google Authenticator|application d.authentification|code QR/i)).toHaveCount(0);

  const firstDigit = page.getByRole("textbox", { name: "Chiffre 1 sur 6" });
  await expect(firstDigit).toHaveAttribute("autocomplete", "one-time-code");
  await expect(firstDigit).toHaveAttribute("inputmode", "numeric");
  await firstDigit.fill("012345");
  await page.getByRole("button", { name: "Ouvrir mon espace Coach" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Ce code est invalide ou expiré.",
  );

  const resend = page.getByRole("button", { name: /Renvoyer/ });
  await expect(resend).toBeEnabled({ timeout: 2_500 });
  await resend.click();
  await expect(
    page.getByRole("status").filter({
      hasText: "Nouveau code envoyé à m••••@gmail.com.",
    }),
  ).toBeVisible();
});

test("Coach verification recovers when the automatic email request times out", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("État").selectOption("coach-request-hang");
  await page.getByLabel("Écran").selectOption("verify-email");

  await expect(
    page.getByRole("button", { name: "Se connecter avec une autre adresse" }),
  ).toBeEnabled();
  await expect(page.getByRole("alert")).toContainText(
    "Nous n’avons pas pu envoyer le code.",
  );
  await expect(page.getByRole("button", { name: "Renvoyer le code" })).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Se connecter avec une autre adresse" }),
  ).toBeEnabled();
});

test("Coach verification exposes a recoverable state after an email provider failure", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("État").selectOption("coach-request-error");
  await page.getByLabel("Écran").selectOption("verify-email");

  await expect(page.getByRole("alert")).toContainText(
    "Nous n’avons pas pu envoyer le code.",
  );
  await expect(page.getByRole("button", { name: "Renvoyer le code" })).toBeEnabled();
});

test("Coach verification explains when the password session has expired", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("État").selectOption("coach-request-unauthorized");
  await page.getByLabel("Écran").selectOption("verify-email");

  await expect(page.getByRole("alert")).toContainText(
    "Ta connexion a expiré. Reconnecte-toi pour recevoir un nouveau code.",
  );
  await expect(
    page.getByRole("button", { name: "Se connecter avec une autre adresse" }),
  ).toBeEnabled();
});

test("Coach verification explains a verification rate limit", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("État").selectOption("coach-verify-rate-limit");
  await page.getByLabel("Écran").selectOption("verify-email");

  const firstDigit = page.getByRole("textbox", { name: "Chiffre 1 sur 6" });
  await firstDigit.fill("012345");
  await page.getByRole("button", { name: "Ouvrir mon espace Coach" }).click();

  await expect(page.getByRole("alert")).toContainText(
    "Trop de tentatives. Attends quelques minutes",
  );
  await expect(firstDigit).toBeFocused();
});

test("changing Coach account closes the local session before returning to login", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Écran").selectOption("verify-email");
  await expect(
    page.getByRole("button", { name: "Se connecter avec une autre adresse" }),
  ).toBeEnabled();

  await page
    .getByRole("button", { name: "Se connecter avec une autre adresse" })
    .click();
  await expect(page).toHaveURL(/\/login$/);
});

test("changing Coach account recovers when logout times out", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("État").selectOption("coach-logout-hang");
  await page.getByLabel("Écran").selectOption("verify-email");
  const changeAccount = page.getByRole("button", {
    name: "Se connecter avec une autre adresse",
  });
  await expect(changeAccount).toBeEnabled();

  await changeAccount.click();

  await expect(page.getByRole("alert")).toContainText(
    "Impossible de changer de compte. Réessaie.",
  );
  await expect(changeAccount).toBeEnabled();
});
