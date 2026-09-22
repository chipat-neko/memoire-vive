/* Page d'admin locale : parcours dans le navigateur, contre scripts/admin.py
   lancé sur un dépôt temporaire (banc-admin.mjs). */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { CHROME, pageInstrumentee, terminer, debordement } from './outils.mjs';
import { ouvrirBanc } from './banc-admin.mjs';

let navigateur;
before(async () => { navigateur = await chromium.launch({ executablePath: CHROME, headless: true }); });
after(async () => { await navigateur.close(); });

/* Banc neuf (dépôt, faux dashboard, admin.py) et page d'admin ouverte avec son jeton. */
async function ouvrirAdmin(t) {
  const banc = await ouvrirBanc();
  t.after(() => banc.fermer());
  const page = await pageInstrumentee(navigateur);
  await page.goto(banc.admin.adresse);
  await page.locator('#panneau-projets:not([hidden])').waitFor();
  return { banc, page };
}

/* Clique, puis attend le compte rendu de ce titre exact (pas celui d'avant). */
async function cliquerEtAttendre(page, bouton, titre) {
  await page.click(bouton);
  await page.waitForFunction((attendu) => document.getElementById('compte-rendu-titre').textContent === attendu, titre);
}

// ------------------------------------------------------------ ouverture

test('ouverture : jeton lu puis retiré de l’adresse, onglets, état git', async (t) => {
  const { page } = await ouvrirAdmin(t);
  assert.equal(await page.evaluate(() => location.hash), '', 'le jeton ne reste pas dans l’adresse');
  assert.equal(await page.title(), 'Réglages — Mémoire Vive');
  assert.equal(await page.isVisible('#onglets'), true);
  assert.equal(await page.isHidden('#status'), true);
  assert.equal(await page.textContent('#etat-modifs'), 'Tout est enregistré.');
  assert.equal(await page.textContent('#etat-git'), 'Branche main · rien en attente de publication.');
  assert.equal(await page.getAttribute('#onglet-projets', 'aria-selected'), 'true');
  assert.ok(await debordement(page) <= 0, 'aucun défilement horizontal à 1280 px');
  await terminer(page);
});

test('sans jeton ou avec un jeton faux : message clair, aucun réglage affiché', async (t) => {
  const { banc, page } = await ouvrirAdmin(t);
  await page.goto(banc.admin.base + 'admin/');
  await page.evaluate(() => sessionStorage.clear());
  await page.reload();
  await page.locator('#status.error').waitFor();
  assert.match(await page.textContent('#status'), /^Jeton absent : ouvrir cette page avec « Gérer Mémoire Vive »/);
  assert.equal(await page.isHidden('#onglets'), true);
  await page.goto(banc.admin.base + 'admin/#jeton=faux');
  await page.reload();
  await page.locator('#status.error', { hasText: 'Accès refusé' }).waitFor();
  assert.equal(await page.isHidden('#panneau-projets'), true);
  // La seule erreur de console attendue : le refus 403 du serveur.
  assert.ok(page.erreurs.length > 0 && page.erreurs.every((e) => e.includes('403')), page.erreurs.join('\n'));
  page.erreurs.length = 0;
  await terminer(page);
});

test('onglets au clavier : flèches, Début, Fin', async (t) => {
  const { page } = await ouvrirAdmin(t);
  await page.focus('#onglet-projets');
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'onglet-familles');
  assert.equal(await page.isVisible('#panneau-familles'), true);
  assert.equal(await page.isHidden('#panneau-projets'), true);
  await page.keyboard.press('End');
  assert.equal(await page.getAttribute('#onglet-recherche', 'aria-selected'), 'true');
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'onglet-projets');
  await page.keyboard.press('ArrowLeft');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'onglet-recherche');
  await terminer(page);
});

test('Enregistrer sans modification : « Rien à enregistrer »', async (t) => {
  const { page } = await ouvrirAdmin(t);
  await cliquerEtAttendre(page, '#bouton-enregistrer', 'Rien à enregistrer');
  assert.equal(await page.textContent('#annonce'), 'Rien à enregistrer : Aucune modification en attente.');
  await terminer(page);
});
