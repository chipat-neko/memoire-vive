/* Vue liste : filtres (recherche, type, projet, tag), tri, grille ou
   regroupement par projet, « Afficher plus ». */
import { normalize, search } from '../recherche.js';
import { listHash } from '../routes.js';
import { el, plural, typeLabel, typeCount, formatDay, card, chip } from '../composants.js';
import { NO_PROJECT } from '../donnees.js';

export function createListView(ctx) {
  const { config, state, dom } = ctx;

  function effectiveSort() {
    const f = state.filters;
    if (f.tri === 'pertinence' && !f.q) return 'recent';
    return f.tri || (f.q ? 'pertinence' : 'recent');
  }

  /* found : Map entrée → score de la recherche, ou null sans recherche. */
  function matches(entry, found, except) {
    const f = state.filters;
    if (except !== 'type' && f.type && entry.type !== f.type) return false;
    if (except !== 'projet' && f.projet && entry._project !== f.projet) return false;
    if (f.tag && !entry._tags.includes(normalize(f.tag))) return false;
    return !found || found.has(entry);
  }

  function searched() {
    if (!state.filters.q) return { found: null, targets: null };
    const result = search(state.index, state.filters.q);
    return {
      found: new Map(result.hits.map((hit) => [state.entries[hit.doc], hit.score])),
      targets: result.targets,
    };
  }

  function typeRank(type) {
    const index = state.typeOrder.indexOf(type);
    return index === -1 ? state.typeOrder.length : index;
  }

  function sortEntries(list, found) {
    const byRecent = (a, b) => b._time - a._time || (a.id < b.id ? -1 : 1);
    switch (effectiveSort()) {
      case 'ancien':
        return list.sort((a, b) => -byRecent(a, b));
      case 'pertinence':
        // found vaut null quand la fiche trie toutes les entrées (entrée hors de la liste affichée).
        return list.sort((a, b) => (found ? (found.get(b) || 0) - (found.get(a) || 0) : 0) || byRecent(a, b));
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
    const { found, targets } = searched();
    return { found, targets, list: sortEntries(state.entries.filter((e) => matches(e, found)), found) };
  }

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
    const { found, targets, list } = filtered();
    state.lastList = list;

    // Comparaison sans les espaces : ne pas effacer l'espace en cours de frappe.
    if (dom.search.value.trim() !== f.q) dom.search.value = f.q;
    const sort = effectiveSort();
    dom.sort.value = sort;
    dom.sort.querySelector('option[value="pertinence"]').disabled = !f.q;
    for (const button of document.querySelectorAll('.segmented button')) {
      button.setAttribute('aria-pressed', String(button.dataset.view === f.vue));
    }

    renderTypeChips(found);
    renderProjectChips(found);
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
      renderGroups(list, targets);
    } else {
      dom.groups.hidden = true;
      dom.grid.hidden = false;
      const fragment = document.createDocumentFragment();
      for (const entry of list.slice(0, state.shown)) fragment.append(card(entry, targets));
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
    button.addEventListener('click', () => ctx.setFilters({ q: '', type: '', projet: '', tag: '' }));
    return button;
  }

  function renderTypeChips(found) {
    const pool = state.entries.filter((e) => matches(e, found, 'type'));
    const counts = new Map();
    for (const entry of pool) counts.set(entry.type, (counts.get(entry.type) || 0) + 1);
    const current = state.filters.type;
    const chips = [chip('Tous', pool.length, !current, () => ctx.setFilters({ type: '' }), 'type:')];
    for (const type of state.typeOrder) {
      chips.push(chip(typeLabel(type), counts.get(type) || 0, current === type,
        () => ctx.setFilters({ type: current === type ? '' : type }), 'type:' + type));
    }
    dom.typeChips.replaceChildren(...chips);
  }

  function renderProjectChips(found) {
    const pool = state.entries.filter((e) => matches(e, found, 'projet'));
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
    if (!state.showAllProjects && keys.length > config.projectChips + 1) {
      visible = keys.slice(0, config.projectChips);
      if (current && !visible.includes(current)) visible.push(current);
      hidden = keys.length - visible.length;
    }

    const chips = [chip('Tous les projets', pool.length, !current, () => ctx.setFilters({ projet: '' }), 'projet:')];
    for (const key of visible) {
      chips.push(chip('📁︎ ' + nameOf(key), counts.get(key) || 0, current === key,
        () => ctx.setFilters({ projet: current === key ? '' : key }), 'projet:' + key));
    }
    if (hidden > 0) {
      chips.push(chip('+ ' + hidden + ' autres', null, false, () => {
        state.showAllProjects = true;
        renderProjectChips(searched().found);
        // Le focus va sur le premier projet qui vient d'apparaître.
        const first = dom.projectChips.querySelectorAll('.chip')[visible.length + 1];
        if (first) first.focus();
      }, 'projets:plus', 'more-chip'));
    } else if (state.showAllProjects && keys.length > config.projectChips + 1) {
      chips.push(chip('Réduire', null, false, () => {
        state.showAllProjects = false;
        renderProjectChips(searched().found);
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
      pill.addEventListener('click', () => ctx.setFilters({ tag: '' }));
      items.push(el('span', null, 'Tag :'), pill);
    }
    if (f.q || f.type || f.projet || f.tag) {
      const clear = el('button', { type: 'button', class: 'link-button' }, 'Effacer tous les filtres');
      clear.addEventListener('click', () => ctx.setFilters({ q: '', type: '', projet: '', tag: '' }));
      items.push(clear);
    }
    dom.activeFilters.hidden = !items.length;
    dom.activeFilters.replaceChildren(...items);
  }

  function renderGroups(list, targets) {
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
          + (lastDate ? ' — dernière le ' + formatDay(lastDate) : '')));

      const shown = single ? members : members.slice(0, config.groupPreview);
      const grid = el('div', { class: 'grid' }, shown.map((entry) => card(entry, targets)));
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

  return { showList, renderList, filtered, sortEntries, typeRank };
}
