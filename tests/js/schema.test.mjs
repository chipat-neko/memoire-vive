import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SUPPORTED_SCHEMA, loadData, DataError } from '../../docs/js/donnees.js';

const lire = (chemin) => readFileSync(new URL(chemin, import.meta.url), 'utf8');

test('schéma 2 : l’export, le site et data.json avancent ensemble', () => {
  const version = Number(lire('../../scripts/export.py').match(/^SCHEMA_VERSION = (\d+)$/m)[1]);
  assert.equal(SUPPORTED_SCHEMA, 2);
  assert.equal(version, SUPPORTED_SCHEMA, 'SCHEMA_VERSION de scripts/export.py');
  assert.equal(JSON.parse(lire('../../docs/data.json')).schema, SUPPORTED_SCHEMA, 'docs/data.json');
});

test('le site accepte les schémas 1 et 2, refuse le 3', async () => {
  const servir = (schema) => async () => new Response(JSON.stringify({ schema, entrees: [] }),
    { headers: { 'Content-Type': 'application/json' } });
  assert.equal((await loadData('data.json', undefined, servir(1))).schema, 1);
  assert.equal((await loadData('data.json', undefined, servir(2))).schema, 2);
  await assert.rejects(loadData('data.json', undefined, servir(3)), (e) => e instanceof DataError && /recharger la page/.test(e.message));
});
