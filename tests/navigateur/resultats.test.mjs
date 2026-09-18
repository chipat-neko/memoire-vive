import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { ouvrirSite, terminer, attendreAncre } from './outils.mjs';
import { jeuDeTest, entreeTitree, assembler, identifiant, MAINTENANT_TEST } from './donnees-test.mjs';

let site;
before(async () => { site = await ouvrirSite(); });
after(async () => { await site.fermer(); });

const donnees = jeuDeTest();

async function recherche(q, attendu = '#page-view .card') {
  const page = await site.page({ donnees });
  await page.goto(site.url('#/recherche?q=' + encodeURIComponent(q)));
  await page.locator(attendu).first().waitFor();
  return page;
}

const titres = (page) => page.locator('#h-res-entrees ~ .grid .card h4').allTextContents();

test('résultats : projets et entrées triées par score, surlignage, URL et champ de recherche', async () => {
  const page = await recherche('donjon');
  assert.equal(await page.textContent('#titre-vue'), 'Recherche : « donjon »');
  assert.equal((await page.textContent('#results-count')).replace(/\s/g, ' '), '1 projet · 2 entrées');
  // Annonce par la région persistante hors de #page-view (une région live
  // recréée à chaque frappe ne serait pas lue) ; le compteur visible n'en est pas une.
  assert.equal((await page.textContent('#annonce')).replace(/\s/g, ' '), '1 projet · 2 entrées');
  assert.equal(await page.getAttribute('#results-count', 'aria-live'), null);
  assert.deepEqual(await page.locator('#h-res-projets ~ .project-grid h4').allTextContents(), ['Depths']);
  assert.deepEqual(await titres(page), ['Depths — génération de donjon', 'Depths — idées de monstres']);
  assert.equal(await page.locator('#h-res-entrees ~ .grid .card h4 mark').first().textContent(), 'donjon');
  assert.equal(await page.locator('.project-card mark').first().textContent(), 'donjons');
  assert.equal(await page.inputValue('#search-input'), 'donjon');
  await terminer(page);
});

test('recherche tolérante : fautes, pluriels, synonymes, expression, exclusion, préfixe', async () => {
  const page = await recherche('jarvsi');
  assert.ok((await titres(page)).includes('Jarvis — architecture'), 'faute de frappe');
  const cas = [
    ['reseau', (t) => t.includes('Depths — idées de monstres') && t.includes('Voxelcraft — un jeu de cubes')],
    ['llm', (t) => t.includes('Jarvis — architecture')],
    ['"tour de garde"', (t) => t.length === 1 && t[0] === 'Tour de garde et contrôle des accès'],
    ['jarvis -vocal', (t) => t.length > 0 && !t.includes('Jarvis — architecture') && !t.includes('Jarvis — premier réveil vocal')],
    ['archi', (t) => t.includes('Jarvis — architecture')],
  ];
  for (const [q, attendu] of cas) {
    await page.goto(site.url('#/recherche?q=' + encodeURIComponent(q)));
    await page.locator('#titre-vue', { hasText: q }).waitFor();
    const trouves = await titres(page);
    assert.ok(attendu(trouves), q + ' : ' + trouves.join(' | '));
  }
  await terminer(page);
});

test('« En rapport » : voisins des meilleurs résultats, absents des résultats', async () => {
  const page = await recherche('donjon');
  const lignes = page.locator('#h-res-rapport + .related-entries li');
  assert.equal(await lignes.count(), 1);
  assert.equal(await lignes.locator('a').first().textContent(), 'Voxelcraft — un jeu de cubes');
  assert.equal(await lignes.locator('.type-badge').textContent(), 'Note');
  assert.equal(await lignes.locator('.related-project').textContent(), 'Voxelcraft');
  await terminer(page);
});

test('projets trouvés par leur famille : le nom de la famille est écrit sur la carte', async () => {
  const page = await recherche('outils');
  const familles = await page.locator('#h-res-projets ~ .project-grid .project-card-family').allTextContents();
  assert.equal(familles.length, 3, familles.join(' | '));
  assert.ok(familles.every((f) => f === 'Outils Claude'), familles.join(' | '));
  await terminer(page);
});

test('aucun résultat, recherche vide : messages', async () => {
  const page = await recherche('zzzzzz', '#titre-vue');
  assert.match(await page.textContent('#page-view .empty'), /Aucun résultat pour « zzzzzz »/);
  assert.equal(await page.textContent('#annonce'), 'Aucun résultat pour « zzzzzz ».');
  assert.equal(await page.locator('#page-view .empty').getByRole('link', { name: 'Voir toutes les entrées' }).count(), 1);
  await page.goto(site.url('#/recherche'));
  await page.locator('.results-help').waitFor();
  assert.equal(await page.textContent('#titre-vue'), 'Recherche');
  await terminer(page);
});

