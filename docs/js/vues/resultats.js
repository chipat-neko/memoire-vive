/* Résultats de recherche (#/recherche?q=…) : « Projets » (nom, description,
   famille), « Entrées » (triées par score) et « En rapport » (voisins des
   meilleurs résultats qui n'y sont pas). */
import { search } from '../recherche.js';
import { entryHash, projectHash } from '../routes.js';
import { el, plural, card, projectCard, typeBadge } from '../composants.js';

const TOP = 5;          // meilleurs résultats dont on suit les voisins
const RELATED_MAX = 6;  // entrées « En rapport » au plus
const PROJECTS_SHOWN = 6; // projets affichés avant « Afficher les N projets »

/* Voisins des meilleurs résultats, absents des résultats, classés par score
   de voisinage cumulé (à égalité : le plus récent). */
export function relatedEntries(top, inResults, max = RELATED_MAX) {
  const scores = new Map();
  for (const entry of top) {
    for (const { entry: other, score } of entry._neighbours) {
      if (inResults.has(other)) continue;
      scores.set(other, (scores.get(other) || 0) + score);
    }
  }
  return Array.from(scores)
    .sort(([a, x], [b, y]) => y - x || b._time - a._time)
    .slice(0, max)
    .map(([entry]) => entry);
}

export function createResultsView(ctx) {
  const { config, state, dom } = ctx;
  let current = { q: null, shown: config.pageSize, allProjects: false };

  /* Entrées trouvées, de la meilleure à la moins bonne (à égalité : la plus
     récente), et cibles du surlignage. */
  function findEntries(q) {
    const result = search(state.index, q);
    if (!result.active) return { entries: [], targets: null, active: false };
    const scored = result.hits.map((hit) => ({ entry: state.entries[hit.doc], score: hit.score }));
    scored.sort((a, b) => b.score - a.score || b.entry._time - a.entry._time);
    return { entries: scored.map((s) => s.entry), targets: result.targets, active: true };
  }

  function findProjects(q) {
    const result = search(state.projectIndex, q);
    if (!result.active) return { projects: [], targets: null };
    return {
      projects: result.hits.map((hit) => state.projectList[hit.doc]).filter((p) => p._count > 0),
      targets: result.targets,
    };
  }

  function resultEntries(q) {
    return findEntries(q).entries;
  }

  function showResults(q, { returning = false } = {}) {
    ctx.show(dom.pageView);
    if (dom.search.value.trim() !== q) dom.search.value = q;
    if (q !== current.q) current = { q, shown: config.pageSize, allProjects: false };
    render(returning);
  }

  function render(returning) {
    const { q } = current;
    const entries = findEntries(q);
    const projects = findProjects(q);
    state.lastList = entries.entries;
    document.title = (q ? 'Recherche : ' + q : 'Recherche') + ' — Mémoire Vive';
    const head = el('div', { class: 'results-head' },
      el('h2', { id: 'titre-vue', tabindex: '-1' }, q ? 'Recherche : « ' + q + ' »' : 'Recherche'));

    if (!entries.active) {
      dom.pageView.replaceChildren(head, el('p', { class: 'results-help' },
        'Tapez un ou plusieurs mots dans la barre de recherche. Tous les mots doivent être présents ; '
        + '"des guillemets" cherchent une expression exacte, -mot écarte les entrées qui contiennent ce mot.'));
      dom.announce.textContent = '';
      ctx.focusView(returning);
      return;
    }

    const found = projects.projects.length + entries.entries.length > 0;
    const count = plural(projects.projects.length, 'projet', 'projets') + ' · ' + plural(entries.entries.length, 'entrée', 'entrées');
    head.append(el('p', { class: 'result-count', id: 'results-count' }, count));
    const children = [head];
    if (!found) {
      children.push(el('div', { class: 'empty' },
        el('p', null, 'Aucun résultat pour « ' + q + ' ».'),
        el('a', { class: 'btn-secondary', href: '#/entrees' }, 'Voir toutes les entrées')));
    }
    if (projects.projects.length) {
      // Un mot courant trouve tous les projets d'une famille (son nom est
      // cherché) : les meilleurs d'abord, pour que les entrées restent proches.
      const total = projects.projects.length;
      const all = current.allProjects || total <= PROJECTS_SHOWN;
      const section = el('section', { class: 'results-section', 'aria-labelledby': 'h-res-projets' },
        el('h3', { id: 'h-res-projets' }, 'Projets'),
        el('div', { class: 'project-grid' }, projects.projects.slice(0, all ? total : PROJECTS_SHOWN).map((p) =>
          projectCard(p, { since: state.since, targets: projects.targets, showFamily: true }))));
      if (!all) {
        const more = el('button', { type: 'button', class: 'btn-secondary' }, 'Afficher les ' + total + ' projets');
        more.addEventListener('click', () => {
          current.allProjects = true;
          render(false);
          // Le focus passe au premier projet ajouté (le bouton disparaît).
          const added = dom.pageView.querySelectorAll('#h-res-projets ~ .project-grid .project-card')[PROJECTS_SHOWN];
          if (added) added.querySelector('a').focus();
        });
        section.append(el('div', { class: 'more' }, more));
      }
      children.push(section);
    }
    if (entries.entries.length) {
      const shown = entries.entries.slice(0, current.shown);
      const section = el('section', { class: 'results-section', 'aria-labelledby': 'h-res-entrees' },
        el('h3', { id: 'h-res-entrees' }, 'Entrées'),
        el('div', { class: 'grid' }, shown.map((entry) => card(entry, { targets: entries.targets, since: state.since, heading: 'h4' }))));
      const remaining = entries.entries.length - shown.length;
      if (remaining > 0) {
        const more = el('button', { type: 'button', class: 'btn-secondary' },
          'Afficher plus (' + plural(remaining, 'restante', 'restantes') + ')');
        more.addEventListener('click', () => {
          const firstNew = current.shown;
          current.shown += config.pageSize;
          render(false);
          const link = dom.pageView.querySelectorAll('#h-res-entrees ~ .grid a.entry-link')[firstNew];
          if (link) link.focus();
        });
        section.append(el('div', { class: 'more' }, more));
      }
      children.push(section);
      const related = relatedEntries(entries.entries.slice(0, TOP), new Set(entries.entries));
      if (related.length) {
        children.push(el('section', { class: 'results-section', 'aria-labelledby': 'h-res-rapport' },
          el('h3', { id: 'h-res-rapport' }, 'En rapport'),
          el('ul', { class: 'related-entries' }, related.map((entry) => el('li', { 'data-couleur': entry._family ? entry._family.couleur : null },
            typeBadge(entry.type),
            el('a', { href: entryHash(entry) }, entry.titre),
            entry.projet ? el('a', { class: 'related-project', href: projectHash(entry.projet) }, entry._projectName) : null)))));
      }
    }
    dom.pageView.replaceChildren(...children);
    // Région live persistante, hors de #page-view : une région recréée à
    // chaque frappe avec son texte ne serait pas annoncée.
    dom.announce.textContent = found ? count : 'Aucun résultat pour « ' + q + ' ».';
    ctx.focusView(returning);
  }

  return { showResults, resultEntries };
}
