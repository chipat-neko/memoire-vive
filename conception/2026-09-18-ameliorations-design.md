# Mémoire Vive — améliorations : recherche, cartes, projets

Spécification validée section par section avec Noah le 18/09/2026. Trois chantiers,
livrés dans l'ordre A → B → C, chacun utilisable dès sa publication.

## 1. Objectifs

1. **Trouver par le sens** : retrouver une entrée sans connaître ses mots exacts, et voir
   ce qui lui est proche.
2. **Cartes plus utiles** : titres corrigeables, lien principal visible sur la carte, vue
   compacte, repères visuels.
3. **Une page par projet** : tout un projet d'un coup (architecture, décisions, jalons,
   liens, chronologie).
4. **Organiser les projets** sans éditer de fichier à la main : renommer, fusionner, ranger
   en familles.

Contraintes inchangées : site public 100 % statique, aucune dépendance externe, aucun appel
réseau hors `data.json`, un seul script d'export dont seule la source (URL, clé) change en
phase 2.

## 2. Décisions prises

| Question | Décision |
| --- | --- |
| Où organiser les projets | Page d'admin **locale** (jamais publiée) |
| Recherche par le sens | Recherche **tolérante** côté site + **voisins précalculés** à l'export par le dashboard ; pas de modèle d'IA dans le site, pas de recherche live |
| Améliorations des cartes | Lien principal sur la carte, titres/résumés corrigeables (admin), vue compacte, repères visuels |
| Page d'accueil | **Catalogue des projets par famille** ; les entrées passent dans un onglet |
| Vue « Par projet » actuelle | Supprimée (remplacée par le catalogue et les pages projet) |

