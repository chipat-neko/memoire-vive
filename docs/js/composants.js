/* Composants et mise en forme : création d'éléments (jamais d'innerHTML),
   libellés, dates, cartes, pastilles, copie, message éphémère. Aucun accès
   au DOM au chargement du module : les fonctions pures se testent sous Node. */
import { highlightRanges } from './recherche.js';
import { entryHash } from './routes.js';

const TYPE_LABELS = {
  note: 'Note', milestone: 'Jalon', decision: 'Décision', reference: 'Référence',
  architecture: 'Architecture', observation: 'Observation', error: 'Erreur',
};
const TYPE_PLURALS = {
  note: 'notes', milestone: 'jalons', decision: 'décisions', reference: 'références',
  architecture: 'architectures', observation: 'observations', error: 'erreurs',
};

const fmtDay = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
const fmtLong = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short' });

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
  const text = type.replace(/_/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// Espace insécable entre le nombre et le mot.
export function plural(count, one, many) {
  return count + '\xa0' + (count > 1 ? many : one);
}

export function typeCount(type, count) {
  const one = typeLabel(type).toLowerCase();
  return plural(count, one, TYPE_PLURALS[type] || one + 's');
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

export function projectButton(entry) {
  return el('button', {
    type: 'button', class: 'project-tag', 'data-action': 'project', 'data-project': entry._project,
    title: 'Voir toutes les entrées de ce projet',
  }, '📁︎ ' + entry._projectName);
}

export function linksInfo(entry) {
  const parts = [];
  if (entry._online) parts.push(plural(entry._online, 'lien', 'liens'));
  if (entry._local) parts.push(plural(entry._local, 'adresse locale', 'adresses locales'));
  if (entry._invalid) parts.push(plural(entry._invalid, 'lien non cliquable', 'liens non cliquables'));
  return parts.length ? el('span', { class: 'links-info' }, parts.join(' · ')) : null;
}

export function card(entry, targets) {
  const tagsShown = entry.tags.slice(0, 5);
  const extraTags = entry.tags.length - tagsShown.length;
  return el('article', { class: 'card' },
    el('div', { class: 'badges' }, typeBadge(entry.type), entry.projet ? projectButton(entry) : null),
    el('h3', null, el('a', { href: entryHash(entry) }, highlight(entry.titre, targets))),
    entry.resume ? el('p', { class: 'resume' }, highlight(entry.resume, targets)) : null,
    el('div', { class: 'meta-line' },
      el('time', { datetime: entry.cree_le }, formatDay(entry.cree_le)),
      linksInfo(entry)),
    tagsShown.length ? el('ul', { class: 'tags', 'aria-label': 'Tags' },
      tagsShown.map((tag) => el('li', null,
        el('button', { type: 'button', class: 'tag', 'data-action': 'tag', 'data-tag': tag }, highlight(tag, targets)))),
      extraTags > 0 ? el('li', { class: 'tag-more' }, '+' + extraTags) : null) : null,
    el('div', { class: 'actions' },
      el('a', { class: 'btn-primary', href: entryHash(entry), 'aria-label': 'Voir la fiche : ' + entry.titre }, 'Voir la fiche')),
  );
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
