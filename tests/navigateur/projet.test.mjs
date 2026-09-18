import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { ouvrirSite, terminer, attendreAncre, contraste } from './outils.mjs';
import { jeuDeTest, assembler } from './donnees-test.mjs';

let site;
before(async () => { site = await ouvrirSite(); });
after(async () => { await site.fermer(); });

const donnees = jeuDeTest();

async function projet(id) {
  const page = await site.page({ donnees });
  await page.goto(site.url('#/projet/' + id));
  await page.locator('#page-view:not([hidden]) #titre-vue').waitFor();
  return page;
}

test('page projet : famille, description, liens dédupliqués (principal en tête), dates', async () => {
  const page = await projet('jarvis');
  assert.equal(await page.textContent('#titre-vue'), 'Jarvis');
  assert.equal(await page.textContent('.project-family'), 'Famille : IA & simulations');
  assert.match(await page.textContent('.project-description'), /^Assistant vocal local/);
  const liens = await page.locator('.project-links a').evaluateAll((as) => as.map((a) => [a.getAttribute('aria-label'), a.href, a.target]));
  assert.deepEqual(liens, [
    ['Ouvrir le site : Jarvis (nouvel onglet)', 'https://exemple.github.io/jarvis/', '_blank'],
    ['github.com/exemple/jarvis (nouvel onglet)', 'https://github.com/exemple/jarvis', '_blank'],
  ]);
  assert.match(await page.textContent('.project-dates'), /^16\sentrées · première le .+ · dernière le .+ \(il y a 6\sj\)$/);
  assert.equal(await page.title(), 'Jarvis — Mémoire Vive');
  await terminer(page);
});

test('page projet : sections dans l’ordre, jalons du plus ancien au plus récent', async () => {
  const page = await projet('jarvis');
  const titres = (await page.locator('.project-section > h3').allTextContents()).map((t) => t.replace(/\s/g, ' '));
  assert.deepEqual(titres, ['Architecture & références · 1', 'Décisions · 1', 'Jalons · 2', 'Notes · 11', 'Erreurs · 1', 'Adresses locales']);
  assert.deepEqual(await page.locator('.timeline a').allTextContents(), ['Jarvis — premier réveil vocal', 'Jarvis — réponses hors ligne']);
  assert.equal(await page.locator('#page-view .card .project-tag').count(), 0, 'pas de lien vers le projet lui-même');
  await terminer(page);
});

test('page projet : adresses locales dédupliquées, chacune avec « Copier »', async () => {
  const page = await projet('jarvis');
  const adresses = page.locator('#h-local + .links-list li');
  assert.deepEqual(await adresses.locator('code').allTextContents(), ['D:\\jarvis', 'localhost:8765']);
  assert.equal(await adresses.getByRole('button', { name: 'Copier' }).count(), 2);
  await terminer(page);
});

test('page projet : projets proches d’après les voisins', async () => {
  let page = await projet('depths');
  assert.deepEqual(await page.locator('.related-projects a').allTextContents(), ['Voxelcraft']);
  assert.equal(await page.locator('.related-projects li').getAttribute('data-couleur'), '1');
  await page.context().close();
  page = await projet('jarvis');
  assert.equal(await page.locator('#h-proches').count(), 0, 'voisins tous dans le projet');
  await terminer(page);
});

test('clic sur le projet d’une carte : page du projet, focus sur son titre', async () => {
  const page = await site.page({ donnees });
  await page.goto(site.url('#/entrees'));
  await page.locator('#grid .card').first().waitFor();
  await page.locator('#grid .project-tag').first().click();
  await attendreAncre(page, '#/projet/memoire-vive');
  await page.locator('#titre-vue').waitFor();
  assert.equal(await page.textContent('#titre-vue'), 'Mémoire Vive');
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'titre-vue');
  await terminer(page);
});

