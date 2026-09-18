/* Jeux de données synthétiques pour les tests (aucune donnée réelle de la
   mémoire). Même forme que docs/data.json produit par scripts/export.py. */

export const SCHEMA_TEST = 1;
export const MAINTENANT_TEST = '2026-09-20T12:00:00.000Z';
const MAINTENANT = Date.parse(MAINTENANT_TEST);

/* Identifiant de 64 caractères hexadécimaux, stable, dont les 12 premiers
   (identifiant court des fiches) diffèrent d'une entrée à l'autre. */
export function identifiant(n) {
  let x = (n + 1) * 2654435761 >>> 0;
  let hex = '';
  while (hex.length < 64) {
    x ^= x << 13; x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5; x >>>= 0;
    hex += x.toString(16).padStart(8, '0');
  }
  return hex;
}

const HEBERGEURS_DE_CODE = ['github.com', 'gitlab.com', 'bitbucket.org', 'codeberg.org'];

function genre(url) {
  const hote = new URL(url).hostname.replace(/^www\./, '');
  return HEBERGEURS_DE_CODE.some((h) => hote === h || hote.endsWith('.' + h)) ? 'depot' : 'site';
}

function lienPrincipal(liens) {
  const enLigne = liens.filter((l) => l.type === 'en_ligne').map((l) => l.valeur);
  const site = enLigne.find((u) => genre(u) === 'site');
  if (site) return { url: site, genre: 'site' };
  const depot = enLigne.find((u) => genre(u) === 'depot');
  return depot ? { url: depot, genre: 'depot' } : null;
}

const FAMILLES = [
  { id: 'jeux', nom: 'Jeux & univers de jeu', couleur: 1 },
  { id: 'ia', nom: 'IA & simulations', couleur: 3 },
  { id: 'outils', nom: 'Outils Claude', couleur: 4 },
];

const PROJETS = {
  jarvis: { nom: 'Jarvis', famille: 'ia', description: 'Assistant vocal local : écoute, comprend et répond sans quitter la machine.' },
  depths: { nom: 'Depths', famille: 'jeux', description: 'Rogue-lite en 2D : donjons procéduraux, salles préfabriquées.' },
  voxelcraft: { nom: 'Voxelcraft', famille: 'jeux', description: null },
  'tour-de-controle': { nom: 'Tour de contrôle', famille: 'outils', description: 'Tableau de bord des sessions Claude Code en cours.' },
  'memoire-vive': { nom: 'Mémoire Vive', famille: 'outils', description: 'Site statique qui affiche et cherche la mémoire partagée.' },
  'bibliotheque-claude': { nom: 'Bibliothèque Claude', famille: 'outils', description: null },
  atelier: { nom: 'L’atelier', famille: null, description: null },
};

