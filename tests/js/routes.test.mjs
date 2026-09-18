import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseHash, entriesHash, searchHash, projectHash, entryHash, defaultFilters, filtersFromParams,
} from '../../docs/js/routes.js';

test('accueil : ancre vide, « # » ou « #/ »', () => {
  for (const hash of ['', '#', '#/']) assert.deepEqual(parseHash(hash), { view: 'home' });
});

test('toutes les entrées : filtres lus et validés', () => {
  assert.deepEqual(parseHash('#/entrees'), { view: 'entries', filters: defaultFilters() });
  assert.deepEqual(parseHash('#/entrees?type=note&projet=jarvis&famille=ia&tag=bug&tri=ancien&vue=projets').filters,
    { type: 'note', projet: 'jarvis', famille: 'ia', tag: 'bug', tri: 'ancien', vue: 'projets' });
  assert.deepEqual(parseHash('#/entrees?tri=pertinence&vue=mosaique').filters, defaultFilters());
});

test('recherche, projet, fiche', () => {
  assert.deepEqual(parseHash('#/recherche?q=tour+de%20contr%C3%B4le'), { view: 'search', q: 'tour de contrôle' });
  assert.deepEqual(parseHash('#/recherche'), { view: 'search', q: '' });
  assert.deepEqual(parseHash('#/projet/memoire-vive'), { view: 'project', id: 'memoire-vive' });
  assert.deepEqual(parseHash('#/projet/a%20b'), { view: 'project', id: 'a b' });
  assert.deepEqual(parseHash('#/entree/ABCDEF123456'), { view: 'entry', id: 'abcdef123456' });
});

test('anciennes ancres : redirection vers leur équivalent', () => {
  assert.deepEqual(parseHash('#/?q=jarvis&type=milestone'), { view: 'redirect', hash: '#/recherche?q=jarvis' });
  assert.deepEqual(parseHash('#/?type=milestone&tri=ancien&vue=projets'),
    { view: 'redirect', hash: '#/entrees?type=milestone&tri=ancien&vue=projets' });
  assert.deepEqual(parseHash('#/?q=%20%20&tri=pertinence'), { view: 'redirect', hash: '#/entrees' });
  assert.deepEqual(parseHash('#?projet=jarvis'), { view: 'redirect', hash: '#/entrees?projet=jarvis' });
});

test('ancres inconnues ou mal formées : retour à l’accueil', () => {
  for (const hash of ['#/inconnu', '#/entree/xyz', '#/projet/%E0%A4%A', '#/projet/']) {
    assert.deepEqual(parseHash(hash), { view: 'redirect', hash: '#/' }, hash);
  }
});

test('construction des ancres : aller-retour', () => {
  const filters = { ...defaultFilters(), type: 'note', famille: 'ia', tri: 'projet' };
  assert.equal(entriesHash(filters), '#/entrees?type=note&famille=ia&tri=projet');
  assert.deepEqual(parseHash(entriesHash(filters)).filters, filters);
  assert.equal(entriesHash(defaultFilters()), '#/entrees');
  assert.equal(searchHash('l’atelier & co'), '#/recherche?q=l%E2%80%99atelier+%26+co');
  assert.equal(parseHash(searchHash('l’atelier & co')).q, 'l’atelier & co');
  assert.equal(searchHash(''), '#/recherche');
  assert.equal(projectHash('a/b'), '#/projet/a%2Fb');
  assert.equal(parseHash(projectHash('a/b')).id, 'a/b');
  assert.equal(entryHash({ _short: 'abcdef123456' }), '#/entree/abcdef123456');
  assert.deepEqual(filtersFromParams(new URLSearchParams('vue=grille')), defaultFilters());
});
