/* Page d'un projet : en-tête (famille, description, liens, dates), entrées
   regroupées par nature, jalons en chronologie, adresses locales, projets
   proches (d'après les voisins de ses entrées). */
import { entryHash, projectHash } from '../routes.js';
import {
  el, card, plural, formatDay, relativeDate, isWebUrl, isNew, newBadge, mainLinkButton, copy,
} from '../composants.js';

const GROUPS = [
  { id: 'references', title: 'Architecture & références', types: ['reference', 'architecture'] },
  { id: 'decisions', title: 'Décisions', types: ['decision'] },
  { id: 'jalons', title: 'Jalons', types: ['milestone'], timeline: true },
  { id: 'notes', title: 'Notes', types: null },
  { id: 'erreurs', title: 'Erreurs', types: ['error'] },
];
const GROUPED = new Set(GROUPS.flatMap((g) => g.types || []));
const RELATED_MAX = 5;

/* Entrées d'un projet par section, dans l'ordre d'affichage : jalons du plus
   ancien au plus récent, autres sections du plus récent au plus ancien. */
export function projectSections(entries, projectId) {
  const members = entries.filter((e) => e.projet === projectId);
  return GROUPS.map((group) => {
    const list = members.filter((e) => (group.types ? group.types.includes(e.type) : !GROUPED.has(e.type)));
    list.sort(group.timeline ? (a, b) => a._time - b._time : (a, b) => b._time - a._time);
    return { ...group, entries: list };
  }).filter((group) => group.entries.length);
}

/* Liens en ligne de toutes les entrées, dédupliqués, le lien principal en tête. */
export function projectLinks(project, members) {
  const seen = new Set();
  const links = [];
  const add = (value) => {
    if (!isWebUrl(value)) return;
    const href = new URL(value).href;
    if (seen.has(href)) return;
    seen.add(href);
    links.push(href);
  };
  if (project._mainLink) add(project._mainLink.url);
  for (const entry of members) for (const link of entry.liens) if (link.type === 'en_ligne') add(link.valeur);
  return links;
}

export function projectLocalAddresses(members) {
  return Array.from(new Set(members.flatMap((e) => e.liens.filter((l) => l.type !== 'en_ligne').map((l) => String(l.valeur)))));
}

/* Autres projets les plus présents parmi les voisins des entrées du projet
   (à égalité : score de voisinage cumulé, puis nom). */
export function relatedProjects(projectId, members, projects) {
  const counts = new Map();
  for (const entry of members) {
    for (const { entry: other, score } of entry._neighbours) {
      if (!other.projet || other.projet === projectId || !projects.has(other.projet)) continue;
      const total = counts.get(other.projet) || { count: 0, score: 0 };
      total.count += 1;
      total.score += score;
      counts.set(other.projet, total);
    }
  }
  return Array.from(counts)
    .sort(([a, x], [b, y]) => y.count - x.count || y.score - x.score
      || projects.get(a).nom.localeCompare(projects.get(b).nom, 'fr', { sensitivity: 'base' }))
    .slice(0, RELATED_MAX)
    .map(([id]) => projects.get(id));
}

function linkLabel(href) {
  const url = new URL(href);
  return (url.host + url.pathname + url.search + url.hash).replace(/\/$/, '');
}

