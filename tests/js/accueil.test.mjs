import { test } from 'node:test';
import assert from 'node:assert/strict';
import { homeGroups } from '../../docs/js/vues/accueil.js';

test('catalogue : familles dans l’ordre, « Sans famille » à la fin, activité récente d’abord', () => {
  const familles = new Map([['jeux', { id: 'jeux', nom: 'Jeux', couleur: 1 }], ['vide', { id: 'vide', nom: 'Vide', couleur: 2 }],
    ['ia', { id: 'ia', nom: 'IA', couleur: 3 }]]);
  const projet = (id, famille, last, count = 1) => ({ id, nom: id, _family: familles.get(famille) || null, _last: last, _count: count });
  const projets = new Map([
    ['a', projet('a', 'ia', 5)], ['b', projet('b', 'jeux', 1)], ['c', projet('c', 'jeux', 9)],
    ['d', projet('d', null, 3)], ['e', projet('e', 'ia', 7, 0)],
  ].map(([k, p]) => [k, p]));
  const groupes = homeGroups(projets, familles);
  assert.deepEqual(groupes.map((g) => [g.family ? g.family.id : null, g.projects.map((p) => p.id)]),
    [['jeux', ['c', 'b']], ['ia', ['a']], [null, ['d']]]);
});
