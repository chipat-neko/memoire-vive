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

test('jeu de test : identifiants courts distincts, projets cohérents', () => {
  const donnees = jeuDeTest();
  const courts = new Set(donnees.entrees.map((e) => e.id.slice(0, 12)));
  assert.equal(courts.size, donnees.entrees.length);
  assert.ok(donnees.entrees.every((e) => /^[0-9a-f]{64}$/.test(e.id)));
  assert.equal(donnees.projets.reduce((n, p) => n + p.nb, 0), donnees.entrees.filter((e) => e.projet).length);
});
