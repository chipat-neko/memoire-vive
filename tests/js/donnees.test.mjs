import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadData, prepare, mainLink, DataError, NO_PROJECT } from '../../docs/js/donnees.js';
import { search } from '../../docs/js/recherche.js';
import { typeLabel } from '../../docs/js/composants.js';

function reponse(corps, { status = 200, type = 'application/json' } = {}) {
  return async () => new Response(corps, { status, headers: { 'Content-Type': type } });
}

async function erreur(fetcher, schema = 1) {
  await assert.rejects(loadData('data.json', schema, fetcher), DataError);
  try { await loadData('data.json', schema, fetcher); } catch (e) { return e.message; }
  return '';
}

test('loadData : messages clairs pour chaque échec', async () => {
  assert.match(await erreur(async () => { throw new TypeError('réseau'); }), /session a peut-être expiré/);
  assert.match(await erreur(reponse('absent', { status: 404, type: 'text/plain' })), /Aucune donnée publiée/);
  assert.match(await erreur(reponse('panne', { status: 500, type: 'text/plain' })), /^Erreur 500 /);
  assert.match(await erreur(reponse('<html>', { type: 'text/html' })), /session expirée/);
  assert.match(await erreur(reponse('{oups')), /illisible/);
  assert.match(await erreur(reponse('{"schema": 1}')), /format inattendu/);
  assert.match(await erreur(reponse('{"schema": 2, "entrees": []}')), /recharger la page/);
});

test('loadData : renvoie les données valides', async () => {
  const data = await loadData('data.json', 1, reponse('{"schema": 1, "entrees": []}'));
  assert.deepEqual(data, { schema: 1, entrees: [] });
});

test('prepare : champs dérivés, projets et ordre des types', () => {
  const model = prepare({
    ordre_types: ['reference', 'note'],
    projets: [{ id: 'alpha', nom: 'Alpha' }],
    entrees: [
      { id: 'abcdef1234567890', titre: 'Le Cœur', resume: '', contenu: '', type: 'note', tags: ['X'], projet: 'alpha',
        cree_le: '2026-09-18T00:00:00Z', liens: [{ type: 'en_ligne', valeur: 'https://a.fr' }, { type: 'en_ligne', valeur: 'javascript:1' }, { type: 'local', valeur: 'D:/a' }, null] },
      { id: '1234567890abcdef', titre: 'B', type: 'zeta', projet: null, cree_le: 'pas une date' },
    ],
  });
  const [a, b] = model.entries;
  assert.equal(a._short, 'abcdef123456');
  assert.equal(a._projectName, 'Alpha');
  assert.deepEqual([a._online, a._invalid, a._local], [1, 1, 1]);
  assert.equal(b._project, NO_PROJECT);
  assert.equal(b._projectName, 'Sans projet');
  assert.equal(b._time, 0);
  assert.deepEqual(b.tags, []);
  assert.deepEqual(model.typeOrder, ['note', 'zeta']);
  assert.equal(model.projects.get('alpha').nom, 'Alpha');
  assert.deepEqual(search(model.index, 'coeur alpha').hits.map((h) => h.doc), [0]);
});

test('prepare : entrées qui ne sont pas des objets ignorées, noms et types rendus textuels', () => {
  const model = prepare({
    projets: [null, 'x', { id: 'sans-nom' }, { id: 'p', nom: 42 }],
    entrees: [null, 7, ['a'], 'texte',
      { id: 'abcdef1234567890', titre: 'A', type: 5, projet: 'sans-nom', cree_le: '2026-09-18T00:00:00Z' },
      { id: '1234567890abcdef', titre: 'B', type: 'note', projet: 12, cree_le: '2026-09-18T00:00:00Z' }],
  });
  assert.deepEqual(model.entries.map((e) => e.titre), ['A', 'B']);
  assert.equal(model.projects.get('sans-nom').nom, 'sans-nom');
  assert.equal(model.projects.get('p').nom, 'p');
  assert.equal(model.entries[0]._projectName, 'sans-nom');
  assert.equal(model.entries[1]._projectName, '12');
  assert.equal(typeLabel(5), '5');
});

