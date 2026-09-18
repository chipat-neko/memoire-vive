/* Composants et mise en forme : création d'éléments (jamais d'innerHTML),
   libellés, dates, cartes, pastilles, copie, message éphémère. Aucun accès
   au DOM au chargement du module : les fonctions pures se testent sous Node. */
import { highlightRanges } from './recherche.js';
import { entryHash, projectHash } from './routes.js';

const TYPE_LABELS = {
  note: 'Note', milestone: 'Jalon', decision: 'Décision', reference: 'Référence',
  architecture: 'Architecture', observation: 'Observation', error: 'Erreur',
};

const fmtDay = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
const fmtLong = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short' });
// « auto » seulement pour les jours (« hier », « avant-hier »), comptés au
// calendrier ; semaines, mois et années en durée écoulée (« il y a 1 sem. »,
// pas « la semaine dernière », qui serait une semaine du calendrier).
const rtfDay = new Intl.RelativeTimeFormat('fr', { numeric: 'auto', style: 'short' });
const rtfShort = new Intl.RelativeTimeFormat('fr', { numeric: 'always', style: 'short' });
const rtfLong = new Intl.RelativeTimeFormat('fr', { numeric: 'always' });

export const VISIT_KEY = 'memoire-vive:derniere-visite';

export function el(tag, attrs, ...children) {
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

export function typeLabel(type) {
  if (TYPE_LABELS[type]) return TYPE_LABELS[type];
  if (!type) return 'Divers';
  const text = String(type).replace(/_/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// Espace insécable entre le nombre et le mot.
export function plural(count, one, many) {
  return count + '\xa0' + (count > 1 ? many : one);
}

// Date ISO ou horodatage en millisecondes.
export function formatDay(value) {
  const time = typeof value === 'number' ? value : Date.parse(value);
  return Number.isNaN(time) ? '' : fmtDay.format(time);
}

export function formatLong(iso) {
  const time = Date.parse(iso);
  return Number.isNaN(time) ? '' : fmtLong.format(time);
}

/* Jours du calendrier local entre deux instants (arrondi : un changement
   d'heure fait 23 ou 25 h). */
function calendarDays(time, now) {
  const startOfDay = (ms) => { const d = new Date(ms); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); };
  return Math.round((startOfDay(now) - startOfDay(time)) / 86400000);
}

/* « il y a 5 h », « hier », « avant-hier », « il y a 3 j », « il y a 2 sem. »,
   « il y a 3 mois »… ; now en ms. Moins de 24 h : en heures ; au-delà, en jours
   du calendrier, pour que « hier » soit toujours la veille. */
export function relativeDate(iso, now = Date.now()) {
  const time = typeof iso === 'number' ? iso : Date.parse(iso);
  if (Number.isNaN(time)) return '';
  const seconds = (now - time) / 1000;
  if (seconds < 60) return 'à l’instant';
  const minutes = seconds / 60;
  if (minutes < 60) return rtfShort.format(-Math.floor(minutes), 'minute');
  const hours = minutes / 60;
  if (hours < 24) return rtfShort.format(-Math.floor(hours), 'hour');
  const days = Math.max(1, calendarDays(time, now));
  if (days < 7) return rtfDay.format(-days, 'day');
  if (days < 30) return rtfShort.format(-Math.floor(days / 7), 'week');
  if (days < 365) return rtfLong.format(-Math.floor(days / 30), 'month');
  return rtfLong.format(-Math.floor(days / 365), 'year');
}

/* Date relative, date exacte en infobulle. */
export function timeElement(iso) {
  return el('time', { datetime: iso, title: formatLong(iso) }, relativeDate(iso));
}

/* Horodatage mémorisé à la visite précédente (null à la première visite ou
   sans stockage), puis mémorise stamp pour la prochaine. getStorage est une
   fonction : le simple accès à localStorage peut lever une exception. */
export function lastVisit(getStorage, stamp) {
  try {
    const storage = getStorage();
    const value = storage.getItem(VISIT_KEY);
    const time = value ? Date.parse(value) : NaN;
    storage.setItem(VISIT_KEY, stamp);
    return Number.isNaN(time) ? null : time;
  } catch (e) {
    return null;
  }
}

export function isNew(entry, since) {
  return since !== null && since !== undefined && entry._time > since;
}

export function newBadge() {
  return el('span', { class: 'new-badge' }, 'nouveau');
}

/* Bouton du lien principal : « Ouvrir le site ↗ » ou « Dépôt ↗ ». */
export function mainLinkButton(link, name) {
  if (!link) return null;
  const label = link.genre === 'depot' ? 'Dépôt' : 'Ouvrir le site';
  return el('a', {
    class: 'btn-secondary main-link', href: link.url, target: '_blank', rel: 'noopener noreferrer',
    title: link.url, 'aria-label': label + ' : ' + name + ' (nouvel onglet)',
  }, label, el('span', { 'aria-hidden': 'true' }, ' ↗'));
}

export function isWebUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch (e) {
    return false;
  }
}

let toastTimer = null;
export function toast(message) {
  const box = document.getElementById('toast');
  box.textContent = message;
  box.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => box.classList.remove('show'), 2600);
}

