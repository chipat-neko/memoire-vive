/* Recherche tolérante : normalisation, racinisation légère, fautes de frappe,
   synonymes, syntaxe (ET, "expression", -exclusion, préfixe du dernier terme),
   score et surlignage. Module pur (aucun accès au DOM) : testé sous Node. */

const WEIGHTS = { title: 6, meta: 3, resume: 2, content: 1 };
const FIELDS = Object.keys(WEIGHTS);
const CONTENT_CAP = 5;      // plafond des points du texte intégral par terme
const QUALITY = { exact: 1, synonym: 0.9, prefix: 0.7, fuzzy1: 0.6, fuzzy2: 0.4 };
const CACHE_LIMIT = 500;
// Termes positifs qui tolèrent les fautes : chacun parcourt tout le vocabulaire ;
// un long texte collé ne fige pas la page (les suivants : exact, préfixe, synonymes).
const FUZZY_TERMS = 10;

export function normalize(text) {
  // « cœur » se trouve en tapant « coeur », « l’atelier » en tapant « l'atelier ».
  return String(text || '').normalize('NFD').replace(/[\u{300}-\u{36f}]/gu, '').toLowerCase()
    .replace(/œ/g, 'oe').replace(/æ/g, 'ae').replace(/[’‘]/g, "'");
}

const WORD = /[\p{L}\p{N}]+/gu;

export function tokenize(text) {
  return normalize(text).match(WORD) || [];
}

/* Pluriels seulement : -eaux → -eau, -aux → -al, -x, -s (pas -ss). Les mots
   de moins de 4 caractères et ceux qui contiennent un chiffre restent tels quels. */
export function stem(word) {
  if (word.length < 4 || /\d/.test(word)) return word;
  if (word.endsWith('eaux')) return word.slice(0, -1);
  if (word.endsWith('aux')) return word.slice(0, -3) + 'al';
  if (word.endsWith('x')) return word.slice(0, -1);
  if (word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

/* Distance d'édition avec transposition de deux lettres voisines ; renvoie
   max + 1 dès que la distance dépasse max (arrêt anticipé). */
export function editDistance(a, b, max) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const width = b.length + 1;
  let before = new Int32Array(width);
  let previous = new Int32Array(width);
  let current = new Int32Array(width);
  for (let j = 0; j < width; j++) previous[j] = j;
  for (let i = 1; i <= a.length; i++) {
    current[0] = i;
    let best = i;
    for (let j = 1; j < width; j++) {
      let value = previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1);
      if (previous[j] + 1 < value) value = previous[j] + 1;
      if (current[j - 1] + 1 < value) value = current[j - 1] + 1;
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1] && before[j - 2] + 1 < value) {
        value = before[j - 2] + 1;
      }
      current[j] = value;
      if (value < best) best = value;
    }
    if (best > max) return max + 1;
    [before, previous, current] = [previous, current, before];
  }
  return Math.min(previous[b.length], max + 1);
}

/* Article ou pronom élidé en tête d'un terme (« l'IA », « d'applications »,
   « qu'un ») : le texte est déjà normalisé, l'apostrophe est droite. */
const ELISION = /^(?:qu|[cdjlmnst])'(?=[\p{L}\p{N}])/u;

/* Termes de la requête : { words, quoted, exclude, prefix }. Les guillemets
   typographiques valent des guillemets droits ; un guillemet non fermé vaut
   jusqu'à la fin. Seul le dernier terme (frappe en cours) accepte les préfixes,
   et jamais une lettre seule (elle s'étendrait à tout le vocabulaire). Hors
   guillemets, l'article élidé est retiré : « l'IA » cherche « IA ». */
