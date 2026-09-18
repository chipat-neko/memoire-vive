import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { demarrerServeur } from './serveur.mjs';

let serveur;
before(async () => { serveur = await demarrerServeur(); });
after(async () => { await serveur.arreter(); });

test('le site est servi sous /memoire-vive/', async () => {
  assert.match(serveur.url, /^http:\/\/127\.0\.0\.1:\d+\/memoire-vive\/$/);
  const reponse = await fetch(serveur.url);
  assert.equal(reponse.status, 200);
  assert.match(reponse.headers.get('content-type'), /^text\/html/);
  assert.match(await reponse.text(), /<title>Mémoire Vive<\/title>/);
});

test('types MIME des scripts, styles et données', async () => {
  for (const [fichier, type] of [['theme.js', /^text\/javascript/], ['style.css', /^text\/css/], ['data.json', /^application\/json/], ['favicon.svg', /^image\/svg\+xml/]]) {
    const reponse = await fetch(serveur.url + fichier);
    assert.equal(reponse.status, 200, fichier);
    assert.match(reponse.headers.get('content-type'), type, fichier);
  }
});

test('hors du préfixe, fichier absent ou sortie du dossier : 404', async () => {
  const origine = new URL(serveur.url).origin;
  assert.equal((await fetch(origine + '/index.html')).status, 404);
  assert.equal((await fetch(serveur.url + 'absent.js')).status, 404);
  assert.equal((await fetch(serveur.url + '..%2f..%2fREADME.md')).status, 404);
  assert.equal((await fetch(serveur.url + '%2e%2e/scripts/export.py')).status, 404);
});

test('/memoire-vive sans barre finale : redirection', async () => {
  const reponse = await fetch(serveur.url.slice(0, -1), { redirect: 'manual' });
  assert.equal(reponse.status, 301);
  assert.equal(reponse.headers.get('location'), '/memoire-vive/');
});
