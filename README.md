# Mémoire Vive

Site statique qui affiche, regroupe et permet de chercher dans la mémoire partagée
(mcp-memory-service), sans passer par Claude Code ni claude.ai.

- **Site** : `docs/` (HTML/CSS/JS vanilla en modules ES, aucune dépendance), publié par
  GitHub Pages.
- **Données** : `docs/data.json`, généré à l'avance. Le site ne fait aucun appel réseau
  en dehors de ce fichier.
- **Export** : `scripts/export.py` (Python 3.9+, bibliothèque standard uniquement).
- **Réglages** : page d'admin locale, jamais publiée (`admin.cmd`, voir « La page d'admin
  locale »).

## Mettre à jour le site

Prérequis : le dashboard mcp-memory-service tourne en local sur le port 8000
(lanceur `start-memory-rest.ps1` sur le Bureau), et `.env` contient la clé.

```powershell
python scripts/export.py
```

Ou double-cliquer sur `exporter.cmd` (raccourci « Mettre à jour Mémoire Vive » sur le Bureau),
qui affiche le résultat et attend une touche.

La commande lit toutes les entrées, écrit `docs/data.json`, fait un commit et pousse.
GitHub Pages republie le site en une à deux minutes. Si la mémoire n'a pas changé,
`data.json` n'est pas réécrit, mais un commit ou un push resté en attente (export
précédent en `--no-git`, push refusé) est rattrapé.

| Option | Effet |
| --- | --- |
| `--dry-run` | récupère et résume ; n'écrit rien et ne lance **aucune** recherche de voisins |
| `--no-git` | écrit `data.json` sans commit ni push (pour tester le site en local) |
| `--no-push` | commit sans push |
| `--force` | publie même si le nombre d'entrées a chuté de plus de moitié |
| `--recalculer-voisins` | recherche les voisins de toutes les entrées, pas seulement des nouvelles (une recherche par entrée) |
| `--sans-recherche` | écrit `data.json` sans **aucune** recherche de voisins (aperçu de la page d'admin) : les entrées nouvelles attendent le prochain export (`voisins_en_attente`) |

Tester le site en local : `node tests/navigateur/serveur.mjs` puis
<http://127.0.0.1:8080/memoire-vive/> (même sous-chemin que GitHub Pages ; Node seul, sans
installation ; Ctrl+C pour arrêter). `python -m http.server 8080 -d docs` convient aussi
(site à la racine) tant que Python sert les `.js` en `text/javascript`, condition du
chargement des modules ES.

## Première mise en place (déjà faite pour ce dépôt)

1. Copier `.env.example` en `.env` et y mettre la clé (`MCP_API_KEY` du lanceur).
2. `git init -b main`, puis `git add .` et vérifier avec `git status` que `.env` n'y est pas.
3. Premier commit, création du dépôt GitHub, `git remote add origin …`.
4. `python scripts/export.py` : le premier push crée la branche amont (`-u origin`).
5. Settings → Pages → Deploy from a branch → `main`, dossier `/docs`.

## Ce qui est publié, et ce qui ne l'est pas

Le dépôt et le site sont **publics** : tout ce qui part dans `data.json` est lisible par
tous, sur le site comme sur GitHub, et reste dans l'historique git.

- **Liste blanche de champs** : identifiant, texte, type, tags, dates. Les métadonnées du
  serveur (`access_queries`, `conversation_id`, compteurs d'accès…) ne sortent jamais.
- **Exclusion par tag** : une entrée taguée `prive`, `private`, `secret`, `confidentiel`,
  `confidential`, `sensitive`, `sensible`, `no-publish`, `ne-pas-publier`,
  `do-not-publish` ou `non-public` n'est pas publiée (liste extensible dans
  `config/projets.json`, clé `tags_exclus`).
