/* Page d'admin locale : parcours dans le navigateur, contre scripts/admin.py
   lancé sur un dépôt temporaire (banc-admin.mjs). */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { CHROME, pageInstrumentee, terminer, debordement } from './outils.mjs';
import { ouvrirBanc } from './banc-admin.mjs';

let navigateur;
before(async () => { navigateur = await chromium.launch({ executablePath: CHROME, headless: true }); });
after(async () => { await navigateur.close(); });

/* Banc neuf (dépôt, faux dashboard, admin.py) et page d'admin ouverte avec son jeton. */
async function ouvrirAdmin(t) {
  const banc = await ouvrirBanc();
  t.after(() => banc.fermer());
  const page = await pageInstrumentee(navigateur);
  await page.goto(banc.admin.adresse);
  await page.locator('#panneau-projets:not([hidden])').waitFor();
  return { banc, page };
}

/* Clique, puis attend le compte rendu de ce titre exact (pas celui d'avant). */
async function cliquerEtAttendre(page, bouton, titre) {
  await page.click(bouton);
  await page.waitForFunction((attendu) => document.getElementById('compte-rendu-titre').textContent === attendu, titre);
}

/* Accepte la prochaine boîte de dialogue (confirm) et renvoie son message ;
   échoue si aucune ne s'ouvre en 10 s (sinon le test attendrait sans fin). */
function accepterDialogue(page) {
  return new Promise((ok, ko) => {
    const delai = setTimeout(() => ko(new Error('aucune boîte de dialogue en 10 s')), 10000);
    page.once('dialog', async (dialogue) => {
      clearTimeout(delai);
      const message = dialogue.message();
      await dialogue.accept();
      ok(message);
    });
  });
}

async function choisirProjet(page, nom) {
  await page.locator('#liste-projets button', { hasText: nom }).click();
  await page.locator('#titre-projet', { hasText: nom }).waitFor();
}

/* Refus attendu du serveur (422, 409) : Chrome l'écrit dans la console
   (« Failed to load resource »), ce n'est pas une erreur de la page. */
function refusAttendu(page, statut) {
  const restantes = page.erreurs.filter((e) => !e.includes('status of ' + statut));
  assert.equal(restantes.length, page.erreurs.length - 1, 'un refus ' + statut + ' attendu');
  page.erreurs.splice(0, page.erreurs.length, ...restantes);
}

// ------------------------------------------------------------ ouverture

test('ouverture : jeton lu puis retiré de l’adresse, onglets, état git', async (t) => {
  const { page } = await ouvrirAdmin(t);
  assert.equal(await page.evaluate(() => location.hash), '', 'le jeton ne reste pas dans l’adresse');
  assert.equal(await page.title(), 'Réglages — Mémoire Vive');
  assert.equal(await page.isVisible('#onglets'), true);
  assert.equal(await page.isHidden('#status'), true);
  assert.equal(await page.textContent('#etat-modifs'), 'Tout est enregistré.');
  assert.equal(await page.textContent('#etat-git'), 'Branche main · rien en attente de publication.');
  assert.equal(await page.getAttribute('#onglet-projets', 'aria-selected'), 'true');
  assert.ok(await debordement(page) <= 0, 'aucun défilement horizontal à 1280 px');
  await terminer(page);
});

test('sans jeton ou avec un jeton faux : message clair, aucun réglage affiché', async (t) => {
  const { banc, page } = await ouvrirAdmin(t);
  await page.goto(banc.admin.base + 'admin/');
  await page.evaluate(() => sessionStorage.clear());
  await page.reload();
  await page.locator('#status.error').waitFor();
  assert.match(await page.textContent('#status'), /^Jeton absent : ouvrir cette page avec « Gérer Mémoire Vive »/);
  assert.equal(await page.isHidden('#onglets'), true);
  await page.goto(banc.admin.base + 'admin/#jeton=faux');
  await page.reload();
  await page.locator('#status.error', { hasText: 'Accès refusé' }).waitFor();
  assert.equal(await page.isHidden('#panneau-projets'), true);
  // La seule erreur de console attendue : le refus 403 du serveur.
  assert.ok(page.erreurs.length > 0 && page.erreurs.every((e) => e.includes('403')), page.erreurs.join('\n'));
  page.erreurs.length = 0;
  await terminer(page);
});

test('onglets au clavier : flèches, Début, Fin', async (t) => {
  const { page } = await ouvrirAdmin(t);
  await page.focus('#onglet-projets');
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'onglet-familles');
  assert.equal(await page.isVisible('#panneau-familles'), true);
  assert.equal(await page.isHidden('#panneau-projets'), true);
  await page.keyboard.press('End');
  assert.equal(await page.getAttribute('#onglet-recherche', 'aria-selected'), 'true');
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'onglet-projets');
  await page.keyboard.press('ArrowLeft');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'onglet-recherche');
  await terminer(page);
});

