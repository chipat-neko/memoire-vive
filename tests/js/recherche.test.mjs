import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalize, tokenize, stem, editDistance, parseQuery, buildIndex, search, highlightRanges,
} from '../../docs/js/recherche.js';

const DOCS = [
  { title: 'Jarvis — architecture', meta: 'Jarvis jarvis architecture Référence reference', resume: 'Pipeline vocal local.', content: 'Jarvis : pipeline vocal local, intelligence artificielle embarquée.' },
  { title: 'Depths — donjon', meta: 'Depths depths Jalon milestone', resume: 'Des jeux de tuiles.', content: 'Génération de donjon, animaux mutants, réseaux de grottes.' },
  { title: 'Voxelcraft — un jeu de cubes', meta: 'Voxelcraft voxelcraft Note note', resume: 'Un animal par biome.', content: 'Un réseau de rivières, mode hors ligne.' },
  { title: 'Tour de contrôle — sessions', meta: 'Tour de contrôle tour-de-controle Note note', resume: '', content: 'La tour de contrôle suit les sessions.' },
  { title: 'Tour de garde et contrôle', meta: 'Sécurité securite Note note', resume: '', content: 'Un tour de garde puis un contrôle.' },
  { title: 'Note sur un modèle', meta: 'Divers note', resume: '', content: 'Un LLM tourne sur la carte graphique, avec Jarvis en exemple.' },
];
const SYNONYMES = [['ia', 'intelligence artificielle', 'llm'], ['local', 'hors ligne', 'offline']];
const index = buildIndex(DOCS, SYNONYMES);
const trouves = (requete) => search(index, requete).hits.map((h) => h.doc).sort((a, b) => a - b);

test('normalisation : accents, ligatures, apostrophes', () => {
  assert.equal(normalize('Cœur Été L’Atelier'), "coeur ete l'atelier");
  assert.deepEqual(tokenize('L’atelier : 3D, hors-ligne !'), ['l', 'atelier', '3d', 'hors', 'ligne']);
});

test('racinisation légère : pluriels seulement', () => {
  assert.equal(stem('jeux'), 'jeu');
  assert.equal(stem('reseaux'), 'reseau');
  assert.equal(stem('animaux'), 'animal');
  assert.equal(stem('chevaux'), 'cheval');
  assert.equal(stem('tests'), 'test');
  assert.equal(stem('process'), 'process');
  assert.equal(stem('bus'), 'bus');
  assert.equal(stem('3ds'), '3ds');
  assert.equal(stem('architecture'), 'architecture');
});

test('distance d’édition avec transposition et arrêt anticipé', () => {
  assert.equal(editDistance('jarvsi', 'jarvis', 1), 1);
  assert.equal(editDistance('architecure', 'architecture', 2), 1);
  assert.equal(editDistance('arhcitecure', 'architecture', 2), 2);
  assert.equal(editDistance('abc', 'xyz', 1), 2);
  assert.equal(editDistance('court', 'beaucoup plus long', 2), 3);
});

test('syntaxe : ET, expression, exclusion, préfixe du dernier terme', () => {
  assert.deepEqual(parseQuery('Jarvis "tour de" -vocal archi'), [
    { words: ['jarvis'], quoted: false, exclude: false, prefix: false },
    { words: ['tour', 'de'], quoted: true, exclude: false, prefix: false },
    { words: ['vocal'], quoted: false, exclude: true, prefix: false },
    { words: ['archi'], quoted: false, exclude: false, prefix: true },
  ]);
  assert.deepEqual(parseQuery('«tour de contr'), [{ words: ['tour', 'de', 'contr'], quoted: true, exclude: false, prefix: true }]);
  assert.deepEqual(parseQuery('"tour de" -'), [{ words: ['tour', 'de'], quoted: true, exclude: false, prefix: false }]);
  assert.deepEqual(parseQuery('   '), []);
});

