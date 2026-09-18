import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { ouvrirSite, terminer, attendreAncre } from './outils.mjs';
import { jeuDeTest } from './donnees-test.mjs';

let site;
before(async () => { site = await ouvrirSite(); });
after(async () => { await site.fermer(); });

const donnees = jeuDeTest();

async function ouvrir(ancre) {
  const page = await site.page({ donnees });
  await page.goto(site.url(ancre));
  await page.locator('#grid .card').first().waitFor();
  return page;
}

test('ancienne ancre avec recherche : redirigée vers #/recherche', async () => {
  const page = await ouvrir('#/?q=jarvis&type=milestone');
  await attendreAncre(page, '#/recherche');
  assert.ok(page.url().endsWith('#/recherche?q=jarvis'), page.url());
  assert.equal(await page.inputValue('#search-input'), 'jarvis');
  await terminer(page);
});

test('ancienne ancre de filtres : redirigée vers #/entrees, filtres gardés', async () => {
  const page = await ouvrir('#/?type=milestone&tri=ancien');
  assert.ok(page.url().endsWith('#/entrees?type=milestone&tri=ancien'), page.url());
  const badges = await page.locator('#grid .type-badge').allTextContents();
  assert.ok(badges.length > 0 && badges.every((b) => b === 'Jalon'), badges.join(', '));
  await terminer(page);
});

test('redirection sans nouvelle entrée d’historique ; ancre inconnue : accueil', async () => {
  const page = await ouvrir('#/entrees');
  await page.evaluate(() => { location.hash = '#/?type=note'; });
  await attendreAncre(page, '#/entrees?type=note');
  await page.goBack();
  await page.waitForFunction(() => location.hash === '#/entrees');
  await page.goto(site.url('#/nimporte-quoi'));
  await page.waitForFunction(() => location.hash === '#/');
  await terminer(page);
});

test('frappe : ouvre #/recherche une seule fois, puis remplace ; « précédent » revient d’où l’on vient', async () => {
  const page = await ouvrir('#/entrees?type=note');
  // 180 ms entre deux touches (délai de 120 ms) : chaque touche lance sa
  // recherche ; seule la première crée une entrée d'historique.
  await page.locator('#search-input').pressSequentially('jarvis', { delay: 180 });
  await attendreAncre(page, 'q=jarvis');
  await page.goBack();
  await page.waitForFunction(() => location.hash === '#/entrees?type=note');
  await page.locator('#grid .card').first().waitFor();
  assert.equal(await page.inputValue('#search-input'), '');
  await terminer(page);
});

test('Échap dans la recherche : retour à la vue de départ', async () => {
  const page = await ouvrir('#/entrees?type=note');
  await page.locator('#search-input').pressSequentially('jar', { delay: 60 });
  await attendreAncre(page, 'q=jar');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => location.hash === '#/entrees?type=note');
  assert.equal(await page.inputValue('#search-input'), '');
  await terminer(page);
});