test('Enregistrer sans modification : « Rien à enregistrer »', async (t) => {
  const { page } = await ouvrirAdmin(t);
  await cliquerEtAttendre(page, '#bouton-enregistrer', 'Rien à enregistrer');
  assert.equal(await page.textContent('#annonce'), 'Rien à enregistrer : Aucune modification en attente.');
  await terminer(page);
});

// ------------------------------------------------------------ projets

test('projet : renommer et changer de famille, enregistré dans config/projets.json', async (t) => {
  const { banc, page } = await ouvrirAdmin(t);
  await choisirProjet(page, 'Voxelcraft');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'titre-projet');
  await page.fill('#projet-nom', 'Voxelcraft 2');
  await page.selectOption('#projet-famille', 'jeux');
  assert.equal(await page.textContent('#etat-modifs'), 'Modifications non enregistrées : projets et familles.');
  assert.equal(await page.textContent('#titre-projet'), 'Voxelcraft 2');
  assert.equal(await page.textContent('#liste-projets [aria-current="true"] .admin-item-sous'), 'Jeux · 1\xa0entrée publiée');
  await cliquerEtAttendre(page, '#bouton-enregistrer', 'Enregistré');
  const reglages = await banc.lire('config/projets.json');
  assert.deepEqual(reglages.projets.voxelcraft, { nom: 'Voxelcraft 2', famille: 'jeux' });
  assert.equal(reglages._aide, 'Réglages de test.', 'les commentaires sont gardés');
  assert.equal(await page.textContent('#etat-modifs'), 'Tout est enregistré.');
  assert.equal(await page.textContent('#etat-git'), 'Branche main · pas encore publié : config/projets.json.');
  await terminer(page);
});

test('projets : liste par nom, filtre par nom ou famille', async (t) => {
  const { page } = await ouvrirAdmin(t);
  assert.deepEqual(await page.locator('#liste-projets .admin-item-titre').allTextContents(),
    ['Depths', 'Jarvis', 'Rogue lite', 'Voxelcraft']);
  assert.equal(await page.textContent('#compte-projets'), '4\xa0projets');
  await page.fill('#filtre-projets', 'simulations');
  assert.deepEqual(await page.locator('#liste-projets .admin-item-titre').allTextContents(), ['Jarvis']);
  assert.equal(await page.textContent('#compte-projets'), '1 sur 4\xa0projets');
  await page.fill('#filtre-projets', 'DEPTH');
  assert.deepEqual(await page.locator('#liste-projets .admin-item-titre').allTextContents(), ['Depths']);
  await terminer(page);
});

test('projet : fusionner dans un autre, le projet devient alias', async (t) => {
  const { banc, page } = await ouvrirAdmin(t);
  await choisirProjet(page, 'Rogue lite');
  await page.selectOption('#projet-fusion', 'depths');
  const message = accepterDialogue(page);
  await page.click('#bouton-fusionner');
  assert.match(await message, /^Fusionner « Rogue lite » dans « Depths » \?/);
  await page.locator('#titre-projet', { hasText: 'Depths' }).waitFor();
  assert.deepEqual(await page.locator('#liste-projets .admin-item-titre').allTextContents(), ['Depths', 'Jarvis', 'Voxelcraft']);
  assert.equal(await page.inputValue('#projet-alias'), 'rogue-lite');
  await cliquerEtAttendre(page, '#bouton-enregistrer', 'Enregistré');
  assert.deepEqual((await banc.lire('config/projets.json')).projets.depths, { nom: 'Depths', famille: 'jeux', alias: ['rogue-lite'] });
  await terminer(page);
});

test('projet : lien principal parmi ses liens, adresse locale refusée avec explication', async (t) => {
  const { banc, page } = await ouvrirAdmin(t);
  await choisirProjet(page, 'Jarvis');
  assert.deepEqual(await page.locator('#projet-lien option').allTextContents(), [
    'Automatique (premier site des entrées, sinon premier dépôt)',
    'https://exemple.github.io/jarvis/', 'https://github.com/exemple/jarvis', 'Autre adresse…']);
  await page.selectOption('#projet-lien', 'https://github.com/exemple/jarvis');
  await cliquerEtAttendre(page, '#bouton-enregistrer', 'Enregistré');
  assert.equal((await banc.lire('config/projets.json')).projets.jarvis.lien_principal, 'https://github.com/exemple/jarvis');

  await page.selectOption('#projet-lien', 'autre');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'projet-lien-autre');
  await page.fill('#projet-lien-autre', 'http://localhost:8000/');
  await cliquerEtAttendre(page, '#bouton-enregistrer', 'Enregistrement refusé');
  assert.deepEqual(await page.locator('#compte-rendu-message li').allTextContents(), [
    "Projet « jarvis », lien principal : adresse locale : le site public ne pourrait pas l'ouvrir (localhost, adresse privée, nom de machine)."]);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'compte-rendu-titre');
  assert.equal((await banc.lire('config/projets.json')).projets.jarvis.lien_principal, 'https://github.com/exemple/jarvis',
    'rien n’est écrit');
  assert.equal(await page.textContent('#etat-modifs'), 'Modifications non enregistrées : projets et familles.');
  refusAttendu(page, 422);
  await terminer(page);
});