test('fautes de frappe : seuils selon la longueur du terme', () => {
  assert.deepEqual(trouves('jarvsi pipeline'), [0]);                 // 6 lettres, 1 faute
  assert.deepEqual(trouves('vcola pipeline'), []);                   // 5 lettres, 2 fautes : non
  assert.deepEqual(trouves('architecure pipeline'), [0]);            // 11 lettres, 1 faute
  assert.deepEqual(trouves('arhcitecure pipeline'), [0]);            // 11 lettres, 2 fautes
  assert.deepEqual(trouves('arhcitecurr pipeline'), []);             // 3 fautes : non
  assert.deepEqual(trouves('tuor pipeline'), []);                    // 4 lettres : exact seulement
});

test('fautes : le seuil vient de la racine comparée, pas du mot tapé', () => {
  // « tours » et « cours » ont pour racine « tour », « cour » (4 lettres) :
  // exact ou préfixe seulement, jamais « pour » ou « jour » (2 fautes sur le
  // mot tapé). « versions », « serveurs » : racines de 7 lettres, 1 faute.
  const idx = buildIndex([
    { title: 'Pour le jour', meta: '', resume: '', content: 'Pour une journée.' },
    { title: 'Une vision', meta: '', resume: '', content: 'Servir et serve.' },
  ]);
  const docs = (q) => search(idx, q).hits.map((h) => h.doc);
  for (const q of ['tours', 'cours', 'tours pour', 'versions', 'serveurs']) assert.deepEqual(docs(q), [], q);
  assert.deepEqual(docs('pours'), [0]);                             // pluriel de « pour » : exact
  assert.deepEqual(trouves('dnojons grottes'), [1]);                // racine de 6 lettres : 1 faute
});

test('fautes : tolérées sur les 10 premiers termes positifs seulement (texte collé)', () => {
  const mots = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel', 'india', 'juliet', 'kilo'];
  const idx = buildIndex([{ title: '', meta: '', resume: '', content: mots.join(' ') + ' jarvis fin' }]);
  const docs = (q) => search(idx, q).hits.map((h) => h.doc);
  assert.deepEqual(docs('jarvsi ' + mots.join(' ') + ' fin'), [0]);    // 1er terme : faute tolérée
  assert.deepEqual(docs(mots.join(' ') + ' jarvsi fin'), []);          // 12e terme : exact seulement
  assert.deepEqual(docs(mots.join(' ') + ' jarvis fin'), [0]);
});

test('préfixe : seulement pour le dernier terme', () => {
  assert.deepEqual(trouves('pipeline archi'), [0]);
  assert.deepEqual(trouves('archi pipeline'), []);
  assert.deepEqual(trouves('don'), [1]);
  assert.deepEqual(trouves('d'), []);                               // une lettre : pas de préfixe
});

test('pluriels : singulier et pluriel se trouvent l’un l’autre', () => {
  assert.deepEqual(trouves('jeu cubes'), [2]);
  assert.deepEqual(trouves('jeux tuile'), [1]);
  assert.deepEqual(trouves('animal grotte'), [1]);
  assert.deepEqual(trouves('reseaux rivieres'), [2]);
});

test('synonymes : un terme vaut n’importe quel terme de son groupe', () => {
  assert.deepEqual(trouves('llm embarquee'), [0]);
  assert.deepEqual(trouves('offline rivieres'), [2]);
  assert.deepEqual(trouves('ia graphique'), [5]);
});

test('synonymes de plusieurs mots tapés avec une espace : dans les deux sens', () => {
  assert.deepEqual(trouves('hors ligne'), trouves('offline'));
  assert.deepEqual(trouves('hors ligne'), [0, 2]);
  assert.deepEqual(trouves('intelligence artificielle'), [0, 5]);    // 5 : « LLM » seulement
  assert.deepEqual(trouves('hors ligne rivieres'), [2]);             // groupe, puis ET
  assert.deepEqual(trouves('"hors ligne"'), [2]);                    // guillemets : expression exacte
  assert.deepEqual(trouves('-hors ligne'), []);                      // exclusion : jamais regroupée
});

