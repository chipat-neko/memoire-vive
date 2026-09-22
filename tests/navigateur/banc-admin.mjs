/* Banc de la page d'admin : dépôt git temporaire (copie de scripts/, docs/ et
   admin/, réglages de test), dépôt distant local, faux dashboard, serveur
   scripts/admin.py sur un port libre. Aucune donnée réelle : ni la vraie
   mémoire, ni le vrai dépôt distant ne sont touchés. */
import { spawn, execFile, execFileSync } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

export const RACINE_DEPOT = fileURLToPath(new URL('../../', import.meta.url));
export const PYTHON = process.env.MEMOIRE_PYTHON || 'python';
const CLE = 'cle-du-faux-dashboard';

function memoire(n, contenu, tags, type) {
  return {
    content: contenu, content_hash: n.toString(16).padStart(12, '0') + '0'.repeat(52), tags, memory_type: type,
    metadata: { access_queries: ['ne doit pas sortir'] }, created_at: 1790000000 + n * 3600,
    created_at_iso: null, updated_at: null, updated_at_iso: null,
  };
}

/* Six entrées : cinq publiables (quatre projets, dont « rogue-lite » à fusionner
   dans « depths »), une privée (tag « prive », jamais publiée). */
export const MEMOIRES = [
  memoire(1, 'Projet Jarvis : assistant vocal local, qui écoute et répond sans réseau. Démo sur https://exemple.github.io/jarvis/ et code sur https://github.com/exemple/jarvis.', ['jarvis', 'architecture'], 'architecture'),
  memoire(2, 'Jarvis — premier réveil vocal : le mot de réveil déclenche l’écoute en moins de 300 ms.', ['jarvis', 'jalon'], 'milestone'),
  memoire(3, 'Projet Depths : rogue-lite en 2D, donjons procéduraux et salles préfabriquées.', ['depths', 'architecture'], 'architecture'),
  memoire(4, 'Rogue-lite : idées de monstres pour les grottes du donjon.', ['rogue-lite'], 'note'),
  memoire(5, 'Voxelcraft — un jeu de cubes : un animal par biome et des rivières creusées.', ['voxelcraft'], 'note'),
  memoire(6, 'Note privée : à ne pas publier.', ['prive'], 'note'),
];

export const REGLAGES = {
  projets: {
    _aide: 'Réglages de test.',
    version: 2,
    familles: [{ id: 'jeux', nom: 'Jeux', couleur: 1 }, { id: 'ia', nom: 'IA & simulations', couleur: 3 }],
    projets: { jarvis: { famille: 'ia' }, depths: { nom: 'Depths', famille: 'jeux' } },
    tags_generiques: ['python'],
    tags_exclus: [],
  },
  entrees: { _aide: 'Corrections de test.' },
  recherche: { _aide: 'Synonymes de test.', synonymes: [['ia', 'intelligence artificielle'], ['jeu', 'game']] },
};

/* Faux dashboard : GET /api/memories, POST /api/search (comptées : chacune
   écrirait dans la vraie mémoire partagée). etat.delai : millisecondes
   d'attente avant de répondre à la lecture (dashboard lent). */
export async function demarrerDashboard() {
  const etat = { recherches: 0, delai: 0 };
  const serveur = http.createServer((req, res) => {
    const repondre = (code, corps) => {
      res.writeHead(code, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(corps));
    };
    if (req.headers['x-api-key'] !== CLE) return repondre(401, { detail: 'non' });
    const url = new URL(req.url, 'http://127.0.0.1');
    if (req.method === 'GET' && url.pathname === '/api/memories') {
      const premiere = url.searchParams.get('page') === '1';
      return setTimeout(() => repondre(200, { memories: premiere ? MEMOIRES : [], total: MEMOIRES.length, has_more: false }),
        etat.delai);
    }
    if (req.method === 'POST' && url.pathname === '/api/search') {
      etat.recherches += 1;
      req.resume();
      return req.on('end', () => repondre(200, { results: [] }));
    }
    return repondre(404, { detail: 'inconnu' });
  });
  await new Promise((ok) => serveur.listen(0, '127.0.0.1', ok));
  return {
    url: `http://127.0.0.1:${serveur.address().port}`,
    etat,
    arreter: () => new Promise((ok) => {
      serveur.closeAllConnections();
      serveur.close(() => ok());
    }),
  };
}

function environnement(dashboard) {
  return { ...process.env, MEMOIRE_API_URL: dashboard.url, MEMOIRE_API_KEY: CLE, PYTHONIOENCODING: 'utf-8', PYTHONUNBUFFERED: '1' };
}

