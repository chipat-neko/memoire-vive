import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { ouvrirSite, terminer } from './outils.mjs';
import { jeuDeTest } from './donnees-test.mjs';

let site;
before(async () => { site = await ouvrirSite(); });
after(async () => { await site.fermer(); });

test('le site charge le jeu de test sans erreur', async () => {
  const donnees = jeuDeTest();
  const page = await site.page({ donnees });
  await page.goto(site.url());
  await page.locator('.card').first().waitFor();
  assert.match(await page.textContent('#stats'), new RegExp('^' + donnees.nb_entrees + '\\sentrées'));
  await terminer(page);
});

const CSP = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; manifest-src 'self'; base-uri 'none'; form-action 'none'";

test('modules ES chargés sous le sous-chemin, CSP inchangée', async () => {
  const page = await site.page({ donnees: jeuDeTest() });
  const demandes = [];
  page.on('request', (r) => demandes.push(new URL(r.url()).pathname));
  await page.goto(site.url());
  await page.locator('.card').first().waitFor();
  const racine = new URL(site.base).pathname;
  assert.ok(demandes.includes(racine + 'js/app.js'), demandes.join(' '));
  assert.ok(!demandes.includes(racine + 'app.js'), 'ancien script classique encore demandé');
  assert.equal(await page.getAttribute('script[src="js/app.js"]', 'type'), 'module');
  assert.equal(await page.getAttribute('meta[http-equiv="Content-Security-Policy"]', 'content'), CSP);
  await terminer(page);
});

test('jeu de test : identifiants courts distincts, projets cohérents', () => {
  const donnees = jeuDeTest();
  const courts = new Set(donnees.entrees.map((e) => e.id.slice(0, 12)));
  assert.equal(courts.size, donnees.entrees.length);
  assert.ok(donnees.entrees.every((e) => /^[0-9a-f]{64}$/.test(e.id)));
  assert.equal(donnees.projets.reduce((n, p) => n + p.nb, 0), donnees.entrees.filter((e) => e.projet).length);
});
