import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { ouvrirSite, terminer, attendreAncre } from './outils.mjs';
import { jeuDeTest } from './donnees-test.mjs';

let site;
before(async () => { site = await ouvrirSite(); });
after(async () => { await site.fermer(); });

const donnees = jeuDeTest();

async function liste(ancre = '#/entrees') {
  const page = await site.page({ donnees });
  await page.goto(site.url(ancre));
  await page.locator('#grid .card').first().waitFor();
  return page;
}

test('liste : 60 premières cartes, puis « Afficher plus »', async () => {
  const page = await liste();
  assert.equal(await page.locator('#grid .card').count(), 60);
  assert.equal(await page.textContent('#more-btn'), 'Afficher plus (10\xa0restantes)');
  await page.click('#more-btn');
  assert.equal(await page.locator('#grid .card').count(), donnees.nb_entrees);
  await terminer(page);
});

test('statistiques renseignées', async () => {
  const page = await liste();
  assert.match(await page.textContent('#stats'), /^70\sentrées · 7\sprojets · \d+\sliens en ligne · export du /);
  await terminer(page);
});

test('recherche : « memoire » trouve « mémoire », surligne, met à jour l’URL, trie par pertinence', async () => {
  const page = await liste();
  await page.fill('#search-input', 'memoire');
  await attendreAncre(page, 'q=memoire');
  assert.ok(await page.locator('#grid .card').count() > 0);
  assert.ok(await page.locator('#grid mark').count() > 0);
  assert.equal(await page.inputValue('#sort-select'), 'pertinence');
  await terminer(page);
});

test('frappe lente : l’espace est conservé ; Échap vide la recherche', async () => {
  const page = await liste();
  await page.locator('#search-input').pressSequentially('tour de', { delay: 180 });
  await attendreAncre(page, 'q=tour+de');
  assert.equal(await page.inputValue('#search-input'), 'tour de');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !location.hash.includes('q='));
  assert.equal(await page.inputValue('#search-input'), '');
  await terminer(page);
});

test('filtre Jalon : que des jalons', async () => {
  const page = await liste();
  await page.getByRole('button', { name: /^Jalon/ }).first().click();
  await attendreAncre(page, 'type=milestone');
  const badges = await page.locator('#grid .type-badge').allTextContents();
  assert.ok(badges.length > 0);
  assert.ok(badges.every((b) => b === 'Jalon'), badges.join(', '));
  await terminer(page);
});

test('pastille de projet : filtre ce projet', async () => {
  const page = await liste();
  await page.locator('#project-chips .chip', { hasText: 'Depths' }).click();
  await attendreAncre(page, 'projet=depths');
  const projets = await page.locator('#grid .project-tag').allTextContents();
  assert.ok(projets.length > 0);
  assert.ok(projets.every((t) => t.endsWith('Depths')), projets.join(', '));
  await terminer(page);
});

test('vue Liste : une ligne par entrée (type, titre, projet, date, icône du lien principal)', async () => {
  const page = await liste();
  await page.getByRole('button', { name: 'Liste', exact: true }).click();
  await attendreAncre(page, 'vue=liste');
  assert.equal(await page.locator('#lines .entry-line').count(), 60);
  assert.equal(await page.locator('#grid').isHidden(), true);
  const ligne = page.locator('.entry-line').filter({ has: page.getByRole('link', { name: 'Jarvis — architecture', exact: true }) });
  assert.equal(await ligne.locator('.type-badge').textContent(), 'Référence');
  assert.equal(await ligne.locator('.entry-line-project').textContent(), 'Jarvis');
  assert.equal(await ligne.getAttribute('data-couleur'), '3');
  assert.match(await ligne.locator('time').getAttribute('title'), /2026/);
  const icone = ligne.getByRole('link', { name: 'Ouvrir le site : Jarvis — architecture (nouvel onglet)' });
  assert.equal(await icone.getAttribute('href'), 'https://exemple.github.io/jarvis/');
  await page.click('#more-btn');
  assert.equal(await page.locator('#lines .entry-line').count(), donnees.nb_entrees);
  assert.equal(await page.evaluate(() => document.activeElement?.textContent), await page.locator('#lines .entry-link').nth(60).textContent());
  assert.equal(await page.getByRole('button', { name: 'Par projet' }).count(), 0, 'vue « Par projet » supprimée');
  await terminer(page);
});

test('filtre famille : ordre configuré, « Sans famille », filtre et URL', async () => {
  const page = await liste();
  const noms = (await page.locator('#family-chips .chip').allTextContents()).map((t) => t.replace(/\s*\d+$/, ''));
  assert.deepEqual(noms, ['Toutes les familles', 'Jeux & univers de jeu', 'IA & simulations', 'Outils Claude', 'Sans famille']);
  await page.locator('#family-chips .chip', { hasText: 'IA & simulations' }).click();
  await attendreAncre(page, 'famille=ia');
  const couleurs = await page.locator('#grid .card').evaluateAll((cs) => cs.map((c) => c.getAttribute('data-couleur')));
  assert.equal(couleurs.length, 16);
  assert.ok(couleurs.every((c) => c === '3'));
  const projets = (await page.locator('#project-chips .chip').allTextContents()).map((t) => t.replace(/\s*\d+$/, ''));
  assert.deepEqual(projets, ['Tous les projets', '📁︎ Jarvis']);
  await page.locator('#family-chips .chip', { hasText: 'Sans famille' }).click();
  await attendreAncre(page, 'famille=_aucune');
  assert.equal(await page.locator('#grid .card').count(), 2);
  await terminer(page);
});

test('clic sur un tag : pastille de filtre', async () => {
  const page = await liste();
  await page.locator('#grid .tag').first().click();
  await page.locator('.filter-pill').waitFor();
  assert.ok(await page.locator('.filter-pill').isVisible());
  await terminer(page);
});
