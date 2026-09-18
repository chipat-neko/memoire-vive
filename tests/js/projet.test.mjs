import { test } from 'node:test';
import assert from 'node:assert/strict';
import { projectSections, projectLinks, relatedProjects } from '../../docs/js/vues/projet.js';

const entree = (id, type, projet, heure, extra = {}) => ({
  id, titre: id, type, projet, _time: Date.parse('2026-09-18T00:00:00Z') + heure * 3600000, liens: [], _neighbours: [], ...extra,
});

test('sections : ordre fixe, jalons chronologiques, types inconnus dans « Notes »', () => {
  const entrees = [
    entree('n1', 'note', 'p', 1), entree('j2', 'milestone', 'p', 5), entree('j1', 'milestone', 'p', 2),
    entree('r1', 'architecture', 'p', 3), entree('x1', 'idee', 'p', 4), entree('autre', 'note', 'q', 9),
  ];
  const sections = projectSections(entrees, 'p');
  assert.deepEqual(sections.map((s) => [s.id, s.entries.map((e) => e.id)]), [
    ['references', ['r1']], ['jalons', ['j1', 'j2']], ['notes', ['x1', 'n1']],
  ]);
});

test('liens du projet : principal en tête, dédupliqués, http(s) seulement', () => {
  const membres = [
    entree('a', 'note', 'p', 1, { liens: [{ type: 'en_ligne', valeur: 'https://github.com/x/p' }, { type: 'en_ligne', valeur: 'javascript:1' }] }),
    entree('b', 'note', 'p', 2, { liens: [{ type: 'en_ligne', valeur: 'https://x.github.io/p' }, { type: 'local', valeur: 'D:/p' }] }),
  ];
  const projet = { _mainLink: { url: 'https://x.github.io/p', genre: 'site' } };
  assert.deepEqual(projectLinks(projet, membres), ['https://x.github.io/p', 'https://github.com/x/p']);
});

test('projets proches : les plus présents parmi les voisins, puis le score cumulé', () => {
  const projets = new Map(['p', 'q', 'r', 's'].map((id) => [id, { id, nom: id.toUpperCase() }]));
  const q1 = entree('q1', 'note', 'q', 1);
  const r1 = entree('r1', 'note', 'r', 1);
  const s1 = entree('s1', 'note', 's', 1);
  const p1 = entree('p1', 'note', 'p', 1, { _neighbours: [{ entry: r1, score: 0.95 }, { entry: q1, score: 0.8 }] });
  const p2 = entree('p2', 'note', 'p', 2, { _neighbours: [{ entry: q1, score: 0.81 }, { entry: s1, score: 0.99 }] });
  assert.deepEqual(relatedProjects('p', [p1, p2], projets).map((p) => p.id), ['q', 's', 'r']);
  // Au plus 5 (spec § 4.4), même avec 7 projets voisins distincts.
  const autres = new Map(['p', 'a', 'b', 'c', 'd', 'e', 'f', 'g'].map((id) => [id, { id, nom: id.toUpperCase() }]));
  const voisins = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((id) => ({ entry: entree(id + '1', 'note', id, 1), score: 0.9 }));
  assert.equal(relatedProjects('p', [entree('p3', 'note', 'p', 3, { _neighbours: voisins })], autres).length, 5);
});
