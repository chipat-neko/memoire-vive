/* Mémoire Vive — démarrage, routage, événements et thème.
   Modules ES sans dépendance ; toutes les données viennent de data.json,
   déjà préparé par scripts/export.py (titres, résumés, projets, liens). */
import { loadData, prepare, DataError } from './donnees.js';
import { listHash, parseRoute, filtersFromParams, sameFilters } from './routes.js';
import { el, plural, formatLong } from './composants.js';
import { createListView } from './vues/entrees.js';
import { createEntryView } from './vues/fiche.js';

const CONFIG = {
  dataUrl: 'data.json',
  supportedSchema: 1,
  pageSize: 60,       // cartes affichées avant « Afficher plus »
  groupPreview: 6,    // entrées par projet dans la vue « Par projet »
  projectChips: 10,   // projets affichés avant « + N autres »
};
const THEME_KEY = 'memoire-vive:theme';

const state = {
  data: null,
  entries: [],
  projects: new Map(),
  typeOrder: [],
  filters: { q: '', type: '', projet: '', tag: '', tri: '', vue: 'grille' },
  shown: CONFIG.pageSize,
  showAllProjects: false,
  lastList: [],          // résultat affiché, pour « précédente / suivante »
  lastListHash: '#/',
  scroll: new Map(),     // position de défilement par état de liste
  route: null,
  entryDepth: 0,         // fiches ouvertes depuis la liste (pour « Retour »)
  openedId: '',          // dernière fiche ouverte, pour lui rendre le focus au retour
};

const $ = (id) => document.getElementById(id);
const dom = {
  stats: $('stats'), listView: $('list-view'), entryView: $('entry-view'),
  search: $('search-input'), sort: $('sort-select'),
  typeChips: $('type-chips'), projectChips: $('project-chips'), activeFilters: $('active-filters'),
  resultCount: $('result-count'), status: $('status'), grid: $('grid'), groups: $('groups'),
  more: $('more'), moreBtn: $('more-btn'), empty: $('empty'),
  themeToggle: $('theme-toggle'),
};

const ctx = { config: CONFIG, state, dom, route, setFilters };
ctx.list = createListView(ctx);
ctx.entry = createEntryView(ctx);

// ------------------------------------------------------------ données

async function load() {
  let data;
  try {
    data = await loadData(CONFIG.dataUrl, CONFIG.supportedSchema);
  } catch (e) {
    if (e instanceof DataError) return fail(e.message);
    throw e;
  }
  init(data);
}

function fail(message) {
  dom.status.hidden = false;
  dom.status.classList.add('error');
  const button = el('button', { type: 'button', class: 'btn-secondary' }, 'Recharger la page');
  button.addEventListener('click', () => location.reload());
  dom.status.replaceChildren(el('p', null, message), button);
  dom.grid.hidden = true;
  dom.groups.hidden = true;
  dom.stats.textContent = '';
}

function init(data) {
  const model = prepare(data);
  state.data = model.data;
  state.entries = model.entries;
  state.projects = model.projects;
  state.typeOrder = model.typeOrder;
  renderStats();
  dom.status.hidden = true;
  route();
}

function renderStats() {
  const online = state.entries.reduce((sum, e) => sum + e._online, 0);
  const parts = [
    plural(state.entries.length, 'entrée', 'entrées'),
    plural(state.projects.size, 'projet', 'projets'),
    plural(online, 'lien en ligne', 'liens en ligne'),
  ];
  if (state.data.genere_le) parts.push('export du ' + formatLong(state.data.genere_le));
  dom.stats.textContent = parts.join(' · ');
}

// ------------------------------------------------------------ routage

function route() {
  const previous = state.route;
  const next = parseRoute(location.hash);
  if (previous && previous.view === 'list') {
    state.scroll.set(state.lastListHash, window.scrollY);
  }
  state.route = next;

  if (next.view === 'entry') {
    // Le contexte (liste d'origine, nombre de fiches ouvertes depuis elle)
    // vit dans history.state : il survit au rechargement et au retour
    // arrière, et Précédente/Suivante le reprennent tel quel.
    const saved = history.state && typeof history.state.list === 'string' ? history.state : null;
    if (saved) {
      state.entryDepth = Number(saved.depth) || 0;
      if (saved.list !== state.lastListHash && saved.list.startsWith('#/')) {
        const index = saved.list.indexOf('?');
        state.filters = filtersFromParams(new URLSearchParams(index >= 0 ? saved.list.slice(index + 1) : ''));
        state.lastListHash = saved.list;
        state.lastList = ctx.list.filtered().list;
      }
    } else if (previous && previous.view === 'list') {
      state.entryDepth = 1;
    } else if (previous && previous.view === 'entry') {
      state.entryDepth = state.entryDepth > 0 ? state.entryDepth + 1 : 0;
    } else {
      state.entryDepth = 0;
    }
    history.replaceState({ list: state.lastListHash, depth: state.entryDepth }, '');
    ctx.entry.showEntry(next.id);
    return;
  }
  const filters = filtersFromParams(next.params);
  if (!sameFilters(filters, state.filters)) {
    state.filters = filters;
    state.shown = CONFIG.pageSize;
  }
  ctx.list.showList(previous && previous.view === 'entry');
}