export function parseQuery(query) {
  const text = normalize(query).replace(/[“”«»]/g, '"');
  const terms = [];
  const pattern = /(-?)"([^"]*)("?)|(\S+)/g;
  let match;
  while ((match = pattern.exec(text))) {
    if (match[4] !== undefined) {
      let raw = match[4];
      const exclude = raw.length > 1 && raw.startsWith('-');
      if (exclude) raw = raw.slice(1);
      const words = tokenize(raw.replace(ELISION, ''));
      if (words.length) terms.push({ words, quoted: false, exclude, closed: true, prefix: false });
    } else {
      const words = tokenize(match[2]);
      if (words.length) terms.push({ words, quoted: true, exclude: match[1] === '-', closed: match[3] === '"', prefix: false });
    }
  }
  const last = terms[terms.length - 1];
  if (last && !last.exclude && !(last.quoted && last.closed) && (last.words.length > 1 || last.words[0].length >= 2)) {
    last.prefix = true;
  }
  return terms.map(({ closed, ...term }) => term);
}

/* « intelligence artificielle », « hors ligne » tapés avec une espace : des
   termes consécutifs, sans guillemets ni exclusion, qui forment ensemble un
   membre d'un groupe de synonymes deviennent un seul terme (le plus long
   possible), qui vaut alors n'importe quel terme du groupe. */
function mergeSynonymRuns(index, terms) {
  if (!index.groupOf.size) return terms;
  const merged = [];
  for (let i = 0; i < terms.length;) {
    let size = Math.min(index.longestSynonym, terms.length - i);
    for (; size >= 2; size--) {
      const run = terms.slice(i, i + size);
      if (run.some((t) => t.quoted || t.exclude)) continue;
      if (index.groupOf.has(run.flatMap((t) => t.words).map(stem).join(' '))) break;
    }
    if (size < 2) {
      merged.push(terms[i]);
      i += 1;
    } else {
      const run = terms.slice(i, i + size);
      merged.push({ words: run.flatMap((t) => t.words), quoted: false, exclude: false, prefix: run[size - 1].prefix });
      i += size;
    }
  }
  return merged;
}

function fieldIndex(text) {
  const raw = tokenize(text);
  const stems = raw.map(stem);
  const counts = new Map();
  for (const s of stems) counts.set(s, (counts.get(s) || 0) + 1);
  return { raw: ' ' + raw.join(' ') + ' ', stems: ' ' + stems.join(' ') + ' ', counts };
}

/* documents : [{ title, meta, resume, content }] (textes bruts) ;
   synonyms : groupes de termes équivalents (data.json, « synonymes »). */
export function buildIndex(documents, synonyms = []) {
  const docs = documents.map((doc) => {
    const fields = {};
    for (const name of FIELDS) fields[name] = fieldIndex(doc[name]);
    return fields;
  });
  const postings = new Map();
  docs.forEach((fields, i) => {
    for (const name of FIELDS) {
      for (const word of fields[name].counts.keys()) {
        let set = postings.get(word);
        if (!set) postings.set(word, (set = new Set()));
        set.add(i);
      }
    }
  });
  const groups = [];
  const groupOf = new Map();
  for (const group of Array.isArray(synonyms) ? synonyms : []) {
    if (!Array.isArray(group)) continue;
    const members = Array.from(new Set(group.map((t) => tokenize(t).map(stem).join(' ')).filter(Boolean)));
    if (members.length < 2) continue;
    for (const key of members) if (!groupOf.has(key)) groupOf.set(key, groups.length);
    groups.push(members);
  }
  // Nombre de mots du plus long membre d'un groupe (regroupement des termes).
  const longestSynonym = Math.max(0, ...Array.from(groupOf.keys(), (key) => key.split(' ').length));
  return { docs, postings, words: Array.from(postings.keys()).sort(), groups, groupOf, longestSynonym, cache: new Map() };
}

function firstAtLeast(sorted, value) {
  let low = 0;
  let high = sorted.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (sorted[mid] < value) low = mid + 1;
    else high = mid;
  }
  return low;
}

/* Mots du vocabulaire (racines) qui valent pour un mot de la requête, avec
   leur qualité : exact 1, synonyme 0,9, préfixe 0,7, faute 0,6 ou 0,4. */