test('lien principal : URL http(s) seulement', () => {
  assert.deepEqual(mainLink({ url: 'https://a.github.io/x/', genre: 'site' }), { url: 'https://a.github.io/x/', genre: 'site' });
  assert.deepEqual(mainLink({ url: 'https://github.com/a/b', genre: 'depot' }), { url: 'https://github.com/a/b', genre: 'depot' });
  assert.deepEqual(mainLink({ url: 'https://a.fr', genre: 'autre' }), { url: 'https://a.fr/', genre: 'site' });
  for (const valeur of [null, 'https://a.fr', { url: 'javascript:alert(1)' }, { url: 'data:text/html,x' }, { url: 42 }]) {
    assert.equal(mainLink(valeur), null, JSON.stringify(valeur));
  }
});

test('familles : ordre, couleur valide, rattachement aux projets et aux entrées', () => {
  const model = prepare({
    familles: [{ id: 'jeux', nom: 'Jeux', couleur: 1 }, { id: 'ia', nom: 'IA', couleur: '3;x' }, { id: 'jeux', nom: 'Doublon', couleur: 2 }, null],
    projets: [{ id: 'depths', nom: 'Depths', famille: 'jeux', lien_principal: { url: 'javascript:1', genre: 'site' } },
      { id: 'jarvis', nom: 'Jarvis', famille: 'inconnue' }],
    entrees: [{ id: 'aaaaaaaaaaaa0000', titre: 'x', type: 'note', projet: 'depths', cree_le: '2026-09-18T00:00:00Z',
      lien_principal: { url: 'https://github.com/a/depths', genre: 'depot' } }],
  });
  assert.deepEqual(Array.from(model.families.values()), [
    { id: 'jeux', nom: 'Jeux', couleur: 1 }, { id: 'ia', nom: 'IA', couleur: null }]);
  assert.equal(model.projects.get('depths')._family.nom, 'Jeux');
  assert.equal(model.projects.get('depths')._mainLink, null);
  assert.equal(model.projects.get('jarvis')._family, null);
  assert.equal(model.entries[0]._family.couleur, 1);
  assert.deepEqual(model.entries[0]._mainLink, { url: 'https://github.com/a/depths', genre: 'depot' });
});

test('voisins : entrées publiées seulement, score numérique fini', () => {
  const model = prepare({
    entrees: [
      { id: 'aaaaaaaaaaaa0000', titre: 'a', type: 'note', voisins: [
        { id: 'bbbbbbbbbbbb0000', score: 0.9 }, { id: 'inconnu', score: 0.9 }, { id: 'bbbbbbbbbbbb0000', score: '1' },
        { id: 'aaaaaaaaaaaa0000', score: 0.99 }, null] },
      { id: 'bbbbbbbbbbbb0000', titre: 'b', type: 'note' },
    ],
  });
  assert.deepEqual(model.entries[0]._neighbours.map((v) => [v.entry.titre, v.score]), [['b', 0.9]]);
  assert.deepEqual(model.entries[1]._neighbours, []);
});

test('index des projets : nom, famille et description', () => {
  const model = prepare({
    familles: [{ id: 'jeux', nom: 'Jeux vidéo', couleur: 1 }],
    projets: [{ id: 'depths', nom: 'Depths', famille: 'jeux', description: 'Donjons procéduraux.' },
      { id: 'jarvis', nom: 'Jarvis', description: 'Assistant vocal.' }],
    entrees: [],
  });
  const noms = (q) => search(model.projectIndex, q).hits.map((h) => model.projectList[h.doc].nom);
  assert.deepEqual(noms('donjon'), ['Depths']);
  assert.deepEqual(noms('video'), ['Depths']);
  assert.deepEqual(noms('jarvis'), ['Jarvis']);
});
