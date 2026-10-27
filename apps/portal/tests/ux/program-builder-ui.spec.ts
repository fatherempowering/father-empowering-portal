import { expect, test } from "@playwright/test";
import type { SaveProgramRequest } from "../../src/lib/contracts/training-drafts";
const requests = async (page: import("@playwright/test").Page) => page.evaluate(() => (window as unknown as { __programRequests: SaveProgramRequest[] }).__programRequests);
async function addPress(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: /^Ajouter un exercice(?: après .+)?$/ }).last().click();
  await page.getByRole("dialog", { name: "Choisir un exercice", exact: true }).getByRole("button", { name: "Choisir Dumbbell Press", exact: true }).click();
}

test("Coach saves an incomplete draft and reopens it", async ({ page }) => {
  await page.goto("/?screen=program-builder");
  await expect(page.getByRole("heading",{name:"Construction de programme"})).toBeVisible();
  await page.getByLabel("Titre du programme · français").fill("Phase 1 — Fondation");
  await page.getByRole("button",{name:"Enregistrer le brouillon",exact:true}).click();
  await expect(page.getByText("Brouillon enregistré. Aucun client ne voit ces modifications.")).toBeVisible();
  await page.getByRole("button",{name:"Nouveau programme",exact:true}).click();
  await page.getByRole("button",{name:"Ouvrir Phase 1 — Fondation",exact:true}).click();
  await expect(page.getByLabel("Titre du programme · français")).toHaveValue("Phase 1 — Fondation");
  await expect(page.getByText("Brouillon enregistré · version 1.")).toBeVisible();
  expect((await requests(page))[0].document.weeks[0].sessions).toEqual([]);
});
test("builds sessions, groups and differing series; duplicated weeks stay independent", async ({ page }) => {
  await page.goto("/?screen=program-builder");
  await page.getByLabel("Titre du programme · français").fill("Force");
  await page.getByRole("button",{name:"Ajouter une séance",exact:true}).click();
  await page.getByLabel("Titre de la séance · français").fill("Haut du corps");
  await page.getByRole("combobox",{name:"Planification",exact:true}).selectOption("suggested");
  await page.getByRole("combobox",{name:"Jour",exact:true}).selectOption("3");
  await page.getByRole("button",{name:"Ajouter un bloc",exact:true}).click();
  await page.getByRole("combobox",{name:"Mode du bloc",exact:true}).selectOption("superset");
  await addPress(page);
  await addPress(page);
  const first=page.getByRole("article",{name:"Exercice 1",exact:true});
  await first.getByLabel("Charge cible",{exact:true}).fill("40 lb");
  await first.getByLabel("Prescriptions différentes selon la série").check();
  await first.getByLabel("Série 2 · Répétitions",{exact:true}).fill("12");
  await page.getByRole("button",{name:"Dupliquer cette semaine",exact:true}).click();
  await first.getByLabel("Charge cible",{exact:true}).fill("45 lb");
  await page.getByRole("button",{name:"Semaine 1",exact:true}).click();
  await expect(first.getByLabel("Charge cible",{exact:true})).toHaveValue("40 lb");
  await page.getByRole("button",{name:"Enregistrer le brouillon",exact:true}).click();
  await expect(page.getByText("Brouillon enregistré. Aucun client ne voit ces modifications.")).toBeVisible();
  const input=(await requests(page))[0]; expect(input.document.weeks).toHaveLength(2);
  const s=input.document.weeks[0].sessions[0];expect(s.schedule).toEqual({mode:"suggested",day:3});expect(s.blocks[0].mode).toBe("superset");expect(s.blocks[0].exercises[0].prescription.prescribedSets?.[1].reps).toBe("12");
  expect(input.document.weeks[1].sessions[0].blocks[0].exercises[0].prescription.loadTarget).toBe("45 lb");
});
test("lost save confirmation keeps exact retry identity",async({page})=>{
  await page.goto("/?screen=program-builder&state=program-response-lost");
  await page.getByRole("button",{name:"Enregistrer le brouillon",exact:true}).click();
  await expect(page.getByRole("alert")).toContainText("La confirmation n’est pas arrivée");
  await expect(page.getByLabel("Titre du programme · français")).toBeDisabled();
  await page.getByRole("button",{name:"Réessayer le même enregistrement",exact:true}).click();
  await expect(page.getByText("Brouillon enregistré. Aucun client ne voit ces modifications.")).toBeVisible();
  const sent=await requests(page);expect(sent).toHaveLength(2);expect(sent[0]).toEqual(sent[1]);
  await expect(page.getByRole("button",{name:"Ouvrir Nouveau programme",exact:true})).toHaveCount(1);
});
test("conflict never overwrites and keeps input",async({page})=>{
  await page.goto("/?screen=program-builder&state=program-conflict");
  await page.getByLabel("Titre du programme · français").fill("Mon travail");
  await page.getByRole("button",{name:"Enregistrer le brouillon",exact:true}).click();
  await expect(page.getByRole("alert")).toContainText("Tes saisies sont conservées");
  await expect(page.getByLabel("Titre du programme · français")).toHaveValue("Mon travail");
  await expect(page.getByRole("button",{name:"Enregistrer le brouillon",exact:true})).toBeDisabled();
});
test("unsaved navigation is protected",async({page},info)=>{
  await page.goto("/?screen=program-builder");
  await page.getByLabel("Titre du programme · français").fill("À garder");
  if(info.project.name==="mobile")await page.getByRole("button",{name:"Ouvrir le menu"}).click();
  let protectedExit=false;page.on("dialog",async(dialog)=>{protectedExit=dialog.type()==="beforeunload";await dialog.dismiss();});
  await page.getByRole("link",{name:"Clients",exact:true}).click();
  await expect(page).toHaveURL(/screen=program-builder/);expect(protectedExit).toBe(true);
});
test("network failure is not an empty state; builder fits narrow screens",async({page})=>{
  await page.goto("/?screen=program-builder&state=program-load-error");
  await expect(page.getByRole("alert")).toContainText("Impossible de charger les brouillons");
  await expect(page.getByText("Aucun brouillon enregistré.")).toHaveCount(0);
  await page.getByRole("button",{name:"Ajouter une séance",exact:true}).click();
  await page.getByRole("button",{name:"Ajouter un bloc",exact:true}).click();
  await addPress(page);
  for(const width of [1280,390,320]){await page.setViewportSize({width,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);}
});

test("Coach numeric entry selects values and normalizes only compact tempos", async ({ page }) => {
  await page.goto("/?screen=program-builder");
  await page.getByRole("button", { name: "Ajouter une séance", exact: true }).click();
  await page.getByRole("button", { name: "Ajouter un bloc", exact: true }).click();
  await addPress(page);
  const exercise = page.getByRole("article", { name: "Exercice 1", exact: true });
  await exercise.getByLabel("Nombre de séries", { exact: true }).click();
  await page.keyboard.type("4");
  await expect(exercise.getByLabel("Nombre de séries", { exact: true })).toHaveValue("4");
  await exercise.getByLabel("RIR cible", { exact: true }).click();
  await page.keyboard.press("Tab");
  await page.keyboard.type("60");
  await expect(exercise.getByLabel("Repos (secondes)", { exact: true })).toHaveValue("60");
  const tempo = exercise.getByLabel("Tempo", { exact: true });
  await tempo.click(); await page.keyboard.type("2"); await expect(tempo).toHaveValue("2");
  await page.keyboard.type("2"); await expect(tempo).toHaveValue("2-2");
  await page.keyboard.type("2"); await expect(tempo).toHaveValue("2-2-2");
  await tempo.fill("3010"); await tempo.press("Tab"); await expect(tempo).toHaveValue("3-0-1-0");
  await tempo.fill("3-0-X-1"); await tempo.press("Tab"); await expect(tempo).toHaveValue("3-0-X-1");
  await tempo.fill("2 / pause / X"); await tempo.press("Tab"); await expect(tempo).toHaveValue("2 / pause / X");
});

test("saved versions restore into an editable draft without publishing or overwriting history", async ({ page }) => {
  await page.goto("/?screen=program-builder");
  await page.getByLabel("Titre du programme · français").fill("Fondation V1");
  await page.getByRole("button", { name: "Enregistrer le brouillon", exact: true }).click();
  await expect(page.getByRole("button", { name: "Version 1 actuelle", exact: true })).toBeVisible();
  await page.getByLabel("Titre du programme · français").fill("Fondation V2");
  await page.getByRole("button", { name: "Enregistrer le brouillon", exact: true }).click();
  await expect(page.getByRole("button", { name: "Version 2 actuelle", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Reprendre la version 1", exact: true }).click();
  const modal = page.getByRole("dialog", { name: "Reprendre une sauvegarde", exact: true });
  await expect(modal).toContainText("les programmes publiés seront conservés");
  await modal.getByRole("button", { name: "Reprendre la version 1", exact: true }).click();
  await expect(page.getByLabel("Titre du programme · français")).toHaveValue("Fondation V1");
  expect(await requests(page)).toHaveLength(2);
  await page.getByRole("button", { name: "Enregistrer le brouillon", exact: true }).click();
  await expect(page.getByRole("button", { name: "Version 3 actuelle", exact: true })).toBeVisible();
  const commands = await requests(page);
  expect(commands[2].expectedVersion).toBe(2);
  expect(commands[2].document).toEqual(commands[0].document);
  expect(await page.evaluate(() => (window as unknown as { __publicationRequests: unknown[] }).__publicationRequests)).toEqual([]);
});

for (const accept of [false, true]) test(`a delayed history read locks save/open through confirmation (${accept ? "restore" : "cancel"})`, async ({ page }) => {
  await page.goto("/?screen=program-builder&state=history-read-delayed");
  await page.getByLabel("Titre du programme · français").fill("Version initiale");
  await page.getByRole("button", { name: "Enregistrer le brouillon", exact: true }).click();
  await expect(page.getByRole("button", { name: "Version 1 actuelle", exact: true })).toBeVisible();
  await page.getByLabel("Titre du programme · français").fill("Version actuelle");
  await page.getByRole("button", { name: "Enregistrer le brouillon", exact: true }).click();
  await expect(page.getByRole("button", { name: "Version 2 actuelle", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Reprendre la version 1", exact: true }).click();
  const save = page.getByRole("button", { name: "Enregistrer le brouillon", exact: true });
  const open = page.getByRole("button", { name: "Nouveau programme", exact: true });
  await expect(save).toBeDisabled(); await expect(open).toBeDisabled();
  await expect(page.getByLabel("Titre du programme · français")).toBeDisabled();
  await save.evaluate((button: HTMLButtonElement) => button.click());
  await open.evaluate((button: HTMLButtonElement) => button.click());
  expect(await requests(page)).toHaveLength(2);
  await page.evaluate(() => (window as unknown as { __releaseProgramHistory: () => void }).__releaseProgramHistory());
  const modal = page.getByRole("dialog", { name: "Reprendre une sauvegarde", exact: true });
  await expect(modal).toBeVisible(); await expect(save).toBeDisabled();
  await modal.getByRole("button", { name: accept ? "Reprendre la version 1" : "Annuler", exact: true }).click();
  await expect(save).toBeEnabled();
  await expect(page.getByLabel("Titre du programme · français")).toHaveValue(accept ? "Version initiale" : "Version actuelle");
  expect(await requests(page)).toHaveLength(2);
  if (accept) {
    await save.click(); await expect(page.getByRole("button", { name: "Version 3 actuelle", exact: true })).toBeVisible();
    const commands = await requests(page); expect(commands[2].expectedVersion).toBe(2); expect(commands[2].document).toEqual(commands[0].document);
  }
});

test("inserting after an exercise preserves the intended order", async ({ page }) => {
  await page.goto("/?screen=program-builder");
  await page.getByRole("button", { name: "Ajouter une séance", exact: true }).click();
  await page.getByRole("button", { name: "Ajouter un bloc", exact: true }).click();
  await addPress(page); await addPress(page);
  await page.getByRole("button", { name: "Ajouter un exercice après Dumbbell Press", exact: true }).first().click();
  await page.getByRole("dialog", { name: "Choisir un exercice", exact: true }).getByRole("button", { name: "Choisir Curl alterné avec haltères", exact: true }).click();
  await expect(page.getByRole("article", { name: "Exercice 2", exact: true }).getByRole("heading", { name: "Curl alterné avec haltères", exact: true })).toBeVisible();
  await expect(page.getByRole("article", { name: "Exercice 3", exact: true }).getByRole("heading", { name: "Dumbbell Press", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Enregistrer le brouillon", exact: true }).click();
  const exercises = (await requests(page))[0].document.weeks[0].sessions[0].blocks[0].exercises;
  expect(exercises.map(item => item.pilot?.sourceId ?? item.name)).toEqual(["Dumbbell Press", "DB_034", "Dumbbell Press"]);
});

test("warm-up is an ordinary block and destructive actions use a cancellable centered modal", async ({ page }) => {
  await page.goto("/?screen=program-builder");
  let nativeDialogs = 0; page.on("dialog", async dialog => { nativeDialogs++; await dialog.dismiss(); });
  await page.getByRole("button", { name: "Ajouter une séance", exact: true }).click();
  await page.getByLabel("Consignes / but de la séance · français").fill("Préparer les mouvements de la séance.");
  await page.getByRole("button", { name: "Ajouter un bloc d’échauffement", exact: true }).click();
  await expect(page.getByLabel("Nom du bloc · français")).toHaveValue("Échauffement");
  await expect(page.getByLabel("Nom du bloc · anglais")).toHaveValue("Warm-up");
  await expect(page.getByRole("combobox", { name: "Mode du bloc", exact: true })).toHaveValue("standard");
  await addPress(page);
  await page.getByRole("button", { name: "Retirer le bloc", exact: true }).click();
  const modal = page.getByRole("dialog", { name: "Confirmer cette action", exact: true });
  await expect(modal).toBeVisible(); await expect(modal.getByRole("button", { name: "Annuler", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("article", { name: "Exercice 1", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Retirer le bloc", exact: true }).click();
  await modal.getByRole("button", { name: "Retirer le bloc", exact: true }).click();
  await expect(page.getByRole("article", { name: "Exercice 1", exact: true })).toHaveCount(0);
  expect(nativeDialogs).toBe(0);
  await page.getByRole("button", { name: "Enregistrer le brouillon", exact: true }).click();
  expect((await requests(page))[0].document.weeks[0].sessions[0].warmup.fr).toBe("Préparer les mouvements de la séance.");
});

test("the completion summary always leads to the first still-missing element", async ({ page }) => {
  await page.goto("/?screen=program-builder");
  await page.getByRole("button", { name: /élément\(s\) à compléter · Aller au premier/ }).click();
  await expect(page.getByRole("button", { name: "Ajouter une séance", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: /élément\(s\) à compléter · Aller au premier/ }).click();
  await expect(page.getByRole("button", { name: "Ajouter un bloc", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: /élément\(s\) à compléter · Aller au premier/ }).click();
  await expect(page.getByRole("button", { name: "Ajouter un exercice", exact: true })).toBeFocused();
});

test("numeric replacement also works in Client visual onboarding without changing telephone text", async ({ page }, info) => {
  await page.goto("/?screen=client-onboarding&state=onboarding-not-started");
  if (info.project.name === "desktop") await page.getByRole("button", {name:"3. Entraînement et équipement",exact:true}).click();
  else await page.getByRole("combobox", { name: /Aller à une section/ }).selectOption("2");
  const years = page.locator('[data-question="trainingYears"]').getByRole("spinbutton");
  await years.fill("12");
  await page.getByRole("heading", { name: "Faisons connaissance.", exact: true }).click();
  await years.click(); await page.keyboard.type("3");
  await expect(years).toHaveValue("3");
  if (info.project.name === "desktop") await page.getByRole("button", {name:"1. Informations personnelles",exact:true}).click();
  else await page.getByRole("combobox", { name: /Aller à une section/ }).selectOption("0");
  const phone = page.locator('input[type="tel"]');
  await phone.fill("514"); await phone.press("End"); await page.keyboard.type("123");
  await expect(phone).toHaveValue("514123");
});

test("validation links select the correct week and focus the exact numeric field", async ({ page }) => {
  await page.goto("/?screen=program-builder");
  await page.getByRole("button", { name: "Ajouter une séance", exact: true }).click();
  await page.getByRole("button", { name: "Ajouter un bloc", exact: true }).click();
  await addPress(page);
  await page.getByRole("button", { name: "Dupliquer cette semaine", exact: true }).click();
  await page.getByLabel("Nombre de séries", { exact: true }).fill("0");
  await page.getByRole("button", { name: "Semaine 1", exact: true }).click();
  await page.getByRole("button", { name: "Enregistrer le brouillon", exact: true }).click();
  await page.getByRole("button", { name: /Semaine 2.*Nombre de séries/ }).first().click();
  await expect(page.getByRole("button", { name: "Semaine 2", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("Nombre de séries", { exact: true })).toBeFocused();
  expect(await requests(page)).toHaveLength(0);
});

test("saving confirms then opens publication while draft and main navigation remain available", async ({ page }, info) => {
  await page.goto("/?screen=program-builder");
  await page.getByRole("button", { name: "Ajouter une séance", exact: true }).click();
  await page.getByRole("button", { name: "Ajouter un bloc", exact: true }).click();
  await addPress(page);
  await page.getByRole("button", { name: "Enregistrer le brouillon", exact: true }).click();
  const publication = page.getByLabel("Étape de publication", { exact: true });
  await expect(publication).toBeFocused();
  await expect(page.getByRole("button", { name: "Enregistrer le brouillon", exact: true })).toBeInViewport();
  if (info.project.name === "mobile") {
    await expect(page.getByRole("button", { name: "Ouvrir le menu", exact: true })).toBeInViewport();
  } else {
    await expect(page.getByRole("link", { name: "Clients", exact: true })).toBeInViewport();
  }
});
