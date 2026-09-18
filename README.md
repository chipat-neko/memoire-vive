# Mémoire Vive

Site statique qui affiche, regroupe et permet de chercher dans la mémoire partagée
(mcp-memory-service), sans passer par Claude Code ni claude.ai.

- **Site** : `docs/` (HTML/CSS/JS vanilla, aucune dépendance), publié par GitHub Pages.
- **Données** : `docs/data.json`, généré à l'avance. Le site ne fait aucun appel réseau
  en dehors de ce fichier.
- **Export** : `scripts/export.py` (Python 3.9+, bibliothèque standard uniquement).

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

Tester le site en local : `python -m http.server 8080 -d docs` puis <http://localhost:8080>.

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
compatibles : `schema` reste à 1 et le site actuel les ignore.

## Régler les projets, les entrées et la recherche

Trois fichiers facultatifs, dans `config/`, modifiables à la main. La clé `_aide` de
chacun rappelle son mode d'emploi ; l'export l'ignore.

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
python -m unittest discover -s tests -v
```

Bibliothèque standard uniquement ; ni la mémoire réelle ni le réseau extérieur ne sont
touchés : `tests/test_publication.py` lance l'export contre un faux dashboard local, dans
un dépôt git temporaire relié à un dépôt distant local.

## Structure

```text
docs/               site publié par GitHub Pages (branche main, dossier /docs)
  index.html        page unique ; les fiches ont leur URL : #/entree/<id>
  app.js            recherche, filtres, vues, fiches
  style.css         palette et proportions de l'artifact « Bibliothèque Claude »
  theme.js          thème clair/sombre mémorisé, appliqué avant le rendu
  data.json         généré par l'export, ne pas modifier à la main
scripts/export.py   export + commit + push
exporter.cmd        la même chose en double-clic (Windows)
config/             réglages facultatifs : projets.json, entrees.json, recherche.json
tests/              tests unitaires et d'intégration de l'export
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
