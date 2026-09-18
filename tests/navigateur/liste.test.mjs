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

test('famille ou type inconnu dans l’ancre (lien ancien) : une pastille active le montre et le retire', async () => {
  const page = await site.page({ donnees });
  await page.goto(site.url('#/entrees?famille=jeux-video&type=idee'));
  await page.locator('#empty:not([hidden])').waitFor();
  const actives = async (zone) => (await page.locator(zone + ' .chip[aria-pressed="true"]').allTextContents()).map((t) => t.replace(/\s/g, ' '));
  assert.deepEqual(await actives('#family-chips'), ['jeux-video0']);
  assert.deepEqual(await actives('#type-chips'), ['Idee0']);
  await page.locator('#family-chips .chip[aria-pressed="true"]').click();
  await attendreAncre(page, '#/entrees?type=idee');
  assert.deepEqual(await actives('#family-chips'), ['Toutes les familles0']);
  await page.locator('#type-chips .chip[aria-pressed="true"]').click();
  await page.waitForFunction(() => location.hash === '#/entrees');
  await page.locator('#grid .card').first().waitFor();
  assert.equal(await page.locator('#family-chips .chip', { hasText: 'jeux-video' }).count(), 0);
  await terminer(page);
});

/* Géométrie des lignes de la vue Liste (positions arrondies au pixel). */
function lignes(page) {
  return page.locator('#lines .entry-line').evaluateAll((items) => items.map((li) => {
    const r = (sel) => { const e = li.querySelector(sel); return e ? e.getBoundingClientRect() : null; };
    const ligne = li.getBoundingClientRect();
    const [titre, projet, date] = [r('.entry-link'), r('.entry-line-project'), r('time')];
    return {
      hauteur: Math.round(ligne.height), gaucheTitre: Math.round(titre.left), basTitre: Math.round(titre.bottom),
      gaucheProjet: Math.round(projet.left), hautProjet: Math.round(projet.top), droiteDate: Math.round(date.right),
      icone: Boolean(li.querySelector('.main-link-icon')),
    };
  }));
}
const distincts = (valeurs) => Array.from(new Set(valeurs));

test('vue Liste (bureau) : colonnes alignées et même hauteur, avec ou sans icône du lien principal', async () => {
  const page = await site.page({ donnees });
  await page.goto(site.url('#/entrees?vue=liste'));
  await page.locator('#lines .entry-line').first().waitFor();
  const rangs = await lignes(page);
  assert.ok(rangs.some((l) => l.icone) && rangs.some((l) => !l.icone));
  assert.deepEqual(distincts(rangs.map((l) => l.hauteur)).length, 1, 'hauteurs : ' + distincts(rangs.map((l) => l.hauteur)));
  assert.deepEqual(distincts(rangs.map((l) => l.droiteDate)).length, 1, 'bord droit des dates');
  assert.deepEqual(distincts(rangs.map((l) => l.gaucheTitre)).length, 1, 'début des titres');
  assert.deepEqual(distincts(rangs.map((l) => l.gaucheProjet)).length, 1, 'début des projets');
  await terminer(page);
});

test('vue Liste (mobile) : titre sur la première ligne, projet, date et icône sur la seconde, alignés', async () => {
  const page = await site.page({ donnees, mobile: true });
  await page.goto(site.url('#/entrees?vue=liste'));
  await page.locator('#lines .entry-line').first().waitFor();
  const rangs = await lignes(page);
  assert.ok(rangs.every((l) => l.hautProjet >= l.basTitre - 1), 'projet sous le titre');
  assert.deepEqual(distincts(rangs.map((l) => l.droiteDate)).length, 1, 'bord droit des dates');
  assert.deepEqual(distincts(rangs.map((l) => l.gaucheProjet)).length, 1, 'début des projets');
  await terminer(page);
});
