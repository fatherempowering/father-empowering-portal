import { expect, test, type Page } from "@playwright/test";
import type { PublishProgramRequest } from "../../src/lib/contracts/training-publication";
async function prepare(page:Page,state="",navigate=true) {
  if (navigate) await page.goto(`/?screen=program-builder&state=${state}`);
  await page.getByRole("button",{name:"Ajouter une séance",exact:true}).click();
  await page.getByRole("button",{name:"Ajouter un bloc",exact:true}).click();
  await page.getByRole("button",{name:"Ajouter un exercice",exact:true}).click();
  await page.getByRole("dialog",{name:"Choisir un exercice",exact:true}).getByRole("button",{name:"Choisir Dumbbell Press",exact:true}).click();
  await page.getByRole("button",{name:"Enregistrer le brouillon",exact:true}).click();
  await expect(page.getByText("Brouillon enregistré. Aucun client ne voit ces modifications.")).toBeVisible();
  await page.getByRole("combobox",{name:"Client destinataire",exact:true}).selectOption("19100000-0000-4000-8000-000000000005");
  await expect(page.getByText("Ce client n’a pas encore de programme publié.")).toBeVisible();
}
test("publication names the chosen Client and requires confirmation",async({page})=>{
  await prepare(page);
  await page.getByRole("button",{name:"Publier pour ce client",exact:true}).click();
  const confirmation = page.getByRole("dialog", {name:"Publier ce programme",exact:true});
  await expect(confirmation).toContainText("Client Test"); await expect(confirmation).toContainText("immédiatement visible");
  await confirmation.getByRole("button", {name:"Confirmer la publication",exact:true}).click();
  await expect(page.getByText("Programme publié. Le client peut maintenant le consulter dans son portail.")).toBeVisible();
  await expect(page.getByRole("button",{name:"Publier pour ce client",exact:true})).toBeDisabled();
});
test("personal recipient remains unambiguous after reload and in confirmation",async({page})=>{
  await prepare(page,"same-name-clients");
  const selector = page.getByRole("combobox",{name:"Client destinataire",exact:true});
  await expect(selector.getByRole("option",{name:"Maxime Bourdon",exact:true})).toHaveCount(1);
  await expect(selector.getByRole("option",{name:"Maxime Bourdon — Mon profil personnel",exact:true})).toHaveCount(1);
  await page.reload();
  await prepare(page,"same-name-clients",false);
  await selector.selectOption({label:"Maxime Bourdon — Mon profil personnel"});
  await page.getByRole("button",{name:"Publier pour ce client",exact:true}).click();
  const confirmation = page.getByRole("dialog", {name:"Publier ce programme",exact:true});
  await expect(confirmation).toContainText("pour Maxime Bourdon — Mon profil personnel ?");
  await confirmation.getByRole("button", {name:"Annuler",exact:true}).click();
  expect(await page.evaluate(()=>(window as unknown as {__publicationRequests:PublishProgramRequest[]}).__publicationRequests)).toEqual([]);
  for(const width of [390,320]) {await page.setViewportSize({width,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);}
});
test("incomplete and unsaved work cannot be published",async({page})=>{
  await page.goto("/?screen=program-builder");
  await page.getByRole("button",{name:"Enregistrer le brouillon",exact:true}).click();
  await expect(page.getByText(/Complète chaque semaine/)).toBeVisible();
  await expect(page.getByRole("button",{name:"Publier pour ce client",exact:true})).toBeDisabled();
  await prepare(page); await page.getByLabel("Titre du programme · français").fill("Pas encore sauvegardé");
  await expect(page.getByRole("button",{name:"Publier pour ce client",exact:true})).toBeDisabled();
});
test("uncertain publication retries exact command and locks draft edits",async({page})=>{
  await prepare(page,"publication-response-lost");
  await page.getByRole("button",{name:"Publier pour ce client",exact:true}).click();
  await page.getByRole("dialog", {name:"Publier ce programme",exact:true}).getByRole("button", {name:"Confirmer la publication",exact:true}).click();
  await expect(page.getByText(/Confirmation non reçue/)).toBeVisible();
  await expect(page.getByLabel("Titre du programme · français")).toBeDisabled();
  await page.getByRole("button",{name:"Réessayer la même publication",exact:true}).click();
  await expect(page.getByText("Programme publié. Le client peut maintenant le consulter dans son portail.")).toBeVisible();
  const sent=await page.evaluate(()=>(window as unknown as {__publicationRequests:PublishProgramRequest[]}).__publicationRequests);
  expect(sent).toHaveLength(2);expect(sent[0]).toEqual(sent[1]);
  await expect(page.getByLabel("Titre du programme · français")).toBeEnabled();
});
test("publication conflict never displays false success",async({page})=>{
  await prepare(page,"publication-conflict");
  await page.getByRole("button",{name:"Publier pour ce client",exact:true}).click();
  await page.getByRole("dialog", {name:"Publier ce programme",exact:true}).getByRole("button", {name:"Confirmer la publication",exact:true}).click();
  await expect(page.getByRole("alert")).toContainText("Publication refusée");
  await expect(page.getByText("Programme publié. Le client peut maintenant le consulter dans son portail.")).toHaveCount(0);
});

test("503 after publication keeps the exact retry command and never claims rejection", async ({ page }) => {
  await prepare(page, "publication-service-unavailable");
  await page.getByRole("button", { name: "Publier pour ce client", exact: true }).click();
  await page.getByRole("dialog", { name: "Publier ce programme", exact: true }).getByRole("button", { name: "Confirmer la publication", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Confirmation non reçue");
  await expect(page.getByText(/Publication refusée/)).toHaveCount(0);
  await expect(page.getByLabel("Titre du programme · français")).toBeDisabled();
  await page.getByRole("button", { name: "Réessayer la même publication", exact: true }).click();
  await expect(page.getByText("Programme publié. Le client peut maintenant le consulter dans son portail.")).toBeVisible();
  const commands = await page.evaluate(() => (window as unknown as { __publicationRequests: PublishProgramRequest[] }).__publicationRequests);
  expect(commands).toHaveLength(2); expect(commands[0]).toEqual(commands[1]);
});

test("pilot restriction names the recipient limitation without exposing raw server text", async ({ page }) => {
  await prepare(page, "publication-pilot-recipient-disabled");
  await page.getByRole("button", { name: "Ajouter un exercice après Dumbbell Press", exact: true }).click();
  await page.getByRole("dialog", { name: "Choisir un exercice", exact: true }).getByRole("button", { name: "Choisir Curl alterné avec haltères", exact: true }).click();
  await page.getByRole("button", { name: "Enregistrer le brouillon", exact: true }).click();
  await expect(page.getByText(/Il est réservé aux comptes de test autorisés/)).toBeVisible();
  await page.getByRole("button", { name: "Publier pour ce client", exact: true }).click();
  await page.getByRole("dialog", { name: "Publier ce programme", exact: true }).getByRole("button", { name: "Confirmer la publication", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("ce destinataire n’est pas autorisé pour le lot pilote staging");
  await expect(page.getByText("Untrusted server detail must not appear")).toHaveCount(0);
});
test("Client reads the published prescription in French and English on narrow screens",async({page})=>{
  await page.goto("/?screen=client-program&state=program-published");
  await expect(page.getByRole("heading",{name:"Phase force",exact:true})).toBeVisible();
  await expect(page.getByRole("heading",{name:"Dumbbell Press",exact:true})).toBeVisible();
  await expect(page.locator("p").filter({hasText:"Série 1"})).toContainText("40 (lb)");
  await expect(page.getByRole("link",{name:"Ouvrir la séance",exact:true})).toBeVisible();
  await page.getByRole("button",{name:"English",exact:true}).click();
  await expect(page.getByRole("heading",{name:"Strength phase",exact:true})).toBeVisible();
  for(const width of [1280,390,320]) { await page.setViewportSize({width,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true); }
});
test("Client failure is distinct from no published program",async({page})=>{
  await page.goto("/?screen=client-program");await expect(page.getByText(/n’a pas encore publié de programme/)).toBeVisible();
  await page.goto("/?screen=client-program&state=publication-load-error");await expect(page.getByRole("alert")).toContainText("n’ont pas pu être chargés");
  await expect(page.getByText(/n’a pas encore publié de programme/)).toHaveCount(0);
});
