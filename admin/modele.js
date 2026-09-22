/* Modèle de la page d'admin : brouillon des trois fichiers de réglages
   (config/projets.json, entrees.json, recherche.json), opérations de
   l'interface, fichiers modifiés. Module pur, sans DOM : testé sous Node. */

export const FICHIERS = ['projets', 'entrees', 'recherche'];
export const LIBELLES = { projets: 'projets et familles', entrees: 'entrées', recherche: 'recherche' };
// Indices 1 à 6 de --famille-N dans docs/style.css.
export const COULEURS = ['violet', 'bleu', 'vert', 'ocre', 'framboise', 'olive'];

const clone = (valeur) => structuredClone(valeur);

/* JSON à clés triées : deux réglages égaux s'écrivent pareil, quel que soit
   l'ordre dans lequel leurs clés ont été posées. */
function stable(valeur) {
  if (Array.isArray(valeur)) return '[' + valeur.map(stable).join(',') + ']';
  if (valeur && typeof valeur === 'object') {
    return '{' + Object.keys(valeur).sort().map((k) => JSON.stringify(k) + ':' + stable(valeur[k])).join(',') + '}';
  }
  return JSON.stringify(valeur);
}

/* Identifiant tiré d'un nom : minuscules sans accents, tirets. */
export function slug(texte) {
  return String(texte || '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/* « a, b ,c » → ['a', 'b', 'c'] : sans espaces autour, sans vides ni doublons. */
export function termes(texte) {
  return Array.from(new Set(String(texte || '').split(',').map((t) => t.trim()).filter(Boolean)));
}

/* Modèle tiré de GET /api/etat : original (tel qu'enregistré) et brouillon
   (modifié par l'interface) ; empreinte de chaque fichier lu, renvoyée avec
   chaque enregistrement (le serveur refuse d'écraser un fichier modifié
   ailleurs entre-temps). */
export function creerModele(etat) {
  const fichiers = (etat && etat.fichiers) || {};
  const original = {
    projets: fichiers.projets || { version: 2, familles: [], projets: {}, tags_generiques: [], tags_exclus: [] },
    entrees: fichiers.entrees || {},
    recherche: fichiers.recherche || { synonymes: [] },
  };
  const modele = {
    original: clone(original),
    brouillon: clone(original),
    empreintes: Object.assign({}, etat && etat.empreintes),
    donnees: (etat && etat.donnees) || null,
    originaux: (etat && etat.originaux) || {},
    git: (etat && etat.git) || null,
  };
  // Fichier lu sous une forme que le serveur a ramenée à la sienne
  // (normalisations) : à réécrire, donc modifié jusqu'au prochain enregistrement.
  for (const nom of Object.keys((etat && etat.normalisations) || {})) {
    if (FICHIERS.includes(nom)) modele.original[nom] = null;
  }
  return modele;
}

/* Fichiers dont le brouillon diffère de ce qui est enregistré, dans l'ordre de FICHIERS. */
export function fichiersModifies(modele) {
  return FICHIERS.filter((nom) => stable(modele.brouillon[nom]) !== stable(modele.original[nom]));
}

/* empreinte : celle du fichier écrit, renvoyée par le serveur. */
export function marquerEnregistre(modele, nom, empreinte) {
  modele.original[nom] = clone(modele.brouillon[nom]);
  if (typeof empreinte === 'string') modele.empreintes[nom] = empreinte;
}