test('article élidé : « l’IA » vaut « IA », « d’applications » vaut « applications »', () => {
  assert.deepEqual(parseQuery('l’IA'), [{ words: ['ia'], quoted: false, exclude: false, prefix: true }]);
  assert.deepEqual(parseQuery("-d'animaux qu'un"), [
    { words: ['animaux'], quoted: false, exclude: true, prefix: false },
    { words: ['un'], quoted: false, exclude: false, prefix: true },
  ]);
  assert.deepEqual(trouves("l'ia graphique"), trouves('ia graphique'));
  assert.deepEqual(trouves("l'ia graphique"), [5]);
  assert.deepEqual(trouves("d'intelligence artificielle"), [0, 5]);
  assert.deepEqual(parseQuery('"l’atelier"')[0].words, ['l', 'atelier']); // guillemets : inchangé
  assert.deepEqual(parseQuery("aujourd'hui")[0].words, ['aujourd', 'hui']);
  // Frappe en cours de « l'atelier » : pas de recherche du seul mot « a ».
  assert.deepEqual(parseQuery("l'a"), [{ words: ['l', 'a'], quoted: false, exclude: false, prefix: true }]);
});

test('guillemet ouvert et une seule lettre : pas de préfixe (tout le vocabulaire)', () => {
  assert.deepEqual(parseQuery('"d'), [{ words: ['d'], quoted: true, exclude: false, prefix: false }]);
  assert.deepEqual(parseQuery('d'), [{ words: ['d'], quoted: false, exclude: false, prefix: false }]);
  assert.deepEqual(trouves('"d'), trouves('d'));
  assert.deepEqual(trouves('"d'), []);
  assert.deepEqual(trouves('"donj'), [1]);                          // deux lettres et plus : préfixe
});

test('expression exacte et termes combinés en ET', () => {
  assert.deepEqual(trouves('tour de controle'), [3, 4]);
  assert.deepEqual(trouves('"tour de controle"'), [3]);
  assert.deepEqual(trouves('"tour de contr'), [3]);
  assert.deepEqual(trouves('jarvis donjon'), []);
});

test('exclusion : -mot et -"expression"', () => {
  assert.deepEqual(trouves('jarvis -vocal'), [5]);
  assert.deepEqual(trouves('tour -"tour de controle"'), [4]);
  const seul = search(index, '-jarvis');
  assert.equal(seul.active, false);
  assert.deepEqual(seul.hits.map((h) => h.doc).sort(), [1, 2, 3, 4]);
});

test('score : le titre compte plus que le texte, l’exact plus que l’approché', () => {
  const jarvis = search(index, 'jarvis').hits;
  assert.equal(jarvis[0].doc, 0);
  assert.ok(jarvis[0].score > jarvis[1].score);
  const exact = search(index, 'donjon').hits[0].score;
  const approche = search(index, 'dnojon').hits[0].score;
  assert.ok(exact > approche, `${exact} > ${approche}`);
});

test('surlignage : mots exacts, approchés, pluriels et expressions, sur le texte d’origine', () => {
  const texte = 'La Mémoire des jeux : réseaux, cœur, donjon, tour de contrôle.';
  const extraits = (requete) => highlightRanges(texte, search(index, requete).targets).map(([a, b]) => texte.slice(a, b));
  assert.deepEqual(extraits('jeu'), ['jeux']);
  assert.deepEqual(extraits('reseau'), ['réseaux']);
  assert.deepEqual(extraits('"tour de controle"'), ['tour de contrôle']);
  assert.deepEqual(extraits('dnojon'), ['donjon']);
  assert.deepEqual(highlightRanges(texte, { words: new Set(['coeur', 'memoire']), phrases: [] })
    .map(([a, b]) => texte.slice(a, b)), ['Mémoire', 'cœur']);
  assert.deepEqual(highlightRanges(texte, null), []);
});