- **Masquage des secrets** (filet de sécurité, pas une garantie) : jetons GitHub, GitLab,
  OpenAI, Anthropic, Stripe, Hugging Face, npm, Slack, Google, AWS (clé d'accès), bots
  Telegram, webhooks Discord et Slack, JWT, en-têtes `Bearer`, clés privées, identifiants
  dans une URL, affectations du type `AWS_SECRET_ACCESS_KEY=…`, `api_key=…`,
  `password: …`, `mot de passe : …`, `mdp=…`, ainsi que la valeur réelle de la clé du
  dashboard si une entrée la cite. Remplacés par `[masqué]` ; l'export affiche le nombre
  de masquages. Un secret sous une forme inconnue passerait : ne pas en écrire dans la mémoire.
  Le masquage s'applique aussi à ce qui est saisi dans `config/` et publié : titres et
  résumés corrigés, nom et description des projets.
- **Liens configurés** : le `lien_principal` saisi pour un projet perd ses identifiants
  (`https://utilisateur:jeton@…`) et il est **refusé** s'il contient un secret, s'il vise
  une adresse non joignable d'Internet (IP privée, `localhost`, `.local`, nom de machine
  seul…) ou s'il n'est pas une URL web valide. L'export le signale (« Lien principal
  configuré refusé ») et prend le lien calculé à la place.
- **Garde-fous** : refus de publier une lecture incomplète (page vide ou base modifiée
  pendant la lecture, après trois essais), une mémoire vide, ou une chute de plus de
  50 % par rapport au dernier export (base mal pointée), sauf `--force`.
- **Indexation** : la page porte une balise `noindex`, mais `data.json` n'est pas protégé
  contre l'indexation, et le dépôt public reste consultable sur GitHub.

## Ce que l'export calcule pour le site

Chaque entrée de `data.json` contient, en plus du texte :

- `titre` : le début du texte (avant le premier « : » ou la première phrase, hors
  parenthèses et guillemets), à défaut les tags ;
- `resume` : une ou deux phrases qui suivent le titre ;
- `projet` : le tag qui désigne le projet (heuristique par vote, réglable) ;
- `liens` : `[{ "type": "en_ligne" | "local", "valeur": "..." }]`, détectés par expression
  régulière :
  - `en_ligne` : URL `http(s)://` valide vers un hôte public, dépôts `github.com/…` et sites
    `*.web.app`, `*.github.io`, `*.vercel.app`, `*.netlify.app`, `*.pages.dev` cités sans
    `https://`. Cliquables sur la fiche, ouverture dans un nouvel onglet.
  - `local` : chemins (`D:\…`, `D:/…`, `"C:\Program Files\…"` entre guillemets, `~/…`,
    `%USERPROFILE%\…`, `\\serveur\partage`, `file:///…`), `localhost:PORT`, `127.0.0.1`,
    IP privées (`192.168.x.x`, `10.x.x.x:PORT`, `172.16-31.x.x:PORT`), URL vers ces hôtes
    ou vers un réseau non public (Tailscale, `.local`, `.home`), ports mentionnés
    (« port 8766 », « ports 8000 et 8765 », `PORT=8000`). Affichés en texte, étiquetés
    « adresse locale ».
  - Limite connue : un chemin qui contient des espaces n'est détecté en entier que s'il
    est écrit entre guillemets.
- `lien_principal` : `{ "url": "...", "genre": "site" | "depot" }`, ou `null` : le premier
  lien `en_ligne` vers un site (tout hôte qui n'est pas un hébergeur de code :
  `*.github.io`, `*.vercel.app`, `*.web.app`, `claude.ai/…`…), à défaut le premier dépôt
  (`github.com`, `gitlab.com`, `bitbucket.org`, `codeberg.org`) ;
- `voisins` : `[{ "id": "<hash complet>", "score": 0.81 }]`, au plus 5 entrées publiées
  proches par le sens, de score au moins égal à `SEUIL_VOISINS` (0,80, réglé le
  18/09/2026 sur les données réelles : au moins 9 voisins affichés sur 10 sont du même
  projet ou du même thème) ;
- `corrige` : `true` quand le titre ou le résumé vient de `config/entrees.json`.

