import { test } from 'node:test';
import assert from 'node:assert/strict';
import { relatedEntries } from '../../docs/js/vues/resultats.js';

test('« En rapport » : voisins absents des résultats, score cumulé, au plus 6', () => {
  const e = (id, time = 0) => ({ id, _time: time, _neighbours: [] });
  const [a, b, x, y, z] = [e('a'), e('b'), e('x', 1), e('y', 2), e('z', 3)];
  a._neighbours = [{ entry: b, score: 0.9 }, { entry: x, score: 0.8 }, { entry: y, score: 0.85 }];
  b._neighbours = [{ entry: x, score: 0.81 }, { entry: z, score: 0.85 }];
  const resultats = new Set([a, b]);
  assert.deepEqual(relatedEntries([a, b], resultats).map((r) => r.id), ['x', 'z', 'y']);
  const beaucoup = Array.from({ length: 9 }, (_, i) => e('v' + i, i));
  const seul = { ...e('s'), _neighbours: beaucoup.map((v) => ({ entry: v, score: 0.8 })) };
  assert.equal(relatedEntries([seul], new Set([seul])).length, 6);
});