export function git(dossier, ...args) {
  return execFileSync('git', args, { cwd: dossier, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

/* Dépôt de travail dans dossier : copie de scripts/, docs/ et admin/ ;
   réglages de test et data.json tiré du faux dashboard, ou (reel) copies des
   vrais réglages et du vrai data.json ; premier commit poussé vers un dépôt
   distant local (branche main suivie). */
export async function preparerDepot(dossier, dashboard, { reel = false } = {}) {
  const racine = path.join(dossier, 'depot');
  const distant = path.join(dossier, 'distant.git');
  for (const sous of ['scripts', 'docs', 'admin']) {
    await fs.cp(path.join(RACINE_DEPOT, sous), path.join(racine, sous),
      { recursive: true, filter: (source) => !source.includes('__pycache__') });
  }
  if (!reel) await fs.rm(path.join(racine, 'docs', 'data.json'), { force: true });
  for (const fichier of ['.gitignore', '.gitattributes']) {
    await fs.copyFile(path.join(RACINE_DEPOT, fichier), path.join(racine, fichier));
  }
  if (reel) {
    await fs.cp(path.join(RACINE_DEPOT, 'config'), path.join(racine, 'config'), { recursive: true });
  } else {
    await fs.mkdir(path.join(racine, 'config'));
    for (const [nom, contenu] of Object.entries(REGLAGES)) {
      await fs.writeFile(path.join(racine, 'config', nom + '.json'), JSON.stringify(contenu, null, 2) + '\n');
    }
    // Asynchrone : le faux dashboard tourne dans ce processus et doit pouvoir répondre.
    await promisify(execFile)(PYTHON, ['scripts/export.py', '--no-git', '--sans-recherche'],
      { cwd: racine, env: environnement(dashboard), encoding: 'utf8' });
  }
  git(dossier, 'init', '-q', '--bare', '-b', 'main', distant);
  git(racine, 'init', '-q', '-b', 'main');
  git(racine, 'config', 'user.name', 'test');
  git(racine, 'config', 'user.email', 'test@example.invalid');
  git(racine, 'remote', 'add', 'origin', distant);
  git(racine, 'add', '.');
  git(racine, 'commit', '-q', '-m', 'init');
  git(racine, 'push', '-q', '-u', 'origin', 'main');
  return { racine, distant };
}

/* Lance scripts/admin.py (port libre, sans navigateur) ; attend l'adresse
   qu'il affiche, jeton compris. */
export async function lancerAdmin(racine, dashboard) {
  const processus = spawn(PYTHON, ['scripts/admin.py', '--port', '0', '--sans-navigateur'],
    { cwd: racine, env: environnement(dashboard), stdio: ['ignore', 'pipe', 'pipe'] });
  let sortie = '';
  const adresse = await new Promise((ok, ko) => {
    const delai = setTimeout(() => {
      processus.kill();
      ko(new Error('admin.py ne démarre pas :\n' + sortie));
    }, 15000);
    const lire = (morceau) => {
      sortie += morceau;
      const trouve = /Adresse : (http:\/\/127\.0\.0\.1:\d+\/admin\/#jeton=[\w-]+)/.exec(sortie);
      if (trouve) {
        clearTimeout(delai);
        ok(trouve[1]);
      }
    };
    processus.stdout.setEncoding('utf8').on('data', lire);
    processus.stderr.setEncoding('utf8').on('data', lire);
    processus.once('exit', (code) => {
      clearTimeout(delai);
      ko(new Error(`admin.py s’est arrêté (code ${code}) :\n${sortie}`));
    });
  });
  return {
    adresse,
    base: adresse.slice(0, adresse.indexOf('admin/')),
    jeton: adresse.slice(adresse.indexOf('#jeton=') + 7),
    sortie: () => sortie,
    arreter: () => new Promise((ok) => {
      if (processus.exitCode !== null) return ok();
      processus.once('exit', () => ok());
      processus.kill();
    }),
  };
}

/* Banc complet ; fermer() arrête tout et efface le dossier temporaire.
   reel : vrais réglages et vrai data.json (copiés, jamais modifiés). */
export async function ouvrirBanc({ reel = false } = {}) {
  const dossier = await fs.mkdtemp(path.join(os.tmpdir(), 'mv-admin-'));
  const effacer = () => fs.rm(dossier, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  const dashboard = await demarrerDashboard();
  let depot;
  let admin;
  try {
    depot = await preparerDepot(dossier, dashboard, { reel });
    admin = await lancerAdmin(depot.racine, dashboard);
  } catch (erreur) {
    // Montage raté (admin/ absent, Python introuvable…) : tout est arrêté,
    // sinon le faux dashboard garderait Node en vie et le test ne finirait pas.
    await dashboard.arreter();
    await effacer();
    throw erreur;
  }
  dashboard.etat.recherches = 0;
  return {
    dossier,
    ...depot,
    dashboard,
    admin,
    lire: async (relatif) => JSON.parse(await fs.readFile(path.join(depot.racine, relatif), 'utf8')),
    ecrire: (relatif, texte) => fs.appendFile(path.join(depot.racine, relatif), texte),
    remplacer: (relatif, texte) => fs.writeFile(path.join(depot.racine, relatif), texte),
    git: (...args) => git(depot.racine, ...args),
    gitDistant: (...args) => git(depot.distant, ...args),
    async fermer() {
      await admin.arreter();
      await dashboard.arreter();
      await effacer();
    },
  };
}
