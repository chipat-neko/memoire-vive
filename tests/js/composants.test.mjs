import { test } from 'node:test';
import assert from 'node:assert/strict';
import { relativeDate, lastVisit, isNew, VISIT_KEY } from '../../docs/js/composants.js';

const MAINTENANT = Date.parse('2026-09-20T12:00:00Z');
const avant = (secondes) => new Date(MAINTENANT - secondes * 1000).toISOString();

test('dates relatives en français', () => {
  const cas = [
    [30, 'à l’instant'],
    [-120, 'à l’instant'],
    [12 * 60, 'il y a 12 min'],
    [5 * 3600, 'il y a 5 h'],
    [30 * 3600, 'hier'],
    [3 * 86400, 'il y a 3 j'],
    [15 * 86400, 'il y a 2 sem.'],
    [95 * 86400, 'il y a 3 mois'],
    [800 * 86400, 'il y a 2 ans'],
  ];
  // Espaces normalisés : selon la version d'ICU, l'espace avant « min » ou « h » est insécable.
  for (const [secondes, attendu] of cas) {
    assert.equal(relativeDate(avant(secondes), MAINTENANT).replace(/\s/g, ' '), attendu, String(secondes));
  }
  assert.equal(relativeDate('pas une date', MAINTENANT), '');
});

function stockage(initial = {}) {
  const valeurs = new Map(Object.entries(initial));
  return { getItem: (k) => (valeurs.has(k) ? valeurs.get(k) : null), setItem: (k, v) => valeurs.set(k, String(v)), valeurs };
}

test('dernière visite : lue puis remplacée ; première visite : null', () => {
  const s = stockage();
  assert.equal(lastVisit(() => s, '2026-09-18T10:00:00Z'), null);
  assert.equal(s.valeurs.get(VISIT_KEY), '2026-09-18T10:00:00Z');
  assert.equal(lastVisit(() => s, '2026-09-19T10:00:00Z'), Date.parse('2026-09-18T10:00:00Z'));
  assert.equal(s.valeurs.get(VISIT_KEY), '2026-09-19T10:00:00Z');
  assert.equal(lastVisit(() => stockage({ [VISIT_KEY]: 'n’importe quoi' }), 'x'), null);
});

test('dernière visite : stockage indisponible, aucune exception', () => {
  assert.equal(lastVisit(() => { throw new Error('SecurityError'); }, 'x'), null);
  const plein = { getItem: () => '2026-09-18T10:00:00Z', setItem: () => { throw new Error('QuotaExceededError'); } };
  assert.equal(lastVisit(() => plein, 'x'), null);
});

test('« nouveau » : seulement après une visite connue', () => {
  const entree = { _time: Date.parse('2026-09-19T12:00:00Z') };
  assert.equal(isNew(entree, null), false);
  assert.equal(isNew(entree, Date.parse('2026-09-19T00:00:00Z')), true);
  assert.equal(isNew(entree, Date.parse('2026-09-20T00:00:00Z')), false);
});
