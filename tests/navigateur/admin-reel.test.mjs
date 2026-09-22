/* Recette de la page d'admin sur les vrais réglages et le vrai data.json du
   dépôt, copiés dans un dépôt temporaire : rien de réel n'est modifié ni
   publié, aucun dashboard n'est interrogé. Vérifications indépendantes du contenu. */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { CHROME, pageInstrumentee, terminer, debordement } from './outils.mjs';
import { ouvrirBanc } from './banc-admin.mjs';

let navigateur;
let banc;
let donnees;
let reglages;
before(async () => {
  navigateur = await chromium.launch({ executablePath: CHROME, headless: true });
  banc = await ouvrirBanc({ reel: true });
  donnees = await banc.lire('docs/data.json');
  reglages = {
    projets: await banc.lire('config/projets.json'),
    entrees: await banc.lire('config/entrees.json'),
    recherche: await banc.lire('config/recherche.json'),
  };
});
after(async () => {
  await banc.fermer();
  await navigateur.close();
});

async function ouvrir() {
  const page = await pageInstrumentee(navigateur);
  await page.goto(banc.admin.adresse);
  await page.locator('#panneau-projets:not([hidden])').waitFor();
  return page;
}

test('réel : chaque projet est listé et sa fiche s’ouvre', async () => {
  const page = await ouvrir();
  const alias = new Set(Object.values(reglages.projets.projets).flatMap((r) => r.alias || []));
  const attendus = new Set([...donnees.projets.map((p) => p.id), ...Object.keys(reglages.projets.projets)]
    .filter((id) => !alias.has(id)));
  const ids = await page.locator('#liste-projets button').evaluateAll((boutons) => boutons.map((b) => b.dataset.id));
  assert.deepEqual(new Set(ids), attendus);
  assert.equal(ids.length, attendus.size);
  for (const id of ids) {
    await page.click(`#liste-projets button[data-id="${id}"]`);
    await page.locator(`#liste-projets button[data-id="${id}"][aria-current="true"]`).waitFor();
    await page.locator('#titre-projet').waitFor();
  }
  assert.ok(await debordement(page) <= 0);
  await terminer(page);
});

test('réel : chaque entrée est listée, sa fiche s’ouvre, l’original d’une entrée non corrigée est son titre', async () => {
  const page = await ouvrir();
  await page.click('#onglet-entrees');
  const publiees = new Set(donnees.entrees.map((e) => e.id.slice(0, 12)));
  const masquees = Object.entries(reglages.entrees)
    .filter(([cle, c]) => !cle.startsWith('_') && c.masquer === true && !publiees.has(cle));
  const courts = await page.locator('#liste-entrees button').evaluateAll((boutons) => boutons.map((b) => b.dataset.court));
  assert.equal(courts.length, donnees.entrees.length + masquees.length);
  for (const entree of donnees.entrees) {
    const court = entree.id.slice(0, 12);
    await page.click(`#liste-entrees button[data-court="${court}"]`);
    await page.locator('#titre-entree').waitFor();
    if (!entree.corrige) {
      assert.equal(await page.inputValue('#entree-titre'), entree.titre, court);
      assert.equal(await page.isHidden('#origine-titre'), true, court);
    }
  }
  await terminer(page);
});

test('réel : un réglage par fichier, enregistré ; les vrais fichiers passent la validation, le reste est intact', async () => {
  const page = await ouvrir();
  const premier = await page.locator('#liste-projets button').first().getAttribute('data-id');
  await page.click(`#liste-projets button[data-id="${premier}"]`);
  await page.fill('#projet-description', 'Description de recette.');
  await page.click('#onglet-entrees');
  const entree = donnees.entrees[0].id.slice(0, 12);
  await page.click(`#liste-entrees button[data-court="${entree}"]`);
  await page.fill('#entree-titre', 'Titre de recette');
  await page.click('#onglet-recherche');
  await page.click('#bouton-ajouter-groupe');
  await page.keyboard.type('recette, essai');
  await page.click('#bouton-enregistrer');
  await page.waitForFunction(() => document.getElementById('compte-rendu-titre').textContent === 'Enregistré');

  const attendu = structuredClone(reglages);
  attendu.projets.projets[premier] = { ...(attendu.projets.projets[premier] || {}), description: 'Description de recette.' };
  attendu.entrees[entree] = { ...(attendu.entrees[entree] || {}), titre: 'Titre de recette' };
  attendu.recherche.synonymes.push(['recette', 'essai']);
  assert.deepEqual(await banc.lire('config/projets.json'), attendu.projets);
  assert.deepEqual(await banc.lire('config/entrees.json'), attendu.entrees);
  assert.deepEqual(await banc.lire('config/recherche.json'), attendu.recherche);
  await terminer(page);
});
