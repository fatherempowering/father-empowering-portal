import { expect, test } from "@playwright/test";

const publicationId = "19200000-0000-4000-8000-000000000001";
const sessionId = "19600000-0000-4000-8000-000000000003";

test("local presentation follows real Client links without opening the Coach screen", async ({ page }) => {
  await page.goto("/client");
  const program = page.getByRole("region", { name: "Ton programme", exact: true });
  await program.getByRole("button", { name: /^Semaine 2 / }).click();
  await program.getByRole("button", { name: /Jambes/ }).click();
  await program.getByRole("link", { name: "Voir mon programme", exact: true }).click();
  await expect(page).toHaveURL(/\/client\/program\?.*weekNumber=2/);
  await page.getByRole("link", { name: "Ouvrir la séance", exact: true }).click();
  await expect(page).toHaveURL(/\/client\/workout\?.*weekNumber=2/);
  await expect(page.getByRole("button", { name: "Commencer la séance", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Jambes", exact: true }).first()).toBeVisible();
});

test("horizontal weeks and days preserve real schedules, partial weeks and bookmarked selection", async ({ page }) => {
  await page.goto("/?screen=client-program&state=legacy-navigation");
  const weeks = page.getByRole("group", { name: "Semaines du programme", exact: true });
  await expect(weeks.getByRole("button")).toHaveCount(6);
  await weeks.getByRole("button", { name: /^Semaine 3 / }).click();
  const days = page.getByRole("group", { name: "Séances de la semaine 3", exact: true });
  await expect(days.getByRole("button")).toHaveCount(5);
  await expect(days.getByRole("button", { name: /^Lundi / })).toHaveCount(2);
  await expect(days.getByRole("button", { name: /À ton rythme Marche libre Optionnelle/ })).toBeVisible();
  await days.getByRole("button", { name: /Jambes/ }).click();
  await expect(page.getByRole("link", { name: "Ouvrir la séance", exact: true })).toHaveAttribute("href", `/client/workout?publicationId=${publicationId}&weekNumber=3&sessionId=${sessionId}`);
  await page.reload();
  await expect(weeks.getByRole("button", { name: /^Semaine 3 / })).toHaveAttribute("aria-pressed", "true");
  await expect(days.getByRole("button", { name: /Jambes/ })).toHaveAttribute("aria-pressed", "true");
  await weeks.getByRole("button", { name: /^Semaine 6 / }).click();
  await expect(page.getByRole("group", { name: "Séances de la semaine 6", exact: true }).getByRole("button")).toHaveCount(1);
  for (const width of [1280, 390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  }
  await page.getByRole("button", { name: "English", exact: true }).click();
  await expect(page.getByRole("group", { name: "Program weeks", exact: true })).toBeVisible();
});

test("selected session status never depends on the visible history page", async ({ page }) => {
  await page.goto("/?screen=client-program&state=legacy-history");
  const resume = page.getByRole("link", { name: "Reprendre la séance", exact: true });
  await expect(resume).toBeVisible();
  await expect(page.getByText("Page 1 / 2", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Page suivante", exact: true }).click();
  await expect(page.getByText("Page 2 / 2", { exact: true })).toBeVisible();
  await expect(resume).toBeVisible();
  await page.getByRole("button", { name: "Page précédente", exact: true }).click();
  await expect(resume).toBeVisible();
});

test("the existing Client home contains week/day access without replacing its welcome structure", async ({ page }) => {
  await page.goto("/?screen=client-v2&state=legacy-navigation");
  await expect(page.locator("[data-pilot-primary]")).toBeVisible();
  const program = page.getByRole("region", { name: "Ton programme", exact: true });
  const weeks = program.getByRole("group", { name: "Semaines du programme", exact: true });
  await weeks.getByRole("button", { name: /^Semaine 2 / }).click();
  await program.getByRole("button", { name: /Jambes/ }).click();
  await expect(program.getByRole("link", { name: "Ouvrir · Jambes", exact: true })).toHaveAttribute("href", `/client/workout?publicationId=${publicationId}&weekNumber=2&sessionId=${sessionId}&language=fr`);
  await expect(program.getByRole("link", { name: "Voir mon programme", exact: true })).toHaveAttribute("href", `/client/program?publicationId=${publicationId}&weekNumber=2&sessionId=${sessionId}&language=fr`);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test("a previous publication selection cannot open a different current program by accident", async ({ page }) => {
  await page.goto(`/?screen=client-program&state=legacy-navigation&publicationId=19200000-0000-4000-8000-000000000002&weekNumber=3&sessionId=${sessionId}`);
  await expect(page.getByRole("group", { name: "Semaines du programme", exact: true }).getByRole("button", { name: /^Semaine 1 / })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("link", { name: "Ouvrir la séance", exact: true })).toHaveAttribute("href", new RegExp(`publicationId=${publicationId}&weekNumber=1&`));
});

test("Legacy layout keeps six top tabs, Week Zero to 14, seven weekdays and private references", async ({ page }, info) => {
  await page.goto("/?screen=client-program&state=legacy-navigation&language=en");
  const tabs = page.getByRole("navigation", { name: "Portal navigation", exact: true });
  await expect(tabs.getByRole("link", { name: "Home", exact: true })).toHaveAttribute("href", "/client?language=en");
  await expect(tabs.getByRole("link", { name: "Training", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(tabs.getByRole("link", { name: "History", exact: true })).toHaveAttribute("href", "/client/program?language=en#workout-history-title");
  for (const label of ["Nutrition", "Check-in", "Progression"]) {
    await expect(tabs.getByRole("button", { name: new RegExp(label) })).toBeDisabled();
  }
  const weeks = page.getByRole("group", { name: "Program weeks", exact: true });
  await expect(weeks.getByRole("link", { name: /^Week 0 / })).toHaveAttribute("href", "/client/week-zero");
  await expect(weeks.locator('[aria-disabled="true"]').filter({ hasText: "Week 14" })).toContainText("Not published");
  const days = page.getByRole("group", { name: "Week 1 sessions", exact: true });
  for (const day of ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]) {
    await expect(days.getByText(new RegExp(`^${day}( · suggested)?$`)).first()).toBeAttached();
  }
  await expect(page.getByTestId("client-reference-panel")).toBeVisible();
  await expect(page.getByTestId("reference-checkin-kpi")).toHaveCount(6);
  await expect(page.getByTestId("reference-checkin-kpi").first()).toContainText("—");
  for (const width of [1773, 1280, 390, 320]) {
    await page.setViewportSize({ width, height: 988 });
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    expect(await page.locator('[data-legacy-week-header]').evaluate(element => getComputedStyle(element).backgroundColor)).toBe("rgb(28, 28, 28)");
    expect(await weeks.getByRole("button", { name: /^Week 1 / }).evaluate(element => getComputedStyle(element).backgroundColor)).toBe("rgb(200, 90, 0)");
    expect(await page.locator('article[aria-labelledby^="session-"]').evaluate(element => element.getBoundingClientRect().width)).toBeLessThanOrEqual(620);
    if (width >= 1024) {
      const layout = page.locator('[data-legacy-training-layout]');
      const references = (await page.getByTestId("client-reference-panel").boundingBox())!;
      const session = (await page.locator('article[aria-labelledby^="session-"]').boundingBox())!;
      expect(references.x).toBeGreaterThan(session.x + session.width);
      await expect(layout).toBeVisible();
    }
    await page.screenshot({ path: info.outputPath(`legacy-training-${width}.png`) });
  }
});

test("the top History link opens the saved history rather than leaving the Client at the top", async ({ page }) => {
  await page.goto("/client");
  await page.getByRole("navigation", { name: "Navigation du portail", exact: true }).getByRole("link", { name: "Historique", exact: true }).click();
  await expect(page).toHaveURL(/\/client\/program\?language=fr#workout-history-title$/);
  await expect(page.getByRole("heading", { name: "Historique des séances", exact: true })).toBeInViewport();
});