export async function copy(text, label) {
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

/* Surligne sans innerHTML : les plages viennent de recherche.js
   (targets : cibles renvoyées par search, ou null). */
export function highlight(text, targets) {
  const fragment = document.createDocumentFragment();
  text = String(text || '');
  const ranges = highlightRanges(text, targets);
  let cursor = 0;
  for (const [start, end] of ranges) {
    if (start > cursor) fragment.append(text.slice(cursor, start));
    fragment.append(el('mark', null, text.slice(start, end)));
    cursor = end;
  }
  if (cursor < text.length) fragment.append(text.slice(cursor));
  return fragment;
}

export function typeBadge(type) {
  return el('span', { class: 'type-badge', 'data-type': type }, typeLabel(type));
}

/* Lien vers la page du projet de l'entrée. */
export function projectButton(entry) {
  return el('a', {
    class: 'project-tag', href: projectHash(entry.projet), title: 'Page du projet ' + entry._projectName,
  }, '📁︎ ' + entry._projectName);
}

export function linksInfo(entry) {
  const parts = [];
  if (entry._online) parts.push(plural(entry._online, 'lien', 'liens'));
  if (entry._local) parts.push(plural(entry._local, 'adresse locale', 'adresses locales'));
  if (entry._invalid) parts.push(plural(entry._invalid, 'lien non cliquable', 'liens non cliquables'));
  return parts.length ? el('span', { class: 'links-info' }, parts.join(' · ')) : null;
}

/* Carte d'une entrée. options : targets (surlignage), since (dernière
   visite), showProject (lien vers le projet, inutile sur sa propre page),
   heading (niveau du titre : 'h4' dans une section titrée en h3). */
export function card(entry, { targets = null, since = null, showProject = true, heading = 'h3' } = {}) {
  const tagsShown = entry.tags.slice(0, 5);
  const extraTags = entry.tags.length - tagsShown.length;
  return el('article', { class: 'card', 'data-couleur': entry._family ? entry._family.couleur : null },
    el('div', { class: 'badges' }, typeBadge(entry.type), entry.projet && showProject ? projectButton(entry) : null,
      isNew(entry, since) ? newBadge() : null),
    el(heading, null, el('a', { class: 'entry-link', href: entryHash(entry) }, highlight(entry.titre, targets))),
    entry.resume ? el('p', { class: 'resume' }, highlight(entry.resume, targets)) : null,
    el('div', { class: 'meta-line' }, timeElement(entry.cree_le), linksInfo(entry)),
    tagsShown.length ? el('ul', { class: 'tags', 'aria-label': 'Tags' },
      tagsShown.map((tag) => el('li', null,
        el('button', { type: 'button', class: 'tag', 'data-action': 'tag', 'data-tag': tag }, highlight(tag, targets)))),
      extraTags > 0 ? el('li', { class: 'tag-more' }, '+' + extraTags) : null) : null,
    el('div', { class: 'actions' },
      el('a', { class: 'btn-primary', href: entryHash(entry), 'aria-label': 'Voir la fiche : ' + entry.titre }, 'Voir la fiche'),
      mainLinkButton(entry._mainLink, entry.titre)),
  );
}

/* Icône du lien principal (vue « Liste ») : lien distinct du titre. */
export function mainLinkIcon(link, name) {
  if (!link) return null;
  const label = link.genre === 'depot' ? 'Dépôt' : 'Ouvrir le site';
  return el('a', {
    class: 'main-link-icon', href: link.url, target: '_blank', rel: 'noopener noreferrer',
    title: link.url, 'aria-label': label + ' : ' + name + ' (nouvel onglet)',
  }, '↗');
}

/* Ligne d'une entrée (vue « Liste ») : type, titre (et « nouveau »), projet,
   date relative, icône du lien principal ; colonnes fixes (style.css). */
export function entryLine(entry, { targets = null, since = null } = {}) {
  return el('li', { class: 'entry-line', 'data-couleur': entry._family ? entry._family.couleur : null },
    typeBadge(entry.type),
    el('span', { class: 'entry-line-title' },
      el('a', { class: 'entry-link', href: entryHash(entry) }, highlight(entry.titre, targets)),
      isNew(entry, since) ? newBadge() : null),
    el('span', { class: 'entry-line-project' }, entry.projet ? entry._projectName : 'Sans projet'),
    timeElement(entry.cree_le),
    mainLinkIcon(entry._mainLink, entry.titre));
}

/* Carte d'un projet : le nom mène à sa page, le bouton du lien principal
   est un lien distinct (jamais un lien dans un autre). heading : niveau du
   titre, un sous celui de la section (famille, « Projets ») : 'h4'. */
export function projectCard(project, { since = null, targets = null, showFamily = false, heading = 'h4' } = {}) {
  const last = project._last ? new Date(project._last).toISOString() : null;
  return el('article', { class: 'project-card', 'data-couleur': project._family ? project._family.couleur : null },
    el(heading, null, el('a', { href: projectHash(project.id) }, highlight(project.nom, targets))),
    // Résultats de recherche : la famille (aussi cherchée) est écrite, le
    // liseré n'est jamais la seule information.
    showFamily ? el('p', { class: 'project-card-family' },
      highlight(project._family ? project._family.nom : 'Sans famille', targets)) : null,
    project.description ? el('p', { class: 'project-card-description' }, highlight(project.description, targets)) : null,
    // Une seule phrase dans un seul élément : l'écart de la ligne flexible
    // ne sépare que la phrase et la pastille « nouveau ».
    el('p', { class: 'meta-line' },
      el('span', null, plural(project._count, 'entrée', 'entrées'), last ? [' · dernière activité ', timeElement(last)] : null),
      isNew({ _time: project._last }, since) ? newBadge() : null),
    project._mainLink ? el('div', { class: 'actions' }, mainLinkButton(project._mainLink, project.nom)) : null);
}

export function chip(label, count, pressed, onClick, focusKey, extraClass) {
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