Les voisins sont calculés par le dashboard : `POST /api/search` avec le texte de l'entrée
(8 résultats demandés), dont l'export retire l'entrée elle-même et les entrées non
publiées. Le dashboard a bien `GET /api/search/similar/{hash}`, mais ce point d'accès est
défectueux : il cherche le hash comme du texte et répond donc toujours 404.

**Effet sur la mémoire partagée.** Chaque recherche met à jour l'historique d'accès des
entrées trouvées (compteur d'accès, date du dernier accès, dernières requêtes), dans la
mémoire commune à tous les projets et à claude.ai ; le dashboard n'offre pas de recherche
« en lecture seule ». Les voisins sont donc calculés **de façon incrémentale** :

- seules les entrées **nouvelles** (identifiant absent du `data.json` précédent ; une
  entrée dont le texte change reçoit un nouvel identifiant) sont cherchées : **une
  recherche par entrée nouvelle**. Un export sans entrée nouvelle n'en lance aucune ;
- une entrée déjà publiée reprend ses voisins précédents, moins ceux qui ne sont plus
  publiés (une entrée disparue est seulement retirée des listes, sans nouvelle recherche) ;
- **symétrie** : quand une entrée nouvelle X trouve Y, X entre aussi dans les candidats
  de Y, qui garde ses 5 meilleurs voisins ;
- `data.json` note à la racine le réglage utilisé, `voisins_reglage` (`seuil`, `max`) :
  s'il est absent ou différent (seuil changé dans le code), le prochain export recalcule
  tout, une fois ; `--recalculer-voisins` force ce recalcul complet ;
- `--dry-run` ne lance aucune recherche : il annonce combien d'entrées nouvelles seront
  cherchées au prochain export réel ;
- **budget de temps** : les recherches s'arrêtent après 120 s cumulées (10 s au plus par
  recherche). Les entrées restantes, comme celles dont la recherche a échoué, sont notées
  dans `voisins_en_attente` (racine de `data.json`) et cherchées à l'export suivant.

Les voisins ne bloquent jamais l'export : un appel en échec laisse l'entrée sans voisins
(l'export affiche le nombre d'échecs), et après trois échecs de suite le dashboard n'est
plus interrogé. Des recherches réussies qui ne relient aucune entrée déclenchent un
avertissement (dashboard sans modèle d'embedding ?). Un export refusé par un garde-fou ne
lance aucune recherche.

Chaque projet (`projets[]`) contient `id`, `nom` (configuré, sinon tiré du texte, sinon
le tag), `nb`, `types`, `premiere`, `derniere`, et :

- `famille` : l'identifiant configuré, sinon `null` (« Sans famille ») ;
- `description` : configurée, sinon le `resume` de la plus ancienne entrée du projet de
  type `reference` ou `architecture` (ou taguée `architecture`), sinon `null` ;
- `lien_principal` : configuré (URL web publique, voir « Liens configurés » plus haut),
  sinon le premier site parmi ses entrées, de la plus récente à la plus ancienne, sinon le
  premier dépôt, sinon `null`.

À la racine : `familles` (copie ordonnée de celles de `config/projets.json`),
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
| `#/recherche?q=…` | Résultats : projets (les six meilleurs, puis « Afficher les N projets »), entrées, « En rapport » (voisins des meilleurs résultats) |
| `#/projet/<id>` | Page projet : liens, entrées par nature, jalons en chronologie, adresses locales, projets proches |
| `#/entree/<id court>` | Fiche : lien principal, texte intégral, « Voir aussi » (voisins) |

Les anciennes ancres (`#/?q=…&type=…`) redirigent vers leur équivalent : `#/recherche`
s'il y avait une recherche, sinon `#/entrees` avec les mêmes filtres.

**Recherche** (barre présente sur toutes les pages, touche `/`) : taper ouvre
`#/recherche`, sans créer une entrée d'historique par touche ; Échap revient à la page
d'origine.

- tous les mots doivent être présents ; majuscules, accents, `œ` et apostrophes ignorés ;
- pluriels confondus (`jeux` = `jeu`, `réseaux` = `réseau`, `animaux` = `animal`) ;
- fautes de frappe tolérées sur les dix premiers mots : une pour un mot de 5 à 7 lettres,
  deux à partir de 8, longueur comptée sans la marque du pluriel ; aucune en dessous de
  5 lettres (`cours` ne trouve pas « pour ») ;
- synonymes de `config/recherche.json`, y compris ceux de plusieurs mots tapés avec une
  espace (`hors ligne` vaut `offline`, `intelligence artificielle` vaut `ia`) ;
- article élidé ignoré hors guillemets : `l'IA` cherche `IA` ;
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

**Cache du navigateur** : GitHub Pages sert chaque fichier avec `Cache-Control:
max-age=600`, et un rechargement ne revalide que la page. `index.html` charge donc
`style.css?v=…` et `theme.js?v=…`, où `v` est l'empreinte du fichier :
`tests/js/cache.test.mjs` échoue tant qu'elle n'est pas à jour et donne la bonne valeur.
Les modules `js/` n'ont pas de version (leurs imports relatifs ne peuvent pas en porter
sans outil de construction) : une publication qui les modifie peut, pendant dix minutes,
servir à un visiteur revenu entre-temps un mélange d'anciens et de nouveaux modules ; pour
l'éviter, publier les modules modifiés dans un nouveau dossier (`js/v2/…`, chemin de
`index.html` compris).

