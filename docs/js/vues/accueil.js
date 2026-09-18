/* Accueil : catalogue des projets par famille (ordre configuré, puis « Sans
   famille »), chaque famille triée par activité la plus récente d'abord. */
import { el, plural, projectCard } from '../composants.js';

/* [{ family (ou null pour « Sans famille »), projects }] ; seuls les projets
   qui ont au moins une entrée publiée, et les familles non vides. */
export function homeGroups(projects, families) {
  const groups = Array.from(families.values(), (family) => ({ family, projects: [] }));
  const byId = new Map(groups.map((group) => [group.family.id, group]));
  const orphans = { family: null, projects: [] };
  for (const project of projects.values()) {
    if (!project._count) continue;
    const group = project._family ? byId.get(project._family.id) : null;
    (group || orphans).projects.push(project);
  }
  return groups.concat(orphans)
    .filter((group) => group.projects.length)
    .map((group) => ({
      family: group.family,
      projects: group.projects.sort((a, b) => b._last - a._last
        || a.nom.localeCompare(b.nom, 'fr', { sensitivity: 'base' })),
    }));
}

export function createHomeView(ctx) {
  const { state, dom } = ctx;

  function showHome({ returning = false } = {}) {
    ctx.show(dom.pageView);
    document.title = 'Mémoire Vive';
    state.lastList = [];
    const groups = homeGroups(state.projects, state.families);
    const count = groups.reduce((total, group) => total + group.projects.length, 0);
    dom.pageView.replaceChildren(
      el('div', { class: 'home-head' },
        el('h2', { id: 'titre-vue', tabindex: '-1' }, 'Projets'),
        el('p', { class: 'home-intro' },
          plural(count, 'projet', 'projets') + ' par famille, du plus récemment actif au plus ancien. ',
          el('a', { href: '#/entrees' }, 'Voir toutes les entrées'))),
      ...groups.map((group, i) => el('section', {
        class: 'family', 'data-couleur': group.family ? group.family.couleur : null, 'aria-labelledby': 'famille-' + i,
      },
      el('h3', { id: 'famille-' + i, class: 'family-title' },
        el('span', { class: 'family-dot', 'aria-hidden': 'true' }),
        group.family ? group.family.nom : 'Sans famille',
        el('span', { class: 'count' }, ' · ' + plural(group.projects.length, 'projet', 'projets'))),
      el('div', { class: 'project-grid' }, group.projects.map((project) => projectCard(project, { since: state.since }))))),
    );
    ctx.focusView(returning);
  }

  return { showHome };
}
