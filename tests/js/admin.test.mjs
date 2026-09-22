import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../../admin/modele.js';

/* État minimal au format de GET /api/etat (scripts/admin.py). */
function etat() {
  return {
    fichiers: {
      projets: {
        _aide: 'Mode d’emploi.',
        version: 2,
        familles: [{ id: 'jeux', nom: 'Jeux', couleur: 1 }, { id: 'ia', nom: 'IA', couleur: 3 }],
        projets: { depths: { nom: 'Depths', famille: 'jeux' }, jarvis: { famille: 'ia' } },
        tags_generiques: [],
        tags_exclus: [],
      },
      entrees: { _aide: 'Corrections.' },
      recherche: { synonymes: [['ia', 'intelligence artificielle'], ['jeu', 'game']] },
    },
    donnees: {
      projets: [
        { id: 'jarvis', nom: 'Jarvis', description: 'Assistant vocal.', nb: 2,
          lien_principal: { url: 'https://exemple.github.io/jarvis/', genre: 'site' } },
        { id: 'depths', nom: 'Depths', description: null, nb: 1, lien_principal: null },
        { id: 'rogue-lite', nom: 'Rogue lite', description: null, nb: 1, lien_principal: null },
      ],
      entrees: [
        { id: 'a'.repeat(64), titre: 'Jarvis — architecture', resume: 'Pipeline vocal.', type: 'architecture',
          projet: 'jarvis', liens: [{ type: 'en_ligne', valeur: 'https://github.com/exemple/jarvis' },
            { type: 'en_ligne', valeur: 'https://exemple.github.io/jarvis/' }, { type: 'local', valeur: 'D:\\jarvis' }] },
        { id: 'b'.repeat(64), titre: 'Titre corrigé', resume: 'Le mot de réveil.', type: 'milestone',
          projet: 'jarvis', liens: [], corrige: true },
        { id: 'c'.repeat(64), titre: 'Depths — donjon', resume: 'Salles.', type: 'note', projet: 'depths', liens: [] },
      ],
    },
    originaux: {
      aaaaaaaaaaaa: { titre: 'Jarvis — architecture', resume: 'Pipeline vocal.' },
      bbbbbbbbbbbb: { titre: 'Jarvis — premier réveil', resume: 'Le mot de réveil.' },
      cccccccccccc: { titre: 'Depths — donjon', resume: 'Salles.' },
    },
    git: { branche: 'main', modifies: [], commits_en_attente: 0, refus_publication: null },
  };
}

test('modèle : brouillon copié, aucune modification au départ', () => {
  const modele = M.creerModele(etat());
  assert.deepEqual(M.fichiersModifies(modele), []);
  assert.notEqual(modele.brouillon.projets, modele.original.projets);
  assert.equal(modele.git.branche, 'main');
});

test('modèle : fichiers absents, valeurs par défaut', () => {
  const modele = M.creerModele({ fichiers: {}, donnees: null });
  assert.deepEqual(modele.brouillon.entrees, {});
  assert.deepEqual(modele.brouillon.recherche, { synonymes: [] });
  assert.equal(modele.brouillon.projets.version, 2);
  assert.deepEqual(modele.originaux, {});
});

test('modifications : détectées par fichier, indifférentes à l’ordre des clés', () => {
  const modele = M.creerModele(etat());
  modele.brouillon.entrees.aaaaaaaaaaaa = { masquer: true };
  modele.brouillon.projets.projets.depths = { famille: 'jeux', nom: 'Depths' };
  assert.deepEqual(M.fichiersModifies(modele), ['entrees']);
  modele.brouillon.projets.projets.depths.nom = 'Depths II';
  assert.deepEqual(M.fichiersModifies(modele), ['projets', 'entrees']);
  M.marquerEnregistre(modele, 'projets');
  assert.deepEqual(M.fichiersModifies(modele), ['entrees']);
  modele.brouillon.projets.projets.depths.nom = 'Depths III';
  assert.equal(modele.original.projets.projets.depths.nom, 'Depths II', 'l’original est une copie');
});

test('modèle : empreintes gardées, fichier relu sous une autre forme à réécrire', () => {
  const modele = M.creerModele({ ...etat(), empreintes: { projets: 'e1', entrees: 'e2', recherche: '' },
    normalisations: { entrees: ['config/entrees.json, entrée … : « masquer » vaut "false"'] } });
  assert.deepEqual(M.fichiersModifies(modele), ['entrees'], 'Enregistrer écrira la forme de la page');
  M.marquerEnregistre(modele, 'entrees', 'e3');
  assert.deepEqual(M.fichiersModifies(modele), []);
  assert.deepEqual(modele.empreintes, { projets: 'e1', entrees: 'e3', recherche: '' });
});

test('slug et termes', () => {
  assert.equal(M.slug('  Jeux & univers de jeu '), 'jeux-univers-de-jeu');
  assert.equal(M.slug('Éducation — Cours'), 'education-cours');
  assert.equal(M.slug('&&'), '');
  assert.deepEqual(M.termes(' ia, intelligence artificielle ,, llm, ia '), ['ia', 'intelligence artificielle', 'llm']);
  assert.deepEqual(M.termes(''), []);
});