## La page d'admin locale

Double-cliquer sur `admin.cmd` (raccourci « Gérer Mémoire Vive » sur le Bureau) : une
fenêtre de commande démarre un petit serveur local et ouvre la page dans le navigateur.
Laisser la fenêtre ouverte pendant les réglages ; Ctrl+C l'arrête. Rien de cette page
n'est publié (le dossier `admin/` est hors de `docs/`).

| Onglet | Réglages |
| --- | --- |
| Projets | nom affiché, famille, description, lien principal (un des liens du projet ou une autre adresse), alias ; « Fusionner dans… » : le projet devient un alias d'un autre, ses entrées y passent, ses propres réglages sont perdus sans retour possible (la page le demande d'abord) |
| Familles | ajouter, renommer, réordonner, couleur (1 à 6), supprimer (ses projets passent « Sans famille ») |
| Entrées | titre et résumé corrigés (l'original reste affiché, « Rétablir » y revient), « Masquer du site » (retire aussi la correction du titre et du résumé, et ferme les deux champs tant que l'entrée est masquée : `config/entrees.json` est publié avec le dépôt) ; une correction dont l'entrée a disparu de la mémoire est listée et se retire d'un bouton |
| Recherche | groupes de synonymes ; « Supprimer » demande confirmation (contenu écrit à la main) |

- **Enregistrer** écrit les réglages dans `config/`, sur cet ordinateur seulement. Le
  navigateur prévient si l'on quitte la page avec des modifications non enregistrées.
  Un fichier modifié ailleurs depuis l'ouverture de la page (à la main, dans un autre
  onglet) n'est jamais écrasé : l'enregistrement est refusé, recharger la page. Un
  `exporter.cmd` lancé ensuite applique déjà les réglages au site (il lit `config/`) sans
  les commiter : « Publier » le fait.
- **Aperçu** enregistre, lance `export.py --no-git --sans-recherche` et ouvre le site local
  (`http://127.0.0.1:8790/`). Il lit la mémoire (le dashboard doit tourner) mais **n'y écrit
  rien** : aucune recherche de voisins ; les entrées nouvelles reçoivent leurs voisins à la
  publication. `docs/data.json` est réécrit, rien n'est commité.
- **Publier** enregistre, commite les réglages modifiés (« Réglages : … »), puis lance
  l'export complet (commit de `data.json`, push, jamais forcé). Refusé, avec l'explication,
  si la copie de travail n'est pas sur `main`, si d'autres fichiers suivis ont des
  modifications non commitées, si des commits locaux pas encore publiés touchent autre
  chose que les réglages et `data.json`, ou si un réglage enregistré ne passe pas la
  vérification. Ne pas lancer `exporter.cmd` pendant une publication.
