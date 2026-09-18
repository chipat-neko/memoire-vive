import { test } from 'node:test';
import assert from 'node:assert/strict';
import { relativeDate, lastVisit, isNew, VISIT_KEY } from '../../docs/js/composants.js';

// Midi, heure locale : les jours comptés au calendrier ne dépendent pas du fuseau.
const MAINTENANT = new Date(2026, 8, 20, 12).getTime();
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

test('dates relatives : jours comptés au calendrier (« hier » = la veille)', () => {
  // Heures locales : le test vaut dans tout fuseau horaire.
  const local = (jour, heure, minute = 0) => new Date(2026, 8, jour, heure, minute).getTime();
  const maintenant = local(19, 10);
  const cas = [
    [local(18, 9), 'hier'],               // 25 h, la veille
    [local(17, 23), 'avant-hier'],        // 35 h, deux jours avant
    [local(17, 19, 18), 'avant-hier'],
    [local(16, 15), 'il y a 3 j'],        // 67 h
    [local(18, 11), 'il y a 23 h'],       // moins de 24 h : en heures
    [local(12, 23), 'il y a 1 sem.'],     // 7 jours au calendrier
    [local(5, 12), 'il y a 2 sem.'],
  ];
  for (const [moment, attendu] of cas) {
    assert.equal(relativeDate(moment, maintenant).replace(/\s/g, ' '), attendu, new Date(moment).toString());
  }
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
