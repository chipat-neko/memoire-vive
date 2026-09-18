/* Recherche : normalisation du texte, termes, pertinence, surlignage.
   Module pur (aucun accès au DOM) : testé sous Node (tests/js/). */

export function normalize(text) {
  // « cœur » se trouve en tapant « coeur », « l’atelier » en tapant « l'atelier ».
  return String(text || '').normalize('NFD').replace(/[\u{300}-\u{36f}]/gu, '').toLowerCase()
    .replace(/œ/g, 'oe').replace(/æ/g, 'ae').replace(/[’‘]/g, "'");
}

export function queryTerms(query) {
  return normalize(query).split(/\s+/).filter(Boolean);
}

function occurrences(haystack, needle) {
  let count = 0;
  let index = haystack.indexOf(needle);
  while (index !== -1 && count < 5) { count++; index = haystack.indexOf(needle, index + needle.length); }
  return count;
}

export function relevance(entry, terms) {
  let score = 0;
  for (const term of terms) {
    if (entry._title.includes(term)) score += 6;
    if (entry._meta.includes(term)) score += 3;
    if (entry._resume.includes(term)) score += 2;
    score += occurrences(entry._content, term);
  }
  return score;
}

/* Plages [début, fin[ du texte d'origine à surligner : la correspondance se
   fait sur le texte normalisé (sans accents), puis est reportée sur l'original. */
export function highlightRanges(text, terms) {
  text = String(text || '');
  if (!terms.length || !text) return [];

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
  if (!ranges.length) return [];

  ranges.sort((a, b) => a[0] - b[0]);
  const merged = [ranges[0].slice()];
  for (const [start, end] of ranges.slice(1)) {
    const last = merged[merged.length - 1];
    if (start <= last[1]) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  return merged;
}