test('projet inconnu : message « Projet introuvable », titre en serif comme « Entrée introuvable »', async () => {
  const page = await projet('inconnu');
  assert.equal(await page.textContent('#titre-vue'), 'Projet introuvable');
  const style = (selecteur) => page.locator(selecteur).evaluate((h) => {
    const s = getComputedStyle(h);
    return [s.fontFamily, s.fontWeight, s.fontSize];
  });
  const projetIntrouvable = await style('#titre-vue');
  await page.goto(site.url('#/entree/deadbeef0000'));
  await page.locator('#entry-title').waitFor();
  assert.deepEqual(projetIntrouvable, await style('#entry-title'));
  assert.match(projetIntrouvable[0], /Iowan Old Style/);
  await terminer(page);
});

test('fiche ouverte depuis le projet : ordre de la page, « Retour au projet », focus rendu', async () => {
  const page = await projet('jarvis');
  const lien = page.locator('.timeline a', { hasText: 'Jarvis — premier réveil vocal' });
  const href = await lien.getAttribute('href');
  await lien.click();
  await page.locator('#entry-title').waitFor();
  assert.equal(await page.getAttribute('.pager a[rel="prev"]', 'title'), 'Jarvis — pas de service en ligne');
  assert.equal(await page.getAttribute('.pager a[rel="next"]', 'title'), 'Jarvis — réponses hors ligne');
  await page.getByRole('link', { name: '← Retour au projet' }).click();
  await page.locator('#titre-vue').waitFor();
  assert.ok(page.url().endsWith('#/projet/jarvis'), page.url());
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('href')), href);
  await terminer(page);
});

test('page projet : famille lisible (contraste ≥ 4,5) avec ou sans famille, dans les deux thèmes', async () => {
  for (const id of ['jarvis', 'atelier']) {
    const page = await projet(id);
    for (const theme of ['light', 'dark']) {
      const [texte, fond] = await page.evaluate((t) => {
        document.documentElement.setAttribute('data-theme', t);
        return [getComputedStyle(document.querySelector('.project-family')).color, getComputedStyle(document.body).backgroundColor];
      }, theme);
      assert.ok(contraste(texte, fond) >= 4.5, `${id}, ${theme} : ${contraste(texte, fond).toFixed(2)}`);
    }
    await terminer(page);
  }
});

test('page projet : jalons datés au jour, date relative en infobulle', async () => {
  const page = await projet('jarvis');
  const date = page.locator('.timeline time').first();
  assert.equal(await date.textContent(), '8 sept. 2026');
  // Durée écoulée (12 jours), pas « la semaine dernière » (semaine du calendrier).
  assert.equal((await date.getAttribute('title')).replace(/\s/g, ' '), 'il y a 1 sem.');
  await terminer(page);
});

test('dates relatives au calendrier : une entrée de l’avant-veille au soir n’est pas « hier »', async () => {
  const mini = assembler([{
    id: 'aaaaaaaaaaaa2222', titre: 'Soirée de l’avant-veille', resume: '', contenu: 'x', type: 'note', tags: [], projet: 'jarvis',
    cree_le: '2026-09-17T17:18:00Z', modifie_le: null, liens: [], lien_principal: null, corrige: false, voisins: [],
  }]);
  // 19 septembre, 14 h à Paris ; l'entrée date du 17 à 19 h 18 (43 h avant).
  const page = await site.page({ donnees: mini, horloge: '2026-09-19T12:00:00Z' });
  await page.goto(site.url('#/projet/jarvis'));
  await page.locator('#titre-vue').waitFor();
  assert.match((await page.textContent('.project-dates')).replace(/\s/g, ' '), /dernière le 17 sept\. 2026 \(avant-hier\)$/);
  await page.goto(site.url('#/'));
  await page.locator('.project-card').first().waitFor();
  assert.equal((await page.textContent('.project-card .meta-line time')).replace(/\s/g, ' '), 'avant-hier');
  await terminer(page);
});
