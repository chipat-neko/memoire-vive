import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { ouvrirSite, terminer, attendreAncre } from './outils.mjs';
import { jeuDeTest, SCHEMA_TEST } from './donnees-test.mjs';

let site;
before(async () => { site = await ouvrirSite(); });
after(async () => { await site.fermer(); });

const PIEGE = '<img src=x onerror=window.__pwned=1>';
const FAMILLE_PIEGEE = 'f"><img src=x onerror=window.__pwned=1>';

/* Données piégées : chaque texte affiché tente une injection. */
function donneesPiegees() {
  const commun = {
    type: '"><img src=x onerror=window.__pwned=1>', tags: ['<b>x</b>'], projet: 'x',
    cree_le: '2026-09-18T00:00:00Z', modifie_le: null, corrige: false,
    lien_principal: { url: 'javascript:window.__pwned=1', genre: 'site' },
  };
  return {
    schema: SCHEMA_TEST, genere_le: '2026-09-18T00:00:00Z', nb_entrees: 2, types: { note: 2 }, ordre_types: ['note'],
    familles: [{ id: FAMILLE_PIEGEE, nom: PIEGE, couleur: '1;background:url(javascript:1)' }],
    synonymes: [[PIEGE, 'x']],
    projets: [{
      id: 'x', nom: PIEGE, famille: FAMILLE_PIEGEE, description: '<script>window.__pwned=1</script>',
      lien_principal: { url: 'javascript:window.__pwned=1', genre: 'site' },
      nb: 2, types: { note: 2 }, premiere: '2026-09-18T00:00:00Z', derniere: '2026-09-18T00:00:00Z',
    }],
    entrees: [
      { ...commun, id: 'abcdef1234567890', titre: PIEGE, resume: '<script>window.__pwned=1</script>',
        contenu: '<svg onload=window.__pwned=1>',
        voisins: [{ id: 'abcdef0000000001', score: '<b>1</b>' }, { id: 'inconnu', score: 0.9 }],
        liens: [{ type: 'en_ligne', valeur: 'javascript:window.__pwned=1' },
          { type: 'en_ligne', valeur: 'data:text/html,<script>1</script>' }, { type: 'local', valeur: '<i>D:\\x</i>' }] },
      { ...commun, id: 'abcdef0000000001', titre: 'Voisine ' + PIEGE, resume: '', contenu: 'x',
        voisins: [{ id: 'abcdef1234567890', score: 0.9 }], liens: [] },
    ],
  };
}

async function sansInjection(page) {
  return page.evaluate(() => window.__pwned !== 1
    && document.querySelectorAll('img, svg:not([aria-hidden]), script:not([src]), b, i').length === 0);
}

test('données piégées (XSS) : aucune balise injectée, aucun lien javascript: ou data:', async () => {
  const page = await site.page({ donnees: donneesPiegees() });
  for (const [ancre, attendu] of [['#/', '.project-card'], ['#/entrees', '#grid .card'], ['#/entrees?vue=liste', '.entry-line'],
    ['#/entree/abcdef123456', '#entry-title'], ['#/entree/abcdef000000', '#h-voir-aussi'], ['#/projet/x', '#titre-vue'],
    ['#/recherche?q=voisine', '#page-view .card']]) {
    await page.goto(site.url(ancre));
    await page.locator(attendu).first().waitFor();
    assert.ok(await sansInjection(page), ancre);
    assert.equal(await page.locator('a[href^="javascript:"], a[href^="data:"]').count(), 0, ancre);
  }
  await page.context().close();
});

for (const [nom, gestion, attendu] of [
  ['404', (r) => r.fulfill({ status: 404, body: 'absent' }), /Aucune donnée publiée/],
  ['page HTML (session expirée)', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<html>connexion</html>' }), /session expirée/],
  ['réseau coupé', (r) => r.abort('failed'), /session a peut-être expiré/],
  ['JSON invalide', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{oups' }), /illisible/],
  ['schéma trop récent', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...jeuDeTest(), schema: SCHEMA_TEST + 1 }) }), /plus récentes que cette version du site : recharger la page/],
]) {
  test(`erreur de chargement (${nom}) : message clair et bouton « Recharger »`, async () => {
    const page = await site.page({ donnees: gestion });
    await page.goto(site.url());
    await page.locator('#status.error').waitFor();
    assert.match(await page.textContent('#status'), attendu);
    assert.equal(await page.getByRole('button', { name: 'Recharger la page' }).count(), 1);
    await page.context().close();
  });
}

