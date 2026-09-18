# Chantier B — site public : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Faire du site public (`docs/`) un catalogue des projets par famille, avec pages projet, onglet « Toutes les entrées » (grille ou liste, filtre famille), recherche tolérante (pluriels, fautes, synonymes, expressions, exclusions) avec page de résultats et « En rapport », cartes enrichies (liseré de famille, lien principal, « nouveau », dates relatives) et fiche « Voir aussi », en passant `data.json` au schéma 2.

**Architecture:** `docs/app.js` (IIFE de 977 lignes) est d'abord protégé par la suite navigateur existante, rapatriée dans le dépôt (`tests/navigateur/`), puis découpé sans changement de comportement en modules ES (`docs/js/`), chargés par `<script type="module">` avec des chemins relatifs (le site est servi sous `/memoire-vive/`). La logique pure (recherche, routes, préparation des données, formats) se teste sous Node (`node --test`, sans dépendance) ; chaque vue a son module et ses tests navigateur. Les nouvelles vues arrivent une à une derrière le nouveau routeur ; `schema` passe à 2 dans le même commit pour l'export et le site.

**Tech Stack:** HTML/CSS/JavaScript vanilla (modules ES, aucune dépendance, CSP stricte) ; Node 22+ (`node --test`, glob) pour les tests unitaires du site ; `playwright-core` 1.63.0 (dépendance de développement isolée dans `tests/navigateur/`) pilotant le Chrome installé ; Python 3.9+ `unittest` pour l'export.

**Spec:** `conception/2026-09-18-ameliorations-design.md` — § 4 (chantier B, site public), § 6 B (tests) et § 2 (décisions). Plan précédent, pour le style : `conception/plans/2026-09-18-chantier-a-donnees.md`.

## Global Constraints

- Site public 100 % statique : aucune dépendance externe, aucun appel réseau hors son propre `data.json`.
- CSP inchangée : `default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; manifest-src 'self'; base-uri 'none'; form-action 'none'` — donc aucun script ni style en ligne, aucun attribut `style`.
- Modules ES (`<script type="module">`, compatibles avec `script-src 'self'`), imports relatifs : le site vit sous `/memoire-vive/` ; `theme.js` reste un script classique chargé avant le rendu.
- Jamais d'`innerHTML` avec des données : DOM construit par `createElement`/`textContent` (fonction `el`).
- Toute URL venue des données est vérifiée `http(s)` avant d'être rendue en lien ; liens externes `target="_blank" rel="noopener noreferrer"`.
- Acquis de la première revue conservés : focus après un filtre et au retour d'une fiche, contrastes AA en clair et en sombre, historique (Précédente/Suivante remplacent la fiche, « Retour » suit la profondeur d'historique), lien d'évitement qui ne réinitialise pas les filtres, mobile sans défilement horizontal.
- Routes : `#/`, `#/entrees?type=&projet=&famille=&tag=&tri=&vue=grille|liste`, `#/recherche?q=…`, `#/projet/<id>`, `#/entree/<id court>` ; les anciennes ancres `#/?q=…&type=…` redirigent vers leur équivalent.
- Recherche : normalisation actuelle (minuscules, accents, `œ`, `æ`, apostrophes) ; racinisation `-s`, `-x`, `-aux → -al`, `-eaux → -eau` seulement ; fautes : 5 à 7 caractères distance ≤ 1 (avec transposition), ≥ 8 caractères ≤ 2, sous 5 caractères exact ou préfixe ; comparaison contre le vocabulaire de l'index ; ET, `"expression exacte"`, `-mot`, préfixe pour le dernier terme ; score titre ×6, projet/tags/type ×3, résumé ×2, texte ×1 (plafonné), bonus à l'exact ; « En rapport » : voisins des 5 meilleurs résultats absents des résultats, au plus 6, par score de voisinage cumulé.
- Performance : sur 3 000 entrées générées, une frappe < 50 ms.
- Familles : couleur 1 à 6, clair et sombre, contraste vérifié ; le liseré n'est jamais la seule information (nom de la famille écrit sur la page projet et dans les filtres).
- Dernière visite : `localStorage`, clé `memoire-vive:derniere-visite`, lue au chargement puis mise à jour, accès sous `try/catch` ; sans stockage, aucune pastille « nouveau ».
- Dates relatives : `Intl.RelativeTimeFormat('fr')`, date exacte en infobulle.
- `schema` : le site refuse `schema > 2` avec le message existant « recharger la page » ; `SCHEMA_VERSION = 2` (export) et le site passent à 2 dans le même commit, donc le même push.
- Tests navigateur : une commande (`npm test` dans `tests/navigateur/`, après `npm install` une fois), serveur statique propre sur un port libre, Chrome installé (`MEMOIRE_CHROME`, défaut `C:/Program Files/Google/Chrome/Application/chrome.exe`) ; `node_modules` ignoré par git.
- Textes, commentaires et messages en français, accents corrects ; identifiants de code en anglais comme dans `app.js` et `export.py`.
- Chaque commit se termine par la ligne `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.
- Ni commit de publication ni push dans ce plan : la publication est décidée par Noah (voir « Après le plan »).
- Tout le chantier se fait dans la copie de travail `D:\memoire_vive-chantier-b` (branche `chantier-b`, créée en Task 1, Step 0) ; jamais de commit du chantier sur `main`, jamais d'`exporter.cmd` ni de `scripts/export.py` sans `--no-git` depuis cette copie (l'export pousse tout commit en attente).

---

## Carte des fichiers

| Fichier | Rôle unique | Tâches |
| --- | --- | --- |
| `docs/index.html` | squelette : en-tête (onglets, recherche), zones liste, page, fiche ; charge `theme.js` puis `js/app.js` en module | 3, 8, 9, 10, 11 |
| `docs/app.js` | ancienne IIFE | supprimé en 3 |
| `docs/js/package.json` | `{ "type": "module" }` : Node lit `docs/js/*.js` comme modules (tests) | 3 |
| `docs/js/app.js` | démarrage, état, routage, focus, historique, événements, thème | 3, 4, 5, 7, 8, 9, 10, 11, 13, 15 |
| `docs/js/donnees.js` | chargement de `data.json` (erreurs claires, schéma), préparation du modèle, index de recherche | 3, 4, 7, 8, 9, 10, 11, 15 |
| `docs/js/recherche.js` | normalisation, racinisation, distance, syntaxe, index, score, surlignage (module pur) | 3, 4 |
| `docs/js/routes.js` | analyse et construction des ancres, anciennes ancres (module pur) | 3, 5, 10 |
| `docs/js/composants.js` | `el`, formats, dates relatives, dernière visite, cartes d'entrée et de projet, ligne, pastilles, boutons de lien | 3, 4, 7, 8, 9, 10, 11 |
| `docs/js/vues/entrees.js` | « Toutes les entrées » : filtres, tri, grille ou liste | 3, 4, 5, 7, 8, 10, 11 |
| `docs/js/vues/fiche.js` | fiche d'une entrée | 3, 4, 8, 9, 11, 12 |
| `docs/js/vues/projet.js` | page projet | 8 |
| `docs/js/vues/accueil.js` | catalogue des projets par famille | 9 |
| `docs/js/vues/resultats.js` | résultats de recherche | 11 |
| `docs/style.css` | jetons de couleur (dont familles), mises en page des vues | 6, 7, 8, 9, 10, 11, 12 |
| `docs/data.json` | schéma 2 (réécrit par les fonctions de l'export) | 15 |
| `scripts/export.py` | `SCHEMA_VERSION = 2` | 15 |
| `.gitignore` | `node_modules/` | 1 |
| `tests/navigateur/package.json`, `package-lock.json` | `playwright-core` 1.63.0 en dépendance de développement, script `npm test` | 1 |
| `tests/navigateur/serveur.mjs` | serveur statique Node (docs/ sous `/memoire-vive/`), aussi lançable à la main | 1 |
| `tests/navigateur/outils.mjs` | lancement de Chrome, pages instrumentées (erreurs, CSP, horloge), aides d'assertion | 1 |
| `tests/navigateur/donnees-test.mjs` | jeux de données synthétiques (70 entrées ; 3 000 pour la performance) | 1, 4, 15 |
| `tests/navigateur/*.test.mjs` | un fichier par écran ou thème (serveur, site, liste, fiche, robustesse, interface, navigation, cartes, projet, accueil, résultats, performance, réel) | 1–13, 17 |
| `tests/js/*.test.mjs` | tests unitaires Node de la logique du site | 3–11, 15 |
| `tests/aides.py`, `tests/test_*.py` | identifiants courts distincts ; schéma 2 | 14, 15 |
| `README.md` | site, routes, recherche, tests | 16 |

## Commandes

Depuis la copie de travail du chantier, `D:\memoire_vive-chantier-b` (Task 1, Step 0) :

```powershell
python -m unittest discover -s tests -v   # export (86 tests au départ)
node --test "tests/js/*.test.mjs"         # logique du site (à partir de la Task 3)
cd tests/navigateur; npm install          # une fois (Task 1)
cd tests/navigateur; npm test             # suite navigateur complète (~30 s)
```

Un seul fichier navigateur : `cd tests/navigateur; node --test <fichier>.test.mjs`. Variables : `MEMOIRE_CHROME` (chemin de Chrome), `MEMOIRE_SITE_URL` (rejouer sur un site publié).

## Choix d'interprétation (à connaître avant de commencer)

1. **Préfixes.** Seul le dernier terme (en cours de frappe) accepte les préfixes, dès 2 caractères ; un terme de moins de 5 caractères qui n'est pas le dernier est cherché exactement (après racinisation). Une lettre seule ne s'étend pas à tout le vocabulaire (sinon chaque frappe relirait des milliers de mots).
2. **Anciennes ancres.** `#/?q=…` (avec ou sans autres filtres) redirige vers `#/recherche?q=…` : la page de résultats n'a pas de filtres, les filtres combinés à une recherche sont abandonnés. Sans `q`, redirection vers `#/entrees` avec `type`, `projet`, `tag`, `tri` (`tri=pertinence` et `vue=projets`, qui n'existent plus, sont ignorés). Les redirections remplacent l'entrée d'historique.
3. **Dernière visite.** La valeur mémorisée est la date de l'export affiché (`genere_le`), à défaut l'heure de la visite : une entrée créée avant la visite mais publiée après reste « nouvelle » à la visite suivante. Première visite ou stockage indisponible : aucune pastille.
4. **Barre de recherche dans l'en-tête**, donc sur toutes les vues, fiche comprise ; la touche `/` y mène partout. Taper crée une entrée d'historique à la première frappe, puis la remplace ; Échap (champ vidé) revient à la vue d'origine.
5. **Pastille de projet d'une carte** : lien vers la page du projet (le filtre par projet reste dans les pastilles de « Toutes les entrées »). Le libellé du lien de retour d'une fiche dépend de la vue d'origine (« Retour à la liste », « aux résultats », « au projet », « à l'accueil »).
6. **Étapes intermédiaires.** Le routeur arrive (Task 5) avant les vues : jusqu'à la Task 9, `#/` affiche la liste des entrées ; jusqu'à la Task 11, `#/recherche` affiche la liste filtrée par la recherche. Chaque tâche laisse le site utilisable et tous les tests verts ; rien n'est publié avant la fin.
7. **`docs/js/package.json`** (`{ "type": "module" }`) : sans lui, Node lirait `docs/js/*.js` comme CommonJS dès qu'un `package.json` sans `type` se trouve plus haut dans l'arborescence. Fichier inerte pour le navigateur.
8. **Voisins affichés** (« Voir aussi », « En rapport », « Projets proches ») : seulement des entrées publiées, score numérique fini.
9. **Jalons de la page projet** : date exacte au jour (chronologie), date relative en infobulle ; ailleurs, date relative et date exacte en infobulle.
10. **Schéma 2 de `data.json`** : la Task 15 réécrit `schema` et `empreinte` du fichier existant avec les fonctions de l'export (même format que `write_payload`) ; un export ultérieur sur une mémoire inchangée répond donc « Contenu identique ».
11. **Point « nouveau » des cartes de projet** : la même pastille écrite « nouveau » que sur les entrées (un point de couleur seul ne dirait rien à un lecteur d'écran).
12. **« Toutes les entrées » sans tri « Pertinence »** (la recherche a sa page) : Plus récentes, Plus anciennes, Projet (A → Z). La page de résultats n'a pas de filtres (non demandés par la spec).
13. **Historique dans `app.js`, pas dans `routes.js`.** La spec (§ 4.1) confie à `routes.js` « analyse et construction des ancres, historique ». Ici `routes.js` reste pur (analyse et construction des ancres, anciennes ancres) pour être testé sous Node sans navigateur ; tout ce qui touche `history` (redirections par `replaceState`, `typeSearch`/`leaveSearch`, profondeur d'historique des fiches dans `openEntry`) vit dans `app.js`, testé par la suite navigateur.
14. **Branche de travail et copie séparée.** `scripts/export.py` pousse tout commit pas encore sur le dépôt distant, et Noah exporte souvent (`exporter.cmd`). Le chantier se fait donc dans une copie de travail séparée (`git worktree`, `D:\memoire_vive-chantier-b`, branche `chantier-b`, Task 1, Step 0) : les exports continuent sur `main` dans `D:\memoire_vive` (ancien site, schéma 1) et ne publient que `data.json` ; rien du chantier n'est poussé avant la publication (voir « Après le plan »).

---

### Task 1: Banc de tests navigateur dans le dépôt

La suite de 57 vérifications vit aujourd'hui hors du dépôt (brouillon de session). Cette tâche pose le banc qui l'accueillera : `playwright-core` en dépendance de développement isolée dans `tests/navigateur/`, un serveur statique Node qui sert `docs/` sous `/memoire-vive/` comme GitHub Pages (types MIME corrects pour les modules ES), des pages Chrome instrumentées (erreurs de console, violations de CSP, horloge figée) et un jeu de données synthétique.

Jeu de test (`jeuDeTest()`, `MAINTENANT_TEST` = 20/09/2026 12:00 UTC, entrées datées en heures avant cet instant) : 15 entrées écrites à la main + 55 notes de suivi (`note-0` … `note-54`, réparties sur jarvis, depths, voxelcraft, tour-de-controle, memoire-vive), soit 70 entrées (plus d'une page de 60 cartes), 7 projets, 3 familles (`jeux` couleur 1, `ia` couleur 3, `outils` couleur 4), un projet sans famille (`atelier`), une entrée sans projet, des voisins réciproques :

| Entrée | Sert à |
| --- | --- |
| Jarvis — architecture (référence, liens site + dépôt + 2 adresses locales) | fiche, liens, lien principal « site », fautes, synonymes (« intelligence artificielle ») |
| Jarvis — premier réveil vocal / réponses hors ligne (jalons), pas de service en ligne (décision), micro muet après veille (erreur) | sections et chronologie de la page projet, exclusion `-vocal` |
| Depths — génération de donjon (jalon, dépôt) / idées de monstres (« animaux », « réseaux ») | lien principal « dépôt », pluriels, « En rapport » |
| Voxelcraft — un jeu de cubes (« animal », « réseau ») | pluriels, voisin de Depths (« Projets proches », « En rapport ») |
| Tour de contrôle — vue des sessions ; Tour de garde et contrôle des accès | frappe lente « tour de », expressions exactes |
| Mémoire Vive — site en ligne (30 h) / architecture de l'export (40 h) | « mémoire », pastille « nouveau », date « hier » |
| Bibliothèque Claude — artifact | lien `claude.ai/artifact` |
| Le cœur de l'atelier (observation, projet sans famille) | « coeur » → « cœur », apostrophes, « Sans famille » |
| Note sans projet (20 h) | « Sans projet », « nouveau », « il y a 20 h » |

**Files:**

- Create: `tests/navigateur/donnees-test.mjs`, `tests/navigateur/outils.mjs`, `tests/navigateur/package-lock.json`, `tests/navigateur/package.json`, `tests/navigateur/serveur.mjs`
- Modify: `.gitignore`
- Test: `tests/navigateur/serveur.test.mjs` (créé), `tests/navigateur/site.test.mjs` (créé)

**Interfaces:**

- Consumes: rien (site actuel inchangé).
- Produces:
  - `tests/navigateur/serveur.mjs` : `PREFIXE = '/memoire-vive/'`, `RACINE_DOCS`, `creerServeur(racine = RACINE_DOCS) → http.Server`, `demarrerServeur(racine = RACINE_DOCS) → Promise<{ url: string, arreter(): Promise<void> }>` (port libre) ; lancé seul : `node tests/navigateur/serveur.mjs [port]` (8080 par défaut).
  - `tests/navigateur/outils.mjs` : `CHROME`, `ouvrirSite() → Promise<{ base, url(ancre = ''), page({ donnees, mobile = false, horloge }) → Promise<Page>, fermer() }>` (`page.erreurs : string[]` ; `donnees` : objet servi à la place de `data.json` ou gestionnaire de route ; `horloge` : ISO figée, `false` pour l'horloge réelle ; 10 s d'attente au plus par action), `terminer(page)` (ferme et échoue s'il y a eu une erreur), `attendreAncre(page, morceau)`, `debordement(page) → Promise<number>`, `contraste(couleurA, couleurB) → number`.
  - `tests/navigateur/donnees-test.mjs` : `SCHEMA_TEST = 1`, `MAINTENANT_TEST`, `identifiant(n) → string` (64 hexadécimaux, 12 premiers distincts), `jeuDeTest() → data`, `assembler(entrees, { familles, projets, synonymes } = {}) → data` (racine et `projets[]` calculés comme l'export), `entreeTitree(donnees, debut) → entree`.

- [ ] **Step 0: Copie de travail séparée, branche `chantier-b`**

Depuis `D:\memoire_vive` (sur `main`, arbre propre) :

```powershell
git status --short                # attendu : rien (ou seulement ce plan, s'il n'est pas encore commité)
git worktree add -b chantier-b ..\memoire_vive-chantier-b main
cd ..\memoire_vive-chantier-b
git branch --show-current         # attendu : chantier-b
```

Toutes les commandes et tous les commits de ce plan se font dans `D:\memoire_vive-chantier-b`. `D:\memoire_vive` reste sur `main` pour les exports de Noah (`exporter.cmd` y publie `data.json` pour l'ancien site, en schéma 1) : un export ne peut donc pas mettre en ligne un état intermédiaire du chantier. Ne jamais lancer `exporter.cmd` ni `scripts/export.py` sans `--no-git` depuis la copie du chantier. Les fichiers ignorés par git (`.env`, `config/*.json`) n'existent que dans `D:\memoire_vive` : les tests n'en ont pas besoin. Si ce plan n'est pas encore commité sur `main`, il se lit dans `D:\memoire_vive\conception\plans\`.

- [ ] **Step 1: Modifier `.gitignore`**

Remplacer :

```
.vscode/
.idea/
```

par :

```
.vscode/
.idea/

# Tests navigateur : dépendance de développement installée par npm
node_modules/
```


- [ ] **Step 2: Créer `tests/navigateur/package.json`**

```json
{
  "name": "memoire-vive-tests-navigateur",
  "private": true,
  "description": "Tests navigateur du site Mémoire Vive (Chrome installé piloté par playwright-core). Dépendance de développement uniquement : le site n'en a aucune.",
  "type": "module",
  "scripts": {
    "test": "node --test --test-concurrency=1 \"*.test.mjs\""
  },
  "devDependencies": {
    "playwright-core": "1.63.0"
  }
}
```

- [ ] **Step 3: Installer la dépendance de développement**

```powershell
cd tests/navigateur; npm install
```

Expected: « added 1 package » ; `tests/navigateur/node_modules/` (ignoré par git) et `tests/navigateur/package-lock.json`, identique à :

```json
{
  "name": "memoire-vive-tests-navigateur",
  "lockfileVersion": 3,
  "requires": true,
  "packages": {
    "": {
      "name": "memoire-vive-tests-navigateur",
      "devDependencies": {
        "playwright-core": "1.63.0"
      }
    },
    "node_modules/playwright-core": {
      "version": "1.63.0",
      "resolved": "https://registry.npmjs.org/playwright-core/-/playwright-core-1.63.0.tgz",
      "integrity": "sha512-rYCsBF/M5HjUch52bbtVONEFjv6Xu8sm8h72dNlR5bzIE1fvC/bxgspzkjSfU+MweEMmPM8KJebG6nnyxo5mCg==",
      "dev": true,
      "license": "Apache-2.0",
      "bin": {
        "playwright-core": "cli.js"
      },
      "engines": {
        "node": ">=20"
      }
    }
  }
}
```

- [ ] **Step 4: Test — Créer `tests/navigateur/serveur.test.mjs`**

```js
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { demarrerServeur } from './serveur.mjs';

let serveur;
before(async () => { serveur = await demarrerServeur(); });
after(async () => { await serveur.arreter(); });

test('le site est servi sous /memoire-vive/', async () => {
  assert.match(serveur.url, /^http:\/\/127\.0\.0\.1:\d+\/memoire-vive\/$/);
  const reponse = await fetch(serveur.url);
  assert.equal(reponse.status, 200);
  assert.match(reponse.headers.get('content-type'), /^text\/html/);
  assert.match(await reponse.text(), /<title>Mémoire Vive<\/title>/);
});

test('types MIME des scripts, styles et données', async () => {
  for (const [fichier, type] of [['theme.js', /^text\/javascript/], ['style.css', /^text\/css/], ['data.json', /^application\/json/], ['favicon.svg', /^image\/svg\+xml/]]) {
    const reponse = await fetch(serveur.url + fichier);
    assert.equal(reponse.status, 200, fichier);
    assert.match(reponse.headers.get('content-type'), type, fichier);
  }
});

test('hors du préfixe, fichier absent ou sortie du dossier : 404', async () => {
  const origine = new URL(serveur.url).origin;
  assert.equal((await fetch(origine + '/index.html')).status, 404);
  assert.equal((await fetch(serveur.url + 'absent.js')).status, 404);
  assert.equal((await fetch(serveur.url + '..%2f..%2fREADME.md')).status, 404);
  assert.equal((await fetch(serveur.url + '%2e%2e/scripts/export.py')).status, 404);
});

test('/memoire-vive sans barre finale : redirection', async () => {
  const reponse = await fetch(serveur.url.slice(0, -1), { redirect: 'manual' });
  assert.equal(reponse.status, 301);
  assert.equal(reponse.headers.get('location'), '/memoire-vive/');
});
```

- [ ] **Step 5: Test — Créer `tests/navigateur/site.test.mjs`**

```js
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { ouvrirSite, terminer } from './outils.mjs';
import { jeuDeTest } from './donnees-test.mjs';

let site;
before(async () => { site = await ouvrirSite(); });
after(async () => { await site.fermer(); });

test('le site charge le jeu de test sans erreur', async () => {
  const donnees = jeuDeTest();
  const page = await site.page({ donnees });
  await page.goto(site.url());
  await page.locator('.card').first().waitFor();
  assert.match(await page.textContent('#stats'), new RegExp('^' + donnees.nb_entrees + '\\sentrées'));
  await terminer(page);
});

test('jeu de test : identifiants courts distincts, projets cohérents', () => {
  const donnees = jeuDeTest();
  const courts = new Set(donnees.entrees.map((e) => e.id.slice(0, 12)));
  assert.equal(courts.size, donnees.entrees.length);
  assert.ok(donnees.entrees.every((e) => /^[0-9a-f]{64}$/.test(e.id)));
  assert.equal(donnees.projets.reduce((n, p) => n + p.nb, 0), donnees.entrees.filter((e) => e.projet).length);
});
```

- [ ] **Step 6: Vérifier l'échec**

Run: `cd tests/navigateur; npm test`
Expected: FAIL — `ERR_MODULE_NOT_FOUND` : `serveur.mjs` (importé par serveur.test.mjs) et `outils.mjs` (importé par site.test.mjs) n'existent pas encore ; 2 fichiers en échec.

- [ ] **Step 7: Créer `tests/navigateur/serveur.mjs`**

```js
/* Serveur statique minimal (Node seul, aucune dépendance) : sert docs/ sous
   /memoire-vive/, comme GitHub Pages, pour que les tests vérifient aussi les
   chemins relatifs du site. Lancement direct : node tests/navigateur/serveur.mjs [port] */
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const RACINE_DOCS = fileURLToPath(new URL('../../docs/', import.meta.url));
export const PREFIXE = '/memoire-vive/';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

function repondre(res, code, texte, entetes = {}) {
  res.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8', ...entetes });
  res.end(texte);
}

export function creerServeur(racine = RACINE_DOCS) {
  const base = path.resolve(racine);
  return http.createServer(async (req, res) => {
    let chemin;
    try {
      chemin = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    } catch {
      return repondre(res, 400, 'Requête invalide');
    }
    if (chemin === PREFIXE.slice(0, -1)) return repondre(res, 301, '', { Location: PREFIXE });
    if (!chemin.startsWith(PREFIXE)) return repondre(res, 404, 'Introuvable');
    let relatif = chemin.slice(PREFIXE.length);
    if (relatif === '' || relatif.endsWith('/')) relatif += 'index.html';
    const fichier = path.resolve(base, relatif);
    if (!fichier.startsWith(base + path.sep)) return repondre(res, 404, 'Introuvable');
    try {
      const contenu = await fs.readFile(fichier);
      res.writeHead(200, {
        'Content-Type': TYPES[path.extname(fichier).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      res.end(req.method === 'HEAD' ? undefined : contenu);
    } catch {
      repondre(res, 404, 'Introuvable');
    }
  });
}

/* Démarre sur un port libre choisi par le système ; renvoie l'URL du site
   (avec le préfixe) et une fonction d'arrêt. */
export async function demarrerServeur(racine = RACINE_DOCS) {
  const serveur = creerServeur(racine);
  await new Promise((ok, ko) => {
    serveur.once('error', ko);
    serveur.listen(0, '127.0.0.1', ok);
  });
  const { port } = serveur.address();
  return {
    url: `http://127.0.0.1:${port}${PREFIXE}`,
    arreter: () => new Promise((ok) => {
      serveur.closeAllConnections();
      serveur.close(() => ok());
    }),
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.argv[2]) || 8080;
  creerServeur().listen(port, '127.0.0.1', () => {
    console.log(`Mémoire Vive en local : http://127.0.0.1:${port}${PREFIXE}  (Ctrl+C pour arrêter)`);
  });
}
```

- [ ] **Step 8: Créer `tests/navigateur/donnees-test.mjs`**

```js
/* Jeux de données synthétiques pour les tests (aucune donnée réelle de la
   mémoire). Même forme que docs/data.json produit par scripts/export.py. */

export const SCHEMA_TEST = 1;
export const MAINTENANT_TEST = '2026-09-20T12:00:00.000Z';
const MAINTENANT = Date.parse(MAINTENANT_TEST);

/* Identifiant de 64 caractères hexadécimaux, stable, dont les 12 premiers
   (identifiant court des fiches) diffèrent d'une entrée à l'autre. */
export function identifiant(n) {
  let x = (n + 1) * 2654435761 >>> 0;
  let hex = '';
  while (hex.length < 64) {
    x ^= x << 13; x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5; x >>>= 0;
    hex += x.toString(16).padStart(8, '0');
  }
  return hex;
}

const HEBERGEURS_DE_CODE = ['github.com', 'gitlab.com', 'bitbucket.org', 'codeberg.org'];

function genre(url) {
  const hote = new URL(url).hostname.replace(/^www\./, '');
  return HEBERGEURS_DE_CODE.some((h) => hote === h || hote.endsWith('.' + h)) ? 'depot' : 'site';
}

function lienPrincipal(liens) {
  const enLigne = liens.filter((l) => l.type === 'en_ligne').map((l) => l.valeur);
  const site = enLigne.find((u) => genre(u) === 'site');
  if (site) return { url: site, genre: 'site' };
  const depot = enLigne.find((u) => genre(u) === 'depot');
  return depot ? { url: depot, genre: 'depot' } : null;
}

const FAMILLES = [
  { id: 'jeux', nom: 'Jeux & univers de jeu', couleur: 1 },
  { id: 'ia', nom: 'IA & simulations', couleur: 3 },
  { id: 'outils', nom: 'Outils Claude', couleur: 4 },
];

const PROJETS = {
  jarvis: { nom: 'Jarvis', famille: 'ia', description: 'Assistant vocal local : écoute, comprend et répond sans quitter la machine.' },
  depths: { nom: 'Depths', famille: 'jeux', description: 'Rogue-lite en 2D : donjons procéduraux, salles préfabriquées.' },
  voxelcraft: { nom: 'Voxelcraft', famille: 'jeux', description: null },
  'tour-de-controle': { nom: 'Tour de contrôle', famille: 'outils', description: 'Tableau de bord des sessions Claude Code en cours.' },
  'memoire-vive': { nom: 'Mémoire Vive', famille: 'outils', description: 'Site statique qui affiche et cherche la mémoire partagée.' },
  'bibliotheque-claude': { nom: 'Bibliothèque Claude', famille: 'outils', description: null },
  atelier: { nom: 'L’atelier', famille: null, description: null },
};

/* Entrées écrites à la main : chacune sert au moins un test précis. */
const SPECIALES = [
  { cle: 'jarvis-archi', type: 'reference', projet: 'jarvis', heures: 400,
    titre: 'Jarvis — architecture',
    resume: 'Pipeline vocal local : reconnaissance, intelligence artificielle, synthèse.',
    contenu: 'Jarvis — architecture : pipeline vocal local en trois étages (reconnaissance, intelligence artificielle, synthèse). Code sur https://github.com/exemple/jarvis, démo sur https://exemple.github.io/jarvis/. Dossier D:\\jarvis, serveur sur localhost:8765.',
    tags: ['jarvis', 'architecture'],
    liens: [
      { type: 'en_ligne', valeur: 'https://github.com/exemple/jarvis' },
      { type: 'en_ligne', valeur: 'https://exemple.github.io/jarvis/' },
      { type: 'local', valeur: 'D:\\jarvis' },
      { type: 'local', valeur: 'localhost:8765' },
    ] },
  { cle: 'jarvis-jalon-1', type: 'milestone', projet: 'jarvis', heures: 300,
    titre: 'Jarvis — premier réveil vocal',
    resume: 'Le mot de réveil déclenche l’écoute.',
    contenu: 'Jarvis — premier réveil vocal : le mot de réveil déclenche l’écoute en moins de 300 ms.',
    tags: ['jarvis', 'jalon'], liens: [] },
  { cle: 'jarvis-jalon-2', type: 'milestone', projet: 'jarvis', heures: 200,
    titre: 'Jarvis — réponses hors ligne',
    resume: 'Le modèle tourne sans réseau.',
    contenu: 'Jarvis — réponses hors ligne : le modèle tourne sans réseau, sur la carte graphique.',
    tags: ['jarvis', 'jalon'], liens: [] },
  { cle: 'jarvis-decision', type: 'decision', projet: 'jarvis', heures: 250,
    titre: 'Jarvis — pas de service en ligne',
    resume: 'Tout reste sur la machine.',
    contenu: 'Jarvis — pas de service en ligne : tout reste sur la machine, par principe.',
    tags: ['jarvis', 'decision'], liens: [] },
  { cle: 'jarvis-erreur', type: 'error', projet: 'jarvis', heures: 150,
    titre: 'Jarvis — micro muet après veille',
    resume: 'Le pilote audio perd le micro.',
    contenu: 'Jarvis — micro muet après veille : le pilote audio perd le micro, il faut relancer le service.',
    tags: ['jarvis', 'bug'], liens: [] },
  { cle: 'depths-jalon', type: 'milestone', projet: 'depths', heures: 120,
    titre: 'Depths — génération de donjon',
    resume: 'Salles préfabriquées sur une grille, boss et trésor placés.',
    contenu: 'Depths — génération de donjon : salles préfabriquées sur une grille, croissance aléatoire, boss et trésor placés. Les jeux de tuiles sont prêts.',
    tags: ['depths', 'jalon'], liens: [{ type: 'en_ligne', valeur: 'https://github.com/exemple/depths' }] },
  { cle: 'depths-note', type: 'note', projet: 'depths', heures: 110,
    titre: 'Depths — idées de monstres',
    resume: 'Des animaux mutants dans les réseaux de grottes.',
    contenu: 'Depths — idées de monstres : des animaux mutants dans les réseaux de grottes du donjon.',
    tags: ['depths'], liens: [] },
  { cle: 'voxel-note', type: 'note', projet: 'voxelcraft', heures: 100,
    titre: 'Voxelcraft — un jeu de cubes',
    resume: 'Un animal par biome, un réseau de rivières.',
    contenu: 'Voxelcraft — un jeu de cubes : un animal par biome et un réseau de rivières creusées.',
    tags: ['voxelcraft'], liens: [] },
  { cle: 'tour-note', type: 'note', projet: 'tour-de-controle', heures: 90,
    titre: 'Tour de contrôle — vue des sessions',
    resume: 'Chaque session Claude Code a sa carte.',
    contenu: 'Tour de contrôle — vue des sessions : chaque session Claude Code a sa carte, mise à jour en direct.',
    tags: ['tour-de-controle'], liens: [] },
  { cle: 'tour-mots', type: 'note', projet: 'tour-de-controle', heures: 85,
    titre: 'Tour de garde et contrôle des accès',
    resume: 'Un tour de garde, puis un contrôle.',
    contenu: 'Tour de garde et contrôle des accès : un tour de garde chaque nuit, puis un contrôle des journaux.',
    tags: ['tour-de-controle'], liens: [] },
  { cle: 'memoire-jalon', type: 'milestone', projet: 'memoire-vive', heures: 30,
    titre: 'Mémoire Vive — site en ligne',
    resume: 'La mémoire partagée est consultable.',
    contenu: 'Mémoire Vive — site en ligne : la mémoire partagée est consultable sur https://exemple.github.io/memoire-vive/.',
    tags: ['memoire-vive', 'jalon'],
    liens: [{ type: 'en_ligne', valeur: 'https://exemple.github.io/memoire-vive/' }] },
  { cle: 'memoire-archi', type: 'architecture', projet: 'memoire-vive', heures: 40,
    titre: 'Mémoire Vive — architecture de l’export',
    resume: 'Un script Python lit la mémoire et écrit data.json.',
    contenu: 'Mémoire Vive — architecture de l’export : un script Python lit la mémoire et écrit data.json, publié par GitHub Pages.',
    tags: ['memoire-vive', 'architecture'], liens: [] },
  { cle: 'biblio', type: 'reference', projet: 'bibliotheque-claude', heures: 60,
    titre: 'Bibliothèque Claude — artifact',
    resume: 'Catalogue des outils Claude.',
    contenu: 'Bibliothèque Claude — artifact : catalogue des outils Claude sur https://claude.ai/artifact/0123abcd.',
    tags: ['bibliotheque-claude'],
    liens: [{ type: 'en_ligne', valeur: 'https://claude.ai/artifact/0123abcd' }] },
  { cle: 'atelier-note', type: 'observation', projet: 'atelier', heures: 70,
    titre: 'Le cœur de l’atelier',
    resume: 'L’établi est au centre.',
    contenu: 'Le cœur de l’atelier : l’établi est au centre, les outils au mur.',
    tags: ['atelier'], liens: [] },
  { cle: 'sans-projet', type: 'note', projet: null, heures: 20,
    titre: 'Note sans projet',
    resume: 'Une pensée isolée.',
    contenu: 'Note sans projet : une pensée isolée sur la mémoire du quotidien.',
    tags: ['divers'], liens: [] },
];

const VOISINS = [
  ['jarvis-archi', 'jarvis-jalon-1', 0.88],
  ['jarvis-archi', 'jarvis-decision', 0.85],
  ['jarvis-jalon-2', 'jarvis-decision', 0.83],
  ['depths-jalon', 'voxel-note', 0.84],
  ['depths-note', 'voxel-note', 0.82],
  ['memoire-archi', 'tour-note', 0.81],
  ['memoire-jalon', 'memoire-archi', 0.9],
];

const PROJETS_DE_REMPLISSAGE = ['jarvis', 'depths', 'voxelcraft', 'tour-de-controle', 'memoire-vive'];

function remplissage(i) {
  const projet = PROJETS_DE_REMPLISSAGE[i % PROJETS_DE_REMPLISSAGE.length];
  const nom = PROJETS[projet].nom;
  return {
    cle: 'note-' + i, type: 'note', projet, heures: 500 + i * 7,
    titre: `${nom} — note de suivi ${i + 1}`,
    resume: `Point d’étape numéro ${i + 1}.`,
    contenu: `${nom} — note de suivi ${i + 1} : point d’étape numéro ${i + 1}, rien de bloquant.`,
    tags: [projet, 'suivi'], liens: [],
  };
}

function isoAvant(heures) {
  return new Date(MAINTENANT - heures * 3600 * 1000).toISOString();
}

/* Jeu de test principal : 70 entrées (plus d'une page de 60 cartes),
   7 projets dont un sans famille, une entrée sans projet, des voisins. */
export function jeuDeTest() {
  const modeles = SPECIALES.concat(Array.from({ length: 55 }, (_, i) => remplissage(i)));
  const ids = new Map(modeles.map((m, n) => [m.cle, identifiant(n)]));
  const voisinsDe = new Map(modeles.map((m) => [m.cle, []]));
  for (const [a, b, score] of VOISINS) {
    voisinsDe.get(a).push({ id: ids.get(b), score });
    voisinsDe.get(b).push({ id: ids.get(a), score });
  }
  const entrees = modeles.map((m) => ({
    id: ids.get(m.cle),
    titre: m.titre,
    resume: m.resume,
    contenu: m.contenu,
    type: m.type,
    tags: m.tags,
    projet: m.projet,
    cree_le: isoAvant(m.heures),
    modifie_le: isoAvant(m.heures),
    liens: m.liens,
    lien_principal: lienPrincipal(m.liens),
    corrige: false,
    voisins: voisinsDe.get(m.cle).sort((x, y) => y.score - x.score),
  }));
  entrees.sort((a, b) => (a.cree_le < b.cree_le ? 1 : -1));
  return assembler(entrees);
}

function compter(valeurs) {
  const compte = {};
  for (const v of valeurs) compte[v] = (compte[v] || 0) + 1;
  return compte;
}

/* Complète la racine et les projets à partir des entrées, comme l'export. */
export function assembler(entrees, { familles = FAMILLES, projets = PROJETS, synonymes } = {}) {
  const parProjet = new Map();
  for (const e of entrees) {
    if (!e.projet) continue;
    if (!parProjet.has(e.projet)) parProjet.set(e.projet, []);
    parProjet.get(e.projet).push(e);
  }
  const listeProjets = Array.from(parProjet, ([id, membres]) => {
    const recents = membres.slice().sort((a, b) => (a.cree_le < b.cree_le ? 1 : -1));
    const liens = recents.map((e) => e.lien_principal).filter(Boolean);
    const reglage = projets[id] || {};
    return {
      id,
      nom: reglage.nom || id,
      famille: reglage.famille || null,
      description: reglage.description || null,
      lien_principal: liens.find((l) => l.genre === 'site') || liens[0] || null,
      nb: membres.length,
      types: compter(membres.map((e) => e.type)),
      premiere: recents[recents.length - 1].cree_le,
      derniere: recents[0].cree_le,
    };
  }).sort((a, b) => (a.derniere < b.derniere ? 1 : -1));
  return {
    schema: SCHEMA_TEST,
    genere_le: MAINTENANT_TEST,
    source: 'tests',
    nb_entrees: entrees.length,
    types: compter(entrees.map((e) => e.type)),
    ordre_types: ['reference', 'architecture', 'decision', 'milestone', 'note', 'observation', 'error'],
    familles,
    synonymes: synonymes || [['ia', 'intelligence artificielle', 'llm'], ['local', 'hors ligne', 'offline']],
    projets: listeProjets,
    entrees,
    voisins_reglage: { seuil: 0.8, max: 5 },
    voisins_en_attente: [],
    empreinte: '0'.repeat(64),
  };
}

/* Retrouve une entrée du jeu de test par le début de son titre. */
export function entreeTitree(donnees, debut) {
  const entree = donnees.entrees.find((e) => e.titre.startsWith(debut));
  if (!entree) throw new Error('Entrée de test introuvable : ' + debut);
  return entree;
}
```

- [ ] **Step 9: Créer `tests/navigateur/outils.mjs`**

```js
/* Outils communs des tests navigateur : serveur statique local (ou site
   distant), Chrome installé piloté par playwright-core, pages instrumentées. */
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { demarrerServeur } from './serveur.mjs';
import { MAINTENANT_TEST } from './donnees-test.mjs';

export const CHROME = process.env.MEMOIRE_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const BUREAU = { viewport: { width: 1280, height: 900 } };
const MOBILE = { viewport: { width: 375, height: 800 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };

/* MEMOIRE_SITE_URL (facultatif) : rejoue la suite sur un site déjà publié,
   par exemple https://chipat-neko.github.io/memoire-vive/ ; sinon un serveur
   local sert docs/ sous /memoire-vive/ sur un port libre. */
export async function ouvrirSite() {
  const distant = process.env.MEMOIRE_SITE_URL;
  const serveur = distant ? null : await demarrerServeur();
  const base = distant ? distant.replace(/\/?$/, '/') : serveur.url;
  const navigateur = await chromium.launch({ executablePath: CHROME, headless: true });

  return {
    base,
    url: (ancre = '') => base + ancre,

    /* Page neuve (contexte isolé : stockage vide). Options :
       - donnees : objet servi à la place de data.json, ou fonction (route) => … ;
         absent : le vrai data.json du site ;
       - mobile : écran de téléphone ;
       - horloge : heure figée (ISO) ; par défaut MAINTENANT_TEST avec des données
         de test ; false : horloge réelle (l'horloge simulée neutralise les mesures
         de performance.measure) ;
       page.erreurs recueille erreurs et avertissements de la console, erreurs
       JavaScript, requêtes échouées et violations de la CSP. */
    async page({ donnees, mobile = false, horloge } = {}) {
      const contexte = await navigateur.newContext({
        ...(mobile ? MOBILE : BUREAU), locale: 'fr-FR', timezoneId: 'Europe/Paris',
      });
      // 10 s par attente (au lieu de 30) : un test en échec le dit vite.
      contexte.setDefaultTimeout(10000);
      const page = await contexte.newPage();
      page.erreurs = [];
      page.on('console', (m) => {
        if (m.type() === 'error' || m.type() === 'warning') page.erreurs.push(`[console.${m.type()}] ${m.text()}`);
      });
      page.on('pageerror', (e) => page.erreurs.push(`[pageerror] ${e.message}`));
      page.on('requestfailed', (r) => page.erreurs.push(`[requestfailed] ${r.url()} ${r.failure()?.errorText}`));
      await page.addInitScript(() => {
        document.addEventListener('securitypolicyviolation', (e) => {
          console.error('Violation CSP : ' + e.violatedDirective + ' ' + e.blockedURI);
        });
      });
      const heure = horloge === undefined ? (donnees ? MAINTENANT_TEST : null) : horloge;
      if (heure) await page.clock.setFixedTime(new Date(heure));
      if (typeof donnees === 'function') {
        await page.route('**/data.json', donnees);
      } else if (donnees) {
        const corps = JSON.stringify(donnees);
        await page.route('**/data.json', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: corps }));
      }
      return page;
    },

    async fermer() {
      await navigateur.close();
      if (serveur) await serveur.arreter();
    },
  };
}

/* Ferme la page ; échoue si la console a reçu une erreur, un avertissement
   ou une violation de CSP pendant le test. */
export async function terminer(page) {
  const erreurs = page.erreurs.slice();
  await page.context().close();
  assert.deepEqual(erreurs, [], 'erreurs de console, JavaScript ou CSP');
}

/* Attend que l'ancre de la page contienne un texte (navigation dans la page). */
export async function attendreAncre(page, morceau) {
  await page.waitForFunction((m) => location.hash.includes(m), morceau);
}

/* Largeur qui dépasse de l'écran (0 : pas de défilement horizontal). */
export function debordement(page) {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
}

/* Rapport de contraste WCAG entre deux couleurs CSS calculées « rgb(r, g, b) ». */
export function contraste(couleurA, couleurB) {
  const lum = (c) => {
    const [r, g, b] = c.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number).map((v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const a = lum(couleurA);
  const b = lum(couleurB);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
```

- [ ] **Step 10: Vérifier le succès**

Run: `cd tests/navigateur; npm test`
Expected: PASS — 6 tests, 6 réussis (4 serveur, 2 site).

Vérifier aussi le lancement à la main : `node tests/navigateur/serveur.mjs` affiche « Mémoire Vive en local : http://127.0.0.1:8080/memoire-vive/ » et le site s'ouvre à cette adresse ; Ctrl+C pour arrêter.

- [ ] **Step 11: Commit**

```bash
git add .gitignore tests/navigateur/donnees-test.mjs tests/navigateur/outils.mjs tests/navigateur/package-lock.json tests/navigateur/package.json tests/navigateur/serveur.mjs tests/navigateur/serveur.test.mjs tests/navigateur/site.test.mjs
git commit -m "Tests navigateur : banc dans le dépôt (serveur local, Chrome installé, jeu de test)

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Portage des 57 vérifications sur le site actuel

Tests de caractérisation : ils décrivent le site **actuel** et doivent passer du premier coup. Chaque test ouvre une page neuve (contexte isolé) et se termine par `terminer(page)`, qui échoue en cas d'erreur de console, d'erreur JavaScript, de requête échouée ou de violation de CSP : les trois vérifications « aucune erreur console / CSP » d'origine valent désormais pour chaque test. Les attentes utilisent le jeu de test de la Task 1 au lieu des données réelles.

Correspondance (vérification d'origine → test porté ; évolution prévue plus loin) :

| # | Vérification d'origine | Test porté | Évolution |
| --- | --- | --- | --- |
| 1, 2, 4 | 60 premières cartes ; bouton « Afficher plus » ; toutes les cartes | liste · « 60 premières cartes, puis Afficher plus » | |
| 3 | stats renseignées | liste · « statistiques renseignées » | |
| 5–8 | « memoire » trouve « mémoire » ; `<mark>` ; URL avec `q` ; tri pertinence | liste · « recherche : memoire… » | Task 11 : page de résultats, tri par score (resultats · premier test, « frappe : les résultats suivent ») |
| 9, 10 | frappe lente, espace conservé ; Échap vide | liste · « frappe lente… » | |
| 11 | filtre Jalon | liste · « filtre Jalon » | |
| 12, 13 | clic projet filtre ; URL avec projet | liste · « clic sur le projet d'une carte » | Task 8 : pastille de projet (liste) + lien vers la page projet (projet) |
| 14, 44 | vue par projet ; accords « 2 note » | liste · « vue par projet… accords » | Task 10 : vue « Par projet » retirée → test « vue Liste » |
| 15 | clic tag : pastille | liste · « clic sur un tag » | |
| 16–18 | fiche : titre, URL courte, focus | fiche · « ouvrir une fiche depuis la liste » | |
| 19–23 | liens cliquables, noopener, adresses locales, pas de lien local, texte intégral | fiche · « liens en ligne cliquables… » | |
| 24, 25 | Précédente active ; flèche droite | fiche · « fiche du milieu » | |
| 26 | retour : filtres conservés | fiche · « Retour à la liste : filtres conservés » | Task 5 : filtres et recherche séparés |
| 27, 28 | entrée inconnue ; lien artifact | fiche · 2 tests | |
| 29–31 | thème sombre, fond, mémorisé | interface · « thème sombre » | |
| 32 | touche `/` | interface · « touche / » | |
| 33, 37, 54 | aucune erreur console / CSP | chaque test (`terminer`) | |
| 34–36 | mobile sans défilement (liste, fiche, par projet) | interface · « mobile… » | pages ajoutées à chaque nouvelle vue |
| 38, 39 | XSS : balises, liens `javascript:`/`data:` | robustesse · « données piégées » | pages ajoutées à chaque nouvelle vue |
| 40–43 | erreurs 404, page HTML, réseau, JSON | robustesse · 4 tests (+ « schéma trop récent ») | |
| 45 | lien d'évitement | interface · « lien d'évitement » | |
| 46, 47 | focus pastille ; focus compteur | interface · « focus conservé… » | |
| 48–52 | focus au retour ; Suivante ×2 + précédent ; fiche rechargée ; Maj+Flèche ; Échap introuvable | fiche · 5 tests | |
| 53 | contraste pastille active | interface · contraste (clair **et** sombre) | |
| 55, 56 | « coeur » ; apostrophe | robustesse · « coeur… » | |
| 57 | lien invalide non cliquable | fiche · « lien en ligne invalide » | |

**Files:**

- Test: `tests/navigateur/fiche.test.mjs` (créé), `tests/navigateur/interface.test.mjs` (créé), `tests/navigateur/liste.test.mjs` (créé), `tests/navigateur/robustesse.test.mjs` (créé)

**Interfaces:**

- Consumes: `ouvrirSite`, `terminer`, `attendreAncre`, `debordement`, `contraste` (outils.mjs) ; `jeuDeTest`, `entreeTitree`, `assembler`, `SCHEMA_TEST` (donnees-test.mjs).
- Produces: quatre fichiers de tests que les tâches suivantes adaptent quand le comportement change (sélecteur `CARTES = '#list-view:not([hidden]) #grid .card h3 a'` dans fiche.test.mjs).

- [ ] **Step 1: Test — Créer `tests/navigateur/fiche.test.mjs`**

```js
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { ouvrirSite, terminer, attendreAncre } from './outils.mjs';
import { jeuDeTest, entreeTitree, assembler } from './donnees-test.mjs';

let site;
before(async () => { site = await ouvrirSite(); });
after(async () => { await site.fermer(); });

const donnees = jeuDeTest();
const archi = entreeTitree(donnees, 'Jarvis — architecture');

async function ouvrir(ancre, selecteur) {
  const page = await site.page({ donnees });
  await page.goto(site.url(ancre));
  await page.locator(selecteur).first().waitFor();
  return page;
}

const CARTES = '#list-view:not([hidden]) #grid .card h3 a';

test('ouvrir une fiche depuis la liste : titre, URL courte, focus sur le titre', async () => {
  const page = await ouvrir('#/?q=jarvis', CARTES);
  await page.getByRole('link', { name: 'Jarvis — architecture', exact: true }).click();
  await page.locator('#entry-view:not([hidden]) #entry-title').waitFor();
  assert.equal(await page.textContent('#entry-title'), 'Jarvis — architecture');
  assert.match(page.url(), /#\/entree\/[0-9a-f]{12}$/);
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'entry-title');
  await terminer(page);
});

test('fiche : liens en ligne cliquables, adresses locales étiquetées, texte intégral', async () => {
  const page = await ouvrir('#/entree/' + archi.id.slice(0, 12), '#entry-title');
  const liens = await page.locator('.links-list a').evaluateAll((as) => as.map((a) => ({ target: a.target, rel: a.rel })));
  assert.equal(liens.length, 2);
  assert.ok(liens.every((a) => a.target === '_blank' && /noopener/.test(a.rel)));
  assert.equal(await page.locator('.links-list li:has(.local-label)').count(), 2);
  assert.equal(await page.locator('.links-list li:has(.local-label) a').count(), 0);
  assert.equal(await page.textContent('.entry-content'), archi.contenu);
  await terminer(page);
});

test('fiche du milieu : « Précédente » active, flèche droite vers la suivante', async () => {
  const page = await ouvrir('#/', CARTES);
  await page.locator(CARTES).nth(1).click();
  await page.locator('#entry-title').waitFor();
  assert.equal(await page.locator('.pager a[rel="prev"]').count(), 1);
  const avant = page.url();
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction((u) => location.href !== u, avant);
  assert.match(page.url(), /#\/entree\//);
  await terminer(page);
});

test('« Retour à la liste » : filtres conservés', async () => {
  const page = await ouvrir('#/?q=jarvis&type=milestone', CARTES);
  await page.locator(CARTES).first().click();
  await page.locator('#entry-title').waitFor();
  await page.getByRole('link', { name: '← Retour à la liste' }).click();
  await page.locator(CARTES).first().waitFor();
  assert.ok(page.url().includes('q=jarvis'), page.url());
  assert.equal(await page.inputValue('#search-input'), 'jarvis');
  await terminer(page);
});

test('entrée inconnue : message « Entrée introuvable »', async () => {
  const page = await ouvrir('#/entree/deadbeef0000', '#entry-title');
  assert.equal(await page.textContent('#entry-title'), 'Entrée introuvable');
  await terminer(page);
});

test('fiche Bibliothèque Claude : lien vers l’artifact', async () => {
  const biblio = entreeTitree(donnees, 'Bibliothèque Claude');
  const page = await ouvrir('#/entree/' + biblio.id.slice(0, 12), '#entry-title');
  assert.equal(await page.locator('.links-list a[href*="claude.ai/artifact"]').count(), 1);
  await terminer(page);
});

test('retour de fiche : le focus revient sur sa carte', async () => {
  const page = await ouvrir('#/', CARTES);
  const href = await page.locator(CARTES).nth(4).getAttribute('href');
  await page.locator(CARTES).nth(4).click();
  await page.locator('#entry-title').waitFor();
  await page.getByRole('link', { name: '← Retour à la liste' }).click();
  await page.locator(CARTES).first().waitFor();
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('href')), href);
  await terminer(page);
});

test('Suivante ×2 puis « précédent » du navigateur : retour à la liste', async () => {
  const page = await ouvrir('#/?type=note', CARTES);
  await page.locator(CARTES).nth(2).click();
  await page.locator('#entry-title').waitFor();
  for (let i = 0; i < 2; i++) {
    const avant = page.url();
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction((u) => location.href !== u, avant);
  }
  await page.goBack();
  await page.locator(CARTES).first().waitFor();
  assert.ok(page.url().includes('type=note'), page.url());
  await terminer(page);
});

test('fiche rechargée puis « Retour » : filtres d’origine', async () => {
  const page = await ouvrir('#/?type=note', CARTES);
  await page.locator(CARTES).nth(1).click();
  await page.locator('#entry-title').waitFor();
  await page.reload();
  await page.locator('#entry-title').waitFor();
  await page.getByRole('link', { name: '← Retour à la liste' }).click();
  await page.locator(CARTES).first().waitFor();
  assert.ok(page.url().includes('type=note'), page.url());
  await terminer(page);
});

test('Maj+Flèche : reste sur la fiche', async () => {
  const page = await ouvrir('#/', CARTES);
  await page.locator(CARTES).nth(1).click();
  await page.locator('#entry-title').waitFor();
  const url = page.url();
  await page.keyboard.press('Shift+ArrowRight');
  await page.waitForTimeout(150);
  assert.equal(page.url(), url);
  await terminer(page);
});

test('Échap sur une fiche introuvable : retour à la liste sans erreur', async () => {
  const page = await ouvrir('#/entree/0000000000ff', '#entry-title');
  await page.keyboard.press('Escape');
  await attendreAncre(page, '#/');
  await page.locator(CARTES).first().waitFor();
  assert.ok(page.url().endsWith('#/'), page.url());
  await terminer(page);
});

test('lien « en ligne » invalide : non cliquable, pas étiqueté « adresse locale »', async () => {
  const mini = assembler([{
    id: 'aaaaaaaaaaaa1111', titre: 'Lien cassé', resume: '', contenu: 'Lien cassé.', type: 'note', tags: [], projet: null,
    cree_le: '2026-09-18T00:00:00Z', modifie_le: null, lien_principal: null, corrige: false, voisins: [],
    liens: [{ type: 'en_ligne', valeur: 'https://exemple.com:99999/x' }, { type: 'local', valeur: 'D:/x' }],
  }]);
  const page = await site.page({ donnees: mini });
  await page.goto(site.url('#/entree/aaaaaaaaaaaa'));
  await page.locator('#entry-title').waitFor();
  assert.equal(await page.locator('.links-list a').count(), 0);
  assert.equal(await page.locator('.local-label', { hasText: 'lien non cliquable' }).count(), 1);
  assert.equal(await page.locator('.local-label', { hasText: 'adresse locale' }).count(), 1);
  await terminer(page);
});
```

- [ ] **Step 2: Test — Créer `tests/navigateur/interface.test.mjs`**

```js
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { ouvrirSite, terminer, attendreAncre, debordement, contraste } from './outils.mjs';
import { jeuDeTest, entreeTitree } from './donnees-test.mjs';

let site;
before(async () => { site = await ouvrirSite(); });
after(async () => { await site.fermer(); });

const donnees = jeuDeTest();

async function ouvrir(ancre = '#/', options = {}) {
  const page = await site.page({ donnees, ...options });
  await page.goto(site.url(ancre));
  await page.locator('#grid .card').first().waitFor();
  return page;
}

test('thème sombre : appliqué, fond sombre, mémorisé au rechargement', async () => {
  const page = await ouvrir();
  await page.click('#theme-toggle'); // clair
  await page.click('#theme-toggle'); // sombre
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark');
  assert.equal(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(30, 29, 25)');
  await page.reload();
  await page.locator('.card').first().waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark');
  await terminer(page);
});

test('touche / : focus sur la recherche', async () => {
  const page = await ouvrir();
  await page.keyboard.press('/');
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'search-input');
  await terminer(page);
});

test('lien d’évitement : filtres conservés', async () => {
  const page = await ouvrir('#/?q=jarvis');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(150);
  assert.ok(page.url().includes('q=jarvis'), page.url());
  assert.equal(await page.inputValue('#search-input'), 'jarvis');
  await terminer(page);
});

test('focus conservé sur la pastille après un filtre ; clic sur un tag : focus sur le compteur', async () => {
  const page = await ouvrir('#/?q=jarvis');
  await page.locator('#type-chips .chip').nth(1).focus();
  await page.keyboard.press('Enter');
  await attendreAncre(page, 'type=');
  assert.match(await page.evaluate(() => document.activeElement?.getAttribute('data-focus-key')), /^type:/);
  await page.locator('#grid .tag').first().click();
  await attendreAncre(page, 'tag=');
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'result-count');
  await terminer(page);
});

test('contraste de la pastille active ≥ 4,5 (thèmes clair et sombre)', async () => {
  const page = await ouvrir();
  await page.getByRole('button', { name: /^Jalon/ }).first().click();
  const mesure = () => page.evaluate(() => {
    const s = getComputedStyle(document.querySelector('.chip[aria-pressed="true"]'));
    return [s.color, s.backgroundColor];
  });
  for (const theme of ['light', 'dark']) {
    await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
    const [texte, fond] = await mesure();
    assert.ok(contraste(texte, fond) >= 4.5, `${theme} : ${contraste(texte, fond).toFixed(2)}`);
  }
  await terminer(page);
});

test('mobile : pas de défilement horizontal (liste, fiche, vue par projet)', async () => {
  const archi = entreeTitree(donnees, 'Jarvis — architecture');
  const page = await ouvrir('#/', { mobile: true });
  assert.ok(await debordement(page) <= 0, 'liste');
  await page.goto(site.url('#/entree/' + archi.id.slice(0, 12)));
  await page.locator('#entry-title').waitFor();
  assert.ok(await debordement(page) <= 0, 'fiche');
  await page.goto(site.url('#/?vue=projets'));
  await page.locator('.group').first().waitFor();
  assert.ok(await debordement(page) <= 0, 'vue par projet');
  await terminer(page);
});
```

- [ ] **Step 3: Test — Créer `tests/navigateur/liste.test.mjs`**

```js
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { ouvrirSite, terminer, attendreAncre } from './outils.mjs';
import { jeuDeTest } from './donnees-test.mjs';

let site;
before(async () => { site = await ouvrirSite(); });
after(async () => { await site.fermer(); });

const donnees = jeuDeTest();

async function liste(ancre = '#/') {
  const page = await site.page({ donnees });
  await page.goto(site.url(ancre));
  await page.locator('#grid .card').first().waitFor();
  return page;
}

test('liste : 60 premières cartes, puis « Afficher plus »', async () => {
  const page = await liste();
  assert.equal(await page.locator('#grid .card').count(), 60);
  assert.equal(await page.textContent('#more-btn'), 'Afficher plus (10\xa0restantes)');
  await page.click('#more-btn');
  assert.equal(await page.locator('#grid .card').count(), donnees.nb_entrees);
  await terminer(page);
});

test('statistiques renseignées', async () => {
  const page = await liste();
  assert.match(await page.textContent('#stats'), /^70\sentrées · 7\sprojets · \d+\sliens en ligne · export du /);
  await terminer(page);
});

test('recherche : « memoire » trouve « mémoire », surligne, met à jour l’URL, trie par pertinence', async () => {
  const page = await liste();
  await page.fill('#search-input', 'memoire');
  await attendreAncre(page, 'q=memoire');
  assert.ok(await page.locator('#grid .card').count() > 0);
  assert.ok(await page.locator('#grid mark').count() > 0);
  assert.equal(await page.inputValue('#sort-select'), 'pertinence');
  await terminer(page);
});

test('frappe lente : l’espace est conservé ; Échap vide la recherche', async () => {
  const page = await liste();
  await page.locator('#search-input').pressSequentially('tour de', { delay: 180 });
  await attendreAncre(page, 'q=tour+de');
  assert.equal(await page.inputValue('#search-input'), 'tour de');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !location.hash.includes('q='));
  assert.equal(await page.inputValue('#search-input'), '');
  await terminer(page);
});

test('filtre Jalon : que des jalons', async () => {
  const page = await liste();
  await page.getByRole('button', { name: /^Jalon/ }).first().click();
  await attendreAncre(page, 'type=milestone');
  const badges = await page.locator('#grid .type-badge').allTextContents();
  assert.ok(badges.length > 0);
  assert.ok(badges.every((b) => b === 'Jalon'), badges.join(', '));
  await terminer(page);
});

test('clic sur le projet d’une carte : filtre ce projet', async () => {
  const page = await liste();
  const bouton = page.locator('#grid .project-tag').first();
  const nom = (await bouton.textContent()).replace(/^\S+\s/, '');
  await bouton.click();
  await attendreAncre(page, 'projet=');
  const projets = await page.locator('#grid .project-tag').allTextContents();
  assert.ok(projets.length > 0);
  assert.ok(projets.every((t) => t.endsWith(nom)), nom);
  await terminer(page);
});

test('vue par projet : un groupe par projet et « Sans projet » ; accords corrects', async () => {
  const page = await liste();
  await page.getByRole('button', { name: 'Par projet' }).click();
  await page.locator('#groups .group').first().waitFor();
  assert.equal(await page.locator('#groups .group').count(), donnees.projets.length + 1);
  const metas = await page.locator('.group-meta').allTextContents();
  assert.ok(!metas.some((m) => /\b([2-9]|\d{2,})\s(note|jalon|décision|référence|erreur)\b/.test(m)), metas.join(' | '));
  await terminer(page);
});

test('clic sur un tag : pastille de filtre', async () => {
  const page = await liste();
  await page.locator('#grid .tag').first().click();
  await page.locator('.filter-pill').waitFor();
  assert.ok(await page.locator('.filter-pill').isVisible());
  await terminer(page);
});
```

- [ ] **Step 4: Test — Créer `tests/navigateur/robustesse.test.mjs`**

```js
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { ouvrirSite, terminer } from './outils.mjs';
import { jeuDeTest, SCHEMA_TEST } from './donnees-test.mjs';

let site;
before(async () => { site = await ouvrirSite(); });
after(async () => { await site.fermer(); });

const PIEGE = '<img src=x onerror=window.__pwned=1>';
const FAMILLE_PIEGEE = 'f"><img src=x onerror=window.__pwned=1>';

/* Données piégées : chaque texte affiché tente une injection. */
function donneesPiegees() {
  const commun = {
    type: '"><img src=x onerror=window.__pwned=1>', tags: ['<b>x</b>'], projet: 'x',
    cree_le: '2026-09-18T00:00:00Z', modifie_le: null, corrige: false,
    lien_principal: { url: 'javascript:window.__pwned=1', genre: 'site' },
  };
  return {
    schema: SCHEMA_TEST, genere_le: '2026-09-18T00:00:00Z', nb_entrees: 2, types: { note: 2 }, ordre_types: ['note'],
    familles: [{ id: FAMILLE_PIEGEE, nom: PIEGE, couleur: '1;background:url(javascript:1)' }],
    synonymes: [[PIEGE, 'x']],
    projets: [{
      id: 'x', nom: PIEGE, famille: FAMILLE_PIEGEE, description: '<script>window.__pwned=1</script>',
      lien_principal: { url: 'javascript:window.__pwned=1', genre: 'site' },
      nb: 2, types: { note: 2 }, premiere: '2026-09-18T00:00:00Z', derniere: '2026-09-18T00:00:00Z',
    }],
    entrees: [
      { ...commun, id: 'abcdef1234567890', titre: PIEGE, resume: '<script>window.__pwned=1</script>',
        contenu: '<svg onload=window.__pwned=1>',
        voisins: [{ id: 'abcdef0000000001', score: '<b>1</b>' }, { id: 'inconnu', score: 0.9 }],
        liens: [{ type: 'en_ligne', valeur: 'javascript:window.__pwned=1' },
          { type: 'en_ligne', valeur: 'data:text/html,<script>1</script>' }, { type: 'local', valeur: '<i>D:\\x</i>' }] },
      { ...commun, id: 'abcdef0000000001', titre: 'Voisine ' + PIEGE, resume: '', contenu: 'x',
        voisins: [{ id: 'abcdef1234567890', score: 0.9 }], liens: [] },
    ],
  };
}

async function sansInjection(page) {
  return page.evaluate(() => window.__pwned !== 1
    && document.querySelectorAll('img, svg:not([aria-hidden]), script:not([src]), b, i').length === 0);
}

test('données piégées (XSS) : aucune balise injectée, aucun lien javascript: ou data:', async () => {
  const page = await site.page({ donnees: donneesPiegees() });
  for (const [ancre, attendu] of [['#/', '#grid .card'], ['#/entree/abcdef123456', '#entry-title']]) {
    await page.goto(site.url(ancre));
    await page.locator(attendu).first().waitFor();
    assert.ok(await sansInjection(page), ancre);
    assert.equal(await page.locator('a[href^="javascript:"], a[href^="data:"]').count(), 0, ancre);
  }
  await page.context().close();
});

for (const [nom, gestion, attendu] of [
  ['404', (r) => r.fulfill({ status: 404, body: 'absent' }), /Aucune donnée publiée/],
  ['page HTML (session expirée)', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<html>connexion</html>' }), /session expirée/],
  ['réseau coupé', (r) => r.abort('failed'), /session a peut-être expiré/],
  ['JSON invalide', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{oups' }), /illisible/],
  ['schéma trop récent', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...jeuDeTest(), schema: SCHEMA_TEST + 1 }) }), /plus récentes que cette version du site : recharger la page/],
]) {
  test(`erreur de chargement (${nom}) : message clair et bouton « Recharger »`, async () => {
    const page = await site.page({ donnees: gestion });
    await page.goto(site.url());
    await page.locator('#status.error').waitFor();
    assert.match(await page.textContent('#status'), attendu);
    assert.equal(await page.getByRole('button', { name: 'Recharger la page' }).count(), 1);
    await page.context().close();
  });
}

test('« coeur » trouve « cœur » (surligné) ; l’apostrophe droite trouve l’apostrophe typographique', async () => {
  const page = await site.page({ donnees: jeuDeTest() });
  await page.goto(site.url('#/?q=coeur'));
  await page.locator('#grid .card').first().waitFor();
  assert.equal(await page.locator('#grid mark').first().textContent(), 'cœur');
  await page.goto(site.url('#/?q=' + encodeURIComponent("l'atelier")));
  await page.locator('#grid .card').first().waitFor();
  assert.equal(await page.locator('#grid .card').count(), 1);
  await terminer(page);
});
```

- [ ] **Step 5: Lancer la suite sur le site actuel**

Run: `cd tests/navigateur; npm test`
Expected: PASS dès le premier lancement (tests de caractérisation) — 39 tests, 39 réussis.

- [ ] **Step 6: Vérifier que la suite détecte une régression**

Dans `docs/app.js`, remplacer temporairement `pageSize: 60,` par `pageSize: 50,`.

Run: `cd tests/navigateur; node --test liste.test.mjs`
Expected: FAIL — « liste : 60 premières cartes, puis Afficher plus » (`50 !== 60`), les 7 autres passent.

Puis annuler : `git checkout docs/app.js` et relancer `npm test` (39 réussis).

- [ ] **Step 7: Commit**

```bash
git add tests/navigateur/fiche.test.mjs tests/navigateur/interface.test.mjs tests/navigateur/liste.test.mjs tests/navigateur/robustesse.test.mjs
git commit -m "Tests navigateur : les 57 vérifications de la recette portées dans le dépôt

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Découpage de app.js en modules ES, sans changement de comportement

Déplacement de code, pas de réécriture : chaque fonction de `docs/app.js` passe telle quelle dans le module de son rôle (spec § 4.1). L'état partagé vit dans `app.js` et les vues le reçoivent par un contexte `ctx` (fabriques `createListView(ctx)`, `createEntryView(ctx)`) : pas d'import circulaire. Deux ajustements sans effet visible : la fonction `highlight` est coupée en deux (plages calculées dans `recherche.js`, fragment construit dans `composants.js`) pour que la logique reste testable sous Node, et `loadData` lève une `DataError` au lieu d'afficher elle-même le message. L'espace insécable de `plural` s'écrit `'\xa0'` (visible dans le code).

La suite navigateur de la Task 2 est le filet : elle doit rester entièrement verte.

**Files:**

- Create: `docs/js/app.js`, `docs/js/composants.js`, `docs/js/donnees.js`, `docs/js/package.json`, `docs/js/recherche.js`, `docs/js/routes.js`, `docs/js/vues/entrees.js`, `docs/js/vues/fiche.js`
- Modify: `docs/index.html`
- Delete: `docs/app.js`
- Test: `tests/js/donnees.test.mjs` (créé), `tests/navigateur/site.test.mjs` (modifié)

**Interfaces:**

- Consumes: suite navigateur (Tasks 1–2).
- Produces (tous en `docs/js/`) :
  - `recherche.js` : `normalize(text)`, `queryTerms(query) → string[]`, `relevance(entry, terms) → number`, `highlightRanges(text, terms) → [début, fin][]` (fusionnées, sur le texte d'origine).
  - `routes.js` : `SORTS`, `VIEWS`, `listHash(filters)`, `entryHash(entry)`, `parseRoute(hash) → { view: 'entry', id } | { view: 'list', params }`, `filtersFromParams(params)`, `sameFilters(a, b)`.
  - `composants.js` : `el(tag, attrs, ...children)`, `typeLabel(type)`, `plural(count, one, many)`, `typeCount(type, count)`, `formatDay(isoOuMs)`, `formatLong(iso)`, `isWebUrl(value)`, `toast(message)`, `copy(text, label)`, `highlight(text, terms) → DocumentFragment`, `typeBadge(type)`, `projectButton(entry)`, `linksInfo(entry)`, `card(entry, terms)`, `chip(label, count, pressed, onClick, focusKey, extraClass)`.
  - `donnees.js` : `NO_PROJECT = '_aucun'`, `class DataError`, `loadData(url, supportedSchema, fetcher = fetch) → Promise<data>`, `prepare(data) → { data, entries, projects: Map, typeOrder }` (champs dérivés `_short`, `_time`, `_project`, `_projectName`, `_tags`, `_online`, `_invalid`, `_local`, `_title`, `_resume`, `_content`, `_meta`, `_hay`).
  - `vues/entrees.js` : `createListView(ctx) → { showList(restoreScroll), renderList(), filtered() → { terms, list }, sortEntries(list, terms), typeRank(type) }`.
  - `vues/fiche.js` : `createEntryView(ctx) → { showEntry(prefix) }`.
  - `app.js` : `ctx = { config, state, dom, route, setFilters, list, entry }`.

- [ ] **Step 1: Test — Créer `tests/js/donnees.test.mjs`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadData, prepare, DataError, NO_PROJECT } from '../../docs/js/donnees.js';

function reponse(corps, { status = 200, type = 'application/json' } = {}) {
  return async () => new Response(corps, { status, headers: { 'Content-Type': type } });
}

async function erreur(fetcher, schema = 1) {
  await assert.rejects(loadData('data.json', schema, fetcher), DataError);
  try { await loadData('data.json', schema, fetcher); } catch (e) { return e.message; }
  return '';
}

test('loadData : messages clairs pour chaque échec', async () => {
  assert.match(await erreur(async () => { throw new TypeError('réseau'); }), /session a peut-être expiré/);
  assert.match(await erreur(reponse('absent', { status: 404, type: 'text/plain' })), /Aucune donnée publiée/);
  assert.match(await erreur(reponse('panne', { status: 500, type: 'text/plain' })), /^Erreur 500 /);
  assert.match(await erreur(reponse('<html>', { type: 'text/html' })), /session expirée/);
  assert.match(await erreur(reponse('{oups')), /illisible/);
  assert.match(await erreur(reponse('{"schema": 1}')), /format inattendu/);
  assert.match(await erreur(reponse('{"schema": 2, "entrees": []}')), /recharger la page/);
});

test('loadData : renvoie les données valides', async () => {
  const data = await loadData('data.json', 1, reponse('{"schema": 1, "entrees": []}'));
  assert.deepEqual(data, { schema: 1, entrees: [] });
});

test('prepare : champs dérivés, projets et ordre des types', () => {
  const model = prepare({
    ordre_types: ['reference', 'note'],
    projets: [{ id: 'alpha', nom: 'Alpha' }],
    entrees: [
      { id: 'abcdef1234567890', titre: 'Le Cœur', resume: '', contenu: '', type: 'note', tags: ['X'], projet: 'alpha',
        cree_le: '2026-09-18T00:00:00Z', liens: [{ type: 'en_ligne', valeur: 'https://a.fr' }, { type: 'en_ligne', valeur: 'javascript:1' }, { type: 'local', valeur: 'D:/a' }, null] },
      { id: '1234567890abcdef', titre: 'B', type: 'zeta', projet: null, cree_le: 'pas une date' },
    ],
  });
  const [a, b] = model.entries;
  assert.equal(a._short, 'abcdef123456');
  assert.equal(a._title, 'le coeur');
  assert.equal(a._projectName, 'Alpha');
  assert.deepEqual([a._online, a._invalid, a._local], [1, 1, 1]);
  assert.equal(b._project, NO_PROJECT);
  assert.equal(b._projectName, 'Sans projet');
  assert.equal(b._time, 0);
  assert.deepEqual(b.tags, []);
  assert.deepEqual(model.typeOrder, ['note', 'zeta']);
  assert.equal(model.projects.get('alpha').nom, 'Alpha');
});
```

- [ ] **Step 2: Test — Modifier `tests/navigateur/site.test.mjs`**

Remplacer :

```js
});

test('jeu de test : identifiants courts distincts, projets cohérents', () => {
  const donnees = jeuDeTest();
```

par :

```js
});

const CSP = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; manifest-src 'self'; base-uri 'none'; form-action 'none'";

test('modules ES chargés sous le sous-chemin, CSP inchangée', async () => {
  const page = await site.page({ donnees: jeuDeTest() });
  const demandes = [];
  page.on('request', (r) => demandes.push(new URL(r.url()).pathname));
  await page.goto(site.url());
  await page.locator('.card').first().waitFor();
  const racine = new URL(site.base).pathname;
  assert.ok(demandes.includes(racine + 'js/app.js'), demandes.join(' '));
  assert.ok(!demandes.includes(racine + 'app.js'), 'ancien script classique encore demandé');
  assert.equal(await page.getAttribute('script[src="js/app.js"]', 'type'), 'module');
  assert.equal(await page.getAttribute('meta[http-equiv="Content-Security-Policy"]', 'content'), CSP);
  await terminer(page);
});

test('jeu de test : identifiants courts distincts, projets cohérents', () => {
  const donnees = jeuDeTest();
```


- [ ] **Step 3: Vérifier l'échec**

Run: `node --test "tests/js/*.test.mjs"`
Expected: FAIL — `ERR_MODULE_NOT_FOUND` : `docs/js/donnees.js` introuvable.

Run: `cd tests/navigateur; node --test site.test.mjs`
Expected: FAIL — « modules ES chargés sous le sous-chemin, CSP inchangée » : `/memoire-vive/js/app.js` n'est pas demandé (seul `/memoire-vive/app.js` l'est) ; les 2 autres tests passent.

- [ ] **Step 4: Créer `docs/js/package.json`**

```json
{ "type": "module" }
```

- [ ] **Step 5: Créer `docs/js/donnees.js`**

```js
/* Données : chargement de data.json (messages d'erreur clairs) et
   préparation du modèle affiché (champs dérivés, projets, ordre des types). */
import { normalize } from './recherche.js';
import { typeLabel, isWebUrl } from './composants.js';

export const NO_PROJECT = '_aucun';

export class DataError extends Error {}

/* Chemin relatif et même origine : fonctionne sous github.io, sous un domaine
   personnalisé et derrière Cloudflare Access (le cookie de session part avec
   la requête), sans rien changer ici. */
export async function loadData(url, supportedSchema, fetcher = fetch) {
  let response;
  try {
    response = await fetcher(url, { cache: 'no-cache', credentials: 'same-origin' });
  } catch (e) {
    // Réseau coupé, ou redirection vers une page de connexion (Cloudflare
    // Access, session expirée) que le navigateur refuse de suivre en fetch.
    throw new DataError("Impossible de charger les données. Si le site est protégé par une connexion, la session a peut-être expiré.");
  }
  if (!response.ok) {
    throw new DataError(response.status === 404
      ? "Aucune donnée publiée pour l'instant (data.json absent) : lancer l'export."
      : 'Erreur ' + response.status + ' au chargement des données.');
  }
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('json')) {
    throw new DataError("Les données n'ont pas pu être lues : le serveur a renvoyé une page au lieu du fichier attendu (session expirée ?).");
  }
  let data;
  try {
    data = await response.json();
  } catch (e) {
    throw new DataError('Le fichier de données est illisible (JSON invalide).');
  }
  if (!data || !Array.isArray(data.entrees)) {
    throw new DataError('Le fichier de données a un format inattendu.');
  }
  if (Number(data.schema) > supportedSchema) {
    throw new DataError('Les données sont plus récentes que cette version du site : recharger la page.');
  }
  return data;
}

export function prepare(data) {
  const projects = new Map();
  for (const project of data.projets || []) projects.set(project.id, project);

  const entries = data.entrees.map((entry) => {
    const tags = Array.isArray(entry.tags) ? entry.tags.map(String) : [];
    const liens = Array.isArray(entry.liens) ? entry.liens.filter((l) => l && l.valeur) : [];
    const project = entry.projet ? projects.get(entry.projet) : null;
    const projectName = project ? project.nom : (entry.projet || 'Sans projet');
    const meta = normalize([tags.join(' '), projectName, entry.projet, typeLabel(entry.type), entry.type].join(' '));
    const title = normalize(entry.titre);
    const resume = normalize(entry.resume);
    const content = normalize(entry.contenu);
    return Object.assign({}, entry, {
      tags,
      liens,
      _title: title,
      _resume: resume,
      _content: content,
      _meta: meta,
      _hay: [title, resume, content, meta, normalize(liens.map((l) => l.valeur).join(' '))].join('\n'),
      _tags: tags.map(normalize),
      _time: Date.parse(entry.cree_le) || 0,
      _project: entry.projet || NO_PROJECT,
      _projectName: projectName,
      _short: String(entry.id || '').slice(0, 12),
      _online: liens.filter((l) => l.type === 'en_ligne' && isWebUrl(l.valeur)).length,
      _invalid: liens.filter((l) => l.type === 'en_ligne' && !isWebUrl(l.valeur)).length,
      _local: liens.filter((l) => l.type !== 'en_ligne').length,
    });
  });

  const known = Array.isArray(data.ordre_types) ? data.ordre_types : [];
  const present = Array.from(new Set(entries.map((e) => e.type)));
  const typeOrder = known.filter((t) => present.includes(t)).concat(present.filter((t) => !known.includes(t)).sort());

  return { data, entries, projects, typeOrder };
}
```

- [ ] **Step 6: Créer `docs/js/recherche.js`**

```js
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
```

- [ ] **Step 7: Créer `docs/js/routes.js`**

```js
/* Routes : analyse et construction des ancres (#/…). Module pur. */

export const SORTS = ['recent', 'ancien', 'pertinence', 'projet'];
export const VIEWS = ['grille', 'projets'];

export function listHash(filters) {
  const params = new URLSearchParams();
  if (filters.q) params.set('q', filters.q);
  if (filters.type) params.set('type', filters.type);
  if (filters.projet) params.set('projet', filters.projet);
  if (filters.tag) params.set('tag', filters.tag);
  if (filters.tri) params.set('tri', filters.tri);
  if (filters.vue !== 'grille') params.set('vue', filters.vue);
  const query = params.toString();
  return '#/' + (query ? '?' + query : '');
}

export function entryHash(entry) {
  return '#/entree/' + entry._short;
}

export function parseRoute(hash) {
  hash = String(hash || '').replace(/^#/, '');
  const match = hash.match(/^\/entree\/([0-9a-f]{6,64})\/?$/i);
  if (match) return { view: 'entry', id: match[1].toLowerCase() };
  const index = hash.indexOf('?');
  return { view: 'list', params: new URLSearchParams(index >= 0 ? hash.slice(index + 1) : '') };
}

export function filtersFromParams(params) {
  const tri = params.get('tri') || '';
  const vue = params.get('vue') || 'grille';
  return {
    q: params.get('q') || '',
    type: params.get('type') || '',
    projet: params.get('projet') || '',
    tag: params.get('tag') || '',
    tri: SORTS.includes(tri) ? tri : '',
    vue: VIEWS.includes(vue) ? vue : 'grille',
  };
}

export function sameFilters(a, b) {
  return Object.keys(a).every((key) => a[key] === b[key]);
}
```

- [ ] **Step 8: Créer `docs/js/composants.js`**

```js
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

/* Surligne sans innerHTML : les plages viennent de recherche.js. */
export function highlight(text, terms) {
  const fragment = document.createDocumentFragment();
  text = String(text || '');
  const ranges = highlightRanges(text, terms);
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

export function card(entry, terms) {
  const tagsShown = entry.tags.slice(0, 5);
  const extraTags = entry.tags.length - tagsShown.length;
  return el('article', { class: 'card' },
    el('div', { class: 'badges' }, typeBadge(entry.type), entry.projet ? projectButton(entry) : null),
    el('h3', null, el('a', { href: entryHash(entry) }, highlight(entry.titre, terms))),
    entry.resume ? el('p', { class: 'resume' }, highlight(entry.resume, terms)) : null,
    el('div', { class: 'meta-line' },
      el('time', { datetime: entry.cree_le }, formatDay(entry.cree_le)),
      linksInfo(entry)),
    tagsShown.length ? el('ul', { class: 'tags', 'aria-label': 'Tags' },
      tagsShown.map((tag) => el('li', null,
        el('button', { type: 'button', class: 'tag', 'data-action': 'tag', 'data-tag': tag }, highlight(tag, terms)))),
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
```

- [ ] **Step 9: Créer `docs/js/vues/entrees.js`**

```js
/* Vue liste : filtres (recherche, type, projet, tag), tri, grille ou
   regroupement par projet, « Afficher plus ». */
import { normalize, queryTerms, relevance } from '../recherche.js';
import { listHash } from '../routes.js';
import { el, plural, typeLabel, typeCount, formatDay, card, chip } from '../composants.js';
import { NO_PROJECT } from '../donnees.js';

export function createListView(ctx) {
  const { config, state, dom } = ctx;

  function effectiveSort() {
    const f = state.filters;
    if (f.tri === 'pertinence' && !f.q) return 'recent';
    return f.tri || (f.q ? 'pertinence' : 'recent');
  }

  function matches(entry, terms, except) {
    const f = state.filters;
    if (except !== 'type' && f.type && entry.type !== f.type) return false;
    if (except !== 'projet' && f.projet && entry._project !== f.projet) return false;
    if (f.tag && !entry._tags.includes(normalize(f.tag))) return false;
    for (const term of terms) if (!entry._hay.includes(term)) return false;
    return true;
  }

  function typeRank(type) {
    const index = state.typeOrder.indexOf(type);
    return index === -1 ? state.typeOrder.length : index;
  }

  function sortEntries(list, terms) {
    const byRecent = (a, b) => b._time - a._time || (a.id < b.id ? -1 : 1);
    switch (effectiveSort()) {
      case 'ancien':
        return list.sort((a, b) => -byRecent(a, b));
      case 'pertinence': {
        const scores = new Map(list.map((e) => [e, relevance(e, terms)]));
        return list.sort((a, b) => scores.get(b) - scores.get(a) || byRecent(a, b));
      }
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
    const terms = queryTerms(state.filters.q);
    return { terms, list: sortEntries(state.entries.filter((e) => matches(e, terms)), terms) };
  }

  function showList(restoreScroll) {
    dom.entryView.hidden = true;
    dom.entryView.replaceChildren();
    dom.listView.hidden = false;
    document.title = 'Mémoire Vive';
    state.lastListHash = listHash(state.filters);
    renderList();
    if (restoreScroll) {
      window.scrollTo(0, state.scroll.get(state.lastListHash) || 0);
      // Au retour d'une fiche, le focus revient sur sa carte.
      const link = state.openedId && dom.listView.querySelector('.card h3 a[href="#/entree/' + state.openedId + '"]');
      if (link) link.focus({ preventScroll: true });
    }
  }

  function renderList() {
    const f = state.filters;
    const { terms, list } = filtered();
    state.lastList = list;

    // Comparaison sans les espaces : ne pas effacer l'espace en cours de frappe.
    if (dom.search.value.trim() !== f.q) dom.search.value = f.q;
    const sort = effectiveSort();
    dom.sort.value = sort;
    dom.sort.querySelector('option[value="pertinence"]').disabled = !f.q;
    for (const button of document.querySelectorAll('.segmented button')) {
      button.setAttribute('aria-pressed', String(button.dataset.view === f.vue));
    }

    renderTypeChips(terms);
    renderProjectChips(terms);
    renderActiveFilters();

    const total = state.entries.length;
    dom.resultCount.textContent = list.length === total
      ? plural(total, 'entrée', 'entrées')
      : plural(list.length, 'entrée', 'entrées') + ' sur ' + total;

    dom.grid.replaceChildren();
    dom.groups.replaceChildren();
    dom.more.hidden = true;

    if (!list.length) {
      dom.grid.hidden = true;
      dom.groups.hidden = true;
      dom.empty.hidden = false;
      dom.empty.replaceChildren(
        el('p', null, total ? 'Aucune entrée ne correspond à ces critères.' : 'La mémoire est vide pour le moment.'),
        total ? resetButton() : null,
      );
      return;
    }
    dom.empty.hidden = true;

    if (f.vue === 'projets') {
      dom.grid.hidden = true;
      dom.groups.hidden = false;
      renderGroups(list, terms);
    } else {
      dom.groups.hidden = true;
      dom.grid.hidden = false;
      const fragment = document.createDocumentFragment();
      for (const entry of list.slice(0, state.shown)) fragment.append(card(entry, terms));
      dom.grid.append(fragment);
      const remaining = list.length - state.shown;
      if (remaining > 0) {
        dom.more.hidden = false;
        dom.moreBtn.textContent = 'Afficher plus (' + plural(remaining, 'restante', 'restantes') + ')';
      }
    }
  }

  function resetButton() {
    const button = el('button', { type: 'button', class: 'btn-secondary' }, 'Effacer les filtres');
    button.addEventListener('click', () => ctx.setFilters({ q: '', type: '', projet: '', tag: '' }));
    return button;
  }

  function renderTypeChips(terms) {
    const pool = state.entries.filter((e) => matches(e, terms, 'type'));
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

  function renderProjectChips(terms) {
    const pool = state.entries.filter((e) => matches(e, terms, 'projet'));
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
        renderProjectChips(queryTerms(state.filters.q));
        // Le focus va sur le premier projet qui vient d'apparaître.
        const first = dom.projectChips.querySelectorAll('.chip')[visible.length + 1];
        if (first) first.focus();
      }, 'projets:plus', 'more-chip'));
    } else if (state.showAllProjects && keys.length > config.projectChips + 1) {
      chips.push(chip('Réduire', null, false, () => {
        state.showAllProjects = false;
        renderProjectChips(queryTerms(state.filters.q));
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
    if (f.q || f.type || f.projet || f.tag) {
      const clear = el('button', { type: 'button', class: 'link-button' }, 'Effacer tous les filtres');
      clear.addEventListener('click', () => ctx.setFilters({ q: '', type: '', projet: '', tag: '' }));
      items.push(clear);
    }
    dom.activeFilters.hidden = !items.length;
    dom.activeFilters.replaceChildren(...items);
  }

  function renderGroups(list, terms) {
    const groups = new Map();
    for (const entry of list) {
      if (!groups.has(entry._project)) groups.set(entry._project, []);
      groups.get(entry._project).push(entry);
    }
    const single = Boolean(state.filters.projet);
    const fragment = document.createDocumentFragment();
    for (const [key, members] of groups) {
      const project = state.projects.get(key);
      const name = key === NO_PROJECT ? 'Sans projet' : (project ? project.nom : key);
      const typeCounts = new Map();
      for (const entry of members) typeCounts.set(entry.type, (typeCounts.get(entry.type) || 0) + 1);
      const breakdown = Array.from(typeCounts, ([type, count]) => typeCount(type, count)).join(' · ');
      const lastDate = members.reduce((max, e) => Math.max(max, e._time), 0);

      // « group » : filtre sur le projet en gardant recherche, type et tag,
      // pour que le nombre annoncé soit celui qui s'affiche.
      const title = el('button', { type: 'button', class: 'link-button group-title', 'data-action': 'group', 'data-project': key }, name);
      const head = el('div', { class: 'group-head' },
        el('h2', null, single ? name : title),
        el('span', { class: 'group-meta' },
          plural(members.length, 'entrée', 'entrées') + ' — ' + breakdown
          + (lastDate ? ' — dernière le ' + formatDay(lastDate) : '')));

      const shown = single ? members : members.slice(0, config.groupPreview);
      const grid = el('div', { class: 'grid' }, shown.map((entry) => card(entry, terms)));
      const section = el('section', { class: 'group', 'aria-label': name }, head, grid);
      if (members.length > shown.length) {
        section.append(el('div', { class: 'group-more' },
          el('button', { type: 'button', class: 'btn-secondary', 'data-action': 'group', 'data-project': key },
            'Voir les ' + members.length + ' entrées de ce projet')));
      }
      fragment.append(section);
    }
    dom.groups.append(fragment);
  }

  return { showList, renderList, filtered, sortEntries, typeRank };
}
```

- [ ] **Step 10: Créer `docs/js/vues/fiche.js`**

```js
/* Fiche d'une entrée : navigation (retour, précédente, suivante), liens,
   texte intégral, tags, entrées du même projet, détails. */
import { entryHash } from '../routes.js';
import { el, typeBadge, projectButton, typeLabel, formatLong, isWebUrl, copy } from '../composants.js';

export function createEntryView(ctx) {
  const { state, dom } = ctx;

  function findEntry(prefix) {
    return state.entries.find((e) => String(e.id).toLowerCase().startsWith(prefix)) || null;
  }

  function showEntry(prefix) {
    dom.listView.hidden = true;
    dom.entryView.hidden = false;
    window.scrollTo(0, 0);

    const entry = findEntry(prefix);
    if (!entry) {
      document.title = 'Entrée introuvable — Mémoire Vive';
      dom.entryView.replaceChildren(el('div', { class: 'not-found' },
        el('h2', { id: 'entry-title', tabindex: '-1' }, 'Entrée introuvable'),
        el('p', null, "Cette entrée n'existe pas ou n'est plus dans la mémoire publiée."),
        el('a', { class: 'btn-secondary', href: '#/' }, '← Retour à la liste')));
      dom.entryView.querySelector('h2').focus();
      return;
    }

    document.title = entry.titre + ' — Mémoire Vive';
    state.openedId = entry._short;
    const sequence = state.lastList.includes(entry) ? state.lastList : ctx.list.sortEntries(state.entries.slice(), []);
    const position = sequence.indexOf(entry);
    const previous = position > 0 ? sequence[position - 1] : null;
    const next = position >= 0 && position < sequence.length - 1 ? sequence[position + 1] : null;

    const back = el('a', { class: 'btn-secondary', href: state.lastListHash }, '← Retour à la liste');
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
      siblings.length > 15 ? el('p', null, el('button', {
        type: 'button', class: 'link-button', 'data-action': 'project', 'data-project': entry._project,
      }, 'Voir les ' + (siblings.length + 1) + ' entrées du projet')) : null);
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
```

- [ ] **Step 11: Créer `docs/js/app.js`**

```js
/* Mémoire Vive — démarrage, routage, événements et thème.
   Modules ES sans dépendance ; toutes les données viennent de data.json,
   déjà préparé par scripts/export.py (titres, résumés, projets, liens). */
import { loadData, prepare, DataError } from './donnees.js';
import { listHash, parseRoute, filtersFromParams, sameFilters } from './routes.js';
import { el, plural, formatLong } from './composants.js';
import { createListView } from './vues/entrees.js';
import { createEntryView } from './vues/fiche.js';

const CONFIG = {
  dataUrl: 'data.json',
  supportedSchema: 1,
  pageSize: 60,       // cartes affichées avant « Afficher plus »
  groupPreview: 6,    // entrées par projet dans la vue « Par projet »
  projectChips: 10,   // projets affichés avant « + N autres »
};
const THEME_KEY = 'memoire-vive:theme';

const state = {
  data: null,
  entries: [],
  projects: new Map(),
  typeOrder: [],
  filters: { q: '', type: '', projet: '', tag: '', tri: '', vue: 'grille' },
  shown: CONFIG.pageSize,
  showAllProjects: false,
  lastList: [],          // résultat affiché, pour « précédente / suivante »
  lastListHash: '#/',
  scroll: new Map(),     // position de défilement par état de liste
  route: null,
  entryDepth: 0,         // fiches ouvertes depuis la liste (pour « Retour »)
  openedId: '',          // dernière fiche ouverte, pour lui rendre le focus au retour
};

const $ = (id) => document.getElementById(id);
const dom = {
  stats: $('stats'), listView: $('list-view'), entryView: $('entry-view'),
  search: $('search-input'), sort: $('sort-select'),
  typeChips: $('type-chips'), projectChips: $('project-chips'), activeFilters: $('active-filters'),
  resultCount: $('result-count'), status: $('status'), grid: $('grid'), groups: $('groups'),
  more: $('more'), moreBtn: $('more-btn'), empty: $('empty'),
  themeToggle: $('theme-toggle'),
};

const ctx = { config: CONFIG, state, dom, route, setFilters };
ctx.list = createListView(ctx);
ctx.entry = createEntryView(ctx);

// ------------------------------------------------------------ données

async function load() {
  let data;
  try {
    data = await loadData(CONFIG.dataUrl, CONFIG.supportedSchema);
  } catch (e) {
    if (e instanceof DataError) return fail(e.message);
    throw e;
  }
  init(data);
}

function fail(message) {
  dom.status.hidden = false;
  dom.status.classList.add('error');
  const button = el('button', { type: 'button', class: 'btn-secondary' }, 'Recharger la page');
  button.addEventListener('click', () => location.reload());
  dom.status.replaceChildren(el('p', null, message), button);
  dom.grid.hidden = true;
  dom.groups.hidden = true;
  dom.stats.textContent = '';
}

function init(data) {
  const model = prepare(data);
  state.data = model.data;
  state.entries = model.entries;
  state.projects = model.projects;
  state.typeOrder = model.typeOrder;
  renderStats();
  dom.status.hidden = true;
  route();
}

function renderStats() {
  const online = state.entries.reduce((sum, e) => sum + e._online, 0);
  const parts = [
    plural(state.entries.length, 'entrée', 'entrées'),
    plural(state.projects.size, 'projet', 'projets'),
    plural(online, 'lien en ligne', 'liens en ligne'),
  ];
  if (state.data.genere_le) parts.push('export du ' + formatLong(state.data.genere_le));
  dom.stats.textContent = parts.join(' · ');
}

// ------------------------------------------------------------ routage

function route() {
  const previous = state.route;
  const next = parseRoute(location.hash);
  if (previous && previous.view === 'list') {
    state.scroll.set(state.lastListHash, window.scrollY);
  }
  state.route = next;

  if (next.view === 'entry') {
    // Le contexte (liste d'origine, nombre de fiches ouvertes depuis elle)
    // vit dans history.state : il survit au rechargement et au retour
    // arrière, et Précédente/Suivante le reprennent tel quel.
    const saved = history.state && typeof history.state.list === 'string' ? history.state : null;
    if (saved) {
      state.entryDepth = Number(saved.depth) || 0;
      if (saved.list !== state.lastListHash && saved.list.startsWith('#/')) {
        const index = saved.list.indexOf('?');
        state.filters = filtersFromParams(new URLSearchParams(index >= 0 ? saved.list.slice(index + 1) : ''));
        state.lastListHash = saved.list;
        state.lastList = ctx.list.filtered().list;
      }
    } else if (previous && previous.view === 'list') {
      state.entryDepth = 1;
    } else if (previous && previous.view === 'entry') {
      state.entryDepth = state.entryDepth > 0 ? state.entryDepth + 1 : 0;
    } else {
      state.entryDepth = 0;
    }
    history.replaceState({ list: state.lastListHash, depth: state.entryDepth }, '');
    ctx.entry.showEntry(next.id);
    return;
  }
  const filters = filtersFromParams(next.params);
  if (!sameFilters(filters, state.filters)) {
    state.filters = filters;
    state.shown = CONFIG.pageSize;
  }
  ctx.list.showList(previous && previous.view === 'entry');
}

function setFilters(patch) {
  // Le bouton cliqué est souvent reconstruit par le rendu : on rend le
  // focus à son équivalent (même data-focus-key), sinon au compteur de
  // résultats, plutôt que de le laisser tomber sur <body>.
  const active = document.activeElement;
  const focusKey = active && active.dataset ? active.dataset.focusKey : '';
  Object.assign(state.filters, patch);
  state.shown = CONFIG.pageSize;
  const hash = listHash(state.filters);
  history.replaceState(null, '', hash);
  state.lastListHash = hash;
  ctx.list.renderList();
  if (active && active !== document.body && !active.isConnected) {
    const again = focusKey && document.querySelector('[data-focus-key="' + CSS.escape(focusKey) + '"]');
    (again || dom.resultCount).focus({ preventScroll: true });
  }
}

// ------------------------------------------------------------ thème

const THEMES = [
  { value: '', label: 'Auto' },
  { value: 'light', label: 'Clair' },
  { value: 'dark', label: 'Sombre' },
];

function currentTheme() {
  return document.documentElement.getAttribute('data-theme') || '';
}

function renderThemeToggle() {
  const theme = THEMES.find((t) => t.value === currentTheme()) || THEMES[0];
  dom.themeToggle.querySelector('.theme-label').textContent = theme.label;
  dom.themeToggle.setAttribute('aria-label', 'Thème : ' + theme.label + ' (cliquer pour changer)');
}

function cycleTheme() {
  const index = THEMES.findIndex((t) => t.value === currentTheme());
  const next = THEMES[(index + 1) % THEMES.length].value;
  if (next) document.documentElement.setAttribute('data-theme', next);
  else document.documentElement.removeAttribute('data-theme');
  try {
    if (next) localStorage.setItem(THEME_KEY, next);
    else localStorage.removeItem(THEME_KEY);
  } catch (e) { /* stockage indisponible : le choix vaut pour cette page */ }
  renderThemeToggle();
}

// ------------------------------------------------------------ événements

function isTyping(target) {
  return target instanceof HTMLElement
    && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
}

function bind() {
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  // Seules les ancres « #/… » sont des routes : « #contenu » (lien
  // d'évitement sans JS) ne doit pas vider les filtres.
  window.addEventListener('hashchange', () => {
    if (state.data && (!location.hash || location.hash.startsWith('#/'))) route();
  });
  document.querySelector('.skip-link').addEventListener('click', (event) => {
    event.preventDefault();
    const target = state.route && state.route.view === 'entry' ? $('entry-title') : $('contenu');
    (target || $('contenu')).focus();
  });

  let searchTimer = null;
  dom.search.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => setFilters({ q: dom.search.value.trim() }), 120);
  });
  dom.search.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && dom.search.value) {
      event.preventDefault();
      dom.search.value = '';
      setFilters({ q: '' });
    }
  });
  dom.sort.addEventListener('change', () => setFilters({ tri: dom.sort.value === 'recent' && !state.filters.q ? '' : dom.sort.value }));
  for (const button of document.querySelectorAll('.segmented button')) {
    button.addEventListener('click', () => setFilters({ vue: button.dataset.view }));
  }
  dom.moreBtn.addEventListener('click', () => {
    const firstNew = state.shown;
    state.shown += CONFIG.pageSize;
    ctx.list.renderList();
    // Le focus passe à la première carte ajoutée (le bouton peut disparaître).
    const link = dom.grid.querySelectorAll('.card h3 a')[firstNew];
    if (link) link.focus();
  });

  // Délégation : projets et tags, dans la liste comme sur une fiche.
  document.addEventListener('click', (event) => {
    const target = event.target.closest('[data-action]');
    if (!target || !state.data) return;
    const action = target.dataset.action;
    if (action !== 'project' && action !== 'tag' && action !== 'group') return;
    event.preventDefault();
    if (action === 'group') {
      setFilters({ projet: target.dataset.project });
      window.scrollTo(0, 0);
      return;
    }
    const patch = action === 'project'
      ? { projet: target.dataset.project, type: '', tag: '', q: '' }
      : { tag: target.dataset.tag, type: '', projet: '', q: '' };
    if (state.route && state.route.view === 'entry') {
      const filters = Object.assign({}, state.filters, patch);
      location.hash = listHash(filters);
    } else {
      setFilters(patch);
      window.scrollTo(0, 0);
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey || isTyping(event.target) || !state.data) return;
    const inEntry = state.route && state.route.view === 'entry';
    if (event.key === '/' && !inEntry) {
      event.preventDefault();
      dom.search.focus();
      dom.search.select();
    } else if (inEntry && event.key === 'Escape') {
      const back = dom.entryView.querySelector('.entry-nav a, .not-found a');
      if (back) back.click();
    } else if (inEntry && !event.shiftKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
      // Maj+Flèche et sélection en cours : laisser le navigateur sélectionner du texte.
      const selection = window.getSelection();
      if (selection && !selection.isCollapsed) return;
      const link = dom.entryView.querySelector(event.key === 'ArrowLeft' ? 'a[rel="prev"]' : 'a[rel="next"]');
      if (link) link.click();
    }
  });

  dom.themeToggle.addEventListener('click', cycleTheme);
  renderThemeToggle();
}

bind();
load();
```

- [ ] **Step 12: Modifier `docs/index.html`**

Remplacer :

```html
<link rel="stylesheet" href="style.css">
<script src="theme.js"></script>
<script src="app.js" defer></script>
</head>
<body>
```

par :

```html
<link rel="stylesheet" href="style.css">
<script src="theme.js"></script>
<script type="module" src="js/app.js"></script>
</head>
<body>
```


- [ ] **Step 13: Supprimer `docs/app.js`**

```bash
git rm docs/app.js
```

- [ ] **Step 14: Vérifier le succès**

Run: `node --test "tests/js/*.test.mjs"`
Expected: PASS — 3 tests.

Run: `cd tests/navigateur; npm test`
Expected: PASS — 40 tests, 40 réussis (dont les 33 de la Task 2, inchangés).

- [ ] **Step 15: Commit**

```bash
git add docs/index.html docs/js/app.js docs/js/composants.js docs/js/donnees.js docs/js/package.json docs/js/recherche.js docs/js/routes.js docs/js/vues/entrees.js docs/js/vues/fiche.js tests/js/donnees.test.mjs tests/navigateur/site.test.mjs
git commit -m "Site : app.js découpé en modules ES, sans changement de comportement

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Recherche tolérante (module pur, tests Node, branchée sur la liste)

`recherche.js` est réécrit (spec § 4.5). Principe : chaque document (entrée, plus tard projet) a quatre champs pondérés (`title` ×6, `meta` ×3 = projet, tags, type ; `resume` ×2 ; `content` ×1, plafonné à 5 points par terme). Les mots sont normalisés puis racinisés (pluriels seulement) ; l'index garde, par champ, les comptes de racines et deux chaînes (mots bruts, racines) pour les expressions. Un terme de la requête vaut un ensemble de racines du **vocabulaire** avec une qualité : exact 1, synonyme 0,9, préfixe 0,7, faute 0,6 (distance 1) ou 0,4 (distance 2) ; les termes de plusieurs mots (`hors-ligne`, synonymes comme « intelligence artificielle ») et les guillemets sont des expressions. Les candidats d'un terme sont mis en cache (seul le dernier terme change pendant la frappe) et seuls les documents qui contiennent tous les termes sont notés.

La liste actuelle utilise déjà ce module (la page de résultats vient en Task 11) : la suite navigateur reste verte. `jeuVolumineux(3000)` (vocabulaire d'environ 20 000 mots, loi très inégale) sert au test de performance, ici sous Node, en Task 13 dans le navigateur.

**Files:**

- Modify: `docs/js/app.js`, `docs/js/composants.js`, `docs/js/donnees.js`, `docs/js/recherche.js`, `docs/js/vues/entrees.js`, `docs/js/vues/fiche.js`
- Test: `tests/js/donnees.test.mjs` (modifié), `tests/js/performance.test.mjs` (créé), `tests/js/recherche.test.mjs` (créé), `tests/navigateur/donnees-test.mjs` (modifié)

**Interfaces:**

- Consumes: `prepare`, `typeLabel`, liste de la Task 3.
- Produces:
  - `recherche.js` : `normalize(text)`, `tokenize(text) → string[]`, `stem(word)`, `editDistance(a, b, max) → number` (max + 1 au-delà), `parseQuery(query) → [{ words, quoted, exclude, prefix }]`, `buildIndex(documents, synonyms = []) → index` (documents : `[{ title, meta, resume, content }]`), `search(index, query) → { hits: [{ doc, score }], targets: { words: Set, phrases: [{ tokens, stemmed, prefix, quality }] }, active }`, `highlightRanges(text, targets) → [début, fin][]`. `queryTerms` et `relevance` disparaissent.
  - `donnees.js` : `prepare(data)` renvoie aussi `index` ; les champs `_title`, `_resume`, `_content`, `_meta`, `_hay` disparaissent.
  - `composants.js` : `highlight(text, targets)`, `card(entry, targets)`.
  - `vues/entrees.js` : `filtered() → { found, targets, list }` (`found` : `Map` entrée → score, ou `null`), `sortEntries(list, found)`.
  - `app.js` : `state.index`.
  - `tests/navigateur/donnees-test.mjs` : `jeuVolumineux(nombre = 3000) → data`.

- [ ] **Step 1: Test — Modifier `tests/js/donnees.test.mjs`**

3 remplacements, dans l'ordre (chaque bloc à remplacer est unique dans le fichier).

1. Remplacer :

```js
import assert from 'node:assert/strict';
import { loadData, prepare, DataError, NO_PROJECT } from '../../docs/js/donnees.js';

function reponse(corps, { status = 200, type = 'application/json' } = {}) {
```

par :

```js
import assert from 'node:assert/strict';
import { loadData, prepare, DataError, NO_PROJECT } from '../../docs/js/donnees.js';
import { search } from '../../docs/js/recherche.js';

function reponse(corps, { status = 200, type = 'application/json' } = {}) {
```

2. Remplacer :

```js
  const [a, b] = model.entries;
  assert.equal(a._short, 'abcdef123456');
  assert.equal(a._title, 'le coeur');
  assert.equal(a._projectName, 'Alpha');
  assert.deepEqual([a._online, a._invalid, a._local], [1, 1, 1]);
```

par :

```js
  const [a, b] = model.entries;
  assert.equal(a._short, 'abcdef123456');
  assert.equal(a._projectName, 'Alpha');
  assert.deepEqual([a._online, a._invalid, a._local], [1, 1, 1]);
```

3. Remplacer :

```js
  assert.deepEqual(model.typeOrder, ['note', 'zeta']);
  assert.equal(model.projects.get('alpha').nom, 'Alpha');
});
```

par :

```js
  assert.deepEqual(model.typeOrder, ['note', 'zeta']);
  assert.equal(model.projects.get('alpha').nom, 'Alpha');
  assert.deepEqual(search(model.index, 'coeur alpha').hits.map((h) => h.doc), [0]);
});
```


- [ ] **Step 2: Test — Créer `tests/js/performance.test.mjs`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepare } from '../../docs/js/donnees.js';
import { search } from '../../docs/js/recherche.js';
import { jeuVolumineux } from '../navigateur/donnees-test.mjs';

test('recherche : 3 000 entrées, moins de 50 ms par frappe', () => {
  const debut = performance.now();
  const model = prepare(jeuVolumineux(3000));
  const construction = performance.now() - debut;
  assert.ok(construction < 3000, `préparation et index : ${construction.toFixed(0)} ms`);
  // Échauffement non mesuré (moteur JavaScript encore froid), avec d'autres
  // mots que la requête mesurée : le cache de l'index ne lui sert pas.
  const echauffement = 'developpemnt serveurs "mise en ligne" -brouillon proj';
  for (let i = 1; i <= echauffement.length; i++) search(model.index, echauffement.slice(0, i));
  const requete = 'architecure reseaux "tour de" -erreur donj';
  let pire = 0;
  for (let i = 1; i <= requete.length; i++) {
    const t0 = performance.now();
    search(model.index, requete.slice(0, i));
    pire = Math.max(pire, performance.now() - t0);
  }
  assert.ok(pire < 50, `frappe la plus lente : ${pire.toFixed(1)} ms`);
});
```

- [ ] **Step 3: Test — Créer `tests/js/recherche.test.mjs`**

```js
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
```

- [ ] **Step 4: Test — Modifier `tests/navigateur/donnees-test.mjs`**

Remplacer :

```js
}

/* Retrouve une entrée du jeu de test par le début de son titre. */
export function entreeTitree(donnees, debut) {
```

par :

```js
}

/* Générateur pseudo-aléatoire déterministe (mulberry32). */
function hasard(graine) {
  let a = graine >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MOTS_REELS = ['architecture', 'donjon', 'mémoire', 'réseau', 'réseaux', 'modèle', 'jeu', 'jeux', 'site',
  'dépôt', 'export', 'recherche', 'session', 'contrôle', 'tour', 'carte', 'projet', 'jalon', 'décision', 'erreur',
  'animal', 'animaux', 'vocal', 'local', 'synthèse', 'génération', 'interface', 'serveur', 'données', 'tableau',
  'sécurité', 'intelligence', 'artificielle', 'graphique', 'cube', 'rivière', 'monstre', 'salle', 'trésor'];
const SYLLABES = ['ba', 'ce', 'di', 'fo', 'gu', 'la', 'me', 'ni', 'po', 'ru', 'sa', 'te', 'vi', 'zo', 'cha',
  'pre', 'tra', 'gne', 'lou', 'ran', 'vin', 'mon', 'deur', 'lette', 'sion', 'qui', 'bro', 'fla', 'gri', 'sté'];

/* Jeu volumineux pour la performance : `nombre` entrées d'une centaine de
   mots tirés d'un vocabulaire d'environ 20 000 mots (loi très inégale,
   comme un vrai texte), 40 projets répartis en 5 familles, des voisins. */
export function jeuVolumineux(nombre = 3000) {
  const alea = hasard(42);
  const lexique = new Set(MOTS_REELS);
  while (lexique.size < 20000) {
    const n = 2 + Math.floor(alea() * 3);
    let mot = '';
    for (let i = 0; i < n; i++) mot += SYLLABES[Math.floor(alea() * SYLLABES.length)];
    lexique.add(mot);
  }
  const mots = Array.from(lexique);
  const tirer = () => mots[Math.floor(mots.length * alea() ** 3)];
  const phrase = (n) => Array.from({ length: n }, tirer).join(' ');
  const familles = ['jeux', 'cours', 'ia', 'outils', 'sites'].map((id, i) => ({ id, nom: 'Famille ' + id, couleur: i + 1 }));
  const projets = {};
  for (let p = 0; p < 40; p++) projets['projet-' + p] = { nom: 'Projet ' + p, famille: familles[p % 5].id, description: phrase(20) };
  const types = ['note', 'milestone', 'decision', 'reference', 'architecture', 'error'];
  const ids = Array.from({ length: nombre }, (_, n) => identifiant(n + 1000));
  const entrees = ids.map((id, n) => {
    const projet = 'projet-' + (n % 40);
    const voisins = [1, 2, 3].map((k) => ({ id: ids[(n + k * 37) % nombre], score: 0.8 + k / 100 }));
    return {
      id, titre: `Projet ${n % 40} — ${phrase(5)}`, resume: phrase(18), contenu: phrase(80 + Math.floor(alea() * 80)),
      type: types[n % types.length], tags: [projet, tirer()], projet,
      cree_le: isoAvant(n), modifie_le: isoAvant(n), liens: [], lien_principal: null, corrige: false, voisins,
    };
  });
  return assembler(entrees, { familles, projets });
}

/* Retrouve une entrée du jeu de test par le début de son titre. */
export function entreeTitree(donnees, debut) {
```


- [ ] **Step 5: Vérifier l'échec**

Run: `node --test "tests/js/*.test.mjs"`
Expected: FAIL — `SyntaxError: The requested module '../../docs/js/recherche.js' does not provide an export named 'buildIndex'` (recherche.test), `… 'search'` (donnees.test, performance.test).

- [ ] **Step 6: Modifier `docs/js/donnees.js`**

3 remplacements, dans l'ordre (chaque bloc à remplacer est unique dans le fichier).

1. Remplacer :

```js
/* Données : chargement de data.json (messages d'erreur clairs) et
   préparation du modèle affiché (champs dérivés, projets, ordre des types). */
import { normalize } from './recherche.js';
import { typeLabel, isWebUrl } from './composants.js';

```

par :

```js
/* Données : chargement de data.json (messages d'erreur clairs) et
   préparation du modèle affiché (champs dérivés, projets, ordre des types). */
import { normalize, buildIndex } from './recherche.js';
import { typeLabel, isWebUrl } from './composants.js';

```

2. Remplacer :

```js
    const project = entry.projet ? projects.get(entry.projet) : null;
    const projectName = project ? project.nom : (entry.projet || 'Sans projet');
    const meta = normalize([tags.join(' '), projectName, entry.projet, typeLabel(entry.type), entry.type].join(' '));
    const title = normalize(entry.titre);
    const resume = normalize(entry.resume);
    const content = normalize(entry.contenu);
    return Object.assign({}, entry, {
      tags,
      liens,
      _title: title,
      _resume: resume,
      _content: content,
      _meta: meta,
      _hay: [title, resume, content, meta, normalize(liens.map((l) => l.valeur).join(' '))].join('\n'),
      _tags: tags.map(normalize),
      _time: Date.parse(entry.cree_le) || 0,
```

par :

```js
    const project = entry.projet ? projects.get(entry.projet) : null;
    const projectName = project ? project.nom : (entry.projet || 'Sans projet');
    return Object.assign({}, entry, {
      tags,
      liens,
      _tags: tags.map(normalize),
      _time: Date.parse(entry.cree_le) || 0,
```

3. Remplacer :

```js
  const typeOrder = known.filter((t) => present.includes(t)).concat(present.filter((t) => !known.includes(t)).sort());

  return { data, entries, projects, typeOrder };
}
```

par :

```js
  const typeOrder = known.filter((t) => present.includes(t)).concat(present.filter((t) => !known.includes(t)).sort());

  // Index de recherche : titre ×6, projet/tags/type ×3, résumé ×2, texte ×1.
  const index = buildIndex(entries.map((e) => ({
    title: e.titre,
    meta: [e._projectName, e.projet, e.tags.join(' '), typeLabel(e.type), e.type].join(' '),
    resume: e.resume,
    content: e.contenu,
  })), data.synonymes);

  return { data, entries, projects, typeOrder, index };
}
```


- [ ] **Step 7: Réécrire `docs/js/recherche.js`**

Contenu complet du fichier :

```js
/* Recherche tolérante : normalisation, racinisation légère, fautes de frappe,
   synonymes, syntaxe (ET, "expression", -exclusion, préfixe du dernier terme),
   score et surlignage. Module pur (aucun accès au DOM) : testé sous Node. */

const WEIGHTS = { title: 6, meta: 3, resume: 2, content: 1 };
const FIELDS = Object.keys(WEIGHTS);
const CONTENT_CAP = 5;      // plafond des points du texte intégral par terme
const QUALITY = { exact: 1, synonym: 0.9, prefix: 0.7, fuzzy1: 0.6, fuzzy2: 0.4 };
const CACHE_LIMIT = 500;

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

/* Termes de la requête : { words, quoted, exclude, prefix }. Les guillemets
   typographiques valent des guillemets droits ; un guillemet non fermé vaut
   jusqu'à la fin. Seul le dernier terme (frappe en cours) accepte les préfixes. */
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
      const words = tokenize(raw);
      if (words.length) terms.push({ words, quoted: false, exclude, closed: true, prefix: false });
    } else {
      const words = tokenize(match[2]);
      if (words.length) terms.push({ words, quoted: true, exclude: match[1] === '-', closed: match[3] === '"', prefix: false });
    }
  }
  const last = terms[terms.length - 1];
  if (last && !last.exclude && !(last.quoted && last.closed)) last.prefix = true;
  return terms.map(({ closed, ...term }) => term);
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
  return { docs, postings, words: Array.from(postings.keys()).sort(), groups, groupOf, cache: new Map() };
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
function wordCandidates(index, word, prefix) {
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
  if (word.length >= 5) {
    const max = word.length >= 8 ? 2 : 1;
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
function candidatesOf(index, term) {
  const key = JSON.stringify(term);
  if (index.cache.has(key)) return index.cache.get(key);
  let found = new Map();
  const phrases = [];
  if (term.quoted) {
    phrases.push({ tokens: term.words, stemmed: false, prefix: term.prefix, quality: QUALITY.exact });
  } else if (term.words.length === 1) {
    const candidates = wordCandidates(index, term.words[0], term.prefix);
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
  const terms = parseQuery(query);
  const positives = terms.filter((t) => !t.exclude).map((t) => candidatesOf(index, t));
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
```

- [ ] **Step 8: Modifier `docs/js/composants.js`**

3 remplacements, dans l'ordre (chaque bloc à remplacer est unique dans le fichier).

1. Remplacer :

```js
}

/* Surligne sans innerHTML : les plages viennent de recherche.js. */
export function highlight(text, terms) {
  const fragment = document.createDocumentFragment();
  text = String(text || '');
  const ranges = highlightRanges(text, terms);
  let cursor = 0;
  for (const [start, end] of ranges) {
```

par :

```js
}

/* Surligne sans innerHTML : les plages viennent de recherche.js
   (targets : cibles renvoyées par search, ou null). */
export function highlight(text, targets) {
  const fragment = document.createDocumentFragment();
  text = String(text || '');
  const ranges = highlightRanges(text, targets);
  let cursor = 0;
  for (const [start, end] of ranges) {
```

2. Remplacer :

```js
}

export function card(entry, terms) {
  const tagsShown = entry.tags.slice(0, 5);
  const extraTags = entry.tags.length - tagsShown.length;
  return el('article', { class: 'card' },
    el('div', { class: 'badges' }, typeBadge(entry.type), entry.projet ? projectButton(entry) : null),
    el('h3', null, el('a', { href: entryHash(entry) }, highlight(entry.titre, terms))),
    entry.resume ? el('p', { class: 'resume' }, highlight(entry.resume, terms)) : null,
    el('div', { class: 'meta-line' },
      el('time', { datetime: entry.cree_le }, formatDay(entry.cree_le)),
```

par :

```js
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
```

3. Remplacer :

```js
    tagsShown.length ? el('ul', { class: 'tags', 'aria-label': 'Tags' },
      tagsShown.map((tag) => el('li', null,
        el('button', { type: 'button', class: 'tag', 'data-action': 'tag', 'data-tag': tag }, highlight(tag, terms)))),
      extraTags > 0 ? el('li', { class: 'tag-more' }, '+' + extraTags) : null) : null,
    el('div', { class: 'actions' },
```

par :

```js
    tagsShown.length ? el('ul', { class: 'tags', 'aria-label': 'Tags' },
      tagsShown.map((tag) => el('li', null,
        el('button', { type: 'button', class: 'tag', 'data-action': 'tag', 'data-tag': tag }, highlight(tag, targets)))),
      extraTags > 0 ? el('li', { class: 'tag-more' }, '+' + extraTags) : null) : null,
    el('div', { class: 'actions' },
```


- [ ] **Step 9: Modifier `docs/js/vues/entrees.js`**

13 remplacements, dans l'ordre (chaque bloc à remplacer est unique dans le fichier).

1. Remplacer :

```js
/* Vue liste : filtres (recherche, type, projet, tag), tri, grille ou
   regroupement par projet, « Afficher plus ». */
import { normalize, queryTerms, relevance } from '../recherche.js';
import { listHash } from '../routes.js';
import { el, plural, typeLabel, typeCount, formatDay, card, chip } from '../composants.js';
```

par :

```js
/* Vue liste : filtres (recherche, type, projet, tag), tri, grille ou
   regroupement par projet, « Afficher plus ». */
import { normalize, search } from '../recherche.js';
import { listHash } from '../routes.js';
import { el, plural, typeLabel, typeCount, formatDay, card, chip } from '../composants.js';
```

2. Remplacer :

```js
  }

  function matches(entry, terms, except) {
    const f = state.filters;
    if (except !== 'type' && f.type && entry.type !== f.type) return false;
    if (except !== 'projet' && f.projet && entry._project !== f.projet) return false;
    if (f.tag && !entry._tags.includes(normalize(f.tag))) return false;
    for (const term of terms) if (!entry._hay.includes(term)) return false;
    return true;
  }

```

par :

```js
  }

  /* found : Map entrée → score de la recherche, ou null sans recherche. */
  function matches(entry, found, except) {
    const f = state.filters;
    if (except !== 'type' && f.type && entry.type !== f.type) return false;
    if (except !== 'projet' && f.projet && entry._project !== f.projet) return false;
    if (f.tag && !entry._tags.includes(normalize(f.tag))) return false;
    return !found || found.has(entry);
  }

  function searched() {
    if (!state.filters.q) return { found: null, targets: null };
    const result = search(state.index, state.filters.q);
    return {
      found: new Map(result.hits.map((hit) => [state.entries[hit.doc], hit.score])),
      targets: result.targets,
    };
  }

```

3. Remplacer :

```js
  }

  function sortEntries(list, terms) {
    const byRecent = (a, b) => b._time - a._time || (a.id < b.id ? -1 : 1);
    switch (effectiveSort()) {
      case 'ancien':
        return list.sort((a, b) => -byRecent(a, b));
      case 'pertinence': {
        const scores = new Map(list.map((e) => [e, relevance(e, terms)]));
        return list.sort((a, b) => scores.get(b) - scores.get(a) || byRecent(a, b));
      }
      case 'projet':
        return list.sort((a, b) =>
```

par :

```js
  }

  function sortEntries(list, found) {
    const byRecent = (a, b) => b._time - a._time || (a.id < b.id ? -1 : 1);
    switch (effectiveSort()) {
      case 'ancien':
        return list.sort((a, b) => -byRecent(a, b));
      case 'pertinence':
        // found vaut null quand la fiche trie toutes les entrées (entrée hors de la liste affichée).
        return list.sort((a, b) => (found ? (found.get(b) || 0) - (found.get(a) || 0) : 0) || byRecent(a, b));
      case 'projet':
        return list.sort((a, b) =>
```

4. Remplacer :

```js

  function filtered() {
    const terms = queryTerms(state.filters.q);
    return { terms, list: sortEntries(state.entries.filter((e) => matches(e, terms)), terms) };
  }

```

par :

```js

  function filtered() {
    const { found, targets } = searched();
    return { found, targets, list: sortEntries(state.entries.filter((e) => matches(e, found)), found) };
  }

```

5. Remplacer :

```js
  function renderList() {
    const f = state.filters;
    const { terms, list } = filtered();
    state.lastList = list;

```

par :

```js
  function renderList() {
    const f = state.filters;
    const { found, targets, list } = filtered();
    state.lastList = list;

```

6. Remplacer :

```js
    }

    renderTypeChips(terms);
    renderProjectChips(terms);
    renderActiveFilters();

```

par :

```js
    }

    renderTypeChips(found);
    renderProjectChips(found);
    renderActiveFilters();

```

7. Remplacer :

```js
      dom.grid.hidden = true;
      dom.groups.hidden = false;
      renderGroups(list, terms);
    } else {
      dom.groups.hidden = true;
      dom.grid.hidden = false;
      const fragment = document.createDocumentFragment();
      for (const entry of list.slice(0, state.shown)) fragment.append(card(entry, terms));
      dom.grid.append(fragment);
      const remaining = list.length - state.shown;
```

par :

```js
      dom.grid.hidden = true;
      dom.groups.hidden = false;
      renderGroups(list, targets);
    } else {
      dom.groups.hidden = true;
      dom.grid.hidden = false;
      const fragment = document.createDocumentFragment();
      for (const entry of list.slice(0, state.shown)) fragment.append(card(entry, targets));
      dom.grid.append(fragment);
      const remaining = list.length - state.shown;
```

8. Remplacer :

```js
  }

  function renderTypeChips(terms) {
    const pool = state.entries.filter((e) => matches(e, terms, 'type'));
    const counts = new Map();
    for (const entry of pool) counts.set(entry.type, (counts.get(entry.type) || 0) + 1);
```

par :

```js
  }

  function renderTypeChips(found) {
    const pool = state.entries.filter((e) => matches(e, found, 'type'));
    const counts = new Map();
    for (const entry of pool) counts.set(entry.type, (counts.get(entry.type) || 0) + 1);
```

9. Remplacer :

```js
  }

  function renderProjectChips(terms) {
    const pool = state.entries.filter((e) => matches(e, terms, 'projet'));
    const counts = new Map();
    for (const entry of pool) counts.set(entry._project, (counts.get(entry._project) || 0) + 1);
```

par :

```js
  }

  function renderProjectChips(found) {
    const pool = state.entries.filter((e) => matches(e, found, 'projet'));
    const counts = new Map();
    for (const entry of pool) counts.set(entry._project, (counts.get(entry._project) || 0) + 1);
```

10. Remplacer :

```js
      chips.push(chip('+ ' + hidden + ' autres', null, false, () => {
        state.showAllProjects = true;
        renderProjectChips(queryTerms(state.filters.q));
        // Le focus va sur le premier projet qui vient d'apparaître.
        const first = dom.projectChips.querySelectorAll('.chip')[visible.length + 1];
```

par :

```js
      chips.push(chip('+ ' + hidden + ' autres', null, false, () => {
        state.showAllProjects = true;
        renderProjectChips(searched().found);
        // Le focus va sur le premier projet qui vient d'apparaître.
        const first = dom.projectChips.querySelectorAll('.chip')[visible.length + 1];
```

11. Remplacer :

```js
      chips.push(chip('Réduire', null, false, () => {
        state.showAllProjects = false;
        renderProjectChips(queryTerms(state.filters.q));
        const more = dom.projectChips.querySelector('[data-focus-key="projets:plus"]');
        if (more) more.focus();
```

par :

```js
      chips.push(chip('Réduire', null, false, () => {
        state.showAllProjects = false;
        renderProjectChips(searched().found);
        const more = dom.projectChips.querySelector('[data-focus-key="projets:plus"]');
        if (more) more.focus();
```

12. Remplacer :

```js
  }

  function renderGroups(list, terms) {
    const groups = new Map();
    for (const entry of list) {
```

par :

```js
  }

  function renderGroups(list, targets) {
    const groups = new Map();
    for (const entry of list) {
```

13. Remplacer :

```js

      const shown = single ? members : members.slice(0, config.groupPreview);
      const grid = el('div', { class: 'grid' }, shown.map((entry) => card(entry, terms)));
      const section = el('section', { class: 'group', 'aria-label': name }, head, grid);
      if (members.length > shown.length) {
```

par :

```js

      const shown = single ? members : members.slice(0, config.groupPreview);
      const grid = el('div', { class: 'grid' }, shown.map((entry) => card(entry, targets)));
      const section = el('section', { class: 'group', 'aria-label': name }, head, grid);
      if (members.length > shown.length) {
```


- [ ] **Step 10: Modifier `docs/js/vues/fiche.js`**

Remplacer :

```js
    document.title = entry.titre + ' — Mémoire Vive';
    state.openedId = entry._short;
    const sequence = state.lastList.includes(entry) ? state.lastList : ctx.list.sortEntries(state.entries.slice(), []);
    const position = sequence.indexOf(entry);
    const previous = position > 0 ? sequence[position - 1] : null;
```

par :

```js
    document.title = entry.titre + ' — Mémoire Vive';
    state.openedId = entry._short;
    const sequence = state.lastList.includes(entry) ? state.lastList : ctx.list.sortEntries(state.entries.slice(), null);
    const position = sequence.indexOf(entry);
    const previous = position > 0 ? sequence[position - 1] : null;
```


- [ ] **Step 11: Modifier `docs/js/app.js`**

2 remplacements, dans l'ordre (chaque bloc à remplacer est unique dans le fichier).

1. Remplacer :

```js
  projects: new Map(),
  typeOrder: [],
  filters: { q: '', type: '', projet: '', tag: '', tri: '', vue: 'grille' },
  shown: CONFIG.pageSize,
```

par :

```js
  projects: new Map(),
  typeOrder: [],
  index: null,           // index de recherche (recherche.js)
  filters: { q: '', type: '', projet: '', tag: '', tri: '', vue: 'grille' },
  shown: CONFIG.pageSize,
```

2. Remplacer :

```js
  state.projects = model.projects;
  state.typeOrder = model.typeOrder;
  renderStats();
  dom.status.hidden = true;
```

par :

```js
  state.projects = model.projects;
  state.typeOrder = model.typeOrder;
  state.index = model.index;
  renderStats();
  dom.status.hidden = true;
```


- [ ] **Step 12: Vérifier le succès**

Run: `node --test "tests/js/*.test.mjs"`
Expected: PASS — 16 tests (dont « 3 000 entrées, moins de 50 ms par frappe », pire frappe mesurée vers 20 ms).

Run: `cd tests/navigateur; npm test`
Expected: PASS — 40 tests (la liste utilise la nouvelle recherche, sans changement visible).

- [ ] **Step 13: Commit**

```bash
git add docs/js/app.js docs/js/composants.js docs/js/donnees.js docs/js/recherche.js docs/js/vues/entrees.js docs/js/vues/fiche.js tests/js/donnees.test.mjs tests/js/performance.test.mjs tests/js/recherche.test.mjs tests/navigateur/donnees-test.mjs
git commit -m "Site : recherche tolérante (pluriels, fautes, synonymes, expressions, exclusions)

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Routes, anciennes ancres et frappe vers #/recherche

`routes.js` prend sa forme définitive (spec § 4.2) et le routeur de `app.js` l'utilise. En attendant leurs vues, `#/` affiche la liste (jusqu'à la Task 9) et `#/recherche?q=…` la liste filtrée par la recherche (jusqu'à la Task 11) ; `#/projet/<id>` affiche provisoirement la liste filtrée sur ce projet (jusqu'à la Task 8) — ces correspondances sont regroupées dans `listFilters(route)`. Taper dans la recherche pousse `#/recherche?q=…` une fois puis remplace l'entrée d'historique ; Échap revient d'où l'on vient. Les tests navigateur passent aux nouvelles ancres (`#/entrees`, `#/recherche?q=`).

**Files:**

- Modify: `docs/js/app.js`, `docs/js/routes.js`, `docs/js/vues/entrees.js`
- Test: `tests/js/routes.test.mjs` (créé), `tests/navigateur/fiche.test.mjs` (modifié), `tests/navigateur/interface.test.mjs` (modifié), `tests/navigateur/liste.test.mjs` (modifié), `tests/navigateur/navigation.test.mjs` (créé), `tests/navigateur/robustesse.test.mjs` (modifié)

**Interfaces:**

- Consumes: `createListView(ctx)`, `search` (Task 4).
- Produces:
  - `routes.js` : `SORTS = ['recent', 'ancien', 'projet']`, `VIEWS = ['grille', 'projets']` (devient `['grille', 'liste']` en Task 10), `defaultFilters() → { type, projet, famille, tag, tri, vue }`, `filtersFromParams(params)`, `entriesHash(filters)`, `searchHash(q)`, `projectHash(id)`, `entryHash(entry)`, `parseHash(hash) → { view: 'home' } | { view: 'entries', filters } | { view: 'search', q } | { view: 'project', id } | { view: 'entry', id } | { view: 'redirect', hash }`. `listHash`, `parseRoute`, `sameFilters` quittent `routes.js`.
  - `vues/entrees.js` : `listHash(filters)` (recherche → `#/recherche`, sinon `#/entrees` ; retiré en Task 11).
  - `app.js` : `typeSearch(q)` (lève `state.typing` pendant son `route()` : la vue quittée en tapant, même une fiche, n'est pas un « retour » et ne prend pas le focus), `leaveSearch()`, `listFilters(route)` (provisoire), `sameFilters(a, b)`.

- [ ] **Step 1: Test — Créer `tests/js/routes.test.mjs`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseHash, entriesHash, searchHash, projectHash, entryHash, defaultFilters, filtersFromParams,
} from '../../docs/js/routes.js';

test('accueil : ancre vide, « # » ou « #/ »', () => {
  for (const hash of ['', '#', '#/']) assert.deepEqual(parseHash(hash), { view: 'home' });
});

test('toutes les entrées : filtres lus et validés', () => {
  assert.deepEqual(parseHash('#/entrees'), { view: 'entries', filters: defaultFilters() });
  assert.deepEqual(parseHash('#/entrees?type=note&projet=jarvis&famille=ia&tag=bug&tri=ancien&vue=projets').filters,
    { type: 'note', projet: 'jarvis', famille: 'ia', tag: 'bug', tri: 'ancien', vue: 'projets' });
  assert.deepEqual(parseHash('#/entrees?tri=pertinence&vue=mosaique').filters, defaultFilters());
});

test('recherche, projet, fiche', () => {
  assert.deepEqual(parseHash('#/recherche?q=tour+de%20contr%C3%B4le'), { view: 'search', q: 'tour de contrôle' });
  assert.deepEqual(parseHash('#/recherche'), { view: 'search', q: '' });
  assert.deepEqual(parseHash('#/projet/memoire-vive'), { view: 'project', id: 'memoire-vive' });
  assert.deepEqual(parseHash('#/projet/a%20b'), { view: 'project', id: 'a b' });
  assert.deepEqual(parseHash('#/entree/ABCDEF123456'), { view: 'entry', id: 'abcdef123456' });
});

test('anciennes ancres : redirection vers leur équivalent', () => {
  assert.deepEqual(parseHash('#/?q=jarvis&type=milestone'), { view: 'redirect', hash: '#/recherche?q=jarvis' });
  assert.deepEqual(parseHash('#/?type=milestone&tri=ancien&vue=projets'),
    { view: 'redirect', hash: '#/entrees?type=milestone&tri=ancien&vue=projets' });
  assert.deepEqual(parseHash('#/?q=%20%20&tri=pertinence'), { view: 'redirect', hash: '#/entrees' });
  assert.deepEqual(parseHash('#?projet=jarvis'), { view: 'redirect', hash: '#/entrees?projet=jarvis' });
});

test('ancres inconnues ou mal formées : retour à l’accueil', () => {
  for (const hash of ['#/inconnu', '#/entree/xyz', '#/projet/%E0%A4%A', '#/projet/']) {
    assert.deepEqual(parseHash(hash), { view: 'redirect', hash: '#/' }, hash);
  }
});

test('construction des ancres : aller-retour', () => {
  const filters = { ...defaultFilters(), type: 'note', famille: 'ia', tri: 'projet' };
  assert.equal(entriesHash(filters), '#/entrees?type=note&famille=ia&tri=projet');
  assert.deepEqual(parseHash(entriesHash(filters)).filters, filters);
  assert.equal(entriesHash(defaultFilters()), '#/entrees');
  assert.equal(searchHash('l’atelier & co'), '#/recherche?q=l%E2%80%99atelier+%26+co');
  assert.equal(parseHash(searchHash('l’atelier & co')).q, 'l’atelier & co');
  assert.equal(searchHash(''), '#/recherche');
  assert.equal(projectHash('a/b'), '#/projet/a%2Fb');
  assert.equal(parseHash(projectHash('a/b')).id, 'a/b');
  assert.equal(entryHash({ _short: 'abcdef123456' }), '#/entree/abcdef123456');
  assert.deepEqual(filtersFromParams(new URLSearchParams('vue=grille')), defaultFilters());
});
```

- [ ] **Step 2: Test — Modifier `tests/navigateur/fiche.test.mjs`**

7 remplacements, dans l'ordre (chaque bloc à remplacer est unique dans le fichier).

1. Remplacer :

```js

test('ouvrir une fiche depuis la liste : titre, URL courte, focus sur le titre', async () => {
  const page = await ouvrir('#/?q=jarvis', CARTES);
  await page.getByRole('link', { name: 'Jarvis — architecture', exact: true }).click();
  await page.locator('#entry-view:not([hidden]) #entry-title').waitFor();
```

par :

```js

test('ouvrir une fiche depuis la liste : titre, URL courte, focus sur le titre', async () => {
  const page = await ouvrir('#/recherche?q=jarvis', CARTES);
  await page.getByRole('link', { name: 'Jarvis — architecture', exact: true }).click();
  await page.locator('#entry-view:not([hidden]) #entry-title').waitFor();
```

2. Remplacer :

```js

test('fiche du milieu : « Précédente » active, flèche droite vers la suivante', async () => {
  const page = await ouvrir('#/', CARTES);
  await page.locator(CARTES).nth(1).click();
  await page.locator('#entry-title').waitFor();
```

par :

```js

test('fiche du milieu : « Précédente » active, flèche droite vers la suivante', async () => {
  const page = await ouvrir('#/entrees', CARTES);
  await page.locator(CARTES).nth(1).click();
  await page.locator('#entry-title').waitFor();
```

3. Remplacer :

```js
});

test('« Retour à la liste » : filtres conservés', async () => {
  const page = await ouvrir('#/?q=jarvis&type=milestone', CARTES);
  await page.locator(CARTES).first().click();
  await page.locator('#entry-title').waitFor();
  await page.getByRole('link', { name: '← Retour à la liste' }).click();
  await page.locator(CARTES).first().waitFor();
  assert.ok(page.url().includes('q=jarvis'), page.url());
  assert.equal(await page.inputValue('#search-input'), 'jarvis');
  await terminer(page);
```

par :

```js
});

test('« Retour à la liste » : filtres et recherche conservés', async () => {
  const page = await ouvrir('#/entrees?type=milestone', CARTES);
  await page.locator(CARTES).first().click();
  await page.locator('#entry-title').waitFor();
  await page.getByRole('link', { name: '← Retour à la liste' }).click();
  await page.locator(CARTES).first().waitFor();
  assert.ok(page.url().endsWith('#/entrees?type=milestone'), page.url());
  await page.goto(site.url('#/recherche?q=jarvis'));
  await page.locator(CARTES).first().click();
  await page.locator('#entry-title').waitFor();
  await page.getByRole('link', { name: '← Retour à la liste' }).click();
  await page.locator(CARTES).first().waitFor();
  assert.ok(page.url().endsWith('#/recherche?q=jarvis'), page.url());
  assert.equal(await page.inputValue('#search-input'), 'jarvis');
  await terminer(page);
```

4. Remplacer :

```js

test('retour de fiche : le focus revient sur sa carte', async () => {
  const page = await ouvrir('#/', CARTES);
  const href = await page.locator(CARTES).nth(4).getAttribute('href');
  await page.locator(CARTES).nth(4).click();
```

par :

```js

test('retour de fiche : le focus revient sur sa carte', async () => {
  const page = await ouvrir('#/entrees', CARTES);
  const href = await page.locator(CARTES).nth(4).getAttribute('href');
  await page.locator(CARTES).nth(4).click();
```

5. Remplacer :

```js

test('Suivante ×2 puis « précédent » du navigateur : retour à la liste', async () => {
  const page = await ouvrir('#/?type=note', CARTES);
  await page.locator(CARTES).nth(2).click();
  await page.locator('#entry-title').waitFor();
```

par :

```js

test('Suivante ×2 puis « précédent » du navigateur : retour à la liste', async () => {
  const page = await ouvrir('#/entrees?type=note', CARTES);
  await page.locator(CARTES).nth(2).click();
  await page.locator('#entry-title').waitFor();
```

6. Remplacer :

```js

test('fiche rechargée puis « Retour » : filtres d’origine', async () => {
  const page = await ouvrir('#/?type=note', CARTES);
  await page.locator(CARTES).nth(1).click();
  await page.locator('#entry-title').waitFor();
```

par :

```js

test('fiche rechargée puis « Retour » : filtres d’origine', async () => {
  const page = await ouvrir('#/entrees?type=note', CARTES);
  await page.locator(CARTES).nth(1).click();
  await page.locator('#entry-title').waitFor();
```

7. Remplacer :

```js

test('Maj+Flèche : reste sur la fiche', async () => {
  const page = await ouvrir('#/', CARTES);
  await page.locator(CARTES).nth(1).click();
  await page.locator('#entry-title').waitFor();
```

par :

```js

test('Maj+Flèche : reste sur la fiche', async () => {
  const page = await ouvrir('#/entrees', CARTES);
  await page.locator(CARTES).nth(1).click();
  await page.locator('#entry-title').waitFor();
```


- [ ] **Step 3: Test — Modifier `tests/navigateur/interface.test.mjs`**

4 remplacements, dans l'ordre (chaque bloc à remplacer est unique dans le fichier).

1. Remplacer :

```js
const donnees = jeuDeTest();

async function ouvrir(ancre = '#/', options = {}) {
  const page = await site.page({ donnees, ...options });
  await page.goto(site.url(ancre));
```

par :

```js
const donnees = jeuDeTest();

async function ouvrir(ancre = '#/entrees', options = {}) {
  const page = await site.page({ donnees, ...options });
  await page.goto(site.url(ancre));
```

2. Remplacer :

```js

test('lien d’évitement : filtres conservés', async () => {
  const page = await ouvrir('#/?q=jarvis');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
```

par :

```js

test('lien d’évitement : filtres conservés', async () => {
  const page = await ouvrir('#/recherche?q=jarvis');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
```

3. Remplacer :

```js

test('focus conservé sur la pastille après un filtre ; clic sur un tag : focus sur le compteur', async () => {
  const page = await ouvrir('#/?q=jarvis');
  await page.locator('#type-chips .chip').nth(1).focus();
  await page.keyboard.press('Enter');
```

par :

```js

test('focus conservé sur la pastille après un filtre ; clic sur un tag : focus sur le compteur', async () => {
  const page = await ouvrir('#/entrees');
  await page.locator('#type-chips .chip').nth(1).focus();
  await page.keyboard.press('Enter');
```

4. Remplacer :

```js
test('mobile : pas de défilement horizontal (liste, fiche, vue par projet)', async () => {
  const archi = entreeTitree(donnees, 'Jarvis — architecture');
  const page = await ouvrir('#/', { mobile: true });
  assert.ok(await debordement(page) <= 0, 'liste');
  await page.goto(site.url('#/entree/' + archi.id.slice(0, 12)));
  await page.locator('#entry-title').waitFor();
  assert.ok(await debordement(page) <= 0, 'fiche');
  await page.goto(site.url('#/?vue=projets'));
  await page.locator('.group').first().waitFor();
  assert.ok(await debordement(page) <= 0, 'vue par projet');
```

par :

```js
test('mobile : pas de défilement horizontal (liste, fiche, vue par projet)', async () => {
  const archi = entreeTitree(donnees, 'Jarvis — architecture');
  const page = await ouvrir('#/entrees', { mobile: true });
  assert.ok(await debordement(page) <= 0, 'liste');
  await page.goto(site.url('#/entree/' + archi.id.slice(0, 12)));
  await page.locator('#entry-title').waitFor();
  assert.ok(await debordement(page) <= 0, 'fiche');
  await page.goto(site.url('#/entrees?vue=projets'));
  await page.locator('.group').first().waitFor();
  assert.ok(await debordement(page) <= 0, 'vue par projet');
```


- [ ] **Step 4: Test — Modifier `tests/navigateur/liste.test.mjs`**

Remplacer :

```js
const donnees = jeuDeTest();

async function liste(ancre = '#/') {
  const page = await site.page({ donnees });
  await page.goto(site.url(ancre));
```

par :

```js
const donnees = jeuDeTest();

async function liste(ancre = '#/entrees') {
  const page = await site.page({ donnees });
  await page.goto(site.url(ancre));
```


- [ ] **Step 5: Test — Créer `tests/navigateur/navigation.test.mjs`**

```js
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { ouvrirSite, terminer, attendreAncre } from './outils.mjs';
import { jeuDeTest } from './donnees-test.mjs';

let site;
before(async () => { site = await ouvrirSite(); });
after(async () => { await site.fermer(); });

const donnees = jeuDeTest();

async function ouvrir(ancre) {
  const page = await site.page({ donnees });
  await page.goto(site.url(ancre));
  await page.locator('#grid .card').first().waitFor();
  return page;
}

test('ancienne ancre avec recherche : redirigée vers #/recherche', async () => {
  const page = await ouvrir('#/?q=jarvis&type=milestone');
  await attendreAncre(page, '#/recherche');
  assert.ok(page.url().endsWith('#/recherche?q=jarvis'), page.url());
  assert.equal(await page.inputValue('#search-input'), 'jarvis');
  await terminer(page);
});

test('ancienne ancre de filtres : redirigée vers #/entrees, filtres gardés', async () => {
  const page = await ouvrir('#/?type=milestone&tri=ancien');
  assert.ok(page.url().endsWith('#/entrees?type=milestone&tri=ancien'), page.url());
  const badges = await page.locator('#grid .type-badge').allTextContents();
  assert.ok(badges.length > 0 && badges.every((b) => b === 'Jalon'), badges.join(', '));
  await terminer(page);
});

test('redirection sans nouvelle entrée d’historique ; ancre inconnue : accueil', async () => {
  const page = await ouvrir('#/entrees');
  await page.evaluate(() => { location.hash = '#/?type=note'; });
  await attendreAncre(page, '#/entrees?type=note');
  await page.goBack();
  await page.waitForFunction(() => location.hash === '#/entrees');
  await page.goto(site.url('#/nimporte-quoi'));
  await page.waitForFunction(() => location.hash === '#/');
  await terminer(page);
});

test('frappe : ouvre #/recherche une seule fois, puis remplace ; « précédent » revient d’où l’on vient', async () => {
  const page = await ouvrir('#/entrees?type=note');
  // 180 ms entre deux touches (délai de 120 ms) : chaque touche lance sa
  // recherche ; seule la première crée une entrée d'historique.
  await page.locator('#search-input').pressSequentially('jarvis', { delay: 180 });
  await attendreAncre(page, 'q=jarvis');
  await page.goBack();
  await page.waitForFunction(() => location.hash === '#/entrees?type=note');
  await page.locator('#grid .card').first().waitFor();
  assert.equal(await page.inputValue('#search-input'), '');
  await terminer(page);
});

test('Échap dans la recherche : retour à la vue de départ', async () => {
  const page = await ouvrir('#/entrees?type=note');
  await page.locator('#search-input').pressSequentially('jar', { delay: 60 });
  await attendreAncre(page, 'q=jar');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => location.hash === '#/entrees?type=note');
  assert.equal(await page.inputValue('#search-input'), '');
  await terminer(page);
});
```

- [ ] **Step 6: Test — Modifier `tests/navigateur/robustesse.test.mjs`**

2 remplacements, dans l'ordre (chaque bloc à remplacer est unique dans le fichier).

1. Remplacer :

```js
test('données piégées (XSS) : aucune balise injectée, aucun lien javascript: ou data:', async () => {
  const page = await site.page({ donnees: donneesPiegees() });
  for (const [ancre, attendu] of [['#/', '#grid .card'], ['#/entree/abcdef123456', '#entry-title']]) {
    await page.goto(site.url(ancre));
    await page.locator(attendu).first().waitFor();
```

par :

```js
test('données piégées (XSS) : aucune balise injectée, aucun lien javascript: ou data:', async () => {
  const page = await site.page({ donnees: donneesPiegees() });
  for (const [ancre, attendu] of [['#/entrees', '#grid .card'], ['#/entree/abcdef123456', '#entry-title']]) {
    await page.goto(site.url(ancre));
    await page.locator(attendu).first().waitFor();
```

2. Remplacer :

```js
test('« coeur » trouve « cœur » (surligné) ; l’apostrophe droite trouve l’apostrophe typographique', async () => {
  const page = await site.page({ donnees: jeuDeTest() });
  await page.goto(site.url('#/?q=coeur'));
  await page.locator('#grid .card').first().waitFor();
  assert.equal(await page.locator('#grid mark').first().textContent(), 'cœur');
  await page.goto(site.url('#/?q=' + encodeURIComponent("l'atelier")));
  await page.locator('#grid .card').first().waitFor();
  assert.equal(await page.locator('#grid .card').count(), 1);
```

par :

```js
test('« coeur » trouve « cœur » (surligné) ; l’apostrophe droite trouve l’apostrophe typographique', async () => {
  const page = await site.page({ donnees: jeuDeTest() });
  await page.goto(site.url('#/recherche?q=coeur'));
  await page.locator('#grid .card').first().waitFor();
  assert.equal(await page.locator('#grid mark').first().textContent(), 'cœur');
  await page.goto(site.url('#/recherche?q=' + encodeURIComponent("l'atelier")));
  await page.locator('#grid .card').first().waitFor();
  assert.equal(await page.locator('#grid .card').count(), 1);
```


- [ ] **Step 7: Vérifier l'échec**

Run: `node --test tests/js/routes.test.mjs`
Expected: FAIL — `SyntaxError: … does not provide an export named 'defaultFilters'`.

Run: `cd tests/navigateur; npm test`
Expected: FAIL — 5 échecs sur 45, tous dans navigation.test.mjs (aucune redirection, pas d'historique de frappe). Les tests déjà passés à `#/entrees` et `#/recherche?q=…` passent encore : l'ancien routeur lit toute ancre comme une liste avec ses paramètres.

- [ ] **Step 8: Réécrire `docs/js/routes.js`**

Contenu complet du fichier :

```js
/* Routes : analyse et construction des ancres (#/…). Module pur.
   #/                        accueil
   #/entrees?type=&projet=&famille=&tag=&tri=&vue=   toutes les entrées
   #/recherche?q=…           résultats de recherche
   #/projet/<id>             page d'un projet
   #/entree/<id court>       fiche d'une entrée
   Les anciennes ancres « #/?q=…&type=… » redirigent vers leur équivalent. */

export const SORTS = ['recent', 'ancien', 'projet'];
export const VIEWS = ['grille', 'projets'];
const FILTER_KEYS = ['type', 'projet', 'famille', 'tag'];

export function defaultFilters() {
  return { type: '', projet: '', famille: '', tag: '', tri: '', vue: 'grille' };
}

export function filtersFromParams(params) {
  const filters = defaultFilters();
  for (const key of FILTER_KEYS) filters[key] = params.get(key) || '';
  const tri = params.get('tri') || '';
  const vue = params.get('vue') || '';
  if (SORTS.includes(tri)) filters.tri = tri;
  if (VIEWS.includes(vue)) filters.vue = vue;
  return filters;
}

export function entriesHash(filters) {
  const params = new URLSearchParams();
  for (const key of FILTER_KEYS) if (filters[key]) params.set(key, filters[key]);
  if (SORTS.includes(filters.tri)) params.set('tri', filters.tri);
  if (filters.vue && filters.vue !== 'grille' && VIEWS.includes(filters.vue)) params.set('vue', filters.vue);
  const query = params.toString();
  return '#/entrees' + (query ? '?' + query : '');
}

export function searchHash(q) {
  return q ? '#/recherche?' + new URLSearchParams({ q }).toString() : '#/recherche';
}

export function projectHash(id) {
  return '#/projet/' + encodeURIComponent(id);
}

export function entryHash(entry) {
  return '#/entree/' + entry._short;
}

/* Route : { view: 'home' | 'entries' | 'search' | 'project' | 'entry' | 'redirect', … }.
   'redirect' porte l'ancre de remplacement (ancienne ancre ou ancre inconnue). */
export function parseHash(hash) {
  const text = String(hash || '').replace(/^#/, '');
  if (text === '' || text === '/') return { view: 'home' };
  const index = text.indexOf('?');
  const path = index >= 0 ? text.slice(0, index) : text;
  const params = new URLSearchParams(index >= 0 ? text.slice(index + 1) : '');

  if (path === '/' || path === '') {
    const q = (params.get('q') || '').trim();
    return { view: 'redirect', hash: q ? searchHash(q) : entriesHash(filtersFromParams(params)) };
  }
  if (path === '/entrees' || path === '/entrees/') return { view: 'entries', filters: filtersFromParams(params) };
  if (path === '/recherche' || path === '/recherche/') return { view: 'search', q: (params.get('q') || '').trim() };
  const entry = path.match(/^\/entree\/([0-9a-f]{6,64})\/?$/i);
  if (entry) return { view: 'entry', id: entry[1].toLowerCase() };
  const project = path.match(/^\/projet\/([^/]+)\/?$/);
  if (project) {
    try {
      return { view: 'project', id: decodeURIComponent(project[1]) };
    } catch (e) {
      return { view: 'redirect', hash: '#/' };
    }
  }
  return { view: 'redirect', hash: '#/' };
}
```

- [ ] **Step 9: Modifier `docs/js/vues/entrees.js`**

4 remplacements, dans l'ordre (chaque bloc à remplacer est unique dans le fichier).

1. Remplacer :

```js
   regroupement par projet, « Afficher plus ». */
import { normalize, search } from '../recherche.js';
import { listHash } from '../routes.js';
import { el, plural, typeLabel, typeCount, formatDay, card, chip } from '../composants.js';
import { NO_PROJECT } from '../donnees.js';
```

par :

```js
   regroupement par projet, « Afficher plus ». */
import { normalize, search } from '../recherche.js';
import { entriesHash, searchHash } from '../routes.js';
import { el, plural, typeLabel, typeCount, formatDay, card, chip } from '../composants.js';
import { NO_PROJECT } from '../donnees.js';
```

2. Remplacer :

```js
  }

  function filtered() {
    const { found, targets } = searched();
```

par :

```js
  }

  /* Ancre de l'état affiché : la recherche passe par #/recherche, le reste
     par #/entrees. */
  function listHash(filters) {
    return filters.q ? searchHash(filters.q) : entriesHash(filters);
  }

  function filtered() {
    const { found, targets } = searched();
```

3. Remplacer :

```js
    dom.listView.hidden = false;
    document.title = 'Mémoire Vive';
    state.lastListHash = listHash(state.filters);
    renderList();
    if (restoreScroll) {
```

par :

```js
    dom.listView.hidden = false;
    document.title = 'Mémoire Vive';
    renderList();
    if (restoreScroll) {
```

4. Remplacer :

```js
  }

  return { showList, renderList, filtered, sortEntries, typeRank };
}
```

par :

```js
  }

  return { showList, renderList, filtered, sortEntries, typeRank, listHash };
}
```


- [ ] **Step 10: Modifier `docs/js/app.js`**

8 remplacements, dans l'ordre (chaque bloc à remplacer est unique dans le fichier).

1. Remplacer :

```js
   déjà préparé par scripts/export.py (titres, résumés, projets, liens). */
import { loadData, prepare, DataError } from './donnees.js';
import { listHash, parseRoute, filtersFromParams, sameFilters } from './routes.js';
import { el, plural, formatLong } from './composants.js';
import { createListView } from './vues/entrees.js';
```

par :

```js
   déjà préparé par scripts/export.py (titres, résumés, projets, liens). */
import { loadData, prepare, DataError } from './donnees.js';
import { parseHash, searchHash, defaultFilters } from './routes.js';
import { el, plural, formatLong } from './composants.js';
import { createListView } from './vues/entrees.js';
```

2. Remplacer :

```js
  typeOrder: [],
  index: null,           // index de recherche (recherche.js)
  filters: { q: '', type: '', projet: '', tag: '', tri: '', vue: 'grille' },
  shown: CONFIG.pageSize,
  showAllProjects: false,
```

par :

```js
  typeOrder: [],
  index: null,           // index de recherche (recherche.js)
  filters: { q: '', ...defaultFilters() },
  shown: CONFIG.pageSize,
  showAllProjects: false,
```

3. Remplacer :

```js
// ------------------------------------------------------------ routage

function route() {
  const previous = state.route;
  const next = parseRoute(location.hash);
  if (previous && previous.view === 'list') {
    state.scroll.set(state.lastListHash, window.scrollY);
  }
```

par :

```js
// ------------------------------------------------------------ routage

/* Filtres de la liste pour une route autre qu'une fiche. En attendant leurs
   vues (accueil : Task 9, projet : Task 8, recherche : Task 11), l'accueil,
   la page projet et la recherche affichent la liste filtrée. */
function listFilters(target) {
  const filters = { q: '', ...defaultFilters() };
  if (target.view === 'entries') Object.assign(filters, target.filters);
  if (target.view === 'search') filters.q = target.q;
  if (target.view === 'project') filters.projet = target.id;
  return filters;
}

function sameFilters(a, b) {
  return Object.keys(a).every((key) => a[key] === b[key]);
}

function route() {
  const next = parseHash(location.hash);
  if (next.view === 'redirect') {
    history.replaceState(history.state, '', next.hash);
    return route();
  }
  const previous = state.route;
  if (previous && previous.view !== 'entry') {
    state.scroll.set(state.lastListHash, window.scrollY);
  }
```

4. Remplacer :

```js
    if (saved) {
      state.entryDepth = Number(saved.depth) || 0;
      if (saved.list !== state.lastListHash && saved.list.startsWith('#/')) {
        const index = saved.list.indexOf('?');
        state.filters = filtersFromParams(new URLSearchParams(index >= 0 ? saved.list.slice(index + 1) : ''));
        state.lastListHash = saved.list;
        state.lastList = ctx.list.filtered().list;
      }
    } else if (previous && previous.view === 'list') {
      state.entryDepth = 1;
    } else if (previous && previous.view === 'entry') {
```

par :

```js
    if (saved) {
      state.entryDepth = Number(saved.depth) || 0;
      const origin = parseHash(saved.list);
      if (saved.list !== state.lastListHash && origin.view !== 'entry' && origin.view !== 'redirect') {
        state.filters = listFilters(origin);
        state.lastListHash = saved.list;
        state.lastList = ctx.list.filtered().list;
      }
    } else if (previous && previous.view !== 'entry') {
      state.entryDepth = 1;
    } else if (previous && previous.view === 'entry') {
```

5. Remplacer :

```js
    return;
  }
  const filters = filtersFromParams(next.params);
  if (!sameFilters(filters, state.filters)) {
    state.filters = filters;
    state.shown = CONFIG.pageSize;
  }
  ctx.list.showList(previous && previous.view === 'entry');
}

```

par :

```js
    return;
  }
  const filters = listFilters(next);
  if (!sameFilters(filters, state.filters)) {
    state.filters = filters;
    state.shown = CONFIG.pageSize;
  }
  state.lastListHash = location.hash || '#/';
  ctx.list.showList(previous && previous.view === 'entry' && !state.typing);
}

/* Frappe dans la barre de recherche : la première frappe ouvre #/recherche
   (nouvelle entrée d'historique), les suivantes remplacent cette entrée. */
function typeSearch(q) {
  if (!q) { leaveSearch(); return; }
  const onSearch = state.route && state.route.view === 'search';
  if (onSearch) history.replaceState(history.state, '', searchHash(q));
  else history.pushState({ typed: true }, '', searchHash(q));
  // Quitter une vue en tapant (même une fiche) n'est pas un « retour » :
  // le focus reste dans le champ.
  state.typing = true;
  try { route(); } finally { state.typing = false; }
}

/* Recherche vidée : retour à la vue d'où la frappe est partie, sinon à l'accueil. */
function leaveSearch() {
  if (!state.route || state.route.view !== 'search') return;
  if (history.state && history.state.typed) {
    history.back();
  } else {
    history.replaceState(null, '', '#/');
    route();
  }
}

```

6. Remplacer :

```js
  Object.assign(state.filters, patch);
  state.shown = CONFIG.pageSize;
  const hash = listHash(state.filters);
  history.replaceState(null, '', hash);
  state.lastListHash = hash;
```

par :

```js
  Object.assign(state.filters, patch);
  state.shown = CONFIG.pageSize;
  const hash = ctx.list.listHash(state.filters);
  history.replaceState(null, '', hash);
  state.lastListHash = hash;
```

7. Remplacer :

```js
  dom.search.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => setFilters({ q: dom.search.value.trim() }), 120);
  });
  dom.search.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && dom.search.value) {
      event.preventDefault();
      dom.search.value = '';
      setFilters({ q: '' });
    }
  });
```

par :

```js
  dom.search.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => typeSearch(dom.search.value.trim()), 120);
  });
  dom.search.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && dom.search.value) {
      event.preventDefault();
      clearTimeout(searchTimer);
      dom.search.value = '';
      leaveSearch();
    }
  });
```

8. Remplacer :

```js
    if (state.route && state.route.view === 'entry') {
      const filters = Object.assign({}, state.filters, patch);
      location.hash = listHash(filters);
    } else {
      setFilters(patch);
```

par :

```js
    if (state.route && state.route.view === 'entry') {
      const filters = Object.assign({}, state.filters, patch);
      location.hash = ctx.list.listHash(filters);
    } else {
      setFilters(patch);
```


- [ ] **Step 11: Vérifier le succès**

Run: `node --test "tests/js/*.test.mjs"`
Expected: PASS — 22 tests.

Run: `cd tests/navigateur; npm test`
Expected: PASS — 45 tests.

- [ ] **Step 12: Commit**

```bash
git add docs/js/app.js docs/js/routes.js docs/js/vues/entrees.js tests/js/routes.test.mjs tests/navigateur/fiche.test.mjs tests/navigateur/interface.test.mjs tests/navigateur/liste.test.mjs tests/navigateur/navigation.test.mjs tests/navigateur/robustesse.test.mjs
git commit -m "Site : routes #/entrees, #/recherche, #/projet ; anciennes ancres redirigées

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Couleurs de famille (clair, sombre, contraste AA vérifié)

Six couleurs par thème, utilisables pour le liseré, le point et le nom de famille : contraste d'au moins 4,5 contre `--bg`, `--surface` et `--surface-2` (valeurs mesurées : clair 4,73 à 5,71 ; sombre 6,64 à 9,14). `data-couleur="1"`…`"6"` sur un élément choisit `--famille` pour lui et ses descendants ; sans famille, `--famille` vaut la couleur neutre `--border-strong`. Le test Node lit `style.css` et calcule les contrastes : il échoue dès qu'une couleur est retouchée sous le seuil.

**Files:**

- Modify: `docs/style.css`
- Test: `tests/js/couleurs.test.mjs` (créé), `tests/navigateur/interface.test.mjs` (modifié)

**Interfaces:**

- Consumes: jetons existants `--bg`, `--surface`, `--surface-2`, `--border-strong`.
- Produces: `--famille-1` … `--famille-6` dans `:root`, `@media (prefers-color-scheme: dark) :root:not([data-theme="light"])` et `:root[data-theme="dark"]` ; `--famille` choisie par `[data-couleur="1"]` … `[data-couleur="6"]`.

- [ ] **Step 1: Test — Créer `tests/js/couleurs.test.mjs`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../../docs/style.css', import.meta.url), 'utf8');

/* Variables « --nom: #rrggbb; » du premier bloc qui suit le sélecteur. */
function bloc(selecteur) {
  const debut = css.indexOf(selecteur + ' {');
  assert.notEqual(debut, -1, 'bloc introuvable : ' + selecteur);
  const corps = css.slice(debut, css.indexOf('}', debut));
  return Object.fromEntries(Array.from(corps.matchAll(/(--[\w-]+):\s*(#[0-9a-fA-F]{6})\b/g), (m) => [m[1], m[2]]));
}

function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255]
    .map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; })
    .reduce((somme, v, i) => somme + v * [0.2126, 0.7152, 0.0722][i], 0);
}

function contraste(a, b) {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

const clair = bloc(':root');
const sombreAuto = bloc(':root:not([data-theme="light"])');
const sombre = bloc(':root[data-theme="dark"]');

test('six couleurs de famille dans chaque thème', () => {
  for (const theme of [clair, sombreAuto, sombre]) {
    for (let n = 1; n <= 6; n++) assert.match(theme['--famille-' + n] || '', /^#[0-9a-fA-F]{6}$/, '--famille-' + n);
  }
});

test('thème sombre identique en automatique et en choix explicite', () => {
  for (let n = 1; n <= 6; n++) assert.equal(sombreAuto['--famille-' + n], sombre['--famille-' + n]);
});

test('contraste AA (≥ 4,5) sur les fonds, dans les deux thèmes', () => {
  for (const [nom, theme] of [['clair', clair], ['sombre', sombre]]) {
    for (let n = 1; n <= 6; n++) {
      for (const fond of ['--bg', '--surface', '--surface-2']) {
        const ratio = contraste(theme['--famille-' + n], theme[fond]);
        assert.ok(ratio >= 4.5, `${nom} : --famille-${n} sur ${fond} = ${ratio.toFixed(2)}`);
      }
    }
  }
});
```

- [ ] **Step 2: Test — Modifier `tests/navigateur/interface.test.mjs`**

Remplacer :

```js
  assert.ok(await debordement(page) <= 0, 'vue par projet');
  await terminer(page);
});
```

par :

```js
  assert.ok(await debordement(page) <= 0, 'vue par projet');
  await terminer(page);
});

test('couleurs de famille : data-couleur choisit la couleur, dans les deux thèmes', async () => {
  const page = await ouvrir();
  const couleur = (theme) => page.evaluate((t) => {
    document.documentElement.setAttribute('data-theme', t);
    const essai = document.createElement('span');
    essai.setAttribute('data-couleur', '3');
    document.body.append(essai);
    const valeur = getComputedStyle(essai).getPropertyValue('--famille').trim();
    const neutre = getComputedStyle(document.body).getPropertyValue('--famille').trim();
    essai.remove();
    return [valeur, neutre];
  }, theme);
  assert.deepEqual(await couleur('light'), ['#27724F', '#CFC8B6']);
  assert.deepEqual(await couleur('dark'), ['#7FC9A5', '#544F41']);
  await terminer(page);
});
```


- [ ] **Step 3: Vérifier l'échec**

Run: `node --test tests/js/couleurs.test.mjs`
Expected: FAIL — « six couleurs de famille dans chaque thème » et « contraste AA » (`--famille-1` absente) ; « thème sombre identique » passe (aucune valeur des deux côtés).

Run: `cd tests/navigateur; node --test interface.test.mjs`
Expected: FAIL — « couleurs de famille » : `--famille` vide au lieu de `#27724F`.

- [ ] **Step 4: Modifier `docs/style.css`**

4 remplacements, dans l'ordre (chaque bloc à remplacer est unique dans le fichier).

1. Remplacer :

```css
  --t-erreur-fg: #A0402F;    --t-erreur-bg: #F5E2DC;
  --t-autre-fg: #5E5A50;     --t-autre-bg: #ECE8DD;

  --serif: "Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif;
```

par :

```css
  --t-erreur-fg: #A0402F;    --t-erreur-bg: #F5E2DC;
  --t-autre-fg: #5E5A50;     --t-autre-bg: #ECE8DD;

  /* Familles de projets (indice « couleur » 1 à 6 de config/projets.json) :
     liserés, points et noms. Contraste ≥ 4,5 sur --bg, --surface et
     --surface-2, vérifié par tests/js/couleurs.test.mjs. */
  --famille-1: #7A4FB0;
  --famille-2: #2F6AAE;
  --famille-3: #27724F;
  --famille-4: #9A5800;
  --famille-5: #AD3A6B;
  --famille-6: #5C6A2A;

  --serif: "Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif;
```

2. Remplacer :

```css
    --t-autre-fg: #C9C2AF;     --t-autre-bg: #34312A;

    color-scheme: dark;
  }
```

par :

```css
    --t-autre-fg: #C9C2AF;     --t-autre-bg: #34312A;

    --famille-1: #BBA0EA;
    --famille-2: #8DB8EE;
    --famille-3: #7FC9A5;
    --famille-4: #E6AA5E;
    --famille-5: #EE98BB;
    --famille-6: #BAC57E;

    color-scheme: dark;
  }
```

3. Remplacer :

```css
  --t-erreur-fg: #E0836F;    --t-erreur-bg: #3A2620;
  --t-autre-fg: #C9C2AF;     --t-autre-bg: #34312A;

  color-scheme: dark;
```

par :

```css
  --t-erreur-fg: #E0836F;    --t-erreur-bg: #3A2620;
  --t-autre-fg: #C9C2AF;     --t-autre-bg: #34312A;

  --famille-1: #BBA0EA;
  --famille-2: #8DB8EE;
  --famille-3: #7FC9A5;
  --famille-4: #E6AA5E;
  --famille-5: #EE98BB;
  --famille-6: #BAC57E;

  color-scheme: dark;
```

4. Remplacer :

```css

.wrap { max-width: 1100px; margin: 0 auto; padding: 40px 24px 64px; }

/* ---------------------------------------------------------------- en-tête */
```

par :

```css

.wrap { max-width: 1100px; margin: 0 auto; padding: 40px 24px 64px; }

/* --------------------------------------------------------------- familles */

/* data-couleur (1 à 6) choisit la couleur de famille d'un élément et de ses
   descendants ; sans famille, --famille garde la couleur neutre. */
:root { --famille: var(--border-strong); }
[data-couleur="1"] { --famille: var(--famille-1); }
[data-couleur="2"] { --famille: var(--famille-2); }
[data-couleur="3"] { --famille: var(--famille-3); }
[data-couleur="4"] { --famille: var(--famille-4); }
[data-couleur="5"] { --famille: var(--famille-5); }
[data-couleur="6"] { --famille: var(--famille-6); }

/* ---------------------------------------------------------------- en-tête */
```


- [ ] **Step 5: Vérifier le succès**

Run: `node --test "tests/js/*.test.mjs"`
Expected: PASS — 25 tests.

Run: `cd tests/navigateur; npm test`
Expected: PASS — 46 tests.

- [ ] **Step 6: Commit**

```bash
git add docs/style.css tests/js/couleurs.test.mjs tests/navigateur/interface.test.mjs
git commit -m "Site : couleurs des six familles, clair et sombre, contraste AA vérifié

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Cartes d'entrée : liseré de famille, lien principal, « nouveau », dates relatives

Spec § 4.7. Le modèle gagne les familles (couleur validée : entier de 1 à 6, sinon `null`), le lien principal validé (`http(s)` seulement, genre `site` ou `depot`) pour les entrées et les projets. La carte porte `data-couleur`, affiche la date relative (date exacte en infobulle), la pastille « nouveau » et, à côté de « Voir la fiche », le bouton « Ouvrir le site ↗ » ou « Dépôt ↗ » (nom accessible distinct : « Ouvrir le site : <titre> (nouvel onglet) »). Dernière visite : voir « Choix d'interprétation », point 3.

**Files:**

- Modify: `docs/js/app.js`, `docs/js/composants.js`, `docs/js/donnees.js`, `docs/js/vues/entrees.js`, `docs/style.css`
- Test: `tests/js/composants.test.mjs` (créé), `tests/js/donnees.test.mjs` (modifié), `tests/navigateur/cartes.test.mjs` (créé)

**Interfaces:**

- Consumes: `prepare`, `card`, jetons `--famille` (Task 6).
- Produces:
  - `composants.js` : `VISIT_KEY = 'memoire-vive:derniere-visite'`, `relativeDate(isoOuMs, now = Date.now()) → string`, `timeElement(iso) → <time>`, `lastVisit(getStorage, stamp) → number | null`, `isNew(entry, since) → boolean`, `newBadge()`, `mainLinkButton(link, name) → <a> | null`, `card(entry, { targets = null, since = null } = {})`.
  - `donnees.js` : `mainLink(value) → { url, genre } | null` ; `prepare` renvoie aussi `families : Map(id → { id, nom, couleur })` ; projets enrichis `_family`, `_mainLink` ; entrées `_family`, `_mainLink`.
  - `app.js` : `state.families`, `state.since`.

- [ ] **Step 1: Test — Créer `tests/js/composants.test.mjs`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { relativeDate, lastVisit, isNew, VISIT_KEY } from '../../docs/js/composants.js';

const MAINTENANT = Date.parse('2026-09-20T12:00:00Z');
const avant = (secondes) => new Date(MAINTENANT - secondes * 1000).toISOString();

test('dates relatives en français', () => {
  const cas = [
    [30, 'à l’instant'],
    [-120, 'à l’instant'],
    [12 * 60, 'il y a 12 min'],
    [5 * 3600, 'il y a 5 h'],
    [30 * 3600, 'hier'],
    [3 * 86400, 'il y a 3 j'],
    [15 * 86400, 'il y a 2 sem.'],
    [95 * 86400, 'il y a 3 mois'],
    [800 * 86400, 'il y a 2 ans'],
  ];
  // Espaces normalisés : selon la version d'ICU, l'espace avant « min » ou « h » est insécable.
  for (const [secondes, attendu] of cas) {
    assert.equal(relativeDate(avant(secondes), MAINTENANT).replace(/\s/g, ' '), attendu, String(secondes));
  }
  assert.equal(relativeDate('pas une date', MAINTENANT), '');
});

function stockage(initial = {}) {
  const valeurs = new Map(Object.entries(initial));
  return { getItem: (k) => (valeurs.has(k) ? valeurs.get(k) : null), setItem: (k, v) => valeurs.set(k, String(v)), valeurs };
}

test('dernière visite : lue puis remplacée ; première visite : null', () => {
  const s = stockage();
  assert.equal(lastVisit(() => s, '2026-09-18T10:00:00Z'), null);
  assert.equal(s.valeurs.get(VISIT_KEY), '2026-09-18T10:00:00Z');
  assert.equal(lastVisit(() => s, '2026-09-19T10:00:00Z'), Date.parse('2026-09-18T10:00:00Z'));
  assert.equal(s.valeurs.get(VISIT_KEY), '2026-09-19T10:00:00Z');
  assert.equal(lastVisit(() => stockage({ [VISIT_KEY]: 'n’importe quoi' }), 'x'), null);
});

test('dernière visite : stockage indisponible, aucune exception', () => {
  assert.equal(lastVisit(() => { throw new Error('SecurityError'); }, 'x'), null);
  const plein = { getItem: () => '2026-09-18T10:00:00Z', setItem: () => { throw new Error('QuotaExceededError'); } };
  assert.equal(lastVisit(() => plein, 'x'), null);
});

test('« nouveau » : seulement après une visite connue', () => {
  const entree = { _time: Date.parse('2026-09-19T12:00:00Z') };
  assert.equal(isNew(entree, null), false);
  assert.equal(isNew(entree, Date.parse('2026-09-19T00:00:00Z')), true);
  assert.equal(isNew(entree, Date.parse('2026-09-20T00:00:00Z')), false);
});
```

- [ ] **Step 2: Test — Modifier `tests/js/donnees.test.mjs`**

2 remplacements, dans l'ordre (chaque bloc à remplacer est unique dans le fichier).

1. Remplacer :

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadData, prepare, DataError, NO_PROJECT } from '../../docs/js/donnees.js';
import { search } from '../../docs/js/recherche.js';

```

par :

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadData, prepare, mainLink, DataError, NO_PROJECT } from '../../docs/js/donnees.js';
import { search } from '../../docs/js/recherche.js';

```

2. Remplacer :

```js
  assert.deepEqual(search(model.index, 'coeur alpha').hits.map((h) => h.doc), [0]);
});
```

par :

```js
  assert.deepEqual(search(model.index, 'coeur alpha').hits.map((h) => h.doc), [0]);
});

test('lien principal : URL http(s) seulement', () => {
  assert.deepEqual(mainLink({ url: 'https://a.github.io/x/', genre: 'site' }), { url: 'https://a.github.io/x/', genre: 'site' });
  assert.deepEqual(mainLink({ url: 'https://github.com/a/b', genre: 'depot' }), { url: 'https://github.com/a/b', genre: 'depot' });
  assert.deepEqual(mainLink({ url: 'https://a.fr', genre: 'autre' }), { url: 'https://a.fr/', genre: 'site' });
  for (const valeur of [null, 'https://a.fr', { url: 'javascript:alert(1)' }, { url: 'data:text/html,x' }, { url: 42 }]) {
    assert.equal(mainLink(valeur), null, JSON.stringify(valeur));
  }
});

test('familles : ordre, couleur valide, rattachement aux projets et aux entrées', () => {
  const model = prepare({
    familles: [{ id: 'jeux', nom: 'Jeux', couleur: 1 }, { id: 'ia', nom: 'IA', couleur: '3;x' }, { id: 'jeux', nom: 'Doublon', couleur: 2 }, null],
    projets: [{ id: 'depths', nom: 'Depths', famille: 'jeux', lien_principal: { url: 'javascript:1', genre: 'site' } },
      { id: 'jarvis', nom: 'Jarvis', famille: 'inconnue' }],
    entrees: [{ id: 'aaaaaaaaaaaa0000', titre: 'x', type: 'note', projet: 'depths', cree_le: '2026-09-18T00:00:00Z',
      lien_principal: { url: 'https://github.com/a/depths', genre: 'depot' } }],
  });
  assert.deepEqual(Array.from(model.families.values()), [
    { id: 'jeux', nom: 'Jeux', couleur: 1 }, { id: 'ia', nom: 'IA', couleur: null }]);
  assert.equal(model.projects.get('depths')._family.nom, 'Jeux');
  assert.equal(model.projects.get('depths')._mainLink, null);
  assert.equal(model.projects.get('jarvis')._family, null);
  assert.equal(model.entries[0]._family.couleur, 1);
  assert.deepEqual(model.entries[0]._mainLink, { url: 'https://github.com/a/depths', genre: 'depot' });
});
```


- [ ] **Step 3: Test — Créer `tests/navigateur/cartes.test.mjs`**

```js
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { ouvrirSite, terminer } from './outils.mjs';
import { jeuDeTest } from './donnees-test.mjs';

let site;
before(async () => { site = await ouvrirSite(); });
after(async () => { await site.fermer(); });

const donnees = jeuDeTest();

async function entrees(options = {}) {
  const page = await site.page({ donnees, ...options });
  await page.goto(site.url('#/entrees'));
  await page.locator('#grid .card').first().waitFor();
  return page;
}

function carte(page, titre) {
  return page.locator('#grid .card').filter({ has: page.getByRole('link', { name: titre, exact: true }) });
}

test('carte : date relative, date exacte en infobulle', async () => {
  const page = await entrees();
  const heure = carte(page, 'Mémoire Vive — site en ligne').locator('time');
  assert.equal(await heure.textContent(), 'hier');
  assert.equal(await heure.getAttribute('title'), '19 septembre 2026 à 08:00');
  const recente = await carte(page, 'Note sans projet').locator('time').textContent();
  assert.equal(recente.replace(/\s/g, ' '), 'il y a 20 h');
  await terminer(page);
});

test('carte : bouton du lien principal (site ou dépôt), dans un nouvel onglet', async () => {
  const page = await entrees();
  const lienSite = page.getByRole('link', { name: 'Ouvrir le site : Jarvis — architecture (nouvel onglet)' });
  assert.equal(await lienSite.getAttribute('href'), 'https://exemple.github.io/jarvis/');
  assert.equal(await lienSite.getAttribute('target'), '_blank');
  assert.equal(await lienSite.getAttribute('rel'), 'noopener noreferrer');
  const depot = page.getByRole('link', { name: 'Dépôt : Depths — génération de donjon (nouvel onglet)' });
  assert.equal(await depot.getAttribute('href'), 'https://github.com/exemple/depths');
  assert.equal(await carte(page, 'Note sans projet').locator('.main-link').count(), 0);
  await terminer(page);
});

test('carte : liseré à la couleur de la famille, neutre sans famille', async () => {
  const page = await entrees();
  const jarvis = carte(page, 'Jarvis — architecture');
  assert.equal(await jarvis.getAttribute('data-couleur'), '3');
  assert.equal(await jarvis.evaluate((e) => getComputedStyle(e).borderLeftColor), 'rgb(39, 114, 79)');
  const atelier = carte(page, 'Le cœur de l’atelier');
  assert.equal(await atelier.getAttribute('data-couleur'), null);
  assert.equal(await atelier.evaluate((e) => getComputedStyle(e).borderLeftColor), 'rgb(207, 200, 182)');
  await terminer(page);
});

test('pastille « nouveau » : entrées postérieures à la visite précédente', async () => {
  const page = await entrees();
  assert.equal(await page.locator('.new-badge').count(), 0, 'première visite : aucune pastille');
  await page.evaluate(() => localStorage.setItem('memoire-vive:derniere-visite', '2026-09-19T00:00:00Z'));
  await page.reload();
  await page.locator('#grid .card').first().waitFor();
  const titres = await page.locator('#grid .card:has(.new-badge) h3').allTextContents();
  assert.deepEqual(titres.sort(), ['Mémoire Vive — site en ligne', 'Note sans projet']);
  await page.reload();
  await page.locator('#grid .card').first().waitFor();
  assert.equal(await page.locator('.new-badge').count(), 0, 'visite suivante : déjà vues');
  await terminer(page);
});

test('pastille « nouveau » : stockage bloqué, ni pastille ni erreur', async () => {
  const page = await site.page({ donnees });
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Accès refusé', 'SecurityError'); } });
  });
  await page.goto(site.url('#/entrees'));
  await page.locator('#grid .card').first().waitFor();
  assert.equal(await page.locator('.new-badge').count(), 0);
  await terminer(page);
});
```

- [ ] **Step 4: Vérifier l'échec**

Run: `node --test "tests/js/*.test.mjs"`
Expected: FAIL — composants.test : `does not provide an export named 'VISIT_KEY'` ; donnees.test : `… 'mainLink'`.

Run: `cd tests/navigateur; node --test cartes.test.mjs`
Expected: FAIL — 4 tests sur 5 (date absolue au lieu de « hier », pas de bouton de lien principal, pas de `data-couleur`, pas de pastille) ; « stockage bloqué » passe déjà (aucune pastille, aucune erreur).

- [ ] **Step 5: Modifier `docs/js/donnees.js`**

3 remplacements, dans l'ordre (chaque bloc à remplacer est unique dans le fichier).

1. Remplacer :

```js
}

export function prepare(data) {
  const projects = new Map();
  for (const project of data.projets || []) projects.set(project.id, project);

  const entries = data.entrees.map((entry) => {
```

par :

```js
}

/* Lien principal d'une entrée ou d'un projet : seulement une URL http(s). */
export function mainLink(value) {
  if (!value || typeof value !== 'object' || !isWebUrl(value.url)) return null;
  return { url: new URL(value.url).href, genre: value.genre === 'depot' ? 'depot' : 'site' };
}

/* Familles dans l'ordre configuré ; couleur : entier de 1 à 6, sinon null. */
function prepareFamilies(list) {
  const families = new Map();
  for (const family of Array.isArray(list) ? list : []) {
    if (!family || typeof family.id !== 'string' || !family.id || families.has(family.id)) continue;
    const couleur = Number.isInteger(family.couleur) && family.couleur >= 1 && family.couleur <= 6 ? family.couleur : null;
    families.set(family.id, { id: family.id, nom: String(family.nom || family.id), couleur });
  }
  return families;
}

export function prepare(data) {
  const families = prepareFamilies(data.familles);
  const projects = new Map();
  for (const project of Array.isArray(data.projets) ? data.projets : []) {
    if (!project || !project.id) continue;
    projects.set(project.id, Object.assign({}, project, {
      _family: families.get(project.famille) || null,
      _mainLink: mainLink(project.lien_principal),
    }));
  }

  const entries = data.entrees.map((entry) => {
```

2. Remplacer :

```js
      _project: entry.projet || NO_PROJECT,
      _projectName: projectName,
      _short: String(entry.id || '').slice(0, 12),
      _online: liens.filter((l) => l.type === 'en_ligne' && isWebUrl(l.valeur)).length,
```

par :

```js
      _project: entry.projet || NO_PROJECT,
      _projectName: projectName,
      _family: project ? project._family : null,
      _mainLink: mainLink(entry.lien_principal),
      _short: String(entry.id || '').slice(0, 12),
      _online: liens.filter((l) => l.type === 'en_ligne' && isWebUrl(l.valeur)).length,
```

3. Remplacer :

```js
  })), data.synonymes);

  return { data, entries, projects, typeOrder, index };
}
```

par :

```js
  })), data.synonymes);

  return { data, entries, projects, families, typeOrder, index };
}
```


- [ ] **Step 6: Modifier `docs/js/composants.js`**

4 remplacements, dans l'ordre (chaque bloc à remplacer est unique dans le fichier).

1. Remplacer :

```js
const fmtDay = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
const fmtLong = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short' });

export function el(tag, attrs, ...children) {
```

par :

```js
const fmtDay = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
const fmtLong = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short' });
const rtfShort = new Intl.RelativeTimeFormat('fr', { numeric: 'auto', style: 'short' });
const rtfLong = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' });

export const VISIT_KEY = 'memoire-vive:derniere-visite';

export function el(tag, attrs, ...children) {
```

2. Remplacer :

```js
  const time = Date.parse(iso);
  return Number.isNaN(time) ? '' : fmtLong.format(time);
}

```

par :

```js
  const time = Date.parse(iso);
  return Number.isNaN(time) ? '' : fmtLong.format(time);
}

/* « il y a 3 j », « hier », « il y a 2 sem. », « il y a 3 mois »… ; now en ms. */
export function relativeDate(iso, now = Date.now()) {
  const time = typeof iso === 'number' ? iso : Date.parse(iso);
  if (Number.isNaN(time)) return '';
  const seconds = (now - time) / 1000;
  if (seconds < 60) return 'à l’instant';
  const minutes = seconds / 60;
  if (minutes < 60) return rtfShort.format(-Math.floor(minutes), 'minute');
  const hours = minutes / 60;
  if (hours < 24) return rtfShort.format(-Math.floor(hours), 'hour');
  const days = hours / 24;
  if (days < 7) return rtfShort.format(-Math.floor(days), 'day');
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

```

3. Remplacer :

```js
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
```

par :

```js
}

/* Carte d'une entrée. options : targets (surlignage), since (dernière visite). */
export function card(entry, { targets = null, since = null } = {}) {
  const tagsShown = entry.tags.slice(0, 5);
  const extraTags = entry.tags.length - tagsShown.length;
  return el('article', { class: 'card', 'data-couleur': entry._family ? entry._family.couleur : null },
    el('div', { class: 'badges' }, typeBadge(entry.type), entry.projet ? projectButton(entry) : null,
      isNew(entry, since) ? newBadge() : null),
    el('h3', null, el('a', { href: entryHash(entry) }, highlight(entry.titre, targets))),
    entry.resume ? el('p', { class: 'resume' }, highlight(entry.resume, targets)) : null,
    el('div', { class: 'meta-line' }, timeElement(entry.cree_le), linksInfo(entry)),
    tagsShown.length ? el('ul', { class: 'tags', 'aria-label': 'Tags' },
      tagsShown.map((tag) => el('li', null,
```

4. Remplacer :

```js
      extraTags > 0 ? el('li', { class: 'tag-more' }, '+' + extraTags) : null) : null,
    el('div', { class: 'actions' },
      el('a', { class: 'btn-primary', href: entryHash(entry), 'aria-label': 'Voir la fiche : ' + entry.titre }, 'Voir la fiche')),
  );
}
```

par :

```js
      extraTags > 0 ? el('li', { class: 'tag-more' }, '+' + extraTags) : null) : null,
    el('div', { class: 'actions' },
      el('a', { class: 'btn-primary', href: entryHash(entry), 'aria-label': 'Voir la fiche : ' + entry.titre }, 'Voir la fiche'),
      mainLinkButton(entry._mainLink, entry.titre)),
  );
}
```


- [ ] **Step 7: Modifier `docs/js/vues/entrees.js`**

2 remplacements, dans l'ordre (chaque bloc à remplacer est unique dans le fichier).

1. Remplacer :

```js
      dom.grid.hidden = false;
      const fragment = document.createDocumentFragment();
      for (const entry of list.slice(0, state.shown)) fragment.append(card(entry, targets));
      dom.grid.append(fragment);
      const remaining = list.length - state.shown;
```

par :

```js
      dom.grid.hidden = false;
      const fragment = document.createDocumentFragment();
      for (const entry of list.slice(0, state.shown)) fragment.append(card(entry, { targets, since: state.since }));
      dom.grid.append(fragment);
      const remaining = list.length - state.shown;
```

2. Remplacer :

```js

      const shown = single ? members : members.slice(0, config.groupPreview);
      const grid = el('div', { class: 'grid' }, shown.map((entry) => card(entry, targets)));
      const section = el('section', { class: 'group', 'aria-label': name }, head, grid);
      if (members.length > shown.length) {
```

par :

```js

      const shown = single ? members : members.slice(0, config.groupPreview);
      const grid = el('div', { class: 'grid' }, shown.map((entry) => card(entry, { targets, since: state.since })));
      const section = el('section', { class: 'group', 'aria-label': name }, head, grid);
      if (members.length > shown.length) {
```


- [ ] **Step 8: Modifier `docs/js/app.js`**

3 remplacements, dans l'ordre (chaque bloc à remplacer est unique dans le fichier).

1. Remplacer :

```js
import { loadData, prepare, DataError } from './donnees.js';
import { parseHash, searchHash, defaultFilters } from './routes.js';
import { el, plural, formatLong } from './composants.js';
import { createListView } from './vues/entrees.js';
import { createEntryView } from './vues/fiche.js';
```

par :

```js
import { loadData, prepare, DataError } from './donnees.js';
import { parseHash, searchHash, defaultFilters } from './routes.js';
import { el, plural, formatLong, lastVisit } from './composants.js';
import { createListView } from './vues/entrees.js';
import { createEntryView } from './vues/fiche.js';
```

2. Remplacer :

```js
  typeOrder: [],
  index: null,           // index de recherche (recherche.js)
  filters: { q: '', ...defaultFilters() },
  shown: CONFIG.pageSize,
```

par :

```js
  typeOrder: [],
  index: null,           // index de recherche (recherche.js)
  families: new Map(),
  since: null,           // dernière visite (ms) : entrées plus récentes « nouveau »
  filters: { q: '', ...defaultFilters() },
  shown: CONFIG.pageSize,
```

3. Remplacer :

```js
  state.typeOrder = model.typeOrder;
  state.index = model.index;
  renderStats();
  dom.status.hidden = true;
```

par :

```js
  state.typeOrder = model.typeOrder;
  state.index = model.index;
  state.families = model.families;
  // L'horodatage mémorisé est celui de l'export affiché : une entrée créée
  // avant la visite mais publiée après reste « nouvelle » à la suivante.
  state.since = lastVisit(() => window.localStorage, data.genere_le || new Date().toISOString());
  renderStats();
  dom.status.hidden = true;
```


- [ ] **Step 9: Modifier `docs/style.css`**

3 remplacements, dans l'ordre (chaque bloc à remplacer est unique dans le fichier).

1. Remplacer :

```css
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 22px;
```

par :

```css
  background: var(--surface);
  border: 1px solid var(--border);
  border-left: 4px solid var(--famille);
  border-radius: 16px;
  padding: 22px;
```

2. Remplacer :

```css
  min-width: 0;
}
.card:hover { border-color: var(--border-strong); box-shadow: var(--shadow); }

.badges { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
```

par :

```css
  min-width: 0;
}
.card:hover { border-color: var(--border-strong); border-left-color: var(--famille); box-shadow: var(--shadow); }

.badges { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
```

3. Remplacer :

```css
.tag-more { font-size: 12px; color: var(--text-muted); }

.card .actions { display: flex; gap: 8px; margin-top: 4px; }
.btn-primary, .btn-secondary {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
```

par :

```css
.tag-more { font-size: 12px; color: var(--text-muted); }

.card .actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 4px; }

.new-badge {
  display: inline-block;
  font: 700 11px var(--sans); letter-spacing: 0.04em; text-transform: uppercase;
  color: var(--on-accent); background: var(--accent-fill);
  padding: 3px 8px; border-radius: 999px;
}

.meta-line time { text-decoration: underline dotted; text-underline-offset: 3px; cursor: help; }
.btn-primary, .btn-secondary {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
```


- [ ] **Step 10: Vérifier le succès**

Run: `node --test "tests/js/*.test.mjs"`
Expected: PASS — 31 tests.

Run: `cd tests/navigateur; npm test`
Expected: PASS — 51 tests.

- [ ] **Step 11: Commit**

```bash
git add docs/js/app.js docs/js/composants.js docs/js/donnees.js docs/js/vues/entrees.js docs/style.css tests/js/composants.test.mjs tests/js/donnees.test.mjs tests/navigateur/cartes.test.mjs
git commit -m "Site : cartes d'entrée — liseré de famille, lien principal, « nouveau », dates relatives

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Page projet

Spec § 4.4. Nouvelle zone `#page-view` (accueil, page projet et résultats y seront rendus) ; `ctx.show(zone)` n'en affiche qu'une et vide les autres (identifiants de titres uniques), `ctx.focusView(returning)` place le focus (lien de la fiche quittée au retour, sinon titre de la page ; rien au premier affichage ni pendant la frappe). La pastille de projet des cartes devient un lien vers la page projet ; le filtre par projet reste dans les pastilles de la liste. La fiche retrouve l'ordre de la page d'origine (Précédente/Suivante) grâce à `sequenceFor(origine)`, y compris après rechargement, et son lien de retour dit où il mène.

**Files:**

- Create: `docs/js/vues/projet.js`
- Modify: `docs/index.html`, `docs/js/app.js`, `docs/js/composants.js`, `docs/js/donnees.js`, `docs/js/vues/entrees.js`, `docs/js/vues/fiche.js`, `docs/style.css`
- Test: `tests/js/donnees.test.mjs` (modifié), `tests/js/projet.test.mjs` (créé), `tests/navigateur/fiche.test.mjs` (modifié), `tests/navigateur/interface.test.mjs` (modifié), `tests/navigateur/liste.test.mjs` (modifié), `tests/navigateur/projet.test.mjs` (créé), `tests/navigateur/robustesse.test.mjs` (modifié)

**Interfaces:**

- Consumes: `projectHash`, `parseHash` (Task 5), `card`, `mainLinkButton`, `isNew`, `newBadge`, `relativeDate` (Task 7), familles et `_mainLink` (Task 7).
- Produces:
  - `vues/projet.js` : `projectSections(entries, projectId) → [{ id, title, types, timeline?, entries }]`, `projectLinks(project, members) → string[]`, `projectLocalAddresses(members) → string[]`, `relatedProjects(projectId, members, projects) → project[]`, `createProjectView(ctx) → { showProject(id, { returning }), projectEntries(id) → entry[] }`.
  - `donnees.js` : entrées `_neighbours : [{ entry, score }]`.
  - `composants.js` : `projectButton(entry)` → lien `#/projet/<id>` ; `card(entry, { targets, since, showProject = true })`.
  - `vues/fiche.js` : `backLabel(hash) → string`.
  - `app.js` : `ctx.show(section)`, `ctx.focusView(returning)`, `ctx.project`, `sequenceFor(origin)`, `openEntry(next, previous)`, `state.firstRender`, `dom.pageView`.
  - `index.html` : `<section id="page-view" aria-labelledby="titre-vue" hidden>`.

- [ ] **Step 1: Test — Modifier `tests/js/donnees.test.mjs`**

Remplacer :

```js
  assert.deepEqual(model.entries[0]._mainLink, { url: 'https://github.com/a/depths', genre: 'depot' });
});
```

par :

```js
  assert.deepEqual(model.entries[0]._mainLink, { url: 'https://github.com/a/depths', genre: 'depot' });
});

test('voisins : entrées publiées seulement, score numérique fini', () => {
  const model = prepare({
    entrees: [
      { id: 'aaaaaaaaaaaa0000', titre: 'a', type: 'note', voisins: [
        { id: 'bbbbbbbbbbbb0000', score: 0.9 }, { id: 'inconnu', score: 0.9 }, { id: 'bbbbbbbbbbbb0000', score: '1' },
        { id: 'aaaaaaaaaaaa0000', score: 0.99 }, null] },
      { id: 'bbbbbbbbbbbb0000', titre: 'b', type: 'note' },
    ],
  });
  assert.deepEqual(model.entries[0]._neighbours.map((v) => [v.entry.titre, v.score]), [['b', 0.9]]);
  assert.deepEqual(model.entries[1]._neighbours, []);
});
```


- [ ] **Step 2: Test — Créer `tests/js/projet.test.mjs`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { projectSections, projectLinks, relatedProjects } from '../../docs/js/vues/projet.js';

const entree = (id, type, projet, heure, extra = {}) => ({
  id, titre: id, type, projet, _time: Date.parse('2026-09-18T00:00:00Z') + heure * 3600000, liens: [], _neighbours: [], ...extra,
});

test('sections : ordre fixe, jalons chronologiques, types inconnus dans « Notes »', () => {
  const entrees = [
    entree('n1', 'note', 'p', 1), entree('j2', 'milestone', 'p', 5), entree('j1', 'milestone', 'p', 2),
    entree('r1', 'architecture', 'p', 3), entree('x1', 'idee', 'p', 4), entree('autre', 'note', 'q', 9),
  ];
  const sections = projectSections(entrees, 'p');
  assert.deepEqual(sections.map((s) => [s.id, s.entries.map((e) => e.id)]), [
    ['references', ['r1']], ['jalons', ['j1', 'j2']], ['notes', ['x1', 'n1']],
  ]);
});

test('liens du projet : principal en tête, dédupliqués, http(s) seulement', () => {
  const membres = [
    entree('a', 'note', 'p', 1, { liens: [{ type: 'en_ligne', valeur: 'https://github.com/x/p' }, { type: 'en_ligne', valeur: 'javascript:1' }] }),
    entree('b', 'note', 'p', 2, { liens: [{ type: 'en_ligne', valeur: 'https://x.github.io/p' }, { type: 'local', valeur: 'D:/p' }] }),
  ];
  const projet = { _mainLink: { url: 'https://x.github.io/p', genre: 'site' } };
  assert.deepEqual(projectLinks(projet, membres), ['https://x.github.io/p', 'https://github.com/x/p']);
});

test('projets proches : les plus présents parmi les voisins, puis le score cumulé', () => {
  const projets = new Map(['p', 'q', 'r', 's'].map((id) => [id, { id, nom: id.toUpperCase() }]));
  const q1 = entree('q1', 'note', 'q', 1);
  const r1 = entree('r1', 'note', 'r', 1);
  const s1 = entree('s1', 'note', 's', 1);
  const p1 = entree('p1', 'note', 'p', 1, { _neighbours: [{ entry: r1, score: 0.95 }, { entry: q1, score: 0.8 }] });
  const p2 = entree('p2', 'note', 'p', 2, { _neighbours: [{ entry: q1, score: 0.81 }, { entry: s1, score: 0.99 }] });
  assert.deepEqual(relatedProjects('p', [p1, p2], projets).map((p) => p.id), ['q', 's', 'r']);
  // Au plus 5 (spec § 4.4), même avec 7 projets voisins distincts.
  const autres = new Map(['p', 'a', 'b', 'c', 'd', 'e', 'f', 'g'].map((id) => [id, { id, nom: id.toUpperCase() }]));
  const voisins = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((id) => ({ entry: entree(id + '1', 'note', id, 1), score: 0.9 }));
  assert.equal(relatedProjects('p', [entree('p3', 'note', 'p', 3, { _neighbours: voisins })], autres).length, 5);
});
```

- [ ] **Step 3: Test — Modifier `tests/navigateur/fiche.test.mjs`**

Remplacer :

```js
  await page.locator(CARTES).first().click();
  await page.locator('#entry-title').waitFor();
  await page.getByRole('link', { name: '← Retour à la liste' }).click();
  await page.locator(CARTES).first().waitFor();
  assert.ok(page.url().endsWith('#/recherche?q=jarvis'), page.url());
```

par :

```js
  await page.locator(CARTES).first().click();
  await page.locator('#entry-title').waitFor();
  await page.getByRole('link', { name: '← Retour aux résultats' }).click();
  await page.locator(CARTES).first().waitFor();
  assert.ok(page.url().endsWith('#/recherche?q=jarvis'), page.url());
```


- [ ] **Step 4: Test — Modifier `tests/navigateur/interface.test.mjs`**

2 remplacements, dans l'ordre (chaque bloc à remplacer est unique dans le fichier).

1. Remplacer :

```js
});

test('mobile : pas de défilement horizontal (liste, fiche, vue par projet)', async () => {
  const archi = entreeTitree(donnees, 'Jarvis — architecture');
  const page = await ouvrir('#/entrees', { mobile: true });
```

par :

```js
});

test('mobile : pas de défilement horizontal (liste, fiche, vue par projet, page projet)', async () => {
  const archi = entreeTitree(donnees, 'Jarvis — architecture');
  const page = await ouvrir('#/entrees', { mobile: true });
```

2. Remplacer :

```js
  await page.locator('.group').first().waitFor();
  assert.ok(await debordement(page) <= 0, 'vue par projet');
  await terminer(page);
});
```

par :

```js
  await page.locator('.group').first().waitFor();
  assert.ok(await debordement(page) <= 0, 'vue par projet');
  await page.goto(site.url('#/projet/jarvis'));
  await page.locator('#titre-vue').waitFor();
  assert.ok(await debordement(page) <= 0, 'page projet');
  await terminer(page);
});
```


- [ ] **Step 5: Test — Modifier `tests/navigateur/liste.test.mjs`**

Remplacer :

```js
});

test('clic sur le projet d’une carte : filtre ce projet', async () => {
  const page = await liste();
  const bouton = page.locator('#grid .project-tag').first();
  const nom = (await bouton.textContent()).replace(/^\S+\s/, '');
  await bouton.click();
  await attendreAncre(page, 'projet=');
  const projets = await page.locator('#grid .project-tag').allTextContents();
  assert.ok(projets.length > 0);
  assert.ok(projets.every((t) => t.endsWith(nom)), nom);
  await terminer(page);
});
```

par :

```js
});

test('pastille de projet : filtre ce projet', async () => {
  const page = await liste();
  await page.locator('#project-chips .chip', { hasText: 'Depths' }).click();
  await attendreAncre(page, 'projet=depths');
  const projets = await page.locator('#grid .project-tag').allTextContents();
  assert.ok(projets.length > 0);
  assert.ok(projets.every((t) => t.endsWith('Depths')), projets.join(', '));
  await terminer(page);
});
```


- [ ] **Step 6: Test — Créer `tests/navigateur/projet.test.mjs`**

```js
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { ouvrirSite, terminer, attendreAncre, contraste } from './outils.mjs';
import { jeuDeTest } from './donnees-test.mjs';

let site;
before(async () => { site = await ouvrirSite(); });
after(async () => { await site.fermer(); });

const donnees = jeuDeTest();

async function projet(id) {
  const page = await site.page({ donnees });
  await page.goto(site.url('#/projet/' + id));
  await page.locator('#page-view:not([hidden]) #titre-vue').waitFor();
  return page;
}

test('page projet : famille, description, liens dédupliqués (principal en tête), dates', async () => {
  const page = await projet('jarvis');
  assert.equal(await page.textContent('#titre-vue'), 'Jarvis');
  assert.equal(await page.textContent('.project-family'), 'Famille : IA & simulations');
  assert.match(await page.textContent('.project-description'), /^Assistant vocal local/);
  const liens = await page.locator('.project-links a').evaluateAll((as) => as.map((a) => [a.getAttribute('aria-label'), a.href, a.target]));
  assert.deepEqual(liens, [
    ['Ouvrir le site : Jarvis (nouvel onglet)', 'https://exemple.github.io/jarvis/', '_blank'],
    ['github.com/exemple/jarvis (nouvel onglet)', 'https://github.com/exemple/jarvis', '_blank'],
  ]);
  assert.match(await page.textContent('.project-dates'), /^16\sentrées · première le .+ · dernière le .+ \(il y a 6\sj\)$/);
  assert.equal(await page.title(), 'Jarvis — Mémoire Vive');
  await terminer(page);
});

test('page projet : sections dans l’ordre, jalons du plus ancien au plus récent', async () => {
  const page = await projet('jarvis');
  const titres = (await page.locator('.project-section > h3').allTextContents()).map((t) => t.replace(/\s/g, ' '));
  assert.deepEqual(titres, ['Architecture & références · 1', 'Décisions · 1', 'Jalons · 2', 'Notes · 11', 'Erreurs · 1', 'Adresses locales']);
  assert.deepEqual(await page.locator('.timeline a').allTextContents(), ['Jarvis — premier réveil vocal', 'Jarvis — réponses hors ligne']);
  assert.equal(await page.locator('#page-view .card .project-tag').count(), 0, 'pas de lien vers le projet lui-même');
  await terminer(page);
});

test('page projet : adresses locales dédupliquées, chacune avec « Copier »', async () => {
  const page = await projet('jarvis');
  const adresses = page.locator('#h-local + .links-list li');
  assert.deepEqual(await adresses.locator('code').allTextContents(), ['D:\\jarvis', 'localhost:8765']);
  assert.equal(await adresses.getByRole('button', { name: 'Copier' }).count(), 2);
  await terminer(page);
});

test('page projet : projets proches d’après les voisins', async () => {
  let page = await projet('depths');
  assert.deepEqual(await page.locator('.related-projects a').allTextContents(), ['Voxelcraft']);
  assert.equal(await page.locator('.related-projects li').getAttribute('data-couleur'), '1');
  await page.context().close();
  page = await projet('jarvis');
  assert.equal(await page.locator('#h-proches').count(), 0, 'voisins tous dans le projet');
  await terminer(page);
});

test('clic sur le projet d’une carte : page du projet, focus sur son titre', async () => {
  const page = await site.page({ donnees });
  await page.goto(site.url('#/entrees'));
  await page.locator('#grid .card').first().waitFor();
  await page.locator('#grid .project-tag').first().click();
  await attendreAncre(page, '#/projet/memoire-vive');
  await page.locator('#titre-vue').waitFor();
  assert.equal(await page.textContent('#titre-vue'), 'Mémoire Vive');
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'titre-vue');
  await terminer(page);
});

test('projet inconnu : message « Projet introuvable »', async () => {
  const page = await projet('inconnu');
  assert.equal(await page.textContent('#titre-vue'), 'Projet introuvable');
  await terminer(page);
});

test('fiche ouverte depuis le projet : ordre de la page, « Retour au projet », focus rendu', async () => {
  const page = await projet('jarvis');
  const lien = page.locator('.timeline a', { hasText: 'Jarvis — premier réveil vocal' });
  const href = await lien.getAttribute('href');
  await lien.click();
  await page.locator('#entry-title').waitFor();
  assert.equal(await page.getAttribute('.pager a[rel="prev"]', 'title'), 'Jarvis — pas de service en ligne');
  assert.equal(await page.getAttribute('.pager a[rel="next"]', 'title'), 'Jarvis — réponses hors ligne');
  await page.getByRole('link', { name: '← Retour au projet' }).click();
  await page.locator('#titre-vue').waitFor();
  assert.ok(page.url().endsWith('#/projet/jarvis'), page.url());
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('href')), href);
  await terminer(page);
});

test('page projet : famille lisible (contraste ≥ 4,5) avec ou sans famille, dans les deux thèmes', async () => {
  for (const id of ['jarvis', 'atelier']) {
    const page = await projet(id);
    for (const theme of ['light', 'dark']) {
      const [texte, fond] = await page.evaluate((t) => {
        document.documentElement.setAttribute('data-theme', t);
        return [getComputedStyle(document.querySelector('.project-family')).color, getComputedStyle(document.body).backgroundColor];
      }, theme);
      assert.ok(contraste(texte, fond) >= 4.5, `${id}, ${theme} : ${contraste(texte, fond).toFixed(2)}`);
    }
    await terminer(page);
  }
});

test('page projet : jalons datés au jour, date relative en infobulle', async () => {
  const page = await projet('jarvis');
  const date = page.locator('.timeline time').first();
  assert.equal(await date.textContent(), '8 sept. 2026');
  assert.equal((await date.getAttribute('title')).replace(/\s/g, ' '), 'la semaine dernière');
  await terminer(page);
});
```

- [ ] **Step 7: Test — Modifier `tests/navigateur/robustesse.test.mjs`**

Remplacer :

```js
test('données piégées (XSS) : aucune balise injectée, aucun lien javascript: ou data:', async () => {
  const page = await site.page({ donnees: donneesPiegees() });
  for (const [ancre, attendu] of [['#/entrees', '#grid .card'], ['#/entree/abcdef123456', '#entry-title']]) {
    await page.goto(site.url(ancre));
    await page.locator(attendu).first().waitFor();
```

par :

```js
test('données piégées (XSS) : aucune balise injectée, aucun lien javascript: ou data:', async () => {
  const page = await site.page({ donnees: donneesPiegees() });
  for (const [ancre, attendu] of [['#/entrees', '#grid .card'], ['#/entree/abcdef123456', '#entry-title'],
    ['#/projet/x', '#titre-vue']]) {
    await page.goto(site.url(ancre));
    await page.locator(attendu).first().waitFor();
```


- [ ] **Step 8: Vérifier l'échec**

Run: `node --test "tests/js/*.test.mjs"`
Expected: FAIL — projet.test : `ERR_MODULE_NOT_FOUND` (`docs/js/vues/projet.js`) ; donnees.test : « voisins… » (`TypeError: Cannot read properties of undefined (reading 'map')`, `_neighbours` absent).

Run: `cd tests/navigateur; npm test`
Expected: FAIL — 12 échecs : les 9 tests de projet.test.mjs (la liste filtrée s'affiche à la place de la page projet, délai dépassé sur `#titre-vue`), « Retour… filtres et recherche conservés » (lien « ← Retour aux résultats » introuvable), mobile et données piégées (page projet). « pastille de projet : filtre ce projet » passe déjà.

- [ ] **Step 9: Modifier `docs/js/donnees.js`**

Remplacer :

```js
  });

  const known = Array.isArray(data.ordre_types) ? data.ordre_types : [];
  const present = Array.from(new Set(entries.map((e) => e.type)));
```

par :

```js
  });

  // Voisins (calculés à l'export) : entrées publiées, score numérique fini.
  const byId = new Map(entries.map((e) => [String(e.id), e]));
  for (const entry of entries) {
    entry._neighbours = (Array.isArray(entry.voisins) ? entry.voisins : [])
      .filter((v) => v && typeof v.score === 'number' && Number.isFinite(v.score))
      .map((v) => ({ entry: byId.get(String(v.id)), score: v.score }))
      .filter((v) => v.entry && v.entry !== entry);
  }

  const known = Array.isArray(data.ordre_types) ? data.ordre_types : [];
  const present = Array.from(new Set(entries.map((e) => e.type)));
```


- [ ] **Step 10: Modifier `docs/js/composants.js`**

3 remplacements, dans l'ordre (chaque bloc à remplacer est unique dans le fichier).

1. Remplacer :

```js
   au DOM au chargement du module : les fonctions pures se testent sous Node. */
import { highlightRanges } from './recherche.js';
import { entryHash } from './routes.js';

const TYPE_LABELS = {
```

par :

```js
   au DOM au chargement du module : les fonctions pures se testent sous Node. */
import { highlightRanges } from './recherche.js';
import { entryHash, projectHash } from './routes.js';

const TYPE_LABELS = {
```

2. Remplacer :

```js
}

export function projectButton(entry) {
  return el('button', {
    type: 'button', class: 'project-tag', 'data-action': 'project', 'data-project': entry._project,
    title: 'Voir toutes les entrées de ce projet',
  }, '📁︎ ' + entry._projectName);
}
```

par :

```js
}

/* Lien vers la page du projet de l'entrée. */
export function projectButton(entry) {
  return el('a', {
    class: 'project-tag', href: projectHash(entry.projet), title: 'Page du projet ' + entry._projectName,
  }, '📁︎ ' + entry._projectName);
}
```

3. Remplacer :

```js
}

/* Carte d'une entrée. options : targets (surlignage), since (dernière visite). */
export function card(entry, { targets = null, since = null } = {}) {
  const tagsShown = entry.tags.slice(0, 5);
  const extraTags = entry.tags.length - tagsShown.length;
  return el('article', { class: 'card', 'data-couleur': entry._family ? entry._family.couleur : null },
    el('div', { class: 'badges' }, typeBadge(entry.type), entry.projet ? projectButton(entry) : null,
      isNew(entry, since) ? newBadge() : null),
    el('h3', null, el('a', { href: entryHash(entry) }, highlight(entry.titre, targets))),
```

par :

```js
}

/* Carte d'une entrée. options : targets (surlignage), since (dernière
   visite), showProject (lien vers le projet, inutile sur sa propre page). */
export function card(entry, { targets = null, since = null, showProject = true } = {}) {
  const tagsShown = entry.tags.slice(0, 5);
  const extraTags = entry.tags.length - tagsShown.length;
  return el('article', { class: 'card', 'data-couleur': entry._family ? entry._family.couleur : null },
    el('div', { class: 'badges' }, typeBadge(entry.type), entry.projet && showProject ? projectButton(entry) : null,
      isNew(entry, since) ? newBadge() : null),
    el('h3', null, el('a', { href: entryHash(entry) }, highlight(entry.titre, targets))),
```


- [ ] **Step 11: Modifier `docs/js/vues/entrees.js`**

Remplacer :

```js

  function showList(restoreScroll) {
    dom.entryView.hidden = true;
    dom.entryView.replaceChildren();
    dom.listView.hidden = false;
    document.title = 'Mémoire Vive';
    renderList();
```

par :

```js

  function showList(restoreScroll) {
    ctx.show(dom.listView);
    document.title = 'Mémoire Vive';
    renderList();
```


- [ ] **Step 12: Modifier `docs/js/vues/fiche.js`**

4 remplacements, dans l'ordre (chaque bloc à remplacer est unique dans le fichier).

1. Remplacer :

```js
/* Fiche d'une entrée : navigation (retour, précédente, suivante), liens,
   texte intégral, tags, entrées du même projet, détails. */
import { entryHash } from '../routes.js';
import { el, typeBadge, projectButton, typeLabel, formatLong, isWebUrl, copy } from '../composants.js';

export function createEntryView(ctx) {
```

par :

```js
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
```

2. Remplacer :

```js

  function showEntry(prefix) {
    dom.listView.hidden = true;
    dom.entryView.hidden = false;
    window.scrollTo(0, 0);

```

par :

```js

  function showEntry(prefix) {
    ctx.show(dom.entryView);
    window.scrollTo(0, 0);

```

3. Remplacer :

```js
    const next = position >= 0 && position < sequence.length - 1 ? sequence[position + 1] : null;

    const back = el('a', { class: 'btn-secondary', href: state.lastListHash }, '← Retour à la liste');
    back.addEventListener('click', (event) => {
      // Revenir sur l'entrée d'historique de la liste plutôt qu'en créer une.
```

par :

```js
    const next = position >= 0 && position < sequence.length - 1 ? sequence[position + 1] : null;

    const back = el('a', { class: 'btn-secondary', href: state.lastListHash }, backLabel(state.lastListHash));
    back.addEventListener('click', (event) => {
      // Revenir sur l'entrée d'historique de la liste plutôt qu'en créer une.
```

4. Remplacer :

```js
      el('ul', { class: 'siblings' }, siblings.slice(0, 15).map((s) =>
        el('li', null, typeBadge(s.type), el('a', { href: entryHash(s) }, s.titre)))),
      siblings.length > 15 ? el('p', null, el('button', {
        type: 'button', class: 'link-button', 'data-action': 'project', 'data-project': entry._project,
      }, 'Voir les ' + (siblings.length + 1) + ' entrées du projet')) : null);
  }

```

par :

```js
      el('ul', { class: 'siblings' }, siblings.slice(0, 15).map((s) =>
        el('li', null, typeBadge(s.type), el('a', { href: entryHash(s) }, s.titre)))),
      siblings.length > 15 ? el('p', null, el('a', { href: projectHash(entry.projet) },
        'Voir les ' + (siblings.length + 1) + ' entrées du projet')) : null);
  }

```


- [ ] **Step 13: Créer `docs/js/vues/projet.js`**

```js
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

    const children = [
      el('nav', { class: 'page-nav', 'aria-label': 'Navigation' }, el('a', { class: 'btn-secondary', href: '#/' }, '← Tous les projets')),
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
      : el('div', { class: 'grid' }, group.entries.map((entry) => card(entry, { since: state.since, showProject: false })));
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
```

- [ ] **Step 14: Modifier `docs/js/app.js`**

10 remplacements, dans l'ordre (chaque bloc à remplacer est unique dans le fichier).

1. Remplacer :

```js
import { createListView } from './vues/entrees.js';
import { createEntryView } from './vues/fiche.js';

const CONFIG = {
```

par :

```js
import { createListView } from './vues/entrees.js';
import { createEntryView } from './vues/fiche.js';
import { createProjectView } from './vues/projet.js';

const CONFIG = {
```

2. Remplacer :

```js
  shown: CONFIG.pageSize,
  showAllProjects: false,
  lastList: [],          // résultat affiché, pour « précédente / suivante »
  lastListHash: '#/',
  scroll: new Map(),     // position de défilement par état de liste
  route: null,
  entryDepth: 0,         // fiches ouvertes depuis la liste (pour « Retour »)
  openedId: '',          // dernière fiche ouverte, pour lui rendre le focus au retour
};

const $ = (id) => document.getElementById(id);
const dom = {
  stats: $('stats'), listView: $('list-view'), entryView: $('entry-view'),
  search: $('search-input'), sort: $('sort-select'),
  typeChips: $('type-chips'), projectChips: $('project-chips'), activeFilters: $('active-filters'),
```

par :

```js
  shown: CONFIG.pageSize,
  showAllProjects: false,
  lastList: [],          // entrées de la vue affichée, pour « précédente / suivante »
  lastListHash: '#/',    // ancre de la dernière vue qui n'est pas une fiche
  scroll: new Map(),     // position de défilement par ancre
  route: null,
  entryDepth: 0,         // fiches ouvertes depuis la vue d'origine (pour « Retour »)
  openedId: '',          // dernière fiche ouverte, pour lui rendre le focus au retour
  firstRender: true,     // premier affichage : le focus reste en haut de page
};

const $ = (id) => document.getElementById(id);
const dom = {
  stats: $('stats'), listView: $('list-view'), entryView: $('entry-view'), pageView: $('page-view'),
  search: $('search-input'), sort: $('sort-select'),
  typeChips: $('type-chips'), projectChips: $('project-chips'), activeFilters: $('active-filters'),
```

3. Remplacer :

```js
};

const ctx = { config: CONFIG, state, dom, route, setFilters };
ctx.list = createListView(ctx);
ctx.entry = createEntryView(ctx);

// ------------------------------------------------------------ données
```

par :

```js
};

const ctx = { config: CONFIG, state, dom, route, setFilters, show, focusView };
ctx.list = createListView(ctx);
ctx.entry = createEntryView(ctx);
ctx.project = createProjectView(ctx);

// ------------------------------------------------------------ données
```

4. Remplacer :

```js
  dom.status.hidden = true;
  route();
}

```

par :

```js
  dom.status.hidden = true;
  route();
  state.firstRender = false;
}

```

5. Remplacer :

```js
}

// ------------------------------------------------------------ routage

/* Filtres de la liste pour une route autre qu'une fiche. En attendant leurs
   vues (accueil : Task 9, projet : Task 8, recherche : Task 11), l'accueil,
   la page projet et la recherche affichent la liste filtrée. */
function listFilters(target) {
  const filters = { q: '', ...defaultFilters() };
  if (target.view === 'entries') Object.assign(filters, target.filters);
  if (target.view === 'search') filters.q = target.q;
  if (target.view === 'project') filters.projet = target.id;
  return filters;
}
```

par :

```js
}

// ------------------------------------------------------------ vues

/* Affiche une des trois zones (liste, fiche, page) ; vide la fiche et la
   page quand elles sont masquées (identifiants de titres uniques). */
function show(section) {
  for (const zone of [dom.listView, dom.entryView, dom.pageView]) {
    zone.hidden = zone !== section;
    if (zone.hidden && zone !== dom.listView) zone.replaceChildren();
  }
}

/* Focus après l'affichage d'une page : au retour d'une fiche, sur le lien de
   cette fiche ; sinon sur le titre de la page, sauf au premier affichage et
   pendant la frappe dans la recherche. */
function focusView(returning) {
  if (returning && state.openedId) {
    const link = dom.pageView.querySelector('a[href="#/entree/' + state.openedId + '"]');
    if (link) { link.focus({ preventScroll: true }); return; }
  }
  if (state.firstRender || document.activeElement === dom.search) return;
  const title = dom.pageView.querySelector('#titre-vue');
  if (title) title.focus({ preventScroll: true });
}

// ------------------------------------------------------------ routage

/* Filtres de la liste pour une route qui l'affiche. En attendant leurs vues
   (accueil : Task 9, recherche : Task 11), l'accueil et la recherche
   affichent la liste filtrée. */
function listFilters(target) {
  const filters = { q: '', ...defaultFilters() };
  if (target.view === 'entries') Object.assign(filters, target.filters);
  if (target.view === 'search') filters.q = target.q;
  return filters;
}
```

6. Remplacer :

```js
function sameFilters(a, b) {
  return Object.keys(a).every((key) => a[key] === b[key]);
}

```

par :

```js
function sameFilters(a, b) {
  return Object.keys(a).every((key) => a[key] === b[key]);
}

/* Entrées affichées par la vue d'une ancre, dans l'ordre (Précédente/Suivante). */
function sequenceFor(origin) {
  if (origin.view === 'project') return ctx.project.projectEntries(origin.id);
  state.filters = listFilters(origin);
  return ctx.list.filtered().list;
}

```

7. Remplacer :

```js
  }
  state.route = next;

  if (next.view === 'entry') {
    // Le contexte (liste d'origine, nombre de fiches ouvertes depuis elle)
    // vit dans history.state : il survit au rechargement et au retour
    // arrière, et Précédente/Suivante le reprennent tel quel.
    const saved = history.state && typeof history.state.list === 'string' ? history.state : null;
    if (saved) {
      state.entryDepth = Number(saved.depth) || 0;
      const origin = parseHash(saved.list);
      if (saved.list !== state.lastListHash && origin.view !== 'entry' && origin.view !== 'redirect') {
        state.filters = listFilters(origin);
        state.lastListHash = saved.list;
        state.lastList = ctx.list.filtered().list;
      }
    } else if (previous && previous.view !== 'entry') {
      state.entryDepth = 1;
    } else if (previous && previous.view === 'entry') {
      state.entryDepth = state.entryDepth > 0 ? state.entryDepth + 1 : 0;
    } else {
      state.entryDepth = 0;
    }
    history.replaceState({ list: state.lastListHash, depth: state.entryDepth }, '');
    ctx.entry.showEntry(next.id);
    return;
  }
```

par :

```js
  }
  state.route = next;
  if (next.view === 'entry') {
    openEntry(next, previous);
    return;
  }
  const returning = Boolean(previous && previous.view === 'entry' && !state.typing);
  state.lastListHash = location.hash || '#/';
  if (next.view === 'project') {
    ctx.project.showProject(next.id, { returning });
    window.scrollTo(0, returning ? state.scroll.get(state.lastListHash) || 0 : 0);
    return;
  }
```

8. Remplacer :

```js
    state.shown = CONFIG.pageSize;
  }
  state.lastListHash = location.hash || '#/';
  ctx.list.showList(previous && previous.view === 'entry' && !state.typing);
}

```

par :

```js
    state.shown = CONFIG.pageSize;
  }
  ctx.list.showList(returning);
}

function openEntry(next, previous) {
  // Le contexte (vue d'origine, nombre de fiches ouvertes depuis elle) vit
  // dans history.state : il survit au rechargement et au retour arrière, et
  // Précédente/Suivante le reprennent tel quel.
  const saved = history.state && typeof history.state.list === 'string' ? history.state : null;
  if (saved) {
    state.entryDepth = Number(saved.depth) || 0;
    const origin = parseHash(saved.list);
    if (saved.list !== state.lastListHash && origin.view !== 'entry' && origin.view !== 'redirect') {
      state.lastListHash = saved.list;
      state.lastList = sequenceFor(origin);
    }
  } else if (previous && previous.view !== 'entry') {
    state.entryDepth = 1;
  } else if (previous && previous.view === 'entry') {
    state.entryDepth = state.entryDepth > 0 ? state.entryDepth + 1 : 0;
  } else {
    state.entryDepth = 0;
  }
  history.replaceState({ list: state.lastListHash, depth: state.entryDepth }, '');
  ctx.entry.showEntry(next.id);
}

```

9. Remplacer :

```js
  });

  // Délégation : projets et tags, dans la liste comme sur une fiche.
  document.addEventListener('click', (event) => {
    const target = event.target.closest('[data-action]');
    if (!target || !state.data) return;
    const action = target.dataset.action;
    if (action !== 'project' && action !== 'tag' && action !== 'group') return;
    event.preventDefault();
    if (action === 'group') {
```

par :

```js
  });

  // Délégation : tags (cartes, fiches) et groupes de la vue « Par projet ».
  document.addEventListener('click', (event) => {
    const target = event.target.closest('[data-action]');
    if (!target || !state.data) return;
    const action = target.dataset.action;
    if (action !== 'tag' && action !== 'group') return;
    event.preventDefault();
    if (action === 'group') {
```

10. Remplacer :

```js
      return;
    }
    const patch = action === 'project'
      ? { projet: target.dataset.project, type: '', tag: '', q: '' }
      : { tag: target.dataset.tag, type: '', projet: '', q: '' };
    if (state.route && state.route.view === 'entry') {
      const filters = Object.assign({}, state.filters, patch);
      location.hash = ctx.list.listHash(filters);
    } else {
      setFilters(patch);
```

par :

```js
      return;
    }
    const patch = { tag: target.dataset.tag, type: '', projet: '', q: '' };
    if (dom.listView.hidden) {
      location.hash = ctx.list.listHash(Object.assign({}, state.filters, patch));
    } else {
      setFilters(patch);
```


- [ ] **Step 15: Modifier `docs/index.html`**

Remplacer :

```html
    </section>

    <!-- Fiche d'une entrée -->
    <article id="entry-view" class="entry" hidden aria-labelledby="entry-title"></article>
```

par :

```html
    </section>

    <!-- Accueil, page projet, résultats de recherche -->
    <section id="page-view" aria-labelledby="titre-vue" hidden></section>

    <!-- Fiche d'une entrée -->
    <article id="entry-view" class="entry" hidden aria-labelledby="entry-title"></article>
```


- [ ] **Step 16: Modifier `docs/style.css`**

3 remplacements, dans l'ordre (chaque bloc à remplacer est unique dans le fichier).

1. Remplacer :

```css
}
.project-tag:hover { color: var(--text); border-color: var(--border-strong); }

.card h3 {
```

par :

```css
}
.project-tag:hover { color: var(--text); border-color: var(--border-strong); }
a.project-tag { display: inline-block; }

.card h3 {
```

2. Remplacer :

```css
.group-meta { font-size: 13px; color: var(--text-muted); }
.group-more { margin-top: 12px; }

/* ----------------------------------------------------------------- états */
```

par :

```css
.group-meta { font-size: 13px; color: var(--text-muted); }
.group-more { margin-top: 12px; }

/* ------------------------------------------------------------ page projet */

.page-nav { margin-bottom: 22px; }

.project-head {
  border-left: 4px solid var(--famille);
  padding: 4px 0 4px 18px;
  margin-bottom: 34px;
}
.project-family { font: 600 13px var(--sans); color: var(--text-muted); margin: 0 0 6px; }
.project-head[data-couleur] .project-family { color: var(--famille); }
.project-head h2 {
  font-family: var(--serif); font-weight: 600; font-size: 34px; line-height: 1.2;
  margin: 0 0 10px; overflow-wrap: anywhere;
}
.project-head h2:focus { outline: none; }
.project-description { font-family: var(--serif); font-size: 18px; line-height: 1.55; margin: 0 0 16px; max-width: 70ch; }
.project-links { list-style: none; margin: 0 0 14px; padding: 0; display: flex; flex-wrap: wrap; gap: 8px; }
.project-links a { overflow-wrap: anywhere; }
.project-dates { font-size: 13px; color: var(--text-muted); margin: 0; }

.project-section { margin-bottom: 34px; }
.project-section > h3 {
  font: 700 12px var(--sans); letter-spacing: 0.08em; text-transform: uppercase;
  color: var(--accent-strong); margin: 0 0 14px;
}
.project-section > h3 .count { color: var(--text-muted); }

.timeline { list-style: none; margin: 0; padding: 0 0 0 18px; border-left: 2px solid var(--border-strong); display: grid; gap: 16px; }
.timeline li { display: grid; grid-template-columns: 8.5em 1fr; gap: 4px 14px; align-items: baseline; }
.timeline time { font-size: 13px; color: var(--text-muted); }
.timeline a { font-family: var(--serif); font-weight: 600; font-size: 17px; overflow-wrap: anywhere; }
.timeline .new-badge { margin-left: 8px; }
.timeline p { margin: 4px 0 0; font-size: 14px; color: var(--text-muted); overflow-wrap: anywhere; }

.related-projects { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 8px; }
.related-projects li {
  display: inline-flex; flex-direction: column; gap: 2px;
  background: var(--surface); border: 1px solid var(--border); border-left: 4px solid var(--famille);
  border-radius: 12px; padding: 8px 14px; min-width: 0;
}
.related-projects a { font-weight: 600; overflow-wrap: anywhere; }
.related-family { font-size: 12px; color: var(--text-muted); }

/* ----------------------------------------------------------------- états */
```

3. Remplacer :

```css
  .facts { grid-template-columns: 1fr; }
  .facts dd { margin-bottom: 6px; }
}
```

par :

```css
  .facts { grid-template-columns: 1fr; }
  .facts dd { margin-bottom: 6px; }
  .project-head h2 { font-size: 27px; }
  .timeline li { grid-template-columns: 1fr; }
}
```


- [ ] **Step 17: Vérifier le succès**

Run: `node --test "tests/js/*.test.mjs"`
Expected: PASS — 35 tests.

Run: `cd tests/navigateur; npm test`
Expected: PASS — 60 tests.

- [ ] **Step 18: Commit**

```bash
git add docs/index.html docs/js/app.js docs/js/composants.js docs/js/donnees.js docs/js/vues/entrees.js docs/js/vues/fiche.js docs/js/vues/projet.js docs/style.css tests/js/donnees.test.mjs tests/js/projet.test.mjs tests/navigateur/fiche.test.mjs tests/navigateur/interface.test.mjs tests/navigateur/liste.test.mjs tests/navigateur/projet.test.mjs tests/navigateur/robustesse.test.mjs
git commit -m "Site : page projet (liens, entrées par nature, jalons, adresses, projets proches)

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Accueil : catalogue des projets par famille, en-tête commun

Spec § 4.3. `#/` devient le catalogue (familles dans l'ordre configuré, puis « Sans famille » ; activité la plus récente d'abord). Carte de projet : liseré, nom (serif, lien vers la page), description (3 lignes), « N entrées · dernière activité il y a 3 j », point « nouveau », bouton du lien principal **distinct** du nom. L'en-tête reçoit les onglets « Projets » / « Toutes les entrées » (`aria-current="page"`) et la barre de recherche, désormais sur toutes les vues ; le message de chargement sort de la liste (la liste est masquée au départ).

**Files:**

- Create: `docs/js/vues/accueil.js`
- Modify: `docs/index.html`, `docs/js/app.js`, `docs/js/composants.js`, `docs/js/donnees.js`, `docs/js/vues/fiche.js`, `docs/style.css`
- Test: `tests/js/accueil.test.mjs` (créé), `tests/navigateur/accueil.test.mjs` (créé), `tests/navigateur/fiche.test.mjs` (modifié), `tests/navigateur/interface.test.mjs` (modifié), `tests/navigateur/robustesse.test.mjs` (modifié), `tests/navigateur/site.test.mjs` (modifié)

**Interfaces:**

- Consumes: `projectHash`, `timeElement`, `isNew`, `newBadge`, `mainLinkButton`, `ctx.show`, `ctx.focusView` (Task 8).
- Produces:
  - `vues/accueil.js` : `homeGroups(projects, families) → [{ family | null, projects }]`, `createHomeView(ctx) → { showHome({ returning }) }`.
  - `composants.js` : `projectCard(project, { since = null } = {})`.
  - `donnees.js` : projets `_count` (entrées publiées), `_last` (ms).
  - `app.js` : `ctx.home`, `renderNav(view)`, `dom.navHome`, `dom.navEntries`.
  - `index.html` : `.header-bar` (`#nav-home`, `#nav-entries`, `#search-input`), `#status` dans `main`, `#list-view` masqué au départ.

- [ ] **Step 1: Test — Créer `tests/js/accueil.test.mjs`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { homeGroups } from '../../docs/js/vues/accueil.js';

test('catalogue : familles dans l’ordre, « Sans famille » à la fin, activité récente d’abord', () => {
  const familles = new Map([['jeux', { id: 'jeux', nom: 'Jeux', couleur: 1 }], ['vide', { id: 'vide', nom: 'Vide', couleur: 2 }],
    ['ia', { id: 'ia', nom: 'IA', couleur: 3 }]]);
  const projet = (id, famille, last, count = 1) => ({ id, nom: id, _family: familles.get(famille) || null, _last: last, _count: count });
  const projets = new Map([
    ['a', projet('a', 'ia', 5)], ['b', projet('b', 'jeux', 1)], ['c', projet('c', 'jeux', 9)],
    ['d', projet('d', null, 3)], ['e', projet('e', 'ia', 7, 0)],
  ].map(([k, p]) => [k, p]));
  const groupes = homeGroups(projets, familles);
  assert.deepEqual(groupes.map((g) => [g.family ? g.family.id : null, g.projects.map((p) => p.id)]),
    [['jeux', ['c', 'b']], ['ia', ['a']], [null, ['d']]]);
});
```

- [ ] **Step 2: Test — Créer `tests/navigateur/accueil.test.mjs`**

```js
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { ouvrirSite, terminer, attendreAncre } from './outils.mjs';
import { jeuDeTest } from './donnees-test.mjs';

let site;
before(async () => { site = await ouvrirSite(); });
after(async () => { await site.fermer(); });

const donnees = jeuDeTest();

async function accueil() {
  const page = await site.page({ donnees });
  await page.goto(site.url('#/'));
  await page.locator('.project-card').first().waitFor();
  return page;
}

function carteProjet(page, nom) {
  return page.locator('.project-card').filter({ has: page.getByRole('link', { name: nom, exact: true }) });
}

test('accueil : familles dans l’ordre configuré, puis « Sans famille »', async () => {
  const page = await accueil();
  const familles = (await page.locator('.family-title').allTextContents()).map((t) => t.replace(/\s/g, ' '));
  assert.deepEqual(familles, [
    'Jeux & univers de jeu · 2 projets', 'IA & simulations · 1 projet', 'Outils Claude · 3 projets', 'Sans famille · 1 projet']);
  assert.equal(await page.title(), 'Mémoire Vive');
  await terminer(page);
});

test('accueil : dans une famille, activité la plus récente d’abord', async () => {
  const page = await accueil();
  const outils = page.locator('.family').nth(2).locator('.project-card h3');
  assert.deepEqual(await outils.allTextContents(), ['Mémoire Vive', 'Bibliothèque Claude', 'Tour de contrôle']);
  await terminer(page);
});

test('carte de projet : liseré, description, activité, lien principal distinct du nom', async () => {
  const page = await accueil();
  const jarvis = carteProjet(page, 'Jarvis');
  assert.equal(await jarvis.getAttribute('data-couleur'), '3');
  assert.equal(await jarvis.locator('h3 a').getAttribute('href'), '#/projet/jarvis');
  assert.match(await jarvis.locator('.project-card-description').textContent(), /^Assistant vocal local/);
  assert.equal((await jarvis.locator('.meta-line').textContent()).replace(/\s/g, ' '), '16 entrées · dernière activité il y a 6 j');
  const bouton = jarvis.getByRole('link', { name: 'Ouvrir le site : Jarvis (nouvel onglet)' });
  assert.equal(await bouton.getAttribute('href'), 'https://exemple.github.io/jarvis/');
  assert.equal(await page.locator('a a').count(), 0, 'aucun lien imbriqué');
  assert.equal(await carteProjet(page, 'Depths').getByRole('link', { name: /^Dépôt : Depths/ }).count(), 1);
  await terminer(page);
});

test('point « nouveau » : projets actifs depuis la dernière visite', async () => {
  const page = await accueil();
  await page.evaluate(() => localStorage.setItem('memoire-vive:derniere-visite', '2026-09-19T00:00:00Z'));
  await page.reload();
  await page.locator('.project-card').first().waitFor();
  assert.deepEqual(await page.locator('.project-card:has(.new-badge) h3').allTextContents(), ['Mémoire Vive']);
  await terminer(page);
});

test('nom du projet : page du projet ; onglets de l’en-tête et page courante', async () => {
  const page = await accueil();
  assert.equal(await page.getAttribute('#nav-home', 'aria-current'), 'page');
  await carteProjet(page, 'Depths').locator('h3 a').click();
  await attendreAncre(page, '#/projet/depths');
  await page.locator('#titre-vue', { hasText: 'Depths' }).waitFor();
  assert.equal(await page.getAttribute('#nav-home', 'aria-current'), null);
  await page.getByRole('link', { name: 'Toutes les entrées', exact: true }).click();
  await page.locator('#grid .card').first().waitFor();
  assert.equal(await page.getAttribute('#nav-entries', 'aria-current'), 'page');
  await page.getByRole('link', { name: 'Projets', exact: true }).click();
  await page.locator('.project-card').first().waitFor();
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'titre-vue');
  await terminer(page);
});

test('barre de recherche sur toutes les vues ; taper depuis l’accueil puis « précédent »', async () => {
  const page = await accueil();
  for (const ancre of ['#/projet/jarvis', '#/entree/' + donnees.entrees[0].id.slice(0, 12), '#/']) {
    await page.goto(site.url(ancre));
    await page.locator('#titre-vue, #entry-title').first().waitFor();
    assert.ok(await page.locator('#search-input').isVisible(), ancre);
  }
  await page.locator('#search-input').pressSequentially('donjon', { delay: 40 });
  await attendreAncre(page, '#/recherche?q=donjon');
  await page.goBack();
  await page.locator('.project-card').first().waitFor();
  assert.ok(page.url().endsWith('#/'), page.url());
  await terminer(page);
});
```

- [ ] **Step 3: Test — Modifier `tests/navigateur/fiche.test.mjs`**

Remplacer :

```js
});

test('Échap sur une fiche introuvable : retour à la liste sans erreur', async () => {
  const page = await ouvrir('#/entree/0000000000ff', '#entry-title');
  await page.keyboard.press('Escape');
  await attendreAncre(page, '#/');
  await page.locator(CARTES).first().waitFor();
  assert.ok(page.url().endsWith('#/'), page.url());
  await terminer(page);
```

par :

```js
});

test('Échap sur une fiche introuvable : retour à l’accueil sans erreur', async () => {
  const page = await ouvrir('#/entree/0000000000ff', '#entry-title');
  await page.keyboard.press('Escape');
  await attendreAncre(page, '#/');
  await page.locator('.project-card').first().waitFor();
  assert.ok(page.url().endsWith('#/'), page.url());
  await terminer(page);
```


- [ ] **Step 4: Test — Modifier `tests/navigateur/interface.test.mjs`**

2 remplacements, dans l'ordre (chaque bloc à remplacer est unique dans le fichier).

1. Remplacer :

```js
});

test('mobile : pas de défilement horizontal (liste, fiche, vue par projet, page projet)', async () => {
  const archi = entreeTitree(donnees, 'Jarvis — architecture');
  const page = await ouvrir('#/entrees', { mobile: true });
```

par :

```js
});

test('mobile : pas de défilement horizontal (liste, fiche, vue par projet, page projet, accueil)', async () => {
  const archi = entreeTitree(donnees, 'Jarvis — architecture');
  const page = await ouvrir('#/entrees', { mobile: true });
```

2. Remplacer :

```js
  await page.locator('#titre-vue').waitFor();
  assert.ok(await debordement(page) <= 0, 'page projet');
  await terminer(page);
});
```

par :

```js
  await page.locator('#titre-vue').waitFor();
  assert.ok(await debordement(page) <= 0, 'page projet');
  await page.goto(site.url('#/'));
  await page.locator('.project-card').first().waitFor();
  assert.ok(await debordement(page) <= 0, 'accueil');
  await terminer(page);
});
```


- [ ] **Step 5: Test — Modifier `tests/navigateur/robustesse.test.mjs`**

Remplacer :

```js
test('données piégées (XSS) : aucune balise injectée, aucun lien javascript: ou data:', async () => {
  const page = await site.page({ donnees: donneesPiegees() });
  for (const [ancre, attendu] of [['#/entrees', '#grid .card'], ['#/entree/abcdef123456', '#entry-title'],
    ['#/projet/x', '#titre-vue']]) {
    await page.goto(site.url(ancre));
    await page.locator(attendu).first().waitFor();
```

par :

```js
test('données piégées (XSS) : aucune balise injectée, aucun lien javascript: ou data:', async () => {
  const page = await site.page({ donnees: donneesPiegees() });
  for (const [ancre, attendu] of [['#/', '.project-card'], ['#/entrees', '#grid .card'],
    ['#/entree/abcdef123456', '#entry-title'], ['#/projet/x', '#titre-vue']]) {
    await page.goto(site.url(ancre));
    await page.locator(attendu).first().waitFor();
```


- [ ] **Step 6: Test — Modifier `tests/navigateur/site.test.mjs`**

2 remplacements, dans l'ordre (chaque bloc à remplacer est unique dans le fichier).

1. Remplacer :

```js
  const page = await site.page({ donnees });
  await page.goto(site.url());
  await page.locator('.card').first().waitFor();
  assert.match(await page.textContent('#stats'), new RegExp('^' + donnees.nb_entrees + '\\sentrées'));
  await terminer(page);
```

par :

```js
  const page = await site.page({ donnees });
  await page.goto(site.url());
  await page.locator('.project-card').first().waitFor();
  assert.match(await page.textContent('#stats'), new RegExp('^' + donnees.nb_entrees + '\\sentrées'));
  await terminer(page);
```

2. Remplacer :

```js
  page.on('request', (r) => demandes.push(new URL(r.url()).pathname));
  await page.goto(site.url());
  await page.locator('.card').first().waitFor();
  const racine = new URL(site.base).pathname;
  assert.ok(demandes.includes(racine + 'js/app.js'), demandes.join(' '));
```

par :

```js
  page.on('request', (r) => demandes.push(new URL(r.url()).pathname));
  await page.goto(site.url());
  await page.locator('.project-card').first().waitFor();
  const racine = new URL(site.base).pathname;
  assert.ok(demandes.includes(racine + 'js/app.js'), demandes.join(' '));
```


- [ ] **Step 7: Vérifier l'échec**

Run: `node --test "tests/js/*.test.mjs"`
Expected: FAIL — accueil.test : `ERR_MODULE_NOT_FOUND` (`docs/js/vues/accueil.js`).

Run: `cd tests/navigateur; npm test`
Expected: FAIL — 11 échecs : les 6 tests d'accueil.test.mjs et les 2 premiers de site.test.mjs (aucune `.project-card`), « Échap sur une fiche introuvable » (attend l'accueil), mobile et données piégées (accueil).

- [ ] **Step 8: Modifier `docs/js/donnees.js`**

Remplacer :

```js
  });

  // Voisins (calculés à l'export) : entrées publiées, score numérique fini.
  const byId = new Map(entries.map((e) => [String(e.id), e]));
```

par :

```js
  });

  // Nombre d'entrées publiées et dernière activité (ms) de chaque projet.
  for (const project of projects.values()) Object.assign(project, { _count: 0, _last: 0 });
  for (const entry of entries) {
    const project = projects.get(entry.projet);
    if (!project) continue;
    project._count += 1;
    project._last = Math.max(project._last, entry._time);
  }

  // Voisins (calculés à l'export) : entrées publiées, score numérique fini.
  const byId = new Map(entries.map((e) => [String(e.id), e]));
```


- [ ] **Step 9: Modifier `docs/js/composants.js`**

Remplacer :

```js
}

export function chip(label, count, pressed, onClick, focusKey, extraClass) {
  const button = el('button', {
```

par :

```js
}

/* Carte d'un projet : le nom mène à sa page, le bouton du lien principal
   est un lien distinct (jamais un lien dans un autre). */
export function projectCard(project, { since = null } = {}) {
  const last = project._last ? new Date(project._last).toISOString() : null;
  return el('article', { class: 'project-card', 'data-couleur': project._family ? project._family.couleur : null },
    el('h3', null, el('a', { href: projectHash(project.id) }, project.nom)),
    project.description ? el('p', { class: 'project-card-description' }, project.description) : null,
    el('p', { class: 'meta-line' },
      plural(project._count, 'entrée', 'entrées'),
      last ? [' · dernière activité ', timeElement(last)] : null,
      isNew({ _time: project._last }, since) ? newBadge() : null),
    project._mainLink ? el('div', { class: 'actions' }, mainLinkButton(project._mainLink, project.nom)) : null);
}

export function chip(label, count, pressed, onClick, focusKey, extraClass) {
  const button = el('button', {
```


- [ ] **Step 10: Modifier `docs/js/vues/fiche.js`**

Remplacer :

```js
        el('h2', { id: 'entry-title', tabindex: '-1' }, 'Entrée introuvable'),
        el('p', null, "Cette entrée n'existe pas ou n'est plus dans la mémoire publiée."),
        el('a', { class: 'btn-secondary', href: '#/' }, '← Retour à la liste')));
      dom.entryView.querySelector('h2').focus();
      return;
```

par :

```js
        el('h2', { id: 'entry-title', tabindex: '-1' }, 'Entrée introuvable'),
        el('p', null, "Cette entrée n'existe pas ou n'est plus dans la mémoire publiée."),
        el('a', { class: 'btn-secondary', href: '#/' }, '← Retour à l’accueil')));
      dom.entryView.querySelector('h2').focus();
      return;
```


- [ ] **Step 11: Créer `docs/js/vues/accueil.js`**

```js
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
```

- [ ] **Step 12: Modifier `docs/js/app.js`**

9 remplacements, dans l'ordre (chaque bloc à remplacer est unique dans le fichier).

1. Remplacer :

```js
import { createEntryView } from './vues/fiche.js';
import { createProjectView } from './vues/projet.js';

const CONFIG = {
```

par :

```js
import { createEntryView } from './vues/fiche.js';
import { createProjectView } from './vues/projet.js';
import { createHomeView } from './vues/accueil.js';

const CONFIG = {
```

2. Remplacer :

```js
  resultCount: $('result-count'), status: $('status'), grid: $('grid'), groups: $('groups'),
  more: $('more'), moreBtn: $('more-btn'), empty: $('empty'),
  themeToggle: $('theme-toggle'),
};

```

par :

```js
  resultCount: $('result-count'), status: $('status'), grid: $('grid'), groups: $('groups'),
  more: $('more'), moreBtn: $('more-btn'), empty: $('empty'),
  themeToggle: $('theme-toggle'), navHome: $('nav-home'), navEntries: $('nav-entries'),
};

```

3. Remplacer :

```js
ctx.entry = createEntryView(ctx);
ctx.project = createProjectView(ctx);

// ------------------------------------------------------------ données
```

par :

```js
ctx.entry = createEntryView(ctx);
ctx.project = createProjectView(ctx);
ctx.home = createHomeView(ctx);

// ------------------------------------------------------------ données
```

4. Remplacer :

```js
  button.addEventListener('click', () => location.reload());
  dom.status.replaceChildren(el('p', null, message), button);
  dom.grid.hidden = true;
  dom.groups.hidden = true;
  dom.stats.textContent = '';
}
```

par :

```js
  button.addEventListener('click', () => location.reload());
  dom.status.replaceChildren(el('p', null, message), button);
  dom.stats.textContent = '';
}
```

5. Remplacer :

```js
// ------------------------------------------------------------ routage

/* Filtres de la liste pour une route qui l'affiche. En attendant leurs vues
   (accueil : Task 9, recherche : Task 11), l'accueil et la recherche
   affichent la liste filtrée. */
function listFilters(target) {
  const filters = { q: '', ...defaultFilters() };
```

par :

```js
// ------------------------------------------------------------ routage

/* Filtres de la liste pour une route qui l'affiche. En attendant sa vue
   (Task 11), la recherche affiche la liste filtrée. */
function listFilters(target) {
  const filters = { q: '', ...defaultFilters() };
```

6. Remplacer :

```js
  const returning = Boolean(previous && previous.view === 'entry' && !state.typing);
  state.lastListHash = location.hash || '#/';
  if (next.view === 'project') {
    ctx.project.showProject(next.id, { returning });
```

par :

```js
  const returning = Boolean(previous && previous.view === 'entry' && !state.typing);
  state.lastListHash = location.hash || '#/';
  renderNav(next.view);
  if (next.view === 'home') {
    ctx.home.showHome({ returning });
    window.scrollTo(0, returning ? state.scroll.get(state.lastListHash) || 0 : 0);
    return;
  }
  if (next.view === 'project') {
    ctx.project.showProject(next.id, { returning });
```

7. Remplacer :

```js
  }
  ctx.list.showList(returning);
}

```

par :

```js
  }
  ctx.list.showList(returning);
}

/* Onglets de l'en-tête : la rubrique affichée porte aria-current. */
function renderNav(view) {
  for (const [link, name] of [[dom.navHome, 'home'], [dom.navEntries, 'entries']]) {
    if (view === name) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
}

```

8. Remplacer :

```js
  }
  history.replaceState({ list: state.lastListHash, depth: state.entryDepth }, '');
  ctx.entry.showEntry(next.id);
}
```

par :

```js
  }
  history.replaceState({ list: state.lastListHash, depth: state.entryDepth }, '');
  renderNav('entry');
  ctx.entry.showEntry(next.id);
}
```

9. Remplacer :

```js
    if (event.ctrlKey || event.metaKey || event.altKey || isTyping(event.target) || !state.data) return;
    const inEntry = state.route && state.route.view === 'entry';
    if (event.key === '/' && !inEntry) {
      event.preventDefault();
      dom.search.focus();
```

par :

```js
    if (event.ctrlKey || event.metaKey || event.altKey || isTyping(event.target) || !state.data) return;
    const inEntry = state.route && state.route.view === 'entry';
    if (event.key === '/') {
      event.preventDefault();
      dom.search.focus();
```


- [ ] **Step 13: Modifier `docs/index.html`**

2 remplacements, dans l'ordre (chaque bloc à remplacer est unique dans le fichier).

1. Remplacer :

```html
    <p class="subtitle">Tout ce que Claude sait de mes projets — architecture, décisions, jalons — retrouvé, cherché et trié en un seul endroit.</p>
    <p class="stats" id="stats" aria-live="polite"></p>
  </header>

  <main id="contenu" tabindex="-1">
    <!-- Vue liste -->
    <section id="list-view" aria-label="Entrées de la mémoire">
      <div class="toolbar">
        <div class="search-box">
          <label for="search-input" class="visually-hidden">Rechercher dans la mémoire</label>
          <input type="search" id="search-input" placeholder="Rechercher…  (touche /)" autocomplete="off" spellcheck="false">
        </div>
        <div class="toolbar-controls">
          <label for="sort-select" class="visually-hidden">Trier</label>
```

par :

```html
    <p class="subtitle">Tout ce que Claude sait de mes projets — architecture, décisions, jalons — retrouvé, cherché et trié en un seul endroit.</p>
    <p class="stats" id="stats" aria-live="polite"></p>
    <div class="header-bar">
      <nav class="main-nav" aria-label="Rubriques">
        <a href="#/" id="nav-home">Projets</a>
        <a href="#/entrees" id="nav-entries">Toutes les entrées</a>
      </nav>
      <div class="search-box" role="search">
        <label for="search-input" class="visually-hidden">Rechercher dans la mémoire</label>
        <input type="search" id="search-input" placeholder="Rechercher…  (touche /)" autocomplete="off" spellcheck="false">
      </div>
    </div>
  </header>

  <main id="contenu" tabindex="-1">
    <div class="status" id="status">Chargement de la mémoire…</div>

    <!-- Toutes les entrées -->
    <section id="list-view" aria-label="Toutes les entrées" hidden>
      <div class="toolbar">
        <div class="toolbar-controls">
          <label for="sort-select" class="visually-hidden">Trier</label>
```

2. Remplacer :

```html

      <p class="result-count" id="result-count" aria-live="polite" tabindex="-1"></p>
      <div class="status" id="status">Chargement de la mémoire…</div>
      <div class="grid" id="grid" hidden></div>
      <div id="groups" hidden></div>
```

par :

```html

      <p class="result-count" id="result-count" aria-live="polite" tabindex="-1"></p>
      <div class="grid" id="grid" hidden></div>
      <div id="groups" hidden></div>
```


- [ ] **Step 14: Modifier `docs/style.css`**

3 remplacements, dans l'ordre (chaque bloc à remplacer est unique dans le fichier).

1. Remplacer :

```css

.subtitle { color: var(--text-muted); font-size: 16px; margin: 0 0 6px; max-width: 70ch; }
.stats { color: var(--text-muted); font-size: 13px; margin: 0 0 28px; min-height: 1.5em; }

.theme-toggle {
```

par :

```css

.subtitle { color: var(--text-muted); font-size: 16px; margin: 0 0 6px; max-width: 70ch; }
.stats { color: var(--text-muted); font-size: 13px; margin: 0 0 16px; min-height: 1.5em; }

.header-bar { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; margin-bottom: 28px; }
.main-nav { display: inline-flex; border: 1px solid var(--border); border-radius: 12px; overflow: hidden; background: var(--surface); }
.main-nav a { padding: 11px 16px; font: 600 14px var(--sans); color: var(--text-muted); text-decoration: none; white-space: nowrap; }
.main-nav a + a { border-left: 1px solid var(--border); }
.main-nav a:hover { color: var(--text); }
.main-nav a[aria-current="page"] { background: var(--accent-fill); color: var(--on-accent); }
.main-nav a:focus-visible { outline-offset: -4px; border-radius: 9px; }
.main-nav a[aria-current="page"]:focus-visible { outline-color: var(--on-accent); }

.theme-toggle {
```

2. Remplacer :

```css
.group-more { margin-top: 12px; }

/* ------------------------------------------------------------ page projet */

```

par :

```css
.group-more { margin-top: 12px; }

/* ---------------------------------------------------------------- accueil */

.home-head { margin-bottom: 26px; }
.home-head h2 { font-family: var(--serif); font-weight: 600; font-size: 30px; line-height: 1.2; margin: 0 0 6px; }
.home-head h2:focus { outline: none; }
.home-intro { color: var(--text-muted); font-size: 14px; margin: 0; }

.family { margin-bottom: 38px; }
.family-title {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  font-family: var(--serif); font-weight: 600; font-size: 22px; margin: 0 0 14px;
  padding-bottom: 8px; border-bottom: 1px solid var(--border);
}
.family-title .count { font: 500 13px var(--sans); color: var(--text-muted); }
.family-dot { width: 12px; height: 12px; border-radius: 50%; background: var(--famille); flex-shrink: 0; }

.project-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 16px; }
.project-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-left: 4px solid var(--famille);
  border-radius: 16px;
  padding: 20px 22px;
  display: flex; flex-direction: column; gap: 10px;
  min-width: 0;
}
.project-card:hover { border-color: var(--border-strong); border-left-color: var(--famille); box-shadow: var(--shadow); }
.project-card h3 { font-family: var(--serif); font-weight: 600; font-size: 21px; line-height: 1.25; margin: 0; overflow-wrap: anywhere; }
.project-card h3 a { color: inherit; text-decoration: none; }
.project-card h3 a:hover { color: var(--accent-strong); text-decoration: underline; text-underline-offset: 3px; }
.project-card-description {
  font-size: 14px; color: var(--text-muted); line-height: 1.55; margin: 0; flex: 1;
  display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;
  overflow-wrap: anywhere;
}
.project-card .meta-line { align-items: center; margin: 0; }
.project-card .actions { display: flex; flex-wrap: wrap; gap: 8px; }

/* ------------------------------------------------------------ page projet */

```

3. Remplacer :

```css
  /* 16 px minimum : sinon iOS Safari zoome la page au focus. */
  .search-box input, select { font-size: 16px; }
  .grid { grid-template-columns: 1fr; }
  .card { padding: 18px; }
  .entry h2#entry-title { font-size: 26px; }
```

par :

```css
  /* 16 px minimum : sinon iOS Safari zoome la page au focus. */
  .search-box input, select { font-size: 16px; }
  .grid, .project-grid { grid-template-columns: 1fr; }
  .main-nav { width: 100%; }
  .main-nav a { flex: 1; text-align: center; padding: 11px 8px; }
  .card { padding: 18px; }
  .entry h2#entry-title { font-size: 26px; }
```


- [ ] **Step 15: Vérifier le succès**

Run: `node --test "tests/js/*.test.mjs"`
Expected: PASS — 36 tests.

Run: `cd tests/navigateur; npm test`
Expected: PASS — 66 tests.

- [ ] **Step 16: Commit**

```bash
git add docs/index.html docs/js/app.js docs/js/composants.js docs/js/donnees.js docs/js/vues/accueil.js docs/js/vues/fiche.js docs/style.css tests/js/accueil.test.mjs tests/navigateur/accueil.test.mjs tests/navigateur/fiche.test.mjs tests/navigateur/interface.test.mjs tests/navigateur/robustesse.test.mjs tests/navigateur/site.test.mjs
git commit -m "Site : accueil en catalogue des projets par famille, recherche dans l'en-tête

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Toutes les entrées : filtre famille, vue Liste, fin de « Par projet »

Spec § 4.6 et § 2 (« Vue Par projet actuelle : supprimée »). Pastilles de famille dans l'ordre configuré puis « Sans famille » (`famille=_aucune`), avec le nom écrit ; les pastilles de projet se restreignent d'elles-mêmes à la famille choisie. Deux vues : « Grille » (cartes) et « Liste » (une ligne : type, titre, projet, date relative, icône du lien principal), toutes deux avec « Afficher plus ». Le lien principal de chaque entrée (titre de carte ou de ligne) porte la classe `entry-link`, cible commune du focus au retour d'une fiche et après « Afficher plus ».

**Files:**

- Modify: `docs/index.html`, `docs/js/app.js`, `docs/js/composants.js`, `docs/js/donnees.js`, `docs/js/routes.js`, `docs/js/vues/entrees.js`, `docs/style.css`
- Test: `tests/js/routes.test.mjs` (modifié), `tests/navigateur/interface.test.mjs` (modifié), `tests/navigateur/liste.test.mjs` (modifié), `tests/navigateur/navigation.test.mjs` (modifié), `tests/navigateur/robustesse.test.mjs` (modifié)

**Interfaces:**

- Consumes: `defaultFilters` (champ `famille`), familles (Task 7), `timeElement`, `isNew`.
- Produces:
  - `routes.js` : `VIEWS = ['grille', 'liste']`.
  - `donnees.js` : `NO_FAMILY = '_aucune'`.
  - `composants.js` : `mainLinkIcon(link, name)`, `entryLine(entry, { targets, since })` ; `typeCount` et `TYPE_PLURALS` retirés.
  - `vues/entrees.js` : `familyKey(entry)` ; `dom.familyChips`, `dom.lines`.
  - `index.html` : `#family-chips`, `<ul id="lines" class="entry-list">`, boutons « Grille » / « Liste ».

- [ ] **Step 1: Test — Modifier `tests/js/routes.test.mjs`**

2 remplacements, dans l'ordre (chaque bloc à remplacer est unique dans le fichier).

1. Remplacer :

```js
test('toutes les entrées : filtres lus et validés', () => {
  assert.deepEqual(parseHash('#/entrees'), { view: 'entries', filters: defaultFilters() });
  assert.deepEqual(parseHash('#/entrees?type=note&projet=jarvis&famille=ia&tag=bug&tri=ancien&vue=projets').filters,
    { type: 'note', projet: 'jarvis', famille: 'ia', tag: 'bug', tri: 'ancien', vue: 'projets' });
  assert.deepEqual(parseHash('#/entrees?tri=pertinence&vue=mosaique').filters, defaultFilters());
});

```

par :

```js
test('toutes les entrées : filtres lus et validés', () => {
  assert.deepEqual(parseHash('#/entrees'), { view: 'entries', filters: defaultFilters() });
  assert.deepEqual(parseHash('#/entrees?type=note&projet=jarvis&famille=ia&tag=bug&tri=ancien&vue=liste').filters,
    { type: 'note', projet: 'jarvis', famille: 'ia', tag: 'bug', tri: 'ancien', vue: 'liste' });
  assert.deepEqual(parseHash('#/entrees?tri=pertinence&vue=projets').filters, defaultFilters());
});

```

2. Remplacer :

```js
  assert.deepEqual(parseHash('#/?q=jarvis&type=milestone'), { view: 'redirect', hash: '#/recherche?q=jarvis' });
  assert.deepEqual(parseHash('#/?type=milestone&tri=ancien&vue=projets'),
    { view: 'redirect', hash: '#/entrees?type=milestone&tri=ancien&vue=projets' });
  assert.deepEqual(parseHash('#/?q=%20%20&tri=pertinence'), { view: 'redirect', hash: '#/entrees' });
  assert.deepEqual(parseHash('#?projet=jarvis'), { view: 'redirect', hash: '#/entrees?projet=jarvis' });
```

par :

```js
  assert.deepEqual(parseHash('#/?q=jarvis&type=milestone'), { view: 'redirect', hash: '#/recherche?q=jarvis' });
  assert.deepEqual(parseHash('#/?type=milestone&tri=ancien&vue=projets'),
    { view: 'redirect', hash: '#/entrees?type=milestone&tri=ancien' });
  assert.deepEqual(parseHash('#/?q=%20%20&tri=pertinence'), { view: 'redirect', hash: '#/entrees' });
  assert.deepEqual(parseHash('#?projet=jarvis'), { view: 'redirect', hash: '#/entrees?projet=jarvis' });
```


- [ ] **Step 2: Test — Modifier `tests/navigateur/interface.test.mjs`**

2 remplacements, dans l'ordre (chaque bloc à remplacer est unique dans le fichier).

1. Remplacer :

```js
});

test('mobile : pas de défilement horizontal (liste, fiche, vue par projet, page projet, accueil)', async () => {
  const archi = entreeTitree(donnees, 'Jarvis — architecture');
  const page = await ouvrir('#/entrees', { mobile: true });
```

par :

```js
});

test('mobile : pas de défilement horizontal (grille, fiche, vue Liste, page projet, accueil)', async () => {
  const archi = entreeTitree(donnees, 'Jarvis — architecture');
  const page = await ouvrir('#/entrees', { mobile: true });
```

2. Remplacer :

```js
  await page.locator('#entry-title').waitFor();
  assert.ok(await debordement(page) <= 0, 'fiche');
  await page.goto(site.url('#/entrees?vue=projets'));
  await page.locator('.group').first().waitFor();
  assert.ok(await debordement(page) <= 0, 'vue par projet');
  await page.goto(site.url('#/projet/jarvis'));
  await page.locator('#titre-vue').waitFor();
```

par :

```js
  await page.locator('#entry-title').waitFor();
  assert.ok(await debordement(page) <= 0, 'fiche');
  await page.goto(site.url('#/entrees?vue=liste'));
  await page.locator('.entry-line').first().waitFor();
  assert.ok(await debordement(page) <= 0, 'vue Liste');
  await page.goto(site.url('#/projet/jarvis'));
  await page.locator('#titre-vue').waitFor();
```


- [ ] **Step 3: Test — Modifier `tests/navigateur/liste.test.mjs`**

Remplacer :

```js
});

test('vue par projet : un groupe par projet et « Sans projet » ; accords corrects', async () => {
  const page = await liste();
  await page.getByRole('button', { name: 'Par projet' }).click();
  await page.locator('#groups .group').first().waitFor();
  assert.equal(await page.locator('#groups .group').count(), donnees.projets.length + 1);
  const metas = await page.locator('.group-meta').allTextContents();
  assert.ok(!metas.some((m) => /\b([2-9]|\d{2,})\s(note|jalon|décision|référence|erreur)\b/.test(m)), metas.join(' | '));
  await terminer(page);
});
```

par :

```js
});

test('vue Liste : une ligne par entrée (type, titre, projet, date, icône du lien principal)', async () => {
  const page = await liste();
  await page.getByRole('button', { name: 'Liste', exact: true }).click();
  await attendreAncre(page, 'vue=liste');
  assert.equal(await page.locator('#lines .entry-line').count(), 60);
  assert.equal(await page.locator('#grid').isHidden(), true);
  const ligne = page.locator('.entry-line').filter({ has: page.getByRole('link', { name: 'Jarvis — architecture', exact: true }) });
  assert.equal(await ligne.locator('.type-badge').textContent(), 'Référence');
  assert.equal(await ligne.locator('.entry-line-project').textContent(), 'Jarvis');
  assert.equal(await ligne.getAttribute('data-couleur'), '3');
  assert.match(await ligne.locator('time').getAttribute('title'), /2026/);
  const icone = ligne.getByRole('link', { name: 'Ouvrir le site : Jarvis — architecture (nouvel onglet)' });
  assert.equal(await icone.getAttribute('href'), 'https://exemple.github.io/jarvis/');
  await page.click('#more-btn');
  assert.equal(await page.locator('#lines .entry-line').count(), donnees.nb_entrees);
  assert.equal(await page.evaluate(() => document.activeElement?.textContent), await page.locator('#lines .entry-link').nth(60).textContent());
  assert.equal(await page.getByRole('button', { name: 'Par projet' }).count(), 0, 'vue « Par projet » supprimée');
  await terminer(page);
});

test('filtre famille : ordre configuré, « Sans famille », filtre et URL', async () => {
  const page = await liste();
  const noms = (await page.locator('#family-chips .chip').allTextContents()).map((t) => t.replace(/\s*\d+$/, ''));
  assert.deepEqual(noms, ['Toutes les familles', 'Jeux & univers de jeu', 'IA & simulations', 'Outils Claude', 'Sans famille']);
  await page.locator('#family-chips .chip', { hasText: 'IA & simulations' }).click();
  await attendreAncre(page, 'famille=ia');
  const couleurs = await page.locator('#grid .card').evaluateAll((cs) => cs.map((c) => c.getAttribute('data-couleur')));
  assert.equal(couleurs.length, 16);
  assert.ok(couleurs.every((c) => c === '3'));
  const projets = (await page.locator('#project-chips .chip').allTextContents()).map((t) => t.replace(/\s*\d+$/, ''));
  assert.deepEqual(projets, ['Tous les projets', '📁︎ Jarvis']);
  await page.locator('#family-chips .chip', { hasText: 'Sans famille' }).click();
  await attendreAncre(page, 'famille=_aucune');
  assert.equal(await page.locator('#grid .card').count(), 2);
  await terminer(page);
});
```


- [ ] **Step 4: Test — Modifier `tests/navigateur/navigation.test.mjs`**

Remplacer :

```js

test('ancienne ancre de filtres : redirigée vers #/entrees, filtres gardés', async () => {
  const page = await ouvrir('#/?type=milestone&tri=ancien');
  assert.ok(page.url().endsWith('#/entrees?type=milestone&tri=ancien'), page.url());
  const badges = await page.locator('#grid .type-badge').allTextContents();
```

par :

```js

test('ancienne ancre de filtres : redirigée vers #/entrees, filtres gardés', async () => {
  const page = await ouvrir('#/?type=milestone&tri=ancien&vue=projets');
  assert.ok(page.url().endsWith('#/entrees?type=milestone&tri=ancien'), page.url());
  const badges = await page.locator('#grid .type-badge').allTextContents();
```


- [ ] **Step 5: Test — Modifier `tests/navigateur/robustesse.test.mjs`**

Données piégées aussi dans la vue Liste (`entryLine`, `mainLinkIcon` : le projet piégé a un lien principal `javascript:`).

Remplacer :

```js
  for (const [ancre, attendu] of [['#/', '.project-card'], ['#/entrees', '#grid .card'],
    ['#/entree/abcdef123456', '#entry-title'], ['#/projet/x', '#titre-vue']]) {
```

par :

```js
  for (const [ancre, attendu] of [['#/', '.project-card'], ['#/entrees', '#grid .card'], ['#/entrees?vue=liste', '.entry-line'],
    ['#/entree/abcdef123456', '#entry-title'], ['#/projet/x', '#titre-vue']]) {
```


- [ ] **Step 6: Vérifier l'échec**

Run: `node --test tests/js/routes.test.mjs`
Expected: FAIL — « toutes les entrées : filtres lus et validés » (`vue=liste` refusée) et « anciennes ancres » (`vue=projets` encore gardée).

Run: `cd tests/navigateur; node --test liste.test.mjs interface.test.mjs navigation.test.mjs robustesse.test.mjs`
Expected: FAIL — 5 échecs : « vue Liste » (pas de bouton « Liste »), « filtre famille » (pas de `#family-chips`), mobile et données piégées (`#/entrees?vue=liste` sans `.entry-line`), « ancienne ancre de filtres » (`vue=projets` encore gardée).

- [ ] **Step 7: Modifier `docs/js/donnees.js`**

Remplacer :

```js

export const NO_PROJECT = '_aucun';

export class DataError extends Error {}
```

par :

```js

export const NO_PROJECT = '_aucun';
export const NO_FAMILY = '_aucune';

export class DataError extends Error {}
```


- [ ] **Step 8: Modifier `docs/js/routes.js`**

Remplacer :

```js

export const SORTS = ['recent', 'ancien', 'projet'];
export const VIEWS = ['grille', 'projets'];
const FILTER_KEYS = ['type', 'projet', 'famille', 'tag'];

```

par :

```js

export const SORTS = ['recent', 'ancien', 'projet'];
export const VIEWS = ['grille', 'liste'];
const FILTER_KEYS = ['type', 'projet', 'famille', 'tag'];

```


- [ ] **Step 9: Modifier `docs/js/composants.js`**

4 remplacements, dans l'ordre (chaque bloc à remplacer est unique dans le fichier).

1. Remplacer :

```js
  note: 'Note', milestone: 'Jalon', decision: 'Décision', reference: 'Référence',
  architecture: 'Architecture', observation: 'Observation', error: 'Erreur',
};
const TYPE_PLURALS = {
  note: 'notes', milestone: 'jalons', decision: 'décisions', reference: 'références',
  architecture: 'architectures', observation: 'observations', error: 'erreurs',
};

```

par :

```js
  note: 'Note', milestone: 'Jalon', decision: 'Décision', reference: 'Référence',
  architecture: 'Architecture', observation: 'Observation', error: 'Erreur',
};

```

2. Remplacer :

```js
export function plural(count, one, many) {
  return count + '\xa0' + (count > 1 ? many : one);
}

export function typeCount(type, count) {
  const one = typeLabel(type).toLowerCase();
  return plural(count, one, TYPE_PLURALS[type] || one + 's');
}

```

par :

```js
export function plural(count, one, many) {
  return count + '\xa0' + (count > 1 ? many : one);
}

```

3. Remplacer :

```js
    el('div', { class: 'badges' }, typeBadge(entry.type), entry.projet && showProject ? projectButton(entry) : null,
      isNew(entry, since) ? newBadge() : null),
    el('h3', null, el('a', { href: entryHash(entry) }, highlight(entry.titre, targets))),
    entry.resume ? el('p', { class: 'resume' }, highlight(entry.resume, targets)) : null,
    el('div', { class: 'meta-line' }, timeElement(entry.cree_le), linksInfo(entry)),
```

par :

```js
    el('div', { class: 'badges' }, typeBadge(entry.type), entry.projet && showProject ? projectButton(entry) : null,
      isNew(entry, since) ? newBadge() : null),
    el('h3', null, el('a', { class: 'entry-link', href: entryHash(entry) }, highlight(entry.titre, targets))),
    entry.resume ? el('p', { class: 'resume' }, highlight(entry.resume, targets)) : null,
    el('div', { class: 'meta-line' }, timeElement(entry.cree_le), linksInfo(entry)),
```

4. Remplacer :

```js
      mainLinkButton(entry._mainLink, entry.titre)),
  );
}

```

par :

```js
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

/* Ligne d'une entrée (vue « Liste ») : type, titre, projet, date relative,
   icône du lien principal. */
export function entryLine(entry, { targets = null, since = null } = {}) {
  return el('li', { class: 'entry-line', 'data-couleur': entry._family ? entry._family.couleur : null },
    typeBadge(entry.type),
    el('a', { class: 'entry-link', href: entryHash(entry) }, highlight(entry.titre, targets)),
    isNew(entry, since) ? newBadge() : null,
    el('span', { class: 'entry-line-project' }, entry.projet ? entry._projectName : 'Sans projet'),
    timeElement(entry.cree_le),
    mainLinkIcon(entry._mainLink, entry.titre));
}

```


- [ ] **Step 10: Modifier `docs/js/vues/entrees.js`**

10 remplacements, dans l'ordre (chaque bloc à remplacer est unique dans le fichier).

1. Remplacer :

```js
/* Vue liste : filtres (recherche, type, projet, tag), tri, grille ou
   regroupement par projet, « Afficher plus ». */
import { normalize, search } from '../recherche.js';
import { entriesHash, searchHash } from '../routes.js';
import { el, plural, typeLabel, typeCount, formatDay, card, chip } from '../composants.js';
import { NO_PROJECT } from '../donnees.js';

export function createListView(ctx) {
```

par :

```js
/* Toutes les entrées : filtres (type, famille, projet, tag), tri, vue
   « Grille » (cartes) ou « Liste » (une ligne par entrée), « Afficher plus ». */
import { normalize, search } from '../recherche.js';
import { entriesHash, searchHash } from '../routes.js';
import { el, plural, typeLabel, card, entryLine, chip } from '../composants.js';
import { NO_PROJECT, NO_FAMILY } from '../donnees.js';

export function familyKey(entry) {
  return entry._family ? entry._family.id : NO_FAMILY;
}

export function createListView(ctx) {
```

2. Remplacer :

```js
    const f = state.filters;
    if (except !== 'type' && f.type && entry.type !== f.type) return false;
    if (except !== 'projet' && f.projet && entry._project !== f.projet) return false;
    if (f.tag && !entry._tags.includes(normalize(f.tag))) return false;
```

par :

```js
    const f = state.filters;
    if (except !== 'type' && f.type && entry.type !== f.type) return false;
    if (except !== 'famille' && f.famille && familyKey(entry) !== f.famille) return false;
    if (except !== 'projet' && f.projet && entry._project !== f.projet) return false;
    if (f.tag && !entry._tags.includes(normalize(f.tag))) return false;
```

3. Remplacer :

```js
    if (restoreScroll) {
      window.scrollTo(0, state.scroll.get(state.lastListHash) || 0);
      // Au retour d'une fiche, le focus revient sur sa carte.
      const link = state.openedId && dom.listView.querySelector('.card h3 a[href="#/entree/' + state.openedId + '"]');
      if (link) link.focus({ preventScroll: true });
    }
```

par :

```js
    if (restoreScroll) {
      window.scrollTo(0, state.scroll.get(state.lastListHash) || 0);
      // Au retour d'une fiche, le focus revient sur son lien.
      const link = state.openedId && dom.listView.querySelector('a.entry-link[href="#/entree/' + state.openedId + '"]');
      if (link) link.focus({ preventScroll: true });
    }
```

4. Remplacer :

```js

    renderTypeChips(found);
    renderProjectChips(found);
    renderActiveFilters();
```

par :

```js

    renderTypeChips(found);
    renderFamilyChips(found);
    renderProjectChips(found);
    renderActiveFilters();
```

5. Remplacer :

```js

    dom.grid.replaceChildren();
    dom.groups.replaceChildren();
    dom.more.hidden = true;

    if (!list.length) {
      dom.grid.hidden = true;
      dom.groups.hidden = true;
      dom.empty.hidden = false;
      dom.empty.replaceChildren(
```

par :

```js

    dom.grid.replaceChildren();
    dom.lines.replaceChildren();
    dom.more.hidden = true;

    if (!list.length) {
      dom.grid.hidden = true;
      dom.lines.hidden = true;
      dom.empty.hidden = false;
      dom.empty.replaceChildren(
```

6. Remplacer :

```js
    dom.empty.hidden = true;

    if (f.vue === 'projets') {
      dom.grid.hidden = true;
      dom.groups.hidden = false;
      renderGroups(list, targets);
    } else {
      dom.groups.hidden = true;
      dom.grid.hidden = false;
      const fragment = document.createDocumentFragment();
      for (const entry of list.slice(0, state.shown)) fragment.append(card(entry, { targets, since: state.since }));
      dom.grid.append(fragment);
      const remaining = list.length - state.shown;
      if (remaining > 0) {
        dom.more.hidden = false;
        dom.moreBtn.textContent = 'Afficher plus (' + plural(remaining, 'restante', 'restantes') + ')';
      }
    }
  }
```

par :

```js
    dom.empty.hidden = true;

    const asLines = f.vue === 'liste';
    const options = { targets, since: state.since };
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
```

7. Remplacer :

```js
  function resetButton() {
    const button = el('button', { type: 'button', class: 'btn-secondary' }, 'Effacer les filtres');
    button.addEventListener('click', () => ctx.setFilters({ q: '', type: '', projet: '', tag: '' }));
    return button;
  }
```

par :

```js
  function resetButton() {
    const button = el('button', { type: 'button', class: 'btn-secondary' }, 'Effacer les filtres');
    button.addEventListener('click', () => ctx.setFilters({ q: '', type: '', famille: '', projet: '', tag: '' }));
    return button;
  }
```

8. Remplacer :

```js
    }
    dom.typeChips.replaceChildren(...chips);
  }

```

par :

```js
    }
    dom.typeChips.replaceChildren(...chips);
  }

  /* Familles dans l'ordre configuré, puis « Sans famille » ; le nom est écrit
     (la couleur n'est jamais la seule information). */
  function renderFamilyChips(found) {
    if (!state.families.size) {
      dom.familyChips.hidden = true;
      dom.familyChips.replaceChildren();
      return;
    }
    const pool = state.entries.filter((e) => matches(e, found, 'famille'));
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

```

9. Remplacer :

```js
      items.push(el('span', null, 'Tag :'), pill);
    }
    if (f.q || f.type || f.projet || f.tag) {
      const clear = el('button', { type: 'button', class: 'link-button' }, 'Effacer tous les filtres');
      clear.addEventListener('click', () => ctx.setFilters({ q: '', type: '', projet: '', tag: '' }));
      items.push(clear);
    }
```

par :

```js
      items.push(el('span', null, 'Tag :'), pill);
    }
    if (f.q || f.type || f.famille || f.projet || f.tag) {
      const clear = el('button', { type: 'button', class: 'link-button' }, 'Effacer tous les filtres');
      clear.addEventListener('click', () => ctx.setFilters({ q: '', type: '', famille: '', projet: '', tag: '' }));
      items.push(clear);
    }
```

10. Remplacer :

```js
  }

  function renderGroups(list, targets) {
    const groups = new Map();
    for (const entry of list) {
      if (!groups.has(entry._project)) groups.set(entry._project, []);
      groups.get(entry._project).push(entry);
    }
    const single = Boolean(state.filters.projet);
    const fragment = document.createDocumentFragment();
    for (const [key, members] of groups) {
      const project = state.projects.get(key);
      const name = key === NO_PROJECT ? 'Sans projet' : (project ? project.nom : key);
      const typeCounts = new Map();
      for (const entry of members) typeCounts.set(entry.type, (typeCounts.get(entry.type) || 0) + 1);
      const breakdown = Array.from(typeCounts, ([type, count]) => typeCount(type, count)).join(' · ');
      const lastDate = members.reduce((max, e) => Math.max(max, e._time), 0);

      // « group » : filtre sur le projet en gardant recherche, type et tag,
      // pour que le nombre annoncé soit celui qui s'affiche.
      const title = el('button', { type: 'button', class: 'link-button group-title', 'data-action': 'group', 'data-project': key }, name);
      const head = el('div', { class: 'group-head' },
        el('h2', null, single ? name : title),
        el('span', { class: 'group-meta' },
          plural(members.length, 'entrée', 'entrées') + ' — ' + breakdown
          + (lastDate ? ' — dernière le ' + formatDay(lastDate) : '')));

      const shown = single ? members : members.slice(0, config.groupPreview);
      const grid = el('div', { class: 'grid' }, shown.map((entry) => card(entry, { targets, since: state.since })));
      const section = el('section', { class: 'group', 'aria-label': name }, head, grid);
      if (members.length > shown.length) {
        section.append(el('div', { class: 'group-more' },
          el('button', { type: 'button', class: 'btn-secondary', 'data-action': 'group', 'data-project': key },
            'Voir les ' + members.length + ' entrées de ce projet')));
      }
      fragment.append(section);
    }
    dom.groups.append(fragment);
  }

  return { showList, renderList, filtered, sortEntries, typeRank, listHash };
}
```

par :

```js
  }

  return { showList, renderList, filtered, sortEntries, typeRank, listHash };
}
```


- [ ] **Step 11: Modifier `docs/js/app.js`**

3 remplacements, dans l'ordre (chaque bloc à remplacer est unique dans le fichier).

1. Remplacer :

```js
  supportedSchema: 1,
  pageSize: 60,       // cartes affichées avant « Afficher plus »
  groupPreview: 6,    // entrées par projet dans la vue « Par projet »
  projectChips: 10,   // projets affichés avant « + N autres »
};
```

par :

```js
  supportedSchema: 1,
  pageSize: 60,       // cartes affichées avant « Afficher plus »
  projectChips: 10,   // projets affichés avant « + N autres »
};
```

2. Remplacer :

```js
  stats: $('stats'), listView: $('list-view'), entryView: $('entry-view'), pageView: $('page-view'),
  search: $('search-input'), sort: $('sort-select'),
  typeChips: $('type-chips'), projectChips: $('project-chips'), activeFilters: $('active-filters'),
  resultCount: $('result-count'), status: $('status'), grid: $('grid'), groups: $('groups'),
  more: $('more'), moreBtn: $('more-btn'), empty: $('empty'),
  themeToggle: $('theme-toggle'), navHome: $('nav-home'), navEntries: $('nav-entries'),
```

par :

```js
  stats: $('stats'), listView: $('list-view'), entryView: $('entry-view'), pageView: $('page-view'),
  search: $('search-input'), sort: $('sort-select'),
  typeChips: $('type-chips'), familyChips: $('family-chips'), projectChips: $('project-chips'),
  activeFilters: $('active-filters'), resultCount: $('result-count'), status: $('status'),
  grid: $('grid'), lines: $('lines'),
  more: $('more'), moreBtn: $('more-btn'), empty: $('empty'),
  themeToggle: $('theme-toggle'), navHome: $('nav-home'), navEntries: $('nav-entries'),
```

3. Remplacer :

```js
    state.shown += CONFIG.pageSize;
    ctx.list.renderList();
    // Le focus passe à la première carte ajoutée (le bouton peut disparaître).
    const link = dom.grid.querySelectorAll('.card h3 a')[firstNew];
    if (link) link.focus();
  });

  // Délégation : tags (cartes, fiches) et groupes de la vue « Par projet ».
  document.addEventListener('click', (event) => {
    const target = event.target.closest('[data-action]');
    if (!target || !state.data) return;
    const action = target.dataset.action;
    if (action !== 'tag' && action !== 'group') return;
    event.preventDefault();
    if (action === 'group') {
      setFilters({ projet: target.dataset.project });
      window.scrollTo(0, 0);
      return;
    }
    const patch = { tag: target.dataset.tag, type: '', projet: '', q: '' };
    if (dom.listView.hidden) {
```

par :

```js
    state.shown += CONFIG.pageSize;
    ctx.list.renderList();
    // Le focus passe à la première entrée ajoutée (le bouton peut disparaître).
    const link = dom.listView.querySelectorAll('a.entry-link')[firstNew];
    if (link) link.focus();
  });

  // Délégation : tags, sur les cartes comme sur les fiches.
  document.addEventListener('click', (event) => {
    const target = event.target.closest('[data-action="tag"]');
    if (!target || !state.data) return;
    event.preventDefault();
    const patch = { tag: target.dataset.tag, type: '', projet: '', q: '' };
    if (dom.listView.hidden) {
```


- [ ] **Step 12: Modifier `docs/index.html`**

3 remplacements, dans l'ordre (chaque bloc à remplacer est unique dans le fichier).

1. Remplacer :

```html
          <div class="segmented" role="group" aria-label="Affichage">
            <button type="button" data-view="grille" aria-pressed="true">Grille</button>
            <button type="button" data-view="projets" aria-pressed="false">Par projet</button>
          </div>
        </div>
```

par :

```html
          <div class="segmented" role="group" aria-label="Affichage">
            <button type="button" data-view="grille" aria-pressed="true">Grille</button>
            <button type="button" data-view="liste" aria-pressed="false">Liste</button>
          </div>
        </div>
```

2. Remplacer :

```html

      <div class="chips" id="type-chips" role="group" aria-label="Filtrer par type"></div>
      <div class="chips" id="project-chips" role="group" aria-label="Filtrer par projet"></div>
      <div class="active-filters" id="active-filters" hidden></div>
```

par :

```html

      <div class="chips" id="type-chips" role="group" aria-label="Filtrer par type"></div>
      <div class="chips" id="family-chips" role="group" aria-label="Filtrer par famille" hidden></div>
      <div class="chips" id="project-chips" role="group" aria-label="Filtrer par projet"></div>
      <div class="active-filters" id="active-filters" hidden></div>
```

3. Remplacer :

```html
      <p class="result-count" id="result-count" aria-live="polite" tabindex="-1"></p>
      <div class="grid" id="grid" hidden></div>
      <div id="groups" hidden></div>
      <div class="more" id="more" hidden><button type="button" id="more-btn" class="btn-secondary"></button></div>
      <div class="empty" id="empty" hidden></div>
```

par :

```html
      <p class="result-count" id="result-count" aria-live="polite" tabindex="-1"></p>
      <div class="grid" id="grid" hidden></div>
      <ul class="entry-list" id="lines" aria-label="Entrées" hidden></ul>
      <div class="more" id="more" hidden><button type="button" id="more-btn" class="btn-secondary"></button></div>
      <div class="empty" id="empty" hidden></div>
```


- [ ] **Step 13: Modifier `docs/style.css`**

Remplacer :

```css
.btn-secondary[aria-disabled="true"]:hover { background: transparent; }

/* --------------------------------------------------------- vue par projet */

.group { margin-bottom: 36px; }
.group-head {
  display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between;
  gap: 6px 16px; margin-bottom: 14px; padding-bottom: 10px; border-bottom: 1px solid var(--border);
}
.group-head h2 { font-family: var(--serif); font-weight: 600; font-size: 24px; margin: 0; }
.group-head .group-title { font: inherit; color: inherit; text-decoration: none; padding: 0; text-align: left; }
.group-head .group-title:hover { color: var(--accent-strong); text-decoration: underline; text-underline-offset: 4px; }
.group-meta { font-size: 13px; color: var(--text-muted); }
.group-more { margin-top: 12px; }

/* ---------------------------------------------------------------- accueil */
```

par :

```css
.btn-secondary[aria-disabled="true"]:hover { background: transparent; }

/* ------------------------------------------------------------ vue liste */

.entry-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.entry-line {
  display: flex; flex-wrap: wrap; align-items: center; gap: 6px 12px;
  background: var(--surface); border: 1px solid var(--border); border-left: 4px solid var(--famille);
  border-radius: 10px; padding: 8px 14px; min-width: 0;
}
.entry-line .entry-link {
  flex: 1 1 16em; min-width: 0; overflow-wrap: anywhere;
  font-family: var(--serif); font-weight: 600; font-size: 16px; color: var(--text); text-decoration: none;
}
.entry-line .entry-link:hover { color: var(--accent-strong); text-decoration: underline; text-underline-offset: 3px; }
.entry-line-project { font-size: 13px; color: var(--text-muted); overflow-wrap: anywhere; }
.entry-line time { font-size: 12px; color: var(--text-muted); white-space: nowrap; }
.main-link-icon {
  display: inline-flex; align-items: center; justify-content: center;
  width: 30px; height: 30px; border-radius: 8px; border: 1px solid var(--border-strong);
  color: var(--accent-strong); text-decoration: none; font-weight: 700;
}
.main-link-icon:hover { background: var(--accent-soft); }

.chip .family-dot { width: 9px; height: 9px; }

/* ---------------------------------------------------------------- accueil */
```


- [ ] **Step 14: Vérifier le succès**

Run: `node --test "tests/js/*.test.mjs"`
Expected: PASS — 36 tests.

Run: `cd tests/navigateur; npm test`
Expected: PASS — 67 tests.

- [ ] **Step 15: Commit**

```bash
git add docs/index.html docs/js/app.js docs/js/composants.js docs/js/donnees.js docs/js/routes.js docs/js/vues/entrees.js docs/style.css tests/js/routes.test.mjs tests/navigateur/interface.test.mjs tests/navigateur/liste.test.mjs tests/navigateur/navigation.test.mjs tests/navigateur/robustesse.test.mjs
git commit -m "Site : toutes les entrées — filtre famille, vue Liste ; vue « Par projet » retirée

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Résultats de recherche : projets, entrées, « En rapport »

Spec § 4.5 (résultats). `#/recherche?q=…` a sa page : « Projets » (index séparé : nom ×6, famille et identifiant ×3, description ×2), « Entrées » (triées par score, à égalité la plus récente, « Afficher plus »), « En rapport » (voisins des 5 meilleurs résultats absents des résultats, au plus 6, score de voisinage cumulé). Recherche vide ou faite seulement d'exclusions : aide sur la syntaxe. La liste « Toutes les entrées » perd la recherche (plus de `q`, plus de tri « Pertinence ») ; `listFilters` et `listHash` disparaissent.

**Files:**

- Create: `docs/js/vues/resultats.js`
- Modify: `docs/index.html`, `docs/js/app.js`, `docs/js/composants.js`, `docs/js/donnees.js`, `docs/js/vues/entrees.js`, `docs/js/vues/fiche.js`, `docs/style.css`
- Test: `tests/js/donnees.test.mjs` (modifié), `tests/js/resultats.test.mjs` (créé), `tests/navigateur/fiche.test.mjs` (modifié), `tests/navigateur/interface.test.mjs` (modifié), `tests/navigateur/liste.test.mjs` (modifié), `tests/navigateur/navigation.test.mjs` (modifié), `tests/navigateur/resultats.test.mjs` (créé), `tests/navigateur/robustesse.test.mjs` (modifié)

**Interfaces:**

- Consumes: `search`, `buildIndex` (Task 4), `projectCard`, `card`, `typeBadge`, `entryHash`, `projectHash`, `_neighbours` (Task 8).
- Produces:
  - `vues/resultats.js` : `relatedEntries(top, inResults, max = 6) → entry[]`, `createResultsView(ctx) → { showResults(q, { returning }), resultEntries(q) → entry[] }` ; le nombre de résultats est annoncé par la région persistante `#annonce` (`dom.announce`).
  - `donnees.js` : `prepare` renvoie aussi `projectList`, `projectIndex`.
  - `composants.js` : `projectCard(project, { since = null, targets = null, showFamily = false } = {})` (`showFamily` : nom de la famille écrit sur la carte, surligné).
  - `vues/entrees.js` : `createListView(ctx) → { showList, renderList, filtered() → entry[], sortEntries(list), typeRank }`.
  - `app.js` : `ctx.results`, `state.projectIndex`, `state.projectList`, `state.filters = defaultFilters()`, `dom.announce` ; `route()` vide le champ de recherche hors de `#/recherche` et des fiches.
  - `index.html` : `<p id="annonce" class="visually-hidden" aria-live="polite">` hors de `#page-view`.

- [ ] **Step 1: Test — Modifier `tests/js/donnees.test.mjs`**

Remplacer :

```js
  assert.deepEqual(model.entries[1]._neighbours, []);
});
```

par :

```js
  assert.deepEqual(model.entries[1]._neighbours, []);
});

test('index des projets : nom, famille et description', () => {
  const model = prepare({
    familles: [{ id: 'jeux', nom: 'Jeux vidéo', couleur: 1 }],
    projets: [{ id: 'depths', nom: 'Depths', famille: 'jeux', description: 'Donjons procéduraux.' },
      { id: 'jarvis', nom: 'Jarvis', description: 'Assistant vocal.' }],
    entrees: [],
  });
  const noms = (q) => search(model.projectIndex, q).hits.map((h) => model.projectList[h.doc].nom);
  assert.deepEqual(noms('donjon'), ['Depths']);
  assert.deepEqual(noms('video'), ['Depths']);
  assert.deepEqual(noms('jarvis'), ['Jarvis']);
});
```


- [ ] **Step 2: Test — Créer `tests/js/resultats.test.mjs`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { relatedEntries } from '../../docs/js/vues/resultats.js';

test('« En rapport » : voisins absents des résultats, score cumulé, au plus 6', () => {
  const e = (id, time = 0) => ({ id, _time: time, _neighbours: [] });
  const [a, b, x, y, z] = [e('a'), e('b'), e('x', 1), e('y', 2), e('z', 3)];
  a._neighbours = [{ entry: b, score: 0.9 }, { entry: x, score: 0.8 }, { entry: y, score: 0.85 }];
  b._neighbours = [{ entry: x, score: 0.81 }, { entry: z, score: 0.85 }];
  const resultats = new Set([a, b]);
  assert.deepEqual(relatedEntries([a, b], resultats).map((r) => r.id), ['x', 'z', 'y']);
  const beaucoup = Array.from({ length: 9 }, (_, i) => e('v' + i, i));
  const seul = { ...e('s'), _neighbours: beaucoup.map((v) => ({ entry: v, score: 0.8 })) };
  assert.equal(relatedEntries([seul], new Set([seul])).length, 6);
});
```

- [ ] **Step 3: Test — Modifier `tests/navigateur/fiche.test.mjs`**

2 remplacements, dans l'ordre (chaque bloc à remplacer est unique dans le fichier).

1. Remplacer :

```js

const CARTES = '#list-view:not([hidden]) #grid .card h3 a';

test('ouvrir une fiche depuis la liste : titre, URL courte, focus sur le titre', async () => {
  const page = await ouvrir('#/recherche?q=jarvis', CARTES);
  await page.getByRole('link', { name: 'Jarvis — architecture', exact: true }).click();
  await page.locator('#entry-view:not([hidden]) #entry-title').waitFor();
```

par :

```js

const CARTES = '#list-view:not([hidden]) #grid .card h3 a';
const RESULTATS = '#page-view .card h3 a';

test('ouvrir une fiche depuis la liste : titre, URL courte, focus sur le titre', async () => {
  const page = await ouvrir('#/recherche?q=jarvis', RESULTATS);
  await page.getByRole('link', { name: 'Jarvis — architecture', exact: true }).click();
  await page.locator('#entry-view:not([hidden]) #entry-title').waitFor();
```

2. Remplacer :

```js
  assert.ok(page.url().endsWith('#/entrees?type=milestone'), page.url());
  await page.goto(site.url('#/recherche?q=jarvis'));
  await page.locator(CARTES).first().click();
  await page.locator('#entry-title').waitFor();
  await page.getByRole('link', { name: '← Retour aux résultats' }).click();
  await page.locator(CARTES).first().waitFor();
  assert.ok(page.url().endsWith('#/recherche?q=jarvis'), page.url());
  assert.equal(await page.inputValue('#search-input'), 'jarvis');
```

par :

```js
  assert.ok(page.url().endsWith('#/entrees?type=milestone'), page.url());
  await page.goto(site.url('#/recherche?q=jarvis'));
  await page.locator(RESULTATS).first().click();
  await page.locator('#entry-title').waitFor();
  await page.getByRole('link', { name: '← Retour aux résultats' }).click();
  await page.locator(RESULTATS).first().waitFor();
  assert.ok(page.url().endsWith('#/recherche?q=jarvis'), page.url());
  assert.equal(await page.inputValue('#search-input'), 'jarvis');
```


- [ ] **Step 4: Test — Modifier `tests/navigateur/interface.test.mjs`**

3 remplacements, dans l'ordre (chaque bloc à remplacer est unique dans le fichier).

1. Remplacer :

```js
  const page = await site.page({ donnees, ...options });
  await page.goto(site.url(ancre));
  await page.locator('#grid .card').first().waitFor();
  return page;
}
```

par :

```js
  const page = await site.page({ donnees, ...options });
  await page.goto(site.url(ancre));
  await page.locator('.card:visible').first().waitFor();
  return page;
}
```

2. Remplacer :

```js
});

test('mobile : pas de défilement horizontal (grille, fiche, vue Liste, page projet, accueil)', async () => {
  const archi = entreeTitree(donnees, 'Jarvis — architecture');
  const page = await ouvrir('#/entrees', { mobile: true });
```

par :

```js
});

test('mobile : pas de défilement horizontal (grille, fiche, vue Liste, page projet, accueil, résultats)', async () => {
  const archi = entreeTitree(donnees, 'Jarvis — architecture');
  const page = await ouvrir('#/entrees', { mobile: true });
```

3. Remplacer :

```js
  await page.locator('.project-card').first().waitFor();
  assert.ok(await debordement(page) <= 0, 'accueil');
  await terminer(page);
});
```

par :

```js
  await page.locator('.project-card').first().waitFor();
  assert.ok(await debordement(page) <= 0, 'accueil');
  await page.goto(site.url('#/recherche?q=jarvis'));
  await page.locator('#page-view .card').first().waitFor();
  assert.ok(await debordement(page) <= 0, 'résultats');
  await terminer(page);
});
```


- [ ] **Step 5: Test — Modifier `tests/navigateur/liste.test.mjs`**

Remplacer :

```js
  const page = await liste();
  assert.match(await page.textContent('#stats'), /^70\sentrées · 7\sprojets · \d+\sliens en ligne · export du /);
  await terminer(page);
});

test('recherche : « memoire » trouve « mémoire », surligne, met à jour l’URL, trie par pertinence', async () => {
  const page = await liste();
  await page.fill('#search-input', 'memoire');
  await attendreAncre(page, 'q=memoire');
  assert.ok(await page.locator('#grid .card').count() > 0);
  assert.ok(await page.locator('#grid mark').count() > 0);
  assert.equal(await page.inputValue('#sort-select'), 'pertinence');
  await terminer(page);
});
```

par :

```js
  const page = await liste();
  assert.match(await page.textContent('#stats'), /^70\sentrées · 7\sprojets · \d+\sliens en ligne · export du /);
  await terminer(page);
});
```


- [ ] **Step 6: Test — Modifier `tests/navigateur/navigation.test.mjs`**

Remplacer :

```js
  const page = await site.page({ donnees });
  await page.goto(site.url(ancre));
  await page.locator('#grid .card').first().waitFor();
  return page;
}
```

par :

```js
  const page = await site.page({ donnees });
  await page.goto(site.url(ancre));
  await page.locator('.card:visible').first().waitFor();
  return page;
}
```


- [ ] **Step 7: Test — Créer `tests/navigateur/resultats.test.mjs`**

```js
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { ouvrirSite, terminer, attendreAncre } from './outils.mjs';
import { jeuDeTest, entreeTitree } from './donnees-test.mjs';

let site;
before(async () => { site = await ouvrirSite(); });
after(async () => { await site.fermer(); });

const donnees = jeuDeTest();

async function recherche(q, attendu = '#page-view .card') {
  const page = await site.page({ donnees });
  await page.goto(site.url('#/recherche?q=' + encodeURIComponent(q)));
  await page.locator(attendu).first().waitFor();
  return page;
}

const titres = (page) => page.locator('#h-res-entrees ~ .grid .card h3').allTextContents();

test('résultats : projets et entrées triées par score, surlignage, URL et champ de recherche', async () => {
  const page = await recherche('donjon');
  assert.equal(await page.textContent('#titre-vue'), 'Recherche : « donjon »');
  assert.equal((await page.textContent('#results-count')).replace(/\s/g, ' '), '1 projet · 2 entrées');
  // Annonce par la région persistante hors de #page-view (une région live
  // recréée à chaque frappe ne serait pas lue) ; le compteur visible n'en est pas une.
  assert.equal((await page.textContent('#annonce')).replace(/\s/g, ' '), '1 projet · 2 entrées');
  assert.equal(await page.getAttribute('#results-count', 'aria-live'), null);
  assert.deepEqual(await page.locator('#h-res-projets ~ .project-grid h3').allTextContents(), ['Depths']);
  assert.deepEqual(await titres(page), ['Depths — génération de donjon', 'Depths — idées de monstres']);
  assert.equal(await page.locator('#h-res-entrees ~ .grid .card h3 mark').first().textContent(), 'donjon');
  assert.equal(await page.locator('.project-card mark').first().textContent(), 'donjons');
  assert.equal(await page.inputValue('#search-input'), 'donjon');
  await terminer(page);
});

test('recherche tolérante : fautes, pluriels, synonymes, expression, exclusion, préfixe', async () => {
  const page = await recherche('jarvsi');
  assert.ok((await titres(page)).includes('Jarvis — architecture'), 'faute de frappe');
  const cas = [
    ['reseau', (t) => t.includes('Depths — idées de monstres') && t.includes('Voxelcraft — un jeu de cubes')],
    ['llm', (t) => t.includes('Jarvis — architecture')],
    ['"tour de garde"', (t) => t.length === 1 && t[0] === 'Tour de garde et contrôle des accès'],
    ['jarvis -vocal', (t) => t.length > 0 && !t.includes('Jarvis — architecture') && !t.includes('Jarvis — premier réveil vocal')],
    ['archi', (t) => t.includes('Jarvis — architecture')],
  ];
  for (const [q, attendu] of cas) {
    await page.goto(site.url('#/recherche?q=' + encodeURIComponent(q)));
    await page.locator('#titre-vue', { hasText: q }).waitFor();
    const trouves = await titres(page);
    assert.ok(attendu(trouves), q + ' : ' + trouves.join(' | '));
  }
  await terminer(page);
});

test('« En rapport » : voisins des meilleurs résultats, absents des résultats', async () => {
  const page = await recherche('donjon');
  const lignes = page.locator('#h-res-rapport + .related-entries li');
  assert.equal(await lignes.count(), 1);
  assert.equal(await lignes.locator('a').first().textContent(), 'Voxelcraft — un jeu de cubes');
  assert.equal(await lignes.locator('.type-badge').textContent(), 'Note');
  assert.equal(await lignes.locator('.related-project').textContent(), 'Voxelcraft');
  await terminer(page);
});

test('projets trouvés par leur famille : le nom de la famille est écrit sur la carte', async () => {
  const page = await recherche('outils');
  const familles = await page.locator('#h-res-projets ~ .project-grid .project-card-family').allTextContents();
  assert.equal(familles.length, 3, familles.join(' | '));
  assert.ok(familles.every((f) => f === 'Outils Claude'), familles.join(' | '));
  await terminer(page);
});

test('aucun résultat, recherche vide : messages', async () => {
  const page = await recherche('zzzzzz', '#titre-vue');
  assert.match(await page.textContent('#page-view .empty'), /Aucun résultat pour « zzzzzz »/);
  assert.equal(await page.textContent('#annonce'), 'Aucun résultat pour « zzzzzz ».');
  assert.equal(await page.locator('#page-view .empty').getByRole('link', { name: 'Voir toutes les entrées' }).count(), 1);
  await page.goto(site.url('#/recherche'));
  await page.locator('.results-help').waitFor();
  assert.equal(await page.textContent('#titre-vue'), 'Recherche');
  await terminer(page);
});

test('fiche ouverte depuis les résultats : ordre des résultats, retour et focus', async () => {
  const page = await recherche('donjon');
  const lien = page.getByRole('link', { name: 'Depths — génération de donjon', exact: true });
  const href = await lien.getAttribute('href');
  await lien.click();
  await page.locator('#entry-title').waitFor();
  assert.equal(await page.locator('.pager a[rel="prev"]').count(), 0);
  assert.equal(await page.getAttribute('.pager a[rel="next"]', 'title'), 'Depths — idées de monstres');
  await page.getByRole('link', { name: '← Retour aux résultats' }).click();
  await attendreAncre(page, '#/recherche?q=donjon');
  await page.locator('#titre-vue').waitFor();
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('href')), href);
  await terminer(page);
});

test('frappe : les résultats suivent, le focus reste dans le champ', async () => {
  const page = await site.page({ donnees });
  await page.goto(site.url('#/entrees'));
  await page.locator('#grid .card').first().waitFor();
  await page.locator('#search-input').pressSequentially('memoire', { delay: 40 });
  await attendreAncre(page, 'q=memoire');
  await page.locator('#titre-vue', { hasText: 'memoire' }).waitFor();
  assert.ok((await titres(page)).length > 0);
  assert.ok(await page.locator('#h-res-entrees ~ .grid mark').count() > 0);
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'search-input');
  // Quitter la recherche vide le champ : il ne suggère pas un filtre absent.
  await page.click('#nav-home');
  await page.locator('.project-card').first().waitFor();
  assert.equal(await page.inputValue('#search-input'), '');
  await terminer(page);
});

test('frappe depuis une fiche : le focus reste dans le champ, aucune touche perdue', async () => {
  const page = await site.page({ donnees });
  const archi = entreeTitree(donnees, 'Jarvis — architecture');
  await page.goto(site.url('#/entree/' + archi.id.slice(0, 12)));
  await page.locator('#entry-title').waitFor();
  await page.keyboard.press('/');
  await page.keyboard.type('jarvis', { delay: 40 });
  await attendreAncre(page, 'q=jarvis');
  await page.locator('#titre-vue', { hasText: 'jarvis' }).waitFor();
  await page.waitForTimeout(300);
  // Première route de recherche après la fiche : pas un « retour », le lien
  // de la fiche dans les résultats ne prend pas le focus.
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'search-input');
  await page.keyboard.type(' archi', { delay: 40 });
  await attendreAncre(page, 'q=jarvis+archi');
  await page.locator('#titre-vue', { hasText: 'jarvis archi' }).waitFor();
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'search-input');
  assert.equal(await page.inputValue('#search-input'), 'jarvis archi');
  await terminer(page);
});
```

- [ ] **Step 8: Test — Modifier `tests/navigateur/robustesse.test.mjs`**

2 remplacements, dans l'ordre (chaque bloc à remplacer est unique dans le fichier).

1. Remplacer :

```js
  const page = await site.page({ donnees: donneesPiegees() });
  for (const [ancre, attendu] of [['#/', '.project-card'], ['#/entrees', '#grid .card'], ['#/entrees?vue=liste', '.entry-line'],
    ['#/entree/abcdef123456', '#entry-title'], ['#/projet/x', '#titre-vue']]) {
    await page.goto(site.url(ancre));
    await page.locator(attendu).first().waitFor();
```

par :

```js
  const page = await site.page({ donnees: donneesPiegees() });
  for (const [ancre, attendu] of [['#/', '.project-card'], ['#/entrees', '#grid .card'], ['#/entrees?vue=liste', '.entry-line'],
    ['#/entree/abcdef123456', '#entry-title'], ['#/projet/x', '#titre-vue'], ['#/recherche?q=voisine', '#page-view .card']]) {
    await page.goto(site.url(ancre));
    await page.locator(attendu).first().waitFor();
```

2. Remplacer :

```js
  const page = await site.page({ donnees: jeuDeTest() });
  await page.goto(site.url('#/recherche?q=coeur'));
  await page.locator('#grid .card').first().waitFor();
  assert.equal(await page.locator('#grid mark').first().textContent(), 'cœur');
  await page.goto(site.url('#/recherche?q=' + encodeURIComponent("l'atelier")));
  await page.locator('#grid .card').first().waitFor();
  assert.equal(await page.locator('#grid .card').count(), 1);
  await terminer(page);
});
```

par :

```js
  const page = await site.page({ donnees: jeuDeTest() });
  await page.goto(site.url('#/recherche?q=coeur'));
  await page.locator('#page-view .card').first().waitFor();
  assert.equal(await page.locator('#page-view .card mark').first().textContent(), 'cœur');
  await page.goto(site.url('#/recherche?q=' + encodeURIComponent("l'atelier")));
  await page.locator('#titre-vue', { hasText: 'atelier' }).waitFor();
  assert.equal(await page.locator('#page-view .card').count(), 1);
  await terminer(page);
});
```


- [ ] **Step 9: Vérifier l'échec**

Run: `node --test "tests/js/*.test.mjs"`
Expected: FAIL — resultats.test : `ERR_MODULE_NOT_FOUND` (`docs/js/vues/resultats.js`) ; donnees.test : « index des projets » (`TypeError: Cannot read properties of undefined (reading 'cache')`, `projectIndex` absent).

Run: `cd tests/navigateur; npm test`
Expected: FAIL — 13 échecs : les 8 tests de resultats.test.mjs (la liste s'affiche au lieu de la page de résultats), « ouvrir une fiche depuis la liste » et « Retour… » (fiche.test, cartes cherchées dans `#page-view`), « coeur » (robustesse), mobile et données piégées (page de résultats).

- [ ] **Step 10: Modifier `docs/js/donnees.js`**

Remplacer :

```js
  })), data.synonymes);

  return { data, entries, projects, families, typeOrder, index };
}
```

par :

```js
  })), data.synonymes);

  // Index des projets (page de résultats) : nom, famille, description.
  const projectList = Array.from(projects.values());
  const projectIndex = buildIndex(projectList.map((p) => ({
    title: p.nom,
    meta: [p._family ? p._family.nom : '', p.id].join(' '),
    resume: p.description || '',
    content: '',
  })), data.synonymes);

  return { data, entries, projects, families, typeOrder, index, projectList, projectIndex };
}
```


- [ ] **Step 11: Modifier `docs/js/composants.js`**

Remplacer :

```js
/* Carte d'un projet : le nom mène à sa page, le bouton du lien principal
   est un lien distinct (jamais un lien dans un autre). */
export function projectCard(project, { since = null } = {}) {
  const last = project._last ? new Date(project._last).toISOString() : null;
  return el('article', { class: 'project-card', 'data-couleur': project._family ? project._family.couleur : null },
    el('h3', null, el('a', { href: projectHash(project.id) }, project.nom)),
    project.description ? el('p', { class: 'project-card-description' }, project.description) : null,
    el('p', { class: 'meta-line' },
      plural(project._count, 'entrée', 'entrées'),
```

par :

```js
/* Carte d'un projet : le nom mène à sa page, le bouton du lien principal
   est un lien distinct (jamais un lien dans un autre). */
export function projectCard(project, { since = null, targets = null, showFamily = false } = {}) {
  const last = project._last ? new Date(project._last).toISOString() : null;
  return el('article', { class: 'project-card', 'data-couleur': project._family ? project._family.couleur : null },
    el('h3', null, el('a', { href: projectHash(project.id) }, highlight(project.nom, targets))),
    // Résultats de recherche : la famille (aussi cherchée) est écrite, le
    // liseré n'est jamais la seule information.
    showFamily ? el('p', { class: 'project-card-family' },
      highlight(project._family ? project._family.nom : 'Sans famille', targets)) : null,
    project.description ? el('p', { class: 'project-card-description' }, highlight(project.description, targets)) : null,
    el('p', { class: 'meta-line' },
      plural(project._count, 'entrée', 'entrées'),
```


- [ ] **Step 12: Modifier `docs/js/vues/entrees.js`**

15 remplacements, dans l'ordre (chaque bloc à remplacer est unique dans le fichier).

1. Remplacer :

```js
/* Toutes les entrées : filtres (type, famille, projet, tag), tri, vue
   « Grille » (cartes) ou « Liste » (une ligne par entrée), « Afficher plus ». */
import { normalize, search } from '../recherche.js';
import { entriesHash, searchHash } from '../routes.js';
import { el, plural, typeLabel, card, entryLine, chip } from '../composants.js';
import { NO_PROJECT, NO_FAMILY } from '../donnees.js';
```

par :

```js
/* Toutes les entrées : filtres (type, famille, projet, tag), tri, vue
   « Grille » (cartes) ou « Liste » (une ligne par entrée), « Afficher plus ».
   La recherche a sa propre page (vues/resultats.js). */
import { normalize } from '../recherche.js';
import { el, plural, typeLabel, card, entryLine, chip } from '../composants.js';
import { NO_PROJECT, NO_FAMILY } from '../donnees.js';
```

2. Remplacer :

```js
  const { config, state, dom } = ctx;

  function effectiveSort() {
    const f = state.filters;
    if (f.tri === 'pertinence' && !f.q) return 'recent';
    return f.tri || (f.q ? 'pertinence' : 'recent');
  }

  /* found : Map entrée → score de la recherche, ou null sans recherche. */
  function matches(entry, found, except) {
    const f = state.filters;
    if (except !== 'type' && f.type && entry.type !== f.type) return false;
```

par :

```js
  const { config, state, dom } = ctx;

  function matches(entry, except) {
    const f = state.filters;
    if (except !== 'type' && f.type && entry.type !== f.type) return false;
```

3. Remplacer :

```js
    if (except !== 'projet' && f.projet && entry._project !== f.projet) return false;
    if (f.tag && !entry._tags.includes(normalize(f.tag))) return false;
    return !found || found.has(entry);
  }

  function searched() {
    if (!state.filters.q) return { found: null, targets: null };
    const result = search(state.index, state.filters.q);
    return {
      found: new Map(result.hits.map((hit) => [state.entries[hit.doc], hit.score])),
      targets: result.targets,
    };
  }

```

par :

```js
    if (except !== 'projet' && f.projet && entry._project !== f.projet) return false;
    if (f.tag && !entry._tags.includes(normalize(f.tag))) return false;
    return true;
  }

```

4. Remplacer :

```js
  }

  function sortEntries(list, found) {
    const byRecent = (a, b) => b._time - a._time || (a.id < b.id ? -1 : 1);
    switch (effectiveSort()) {
      case 'ancien':
        return list.sort((a, b) => -byRecent(a, b));
      case 'pertinence':
        // found vaut null quand la fiche trie toutes les entrées (entrée hors de la liste affichée).
        return list.sort((a, b) => (found ? (found.get(b) || 0) - (found.get(a) || 0) : 0) || byRecent(a, b));
      case 'projet':
        return list.sort((a, b) =>
```

par :

```js
  }

  function sortEntries(list) {
    const byRecent = (a, b) => b._time - a._time || (a.id < b.id ? -1 : 1);
    switch (state.filters.tri) {
      case 'ancien':
        return list.sort((a, b) => -byRecent(a, b));
      case 'projet':
        return list.sort((a, b) =>
```

5. Remplacer :

```js
  }

  /* Ancre de l'état affiché : la recherche passe par #/recherche, le reste
     par #/entrees. */
  function listHash(filters) {
    return filters.q ? searchHash(filters.q) : entriesHash(filters);
  }

  function filtered() {
    const { found, targets } = searched();
    return { found, targets, list: sortEntries(state.entries.filter((e) => matches(e, found)), found) };
  }

  function showList(restoreScroll) {
    ctx.show(dom.listView);
    document.title = 'Mémoire Vive';
    renderList();
    if (restoreScroll) {
```

par :

```js
  }

  function filtered() {
    return sortEntries(state.entries.filter((e) => matches(e)));
  }

  function showList(restoreScroll) {
    ctx.show(dom.listView);
    document.title = 'Toutes les entrées — Mémoire Vive';
    renderList();
    if (restoreScroll) {
```

6. Remplacer :

```js
  function renderList() {
    const f = state.filters;
    const { found, targets, list } = filtered();
    state.lastList = list;

    // Comparaison sans les espaces : ne pas effacer l'espace en cours de frappe.
    if (dom.search.value.trim() !== f.q) dom.search.value = f.q;
    const sort = effectiveSort();
    dom.sort.value = sort;
    dom.sort.querySelector('option[value="pertinence"]').disabled = !f.q;
    for (const button of document.querySelectorAll('.segmented button')) {
      button.setAttribute('aria-pressed', String(button.dataset.view === f.vue));
    }

    renderTypeChips(found);
    renderFamilyChips(found);
    renderProjectChips(found);
    renderActiveFilters();

```

par :

```js
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

```

7. Remplacer :

```js

    const asLines = f.vue === 'liste';
    const options = { targets, since: state.since };
    dom.grid.hidden = asLines;
    dom.lines.hidden = !asLines;
```

par :

```js

    const asLines = f.vue === 'liste';
    const options = { since: state.since };
    dom.grid.hidden = asLines;
    dom.lines.hidden = !asLines;
```

8. Remplacer :

```js
  function resetButton() {
    const button = el('button', { type: 'button', class: 'btn-secondary' }, 'Effacer les filtres');
    button.addEventListener('click', () => ctx.setFilters({ q: '', type: '', famille: '', projet: '', tag: '' }));
    return button;
  }

  function renderTypeChips(found) {
    const pool = state.entries.filter((e) => matches(e, found, 'type'));
    const counts = new Map();
    for (const entry of pool) counts.set(entry.type, (counts.get(entry.type) || 0) + 1);
```

par :

```js
  function resetButton() {
    const button = el('button', { type: 'button', class: 'btn-secondary' }, 'Effacer les filtres');
    button.addEventListener('click', () => ctx.setFilters({ type: '', famille: '', projet: '', tag: '' }));
    return button;
  }

  function renderTypeChips() {
    const pool = state.entries.filter((e) => matches(e, 'type'));
    const counts = new Map();
    for (const entry of pool) counts.set(entry.type, (counts.get(entry.type) || 0) + 1);
```

9. Remplacer :

```js
  /* Familles dans l'ordre configuré, puis « Sans famille » ; le nom est écrit
     (la couleur n'est jamais la seule information). */
  function renderFamilyChips(found) {
    if (!state.families.size) {
      dom.familyChips.hidden = true;
```

par :

```js
  /* Familles dans l'ordre configuré, puis « Sans famille » ; le nom est écrit
     (la couleur n'est jamais la seule information). */
  function renderFamilyChips() {
    if (!state.families.size) {
      dom.familyChips.hidden = true;
```

10. Remplacer :

```js
      return;
    }
    const pool = state.entries.filter((e) => matches(e, found, 'famille'));
    const counts = new Map();
    for (const entry of pool) counts.set(familyKey(entry), (counts.get(familyKey(entry)) || 0) + 1);
```

par :

```js
      return;
    }
    const pool = state.entries.filter((e) => matches(e, 'famille'));
    const counts = new Map();
    for (const entry of pool) counts.set(familyKey(entry), (counts.get(familyKey(entry)) || 0) + 1);
```

11. Remplacer :

```js
  }

  function renderProjectChips(found) {
    const pool = state.entries.filter((e) => matches(e, found, 'projet'));
    const counts = new Map();
    for (const entry of pool) counts.set(entry._project, (counts.get(entry._project) || 0) + 1);
```

par :

```js
  }

  function renderProjectChips() {
    const pool = state.entries.filter((e) => matches(e, 'projet'));
    const counts = new Map();
    for (const entry of pool) counts.set(entry._project, (counts.get(entry._project) || 0) + 1);
```

12. Remplacer :

```js
      chips.push(chip('+ ' + hidden + ' autres', null, false, () => {
        state.showAllProjects = true;
        renderProjectChips(searched().found);
        // Le focus va sur le premier projet qui vient d'apparaître.
        const first = dom.projectChips.querySelectorAll('.chip')[visible.length + 1];
```

par :

```js
      chips.push(chip('+ ' + hidden + ' autres', null, false, () => {
        state.showAllProjects = true;
        renderProjectChips();
        // Le focus va sur le premier projet qui vient d'apparaître.
        const first = dom.projectChips.querySelectorAll('.chip')[visible.length + 1];
```

13. Remplacer :

```js
      chips.push(chip('Réduire', null, false, () => {
        state.showAllProjects = false;
        renderProjectChips(searched().found);
        const more = dom.projectChips.querySelector('[data-focus-key="projets:plus"]');
        if (more) more.focus();
```

par :

```js
      chips.push(chip('Réduire', null, false, () => {
        state.showAllProjects = false;
        renderProjectChips();
        const more = dom.projectChips.querySelector('[data-focus-key="projets:plus"]');
        if (more) more.focus();
```

14. Remplacer :

```js
      items.push(el('span', null, 'Tag :'), pill);
    }
    if (f.q || f.type || f.famille || f.projet || f.tag) {
      const clear = el('button', { type: 'button', class: 'link-button' }, 'Effacer tous les filtres');
      clear.addEventListener('click', () => ctx.setFilters({ q: '', type: '', famille: '', projet: '', tag: '' }));
      items.push(clear);
    }
```

par :

```js
      items.push(el('span', null, 'Tag :'), pill);
    }
    if (f.type || f.famille || f.projet || f.tag) {
      const clear = el('button', { type: 'button', class: 'link-button' }, 'Effacer tous les filtres');
      clear.addEventListener('click', () => ctx.setFilters({ type: '', famille: '', projet: '', tag: '' }));
      items.push(clear);
    }
```

15. Remplacer :

```js
  }

  return { showList, renderList, filtered, sortEntries, typeRank, listHash };
}
```

par :

```js
  }

  return { showList, renderList, filtered, sortEntries, typeRank };
}
```


- [ ] **Step 13: Modifier `docs/js/vues/fiche.js`**

Remplacer :

```js
    document.title = entry.titre + ' — Mémoire Vive';
    state.openedId = entry._short;
    const sequence = state.lastList.includes(entry) ? state.lastList : ctx.list.sortEntries(state.entries.slice(), null);
    const position = sequence.indexOf(entry);
    const previous = position > 0 ? sequence[position - 1] : null;
```

par :

```js
    document.title = entry.titre + ' — Mémoire Vive';
    state.openedId = entry._short;
    const sequence = state.lastList.includes(entry) ? state.lastList : ctx.list.sortEntries(state.entries.slice());
    const position = sequence.indexOf(entry);
    const previous = position > 0 ? sequence[position - 1] : null;
```


- [ ] **Step 14: Créer `docs/js/vues/resultats.js`**

```js
/* Résultats de recherche (#/recherche?q=…) : « Projets » (nom, description,
   famille), « Entrées » (triées par score) et « En rapport » (voisins des
   meilleurs résultats qui n'y sont pas). */
import { search } from '../recherche.js';
import { entryHash, projectHash } from '../routes.js';
import { el, plural, card, projectCard, typeBadge } from '../composants.js';

const TOP = 5;          // meilleurs résultats dont on suit les voisins
const RELATED_MAX = 6;  // entrées « En rapport » au plus

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
  let current = { q: null, shown: config.pageSize };

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
    if (q !== current.q) current = { q, shown: config.pageSize };
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
      children.push(el('section', { class: 'results-section', 'aria-labelledby': 'h-res-projets' },
        el('h3', { id: 'h-res-projets' }, 'Projets'),
        el('div', { class: 'project-grid' }, projects.projects.map((p) =>
          projectCard(p, { since: state.since, targets: projects.targets, showFamily: true })))));
    }
    if (entries.entries.length) {
      const shown = entries.entries.slice(0, current.shown);
      const section = el('section', { class: 'results-section', 'aria-labelledby': 'h-res-entrees' },
        el('h3', { id: 'h-res-entrees' }, 'Entrées'),
        el('div', { class: 'grid' }, shown.map((entry) => card(entry, { targets: entries.targets, since: state.since }))));
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
```

- [ ] **Step 15: Modifier `docs/js/app.js`**

13 remplacements, dans l'ordre (chaque bloc à remplacer est unique dans le fichier).

1. Remplacer :

```js
   déjà préparé par scripts/export.py (titres, résumés, projets, liens). */
import { loadData, prepare, DataError } from './donnees.js';
import { parseHash, searchHash, defaultFilters } from './routes.js';
import { el, plural, formatLong, lastVisit } from './composants.js';
import { createListView } from './vues/entrees.js';
```

par :

```js
   déjà préparé par scripts/export.py (titres, résumés, projets, liens). */
import { loadData, prepare, DataError } from './donnees.js';
import { parseHash, searchHash, entriesHash, defaultFilters } from './routes.js';
import { el, plural, formatLong, lastVisit } from './composants.js';
import { createListView } from './vues/entrees.js';
```

2. Remplacer :

```js
import { createProjectView } from './vues/projet.js';
import { createHomeView } from './vues/accueil.js';

const CONFIG = {
```

par :

```js
import { createProjectView } from './vues/projet.js';
import { createHomeView } from './vues/accueil.js';
import { createResultsView } from './vues/resultats.js';

const CONFIG = {
```

3. Remplacer :

```js
  projects: new Map(),
  typeOrder: [],
  index: null,           // index de recherche (recherche.js)
  families: new Map(),
  since: null,           // dernière visite (ms) : entrées plus récentes « nouveau »
  filters: { q: '', ...defaultFilters() },
  shown: CONFIG.pageSize,
  showAllProjects: false,
```

par :

```js
  projects: new Map(),
  typeOrder: [],
  index: null,           // index de recherche des entrées (recherche.js)
  projectIndex: null,    // index de recherche des projets
  projectList: [],       // projets, dans l'ordre de projectIndex
  families: new Map(),
  since: null,           // dernière visite (ms) : entrées plus récentes « nouveau »
  filters: defaultFilters(),
  shown: CONFIG.pageSize,
  showAllProjects: false,
```

4. Remplacer :

```js
  grid: $('grid'), lines: $('lines'),
  more: $('more'), moreBtn: $('more-btn'), empty: $('empty'),
```

par :

```js
  grid: $('grid'), lines: $('lines'), announce: $('annonce'),
  more: $('more'), moreBtn: $('more-btn'), empty: $('empty'),
```

5. Remplacer :

```js
ctx.project = createProjectView(ctx);
ctx.home = createHomeView(ctx);

// ------------------------------------------------------------ données
```

par :

```js
ctx.project = createProjectView(ctx);
ctx.home = createHomeView(ctx);
ctx.results = createResultsView(ctx);

// ------------------------------------------------------------ données
```

6. Remplacer :

```js
  state.typeOrder = model.typeOrder;
  state.index = model.index;
  state.families = model.families;
  // L'horodatage mémorisé est celui de l'export affiché : une entrée créée
```

par :

```js
  state.typeOrder = model.typeOrder;
  state.index = model.index;
  state.projectIndex = model.projectIndex;
  state.projectList = model.projectList;
  state.families = model.families;
  // L'horodatage mémorisé est celui de l'export affiché : une entrée créée
```

7. Remplacer :

```js
// ------------------------------------------------------------ routage

/* Filtres de la liste pour une route qui l'affiche. En attendant sa vue
   (Task 11), la recherche affiche la liste filtrée. */
function listFilters(target) {
  const filters = { q: '', ...defaultFilters() };
  if (target.view === 'entries') Object.assign(filters, target.filters);
  if (target.view === 'search') filters.q = target.q;
  return filters;
}

function sameFilters(a, b) {
  return Object.keys(a).every((key) => a[key] === b[key]);
```

par :

```js
// ------------------------------------------------------------ routage

function sameFilters(a, b) {
  return Object.keys(a).every((key) => a[key] === b[key]);
```

8. Remplacer :

```js
function sequenceFor(origin) {
  if (origin.view === 'project') return ctx.project.projectEntries(origin.id);
  state.filters = listFilters(origin);
  return ctx.list.filtered().list;
}

```

par :

```js
function sequenceFor(origin) {
  if (origin.view === 'project') return ctx.project.projectEntries(origin.id);
  if (origin.view === 'search') return ctx.results.resultEntries(origin.q);
  if (origin.view !== 'entries') return [];
  state.filters = origin.filters;
  return ctx.list.filtered();
}

```

9. Remplacer :

```js
  state.lastListHash = location.hash || '#/';
  renderNav(next.view);
  if (next.view === 'home') {
```

par :

```js
  state.lastListHash = location.hash || '#/';
  renderNav(next.view);
  // Hors de la recherche, le champ ne montre pas une requête qui ne filtre
  // plus rien (la fiche, traitée plus haut, garde celle d'où elle vient).
  if (next.view !== 'search') dom.search.value = '';
  if (next.view === 'home') {
```

10. Remplacer :

```js
    return;
  }
  if (next.view === 'project') {
    ctx.project.showProject(next.id, { returning });
    window.scrollTo(0, returning ? state.scroll.get(state.lastListHash) || 0 : 0);
    return;
  }
  const filters = listFilters(next);
  if (!sameFilters(filters, state.filters)) {
    state.filters = filters;
    state.shown = CONFIG.pageSize;
  }
```

par :

```js
    return;
  }
  if (next.view === 'project' || next.view === 'search') {
    if (next.view === 'project') ctx.project.showProject(next.id, { returning });
    else ctx.results.showResults(next.q, { returning });
    window.scrollTo(0, returning ? state.scroll.get(state.lastListHash) || 0 : 0);
    return;
  }
  if (!sameFilters(next.filters, state.filters)) {
    state.filters = next.filters;
    state.shown = CONFIG.pageSize;
  }
```

11. Remplacer :

```js
  Object.assign(state.filters, patch);
  state.shown = CONFIG.pageSize;
  const hash = ctx.list.listHash(state.filters);
  history.replaceState(null, '', hash);
  state.lastListHash = hash;
```

par :

```js
  Object.assign(state.filters, patch);
  state.shown = CONFIG.pageSize;
  const hash = entriesHash(state.filters);
  history.replaceState(null, '', hash);
  state.lastListHash = hash;
```

12. Remplacer :

```js
    }
  });
  dom.sort.addEventListener('change', () => setFilters({ tri: dom.sort.value === 'recent' && !state.filters.q ? '' : dom.sort.value }));
  for (const button of document.querySelectorAll('.segmented button')) {
    button.addEventListener('click', () => setFilters({ vue: button.dataset.view }));
```

par :

```js
    }
  });
  dom.sort.addEventListener('change', () => setFilters({ tri: dom.sort.value === 'recent' ? '' : dom.sort.value }));
  for (const button of document.querySelectorAll('.segmented button')) {
    button.addEventListener('click', () => setFilters({ vue: button.dataset.view }));
```

13. Remplacer :

```js
    if (!target || !state.data) return;
    event.preventDefault();
    const patch = { tag: target.dataset.tag, type: '', projet: '', q: '' };
    if (dom.listView.hidden) {
      location.hash = ctx.list.listHash(Object.assign({}, state.filters, patch));
    } else {
      setFilters(patch);
```

par :

```js
    if (!target || !state.data) return;
    event.preventDefault();
    const patch = { tag: target.dataset.tag, type: '', famille: '', projet: '' };
    if (dom.listView.hidden) {
      location.hash = entriesHash(Object.assign(defaultFilters(), patch));
    } else {
      setFilters(patch);
```


- [ ] **Step 16: Modifier `docs/index.html`**

2 remplacements, dans l'ordre (chaque bloc à remplacer est unique dans le fichier).

1. Remplacer :

```html
            <option value="recent">Plus récentes</option>
            <option value="ancien">Plus anciennes</option>
            <option value="pertinence">Pertinence</option>
            <option value="projet">Projet (A → Z)</option>
          </select>
```

par :

```html
            <option value="recent">Plus récentes</option>
            <option value="ancien">Plus anciennes</option>
            <option value="projet">Projet (A → Z)</option>
          </select>
```

2. Remplacer :

```html
    <!-- Accueil, page projet, résultats de recherche -->
    <section id="page-view" aria-labelledby="titre-vue" hidden></section>
```

par :

```html
    <!-- Accueil, page projet, résultats de recherche -->
    <section id="page-view" aria-labelledby="titre-vue" hidden></section>
    <!-- Nombre de résultats annoncé pendant la frappe (région persistante) -->
    <p id="annonce" class="visually-hidden" aria-live="polite"></p>
```


- [ ] **Step 17: Modifier `docs/style.css`**

Remplacer :

```css
.project-card .actions { display: flex; flex-wrap: wrap; gap: 8px; }

/* ------------------------------------------------------------ page projet */

```

par :

```css
.project-card .actions { display: flex; flex-wrap: wrap; gap: 8px; }

/* ------------------------------------------------------------- résultats */

.results-head { margin-bottom: 22px; }
.results-head h2 { font-family: var(--serif); font-weight: 600; font-size: 28px; line-height: 1.2; margin: 0 0 6px; overflow-wrap: anywhere; }
.results-head h2:focus { outline: none; }
.results-head .result-count { margin: 0; }
.results-help { color: var(--text-muted); max-width: 70ch; }
.project-card-family { margin: 0; font: 600 13px var(--sans); color: var(--text-muted); overflow-wrap: anywhere; }
.results-section { margin-bottom: 34px; }
.results-section > h3 {
  font: 700 12px var(--sans); letter-spacing: 0.08em; text-transform: uppercase;
  color: var(--accent-strong); margin: 0 0 14px;
}
.related-entries { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.related-entries li {
  display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 12px; min-width: 0;
  border-left: 4px solid var(--famille); padding: 4px 0 4px 12px;
}
.related-entries a { overflow-wrap: anywhere; }
.related-entries .related-project { font-size: 13px; color: var(--text-muted); }

/* ------------------------------------------------------------ page projet */

```


- [ ] **Step 18: Vérifier le succès**

Run: `node --test "tests/js/*.test.mjs"`
Expected: PASS — 38 tests.

Run: `cd tests/navigateur; npm test`
Expected: PASS — 74 tests.

- [ ] **Step 19: Commit**

```bash
git add docs/index.html docs/js/app.js docs/js/composants.js docs/js/donnees.js docs/js/vues/entrees.js docs/js/vues/fiche.js docs/js/vues/resultats.js docs/style.css tests/js/donnees.test.mjs tests/js/resultats.test.mjs tests/navigateur/fiche.test.mjs tests/navigateur/interface.test.mjs tests/navigateur/liste.test.mjs tests/navigateur/navigation.test.mjs tests/navigateur/resultats.test.mjs tests/navigateur/robustesse.test.mjs
git commit -m "Site : page de résultats (projets, entrées, « En rapport »)

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: Fiche : lien principal en tête, « Voir aussi »

Spec § 4.7. Sous le titre, le bouton du lien principal ; avant « Dans le même projet », la section « Voir aussi » : les voisins publiés, du plus proche au moins proche, avec type et projet (liseré de famille). Ouvrir un voisin empile une fiche : « Retour » ramène toujours à la vue d'origine. Le reste de la fiche est inchangé.

**Files:**

- Modify: `docs/js/vues/fiche.js`, `docs/style.css`
- Test: `tests/navigateur/fiche.test.mjs` (modifié), `tests/navigateur/robustesse.test.mjs` (modifié)

**Interfaces:**

- Consumes: `mainLinkButton`, `isNew`, `newBadge` (Task 7), `_neighbours` (Task 8), `backLabel` (Task 8).
- Produces: `#h-voir-aussi` + `ul.see-also` (`li` : `.type-badge`, lien, `.see-also-project`), `p.entry-main-link`.

- [ ] **Step 1: Test — Modifier `tests/navigateur/fiche.test.mjs`**

Remplacer :

```js
  assert.equal(await page.locator('.local-label', { hasText: 'adresse locale' }).count(), 1);
  await terminer(page);
});
```

par :

```js
  assert.equal(await page.locator('.local-label', { hasText: 'adresse locale' }).count(), 1);
  await terminer(page);
});

test('fiche : bouton du lien principal en tête', async () => {
  const page = await ouvrir('#/entree/' + archi.id.slice(0, 12), '#entry-title');
  const bouton = page.locator('#entry-title + .entry-main-link a');
  assert.equal(await bouton.getAttribute('aria-label'), 'Ouvrir le site : Jarvis — architecture (nouvel onglet)');
  assert.equal(await bouton.getAttribute('href'), 'https://exemple.github.io/jarvis/');
  assert.equal(await bouton.getAttribute('rel'), 'noopener noreferrer');
  const sans = entreeTitree(donnees, 'Note sans projet');
  await page.goto(site.url('#/entree/' + sans.id.slice(0, 12)));
  await page.locator('#entry-title', { hasText: 'Note sans projet' }).waitFor();
  assert.equal(await page.locator('.entry-main-link').count(), 0);
  await terminer(page);
});

test('fiche : « Voir aussi » (voisins avec type et projet), puis retour à la vue d’origine', async () => {
  const page = await ouvrir('#/projet/jarvis', '#titre-vue');
  await page.getByRole('link', { name: 'Jarvis — architecture', exact: true }).click();
  await page.locator('#entry-title').waitFor();
  const lignes = page.locator('#h-voir-aussi + .see-also li');
  assert.deepEqual(await lignes.locator('a').allTextContents(), ['Jarvis — premier réveil vocal', 'Jarvis — pas de service en ligne']);
  assert.deepEqual(await lignes.locator('.type-badge').allTextContents(), ['Jalon', 'Décision']);
  assert.deepEqual(await lignes.locator('.see-also-project').allTextContents(), ['Jarvis', 'Jarvis']);
  await lignes.locator('a').first().click();
  await page.locator('#entry-title', { hasText: 'Jarvis — premier réveil vocal' }).waitFor();
  await page.getByRole('link', { name: '← Retour au projet' }).click();
  await page.locator('#titre-vue', { hasText: 'Jarvis' }).waitFor();
  assert.ok(page.url().endsWith('#/projet/jarvis'), page.url());
  await terminer(page);
});
```


- [ ] **Step 2: Test — Modifier `tests/navigateur/robustesse.test.mjs`**

Remplacer :

```js
  const page = await site.page({ donnees: donneesPiegees() });
  for (const [ancre, attendu] of [['#/', '.project-card'], ['#/entrees', '#grid .card'], ['#/entrees?vue=liste', '.entry-line'],
    ['#/entree/abcdef123456', '#entry-title'], ['#/projet/x', '#titre-vue'], ['#/recherche?q=voisine', '#page-view .card']]) {
    await page.goto(site.url(ancre));
    await page.locator(attendu).first().waitFor();
```

par :

```js
  const page = await site.page({ donnees: donneesPiegees() });
  for (const [ancre, attendu] of [['#/', '.project-card'], ['#/entrees', '#grid .card'], ['#/entrees?vue=liste', '.entry-line'],
    ['#/entree/abcdef123456', '#entry-title'], ['#/entree/abcdef000000', '#h-voir-aussi'], ['#/projet/x', '#titre-vue'],
    ['#/recherche?q=voisine', '#page-view .card']]) {
    await page.goto(site.url(ancre));
    await page.locator(attendu).first().waitFor();
```


- [ ] **Step 3: Vérifier l'échec**

Run: `cd tests/navigateur; node --test fiche.test.mjs robustesse.test.mjs`
Expected: FAIL — « bouton du lien principal en tête » (pas de `.entry-main-link`), « Voir aussi » (pas de `#h-voir-aussi`), XSS (attend `#h-voir-aussi` sur la fiche voisine).

- [ ] **Step 4: Modifier `docs/js/vues/fiche.js`**

4 remplacements, dans l'ordre (chaque bloc à remplacer est unique dans le fichier).

1. Remplacer :

```js
   texte intégral, tags, entrées du même projet, détails. */
import { entryHash, projectHash, parseHash } from '../routes.js';
import { el, typeBadge, projectButton, typeLabel, formatLong, isWebUrl, copy } from '../composants.js';

/* Libellé du lien de retour selon la vue d'origine. */
```

par :

```js
   texte intégral, tags, entrées du même projet, détails. */
import { entryHash, projectHash, parseHash } from '../routes.js';
import {
  el, typeBadge, projectButton, typeLabel, formatLong, isWebUrl, copy, mainLinkButton, isNew, newBadge,
} from '../composants.js';

/* Libellé du lien de retour selon la vue d'origine. */
```

2. Remplacer :

```js
    const children = [
      nav,
      el('div', { class: 'badges' }, typeBadge(entry.type), entry.projet ? projectButton(entry) : null),
      el('h2', { id: 'entry-title', tabindex: '-1' }, entry.titre),
      el('p', { class: 'entry-dates' },
        created ? 'Créée le ' + created : '',
```

par :

```js
    const children = [
      nav,
      el('div', { class: 'badges' }, typeBadge(entry.type), entry.projet ? projectButton(entry) : null,
        isNew(entry, state.since) ? newBadge() : null),
      el('h2', { id: 'entry-title', tabindex: '-1' }, entry.titre),
      entry._mainLink ? el('p', { class: 'entry-main-link' }, mainLinkButton(entry._mainLink, entry.titre)) : null,
      el('p', { class: 'entry-dates' },
        created ? 'Créée le ' + created : '',
```

3. Remplacer :

```js
        el('ul', { class: 'tags' }, entry.tags.map((tag) => el('li', null,
          el('button', { type: 'button', class: 'tag', 'data-action': 'tag', 'data-tag': tag }, tag))))) : null,
      siblingsSection(entry),
      detailsSection(entry),
```

par :

```js
        el('ul', { class: 'tags' }, entry.tags.map((tag) => el('li', null,
          el('button', { type: 'button', class: 'tag', 'data-action': 'tag', 'data-tag': tag }, tag))))) : null,
      seeAlsoSection(entry),
      siblingsSection(entry),
      detailsSection(entry),
```

4. Remplacer :

```js
  }

  function siblingsSection(entry) {
    if (!entry.projet) return null;
```

par :

```js
  }

  /* Voisins calculés à l'export (proches par le sens), du plus proche au
     moins proche, avec leur type et leur projet. */
  function seeAlsoSection(entry) {
    if (!entry._neighbours.length) return null;
    const neighbours = entry._neighbours.slice().sort((a, b) => b.score - a.score);
    return el('section', { 'aria-labelledby': 'h-voir-aussi' },
      el('h3', { id: 'h-voir-aussi' }, 'Voir aussi'),
      el('ul', { class: 'see-also' }, neighbours.map(({ entry: other }) => el('li', {
        'data-couleur': other._family ? other._family.couleur : null,
      },
      typeBadge(other.type),
      el('a', { href: entryHash(other) }, other.titre),
      el('span', { class: 'see-also-project' }, other.projet ? other._projectName : 'Sans projet')))));
  }

  function siblingsSection(entry) {
    if (!entry.projet) return null;
```


- [ ] **Step 5: Modifier `docs/style.css`**

2 remplacements, dans l'ordre (chaque bloc à remplacer est unique dans le fichier).

1. Remplacer :

```css
.entry h2#entry-title:focus { outline: none; }

.entry-dates { font-size: 13px; color: var(--text-muted); margin: 0 0 22px; }

```

par :

```css
.entry h2#entry-title:focus { outline: none; }

.entry-main-link { margin: 0 0 14px; }
.entry-dates { font-size: 13px; color: var(--text-muted); margin: 0 0 22px; }

```

2. Remplacer :

```css
.facts dd { margin: 0; overflow-wrap: anywhere; }

.siblings { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.siblings li { display: flex; gap: 10px; align-items: baseline; min-width: 0; }
```

par :

```css
.facts dd { margin: 0; overflow-wrap: anywhere; }

.see-also { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
.see-also li {
  display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 10px; min-width: 0;
  border-left: 4px solid var(--famille); padding: 2px 0 2px 12px;
}
.see-also a { overflow-wrap: anywhere; }
.see-also .type-badge { flex-shrink: 0; font-size: 11px; padding: 2px 8px; }
.see-also-project { font-size: 13px; color: var(--text-muted); }

.siblings { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.siblings li { display: flex; gap: 10px; align-items: baseline; min-width: 0; }
```


- [ ] **Step 6: Vérifier le succès**

Run: `cd tests/navigateur; npm test`
Expected: PASS — 76 tests.

- [ ] **Step 7: Commit**

```bash
git add docs/js/vues/fiche.js docs/style.css tests/navigateur/fiche.test.mjs tests/navigateur/robustesse.test.mjs
git commit -m "Site : fiche — lien principal en tête, « Voir aussi »

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: Performance : 3 000 entrées dans le navigateur

Chaque frappe traitée (recherche **et** affichage de la page de résultats) est mesurée par `performance.measure('memoire-vive:recherche', …)` ; le test tape une requête avec fautes, pluriel et préfixe sur 3 000 entrées générées, une touche toutes les 150 ms (au-delà du délai de 120 ms, donc une recherche par touche), et exige moins de 50 ms pour la plus lente (mesuré : environ 16 ms). L'horloge réelle est nécessaire : l'horloge simulée de Playwright neutralise `performance.measure`.

**Files:**

- Modify: `docs/js/app.js`
- Test: `tests/navigateur/performance.test.mjs` (créé)

**Interfaces:**

- Consumes: `jeuVolumineux` (Task 4), `typeSearch` (Task 5), page de résultats (Task 11), option `horloge: false` (Task 1).
- Produces: mesure `memoire-vive:recherche` (une par frappe).

- [ ] **Step 1: Test — Créer `tests/navigateur/performance.test.mjs`**

```js
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { ouvrirSite, terminer, attendreAncre } from './outils.mjs';
import { jeuVolumineux } from './donnees-test.mjs';

let site;
before(async () => { site = await ouvrirSite(); });
after(async () => { await site.fermer(); });

test('3 000 entrées : chaque frappe (recherche et affichage) en moins de 50 ms', async () => {
  const page = await site.page({ donnees: jeuVolumineux(3000), horloge: false });
  await page.goto(site.url('#/entrees'));
  await page.locator('#grid .card').first().waitFor();
  const requete = 'architecure reseaux donj';
  // 150 ms entre deux touches : chaque frappe déclenche sa recherche (délai de 120 ms).
  await page.locator('#search-input').pressSequentially(requete, { delay: 150 });
  await attendreAncre(page, 'q=architecure+reseaux+donj');
  await page.waitForTimeout(200);
  const durees = await page.evaluate(() => performance.getEntriesByName('memoire-vive:recherche').map((m) => m.duration));
  assert.ok(durees.length >= requete.replace(/ /g, '').length - 2, `${durees.length} mesures`);
  const pire = Math.max(...durees);
  assert.ok(pire < 50, `frappe la plus lente : ${pire.toFixed(1)} ms`);
  await terminer(page);
});
```

- [ ] **Step 2: Vérifier l'échec**

Run: `cd tests/navigateur; node --test performance.test.mjs`
Expected: FAIL — `0 mesures` (aucune mesure `memoire-vive:recherche` encore).

- [ ] **Step 3: Modifier `docs/js/app.js`**

2 remplacements, dans l'ordre (chaque bloc à remplacer est unique dans le fichier).

1. Remplacer :

```js

/* Frappe dans la barre de recherche : la première frappe ouvre #/recherche
   (nouvelle entrée d'historique), les suivantes remplacent cette entrée. */
function typeSearch(q) {
  if (!q) { leaveSearch(); return; }
```

par :

```js

/* Frappe dans la barre de recherche : la première frappe ouvre #/recherche
   (nouvelle entrée d'historique), les suivantes remplacent cette entrée.
   Chaque frappe est mesurée (recherche et affichage) : mesure
   « memoire-vive:recherche », lue par le test de performance. */
function typeSearch(q) {
  if (!q) { leaveSearch(); return; }
```

2. Remplacer :

```js
  if (onSearch) history.replaceState(history.state, '', searchHash(q));
  else history.pushState({ typed: true }, '', searchHash(q));
  // Quitter une vue en tapant (même une fiche) n'est pas un « retour » :
  // le focus reste dans le champ.
  state.typing = true;
  try { route(); } finally { state.typing = false; }
}

```

par :

```js
  if (onSearch) history.replaceState(history.state, '', searchHash(q));
  else history.pushState({ typed: true }, '', searchHash(q));
  // Quitter une vue en tapant (même une fiche) n'est pas un « retour » :
  // le focus reste dans le champ.
  state.typing = true;
  const start = performance.now();
  try { route(); } finally { state.typing = false; }
  performance.measure('memoire-vive:recherche', { start, end: performance.now() });
}

```


- [ ] **Step 4: Vérifier le succès**

Run: `cd tests/navigateur; node --test performance.test.mjs`
Expected: PASS — pire frappe mesurée autour de 16 ms (seuil 50 ms). Lancer 3 fois : les 3 passent.

Run: `cd tests/navigateur; npm test`
Expected: PASS — 77 tests.

- [ ] **Step 5: Commit**

```bash
git add docs/js/app.js tests/navigateur/performance.test.mjs
git commit -m "Tests : 3 000 entrées, moins de 50 ms par frappe dans le navigateur

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 14: Tests Python : identifiants courts distincts

Piège connu : `tests/aides.memoire(n)` fabrique `content_hash = f"{n:064x}"`, donc tous les petits `n` partagent le même identifiant court (`000000000000`, les 12 premiers caractères, clé de `config/entrees.json` et de `#/entree/<id>`). Les tests contournaient le problème (`2 * 16 ** 52`). `hash_de(n)` place `n` dans les 12 premiers caractères ; tous les tests l'utilisent, les contournements disparaissent.

**Files:**

- Modify: `tests/aides.py`
- Test: `tests/test_config.py` (modifié), `tests/test_donnees.py` (modifié), `tests/test_publication.py` (modifié)

**Interfaces:**

- Consumes: `tests/aides.py`.
- Produces: `tests.aides.hash_de(n) → str` (64 hexadécimaux, `f"{n:012x}" + "0" * 52`), utilisé par `memoire(n, …)` et par les tests.

- [ ] **Step 1: Test — Modifier `tests/test_config.py`**

2 remplacements, dans l'ordre (chaque bloc à remplacer est unique dans le fichier).

1. Remplacer :

```python
from unittest import mock

from tests.aides import config, export, memoire


```

par :

```python
from unittest import mock

from tests.aides import config, export, hash_de, memoire


class AidesTest(unittest.TestCase):
    def test_identifiants_courts_distincts(self):
        courts = {memoire(n, "x", [])["content_hash"][:12] for n in range(1, 1001)}
        self.assertEqual(len(courts), 1000)
        self.assertEqual(memoire(2, "x", [])["content_hash"], hash_de(2))
        self.assertRegex(hash_de(2), r"^[0-9a-f]{64}$")


```

2. Remplacer :

```python
                memoire(2, "Note publique : à publier. Suite.", ["public"])]
        payload, report = export.build_payload(brut, cfg)
        self.assertEqual([e["id"] for e in payload["entrees"]], [f"{2:064x}"])
        self.assertEqual(report["excluded"], 1)

```

par :

```python
                memoire(2, "Note publique : à publier. Suite.", ["public"])]
        payload, report = export.build_payload(brut, cfg)
        self.assertEqual([e["id"] for e in payload["entrees"]], [hash_de(2)])
        self.assertEqual(report["excluded"], 1)

```


- [ ] **Step 2: Test — Modifier `tests/test_donnees.py`**

12 remplacements, dans l'ordre (chaque bloc à remplacer est unique dans le fichier).

1. Remplacer :

```python
from unittest import mock

from tests.aides import config, export, memoire

TEXTE = "Projet Alpha (D:\\alpha) : un outil de test. Il fait des choses utiles. Et encore."
```

par :

```python
from unittest import mock

from tests.aides import config, export, hash_de, memoire

TEXTE = "Projet Alpha (D:\\alpha) : un outil de test. Il fait des choses utiles. Et encore."
```

2. Remplacer :

```python
    def test_titre_et_resume_corriges(self):
        brut = [memoire(1, TEXTE, ["alpha", "projet"])]
        cle = f"{1:064x}"[:12]
        payload, report = export.build_payload(brut, config(), overrides={cle: {"titre": "Alpha", "resume": "Résumé à la main."}})
        entree = payload["entrees"][0]
```

par :

```python
    def test_titre_et_resume_corriges(self):
        brut = [memoire(1, TEXTE, ["alpha", "projet"])]
        cle = hash_de(1)[:12]
        payload, report = export.build_payload(brut, config(), overrides={cle: {"titre": "Alpha", "resume": "Résumé à la main."}})
        entree = payload["entrees"][0]
```

3. Remplacer :

```python

    def test_masquer_retire_l_entree(self):
        # n=2 * 16**52 (plutôt que 2 tout court) : content_hash étant n formé en
        # hexadécimal sur 64 caractères (voir tests/aides.py), un petit entier
        # laisse les 12 premiers caractères à "000000000000", identiques à
        # memoire(1, ...) — la clé de correction collisionnerait avec l'entrée 1.
        deuxieme = 2 * 16 ** 52
        brut = [memoire(1, TEXTE, ["alpha"]), memoire(deuxieme, TEXTE + " Bis.", ["alpha"])]
        payload, report = export.build_payload(brut, config(), overrides={f"{deuxieme:064x}"[:12]: {"masquer": True}})
        self.assertEqual([e["id"] for e in payload["entrees"]], [f"{1:064x}"])
        self.assertEqual(report["masquees"], 1)

```

par :

```python

    def test_masquer_retire_l_entree(self):
        brut = [memoire(1, TEXTE, ["alpha"]), memoire(2, TEXTE + " Bis.", ["alpha"])]
        payload, report = export.build_payload(brut, config(), overrides={hash_de(2)[:12]: {"masquer": True}})
        self.assertEqual([e["id"] for e in payload["entrees"]], [hash_de(1)])
        self.assertEqual(report["masquees"], 1)

```

4. Remplacer :

```python

    def test_correction_aussi_masquee_si_secret(self):
        cle = f"{1:064x}"[:12]
        payload, _ = export.build_payload([memoire(1, TEXTE, ["alpha"])], config(),
                                          overrides={cle: {"titre": "Alpha password=Hunter22!"}})
```

par :

```python

    def test_correction_aussi_masquee_si_secret(self):
        cle = hash_de(1)[:12]
        payload, _ = export.build_payload([memoire(1, TEXTE, ["alpha"])], config(),
                                          overrides={cle: {"titre": "Alpha password=Hunter22!"}})
```

5. Remplacer :

```python

    def test_masquages_des_corrections_comptes(self):
        cle = f"{1:064x}"[:12]  # une seule entrée : memoire(2) aurait la même clé courte
        _, report = export.build_payload([memoire(1, TEXTE, ["alpha"])], config(), overrides={
            cle: {"titre": "Alpha password=Hunter22!", "resume": "Clé : sk-ant-abcdefghijklmnopqrstuvwxyz0123"}})
```

par :

```python

    def test_masquages_des_corrections_comptes(self):
        cle = hash_de(1)[:12]
        _, report = export.build_payload([memoire(1, TEXTE, ["alpha"])], config(), overrides={
            cle: {"titre": "Alpha password=Hunter22!", "resume": "Clé : sk-ant-abcdefghijklmnopqrstuvwxyz0123"}})
```

6. Remplacer :

```python

def entrees(n):
    return [{"id": f"{i:064x}", "contenu": f"texte {i}"} for i in range(1, n + 1)]


def h(i):
    return f"{i:064x}"


```

par :

```python

def entrees(n):
    return [{"id": hash_de(i), "contenu": f"texte {i}"} for i in range(1, n + 1)]


def h(i):
    return hash_de(i)


```

7. Remplacer :

```python
    """update_neighbours : ce que fait main() (réglage, entrées en attente, recalcul complet)."""
    def payload(self, n):
        brut = [memoire(i * 16 ** 52, f"Projet Alpha : entrée. Numéro {i}", ["alpha"], minute=i)
                for i in range(1, n + 1)]
        return export.build_payload(brut, config())[0]

    def sens(self, n):
        # Hash fabriqués par memoire(i * 16**52) : identifiants courts distincts.
        sens = FauxSens([], {})
        def search(query, n_results):
            i = int(query.split()[-1])
            sens.appels.append(i)
            return [(f"{j * 16 ** 52:064x}", 0.95 if abs(i - j) == 1 else 0.1) for j in range(1, n + 1) if j != i]
        sens.search = search
        return sens
```

par :

```python
    """update_neighbours : ce que fait main() (réglage, entrées en attente, recalcul complet)."""
    def payload(self, n):
        brut = [memoire(i, f"Projet Alpha : entrée. Numéro {i}", ["alpha"], minute=i)
                for i in range(1, n + 1)]
        return export.build_payload(brut, config())[0]

    def sens(self, n):
        sens = FauxSens([], {})
        def search(query, n_results):
            i = int(query.split()[-1])
            sens.appels.append(i)
            return [(hash_de(j), 0.95 if abs(i - j) == 1 else 0.1) for j in range(1, n + 1) if j != i]
        sens.search = search
        return sens
```

8. Remplacer :

```python
        export.update_neighbours(second, json.loads(json.dumps(premier)), sens.search)
        self.assertEqual(sens.appels, [5])
        quatre = next(e for e in second["entrees"] if e["id"] == f"{4 * 16 ** 52:064x}")
        self.assertIn({"id": f"{5 * 16 ** 52:064x}", "score": 0.95}, quatre["voisins"])

    def test_recalcul_force_ou_reglage_change(self):
```

par :

```python
        export.update_neighbours(second, json.loads(json.dumps(premier)), sens.search)
        self.assertEqual(sens.appels, [5])
        quatre = next(e for e in second["entrees"] if e["id"] == hash_de(4))
        self.assertIn({"id": hash_de(5), "score": 0.95}, quatre["voisins"])

    def test_recalcul_force_ou_reglage_change(self):
```

9. Remplacer :

```python
    def test_resultats_bien_formes(self):
        api = self._api({"results": [
            {"memory": {"content_hash": f"{1:064x}"}, "similarity_score": 0.9},
            {"memory": {"content_hash": f"{2:064x}"}, "similarity_score": 0.5},
        ]})
        self.assertEqual(api.search("texte", 5), [(f"{1:064x}", 0.9), (f"{2:064x}", 0.5)])

    def test_elements_mal_formes_ignores(self):
```

par :

```python
    def test_resultats_bien_formes(self):
        api = self._api({"results": [
            {"memory": {"content_hash": hash_de(1)}, "similarity_score": 0.9},
            {"memory": {"content_hash": hash_de(2)}, "similarity_score": 0.5},
        ]})
        self.assertEqual(api.search("texte", 5), [(hash_de(1), 0.9), (hash_de(2), 0.5)])

    def test_elements_mal_formes_ignores(self):
```

10. Remplacer :

```python
            {"similarity_score": 0.8},                # pas de "memory" du tout
            {"memory": {}},                            # pas de content_hash
            {"memory": {"content_hash": f"{3:064x}"}, "similarity_score": "pas un nombre"},
            {"memory": {"content_hash": f"{4:064x}"}, "similarity_score": 0.7},
        ]})
        self.assertEqual(api.search("texte", 5), [(f"{4:064x}", 0.7)])

    def test_reponse_sans_liste_results_leve_exporterror(self):
```

par :

```python
            {"similarity_score": 0.8},                # pas de "memory" du tout
            {"memory": {}},                            # pas de content_hash
            {"memory": {"content_hash": hash_de(3)}, "similarity_score": "pas un nombre"},
            {"memory": {"content_hash": hash_de(4)}, "similarity_score": 0.7},
        ]})
        self.assertEqual(api.search("texte", 5), [(hash_de(4), 0.7)])

    def test_reponse_sans_liste_results_leve_exporterror(self):
```

11. Remplacer :

```python
            {"memory": {"content_hash": {"a": 1}}, "similarity_score": 0.9},
            {"memory": {"content_hash": 42}, "similarity_score": 0.9},
            {"memory": {"content_hash": f"{5:064x}"}, "similarity_score": 0.9},
        ]})
        self.assertEqual(api.search("texte", 5), [(f"{5:064x}", 0.9)])

    def test_scores_non_finis_ignores(self):
```

par :

```python
            {"memory": {"content_hash": {"a": 1}}, "similarity_score": 0.9},
            {"memory": {"content_hash": 42}, "similarity_score": 0.9},
            {"memory": {"content_hash": hash_de(5)}, "similarity_score": 0.9},
        ]})
        self.assertEqual(api.search("texte", 5), [(hash_de(5), 0.9)])

    def test_scores_non_finis_ignores(self):
```

12. Remplacer :

```python
        liste = entrees(4)
        def search(query, n):
            return [(f"{2:064x}", float("nan")), (f"{3:064x}", float("inf")), (f"{4:064x}", 0.9)]
        export.add_neighbours(liste, search)
        for entree in liste:
            for voisin in entree["voisins"]:
                self.assertTrue(math.isfinite(voisin["score"]), entree["voisins"])
        self.assertEqual([v["id"] for v in liste[0]["voisins"]], [f"{4:064x}"])

    def test_empreinte_refuse_nan(self):
```

par :

```python
        liste = entrees(4)
        def search(query, n):
            return [(hash_de(2), float("nan")), (hash_de(3), float("inf")), (hash_de(4), 0.9)]
        export.add_neighbours(liste, search)
        for entree in liste:
            for voisin in entree["voisins"]:
                self.assertTrue(math.isfinite(voisin["score"]), entree["voisins"])
        self.assertEqual([v["id"] for v in liste[0]["voisins"]], [hash_de(4)])

    def test_empreinte_refuse_nan(self):
```


- [ ] **Step 3: Test — Modifier `tests/test_publication.py`**

5 remplacements, dans l'ordre (chaque bloc à remplacer est unique dans le fichier).

1. Remplacer :

```python
from urllib.parse import parse_qs, urlparse

RACINE = Path(__file__).resolve().parent.parent
CLE = "cle-de-test-123"
```

par :

```python
from urllib.parse import parse_qs, urlparse

from tests.aides import hash_de

RACINE = Path(__file__).resolve().parent.parent
CLE = "cle-de-test-123"
```

2. Remplacer :

```python
def fausse_memoire(i):
    return {"content": f"Projet Test{i % 7} : entrée numéro {i}. Détail sur D:\\test\\{i} et https://exemple.fr/{i}.",
            "content_hash": f"{i:064x}", "tags": [f"test{i % 7}", "projet"], "memory_type": "note",
            "metadata": {"access_queries": ["requête secrète"]}, "created_at": 1_790_000_000 + i,
            "created_at_iso": None, "updated_at": None, "updated_at_iso": None}
```

par :

```python
def fausse_memoire(i):
    return {"content": f"Projet Test{i % 7} : entrée numéro {i}. Détail sur D:\\test\\{i} et https://exemple.fr/{i}.",
            "content_hash": hash_de(i), "tags": [f"test{i % 7}", "projet"], "memory_type": "note",
            "metadata": {"access_queries": ["requête secrète"]}, "created_at": 1_790_000_000 + i,
            "created_at_iso": None, "updated_at": None, "updated_at_iso": None}
```

3. Remplacer :

```python

    def entree(self, i):
        return next(e for e in self.donnees()["entrees"] if e["id"] == f"{i:064x}")

    # Les scénarios s'enchaînent : unittest les trie par nom, d'où la numérotation.
```

par :

```python

    def entree(self, i):
        return next(e for e in self.donnees()["entrees"] if e["id"] == hash_de(i))

    # Les scénarios s'enchaînent : unittest les trie par nom, d'où la numérotation.
```

4. Remplacer :

```python
        self.assertNotIn("requête secrète", texte)
        # 5 trouve 6 (0,9) ; 4 trouve 5 (0,9), donc 5 reçoit 4 par symétrie.
        self.assertEqual(self.entree(5)["voisins"], [{"id": f"{4:064x}", "score": 0.9},
                                                     {"id": f"{6:064x}", "score": 0.9}])
        self.assertEqual(self.donnees()["schema"], 1)
        self.assertEqual(self.donnees()["voisins_reglage"], {"seuil": 0.8, "max": 5})
```

par :

```python
        self.assertNotIn("requête secrète", texte)
        # 5 trouve 6 (0,9) ; 4 trouve 5 (0,9), donc 5 reçoit 4 par symétrie.
        self.assertEqual(self.entree(5)["voisins"], [{"id": hash_de(4), "score": 0.9},
                                                     {"id": hash_de(6), "score": 0.9}])
        self.assertEqual(self.donnees()["schema"], 1)
        self.assertEqual(self.donnees()["voisins_reglage"], {"seuil": 0.8, "max": 5})
```

5. Remplacer :

```python
        self.assertEqual(ETAT["posts"], 1, sortie)
        # 130 trouve 0 (131 % 131) : l'ancienne entrée 0 la reçoit par symétrie.
        self.assertEqual(self.entree(130)["voisins"], [{"id": f"{0:064x}", "score": 0.9}])
        self.assertIn({"id": f"{130:064x}", "score": 0.9}, self.entree(0)["voisins"])
        self.assertIn({"id": f"{1:064x}", "score": 0.9}, self.entree(0)["voisins"], "les anciens restent")

    def test_02e_recalculer_voisins(self):
```

par :

```python
        self.assertEqual(ETAT["posts"], 1, sortie)
        # 130 trouve 0 (131 % 131) : l'ancienne entrée 0 la reçoit par symétrie.
        self.assertEqual(self.entree(130)["voisins"], [{"id": hash_de(0), "score": 0.9}])
        self.assertIn({"id": hash_de(130), "score": 0.9}, self.entree(0)["voisins"])
        self.assertIn({"id": hash_de(1), "score": 0.9}, self.entree(0)["voisins"], "les anciens restent")

    def test_02e_recalculer_voisins(self):
```


- [ ] **Step 4: Vérifier l'échec**

Run: `python -m unittest tests.test_config tests.test_donnees tests.test_publication`
Expected: ERROR — `FAILED (errors=3)` : les trois modules lèvent `ImportError: cannot import name 'hash_de' from 'tests.aides'`.

- [ ] **Step 5: Modifier `tests/aides.py`**

Remplacer :

```python


def memoire(n, contenu, tags, type="note", minute=0):
    """n : entier qui fabrique un content_hash unique et stable."""
    return {
        "content": contenu,
        "content_hash": f"{n:064x}",
        "tags": list(tags),
        "memory_type": type,
```

par :

```python


def hash_de(n):
    """content_hash synthétique de 64 caractères hexadécimaux, stable, dont
    les 12 premiers (identifiant court des fiches et de config/entrees.json)
    sont propres à n : n écrit sur 12 chiffres, complété par des zéros."""
    return f"{n:012x}" + "0" * 52


def memoire(n, contenu, tags, type="note", minute=0):
    """n : entier qui fabrique un content_hash unique et stable (hash_de)."""
    return {
        "content": contenu,
        "content_hash": hash_de(n),
        "tags": list(tags),
        "memory_type": type,
```


- [ ] **Step 6: Vérifier le succès**

Run: `python -m unittest discover -s tests -v`
Expected: PASS — 87 tests OK (86 + « identifiants courts distincts »).

- [ ] **Step 7: Commit**

```bash
git add tests/aides.py tests/test_config.py tests/test_donnees.py tests/test_publication.py
git commit -m "Tests : identifiants courts distincts dans les entrées synthétiques

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 15: Schéma 2 : export et site ensemble

Spec § 3.5 : le passage à `schema: 2` se fait dans le même push que le nouveau site. Cette tâche fait passer ensemble, dans **un seul commit**, `SCHEMA_VERSION` de l'export, la constante `SUPPORTED_SCHEMA` du site (déplacée dans `donnees.js` pour être testable), le jeu de test et `docs/data.json` (réécrit avec les fonctions de l'export, voir « Choix d'interprétation », point 10). Un test Node vérifie que les trois valeurs concordent.

**Files:**

- Modify: `docs/data.json`, `docs/js/app.js`, `docs/js/donnees.js`, `scripts/export.py`
- Test: `tests/js/schema.test.mjs` (créé), `tests/navigateur/donnees-test.mjs` (modifié), `tests/test_donnees.py` (modifié), `tests/test_publication.py` (modifié)

**Interfaces:**

- Consumes: `loadData` (Task 3), `fingerprint`, `write_payload`, `DATA_FILE` (export).
- Produces: `donnees.js` : `SUPPORTED_SCHEMA = 2`, `loadData(url, supportedSchema = SUPPORTED_SCHEMA, fetcher = fetch)` ; `scripts/export.py` : `SCHEMA_VERSION = 2` ; `donnees-test.mjs` : `SCHEMA_TEST = 2`.

- [ ] **Step 1: Test — Créer `tests/js/schema.test.mjs`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SUPPORTED_SCHEMA, loadData, DataError } from '../../docs/js/donnees.js';

const lire = (chemin) => readFileSync(new URL(chemin, import.meta.url), 'utf8');

test('schéma 2 : l’export, le site et data.json avancent ensemble', () => {
  const version = Number(lire('../../scripts/export.py').match(/^SCHEMA_VERSION = (\d+)$/m)[1]);
  assert.equal(SUPPORTED_SCHEMA, 2);
  assert.equal(version, SUPPORTED_SCHEMA, 'SCHEMA_VERSION de scripts/export.py');
  assert.equal(JSON.parse(lire('../../docs/data.json')).schema, SUPPORTED_SCHEMA, 'docs/data.json');
});

test('le site accepte les schémas 1 et 2, refuse le 3', async () => {
  const servir = (schema) => async () => new Response(JSON.stringify({ schema, entrees: [] }),
    { headers: { 'Content-Type': 'application/json' } });
  assert.equal((await loadData('data.json', undefined, servir(1))).schema, 1);
  assert.equal((await loadData('data.json', undefined, servir(2))).schema, 2);
  await assert.rejects(loadData('data.json', undefined, servir(3)), (e) => e instanceof DataError && /recharger la page/.test(e.message));
});
```

- [ ] **Step 2: Test — Modifier `tests/test_donnees.py`**

Remplacer :

```python
        self.assertEqual([f["id"] for f in payload["familles"]], ["jeux", "outils"])
        self.assertEqual(payload["synonymes"], [["ia", "llm"]])
        self.assertEqual(payload["schema"], 1)

    def test_normalisation_des_synonymes(self):
```

par :

```python
        self.assertEqual([f["id"] for f in payload["familles"]], ["jeux", "outils"])
        self.assertEqual(payload["synonymes"], [["ia", "llm"]])
        self.assertEqual(payload["schema"], 2)

    def test_normalisation_des_synonymes(self):
```


- [ ] **Step 3: Test — Modifier `tests/test_publication.py`**

Remplacer :

```python
        self.assertEqual(self.entree(5)["voisins"], [{"id": hash_de(4), "score": 0.9},
                                                     {"id": hash_de(6), "score": 0.9}])
        self.assertEqual(self.donnees()["schema"], 1)
        self.assertEqual(self.donnees()["voisins_reglage"], {"seuil": 0.8, "max": 5})
        self.assertEqual(self.donnees()["voisins_en_attente"], [])
```

par :

```python
        self.assertEqual(self.entree(5)["voisins"], [{"id": hash_de(4), "score": 0.9},
                                                     {"id": hash_de(6), "score": 0.9}])
        self.assertEqual(self.donnees()["schema"], 2)
        self.assertEqual(self.donnees()["voisins_reglage"], {"seuil": 0.8, "max": 5})
        self.assertEqual(self.donnees()["voisins_en_attente"], [])
```


- [ ] **Step 4: Test — Modifier `tests/navigateur/donnees-test.mjs`**

Remplacer :

```js
   mémoire). Même forme que docs/data.json produit par scripts/export.py. */

export const SCHEMA_TEST = 1;
export const MAINTENANT_TEST = '2026-09-20T12:00:00.000Z';
const MAINTENANT = Date.parse(MAINTENANT_TEST);
```

par :

```js
   mémoire). Même forme que docs/data.json produit par scripts/export.py. */

export const SCHEMA_TEST = 2;
export const MAINTENANT_TEST = '2026-09-20T12:00:00.000Z';
const MAINTENANT = Date.parse(MAINTENANT_TEST);
```


- [ ] **Step 5: Vérifier l'échec**

Run: `node --test tests/js/schema.test.mjs`
Expected: FAIL — `does not provide an export named 'SUPPORTED_SCHEMA'`.

Run: `python -m unittest tests.test_donnees tests.test_publication -v`
Expected: FAIL — `1 != 2` dans « familles et synonymes à la racine » et « liste blanche et voisins ».

- [ ] **Step 6: Modifier `scripts/export.py`**

Remplacer :

```python
HTTP_RETRIES = 3
SEARCH_TIMEOUT = 10      # délai d'une recherche de voisins (POST /api/search)
SCHEMA_VERSION = 1

# En dessous de cette proportion de l'export précédent, on refuse de publier
```

par :

```python
HTTP_RETRIES = 3
SEARCH_TIMEOUT = 10      # délai d'une recherche de voisins (POST /api/search)
SCHEMA_VERSION = 2

# En dessous de cette proportion de l'export précédent, on refuse de publier
```


- [ ] **Step 7: Réécrire `docs/data.json` en schéma 2**

Avec les fonctions de l'export (même format que `write_payload`, `genere_le` inchangé, `empreinte` recalculée) :

```powershell
python -c "import json, sys; sys.path.insert(0, 'scripts'); import export; p = json.loads(export.DATA_FILE.read_text(encoding='utf-8')); p['schema'] = export.SCHEMA_VERSION; p['empreinte'] = export.fingerprint(p); export.write_payload(p)"
```

Expected: `git diff --stat docs/data.json` → 1 fichier, 2 lignes modifiées (`"schema": 2` et `"empreinte"`).

- [ ] **Step 8: Modifier `docs/js/donnees.js`**

2 remplacements, dans l'ordre (chaque bloc à remplacer est unique dans le fichier).

1. Remplacer :

```js
import { typeLabel, isWebUrl } from './composants.js';

export const NO_PROJECT = '_aucun';
export const NO_FAMILY = '_aucune';
```

par :

```js
import { typeLabel, isWebUrl } from './composants.js';

/* Version de data.json comprise par ce site (SCHEMA_VERSION de
   scripts/export.py) : une version plus récente demande de recharger la page. */
export const SUPPORTED_SCHEMA = 2;
export const NO_PROJECT = '_aucun';
export const NO_FAMILY = '_aucune';
```

2. Remplacer :

```js
   personnalisé et derrière Cloudflare Access (le cookie de session part avec
   la requête), sans rien changer ici. */
export async function loadData(url, supportedSchema, fetcher = fetch) {
  let response;
  try {
```

par :

```js
   personnalisé et derrière Cloudflare Access (le cookie de session part avec
   la requête), sans rien changer ici. */
export async function loadData(url, supportedSchema = SUPPORTED_SCHEMA, fetcher = fetch) {
  let response;
  try {
```


- [ ] **Step 9: Modifier `docs/js/app.js`**

2 remplacements, dans l'ordre (chaque bloc à remplacer est unique dans le fichier).

1. Remplacer :

```js
const CONFIG = {
  dataUrl: 'data.json',
  supportedSchema: 1,
  pageSize: 60,       // cartes affichées avant « Afficher plus »
  projectChips: 10,   // projets affichés avant « + N autres »
```

par :

```js
const CONFIG = {
  dataUrl: 'data.json',
  pageSize: 60,       // cartes affichées avant « Afficher plus »
  projectChips: 10,   // projets affichés avant « + N autres »
```

2. Remplacer :

```js
  let data;
  try {
    data = await loadData(CONFIG.dataUrl, CONFIG.supportedSchema);
  } catch (e) {
    if (e instanceof DataError) return fail(e.message);
```

par :

```js
  let data;
  try {
    data = await loadData(CONFIG.dataUrl);
  } catch (e) {
    if (e instanceof DataError) return fail(e.message);
```


- [ ] **Step 10: Vérifier le succès**

Run: `node --test "tests/js/*.test.mjs"`
Expected: PASS — 40 tests.

Run: `python -m unittest discover -s tests -v`
Expected: PASS — 87 tests OK.

Run: `cd tests/navigateur; npm test`
Expected: PASS — 77 tests (jeu de test en schéma 2 ; « schéma trop récent » teste désormais 3).

- [ ] **Step 11: Commit**

```bash
git add docs/data.json docs/js/app.js docs/js/donnees.js scripts/export.py tests/js/schema.test.mjs tests/navigateur/donnees-test.mjs tests/test_donnees.py tests/test_publication.py
git commit -m "Schéma 2 : export et site ensemble

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 16: README : site en modules, routes, recherche, tests

Documentation seulement ; le cycle de test consiste à exécuter chaque commande ajoutée au README.

**Files:**

- Modify: `README.md`

**Interfaces:**

- Consumes: tout ce qui précède.
- Produces: sections « Le site » et « Tests » à jour, structure du dépôt.

- [ ] **Step 1: Modifier `README.md`**

6 remplacements, dans l'ordre (chaque bloc à remplacer est unique dans le fichier).

1. Remplacer :

```markdown
(mcp-memory-service), sans passer par Claude Code ni claude.ai.

- **Site** : `docs/` (HTML/CSS/JS vanilla, aucune dépendance), publié par GitHub Pages.
- **Données** : `docs/data.json`, généré à l'avance. Le site ne fait aucun appel réseau
  en dehors de ce fichier.
```

par :

```markdown
(mcp-memory-service), sans passer par Claude Code ni claude.ai.

- **Site** : `docs/` (HTML/CSS/JS vanilla en modules ES, aucune dépendance), publié par
  GitHub Pages.
- **Données** : `docs/data.json`, généré à l'avance. Le site ne fait aucun appel réseau
  en dehors de ce fichier.
```

2. Remplacer :

```markdown
| `--recalculer-voisins` | recherche les voisins de toutes les entrées, pas seulement des nouvelles (une recherche par entrée) |

Tester le site en local : `python -m http.server 8080 -d docs` puis <http://localhost:8080>.

## Première mise en place (déjà faite pour ce dépôt)
```

par :

```markdown
| `--recalculer-voisins` | recherche les voisins de toutes les entrées, pas seulement des nouvelles (une recherche par entrée) |

Tester le site en local : `node tests/navigateur/serveur.mjs` puis
<http://127.0.0.1:8080/memoire-vive/> (même sous-chemin que GitHub Pages ; Node seul, sans
installation ; Ctrl+C pour arrêter). `python -m http.server 8080 -d docs` convient aussi
(site à la racine) tant que Python sert les `.js` en `text/javascript`, condition du
chargement des modules ES.

## Première mise en place (déjà faite pour ce dépôt)
```

3. Remplacer :

```markdown
`synonymes` (groupes de `config/recherche.json`, normalisés), `voisins_reglage` et
`voisins_en_attente` (voir les voisins ci-dessus). Tous ces champs sont des ajouts
compatibles : `schema` reste à 1 et le site actuel les ignore.

## Régler les projets, les entrées et la recherche
```

par :

```markdown
`synonymes` (groupes de `config/recherche.json`, normalisés), `voisins_reglage` et
`voisins_en_attente` (voir les voisins ci-dessus). Tous ces champs sont des ajouts
compatibles avec la version 1 ; depuis le chantier B, `data.json` porte `"schema": 2`.
`SCHEMA_VERSION` (export) et `SUPPORTED_SCHEMA` (`docs/js/donnees.js`) changent ensemble,
dans le même push (`tests/js/schema.test.mjs` le vérifie) : un site plus ancien qui reçoit
des données plus récentes demande de recharger la page.

## Le site

| Ancre | Page |
| --- | --- |
| `#/` | Accueil : les projets par famille (ordre de `config/projets.json`, puis « Sans famille »), activité la plus récente d'abord |
| `#/entrees?type=&famille=&projet=&tag=&tri=&vue=grille\|liste` | Toutes les entrées : filtres, tri, grille ou liste, « Afficher plus » |
| `#/recherche?q=…` | Résultats : projets, entrées, « En rapport » (voisins des meilleurs résultats) |
| `#/projet/<id>` | Page projet : liens, entrées par nature, jalons en chronologie, adresses locales, projets proches |
| `#/entree/<id court>` | Fiche : lien principal, texte intégral, « Voir aussi » (voisins) |

Les anciennes ancres (`#/?q=…&type=…`) redirigent vers leur équivalent : `#/recherche`
s'il y avait une recherche, sinon `#/entrees` avec les mêmes filtres.

**Recherche** (barre présente sur toutes les pages, touche `/`) : taper ouvre
`#/recherche`, sans créer une entrée d'historique par touche ; Échap revient à la page
d'origine.

- tous les mots doivent être présents ; majuscules, accents, `œ` et apostrophes ignorés ;
- pluriels confondus (`jeux` = `jeu`, `réseaux` = `réseau`, `animaux` = `animal`) ;
- fautes de frappe tolérées : une pour un mot de 5 à 7 lettres, deux à partir de 8 ;
  aucune en dessous de 5 lettres ;
- synonymes de `config/recherche.json` ;
- `"expression exacte"` ; `-mot` écarte les entrées qui contiennent ce mot ; le dernier
  mot (en cours de frappe) vaut aussi pour les mots qui commencent ainsi, dès 2 lettres ;
- score : titre ×6, projet, tags et type ×3, résumé ×2, texte ×1 (plafonné) ; une
  correspondance exacte compte plus qu'une approchée.

**Pastille « nouveau »** : le navigateur mémorise (`localStorage`, clé
`memoire-vive:derniere-visite`) la date de l'export affiché ; à la visite suivante, les
entrées créées après elle portent la pastille, et les projets qui en ont un point
« nouveau ». Sans stockage (navigation privée stricte), aucune pastille.

**Couleurs de famille** : indice 1 à 6 de `config/projets.json`, en clair et en sombre,
contraste d'au moins 4,5 sur les fonds (`tests/js/couleurs.test.mjs`). La couleur n'est
jamais la seule information : le nom de la famille est écrit sur l'accueil, la page projet
et dans les filtres.

## Régler les projets, les entrées et la recherche
```

4. Remplacer :

````markdown

```powershell
python -m unittest discover -s tests -v
```

Bibliothèque standard uniquement ; ni la mémoire réelle ni le réseau extérieur ne sont
touchés : `tests/test_publication.py` lance l'export contre un faux dashboard local, dans
un dépôt git temporaire relié à un dépôt distant local.

## Structure
````

par :

````markdown

```powershell
python -m unittest discover -s tests -v   # export (Python, bibliothèque standard)
node --test "tests/js/*.test.mjs"         # logique du site (Node 22+, sans installation)
```

Ni la mémoire réelle ni le réseau extérieur ne sont touchés : `tests/test_publication.py`
lance l'export contre un faux dashboard local, dans un dépôt git temporaire relié à un
dépôt distant local.

Tests navigateur : le Chrome installé, piloté par `playwright-core`, seule dépendance de
développement, isolée dans `tests/navigateur/` (le site n'en a aucune) :

```powershell
cd tests/navigateur
npm install   # une fois
npm test
```

Chaque fichier de test démarre son propre serveur statique sur un port libre (`docs/` servi
sous `/memoire-vive/`, comme GitHub Pages) et l'arrête à la fin. Les données viennent de
jeux synthétiques (`donnees-test.mjs`), sauf `reel.test.mjs` qui lit le vrai `data.json`.

| Variable | Effet |
| --- | --- |
| `MEMOIRE_CHROME` | chemin de Chrome (défaut : `C:/Program Files/Google/Chrome/Application/chrome.exe`) |
| `MEMOIRE_SITE_URL` | rejoue la suite sur un site publié au lieu du serveur local |

Rejouer la suite sur le site publié : `$env:MEMOIRE_SITE_URL = 'https://chipat-neko.github.io/memoire-vive/'; npm test`.

## Structure
````

5. Remplacer :

````markdown
```text
docs/               site publié par GitHub Pages (branche main, dossier /docs)
  index.html        page unique ; les fiches ont leur URL : #/entree/<id>
  app.js            recherche, filtres, vues, fiches
  style.css         palette et proportions de l'artifact « Bibliothèque Claude »
  theme.js          thème clair/sombre mémorisé, appliqué avant le rendu
````

par :

````markdown
```text
docs/               site publié par GitHub Pages (branche main, dossier /docs)
  index.html        page unique ; routes #/, #/entrees, #/recherche, #/projet/<id>, #/entree/<id>
  js/app.js         démarrage, routage, événements, thème
  js/donnees.js     chargement de data.json, modèle, index de recherche
  js/recherche.js   recherche tolérante et surlignage (module pur)
  js/routes.js      analyse et construction des ancres (module pur)
  js/composants.js  cartes, pastilles, boutons de lien, dates relatives
  js/vues/          accueil, entrees, resultats, projet, fiche
  js/package.json   « type: module » : les tests Node lisent ces fichiers comme modules
  style.css         palette et proportions de l'artifact « Bibliothèque Claude »
  theme.js          thème clair/sombre mémorisé, appliqué avant le rendu
````

6. Remplacer :

```markdown
exporter.cmd        la même chose en double-clic (Windows)
config/             réglages facultatifs : projets.json, entrees.json, recherche.json
tests/              tests unitaires et d'intégration de l'export
phase2/             modèle de workflow GitHub Actions, inactif
.env                clé locale (ignoré par git) — modèle : .env.example
```

par :

```markdown
exporter.cmd        la même chose en double-clic (Windows)
config/             réglages facultatifs : projets.json, entrees.json, recherche.json
tests/              tests unitaires et d'intégration de l'export (Python)
  js/               tests unitaires du site (node --test)
  navigateur/       tests navigateur (playwright-core, Chrome installé)
phase2/             modèle de workflow GitHub Actions, inactif
.env                clé locale (ignoré par git) — modèle : .env.example
```


- [ ] **Step 2: Vérifier chaque commande documentée**

Run: `node tests/navigateur/serveur.mjs` puis ouvrir <http://127.0.0.1:8080/memoire-vive/> ; Ctrl+C.
Expected: l'accueil (catalogue) s'affiche.

Run: `python -m unittest discover -s tests -v`
Expected: 87 tests OK.

Run: `node --test "tests/js/*.test.mjs"`
Expected: 40 tests réussis.

Run: `cd tests/navigateur; npm test`
Expected: 77 tests réussis.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "Documentation : site en modules, routes, recherche, tests navigateur

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 17: Recette finale sur le serveur local (données réelles)

Dernière vérification avant la revue : un fichier de tests lit le **vrai** `data.json` servi par le site (pas de jeu synthétique) et vérifie, indépendamment du contenu, que chaque vue et chaque fiche s'affichent sans erreur ; puis toutes les suites tournent ensemble. Le même fichier servira à rejouer la suite sur le site publié (`MEMOIRE_SITE_URL`, voir « Après le plan »).

**Files:**

- Test: `tests/navigateur/reel.test.mjs` (créé)

**Interfaces:**

- Consumes: toutes les vues ; `ouvrirSite`, `terminer`, `debordement`.
- Produces: `tests/navigateur/reel.test.mjs`.

- [ ] **Step 1: Test — Créer `tests/navigateur/reel.test.mjs`**

```js
/* Recette sur les vraies données : le data.json servi par le site (local ou
   publié avec MEMOIRE_SITE_URL). Vérifications indépendantes du contenu. */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { ouvrirSite, terminer, debordement } from './outils.mjs';

let site;
let donnees;
before(async () => {
  site = await ouvrirSite();
  const reponse = await fetch(site.url('data.json'), { cache: 'no-store' });
  donnees = await reponse.json();
});
after(async () => { await site.fermer(); });

test('données réelles : schéma pris en charge, accueil complet', async () => {
  assert.equal(donnees.schema, 2);
  const page = await site.page();
  await page.goto(site.url('#/'));
  await page.locator('.project-card').first().waitFor();
  const avecEntrees = new Set(donnees.entrees.map((e) => e.projet).filter(Boolean));
  assert.equal(await page.locator('.project-card').count(), donnees.projets.filter((p) => avecEntrees.has(p.id)).length);
  assert.match(await page.textContent('#stats'), new RegExp('^' + donnees.entrees.length + '\\sentrées'));
  assert.ok(await debordement(page) <= 0);
  await terminer(page);
});

test('données réelles : toutes les entrées, en grille et en liste', async () => {
  const page = await site.page();
  await page.goto(site.url('#/entrees'));
  await page.locator('#grid .card').first().waitFor();
  assert.equal(await page.locator('#grid .card').count(), Math.min(60, donnees.entrees.length));
  await page.goto(site.url('#/entrees?vue=liste'));
  await page.locator('#lines .entry-line').first().waitFor();
  assert.equal(await page.locator('#lines .entry-line').count(), Math.min(60, donnees.entrees.length));
  await terminer(page);
});

test('données réelles : chaque page projet s’affiche sans erreur', async () => {
  const page = await site.page();
  for (const projet of donnees.projets) {
    await page.goto(site.url('#/projet/' + encodeURIComponent(projet.id)));
    await page.locator('#titre-vue', { hasText: projet.nom }).waitFor();
  }
  await terminer(page);
});

test('données réelles : chaque fiche s’affiche, « Voir aussi » compte ses voisins publiés', async () => {
  const page = await site.page();
  const ids = new Set(donnees.entrees.map((e) => e.id));
  for (const entree of donnees.entrees) {
    await page.goto(site.url('#/entree/' + entree.id.slice(0, 12)));
    await page.locator('#entry-title', { hasText: entree.titre }).waitFor();
    const voisins = (entree.voisins || []).filter((v) => ids.has(v.id) && v.id !== entree.id).length;
    assert.equal(await page.locator('.see-also li').count(), voisins, entree.titre);
  }
  await terminer(page);
});

test('données réelles : recherches par nom de famille et de projet', async () => {
  const page = await site.page();
  const requetes = donnees.familles.map((f) => f.nom).concat(donnees.projets.slice(0, 5).map((p) => p.nom));
  for (const q of requetes) {
    await page.goto(site.url('#/recherche?q=' + encodeURIComponent(q)));
    await page.locator('#titre-vue', { hasText: q }).waitFor();
    assert.ok(await page.locator('#results-count').count() === 1, q);
  }
  await terminer(page);
});

test('données réelles : mobile sans défilement horizontal', async () => {
  const page = await site.page({ mobile: true });
  const plusDeLiens = donnees.entrees.slice().sort((a, b) => b.liens.length - a.liens.length)[0];
  for (const [ancre, attendu] of [['#/', '.project-card'], ['#/entrees', '#grid .card'],
    ['#/entree/' + plusDeLiens.id.slice(0, 12), '#entry-title'], ['#/projet/' + encodeURIComponent(donnees.projets[0].id), '#titre-vue']]) {
    await page.goto(site.url(ancre));
    await page.locator(attendu).first().waitFor();
    assert.ok(await debordement(page) <= 0, ancre);
  }
  await terminer(page);
});
```

- [ ] **Step 2: Lancer la recette sur les données réelles**

Run: `cd tests/navigateur; node --test reel.test.mjs`
Expected: PASS — 6 tests (sur les données réelles du dépôt).

Si un test échoue, c'est un défaut du site révélé par les vraies données : le corriger dans le module concerné, avec un test sur le jeu synthétique qui le reproduit, avant de continuer.

- [ ] **Step 3: Toutes les suites, ensemble**

Run: `python -m unittest discover -s tests -v`
Expected: 87 tests OK.

Run: `node --test "tests/js/*.test.mjs"`
Expected: 40 tests réussis.

Run: `cd tests/navigateur; npm test`
Expected: 83 tests réussis, aucune erreur de console ni de CSP.

Run: `git status --short`
Expected: seul `tests/navigateur/reel.test.mjs` est nouveau (`node_modules/` ignoré).

- [ ] **Step 4: Contrôle visuel rapide**

`node tests/navigateur/serveur.mjs`, puis dans Chrome, en thèmes clair et sombre, sur ordinateur et en largeur 375 px : accueil, une page projet, « Toutes les entrées » (grille puis liste, filtre famille), une recherche avec faute (« architecure »), une fiche avec « Voir aussi ». Noter tout défaut pour la revue.

- [ ] **Step 5: Commit**

```bash
git add tests/navigateur/reel.test.mjs
git commit -m "Tests navigateur : recette sur les vraies données

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Après le plan (hors tâches)

- **Revue** : comme chaque chantier, revue multi-agents avec vérification adversariale avant publication (spec § 6), sur la branche `chantier-b`.
- **Publication** : décidée par Noah, après la revue. Le push doit contenir ensemble le site des Tasks 3 à 15 et `scripts/export.py` en schéma 2 : toute la branche `chantier-b` part d'un bloc. D'abord, dans la copie du chantier, reprendre les exports faits sur `main` pendant le chantier :

```powershell
cd D:\memoire_vive-chantier-b
git log --oneline chantier-b..main    # vide : aucun export entre-temps, passer directement aux suites
git merge --no-commit main            # sinon : conflit attendu sur docs/data.json seulement
git checkout main -- docs/data.json   # data.json le plus récent de main (encore en schéma 1)
python -c "import json, sys; sys.path.insert(0, 'scripts'); import export; p = json.loads(export.DATA_FILE.read_text(encoding='utf-8')); p['schema'] = export.SCHEMA_VERSION; p['empreinte'] = export.fingerprint(p); export.write_payload(p)"
git add docs/data.json
git commit -m "Fusion de main : exports faits pendant le chantier, data.json en schéma 2

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

  (La commande `python -c` est celle de la Task 15, Step 7.) Relancer ensuite les trois suites (« Commandes ») : 87 tests Python, 40 tests Node, 83 tests navigateur. Puis, depuis `D:\memoire_vive` (sur `main`, aucun export en cours) :

```powershell
cd D:\memoire_vive
git merge --ff-only chantier-b
git push
```

  Si `git merge --ff-only` refuse (un export est arrivé sur `main` entre-temps), reprendre ce point depuis le début.
- **Après publication** : rejouer toute la suite sur le site publié (spec § 6 B), depuis la copie du chantier (son `node_modules` est installé), puis la retirer :

```powershell
cd D:\memoire_vive-chantier-b\tests\navigateur
$env:MEMOIRE_SITE_URL = 'https://chipat-neko.github.io/memoire-vive/'; npm test; Remove-Item Env:MEMOIRE_SITE_URL
cd D:\memoire_vive
git worktree remove ..\memoire_vive-chantier-b
git branch -d chantier-b
```

  Attendu : 83 tests OK (les jeux synthétiques sont injectés par Playwright à la place de `data.json`, `reel.test.mjs` lit le `data.json` publié ; `serveur.test.mjs` teste toujours le serveur local). Ensuite, `exporter.cmd` depuis `D:\memoire_vive` produit directement le schéma 2.