/* Entrées écrites à la main : chacune sert au moins un test précis. */
const SPECIALES = [
  { cle: 'jarvis-archi', type: 'reference', projet: 'jarvis', heures: 400,
    titre: 'Jarvis — architecture',
    resume: 'Pipeline vocal local : reconnaissance, intelligence artificielle, synthèse.',
    contenu: 'Jarvis — architecture : pipeline vocal local en trois étages (reconnaissance, intelligence artificielle, synthèse). Code sur https://github.com/exemple/jarvis, démo sur https://exemple.github.io/jarvis/. Dossier D:\\jarvis, serveur sur localhost:8765.',
    tags: ['jarvis', 'architecture'],
    liens: [
      { type: 'en_ligne', valeur: 'https://github.com/exemple/jarvis' },
      { type: 'en_ligne', valeur: 'https://exemple.github.io/jarvis/' },
      { type: 'local', valeur: 'D:\\jarvis' },
      { type: 'local', valeur: 'localhost:8765' },
    ] },
  { cle: 'jarvis-jalon-1', type: 'milestone', projet: 'jarvis', heures: 300,
    titre: 'Jarvis — premier réveil vocal',
    resume: 'Le mot de réveil déclenche l’écoute.',
    contenu: 'Jarvis — premier réveil vocal : le mot de réveil déclenche l’écoute en moins de 300 ms.',
    tags: ['jarvis', 'jalon'], liens: [] },
  { cle: 'jarvis-jalon-2', type: 'milestone', projet: 'jarvis', heures: 200,
    titre: 'Jarvis — réponses hors ligne',
    resume: 'Le modèle tourne sans réseau.',
    contenu: 'Jarvis — réponses hors ligne : le modèle tourne sans réseau, sur la carte graphique.',
    tags: ['jarvis', 'jalon'], liens: [] },
  { cle: 'jarvis-decision', type: 'decision', projet: 'jarvis', heures: 250,
    titre: 'Jarvis — pas de service en ligne',
    resume: 'Tout reste sur la machine.',
    contenu: 'Jarvis — pas de service en ligne : tout reste sur la machine, par principe.',
    tags: ['jarvis', 'decision'], liens: [] },
  { cle: 'jarvis-erreur', type: 'error', projet: 'jarvis', heures: 150,
    titre: 'Jarvis — micro muet après veille',
    resume: 'Le pilote audio perd le micro.',
    contenu: 'Jarvis — micro muet après veille : le pilote audio perd le micro, il faut relancer le service.',
    tags: ['jarvis', 'bug'], liens: [] },
  { cle: 'depths-jalon', type: 'milestone', projet: 'depths', heures: 120,
    titre: 'Depths — génération de donjon',
    resume: 'Salles préfabriquées sur une grille, boss et trésor placés.',
    contenu: 'Depths — génération de donjon : salles préfabriquées sur une grille, croissance aléatoire, boss et trésor placés. Les jeux de tuiles sont prêts.',
    tags: ['depths', 'jalon'], liens: [{ type: 'en_ligne', valeur: 'https://github.com/exemple/depths' }] },
  { cle: 'depths-note', type: 'note', projet: 'depths', heures: 110,
    titre: 'Depths — idées de monstres',
    resume: 'Des animaux mutants dans les réseaux de grottes.',
    contenu: 'Depths — idées de monstres : des animaux mutants dans les réseaux de grottes du donjon.',
    tags: ['depths'], liens: [] },
  { cle: 'voxel-note', type: 'note', projet: 'voxelcraft', heures: 100,
    titre: 'Voxelcraft — un jeu de cubes',
    resume: 'Un animal par biome, un réseau de rivières.',
    contenu: 'Voxelcraft — un jeu de cubes : un animal par biome et un réseau de rivières creusées.',
    tags: ['voxelcraft'], liens: [] },
  { cle: 'tour-note', type: 'note', projet: 'tour-de-controle', heures: 90,
    titre: 'Tour de contrôle — vue des sessions',
    resume: 'Chaque session Claude Code a sa carte.',
    contenu: 'Tour de contrôle — vue des sessions : chaque session Claude Code a sa carte, mise à jour en direct.',
    tags: ['tour-de-controle'], liens: [] },
  { cle: 'tour-mots', type: 'note', projet: 'tour-de-controle', heures: 85,
    titre: 'Tour de garde et contrôle des accès',
    resume: 'Un tour de garde, puis un contrôle.',
    contenu: 'Tour de garde et contrôle des accès : un tour de garde chaque nuit, puis un contrôle des journaux.',
    tags: ['tour-de-controle'], liens: [] },
  { cle: 'memoire-jalon', type: 'milestone', projet: 'memoire-vive', heures: 30,
    titre: 'Mémoire Vive — site en ligne',
    resume: 'La mémoire partagée est consultable.',
    contenu: 'Mémoire Vive — site en ligne : la mémoire partagée est consultable sur https://exemple.github.io/memoire-vive/.',
    tags: ['memoire-vive', 'jalon'],
    liens: [{ type: 'en_ligne', valeur: 'https://exemple.github.io/memoire-vive/' }] },
  { cle: 'memoire-archi', type: 'architecture', projet: 'memoire-vive', heures: 40,
    titre: 'Mémoire Vive — architecture de l’export',
    resume: 'Un script Python lit la mémoire et écrit data.json.',
    contenu: 'Mémoire Vive — architecture de l’export : un script Python lit la mémoire et écrit data.json, publié par GitHub Pages.',
    tags: ['memoire-vive', 'architecture'], liens: [] },
  { cle: 'biblio', type: 'reference', projet: 'bibliotheque-claude', heures: 60,
    titre: 'Bibliothèque Claude — artifact',
    resume: 'Catalogue des outils Claude.',
    contenu: 'Bibliothèque Claude — artifact : catalogue des outils Claude sur https://claude.ai/artifact/0123abcd.',
    tags: ['bibliotheque-claude'],
    liens: [{ type: 'en_ligne', valeur: 'https://claude.ai/artifact/0123abcd' }] },
  { cle: 'atelier-note', type: 'observation', projet: 'atelier', heures: 70,
    titre: 'Le cœur de l’atelier',
    resume: 'L’établi est au centre.',
    contenu: 'Le cœur de l’atelier : l’établi est au centre, les outils au mur.',
    tags: ['atelier'], liens: [] },
  { cle: 'sans-projet', type: 'note', projet: null, heures: 20,
    titre: 'Note sans projet',
    resume: 'Une pensée isolée.',
    contenu: 'Note sans projet : une pensée isolée sur la mémoire du quotidien.',
    tags: ['divers'], liens: [] },
];

