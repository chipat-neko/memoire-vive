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

// ------------------------------------------------------------ projets

function reglages(modele) {
  return modele.brouillon.projets.projets || {};
}

function projetsPublies(modele) {
  return (modele.donnees && Array.isArray(modele.donnees.projets)) ? modele.donnees.projets : [];
}

function entreesPubliees(modele) {
  return (modele.donnees && Array.isArray(modele.donnees.entrees)) ? modele.donnees.entrees : [];
}

export function reglageProjet(modele, id) {
  return reglages(modele)[id] || {};
}

/* Alias d'un réglage, toujours une liste (le serveur ramène déjà un texte seul à une liste). */
export function aliasDe(reglage) {
  const alias = reglage && reglage.alias;
  if (Array.isArray(alias)) return alias;
  return typeof alias === 'string' && alias ? [alias] : [];
}

/* Liens en ligne d'un projet : son lien principal publié, puis ceux de ses entrées, sans doublon. */
export function liensDuProjet(modele, id) {
  const liens = [];
  const publie = projetsPublies(modele).find((p) => p && p.id === id);
  if (publie && publie.lien_principal && publie.lien_principal.url) liens.push(publie.lien_principal.url);
  for (const entree of entreesPubliees(modele)) {
    if (!entree || entree.projet !== id) continue;
    for (const lien of Array.isArray(entree.liens) ? entree.liens : []) {
      if (lien && lien.type === 'en_ligne' && lien.valeur) liens.push(lien.valeur);
    }
  }
  return Array.from(new Set(liens));
}

/* Projets à régler : ceux des données et ceux des réglages, sauf ceux devenus
   alias d'un autre (fusionnés), triés par nom. */
export function listeProjets(modele) {
  const tous = reglages(modele);
  const alias = new Set();
  for (const [id, reglage] of Object.entries(tous)) {
    for (const tag of aliasDe(reglage)) if (slug(tag) !== id) alias.add(slug(tag));
  }
  const publies = new Map(projetsPublies(modele).filter((p) => p && p.id).map((p) => [p.id, p]));
  const ids = new Set([...publies.keys(), ...Object.keys(tous)]);
  return Array.from(ids).filter((id) => !alias.has(id)).map((id) => {
    const publie = publies.get(id) || {};
    const reglage = tous[id] || {};
    return {
      id,
      nom: reglage.nom || publie.nom || id,
      nomPublie: publie.nom || null,
      descriptionPubliee: publie.description || null,
      famille: reglage.famille || null,
      nb: publie.nb || 0,
    };
  }).sort((a, b) => a.nom.localeCompare(b.nom, 'fr', { sensitivity: 'base' }) || a.id.localeCompare(b.id));
}

function vide(valeur) {
  return valeur === null || valeur === undefined || (typeof valeur === 'string' && !valeur.trim())
    || (Array.isArray(valeur) && !valeur.length);
}

/* Règle un champ d'un projet ; une valeur vide retire la clé (calcul
   automatique), et un projet sans réglage disparaît du fichier. Alias : un
   seul par slug (« rogue-lite » et « Rogue Lite » désignent le même tag). */
export function modifierProjet(modele, id, champ, valeur) {
  if (champ === 'alias' && Array.isArray(valeur)) {
    valeur = valeur.filter((tag, i, liste) => liste.findIndex((autre) => slug(autre) === slug(tag)) === i);
  }
  const fichier = modele.brouillon.projets;
  fichier.projets = fichier.projets || {};
  const reglage = Object.assign({}, fichier.projets[id]);
  if (vide(valeur)) delete reglage[champ];
  else reglage[champ] = typeof valeur === 'string' ? valeur.trim() : valeur;
  if (Object.keys(reglage).length) fichier.projets[id] = reglage;
  else delete fichier.projets[id];
}

/* Fusionne source dans cible : source et ses alias deviennent des alias de
   cible (ses entrées passent dans cible) ; ses propres réglages sont abandonnés. */
export function fusionner(modele, source, cible) {
  if (!source || !cible || source === cible) return;
  const alias = [...aliasDe(reglageProjet(modele, cible)), source, ...aliasDe(reglageProjet(modele, source))];
  modifierProjet(modele, cible, 'alias', alias.filter((tag) => slug(tag) !== cible));
  if (modele.brouillon.projets.projets) delete modele.brouillon.projets.projets[source];
}

// ------------------------------------------------------------ familles

export function familles(modele) {
  return modele.brouillon.projets.familles || [];
}

/* Ajoute une famille à la fin ; identifiant tiré du nom (unique), première couleur libre. */
export function ajouterFamille(modele, nom) {
  const fichier = modele.brouillon.projets;
  fichier.familles = fichier.familles || [];
  const base = slug(nom) || 'famille';
  let id = base;
  for (let n = 2; fichier.familles.some((f) => f.id === id); n++) id = base + '-' + n;
  const prises = new Set(fichier.familles.map((f) => f.couleur));
  const couleur = [1, 2, 3, 4, 5, 6].find((c) => !prises.has(c)) || 1;
  fichier.familles.push({ id, nom: String(nom).trim(), couleur });
  return id;
}

/* champ : 'nom' (texte) ou 'couleur' (entier de 1 à 6). */
export function modifierFamille(modele, id, champ, valeur) {
  const famille = familles(modele).find((f) => f.id === id);
  if (!famille) return;
  famille[champ] = champ === 'couleur' ? Number(valeur) : String(valeur).trim();
}

/* sens : -1 (monter) ou +1 (descendre) ; false si la famille est déjà au bout. */
export function deplacerFamille(modele, id, sens) {
  const liste = familles(modele);
  const i = liste.findIndex((f) => f.id === id);
  const j = i + sens;
  if (i < 0 || j < 0 || j >= liste.length) return false;
  [liste[i], liste[j]] = [liste[j], liste[i]];
  return true;
}

/* Supprime une famille ; ses projets passent « Sans famille ». */
export function supprimerFamille(modele, id) {
  const fichier = modele.brouillon.projets;
  fichier.familles = familles(modele).filter((f) => f.id !== id);
  for (const [pid, reglage] of Object.entries(fichier.projets || {})) {
    if (reglage.famille === id) modifierProjet(modele, pid, 'famille', null);
  }
}

export function nombreDeProjets(modele, id) {
  return listeProjets(modele).filter((p) => p.famille === id).length;
}
