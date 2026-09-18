import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { ouvrirSite, terminer, attendreAncre } from './outils.mjs';
import { jeuVolumineux } from './donnees-test.mjs';

let site;
before(async () => { site = await ouvrirSite(); });
after(async () => { await site.fermer(); });

test('3 000 entrées : chaque frappe (recherche et affichage) en moins de 50 ms', async () => {
  const page = await site.page({ donnees: jeuVolumineux(3000), horloge: false });
  await page.goto(site.url('#/entrees'));
  await page.locator('#grid .card').first().waitFor();
  const requete = 'architecure reseaux donj';
  // 150 ms entre deux touches : chaque frappe déclenche sa recherche (délai de 120 ms).
  await page.locator('#search-input').pressSequentially(requete, { delay: 150 });
  await attendreAncre(page, 'q=architecure+reseaux+donj');
  await page.waitForTimeout(200);
  const durees = await page.evaluate(() => performance.getEntriesByName('memoire-vive:recherche').map((m) => m.duration));
  assert.ok(durees.length >= requete.replace(/ /g, '').length - 2, `${durees.length} mesures`);
  const pire = Math.max(...durees);
  assert.ok(pire < 50, `frappe la plus lente : ${pire.toFixed(1)} ms`);
  await terminer(page);
});