test('fiche ouverte depuis les résultats : ordre des résultats, retour et focus', async () => {
  const page = await recherche('donjon');
  const lien = page.getByRole('link', { name: 'Depths — génération de donjon', exact: true });
  const href = await lien.getAttribute('href');
  await lien.click();
  await page.locator('#entry-title').waitFor();
  assert.equal(await page.locator('.pager a[rel="prev"]').count(), 0);
  assert.equal(await page.getAttribute('.pager a[rel="next"]', 'title'), 'Depths — idées de monstres');
  await page.getByRole('link', { name: '← Retour aux résultats' }).click();
  await attendreAncre(page, '#/recherche?q=donjon');
  await page.locator('#titre-vue').waitFor();
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('href')), href);
  await terminer(page);
});

test('frappe : les résultats suivent, le focus reste dans le champ', async () => {
  const page = await site.page({ donnees });
  await page.goto(site.url('#/entrees'));
  await page.locator('#grid .card').first().waitFor();
  await page.locator('#search-input').pressSequentially('memoire', { delay: 40 });
  await attendreAncre(page, 'q=memoire');
  await page.locator('#titre-vue', { hasText: 'memoire' }).waitFor();
  assert.ok((await titres(page)).length > 0);
  assert.ok(await page.locator('#h-res-entrees ~ .grid mark').count() > 0);
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'search-input');
  // Quitter la recherche vide le champ : il ne suggère pas un filtre absent.
  // Attente sur un repère propre à l'accueil (pas « .project-card » : le jeu
  // de test a un projet « Mémoire Vive », donc la page de résultats de
  // « memoire » a déjà sa propre carte de projet avant le clic — un sélecteur
  // ambigu se satisferait de cet élément non remplacé, avant même que le
  // gestionnaire hashchange (asynchrone) n'ait vidé le champ).
  await page.click('#nav-home');
  await page.locator('#titre-vue', { hasText: 'Projets' }).waitFor();
  assert.equal(await page.inputValue('#search-input'), '');
  await terminer(page);
});

test('frappe depuis une fiche : le focus reste dans le champ, aucune touche perdue', async () => {
  const page = await site.page({ donnees });
  const archi = entreeTitree(donnees, 'Jarvis — architecture');
  await page.goto(site.url('#/entree/' + archi.id.slice(0, 12)));
  await page.locator('#entry-title').waitFor();
  await page.keyboard.press('/');
  await page.keyboard.type('jarvis', { delay: 40 });
  await attendreAncre(page, 'q=jarvis');
  await page.locator('#titre-vue', { hasText: 'jarvis' }).waitFor();
  await page.waitForTimeout(300);
  // Première route de recherche après la fiche : pas un « retour », le lien
  // de la fiche dans les résultats ne prend pas le focus.
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'search-input');
  await page.keyboard.type(' archi', { delay: 40 });
  await attendreAncre(page, 'q=jarvis+archi');
  await page.locator('#titre-vue', { hasText: 'jarvis archi' }).waitFor();
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'search-input');
  assert.equal(await page.inputValue('#search-input'), 'jarvis archi');
  await terminer(page);
});

test('résultats : 6 projets d’abord, puis « Afficher les N projets » (focus sur le premier ajouté)', async () => {
  const projets = {};
  const entrees = [];
  for (let i = 0; i < 9; i++) {
    projets['monde-' + i] = { nom: 'Monde ' + i, famille: 'jeux', description: null };
    entrees.push({
      id: identifiant(900 + i), titre: 'Carnet ' + i, resume: '', contenu: 'x', type: 'note', tags: [], projet: 'monde-' + i,
      cree_le: new Date(Date.parse(MAINTENANT_TEST) - (i + 1) * 3600000).toISOString(), modifie_le: null, liens: [],
      lien_principal: null, corrige: false, voisins: [],
    });
  }
  const page = await site.page({ donnees: assembler(entrees, { projets }) });
  await page.goto(site.url('#/recherche?q=jeu'));
  await page.locator('#h-res-projets').waitFor();
  const cartes = page.locator('#h-res-projets ~ .project-grid .project-card');
  assert.equal(await cartes.count(), 6);
  assert.match((await page.textContent('#results-count')).replace(/\s/g, ' '), /^9 projets/);
  const bouton = page.getByRole('button', { name: 'Afficher les 9 projets' });
  await bouton.click();
  assert.equal(await cartes.count(), 9);
  assert.equal(await bouton.count(), 0);
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('href')),
    await cartes.nth(6).locator('a').first().getAttribute('href'));
  await terminer(page);
});
