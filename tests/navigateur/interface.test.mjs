import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { ouvrirSite, terminer, attendreAncre, debordement, contraste } from './outils.mjs';
import { jeuDeTest, entreeTitree } from './donnees-test.mjs';

let site;
before(async () => { site = await ouvrirSite(); });
after(async () => { await site.fermer(); });

const donnees = jeuDeTest();

async function ouvrir(ancre = '#/entrees', options = {}) {
  const page = await site.page({ donnees, ...options });
  await page.goto(site.url(ancre));
  await page.locator('#grid .card').first().waitFor();
  return page;
}

test('thème sombre : appliqué, fond sombre, mémorisé au rechargement', async () => {
  const page = await ouvrir();
  await page.click('#theme-toggle'); // clair
  await page.click('#theme-toggle'); // sombre
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark');
  assert.equal(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(30, 29, 25)');
  await page.reload();
  await page.locator('.card').first().waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark');
  await terminer(page);
});

test('touche / : focus sur la recherche', async () => {
  const page = await ouvrir();
  await page.keyboard.press('/');
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'search-input');
  await terminer(page);
});

test('lien d’évitement : filtres conservés', async () => {
  const page = await ouvrir('#/recherche?q=jarvis');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(150);
  assert.ok(page.url().includes('q=jarvis'), page.url());
  assert.equal(await page.inputValue('#search-input'), 'jarvis');
  await terminer(page);
});

test('focus conservé sur la pastille après un filtre ; clic sur un tag : focus sur le compteur', async () => {
  const page = await ouvrir('#/entrees');
  await page.locator('#type-chips .chip').nth(1).focus();
  await page.keyboard.press('Enter');
  await attendreAncre(page, 'type=');
  assert.match(await page.evaluate(() => document.activeElement?.getAttribute('data-focus-key')), /^type:/);
  await page.locator('#grid .tag').first().click();
  await attendreAncre(page, 'tag=');
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'result-count');
  await terminer(page);
});

test('contraste de la pastille active ≥ 4,5 (thèmes clair et sombre)', async () => {
  const page = await ouvrir();
  await page.getByRole('button', { name: /^Jalon/ }).first().click();
  const mesure = () => page.evaluate(() => {
    const s = getComputedStyle(document.querySelector('.chip[aria-pressed="true"]'));
    return [s.color, s.backgroundColor];
  });
  for (const theme of ['light', 'dark']) {
    await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
    const [texte, fond] = await mesure();
    assert.ok(contraste(texte, fond) >= 4.5, `${theme} : ${contraste(texte, fond).toFixed(2)}`);
  }
  await terminer(page);
});

test('mobile : pas de défilement horizontal (liste, fiche, vue par projet)', async () => {
  const archi = entreeTitree(donnees, 'Jarvis — architecture');
  const page = await ouvrir('#/entrees', { mobile: true });
  assert.ok(await debordement(page) <= 0, 'liste');
  await page.goto(site.url('#/entree/' + archi.id.slice(0, 12)));
  await page.locator('#entry-title').waitFor();
  assert.ok(await debordement(page) <= 0, 'fiche');
  await page.goto(site.url('#/entrees?vue=projets'));
  await page.locator('.group').first().waitFor();
  assert.ok(await debordement(page) <= 0, 'vue par projet');
  await terminer(page);
});

test('couleurs de famille : data-couleur choisit la couleur, dans les deux thèmes', async () => {
  const page = await ouvrir();
  const couleur = (theme) => page.evaluate((t) => {
    document.documentElement.setAttribute('data-theme', t);
    const essai = document.createElement('span');
    essai.setAttribute('data-couleur', '3');
    document.body.append(essai);
    const valeur = getComputedStyle(essai).getPropertyValue('--famille').trim();
    const neutre = getComputedStyle(document.body).getPropertyValue('--famille').trim();
    essai.remove();
    return [valeur, neutre];
  }, theme);
  assert.deepEqual(await couleur('light'), ['#27724F', '#CFC8B6']);
  assert.deepEqual(await couleur('dark'), ['#7FC9A5', '#544F41']);
  await terminer(page);
});
