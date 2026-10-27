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
