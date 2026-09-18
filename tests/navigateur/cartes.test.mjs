import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { ouvrirSite, terminer } from './outils.mjs';
import { jeuDeTest, entreeTitree } from './donnees-test.mjs';

let site;
before(async () => { site = await ouvrirSite(); });
after(async () => { await site.fermer(); });

const donnees = jeuDeTest();

async function entrees(options = {}) {
  const page = await site.page({ donnees, ...options });
  await page.goto(site.url('#/entrees'));
  await page.locator('#grid .card').first().waitFor();
  return page;
}

function carte(page, titre) {
  return page.locator('#grid .card').filter({ has: page.getByRole('link', { name: titre, exact: true }) });
}

test('carte : date relative, date exacte en infobulle', async () => {
  const page = await entrees();
  const heure = carte(page, 'Mémoire Vive — site en ligne').locator('time');
  assert.equal(await heure.textContent(), 'hier');
  assert.equal(await heure.getAttribute('title'), '19 septembre 2026 à 08:00');
  const recente = await carte(page, 'Note sans projet').locator('time').textContent();
  assert.equal(recente.replace(/\s/g, ' '), 'il y a 20 h');
  await terminer(page);
});

test('carte : bouton du lien principal (site ou dépôt), dans un nouvel onglet', async () => {
  const page = await entrees();
  const lienSite = page.getByRole('link', { name: 'Ouvrir le site : Jarvis — architecture (nouvel onglet)' });
  assert.equal(await lienSite.getAttribute('href'), 'https://exemple.github.io/jarvis/');
  assert.equal(await lienSite.getAttribute('target'), '_blank');
  assert.equal(await lienSite.getAttribute('rel'), 'noopener noreferrer');
  const depot = page.getByRole('link', { name: 'Dépôt : Depths — génération de donjon (nouvel onglet)' });
  assert.equal(await depot.getAttribute('href'), 'https://github.com/exemple/depths');
  assert.equal(await carte(page, 'Note sans projet').locator('.main-link').count(), 0);
  await terminer(page);
});

test('carte : liseré à la couleur de la famille, neutre sans famille', async () => {
  const page = await entrees();
  const jarvis = carte(page, 'Jarvis — architecture');
  assert.equal(await jarvis.getAttribute('data-couleur'), '3');
  assert.equal(await jarvis.evaluate((e) => getComputedStyle(e).borderLeftColor), 'rgb(39, 114, 79)');
  const atelier = carte(page, 'Le cœur de l’atelier');
  assert.equal(await atelier.getAttribute('data-couleur'), null);
  assert.equal(await atelier.evaluate((e) => getComputedStyle(e).borderLeftColor), 'rgb(207, 200, 182)');
  await terminer(page);
});

test('pastille « nouveau » : entrées postérieures à la visite précédente', async () => {
  const page = await entrees();
  assert.equal(await page.locator('.new-badge').count(), 0, 'première visite : aucune pastille');
  await page.evaluate(() => localStorage.setItem('memoire-vive:derniere-visite', '2026-09-19T00:00:00Z'));
  await page.reload();
  await page.locator('#grid .card').first().waitFor();
  const titres = await page.locator('#grid .card:has(.new-badge) h3').allTextContents();
  assert.deepEqual(titres.sort(), ['Mémoire Vive — site en ligne', 'Note sans projet']);
  await page.reload();
  await page.locator('#grid .card').first().waitFor();
  assert.equal(await page.locator('.new-badge').count(), 0, 'visite suivante : déjà vues');
  await terminer(page);
});

test('pastille « nouveau » : stockage bloqué, ni pastille ni erreur', async () => {
  const page = await site.page({ donnees });
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Accès refusé', 'SecurityError'); } });
  });
  await page.goto(site.url('#/entrees'));
  await page.locator('#grid .card').first().waitFor();
  assert.equal(await page.locator('.new-badge').count(), 0);
  await terminer(page);
});

test('carte d’entrée : résumé limité à 5 lignes même étirée par sa voisine', async () => {
  const longue = jeuDeTest();
  const texte = 'Un résumé très long qui continue encore et encore, avec des détails sur le projet, ses choix, '.repeat(4);
  for (const titre of ['Note sans projet', 'Mémoire Vive — site en ligne', 'Mémoire Vive — architecture']) {
    entreeTitree(longue, titre).resume = texte;
  }
  entreeTitree(longue, 'Note sans projet').titre = 'Note sans projet, avec un titre assez long pour tenir sur trois lignes de la carte';
  const page = await site.page({ donnees: longue });
  await page.goto(site.url('#/entrees'));
  await page.locator('#grid .card').first().waitFor();
  const lignes = await page.locator('#grid .card .resume').evaluateAll((boites) => boites.map((b) =>
    Math.round((b.clientHeight / parseFloat(getComputedStyle(b).lineHeight)) * 10) / 10));
  assert.ok(lignes.every((n) => n <= 5), lignes.filter((n) => n > 5).join(', '));
  await terminer(page);
});