const VOISINS = [
  ['jarvis-archi', 'jarvis-jalon-1', 0.88],
  ['jarvis-archi', 'jarvis-decision', 0.85],
  ['jarvis-jalon-2', 'jarvis-decision', 0.83],
  ['depths-jalon', 'voxel-note', 0.84],
  ['depths-note', 'voxel-note', 0.82],
  ['memoire-archi', 'tour-note', 0.81],
  ['memoire-jalon', 'memoire-archi', 0.9],
];

const PROJETS_DE_REMPLISSAGE = ['jarvis', 'depths', 'voxelcraft', 'tour-de-controle', 'memoire-vive'];

function remplissage(i) {
  const projet = PROJETS_DE_REMPLISSAGE[i % PROJETS_DE_REMPLISSAGE.length];
  const nom = PROJETS[projet].nom;
  return {
    cle: 'note-' + i, type: 'note', projet, heures: 500 + i * 7,
    titre: `${nom} — note de suivi ${i + 1}`,
    resume: `Point d’étape numéro ${i + 1}.`,
    contenu: `${nom} — note de suivi ${i + 1} : point d’étape numéro ${i + 1}, rien de bloquant.`,
    tags: [projet, 'suivi'], liens: [],
  };
}

function isoAvant(heures) {
  return new Date(MAINTENANT - heures * 3600 * 1000).toISOString();
}

/* Jeu de test principal : 70 entrées (plus d'une page de 60 cartes),
   7 projets dont un sans famille, une entrée sans projet, des voisins. */
export function jeuDeTest() {
  const modeles = SPECIALES.concat(Array.from({ length: 55 }, (_, i) => remplissage(i)));
  const ids = new Map(modeles.map((m, n) => [m.cle, identifiant(n)]));
  const voisinsDe = new Map(modeles.map((m) => [m.cle, []]));
  for (const [a, b, score] of VOISINS) {
    voisinsDe.get(a).push({ id: ids.get(b), score });
    voisinsDe.get(b).push({ id: ids.get(a), score });
  }
  const entrees = modeles.map((m) => ({
    id: ids.get(m.cle),
    titre: m.titre,
    resume: m.resume,
    contenu: m.contenu,
    type: m.type,
    tags: m.tags,
    projet: m.projet,
    cree_le: isoAvant(m.heures),
    modifie_le: isoAvant(m.heures),
    liens: m.liens,
    lien_principal: lienPrincipal(m.liens),
    corrige: false,
    voisins: voisinsDe.get(m.cle).sort((x, y) => y.score - x.score),
  }));
  entrees.sort((a, b) => (a.cree_le < b.cree_le ? 1 : -1));
  return assembler(entrees);
}

function compter(valeurs) {
  const compte = {};
  for (const v of valeurs) compte[v] = (compte[v] || 0) + 1;
  return compte;
}

