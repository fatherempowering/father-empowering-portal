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

test("bulk copies the source through week 10, then saves and reopens independent prescriptions without publishing", async ({ page }) => {
  await page.goto("/?screen=program-builder");
  let publicationRequests = 0;
  page.on("request", (request) => { if (request.url().endsWith("/programs/publish")) publicationRequests++; });
  await page.getByLabel("Objectif de la semaine · français").fill("Base de force");
  await page.getByRole("button", { name: "Ajouter une séance", exact: true }).click();
  await page.getByLabel("Titre de la séance · français").fill("Jambes");
  await page.getByRole("button", { name: "Ajouter un bloc", exact: true }).click();
  await addPress(page);
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

test("keyboard focus stays inside selection and replacement confirmation", async ({ page }) => {
  await page.goto("/?screen=program-builder");
  await page.getByLabel("Objectif de la semaine · français").fill("Source");
  await page.getByRole("button", { name: "Dupliquer cette semaine", exact: true }).click();
  await page.getByRole("button", { name: "Semaine 1", exact: true }).click();
  const open = page.getByRole("button", { name: "Copier vers d’autres semaines", exact: true });
  await open.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog");
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
      expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
    }
  }
  await dialog.getByRole("button", { name: "Vérifier le remplacement", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(dialog.getByRole("alert")).toContainText("Remplacer le contenu existant ?");
  for (const key of ["Tab", "Shift+Tab"]) {
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press(key);
      expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
    }
  }
  await page.keyboard.press("Escape");
  await expect(open).toBeFocused();
  await expect(page.getByRole("button", { name: "Semaine 3", exact: true })).toHaveCount(0);
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

for (const interaction of ["selection", "blur and refocus", "new input"] as const) test(`delayed tempo formatting never overrides ${interaction}`, async ({ page }) => {
  await page.goto("/?screen=program-builder");
  await page.getByRole("button", { name: "Ajouter une séance", exact: true }).click();
  await page.getByRole("button", { name: "Ajouter un bloc", exact: true }).click();
  await addPress(page);
  const tempo = page.getByRole("article", { name: "Exercice 1", exact: true }).getByLabel("Tempo", { exact: true });
  await tempo.fill("2-2");
  await page.evaluate(() => {
    const original = window.requestAnimationFrame.bind(window);
    const cancelled = new Set<number>();
    const originalCancel = window.cancelAnimationFrame.bind(window);
    let pending: { callback: FrameRequestCallback; id: number } | null = null;
    const heldId = 900000001;
    const gate = { armed: true, release() { gate.armed = false; const current = pending; pending = null; if (current && !cancelled.has(current.id)) current.callback(performance.now()); } };
    Object.assign(window, { __tempoFrame: gate });
    window.requestAnimationFrame = callback => {
      if (!gate.armed) return original(callback);
      gate.armed = false; pending = { callback, id: heldId }; return heldId;
    };
    window.cancelAnimationFrame = id => { if (id === heldId) cancelled.add(id); else originalCancel(id); };
  });
  await page.keyboard.insertText("2");
  await expect(tempo).toHaveValue("2-2-2");
  if (interaction === "blur and refocus") { await tempo.press("Tab"); await tempo.focus(); }
  else await tempo.evaluate(input => (input as HTMLInputElement).select());
  if (interaction === "new input") await page.keyboard.insertText("2 / pause / X");
  await page.evaluate(() => (window as unknown as { __tempoFrame: { release(): void } }).__tempoFrame.release());
  await page.keyboard.insertText(interaction === "new input" ? "!" : "3010");
  await expect(tempo).toHaveValue(interaction === "new input" ? "2 / pause / X!" : "3-0-1-0");
});

test("tempo formatting preserves an in-word caret and deletion without forcing notation", async ({ page }) => {
  await page.goto("/?screen=program-builder");
  await page.getByRole("button", { name: "Ajouter une séance", exact: true }).click();
  await page.getByRole("button", { name: "Ajouter un bloc", exact: true }).click();
  await addPress(page);
  const tempo = page.getByRole("article", { name: "Exercice 1", exact: true }).getByLabel("Tempo", { exact: true });
  await tempo.fill("2-2-2");
  await tempo.evaluate(input => (input as HTMLInputElement).setSelectionRange(2, 2));
  await page.keyboard.insertText("3");
  await expect(tempo).toHaveValue("2-3-2-2");
  expect(await tempo.evaluate(input => (input as HTMLInputElement).selectionStart)).toBe(3);
  await page.keyboard.press("Backspace");
  await expect(tempo).toHaveValue("2--2-2");
  expect(await tempo.evaluate(input => (input as HTMLInputElement).selectionStart)).toBe(2);
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
  if (info.project.name === "desktop") await page.getByRole("button", {name:"3. Tes entraînements et ton quotidien",exact:true}).click();
  else await page.getByRole("combobox", { name: /Aller à une section/ }).selectOption("2");
  const years = page.locator('[data-question="trainingYears"]').getByRole("spinbutton");
  await years.fill("12");
  await page.getByRole("heading", { name: "Faisons connaissance.", exact: true }).click();
  await years.click(); await page.keyboard.type("3");
  await expect(years).toHaveValue("3");
  if (info.project.name === "desktop") await page.getByRole("button", {name:"1. Commençons par toi",exact:true}).click();
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