Constat qui fonde la décision sur la recherche (mesuré le 18/09/2026) : la recherche
sémantique du dashboard est rapide (20–45 ms) et pertinente **d'entrée à entrée** (voisins de
« Jarvis — architecture » : présentation Jarvis 0,87, AI Creator 0,81, décision Jarvis 0,78),
mais peu fiable sur des **requêtes courtes en français** (« sécurité des secrets » remonte
My Watch et Depths). Par ailleurs, `GET /api/search/similar/{hash}` du dashboard est défectueux
(il cherche l'entrée en passant son hash comme texte, donc répond toujours 404) : l'export
utilise `POST /api/search` avec le texte de l'entrée.

## 3. Chantier A — données (`scripts/export.py`)

### 3.1 `config/projets.json` v2

```json
{
  "version": 2,
  "familles": [
    { "id": "jeux", "nom": "Jeux & univers de jeu", "couleur": 1 }
  ],
  "projets": {
    "depths": {
      "nom": "Depths",
      "famille": "jeux",
      "alias": ["rogue-lite"],
      "description": null,
      "lien_principal": null
    }
  },
  "tags_generiques": ["dashboard", "python", "lien"],
  "tags_exclus": []
}
```

- `familles` : ordre d'affichage = ordre du tableau ; `couleur` : indice 1 à 6 d'une palette
  définie dans `style.css` (clair et sombre).
- `projets.<id>` : toutes les clés sont facultatives. `alias` remplace l'ancien
  `alias` global (un tag alias est rattaché à ce projet). `lien_principal` : une URL, ou
  `null` pour le calcul automatique.
- **Migration** : si le fichier n'a pas `version: 2`, l'export le lit comme v1 (`alias`,
  `noms` globaux) et le convertit en mémoire ; la page d'admin écrit toujours la v2. Un
  script ponctuel écrit la v2 initiale avec le pré-classement du § 8.

### 3.2 `config/entrees.json`

```json
{ "a713bd8e2800": { "titre": "…", "resume": "…", "masquer": true } }
```

- Clé : les 12 premiers caractères du `content_hash` (identifiant court des URL de fiches).
- `titre`, `resume` remplacent les valeurs dérivées ; `masquer: true` retire l'entrée du site
  (comme un tag d'exclusion).
- Une clé qui ne correspond plus à aucune entrée est signalée par l'export (avertissement,
  pas d'échec).

### 3.3 `config/recherche.json`

```json
{ "synonymes": [["ia", "intelligence artificielle", "llm", "modele"], ["local", "hors-ligne", "hors ligne", "offline"]] }
```

Groupes de termes équivalents, normalisés côté site comme la recherche (minuscules, sans
accents). Copiés tels quels dans `data.json`.

### 3.4 Nouveaux calculs de l'export

**Voisins.** Pour chaque entrée publiée : `POST /api/search` avec `{"query": contenu,
"n_results": 8}` ; on retire l'entrée elle-même et les entrées non publiées (masquées,
exclues) ; on garde au plus 5 voisins dont le score est ≥ `SEUIL_VOISINS` (valeur initiale
0,75, réglée sur les données réelles pendant l'implémentation et notée dans le code).
Résultat : `"voisins": [{"id": "<hash complet>", "score": 0.81}]`. Si l'appel échoue pour une
entrée ou globalement, l'export continue sans voisins pour ces entrées et affiche un
avertissement (les voisins ne sont pas critiques). Coût mesuré : ~30 ms par entrée.

**Lien principal d'une entrée** (calcul automatique uniquement ; la correction manuelle se
fait au niveau du projet) :

1. premier lien `en_ligne` de genre **site** : hôtes `*.github.io`, `*.vercel.app`,
   `*.web.app`, `*.firebaseapp.com`, `*.netlify.app`, `*.pages.dev`, `claude.ai/artifact/…`,
   ou tout autre domaine qui n'est pas un hébergeur de code ;
2. sinon premier lien de genre **depot** (`github.com`, `gitlab.com`) ;
3. sinon aucun.

Forme : `"lien_principal": {"url": "…", "genre": "site" | "depot" | "autre"}` ou `null`.

**Projet.**

- `famille` : configurée, sinon `null` (« Sans famille »).
- `description` : configurée, sinon le `resume` de la plus ancienne entrée du projet de
  type `reference`/`architecture` ou taguée `architecture`, sinon `null`.
- `lien_principal` : configuré, sinon le premier lien de genre site parmi ses entrées (de la
  plus récente à la plus ancienne), sinon le premier dépôt.
- `nom` : configuré, sinon l'extraction actuelle, sinon le tag.

### 3.5 `data.json` v2

Ajouts par rapport à la v1 (`schema: 2`) :

- racine : `familles` (copie ordonnée), `synonymes` ;
- `projets[]` : `famille`, `description`, `lien_principal` ;
- `entrees[]` : `voisins`, `lien_principal`, et `corrige: true` quand un titre ou un résumé
  vient de `config/entrees.json` (l'admin affiche alors « rétablir »).

Le site v2 refuse `schema > 2` avec le message existant « recharger la page ». Les liens par
projet sont agrégés par le site (pas dupliqués dans `data.json`).

## 4. Chantier B — site public (`docs/`)

### 4.1 Structure du code

`app.js` (~950 lignes) est découpé en modules ES (`<script type="module">`, compatibles avec
la CSP `script-src 'self'`) :

| Module | Rôle |
| --- | --- |
| `js/donnees.js` | chargement de `data.json`, erreurs, enrichissement, index de recherche |
| `js/recherche.js` | normalisation, racinisation légère, tolérance aux fautes, synonymes, syntaxe, score, surlignage |
| `js/routes.js` | analyse et construction des ancres, historique |
| `js/vues/accueil.js`, `projet.js`, `entrees.js`, `fiche.js`, `resultats.js` | une vue par écran |
| `js/composants.js` | carte d'entrée, carte de projet, pastilles, boutons de lien, dates relatives |
| `js/app.js` | démarrage, liaison des événements, thème |

`theme.js` reste un script classique chargé avant le rendu.

### 4.2 Routes

| Ancre | Vue |
| --- | --- |
| `#/` | Accueil : catalogue des projets par famille |
| `#/entrees?type=&projet=&famille=&tag=&tri=&vue=grille\|liste` | Toutes les entrées |
| `#/recherche?q=…` | Résultats de recherche (projets, entrées, « En rapport ») |
| `#/projet/<id>` | Page projet |
| `#/entree/<id court>` | Fiche d'une entrée |

Les anciennes ancres `#/?q=…&type=…` redirigent vers leur équivalent (`#/recherche` ou
`#/entrees`) pour ne pas casser les liens déjà partagés.

### 4.3 Accueil

- Familles dans l'ordre configuré, puis « Sans famille ».
- Carte de projet : liseré à la couleur de la famille, nom (serif), description (3 lignes),
  « N entrées · dernière activité il y a 3 j », bouton du lien principal (« Ouvrir le site ↗ »
  pour un site, « Dépôt ↗ » pour un dépôt), point « nouveau » si une de ses entrées est
  postérieure à la dernière visite. Tri : activité la plus récente d'abord.
- Le nom du projet est le lien vers sa page ; le bouton du lien principal est un lien
  distinct (pas de lien imbriqué dans un autre).

### 4.4 Page projet

En-tête (nom, famille, description, boutons de **tous** ses liens en ligne dédupliqués,
dates de première et dernière entrée) ; puis les entrées regroupées : Architecture &
références, Décisions, **Jalons (chronologie, du plus ancien au plus récent)**, Notes,
Erreurs ; les adresses locales du projet (dédupliquées, bouton « Copier ») ; « Projets
proches » : les autres projets les plus présents parmi les voisins de ses entrées (au plus 5).

### 4.5 Recherche

- La barre de recherche est présente sur toutes les vues ; taper ouvre `#/recherche`
  (remplacement dans l'historique pendant la frappe, pas une entrée par touche).
- **Normalisation** : l'actuelle (minuscules, accents, `œ`, `æ`, apostrophes).
- **Racinisation légère** appliquée au texte indexé et à la requête : pluriels `-s`, `-x`,
  `-aux → -al`, `-eaux → -eau`. Pas de racinisation plus agressive.
- **Tolérance aux fautes** : pour un terme de 5 à 7 caractères, distance d'édition ≤ 1 (avec
  transposition) ; ≥ 8 caractères, ≤ 2 ; sous 5 caractères, correspondance exacte ou préfixe
  seulement. Comparaison contre le **vocabulaire** de l'index (mots distincts), pas contre
  chaque texte.
- **Synonymes** : un terme de la requête présent dans un groupe devient « l'un des termes du
  groupe ».
- **Syntaxe** : termes combinés en ET ; `"expression exacte"` ; `-mot` exclut ; le dernier
  terme en cours de frappe accepte les préfixes.
- **Score** : titre ×6, projet/tags/type ×3, résumé ×2, texte ×1 (plafonné), bonus aux
  correspondances exactes par rapport aux approchées.
- **Résultats** : « Projets » (nom, description, famille), « Entrées » (triées par score),
  « En rapport » : voisins des 5 meilleurs résultats absents des résultats, au plus 6,
  classés par score de voisinage cumulé.
- **Surlignage** : termes exacts et approchés, sur le texte d'origine (mécanisme actuel).
- **Performance** : sur 3 000 entrées générées, une frappe < 50 ms.

### 4.6 Onglet « Toutes les entrées »

Filtres actuels (type, projet, tag) + famille ; tri actuel ; deux vues : **Grille** (actuelle)
et **Liste** (une ligne : type, titre, projet, date relative, icône si lien principal).
« Afficher plus » conservé.

### 4.7 Cartes d'entrée et fiche

- Liseré de famille ; bouton du lien principal à côté de « Voir la fiche » ; pastille
  « nouveau » ; dates relatives (`Intl.RelativeTimeFormat('fr')`), date exacte en infobulle.
- Fiche : bouton du lien principal en tête ; section **« Voir aussi »** (voisins, avec type
  et projet) ; le reste inchangé.
- **Dernière visite** : horodatage en `localStorage` (clé `memoire-vive:derniere-visite`),
  lu au chargement puis mis à jour ; accès protégé par `try/catch` ; sans stockage, aucune
  pastille « nouveau ».

### 4.8 Accessibilité et compatibilité

Acquis de la première revue conservés (focus, contrastes AA, historique, CSP, lien
d'évitement). Couleurs de famille vérifiées en contraste dans les deux thèmes. Le liseré n'est
jamais la seule information : le nom de la famille est écrit sur la page projet et dans les
filtres.

## 5. Chantier C — page d'admin locale

### 5.1 Serveur `scripts/admin.py`

- Python, bibliothèque standard (`http.server.ThreadingHTTPServer`).
- Écoute `127.0.0.1:8790` (port suivant libre si occupé) ; ouvre le navigateur sur
  `http://127.0.0.1:<port>/admin/#jeton=<jeton>`.
- Sert `docs/` à la racine (aperçu fidèle du site) et `admin/` sous `/admin/`. Le dossier
  `admin/` est à la racine du dépôt, **hors de `docs/`** : jamais publié.
- **Sécurité** :
  - jeton aléatoire (`secrets.token_urlsafe(32)`) créé au lancement, exigé dans l'en-tête
    `X-Admin-Jeton` de chaque appel `/api/*` (comparaison à temps constant) ;
  - en-tête `Host` obligatoirement `127.0.0.1:<port>` ou `localhost:<port>` (rebinding DNS) ;
  - `Origin`, s'il est présent, identique ;
  - corps des écritures en `application/json` uniquement (bloque les formulaires d'un autre
    site) ;
  - aucun chemin de fichier fourni par le client : les fichiers modifiables sont une liste
    fermée (`config/projets.json`, `config/entrees.json`, `config/recherche.json`).

### 5.2 API

| Méthode | Chemin | Effet |
| --- | --- | --- |
| GET | `/api/etat` | les trois fichiers de configuration + `docs/data.json` + état git (modifications non publiées) |
| PUT | `/api/config/<projets\|entrees\|recherche>` | valide le schéma, écrit de façon atomique |
| POST | `/api/apercu` | lance `export.py --no-git`, renvoie le compte rendu |
| POST | `/api/publier` | commit des fichiers de configuration modifiés (message « Réglages : … »), puis `export.py` (commit de `data.json` + push de tout), renvoie le compte rendu |

Une seule opération d'export à la fois (verrou) ; une seconde demande répond « occupé ».

### 5.3 Interface (`admin/index.html`, `admin/admin.js`, `admin/admin.css`)

Réutilise `docs/style.css` et les modules de `docs/js/` (données, composants).

- **Projets** : liste filtrable ; par projet : nom, famille (liste), description,
  lien principal (liens du projet ou saisie), alias ; action « Fusionner dans… » (le projet
  devient alias du projet cible). **Familles** : ajouter, renommer, réordonner, couleur.
- **Entrées** : liste cherchable ; par entrée : titre et résumé modifiables (l'original
  affiché, bouton « rétablir »), case « masquer du site ».
- **Recherche** : édition des groupes de synonymes.
- Barre fixe : **Enregistrer**, **Aperçu** (ouvre le site local dans un onglet),
  **Publier** ; zone de compte rendu ; alerte si l'on quitte avec des modifications non
  enregistrées.

### 5.4 Lancement

`admin.cmd` (dépôt, CRLF) + raccourci « Gérer Mémoire Vive » sur le Bureau. La fenêtre de
commande reste ouverte ; Ctrl+C arrête le serveur.

## 6. Tests et critères d'acceptation

**A.** Tests Python : migration v1 → v2 (résultat identique à la v1 sans nouveau réglage),
corrections par entrée (titre, résumé, masquer, clé orpheline), lien principal (site avant
dépôt, correction manuelle), description de projet, voisins (seuil, exclusion de soi et des
masquées, échec du dashboard toléré) ; les 11 scénarios git/pagination existants ; export sur
les données réelles comparé à l'actuel (seules les différences attendues).

**B.** Suite navigateur étendue (Playwright + Chrome local) : catalogue, page projet, onglet
entrées (grille, liste, filtre famille), recherche (fautes, pluriels, synonymes, expression,
exclusion, préfixe, « En rapport »), fiche « Voir aussi », redirection des anciennes ancres,
pastille « nouveau », mobile sans défilement horizontal, CSP et console sans erreur, données
piégées (XSS), performance sur 3 000 entrées ; rejouée sur le site publié.

**C.** Tests du serveur : jeton absent ou faux → 403 ; `Host` étranger → 403 ; `Content-Type`
non JSON → 415 ; fichier hors liste → 404 ; écriture atomique ; export concurrent → « occupé ».
Parcours navigateur : renommer, changer de famille, fusionner, masquer, corriger un titre,
aperçu, vérification dans `data.json`.

Chaque chantier passe par une revue multi-agents avec vérification adversariale avant
publication.

## 7. Hors périmètre

- Recherche sémantique live (dashboard) ou modèle d'IA dans le site.
- Modifier le **contenu** de la mémoire depuis l'admin (l'admin ne touche que la
  configuration du site).
- Authentification, multi-utilisateur, édition depuis le site public.
- Phase 2 (inchangée ; les voisins passeront par le tunnel comme le reste).

## 8. Pré-classement des familles (modifiable dans l'admin)

| Famille | Couleur | Projets |
| --- | --- | --- |
| Jeux & univers de jeu | 1 | depths, void-atlas, tactical-ops, voxelcraft, nova, yuei-heroes-battle, jeu-claude, plan-min, wiki-star-citizen, speedrush-dofus, dosoft |
| Cours & savoir | 2 | syntaxe, devpath, codelyngo, cours-graph, orbis, claude-learning-apps, check-code, un-monde-sans, religions |
| IA & simulations | 3 | jarvis, ai-creator, code-ai, help-code-ai, roberta, amalia, mcai, clipcoach, pipeline-securite-n8n-ollama, le-bocal |
| Outils Claude | 4 | tour-de-controle, antigravity-skills, design-studio, uiverse-components, deadline-command, multi-claude-orchestrator, pont-memoire, memoire-vive, bibliotheque-claude |
| Sites & applis | 5 | my-watch, jsl-metal, ce-ventre, opti-route, trading-alert-bot, decoupe-videos, presentation |

Total : 46 projets (état du 18/09/2026). Un projet apparu depuis va dans « Sans famille »
jusqu'à son classement dans l'admin.

## 9. Risques et points ouverts

- **Faux positifs de la tolérance aux fautes** sur des mots courts ou voisins : bornée par les
  seuils du § 4.5 et le bonus aux correspondances exactes ; à surveiller sur les données.
- **Qualité des voisins** : le seuil initial 0,75 sera ajusté sur les 69 entrées réelles ; les
  projets à une seule entrée auront peu de voisins pertinents.
- **Taille de `data.json`** : +5 voisins par entrée, négligeable (≈ 70 octets par entrée).
- **Découpage en modules** : réécriture importante de `app.js` ; la suite de 57 vérifications
  existante sert de filet avant d'ajouter les nouvelles vues.
