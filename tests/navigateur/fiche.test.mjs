import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { ouvrirSite, terminer, attendreAncre } from './outils.mjs';
import { jeuDeTest, entreeTitree, assembler } from './donnees-test.mjs';

let site;
before(async () => { site = await ouvrirSite(); });
after(async () => { await site.fermer(); });

const donnees = jeuDeTest();
const archi = entreeTitree(donnees, 'Jarvis — architecture');

async function ouvrir(ancre, selecteur) {
  const page = await site.page({ donnees });
  await page.goto(site.url(ancre));
  await page.locator(selecteur).first().waitFor();
  return page;
}

const CARTES = '#list-view:not([hidden]) #grid .card h3 a';

test('ouvrir une fiche depuis la liste : titre, URL courte, focus sur le titre', async () => {
  const page = await ouvrir('#/recherche?q=jarvis', CARTES);
  await page.getByRole('link', { name: 'Jarvis — architecture', exact: true }).click();
  await page.locator('#entry-view:not([hidden]) #entry-title').waitFor();
  assert.equal(await page.textContent('#entry-title'), 'Jarvis — architecture');
  assert.match(page.url(), /#\/entree\/[0-9a-f]{12}$/);
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'entry-title');
  await terminer(page);
});

test('fiche : liens en ligne cliquables, adresses locales étiquetées, texte intégral', async () => {
  const page = await ouvrir('#/entree/' + archi.id.slice(0, 12), '#entry-title');
  const liens = await page.locator('.links-list a').evaluateAll((as) => as.map((a) => ({ target: a.target, rel: a.rel })));
  assert.equal(liens.length, 2);
  assert.ok(liens.every((a) => a.target === '_blank' && /noopener/.test(a.rel)));
  assert.equal(await page.locator('.links-list li:has(.local-label)').count(), 2);
  assert.equal(await page.locator('.links-list li:has(.local-label) a').count(), 0);
  assert.equal(await page.textContent('.entry-content'), archi.contenu);
  await terminer(page);
});

test('fiche du milieu : « Précédente » active, flèche droite vers la suivante', async () => {
  const page = await ouvrir('#/entrees', CARTES);
  await page.locator(CARTES).nth(1).click();
  await page.locator('#entry-title').waitFor();
  assert.equal(await page.locator('.pager a[rel="prev"]').count(), 1);
  const avant = page.url();
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction((u) => location.href !== u, avant);
  assert.match(page.url(), /#\/entree\//);
  await terminer(page);
});

test('« Retour à la liste » : filtres et recherche conservés', async () => {
  const page = await ouvrir('#/entrees?type=milestone', CARTES);
  await page.locator(CARTES).first().click();
  await page.locator('#entry-title').waitFor();
  await page.getByRole('link', { name: '← Retour à la liste' }).click();
  await page.locator(CARTES).first().waitFor();
  assert.ok(page.url().endsWith('#/entrees?type=milestone'), page.url());
  await page.goto(site.url('#/recherche?q=jarvis'));
  await page.locator(CARTES).first().click();
  await page.locator('#entry-title').waitFor();
  await page.getByRole('link', { name: '← Retour aux résultats' }).click();
  await page.locator(CARTES).first().waitFor();
  assert.ok(page.url().endsWith('#/recherche?q=jarvis'), page.url());
  assert.equal(await page.inputValue('#search-input'), 'jarvis');
  await terminer(page);
});

test('entrée inconnue : message « Entrée introuvable »', async () => {
  const page = await ouvrir('#/entree/deadbeef0000', '#entry-title');
  assert.equal(await page.textContent('#entry-title'), 'Entrée introuvable');
  await terminer(page);
});

test('fiche Bibliothèque Claude : lien vers l’artifact', async () => {
  const biblio = entreeTitree(donnees, 'Bibliothèque Claude');
  const page = await ouvrir('#/entree/' + biblio.id.slice(0, 12), '#entry-title');
  assert.equal(await page.locator('.links-list a[href*="claude.ai/artifact"]').count(), 1);
  await terminer(page);
});

test('retour de fiche : le focus revient sur sa carte', async () => {
  const page = await ouvrir('#/entrees', CARTES);
  const href = await page.locator(CARTES).nth(4).getAttribute('href');
  await page.locator(CARTES).nth(4).click();
  await page.locator('#entry-title').waitFor();
  await page.getByRole('link', { name: '← Retour à la liste' }).click();
  await page.locator(CARTES).first().waitFor();
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('href')), href);
  await terminer(page);
});

test('Suivante ×2 puis « précédent » du navigateur : retour à la liste', async () => {
  const page = await ouvrir('#/entrees?type=note', CARTES);
  await page.locator(CARTES).nth(2).click();
  await page.locator('#entry-title').waitFor();
  for (let i = 0; i < 2; i++) {
    const avant = page.url();
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction((u) => location.href !== u, avant);
  }
  await page.goBack();
  await page.locator(CARTES).first().waitFor();
  assert.ok(page.url().includes('type=note'), page.url());
  await terminer(page);
});

test('fiche rechargée puis « Retour » : filtres d’origine', async () => {
  const page = await ouvrir('#/entrees?type=note', CARTES);
  await page.locator(CARTES).nth(1).click();
  await page.locator('#entry-title').waitFor();
  await page.reload();
  await page.locator('#entry-title').waitFor();
  await page.getByRole('link', { name: '← Retour à la liste' }).click();
  await page.locator(CARTES).first().waitFor();
  assert.ok(page.url().includes('type=note'), page.url());
  await terminer(page);
});

test('Maj+Flèche : reste sur la fiche', async () => {
  const page = await ouvrir('#/entrees', CARTES);
  await page.locator(CARTES).nth(1).click();
  await page.locator('#entry-title').waitFor();
  const url = page.url();
  await page.keyboard.press('Shift+ArrowRight');
  await page.waitForTimeout(150);
  assert.equal(page.url(), url);
  await terminer(page);
});

test('Échap sur une fiche introuvable : retour à la liste sans erreur', async () => {
  const page = await ouvrir('#/entree/0000000000ff', '#entry-title');
  await page.keyboard.press('Escape');
  await attendreAncre(page, '#/');
  await page.locator(CARTES).first().waitFor();
  assert.ok(page.url().endsWith('#/'), page.url());
  await terminer(page);
});

test('lien « en ligne » invalide : non cliquable, pas étiqueté « adresse locale »', async () => {
  const mini = assembler([{
    id: 'aaaaaaaaaaaa1111', titre: 'Lien cassé', resume: '', contenu: 'Lien cassé.', type: 'note', tags: [], projet: null,
    cree_le: '2026-09-18T00:00:00Z', modifie_le: null, lien_principal: null, corrige: false, voisins: [],
    liens: [{ type: 'en_ligne', valeur: 'https://exemple.com:99999/x' }, { type: 'local', valeur: 'D:/x' }],
  }]);
  const page = await site.page({ donnees: mini });
  await page.goto(site.url('#/entree/aaaaaaaaaaaa'));
  await page.locator('#entry-title').waitFor();
  assert.equal(await page.locator('.links-list a').count(), 0);
  assert.equal(await page.locator('.local-label', { hasText: 'lien non cliquable' }).count(), 1);
  assert.equal(await page.locator('.local-label', { hasText: 'adresse locale' }).count(), 1);
  await terminer(page);
});