function wordCandidates(index, word, prefix, fuzzy) {
  const found = new Map();
  const phrases = [];
  const add = (w, quality) => { if ((found.get(w) || 0) < quality) found.set(w, quality); };
  const s = stem(word);
  if (index.postings.has(s)) add(s, QUALITY.exact);
  if (prefix && word.length >= 2) {
    for (let i = firstAtLeast(index.words, word); i < index.words.length && index.words[i].startsWith(word); i++) {
      add(index.words[i], QUALITY.prefix);
    }
  }
  // Seuils sur la racine comparée (pas sur le mot tapé) : « cours » (racine
  // « cour », 4 lettres) est cherché exactement, sans devenir « pour » ou « jour ».
  if (fuzzy && s.length >= 5) {
    const max = s.length >= 8 ? 2 : 1;
    for (const w of index.words) {
      if (Math.abs(w.length - s.length) > max || found.has(w)) continue;
      const distance = editDistance(s, w, max);
      if (distance <= max) add(w, distance === 1 ? QUALITY.fuzzy1 : QUALITY.fuzzy2);
    }
  }
  synonymsOf(index, s, add, phrases);
  return { found, phrases };
}

function synonymsOf(index, key, add, phrases) {
  const group = index.groupOf.get(key);
  if (group === undefined) return;
  for (const member of index.groups[group]) {
    if (member === key) continue;
    if (member.includes(' ')) phrases.push({ tokens: member.split(' '), stemmed: true, prefix: false, quality: QUALITY.synonym });
    else if (index.postings.has(member)) add(member, QUALITY.synonym);
  }
}

function occurrencesOf(haystack, needle) {
  let count = 0;
  let at = haystack.indexOf(needle);
  while (at !== -1 && count < CONTENT_CAP) { count++; at = haystack.indexOf(needle, at + 1); }
  return count;
}

function phraseNeedle(phrase) {
  return ' ' + phrase.tokens.join(' ') + (phrase.prefix ? '' : ' ');
}

function scorePhrase(fields, phrase) {
  const needle = phraseNeedle(phrase);
  let score = 0;
  for (const name of FIELDS) {
    const haystack = phrase.stemmed ? fields[name].stems : fields[name].raw;
    if (name === 'content') score += Math.min(CONTENT_CAP, occurrencesOf(haystack, needle)) * phrase.quality;
    else if (haystack.includes(needle)) score += WEIGHTS[name] * phrase.quality;
  }
  return score;
}

/* Parcourt le plus petit des deux ensembles (mots du champ ou mots
   trouvés) : un préfixe d'une lettre peut valoir des milliers de mots. */
function scoreWords(fields, found) {
  let score = 0;
  for (const name of FIELDS) {
    const counts = fields[name].counts;
    let best = 0;
    let points = 0;
    if (counts.size < found.size) {
      for (const [w, count] of counts) {
        const quality = found.get(w);
        if (quality === undefined) continue;
        points += count * quality;
        if (quality > best) best = quality;
      }
    } else {
      for (const [w, quality] of found) {
        const count = counts.get(w);
        if (count === undefined) continue;
        points += count * quality;
        if (quality > best) best = quality;
      }
    }
    score += name === 'content' ? Math.min(CONTENT_CAP, points) : WEIGHTS[name] * best;
  }
  return score;
}

function phraseDocs(index, phrase) {
  const complete = phrase.tokens.length > 1 || !phrase.prefix;
  const first = phrase.stemmed ? phrase.tokens[0] : stem(phrase.tokens[0]);
  if (complete) return index.postings.get(first) || new Set();
  return index.docs.keys();
}

/* Ce qu'un terme positif accepte (mots du vocabulaire, expressions) et les
   documents qui le contiennent ; mis en cache : pendant la frappe, seul le
   dernier terme change. */
function candidatesOf(index, term, fuzzy) {
  const key = (fuzzy ? '~' : '=') + JSON.stringify(term);
  if (index.cache.has(key)) return index.cache.get(key);
  let found = new Map();
  const phrases = [];
  if (term.quoted) {
    phrases.push({ tokens: term.words, stemmed: false, prefix: term.prefix, quality: QUALITY.exact });
  } else if (term.words.length === 1) {
    const candidates = wordCandidates(index, term.words[0], term.prefix, fuzzy);
    found = candidates.found;
    phrases.push(...candidates.phrases);
  } else {
    const stems = term.words.map(stem);
    phrases.push({ tokens: stems, stemmed: true, prefix: term.prefix, quality: QUALITY.exact });
    synonymsOf(index, stems.join(' '), (w, q) => found.set(w, Math.max(found.get(w) || 0, q)), phrases);
  }
  const docs = new Set();
  for (const w of found.keys()) for (const doc of index.postings.get(w) || []) docs.add(doc);
  for (const phrase of phrases) {
    for (const doc of phraseDocs(index, phrase)) {
      if (!docs.has(doc) && scorePhrase(index.docs[doc], phrase) > 0) docs.add(doc);
    }
  }
  const result = { found, phrases, docs };
  if (index.cache.size >= CACHE_LIMIT) index.cache.clear();
  index.cache.set(key, result);
  return result;
}

