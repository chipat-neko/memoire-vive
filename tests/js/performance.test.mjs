import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepare } from '../../docs/js/donnees.js';
import { search } from '../../docs/js/recherche.js';
import { jeuVolumineux } from '../navigateur/donnees-test.mjs';

test('recherche : 3 000 entrées, moins de 50 ms par frappe', () => {
  const debut = performance.now();
  const model = prepare(jeuVolumineux(3000));
  const construction = performance.now() - debut;
  assert.ok(construction < 3000, `préparation et index : ${construction.toFixed(0)} ms`);
  // Échauffement non mesuré (moteur JavaScript encore froid), avec d'autres
  // mots que la requête mesurée : le cache de l'index ne lui sert pas.
  const echauffement = 'developpemnt serveurs "mise en ligne" -brouillon proj';
  for (let i = 1; i <= echauffement.length; i++) search(model.index, echauffement.slice(0, i));
  const requete = 'architecure reseaux "tour de" -erreur donj';
  let pire = 0;
  for (let i = 1; i <= requete.length; i++) {
    const t0 = performance.now();
    search(model.index, requete.slice(0, i));
    pire = Math.max(pire, performance.now() - t0);
  }
  assert.ok(pire < 50, `frappe la plus lente : ${pire.toFixed(1)} ms`);
});
