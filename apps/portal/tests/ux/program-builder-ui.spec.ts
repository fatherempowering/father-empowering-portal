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
  await page.getByRole("button",{name:"Ajouter Dumbbell Press",exact:true}).click();
  for(const width of [1280,390,320]){await page.setViewportSize({width,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);}
});
