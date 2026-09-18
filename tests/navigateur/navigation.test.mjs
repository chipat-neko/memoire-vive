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
  await page.locator('.card:visible').first().waitFor();
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
  const page = await ouvrir('#/?type=milestone&tri=ancien&vue=projets');
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

/* Page défilée jusqu'au lien, position notée, clic : page projet ouverte. */
async function ouvrirProjetDepuis(page, lien) {
  await lien.scrollIntoViewIfNeeded();
  const position = await page.evaluate(() => Math.round(window.scrollY));
  const href = await lien.getAttribute('href');
  await lien.click();
  await attendreAncre(page, href);
  await page.locator('.project-head #titre-vue').waitFor();
  return { position, href };
}

const etat = (page) => page.evaluate(() => ({
  y: Math.round(window.scrollY), focus: document.activeElement?.getAttribute('href') || document.activeElement?.id,
}));

test('retour d’une page projet vers l’accueil (précédent) : position et focus sur la carte ouverte', async () => {
  const page = await site.page({ donnees, mobile: true });
  await page.goto(site.url('#/'));
  await page.locator('.project-card').first().waitFor();
  const { position, href } = await ouvrirProjetDepuis(page, page.locator('.project-card h4 a[href="#/projet/atelier"]'));
  assert.ok(position > 0, 'accueil défilé avant le clic');
  await page.goBack();
  await page.locator('#titre-vue', { hasText: /^Projets$/ }).waitFor();
  assert.deepEqual(await etat(page), { y: position, focus: href });
  await terminer(page);
});

test('« ← Tous les projets » après l’accueil : retour arrière, position et focus rendus', async () => {
  const page = await site.page({ donnees, mobile: true });
  await page.goto(site.url('#/'));
  await page.locator('.project-card').first().waitFor();
  const { position, href } = await ouvrirProjetDepuis(page, page.locator('.project-card h4 a[href="#/projet/atelier"]'));
  const longueur = await page.evaluate(() => history.length);
  await page.getByRole('link', { name: '← Tous les projets' }).click();
  await page.locator('#titre-vue', { hasText: /^Projets$/ }).waitFor();
  assert.deepEqual(await etat(page), { y: position, focus: href });
  assert.equal(await page.evaluate(() => history.length), longueur, 'aucune nouvelle entrée d’historique');
  await terminer(page);
});

test('retour d’une page projet vers les résultats : position et focus sur le projet ouvert', async () => {
  const page = await site.page({ donnees, mobile: true });
  await page.goto(site.url('#/recherche?q=outils'));
  await page.locator('#h-res-projets').waitFor();
  const { position, href } = await ouvrirProjetDepuis(page, page.locator('#h-res-projets ~ .project-grid .project-card a').last());
  assert.ok(position > 0, 'résultats défilés avant le clic');
  await page.goBack();
  await page.locator('#titre-vue', { hasText: 'Recherche' }).waitFor();
  assert.deepEqual(await etat(page), { y: position, focus: href });
  await terminer(page);
});

test('page projet ouverte sans passer par l’accueil : « ← Tous les projets » mène en haut du catalogue', async () => {
  const page = await site.page({ donnees, mobile: true });
  await page.goto(site.url('#/projet/atelier'));
  await page.locator('.project-head #titre-vue').waitFor();
  await page.getByRole('link', { name: '← Tous les projets' }).click();
  await page.locator('#titre-vue', { hasText: /^Projets$/ }).waitFor();
  assert.deepEqual(await etat(page), { y: 0, focus: 'titre-vue' });
  // Accueil → projet → autre rubrique → autre projet → « Tous les projets » :
  // ce n'est plus un retour vers la carte ouverte au départ.
  await ouvrirProjetDepuis(page, page.locator('.project-card h4 a[href="#/projet/atelier"]'));
  await page.click('#nav-entries');
  await page.locator('#grid .card').first().waitFor();
  await page.locator('#grid .project-tag').first().click();
  await page.locator('.project-head #titre-vue').waitFor();
  await page.getByRole('link', { name: '← Tous les projets' }).click();
  await page.locator('#titre-vue', { hasText: /^Projets$/ }).waitFor();
  assert.deepEqual(await etat(page), { y: 0, focus: 'titre-vue' });
  await terminer(page);
});
