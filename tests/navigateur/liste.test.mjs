import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { ouvrirSite, terminer, attendreAncre } from './outils.mjs';
import { jeuDeTest } from './donnees-test.mjs';

let site;
before(async () => { site = await ouvrirSite(); });
after(async () => { await site.fermer(); });

const donnees = jeuDeTest();

async function liste(ancre = '#/') {
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

test('clic sur le projet d’une carte : filtre ce projet', async () => {
  const page = await liste();
  const bouton = page.locator('#grid .project-tag').first();
  const nom = (await bouton.textContent()).replace(/^\S+\s/, '');
  await bouton.click();
  await attendreAncre(page, 'projet=');
  const projets = await page.locator('#grid .project-tag').allTextContents();
  assert.ok(projets.length > 0);
  assert.ok(projets.every((t) => t.endsWith(nom)), nom);
  await terminer(page);
});

test('vue par projet : un groupe par projet et « Sans projet » ; accords corrects', async () => {
  const page = await liste();
  await page.getByRole('button', { name: 'Par projet' }).click();
  await page.locator('#groups .group').first().waitFor();
  assert.equal(await page.locator('#groups .group').count(), donnees.projets.length + 1);
  const metas = await page.locator('.group-meta').allTextContents();
  assert.ok(!metas.some((m) => /\b([2-9]|\d{2,})\s(note|jalon|décision|référence|erreur)\b/.test(m)), metas.join(' | '));
  await terminer(page);
});

test('clic sur un tag : pastille de filtre', async () => {
  const page = await liste();
  await page.locator('#grid .tag').first().click();
  await page.locator('.filter-pill').waitFor();
  assert.ok(await page.locator('.filter-pill').isVisible());
  await terminer(page);
});
