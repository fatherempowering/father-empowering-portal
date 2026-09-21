import { expect, test } from "@playwright/test";

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
    "Impossible de charger ton portail.",
  );
  const menu = page.getByRole("button", { name: "Ouvrir le menu" });
  if (await menu.isVisible()) await menu.click();
  await expect(page.getByText("Compte", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Se déconnecter" }),
  ).toBeEnabled();
  const closeMenu = page.getByRole("button", { name: "Fermer le menu" });
  if (await closeMenu.isVisible()) await closeMenu.click();
  const retry = page.getByRole("button", { name: "Réessayer" });
  await expect(retry).toBeEnabled();
  await retry.click();

  await expect(
    page.getByRole("heading", { name: "Bienvenue, Alex Martin." }),
  ).toBeVisible();
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

test("Client shell exposes Home, Today and one truthful next action", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Écran").selectOption("client");

  const menu = page.getByRole("button", { name: "Ouvrir le menu" });
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
  await expect(page.getByRole("link", { name: "Voir aujourd’hui" })).toHaveAttribute(
    "href",
    "/client/today",
  );
  await expect(page.getByText("Compte", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Se déconnecter" }),
  ).toBeEnabled();

  await page.getByLabel("Écran").selectOption("client-today");
  if (await menu.isVisible()) await menu.click();
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
  await expect(navigation.getByRole("link", { name: "Aujourd’hui" })).toHaveAttribute(
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
