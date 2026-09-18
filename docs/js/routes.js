/* Routes : analyse et construction des ancres (#/…). Module pur. */

export const SORTS = ['recent', 'ancien', 'pertinence', 'projet'];
export const VIEWS = ['grille', 'projets'];

export function listHash(filters) {
  const params = new URLSearchParams();
  if (filters.q) params.set('q', filters.q);
  if (filters.type) params.set('type', filters.type);
  if (filters.projet) params.set('projet', filters.projet);
  if (filters.tag) params.set('tag', filters.tag);
  if (filters.tri) params.set('tri', filters.tri);
  if (filters.vue !== 'grille') params.set('vue', filters.vue);
  const query = params.toString();
  return '#/' + (query ? '?' + query : '');
}

export function entryHash(entry) {
  return '#/entree/' + entry._short;
}

export function parseRoute(hash) {
  hash = String(hash || '').replace(/^#/, '');
  const match = hash.match(/^\/entree\/([0-9a-f]{6,64})\/?$/i);
  if (match) return { view: 'entry', id: match[1].toLowerCase() };
  const index = hash.indexOf('?');
  return { view: 'list', params: new URLSearchParams(index >= 0 ? hash.slice(index + 1) : '') };
}

export function filtersFromParams(params) {
  const tri = params.get('tri') || '';
  const vue = params.get('vue') || 'grille';
  return {
    q: params.get('q') || '',
    type: params.get('type') || '',
    projet: params.get('projet') || '',
    tag: params.get('tag') || '',
    tri: SORTS.includes(tri) ? tri : '',
    vue: VIEWS.includes(vue) ? vue : 'grille',
  };
}

export function sameFilters(a, b) {
  return Object.keys(a).every((key) => a[key] === b[key]);
}
