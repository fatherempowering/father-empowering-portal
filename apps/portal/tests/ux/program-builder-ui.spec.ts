import { expect, test } from "@playwright/test";
import type { SaveProgramRequest } from "../../src/lib/contracts/training-drafts";
const requests = async (page: import("@playwright/test").Page) => page.evaluate(() => (window as unknown as { __programRequests: SaveProgramRequest[] }).__programRequests);

test("Coach saves an incomplete draft and reopens it", async ({ page }) => {
  await page.goto("/?screen=program-builder");
  await expect(page.getByRole("heading",{name:"Tes programmes."})).toBeVisible();
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
  await page.getByRole("button",{name:"Ajouter Dumbbell Press",exact:true}).click();
  await page.getByRole("button",{name:"Ajouter Dumbbell Press",exact:true}).click();
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
  await expect(page.getByRole("button", { name: "Copier vers d’autres semaines", exact: true })).toBeDisabled();
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
  await expect(page.getByRole("button", { name: "Copier vers d’autres semaines", exact: true })).toBeDisabled();
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
  await page.getByRole("button",{name:"Ajouter Dumbbell Press",exact:true}).click();
  for(const width of [1280,390,320]){await page.setViewportSize({width,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);}
});

test("bulk copies the source through week 10, then saves and reopens independent prescriptions without publishing", async ({ page }) => {
  await page.goto("/?screen=program-builder");
  let publicationRequests = 0;
  page.on("request", (request) => { if (request.url().endsWith("/programs/publish")) publicationRequests++; });
  await page.getByLabel("Objectif de la semaine · français").fill("Base de force");
  await page.getByRole("button", { name: "Ajouter une séance", exact: true }).click();
  await page.getByLabel("Titre de la séance · français").fill("Jambes");
  await page.getByRole("button", { name: "Ajouter un bloc", exact: true }).click();
  await page.getByRole("button", { name: "Ajouter Dumbbell Press", exact: true }).click();
  await page.getByLabel("Charge cible", { exact: true }).fill("40 lb");
  await page.getByLabel("Prescriptions différentes selon la série").check();
  await page.getByLabel("Série 2 · Répétitions", { exact: true }).fill("12");
  const source = await page.getByLabel("Titre de la séance · français").inputValue();
  await page.getByRole("button", { name: "Copier vers d’autres semaines", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Copier la semaine 1", exact: true });
  await dialog.getByLabel("Choisir jusqu’à la semaine", { exact: true }).fill("10");
  await expect(dialog.getByRole("checkbox", { name: "Semaine 1 Source · conservée", exact: true })).toBeDisabled();
  await dialog.getByRole("button", { name: "Toutes les semaines suivantes", exact: true }).click();
  await dialog.getByRole("button", { name: "Copier vers 9 semaines", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByLabel("Titre de la séance · français")).toHaveValue(source);
  expect(await requests(page)).toHaveLength(0);
  await expect(page.getByText(/Semaine 1 copiée vers 9 semaines/)).toBeVisible();
  await page.getByRole("button", { name: "Semaine 5", exact: true }).click();
  await page.getByLabel("Série 2 · Répétitions", { exact: true }).fill("6");
  await page.getByRole("button", { name: "Semaine 2", exact: true }).click();
  await expect(page.getByLabel("Série 2 · Répétitions", { exact: true })).toHaveValue("12");
  await page.getByRole("button", { name: "Enregistrer le brouillon", exact: true }).click();
  await expect(page.getByText("Brouillon enregistré. Aucun client ne voit ces modifications.")).toBeVisible();
  const document = (await requests(page))[0].document;
  expect(document.weeks).toHaveLength(10);
  expect(document.weeks[0].sessions[0].blocks[0].exercises[0].prescription.prescribedSets![1].reps).toBe("12");
  expect(document.weeks[4].sessions[0].blocks[0].exercises[0].prescription.prescribedSets![1].reps).toBe("6");
  await page.getByRole("button", { name: "Nouveau programme", exact: true }).click();
  await page.getByRole("button", { name: "Ouvrir Nouveau programme", exact: true }).click();
  await page.getByRole("button", { name: "Semaine 10", exact: true }).click();
  await expect(page.getByLabel("Objectif de la semaine · français")).toHaveValue("Base de force");
  expect(publicationRequests).toBe(0);
});

test("selected weeks only are copied, with explicit empty intermediate weeks", async ({ page }) => {
  await page.goto("/?screen=program-builder");
  await page.getByLabel("Objectif de la semaine · français").fill("Source");
  await page.getByRole("button", { name: "Copier vers d’autres semaines", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("checkbox", { name: "Semaine 2 À créer", exact: true }).check();
  await dialog.getByRole("checkbox", { name: "Semaine 5 À créer", exact: true }).check();
  await expect(dialog.getByText("Semaines intermédiaires créées vides : 3, 4. Elles resteront à compléter avant publication.")).toBeVisible();
  await dialog.getByRole("button", { name: "Copier vers 2 semaines", exact: true }).click();
  await page.getByRole("button", { name: "Semaine 3", exact: true }).click();
  await expect(page.getByLabel("Objectif de la semaine · français")).toHaveValue("");
  await page.getByRole("button", { name: "Semaine 5", exact: true }).click();
  await expect(page.getByLabel("Objectif de la semaine · français")).toHaveValue("Source");
  await expect(page.getByRole("button", { name: "Semaine 6", exact: true })).toHaveCount(0);
});

test("existing content is replaced only after explicit confirmation; cancellation and back preserve it", async ({ page }) => {
  await page.goto("/?screen=program-builder");
  await page.getByLabel("Objectif de la semaine · français").fill("Source");
  await page.getByRole("button", { name: "Dupliquer cette semaine", exact: true }).click();
  await page.getByLabel("Objectif de la semaine · français").fill("À garder");
  await page.getByRole("button", { name: "Dupliquer cette semaine", exact: true }).click();
  await page.getByLabel("Objectif de la semaine · français").fill("Autre semaine intacte");
  await page.getByRole("button", { name: "Semaine 1", exact: true }).click();
  const open = page.getByRole("button", { name: "Copier vers d’autres semaines", exact: true });
  await open.click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("checkbox", { name: "Semaine 2 Contenu existant", exact: true }).check();
  await dialog.getByRole("button", { name: "Vérifier le remplacement", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("Semaines concernées : 2.");
  await dialog.getByRole("button", { name: "Annuler", exact: true }).click();
  await expect(open).toBeFocused();
  await page.getByRole("button", { name: "Semaine 2", exact: true }).click();
  await expect(page.getByLabel("Objectif de la semaine · français")).toHaveValue("À garder");
  await page.getByRole("button", { name: "Semaine 1", exact: true }).click();
  await open.click();
  await dialog.getByRole("checkbox", { name: "Semaine 2 Contenu existant", exact: true }).check();
  await dialog.getByRole("button", { name: "Vérifier le remplacement", exact: true }).click();
  await dialog.getByRole("button", { name: "Modifier la sélection", exact: true }).click();
  await expect(dialog.getByRole("checkbox", { name: "Semaine 2 Contenu existant", exact: true })).toBeChecked();
  await dialog.getByRole("button", { name: "Vérifier le remplacement", exact: true }).click();
  await dialog.getByRole("button", { name: "Confirmer le remplacement et copier", exact: true }).click();
  await page.getByRole("button", { name: "Semaine 2", exact: true }).click();
  await expect(page.getByLabel("Objectif de la semaine · français")).toHaveValue("Source");
  await page.getByRole("button", { name: "Semaine 3", exact: true }).click();
  await expect(page.getByLabel("Objectif de la semaine · français")).toHaveValue("Autre semaine intacte");
  expect(await requests(page)).toHaveLength(0);
});

test("bulk selection bounds, shortcuts, cancellation and narrow layout stay safe", async ({ page }) => {
  await page.goto("/?screen=program-builder");
  const open = page.getByRole("button", { name: "Copier vers d’autres semaines", exact: true });
  await open.click();
  const dialog = page.getByRole("dialog");
  const end = dialog.getByLabel("Choisir jusqu’à la semaine", { exact: true });
  await expect(end).toBeFocused();
  await expect(dialog.getByRole("button", { name: "Copier vers 0 semaine", exact: true })).toBeDisabled();
  for (const invalid of ["", "0", "1.5", "53"]) {
    await end.fill(invalid);
    await expect(end).toHaveAttribute("aria-invalid", "true");
    await expect(dialog.getByRole("button", { name: "Copier vers 0 semaine", exact: true })).toBeDisabled();
  }
  await end.fill("52");
  await dialog.getByRole("button", { name: "Toutes les semaines suivantes", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Copier vers 51 semaines", exact: true })).toBeEnabled();
  await end.fill("7");
  await expect(dialog.getByRole("button", { name: "Copier vers 6 semaines", exact: true })).toBeEnabled();
  await dialog.getByRole("checkbox", { name: "Semaine 4 À créer", exact: true }).uncheck();
  await expect(dialog.getByRole("button", { name: "Copier vers 5 semaines", exact: true })).toBeEnabled();
  for (const width of [1280, 390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  }
  await dialog.getByRole("button", { name: "Tout décocher", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Copier vers 0 semaine", exact: true })).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(open).toBeFocused();
  await expect(page.getByText("Modifications non enregistrées.", { exact: true })).toHaveCount(0);
  expect(await requests(page)).toHaveLength(0);
});

test("keyboard never reaches background controls during selection or replacement confirmation", async ({ page }) => {
  await page.goto("/?screen=program-builder");
  await page.getByLabel("Objectif de la semaine · français").fill("Source");
  await page.getByRole("button", { name: "Dupliquer cette semaine", exact: true }).click();
  await page.getByRole("button", { name: "Semaine 1", exact: true }).click();
  const open = page.getByRole("button", { name: "Copier vers d’autres semaines", exact: true });
  await open.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog");
  async function verifyFocus(key: string) {
    const focus = await dialog.evaluate((element) => ({ inside: element.contains(document.activeElement), tag: document.activeElement?.tagName, hasFocus: document.hasFocus() }));
    if (!focus.inside) {
      // Native dialogs permit access to browser chrome, not the inert page.
      // Chromium reports BODY + hasFocus=false there; the next Tab returns.
      expect(focus).toEqual({ inside: false, tag: "BODY", hasFocus: false });
      await page.keyboard.press(key);
      expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
    }
  }
  await page.keyboard.press("Shift+Tab");
  await expect(dialog.getByRole("button", { name: "Fermer la copie de semaine", exact: true })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(dialog.getByLabel("Choisir jusqu’à la semaine", { exact: true })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("button", { name: "Toutes les semaines suivantes", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  for (const key of ["Tab", "Shift+Tab"]) {
    for (let i = 0; i < 18; i++) {
      await page.keyboard.press(key);
      await verifyFocus(key);
    }
  }
  await dialog.getByRole("button", { name: "Vérifier le remplacement", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(dialog.getByRole("alert")).toContainText("Remplacer le contenu existant ?");
  for (const key of ["Tab", "Shift+Tab"]) {
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press(key);
      await verifyFocus(key);
    }
  }
  await page.keyboard.press("Escape");
  await expect(open).toBeFocused();
  await expect(page.getByRole("button", { name: "Semaine 3", exact: true })).toHaveCount(0);
});
