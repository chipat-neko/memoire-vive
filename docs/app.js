/* Mémoire Vive — affichage, recherche et filtres de la mémoire partagée.
   Vanilla JS, aucune dépendance. Toutes les données viennent de data.json,
   déjà préparé par scripts/export.py (titres, résumés, projets, liens). */
'use strict';

(function () {
  const CONFIG = {
    // Chemin relatif et même origine : fonctionne sous github.io, sous un
    // domaine personnalisé et derrière Cloudflare Access (le cookie de
    // session part avec la requête), sans rien changer ici.
    dataUrl: 'data.json',
    supportedSchema: 1,
    pageSize: 60,       // cartes affichées avant « Afficher plus »
    groupPreview: 6,    // entrées par projet dans la vue « Par projet »
    projectChips: 10,   // projets affichés avant « + N autres »
  };

  const NO_PROJECT = '_aucun';
  const TYPE_LABELS = {
    note: 'Note', milestone: 'Jalon', decision: 'Décision', reference: 'Référence',
    architecture: 'Architecture', observation: 'Observation', error: 'Erreur',
  };
  const TYPE_PLURALS = {
    note: 'notes', milestone: 'jalons', decision: 'décisions', reference: 'références',
    architecture: 'architectures', observation: 'observations', error: 'erreurs',
  };
  const SORTS = ['recent', 'ancien', 'pertinence', 'projet'];
  const VIEWS = ['grille', 'projets'];
  const THEME_KEY = 'memoire-vive:theme';

  const fmtDay = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
  const fmtLong = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short' });

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
    replacing: false,      // navigation Précédente/Suivante sans nouvelle entrée d'historique
  };

  const $ = (id) => document.getElementById(id);
  const dom = {
    stats: $('stats'), listView: $('list-view'), entryView: $('entry-view'),
    search: $('search-input'), sort: $('sort-select'),
    typeChips: $('type-chips'), projectChips: $('project-chips'), activeFilters: $('active-filters'),
    resultCount: $('result-count'), status: $('status'), grid: $('grid'), groups: $('groups'),
    more: $('more'), moreBtn: $('more-btn'), empty: $('empty'), toast: $('toast'),
    themeToggle: $('theme-toggle'),
  };

  // ------------------------------------------------------------ utilitaires

  function el(tag, attrs, ...children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const [key, value] of Object.entries(attrs)) {
        if (value == null || value === false) continue;
        if (key === 'class') node.className = value;
        else if (key === 'text') node.textContent = value;
        else node.setAttribute(key, value === true ? '' : String(value));
      }
    }
    for (const child of children.flat()) {
      if (child == null || child === false) continue;
      node.append(child instanceof Node ? child : String(child));
    }
    return node;
  }

  function normalize(text) {
    // « cœur » se trouve en tapant « coeur », « l’atelier » en tapant « l'atelier ».
    return String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
      .replace(/œ/g, 'oe').replace(/æ/g, 'ae').replace(/[’‘]/g, "'");
  }

  function queryTerms(query) {
    return normalize(query).split(/\s+/).filter(Boolean);
  }

  function typeLabel(type) {
    if (TYPE_LABELS[type]) return TYPE_LABELS[type];
    if (!type) return 'Divers';
    const text = type.replace(/_/g, ' ');
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  function plural(count, one, many) {
    return count + ' ' + (count > 1 ? many : one);
  }

  function typeCount(type, count) {
    const one = typeLabel(type).toLowerCase();
    return plural(count, one, TYPE_PLURALS[type] || one + 's');
  }

  function formatDay(iso) {
    const time = Date.parse(iso);
    return Number.isNaN(time) ? '' : fmtDay.format(time);
  }

  function formatLong(iso) {
    const time = Date.parse(iso);
    return Number.isNaN(time) ? '' : fmtLong.format(time);
  }

  function isWebUrl(value) {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' || url.protocol === 'http:';
    } catch (e) {
      return false;
    }
  }

  let toastTimer = null;
  function toast(message) {
    dom.toast.textContent = message;
    dom.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => dom.toast.classList.remove('show'), 2600);
  }

  async function copy(text, label) {
    try {
      await navigator.clipboard.writeText(text);
    } catch (e) {
      const area = el('textarea', { readonly: true, class: 'visually-hidden' });
      area.value = text;
      document.body.append(area);
      area.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
      area.remove();
      if (!ok) { toast('Copie impossible dans ce navigateur.'); return; }
    }
    toast(label || 'Copié.');
  }

  /* Surligne les termes cherchés sans innerHTML : la correspondance se fait
     sur le texte normalisé (sans accents), puis est reportée sur l'original. */
  function highlight(text, terms) {
    const fragment = document.createDocumentFragment();
    text = String(text || '');
    if (!terms.length || !text) { fragment.append(text); return fragment; }

    let normalized = '';
    const map = [];
    for (let i = 0; i < text.length;) {
      const char = String.fromCodePoint(text.codePointAt(i));
      const norm = normalize(char);
      for (let k = 0; k < norm.length; k++) map.push(i);
      normalized += norm;
      i += char.length;
    }
    map.push(text.length);

    const ranges = [];
    for (const term of terms) {
      let from = 0;
      let index;
      while ((index = normalized.indexOf(term, from)) !== -1) {
        ranges.push([map[index], map[index + term.length]]);
        from = index + term.length;
      }
    }
    if (!ranges.length) { fragment.append(text); return fragment; }

    ranges.sort((a, b) => a[0] - b[0]);
    const merged = [ranges[0].slice()];
    for (const [start, end] of ranges.slice(1)) {
      const last = merged[merged.length - 1];
      if (start <= last[1]) last[1] = Math.max(last[1], end);
      else merged.push([start, end]);
    }
    let cursor = 0;
    for (const [start, end] of merged) {
      if (start > cursor) fragment.append(text.slice(cursor, start));
      fragment.append(el('mark', null, text.slice(start, end)));
      cursor = end;
    }
    if (cursor < text.length) fragment.append(text.slice(cursor));
    return fragment;
  }

  // ------------------------------------------------------------ données

  async function load() {
    let response;
    try {
      response = await fetch(CONFIG.dataUrl, { cache: 'no-cache', credentials: 'same-origin' });
    } catch (e) {
      // Réseau coupé, ou redirection vers une page de connexion (Cloudflare
      // Access, session expirée) que le navigateur refuse de suivre en fetch.
      return fail("Impossible de charger les données. Si le site est protégé par une connexion, la session a peut-être expiré.", true);
    }
    if (!response.ok) {
      return fail(response.status === 404
        ? "Aucune donnée publiée pour l'instant (data.json absent) : lancer l'export."
        : 'Erreur ' + response.status + ' au chargement des données.', true);
    }
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('json')) {
      return fail("Les données n'ont pas pu être lues : le serveur a renvoyé une page au lieu du fichier attendu (session expirée ?).", true);
    }
    let data;
    try {
      data = await response.json();
    } catch (e) {
      return fail('Le fichier de données est illisible (JSON invalide).', true);
    }
    if (!data || !Array.isArray(data.entrees)) {
      return fail('Le fichier de données a un format inattendu.', true);
    }
    if (Number(data.schema) > CONFIG.supportedSchema) {
      return fail('Les données sont plus récentes que cette version du site : recharger la page.', true);
    }
    init(data);
  }

  function fail(message, withReload) {
    dom.status.hidden = false;
    dom.status.classList.add('error');
    dom.status.replaceChildren(el('p', null, message));
    if (withReload) {
      const button = el('button', { type: 'button', class: 'btn-secondary' }, 'Recharger la page');
      button.addEventListener('click', () => location.reload());
      dom.status.append(button);
    }
    dom.grid.hidden = true;
    dom.groups.hidden = true;
    dom.stats.textContent = '';
  }

  function init(data) {
    state.data = data;
    for (const project of data.projets || []) state.projects.set(project.id, project);

    state.entries = data.entrees.map((entry) => {
      const tags = Array.isArray(entry.tags) ? entry.tags.map(String) : [];
      const liens = Array.isArray(entry.liens) ? entry.liens.filter((l) => l && l.valeur) : [];
      const project = entry.projet ? state.projects.get(entry.projet) : null;
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
    const present = Array.from(new Set(state.entries.map((e) => e.type)));
    state.typeOrder = known.filter((t) => present.includes(t)).concat(present.filter((t) => !known.includes(t)).sort());

    renderStats();
    dom.status.hidden = true;
    route();
  }

  function renderStats() {
    const data = state.data;
    const online = state.entries.reduce((sum, e) => sum + e._online, 0);
    const parts = [
      plural(state.entries.length, 'entrée', 'entrées'),
      plural(state.projects.size, 'projet', 'projets'),
      plural(online, 'lien en ligne', 'liens en ligne'),
    ];
    if (data.genere_le) parts.push('export du ' + formatLong(data.genere_le));
    dom.stats.textContent = parts.join(' · ');
  }

  // ------------------------------------------------------------ filtres

  function effectiveSort() {
    const f = state.filters;
    if (f.tri === 'pertinence' && !f.q) return 'recent';
    return f.tri || (f.q ? 'pertinence' : 'recent');
  }

  function matches(entry, terms, except) {
    const f = state.filters;
    if (except !== 'type' && f.type && entry.type !== f.type) return false;
    if (except !== 'projet' && f.projet && entry._project !== f.projet) return false;
    if (f.tag && !entry._tags.includes(normalize(f.tag))) return false;
    for (const term of terms) if (!entry._hay.includes(term)) return false;
    return true;
  }

  function occurrences(haystack, needle) {
    let count = 0;
    let index = haystack.indexOf(needle);
    while (index !== -1 && count < 5) { count++; index = haystack.indexOf(needle, index + needle.length); }
    return count;
  }

  function relevance(entry, terms) {
    let score = 0;
    for (const term of terms) {
      if (entry._title.includes(term)) score += 6;
      if (entry._meta.includes(term)) score += 3;
      if (entry._resume.includes(term)) score += 2;
      score += occurrences(entry._content, term);
    }
    return score;
  }

  function typeRank(type) {
    const index = state.typeOrder.indexOf(type);
    return index === -1 ? state.typeOrder.length : index;
  }

  function sortEntries(list, terms) {
    const byRecent = (a, b) => b._time - a._time || (a.id < b.id ? -1 : 1);
    switch (effectiveSort()) {
      case 'ancien':
        return list.sort((a, b) => -byRecent(a, b));
      case 'pertinence': {
        const scores = new Map(list.map((e) => [e, relevance(e, terms)]));
        return list.sort((a, b) => scores.get(b) - scores.get(a) || byRecent(a, b));
      }
      case 'projet':
        return list.sort((a, b) =>
          (a._project === NO_PROJECT) - (b._project === NO_PROJECT)
          || a._projectName.localeCompare(b._projectName, 'fr', { sensitivity: 'base' })
          || typeRank(a.type) - typeRank(b.type)
          || byRecent(a, b));
      default:
        return list.sort(byRecent);
    }
  }

  function filtered() {
    const terms = queryTerms(state.filters.q);
    return { terms, list: sortEntries(state.entries.filter((e) => matches(e, terms)), terms) };
  }

  // ------------------------------------------------------------ routage

  function listHash(filters) {
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

  function entryHash(entry) {
    return '#/entree/' + entry._short;
  }

  function parseRoute() {
    const hash = location.hash.replace(/^#/, '');
    const match = hash.match(/^\/entree\/([0-9a-f]{6,64})\/?$/i);
    if (match) return { view: 'entry', id: match[1].toLowerCase() };
    const index = hash.indexOf('?');
    return { view: 'list', params: new URLSearchParams(index >= 0 ? hash.slice(index + 1) : '') };
  }

  function filtersFromParams(params) {
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

  function sameFilters(a, b) {
    return Object.keys(a).every((key) => a[key] === b[key]);
  }

  function route() {
    const previous = state.route;
    const next = parseRoute();
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
          state.lastList = filtered().list;
        }
      } else if (previous && previous.view === 'list') {
        state.entryDepth = 1;
      } else if (previous && previous.view === 'entry') {
        state.entryDepth = state.entryDepth > 0 ? state.entryDepth + 1 : 0;
      } else {
        state.entryDepth = 0;
      }
      history.replaceState({ list: state.lastListHash, depth: state.entryDepth }, '');
      showEntry(next.id);
      return;
    }
    const filters = filtersFromParams(next.params);
    if (!sameFilters(filters, state.filters)) {
      state.filters = filters;
      state.shown = CONFIG.pageSize;
    }
    showList(previous && previous.view === 'entry');
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
    renderList();
    if (active && active !== document.body && !active.isConnected) {
      const again = focusKey && document.querySelector('[data-focus-key="' + CSS.escape(focusKey) + '"]');
      (again || dom.resultCount).focus({ preventScroll: true });
    }
  }

  // ------------------------------------------------------------ vue liste

  function showList(restoreScroll) {
    dom.entryView.hidden = true;
    dom.entryView.replaceChildren();
    dom.listView.hidden = false;
    document.title = 'Mémoire Vive';
    state.lastListHash = listHash(state.filters);
    renderList();
    if (restoreScroll) {
      window.scrollTo(0, state.scroll.get(state.lastListHash) || 0);
      // Au retour d'une fiche, le focus revient sur sa carte.
      const link = state.openedId && dom.listView.querySelector('.card h3 a[href="#/entree/' + state.openedId + '"]');
      if (link) link.focus({ preventScroll: true });
    }
  }

  function renderList() {
    const f = state.filters;
    const { terms, list } = filtered();
    state.lastList = list;

    // Comparaison sans les espaces : ne pas effacer l'espace en cours de frappe.
    if (dom.search.value.trim() !== f.q) dom.search.value = f.q;
    const sort = effectiveSort();
    dom.sort.value = sort;
    dom.sort.querySelector('option[value="pertinence"]').disabled = !f.q;
    for (const button of document.querySelectorAll('.segmented button')) {
      button.setAttribute('aria-pressed', String(button.dataset.view === f.vue));
    }

    renderTypeChips(terms);
    renderProjectChips(terms);
    renderActiveFilters();

    const total = state.entries.length;
    dom.resultCount.textContent = list.length === total
      ? plural(total, 'entrée', 'entrées')
      : plural(list.length, 'entrée', 'entrées') + ' sur ' + total;

    dom.grid.replaceChildren();
    dom.groups.replaceChildren();
    dom.more.hidden = true;

    if (!list.length) {
      dom.grid.hidden = true;
      dom.groups.hidden = true;
      dom.empty.hidden = false;
      dom.empty.replaceChildren(
        el('p', null, total ? 'Aucune entrée ne correspond à ces critères.' : 'La mémoire est vide pour le moment.'),
        total ? resetButton() : null,
      );
      return;
    }
    dom.empty.hidden = true;

    if (f.vue === 'projets') {
      dom.grid.hidden = true;
      dom.groups.hidden = false;
      renderGroups(list, terms);
    } else {
      dom.groups.hidden = true;
      dom.grid.hidden = false;
      const fragment = document.createDocumentFragment();
      for (const entry of list.slice(0, state.shown)) fragment.append(card(entry, terms));
      dom.grid.append(fragment);
      const remaining = list.length - state.shown;
      if (remaining > 0) {
        dom.more.hidden = false;
        dom.moreBtn.textContent = 'Afficher plus (' + plural(remaining, 'restante', 'restantes') + ')';
      }
    }
  }

  function resetButton() {
    const button = el('button', { type: 'button', class: 'btn-secondary' }, 'Effacer les filtres');
    button.addEventListener('click', () => setFilters({ q: '', type: '', projet: '', tag: '' }));
    return button;
  }

  function chip(label, count, pressed, onClick, focusKey, extraClass) {
    const button = el('button', {
      type: 'button',
      class: 'chip' + (extraClass ? ' ' + extraClass : ''),
      'aria-pressed': extraClass ? null : String(pressed),
      'data-focus-key': focusKey,
      disabled: count === 0 && !pressed,
    }, label, count == null ? null : el('span', { class: 'count' }, String(count)));
    button.addEventListener('click', onClick);
    return button;
  }

  function renderTypeChips(terms) {
    const pool = state.entries.filter((e) => matches(e, terms, 'type'));
    const counts = new Map();
    for (const entry of pool) counts.set(entry.type, (counts.get(entry.type) || 0) + 1);
    const current = state.filters.type;
    const chips = [chip('Tous', pool.length, !current, () => setFilters({ type: '' }), 'type:')];
    for (const type of state.typeOrder) {
      chips.push(chip(typeLabel(type), counts.get(type) || 0, current === type,
        () => setFilters({ type: current === type ? '' : type }), 'type:' + type));
    }
    dom.typeChips.replaceChildren(...chips);
  }

  function renderProjectChips(terms) {
    const pool = state.entries.filter((e) => matches(e, terms, 'projet'));
    const counts = new Map();
    for (const entry of pool) counts.set(entry._project, (counts.get(entry._project) || 0) + 1);
    const current = state.filters.projet;
    const nameOf = (key) => key === NO_PROJECT ? 'Sans projet'
      : (state.projects.get(key) ? state.projects.get(key).nom : key);

    const keys = Array.from(counts.keys()).sort((a, b) =>
      counts.get(b) - counts.get(a) || nameOf(a).localeCompare(nameOf(b), 'fr', { sensitivity: 'base' }));
    if (current && !keys.includes(current)) keys.unshift(current);

    let visible = keys;
    let hidden = 0;
    if (!state.showAllProjects && keys.length > CONFIG.projectChips + 1) {
      visible = keys.slice(0, CONFIG.projectChips);
      if (current && !visible.includes(current)) visible.push(current);
      hidden = keys.length - visible.length;
    }

    const chips = [chip('Tous les projets', pool.length, !current, () => setFilters({ projet: '' }), 'projet:')];
    for (const key of visible) {
      chips.push(chip('📁︎ ' + nameOf(key), counts.get(key) || 0, current === key,
        () => setFilters({ projet: current === key ? '' : key }), 'projet:' + key));
    }
    if (hidden > 0) {
      chips.push(chip('+ ' + hidden + ' autres', null, false, () => {
        state.showAllProjects = true;
        renderProjectChips(queryTerms(state.filters.q));
        // Le focus va sur le premier projet qui vient d'apparaître.
        const first = dom.projectChips.querySelectorAll('.chip')[visible.length + 1];
        if (first) first.focus();
      }, 'projets:plus', 'more-chip'));
    } else if (state.showAllProjects && keys.length > CONFIG.projectChips + 1) {
      chips.push(chip('Réduire', null, false, () => {
        state.showAllProjects = false;
        renderProjectChips(queryTerms(state.filters.q));
        const more = dom.projectChips.querySelector('[data-focus-key="projets:plus"]');
        if (more) more.focus();
      }, 'projets:moins', 'more-chip'));
    }
    dom.projectChips.replaceChildren(...chips);
  }

  function renderActiveFilters() {
    const f = state.filters;
    const items = [];
    if (f.tag) {
      const pill = el('button', { type: 'button', class: 'filter-pill', 'aria-label': 'Retirer le filtre de tag ' + f.tag }, '#' + f.tag);
      pill.addEventListener('click', () => setFilters({ tag: '' }));
      items.push(el('span', null, 'Tag :'), pill);
    }
    if (f.q || f.type || f.projet || f.tag) {
      const clear = el('button', { type: 'button', class: 'link-button' }, 'Effacer tous les filtres');
      clear.addEventListener('click', () => setFilters({ q: '', type: '', projet: '', tag: '' }));
      items.push(clear);
    }
    dom.activeFilters.hidden = !items.length;
    dom.activeFilters.replaceChildren(...items);
  }

  function typeBadge(type) {
    return el('span', { class: 'type-badge', 'data-type': type }, typeLabel(type));
  }

  function projectButton(entry) {
    return el('button', {
      type: 'button', class: 'project-tag', 'data-action': 'project', 'data-project': entry._project,
      title: 'Voir toutes les entrées de ce projet',
    }, '📁︎ ' + entry._projectName);
  }

  function linksInfo(entry) {
    const parts = [];
    if (entry._online) parts.push(plural(entry._online, 'lien', 'liens'));
    if (entry._local) parts.push(plural(entry._local, 'adresse locale', 'adresses locales'));
    if (entry._invalid) parts.push(plural(entry._invalid, 'lien non cliquable', 'liens non cliquables'));
    return parts.length ? el('span', { class: 'links-info' }, parts.join(' · ')) : null;
  }

  function card(entry, terms) {
    const tagsShown = entry.tags.slice(0, 5);
    const extraTags = entry.tags.length - tagsShown.length;
    return el('article', { class: 'card' },
      el('div', { class: 'badges' }, typeBadge(entry.type), entry.projet ? projectButton(entry) : null),
      el('h3', null, el('a', { href: entryHash(entry) }, highlight(entry.titre, terms))),
      entry.resume ? el('p', { class: 'resume' }, highlight(entry.resume, terms)) : null,
      el('div', { class: 'meta-line' },
        el('time', { datetime: entry.cree_le }, formatDay(entry.cree_le)),
        linksInfo(entry)),
      tagsShown.length ? el('ul', { class: 'tags', 'aria-label': 'Tags' },
        tagsShown.map((tag) => el('li', null,
          el('button', { type: 'button', class: 'tag', 'data-action': 'tag', 'data-tag': tag }, highlight(tag, terms)))),
        extraTags > 0 ? el('li', { class: 'tag-more' }, '+' + extraTags) : null) : null,
      el('div', { class: 'actions' },
        el('a', { class: 'btn-primary', href: entryHash(entry), 'aria-label': 'Voir la fiche : ' + entry.titre }, 'Voir la fiche')),
    );
  }

  function renderGroups(list, terms) {
    const groups = new Map();
    for (const entry of list) {
      if (!groups.has(entry._project)) groups.set(entry._project, []);
      groups.get(entry._project).push(entry);
    }
    const single = Boolean(state.filters.projet);
    const fragment = document.createDocumentFragment();
    for (const [key, members] of groups) {
      const project = state.projects.get(key);
      const name = key === NO_PROJECT ? 'Sans projet' : (project ? project.nom : key);
      const typeCounts = new Map();
      for (const entry of members) typeCounts.set(entry.type, (typeCounts.get(entry.type) || 0) + 1);
      const breakdown = Array.from(typeCounts, ([type, count]) => typeCount(type, count)).join(' · ');
      const lastDate = members.reduce((max, e) => Math.max(max, e._time), 0);

      // « group » : filtre sur le projet en gardant recherche, type et tag,
      // pour que le nombre annoncé soit celui qui s'affiche.
      const title = el('button', { type: 'button', class: 'link-button group-title', 'data-action': 'group', 'data-project': key }, name);
      const head = el('div', { class: 'group-head' },
        el('h2', null, single ? name : title),
        el('span', { class: 'group-meta' },
          plural(members.length, 'entrée', 'entrées') + ' — ' + breakdown
          + (lastDate ? ' — dernière le ' + fmtDay.format(lastDate) : '')));

      const shown = single ? members : members.slice(0, CONFIG.groupPreview);
      const grid = el('div', { class: 'grid' }, shown.map((entry) => card(entry, terms)));
      const section = el('section', { class: 'group', 'aria-label': name }, head, grid);
      if (members.length > shown.length) {
        section.append(el('div', { class: 'group-more' },
          el('button', { type: 'button', class: 'btn-secondary', 'data-action': 'group', 'data-project': key },
            'Voir les ' + members.length + ' entrées de ce projet')));
      }
      fragment.append(section);
    }
    dom.groups.append(fragment);
  }

  // ------------------------------------------------------------ fiche

  function findEntry(prefix) {
    return state.entries.find((e) => String(e.id).toLowerCase().startsWith(prefix)) || null;
  }

  function showEntry(prefix) {
    dom.listView.hidden = true;
    dom.entryView.hidden = false;
    window.scrollTo(0, 0);

    const entry = findEntry(prefix);
    if (!entry) {
      document.title = 'Entrée introuvable — Mémoire Vive';
      dom.entryView.replaceChildren(el('div', { class: 'not-found' },
        el('h2', { id: 'entry-title', tabindex: '-1' }, 'Entrée introuvable'),
        el('p', null, "Cette entrée n'existe pas ou n'est plus dans la mémoire publiée."),
        el('a', { class: 'btn-secondary', href: '#/' }, '← Retour à la liste')));
      dom.entryView.querySelector('h2').focus();
      return;
    }

    document.title = entry.titre + ' — Mémoire Vive';
    state.openedId = entry._short;
    const sequence = state.lastList.includes(entry) ? state.lastList : sortEntries(state.entries.slice(), []);
    const position = sequence.indexOf(entry);
    const previous = position > 0 ? sequence[position - 1] : null;
    const next = position >= 0 && position < sequence.length - 1 ? sequence[position + 1] : null;

    const back = el('a', { class: 'btn-secondary', href: state.lastListHash }, '← Retour à la liste');
    back.addEventListener('click', (event) => {
      // Revenir sur l'entrée d'historique de la liste plutôt qu'en créer une.
      if (state.entryDepth > 0) { event.preventDefault(); history.go(-state.entryDepth); }
    });
    const pagerLink = (target, label, rel) => {
      if (!target) return el('span', { class: 'btn-secondary', 'aria-disabled': 'true' }, label);
      const link = el('a', { class: 'btn-secondary', href: entryHash(target), rel, title: target.titre }, label);
      link.addEventListener('click', (event) => {
        // Précédente/Suivante remplacent la fiche dans l'historique :
        // « Retour » et le bouton du navigateur ramènent à la liste.
        event.preventDefault();
        history.replaceState(history.state, '', entryHash(target));
        route();
      });
      return link;
    };

    const nav = el('nav', { class: 'entry-nav', 'aria-label': 'Navigation entre les fiches' },
      back,
      el('div', { class: 'pager' },
        pagerLink(previous, '← Précédente', 'prev'),
        pagerLink(next, 'Suivante →', 'next')));

    const created = formatLong(entry.cree_le);
    const updated = entry.modifie_le && Math.abs(Date.parse(entry.modifie_le) - entry._time) > 60000
      ? formatLong(entry.modifie_le) : '';

    const children = [
      nav,
      el('div', { class: 'badges' }, typeBadge(entry.type), entry.projet ? projectButton(entry) : null),
      el('h2', { id: 'entry-title', tabindex: '-1' }, entry.titre),
      el('p', { class: 'entry-dates' },
        created ? 'Créée le ' + created : '',
        updated ? ' · modifiée le ' + updated : ''),
      entry.resume ? el('p', { class: 'entry-resume' }, entry.resume) : null,
      linksSection(entry),
      el('section', { 'aria-labelledby': 'h-texte' },
        el('h3', { id: 'h-texte' }, 'Texte intégral'),
        el('div', { class: 'entry-content' }, entry.contenu || '')),
      entry.tags.length ? el('section', { 'aria-labelledby': 'h-tags' },
        el('h3', { id: 'h-tags' }, 'Tags'),
        el('ul', { class: 'tags' }, entry.tags.map((tag) => el('li', null,
          el('button', { type: 'button', class: 'tag', 'data-action': 'tag', 'data-tag': tag }, tag))))) : null,
      siblingsSection(entry),
      detailsSection(entry),
    ];
    dom.entryView.replaceChildren(...children.filter(Boolean));
    dom.entryView.querySelector('#entry-title').focus({ preventScroll: true });
  }

  function linksSection(entry) {
    const online = entry.liens.filter((l) => l.type === 'en_ligne' && isWebUrl(l.valeur));
    const invalid = entry.liens.filter((l) => l.type === 'en_ligne' && !isWebUrl(l.valeur));
    const local = entry.liens.filter((l) => l.type !== 'en_ligne');
    const section = el('section', { 'aria-labelledby': 'h-liens' }, el('h3', { id: 'h-liens' }, 'Liens'));
    if (invalid.length) {
      // Ne devrait pas arriver (l'export valide les URL), mais jamais de lien
      // cliquable douteux, ni d'étiquette « adresse locale » trompeuse.
      section.append(el('ul', { class: 'links-list', 'aria-label': 'Liens non cliquables' }, invalid.map((link) =>
        el('li', null, el('span', { class: 'local-label' }, 'lien non cliquable'), el('code', null, link.valeur)))));
    }
    if (!online.length && !local.length && !invalid.length) {
      section.append(el('p', { class: 'no-links' }, 'Aucun lien ni adresse détecté dans cette entrée.'));
      return section;
    }
    if (online.length) {
      section.append(el('ul', { class: 'links-list', 'aria-label': 'Liens en ligne' }, online.map((link) => {
        const url = new URL(link.valeur);
        const label = (url.host + url.pathname + url.search + url.hash).replace(/\/$/, '');
        return el('li', null,
          el('a', { href: url.href, target: '_blank', rel: 'noopener noreferrer', title: url.href }, label),
          el('span', { class: 'link-host' }, 's’ouvre dans un nouvel onglet'));
      })));
    }
    if (local.length) {
      section.append(el('ul', { class: 'links-list', 'aria-label': 'Adresses locales' }, local.map((link) => {
        const button = el('button', { type: 'button', class: 'copy-btn' }, 'Copier');
        button.addEventListener('click', () => copy(link.valeur, 'Adresse copiée.'));
        return el('li', null,
          el('span', { class: 'local-label', title: 'Accessible seulement depuis la machine de Noah' }, 'adresse locale'),
          el('code', null, link.valeur),
          button);
      })));
    }
    return section;
  }

  function siblingsSection(entry) {
    if (!entry.projet) return null;
    const siblings = state.entries
      .filter((e) => e !== entry && e._project === entry._project)
      .sort((a, b) => typeRank(a.type) - typeRank(b.type) || b._time - a._time);
    if (!siblings.length) return null;
    return el('section', { 'aria-labelledby': 'h-projet' },
      el('h3', { id: 'h-projet' }, 'Dans le même projet · ' + entry._projectName),
      el('ul', { class: 'siblings' }, siblings.slice(0, 15).map((s) =>
        el('li', null, typeBadge(s.type), el('a', { href: entryHash(s) }, s.titre)))),
      siblings.length > 15 ? el('p', null, el('button', {
        type: 'button', class: 'link-button', 'data-action': 'project', 'data-project': entry._project,
      }, 'Voir les ' + (siblings.length + 1) + ' entrées du projet')) : null);
  }

  function detailsSection(entry) {
    const copyLink = el('button', { type: 'button', class: 'copy-btn' }, 'Copier le lien de la fiche');
    copyLink.addEventListener('click', () => {
      const url = location.href.split('#')[0] + entryHash(entry);
      copy(url, 'Lien de la fiche copié.');
    });
    return el('section', { 'aria-labelledby': 'h-details' },
      el('h3', { id: 'h-details' }, 'Détails'),
      el('dl', { class: 'facts' },
        el('dt', null, 'Type'), el('dd', null, typeLabel(entry.type)),
        el('dt', null, 'Projet'), el('dd', null, entry.projet ? entry._projectName : 'Sans projet'),
        el('dt', null, 'Créée le'), el('dd', null, formatLong(entry.cree_le) || '—'),
        el('dt', null, 'Identifiant'), el('dd', null, el('code', { title: entry.id }, entry._short))),
      el('p', null, copyLink));
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
      renderList();
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
})();