test('enregistrer refusé si le fichier a changé ailleurs depuis l’ouverture de la page', async (t) => {
  const { banc, page } = await ouvrirAdmin(t);
  await choisirProjet(page, 'Depths');
  await page.fill('#projet-nom', 'Depths II');
  await banc.ecrire('config/projets.json', '\n');  // modifié à la main (ou dans un autre onglet) entre-temps
  await cliquerEtAttendre(page, '#bouton-enregistrer', 'Enregistrement refusé');
  assert.match(await page.textContent('#compte-rendu-message'), /^config\/projets\.json a changé depuis l'ouverture de la page/);
  assert.equal((await banc.lire('config/projets.json')).projets.depths.nom, 'Depths', 'rien n’est écrasé');
  assert.equal(await page.textContent('#etat-modifs'), 'Modifications non enregistrées : projets et familles.');
  refusAttendu(page, 409);
  await terminer(page);
});

test('modifications non enregistrées : le navigateur prévient avant de quitter', async (t) => {
  const { page } = await ouvrirAdmin(t);
  await choisirProjet(page, 'Depths');
  await page.click('#projet-description');
  await page.keyboard.type('Rogue-lite en 2D.');
  const dialogue = new Promise((ok) => page.once('dialog', async (d) => { ok(d.type()); await d.dismiss(); }));
  await page.close({ runBeforeUnload: true });
  assert.equal(await dialogue, 'beforeunload');
  await page.context().close();
});

test('rien à enregistrer : on quitte sans alerte', async (t) => {
  const { page } = await ouvrirAdmin(t);
  await choisirProjet(page, 'Depths');
  await page.fill('#projet-description', 'Rogue-lite en 2D.');
  await cliquerEtAttendre(page, '#bouton-enregistrer', 'Enregistré');
  const dialogues = [];
  page.on('dialog', async (d) => { dialogues.push(d.type()); await d.accept(); });
  await page.reload();
  await page.locator('#panneau-projets:not([hidden])').waitFor();
  assert.deepEqual(dialogues, []);
  assert.equal(await page.textContent('#etat-modifs'), 'Tout est enregistré.', 'jeton gardé pour l’onglet');
  await terminer(page);
});

// ------------------------------------------------------------ familles

test('familles : ajouter, renommer, réordonner, couleur', async (t) => {
  const { banc, page } = await ouvrirAdmin(t);
  await page.click('#onglet-familles');
  await page.fill('#nouvelle-famille', 'Outils Claude');
  await page.keyboard.press('Enter');
  assert.equal(await page.inputValue('#famille-nom-3'), 'Outils Claude');
  assert.equal(await page.inputValue('#famille-couleur-3'), '2', 'première couleur libre');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'nouvelle-famille');
  await page.selectOption('#famille-couleur-3', '4');
  assert.equal(await page.getAttribute('#liste-familles li:nth-child(3)', 'data-couleur'), '4');
  await page.fill('#famille-nom-1', 'Jeux & univers');
  await page.click('#liste-familles li:nth-child(2) [data-action="monter"]');
  assert.equal(await page.inputValue('#famille-nom-1'), 'IA & simulations');
  assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), 'Descendre la famille n° 1',
    'au bout de la liste, le focus passe au bouton voisin');
  await cliquerEtAttendre(page, '#bouton-enregistrer', 'Enregistré');
  assert.deepEqual((await banc.lire('config/projets.json')).familles, [
    { id: 'ia', nom: 'IA & simulations', couleur: 3 },
    { id: 'jeux', nom: 'Jeux & univers', couleur: 1 },
    { id: 'outils-claude', nom: 'Outils Claude', couleur: 4 },
  ]);
  await terminer(page);
});

test('familles : supprimer, ses projets passent « Sans famille »', async (t) => {
  const { banc, page } = await ouvrirAdmin(t);
  await page.click('#onglet-familles');
  assert.equal(await page.textContent('#liste-familles li:nth-child(1) .admin-famille-compte'), '1\xa0projet');
  const message = accepterDialogue(page);
  await page.click('#liste-familles li:nth-child(1) [data-action="supprimer"]');
  assert.equal(await message, 'Supprimer la famille « Jeux » ?\n\n1\xa0projet passera « Sans famille ».');
  await cliquerEtAttendre(page, '#bouton-enregistrer', 'Enregistré');
  const reglages = await banc.lire('config/projets.json');
  assert.deepEqual(reglages.familles, [{ id: 'ia', nom: 'IA & simulations', couleur: 3 }]);
  assert.deepEqual(reglages.projets.depths, { nom: 'Depths' });
  await terminer(page);
});
