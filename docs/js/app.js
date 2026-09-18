/* Mémoire Vive — démarrage, routage, événements et thème.
   Modules ES sans dépendance ; toutes les données viennent de data.json,
   déjà préparé par scripts/export.py (titres, résumés, projets, liens). */
import { loadData, prepare, DataError } from './donnees.js';
import { parseHash, searchHash, defaultFilters } from './routes.js';
import { el, plural, formatLong, lastVisit } from './composants.js';
import { createListView } from './vues/entrees.js';
import { createEntryView } from './vues/fiche.js';
import { createProjectView } from './vues/projet.js';
import { createHomeView } from './vues/accueil.js';

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
  index: null,           // index de recherche (recherche.js)
  families: new Map(),
  since: null,           // dernière visite (ms) : entrées plus récentes « nouveau »
  filters: { q: '', ...defaultFilters() },
  shown: CONFIG.pageSize,
  showAllProjects: false,
  lastList: [],          // entrées de la vue affichée, pour « précédente / suivante »
  lastListHash: '#/',    // ancre de la dernière vue qui n'est pas une fiche
  scroll: new Map(),     // position de défilement par ancre
  route: null,
  entryDepth: 0,         // fiches ouvertes depuis la vue d'origine (pour « Retour »)
  openedId: '',          // dernière fiche ouverte, pour lui rendre le focus au retour
  firstRender: true,     // premier affichage : le focus reste en haut de page
};

const $ = (id) => document.getElementById(id);
const dom = {
  stats: $('stats'), listView: $('list-view'), entryView: $('entry-view'), pageView: $('page-view'),
  search: $('search-input'), sort: $('sort-select'),
  typeChips: $('type-chips'), projectChips: $('project-chips'), activeFilters: $('active-filters'),
  resultCount: $('result-count'), status: $('status'), grid: $('grid'), groups: $('groups'),
  more: $('more'), moreBtn: $('more-btn'), empty: $('empty'),
  themeToggle: $('theme-toggle'), navHome: $('nav-home'), navEntries: $('nav-entries'),
};

const ctx = { config: CONFIG, state, dom, route, setFilters, show, focusView };
ctx.list = createListView(ctx);
ctx.entry = createEntryView(ctx);
ctx.project = createProjectView(ctx);
ctx.home = createHomeView(ctx);

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
  dom.stats.textContent = '';
}

