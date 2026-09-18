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
| `--dry-run` | récupère et résume, n'écrit rien |
| `--no-git` | écrit `data.json` sans commit ni push (pour tester le site en local) |
| `--no-push` | commit sans push |
| `--force` | publie même si le nombre d'entrées a chuté de plus de moitié |

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

## Régler les projets

`config/projets.json` (facultatif) :

- `alias` : fusionne un tag dans un projet (`"rogue-lite": "depths"`) ;
- `noms` : nom affiché d'un projet (`"pont-memoire": "Pont mémoire"`) ;
- `tags_generiques` : tags qui ne désignent jamais un projet (`dashboard`, `python`…) ;
- `tags_exclus` : tags dont les entrées ne sont jamais publiées.

Sans réglage, le projet d'une entrée est son tag le plus « voté » : chaque entrée vote
pour son premier tag qui n'est pas générique.

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
config/projets.json réglages facultatifs des projets
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
   `GET /api/memories` (règle Access ou WAF sur le nom d'hôte).
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