function setFilters(patch) {
  // Le bouton cliqué est souvent reconstruit par le rendu : on rend le
  // focus à son équivalent (même data-focus-key), sinon au compteur de
  // résultats, plutôt que de le laisser tomber sur <body>.
  const active = document.activeElement;
  const focusKey = active && active.dataset ? active.dataset.focusKey : '';
  Object.assign(state.filters, patch);
  state.shown = CONFIG.pageSize;
  const hash = listHash(state.filters);
  history.replaceState(null, '', hash);
  state.lastListHash = hash;
  ctx.list.renderList();
  if (active && active !== document.body && !active.isConnected) {
    const again = focusKey && document.querySelector('[data-focus-key="' + CSS.escape(focusKey) + '"]');
    (again || dom.resultCount).focus({ preventScroll: true });
  }
}

// ------------------------------------------------------------ thème

const THEMES = [
  { value: '', label: 'Auto' },
  { value: 'light', label: 'Clair' },
  { value: 'dark', label: 'Sombre' },
];

function currentTheme() {
  return document.documentElement.getAttribute('data-theme') || '';
}

function renderThemeToggle() {
  const theme = THEMES.find((t) => t.value === currentTheme()) || THEMES[0];
  dom.themeToggle.querySelector('.theme-label').textContent = theme.label;
  dom.themeToggle.setAttribute('aria-label', 'Thème : ' + theme.label + ' (cliquer pour changer)');
}

function cycleTheme() {
  const index = THEMES.findIndex((t) => t.value === currentTheme());
  const next = THEMES[(index + 1) % THEMES.length].value;
  if (next) document.documentElement.setAttribute('data-theme', next);
  else document.documentElement.removeAttribute('data-theme');
  try {
    if (next) localStorage.setItem(THEME_KEY, next);
    else localStorage.removeItem(THEME_KEY);
  } catch (e) { /* stockage indisponible : le choix vaut pour cette page */ }
  renderThemeToggle();
}

// ------------------------------------------------------------ événements

function isTyping(target) {
  return target instanceof HTMLElement
    && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
}

function bind() {
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  // Seules les ancres « #/… » sont des routes : « #contenu » (lien
  // d'évitement sans JS) ne doit pas vider les filtres.
  window.addEventListener('hashchange', () => {
    if (state.data && (!location.hash || location.hash.startsWith('#/'))) route();
  });
  document.querySelector('.skip-link').addEventListener('click', (event) => {
    event.preventDefault();
    const target = state.route && state.route.view === 'entry' ? $('entry-title') : $('contenu');
    (target || $('contenu')).focus();
  });

  let searchTimer = null;
  dom.search.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => setFilters({ q: dom.search.value.trim() }), 120);
  });
  dom.search.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && dom.search.value) {
      event.preventDefault();
      dom.search.value = '';
      setFilters({ q: '' });
    }
  });
  dom.sort.addEventListener('change', () => setFilters({ tri: dom.sort.value === 'recent' && !state.filters.q ? '' : dom.sort.value }));
  for (const button of document.querySelectorAll('.segmented button')) {
    button.addEventListener('click', () => setFilters({ vue: button.dataset.view }));
  }
  dom.moreBtn.addEventListener('click', () => {
    const firstNew = state.shown;
    state.shown += CONFIG.pageSize;
    ctx.list.renderList();
    // Le focus passe à la première carte ajoutée (le bouton peut disparaître).
    const link = dom.grid.querySelectorAll('.card h3 a')[firstNew];
    if (link) link.focus();
  });

  // Délégation : projets et tags, dans la liste comme sur une fiche.
  document.addEventListener('click', (event) => {
    const target = event.target.closest('[data-action]');
    if (!target || !state.data) return;
    const action = target.dataset.action;
    if (action !== 'project' && action !== 'tag' && action !== 'group') return;
    event.preventDefault();
    if (action === 'group') {
      setFilters({ projet: target.dataset.project });
      window.scrollTo(0, 0);
      return;
    }
    const patch = action === 'project'
      ? { projet: target.dataset.project, type: '', tag: '', q: '' }
      : { tag: target.dataset.tag, type: '', projet: '', q: '' };
    if (state.route && state.route.view === 'entry') {
      const filters = Object.assign({}, state.filters, patch);
      location.hash = listHash(filters);
    } else {
      setFilters(patch);
      window.scrollTo(0, 0);
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey || isTyping(event.target) || !state.data) return;
    const inEntry = state.route && state.route.view === 'entry';
    if (event.key === '/' && !inEntry) {
      event.preventDefault();
      dom.search.focus();
      dom.search.select();
    } else if (inEntry && event.key === 'Escape') {
      const back = dom.entryView.querySelector('.entry-nav a, .not-found a');
      if (back) back.click();
    } else if (inEntry && !event.shiftKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
      // Maj+Flèche et sélection en cours : laisser le navigateur sélectionner du texte.
      const selection = window.getSelection();
      if (selection && !selection.isCollapsed) return;
      const link = dom.entryView.querySelector(event.key === 'ArrowLeft' ? 'a[rel="prev"]' : 'a[rel="next"]');
      if (link) link.click();
    }
  });

  dom.themeToggle.addEventListener('click', cycleTheme);
  renderThemeToggle();
}

bind();
load();
