/* Données : chargement de data.json (messages d'erreur clairs) et
   préparation du modèle affiché (champs dérivés, projets, ordre des types). */
import { normalize } from './recherche.js';
import { typeLabel, isWebUrl } from './composants.js';

export const NO_PROJECT = '_aucun';

export class DataError extends Error {}

/* Chemin relatif et même origine : fonctionne sous github.io, sous un domaine
   personnalisé et derrière Cloudflare Access (le cookie de session part avec
   la requête), sans rien changer ici. */
export async function loadData(url, supportedSchema, fetcher = fetch) {
  let response;
  try {
    response = await fetcher(url, { cache: 'no-cache', credentials: 'same-origin' });
  } catch (e) {
    // Réseau coupé, ou redirection vers une page de connexion (Cloudflare
    // Access, session expirée) que le navigateur refuse de suivre en fetch.
    throw new DataError("Impossible de charger les données. Si le site est protégé par une connexion, la session a peut-être expiré.");
  }
  if (!response.ok) {
    throw new DataError(response.status === 404
      ? "Aucune donnée publiée pour l'instant (data.json absent) : lancer l'export."
      : 'Erreur ' + response.status + ' au chargement des données.');
  }
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('json')) {
    throw new DataError("Les données n'ont pas pu être lues : le serveur a renvoyé une page au lieu du fichier attendu (session expirée ?).");
  }
  let data;
  try {
    data = await response.json();
  } catch (e) {
    throw new DataError('Le fichier de données est illisible (JSON invalide).');
  }
  if (!data || !Array.isArray(data.entrees)) {
    throw new DataError('Le fichier de données a un format inattendu.');
  }
  if (Number(data.schema) > supportedSchema) {
    throw new DataError('Les données sont plus récentes que cette version du site : recharger la page.');
  }
  return data;
}

export function prepare(data) {
  const projects = new Map();
  for (const project of data.projets || []) projects.set(project.id, project);

  const entries = data.entrees.map((entry) => {
    const tags = Array.isArray(entry.tags) ? entry.tags.map(String) : [];
    const liens = Array.isArray(entry.liens) ? entry.liens.filter((l) => l && l.valeur) : [];
    const project = entry.projet ? projects.get(entry.projet) : null;
    const projectName = project ? project.nom : (entry.projet || 'Sans projet');
    const meta = normalize([tags.join(' '), projectName, entry.projet, typeLabel(entry.type), entry.type].join(' '));
    const title = normalize(entry.titre);
    const resume = normalize(entry.resume);
    const content = normalize(entry.contenu);
    return Object.assign({}, entry, {
      tags,
      liens,
      _title: title,
      _resume: resume,
      _content: content,
      _meta: meta,
      _hay: [title, resume, content, meta, normalize(liens.map((l) => l.valeur).join(' '))].join('\n'),
      _tags: tags.map(normalize),
      _time: Date.parse(entry.cree_le) || 0,
      _project: entry.projet || NO_PROJECT,
      _projectName: projectName,
      _short: String(entry.id || '').slice(0, 12),
      _online: liens.filter((l) => l.type === 'en_ligne' && isWebUrl(l.valeur)).length,
      _invalid: liens.filter((l) => l.type === 'en_ligne' && !isWebUrl(l.valeur)).length,
      _local: liens.filter((l) => l.type !== 'en_ligne').length,
    });
  });

  const known = Array.isArray(data.ordre_types) ? data.ordre_types : [];
  const present = Array.from(new Set(entries.map((e) => e.type)));
  const typeOrder = known.filter((t) => present.includes(t)).concat(present.filter((t) => !known.includes(t)).sort());

  return { data, entries, projects, typeOrder };
}
