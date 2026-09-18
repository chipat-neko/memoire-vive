/* Toutes les entrées : filtres (type, famille, projet, tag), tri, vue
   « Grille » (cartes) ou « Liste » (une ligne par entrée), « Afficher plus ».
   La recherche a sa propre page (vues/resultats.js). */
import { normalize } from '../recherche.js';
import { el, plural, typeLabel, card, entryLine, chip } from '../composants.js';
import { NO_PROJECT, NO_FAMILY } from '../donnees.js';

export function familyKey(entry) {
  return entry._family ? entry._family.id : NO_FAMILY;
}

export function createListView(ctx) {
  const { config, state, dom } = ctx;

  function matches(entry, except) {
    const f = state.filters;
    if (except !== 'type' && f.type && entry.type !== f.type) return false;
    if (except !== 'famille' && f.famille && familyKey(entry) !== f.famille) return false;
    if (except !== 'projet' && f.projet && entry._project !== f.projet) return false;
    if (f.tag && !entry._tags.includes(normalize(f.tag))) return false;
    return true;
  }

  function typeRank(type) {
    const index = state.typeOrder.indexOf(type);
    return index === -1 ? state.typeOrder.length : index;
  }

  function sortEntries(list) {
    const byRecent = (a, b) => b._time - a._time || (a.id < b.id ? -1 : 1);
    switch (state.filters.tri) {
      case 'ancien':
        return list.sort((a, b) => -byRecent(a, b));
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
    return sortEntries(state.entries.filter((e) => matches(e)));
  }

  function showList(restoreScroll) {
    ctx.show(dom.listView);
    document.title = 'Toutes les entrées — Mémoire Vive';
    renderList();
    if (restoreScroll) {
      window.scrollTo(0, state.scroll.get(state.lastListHash) || 0);
      // Au retour d'une fiche, le focus revient sur son lien.
      const link = state.openedId && dom.listView.querySelector('a.entry-link[href="#/entree/' + CSS.escape(state.openedId) + '"]');
      if (link) link.focus({ preventScroll: true });
    }
  }

  function renderList() {
    const f = state.filters;
    const list = filtered();
    state.lastList = list;

    dom.sort.value = f.tri || 'recent';
    for (const button of document.querySelectorAll('.segmented button')) {
      button.setAttribute('aria-pressed', String(button.dataset.view === f.vue));
    }

    renderTypeChips();
    renderFamilyChips();
    renderProjectChips();
    renderActiveFilters();

    const total = state.entries.length;
    dom.resultCount.textContent = list.length === total
      ? plural(total, 'entrée', 'entrées')
      : plural(list.length, 'entrée', 'entrées') + ' sur ' + total;

    dom.grid.replaceChildren();
    dom.lines.replaceChildren();
    dom.more.hidden = true;

    if (!list.length) {
      dom.grid.hidden = true;
      dom.lines.hidden = true;
      dom.empty.hidden = false;
      dom.empty.replaceChildren(
        el('p', null, total ? 'Aucune entrée ne correspond à ces critères.' : 'La mémoire est vide pour le moment.'),
        total ? resetButton() : null,
      );
      return;
    }
    dom.empty.hidden = true;

    const asLines = f.vue === 'liste';
    const options = { since: state.since };
    dom.grid.hidden = asLines;
    dom.lines.hidden = !asLines;
    const container = asLines ? dom.lines : dom.grid;
    container.append(...list.slice(0, state.shown).map((entry) => (asLines ? entryLine(entry, options) : card(entry, options))));
    const remaining = list.length - state.shown;
    if (remaining > 0) {
      dom.more.hidden = false;
      dom.moreBtn.textContent = 'Afficher plus (' + plural(remaining, 'restante', 'restantes') + ')';
    }
  }

  function resetButton() {
    const button = el('button', { type: 'button', class: 'btn-secondary' }, 'Effacer les filtres');
    button.addEventListener('click', () => ctx.setFilters({ type: '', famille: '', projet: '', tag: '' }));
    return button;
  }

  function renderTypeChips() {
    const pool = state.entries.filter((e) => matches(e, 'type'));
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

  /* Familles dans l'ordre configuré, puis « Sans famille » ; le nom est écrit
     (la couleur n'est jamais la seule information). */
  function renderFamilyChips() {
    if (!state.families.size) {
      dom.familyChips.hidden = true;
      dom.familyChips.replaceChildren();
      return;
    }
    const pool = state.entries.filter((e) => matches(e, 'famille'));
    const counts = new Map();
    for (const entry of pool) counts.set(familyKey(entry), (counts.get(familyKey(entry)) || 0) + 1);
    const current = state.filters.famille;
    const keys = Array.from(state.families.keys());
    if (counts.has(NO_FAMILY) || current === NO_FAMILY) keys.push(NO_FAMILY);
    const chips = [chip('Toutes les familles', pool.length, !current, () => ctx.setFilters({ famille: '' }), 'famille:')];
    for (const key of keys) {
      const family = state.families.get(key);
      const button = chip(family ? family.nom : 'Sans famille', counts.get(key) || 0, current === key,
        () => ctx.setFilters({ famille: current === key ? '' : key }), 'famille:' + key);
      if (family && family.couleur) button.setAttribute('data-couleur', family.couleur);
      button.prepend(el('span', { class: 'family-dot', 'aria-hidden': 'true' }));
      chips.push(button);
    }
    dom.familyChips.hidden = false;
    dom.familyChips.replaceChildren(...chips);
  }

  function renderProjectChips() {
    const pool = state.entries.filter((e) => matches(e, 'projet'));
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
        renderProjectChips();
        // Le focus va sur le premier projet qui vient d'apparaître.
        const first = dom.projectChips.querySelectorAll('.chip')[visible.length + 1];
        if (first) first.focus();
      }, 'projets:plus', 'more-chip'));
    } else if (state.showAllProjects && keys.length > config.projectChips + 1) {
      chips.push(chip('Réduire', null, false, () => {
        state.showAllProjects = false;
        renderProjectChips();
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
    if (f.type || f.famille || f.projet || f.tag) {
      const clear = el('button', { type: 'button', class: 'link-button' }, 'Effacer tous les filtres');
      clear.addEventListener('click', () => ctx.setFilters({ type: '', famille: '', projet: '', tag: '' }));
      items.push(clear);
    }
    dom.activeFilters.hidden = !items.length;
    dom.activeFilters.replaceChildren(...items);
  }

  return { showList, renderList, filtered, sortEntries, typeRank };
}