export function createProjectView(ctx) {
  const { state, dom } = ctx;

  function projectEntries(id) {
    return projectSections(state.entries, id).flatMap((group) => group.entries);
  }

  function showProject(id, { returning = false } = {}) {
    ctx.show(dom.pageView);
    const project = state.projects.get(id);
    if (!project) {
      document.title = 'Projet introuvable — Mémoire Vive';
      state.lastList = [];
      dom.pageView.replaceChildren(el('div', { class: 'not-found' },
        el('h2', { id: 'titre-vue', tabindex: '-1' }, 'Projet introuvable'),
        el('p', null, "Ce projet n'existe pas ou n'a plus d'entrée publiée."),
        el('a', { class: 'btn-secondary', href: '#/' }, '← Tous les projets')));
      ctx.focusView(returning);
      return;
    }
    document.title = project.nom + ' — Mémoire Vive';
    const sections = projectSections(state.entries, id);
    const members = sections.flatMap((group) => group.entries);
    state.lastList = members;
    const family = project._family;

    const head = el('header', { class: 'project-head', 'data-couleur': family ? family.couleur : null },
      el('p', { class: 'project-family' }, family ? 'Famille : ' + family.nom : 'Sans famille'),
      el('h2', { id: 'titre-vue', tabindex: '-1' }, project.nom),
      project.description ? el('p', { class: 'project-description' }, project.description) : null,
      linksList(project, members),
      el('p', { class: 'project-dates' }, datesLine(members)));

    const allProjects = el('a', { class: 'btn-secondary', href: '#/' }, '← Tous les projets');
    allProjects.addEventListener('click', (event) => {
      // Clic modifié (Ctrl/Cmd/Maj/Alt) ou bouton non principal : laisser le
      // navigateur faire son geste habituel (nouvel onglet, etc.).
      if (event.defaultPrevented || event.button !== 0
        || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      // Ouverte depuis l'accueil : revenir sur son entrée d'historique (position
      // et focus rendus) plutôt qu'en créer une nouvelle.
      if (history.state && history.state.fromHome) { event.preventDefault(); history.back(); }
    });
    const children = [
      el('nav', { class: 'page-nav', 'aria-label': 'Navigation' }, allProjects),
      head,
      ...sections.map((group) => section(group)),
      localSection(members),
      relatedSection(id, members),
    ];
    dom.pageView.replaceChildren(...children.filter(Boolean));
    ctx.focusView(returning);
  }

  function datesLine(members) {
    const count = plural(members.length, 'entrée', 'entrées');
    const times = members.map((e) => e._time).filter(Boolean);
    if (!times.length) return count;
    const first = Math.min(...times);
    const last = Math.max(...times);
    return count + ' · première le ' + formatDay(first) + ' · dernière le ' + formatDay(last)
      + ' (' + relativeDate(last) + ')';
  }

  function linksList(project, members) {
    const links = projectLinks(project, members);
    if (!links.length) return null;
    return el('ul', { class: 'project-links', 'aria-label': 'Liens du projet' }, links.map((href, i) => {
      const main = i === 0 && project._mainLink;
      return el('li', null, main
        ? mainLinkButton(project._mainLink, project.nom)
        : el('a', {
          class: 'btn-secondary', href, target: '_blank', rel: 'noopener noreferrer', title: href,
          'aria-label': linkLabel(href) + ' (nouvel onglet)',
        }, linkLabel(href), el('span', { 'aria-hidden': 'true' }, ' ↗')));
    }));
  }

  function section(group) {
    const headingId = 'h-' + group.id;
    const body = group.timeline
      ? el('ol', { class: 'timeline' }, group.entries.map((entry) => el('li', null,
        // Chronologie : date exacte, date relative en infobulle.
        el('time', { datetime: entry.cree_le, title: relativeDate(entry.cree_le) }, formatDay(entry.cree_le)),
        el('div', null,
          el('a', { href: entryHash(entry) }, entry.titre),
          isNew(entry, state.since) ? newBadge() : null,
          entry.resume ? el('p', null, entry.resume) : null))))
      : el('div', { class: 'grid' }, group.entries.map((entry) => card(entry, { since: state.since, showProject: false, heading: 'h4' })));
    return el('section', { class: 'project-section', 'aria-labelledby': headingId },
      el('h3', { id: headingId }, group.title, el('span', { class: 'count' }, ' · ' + group.entries.length)),
      body);
  }

  function localSection(members) {
    const addresses = projectLocalAddresses(members);
    if (!addresses.length) return null;
    return el('section', { class: 'project-section', 'aria-labelledby': 'h-local' },
      el('h3', { id: 'h-local' }, 'Adresses locales'),
      el('ul', { class: 'links-list' }, addresses.map((value) => {
        const button = el('button', { type: 'button', class: 'copy-btn' }, 'Copier');
        button.addEventListener('click', () => copy(value, 'Adresse copiée.'));
        return el('li', null,
          el('span', { class: 'local-label', title: 'Accessible seulement depuis la machine de Noah' }, 'adresse locale'),
          el('code', null, value), button);
      })));
  }

  function relatedSection(id, members) {
    const related = relatedProjects(id, members, state.projects);
    if (!related.length) return null;
    return el('section', { class: 'project-section', 'aria-labelledby': 'h-proches' },
      el('h3', { id: 'h-proches' }, 'Projets proches'),
      el('ul', { class: 'related-projects' }, related.map((p) => el('li', { 'data-couleur': p._family ? p._family.couleur : null },
        el('a', { href: projectHash(p.id) }, p.nom),
        el('span', { class: 'related-family' }, p._family ? p._family.nom : 'Sans famille')))));
  }

  return { showProject, projectEntries };
}
