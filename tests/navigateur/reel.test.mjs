/* Recette sur les vraies données : le data.json servi par le site (local ou
   publié avec MEMOIRE_SITE_URL). Vérifications indépendantes du contenu. */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { ouvrirSite, terminer, debordement } from './outils.mjs';

let site;
let donnees;
before(async () => {
  site = await ouvrirSite();
  const reponse = await fetch(site.url('data.json'), { cache: 'no-store' });
  donnees = await reponse.json();
});
after(async () => { await site.fermer(); });

test('données réelles : schéma pris en charge, accueil complet', async () => {
  assert.equal(donnees.schema, 2);
  const page = await site.page();
  await page.goto(site.url('#/'));
  await page.locator('.project-card').first().waitFor();
  const avecEntrees = new Set(donnees.entrees.map((e) => e.projet).filter(Boolean));
  assert.equal(await page.locator('.project-card').count(), donnees.projets.filter((p) => avecEntrees.has(p.id)).length);
  assert.match(await page.textContent('#stats'), new RegExp('^' + donnees.entrees.length + '\\sentrées'));
  assert.ok(await debordement(page) <= 0);
  await terminer(page);
});

test('données réelles : toutes les entrées, en grille et en liste', async () => {
  const page = await site.page();
  await page.goto(site.url('#/entrees'));
  await page.locator('#grid .card').first().waitFor();
  assert.equal(await page.locator('#grid .card').count(), Math.min(60, donnees.entrees.length));
  await page.goto(site.url('#/entrees?vue=liste'));
  await page.locator('#lines .entry-line').first().waitFor();
  assert.equal(await page.locator('#lines .entry-line').count(), Math.min(60, donnees.entrees.length));
  await terminer(page);
});

test('données réelles : chaque page projet s’affiche sans erreur', async () => {
  const page = await site.page();
  for (const projet of donnees.projets) {
    await page.goto(site.url('#/projet/' + encodeURIComponent(projet.id)));
    await page.locator('#titre-vue', { hasText: projet.nom }).waitFor();
  }
  await terminer(page);
});

test('données réelles : chaque fiche s’affiche, « Voir aussi » compte ses voisins publiés', async () => {
  const page = await site.page();
  const ids = new Set(donnees.entrees.map((e) => e.id));
  for (const entree of donnees.entrees) {
    await page.goto(site.url('#/entree/' + entree.id.slice(0, 12)));
    await page.locator('#entry-title', { hasText: entree.titre }).waitFor();
    const voisins = (entree.voisins || []).filter((v) => ids.has(v.id) && v.id !== entree.id).length;
    assert.equal(await page.locator('.see-also li').count(), voisins, entree.titre);
  }
  await terminer(page);
});

test('données réelles : recherches par nom de famille et de projet', async () => {
  const page = await site.page();
  const requetes = donnees.familles.map((f) => f.nom).concat(donnees.projets.slice(0, 5).map((p) => p.nom));
  for (const q of requetes) {
    await page.goto(site.url('#/recherche?q=' + encodeURIComponent(q)));
    await page.locator('#titre-vue', { hasText: q }).waitFor();
    assert.ok(await page.locator('#results-count').count() === 1, q);
  }
  await terminer(page);
});

test('données réelles : mobile sans défilement horizontal', async () => {
  const page = await site.page({ mobile: true });
  const plusDeLiens = donnees.entrees.slice().sort((a, b) => b.liens.length - a.liens.length)[0];
  for (const [ancre, attendu] of [['#/', '.project-card'], ['#/entrees', '#grid .card'],
    ['#/entree/' + plusDeLiens.id.slice(0, 12), '#entry-title'], ['#/projet/' + encodeURIComponent(donnees.projets[0].id), '#titre-vue']]) {
    await page.goto(site.url(ancre));
    await page.locator(attendu).first().waitFor();
    assert.ok(await debordement(page) <= 0, ancre);
  }
  await terminer(page);
});
