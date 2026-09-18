import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadData, prepare, DataError, NO_PROJECT } from '../../docs/js/donnees.js';

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
  assert.equal(a._title, 'le coeur');
  assert.equal(a._projectName, 'Alpha');
  assert.deepEqual([a._online, a._invalid, a._local], [1, 1, 1]);
  assert.equal(b._project, NO_PROJECT);
  assert.equal(b._projectName, 'Sans projet');
  assert.equal(b._time, 0);
  assert.deepEqual(b.tags, []);
  assert.deepEqual(model.typeOrder, ['note', 'zeta']);
  assert.equal(model.projects.get('alpha').nom, 'Alpha');
});
