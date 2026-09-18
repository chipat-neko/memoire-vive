/* Fiche d'une entrée : navigation (retour, précédente, suivante), liens,
   texte intégral, tags, entrées du même projet, détails. */
import { entryHash, projectHash, parseHash } from '../routes.js';
import { el, typeBadge, projectButton, typeLabel, formatLong, isWebUrl, copy } from '../composants.js';

/* Libellé du lien de retour selon la vue d'origine. */
export function backLabel(hash) {
  const origin = parseHash(hash);
  if (origin.view === 'project') return '← Retour au projet';
  if (origin.view === 'search') return '← Retour aux résultats';
  if (origin.view === 'home') return '← Retour à l’accueil';
  return '← Retour à la liste';
}

export function createEntryView(ctx) {
  const { state, dom } = ctx;

  function findEntry(prefix) {
    return state.entries.find((e) => String(e.id).toLowerCase().startsWith(prefix)) || null;
  }

  function showEntry(prefix) {
    ctx.show(dom.entryView);
    window.scrollTo(0, 0);

    const entry = findEntry(prefix);
    if (!entry) {
      document.title = 'Entrée introuvable — Mémoire Vive';
      dom.entryView.replaceChildren(el('div', { class: 'not-found' },
        el('h2', { id: 'entry-title', tabindex: '-1' }, 'Entrée introuvable'),
        el('p', null, "Cette entrée n'existe pas ou n'est plus dans la mémoire publiée."),
        el('a', { class: 'btn-secondary', href: '#/' }, '← Retour à l’accueil')));
      dom.entryView.querySelector('h2').focus();
      return;
    }

    document.title = entry.titre + ' — Mémoire Vive';
    state.openedId = entry._short;
    const sequence = state.lastList.includes(entry) ? state.lastList : ctx.list.sortEntries(state.entries.slice());
    const position = sequence.indexOf(entry);
    const previous = position > 0 ? sequence[position - 1] : null;
    const next = position >= 0 && position < sequence.length - 1 ? sequence[position + 1] : null;

    const back = el('a', { class: 'btn-secondary', href: state.lastListHash }, backLabel(state.lastListHash));
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
        ctx.route();
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
      .sort((a, b) => ctx.list.typeRank(a.type) - ctx.list.typeRank(b.type) || b._time - a._time);
    if (!siblings.length) return null;
    return el('section', { 'aria-labelledby': 'h-projet' },
      el('h3', { id: 'h-projet' }, 'Dans le même projet · ' + entry._projectName),
      el('ul', { class: 'siblings' }, siblings.slice(0, 15).map((s) =>
        el('li', null, typeBadge(s.type), el('a', { href: entryHash(s) }, s.titre)))),
      siblings.length > 15 ? el('p', null, el('a', { href: projectHash(entry.projet) },
        'Voir les ' + (siblings.length + 1) + ' entrées du projet')) : null);
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

  return { showEntry };
}