function termScore(fields, candidates) {
  let score = candidates.found.size ? scoreWords(fields, candidates.found) : 0;
  for (const phrase of candidates.phrases) score += scorePhrase(fields, phrase);
  return score;
}

function excluded(index, term) {
  if (term.words.length === 1 && !term.quoted) return index.postings.get(stem(term.words[0])) || new Set();
  const phrase = term.quoted
    ? { tokens: term.words, stemmed: false, prefix: false, quality: 1 }
    : { tokens: term.words.map(stem), stemmed: true, prefix: false, quality: 1 };
  const docs = new Set();
  for (const doc of phraseDocs(index, phrase)) if (scorePhrase(index.docs[doc], phrase) > 0) docs.add(doc);
  return docs;
}

/* Résultat : hits [{ doc, score }] du meilleur au moins bon (indices des
   documents de buildIndex), targets pour highlightRanges, active : la requête
   contient au moins un terme positif (sinon tout document non exclu est gardé,
   avec un score nul). Seuls les documents qui ont tous les termes sont notés. */
export function search(index, query) {
  const terms = mergeSynonymRuns(index, parseQuery(query));
  const positives = terms.filter((t) => !t.exclude).map((t, i) => candidatesOf(index, t, i < FUZZY_TERMS));
  const targets = { words: new Set(), phrases: [] };
  for (const candidates of positives) {
    for (const w of candidates.found.keys()) targets.words.add(w);
    targets.phrases.push(...candidates.phrases);
  }
  let docs;
  if (positives.length) {
    const bySize = positives.slice().sort((a, b) => a.docs.size - b.docs.size);
    docs = Array.from(bySize[0].docs).filter((doc) => bySize.every((c) => c.docs.has(doc)));
  } else {
    docs = Array.from(index.docs.keys());
  }
  const removed = new Set();
  for (const term of terms) if (term.exclude) for (const doc of excluded(index, term)) removed.add(doc);
  const hits = docs.filter((doc) => !removed.has(doc)).map((doc) => ({
    doc,
    score: positives.reduce((sum, candidates) => sum + termScore(index.docs[doc], candidates), 0),
  })).sort((a, b) => b.score - a.score || a.doc - b.doc);
  return { hits, targets, active: positives.length > 0 };
}

/* Plages [début, fin[ du texte d'origine à surligner : mots dont la racine
   est une cible, et expressions ; la comparaison se fait sur le texte
   normalisé, reporté sur l'original caractère par caractère. */
export function highlightRanges(text, targets) {
  text = String(text || '');
  if (!text || !targets || (!targets.words.size && !targets.phrases.length)) return [];

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

  const tokens = [];
  for (const match of normalized.matchAll(WORD)) {
    tokens.push({ raw: match[0], stem: stem(match[0]), start: map[match.index], end: map[match.index + match[0].length] });
  }
  const ranges = [];
  for (const token of tokens) if (targets.words.has(token.stem)) ranges.push([token.start, token.end]);
  for (const phrase of targets.phrases) {
    const size = phrase.tokens.length;
    for (let i = 0; i + size <= tokens.length; i++) {
      let ok = true;
      for (let k = 0; k < size && ok; k++) {
        const token = tokens[i + k];
        const have = phrase.stemmed ? token.stem : token.raw;
        const want = phrase.tokens[k];
        ok = phrase.prefix && k === size - 1 ? token.raw.startsWith(want) || have.startsWith(want) : have === want;
      }
      if (ok) ranges.push([tokens[i].start, tokens[i + size - 1].end]);
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
