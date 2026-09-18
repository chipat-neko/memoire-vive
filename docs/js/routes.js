/* Routes : analyse et construction des ancres (#/…). Module pur.
   #/                        accueil
   #/entrees?type=&projet=&famille=&tag=&tri=&vue=   toutes les entrées
   #/recherche?q=…           résultats de recherche
   #/projet/<id>             page d'un projet
   #/entree/<id court>       fiche d'une entrée
   Les anciennes ancres « #/?q=…&type=… » redirigent vers leur équivalent. */

export const SORTS = ['recent', 'ancien', 'projet'];
export const VIEWS = ['grille', 'projets'];
const FILTER_KEYS = ['type', 'projet', 'famille', 'tag'];

export function defaultFilters() {
  return { type: '', projet: '', famille: '', tag: '', tri: '', vue: 'grille' };
}

export function filtersFromParams(params) {
  const filters = defaultFilters();
  for (const key of FILTER_KEYS) filters[key] = params.get(key) || '';
  const tri = params.get('tri') || '';
  const vue = params.get('vue') || '';
  if (SORTS.includes(tri)) filters.tri = tri;
  if (VIEWS.includes(vue)) filters.vue = vue;
  return filters;
}

export function entriesHash(filters) {
  const params = new URLSearchParams();
  for (const key of FILTER_KEYS) if (filters[key]) params.set(key, filters[key]);
  if (SORTS.includes(filters.tri)) params.set('tri', filters.tri);
  if (filters.vue && filters.vue !== 'grille' && VIEWS.includes(filters.vue)) params.set('vue', filters.vue);
  const query = params.toString();
  return '#/entrees' + (query ? '?' + query : '');
}

export function searchHash(q) {
  return q ? '#/recherche?' + new URLSearchParams({ q }).toString() : '#/recherche';
}

export function projectHash(id) {
  return '#/projet/' + encodeURIComponent(id);
}

export function entryHash(entry) {
  return '#/entree/' + entry._short;
}

/* Route : { view: 'home' | 'entries' | 'search' | 'project' | 'entry' | 'redirect', … }.
   'redirect' porte l'ancre de remplacement (ancienne ancre ou ancre inconnue). */
export function parseHash(hash) {
  const text = String(hash || '').replace(/^#/, '');
  if (text === '' || text === '/') return { view: 'home' };
  const index = text.indexOf('?');
  const path = index >= 0 ? text.slice(0, index) : text;
  const params = new URLSearchParams(index >= 0 ? text.slice(index + 1) : '');

  if (path === '/' || path === '') {
    const q = (params.get('q') || '').trim();
    return { view: 'redirect', hash: q ? searchHash(q) : entriesHash(filtersFromParams(params)) };
  }
  if (path === '/entrees' || path === '/entrees/') return { view: 'entries', filters: filtersFromParams(params) };
  if (path === '/recherche' || path === '/recherche/') return { view: 'search', q: (params.get('q') || '').trim() };
  const entry = path.match(/^\/entree\/([0-9a-f]{6,64})\/?$/i);
  if (entry) return { view: 'entry', id: entry[1].toLowerCase() };
  const project = path.match(/^\/projet\/([^/]+)\/?$/);
  if (project) {
    try {
      return { view: 'project', id: decodeURIComponent(project[1]) };
    } catch (e) {
      return { view: 'redirect', hash: '#/' };
    }
  }
  return { view: 'redirect', hash: '#/' };
}
