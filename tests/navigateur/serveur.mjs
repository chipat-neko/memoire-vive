/* Serveur statique minimal (Node seul, aucune dépendance) : sert docs/ sous
   /memoire-vive/, comme GitHub Pages, pour que les tests vérifient aussi les
   chemins relatifs du site. Lancement direct : node tests/navigateur/serveur.mjs [port] */
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const RACINE_DOCS = fileURLToPath(new URL('../../docs/', import.meta.url));
export const PREFIXE = '/memoire-vive/';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

function repondre(res, code, texte, entetes = {}) {
  res.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8', ...entetes });
  res.end(texte);
}

export function creerServeur(racine = RACINE_DOCS) {
  const base = path.resolve(racine);
  return http.createServer(async (req, res) => {
    let chemin;
    try {
      chemin = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    } catch {
      return repondre(res, 400, 'Requête invalide');
    }
    if (chemin === PREFIXE.slice(0, -1)) return repondre(res, 301, '', { Location: PREFIXE });
    if (!chemin.startsWith(PREFIXE)) return repondre(res, 404, 'Introuvable');
    let relatif = chemin.slice(PREFIXE.length);
    if (relatif === '' || relatif.endsWith('/')) relatif += 'index.html';
    const fichier = path.resolve(base, relatif);
    if (!fichier.startsWith(base + path.sep)) return repondre(res, 404, 'Introuvable');
    try {
      const contenu = await fs.readFile(fichier);
      res.writeHead(200, {
        'Content-Type': TYPES[path.extname(fichier).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      res.end(req.method === 'HEAD' ? undefined : contenu);
    } catch {
      repondre(res, 404, 'Introuvable');
    }
  });
}

/* Démarre sur un port libre choisi par le système ; renvoie l'URL du site
   (avec le préfixe) et une fonction d'arrêt. */
export async function demarrerServeur(racine = RACINE_DOCS) {
  const serveur = creerServeur(racine);
  await new Promise((ok, ko) => {
    serveur.once('error', ko);
    serveur.listen(0, '127.0.0.1', ok);
  });
  const { port } = serveur.address();
  return {
    url: `http://127.0.0.1:${port}${PREFIXE}`,
    arreter: () => new Promise((ok) => {
      serveur.closeAllConnections();
      serveur.close(() => ok());
    }),
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.argv[2]) || 8080;
  creerServeur().listen(port, '127.0.0.1', () => {
    console.log(`Mémoire Vive en local : http://127.0.0.1:${port}${PREFIXE}  (Ctrl+C pour arrêter)`);
  });
}
