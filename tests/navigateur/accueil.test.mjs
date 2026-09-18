import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { ouvrirSite, terminer, attendreAncre } from './outils.mjs';
import { jeuDeTest } from './donnees-test.mjs';

let site;
before(async () => { site = await ouvrirSite(); });
after(async () => { await site.fermer(); });

const donnees = jeuDeTest();

async function accueil() {
  const page = await site.page({ donnees });
  await page.goto(site.url('#/'));
  await page.locator('.project-card').first().waitFor();
  return page;
}

function carteProjet(page, nom) {
  return page.locator('.project-card').filter({ has: page.getByRole('link', { name: nom, exact: true }) });
}

test('accueil : familles dans l’ordre configuré, puis « Sans famille »', async () => {
  const page = await accueil();
  const familles = (await page.locator('.family-title').allTextContents()).map((t) => t.replace(/\s/g, ' '));
  assert.deepEqual(familles, [
    'Jeux & univers de jeu · 2 projets', 'IA & simulations · 1 projet', 'Outils Claude · 3 projets', 'Sans famille · 1 projet']);
  assert.equal(await page.title(), 'Mémoire Vive');
  await terminer(page);
});

test('accueil : dans une famille, activité la plus récente d’abord', async () => {
  const page = await accueil();
  const outils = page.locator('.family').nth(2).locator('.project-card h4');
  assert.deepEqual(await outils.allTextContents(), ['Mémoire Vive', 'Bibliothèque Claude', 'Tour de contrôle']);
  await terminer(page);
});

test('carte de projet : liseré, description, activité, lien principal distinct du nom', async () => {
  const page = await accueil();
  const jarvis = carteProjet(page, 'Jarvis');
  assert.equal(await jarvis.getAttribute('data-couleur'), '3');
  assert.equal(await jarvis.locator('h4 a').getAttribute('href'), '#/projet/jarvis');
  assert.match(await jarvis.locator('.project-card-description').textContent(), /^Assistant vocal local/);
  assert.equal((await jarvis.locator('.meta-line').textContent()).replace(/\s/g, ' '), '16 entrées · dernière activité il y a 6 j');
  const bouton = jarvis.getByRole('link', { name: 'Ouvrir le site : Jarvis (nouvel onglet)' });
  assert.equal(await bouton.getAttribute('href'), 'https://exemple.github.io/jarvis/');
  assert.equal(await page.locator('a a').count(), 0, 'aucun lien imbriqué');
  assert.equal(await carteProjet(page, 'Depths').getByRole('link', { name: /^Dépôt : Depths/ }).count(), 1);
  await terminer(page);
});

test('point « nouveau » : projets actifs depuis la dernière visite', async () => {
  const page = await accueil();
  await page.evaluate(() => localStorage.setItem('memoire-vive:derniere-visite', '2026-09-19T00:00:00Z'));
  await page.reload();
  await page.locator('.project-card').first().waitFor();
  assert.deepEqual(await page.locator('.project-card:has(.new-badge) h4').allTextContents(), ['Mémoire Vive']);
  await terminer(page);
});

test('nom du projet : page du projet ; onglets de l’en-tête et page courante', async () => {
  const page = await accueil();
  assert.equal(await page.getAttribute('#nav-home', 'aria-current'), 'page');
  await carteProjet(page, 'Depths').locator('h4 a').click();
  await attendreAncre(page, '#/projet/depths');
  await page.locator('#titre-vue', { hasText: 'Depths' }).waitFor();
  assert.equal(await page.getAttribute('#nav-home', 'aria-current'), null);
  await page.getByRole('link', { name: 'Toutes les entrées', exact: true }).click();
  await page.locator('#grid .card').first().waitFor();
  assert.equal(await page.getAttribute('#nav-entries', 'aria-current'), 'page');
  await page.getByRole('link', { name: 'Projets', exact: true }).click();
  await page.locator('.project-card').first().waitFor();
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'titre-vue');
  await terminer(page);
});

test('barre de recherche sur toutes les vues ; taper depuis l’accueil puis « précédent »', async () => {
  const page = await accueil();
  for (const ancre of ['#/projet/jarvis', '#/entree/' + donnees.entrees[0].id.slice(0, 12), '#/']) {
    await page.goto(site.url(ancre));
    await page.locator('#titre-vue, #entry-title').first().waitFor();
    assert.ok(await page.locator('#search-input').isVisible(), ancre);
  }
  await page.locator('#search-input').pressSequentially('donjon', { delay: 40 });
  await attendreAncre(page, '#/recherche?q=donjon');
  await page.goBack();
  await page.locator('.project-card').first().waitFor();
  assert.ok(page.url().endsWith('#/'), page.url());
  await terminer(page);
});
