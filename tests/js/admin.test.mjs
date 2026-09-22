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

test('projets : données et réglages réunis, triés par nom, fusionnés masqués', () => {
  const modele = M.creerModele(etat());
  assert.deepEqual(M.listeProjets(modele).map((p) => [p.id, p.nom, p.famille, p.nb]),
    [['depths', 'Depths', 'jeux', 1], ['jarvis', 'Jarvis', 'ia', 2], ['rogue-lite', 'Rogue lite', null, 1]]);
  modele.brouillon.projets.projets.depths.alias = ['Rogue Lite'];
  assert.deepEqual(M.listeProjets(modele).map((p) => p.id), ['depths', 'jarvis']);
});

test('projets : liens en ligne du projet, principal publié d’abord, sans doublon', () => {
  const modele = M.creerModele(etat());
  assert.deepEqual(M.liensDuProjet(modele, 'jarvis'), ['https://exemple.github.io/jarvis/', 'https://github.com/exemple/jarvis']);
  assert.deepEqual(M.liensDuProjet(modele, 'inconnu'), []);
});

test('projets : une valeur vide retire le réglage, un projet sans réglage disparaît', () => {
  const modele = M.creerModele(etat());
  M.modifierProjet(modele, 'rogue-lite', 'nom', '  Rogue  ');
  assert.deepEqual(modele.brouillon.projets.projets['rogue-lite'], { nom: 'Rogue' });
  M.modifierProjet(modele, 'rogue-lite', 'nom', ' ');
  assert.equal('rogue-lite' in modele.brouillon.projets.projets, false);
  M.modifierProjet(modele, 'jarvis', 'famille', null);
  assert.equal('jarvis' in modele.brouillon.projets.projets, false);
  M.modifierProjet(modele, 'depths', 'alias', []);
  assert.deepEqual(modele.brouillon.projets.projets.depths, { nom: 'Depths', famille: 'jeux' });
});

test('alias : un seul par slug, un texte seul lu comme une liste', () => {
  const modele = M.creerModele(etat());
  M.modifierProjet(modele, 'depths', 'alias', ['rogue-lite', 'Rogue Lite', 'roguelike']);
  assert.deepEqual(modele.brouillon.projets.projets.depths.alias, ['rogue-lite', 'roguelike']);
  assert.deepEqual(M.aliasDe({ alias: 'rogue-lite' }), ['rogue-lite']);
  assert.deepEqual(M.aliasDe({}), []);
  modele.brouillon.projets.projets.depths.alias = 'rogue-lite';
  assert.deepEqual(M.listeProjets(modele).map((p) => p.id), ['depths', 'jarvis'], 'rogue-lite rattaché à depths');
});

test('fusion : la source et ses alias deviennent alias de la cible, ses réglages disparaissent', () => {
  const modele = M.creerModele(etat());
  M.modifierProjet(modele, 'rogue-lite', 'alias', ['roguelike']);
  M.modifierProjet(modele, 'rogue-lite', 'nom', 'Rogue');
  M.fusionner(modele, 'rogue-lite', 'depths');
  assert.deepEqual(modele.brouillon.projets.projets.depths, { nom: 'Depths', famille: 'jeux', alias: ['rogue-lite', 'roguelike'] });
  assert.equal('rogue-lite' in modele.brouillon.projets.projets, false);
  assert.deepEqual(M.listeProjets(modele).map((p) => p.id), ['depths', 'jarvis']);
  M.fusionner(modele, 'depths', 'depths');
  assert.deepEqual(modele.brouillon.projets.projets.depths.alias, ['rogue-lite', 'roguelike'], 'sur lui-même : rien');
  M.modifierProjet(modele, 'jarvis', 'alias', ['Rogue-Lite']);
  M.fusionner(modele, 'jarvis', 'depths');
  assert.deepEqual(modele.brouillon.projets.projets.depths.alias, ['rogue-lite', 'roguelike', 'jarvis'], 'sans doublon de slug');
});

test('familles : ajouter (identifiant unique, couleur libre), renommer, couleur, déplacer', () => {
  const modele = M.creerModele(etat());
  assert.equal(M.ajouterFamille(modele, ' Jeux '), 'jeux-2');
  assert.equal(M.ajouterFamille(modele, 'Outils Claude'), 'outils-claude');
  assert.deepEqual(M.familles(modele).slice(2), [{ id: 'jeux-2', nom: 'Jeux', couleur: 2 }, { id: 'outils-claude', nom: 'Outils Claude', couleur: 4 }]);
  M.modifierFamille(modele, 'outils-claude', 'couleur', '6');
  M.modifierFamille(modele, 'jeux', 'nom', ' Jeux & univers ');
  assert.equal(M.familles(modele)[3].couleur, 6);
  assert.equal(M.familles(modele)[0].nom, 'Jeux & univers');
  assert.equal(M.deplacerFamille(modele, 'ia', -1), true);
  assert.equal(M.deplacerFamille(modele, 'ia', -1), false, 'déjà en tête');
  assert.deepEqual(M.familles(modele).map((f) => f.id), ['ia', 'jeux', 'jeux-2', 'outils-claude']);
});

test('familles : supprimer, ses projets passent sans famille', () => {
  const modele = M.creerModele(etat());
  assert.equal(M.nombreDeProjets(modele, 'jeux'), 1);
  M.supprimerFamille(modele, 'jeux');
  assert.deepEqual(M.familles(modele).map((f) => f.id), ['ia']);
  assert.deepEqual(modele.brouillon.projets.projets.depths, { nom: 'Depths' });
});