test('données mal formées : entrée nulle ou type non textuel, le site s’affiche quand même', async () => {
  const donnees = jeuDeTest();
  donnees.entrees.splice(3, 0, null, 7, ['x']);
  donnees.entrees[0].type = 5;
  const page = await site.page({ donnees });
  for (const [ancre, attendu] of [['#/', '.project-card'], ['#/entrees?tri=projet', '#grid .card'], ['#/entrees', '#grid .card']]) {
    await page.goto(site.url(ancre));
    await page.locator(attendu).first().waitFor();
  }
  assert.match(await page.textContent('#stats'), /^70\sentrées/);
  assert.equal(await page.locator('#grid .type-badge', { hasText: /^5$/ }).count(), 1);
  await terminer(page);
});

test('données mal formées que la préparation ne sait pas lire : message clair, pas de chargement sans fin', async () => {
  const donnees = jeuDeTest();
  donnees.entrees[0].tags = [{ toString: 0 }]; // String() lève une exception
  const page = await site.page({ donnees });
  await page.goto(site.url());
  await page.locator('#status.error').waitFor();
  assert.match(await page.textContent('#status'), /format inattendu/);
  assert.equal(await page.getByRole('button', { name: 'Recharger la page' }).count(), 1);
  await terminer(page);
});

test('frappe dans la recherche après un échec de chargement : ni erreur ni entrée d’historique', async () => {
  const page = await site.page({ donnees: (r) => r.fulfill({ status: 404, body: 'absent' }) });
  await page.goto(site.url());
  await page.locator('#status.error').waitFor();
  const avant = await page.evaluate(() => [location.hash, history.length]);
  await page.locator('#search-input').pressSequentially('jeu', { delay: 40 });
  await page.waitForTimeout(400);
  assert.deepEqual(await page.evaluate(() => [location.hash, history.length]), avant);
  assert.equal(await page.locator('#page-view').isHidden(), true);
  assert.match(await page.textContent('#status'), /Aucune donnée publiée/);
  assert.deepEqual(page.erreurs.filter((e) => !e.includes('status of 404')), []);
  await page.context().close();
});

test('frappe pendant le chargement : la recherche tapée s’affiche une fois les données arrivées', async () => {
  const corps = JSON.stringify(jeuDeTest());
  let servir;
  const pret = new Promise((ok) => { servir = ok; });
  const page = await site.page({
    donnees: async (r) => { await pret; await r.fulfill({ status: 200, contentType: 'application/json', body: corps }); },
  });
  await page.goto(site.url());
  await page.locator('#search-input').pressSequentially('donjon', { delay: 40 });
  await page.waitForTimeout(300); // la recherche différée (120 ms) part avant les données
  assert.equal(await page.textContent('#status'), 'Chargement de la mémoire…');
  servir();
  await attendreAncre(page, '#/recherche?q=donjon');
  await page.locator('#titre-vue', { hasText: 'donjon' }).waitFor();
  assert.equal(await page.inputValue('#search-input'), 'donjon');
  assert.ok(await page.locator('#page-view .card').count() > 0);
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'search-input');
  await terminer(page);
});

test('« coeur » trouve « cœur » (surligné) ; l’apostrophe droite trouve l’apostrophe typographique', async () => {
  const page = await site.page({ donnees: jeuDeTest() });
  await page.goto(site.url('#/recherche?q=coeur'));
  await page.locator('#page-view .card').first().waitFor();
  assert.equal(await page.locator('#page-view .card mark').first().textContent(), 'cœur');
  await page.goto(site.url('#/recherche?q=' + encodeURIComponent("l'atelier")));
  await page.locator('#titre-vue', { hasText: 'atelier' }).waitFor();
  assert.equal(await page.locator('#page-view .card').count(), 1);
  await terminer(page);
});