- Tout ce qui sera publié est vérifié avant d'être écrit, puis de nouveau avant chaque
  aperçu et chaque publication (un réglage modifié à la main aussi) : couleur entière de 1
  à 6, « masquer » vrai ou faux (sans guillemets), listes de tags, lien principal (adresse
  web publique, sans identifiants), aucun secret (mêmes motifs que l'export, plus la vraie
  clé du dashboard) dans les noms, descriptions, titres, résumés, synonymes, alias, tags et
  commentaires. Un refus nomme le champ et la raison ; rien n'est écrit.
- Un réglage écrit à la main sous une forme que l'export accepte aussi (un alias ou une
  liste de tags écrits comme un texte seul, une couleur entre guillemets, « masquer » qui
  ne vaut ni `true` ni `false`) est lu avec le sens que l'export lui donne, signalé à
  l'ouverture de la page, et réécrit sous la forme de la page par « Enregistrer ».
- Une entrée masquée n'est plus dans `data.json` : elle reste listée sous le titre que le
  navigateur a mémorisé (à défaut, son identifiant), pour pouvoir la réafficher. Ce titre
  n'est jamais écrit dans `config/`, qui est publié avec le dépôt.

**Sécurité.** Le serveur n'écoute que `127.0.0.1` (port 8790, ou le suivant s'il est pris)
et ne sert que `docs/` et `admin/` (ni `.env`, ni `scripts/`, ni `config/`). Chaque appel
exige le jeton tiré au lancement (il est dans l'adresse qu'ouvre `admin.cmd`), l'adresse
`127.0.0.1:<port>` ou `localhost:<port>`, et du JSON pour les écritures ; seuls les trois
fichiers de `config/` sont modifiables, et un seul aperçu ou une seule publication tourne à
la fois. Une seule page d'admin par dépôt : un second `admin.cmd` le dit et s'arrête.
Fermer la fenêtre puis relancer `admin.cmd` change le jeton : fermer alors l'ancien onglet.
L'adresse avec le jeton reste dans l'historique du navigateur ; elle ne sert plus à rien
une fois la fenêtre fermée, et ne marche que depuis cet ordinateur.