/* Complète la racine et les projets à partir des entrées, comme l'export. */
export function assembler(entrees, { familles = FAMILLES, projets = PROJETS, synonymes } = {}) {
  const parProjet = new Map();
  for (const e of entrees) {
    if (!e.projet) continue;
    if (!parProjet.has(e.projet)) parProjet.set(e.projet, []);
    parProjet.get(e.projet).push(e);
  }
  const listeProjets = Array.from(parProjet, ([id, membres]) => {
    const recents = membres.slice().sort((a, b) => (a.cree_le < b.cree_le ? 1 : -1));
    const liens = recents.map((e) => e.lien_principal).filter(Boolean);
    const reglage = projets[id] || {};
    return {
      id,
      nom: reglage.nom || id,
      famille: reglage.famille || null,
      description: reglage.description || null,
      lien_principal: liens.find((l) => l.genre === 'site') || liens[0] || null,
      nb: membres.length,
      types: compter(membres.map((e) => e.type)),
      premiere: recents[recents.length - 1].cree_le,
      derniere: recents[0].cree_le,
    };
  }).sort((a, b) => (a.derniere < b.derniere ? 1 : -1));
  return {
    schema: SCHEMA_TEST,
    genere_le: MAINTENANT_TEST,
    source: 'tests',
    nb_entrees: entrees.length,
    types: compter(entrees.map((e) => e.type)),
    ordre_types: ['reference', 'architecture', 'decision', 'milestone', 'note', 'observation', 'error'],
    familles,
    synonymes: synonymes || [['ia', 'intelligence artificielle', 'llm'], ['local', 'hors ligne', 'offline']],
    projets: listeProjets,
    entrees,
    voisins_reglage: { seuil: 0.8, max: 5 },
    voisins_en_attente: [],
    empreinte: '0'.repeat(64),
  };
}

/* Générateur pseudo-aléatoire déterministe (mulberry32). */
function hasard(graine) {
  let a = graine >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MOTS_REELS = ['architecture', 'donjon', 'mémoire', 'réseau', 'réseaux', 'modèle', 'jeu', 'jeux', 'site',
  'dépôt', 'export', 'recherche', 'session', 'contrôle', 'tour', 'carte', 'projet', 'jalon', 'décision', 'erreur',
  'animal', 'animaux', 'vocal', 'local', 'synthèse', 'génération', 'interface', 'serveur', 'données', 'tableau',
  'sécurité', 'intelligence', 'artificielle', 'graphique', 'cube', 'rivière', 'monstre', 'salle', 'trésor'];
const SYLLABES = ['ba', 'ce', 'di', 'fo', 'gu', 'la', 'me', 'ni', 'po', 'ru', 'sa', 'te', 'vi', 'zo', 'cha',
  'pre', 'tra', 'gne', 'lou', 'ran', 'vin', 'mon', 'deur', 'lette', 'sion', 'qui', 'bro', 'fla', 'gri', 'sté'];

/* Jeu volumineux pour la performance : `nombre` entrées d'une centaine de
   mots tirés d'un vocabulaire d'environ 20 000 mots (loi très inégale,
   comme un vrai texte), 40 projets répartis en 5 familles, des voisins. */
export function jeuVolumineux(nombre = 3000) {
  const alea = hasard(42);
  const lexique = new Set(MOTS_REELS);
  while (lexique.size < 20000) {
    const n = 2 + Math.floor(alea() * 3);
    let mot = '';
    for (let i = 0; i < n; i++) mot += SYLLABES[Math.floor(alea() * SYLLABES.length)];
    lexique.add(mot);
  }
  const mots = Array.from(lexique);
  const tirer = () => mots[Math.floor(mots.length * alea() ** 3)];
  const phrase = (n) => Array.from({ length: n }, tirer).join(' ');
  const familles = ['jeux', 'cours', 'ia', 'outils', 'sites'].map((id, i) => ({ id, nom: 'Famille ' + id, couleur: i + 1 }));
  const projets = {};
  for (let p = 0; p < 40; p++) projets['projet-' + p] = { nom: 'Projet ' + p, famille: familles[p % 5].id, description: phrase(20) };
  const types = ['note', 'milestone', 'decision', 'reference', 'architecture', 'error'];
  const ids = Array.from({ length: nombre }, (_, n) => identifiant(n + 1000));
  const entrees = ids.map((id, n) => {
    const projet = 'projet-' + (n % 40);
    const voisins = [1, 2, 3].map((k) => ({ id: ids[(n + k * 37) % nombre], score: 0.8 + k / 100 }));
    return {
      id, titre: `Projet ${n % 40} — ${phrase(5)}`, resume: phrase(18), contenu: phrase(80 + Math.floor(alea() * 80)),
      type: types[n % types.length], tags: [projet, tirer()], projet,
      cree_le: isoAvant(n), modifie_le: isoAvant(n), liens: [], lien_principal: null, corrige: false, voisins,
    };
  });
  return assembler(entrees, { familles, projets });
}

/* Retrouve une entrée du jeu de test par le début de son titre. */
export function entreeTitree(donnees, debut) {
  const entree = donnees.entrees.find((e) => e.titre.startsWith(debut));
  if (!entree) throw new Error('Entrée de test introuvable : ' + debut);
  return entree;
}