test('entrées : titre et résumé d’origine, corrections, entrées masquées hors des données', () => {
  const modele = M.creerModele(etat());
  modele.brouillon.entrees.bbbbbbbbbbbb = { titre: 'Titre corrigé' };
  modele.brouillon.entrees.dddddddddddd = { masquer: true };
  const liste = M.listeEntrees(modele, { dddddddddddd: 'Une entrée masquée' });
  assert.deepEqual(liste.map((e) => [e.court, e.titre, e.titreOrigine, e.masquee, e.connue]), [
    ['aaaaaaaaaaaa', 'Jarvis — architecture', 'Jarvis — architecture', false, true],
    ['bbbbbbbbbbbb', 'Titre corrigé', 'Jarvis — premier réveil', false, true],
    ['cccccccccccc', 'Depths — donjon', 'Depths — donjon', false, true],
    ['dddddddddddd', 'Une entrée masquée', 'Une entrée masquée', true, false],
  ]);
  assert.equal(M.listeEntrees(modele).at(-1).titre, '', 'titre inconnu sans mémo');
});

test('entrées : corriger (égal à l’original : retiré), masquer (correction retirée), réafficher', () => {
  const modele = M.creerModele(etat());
  M.corriger(modele, 'aaaaaaaaaaaa', 'titre', '  Jarvis, l’architecture  ');
  M.corriger(modele, 'aaaaaaaaaaaa', 'resume', 'Pipeline vocal.');
  assert.deepEqual(modele.brouillon.entrees.aaaaaaaaaaaa, { titre: 'Jarvis, l’architecture' });
  M.masquer(modele, 'aaaaaaaaaaaa', true);
  assert.deepEqual(modele.brouillon.entrees.aaaaaaaaaaaa, { masquer: true }, 'le titre corrigé ne part pas dans le dépôt public');
  M.masquer(modele, 'aaaaaaaaaaaa', false);
  assert.equal('aaaaaaaaaaaa' in modele.brouillon.entrees, false);
  assert.deepEqual(M.fichiersModifies(modele), []);
});

test('entrées : « masquer » lu comme l’export, toute valeur vraie masque', () => {
  const modele = M.creerModele(etat());
  modele.brouillon.entrees.cccccccccccc = { masquer: 'false' };
  modele.brouillon.entrees.dddddddddddd = { masquer: 1 };
  const liste = M.listeEntrees(modele);
  assert.equal(liste.find((e) => e.court === 'cccccccccccc').masquee, true);
  assert.deepEqual(liste.filter((e) => !e.connue).map((e) => e.court), ['dddddddddddd']);
});

test('entrées : masquée, le titre et le résumé ne peuvent plus être corrigés (dépôt public)', () => {
  const modele = M.creerModele(etat());
  M.masquer(modele, 'aaaaaaaaaaaa', true);
  M.corriger(modele, 'aaaaaaaaaaaa', 'titre', 'Mot de passe du coffre');
  M.corriger(modele, 'aaaaaaaaaaaa', 'resume', 'Contenu privé, à ne pas publier');
  assert.deepEqual(modele.brouillon.entrees.aaaaaaaaaaaa, { masquer: true });
  // Réaffichée, elle redevient corrigeable.
  M.masquer(modele, 'aaaaaaaaaaaa', false);
  M.corriger(modele, 'aaaaaaaaaaaa', 'titre', 'Titre corrigé');
  assert.deepEqual(modele.brouillon.entrees.aaaaaaaaaaaa, { titre: 'Titre corrigé' });
});

test('entrées : une correction orpheline est listée et peut être retirée', () => {
  const modele = M.creerModele(etat());
  modele.brouillon.entrees.ffffffffffff = { titre: 'Entrée disparue de la mémoire' };
  const orpheline = M.listeEntrees(modele).find((e) => e.court === 'ffffffffffff');
  assert.deepEqual([orpheline.connue, orpheline.masquee, orpheline.titre],
    [false, false, 'Entrée disparue de la mémoire']);
  M.retirerCorrection(modele, 'ffffffffffff');
  assert.equal('ffffffffffff' in modele.brouillon.entrees, false);
  assert.deepEqual(M.listeEntrees(modele).filter((e) => !e.connue), []);
});

test('enregistrement : seul ce qui a été envoyé est marqué enregistré', () => {
  const modele = M.creerModele(etat());
  M.modifierProjet(modele, 'depths', 'description', 'PREMIÈRE description');
  const envoye = structuredClone(modele.brouillon.projets);
  // Saisie faite pendant l'envoi : elle n'est pas dans ce qui part sur le disque.
  M.modifierProjet(modele, 'depths', 'description', 'SECONDE description');
  M.marquerEnregistre(modele, 'projets', 'abc', envoye);
  assert.deepEqual(M.fichiersModifies(modele), ['projets'], 'la saisie reste à enregistrer');
  assert.equal(modele.original.projets.projets.depths.description, 'PREMIÈRE description');
  assert.equal(modele.empreintes.projets, 'abc');
  // Sans quatrième argument (rien d'autre n'a bougé) : le brouillon courant.
  M.marquerEnregistre(modele, 'projets', 'def');
  assert.deepEqual(M.fichiersModifies(modele), []);
});

test('synonymes : modifier, ajouter, supprimer un groupe', () => {
  const modele = M.creerModele(etat());
  M.modifierGroupe(modele, 0, 'ia, intelligence artificielle, llm');
  assert.equal(M.ajouterGroupe(modele), 2);
  M.modifierGroupe(modele, 2, 'local, hors ligne,');
  M.supprimerGroupe(modele, 1);
  assert.deepEqual(M.groupes(modele), [['ia', 'intelligence artificielle', 'llm'], ['local', 'hors ligne']]);
  assert.deepEqual(M.fichiersModifies(modele), ['recherche']);
});