Options : `python scripts/admin.py --port 8800` (premier port essayé), `--sans-navigateur`
(affiche l'adresse sans ouvrir le navigateur).

## Régler les projets, les entrées et la recherche

Trois fichiers facultatifs, dans `config/`, modifiables depuis la page d'admin (ci-dessus)
ou à la main. La clé `_aide` de chacun rappelle son mode d'emploi ; l'export l'ignore.

### `config/projets.json` (version 2)

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

- `familles` : ordre d'affichage = ordre du tableau ; `couleur` : indice 1 à 6 d'une
  palette du site (thèmes clair et sombre).
- `projets.<id>` : toutes les clés sont facultatives. `nom` : nom affiché ; `famille` :
  une famille déclarée (sinon ignorée) ; `alias` : tags rattachés à ce projet ;
  `description` : présentation du projet ; `lien_principal` : une URL publique, ou `null`
  pour le calcul automatique. Nom et description passent par le masquage des secrets.
- `tags_generiques` : tags qui ne désignent jamais un projet (`dashboard`, `python`…).
- `tags_exclus` : tags dont les entrées ne sont jamais publiées.

Pour ces deux listes, une chaîne seule vaut une liste d'un élément (`"tags_exclus":
"perso"` exclut bien le tag `perso`) ; tout autre type fait échouer l'export plutôt que
d'être ignoré.

Sans réglage, le projet d'une entrée est son tag le plus « voté » : chaque entrée vote
pour son premier tag qui n'est pas générique.

Un fichier sans `"version": 2` est lu comme l'ancien format (`alias` et `noms` globaux,
par exemple `"alias": { "rogue-lite": "depths" }`) et converti en mémoire à chaque export.

### `config/entrees.json`

```json
{ "a713bd8e2800": { "titre": "…", "resume": "…", "masquer": true } }
```

- Clé : les 12 premiers caractères de l'identifiant de l'entrée (celui de l'URL de sa
  fiche, `#/entree/…`).
- `titre`, `resume` remplacent les valeurs calculées (l'entrée porte alors
  `"corrige": true`) et passent eux aussi par le masquage des secrets ; `masquer: true`
  retire l'entrée du site, comme un tag d'exclusion.
- Une clé qui ne correspond plus à aucune entrée est signalée par l'export
  (avertissement, pas d'échec).
- Une valeur qui n'est pas un objet (`{ "a713bd8e2800": true }`) fait échouer l'export
  en nommant la clé : ignorée, une demande de masquage mal écrite laisserait l'entrée
  publiée. Les clés qui commencent par `_` (comme `_aide`) sont ignorées.

### `config/recherche.json`

```json
{ "synonymes": [["ia", "intelligence artificielle", "llm", "modele"], ["local", "hors-ligne", "hors ligne", "offline"]] }
```

Groupes de termes équivalents pour la recherche du site. L'export les normalise comme la
recherche (minuscules, sans accents, doublons retirés ; un groupe de moins de deux termes
est ignoré) et les copie dans `data.json`.

## Tests

Depuis la racine du dépôt :

```powershell
python -m unittest discover -s tests -v   # export (Python, bibliothèque standard)
node --test "tests/js/*.test.mjs"         # logique du site (Node 22+, sans installation)
```

Ni la mémoire réelle ni le réseau extérieur ne sont touchés : `tests/test_publication.py`
lance l'export contre un faux dashboard local, dans un dépôt git temporaire relié à un
dépôt distant local ; `tests/test_admin.py` fait de même avec le serveur de la page
d'admin, lancé sur un port libre.

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
La page d'admin (`admin.test.mjs`, `admin-reel.test.mjs`) est testée contre
`scripts/admin.py`, que `banc-admin.mjs` lance dans un dépôt git temporaire (copie du site,
faux dashboard, dépôt distant local) ; `admin-reel.test.mjs` y copie les vrais réglages et
le vrai `data.json`.

| Variable | Effet |
| --- | --- |
| `MEMOIRE_CHROME` | chemin de Chrome (défaut : `C:/Program Files/Google/Chrome/Application/chrome.exe`) |
| `MEMOIRE_SITE_URL` | rejoue la suite sur un site publié au lieu du serveur local (les tests de la page d'admin restent locaux) |
| `MEMOIRE_PYTHON` | commande Python des tests de la page d'admin (défaut : `python`) |

Rejouer la suite sur le site publié : `$env:MEMOIRE_SITE_URL = 'https://chipat-neko.github.io/memoire-vive/'; npm test`.

## Structure

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
  data.json         généré par l'export, ne pas modifier à la main
admin/              page d'admin locale, jamais publiée (servie par scripts/admin.py)
  index.html        onglets Projets, Familles, Entrées, Recherche ; barre Enregistrer, Aperçu, Publier
  admin.js          interface (réutilise docs/js/composants.js et recherche.js)
  modele.js         brouillon des réglages et opérations (module pur, testé sous Node)
  admin.css         mises en page propres à l'admin (couleurs et boutons de docs/style.css)
scripts/export.py   export + commit + push
exporter.cmd        la même chose en double-clic (Windows)
scripts/admin.py    serveur local de la page d'admin (127.0.0.1, jeton)
admin.cmd           page d'admin en double-clic (Windows)
config/             réglages facultatifs : projets.json, entrees.json, recherche.json
tests/              tests unitaires et d'intégration de l'export et de la page d'admin (Python)
  js/               tests unitaires du site (node --test)
  navigateur/       tests navigateur (playwright-core, Chrome installé)
phase2/             modèle de workflow GitHub Actions, inactif
.env                clé locale (ignoré par git) — modèle : .env.example
```

## Phase 2 : export quotidien automatique

À faire une fois un nom de domaine et un tunnel Cloudflare à adresse fixe en place.
**Le script ne change pas** : il lit l'URL et la clé dans les variables d'environnement
avant de regarder `.env`, refuse `http://` vers une adresse distante, et n'écrit pas
l'adresse du tunnel dans les logs.

1. Exposer le dashboard (port 8000) par un tunnel nommé, par exemple
   `https://memoire-api.<domaine>`. **Protéger ce sous-domaine par Cloudflare Access**
   avec un jeton de service : sans cela, tout le dashboard (lecture, modification,
   suppression en masse) n'est gardé que par la clé API. Si possible, n'autoriser que
   `GET /api/memories` et `POST /api/search` (règle Access ou WAF sur le nom d'hôte).
2. Dans le dépôt : Settings → Secrets and variables → Actions → créer `MEMOIRE_API_URL`,
   `MEMOIRE_API_KEY`, `MEMOIRE_CF_ACCESS_CLIENT_ID` et `MEMOIRE_CF_ACCESS_CLIENT_SECRET`.
3. Copier `phase2/export-quotidien.yml` dans `.github/workflows/` et pousser.
   L'export tourne à minuit UTC ; il peut aussi être lancé à la main depuis l'onglet
   Actions, avec une case « force » pour passer outre le garde-fou de chute.
4. Supprimer la clé de `.env` si l'export local n'est plus utilisé.

À savoir : GitHub peut retarder de quelques minutes (voire sauter) un cron programmé à
l'heure pile, et désactive les workflows planifiés d'un dépôt sans activité pendant
60 jours ; il suffit alors de le réactiver depuis l'onglet Actions.

## Ajouter une authentification plus tard (Cloudflare Access)

Côté site, rien à coder : il charge `data.json` en chemin relatif, sur la même origine,
avec le cookie de session, et affiche un message clair si la session expire
(redirection vers la page de connexion).

Côté hébergement, en revanche, **GitHub Pages ne peut pas devenir privé** ici :

- un site GitHub Pages reste public même depuis un dépôt privé (la visibilité privée
  n'existe qu'avec GitHub Enterprise Cloud) ;
- mettre Cloudflare Access devant un domaine personnalisé pointé sur GitHub Pages est
  contournable : l'adresse `*.github.io` et les serveurs GitHub restent joignables
  directement, et le dépôt public expose `data.json` et tout son historique.

La seule vraie protection : **héberger `docs/` sur Cloudflare Pages, derrière Access,
depuis un dépôt privé**. Le code du site n'a pas à changer. Ce qui a déjà été publié
reste dans l'historique public et dans les éventuelles copies.

## Dépannage

| Message | Cause probable |
| --- | --- |
| `injoignable (…)` | lancer `start-memory-rest.ps1` |
| `refuse l'accès (HTTP 401)` | `MEMOIRE_API_KEY` différente de `MCP_API_KEY` du lanceur |
| `a répondu autre chose que du JSON`, `redirection inattendue` | tunnel protégé par Access sans jeton de service |
| `récupération incomplète après 3 passes` | base verrouillée ou modifiée en continu ; relancer un peu plus tard |
| `N entrées contre M au dernier export` | base vide ou mauvais fichier SQLite ; vérifier, puis `--force` |
| `git push a échoué` | branche en retard : `git pull --rebase`, puis relancer (le push en attente est rattrapé) |
| `aucun dépôt distant « origin »` | voir « Première mise en place » |
| `Lien principal configuré refusé` | `lien_principal` d'un projet local, invalide ou contenant un secret : le corriger dans `config/projets.json` |
| `entrée(s) encore sans recherche de voisins` | budget de temps épuisé ou recherches en échec : elles seront cherchées au prochain export |
| `la correction « … » doit être un objet JSON` | valeur mal écrite dans `config/entrees.json` |
| `Jeton absent`, `Accès refusé` (page d'admin) | page d'admin relancée, ou ouverte sans son adresse : fermer l'onglet et relancer `admin.cmd` |
| `Réglages refusés : rien n'a été enregistré.` | un champ ne passe pas la vérification : la liste dit lequel et pourquoi |
| `Publication refusée : …` | copie de travail hors de `main`, autres fichiers modifiés ou commits locaux sans rapport : le message dit quoi faire |
| `Occupé : un aperçu ou une publication est en cours` | attendre la fin de l'opération en cours |
| `… a changé depuis l'ouverture de la page` | le fichier a été modifié ailleurs (à la main, autre onglet) : recharger la page, refaire la modification |
| `Réglages à corriger` (à l'ouverture de la page) | un réglage modifié à la main ne passe pas la vérification : le corriger (la liste dit lequel), sinon « Aperçu » et « Publier » sont refusés |
| `Le dépôt GitHub a des commits que cet ordinateur n'a pas encore` | dans `D:\memoire_vive`, lancer `git pull --rebase`, puis « Publier » ; si git répond `CONFLICT`, voir « Un rebasage git s'est arrêté » ci-dessous |
| `un rebasage git est en cours`, `un picorage git`, `une annulation de commit git` | git s'est arrêté au milieu d'une commande : la page dit quelle commande l'annule (`git rebase --abort`, …) ; rien n'est perdu — voir « Un rebasage git s'est arrêté » ci-dessous |
| `L'export refuse par sécurité une baisse de plus de la moitié` | trop d'entrées masquées dans l'onglet « Entrées » (ou mémoire mal lue) : en réafficher, puis recommencer |
| `Git n'a pas pu enregistrer les réglages` | un autre programme utilise le dépôt (git ouvert ailleurs, `.git/index.lock` resté là) : le fermer, puis « Publier » de nouveau ; rien n'a été commité ni publié |
| `est illisible : ce n'est pas du JSON valide` | un fichier de `config/` a été mal modifié à la main : le message donne son dossier et la commande qui rétablit la dernière version publiée |
| `ressemble à des réglages en version 2, mais sa ligne "version": 2 manque` | remettre la ligne `"version": 2,` au début de `config/projets.json` : sans elle, tous les réglages des projets seraient perdus |
| `la page d'admin de ce dépôt tourne déjà` | utiliser la fenêtre « Mémoire Vive - page d'admin » déjà ouverte, ou la fermer d'abord |
| `aucun port libre entre 8790 et 8809` | ces ports sont pris par d'autres programmes : `admin.cmd --port 8900` |
| `Aperçu impossible` avec `injoignable (…)` | lancer `start-memory-rest.ps1` : l'aperçu lit la mémoire |

### Un rebasage git s'est arrêté (« CONFLICT »)

Quand le dépôt GitHub a avancé de son côté, « Publier » conseille `git pull --rebase`.
Cette commande s'arrête presque toujours sur un conflit dans `docs/data.json` : ce
fichier est réécrit en entier à chaque export, ici comme sur l'autre ordinateur.
**Rien n'est perdu**, mais la copie de travail reste « au milieu » du rebasage, et la
page d'admin refuse alors de publier en le disant.

Deux façons d'en sortir, dans `D:\memoire_vive` :

1. **Revenir en arrière** (le plus simple) : `git rebase --abort`. Tout revient
   exactement comme avant la commande ; le dernier export est toujours là.
   La publication redevient possible, mais le dépôt GitHub est encore en avance :
   redemander de l'aide plutôt que de relancer la même commande en boucle.
2. **Aller au bout** : garder la version de cet ordinateur pour `docs/data.json`
   (elle sera de toute façon réécrite à la prochaine publication), puis continuer :

   ```powershell
   git checkout --theirs -- docs/data.json
   git add docs/data.json
   git rebase --continue
   ```

   Pendant un rebasage, `--theirs` désigne le commit qu'on est en train de rejouer,
   c'est-à-dire l'export de cet ordinateur. **Ne pas utiliser `--ours`** : pendant un
   rebasage, c'est l'autre côté, et l'export de cet ordinateur serait jeté.