function init(data) {
  const model = prepare(data);
  state.data = model.data;
  state.entries = model.entries;
  state.projects = model.projects;
  state.typeOrder = model.typeOrder;
  state.index = model.index;
  state.families = model.families;
  // L'horodatage mémorisé est celui de l'export affiché : une entrée créée
  // avant la visite mais publiée après reste « nouvelle » à la suivante.
  state.since = lastVisit(() => window.localStorage, data.genere_le || new Date().toISOString());
  renderStats();
  dom.status.hidden = true;
  route();
  state.firstRender = false;
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

// ------------------------------------------------------------ vues

/* Affiche une des trois zones (liste, fiche, page) ; vide la fiche et la
   page quand elles sont masquées (identifiants de titres uniques). */
function show(section) {
  for (const zone of [dom.listView, dom.entryView, dom.pageView]) {
    zone.hidden = zone !== section;
    if (zone.hidden && zone !== dom.listView) zone.replaceChildren();
  }
}

/* Focus après l'affichage d'une page : au retour d'une fiche, sur le lien de
   cette fiche ; sinon sur le titre de la page, sauf au premier affichage et
   pendant la frappe dans la recherche. */
function focusView(returning) {
  if (returning && state.openedId) {
    const link = dom.pageView.querySelector('a[href="#/entree/' + state.openedId + '"]');
    if (link) { link.focus({ preventScroll: true }); return; }
  }
  if (state.firstRender || document.activeElement === dom.search) return;
  const title = dom.pageView.querySelector('#titre-vue');
  if (title) title.focus({ preventScroll: true });
}

// ------------------------------------------------------------ routage

/* Filtres de la liste pour une route qui l'affiche. En attendant sa vue
   (Task 11), la recherche affiche la liste filtrée. */
function listFilters(target) {
  const filters = { q: '', ...defaultFilters() };
  if (target.view === 'entries') Object.assign(filters, target.filters);
  if (target.view === 'search') filters.q = target.q;
  return filters;
}

function sameFilters(a, b) {
  return Object.keys(a).every((key) => a[key] === b[key]);
}

/* Entrées affichées par la vue d'une ancre, dans l'ordre (Précédente/Suivante). */
function sequenceFor(origin) {
  if (origin.view === 'project') return ctx.project.projectEntries(origin.id);
  state.filters = listFilters(origin);
  return ctx.list.filtered().list;
}

function route() {
  const next = parseHash(location.hash);
  if (next.view === 'redirect') {
    history.replaceState(history.state, '', next.hash);
    return route();
  }
  const previous = state.route;
  if (previous && previous.view !== 'entry') {
    state.scroll.set(state.lastListHash, window.scrollY);
  }
  state.route = next;
  if (next.view === 'entry') {
    openEntry(next, previous);
    return;
  }
  const returning = Boolean(previous && previous.view === 'entry' && !state.typing);
  state.lastListHash = location.hash || '#/';
  renderNav(next.view);
  if (next.view === 'home') {
    ctx.home.showHome({ returning });
    window.scrollTo(0, returning ? state.scroll.get(state.lastListHash) || 0 : 0);
    return;
  }
  if (next.view === 'project') {
    ctx.project.showProject(next.id, { returning });
    window.scrollTo(0, returning ? state.scroll.get(state.lastListHash) || 0 : 0);
    return;
  }
  const filters = listFilters(next);
  if (!sameFilters(filters, state.filters)) {
    state.filters = filters;
    state.shown = CONFIG.pageSize;
  }
  ctx.list.showList(returning);
}

/* Onglets de l'en-tête : la rubrique affichée porte aria-current. */
function renderNav(view) {
  for (const [link, name] of [[dom.navHome, 'home'], [dom.navEntries, 'entries']]) {
    if (view === name) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
}

function openEntry(next, previous) {
  // Le contexte (vue d'origine, nombre de fiches ouvertes depuis elle) vit
  // dans history.state : il survit au rechargement et au retour arrière, et
  // Précédente/Suivante le reprennent tel quel.
  const saved = history.state && typeof history.state.list === 'string' ? history.state : null;
  if (saved) {
    state.entryDepth = Number(saved.depth) || 0;
    const origin = parseHash(saved.list);
    if (saved.list !== state.lastListHash && origin.view !== 'entry' && origin.view !== 'redirect') {
      state.lastListHash = saved.list;
      state.lastList = sequenceFor(origin);
    }
  } else if (previous && previous.view !== 'entry') {
    state.entryDepth = 1;
  } else if (previous && previous.view === 'entry') {
    state.entryDepth = state.entryDepth > 0 ? state.entryDepth + 1 : 0;
  } else {
    state.entryDepth = 0;
  }
  history.replaceState({ list: state.lastListHash, depth: state.entryDepth }, '');
  renderNav('entry');
  ctx.entry.showEntry(next.id);
}

/* Frappe dans la barre de recherche : la première frappe ouvre #/recherche
   (nouvelle entrée d'historique), les suivantes remplacent cette entrée. */
function typeSearch(q) {
  if (!q) { leaveSearch(); return; }
  const onSearch = state.route && state.route.view === 'search';
  if (onSearch) history.replaceState(history.state, '', searchHash(q));
  else history.pushState({ typed: true }, '', searchHash(q));
  // Quitter une vue en tapant (même une fiche) n'est pas un « retour » :
  // le focus reste dans le champ.
  state.typing = true;
  try { route(); } finally { state.typing = false; }
}

/* Recherche vidée : retour à la vue d'où la frappe est partie, sinon à l'accueil. */
function leaveSearch() {
  if (!state.route || state.route.view !== 'search') return;
  if (history.state && history.state.typed) {
    history.back();
  } else {
    history.replaceState(null, '', '#/');
    route();
  }
}

function setFilters(patch) {
  // Le bouton cliqué est souvent reconstruit par le rendu : on rend le
  // focus à son équivalent (même data-focus-key), sinon au compteur de
  // résultats, plutôt que de le laisser tomber sur <body>.
  const active = document.activeElement;
  const focusKey = active && active.dataset ? active.dataset.focusKey : '';
  Object.assign(state.filters, patch);
  state.shown = CONFIG.pageSize;
  const hash = ctx.list.listHash(state.filters);
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
    searchTimer = setTimeout(() => typeSearch(dom.search.value.trim()), 120);
  });
  dom.search.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && dom.search.value) {
      event.preventDefault();
      clearTimeout(searchTimer);
      dom.search.value = '';
      leaveSearch();
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

  // Délégation : tags (cartes, fiches) et groupes de la vue « Par projet ».
  document.addEventListener('click', (event) => {
    const target = event.target.closest('[data-action]');
    if (!target || !state.data) return;
    const action = target.dataset.action;
    if (action !== 'tag' && action !== 'group') return;
    event.preventDefault();
    if (action === 'group') {
      setFilters({ projet: target.dataset.project });
      window.scrollTo(0, 0);
      return;
    }
    const patch = { tag: target.dataset.tag, type: '', projet: '', q: '' };
    if (dom.listView.hidden) {
      location.hash = ctx.list.listHash(Object.assign({}, state.filters, patch));
    } else {
      setFilters(patch);
      window.scrollTo(0, 0);
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey || isTyping(event.target) || !state.data) return;
    const inEntry = state.route && state.route.view === 'entry';
    if (event.key === '/') {
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
