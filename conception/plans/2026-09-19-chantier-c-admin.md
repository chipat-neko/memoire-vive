# Chantier C — page d'admin locale : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Une page d'admin locale, jamais publiée, pour organiser le site sans éditer de fichier à la main — renommer les projets, les ranger en familles, les fusionner, corriger ou masquer des entrées, éditer les synonymes, voir le résultat sur le site local puis publier — servie par un petit serveur Python (`scripts/admin.py`) qu'on lance d'un double-clic (`admin.cmd`, raccourci « Gérer Mémoire Vive » sur le Bureau).

**Architecture:** `scripts/admin.py` (bibliothèque standard) n'écoute que `127.0.0.1`, sert `docs/` à la racine et `admin/` sous `/admin/`, et expose quatre appels (`GET /api/etat`, `PUT /api/config/<nom>`, `POST /api/apercu`, `POST /api/publier`) gardés par un jeton tiré au lancement, le contrôle de `Host` et d'`Origin` et le JSON obligatoire. Il lit les réglages sous la forme qu'il écrit (les formes que l'export tolère sont ramenées à la sienne et signalées), valide chaque réglage avec les règles mêmes de l'export (`export.redact`, `export.configured_link`) avant une écriture atomique qui n'écrase jamais une modification faite ailleurs (empreinte SHA-256, 409), revalide les réglages enregistrés avant chaque aperçu et publication, et lance `scripts/export.py` pour l'aperçu (`--no-git --sans-recherche`, option ajoutée en Task 1 : aucune écriture dans la mémoire partagée) et pour la publication (commit « Réglages : … », puis export complet, derrière des garde-fous git). Une seule page d'admin par dépôt (verrou système). La page (`admin/index.html`, `admin/admin.js`, `admin/modele.js`, `admin/admin.css`) réutilise `docs/style.css` et les modules `docs/js/composants.js` et `docs/js/recherche.js` ; `admin/modele.js`, module pur, tient le brouillon des trois fichiers et se teste sous Node ; le parcours complet se teste dans Chrome contre le vrai `admin.py`, lancé dans un dépôt git temporaire avec un faux dashboard.

**Tech Stack:** Python 3.9+, bibliothèque standard uniquement (`http.server.ThreadingHTTPServer`, `secrets`, `hmac`, `hashlib`, `subprocess`, `msvcrt` ou `fcntl`, `unittest`) ; HTML/CSS/JavaScript vanilla (modules ES, CSP stricte, aucune dépendance) ; Node 22+ (`node --test`) ; `playwright-core` 1.63.0 pilotant le Chrome installé (banc existant de `tests/navigateur/`) ; git ; `cmd.exe` pour le lanceur.

**Spec:** `conception/2026-09-18-ameliorations-design.md` — § 5 (chantier C : serveur `scripts/admin.py`, sécurité, API, interface, lancement), § 6 C (tests et critères d'acceptation) et § 7 (hors périmètre). Plans précédents, pour le format et les conventions : `conception/plans/2026-09-18-chantier-a-donnees.md`, `conception/plans/2026-09-18-chantier-b-site.md`.

## Global Constraints

- Python 3.9+, bibliothèque standard uniquement, pour le serveur comme pour ses tests (`python -m unittest`) ; la page d'admin : HTML/CSS/JS vanilla en modules ES, aucune dépendance.
- Serveur `scripts/admin.py` : `http.server.ThreadingHTTPServer`, écoute `127.0.0.1:8790` (port suivant libre si occupé), ouvre le navigateur sur `http://127.0.0.1:<port>/admin/#jeton=<jeton>`.
- Sert `docs/` à la racine (aperçu fidèle du site) et `admin/` sous `/admin/` ; le dossier `admin/` est à la racine du dépôt, **hors de `docs/`** : jamais publié.
- Jeton aléatoire `secrets.token_urlsafe(32)` créé au lancement, exigé dans l'en-tête `X-Admin-Jeton` de chaque appel `/api/*` (comparaison à temps constant).
- En-tête `Host` obligatoirement `127.0.0.1:<port>` ou `localhost:<port>` (rebinding DNS) ; `Origin`, s'il est présent, identique.
- Corps des écritures en `application/json` uniquement (415 sinon) ; aucun chemin de fichier fourni par le client : liste fermée `config/projets.json`, `config/entrees.json`, `config/recherche.json`.
- API : `GET /api/etat` (les trois réglages, `docs/data.json`, état git ; plus empreintes, corrections de lecture et erreurs : Choix 19 à 21), `PUT /api/config/<projets|entrees|recherche>` (valide le schéma, écrit de façon atomique), `POST /api/apercu`, `POST /api/publier` ; une seule opération d'export à la fois (verrou) : une seconde demande répond « occupé ».
- Publier : commit des fichiers de configuration modifiés (message « Réglages : … »), puis `export.py` (commit de `data.json` + push de tout) ; refus expliqué en français hors de `main`, avec des modifications sans rapport ou avec un réglage enregistré invalide ; jamais de push forcé.
- Aperçu : `export.py --no-git --sans-recherche` — aucune recherche de voisins, donc aucune écriture dans la mémoire partagée (Choix 1).
- Jamais `.env` ni la clé du dashboard exposés : ni servis, ni renvoyés au navigateur, masqués dans les comptes rendus d'export.
- Interface `admin/index.html`, `admin/admin.js`, `admin/admin.css` (plus `admin/modele.js`) : réutilise `docs/style.css` et `docs/js/` ; CSP servie en en-tête (`script-src 'self'`, `style-src 'self'`, aucun script ni style en ligne) ; jamais d'`innerHTML` avec des données ; étiquettes, focus, contrastes AA (clair et sombre) ; écran de 1280 px sans défilement horizontal.
- Barre Enregistrer, Aperçu (ouvre le site local dans un onglet), Publier ; zone de compte rendu ; alerte si l'on quitte avec des modifications non enregistrées.
- Ce qui sera publié est vérifié : à l'enregistrement (422, rien d'écrit), puis sur le disque avant chaque aperçu et publication (409) ; un réglage modifié ailleurs n'est jamais écrasé (empreinte, 409) ; une seule page d'admin par dépôt (Choix 13, 20, 21).
- Lancement : `admin.cmd` (dépôt, CRLF) + raccourci « Gérer Mémoire Vive » sur le Bureau ; la fenêtre de commande reste ouverte ; Ctrl+C arrête le serveur.
- Hors périmètre (spec § 7) : modifier le contenu de la mémoire, authentification, multi-utilisateur, édition depuis le site public, recherche sémantique live.
- Tests : jamais la vraie mémoire, jamais le vrai dépôt distant (dépôts git temporaires, dépôt distant local, faux dashboard) ; `tests/test_publication.py` et son faux dashboard restent la référence.
- Textes de l'interface, messages, commentaires et prose en français, accents corrects ; identifiants du nouveau code de l'admin en français (Choix 17).
- Chaque commit se termine par la ligne `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.
- Ni commit de publication ni push dans ce plan : la publication est décidée par Noah (voir « Après le plan ») ; tout le chantier se fait dans `D:\memoire_vive-chantier-c`, branche `chantier-c` (Task 1, Step 0).

---

## Carte des fichiers

| Fichier | Rôle unique | Tâches |
| --- | --- | --- |
| `scripts/export.py` | option `--sans-recherche` (aperçu sans écriture dans la mémoire) ; `replace_file` (remplacement réessayé sous Windows) | 1 |
| `scripts/admin.py` | serveur local : validation, format et lecture des réglages ; sécurité, fichiers, API ; aperçu, publication, garde-fous git ; `main()`, une seule page par dépôt | 2, 3, 4, 9 |
| `admin/index.html` | squelette : en-tête, onglets, quatre panneaux, barre Enregistrer/Aperçu/Publier, compte rendu | 5 |
| `admin/admin.css` | mises en page de l'admin (jetons, boutons et familles de `docs/style.css`) | 5 |
| `admin/admin.js` | interface : jeton, appels, onglets, barre et compte rendu, panneaux, aperçu, publication | 5, 6, 7, 8 |
| `admin/modele.js` | brouillon des trois réglages et opérations (module pur, testé sous Node) | 5, 6, 7 |
| `admin/package.json` | `{ "type": "module" }` : Node lit `admin/*.js` comme modules (tests) | 5 |
| `admin.cmd` | lanceur double-cliquable (CRLF) | 9 |
| `tests/test_publication.py` | scénario `--sans-recherche` ; remplacement de `data.json` réessayé | 1 |
| `tests/test_admin.py` | validation, format, serveur (sécurité, API), aperçu, publication, lanceur | 2, 3, 4, 9 |
| `tests/js/admin.test.mjs` | modèle de l'admin sous Node | 5, 6, 7 |
| `tests/navigateur/outils.mjs` | `pageInstrumentee()` sortie de `ouvrirSite().page()`, pour les deux bancs | 5 |
| `tests/navigateur/banc-admin.mjs` | dépôt git temporaire, dépôt distant local, faux dashboard, `admin.py` lancé | 5, 11 |
| `tests/navigateur/admin.test.mjs` | parcours de la page dans Chrome | 5, 6, 7, 8 |
| `tests/navigateur/admin-reel.test.mjs` | recette sur les vrais réglages et le vrai `data.json` (copiés) | 11 |
| `README.md` | page d'admin, option `--sans-recherche`, tests, structure, dépannage | 10, 11 |
| `config/projets.json` | `_aide` : « modifiables depuis la page d'admin locale » (texte seul) | 10 |
| Bureau : `Gérer Mémoire Vive.cmd` | raccourci, hors dépôt | 9 |

## Commandes

Depuis la copie de travail du chantier, `D:\memoire_vive-chantier-c` (Task 1, Step 0) :

```powershell
python -m unittest discover -s tests   # export et admin (87 tests au départ, 164 à la fin)
node --test "tests/js/*.test.mjs"      # logique du site et de l'admin (53 au départ, 69 à la fin)
cd tests/navigateur; npm test          # suite navigateur complète (104 au départ, 131 à la fin, ~1 min 45)
```

Un seul fichier : `python -m unittest tests.test_admin -v`, `node --test tests/js/admin.test.mjs`, `cd tests/navigateur; node --test admin.test.mjs`. Variables : `MEMOIRE_CHROME` (chemin de Chrome), `MEMOIRE_PYTHON` (commande Python des tests navigateur de l'admin, défaut `python`).

Lancer la page à la main : `python scripts/admin.py` (ou `admin.cmd`) ; `--sans-navigateur` affiche l'adresse sans ouvrir le navigateur, `--port 8800` change le premier port essayé.

## Choix d'interprétation (à connaître avant de commencer)

1. **Aperçu sans aucune recherche de voisins (`export.py --no-git --sans-recherche`).** La spec (§ 5.2) dit « lance `export.py --no-git` ». Or chaque `POST /api/search` écrit dans la mémoire partagée de Noah (compteur, date et dernières requêtes d'accès de chaque résultat), et `--no-git` cherche les voisins de chaque entrée nouvelle. L'aperçu passe donc par une option ajoutée à l'export en Task 1, `--sans-recherche` : même `data.json` que `--no-git`, mais les entrées nouvelles sont notées dans `voisins_en_attente` au lieu d'être cherchées ; « Publier » (export complet) les cherche ensuite, une fois chacune. Le nombre total de recherches est celui d'aujourd'hui (une par entrée nouvelle), mais un aperçu ne touche jamais la mémoire, même abandonné, répété, ou quand on masque puis réaffiche une entrée (qui redeviendrait « nouvelle »). Contrepartie : dans l'aperçu, une entrée nouvelle n'a pas encore de « Voir aussi ». Écarté : recalculer l'aperçu à partir du seul `data.json`, sans dashboard — un second calcul à maintenir à côté de l'export, qui ne pourrait pas montrer une entrée qu'on réaffiche (elle n'est plus dans `data.json`). L'aperçu **lit** toujours la mémoire (`GET /api/memories`, comme tout export) : le dashboard doit tourner.
2. **Refus de publier.** L'export pousse tout commit en attente de la branche courante (`publish()`). « Publier » est donc refusé, avec la raison en français, si la copie de travail n'est pas sur `main` (ou HEAD détachée), si une fusion git est en cours ou un conflit présent, si un fichier **suivi** autre que les trois réglages et `docs/data.json` a des modifications non commitées (par exemple `scripts/export.py` en cours de modification, que l'export exécuterait), si `main` ne suit aucune branche distante, ou si des commits locaux pas encore poussés touchent autre chose que les réglages et `data.json`. Les fichiers **non suivis** ne comptent pas : chaque commit de la publication nomme ses fichiers (`git commit -- <chemins>`), ils ne partent jamais. Le refus s'affiche aussi en permanence dans l'en-tête de la page (« Publier est impossible pour l'instant : … »). Un commit « Réglages » resté local après un export en échec (dashboard arrêté) repart avec la publication suivante.
3. **Enregistrer avant Aperçu et Publier.** Les deux boutons enregistrent d'abord les modifications en attente ; « Publier » demande une confirmation (`confirm`) qui dit ce qui va se passer, recherches de voisins comprises. Des réglages enregistrés mais pas publiés restent dans `config/`, non commités : un `exporter.cmd` lancé entre-temps les applique déjà au site (l'export lit `config/`) sans les commiter, comme aujourd'hui pour une modification à la main ; la publication suivante les commite (README).
4. **Entrées masquées.** Une entrée masquée n'est plus dans `data.json` après l'aperçu ou la publication : la page la liste quand même (clés `masquer` de `config/entrees.json`) pour pouvoir la réafficher, sous le titre que le navigateur a mémorisé (`localStorage`, clé `memoire-vive:admin-titres`, origine `127.0.0.1:<port>`), à défaut sous son identifiant. Le titre n'est jamais écrit dans `config/` : le dépôt est public, et une entrée masquée l'est souvent parce qu'elle est privée. Pour la même raison, masquer une entrée retire sa correction de titre et de résumé (il ne reste que `{ "masquer": true }`), après confirmation si elle en avait une ; la réafficher ne la rend pas.
5. **Secrets : refus, pas simple avertissement.** Les textes publiés sur le site (nom et description d'un projet, nom d'une famille, titre et résumé corrigés, termes de synonymes) et ceux qui ne partent que dans le dépôt public (alias, tags, commentaires `_…`) passent par `export.redact` (mêmes motifs que l'export) et par les valeurs réelles des secrets (`MEMOIRE_API_KEY`, `MEMOIRE_CF_ACCESS_CLIENT_ID`, `MEMOIRE_CF_ACCESS_CLIENT_SECRET`, lus dans l'environnement **et** dans `.env`) ; dernier filet, le fichier entier tel qu'il serait écrit (identifiants compris). Un texte qui en contient est refusé (422) avec le champ et la raison ; rien n'est écrit.
6. **Lien principal d'un projet.** Validé par `export.configured_link`, comme à l'export ; au lieu d'un refus silencieux à l'export, la page explique : adresse locale, adresse invalide, secret. Un lien qui contient des identifiants (`https://utilisateur:motdepasse@…`, `https://utilisateur@…`) est refusé plutôt que nettoyé en silence.
7. **Format des fichiers écrits.** JSON lisible et stable : une clé de la racine par ligne, puis une famille, un projet ou un groupe de synonymes par ligne, et une correction d'entrée (objet de valeurs simples) sur sa ligne (`formater()`), pour des commits « Réglages » courts et lisibles sur GitHub. `config/entrees.json` et `config/recherche.json` actuels sont déjà dans ce format (octet pour octet) ; `config/projets.json` perd au premier enregistrement ses lignes vides entre familles et le retour à la ligne de `tags_generiques` (vérifié : mêmes données). Les clés `_aide` sont gardées.
8. **`tags_generiques` et `tags_exclus`.** Gardés et validés (vraies listes de textes non vides, sans secret), sans éditeur : la spec (§ 5.3) ne les met pas dans l'interface. Un texte seul ou `null`, que l'export accepte, est ramené à une liste dès la lecture (Choix 19) : un fichier écrit ainsi à la main ne bloque pas la page.
9. **Familles : « Supprimer » en plus** d'ajouter, renommer, réordonner et colorer (sinon une famille créée par erreur resterait) ; ses projets passent « Sans famille », après confirmation. Nouvel identifiant tiré du nom (`slug`), rendu unique ; première couleur libre.
10. **Fusion.** « Fusionner A dans B » : A et ses alias deviennent des alias de B, les réglages propres de A (nom, description, lien…) sont abandonnés, après confirmation ; A disparaît de la liste. Annulable en retirant l'alias. La validation refuse un alias rattaché à deux projets, ou un projet réglé qui serait aussi l'alias d'un autre.
11. **Jeton.** Lu dans l'ancre (`#jeton=…`, jamais envoyée au serveur), gardé dans `sessionStorage` pour l'onglet (un rechargement le garde), puis retiré de la barre d'adresse. Relancer `admin.cmd` en tire un autre : l'ancien onglet reçoit 403 et le dit. L'adresse avec le jeton reste dans l'historique de Chrome (enregistrée avant que la page ne l'efface) : elle ne sert que tant que la fenêtre de l'admin est ouverte, et depuis cet ordinateur seulement ; le README le dit. Écarté : un jeton d'amorçage à usage unique, échangé contre un jeton de session, qui obligerait à relancer `admin.cmd` pour rouvrir un onglet fermé, pour un gain nul (qui lit l'historique de Noah lit aussi son `.env`). Les fichiers statiques (`docs/`, `admin/`) sont servis sans jeton (le site est public, `admin/` ne contient aucune donnée), mais les contrôles `Host` et `Origin` s'appliquent à toutes les requêtes ; en-têtes `Content-Security-Policy` (celle du site plus `frame-ancestors 'none'`), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Cache-Control: no-store`. Écritures : 411 sans `Content-Length`, 413 au-delà de 2 Mo, 400 si le JSON est illisible ; seuls les types `.html`, `.js`, `.css`, `.json`, `.svg` sont servis, jamais un fichier caché.
12. **Port.** 8790, puis les 19 suivants ; `--port 0` (port choisi par le système) sert aux tests. Sous Windows, `SO_REUSEADDR` est coupé (`allow_reuse_address`) : sinon deux serveurs écouteraient le même port sans erreur.
13. **Verrous.** Le même verrou couvre l'aperçu, la publication et l'écriture des réglages : on n'écrit pas un réglage pendant qu'un export le lit. Il ne vaut que dans un processus : une seconde page d'admin sur le même dépôt (second double-clic) est donc refusée au lancement par un verrou système (`msvcrt.locking`, `fcntl.flock` ailleurs) sur un fichier propre au dépôt dans le dossier temporaire, relâché même si le processus meurt (Task 9). `exporter.cmd` n'est pas couvert : la confirmation de « Publier » et le README disent de ne pas le lancer pendant une publication.
14. **Réglages v1.** Un `config/projets.json` sans `"version": 2` est converti à la lecture (`vers_v2`, avec `export.normalize_projects_config`) et signalé comme au Choix 19 ; l'admin écrit toujours la v2 (spec § 3.1).
15. **Titre et résumé d'origine.** Calculés par le serveur à partir du texte publié dans `data.json` (`export.split_title`, `export.derive_summary`), qui est exactement celui dont l'export les tire ; « Rétablir » retire la correction. Vérifié sur les vraies données (Task 2).
16. **Barre du bas et compte rendu.** La page est une colonne : la zone de réglages défile au-dessus de la barre Enregistrer/Aperçu/Publier, toujours visible et qui ne recouvre jamais rien, même quand le compte rendu s'ouvre. La sortie de l'export est repliée (`<details>`), sauf en cas d'échec ; titre et message du compte rendu sont annoncés aux lecteurs d'écran (`#annonce`, `role="status"`, toujours présent), et le titre reçoit le focus après un aperçu, une publication ou un refus.
17. **Quatrième fichier, modules repris, identifiants en français.** La spec nomme `index.html`, `admin.js`, `admin.css` ; `admin/modele.js` (module pur, testable sous Node) et `admin/package.json` (`type: module`, comme `docs/js/package.json`) s'y ajoutent. Des modules du site, l'admin reprend `composants.js` (`el`, `plural`, `typeLabel`) et `recherche.js` (`normalize`), plus `style.css` et `theme.js` ; pas `donnees.js` (la spec cite « données, composants ») : les données arrivent par `GET /api/etat`, avec les réglages et l'état git, et l'admin n'a besoin ni de l'index de recherche ni des champs dérivés du site. `admin.js` importe `../js/…` : l'adresse `/admin/` place ces modules sous `/js/`, servis depuis `docs/js/` ; c'est pourquoi `modele.js`, testé sous Node depuis le disque (où `admin/../js/` n'existe pas), n'importe rien. Le code de l'admin est nouveau et lu par Noah : ses identifiants sont en français, comme les tests et le banc navigateur ; `export.py` et `docs/js/` gardent les leurs.
18. **Branche de travail et copie séparée.** `scripts/export.py` pousse tout commit pas encore sur le dépôt distant, et Noah exporte souvent (`exporter.cmd`). Le chantier se fait donc dans une copie de travail séparée (`git worktree`, `D:\memoire_vive-chantier-c`, branche `chantier-c`, Task 1, Step 0) : les exports continuent sur `main` dans `D:\memoire_vive` et ne publient que `data.json`. Cette copie n'a pas de `.env` : ne pas y cliquer « Aperçu » ni « Publier » (le dashboard répondrait 401, et la page refuse de toute façon de publier hors de `main`) ; la recette réelle (Task 11) se fait dans un clone jetable.
19. **Formes que l'export tolère, ramenées à celle de la page.** L'export accepte un alias ou une liste de tags écrits comme un texte seul (ou `null`), une couleur entre guillemets, un « masquer » qui ne vaut ni `true` ni `false` (il teste sa vérité : `"false"` masque l'entrée). Écrits à la main, ils bloqueraient la page : fiche du projet cassée, 422 à chaque enregistrement, entrée masquée affichée « non masquée ». `lire_config` les ramène donc à la forme de la page avec le sens que leur donne l'export (`normaliser`) ; `GET /api/etat` liste ces corrections (`normalisations`), la page les affiche à l'ouverture (« Réglages relus ») et compte ces fichiers comme modifiés : « Enregistrer » écrit la forme propre. Ce qui reste invalide (clé inconnue, secret…) est listé à l'ouverture (`erreurs`, « Réglages à corriger ») et bloque Aperçu et Publier (Choix 21). `modele.js` lit aussi un alias texte seul et un « masquer » non booléen comme l'export (`aliasDe`, `Boolean(masquer)`).
20. **Jamais d'écrasement d'une modification faite ailleurs.** `GET /api/etat` donne l'empreinte SHA-256 de chaque fichier de réglages (`""` s'il n'existe pas), calculée avant sa lecture ; chaque `PUT` la renvoie dans l'en-tête `X-Admin-Base` (428 sans), et le serveur, sous le verrou, refuse (409, rien n'est écrit) si le fichier a changé depuis : modification à la main, session Claude, autre onglet. La réponse donne la nouvelle empreinte. Recharger la page repart du fichier actuel (les saisies non enregistrées sont perdues, le message le dit).
21. **Vérification au moment de publier.** Un fichier modifié à la main n'est pas passé par la page, et `config/` part dans le dépôt public : avant chaque aperçu et chaque publication, sous le verrou, les réglages enregistrés sont revalidés sur le disque (`erreurs_reglages`, après `normaliser`). Un réglage invalide refuse l'opération (409, liste des erreurs, rien de commité) ; le refus s'affiche aussi dans l'en-tête (`refus_publication`).
22. **Onglet de l'aperçu ouvert au clic.** Chrome bloque une fenêtre ouverte plus de 5 s environ après le clic, et l'aperçu (enregistrement, export, rechargement) peut durer plus. La page ouvre donc l'onglet nommé pendant le clic (`window.open('', 'memoire-vive-apercu')`), l'envoie sur le site local si l'aperçu réussit, le referme s'il est resté vide en cas d'échec ; le lien « Ouvrir l'aperçu du site ↗ » reste en secours. Un test lance Chrome avec son bloqueur de fenêtres (Playwright le coupe d'habitude) contre un dashboard qui répond en 6 s.
23. **Robustesse (Windows, git).** Sous Windows, remplacer un fichier qu'un autre programme lit échoue un instant (site local, antivirus) : `export.replace_file` réessaie (20 fois, toutes les 50 ms), pour `data.json` comme pour les réglages. Chaque connexion a un délai de 30 s (connexion muette, corps annoncé jamais envoyé ; l'export n'est pas concerné) et un onglet fermé avant la réponse donne une ligne en français, pas une trace Python. Un `git status` ou `git log` en échec refuse la publication au lieu de passer pour un arbre propre. L'export tourne sans clavier (`stdin` fermé, `GIT_TERMINAL_PROMPT=0`) dans un groupe de processus à part, arrêté en entier (`taskkill /T`) au bout de 15 minutes. Un push refusé parce que le dépôt GitHub a avancé est expliqué (« lancer `git pull --rebase`, puis Publier ») ; la page ne fait jamais de `git fetch` elle-même (aucun accès réseau pour afficher l'état).

---

### Task 1: Export : option `--sans-recherche` (aperçu sans écriture dans la mémoire), remplacement de `data.json` réessayé

L'aperçu de la page d'admin doit montrer le site avec les réglages enregistrés sans rien écrire dans la mémoire partagée (Choix 1). `--dry-run` ne lance déjà aucune recherche mais n'écrit rien ; la nouvelle option `--sans-recherche` écrit `data.json` comme `--no-git`, sans aucune recherche de voisins : les entrées nouvelles vont dans `voisins_en_attente`, cherchées au prochain export réel. Et `write_payload` remplace désormais `data.json` par `replace_file`, qui réessaie quand Windows refuse un instant de remplacer un fichier qu'un autre programme lit (le site local de l'aperçu, un antivirus) ; la page d'admin s'en sert aussi pour les réglages (Choix 23).

**Files:**

- Modify: `scripts/export.py` (docstring d'usage, `replace_file`, `write_payload`, `main()`)
- Test: `tests/test_publication.py` (imports de `mock` et `export` ; scénario `test_02f_sans_recherche_ecrit_sans_chercher` ; classe `RemplacementTest`)

**Interfaces:**

- Consumes: `update_neighbours(payload, previous, search, recompute=False, allow_search=True) -> NeighboursResult` (inchangé).
- Produces: `replace_file(tmp: Path, target: Path, attempts: int = 20, pause: float = 0.05) -> None` (`os.replace` réessayé sur `PermissionError`, levée au dernier essai), utilisée par `write_payload` et par `admin.ecrire_config` (Task 3). `python scripts/export.py --no-git --sans-recherche` : écrit `docs/data.json`, aucun `POST /api/search` ; messages (indentés de deux espaces) « `Voisins : N entrées reliées (voisins repris de l'export précédent) ; aucune recherche en --sans-recherche.` » puis « `K nouvelle(s) entrée(s) : voisins calculés au prochain export réel.` » (ou « `Voisins : aucune recherche en --sans-recherche ; recalcul complet à l'export réel (K recherche(s)).` » sans export précédent). Utilisé par `POST /api/apercu` (Task 4).

- [ ] **Step 0: Copie de travail séparée, branche `chantier-c`**

Depuis `D:\memoire_vive` (sur `main`, arbre propre) :

```powershell
git status --short                # attendu : rien (ou seulement ce plan, s'il n'est pas encore commité)
git worktree add -b chantier-c ..\memoire_vive-chantier-c main
cd ..\memoire_vive-chantier-c
git branch --show-current         # attendu : chantier-c
cd tests/navigateur; npm install; cd ../..
```

Expected: `npm install` affiche « added 1 package » (`playwright-core`, dans `tests/navigateur/node_modules/`, ignoré par git).

Toutes les commandes et tous les commits de ce plan se font dans `D:\memoire_vive-chantier-c`. `D:\memoire_vive` reste sur `main` pour les exports de Noah. Ne jamais lancer `exporter.cmd` ni `scripts/export.py` sans `--no-git` depuis la copie du chantier. Si ce plan n'est pas encore commité sur `main`, il se lit dans `D:\memoire_vive\conception\plans\`.

- [ ] **Step 1: Écrire le test qui échoue**

Dans `tests/test_publication.py`, le nouveau scénario vient après `test_02e_recalculer_voisins` (les scénarios s'enchaînent par ordre de nom ; 131 entrées sont alors connues, la 132e est nouvelle), et la classe `RemplacementTest` s'ajoute à la fin :

3 remplacements dans `tests/test_publication.py`, dans l'ordre (chaque texte à remplacer y est unique).

1. Remplacer :

```python
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from tests.aides import hash_de

RACINE = Path(__file__).resolve().parent.parent
CLE = "cle-de-test-123"
```

par :

```python
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from unittest import mock
from urllib.parse import parse_qs, urlparse

from tests.aides import export, hash_de

RACINE = Path(__file__).resolve().parent.parent
CLE = "cle-de-test-123"
```

2. Remplacer :

```python
        self.assertEqual(ETAT["posts"], 131, sortie)
        self.assertIn("recalcul complet", sortie)

    def test_03_no_git_puis_rattrapage(self):
        ETAT["n"] = 140
        self.assertEqual(self.exporter("--no-git")[0], 0)
```

par :

```python
        self.assertEqual(ETAT["posts"], 131, sortie)
        self.assertIn("recalcul complet", sortie)

    def test_02f_sans_recherche_ecrit_sans_chercher(self):
        # Aperçu de la page d'admin : data.json écrit, aucune recherche ; l'entrée
        # nouvelle attend le prochain export réel.
        ETAT["n"] = 132
        code, sortie = self.exporter("--no-git", "--sans-recherche")
        self.assertEqual(code, 0, sortie)
        self.assertEqual(ETAT["posts"], 0, "--sans-recherche ne lance aucune recherche")
        self.assertIn("aucune recherche en --sans-recherche", sortie)
        self.assertIn("1 nouvelle(s) entrée(s) : voisins calculés au prochain export réel.", sortie)
        self.assertEqual(self.donnees()["nb_entrees"], 132, "data.json est bien écrit")
        self.assertEqual(self.donnees()["voisins_en_attente"], [hash_de(131)])
        self.assertEqual(self.entree(131)["voisins"], [])
        self.assertIn({"id": hash_de(1), "score": 0.9}, self.entree(0)["voisins"], "les voisins connus restent")

    def test_03_no_git_puis_rattrapage(self):
        ETAT["n"] = 140
        self.assertEqual(self.exporter("--no-git")[0], 0)
```

3. Remplacer :

```python
                      sortie)


if __name__ == "__main__":
    unittest.main()
```

par :

```python
                      sortie)



class RemplacementTest(unittest.TestCase):
    """Sous Windows, remplacer un fichier qu'un autre programme lit échoue
    (PermissionError) : l'écriture de data.json réessaie avant d'abandonner."""

    def test_remplacement_reessaye_puis_abandonne(self):
        with tempfile.TemporaryDirectory() as dossier:
            cible, tmp = Path(dossier) / "data.json", Path(dossier) / "data.json.tmp"
            cible.write_text("ancien", encoding="utf-8")
            tmp.write_text("nouveau", encoding="utf-8")
            vrai, essais = os.replace, []

            def replace(*args):
                essais.append(args)
                if len(essais) <= 2:
                    raise PermissionError(13, "fichier ouvert par un autre programme")
                return vrai(*args)

            with mock.patch.object(export.os, "replace", side_effect=replace):
                export.replace_file(tmp, cible, pause=0)
            self.assertEqual(len(essais), 3)
            self.assertEqual(cible.read_text(encoding="utf-8"), "nouveau")
            with mock.patch.object(export.os, "replace", side_effect=PermissionError(13, "toujours ouvert")):
                with self.assertRaises(PermissionError):
                    export.replace_file(tmp, cible, attempts=3, pause=0)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `python -m unittest tests.test_publication -v`
Expected: FAIL sur `test_02f_sans_recherche_ecrit_sans_chercher` : `AssertionError: 2 != 0 : usage: export.py [-h] [--dry-run] [--no-git] [--no-push] [--force] … export.py: error: unrecognized arguments: --sans-recherche`, et ERROR sur `test_remplacement_reessaye_puis_abandonne` : `AttributeError: module 'export' has no attribute 'replace_file'` ; les 16 autres passent (`Ran 18 tests`, `FAILED (failures=1, errors=1)`).

- [ ] **Step 3: Ajouter l'option et `replace_file` à `scripts/export.py`**

5 remplacements dans `scripts/export.py`, dans l'ordre (chaque texte à remplacer y est unique).

1. Remplacer :

```python
    python scripts/export.py --force               # passe outre le garde-fou de baisse
    python scripts/export.py --recalculer-voisins  # recherche les voisins de toutes les
                                                   # entrées, pas seulement des nouvelles

Voisins : chaque recherche (POST /api/search) met à jour l'historique d'accès
des entrées trouvées dans la mémoire partagée. Seules les entrées nouvelles
sont donc cherchées ; les autres reprennent leurs voisins du data.json
précédent (voir add_neighbours).

Configuration (voir load_config) — variables d'environnement, sinon .env :
    MEMOIRE_API_URL   adresse du dashboard (défaut http://127.0.0.1:8000)
```

par :

```python
    python scripts/export.py --force               # passe outre le garde-fou de baisse
    python scripts/export.py --recalculer-voisins  # recherche les voisins de toutes les
                                                   # entrées, pas seulement des nouvelles
    python scripts/export.py --no-git --sans-recherche
                                                   # aperçu (page d'admin) : écrit data.json
                                                   # sans aucune recherche de voisins

Voisins : chaque recherche (POST /api/search) met à jour l'historique d'accès
des entrées trouvées dans la mémoire partagée. Seules les entrées nouvelles
sont donc cherchées ; les autres reprennent leurs voisins du data.json
précédent (voir add_neighbours). Avec --sans-recherche, les entrées nouvelles
sont notées dans « voisins_en_attente » et cherchées au prochain export réel.

Configuration (voir load_config) — variables d'environnement, sinon .env :
    MEMOIRE_API_URL   adresse du dashboard (défaut http://127.0.0.1:8000)
```

2. Remplacer :

```python
        return None


def write_payload(payload: dict) -> None:
    # Sérialisé avant d'ouvrir quoi que ce soit : une valeur non finie lève
    # ValueError sans laisser de fichier (ni data.json invalide, ni .tmp).
```

par :

```python
        return None


def replace_file(tmp: Path, target: Path, attempts: int = 20, pause: float = 0.05) -> None:
    """
    os.replace, réessayé : sous Windows, il échoue (PermissionError) tant qu'un
    autre programme lit le fichier cible — le site local qui sert data.json,
    un antivirus. L'erreur n'est levée qu'après le dernier essai.
    """
    for attempt in range(attempts):
        try:
            os.replace(tmp, target)
            return
        except PermissionError:
            if attempt == attempts - 1:
                raise
            time.sleep(pause)


def write_payload(payload: dict) -> None:
    # Sérialisé avant d'ouvrir quoi que ce soit : une valeur non finie lève
    # ValueError sans laisser de fichier (ni data.json invalide, ni .tmp).
```

3. Remplacer :

```python
    tmp = DATA_FILE.with_suffix(".json.tmp")
    with open(tmp, "w", encoding="utf-8", newline="\n") as handle:
        handle.write(text)
    os.replace(tmp, DATA_FILE)


def git(*args: str, check: bool = True) -> subprocess.CompletedProcess:
```

par :

```python
    tmp = DATA_FILE.with_suffix(".json.tmp")
    with open(tmp, "w", encoding="utf-8", newline="\n") as handle:
        handle.write(text)
    replace_file(tmp, DATA_FILE)


def git(*args: str, check: bool = True) -> subprocess.CompletedProcess:
```

4. Remplacer :

```python
    parser.add_argument("--force", action="store_true", help="publie même si le nombre d'entrées chute")
    parser.add_argument("--recalculer-voisins", action="store_true",
                        help="recalcule les voisins de toutes les entrées (une recherche par entrée)")
    args = parser.parse_args()

    try:
```

par :

```python
    parser.add_argument("--force", action="store_true", help="publie même si le nombre d'entrées chute")
    parser.add_argument("--recalculer-voisins", action="store_true",
                        help="recalcule les voisins de toutes les entrées (une recherche par entrée)")
    parser.add_argument("--sans-recherche", action="store_true",
                        help="écrit data.json sans lancer de recherche de voisins (aperçu de la page d'admin) ; "
                             "les entrées nouvelles sont cherchées au prochain export")
    args = parser.parse_args()

    try:
```

5. Remplacer :

```python
        return 1

    # Voisins après les garde-fous : un export refusé ne lance aucune recherche
    # (chacune écrit dans la mémoire partagée), et --dry-run n'en lance jamais.
    neighbours = update_neighbours(payload, previous, api.search, recompute=args.recalculer_voisins,
                                   allow_search=not args.dry_run)
    waiting = len(neighbours.pending)
    if args.dry_run and neighbours.full:
        print(f"  Voisins : aucune recherche en --dry-run ; recalcul complet à l'export réel "
              f"({waiting} recherche(s)).")
    elif args.dry_run:
        print(f"  Voisins : {neighbours.linked} entrées reliées (voisins repris de l'export précédent) ; "
              "aucune recherche en --dry-run.")
        if waiting:
            print(f"  {waiting} nouvelle(s) entrée(s) : voisins calculés au prochain export réel.")
    else:
```

par :

```python
        return 1

    # Voisins après les garde-fous : un export refusé ne lance aucune recherche
    # (chacune écrit dans la mémoire partagée), et ni --dry-run ni
    # --sans-recherche n'en lancent jamais.
    no_search = "--dry-run" if args.dry_run else "--sans-recherche" if args.sans_recherche else ""
    neighbours = update_neighbours(payload, previous, api.search, recompute=args.recalculer_voisins,
                                   allow_search=not no_search)
    waiting = len(neighbours.pending)
    if no_search and neighbours.full:
        print(f"  Voisins : aucune recherche en {no_search} ; recalcul complet à l'export réel "
              f"({waiting} recherche(s)).")
    elif no_search:
        print(f"  Voisins : {neighbours.linked} entrées reliées (voisins repris de l'export précédent) ; "
              f"aucune recherche en {no_search}.")
        if waiting:
            print(f"  {waiting} nouvelle(s) entrée(s) : voisins calculés au prochain export réel.")
    else:
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

Run: `python -m unittest tests.test_publication -v`
Expected: `Ran 18 tests` … `OK`.

- [ ] **Step 5: Toute la suite Python**

Run: `python -m unittest discover -s tests`
Expected: `Ran 89 tests` … `OK`.

- [ ] **Step 6: Commit**

```bash
git add scripts/export.py tests/test_publication.py
git commit -m "Export : option --sans-recherche (aperçu sans recherche de voisins) ; remplacement de data.json réessayé

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: `scripts/admin.py` — validation, format et lecture des réglages

Le cœur sans réseau du serveur : ce qu'il accepte d'écrire. Les règles viennent des points laissés en attente par les revues précédentes (l'admin valide ce qu'elle écrit) : couleur de famille entière de 1 à 6, `masquer` vrai booléen (« "false" » entre guillemets masquerait l'entrée), corrections qui sont des objets, `tags_exclus` et `tags_generiques` vraies listes de textes, lien principal publiable (refus expliqué), aucun secret dans ce qui sera publié ni dans ce qui part dans le dépôt (alias, tags, commentaires, filet sur le fichier entier), identifiants entiers (`fullmatch` : un retour à la ligne final ne passe pas), alias en double signalé comme tel. S'y ajoutent le format des fichiers écrits (une correction d'entrée par ligne), la lecture (valeurs par défaut, conversion v1, formes que l'export tolère ramenées à celle de la page : Choix 19) et le calcul des titres d'origine.

**Files:**

- Create: `scripts/admin.py`
- Test: `tests/test_admin.py` (créé)

**Interfaces:**

- Consumes: de `scripts/export.py` : `redact(texte, known_secrets) -> (texte, nb)`, `configured_link(valeur, known_secrets) -> (url | None, raison, nb)` (raisons `"secret masqué"`, `"adresse locale"`, `"URL invalide"`), `slug`, `normalize_term`, `normalize_projects_config`, `split_title(contenu, tags) -> (titre, reste)`, `derive_summary(reste) -> str`, `read_env_file(chemin) -> dict`, `ExportError`, `build_payload` (tests). De `tests/aides.py` : `RACINE`, `export`, `memoire(n, contenu, tags, type="note", minute=0)`.
- Produces (module `admin`, importé par les tâches suivantes et les tests) :
  - `ROOT: Path` (racine du dépôt) ; `FICHIERS = {"projets": "config/projets.json", "entrees": "config/entrees.json", "recherche": "config/recherche.json"}` ; `DEFAUTS` (valeurs d'un fichier absent) ; `class ErreurAdmin(Exception)`.
  - `valider(nom: str, donnees, connus: tuple = ()) -> list[str]` (erreurs en français, `[]` si bon ; `nom` ∈ `FICHIERS` ; commentaires `_…` et filet sur le fichier entier compris) ; `valider_projets`, `valider_entrees`, `valider_recherche` (mêmes paramètres) ; constantes de messages `SECRET` (texte publié sur le site), `SECRET_DEPOT` (texte publié avec le dépôt), `IDENTIFIANT`, `LIEN_REFUSE`, `LIEN_IDENTIFIANTS`, `ETIQUETTES` (nom de chaque fichier dans les messages).
  - `formater(donnees: dict) -> str` (JSON écrit, fin de ligne `\n`).
  - `vers_v2(brut: dict) -> dict` ; `normaliser(nom: str, donnees: dict) -> list[str]` (modifie `donnees`, renvoie les corrections faites, en français) ; `lire_config(racine: Path, nom: str, notes: list | None = None) -> dict` (lève `ErreurAdmin` si illisible ; `notes` reçoit la conversion v1 et les corrections de `normaliser`).
  - `originaux(donnees) -> dict[str, {"titre": str, "resume": str}]`, par identifiant court (12 caractères).
  - `secrets_connus(racine: Path, environ: dict | None = None) -> tuple[str, ...]` (valeurs de l'environnement et de `.env`, triées).

- [ ] **Step 1: Écrire les tests qui échouent**

Créer `tests/test_admin.py` :

```python
"""
Page d'admin locale (scripts/admin.py) : validation des réglages, format des
fichiers écrits, serveur (sécurité, API), aperçu et publication. Aucune donnée
réelle modifiée, aucun accès au réseau extérieur ni au vrai dépôt distant.
"""
import json
import tempfile
import unittest
from pathlib import Path

from tests.aides import RACINE, export, memoire

import admin  # noqa: E402  (scripts/ est ajouté au chemin par tests.aides)


def projets(**changements):
    """Réglages des projets valides ; changements remplace des clés de la racine."""
    reglages = {
        "_aide": "Mode d'emploi.",
        "version": 2,
        "familles": [{"id": "jeux", "nom": "Jeux", "couleur": 1}, {"id": "outils", "nom": "Outils", "couleur": 4}],
        "projets": {"depths": {"nom": "Depths", "famille": "jeux", "alias": ["rogue-lite"]}},
        "tags_generiques": ["python"],
        "tags_exclus": [],
    }
    reglages.update(changements)
    return reglages


def un_projet(**reglage):
    return projets(projets={"depths": reglage})


class ValidationProjetsTest(unittest.TestCase):
    def erreurs(self, donnees):
        return admin.valider("projets", donnees)

    def test_reglages_valides(self):
        self.assertEqual(self.erreurs(projets()), [])
        self.assertEqual(self.erreurs(un_projet(nom=None, famille=None, description=None, lien_principal=None)), [])

    def test_couleur_entier_de_1_a_6(self):
        for couleur in ("3", 0, 7, 2.5, True, None):
            with self.subTest(couleur=couleur):
                familles = [{"id": "jeux", "nom": "Jeux", "couleur": couleur}]
                self.assertEqual(self.erreurs(projets(familles=familles, projets={})),
                                 ["Famille « jeux » : la couleur doit être un nombre entier de 1 à 6."])

    def test_famille_identifiant_nom_doublon(self):
        familles = [{"id": "Jeux Vidéo", "nom": "Jeux", "couleur": 1}, {"id": "a", "nom": " ", "couleur": 2},
                    {"id": "a", "nom": "A", "couleur": 3}, "b"]
        self.assertEqual(self.erreurs(projets(familles=familles, projets={})), [
            "Famille n° 1 : identifiant invalide (minuscules, chiffres et tirets seulement).",
            "Famille « a », nom : texte attendu (non vide).",
            "Famille n° 3 : identifiant « a » en double.",
            "Famille n° 4 : un objet est attendu.",
        ])

    def test_projet_famille_inconnue_et_cle_inconnue(self):
        self.assertEqual(self.erreurs(un_projet(famille="sport", couleur=2)), [
            "Projet « depths » : clé inconnue « couleur ».",
            "Projet « depths » : famille « sport » inconnue.",
        ])

    def test_identifiant_de_projet(self):
        self.assertEqual(self.erreurs(projets(projets={"Mon Projet": {}})),
                         ["Projet « Mon Projet » : identifiant invalide (minuscules, chiffres et tirets seulement)."])

    def test_listes_de_tags(self):
        self.assertEqual(self.erreurs(projets(tags_exclus="perso", tags_generiques=["ok", 3, ""])), [
            "tags_generiques : une liste de tags (textes non vides) est attendue.",
            "tags_exclus : une liste de tags (textes non vides) est attendue.",
        ])
        self.assertEqual(self.erreurs(un_projet(alias="rogue-lite")),
                         ["Projet « depths », alias : une liste de tags (textes non vides) est attendue."])

    def test_alias_en_double(self):
        self.assertEqual(self.erreurs(un_projet(alias=["rogue-lite", "Rogue Lite"])),
                         ["Projet « depths », alias : « Rogue Lite » est en double."])

    def test_identifiant_avec_retour_a_la_ligne_final(self):
        familles = [{"id": "jeux\n", "nom": "Jeux", "couleur": 1}]
        self.assertEqual(self.erreurs(projets(familles=familles, projets={"depths\n": {}})), [
            "Famille n° 1 : identifiant invalide (minuscules, chiffres et tirets seulement).",
            "Projet « depths\n » : identifiant invalide (minuscules, chiffres et tirets seulement).",
        ])

    def test_alias_en_conflit(self):
        reglages = projets(projets={"depths": {"alias": ["rogue-lite", "depths"]}, "nova": {"alias": ["Rogue Lite"]},
                                    "rogue-lite": {"nom": "Rogue"}})
        self.assertEqual(self.erreurs(reglages), [
            "Projet « depths », alias : « depths » est l'identifiant du projet lui-même.",
            "Projet « nova », alias : « Rogue Lite » est déjà rattaché au projet « depths ».",
            "Projet « rogue-lite » : c'est aussi un alias de « depths » (projet fusionné) ; ses réglages seraient ignorés.",
        ])

    def test_lien_principal_refuse_avec_explication(self):
        cas = {
            "http://192.168.1.10:8080/": "adresse locale : le site public ne pourrait pas l'ouvrir "
                                         "(localhost, adresse privée, nom de machine)",
            "exemple.fr": "adresse invalide : une adresse web complète est attendue, par exemple https://exemple.fr",
            "https://noah:motdepasse1@exemple.fr/": "contient un secret ou des identifiants "
                                                   "(utilisateur:mot de passe@) ; les retirer",
            "https://noah@exemple.fr/": "contient un secret ou des identifiants (utilisateur:mot de passe@) ; les retirer",
            "https://exemple.fr/?token=ghp_" + "a" * 36: "contient un secret ou des identifiants "
                                                        "(utilisateur:mot de passe@) ; les retirer",
            "": "adresse web attendue (ou rien, pour le calcul automatique)",
        }
        for lien, message in cas.items():
            with self.subTest(lien=lien):
                self.assertEqual(self.erreurs(un_projet(lien_principal=lien)),
                                 [f"Projet « depths », lien principal : {message}."])
        self.assertEqual(self.erreurs(un_projet(lien_principal="https://exemple.github.io/depths/")), [])

    def test_textes_publics_sans_secret(self):
        secret = "Clé : sk-ant-" + "x" * 30
        self.assertEqual(self.erreurs(un_projet(nom=secret, description="api_key=abc123456789")), [
            "Projet « depths », nom : ressemble à un secret (clé, jeton ou mot de passe) ; "
            "ce texte serait publié sur le site.",
            "Projet « depths », description : ressemble à un secret (clé, jeton ou mot de passe) ; "
            "ce texte serait publié sur le site.",
        ])
        familles = [{"id": "jeux", "nom": "ghp_" + "b" * 36, "couleur": 1}]
        self.assertEqual(self.erreurs(projets(familles=familles, projets={})), [
            "Famille « jeux », nom : ressemble à un secret (clé, jeton ou mot de passe) ; "
            "ce texte serait publié sur le site."])

    def test_alias_tags_et_commentaires_sans_secret(self):
        # Pas affichés sur le site, mais config/projets.json est commité dans le dépôt public.
        jeton = "ghp_" + "a" * 36
        reglages = projets(_aide=f"Jeton : {jeton}", projets={"depths": {"alias": [jeton]}}, tags_exclus=[jeton])
        self.assertEqual(self.erreurs(reglages), [
            "Projet « depths », alias : un tag ressemble à un secret (clé, jeton ou mot de passe) ; "
            "ce fichier est publié avec le dépôt.",
            "tags_exclus : un tag ressemble à un secret (clé, jeton ou mot de passe) ; ce fichier est publié avec le dépôt.",
            "Commentaire « _aide » : ressemble à un secret (clé, jeton ou mot de passe) ; "
            "ce fichier est publié avec le dépôt.",
        ])

    def test_secret_ailleurs_dans_le_fichier(self):
        # Filet : aucun champ ne vérifie l'identifiant d'un projet, mais le fichier entier est publié.
        self.assertEqual(self.erreurs(projets(projets={"sk-ant-" + "a" * 24: {}})), [
            "Réglages des projets : un texte ressemble à un secret (clé, jeton ou mot de passe) ; "
            "ce fichier est publié avec le dépôt."])

    def test_vraie_cle_du_dashboard_refusee(self):
        erreurs = admin.valider("projets", un_projet(description="la clé est cle-tres-privee"),
                                connus=("cle-tres-privee",))
        self.assertEqual(len(erreurs), 1)
        self.assertIn("ressemble à un secret", erreurs[0])

    def test_racine(self):
        self.assertEqual(admin.valider("projets", []), ["Les réglages doivent être un objet JSON."])
        self.assertEqual(self.erreurs(projets(version=1, extra=True)), [
            "Réglages des projets : clé inconnue « extra ».",
            "Réglages des projets : « version » doit valoir 2.",
        ])


class ValidationEntreesTest(unittest.TestCase):
    def erreurs(self, donnees):
        return admin.valider("entrees", donnees)

    def test_corrections_valides(self):
        self.assertEqual(self.erreurs({"_aide": "…", "a713bd8e2800": {"titre": "Titre", "resume": "Résumé.",
                                                                        "masquer": False}}), [])

    def test_masquer_vrai_booleen(self):
        # « "false" » entre guillemets masquerait l'entrée : l'export teste sa vérité.
        self.assertEqual(self.erreurs({"a713bd8e2800": {"masquer": "false"}}),
                         ["Entrée a713bd8e2800 : « masquer » doit valoir true ou false (sans guillemets)."])

    def test_correction_objet(self):
        self.assertEqual(self.erreurs({"a713bd8e2800": True}),
                         ['Entrée a713bd8e2800 : la correction doit être un objet, par exemple { "masquer": true }.'])

    def test_identifiant_court_et_cles(self):
        self.assertEqual(self.erreurs({"A713BD8E2800": {}, "a713bd8e2800": {"titre": "", "note": "x"}}), [
            "Entrée A713BD8E2800 : identifiant court attendu (les 12 premiers caractères, 0-9 et a-f, "
            "de l'identifiant de l'entrée).",
            "Entrée a713bd8e2800 : clé inconnue « note ».",
            "Entrée a713bd8e2800, titre : texte attendu (non vide).",
        ])

    def test_identifiant_court_avec_retour_a_la_ligne_final(self):
        self.assertEqual(self.erreurs({"a713bd8e2800\n": {"masquer": True}}), [
            "Entrée a713bd8e2800\n : identifiant court attendu (les 12 premiers caractères, 0-9 et a-f, "
            "de l'identifiant de l'entrée)."])

    def test_titre_et_resume_sans_secret(self):
        erreurs = self.erreurs({"a713bd8e2800": {"titre": "mot de passe : Azerty123", "resume": "Bearer " + "c" * 20}})
        self.assertEqual(erreurs, [
            "Entrée a713bd8e2800, titre : ressemble à un secret (clé, jeton ou mot de passe) ; "
            "ce texte serait publié sur le site.",
            "Entrée a713bd8e2800, résumé : ressemble à un secret (clé, jeton ou mot de passe) ; "
            "ce texte serait publié sur le site.",
        ])


class ValidationRechercheTest(unittest.TestCase):
    def erreurs(self, donnees):
        return admin.valider("recherche", donnees)

    def test_synonymes_valides(self):
        self.assertEqual(self.erreurs({"_aide": "…", "synonymes": [["ia", "intelligence artificielle"]]}), [])

    def test_groupes(self):
        self.assertEqual(self.erreurs({"synonymes": [["ia"], ["Local", "local"], "jeu", ["site", 3, " "]]}), [
            "Synonymes, groupe n° 1 : au moins deux termes différents sont nécessaires.",
            "Synonymes, groupe n° 2 : au moins deux termes différents sont nécessaires.",
            "Synonymes, groupe n° 3 : une liste de termes est attendue.",
            "Synonymes, groupe n° 4 : terme vide ou qui n'est pas du texte.",
            "Synonymes, groupe n° 4 : terme vide ou qui n'est pas du texte.",
            "Synonymes, groupe n° 4 : au moins deux termes différents sont nécessaires.",
        ])

    def test_synonyme_secret(self):
        self.assertEqual(self.erreurs({"synonymes": [["jeton", "xoxb-" + "1" * 12]]}), [
            "Synonymes, groupe n° 1 : ressemble à un secret (clé, jeton ou mot de passe) ; "
            "ce texte serait publié sur le site."])

    def test_racine(self):
        self.assertEqual(self.erreurs({"synonymes": {}, "autre": 1}), [
            "Réglages de la recherche : clé inconnue « autre ».",
            "Synonymes : une liste de groupes est attendue.",
        ])


class FormatTest(unittest.TestCase):
    def test_un_element_par_ligne(self):
        texte = admin.formater(projets())
        self.assertEqual(texte, "\n".join([
            "{",
            '  "_aide": "Mode d\'emploi.",',
            '  "version": 2,',
            '  "familles": [',
            '    { "id": "jeux", "nom": "Jeux", "couleur": 1 },',
            '    { "id": "outils", "nom": "Outils", "couleur": 4 }',
            "  ],",
            '  "projets": {',
            '    "depths": { "nom": "Depths", "famille": "jeux", "alias": ["rogue-lite"] }',
            "  },",
            '  "tags_generiques": ["python"],',
            '  "tags_exclus": []',
            "}",
            "",
        ]))

    def test_une_correction_par_ligne(self):
        corrections = {"_aide": "Corrections.", "a713bd8e2800": {"titre": "Titre", "masquer": True},
                       "b0c1d2e3f4a5": {"masquer": True}}
        self.assertEqual(admin.formater(corrections), "\n".join([
            "{",
            '  "_aide": "Corrections.",',
            '  "a713bd8e2800": { "titre": "Titre", "masquer": true },',
            '  "b0c1d2e3f4a5": { "masquer": true }',
            "}",
            "",
        ]))

    def test_aller_retour_sur_les_vrais_reglages(self):
        for nom, chemin in admin.FICHIERS.items():
            with self.subTest(nom=nom):
                donnees = json.loads((RACINE / chemin).read_text(encoding="utf-8"))
                self.assertEqual(json.loads(admin.formater(donnees)), donnees)

    def test_objets_vides_et_accents(self):
        self.assertEqual(admin.formater({"a": {}, "b": [], "c": "é"}), '{\n  "a": {},\n  "b": [],\n  "c": "é"\n}\n')


class LectureTest(unittest.TestCase):
    def setUp(self):
        self.dossier = tempfile.TemporaryDirectory()
        self.racine = Path(self.dossier.name)
        (self.racine / "config").mkdir()

    def tearDown(self):
        self.dossier.cleanup()

    def ecrire(self, nom, texte):
        (self.racine / "config" / nom).write_text(texte, encoding="utf-8")

    def test_fichiers_absents(self):
        self.assertEqual(admin.lire_config(self.racine, "projets"),
                         {"version": 2, "familles": [], "projets": {}, "tags_generiques": [], "tags_exclus": []})
        self.assertEqual(admin.lire_config(self.racine, "entrees"), {})
        self.assertEqual(admin.lire_config(self.racine, "recherche"), {"synonymes": []})

    def test_v1_convertie_en_v2(self):
        self.ecrire("projets.json", json.dumps({"_aide": "v1", "alias": {"rogue-lite": "depths"},
                                                "noms": {"depths": "Depths"}, "tags_exclus": ["perso"]}))
        notes = []
        self.assertEqual(admin.lire_config(self.racine, "projets", notes), {
            "_aide": "v1", "version": 2, "familles": [],
            "projets": {"depths": {"nom": "Depths", "alias": ["rogue-lite"]}},
            "tags_generiques": [], "tags_exclus": ["perso"]})
        self.assertEqual(notes, ["config/projets.json : réglages en version 1, lus et convertis en version 2."])

    def test_formes_tolerees_par_l_export_ramenees(self):
        self.ecrire("projets.json", json.dumps({
            "version": 2, "familles": [{"id": "jeux", "nom": "Jeux", "couleur": "3"}],
            "projets": {"depths": {"alias": "rogue-lite"}, "nova": {"alias": None, "famille": "jeux"}},
            "tags_generiques": "python", "tags_exclus": None}))
        notes = []
        reglages = admin.lire_config(self.racine, "projets", notes)
        self.assertEqual(reglages, {
            "version": 2, "familles": [{"id": "jeux", "nom": "Jeux", "couleur": 3}],
            "projets": {"depths": {"alias": ["rogue-lite"]}, "nova": {"famille": "jeux"}},
            "tags_generiques": ["python"], "tags_exclus": []})
        self.assertEqual(notes, [
            "config/projets.json : « tags_generiques » est un texte seul, lu comme une liste d'un tag.",
            "config/projets.json : « tags_exclus » vaut null, lu comme une liste vide.",
            'config/projets.json, famille n° 1 : couleur "3" entre guillemets, lue comme le nombre 3.',
            "config/projets.json, projet « depths » : alias écrit comme un texte seul, lu comme une liste d'un alias.",
            "config/projets.json, projet « nova » : alias null, retiré.",
        ])
        self.assertEqual(admin.valider("projets", reglages), [], "la page peut enregistrer")

    def test_masquer_lu_comme_l_export(self):
        # « "false" » entre guillemets est vrai pour l'export : l'entrée est masquée.
        brutes = [memoire(5, "Voxelcraft — un jeu de cubes.", ["voxelcraft"])]
        payload, _ = export.build_payload(brutes, export.normalize_projects_config({}), (),
                                          {"000000000005": {"masquer": "false"}})
        self.assertEqual(payload["entrees"], [], "l'export masque l'entrée")
        self.ecrire("entrees.json", json.dumps({"000000000005": {"masquer": "false"},
                                                "000000000006": {"masquer": 0, "titre": "Titre"}}))
        notes = []
        self.assertEqual(admin.lire_config(self.racine, "entrees", notes), {
            "000000000005": {"masquer": True}, "000000000006": {"masquer": False, "titre": "Titre"}})
        self.assertEqual(notes, [
            'config/entrees.json, entrée 000000000005 : « masquer » vaut "false" (ni true ni false) ; '
            "pour l'export l'entrée est masquée, la page l'écrit true.",
            "config/entrees.json, entrée 000000000006 : « masquer » vaut 0 (ni true ni false) ; "
            "pour l'export l'entrée est affichée, la page l'écrit false.",
        ])

    def test_fichier_illisible(self):
        self.ecrire("recherche.json", "{ oups")
        with self.assertRaises(admin.ErreurAdmin) as contexte:
            admin.lire_config(self.racine, "recherche")
        self.assertIn("config/recherche.json est illisible", str(contexte.exception))
        self.ecrire("entrees.json", "[]")
        with self.assertRaises(admin.ErreurAdmin):
            admin.lire_config(self.racine, "entrees")


class OriginauxTest(unittest.TestCase):
    def test_titre_calcule_meme_si_corrige(self):
        brutes = [memoire(1, "Jarvis — architecture : pipeline vocal local. Trois étages.", ["jarvis"])]
        payload, _ = export.build_payload(brutes, export.normalize_projects_config({}), (),
                                          {"000000000001": {"titre": "Titre corrigé"}})
        self.assertEqual(payload["entrees"][0]["titre"], "Titre corrigé")
        self.assertEqual(admin.originaux(payload), {
            "000000000001": {"titre": "Jarvis — architecture", "resume": "Pipeline vocal local. Trois étages."}})
        self.assertEqual(admin.originaux(None), {})
        self.assertEqual(admin.originaux({"entrees": [None, {"id": 3}]}), {})


class ConfigReelleTest(unittest.TestCase):
    """Les réglages et les données du dépôt passent la validation de l'admin :
    la page s'ouvre et enregistre sans erreur sur l'état réel."""

    def test_reglages_reels_valides(self):
        for nom in admin.FICHIERS:
            with self.subTest(nom=nom):
                notes = []
                self.assertEqual(admin.valider(nom, admin.lire_config(RACINE, nom, notes)), [])
                self.assertEqual(notes, [], "déjà sous la forme que la page écrit")

    def test_originaux_identiques_aux_titres_publies_non_corriges(self):
        donnees = json.loads((RACINE / "docs" / "data.json").read_text(encoding="utf-8"))
        originaux = admin.originaux(donnees)
        for entree in donnees["entrees"]:
            if not entree.get("corrige"):
                self.assertEqual(originaux[entree["id"][:12]], {"titre": entree["titre"], "resume": entree["resume"]})


if __name__ == "__main__":
    unittest.main()
```

Les deux derniers tests lisent les vrais `config/*.json` et `docs/data.json` du dépôt, sans les modifier : la page doit s'ouvrir et enregistrer sur l'état réel, et les titres d'origine recalculés doivent être ceux que l'export publie.

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `python -m unittest tests.test_admin -v`
Expected: FAIL — `ImportError: Failed to import test module: test_admin` … `ModuleNotFoundError: No module named 'admin'` (`FAILED (errors=1)`).

- [ ] **Step 3: Créer `scripts/admin.py`**

```python
#!/usr/bin/env python3
"""
Page d'admin locale de Mémoire Vive : réglages des projets, des familles, des
entrées et de la recherche. Validation des réglages avant écriture (l'admin
n'écrit que ce que l'export comprend, sans secret dans ce qui sera publié),
mise en forme des fichiers, lecture de la configuration.

Aucune dépendance : bibliothèque standard Python 3.9+, et les fonctions de
scripts/export.py (masquage des secrets, liens, titres).
"""

from __future__ import annotations

import copy
import json
import os
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import export  # noqa: E402  (même dossier : masquage des secrets, liens, titres)

ROOT = Path(__file__).resolve().parent.parent

# Liste fermée des fichiers modifiables : le client ne donne jamais de chemin.
FICHIERS = {
    "projets": "config/projets.json",
    "entrees": "config/entrees.json",
    "recherche": "config/recherche.json",
}
DEFAUTS = {
    "projets": {"version": 2, "familles": [], "projets": {}, "tags_generiques": [], "tags_exclus": []},
    "entrees": {},
    "recherche": {"synonymes": []},
}


class ErreurAdmin(Exception):
    pass


# --------------------------------------------------------------------------
# Validation : l'admin n'écrit que des réglages que l'export comprend
# --------------------------------------------------------------------------

# Toujours avec fullmatch : un « $ » laisserait passer un retour à la ligne final.
SLUG_RE = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*")
ID_COURT_RE = re.compile(r"[0-9a-f]{12}")
CLES_PROJETS = {"version", "familles", "projets", "tags_generiques", "tags_exclus"}
CLES_FAMILLE = {"id", "nom", "couleur"}
CLES_PROJET = {"nom", "famille", "alias", "description", "lien_principal"}
CLES_CORRECTION = {"titre", "resume", "masquer"}
CLES_RECHERCHE = {"synonymes"}
TEXTE_MAX = 5000
SECRET = "ressemble à un secret (clé, jeton ou mot de passe) ; ce texte serait publié sur le site"
# Alias, tags, commentaires, identifiants : pas affichés sur le site, mais les
# trois fichiers sont commités dans le dépôt public.
SECRET_DEPOT = "ressemble à un secret (clé, jeton ou mot de passe) ; ce fichier est publié avec le dépôt"
IDENTIFIANT = "identifiant invalide (minuscules, chiffres et tirets seulement)"
ETIQUETTES = {"projets": "Réglages des projets", "entrees": "Corrections des entrées",
              "recherche": "Réglages de la recherche"}
LIEN_REFUSE = {
    "adresse locale": "adresse locale : le site public ne pourrait pas l'ouvrir (localhost, adresse privée, "
                      "nom de machine)",
    "URL invalide": "adresse invalide : une adresse web complète est attendue, par exemple https://exemple.fr",
}
LIEN_IDENTIFIANTS = "contient un secret ou des identifiants (utilisateur:mot de passe@) ; les retirer"


def _cles(erreurs: list, lieu: str, objet: dict, permises: set, commentaires: bool = False) -> None:
    """Clés inconnues refusées ; à la racine d'un fichier, « _aide » et les autres « _… » sont admises."""
    for cle in objet:
        if cle not in permises and not (commentaires and str(cle).startswith("_")):
            erreurs.append(f"{lieu} : clé inconnue « {cle} ».")


def _texte(erreurs: list, lieu: str, valeur, connus: tuple, facultatif: bool = True) -> None:
    """Texte publié sur le site : non vide, sans secret (mêmes motifs que l'export)."""
    if valeur is None and facultatif:
        return
    if not isinstance(valeur, str) or not valeur.strip():
        erreurs.append(f"{lieu} : texte attendu (non vide).")
    elif len(valeur) > TEXTE_MAX:
        erreurs.append(f"{lieu} : texte trop long ({len(valeur)} caractères, {TEXTE_MAX} au plus).")
    elif export.redact(valeur, connus)[1]:
        erreurs.append(f"{lieu} : {SECRET}.")


def _tags(erreurs: list, lieu: str, valeur, connus: tuple) -> bool:
    """Liste de tags : une vraie liste de textes non vides, sans secret. True si
    c'est bien une liste de textes (une chaîne seule est ramenée à une liste
    dès la lecture : voir normaliser)."""
    if not (isinstance(valeur, list) and all(isinstance(t, str) and t.strip() for t in valeur)):
        erreurs.append(f"{lieu} : une liste de tags (textes non vides) est attendue.")
        return False
    for tag in valeur:
        if export.redact(tag, connus)[1]:
            erreurs.append(f"{lieu} : un tag {SECRET_DEPOT}.")
    return True


def _chaines(valeur):
    """Tous les textes d'une valeur JSON (clés comprises), listes et objets parcourus."""
    if isinstance(valeur, str):
        yield valeur
    elif isinstance(valeur, list):
        for element in valeur:
            yield from _chaines(element)
    elif isinstance(valeur, dict):
        for cle, element in valeur.items():
            yield str(cle)
            yield from _chaines(element)


def _commentaires(erreurs: list, donnees: dict, connus: tuple) -> None:
    """Clés « _… » de la racine (mode d'emploi) : gardées telles quelles, mais
    publiées avec le dépôt, donc sans secret."""
    for cle, valeur in donnees.items():
        if str(cle).startswith("_") and any(export.redact(texte, connus)[1] for texte in _chaines(valeur)):
            erreurs.append(f"Commentaire « {cle} » : {SECRET_DEPOT}.")


def _lien(erreurs: list, lieu: str, valeur, connus: tuple) -> None:
    """Lien principal configuré : mêmes règles que l'export (configured_link), refus expliqué."""
    if valeur is None:
        return
    if not isinstance(valeur, str) or not valeur.strip():
        erreurs.append(f"{lieu} : adresse web attendue (ou rien, pour le calcul automatique).")
        return
    url, raison, masques = export.configured_link(valeur, connus)
    if masques or raison == "secret masqué" or (url is not None and url != valeur.strip()):
        # L'export retirerait les identifiants sans rien dire : ici, on explique.
        erreurs.append(f"{lieu} : {LIEN_IDENTIFIANTS}.")
    elif url is None:
        erreurs.append(f"{lieu} : {LIEN_REFUSE.get(raison, raison)}.")


def valider_projets(donnees: dict, connus: tuple = ()) -> list[str]:
    erreurs: list[str] = []
    _cles(erreurs, "Réglages des projets", donnees, CLES_PROJETS, commentaires=True)
    if donnees.get("version") != 2:
        erreurs.append("Réglages des projets : « version » doit valoir 2.")

    familles = donnees.get("familles", [])
    ids: list[str] = []
    if not isinstance(familles, list):
        erreurs.append("Familles : une liste est attendue.")
        familles = []
    for n, famille in enumerate(familles, 1):
        lieu = f"Famille n° {n}"
        if not isinstance(famille, dict):
            erreurs.append(f"{lieu} : un objet est attendu.")
            continue
        fid = famille.get("id")
        if not isinstance(fid, str) or not SLUG_RE.fullmatch(fid):
            erreurs.append(f"{lieu} : {IDENTIFIANT}.")
        elif fid in ids:
            erreurs.append(f"{lieu} : identifiant « {fid} » en double.")
        else:
            ids.append(fid)
            lieu = f"Famille « {fid} »"
        _cles(erreurs, lieu, famille, CLES_FAMILLE)
        _texte(erreurs, f"{lieu}, nom", famille.get("nom"), connus, facultatif=False)
        couleur = famille.get("couleur")
        if isinstance(couleur, bool) or not isinstance(couleur, int) or not 1 <= couleur <= 6:
            erreurs.append(f"{lieu} : la couleur doit être un nombre entier de 1 à 6.")

    reglages = donnees.get("projets", {})
    if not isinstance(reglages, dict):
        erreurs.append("Projets : un objet est attendu (identifiant → réglages).")
        reglages = {}
    proprietaires: dict[str, str] = {}  # alias (tag normalisé) → projet qui le porte
    for pid, reglage in reglages.items():
        lieu = f"Projet « {pid} »"
        if not SLUG_RE.fullmatch(pid):
            erreurs.append(f"{lieu} : {IDENTIFIANT}.")
        if not isinstance(reglage, dict):
            erreurs.append(f"{lieu} : un objet est attendu.")
            continue
        _cles(erreurs, lieu, reglage, CLES_PROJET)
        _texte(erreurs, f"{lieu}, nom", reglage.get("nom"), connus)
        _texte(erreurs, f"{lieu}, description", reglage.get("description"), connus)
        famille = reglage.get("famille")
        if famille is not None and famille not in ids:
            erreurs.append(f"{lieu} : famille « {famille} » inconnue.")
        alias = reglage.get("alias", [])
        if _tags(erreurs, f"{lieu}, alias", alias, connus):
            for tag in alias:
                cible = export.slug(tag)
                if cible == pid:
                    erreurs.append(f"{lieu}, alias : « {tag} » est l'identifiant du projet lui-même.")
                elif proprietaires.get(cible) == pid:
                    erreurs.append(f"{lieu}, alias : « {tag} » est en double.")
                elif cible in proprietaires:
                    erreurs.append(f"{lieu}, alias : « {tag} » est déjà rattaché au projet « {proprietaires[cible]} ».")
                else:
                    proprietaires[cible] = pid
        _lien(erreurs, f"{lieu}, lien principal", reglage.get("lien_principal"), connus)
    for alias, pid in proprietaires.items():
        if alias in reglages:
            erreurs.append(f"Projet « {alias} » : c'est aussi un alias de « {pid} » (projet fusionné) ; "
                           "ses réglages seraient ignorés.")

    for nom in ("tags_generiques", "tags_exclus"):
        _tags(erreurs, nom, donnees.get(nom, []), connus)
    return erreurs


def valider_entrees(donnees: dict, connus: tuple = ()) -> list[str]:
    erreurs: list[str] = []
    for cle, correction in donnees.items():
        if str(cle).startswith("_"):
            continue  # « _aide » et autres commentaires
        lieu = f"Entrée {cle}"
        if not ID_COURT_RE.fullmatch(cle):
            erreurs.append(f"{lieu} : identifiant court attendu (les 12 premiers caractères, 0-9 et a-f, "
                           "de l'identifiant de l'entrée).")
        if not isinstance(correction, dict):
            erreurs.append(f'{lieu} : la correction doit être un objet, par exemple {{ "masquer": true }}.')
            continue
        _cles(erreurs, lieu, correction, CLES_CORRECTION)
        _texte(erreurs, f"{lieu}, titre", correction.get("titre"), connus)
        _texte(erreurs, f"{lieu}, résumé", correction.get("resume"), connus)
        if "masquer" in correction and not isinstance(correction["masquer"], bool):
            # « "false" » entre guillemets serait vrai pour l'export : l'entrée disparaîtrait.
            erreurs.append(f"{lieu} : « masquer » doit valoir true ou false (sans guillemets).")
    return erreurs


def valider_recherche(donnees: dict, connus: tuple = ()) -> list[str]:
    erreurs: list[str] = []
    _cles(erreurs, "Réglages de la recherche", donnees, CLES_RECHERCHE, commentaires=True)
    groupes = donnees.get("synonymes", [])
    if not isinstance(groupes, list):
        erreurs.append("Synonymes : une liste de groupes est attendue.")
        return erreurs
    for n, groupe in enumerate(groupes, 1):
        lieu = f"Synonymes, groupe n° {n}"
        if not isinstance(groupe, list):
            erreurs.append(f"{lieu} : une liste de termes est attendue.")
            continue
        termes = set()
        for terme in groupe:
            if not isinstance(terme, str) or not terme.strip():
                erreurs.append(f"{lieu} : terme vide ou qui n'est pas du texte.")
                continue
            if export.redact(terme, connus)[1]:
                erreurs.append(f"{lieu} : {SECRET}.")
            termes.add(export.normalize_term(terme))
        if len(termes) < 2:
            erreurs.append(f"{lieu} : au moins deux termes différents sont nécessaires.")
    return erreurs


VALIDATEURS = {"projets": valider_projets, "entrees": valider_entrees, "recherche": valider_recherche}


def valider(nom: str, donnees, connus: tuple = ()) -> list[str]:
    """Erreurs (en français) qui empêchent d'écrire ces réglages ; [] s'ils sont bons.
    connus : valeurs réelles des secrets (clé du dashboard), refusées telles quelles."""
    if not isinstance(donnees, dict):
        return ["Les réglages doivent être un objet JSON."]
    erreurs = VALIDATEURS[nom](donnees, connus)
    _commentaires(erreurs, donnees, connus)
    # Filet : le fichier entier est commité dans le dépôt public, identifiants
    # compris. Rien de plus à signaler si un champ a déjà été refusé pour un secret.
    if not any("secret" in erreur for erreur in erreurs) and export.redact(formater(donnees), connus)[1]:
        erreurs.append(f"{ETIQUETTES[nom]} : un texte {SECRET_DEPOT}.")
    return erreurs


# --------------------------------------------------------------------------
# Lecture et format des fichiers de réglages
# --------------------------------------------------------------------------

def _compact(valeur) -> str:
    """Une valeur sur une ligne, dans le style des fichiers écrits à la main."""
    if isinstance(valeur, dict) and valeur:
        return "{ " + ", ".join(f"{json.dumps(k, ensure_ascii=False)}: {_compact(v)}"
                                for k, v in valeur.items()) + " }"
    if isinstance(valeur, list):
        return "[" + ", ".join(_compact(v) for v in valeur) + "]"
    return json.dumps(valeur, ensure_ascii=False)


def formater(donnees: dict) -> str:
    """JSON lisible et stable : une clé de la racine par ligne, puis une famille,
    un projet ou un groupe de synonymes par ligne ; une correction d'entrée
    (objet de valeurs simples) tient sur sa ligne. Différences git courtes,
    lisibles sur GitHub."""
    if not donnees:
        return "{}\n"
    lignes = []
    for cle, valeur in donnees.items():
        if isinstance(valeur, dict) and any(isinstance(v, (dict, list)) for v in valeur.values()):
            dedans = [f"    {json.dumps(k, ensure_ascii=False)}: {_compact(v)}" for k, v in valeur.items()]
            texte = "{\n" + ",\n".join(dedans) + "\n  }"
        elif isinstance(valeur, list) and valeur and all(isinstance(v, (dict, list)) for v in valeur):
            texte = "[\n" + ",\n".join(f"    {_compact(v)}" for v in valeur) + "\n  ]"
        else:
            texte = _compact(valeur)
        lignes.append(f"  {json.dumps(cle, ensure_ascii=False)}: {texte}")
    return "{\n" + ",\n".join(lignes) + "\n}\n"


def vers_v2(brut: dict) -> dict:
    """Réglages v1 (« alias » et « noms » globaux) convertis en v2, sans les clés vides."""
    v2 = export.normalize_projects_config(brut)
    projets = {}
    for pid, reglage in v2["projets"].items():
        garde = {cle: valeur for cle, valeur in reglage.items() if valeur not in (None, [], "")}
        if garde:
            projets[pid] = garde
    resultat = {cle: valeur for cle, valeur in brut.items() if str(cle).startswith("_")}
    resultat.update(version=2, familles=v2["familles"], projets=projets,
                    tags_generiques=v2["tags_generiques"], tags_exclus=v2["tags_exclus"])
    return resultat


def normaliser(nom: str, donnees: dict) -> list[str]:
    """Ramène à la forme que l'admin écrit ce que l'export accepte aussi sous
    une autre forme, avec le sens que l'export lui donne : alias ou liste de
    tags écrits comme un texte seul (ou null), couleur entre guillemets,
    « masquer » qui ne vaut ni true ni false (« "false" » masque l'entrée).
    Modifie donnees ; renvoie les corrections faites, en français (vide si
    aucune). Ce qui reste invalide est laissé à valider()."""
    fichier, notes = FICHIERS[nom], []
    if nom == "projets":
        for cle in ("tags_generiques", "tags_exclus"):
            if cle in donnees and donnees[cle] is None:
                donnees[cle] = []
                notes.append(f"{fichier} : « {cle} » vaut null, lu comme une liste vide.")
            elif isinstance(donnees.get(cle), str):
                donnees[cle] = [donnees[cle]]
                notes.append(f"{fichier} : « {cle} » est un texte seul, lu comme une liste d'un tag.")
        familles = donnees.get("familles")
        for n, famille in enumerate(familles if isinstance(familles, list) else [], 1):
            couleur = famille.get("couleur") if isinstance(famille, dict) else None
            if isinstance(couleur, str) and couleur.strip().isdigit():
                famille["couleur"] = int(couleur)
                notes.append(f"{fichier}, famille n° {n} : couleur \"{couleur}\" entre guillemets, "
                              f"lue comme le nombre {famille['couleur']}.")
        projets = donnees.get("projets")
        for pid, reglage in projets.items() if isinstance(projets, dict) else []:
            if not isinstance(reglage, dict) or "alias" not in reglage:
                continue
            if reglage["alias"] is None:
                del reglage["alias"]
                notes.append(f"{fichier}, projet « {pid} » : alias null, retiré.")
            elif isinstance(reglage["alias"], str):
                reglage["alias"] = [reglage["alias"]]
                notes.append(f"{fichier}, projet « {pid} » : alias écrit comme un texte seul, lu comme une "
                             "liste d'un alias.")
    elif nom == "entrees":
        for cle, correction in donnees.items():
            if str(cle).startswith("_") or not isinstance(correction, dict) or "masquer" not in correction:
                continue
            valeur = correction["masquer"]
            if not isinstance(valeur, bool):
                correction["masquer"] = bool(valeur)  # l'export teste sa vérité
                etat = "masquée" if correction["masquer"] else "affichée"
                notes.append(f"{fichier}, entrée {cle} : « masquer » vaut {json.dumps(valeur, ensure_ascii=False)} "
                             f"(ni true ni false) ; pour l'export l'entrée est {etat}, la page l'écrit "
                             f"{json.dumps(correction['masquer'])}.")
    return notes


def lire_config(racine: Path, nom: str, notes: list | None = None) -> dict:
    """Réglages d'un des trois fichiers (valeur par défaut s'il n'existe pas),
    sous la forme que l'admin écrit : projets.json v1 est converti en v2,
    puis normaliser() s'applique. notes, si donnée, reçoit ces corrections."""
    chemin = racine / FICHIERS[nom]
    if not chemin.is_file():
        return copy.deepcopy(DEFAUTS[nom])
    try:
        donnees = json.loads(chemin.read_text(encoding="utf-8-sig"))
    except (OSError, ValueError) as err:
        raise ErreurAdmin(f"{FICHIERS[nom]} est illisible ({err}) : le corriger à la main.") from None
    if not isinstance(donnees, dict):
        raise ErreurAdmin(f"{FICHIERS[nom]} : un objet JSON est attendu ; le corriger à la main.")
    corrections = []
    if nom == "projets" and donnees.get("version") != 2:
        donnees = vers_v2(donnees)
        corrections.append(f"{FICHIERS[nom]} : réglages en version 1, lus et convertis en version 2.")
    corrections += normaliser(nom, donnees)
    if notes is not None:
        notes.extend(corrections)
    return donnees


def originaux(donnees) -> dict[str, dict[str, str]]:
    """Titre et résumé calculés (avant correction) de chaque entrée de data.json,
    par identifiant court : recalculés depuis le texte publié, qui est celui dont
    l'export les tire. L'admin les affiche, et « rétablir » y revient."""
    resultat = {}
    entrees = donnees.get("entrees") if isinstance(donnees, dict) else None
    for entree in entrees if isinstance(entrees, list) else []:
        if not isinstance(entree, dict) or not isinstance(entree.get("id"), str):
            continue
        tags = [str(t) for t in entree.get("tags") or []]
        titre, reste = export.split_title(str(entree.get("contenu") or ""), tags)
        resultat[entree["id"][:12]] = {"titre": titre, "resume": export.derive_summary(reste)}
    return resultat


def secrets_connus(racine: Path, environ: dict | None = None) -> tuple[str, ...]:
    """Valeurs réelles de la clé du dashboard et du jeton Cloudflare (variables
    d'environnement et .env) : refusées dans les réglages, masquées dans les
    comptes rendus, jamais envoyées au navigateur. environ : défaut os.environ."""
    environ = os.environ if environ is None else environ
    try:
        fichier = export.read_env_file(racine / ".env")
    except export.ExportError:
        fichier = {}
    noms = ("MEMOIRE_API_KEY", "MEMOIRE_CF_ACCESS_CLIENT_ID", "MEMOIRE_CF_ACCESS_CLIENT_SECRET")
    valeurs = {(source.get(nom) or "").strip() for source in (environ, fichier) for nom in noms}
    return tuple(sorted(v for v in valeurs if v))

```

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

Run: `python -m unittest tests.test_admin -v`
Expected: `Ran 37 tests` … `OK`.

- [ ] **Step 5: Toute la suite Python**

Run: `python -m unittest discover -s tests`
Expected: `Ran 126 tests` … `OK`.

- [ ] **Step 6: Commit**

```bash
git add scripts/admin.py tests/test_admin.py
git commit -m "Admin : validation des réglages, format des fichiers, lecture de la configuration

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: `scripts/admin.py` — serveur local : sécurité, fichiers, état, écriture des réglages

Le serveur de la spec § 5.1 : `127.0.0.1` seulement, premier port libre à partir de 8790, `docs/` à la racine et `admin/` sous `/admin/`, et rien d'autre ; contrôles `Host`, `Origin` et jeton ; `GET /api/etat` (réglages normalisés, empreintes, corrections de lecture, erreurs de validation) et `PUT /api/config/<nom>` (validation de la Task 2, empreinte de base exigée, écriture atomique qui n'écrase jamais une modification faite ailleurs, 409 « occupé » pendant un export : Choix 20). Délai de 30 s par connexion, onglet fermé sans trace Python (Choix 23). `POST` répond encore 404 : l'aperçu et la publication arrivent en Task 4. `main()` tire le jeton, affiche l'adresse et ouvre le navigateur.

**Files:**

- Modify: `scripts/admin.py` (docstring et imports ; ajout de `lire_donnees`, `empreinte`, `ecrire_config`, section git, section serveur, `main`)
- Test: `tests/test_admin.py` (imports ; `empreinte_de` ; classes `Client`, `ServeurTest`, `PortTest`)

**Interfaces:**

- Consumes: Task 1 (`export.replace_file`) ; Task 2 (`FICHIERS`, `valider`, `formater`, `lire_config`, `originaux`, `secrets_connus`, `ErreurAdmin`, `ROOT`).
- Produces:
  - `lire_donnees(racine) -> dict | None` ; `empreinte(racine, nom) -> str` (SHA-256 hexadécimal du fichier, `""` s'il n'existe pas) ; `ecrire_config(racine, nom, donnees) -> None` (atomique, par `export.replace_file`, `config/<nom>.json.tmp` effacé en cas d'échec, `OSError` propagée).
  - `git(racine, *args) -> CompletedProcess` ; `statut_git(racine, *chemins, non_suivis=False) -> list[(code XY, chemin)]` (lève `ErreurAdmin` si git échoue) ; `etat_git(racine) -> {"branche", "modifies", "commits_en_attente"} | None`.
  - `class Admin(racine, jeton, environnement=None, journal=None)` : attributs `racine`, `jeton`, `environnement` (variables ajoutées pour `export.py`), `journal(message)`, `verrou` (`threading.Lock`) ; méthode `secrets() -> tuple[str, ...]`.
  - `class ServeurAdmin(ThreadingHTTPServer)` (attribut `admin`) ; `creer_serveur(racine, jeton, port=8790, essais=20, environnement=None, journal=None) -> ServeurAdmin` (lève `ErreurAdmin` « aucun port libre entre … ») ; `class Gestionnaire(BaseHTTPRequestHandler)` (attribut `timeout = 30`).
  - Constantes `PORT_PAR_DEFAUT = 8790`, `ESSAIS_DE_PORT = 20`, `CORPS_MAX = 2_000_000`, `VIDANGE_MAX`, `CSP`, `TYPES`, `OCCUPE`.
  - HTTP : toute requête dont `Host`/`Origin` sont étrangers → 403 ; `/api/*` sans le bon `X-Admin-Jeton` → 403 `{"erreur": "Jeton absent ou refusé : …"}`. `GET /api/etat` → 200 `{"fichiers": {projets, entrees, recherche}, "empreintes": {nom: sha256 | ""}, "normalisations": {nom: [texte]}, "erreurs": {nom: [texte]}, "donnees": data.json | null, "originaux": {...}, "git": {...} | null}` (`normalisations` et `erreurs` ne gardent que les fichiers concernés). `PUT /api/config/<projets|entrees|recherche>` avec l'en-tête `X-Admin-Base: <empreinte lue>` → 200 `{"ok": true, "fichier": "config/….json", "empreinte": "<nouvelle>"}` | 422 `{"erreur": "Réglages refusés : rien n'a été enregistré.", "erreurs": [...]}` | 428 (sans `X-Admin-Base`) | 409 `{"erreur": OCCUPE}` | 409 `{"erreur": "config/….json a changé depuis l'ouverture de la page … "}` | 415 | 411 | 413 | 400 | 404 ; `PUT` hors de `/api/` → 405 ; `/admin` → 301 vers `/admin/`.
  - `main(argv=None) -> int` : `python scripts/admin.py [--port N] [--sans-navigateur]` affiche `Adresse : http://127.0.0.1:<port>/admin/#jeton=<jeton>` (ligne lue par le banc navigateur, Task 5).

- [ ] **Step 1: Écrire les tests qui échouent**

2 remplacements dans `tests/test_admin.py`, dans l'ordre (chaque texte à remplacer y est unique).

1. Remplacer :

```python
fichiers écrits, serveur (sécurité, API), aperçu et publication. Aucune donnée
réelle modifiée, aucun accès au réseau extérieur ni au vrai dépôt distant.
"""
import json
import tempfile
import unittest
from pathlib import Path

from tests.aides import RACINE, export, memoire
```

par :

```python
fichiers écrits, serveur (sécurité, API), aperçu et publication. Aucune donnée
réelle modifiée, aucun accès au réseau extérieur ni au vrai dépôt distant.
"""
import hashlib
import http.client
import json
import os
import socket
import tempfile
import threading
import time
import unittest
from pathlib import Path
from unittest import mock

from tests.aides import RACINE, export, memoire
```

2. Remplacer :

```python
                self.assertEqual(originaux[entree["id"][:12]], {"titre": entree["titre"], "resume": entree["resume"]})


if __name__ == "__main__":
    unittest.main()
```

par :

```python
                self.assertEqual(originaux[entree["id"][:12]], {"titre": entree["titre"], "resume": entree["resume"]})


JETON = "jeton-de-test-0123456789"
CLE_ENV = "cle-secrete-du-test"


def empreinte_de(chemin):
    """Empreinte d'un fichier telle que GET /api/etat la donne ("" s'il n'existe pas)."""
    return hashlib.sha256(chemin.read_bytes()).hexdigest() if chemin.is_file() else ""


class Client:
    """Requêtes HTTP brutes vers le serveur d'admin : en-têtes Host, Origin et
    jeton choisis par le test (urllib les imposerait)."""

    def __init__(self, port):
        self.port = port

    def __call__(self, methode, chemin, corps=None, jeton=JETON, hote=None, type_="application/json", entetes=None,
                 base=None):
        tout = {"Host": hote or f"127.0.0.1:{self.port}"}
        if jeton is not None:
            tout["X-Admin-Jeton"] = jeton
        if base is not None:
            tout["X-Admin-Base"] = base  # empreinte du fichier sur lequel la modification a été faite
        donnees = None
        if corps is not None:
            donnees = corps if isinstance(corps, bytes) else json.dumps(corps).encode("utf-8")
            tout["Content-Type"] = type_
        tout.update(entetes or {})
        connexion = http.client.HTTPConnection("127.0.0.1", self.port, timeout=60)
        try:
            connexion.request(methode, chemin, body=donnees, headers=tout)
            reponse = connexion.getresponse()
            brut = reponse.read()
            return reponse.status, {k.lower(): v for k, v in reponse.getheaders()}, brut
        finally:
            connexion.close()

    def json(self, *args, **kwargs):
        statut, _, brut = self(*args, **kwargs)
        return statut, json.loads(brut.decode("utf-8"))


def demarrer(racine, **options):
    serveur = admin.creer_serveur(racine, JETON, port=0, journal=lambda message: None, **options)
    threading.Thread(target=serveur.serve_forever, daemon=True).start()
    return serveur


class ServeurTest(unittest.TestCase):
    """Serveur réel sur un port libre, dans un dossier temporaire (hors de tout dépôt git)."""

    @classmethod
    def setUpClass(cls):
        cls.dossier = tempfile.TemporaryDirectory()
        cls.racine = Path(cls.dossier.name)
        for sous in ("docs", "admin", "config"):
            (cls.racine / sous).mkdir()
        (cls.racine / "docs" / "index.html").write_text("<!DOCTYPE html><title>site</title>", encoding="utf-8")
        (cls.racine / "admin" / "index.html").write_text("<!DOCTYPE html><title>admin</title>", encoding="utf-8")
        brutes = [memoire(1, "Jarvis — architecture : pipeline vocal local. Trois étages.", ["jarvis"])]
        payload, _ = export.build_payload(brutes, export.normalize_projects_config({}))
        (cls.racine / "docs" / "data.json").write_text(json.dumps(payload), encoding="utf-8")
        (cls.racine / ".env").write_text(f"MEMOIRE_API_KEY={CLE_ENV}\n", encoding="utf-8")
        cls.serveur = demarrer(cls.racine)
        cls.client = Client(cls.serveur.server_address[1])

    @classmethod
    def tearDownClass(cls):
        cls.serveur.shutdown()
        cls.serveur.server_close()
        cls.dossier.cleanup()

    def setUp(self):
        self.projets = self.racine / "config" / "projets.json"
        self.projets.write_text(admin.formater(projets()), encoding="utf-8")
        self.avant = self.projets.read_bytes()

    def test_jeton_absent_ou_faux_refuse(self):
        for jeton in (None, "", "faux", JETON + "x"):
            with self.subTest(jeton=jeton):
                statut, corps = self.client.json("GET", "/api/etat", jeton=jeton)
                self.assertEqual(statut, 403)
                self.assertIn("Jeton absent ou refusé", corps["erreur"])
        statut, _ = self.client.json("PUT", "/api/config/projets", projets(), jeton=None)
        self.assertEqual(statut, 403)
        self.assertEqual(self.projets.read_bytes(), self.avant)

    def test_host_etranger_refuse(self):
        port = self.serveur.server_address[1]
        for hote in ("evil.example", f"evil.example:{port}", "127.0.0.1:1", f"127.0.0.1.evil.example:{port}"):
            with self.subTest(hote=hote):
                self.assertEqual(self.client("GET", "/api/etat", hote=hote)[0], 403)
                self.assertEqual(self.client("GET", "/", hote=hote)[0], 403)
        self.assertEqual(self.client("GET", "/api/etat", hote=f"localhost:{port}")[0], 200)

    def test_origin_different_refuse(self):
        port = self.serveur.server_address[1]
        for origine in ("http://evil.example", f"http://localhost:{port}", "null", f"https://127.0.0.1:{port}"):
            with self.subTest(origine=origine):
                statut, _ = self.client.json("PUT", "/api/config/projets", projets(), entetes={"Origin": origine})
                self.assertEqual(statut, 403)
        self.assertEqual(self.projets.read_bytes(), self.avant)
        statut, _ = self.client.json("PUT", "/api/config/projets", projets(),
                                     entetes={"Origin": f"http://127.0.0.1:{port}"}, base=empreinte_de(self.projets))
        self.assertEqual(statut, 200)

    def test_ecriture_json_seulement(self):
        for type_ in ("text/plain", "application/x-www-form-urlencoded", "multipart/form-data; boundary=x", ""):
            with self.subTest(type_=type_):
                statut, corps = self.client.json("PUT", "/api/config/projets", b"{}", type_=type_)
                self.assertEqual(statut, 415)
                self.assertIn("que du JSON", corps["erreur"])
        self.assertEqual(self.projets.read_bytes(), self.avant)
        statut, _ = self.client.json("PUT", "/api/config/projets", b"{ pas du json", type_="application/json")
        self.assertEqual(statut, 400)

    def test_fichier_hors_liste(self):
        for chemin in ("/api/config/autre", "/api/config/../../.env", "/api/config/projets.json", "/api/config/"):
            with self.subTest(chemin=chemin):
                self.assertEqual(self.client("PUT", chemin, {"a": 1})[0], 404)
        self.assertEqual(self.client("GET", "/api/config/projets")[0], 404)
        self.assertEqual(self.client("POST", "/api/inconnu", {})[0], 404)
        self.assertFalse((self.racine / "config" / "autre").exists())

    def test_ecriture_atomique(self):
        nouveau = projets(projets={"depths": {"nom": "Depths II", "famille": "jeux"}})
        statut, corps = self.client.json("PUT", "/api/config/projets", nouveau, base=empreinte_de(self.projets))
        self.assertEqual((statut, corps), (200, {"ok": True, "fichier": "config/projets.json",
                                                 "empreinte": empreinte_de(self.projets)}))
        self.assertEqual(self.projets.read_text(encoding="utf-8"), admin.formater(nouveau))
        self.assertNotIn(b"\r\n", self.projets.read_bytes())
        avant = self.projets.read_bytes()
        with mock.patch.object(admin.os, "replace", side_effect=OSError("disque plein")):
            statut, corps = self.client.json("PUT", "/api/config/projets", projets(), base=empreinte_de(self.projets))
        self.assertEqual(statut, 500)
        self.assertIn("rien n'a été modifié", corps["erreur"])
        self.assertEqual(self.projets.read_bytes(), avant, "l'ancien fichier reste intact")
        self.assertEqual(sorted(p.name for p in (self.racine / "config").iterdir()), ["projets.json"],
                         "aucun fichier temporaire laissé")

    def test_remplacement_reessaye_si_windows_le_refuse_un_instant(self):
        vrai, essais = os.replace, []

        def replace(*args):
            essais.append(args)
            if len(essais) <= 2:
                raise PermissionError(13, "fichier lu par un autre programme")
            return vrai(*args)

        with mock.patch.object(admin.os, "replace", side_effect=replace):
            statut, corps = self.client.json("PUT", "/api/config/projets", un_projet(nom="Depths II"),
                                             base=empreinte_de(self.projets))
        self.assertEqual((statut, len(essais)), (200, 3), corps)
        self.assertEqual(json.loads(self.projets.read_text(encoding="utf-8"))["projets"], {"depths": {"nom": "Depths II"}})

    def test_fichier_modifie_ailleurs_jamais_ecrase(self):
        base = empreinte_de(self.projets)
        with open(self.projets, "a", encoding="utf-8") as fichier:
            fichier.write("\n")  # modifié à la main, ou dans un autre onglet, depuis l'ouverture de la page
        modifie = self.projets.read_bytes()
        statut, corps = self.client.json("PUT", "/api/config/projets", un_projet(nom="Depths II"), base=base)
        self.assertEqual(statut, 409)
        self.assertEqual(corps["erreur"], "config/projets.json a changé depuis l'ouverture de la page (modifié à la "
                                          "main ou dans un autre onglet) : rien n'a été enregistré. Recharger la page "
                                          "pour repartir du fichier actuel (les modifications non enregistrées de la "
                                          "page seront perdues).")
        self.assertEqual(self.projets.read_bytes(), modifie, "rien n'est écrasé")
        statut, corps = self.client.json("PUT", "/api/config/projets", un_projet(nom="Depths II"),
                                         base=empreinte_de(self.projets))
        self.assertEqual(statut, 200)
        self.assertEqual(corps["empreinte"], empreinte_de(self.projets))
        statut, corps = self.client.json("PUT", "/api/config/projets", un_projet(nom="Depths III"))
        self.assertEqual(statut, 428)
        self.assertIn("X-Admin-Base", corps["erreur"])
        entrees = self.racine / "config" / "entrees.json"
        try:
            statut, _ = self.client.json("PUT", "/api/config/entrees", {"a713bd8e2800": {"masquer": True}}, base="")
            self.assertEqual(statut, 200, "fichier absent : empreinte vide")
        finally:
            entrees.unlink(missing_ok=True)

    def test_validation_refusee_rien_ecrit(self):
        statut, corps = self.client.json("PUT", "/api/config/projets",
                                         projets(familles=[{"id": "jeux", "nom": "Jeux", "couleur": "3"}], projets={}))
        self.assertEqual(statut, 422)
        self.assertEqual(corps["erreur"], "Réglages refusés : rien n'a été enregistré.")
        self.assertEqual(corps["erreurs"], ["Famille « jeux » : la couleur doit être un nombre entier de 1 à 6."])
        self.assertEqual(self.projets.read_bytes(), self.avant)

    def test_secret_refuse_et_cle_jamais_renvoyee(self):
        statut, corps = self.client.json("PUT", "/api/config/entrees",
                                         {"a713bd8e2800": {"titre": f"La clé {CLE_ENV} du dashboard"}})
        self.assertEqual(statut, 422)
        self.assertIn("ressemble à un secret", corps["erreurs"][0])
        self.assertFalse((self.racine / "config" / "entrees.json").exists())
        statut, _, brut = self.client("GET", "/api/etat")
        self.assertEqual(statut, 200)
        self.assertNotIn(CLE_ENV.encode(), brut)
        self.assertEqual(self.client("GET", "/.env")[0], 404)

    def test_etat(self):
        statut, corps = self.client.json("GET", "/api/etat")
        self.assertEqual(statut, 200)
        self.assertEqual(corps["fichiers"]["projets"], projets())
        self.assertEqual(corps["fichiers"]["entrees"], {})
        self.assertEqual(corps["fichiers"]["recherche"], {"synonymes": []})
        self.assertEqual(corps["donnees"]["nb_entrees"], 1)
        self.assertEqual(corps["originaux"], {"000000000001": {"titre": "Jarvis — architecture",
                                                              "resume": "Pipeline vocal local. Trois étages."}})
        self.assertIsNone(corps["git"], "dossier temporaire hors de tout dépôt git")
        self.assertEqual(corps["empreintes"], {"projets": empreinte_de(self.projets), "entrees": "", "recherche": ""})
        self.assertEqual((corps["normalisations"], corps["erreurs"]), ({}, {}))

    def test_etat_signale_formes_tolerees_et_reglages_invalides(self):
        entrees = self.racine / "config" / "entrees.json"
        entrees.write_text(json.dumps({"000000000001": {"masquer": "false"}}), encoding="utf-8")
        self.projets.write_text(json.dumps(un_projet(description="clé sk-ant-" + "x" * 30)), encoding="utf-8")
        try:
            statut, corps = self.client.json("GET", "/api/etat")
        finally:
            entrees.unlink()
        self.assertEqual(statut, 200)
        self.assertEqual(corps["fichiers"]["entrees"], {"000000000001": {"masquer": True}})
        self.assertEqual(corps["normalisations"], {"entrees": [
            'config/entrees.json, entrée 000000000001 : « masquer » vaut "false" (ni true ni false) ; '
            "pour l'export l'entrée est masquée, la page l'écrit true."]})
        self.assertEqual(corps["erreurs"], {"projets": [
            "Projet « depths », description : ressemble à un secret (clé, jeton ou mot de passe) ; "
            "ce texte serait publié sur le site."]})

    def test_fichiers_statiques_et_entetes(self):
        statut, entetes, brut = self.client("GET", "/")
        self.assertEqual((statut, brut), (200, b"<!DOCTYPE html><title>site</title>"))
        self.assertTrue(entetes["content-type"].startswith("text/html"))
        self.assertIn("frame-ancestors 'none'", entetes["content-security-policy"])
        self.assertEqual(entetes["x-frame-options"], "DENY")
        self.assertEqual(entetes["cache-control"], "no-store")
        self.assertEqual(self.client("GET", "/admin/")[2], b"<!DOCTYPE html><title>admin</title>")
        statut, entetes, _ = self.client("GET", "/admin")
        self.assertEqual((statut, entetes["location"]), (301, "/admin/"))
        statut, entetes, _ = self.client("GET", "/data.json")
        self.assertEqual(statut, 200)
        self.assertTrue(entetes["content-type"].startswith("application/json"))
        for chemin in ("/.env", "/../.env", "/%2e%2e/.env", "/admin/..%2f..%2f.env", "/admin/../config/projets.json",
                       "/..\\.env", "/%00", "/absent.js", "/config/projets.json", "//evil/api/etat",
                       "/C:/Windows/win.ini"):
            with self.subTest(chemin=chemin):
                self.assertEqual(self.client("GET", chemin)[0], 404)
        self.assertEqual(self.client("PUT", "/", {"a": 1})[0], 405)

    def test_corps_trop_volumineux_ou_sans_longueur(self):
        statut, _ = self.client.json("PUT", "/api/config/projets", b" " * (admin.CORPS_MAX + 1))
        self.assertEqual(statut, 413)
        # Sans Content-Length (corps envoyé par morceaux), le corps serait lu vide.
        connexion = http.client.HTTPConnection("127.0.0.1", self.serveur.server_address[1], timeout=30)
        try:
            connexion.putrequest("PUT", "/api/config/entrees", skip_host=True)
            for cle, valeur in {"Host": f"127.0.0.1:{self.serveur.server_address[1]}", "X-Admin-Jeton": JETON,
                                "Content-Type": "application/json"}.items():
                connexion.putheader(cle, valeur)
            connexion.endheaders()
            self.assertEqual(connexion.getresponse().status, 411)
        finally:
            connexion.close()
        self.assertFalse((self.racine / "config" / "entrees.json").exists())

    def test_occupe_pendant_un_export(self):
        self.assertTrue(self.serveur.admin.verrou.acquire(blocking=False))
        try:
            statut, corps = self.client.json("PUT", "/api/config/projets", projets(), base=empreinte_de(self.projets))
        finally:
            self.serveur.admin.verrou.release()
        self.assertEqual(statut, 409)
        self.assertIn("Occupé", corps["erreur"])

    def test_connexion_muette_fermee_au_bout_du_delai(self):
        port = self.serveur.server_address[1]
        with mock.patch.object(admin.Gestionnaire, "timeout", 0.5), \
                socket.create_connection(("127.0.0.1", port), timeout=10) as brut:
            brut.sendall(f"GET / HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\n".encode())  # en-têtes jamais finis
            debut = time.monotonic()
            try:
                recu = brut.recv(100)
            except ConnectionResetError:
                recu = b""
            duree = time.monotonic() - debut
        self.assertEqual(recu, b"", "connexion fermée, sans réponse")
        self.assertLess(duree, 5)


class PortTest(unittest.TestCase):
    def test_port_suivant_si_occupe(self):
        with tempfile.TemporaryDirectory() as dossier, socket.socket() as occupe:
            occupe.bind(("127.0.0.1", 0))
            occupe.listen()
            port = occupe.getsockname()[1]
            serveur = admin.creer_serveur(Path(dossier), JETON, port=port, essais=5)
            try:
                self.assertEqual(serveur.server_address[0], "127.0.0.1")
                self.assertGreater(serveur.server_address[1], port)
            finally:
                serveur.server_close()

    def test_aucun_port_libre(self):
        with tempfile.TemporaryDirectory() as dossier, socket.socket() as occupe:
            occupe.bind(("127.0.0.1", 0))
            occupe.listen()
            port = occupe.getsockname()[1]
            with self.assertRaises(admin.ErreurAdmin) as contexte:
                admin.creer_serveur(Path(dossier), JETON, port=port, essais=1)
        self.assertIn(f"aucun port libre entre {port} et {port}", str(contexte.exception))


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `python -m unittest tests.test_admin -v`
Expected: FAIL — `ERROR: setUpClass (tests.test_admin.ServeurTest)`, `ERROR: test_aucun_port_libre`, `ERROR: test_port_suivant_si_occupe`, tous avec `AttributeError: module 'admin' has no attribute 'creer_serveur'` (`Ran 39 tests`, `FAILED (errors=3)`).

- [ ] **Step 3: Écrire le serveur dans `scripts/admin.py`**

3 remplacements dans `scripts/admin.py`, dans l'ordre (chaque texte à remplacer y est unique).

1. Remplacer :

```python
#!/usr/bin/env python3
"""
Page d'admin locale de Mémoire Vive : réglages des projets, des familles, des
entrées et de la recherche. Validation des réglages avant écriture (l'admin
n'écrit que ce que l'export comprend, sans secret dans ce qui sera publié),
mise en forme des fichiers, lecture de la configuration.

Aucune dépendance : bibliothèque standard Python 3.9+, et les fonctions de
scripts/export.py (masquage des secrets, liens, titres).
```

par :

```python
#!/usr/bin/env python3
"""
Page d'admin locale de Mémoire Vive : régler les projets, les familles, les
entrées et la recherche sans éditer de fichier à la main.

Usage :
    python scripts/admin.py                    # ouvre le navigateur sur la page d'admin
    python scripts/admin.py --port 8800        # premier port essayé (défaut 8790, puis les suivants)
    python scripts/admin.py --sans-navigateur  # n'ouvre pas le navigateur (l'adresse est affichée)

Le serveur n'écoute que 127.0.0.1. Il sert docs/ à la racine (aperçu fidèle du
site) et admin/ sous /admin/ ; admin/ est hors de docs/, donc jamais publié.
Chaque appel /api/* exige le jeton tiré au lancement (en-tête X-Admin-Jeton) ;
les seuls fichiers modifiables sont les trois réglages de config/.

Aucune dépendance : bibliothèque standard Python 3.9+, et les fonctions de
scripts/export.py (masquage des secrets, liens, titres).
```

2. Remplacer :

```python
from __future__ import annotations

import copy
import json
import os
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import export  # noqa: E402  (même dossier : masquage des secrets, liens, titres)
```

par :

```python
from __future__ import annotations

import argparse
import copy
import hashlib
import hmac
import json
import os
import re
import secrets
import subprocess
import sys
import threading
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote

sys.path.insert(0, str(Path(__file__).resolve().parent))
import export  # noqa: E402  (même dossier : masquage des secrets, liens, titres)
```

3. Remplacer :

```python
    valeurs = {(source.get(nom) or "").strip() for source in (environ, fichier) for nom in noms}
    return tuple(sorted(v for v in valeurs if v))

```

par :

```python
    valeurs = {(source.get(nom) or "").strip() for source in (environ, fichier) for nom in noms}
    return tuple(sorted(v for v in valeurs if v))


def lire_donnees(racine: Path) -> dict | None:
    """docs/data.json tel que le site le lit ; None s'il manque ou s'il est illisible."""
    try:
        donnees = json.loads((racine / "docs" / "data.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    return donnees if isinstance(donnees, dict) else None


def empreinte(racine: Path, nom: str) -> str:
    """SHA-256 du fichier de réglages tel qu'il est sur le disque ("" s'il
    n'existe pas) : la page la renvoie avec chaque enregistrement, et le
    serveur refuse d'écraser un fichier modifié ailleurs entre-temps."""
    try:
        return hashlib.sha256((racine / FICHIERS[nom]).read_bytes()).hexdigest()
    except OSError:
        return ""


def ecrire_config(racine: Path, nom: str, donnees: dict) -> None:
    """Écriture atomique : le texte complet part dans un fichier temporaire, qui
    remplace ensuite l'ancien (remplacement réessayé si Windows le refuse un
    instant, voir export.replace_file) ; en cas d'échec, l'ancien reste intact
    et le temporaire (*.json.tmp, ignoré par git) est effacé."""
    chemin = racine / FICHIERS[nom]
    texte = formater(donnees)
    chemin.parent.mkdir(parents=True, exist_ok=True)
    temporaire = chemin.with_name(chemin.name + ".tmp")
    try:
        with open(temporaire, "w", encoding="utf-8", newline="\n") as fichier:
            fichier.write(texte)
            fichier.flush()
            os.fsync(fichier.fileno())
        export.replace_file(temporaire, chemin)
    except BaseException:
        temporaire.unlink(missing_ok=True)
        raise


# --------------------------------------------------------------------------
# Git : état affiché par la page (lecture seule)
# --------------------------------------------------------------------------

def git(racine: Path, *args: str) -> subprocess.CompletedProcess:
    return subprocess.run(["git", *args], cwd=racine, text=True, encoding="utf-8", errors="replace",
                          stdout=subprocess.PIPE, stderr=subprocess.PIPE)


def statut_git(racine: Path, *chemins: str, non_suivis: bool = False) -> list[tuple[str, str]]:
    """(code XY, chemin) de « git status » ; -z : accents et espaces non échappés.
    Lève ErreurAdmin si git échoue : une sortie vide n'est pas un arbre propre."""
    args = ["status", "--porcelain=v1", "-z", "--untracked-files=" + ("all" if non_suivis else "no")]
    if chemins:
        args += ["--", *chemins]
    resultat = git(racine, *args)
    if resultat.returncode != 0:
        raise ErreurAdmin(f"git status a échoué : {resultat.stderr.strip() or 'code ' + str(resultat.returncode)}")
    morceaux = resultat.stdout.split("\0")
    resultat, i = [], 0
    while i < len(morceaux):
        morceau = morceaux[i]
        i += 1
        if len(morceau) < 4:
            continue
        if "R" in morceau[:2] or "C" in morceau[:2]:
            i += 1  # renommage : le chemin d'origine suit, il n'est pas retenu
        resultat.append((morceau[:2], morceau[3:]))
    return resultat


def etat_git(racine: Path) -> dict | None:
    """Branche, fichiers suivis modifiés et pas encore commités, commits pas
    encore poussés ; None hors d'un dépôt git (ou sans git)."""
    try:
        branche = git(racine, "rev-parse", "--abbrev-ref", "HEAD")
    except OSError:
        return None
    if branche.returncode != 0:
        return None
    avance = git(racine, "rev-list", "--count", "@{u}..HEAD")
    try:
        modifies = [chemin for _, chemin in statut_git(racine)]
    except ErreurAdmin:
        modifies = []  # git en panne : rien d'affiché ici ; la publication, elle, le signale
    return {
        "branche": branche.stdout.strip(),
        "modifies": modifies,
        "commits_en_attente": int(avance.stdout.strip()) if avance.returncode == 0 else None,
    }


# --------------------------------------------------------------------------
# Serveur local
# --------------------------------------------------------------------------

PORT_PAR_DEFAUT = 8790
ESSAIS_DE_PORT = 20
CORPS_MAX = 2_000_000
VIDANGE_MAX = 16_000_000  # corps lu (et jeté) avant un refus ; au-delà, la connexion est coupée
# Même politique que le site, plus l'interdiction d'être affichée dans le cadre d'une autre page.
CSP = ("default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; "
       "manifest-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'")
TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
}
OCCUPE = "Occupé : un aperçu ou une publication est en cours. Réessayer quand il sera terminé."


class Admin:
    """État partagé par les requêtes : dépôt servi, jeton, verrou."""

    def __init__(self, racine: Path, jeton: str, environnement: dict | None = None, journal=None):
        self.racine = Path(racine)
        self.jeton = jeton
        # Variables ajoutées à l'environnement d'export.py (tests : faux dashboard).
        self.environnement = dict(environnement or {})
        # Messages de la fenêtre de commande (les tests les font taire).
        self.journal = journal or (lambda message: print(message, flush=True))
        # Un seul export (aperçu ou publication) à la fois, et aucune écriture de
        # réglages pendant qu'un export les lit.
        self.verrou = threading.Lock()

    def secrets(self) -> tuple[str, ...]:
        """Valeurs réelles des secrets, vues comme l'export les verra."""
        return secrets_connus(self.racine, {**os.environ, **self.environnement})


class ServeurAdmin(ThreadingHTTPServer):
    daemon_threads = True
    # Sous Windows, SO_REUSEADDR laisse deux serveurs écouter le même port :
    # un port déjà pris ne serait pas détecté.
    allow_reuse_address = os.name != "nt"

    def __init__(self, adresse: tuple[str, int], admin: Admin):
        self.admin = admin
        super().__init__(adresse, Gestionnaire)


def creer_serveur(racine: Path, jeton: str, port: int = PORT_PAR_DEFAUT, essais: int = ESSAIS_DE_PORT,
                  environnement: dict | None = None, journal=None) -> ServeurAdmin:
    """Serveur sur 127.0.0.1 uniquement, au premier port libre à partir de port
    (0 : port choisi par le système)."""
    admin = Admin(racine, jeton, environnement, journal)
    probleme = None
    for candidat in [0] if port == 0 else range(port, port + essais):
        try:
            return ServeurAdmin(("127.0.0.1", candidat), admin)
        except OSError as err:
            probleme = err
    raise ErreurAdmin(f"aucun port libre entre {port} et {port + essais - 1} ({probleme}).")


class Gestionnaire(BaseHTTPRequestHandler):
    server_version = "MemoireViveAdmin"
    sys_version = ""
    # Délai de chaque lecture ou écriture sur la connexion (l'export, lui, ne
    # l'utilise pas : une publication de dix minutes n'est pas coupée). Une
    # connexion muette, ou un corps annoncé jamais envoyé, ne bloque pas un fil.
    timeout = 30

    def handle(self) -> None:
        try:
            super().handle()
        except (ConnectionError, TimeoutError):
            # Onglet fermé ou rechargé avant la réponse, client muet : rien à
            # répondre. Une ligne en français plutôt qu'une trace Python.
            self.close_connection = True
            self.admin.journal("  Connexion interrompue (onglet fermé ou rechargé ?) : réponse non remise.")

    def log_message(self, format, *args):
        pass  # la console annonce les opérations, pas chaque fichier servi

    @property
    def admin(self) -> Admin:
        return self.server.admin

    @property
    def chemin(self) -> str:
        return self.path.split("?", 1)[0].split("#", 1)[0]

    # ------------------------------------------------------------ réponses

    def vider(self) -> None:
        """Lit le corps que la requête n'a pas consommé (refus avant lecture) :
        sous Windows, fermer la connexion avec des données non lues la coupe
        (RST) avant que le client ait lu la réponse."""
        if getattr(self, "corps_lu", False):
            return
        self.corps_lu = True
        try:
            reste = min(int(self.headers.get("Content-Length") or 0), VIDANGE_MAX)
        except ValueError:
            return
        while reste > 0:
            morceau = self.rfile.read(min(reste, 65536))
            if not morceau:
                break
            reste -= len(morceau)

    def envoyer(self, code: int, corps: bytes, type_: str, entetes: dict | None = None) -> None:
        self.vider()
        self.send_response(code)
        self.send_header("Content-Type", type_)
        self.send_header("Content-Length", str(len(corps)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Security-Policy", CSP)
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Referrer-Policy", "no-referrer")
        for cle, valeur in (entetes or {}).items():
            self.send_header(cle, valeur)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(corps)

    def json(self, code: int, donnees) -> None:
        self.envoyer(code, json.dumps(donnees, ensure_ascii=False).encode("utf-8"), TYPES[".json"])

    def refus(self, code: int, message: str) -> None:
        if self.chemin.startswith("/api/"):
            self.json(code, {"erreur": message})
        else:
            self.envoyer(code, message.encode("utf-8"), "text/plain; charset=utf-8")

    # ------------------------------------------------------------ contrôles

    def origine_permise(self) -> bool:
        """Host : 127.0.0.1:<port> ou localhost:<port> seulement (parade au
        « rebinding » DNS) ; Origin, s'il est présent : exactement la même adresse."""
        port = self.server.server_address[1]
        hote = (self.headers.get("Host") or "").lower()
        if hote not in (f"127.0.0.1:{port}", f"localhost:{port}"):
            return False
        origine = self.headers.get("Origin")
        return origine is None or origine.lower() == f"http://{hote}"

    def jeton_valide(self) -> bool:
        fourni = self.headers.get("X-Admin-Jeton") or ""
        return hmac.compare_digest(fourni.encode("utf-8"), self.admin.jeton.encode("utf-8"))

    def controler(self) -> bool:
        if not self.origine_permise():
            self.refus(403, "Adresse refusée : ouvrir la page d'admin par l'adresse affichée dans sa fenêtre.")
            return False
        if self.chemin.startswith("/api/") and not self.jeton_valide():
            self.refus(403, "Jeton absent ou refusé : relancer « Gérer Mémoire Vive » et utiliser la page "
                            "qu'il ouvre.")
            return False
        return True

    def lire_corps(self) -> tuple[bool, object]:
        """(True, corps JSON) ; (False, None) après avoir répondu 415, 411, 413 ou 400.
        Seul application/json est accepté : un formulaire d'un autre site ne
        peut pas en envoyer sans l'accord du serveur (pré-vérification CORS)."""
        type_ = (self.headers.get("Content-Type") or "").split(";")[0].strip().lower()
        if type_ != "application/json":
            self.refus(415, "Les écritures n'acceptent que du JSON (Content-Type: application/json).")
            return False, None
        if self.headers.get("Content-Length") is None:
            self.refus(411, "Longueur du corps requise (Content-Length).")
            return False, None
        try:
            longueur = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            longueur = -1
        if not 0 <= longueur <= CORPS_MAX:
            self.refus(413, "Requête trop volumineuse.")
            return False, None
        brut = self.rfile.read(longueur)
        self.corps_lu = True
        try:
            return True, json.loads(brut.decode("utf-8")) if brut.strip() else {}
        except (UnicodeDecodeError, ValueError):
            self.refus(400, "JSON illisible.")
            return False, None

    # ------------------------------------------------------------ méthodes

    def do_GET(self) -> None:
        if not self.controler():
            return
        if self.chemin == "/api/etat":
            self.api_etat()
        elif self.chemin.startswith("/api/"):
            self.refus(404, "Adresse inconnue.")
        else:
            self.fichier()

    do_HEAD = do_GET

    def do_PUT(self) -> None:
        if not self.controler():
            return
        if not self.chemin.startswith("/api/"):
            self.refus(405, "Méthode non permise.")
            return
        prefixe = "/api/config/"
        nom = self.chemin[len(prefixe):] if self.chemin.startswith(prefixe) else ""
        if nom not in FICHIERS:
            self.refus(404, "Fichier de réglages inconnu : seuls projets, entrees et recherche se modifient.")
            return
        lu, corps = self.lire_corps()
        if lu:
            self.api_ecrire(nom, corps)

    def do_POST(self) -> None:
        if not self.controler():
            return
        if not self.chemin.startswith("/api/"):
            self.refus(405, "Méthode non permise.")
            return
        self.refus(404, "Adresse inconnue.")

    # ------------------------------------------------------------ API

    def api_etat(self) -> None:
        racine, connus = self.admin.racine, self.admin.secrets()
        # Empreintes avant la lecture : un fichier modifié entre les deux donne
        # au pire un refus d'enregistrer (409), jamais une modification écrasée.
        empreintes = {nom: empreinte(racine, nom) for nom in FICHIERS}
        fichiers, normalisations = {}, {}
        try:
            for nom in FICHIERS:
                notes: list[str] = []
                fichiers[nom] = lire_config(racine, nom, notes)
                if notes:
                    normalisations[nom] = notes
        except ErreurAdmin as err:
            self.json(500, {"erreur": str(err)})
            return
        # Réglages enregistrés invalides (modifiés à la main) : la page les liste.
        erreurs = {nom: liste for nom in FICHIERS if (liste := valider(nom, fichiers[nom], connus))}
        donnees = lire_donnees(racine)
        self.json(200, {"fichiers": fichiers, "empreintes": empreintes, "normalisations": normalisations,
                        "erreurs": erreurs, "donnees": donnees, "originaux": originaux(donnees),
                        "git": etat_git(racine)})

    def api_ecrire(self, nom: str, donnees) -> None:
        erreurs = valider(nom, donnees, self.admin.secrets())
        if erreurs:
            self.json(422, {"erreur": "Réglages refusés : rien n'a été enregistré.", "erreurs": erreurs})
            return
        base = self.headers.get("X-Admin-Base")
        if base is None:
            self.json(428, {"erreur": "Empreinte du fichier absente (en-tête X-Admin-Base) : recharger la page."})
            return
        if not self.admin.verrou.acquire(blocking=False):
            self.json(409, {"erreur": OCCUPE})
            return
        try:
            if empreinte(self.admin.racine, nom) != base.strip():
                self.json(409, {"erreur": f"{FICHIERS[nom]} a changé depuis l'ouverture de la page (modifié à la "
                                          "main ou dans un autre onglet) : rien n'a été enregistré. Recharger la "
                                          "page pour repartir du fichier actuel (les modifications non "
                                          "enregistrées de la page seront perdues)."})
                return
            ecrire_config(self.admin.racine, nom, donnees)
            nouvelle = empreinte(self.admin.racine, nom)
        except OSError as err:
            self.json(500, {"erreur": f"Écriture impossible de {FICHIERS[nom]} ({err}) : rien n'a été modifié."})
            return
        finally:
            self.admin.verrou.release()
        self.admin.journal(f"  Réglages enregistrés : {FICHIERS[nom]}")
        self.json(200, {"ok": True, "fichier": FICHIERS[nom], "empreinte": nouvelle})

    # ------------------------------------------------------------ fichiers

    def fichier(self) -> None:
        """docs/ à la racine, admin/ sous /admin/ ; rien d'autre (ni .env, ni
        scripts/, ni config/), aucun fichier caché, types connus seulement."""
        chemin = unquote(self.chemin)
        if chemin == "/admin":
            self.envoyer(301, b"", "text/plain; charset=utf-8", {"Location": "/admin/"})
            return
        if chemin.startswith("/admin/"):
            base, relatif = self.admin.racine / "admin", chemin[len("/admin/"):]
        else:
            base, relatif = self.admin.racine / "docs", chemin[1:]
        if relatif == "" or relatif.endswith("/"):
            relatif += "index.html"
        try:
            base = base.resolve()
            cible = (base / relatif).resolve()
            permis = (cible.is_relative_to(base) and cible.suffix.lower() in TYPES and cible.is_file()
                      and not any(partie.startswith(".") for partie in cible.relative_to(base).parts))
        except (OSError, ValueError):
            permis = False
        if not permis:
            self.refus(404, "Introuvable.")
            return
        self.envoyer(200, cible.read_bytes(), TYPES[cible.suffix.lower()])


def main(argv: list[str] | None = None) -> int:
    for flux in (sys.stdout, sys.stderr):
        if hasattr(flux, "reconfigure"):
            flux.reconfigure(encoding="utf-8", errors="replace")
    parser = argparse.ArgumentParser(description="Page d'admin locale de Mémoire Vive (réglages du site).")
    parser.add_argument("--port", type=int, default=PORT_PAR_DEFAUT,
                        help=f"premier port essayé (défaut {PORT_PAR_DEFAUT}, puis les suivants ; "
                             "0 : port choisi par le système)")
    parser.add_argument("--sans-navigateur", action="store_true", help="n'ouvre pas le navigateur")
    args = parser.parse_args(argv)

    jeton = secrets.token_urlsafe(32)
    try:
        serveur = creer_serveur(ROOT, jeton, args.port)
    except ErreurAdmin as err:
        print(f"Échec : {err}", file=sys.stderr)
        return 1
    port = serveur.server_address[1]
    adresse = f"http://127.0.0.1:{port}/admin/#jeton={jeton}"
    print("Page d'admin de Mémoire Vive (locale, jamais publiée).", flush=True)
    print(f"Adresse : {adresse}", flush=True)
    print(f"Site local (aperçu) : http://127.0.0.1:{port}/", flush=True)
    print("Laisser cette fenêtre ouverte pendant les réglages ; Ctrl+C pour arrêter.", flush=True)
    if not args.sans_navigateur:
        webbrowser.open(adresse)
    try:
        serveur.serve_forever()
    except KeyboardInterrupt:
        print("\nPage d'admin arrêtée.", flush=True)
    finally:
        serveur.server_close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

Run: `python -m unittest tests.test_admin -v`
Expected: `Ran 55 tests` … `OK`.

- [ ] **Step 5: Essai à la main**

Run: `python scripts/admin.py --sans-navigateur`
Expected : quatre lignes, dont `Adresse : http://127.0.0.1:8790/admin/#jeton=<43 caractères>` et `Site local (aperçu) : http://127.0.0.1:8790/` (8791… si 8790 est pris). Ouvrir l'adresse du site local dans Chrome : le site public s'affiche (données du dépôt) ; `http://127.0.0.1:8790/admin/` répond « Introuvable. » (la page arrive en Task 5), `http://127.0.0.1:8790/api/etat` répond `{"erreur": "Jeton absent ou refusé : …"}`. Ctrl+C : « Page d'admin arrêtée. »

- [ ] **Step 6: Toute la suite Python**

Run: `python -m unittest discover -s tests`
Expected: `Ran 144 tests` … `OK`.

- [ ] **Step 7: Commit**

```bash
git add scripts/admin.py tests/test_admin.py
git commit -m "Admin : serveur local (jeton, Host, Origin, JSON seul), état, écriture atomique et empreinte des réglages

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: `scripts/admin.py` — aperçu, publication, garde-fous git, verrou

`POST /api/apercu` lance `export.py --no-git --sans-recherche` ; `POST /api/publier` vérifie l'état git (Choix 2) et les réglages enregistrés (Choix 21), commite les réglages modifiés (« Réglages : … », par chemin), puis lance l'export complet, qui commite `data.json` et pousse (jamais de push forcé : l'export fait un `git push` simple). Un seul export à la fois ; l'export tourne sans clavier, dans un groupe de processus arrêté en entier au bout du délai ; git en panne et push refusé sont expliqués (Choix 23). Les tests tournent dans un dépôt git temporaire relié à un dépôt distant local, contre un faux dashboard qui compte les recherches (et peut répondre lentement).

**Files:**

- Modify: `scripts/admin.py` (import de `signal` ; `etat_git` ; section « Publication » : `REGLAGES`, `LIBELLES`, `PUBLIABLES`, `EXPORT_DELAI`, `EN_PANNE`, `GROUPE_A_PART`, `erreurs_reglages`, `refus_publication`, `commit_reglages`, `arreter_groupe`, `lancer_export` ; `api_etat`, `do_POST`, `api_apercu`, `api_publier`)
- Test: `tests/test_admin.py` (imports ; `FauxDashboard`, `sh`, `PublicationAdminTest`)

**Interfaces:**

- Consumes: Task 1 (`--sans-recherche`) ; Task 3 (`Admin`, `git`, `statut_git`, `creer_serveur`, `Gestionnaire`, `OCCUPE`).
- Produces:
  - `erreurs_reglages(racine, connus=()) -> dict[str, list[str]]` (réglages enregistrés qui ne passent pas `valider`, par fichier) ; `refus_publication(racine, connus=()) -> str | None` (phrase en minuscule initiale, précédée de « Publication refusée : » par l'API ; git en panne compris) ; `commit_reglages(racine) -> str | None` (message du commit, lève `ErreurAdmin` si git échoue) ; `arreter_groupe(processus)` ; `lancer_export(admin: Admin, options: list[str]) -> (code: int, sortie: str)` (secrets masqués, arrêt de tout le groupe au bout d'`EXPORT_DELAI`) ; `REGLAGES`, `LIBELLES`, `PUBLIABLES`, `EXPORT_DELAI = 900`, `EN_PANNE`, `GROUPE_A_PART`.
  - `etat_git(racine, connus=())` renvoie en plus `"refus_publication": str | None` ; `api_etat` lui passe les secrets.
  - HTTP : `POST /api/apercu` (corps JSON, par exemple `{}`) → 200 `{"ok": bool, "code": int, "sortie": str}` | 409 `{"erreur": "Aperçu refusé : …", "erreurs": [...]}` ; `POST /api/publier` → 200 `{"ok": bool, "code": int, "commit": str | null, "explication": str | null, "sortie": str}` | 409 `{"erreur": "Publication refusée : …", "erreurs": [...]}` ; les deux → 409 `{"erreur": OCCUPE}` pendant une autre opération.

- [ ] **Step 1: Écrire les tests qui échouent**

2 remplacements dans `tests/test_admin.py`, dans l'ordre (chaque texte à remplacer y est unique).

1. Remplacer :

```python
import http.client
import json
import os
import socket
import tempfile
import threading
import time
import unittest
from pathlib import Path
from unittest import mock

from tests.aides import RACINE, export, memoire
```

par :

```python
import http.client
import json
import os
import shutil
import socket
import subprocess
import tempfile
import threading
import time
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from unittest import mock
from urllib.parse import parse_qs, urlparse

from tests.aides import RACINE, export, memoire
```

2. Remplacer :

```python
        self.assertIn(f"aucun port libre entre {port} et {port}", str(contexte.exception))


if __name__ == "__main__":
    unittest.main()
```

par :

```python
        self.assertIn(f"aucun port libre entre {port} et {port}", str(contexte.exception))


CLE_DASHBOARD = "cle-du-faux-dashboard"
MEMOIRES = [
    memoire(1, "Projet Jarvis : assistant vocal local. Trois étages.", ["jarvis", "architecture"], "architecture"),
    memoire(2, "Jarvis — premier réveil vocal : le mot de réveil déclenche l'écoute.", ["jarvis"], "milestone", 5),
    memoire(3, "Projet Depths : rogue-lite en 2D, donjons procéduraux.", ["depths"], "architecture", 9),
]


class FauxDashboard(BaseHTTPRequestHandler):
    """GET /api/memories et POST /api/search ; les recherches sont comptées
    (chacune écrirait dans la vraie mémoire partagée). delai : secondes
    d'attente avant de répondre à la lecture (dashboard lent)."""
    recherches = 0
    delai = 0

    def log_message(self, *args):
        pass

    def repondre(self, code, corps):
        brut = json.dumps(corps).encode("utf-8")
        try:
            self.send_response(code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(brut)))
            self.end_headers()
            self.wfile.write(brut)
        except ConnectionError:
            pass  # export arrêté avant la réponse (délai dépassé)

    def do_GET(self):
        time.sleep(FauxDashboard.delai)
        if self.headers.get("X-API-Key") != CLE_DASHBOARD:
            return self.repondre(401, {"detail": "non"})
        adresse = urlparse(self.path)
        if adresse.path != "/api/memories":
            return self.repondre(404, {"detail": "inconnu"})
        page = int(parse_qs(adresse.query)["page"][0])
        self.repondre(200, {"memories": MEMOIRES if page == 1 else [], "total": len(MEMOIRES), "has_more": False})

    def do_POST(self):
        FauxDashboard.recherches += 1
        self.rfile.read(int(self.headers.get("Content-Length") or 0))
        self.repondre(200, {"results": []})


def sh(*args, cwd):
    resultat = subprocess.run(args, cwd=cwd, text=True, encoding="utf-8", stdout=subprocess.PIPE,
                              stderr=subprocess.STDOUT)
    if resultat.returncode:
        raise AssertionError(f"{args} : {resultat.stdout}")
    return resultat.stdout.strip()


class PublicationAdminTest(unittest.TestCase):
    """Aperçu et publication dans un dépôt git temporaire relié à un dépôt
    distant local (jamais le vrai), contre un faux dashboard."""

    @classmethod
    def setUpClass(cls):
        cls.dashboard = ThreadingHTTPServer(("127.0.0.1", 0), FauxDashboard)
        threading.Thread(target=cls.dashboard.serve_forever, daemon=True).start()
        cls.url_dashboard = f"http://127.0.0.1:{cls.dashboard.server_address[1]}"

    @classmethod
    def tearDownClass(cls):
        cls.dashboard.shutdown()
        cls.dashboard.server_close()

    def setUp(self):
        self.dossier = tempfile.TemporaryDirectory()
        self.depot = Path(self.dossier.name) / "depot"
        self.distant = Path(self.dossier.name) / "distant.git"
        shutil.copytree(RACINE / "scripts", self.depot / "scripts", ignore=shutil.ignore_patterns("__pycache__"))
        shutil.copy(RACINE / ".gitignore", self.depot / ".gitignore")
        (self.depot / "config").mkdir()
        (self.depot / "docs").mkdir()
        (self.depot / "config" / "projets.json").write_text(admin.formater(projets()), encoding="utf-8")
        sh("git", "init", "--bare", "-b", "main", str(self.distant), cwd=self.dossier.name)
        sh("git", "init", "-b", "main", cwd=self.depot)
        sh("git", "config", "user.name", "test", cwd=self.depot)
        sh("git", "config", "user.email", "test@example.invalid", cwd=self.depot)
        sh("git", "remote", "add", "origin", str(self.distant), cwd=self.depot)
        sh("git", "add", ".", cwd=self.depot)
        sh("git", "commit", "-m", "init", cwd=self.depot)
        sh("git", "push", "-u", "origin", "main", cwd=self.depot)
        # Variables explicites : l'export ne doit jamais joindre le vrai dashboard.
        self.environnement = {"MEMOIRE_API_URL": self.url_dashboard, "MEMOIRE_API_KEY": CLE_DASHBOARD}
        self.serveur = demarrer(self.depot, environnement=self.environnement)
        self.client = Client(self.serveur.server_address[1])
        FauxDashboard.recherches = 0
        FauxDashboard.delai = 0

    def tearDown(self):
        self.serveur.shutdown()
        self.serveur.server_close()
        self.dossier.cleanup()

    def git(self, *args, cwd=None):
        return sh("git", *args, cwd=cwd or self.depot)

    def donnees(self):
        return json.loads((self.depot / "docs" / "data.json").read_text(encoding="utf-8"))

    def renommer_depths(self):
        statut, _ = self.client.json("PUT", "/api/config/projets",
                                     projets(projets={"depths": {"nom": "Depths II", "famille": "jeux"}}),
                                     base=empreinte_de(self.depot / "config" / "projets.json"))
        self.assertEqual(statut, 200)

    def test_apercu_sans_recherche_ni_commit(self):
        self.renommer_depths()
        statut, corps = self.client.json("POST", "/api/apercu", {})
        self.assertEqual(statut, 200, corps)
        self.assertTrue(corps["ok"], corps["sortie"])
        self.assertIn("aucune recherche en --sans-recherche", corps["sortie"])
        self.assertEqual(FauxDashboard.recherches, 0, "l'aperçu n'écrit rien dans la mémoire partagée")
        noms = {p["id"]: p["nom"] for p in self.donnees()["projets"]}
        self.assertEqual(noms["depths"], "Depths II", "l'aperçu montre le réglage enregistré")
        self.assertEqual(self.git("log", "--format=%s"), "init", "aucun commit")
        self.assertEqual(self.git("status", "--porcelain", "--", "config"), "M config/projets.json")

    def test_publier_commit_des_reglages_puis_export_et_push(self):
        self.renommer_depths()
        statut, corps = self.client.json("POST", "/api/publier", {})
        self.assertEqual(statut, 200, corps)
        self.assertTrue(corps["ok"], corps["sortie"])
        self.assertEqual(corps["commit"], "Réglages : projets et familles")
        self.assertIn("git : commit « Réglages : projets et familles »", corps["sortie"])
        self.assertIn("git : push effectué.", corps["sortie"])
        sujets = self.git("log", "--format=%s", "main", cwd=self.distant).splitlines()
        self.assertEqual(len(sujets), 3)
        self.assertTrue(sujets[0].startswith("Export mémoire : 3 entrées"), sujets)
        self.assertEqual(sujets[1:], ["Réglages : projets et familles", "init"])
        self.assertEqual(self.git("rev-parse", "HEAD"), self.git("rev-parse", "main", cwd=self.distant))
        self.assertEqual(self.git("status", "--porcelain"), "", "rien ne reste à commiter")
        self.assertEqual(FauxDashboard.recherches, 3, "export réel : une recherche par entrée nouvelle")

    def test_publier_sans_reglage_modifie(self):
        statut, corps = self.client.json("POST", "/api/publier", {})
        self.assertEqual(statut, 200, corps)
        self.assertTrue(corps["ok"], corps["sortie"])
        self.assertIsNone(corps["commit"])
        self.assertTrue(self.git("log", "-1", "--format=%s", "main", cwd=self.distant).startswith("Export mémoire"))

    def test_publier_refuse_hors_de_main(self):
        self.git("switch", "-q", "-c", "essai")
        self.renommer_depths()
        statut, corps = self.client.json("POST", "/api/publier", {})
        self.assertEqual(statut, 409)
        self.assertEqual(corps["erreur"], "Publication refusée : la copie de travail est sur la branche « essai », "
                                          "pas sur main ; publier pousserait cette branche. Revenir sur main "
                                          "avant de publier.")
        self.assertEqual(self.git("log", "--format=%s"), "init")
        self.assertEqual(FauxDashboard.recherches, 0)

    def test_publier_refuse_modifications_sans_rapport(self):
        self.renommer_depths()
        with open(self.depot / "scripts" / "export.py", "a", encoding="utf-8") as fichier:
            fichier.write("# essai\n")
        statut, corps = self.client.json("POST", "/api/publier", {})
        self.assertEqual(statut, 409)
        self.assertEqual(corps["erreur"], "Publication refusée : d'autres fichiers que les réglages ont des "
                                          "modifications pas encore commitées (scripts/export.py). Publier "
                                          "maintenant mêlerait ces changements en cours à la publication : les "
                                          "commiter ou les annuler d'abord.")
        self.assertEqual(self.git("log", "--format=%s"), "init", "les réglages ne sont pas commités non plus")

    def test_publier_refuse_commit_local_sans_rapport(self):
        (self.depot / "NOTES.md").write_text("brouillon\n", encoding="utf-8")
        self.git("add", "NOTES.md")
        self.git("commit", "-q", "-m", "notes")
        statut, corps = self.client.json("POST", "/api/publier", {})
        self.assertEqual(statut, 409)
        self.assertEqual(corps["erreur"], "Publication refusée : des commits locaux pas encore publiés modifient "
                                          "d'autres fichiers que les réglages et data.json (NOTES.md) ; publier "
                                          "les pousserait aussi. Les publier à part ou les retirer d'abord.")

    def test_publier_refuse_sans_branche_distante(self):
        self.git("branch", "--unset-upstream")
        statut, corps = self.client.json("POST", "/api/publier", {})
        self.assertEqual(statut, 409)
        self.assertIn("ne suit aucune branche distante", corps["erreur"])

    def test_reglage_invalide_ecrit_a_la_main_jamais_publie(self):
        # Modifié hors de la page : jamais passé par sa validation.
        reglages = projets(projets={"depths": {"description": "clé sk-ant-" + "x" * 30}})
        (self.depot / "config" / "projets.json").write_text(json.dumps(reglages), encoding="utf-8")
        erreur = ("Projet « depths », description : ressemble à un secret (clé, jeton ou mot de passe) ; "
                  "ce texte serait publié sur le site.")
        statut, etat = self.client.json("GET", "/api/etat")
        self.assertEqual(etat["erreurs"], {"projets": [erreur]})
        self.assertEqual(etat["git"]["refus_publication"],
                         "des réglages enregistrés ne passent pas la vérification (config/projets.json) : les "
                         "corriger d'abord (la page liste les erreurs à son ouverture) ; rien n'est commité d'ici là.")
        statut, corps = self.client.json("POST", "/api/publier", {})
        self.assertEqual((statut, corps["erreurs"]), (409, [erreur]))
        self.assertTrue(corps["erreur"].startswith("Publication refusée : des réglages enregistrés"), corps)
        statut, corps = self.client.json("POST", "/api/apercu", {})
        self.assertEqual((statut, corps["erreurs"]), (409, [erreur]))
        self.assertEqual(self.git("log", "--format=%s"), "init", "rien n'est commité")
        self.assertEqual(self.git("log", "--format=%s", "main", cwd=self.distant), "init", "rien n'est poussé")
        self.assertEqual(FauxDashboard.recherches, 0)

    def test_git_en_panne_publication_refusee(self):
        vrai = admin.git

        def git(racine, *args):
            if args[:1] == ("status",):
                return subprocess.CompletedProcess(["git", *args], 128, "", "fatal: index file corrupt\n")
            return vrai(racine, *args)

        with mock.patch.object(admin, "git", side_effect=git):
            statut, corps = self.client.json("POST", "/api/publier", {})
        self.assertEqual(statut, 409)
        self.assertEqual(corps["erreur"], "Publication refusée : git ne répond pas normalement (git status a échoué : "
                                          "fatal: index file corrupt) : publication impossible pour l'instant.")
        self.assertEqual(FauxDashboard.recherches, 0)

    def test_push_refuse_explique(self):
        # Le dépôt distant a avancé depuis ailleurs (GitHub, autre ordinateur).
        autre = Path(self.dossier.name) / "autre"
        sh("git", "clone", "-q", str(self.distant), str(autre), cwd=self.dossier.name)
        sh("git", "-c", "user.name=test", "-c", "user.email=test@example.invalid", "commit", "-q", "--allow-empty",
           "-m", "ailleurs", cwd=autre)
        sh("git", "push", "-q", cwd=autre)
        self.renommer_depths()
        statut, corps = self.client.json("POST", "/api/publier", {})
        self.assertEqual(statut, 200, corps)
        self.assertFalse(corps["ok"])
        self.assertEqual(corps["commit"], "Réglages : projets et familles")
        self.assertEqual(corps["explication"], f"Le dépôt GitHub a des commits que cet ordinateur n'a pas encore : dans "
                                               f"{self.depot}, lancer « git pull --rebase », puis « Publier » de nouveau "
                                               "(ce qui est déjà commité ici partira avec).")
        self.assertIn("[rejected]", corps["sortie"])
        self.assertEqual(self.git("log", "-1", "--format=%s", "main", cwd=self.distant), "ailleurs")

    def test_export_trop_long_arrete(self):
        FauxDashboard.delai = 4
        debut = time.monotonic()
        with mock.patch.object(admin, "EXPORT_DELAI", 1):
            statut, corps = self.client.json("POST", "/api/apercu", {})
        self.assertEqual((statut, corps), (200, {"ok": False, "code": 1, "sortie": "Échec : l'export n'a pas fini "
                                                 "en 1 s ; il a été arrêté (git compris)."}))
        self.assertLess(time.monotonic() - debut, 4, "arrêté au bout du délai, sans attendre le dashboard")
        self.assertTrue(self.serveur.admin.verrou.acquire(blocking=False), "verrou relâché")
        self.serveur.admin.verrou.release()

    def test_fichiers_non_suivis_ignores(self):
        (self.depot / "brouillon.txt").write_text("sans rapport, jamais commité\n", encoding="utf-8")
        statut, corps = self.client.json("POST", "/api/publier", {})
        self.assertEqual(statut, 200, corps)
        self.assertTrue(corps["ok"], corps["sortie"])
        self.assertEqual(self.git("status", "--porcelain"), "?? brouillon.txt")

    def test_etat_git(self):
        statut, corps = self.client.json("GET", "/api/etat")
        self.assertEqual(corps["git"], {"branche": "main", "modifies": [], "commits_en_attente": 0,
                                        "refus_publication": None})
        self.renommer_depths()
        (self.depot / "scripts" / "export.py").write_text("# vide\n", encoding="utf-8")
        statut, corps = self.client.json("GET", "/api/etat")
        self.assertEqual(corps["git"]["modifies"], ["config/projets.json", "scripts/export.py"])
        self.assertIn("(scripts/export.py)", corps["git"]["refus_publication"])

    def test_un_seul_export_a_la_fois(self):
        self.assertTrue(self.serveur.admin.verrou.acquire(blocking=False))
        try:
            for chemin in ("/api/apercu", "/api/publier"):
                statut, corps = self.client.json("POST", chemin, {})
                self.assertEqual(statut, 409)
                self.assertEqual(corps["erreur"], admin.OCCUPE)
        finally:
            self.serveur.admin.verrou.release()
        self.assertEqual(FauxDashboard.recherches, 0)
        self.assertEqual(self.client.json("POST", "/api/apercu", {})[0], 200)

    def test_deux_apercus_simultanes_un_seul_passe(self):
        verrou_pris, liberer = threading.Event(), threading.Event()
        vrai_lancer = admin.lancer_export

        def lent(*args, **kwargs):
            verrou_pris.set()
            liberer.wait(10)
            return vrai_lancer(*args, **kwargs)

        resultats = []
        with mock.patch.object(admin, "lancer_export", side_effect=lent):
            premier = threading.Thread(target=lambda: resultats.append(self.client.json("POST", "/api/apercu", {})))
            premier.start()
            self.assertTrue(verrou_pris.wait(10))
            second = self.client.json("POST", "/api/apercu", {})
            liberer.set()
            premier.join(30)
        self.assertEqual(second, (409, {"erreur": admin.OCCUPE}))
        self.assertEqual(resultats[0][0], 200)

    def test_json_exige_et_secrets_masques_dans_le_compte_rendu(self):
        self.assertEqual(self.client("POST", "/api/apercu", b"", type_="text/plain")[0], 415)
        self.serveur.admin.environnement["MEMOIRE_API_URL"] = f"{self.url_dashboard}/{CLE_DASHBOARD}"
        statut, corps = self.client.json("POST", "/api/apercu", {})
        self.assertEqual(statut, 200)
        self.assertFalse(corps["ok"])
        self.assertNotIn(CLE_DASHBOARD, corps["sortie"])
        self.assertIn("[masqué]", corps["sortie"])


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `python -m unittest tests.test_admin -v`
Expected: FAIL — `Ran 71 tests`, `FAILED (failures=13, errors=3)` : les `POST` répondent encore `404` (`AssertionError: 404 != 200 : {'erreur': 'Adresse inconnue.'}`, `404 != 409`, `404 != 415`), `etat_git` n'a pas `refus_publication` (`AssertionError` et `KeyError: 'refus_publication'`), `AttributeError: module 'admin' has no attribute 'lancer_export'` et `AttributeError: <module 'admin' …> does not have the attribute 'EXPORT_DELAI'`.

- [ ] **Step 3: Écrire l'aperçu et la publication**

6 remplacements dans `scripts/admin.py`, dans l'ordre (chaque texte à remplacer y est unique).

1. Remplacer :

```python
import os
import re
import secrets
import subprocess
import sys
import threading
```

par :

```python
import os
import re
import secrets
import signal
import subprocess
import sys
import threading
```

2. Remplacer :

```python
    return resultat


def etat_git(racine: Path) -> dict | None:
    """Branche, fichiers suivis modifiés et pas encore commités, commits pas
    encore poussés ; None hors d'un dépôt git (ou sans git)."""
    try:
        branche = git(racine, "rev-parse", "--abbrev-ref", "HEAD")
    except OSError:
```

par :

```python
    return resultat


def etat_git(racine: Path, connus: tuple = ()) -> dict | None:
    """Branche, fichiers suivis modifiés et pas encore commités, commits pas
    encore poussés, refus de publier ; None hors d'un dépôt git (ou sans git).
    connus : valeurs des secrets (vérification des réglages enregistrés)."""
    try:
        branche = git(racine, "rev-parse", "--abbrev-ref", "HEAD")
    except OSError:
```

3. Remplacer :

```python
        "branche": branche.stdout.strip(),
        "modifies": modifies,
        "commits_en_attente": int(avance.stdout.strip()) if avance.returncode == 0 else None,
    }


# --------------------------------------------------------------------------
```

par :

```python
        "branche": branche.stdout.strip(),
        "modifies": modifies,
        "commits_en_attente": int(avance.stdout.strip()) if avance.returncode == 0 else None,
        "refus_publication": refus_publication(racine, connus),
    }


# --------------------------------------------------------------------------
# Publication : garde-fous git, commit des réglages, lancement de l'export
# --------------------------------------------------------------------------

REGLAGES = list(FICHIERS.values())
LIBELLES = {"config/projets.json": "projets et familles", "config/entrees.json": "entrées",
            "config/recherche.json": "recherche"}
# Seuls fichiers qu'une publication peut emporter : les réglages et data.json
# (qu'un aperçu a pu réécrire).
PUBLIABLES = set(REGLAGES) | {"docs/data.json"}
EXPORT_DELAI = 900  # secondes : lecture de la mémoire, puis recherches des voisins (budget 120 s)
EN_PANNE = "git ne répond pas normalement ({}) : publication impossible pour l'instant."
# L'export et ses sous-processus (git) dans un groupe à part : au bout du délai,
# tout le groupe est arrêté ; un « git push » resté ouvert garderait sinon la
# sortie ouverte, et l'opération (avec le verrou) ne finirait jamais.
GROUPE_A_PART = ({"creationflags": subprocess.CREATE_NEW_PROCESS_GROUP} if os.name == "nt"
                 else {"start_new_session": True})


def erreurs_reglages(racine: Path, connus: tuple = ()) -> dict[str, list[str]]:
    """Erreurs de validation des réglages enregistrés, par fichier ({} si tout
    est bon) : un réglage modifié à la main n'est pas passé par la page."""
    resultat = {}
    for nom in FICHIERS:
        try:
            erreurs = valider(nom, lire_config(racine, nom), connus)
        except ErreurAdmin as err:
            erreurs = [str(err)]
        if erreurs:
            resultat[nom] = erreurs
    return resultat


def refus_publication(racine: Path, connus: tuple = ()) -> str | None:
    """Pourquoi publier est impossible depuis ce dépôt (phrase en français), ou None.
    L'export pousse tout commit en attente de la branche courante : on n'accepte
    que main, sans autre modification en cours que les réglages et data.json, et
    sans commit local qui toucherait autre chose. Les fichiers non suivis ne
    comptent pas : chaque commit de la publication nomme ses fichiers. Enfin,
    les réglages enregistrés doivent passer la validation (connus : secrets)."""
    try:
        branche = git(racine, "rev-parse", "--abbrev-ref", "HEAD")
    except OSError:
        return "git est introuvable."
    if branche.returncode != 0:
        return "ce dossier n'est pas un dépôt git."
    nom = branche.stdout.strip()
    if nom != "main":
        ou = "aucune branche (HEAD détachée)" if nom == "HEAD" else f"la branche « {nom} »"
        return (f"la copie de travail est sur {ou}, pas sur main ; publier pousserait cette branche. "
                "Revenir sur main avant de publier.")
    if git(racine, "rev-parse", "-q", "--verify", "MERGE_HEAD").returncode == 0:
        return "une fusion git est en cours : la terminer (ou l'annuler) avant de publier."
    try:
        statut = statut_git(racine)
    except ErreurAdmin as err:
        return EN_PANNE.format(err)
    conflits = sorted(chemin for code, chemin in statut if "U" in code or code in ("AA", "DD"))
    if conflits:
        return f"conflit git sur {', '.join(conflits)} : le résoudre avant de publier."
    autres = sorted(chemin for _, chemin in statut if chemin not in PUBLIABLES)
    if autres:
        return (f"d'autres fichiers que les réglages ont des modifications pas encore commitées "
                f"({', '.join(autres)}). Publier maintenant mêlerait ces changements en cours à la "
                "publication : les commiter ou les annuler d'abord.")
    if git(racine, "rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}").returncode != 0:
        return ("la branche main ne suit aucune branche distante (origin/main) : voir « Première mise en "
                "place » dans le README.")
    pousses = git(racine, "-c", "core.quotepath=off", "log", "--format=", "--name-only", "@{u}..HEAD")
    if pousses.returncode != 0:
        return EN_PANNE.format(f"git log a échoué : {pousses.stderr.strip() or 'code ' + str(pousses.returncode)}")
    hors = sorted({ligne for ligne in pousses.stdout.splitlines() if ligne.strip()} - PUBLIABLES)
    if hors:
        return (f"des commits locaux pas encore publiés modifient d'autres fichiers que les réglages et "
                f"data.json ({', '.join(hors)}) ; publier les pousserait aussi. Les publier à part ou les "
                "retirer d'abord.")
    invalides = erreurs_reglages(racine, connus)
    if invalides:
        return (f"des réglages enregistrés ne passent pas la vérification "
                f"({', '.join(FICHIERS[nom] for nom in invalides)}) : les corriger d'abord (la page liste les "
                "erreurs à son ouverture) ; rien n'est commité d'ici là.")
    return None


def commit_reglages(racine: Path) -> str | None:
    """Commit des seuls réglages modifiés (nommés par chemin) ; renvoie son
    message, ou None s'il n'y a rien à commiter."""
    modifies = {chemin for _, chemin in statut_git(racine, *REGLAGES, non_suivis=True)}
    a_commiter = [chemin for chemin in REGLAGES if chemin in modifies]
    if not a_commiter:
        return None
    message = "Réglages : " + ", ".join(LIBELLES[chemin] for chemin in a_commiter)
    for args in (["add", "--", *a_commiter], ["commit", "-q", "-m", message, "--", *a_commiter]):
        resultat = git(racine, *args)
        if resultat.returncode != 0:
            raise ErreurAdmin(f"git {args[0]} a échoué : {(resultat.stdout + resultat.stderr).strip()}")
    return message


def arreter_groupe(processus: subprocess.Popen) -> None:
    """Arrête l'export et tous ses sous-processus (git compris)."""
    if os.name == "nt":
        subprocess.run(["taskkill", "/T", "/F", "/PID", str(processus.pid)],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    else:
        try:
            os.killpg(processus.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
    if processus.poll() is None:
        processus.kill()


def lancer_export(admin: Admin, options: list[str]) -> tuple[int, str]:
    """scripts/export.py du dépôt servi, avec ces options : (code de sortie,
    compte rendu). Rien n'est lu au clavier (git échoue au lieu d'attendre un
    identifiant) ; au bout d'EXPORT_DELAI, tout est arrêté. Les secrets connus
    sont masqués dans le compte rendu (filet : l'export ne les affiche pas)."""
    environ = {**os.environ, **admin.environnement, "PYTHONIOENCODING": "utf-8", "GIT_TERMINAL_PROMPT": "0"}
    commande = [sys.executable, str(admin.racine / "scripts" / "export.py"), *options]
    try:
        processus = subprocess.Popen(commande, cwd=admin.racine, env=environ, stdin=subprocess.DEVNULL,
                                     stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
                                     encoding="utf-8", errors="replace", **GROUPE_A_PART)
    except OSError as err:
        return 1, f"Échec : impossible de lancer l'export ({err})."
    try:
        sortie, _ = processus.communicate(timeout=EXPORT_DELAI)
        code = processus.returncode
    except subprocess.TimeoutExpired:
        arreter_groupe(processus)
        try:
            processus.communicate(timeout=30)
        except subprocess.TimeoutExpired:
            pass
        delai = f"{EXPORT_DELAI // 60} minutes" if EXPORT_DELAI >= 60 else f"{EXPORT_DELAI} s"
        code, sortie = 1, f"Échec : l'export n'a pas fini en {delai} ; il a été arrêté (git compris)."
    sortie, _ = export.redact(sortie, admin.secrets())
    return code, sortie


# --------------------------------------------------------------------------
```

4. Remplacer :

```python
        if not self.chemin.startswith("/api/"):
            self.refus(405, "Méthode non permise.")
            return
        self.refus(404, "Adresse inconnue.")

    # ------------------------------------------------------------ API
```

par :

```python
        if not self.chemin.startswith("/api/"):
            self.refus(405, "Méthode non permise.")
            return
        action = {"/api/apercu": self.api_apercu, "/api/publier": self.api_publier}.get(self.chemin)
        if action is None:
            self.refus(404, "Adresse inconnue.")
            return
        lu, _ = self.lire_corps()
        if not lu:
            return
        if not self.admin.verrou.acquire(blocking=False):
            self.json(409, {"erreur": OCCUPE})
            return
        try:
            action()
        finally:
            self.admin.verrou.release()

    # ------------------------------------------------------------ API
```

5. Remplacer :

```python
        donnees = lire_donnees(racine)
        self.json(200, {"fichiers": fichiers, "empreintes": empreintes, "normalisations": normalisations,
                        "erreurs": erreurs, "donnees": donnees, "originaux": originaux(donnees),
                        "git": etat_git(racine)})

    def api_ecrire(self, nom: str, donnees) -> None:
        erreurs = valider(nom, donnees, self.admin.secrets())
```

par :

```python
        donnees = lire_donnees(racine)
        self.json(200, {"fichiers": fichiers, "empreintes": empreintes, "normalisations": normalisations,
                        "erreurs": erreurs, "donnees": donnees, "originaux": originaux(donnees),
                        "git": etat_git(racine, connus)})

    def api_ecrire(self, nom: str, donnees) -> None:
        erreurs = valider(nom, donnees, self.admin.secrets())
```

6. Remplacer :

```python
            self.admin.verrou.release()
        self.admin.journal(f"  Réglages enregistrés : {FICHIERS[nom]}")
        self.json(200, {"ok": True, "fichier": FICHIERS[nom], "empreinte": nouvelle})

    # ------------------------------------------------------------ fichiers
```

par :

```python
            self.admin.verrou.release()
        self.admin.journal(f"  Réglages enregistrés : {FICHIERS[nom]}")
        self.json(200, {"ok": True, "fichier": FICHIERS[nom], "empreinte": nouvelle})

    def api_apercu(self) -> None:
        """Export sans git et sans aucune recherche de voisins : rien n'est écrit
        dans la mémoire partagée ; les entrées nouvelles attendent la publication.
        Refusé si des réglages enregistrés ne passent pas la vérification."""
        invalides = erreurs_reglages(self.admin.racine, self.admin.secrets())
        if invalides:
            self.json(409, {"erreur": "Aperçu refusé : des réglages enregistrés ne passent pas la vérification ; "
                                      "les corriger d'abord.",
                            "erreurs": [erreur for liste in invalides.values() for erreur in liste]})
            return
        self.admin.journal("  Aperçu : export sans git ni recherche de voisins…")
        code, sortie = lancer_export(self.admin, ["--no-git", "--sans-recherche"])
        self.admin.journal("  Aperçu prêt." if code == 0 else "  Aperçu en échec (voir la page).")
        self.json(200, {"ok": code == 0, "code": code, "sortie": sortie})

    def api_publier(self) -> None:
        """Commit des réglages modifiés, puis export complet (commit de data.json
        et push de tout, jamais forcé), après les garde-fous git et la
        vérification des réglages enregistrés."""
        racine, connus = self.admin.racine, self.admin.secrets()
        refus = refus_publication(racine, connus)
        if refus:
            invalides = erreurs_reglages(racine, connus)
            self.json(409, {"erreur": f"Publication refusée : {refus}",
                            "erreurs": [erreur for liste in invalides.values() for erreur in liste]})
            return
        try:
            message = commit_reglages(racine)
        except ErreurAdmin as err:
            self.json(200, {"ok": False, "code": 1, "commit": None, "explication": None, "sortie": f"Échec : {err}"})
            return
        self.admin.journal("  Publication : " + (f"commit « {message} », puis export…" if message else "export…"))
        code, sortie = lancer_export(self.admin, [])
        explication = None
        if code != 0 and any(mot in sortie for mot in ("[rejected]", "non-fast-forward", "fetch first")):
            # Push refusé : le dépôt distant a avancé (modification faite sur GitHub ou ailleurs).
            explication = (f"Le dépôt GitHub a des commits que cet ordinateur n'a pas encore : dans {racine}, "
                           "lancer « git pull --rebase », puis « Publier » de nouveau (ce qui est déjà commité "
                           "ici partira avec).")
        if message:
            sortie = f"git : commit « {message} »\n{sortie}"
        self.admin.journal("  Publication terminée." if code == 0 else "  Publication en échec (voir la page).")
        self.json(200, {"ok": code == 0, "code": code, "commit": message, "explication": explication,
                        "sortie": sortie})

    # ------------------------------------------------------------ fichiers
```

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

Run: `python -m unittest tests.test_admin -v`
Expected: `Ran 71 tests` … `OK` (une vingtaine de secondes : dépôts git et exports réels).

- [ ] **Step 5: Toute la suite Python**

Run: `python -m unittest discover -s tests`
Expected: `Ran 160 tests` … `OK`.

- [ ] **Step 6: Commit**

```bash
git add scripts/admin.py tests/test_admin.py
git commit -m "Admin : aperçu sans recherche, publication gardée (main, arbre propre, commits locaux, réglages vérifiés), verrou

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Page d'admin : squelette, jeton, onglets, Enregistrer ; banc de tests navigateur

La page elle-même : `admin/index.html` (tout le squelette : en-tête, quatre onglets et leurs panneaux, barre du bas, compte rendu), `admin/admin.css` (toute la mise en page), `admin/admin.js` (jeton, appels à l'API, onglets au clavier, barre, compte rendu, Enregistrer avec l'empreinte du fichier lu, réglages relus ou invalides signalés à l'ouverture, alerte en quittant) et le cœur de `admin/modele.js` (brouillon, empreintes, fichiers modifiés). Les panneaux se remplissent en Tasks 6 et 7, Aperçu et Publier se branchent en Task 8 : jusque-là leurs boutons ne font rien. Le banc navigateur lance le vrai `admin.py` dans un dépôt git temporaire (copie de `scripts/`, `docs/`, `admin/`, réglages de test, `data.json` tiré d'un faux dashboard par `export.py --no-git --sans-recherche`), relié à un dépôt distant local.

Jeu de test du banc (`MEMOIRES`, identifiants courts `000000000001` à `000000000006`) : 1 « Projet Jarvis : assistant vocal local… » (architecture, liens site et dépôt), 2 « Jarvis — premier réveil vocal » (jalon), 3 « Projet Depths : rogue-lite en 2D… » (architecture), 4 « Rogue-lite : idées de monstres… » (tag `rogue-lite`, à fusionner dans `depths`), 5 « Voxelcraft — un jeu de cubes… », 6 une note taguée `prive` (jamais publiée). Réglages de test : familles `jeux` (couleur 1) et `ia` (3) ; `jarvis` → `ia`, `depths` (nom « Depths ») → `jeux` ; deux groupes de synonymes. Projets affichés : Depths, Jarvis, Rogue lite, Voxelcraft.

**Files:**

- Create: `admin/index.html`, `admin/admin.css`, `admin/admin.js`, `admin/modele.js`, `admin/package.json`, `tests/navigateur/banc-admin.mjs`
- Modify: `tests/navigateur/outils.mjs` (`pageInstrumentee()` sortie de `ouvrirSite().page()`)
- Test: `tests/js/admin.test.mjs` (créé), `tests/navigateur/admin.test.mjs` (créé)

**Interfaces:**

- Consumes: Task 3 et 4 (API HTTP, dont `empreintes`, `normalisations` et `erreurs` de `GET /api/etat` et l'en-tête `X-Admin-Base` ; ligne `Adresse : …` de `main()`) ; de `docs/js/composants.js` : `el(tag, attrs, ...enfants)`, `plural(n, un, plusieurs)` ; `docs/style.css` (jetons, `.btn-primary`, `.btn-secondary`, `.link-button`, `.status`, `.error`, `.stats`, `.family-dot`, `[data-couleur]`, `.visually-hidden`, `.skip-link`) et `docs/theme.js`.
- Produces:
  - `admin/modele.js` : `FICHIERS = ['projets', 'entrees', 'recherche']`, `LIBELLES` (`projets` → « projets et familles », `entrees` → « entrées », `recherche` → « recherche »), `COULEURS` (noms des couleurs 1 à 6), `slug(texte) -> string`, `termes(texte) -> string[]` (« a, b » → `['a', 'b']`), `creerModele(etat) -> { original, brouillon, empreintes, donnees, originaux, git }` (les fichiers de `etat.normalisations` comptent comme modifiés), `fichiersModifies(modele) -> string[]` (ordre de `FICHIERS`, insensible à l'ordre des clés), `marquerEnregistre(modele, nom, empreinte)`.
  - `admin/index.html` : identifiants utilisés par `admin.js` et les tests — `status`, `etat-git`, `onglets`, `onglet-<nom>` et `panneau-<nom>` (`nom` ∈ `projets`, `familles`, `entrees`, `recherche`), `filtre-projets`, `compte-projets`, `liste-projets`, `detail-projet`, `liste-familles`, `nouvelle-famille`, `bouton-ajouter-famille`, `filtre-entrees`, `compte-entrees`, `liste-entrees`, `detail-entree`, `liste-groupes`, `bouton-ajouter-groupe`, `etat-modifs`, `bouton-enregistrer`, `bouton-apercu`, `bouton-publier`, `compte-rendu`, `compte-rendu-titre`, `compte-rendu-message`, `compte-rendu-details`, `compte-rendu-sortie`, `fermer-compte-rendu`, `annonce`.
  - `admin/admin.js` : `const PANNEAUX = {}` (nom d'onglet → fonction de rendu, remplie en Tasks 6 et 7) ; `api(methode, chemin, corps, entetes = {})` ; `signalerLecture(etat)` (compte rendu « Réglages relus » ou « Réglages à corriger ») ; `rapport(genre, titre, message, { details, sortie, apercu, focus })` ; `executer(action)` ; `enregistrer({ silencieux }) -> Promise<boolean>` (en-tête `X-Admin-Base`) ; `rafraichirGit()` ; constantes `CLE_JETON`, `ONGLETS`, `APERCU = 'memoire-vive-apercu'` ; objets `dom`, `ui`.
  - `tests/navigateur/outils.mjs` : `pageInstrumentee(navigateur, { mobile = false } = {}) -> Promise<Page>` (`page.erreurs`).
  - `tests/navigateur/banc-admin.mjs` : `RACINE_DEPOT`, `PYTHON`, `MEMOIRES`, `REGLAGES`, `demarrerDashboard() -> { url, etat: { recherches, delai }, arreter() }` (`delai` : millisecondes avant de répondre à la lecture), `git(dossier, ...args) -> string`, `preparerDepot(dossier, dashboard) -> { racine, distant }`, `lancerAdmin(racine, dashboard) -> { adresse, base, jeton, sortie(), arreter() }`, `ouvrirBanc() -> { dossier, racine, distant, dashboard, admin, lire(chemin), ecrire(chemin, texte) (ajout à la fin), remplacer(chemin, texte), git(...args), gitDistant(...args), fermer() }` (un montage raté arrête le faux dashboard et efface le dossier : sinon Node ne s'arrêterait pas).
  - `tests/navigateur/admin.test.mjs` : `ouvrirAdmin(t) -> { banc, page }`, `cliquerEtAttendre(page, bouton, titre)`.

- [ ] **Step 1: Sortir l'instrumentation des pages dans `tests/navigateur/outils.mjs`**

Le banc de l'admin a besoin des mêmes pages instrumentées (erreurs de console, CSP) que le banc du site, sur un autre serveur :

2 remplacements dans `tests/navigateur/outils.mjs`, dans l'ordre (chaque texte à remplacer y est unique).

1. Remplacer :

```js
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
```

par :

```js
       page.erreurs recueille erreurs et avertissements de la console, erreurs
       JavaScript, requêtes échouées et violations de la CSP. */
    async page({ donnees, mobile = false, horloge } = {}) {
      const page = await pageInstrumentee(navigateur, { mobile });
      const heure = horloge === undefined ? (donnees ? MAINTENANT_TEST : null) : horloge;
      if (heure) await page.clock.setFixedTime(new Date(heure));
      if (typeof donnees === 'function') {
```

2. Remplacer :

```js
      if (serveur) await serveur.arreter();
    },
  };
}

/* Ferme la page ; échoue si la console a reçu une erreur, un avertissement
```

par :

```js
      if (serveur) await serveur.arreter();
    },
  };
}

/* Page neuve dans un contexte isolé (stockage vide), écran d'ordinateur
   (1280 × 900) ou de téléphone ; 10 s d'attente au plus par action.
   page.erreurs recueille erreurs et avertissements de la console, erreurs
   JavaScript, requêtes échouées et violations de la CSP. */
export async function pageInstrumentee(navigateur, { mobile = false } = {}) {
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
  return page;
}

/* Ferme la page ; échoue si la console a reçu une erreur, un avertissement
```

- [ ] **Step 2: Créer le banc `tests/navigateur/banc-admin.mjs`**

```js
/* Banc de la page d'admin : dépôt git temporaire (copie de scripts/, docs/ et
   admin/, réglages de test), dépôt distant local, faux dashboard, serveur
   scripts/admin.py sur un port libre. Aucune donnée réelle : ni la vraie
   mémoire, ni le vrai dépôt distant ne sont touchés. */
import { spawn, execFile, execFileSync } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

export const RACINE_DEPOT = fileURLToPath(new URL('../../', import.meta.url));
export const PYTHON = process.env.MEMOIRE_PYTHON || 'python';
const CLE = 'cle-du-faux-dashboard';

function memoire(n, contenu, tags, type) {
  return {
    content: contenu, content_hash: n.toString(16).padStart(12, '0') + '0'.repeat(52), tags, memory_type: type,
    metadata: { access_queries: ['ne doit pas sortir'] }, created_at: 1790000000 + n * 3600,
    created_at_iso: null, updated_at: null, updated_at_iso: null,
  };
}

/* Six entrées : cinq publiables (quatre projets, dont « rogue-lite » à fusionner
   dans « depths »), une privée (tag « prive », jamais publiée). */
export const MEMOIRES = [
  memoire(1, 'Projet Jarvis : assistant vocal local, qui écoute et répond sans réseau. Démo sur https://exemple.github.io/jarvis/ et code sur https://github.com/exemple/jarvis.', ['jarvis', 'architecture'], 'architecture'),
  memoire(2, 'Jarvis — premier réveil vocal : le mot de réveil déclenche l’écoute en moins de 300 ms.', ['jarvis', 'jalon'], 'milestone'),
  memoire(3, 'Projet Depths : rogue-lite en 2D, donjons procéduraux et salles préfabriquées.', ['depths', 'architecture'], 'architecture'),
  memoire(4, 'Rogue-lite : idées de monstres pour les grottes du donjon.', ['rogue-lite'], 'note'),
  memoire(5, 'Voxelcraft — un jeu de cubes : un animal par biome et des rivières creusées.', ['voxelcraft'], 'note'),
  memoire(6, 'Note privée : à ne pas publier.', ['prive'], 'note'),
];

export const REGLAGES = {
  projets: {
    _aide: 'Réglages de test.',
    version: 2,
    familles: [{ id: 'jeux', nom: 'Jeux', couleur: 1 }, { id: 'ia', nom: 'IA & simulations', couleur: 3 }],
    projets: { jarvis: { famille: 'ia' }, depths: { nom: 'Depths', famille: 'jeux' } },
    tags_generiques: ['python'],
    tags_exclus: [],
  },
  entrees: { _aide: 'Corrections de test.' },
  recherche: { _aide: 'Synonymes de test.', synonymes: [['ia', 'intelligence artificielle'], ['jeu', 'game']] },
};

/* Faux dashboard : GET /api/memories, POST /api/search (comptées : chacune
   écrirait dans la vraie mémoire partagée). etat.delai : millisecondes
   d'attente avant de répondre à la lecture (dashboard lent). */
export async function demarrerDashboard() {
  const etat = { recherches: 0, delai: 0 };
  const serveur = http.createServer((req, res) => {
    const repondre = (code, corps) => {
      res.writeHead(code, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(corps));
    };
    if (req.headers['x-api-key'] !== CLE) return repondre(401, { detail: 'non' });
    const url = new URL(req.url, 'http://127.0.0.1');
    if (req.method === 'GET' && url.pathname === '/api/memories') {
      const premiere = url.searchParams.get('page') === '1';
      return setTimeout(() => repondre(200, { memories: premiere ? MEMOIRES : [], total: MEMOIRES.length, has_more: false }),
        etat.delai);
    }
    if (req.method === 'POST' && url.pathname === '/api/search') {
      etat.recherches += 1;
      req.resume();
      return req.on('end', () => repondre(200, { results: [] }));
    }
    return repondre(404, { detail: 'inconnu' });
  });
  await new Promise((ok) => serveur.listen(0, '127.0.0.1', ok));
  return {
    url: `http://127.0.0.1:${serveur.address().port}`,
    etat,
    arreter: () => new Promise((ok) => {
      serveur.closeAllConnections();
      serveur.close(() => ok());
    }),
  };
}

function environnement(dashboard) {
  return { ...process.env, MEMOIRE_API_URL: dashboard.url, MEMOIRE_API_KEY: CLE, PYTHONIOENCODING: 'utf-8', PYTHONUNBUFFERED: '1' };
}

export function git(dossier, ...args) {
  return execFileSync('git', args, { cwd: dossier, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

/* Dépôt de travail dans dossier : copie de scripts/, docs/ (sans le vrai
   data.json) et admin/, réglages de test, data.json tiré du faux dashboard ;
   premier commit poussé vers un dépôt distant local (branche main suivie). */
export async function preparerDepot(dossier, dashboard) {
  const racine = path.join(dossier, 'depot');
  const distant = path.join(dossier, 'distant.git');
  for (const sous of ['scripts', 'docs', 'admin']) {
    await fs.cp(path.join(RACINE_DEPOT, sous), path.join(racine, sous),
      { recursive: true, filter: (source) => !source.includes('__pycache__') });
  }
  await fs.rm(path.join(racine, 'docs', 'data.json'), { force: true });
  for (const fichier of ['.gitignore', '.gitattributes']) {
    await fs.copyFile(path.join(RACINE_DEPOT, fichier), path.join(racine, fichier));
  }
  await fs.mkdir(path.join(racine, 'config'));
  for (const [nom, contenu] of Object.entries(REGLAGES)) {
    await fs.writeFile(path.join(racine, 'config', nom + '.json'), JSON.stringify(contenu, null, 2) + '\n');
  }
  // Asynchrone : le faux dashboard tourne dans ce processus et doit pouvoir répondre.
  await promisify(execFile)(PYTHON, ['scripts/export.py', '--no-git', '--sans-recherche'],
    { cwd: racine, env: environnement(dashboard), encoding: 'utf8' });
  git(dossier, 'init', '-q', '--bare', '-b', 'main', distant);
  git(racine, 'init', '-q', '-b', 'main');
  git(racine, 'config', 'user.name', 'test');
  git(racine, 'config', 'user.email', 'test@example.invalid');
  git(racine, 'remote', 'add', 'origin', distant);
  git(racine, 'add', '.');
  git(racine, 'commit', '-q', '-m', 'init');
  git(racine, 'push', '-q', '-u', 'origin', 'main');
  return { racine, distant };
}

/* Lance scripts/admin.py (port libre, sans navigateur) ; attend l'adresse
   qu'il affiche, jeton compris. */
export async function lancerAdmin(racine, dashboard) {
  const processus = spawn(PYTHON, ['scripts/admin.py', '--port', '0', '--sans-navigateur'],
    { cwd: racine, env: environnement(dashboard), stdio: ['ignore', 'pipe', 'pipe'] });
  let sortie = '';
  const adresse = await new Promise((ok, ko) => {
    const delai = setTimeout(() => {
      processus.kill();
      ko(new Error('admin.py ne démarre pas :\n' + sortie));
    }, 15000);
    const lire = (morceau) => {
      sortie += morceau;
      const trouve = /Adresse : (http:\/\/127\.0\.0\.1:\d+\/admin\/#jeton=[\w-]+)/.exec(sortie);
      if (trouve) {
        clearTimeout(delai);
        ok(trouve[1]);
      }
    };
    processus.stdout.setEncoding('utf8').on('data', lire);
    processus.stderr.setEncoding('utf8').on('data', lire);
    processus.once('exit', (code) => {
      clearTimeout(delai);
      ko(new Error(`admin.py s’est arrêté (code ${code}) :\n${sortie}`));
    });
  });
  return {
    adresse,
    base: adresse.slice(0, adresse.indexOf('admin/')),
    jeton: adresse.slice(adresse.indexOf('#jeton=') + 7),
    sortie: () => sortie,
    arreter: () => new Promise((ok) => {
      if (processus.exitCode !== null) return ok();
      processus.once('exit', () => ok());
      processus.kill();
    }),
  };
}

/* Banc complet ; fermer() arrête tout et efface le dossier temporaire. */
export async function ouvrirBanc() {
  const dossier = await fs.mkdtemp(path.join(os.tmpdir(), 'mv-admin-'));
  const effacer = () => fs.rm(dossier, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  const dashboard = await demarrerDashboard();
  let depot;
  let admin;
  try {
    depot = await preparerDepot(dossier, dashboard);
    admin = await lancerAdmin(depot.racine, dashboard);
  } catch (erreur) {
    // Montage raté (admin/ absent, Python introuvable…) : tout est arrêté,
    // sinon le faux dashboard garderait Node en vie et le test ne finirait pas.
    await dashboard.arreter();
    await effacer();
    throw erreur;
  }
  dashboard.etat.recherches = 0;
  return {
    dossier,
    ...depot,
    dashboard,
    admin,
    lire: async (relatif) => JSON.parse(await fs.readFile(path.join(depot.racine, relatif), 'utf8')),
    ecrire: (relatif, texte) => fs.appendFile(path.join(depot.racine, relatif), texte),
    remplacer: (relatif, texte) => fs.writeFile(path.join(depot.racine, relatif), texte),
    git: (...args) => git(depot.racine, ...args),
    gitDistant: (...args) => git(depot.distant, ...args),
    async fermer() {
      await admin.arreter();
      await dashboard.arreter();
      await effacer();
    },
  };
}
```

L'export initial est lancé de façon **asynchrone** : le faux dashboard tourne dans le même processus Node, un `execFileSync` le bloquerait (l'export attendrait une réponse qui ne viendrait jamais).

- [ ] **Step 3: Écrire les tests Node du modèle**

Créer `tests/js/admin.test.mjs` :

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../../admin/modele.js';

/* État minimal au format de GET /api/etat (scripts/admin.py). */
function etat() {
  return {
    fichiers: {
      projets: {
        _aide: 'Mode d’emploi.',
        version: 2,
        familles: [{ id: 'jeux', nom: 'Jeux', couleur: 1 }, { id: 'ia', nom: 'IA', couleur: 3 }],
        projets: { depths: { nom: 'Depths', famille: 'jeux' }, jarvis: { famille: 'ia' } },
        tags_generiques: [],
        tags_exclus: [],
      },
      entrees: { _aide: 'Corrections.' },
      recherche: { synonymes: [['ia', 'intelligence artificielle'], ['jeu', 'game']] },
    },
    donnees: {
      projets: [
        { id: 'jarvis', nom: 'Jarvis', description: 'Assistant vocal.', nb: 2,
          lien_principal: { url: 'https://exemple.github.io/jarvis/', genre: 'site' } },
        { id: 'depths', nom: 'Depths', description: null, nb: 1, lien_principal: null },
        { id: 'rogue-lite', nom: 'Rogue lite', description: null, nb: 1, lien_principal: null },
      ],
      entrees: [
        { id: 'a'.repeat(64), titre: 'Jarvis — architecture', resume: 'Pipeline vocal.', type: 'architecture',
          projet: 'jarvis', liens: [{ type: 'en_ligne', valeur: 'https://github.com/exemple/jarvis' },
            { type: 'en_ligne', valeur: 'https://exemple.github.io/jarvis/' }, { type: 'local', valeur: 'D:\\jarvis' }] },
        { id: 'b'.repeat(64), titre: 'Titre corrigé', resume: 'Le mot de réveil.', type: 'milestone',
          projet: 'jarvis', liens: [], corrige: true },
        { id: 'c'.repeat(64), titre: 'Depths — donjon', resume: 'Salles.', type: 'note', projet: 'depths', liens: [] },
      ],
    },
    originaux: {
      aaaaaaaaaaaa: { titre: 'Jarvis — architecture', resume: 'Pipeline vocal.' },
      bbbbbbbbbbbb: { titre: 'Jarvis — premier réveil', resume: 'Le mot de réveil.' },
      cccccccccccc: { titre: 'Depths — donjon', resume: 'Salles.' },
    },
    git: { branche: 'main', modifies: [], commits_en_attente: 0, refus_publication: null },
  };
}

test('modèle : brouillon copié, aucune modification au départ', () => {
  const modele = M.creerModele(etat());
  assert.deepEqual(M.fichiersModifies(modele), []);
  assert.notEqual(modele.brouillon.projets, modele.original.projets);
  assert.equal(modele.git.branche, 'main');
});

test('modèle : fichiers absents, valeurs par défaut', () => {
  const modele = M.creerModele({ fichiers: {}, donnees: null });
  assert.deepEqual(modele.brouillon.entrees, {});
  assert.deepEqual(modele.brouillon.recherche, { synonymes: [] });
  assert.equal(modele.brouillon.projets.version, 2);
  assert.deepEqual(modele.originaux, {});
});

test('modifications : détectées par fichier, indifférentes à l’ordre des clés', () => {
  const modele = M.creerModele(etat());
  modele.brouillon.entrees.aaaaaaaaaaaa = { masquer: true };
  modele.brouillon.projets.projets.depths = { famille: 'jeux', nom: 'Depths' };
  assert.deepEqual(M.fichiersModifies(modele), ['entrees']);
  modele.brouillon.projets.projets.depths.nom = 'Depths II';
  assert.deepEqual(M.fichiersModifies(modele), ['projets', 'entrees']);
  M.marquerEnregistre(modele, 'projets');
  assert.deepEqual(M.fichiersModifies(modele), ['entrees']);
  modele.brouillon.projets.projets.depths.nom = 'Depths III';
  assert.equal(modele.original.projets.projets.depths.nom, 'Depths II', 'l’original est une copie');
});

test('modèle : empreintes gardées, fichier relu sous une autre forme à réécrire', () => {
  const modele = M.creerModele({ ...etat(), empreintes: { projets: 'e1', entrees: 'e2', recherche: '' },
    normalisations: { entrees: ['config/entrees.json, entrée … : « masquer » vaut "false"'] } });
  assert.deepEqual(M.fichiersModifies(modele), ['entrees'], 'Enregistrer écrira la forme de la page');
  M.marquerEnregistre(modele, 'entrees', 'e3');
  assert.deepEqual(M.fichiersModifies(modele), []);
  assert.deepEqual(modele.empreintes, { projets: 'e1', entrees: 'e3', recherche: '' });
});

test('slug et termes', () => {
  assert.equal(M.slug('  Jeux & univers de jeu '), 'jeux-univers-de-jeu');
  assert.equal(M.slug('Éducation — Cours'), 'education-cours');
  assert.equal(M.slug('&&'), '');
  assert.deepEqual(M.termes(' ia, intelligence artificielle ,, llm, ia '), ['ia', 'intelligence artificielle', 'llm']);
  assert.deepEqual(M.termes(''), []);
});
```

- [ ] **Step 4: Écrire les tests navigateur**

Créer `tests/navigateur/admin.test.mjs` :

```js
/* Page d'admin locale : parcours dans le navigateur, contre scripts/admin.py
   lancé sur un dépôt temporaire (banc-admin.mjs). */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { CHROME, pageInstrumentee, terminer, debordement } from './outils.mjs';
import { ouvrirBanc } from './banc-admin.mjs';

let navigateur;
before(async () => { navigateur = await chromium.launch({ executablePath: CHROME, headless: true }); });
after(async () => { await navigateur.close(); });

/* Banc neuf (dépôt, faux dashboard, admin.py) et page d'admin ouverte avec son jeton. */
async function ouvrirAdmin(t) {
  const banc = await ouvrirBanc();
  t.after(() => banc.fermer());
  const page = await pageInstrumentee(navigateur);
  await page.goto(banc.admin.adresse);
  await page.locator('#panneau-projets:not([hidden])').waitFor();
  return { banc, page };
}

/* Clique, puis attend le compte rendu de ce titre exact (pas celui d'avant). */
async function cliquerEtAttendre(page, bouton, titre) {
  await page.click(bouton);
  await page.waitForFunction((attendu) => document.getElementById('compte-rendu-titre').textContent === attendu, titre);
}

// ------------------------------------------------------------ ouverture

test('ouverture : jeton lu puis retiré de l’adresse, onglets, état git', async (t) => {
  const { page } = await ouvrirAdmin(t);
  assert.equal(await page.evaluate(() => location.hash), '', 'le jeton ne reste pas dans l’adresse');
  assert.equal(await page.title(), 'Réglages — Mémoire Vive');
  assert.equal(await page.isVisible('#onglets'), true);
  assert.equal(await page.isHidden('#status'), true);
  assert.equal(await page.textContent('#etat-modifs'), 'Tout est enregistré.');
  assert.equal(await page.textContent('#etat-git'), 'Branche main · rien en attente de publication.');
  assert.equal(await page.getAttribute('#onglet-projets', 'aria-selected'), 'true');
  assert.ok(await debordement(page) <= 0, 'aucun défilement horizontal à 1280 px');
  await terminer(page);
});

test('sans jeton ou avec un jeton faux : message clair, aucun réglage affiché', async (t) => {
  const { banc, page } = await ouvrirAdmin(t);
  await page.goto(banc.admin.base + 'admin/');
  await page.evaluate(() => sessionStorage.clear());
  await page.reload();
  await page.locator('#status.error').waitFor();
  assert.match(await page.textContent('#status'), /^Jeton absent : ouvrir cette page avec « Gérer Mémoire Vive »/);
  assert.equal(await page.isHidden('#onglets'), true);
  await page.goto(banc.admin.base + 'admin/#jeton=faux');
  await page.reload();
  await page.locator('#status.error', { hasText: 'Accès refusé' }).waitFor();
  assert.equal(await page.isHidden('#panneau-projets'), true);
  // La seule erreur de console attendue : le refus 403 du serveur.
  assert.ok(page.erreurs.length > 0 && page.erreurs.every((e) => e.includes('403')), page.erreurs.join('\n'));
  page.erreurs.length = 0;
  await terminer(page);
});

test('onglets au clavier : flèches, Début, Fin', async (t) => {
  const { page } = await ouvrirAdmin(t);
  await page.focus('#onglet-projets');
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'onglet-familles');
  assert.equal(await page.isVisible('#panneau-familles'), true);
  assert.equal(await page.isHidden('#panneau-projets'), true);
  await page.keyboard.press('End');
  assert.equal(await page.getAttribute('#onglet-recherche', 'aria-selected'), 'true');
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'onglet-projets');
  await page.keyboard.press('ArrowLeft');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'onglet-recherche');
  await terminer(page);
});

test('Enregistrer sans modification : « Rien à enregistrer »', async (t) => {
  const { page } = await ouvrirAdmin(t);
  await cliquerEtAttendre(page, '#bouton-enregistrer', 'Rien à enregistrer');
  assert.equal(await page.textContent('#annonce'), 'Rien à enregistrer : Aucune modification en attente.');
  await terminer(page);
});
```

- [ ] **Step 5: Lancer les tests pour vérifier qu'ils échouent**

Run: `node --test tests/js/admin.test.mjs`
Expected: FAIL — `ERR_MODULE_NOT_FOUND` (`Cannot find module …/admin/modele.js`).

Run: `cd tests/navigateur; node --test admin.test.mjs`
Expected: FAIL — les 4 tests, sur `ENOENT` (copie de `admin/`, qui n'existe pas encore).

- [ ] **Step 6: Créer `admin/package.json`**

```json
{
  "type": "module"
}
```

- [ ] **Step 7: Créer `admin/modele.js`**

```js
/* Modèle de la page d'admin : brouillon des trois fichiers de réglages
   (config/projets.json, entrees.json, recherche.json), opérations de
   l'interface, fichiers modifiés. Module pur, sans DOM : testé sous Node. */

export const FICHIERS = ['projets', 'entrees', 'recherche'];
export const LIBELLES = { projets: 'projets et familles', entrees: 'entrées', recherche: 'recherche' };
// Indices 1 à 6 de --famille-N dans docs/style.css.
export const COULEURS = ['violet', 'bleu', 'vert', 'ocre', 'framboise', 'olive'];

const clone = (valeur) => structuredClone(valeur);

/* JSON à clés triées : deux réglages égaux s'écrivent pareil, quel que soit
   l'ordre dans lequel leurs clés ont été posées. */
function stable(valeur) {
  if (Array.isArray(valeur)) return '[' + valeur.map(stable).join(',') + ']';
  if (valeur && typeof valeur === 'object') {
    return '{' + Object.keys(valeur).sort().map((k) => JSON.stringify(k) + ':' + stable(valeur[k])).join(',') + '}';
  }
  return JSON.stringify(valeur);
}

/* Identifiant tiré d'un nom : minuscules sans accents, tirets. */
export function slug(texte) {
  return String(texte || '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/* « a, b ,c » → ['a', 'b', 'c'] : sans espaces autour, sans vides ni doublons. */
export function termes(texte) {
  return Array.from(new Set(String(texte || '').split(',').map((t) => t.trim()).filter(Boolean)));
}

/* Modèle tiré de GET /api/etat : original (tel qu'enregistré) et brouillon
   (modifié par l'interface) ; empreinte de chaque fichier lu, renvoyée avec
   chaque enregistrement (le serveur refuse d'écraser un fichier modifié
   ailleurs entre-temps). */
export function creerModele(etat) {
  const fichiers = (etat && etat.fichiers) || {};
  const original = {
    projets: fichiers.projets || { version: 2, familles: [], projets: {}, tags_generiques: [], tags_exclus: [] },
    entrees: fichiers.entrees || {},
    recherche: fichiers.recherche || { synonymes: [] },
  };
  const modele = {
    original: clone(original),
    brouillon: clone(original),
    empreintes: Object.assign({}, etat && etat.empreintes),
    donnees: (etat && etat.donnees) || null,
    originaux: (etat && etat.originaux) || {},
    git: (etat && etat.git) || null,
  };
  // Fichier lu sous une forme que le serveur a ramenée à la sienne
  // (normalisations) : à réécrire, donc modifié jusqu'au prochain enregistrement.
  for (const nom of Object.keys((etat && etat.normalisations) || {})) {
    if (FICHIERS.includes(nom)) modele.original[nom] = null;
  }
  return modele;
}

/* Fichiers dont le brouillon diffère de ce qui est enregistré, dans l'ordre de FICHIERS. */
export function fichiersModifies(modele) {
  return FICHIERS.filter((nom) => stable(modele.brouillon[nom]) !== stable(modele.original[nom]));
}

/* empreinte : celle du fichier écrit, renvoyée par le serveur. */
export function marquerEnregistre(modele, nom, empreinte) {
  modele.original[nom] = clone(modele.brouillon[nom]);
  if (typeof empreinte === 'string') modele.empreintes[nom] = empreinte;
}
```

- [ ] **Step 8: Créer `admin/index.html`**

```html
<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="referrer" content="no-referrer">
<meta name="robots" content="noindex, nofollow">
<meta name="color-scheme" content="light dark">
<title>Réglages — Mémoire Vive</title>
<link rel="icon" href="../favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="../style.css">
<link rel="stylesheet" href="admin.css">
<script src="../theme.js"></script>
<script type="module" src="admin.js"></script>
</head>
<body class="admin">
<a class="skip-link" href="#contenu">Aller au contenu</a>

<!-- La page défile au-dessus de la barre du bas, qui ne cache donc jamais rien. -->
<div class="admin-defilement">
<div class="wrap admin-wrap">
  <header class="site-header">
    <div class="header-top">
      <h1>Réglages de Mémoire Vive</h1>
      <a class="btn-secondary" href="/" target="memoire-vive-apercu">Site local ↗</a>
    </div>
    <p class="subtitle">Page locale, jamais publiée. <strong>Enregistrer</strong> garde les réglages sur cet ordinateur, <strong>Aperçu</strong> les montre sur le site local, <strong>Publier</strong> met le site public à jour.</p>
    <p class="stats" id="etat-git"></p>
    <div class="admin-onglets" role="tablist" aria-label="Réglages" id="onglets" hidden>
      <button type="button" role="tab" id="onglet-projets" aria-controls="panneau-projets" aria-selected="true">Projets</button>
      <button type="button" role="tab" id="onglet-familles" aria-controls="panneau-familles" aria-selected="false" tabindex="-1">Familles</button>
      <button type="button" role="tab" id="onglet-entrees" aria-controls="panneau-entrees" aria-selected="false" tabindex="-1">Entrées</button>
      <button type="button" role="tab" id="onglet-recherche" aria-controls="panneau-recherche" aria-selected="false" tabindex="-1">Recherche</button>
    </div>
  </header>

  <main id="contenu" tabindex="-1">
    <div class="status" id="status">Chargement des réglages…</div>

    <section id="panneau-projets" role="tabpanel" aria-labelledby="onglet-projets" hidden>
      <div class="admin-colonnes">
        <div class="admin-liste">
          <label for="filtre-projets">Filtrer les projets</label>
          <input type="search" id="filtre-projets" placeholder="Nom, identifiant ou famille" autocomplete="off" spellcheck="false">
          <p class="admin-aide" id="compte-projets" aria-live="polite"></p>
          <ul class="admin-items" id="liste-projets" aria-label="Projets"></ul>
        </div>
        <div class="admin-detail" id="detail-projet"></div>
      </div>
    </section>

    <section id="panneau-familles" role="tabpanel" aria-labelledby="onglet-familles" hidden>
      <div class="admin-detail">
        <h2>Familles</h2>
        <p class="admin-aide">Ordre d’affichage sur l’accueil du site, puis « Sans famille ». La couleur borde les cartes des projets de la famille ; son nom est toujours écrit à côté.</p>
        <ol class="admin-familles" id="liste-familles"></ol>
        <div class="champ admin-ajout">
          <label for="nouvelle-famille">Nouvelle famille</label>
          <div class="admin-ligne">
            <input type="text" id="nouvelle-famille" autocomplete="off">
            <button type="button" class="btn-secondary" id="bouton-ajouter-famille">Ajouter la famille</button>
          </div>
        </div>
      </div>
    </section>

    <section id="panneau-entrees" role="tabpanel" aria-labelledby="onglet-entrees" hidden>
      <div class="admin-colonnes">
        <div class="admin-liste">
          <label for="filtre-entrees">Chercher une entrée</label>
          <input type="search" id="filtre-entrees" placeholder="Titre, projet ou identifiant" autocomplete="off" spellcheck="false">
          <p class="admin-aide" id="compte-entrees" aria-live="polite"></p>
          <ul class="admin-items" id="liste-entrees" aria-label="Entrées"></ul>
        </div>
        <div class="admin-detail" id="detail-entree"></div>
      </div>
    </section>

    <section id="panneau-recherche" role="tabpanel" aria-labelledby="onglet-recherche" hidden>
      <div class="admin-detail">
        <h2>Synonymes</h2>
        <p class="admin-aide">Chaque groupe réunit des termes équivalents pour la recherche du site, séparés par des virgules (majuscules et accents indifférents) : chercher l’un trouve aussi les autres.</p>
        <ol class="admin-groupes" id="liste-groupes"></ol>
        <button type="button" class="btn-secondary" id="bouton-ajouter-groupe">Ajouter un groupe</button>
      </div>
    </section>
  </main>
</div>
</div>

<div class="admin-barre" role="region" aria-label="Enregistrer et publier">
  <div class="admin-barre-dedans">
    <div class="admin-barre-haut">
      <p id="etat-modifs"></p>
      <div class="admin-boutons">
        <button type="button" class="btn-primary" id="bouton-enregistrer" disabled>Enregistrer</button>
        <button type="button" class="btn-secondary" id="bouton-apercu" disabled>Aperçu</button>
        <button type="button" class="btn-secondary" id="bouton-publier" disabled>Publier</button>
      </div>
    </div>
    <section class="admin-compte-rendu" id="compte-rendu" aria-labelledby="compte-rendu-titre" hidden>
      <div class="admin-compte-rendu-tete">
        <h2 id="compte-rendu-titre" tabindex="-1"></h2>
        <button type="button" class="link-button" id="fermer-compte-rendu">Fermer</button>
      </div>
      <div id="compte-rendu-message"></div>
      <details id="compte-rendu-details" hidden>
        <summary>Détail de l’export</summary>
        <pre id="compte-rendu-sortie"></pre>
      </details>
    </section>
    <p class="visually-hidden" id="annonce" role="status" aria-live="polite"></p>
  </div>
</div>
</body>
</html>
```

- [ ] **Step 9: Créer `admin/admin.css`**

```css
/* Page d'admin locale : mises en page propres à l'admin. Couleurs, boutons,
   pastilles, familles et typographie viennent de ../style.css (mêmes jetons,
   thèmes clair et sombre). */

:root {
  /* Bord des champs : contraste ≥ 3 sur --bg, --surface et --surface-2 (WCAG 1.4.11). */
  --champ-bord: #857E6E;
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) { --champ-bord: #827B6A; }
}

:root[data-theme="dark"] { --champ-bord: #827B6A; }

/* Page en colonne : la zone de réglages défile, la barre du bas reste en
   dessous (jamais par-dessus le contenu, même quand le compte rendu s'ouvre). */
body.admin { height: 100vh; display: flex; flex-direction: column; }
.admin-defilement { flex: 1 1 auto; min-height: 0; overflow-y: auto; }
.admin-wrap { max-width: 1240px; padding-bottom: 32px; }
.admin .site-header h1 { font-size: 34px; }
.admin .header-top .btn-secondary { flex: none; }

/* ------------------------------------------------------------- onglets */

.admin-onglets {
  display: inline-flex; margin-bottom: 26px;
  border: 1px solid var(--border); border-radius: 12px; overflow: hidden; background: var(--surface);
}
.admin-onglets [role="tab"] {
  border: 0; background: transparent; color: var(--text-muted);
  padding: 11px 18px; font: 600 14px var(--sans); cursor: pointer;
}
.admin-onglets [role="tab"] + [role="tab"] { border-left: 1px solid var(--border); }
.admin-onglets [role="tab"]:hover { color: var(--text); }
.admin-onglets [role="tab"][aria-selected="true"] { background: var(--accent-fill); color: var(--on-accent); }
.admin-onglets [role="tab"]:focus-visible { outline-offset: -4px; border-radius: 9px; }
.admin-onglets [role="tab"][aria-selected="true"]:focus-visible { outline-color: var(--on-accent); }

/* ------------------------------------------------------ liste et fiche */

.admin-colonnes { display: grid; grid-template-columns: minmax(260px, 340px) minmax(0, 1fr); gap: 24px; align-items: start; }
.admin-liste { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.admin-liste > label { font: 600 14px var(--sans); }
.admin-items { list-style: none; margin: 0; padding: 0 4px 0 0; max-height: 62vh; overflow-y: auto; display: grid; gap: 6px; }
.admin-item {
  width: 100%; text-align: left; cursor: pointer;
  display: flex; flex-direction: column; gap: 2px;
  background: var(--surface); color: var(--text);
  border: 1px solid var(--border); border-left: 4px solid var(--famille); border-radius: 10px;
  padding: 8px 12px; font: 15px var(--sans);
}
.admin-item:hover { border-color: var(--border-strong); border-left-color: var(--famille); }
.admin-item[aria-current="true"] { border-color: var(--accent-fill); border-left-color: var(--famille); box-shadow: inset 0 0 0 1px var(--accent-fill); }
.admin-item-titre { font-weight: 600; overflow-wrap: anywhere; }
.admin-item-sous { font-size: 12px; color: var(--text-muted); }

.admin-detail {
  background: var(--surface); border: 1px solid var(--border); border-radius: 16px;
  padding: 22px 24px; min-width: 0;
}
.admin-detail h2 {
  font-family: var(--serif); font-weight: 600; font-size: 26px; line-height: 1.25;
  margin: 0 0 8px; overflow-wrap: anywhere;
}
.admin-detail h2:focus { outline: none; }
.admin-detail > .admin-aide:first-of-type { margin-bottom: 20px; }
.admin-vide { color: var(--text-muted); margin: 0; }

/* -------------------------------------------------------------- champs */

.champ { display: flex; flex-direction: column; gap: 6px; margin-bottom: 18px; min-width: 0; }
.champ > label { font: 600 14px var(--sans); }
.admin-aide { font-size: 13px; color: var(--text-muted); margin: 0; overflow-wrap: anywhere; }
.admin-ligne { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.admin-ligne > input, .admin-ligne > select { flex: 1 1 220px; min-width: 0; }

.admin input[type="text"], .admin input[type="url"], .admin input[type="search"], .admin textarea {
  width: 100%; padding: 10px 12px; border-radius: 10px;
  border: 1px solid var(--champ-bord); background: var(--bg); color: var(--text);
  font: 15px var(--sans);
}
.admin textarea { resize: vertical; line-height: 1.5; }
.admin input::placeholder, .admin textarea::placeholder { color: var(--text-muted); }
.admin select { border-color: var(--champ-bord); max-width: 100%; }
.admin input:focus-visible, .admin textarea:focus-visible, .admin select:focus-visible { outline: 2px solid var(--focus); outline-offset: 1px; }

.admin-case { display: grid; grid-template-columns: auto 1fr; align-items: center; column-gap: 10px; }
.admin-case input { width: 20px; height: 20px; margin: 0; accent-color: var(--accent-fill); }
.admin-case .admin-aide { grid-column: 2; }

.admin-origine { font-size: 13px; color: var(--text-muted); margin: -10px 0 18px; overflow-wrap: anywhere; }
.admin-origine-texte { color: var(--text); }

/* ------------------------------------------------------------ familles */

.admin-familles, .admin-groupes { list-style: none; margin: 0 0 20px; padding: 0; display: grid; gap: 8px; }
.admin-famille {
  display: grid; grid-template-columns: auto minmax(0, 1fr) 11rem 6rem auto; gap: 10px; align-items: center;
  border: 1px solid var(--border); border-left: 4px solid var(--famille); border-radius: 12px; padding: 8px 12px;
}
.admin-famille-compte { white-space: nowrap; }
.admin-famille .btn-secondary, .admin-groupe .btn-secondary { padding: 7px 12px; }
.admin-groupe { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; align-items: center; }
.admin-ajout { margin: 0; max-width: 560px; }

/* ------------------------------------------------------- barre du bas */

.admin-barre {
  flex: none; background: var(--surface); border-top: 1px solid var(--border-strong);
  box-shadow: 0 -4px 14px rgba(38, 37, 33, 0.08);
}
.admin-barre-dedans { max-width: 1240px; margin: 0 auto; padding: 12px 24px; }
.admin-barre-haut { display: flex; flex-wrap: wrap; gap: 10px 20px; align-items: center; justify-content: space-between; }
#etat-modifs { margin: 0; font-size: 14px; color: var(--text-muted); }
#etat-modifs.admin-a-enregistrer { color: var(--text); font-weight: 600; }
.admin-boutons { display: flex; gap: 8px; flex-wrap: wrap; }
.admin-boutons .btn-primary { flex: none; }
.admin-boutons button { min-width: 7.5rem; }
.admin-boutons [aria-disabled="true"], .admin-boutons [disabled] { opacity: 0.55; cursor: progress; }

.admin-compte-rendu {
  margin-top: 12px; padding-top: 10px; border-top: 1px solid var(--border);
  max-height: 38vh; overflow-y: auto;
}
.admin-compte-rendu-tete { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }
.admin-compte-rendu h2 { font: 700 15px var(--sans); margin: 0 0 6px; }
.admin-compte-rendu h2:focus { outline: none; }
.admin-compte-rendu[data-genre="erreur"] h2 { color: var(--danger); }
.admin-compte-rendu p, .admin-compte-rendu ul { margin: 0 0 8px; font-size: 14px; }
.admin-compte-rendu ul { padding-left: 20px; }
.admin-compte-rendu summary { cursor: pointer; font-size: 13px; color: var(--accent-strong); margin-bottom: 6px; }
.admin-compte-rendu pre {
  margin: 0; padding: 10px 12px; white-space: pre-wrap; overflow-wrap: anywhere;
  font: 12.5px/1.5 var(--mono); background: var(--surface-2); border: 1px solid var(--border); border-radius: 10px;
}

/* ------------------------------------------------------ écran étroit */

@media (max-width: 820px) {
  .admin-colonnes { grid-template-columns: 1fr; }
  .admin-items { max-height: 40vh; }
  .admin-famille { grid-template-columns: auto minmax(0, 1fr); }
  .admin-famille > select, .admin-famille > .admin-famille-compte, .admin-famille > .admin-ligne { grid-column: 2; }
}
```

- [ ] **Step 10: Créer `admin/admin.js`**

```js
/* Page d'admin locale de Mémoire Vive, servie par scripts/admin.py (jamais
   publiée) : projets, familles, entrées et synonymes ; Enregistrer, Aperçu,
   Publier. Réutilise les composants, la recherche et le style du site ; le
   DOM est construit par el() (jamais d'innerHTML avec des données). */
import { el, plural } from '../js/composants.js';
import * as M from './modele.js';

const CLE_JETON = 'memoire-vive:admin-jeton';
const ONGLETS = ['projets', 'familles', 'entrees', 'recherche'];
const APERCU = 'memoire-vive-apercu';  // onglet de l'aperçu, réutilisé d'une fois sur l'autre

const $ = (id) => document.getElementById(id);
const dom = {
  status: $('status'), onglets: $('onglets'), etatGit: $('etat-git'), modifs: $('etat-modifs'), annonce: $('annonce'),
  enregistrer: $('bouton-enregistrer'), apercu: $('bouton-apercu'), publier: $('bouton-publier'),
  compteRendu: $('compte-rendu'), compteRenduTitre: $('compte-rendu-titre'),
  compteRenduMessage: $('compte-rendu-message'), compteRenduDetails: $('compte-rendu-details'),
  compteRenduSortie: $('compte-rendu-sortie'),
  fermerCompteRendu: $('fermer-compte-rendu'),
  filtreProjets: $('filtre-projets'), compteProjets: $('compte-projets'), listeProjets: $('liste-projets'),
  detailProjet: $('detail-projet'),
  listeFamilles: $('liste-familles'), nouvelleFamille: $('nouvelle-famille'), ajouterFamille: $('bouton-ajouter-famille'),
  filtreEntrees: $('filtre-entrees'), compteEntrees: $('compte-entrees'), listeEntrees: $('liste-entrees'),
  detailEntree: $('detail-entree'),
  listeGroupes: $('liste-groupes'), ajouterGroupe: $('bouton-ajouter-groupe'),
};

const ui = {
  jeton: '',
  modele: null,
  memo: {},          // titres déjà vus, par identifiant court (entrées masquées depuis)
  onglet: 'projets',
  projet: null,      // projet ouvert
  entree: null,      // identifiant court de l'entrée ouverte
  occupe: false,     // une opération (enregistrement, aperçu, publication) est en cours
};

class ErreurApi extends Error {
  constructor(message, details = []) {
    super(message);
    this.details = details;
  }
}

// ------------------------------------------------------------ serveur

/* Jeton tiré au lancement par admin.py, passé dans l'ancre (#jeton=…, jamais
   envoyée au serveur) : gardé pour l'onglet, puis retiré de l'adresse. */
function lireJeton() {
  const trouve = /(?:^#|&)jeton=([^&]+)/.exec(location.hash);
  if (trouve) {
    history.replaceState(null, '', location.pathname + location.search);
    const jeton = decodeURIComponent(trouve[1]);
    try { sessionStorage.setItem(CLE_JETON, jeton); } catch (e) { /* sans stockage : jeton gardé en mémoire */ }
    return jeton;
  }
  try { return sessionStorage.getItem(CLE_JETON) || ''; } catch (e) { return ''; }
}

async function api(methode, chemin, corps, entetes = {}) {
  const options = { method: methode, headers: Object.assign({ 'X-Admin-Jeton': ui.jeton }, entetes), cache: 'no-store' };
  if (corps !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(corps);
  }
  let reponse;
  try {
    reponse = await fetch(chemin, options);
  } catch (e) {
    throw new ErreurApi('Le serveur de la page d’admin ne répond pas : la fenêtre « Gérer Mémoire Vive » est-elle encore ouverte ?');
  }
  let donnees = null;
  try { donnees = await reponse.json(); } catch (e) { donnees = null; }
  if (reponse.status === 403) {
    throw new ErreurApi('Accès refusé : cette page n’a pas le bon jeton (la page d’admin a peut-être été relancée). Fermer cet onglet et relancer « Gérer Mémoire Vive ».');
  }
  if (!reponse.ok) {
    throw new ErreurApi((donnees && donnees.erreur) || 'Erreur ' + reponse.status + '.', (donnees && donnees.erreurs) || []);
  }
  return donnees;
}

// ------------------------------------------------------------ démarrage

async function demarrer() {
  lier();
  ui.jeton = lireJeton();
  if (!ui.jeton) {
    echec('Jeton absent : ouvrir cette page avec « Gérer Mémoire Vive » (l’adresse qu’il ouvre contient le jeton).');
    return;
  }
  try {
    await charger();
  } catch (e) {
    echec(e.message);
  }
}

function echec(message) {
  dom.status.hidden = false;
  dom.status.classList.add('error');
  dom.status.textContent = message;
  dom.onglets.hidden = true;
  for (const nom of ONGLETS) $('panneau-' + nom).hidden = true;
}

async function charger() {
  const etat = await api('GET', '/api/etat');
  ui.modele = M.creerModele(etat);
  dom.status.hidden = true;
  dom.onglets.hidden = false;
  for (const bouton of [dom.enregistrer, dom.apercu, dom.publier]) bouton.disabled = false;
  afficherOnglet(ui.onglet);
  rendreBarre();
  signalerLecture(etat);
}

/* Réglages modifiés hors de la page : lus sous une forme que la page a
   corrigée (à enregistrer), ou qui ne passent pas la vérification. */
function signalerLecture(etat) {
  const notes = Object.values(etat.normalisations || {}).flat();
  const erreurs = Object.values(etat.erreurs || {}).flat();
  if (erreurs.length) {
    rapport('erreur', 'Réglages à corriger', 'Ces réglages enregistrés ne passent pas la vérification : « Aperçu » et « Publier » sont refusés tant qu’ils ne sont pas corrigés (ici, ou à la main dans config/).',
      { details: [...notes, ...erreurs] });
  } else if (notes.length) {
    rapport('attente', 'Réglages relus', 'Ces réglages étaient écrits sous une forme que l’export accepte, mais que la page écrit autrement (même effet sur le site) : « Enregistrer » écrit la forme de la page.',
      { details: notes });
  }
}

async function rafraichirGit() {
  try { ui.modele.git = (await api('GET', '/api/etat')).git; } catch (e) { /* l'état affiché reste l'ancien */ }
}

// ------------------------------------------------------------ onglets

function afficherOnglet(nom, focus = false) {
  ui.onglet = nom;
  for (const autre of ONGLETS) {
    const onglet = $('onglet-' + autre);
    const actif = autre === nom;
    onglet.setAttribute('aria-selected', String(actif));
    onglet.tabIndex = actif ? 0 : -1;
    $('panneau-' + autre).hidden = !actif;
  }
  const rendre = PANNEAUX[nom];
  if (rendre) rendre();
  if (focus) $('onglet-' + nom).focus();
}

/* Flèches, Début et Fin déplacent l'onglet actif (motif « onglets » de l'ARIA). */
function clavierOnglets(event) {
  const i = ONGLETS.indexOf(ui.onglet);
  const cible = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: ONGLETS.length - 1 }[event.key];
  if (cible === undefined) return;
  event.preventDefault();
  afficherOnglet(ONGLETS[(cible + ONGLETS.length) % ONGLETS.length], true);
}

// ------------------------------------------------------------ barre et compte rendu

function rendreBarre() {
  const modifies = M.fichiersModifies(ui.modele);
  dom.modifs.textContent = modifies.length
    ? 'Modifications non enregistrées : ' + modifies.map((nom) => M.LIBELLES[nom]).join(', ') + '.'
    : 'Tout est enregistré.';
  dom.modifs.classList.toggle('admin-a-enregistrer', modifies.length > 0);
  rendreGit();
}

function rendreGit() {
  const git = ui.modele.git;
  if (!git) {
    dom.etatGit.textContent = 'Dossier hors de git : l’aperçu marche, la publication non.';
    return;
  }
  const enAttente = git.modifies.filter((chemin) => chemin.startsWith('config/') || chemin === 'docs/data.json');
  const parties = ['Branche ' + git.branche,
    enAttente.length ? 'pas encore publié : ' + enAttente.join(', ') : 'rien en attente de publication'];
  if (git.commits_en_attente) parties.push(plural(git.commits_en_attente, 'commit local non poussé', 'commits locaux non poussés'));
  dom.etatGit.textContent = parties.join(' · ') + '.'
    + (git.refus_publication ? ' Publier est impossible pour l’instant : ' + git.refus_publication : '');
}

/* genre : 'ok', 'erreur' ou 'attente'. Le titre est aussi annoncé aux lecteurs d'écran. */
function rapport(genre, titre, message, { details = [], sortie = '', apercu = false, focus = false } = {}) {
  dom.compteRendu.hidden = false;
  dom.compteRendu.dataset.genre = genre;
  dom.compteRenduTitre.textContent = titre;
  dom.compteRenduMessage.replaceChildren(...[
    el('p', null, message),
    details.length ? el('ul', null, details.map((detail) => el('li', null, detail))) : null,
    apercu ? el('p', null, el('a', { href: '/', target: APERCU }, 'Ouvrir l’aperçu du site ↗')) : null,
  ].filter(Boolean));
  // Sortie de l'export repliée, sauf en cas d'échec.
  dom.compteRenduSortie.textContent = sortie;
  dom.compteRenduDetails.hidden = !sortie;
  dom.compteRenduDetails.open = genre === 'erreur';
  dom.annonce.textContent = titre + ' : ' + message;
  if (focus) dom.compteRenduTitre.focus();
}

/* Une seule opération à la fois ; les boutons restent focalisables. */
async function executer(action) {
  if (ui.occupe || !ui.modele) return;
  ui.occupe = true;
  const boutons = [dom.enregistrer, dom.apercu, dom.publier];
  for (const bouton of boutons) bouton.setAttribute('aria-disabled', 'true');
  try {
    await action();
  } finally {
    ui.occupe = false;
    for (const bouton of boutons) bouton.removeAttribute('aria-disabled');
  }
}

async function enregistrer({ silencieux = false } = {}) {
  const modifies = M.fichiersModifies(ui.modele);
  if (!modifies.length) {
    if (!silencieux) rapport('ok', 'Rien à enregistrer', 'Aucune modification en attente.');
    return true;
  }
  if (!silencieux) rapport('attente', 'Enregistrement en cours…', 'Envoi des réglages à la page d’admin.');
  for (const nom of modifies) {
    let reponse;
    try {
      // Empreinte du fichier lu : le serveur refuse d'écraser une modification faite ailleurs entre-temps.
      reponse = await api('PUT', '/api/config/' + nom, ui.modele.brouillon[nom], { 'X-Admin-Base': ui.modele.empreintes[nom] || '' });
    } catch (e) {
      rendreBarre();
      rapport('erreur', 'Enregistrement refusé', e.message, { details: e.details, focus: true });
      return false;
    }
    M.marquerEnregistre(ui.modele, nom, reponse.empreinte);
  }
  await rafraichirGit();
  rendreBarre();
  if (!silencieux) {
    rapport('ok', 'Enregistré', 'Réglages enregistrés sur cet ordinateur : ' + modifies.map((nom) => M.LIBELLES[nom]).join(', ')
      + '. « Aperçu » les montre sur le site local, « Publier » les met en ligne.');
  }
  return true;
}

// ------------------------------------------------------------ événements

const PANNEAUX = {};

function lier() {
  for (const nom of ONGLETS) $('onglet-' + nom).addEventListener('click', () => afficherOnglet(nom, true));
  dom.onglets.addEventListener('keydown', clavierOnglets);
  dom.enregistrer.addEventListener('click', () => executer(() => enregistrer()));
  dom.fermerCompteRendu.addEventListener('click', () => {
    dom.compteRendu.hidden = true;
    dom.enregistrer.focus();
  });
  // Alerte du navigateur si l'on quitte avec des modifications non enregistrées.
  window.addEventListener('beforeunload', (event) => {
    if (ui.modele && M.fichiersModifies(ui.modele).length) {
      event.preventDefault();
      event.returnValue = '';
    }
  });
}

demarrer();
```

- [ ] **Step 11: Lancer les tests pour vérifier qu'ils passent**

Run: `node --test tests/js/admin.test.mjs`
Expected: 5 tests réussis.

Run: `cd tests/navigateur; node --test admin.test.mjs`
Expected: 4 tests réussis, aucune erreur de console ni de CSP (hormis le refus 403 attendu du test « jeton faux », que le test retire lui-même).

- [ ] **Step 12: Toutes les suites du site**

Run: `node --test "tests/js/*.test.mjs"`
Expected: 58 tests réussis.

Run: `cd tests/navigateur; npm test`
Expected: 108 tests réussis (les 104 du site, inchangés par la sortie de `pageInstrumentee`, et les 4 nouveaux).

- [ ] **Step 13: Contrôle visuel**

Run: `python scripts/admin.py` (le navigateur s'ouvre sur la page). Expected : en-tête « Réglages de Mémoire Vive », ligne git « Branche chantier-c · … Publier est impossible pour l'instant : la copie de travail est sur la branche « chantier-c »… » (normal ici, Choix 18), quatre onglets (flèches du clavier), barre du bas « Tout est enregistré. » ; en clair et en sombre (choisir « Sombre » avec le bouton de thème du site local, lien « Site local ↗ », puis recharger la page d'admin : même origine, même réglage), fenêtre de 1280 px, sans défilement horizontal. Ne pas cliquer « Aperçu » ni « Publier » ici. Ctrl+C.

- [ ] **Step 14: Commit**

```bash
git add admin tests/js/admin.test.mjs tests/navigateur/outils.mjs tests/navigateur/banc-admin.mjs tests/navigateur/admin.test.mjs
git commit -m "Admin : page locale, jeton, onglets, Enregistrer ; banc de tests navigateur

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Page d'admin : projets et familles

Onglet Projets (spec § 5.3) : liste filtrable (nom, identifiant ou famille) et fiche du projet choisi — nom affiché, famille, description, lien principal (un des liens en ligne du projet, ou une autre adresse), alias (un seul par slug), « Fusionner dans… ». Onglet Familles : ajouter, renommer, réordonner, couleur, supprimer (Choix 9). Toute saisie modifie le brouillon ; la barre dit ce qui reste à enregistrer. Le parcours « fichier modifié ailleurs » (Choix 20) se teste ici, sur la fiche d'un projet.

**Files:**

- Modify: `admin/modele.js` (sections projets et familles), `admin/admin.js` (import de `normalize` ; aides de formulaire ; panneaux Projets et Familles ; `PANNEAUX` ; écouteurs)
- Test: `tests/js/admin.test.mjs`, `tests/navigateur/admin.test.mjs`

**Interfaces:**

- Consumes: Task 5 (`creerModele`, `fichiersModifies`, `slug`, `termes`, `COULEURS`, `rapport`, `enregistrer`, `rendreBarre`, `dom`, `ui`, `APERCU`) ; `normalize(texte)` de `docs/js/recherche.js`.
- Produces:
  - `admin/modele.js` : `reglageProjet(modele, id) -> object`, `aliasDe(reglage) -> string[]` (un texte seul lu comme une liste), `liensDuProjet(modele, id) -> string[]`, `listeProjets(modele) -> [{ id, nom, nomPublie, descriptionPubliee, famille, nb }]` (sans les projets devenus alias, triée par nom), `modifierProjet(modele, id, champ, valeur)` (valeur vide : clé retirée ; projet sans réglage : retiré ; alias : un seul par slug), `fusionner(modele, source, cible)`, `familles(modele) -> [{ id, nom, couleur }]`, `ajouterFamille(modele, nom) -> id`, `modifierFamille(modele, id, champ, valeur)` (`'nom'` ou `'couleur'`), `deplacerFamille(modele, id, sens) -> boolean`, `supprimerFamille(modele, id)`, `nombreDeProjets(modele, id) -> number`.
  - `admin/admin.js` : `champ(id, libelle, controle, aide)`, `correspond(texte, requete)`, `famille(id)`, `nomFamille(id)`, `nomProjet(id)`, `vide(texte)` (aussi utilisés en Task 7) ; identifiants de la fiche : `titre-projet`, `projet-nom`, `projet-famille`, `projet-description`, `projet-lien` (option `autre`), `projet-lien-autre-bloc`, `projet-lien-autre`, `projet-alias`, `projet-fusion`, `bouton-fusionner` ; lignes de familles `li[data-id]` avec `famille-nom-<n>`, `famille-couleur-<n>` et boutons `[data-action="monter" | "descendre" | "supprimer"]`.
  - `tests/navigateur/admin.test.mjs` : `accepterDialogue(page) -> Promise<message>`, `choisirProjet(page, nom)`, `refusAttendu(page, statut)`.

- [ ] **Step 1: Tests Node du modèle**

Ajouter à la fin de `tests/js/admin.test.mjs`, après une ligne vide :

```js
test('projets : données et réglages réunis, triés par nom, fusionnés masqués', () => {
  const modele = M.creerModele(etat());
  assert.deepEqual(M.listeProjets(modele).map((p) => [p.id, p.nom, p.famille, p.nb]),
    [['depths', 'Depths', 'jeux', 1], ['jarvis', 'Jarvis', 'ia', 2], ['rogue-lite', 'Rogue lite', null, 1]]);
  modele.brouillon.projets.projets.depths.alias = ['Rogue Lite'];
  assert.deepEqual(M.listeProjets(modele).map((p) => p.id), ['depths', 'jarvis']);
});

test('projets : liens en ligne du projet, principal publié d’abord, sans doublon', () => {
  const modele = M.creerModele(etat());
  assert.deepEqual(M.liensDuProjet(modele, 'jarvis'), ['https://exemple.github.io/jarvis/', 'https://github.com/exemple/jarvis']);
  assert.deepEqual(M.liensDuProjet(modele, 'inconnu'), []);
});

test('projets : une valeur vide retire le réglage, un projet sans réglage disparaît', () => {
  const modele = M.creerModele(etat());
  M.modifierProjet(modele, 'rogue-lite', 'nom', '  Rogue  ');
  assert.deepEqual(modele.brouillon.projets.projets['rogue-lite'], { nom: 'Rogue' });
  M.modifierProjet(modele, 'rogue-lite', 'nom', ' ');
  assert.equal('rogue-lite' in modele.brouillon.projets.projets, false);
  M.modifierProjet(modele, 'jarvis', 'famille', null);
  assert.equal('jarvis' in modele.brouillon.projets.projets, false);
  M.modifierProjet(modele, 'depths', 'alias', []);
  assert.deepEqual(modele.brouillon.projets.projets.depths, { nom: 'Depths', famille: 'jeux' });
});

test('alias : un seul par slug, un texte seul lu comme une liste', () => {
  const modele = M.creerModele(etat());
  M.modifierProjet(modele, 'depths', 'alias', ['rogue-lite', 'Rogue Lite', 'roguelike']);
  assert.deepEqual(modele.brouillon.projets.projets.depths.alias, ['rogue-lite', 'roguelike']);
  assert.deepEqual(M.aliasDe({ alias: 'rogue-lite' }), ['rogue-lite']);
  assert.deepEqual(M.aliasDe({}), []);
  modele.brouillon.projets.projets.depths.alias = 'rogue-lite';
  assert.deepEqual(M.listeProjets(modele).map((p) => p.id), ['depths', 'jarvis'], 'rogue-lite rattaché à depths');
});

test('fusion : la source et ses alias deviennent alias de la cible, ses réglages disparaissent', () => {
  const modele = M.creerModele(etat());
  M.modifierProjet(modele, 'rogue-lite', 'alias', ['roguelike']);
  M.modifierProjet(modele, 'rogue-lite', 'nom', 'Rogue');
  M.fusionner(modele, 'rogue-lite', 'depths');
  assert.deepEqual(modele.brouillon.projets.projets.depths, { nom: 'Depths', famille: 'jeux', alias: ['rogue-lite', 'roguelike'] });
  assert.equal('rogue-lite' in modele.brouillon.projets.projets, false);
  assert.deepEqual(M.listeProjets(modele).map((p) => p.id), ['depths', 'jarvis']);
  M.fusionner(modele, 'depths', 'depths');
  assert.deepEqual(modele.brouillon.projets.projets.depths.alias, ['rogue-lite', 'roguelike'], 'sur lui-même : rien');
  M.modifierProjet(modele, 'jarvis', 'alias', ['Rogue-Lite']);
  M.fusionner(modele, 'jarvis', 'depths');
  assert.deepEqual(modele.brouillon.projets.projets.depths.alias, ['rogue-lite', 'roguelike', 'jarvis'], 'sans doublon de slug');
});

test('familles : ajouter (identifiant unique, couleur libre), renommer, couleur, déplacer', () => {
  const modele = M.creerModele(etat());
  assert.equal(M.ajouterFamille(modele, ' Jeux '), 'jeux-2');
  assert.equal(M.ajouterFamille(modele, 'Outils Claude'), 'outils-claude');
  assert.deepEqual(M.familles(modele).slice(2), [{ id: 'jeux-2', nom: 'Jeux', couleur: 2 }, { id: 'outils-claude', nom: 'Outils Claude', couleur: 4 }]);
  M.modifierFamille(modele, 'outils-claude', 'couleur', '6');
  M.modifierFamille(modele, 'jeux', 'nom', ' Jeux & univers ');
  assert.equal(M.familles(modele)[3].couleur, 6);
  assert.equal(M.familles(modele)[0].nom, 'Jeux & univers');
  assert.equal(M.deplacerFamille(modele, 'ia', -1), true);
  assert.equal(M.deplacerFamille(modele, 'ia', -1), false, 'déjà en tête');
  assert.deepEqual(M.familles(modele).map((f) => f.id), ['ia', 'jeux', 'jeux-2', 'outils-claude']);
});

test('familles : supprimer, ses projets passent sans famille', () => {
  const modele = M.creerModele(etat());
  assert.equal(M.nombreDeProjets(modele, 'jeux'), 1);
  M.supprimerFamille(modele, 'jeux');
  assert.deepEqual(M.familles(modele).map((f) => f.id), ['ia']);
  assert.deepEqual(modele.brouillon.projets.projets.depths, { nom: 'Depths' });
});
```

- [ ] **Step 2: Tests navigateur**

2 remplacements dans `tests/navigateur/admin.test.mjs`, dans l'ordre (chaque texte à remplacer y est unique).

1. Remplacer :

```js
async function cliquerEtAttendre(page, bouton, titre) {
  await page.click(bouton);
  await page.waitForFunction((attendu) => document.getElementById('compte-rendu-titre').textContent === attendu, titre);
}

// ------------------------------------------------------------ ouverture
```

par :

```js
async function cliquerEtAttendre(page, bouton, titre) {
  await page.click(bouton);
  await page.waitForFunction((attendu) => document.getElementById('compte-rendu-titre').textContent === attendu, titre);
}

/* Accepte la prochaine boîte de dialogue (confirm) et renvoie son message ;
   échoue si aucune ne s'ouvre en 10 s (sinon le test attendrait sans fin). */
function accepterDialogue(page) {
  return new Promise((ok, ko) => {
    const delai = setTimeout(() => ko(new Error('aucune boîte de dialogue en 10 s')), 10000);
    page.once('dialog', async (dialogue) => {
      clearTimeout(delai);
      const message = dialogue.message();
      await dialogue.accept();
      ok(message);
    });
  });
}

async function choisirProjet(page, nom) {
  await page.locator('#liste-projets button', { hasText: nom }).click();
  await page.locator('#titre-projet', { hasText: nom }).waitFor();
}

/* Refus attendu du serveur (422, 409) : Chrome l'écrit dans la console
   (« Failed to load resource »), ce n'est pas une erreur de la page. */
function refusAttendu(page, statut) {
  const restantes = page.erreurs.filter((e) => !e.includes('status of ' + statut));
  assert.equal(restantes.length, page.erreurs.length - 1, 'un refus ' + statut + ' attendu');
  page.erreurs.splice(0, page.erreurs.length, ...restantes);
}

// ------------------------------------------------------------ ouverture
```

2. Remplacer :

```js
  assert.equal(await page.textContent('#annonce'), 'Rien à enregistrer : Aucune modification en attente.');
  await terminer(page);
});
```

par :

```js
  assert.equal(await page.textContent('#annonce'), 'Rien à enregistrer : Aucune modification en attente.');
  await terminer(page);
});

// ------------------------------------------------------------ projets

test('projet : renommer et changer de famille, enregistré dans config/projets.json', async (t) => {
  const { banc, page } = await ouvrirAdmin(t);
  await choisirProjet(page, 'Voxelcraft');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'titre-projet');
  await page.fill('#projet-nom', 'Voxelcraft 2');
  await page.selectOption('#projet-famille', 'jeux');
  assert.equal(await page.textContent('#etat-modifs'), 'Modifications non enregistrées : projets et familles.');
  assert.equal(await page.textContent('#titre-projet'), 'Voxelcraft 2');
  assert.equal(await page.textContent('#liste-projets [aria-current="true"] .admin-item-sous'), 'Jeux · 1\xa0entrée publiée');
  await cliquerEtAttendre(page, '#bouton-enregistrer', 'Enregistré');
  const reglages = await banc.lire('config/projets.json');
  assert.deepEqual(reglages.projets.voxelcraft, { nom: 'Voxelcraft 2', famille: 'jeux' });
  assert.equal(reglages._aide, 'Réglages de test.', 'les commentaires sont gardés');
  assert.equal(await page.textContent('#etat-modifs'), 'Tout est enregistré.');
  assert.equal(await page.textContent('#etat-git'), 'Branche main · pas encore publié : config/projets.json.');
  await terminer(page);
});

test('projets : liste par nom, filtre par nom ou famille', async (t) => {
  const { page } = await ouvrirAdmin(t);
  assert.deepEqual(await page.locator('#liste-projets .admin-item-titre').allTextContents(),
    ['Depths', 'Jarvis', 'Rogue lite', 'Voxelcraft']);
  assert.equal(await page.textContent('#compte-projets'), '4\xa0projets');
  await page.fill('#filtre-projets', 'simulations');
  assert.deepEqual(await page.locator('#liste-projets .admin-item-titre').allTextContents(), ['Jarvis']);
  assert.equal(await page.textContent('#compte-projets'), '1 sur 4\xa0projets');
  await page.fill('#filtre-projets', 'DEPTH');
  assert.deepEqual(await page.locator('#liste-projets .admin-item-titre').allTextContents(), ['Depths']);
  await terminer(page);
});

test('projet : fusionner dans un autre, le projet devient alias', async (t) => {
  const { banc, page } = await ouvrirAdmin(t);
  await choisirProjet(page, 'Rogue lite');
  await page.selectOption('#projet-fusion', 'depths');
  const message = accepterDialogue(page);
  await page.click('#bouton-fusionner');
  assert.match(await message, /^Fusionner « Rogue lite » dans « Depths » \?/);
  await page.locator('#titre-projet', { hasText: 'Depths' }).waitFor();
  assert.deepEqual(await page.locator('#liste-projets .admin-item-titre').allTextContents(), ['Depths', 'Jarvis', 'Voxelcraft']);
  assert.equal(await page.inputValue('#projet-alias'), 'rogue-lite');
  await cliquerEtAttendre(page, '#bouton-enregistrer', 'Enregistré');
  assert.deepEqual((await banc.lire('config/projets.json')).projets.depths, { nom: 'Depths', famille: 'jeux', alias: ['rogue-lite'] });
  await terminer(page);
});

test('projet : lien principal parmi ses liens, adresse locale refusée avec explication', async (t) => {
  const { banc, page } = await ouvrirAdmin(t);
  await choisirProjet(page, 'Jarvis');
  assert.deepEqual(await page.locator('#projet-lien option').allTextContents(), [
    'Automatique (premier site des entrées, sinon premier dépôt)',
    'https://exemple.github.io/jarvis/', 'https://github.com/exemple/jarvis', 'Autre adresse…']);
  await page.selectOption('#projet-lien', 'https://github.com/exemple/jarvis');
  await cliquerEtAttendre(page, '#bouton-enregistrer', 'Enregistré');
  assert.equal((await banc.lire('config/projets.json')).projets.jarvis.lien_principal, 'https://github.com/exemple/jarvis');

  await page.selectOption('#projet-lien', 'autre');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'projet-lien-autre');
  await page.fill('#projet-lien-autre', 'http://localhost:8000/');
  await cliquerEtAttendre(page, '#bouton-enregistrer', 'Enregistrement refusé');
  assert.deepEqual(await page.locator('#compte-rendu-message li').allTextContents(), [
    "Projet « jarvis », lien principal : adresse locale : le site public ne pourrait pas l'ouvrir (localhost, adresse privée, nom de machine)."]);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'compte-rendu-titre');
  assert.equal((await banc.lire('config/projets.json')).projets.jarvis.lien_principal, 'https://github.com/exemple/jarvis',
    'rien n’est écrit');
  assert.equal(await page.textContent('#etat-modifs'), 'Modifications non enregistrées : projets et familles.');
  refusAttendu(page, 422);
  await terminer(page);
});

test('enregistrer refusé si le fichier a changé ailleurs depuis l’ouverture de la page', async (t) => {
  const { banc, page } = await ouvrirAdmin(t);
  await choisirProjet(page, 'Depths');
  await page.fill('#projet-nom', 'Depths II');
  await banc.ecrire('config/projets.json', '\n');  // modifié à la main (ou dans un autre onglet) entre-temps
  await cliquerEtAttendre(page, '#bouton-enregistrer', 'Enregistrement refusé');
  assert.match(await page.textContent('#compte-rendu-message'), /^config\/projets\.json a changé depuis l'ouverture de la page/);
  assert.equal((await banc.lire('config/projets.json')).projets.depths.nom, 'Depths', 'rien n’est écrasé');
  assert.equal(await page.textContent('#etat-modifs'), 'Modifications non enregistrées : projets et familles.');
  refusAttendu(page, 409);
  await terminer(page);
});

test('modifications non enregistrées : le navigateur prévient avant de quitter', async (t) => {
  const { page } = await ouvrirAdmin(t);
  await choisirProjet(page, 'Depths');
  await page.click('#projet-description');
  await page.keyboard.type('Rogue-lite en 2D.');
  const dialogue = new Promise((ok) => page.once('dialog', async (d) => { ok(d.type()); await d.dismiss(); }));
  await page.close({ runBeforeUnload: true });
  assert.equal(await dialogue, 'beforeunload');
  await page.context().close();
});

test('rien à enregistrer : on quitte sans alerte', async (t) => {
  const { page } = await ouvrirAdmin(t);
  await choisirProjet(page, 'Depths');
  await page.fill('#projet-description', 'Rogue-lite en 2D.');
  await cliquerEtAttendre(page, '#bouton-enregistrer', 'Enregistré');
  const dialogues = [];
  page.on('dialog', async (d) => { dialogues.push(d.type()); await d.accept(); });
  await page.reload();
  await page.locator('#panneau-projets:not([hidden])').waitFor();
  assert.deepEqual(dialogues, []);
  assert.equal(await page.textContent('#etat-modifs'), 'Tout est enregistré.', 'jeton gardé pour l’onglet');
  await terminer(page);
});

// ------------------------------------------------------------ familles

test('familles : ajouter, renommer, réordonner, couleur', async (t) => {
  const { banc, page } = await ouvrirAdmin(t);
  await page.click('#onglet-familles');
  await page.fill('#nouvelle-famille', 'Outils Claude');
  await page.keyboard.press('Enter');
  assert.equal(await page.inputValue('#famille-nom-3'), 'Outils Claude');
  assert.equal(await page.inputValue('#famille-couleur-3'), '2', 'première couleur libre');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'nouvelle-famille');
  await page.selectOption('#famille-couleur-3', '4');
  assert.equal(await page.getAttribute('#liste-familles li:nth-child(3)', 'data-couleur'), '4');
  await page.fill('#famille-nom-1', 'Jeux & univers');
  await page.click('#liste-familles li:nth-child(2) [data-action="monter"]');
  assert.equal(await page.inputValue('#famille-nom-1'), 'IA & simulations');
  assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), 'Descendre la famille n° 1',
    'au bout de la liste, le focus passe au bouton voisin');
  await cliquerEtAttendre(page, '#bouton-enregistrer', 'Enregistré');
  assert.deepEqual((await banc.lire('config/projets.json')).familles, [
    { id: 'ia', nom: 'IA & simulations', couleur: 3 },
    { id: 'jeux', nom: 'Jeux & univers', couleur: 1 },
    { id: 'outils-claude', nom: 'Outils Claude', couleur: 4 },
  ]);
  await terminer(page);
});

test('familles : supprimer, ses projets passent « Sans famille »', async (t) => {
  const { banc, page } = await ouvrirAdmin(t);
  await page.click('#onglet-familles');
  assert.equal(await page.textContent('#liste-familles li:nth-child(1) .admin-famille-compte'), '1\xa0projet');
  const message = accepterDialogue(page);
  await page.click('#liste-familles li:nth-child(1) [data-action="supprimer"]');
  assert.equal(await message, 'Supprimer la famille « Jeux » ?\n\n1\xa0projet passera « Sans famille ».');
  await cliquerEtAttendre(page, '#bouton-enregistrer', 'Enregistré');
  const reglages = await banc.lire('config/projets.json');
  assert.deepEqual(reglages.familles, [{ id: 'ia', nom: 'IA & simulations', couleur: 3 }]);
  assert.deepEqual(reglages.projets.depths, { nom: 'Depths' });
  await terminer(page);
});
```

- [ ] **Step 3: Lancer les tests pour vérifier qu'ils échouent**

Run: `node --test tests/js/admin.test.mjs`
Expected: FAIL — les 7 nouveaux tests (`TypeError: M.listeProjets is not a function`, `M.liensDuProjet`, `M.modifierProjet`, `M.ajouterFamille`, `M.nombreDeProjets`…) ; les 5 de la Task 5 passent.

Run: `cd tests/navigateur; node --test admin.test.mjs`
Expected: FAIL — les 9 nouveaux tests (la liste des projets reste vide : `locator.click: Timeout 10000ms exceeded` … `#liste-projets button`, ou listes vides attendues pleines) ; les 4 de la Task 5 passent.

- [ ] **Step 4: Compléter `admin/modele.js`**

Ajouter à la fin de `admin/modele.js`, après une ligne vide :

```js
// ------------------------------------------------------------ projets

function reglages(modele) {
  return modele.brouillon.projets.projets || {};
}

function projetsPublies(modele) {
  return (modele.donnees && Array.isArray(modele.donnees.projets)) ? modele.donnees.projets : [];
}

function entreesPubliees(modele) {
  return (modele.donnees && Array.isArray(modele.donnees.entrees)) ? modele.donnees.entrees : [];
}

export function reglageProjet(modele, id) {
  return reglages(modele)[id] || {};
}

/* Alias d'un réglage, toujours une liste (le serveur ramène déjà un texte seul à une liste). */
export function aliasDe(reglage) {
  const alias = reglage && reglage.alias;
  if (Array.isArray(alias)) return alias;
  return typeof alias === 'string' && alias ? [alias] : [];
}

/* Liens en ligne d'un projet : son lien principal publié, puis ceux de ses entrées, sans doublon. */
export function liensDuProjet(modele, id) {
  const liens = [];
  const publie = projetsPublies(modele).find((p) => p && p.id === id);
  if (publie && publie.lien_principal && publie.lien_principal.url) liens.push(publie.lien_principal.url);
  for (const entree of entreesPubliees(modele)) {
    if (!entree || entree.projet !== id) continue;
    for (const lien of Array.isArray(entree.liens) ? entree.liens : []) {
      if (lien && lien.type === 'en_ligne' && lien.valeur) liens.push(lien.valeur);
    }
  }
  return Array.from(new Set(liens));
}

/* Projets à régler : ceux des données et ceux des réglages, sauf ceux devenus
   alias d'un autre (fusionnés), triés par nom. */
export function listeProjets(modele) {
  const tous = reglages(modele);
  const alias = new Set();
  for (const [id, reglage] of Object.entries(tous)) {
    for (const tag of aliasDe(reglage)) if (slug(tag) !== id) alias.add(slug(tag));
  }
  const publies = new Map(projetsPublies(modele).filter((p) => p && p.id).map((p) => [p.id, p]));
  const ids = new Set([...publies.keys(), ...Object.keys(tous)]);
  return Array.from(ids).filter((id) => !alias.has(id)).map((id) => {
    const publie = publies.get(id) || {};
    const reglage = tous[id] || {};
    return {
      id,
      nom: reglage.nom || publie.nom || id,
      nomPublie: publie.nom || null,
      descriptionPubliee: publie.description || null,
      famille: reglage.famille || null,
      nb: publie.nb || 0,
    };
  }).sort((a, b) => a.nom.localeCompare(b.nom, 'fr', { sensitivity: 'base' }) || a.id.localeCompare(b.id));
}

function vide(valeur) {
  return valeur === null || valeur === undefined || (typeof valeur === 'string' && !valeur.trim())
    || (Array.isArray(valeur) && !valeur.length);
}

/* Règle un champ d'un projet ; une valeur vide retire la clé (calcul
   automatique), et un projet sans réglage disparaît du fichier. Alias : un
   seul par slug (« rogue-lite » et « Rogue Lite » désignent le même tag). */
export function modifierProjet(modele, id, champ, valeur) {
  if (champ === 'alias' && Array.isArray(valeur)) {
    valeur = valeur.filter((tag, i, liste) => liste.findIndex((autre) => slug(autre) === slug(tag)) === i);
  }
  const fichier = modele.brouillon.projets;
  fichier.projets = fichier.projets || {};
  const reglage = Object.assign({}, fichier.projets[id]);
  if (vide(valeur)) delete reglage[champ];
  else reglage[champ] = typeof valeur === 'string' ? valeur.trim() : valeur;
  if (Object.keys(reglage).length) fichier.projets[id] = reglage;
  else delete fichier.projets[id];
}

/* Fusionne source dans cible : source et ses alias deviennent des alias de
   cible (ses entrées passent dans cible) ; ses propres réglages sont abandonnés. */
export function fusionner(modele, source, cible) {
  if (!source || !cible || source === cible) return;
  const alias = [...aliasDe(reglageProjet(modele, cible)), source, ...aliasDe(reglageProjet(modele, source))];
  modifierProjet(modele, cible, 'alias', alias.filter((tag) => slug(tag) !== cible));
  if (modele.brouillon.projets.projets) delete modele.brouillon.projets.projets[source];
}

// ------------------------------------------------------------ familles

export function familles(modele) {
  return modele.brouillon.projets.familles || [];
}

/* Ajoute une famille à la fin ; identifiant tiré du nom (unique), première couleur libre. */
export function ajouterFamille(modele, nom) {
  const fichier = modele.brouillon.projets;
  fichier.familles = fichier.familles || [];
  const base = slug(nom) || 'famille';
  let id = base;
  for (let n = 2; fichier.familles.some((f) => f.id === id); n++) id = base + '-' + n;
  const prises = new Set(fichier.familles.map((f) => f.couleur));
  const couleur = [1, 2, 3, 4, 5, 6].find((c) => !prises.has(c)) || 1;
  fichier.familles.push({ id, nom: String(nom).trim(), couleur });
  return id;
}

/* champ : 'nom' (texte) ou 'couleur' (entier de 1 à 6). */
export function modifierFamille(modele, id, champ, valeur) {
  const famille = familles(modele).find((f) => f.id === id);
  if (!famille) return;
  famille[champ] = champ === 'couleur' ? Number(valeur) : String(valeur).trim();
}

/* sens : -1 (monter) ou +1 (descendre) ; false si la famille est déjà au bout. */
export function deplacerFamille(modele, id, sens) {
  const liste = familles(modele);
  const i = liste.findIndex((f) => f.id === id);
  const j = i + sens;
  if (i < 0 || j < 0 || j >= liste.length) return false;
  [liste[i], liste[j]] = [liste[j], liste[i]];
  return true;
}

/* Supprime une famille ; ses projets passent « Sans famille ». */
export function supprimerFamille(modele, id) {
  const fichier = modele.brouillon.projets;
  fichier.familles = familles(modele).filter((f) => f.id !== id);
  for (const [pid, reglage] of Object.entries(fichier.projets || {})) {
    if (reglage.famille === id) modifierProjet(modele, pid, 'famille', null);
  }
}

export function nombreDeProjets(modele, id) {
  return listeProjets(modele).filter((p) => p.famille === id).length;
}
```

- [ ] **Step 5: Compléter `admin/admin.js`**

3 remplacements dans `admin/admin.js`, dans l'ordre (chaque texte à remplacer y est unique).

1. Remplacer :

```js
   Publier. Réutilise les composants, la recherche et le style du site ; le
   DOM est construit par el() (jamais d'innerHTML avec des données). */
import { el, plural } from '../js/composants.js';
import * as M from './modele.js';

const CLE_JETON = 'memoire-vive:admin-jeton';
```

par :

```js
   Publier. Réutilise les composants, la recherche et le style du site ; le
   DOM est construit par el() (jamais d'innerHTML avec des données). */
import { el, plural } from '../js/composants.js';
import { normalize } from '../js/recherche.js';
import * as M from './modele.js';

const CLE_JETON = 'memoire-vive:admin-jeton';
```

2. Remplacer :

```js
  return true;
}

// ------------------------------------------------------------ événements

const PANNEAUX = {};

function lier() {
  for (const nom of ONGLETS) $('onglet-' + nom).addEventListener('click', () => afficherOnglet(nom, true));
```

par :

```js
  return true;
}

// ------------------------------------------------------------ aides de formulaire

/* Champ étiqueté : label, contrôle, aide reliée par aria-describedby. */
function champ(id, libelle, controle, aide) {
  if (aide) controle.setAttribute('aria-describedby', id + '-aide');
  return el('div', { class: 'champ' },
    el('label', { for: id }, libelle), controle,
    aide ? el('p', { class: 'admin-aide', id: id + '-aide' }, aide) : null);
}

/* Tous les mots de la requête présents dans le texte (minuscules et accents indifférents). */
function correspond(texte, requete) {
  const cible = normalize(texte);
  return normalize(requete).split(/\s+/).filter(Boolean).every((mot) => cible.includes(mot));
}

function famille(id) {
  return M.familles(ui.modele).find((f) => f.id === id) || null;
}

function nomFamille(id) {
  const trouvee = famille(id);
  return trouvee ? trouvee.nom : 'Sans famille';
}

function nomProjet(id) {
  const reglage = M.reglageProjet(ui.modele, id);
  const publie = ((ui.modele.donnees && ui.modele.donnees.projets) || []).find((p) => p && p.id === id);
  return reglage.nom || (publie && publie.nom) || id;
}

function vide(texte) {
  return el('p', { class: 'admin-vide' }, texte);
}

// ------------------------------------------------------------ projets

function rendreProjets() {
  rendreListeProjets();
  rendreDetailProjet();
}

function rendreListeProjets() {
  const tous = M.listeProjets(ui.modele);
  const requete = dom.filtreProjets.value;
  const visibles = tous.filter((p) => correspond([p.nom, p.id, nomFamille(p.famille)].join(' '), requete));
  dom.compteProjets.textContent = (requete.trim() ? visibles.length + ' sur ' : '') + plural(tous.length, 'projet', 'projets');
  dom.listeProjets.replaceChildren(...visibles.map((p) => el('li', null,
    el('button', {
      type: 'button', class: 'admin-item', 'data-id': p.id, 'data-couleur': famille(p.famille) ? famille(p.famille).couleur : null,
      'aria-current': p.id === ui.projet ? 'true' : null,
    },
    el('span', { class: 'admin-item-titre' }, p.nom),
    el('span', { class: 'admin-item-sous' }, nomFamille(p.famille) + ' · ' + plural(p.nb, 'entrée publiée', 'entrées publiées'))))));
}

function rendreDetailProjet() {
  const projet = M.listeProjets(ui.modele).find((p) => p.id === ui.projet);
  if (!projet) {
    ui.projet = null;
    dom.detailProjet.replaceChildren(vide('Choisir un projet dans la liste pour régler son nom, sa famille, sa description, son lien principal et ses alias.'));
    return;
  }
  const reglage = M.reglageProjet(ui.modele, projet.id);
  const liens = M.liensDuProjet(ui.modele, projet.id);
  const lienRegle = reglage.lien_principal || '';
  const choix = !lienRegle ? '' : liens.includes(lienRegle) ? lienRegle : 'autre';
  const autres = M.listeProjets(ui.modele).filter((p) => p.id !== projet.id);

  dom.detailProjet.replaceChildren(
    el('h2', { id: 'titre-projet', tabindex: '-1' }, projet.nom),
    el('p', { class: 'admin-aide' }, 'Identifiant ' + projet.id + ' · ' + plural(projet.nb, 'entrée publiée', 'entrées publiées') + ' · ',
      el('a', { href: '/#/projet/' + encodeURIComponent(projet.id), target: APERCU }, 'Voir sur le site local ↗')),
    champ('projet-nom', 'Nom affiché',
      el('input', { type: 'text', id: 'projet-nom', value: reglage.nom || '', placeholder: projet.nomPublie || projet.id, autocomplete: 'off' }),
      'Vide : nom trouvé dans les entrées.'),
    champ('projet-famille', 'Famille',
      el('select', { id: 'projet-famille' },
        el('option', { value: '' }, 'Sans famille'),
        M.familles(ui.modele).map((f) => el('option', { value: f.id, selected: f.id === reglage.famille }, f.nom)))),
    champ('projet-description', 'Description',
      el('textarea', { id: 'projet-description', rows: '3', placeholder: projet.descriptionPubliee || '' }, reglage.description || ''),
      'Vide : résumé de la plus ancienne entrée d’architecture du projet.'),
    champ('projet-lien', 'Lien principal',
      el('select', { id: 'projet-lien' },
        el('option', { value: '' }, 'Automatique (premier site des entrées, sinon premier dépôt)'),
        liens.map((url) => el('option', { value: url, selected: url === choix }, url)),
        el('option', { value: 'autre', selected: choix === 'autre' }, 'Autre adresse…')),
      'Bouton « Ouvrir le site » ou « Dépôt » des cartes du projet.'),
    el('div', { class: 'champ', id: 'projet-lien-autre-bloc', hidden: choix !== 'autre' },
      el('label', { for: 'projet-lien-autre' }, 'Adresse du lien principal'),
      el('input', { type: 'url', id: 'projet-lien-autre', value: choix === 'autre' ? lienRegle : '', placeholder: 'https://…', autocomplete: 'off', spellcheck: 'false' })),
    champ('projet-alias', 'Alias',
      el('input', { type: 'text', id: 'projet-alias', value: M.aliasDe(reglage).join(', '), autocomplete: 'off', spellcheck: 'false' }),
      'Tags rattachés à ce projet, séparés par des virgules : leurs entrées y sont regroupées.'),
    el('div', { class: 'champ' },
      el('label', { for: 'projet-fusion' }, 'Fusionner dans…'),
      el('div', { class: 'admin-ligne' },
        el('select', { id: 'projet-fusion', 'aria-describedby': 'projet-fusion-aide' },
          el('option', { value: '' }, 'Choisir un projet'),
          autres.map((p) => el('option', { value: p.id }, p.nom))),
        el('button', { type: 'button', class: 'btn-secondary', id: 'bouton-fusionner' }, 'Fusionner')),
      el('p', { class: 'admin-aide', id: 'projet-fusion-aide' },
        'Ce projet devient un alias du projet choisi : ses entrées y passent, ses propres réglages sont abandonnés.')),
  );
}

function choisirProjet(id) {
  ui.projet = id;
  rendreProjets();
  $('titre-projet').focus();
}

/* Après une saisie : liste (nom, famille), titre de la fiche, barre. */
function projetModifie() {
  const titre = $('titre-projet');
  if (titre) titre.textContent = nomProjet(ui.projet);
  rendreListeProjets();
  rendreBarre();
}

function saisieProjet(event) {
  const cible = event.target;
  const champs = { 'projet-nom': 'nom', 'projet-description': 'description', 'projet-lien-autre': 'lien_principal' };
  if (cible.id === 'projet-alias') M.modifierProjet(ui.modele, ui.projet, 'alias', M.termes(cible.value));
  else if (champs[cible.id]) M.modifierProjet(ui.modele, ui.projet, champs[cible.id], cible.value);
  else return;
  projetModifie();
}

function choixProjet(event) {
  const cible = event.target;
  if (cible.id === 'projet-famille') {
    M.modifierProjet(ui.modele, ui.projet, 'famille', cible.value || null);
  } else if (cible.id === 'projet-lien') {
    const autre = cible.value === 'autre';
    $('projet-lien-autre-bloc').hidden = !autre;
    M.modifierProjet(ui.modele, ui.projet, 'lien_principal', autre ? $('projet-lien-autre').value : cible.value || null);
    if (autre) $('projet-lien-autre').focus();
  } else {
    return;
  }
  projetModifie();
}

function fusionnerProjet() {
  const source = ui.projet;
  const cible = $('projet-fusion').value;
  if (!cible) {
    $('projet-fusion').focus();
    return;
  }
  const de = nomProjet(source);
  const dans = nomProjet(cible);
  const accord = window.confirm('Fusionner « ' + de + ' » dans « ' + dans + ' » ?\n\n« ' + de + ' » devient un alias : ses entrées passent dans « '
    + dans + ' », ses propres réglages (nom, description, lien…) sont abandonnés. Pour annuler, retirer l’alias.');
  if (!accord) return;
  M.fusionner(ui.modele, source, cible);
  choisirProjet(cible);
  rendreBarre();
  dom.annonce.textContent = '« ' + de + ' » fusionné dans « ' + dans + ' ».';
}

// ------------------------------------------------------------ familles

function rendreFamilles() {
  const liste = M.familles(ui.modele);
  dom.listeFamilles.replaceChildren(...liste.map((f, i) => {
    const n = i + 1;
    return el('li', { class: 'admin-famille', 'data-id': f.id, 'data-couleur': f.couleur },
      el('span', { class: 'family-dot', 'aria-hidden': 'true' }),
      el('label', { for: 'famille-nom-' + n, class: 'visually-hidden' }, 'Nom de la famille n° ' + n),
      el('input', { type: 'text', id: 'famille-nom-' + n, value: f.nom, 'data-champ': 'nom', autocomplete: 'off' }),
      el('label', { for: 'famille-couleur-' + n, class: 'visually-hidden' }, 'Couleur de la famille n° ' + n),
      el('select', { id: 'famille-couleur-' + n, 'data-champ': 'couleur' },
        M.COULEURS.map((nom, k) => el('option', { value: String(k + 1), selected: f.couleur === k + 1 }, (k + 1) + ' — ' + nom))),
      el('span', { class: 'admin-aide admin-famille-compte' }, plural(M.nombreDeProjets(ui.modele, f.id), 'projet', 'projets')),
      el('span', { class: 'admin-ligne' },
        el('button', { type: 'button', class: 'btn-secondary', 'data-action': 'monter', 'aria-label': 'Monter la famille n° ' + n,
          'aria-disabled': i === 0 ? 'true' : null }, '↑'),
        el('button', { type: 'button', class: 'btn-secondary', 'data-action': 'descendre', 'aria-label': 'Descendre la famille n° ' + n,
          'aria-disabled': i === liste.length - 1 ? 'true' : null }, '↓'),
        el('button', { type: 'button', class: 'btn-secondary', 'data-action': 'supprimer', 'aria-label': 'Supprimer la famille n° ' + n },
          'Supprimer')));
  }));
}

function saisieFamille(event) {
  const ligne = event.target.closest('li[data-id]');
  const champFamille = event.target.dataset.champ;
  if (!ligne || !champFamille) return;
  M.modifierFamille(ui.modele, ligne.dataset.id, champFamille, event.target.value);
  if (champFamille === 'couleur') ligne.dataset.couleur = event.target.value;
  rendreBarre();
}

function actionFamille(event) {
  const bouton = event.target.closest('button[data-action]');
  const ligne = bouton && bouton.closest('li[data-id]');
  if (!ligne || bouton.getAttribute('aria-disabled') === 'true') return;
  const id = ligne.dataset.id;
  const action = bouton.dataset.action;
  if (action === 'supprimer') {
    const nb = M.nombreDeProjets(ui.modele, id);
    const accord = window.confirm('Supprimer la famille « ' + nomFamille(id) + ' » ?'
      + (nb ? '\n\n' + plural(nb, 'projet passera', 'projets passeront') + ' « Sans famille ».' : ''));
    if (!accord) return;
    M.supprimerFamille(ui.modele, id);
    rendreFamilles();
    dom.nouvelleFamille.focus();
  } else {
    M.deplacerFamille(ui.modele, id, action === 'monter' ? -1 : 1);
    rendreFamilles();
    // Focus sur le même bouton de la famille déplacée ; arrivée au bout, sur l'autre sens.
    const deplace = dom.listeFamilles.querySelector('li[data-id="' + CSS.escape(id) + '"]');
    const meme = deplace.querySelector('button[data-action="' + action + '"]');
    const autre = deplace.querySelector('button[data-action="' + (action === 'monter' ? 'descendre' : 'monter') + '"]');
    const cible = [meme, autre].find((b) => b.getAttribute('aria-disabled') !== 'true');
    (cible || deplace.querySelector('input')).focus();
  }
  rendreBarre();
}

function ajouterFamille() {
  const nom = dom.nouvelleFamille.value.trim();
  if (!nom) {
    dom.nouvelleFamille.focus();
    return;
  }
  M.ajouterFamille(ui.modele, nom);
  dom.nouvelleFamille.value = '';
  rendreFamilles();
  rendreBarre();
  dom.annonce.textContent = 'Famille « ' + nom + ' » ajoutée.';
  dom.nouvelleFamille.focus();
}

// ------------------------------------------------------------ événements

const PANNEAUX = { projets: rendreProjets, familles: rendreFamilles };

function lier() {
  for (const nom of ONGLETS) $('onglet-' + nom).addEventListener('click', () => afficherOnglet(nom, true));
```

3. Remplacer :

```js
      event.returnValue = '';
    }
  });
}

demarrer();
```

par :

```js
      event.returnValue = '';
    }
  });

  dom.filtreProjets.addEventListener('input', rendreListeProjets);
  dom.listeProjets.addEventListener('click', (event) => {
    const bouton = event.target.closest('button[data-id]');
    if (bouton) choisirProjet(bouton.dataset.id);
  });
  dom.detailProjet.addEventListener('input', saisieProjet);
  dom.detailProjet.addEventListener('change', choixProjet);
  dom.detailProjet.addEventListener('click', (event) => {
    if (event.target.id === 'bouton-fusionner') fusionnerProjet();
  });

  dom.listeFamilles.addEventListener('input', saisieFamille);
  dom.listeFamilles.addEventListener('click', actionFamille);
  dom.ajouterFamille.addEventListener('click', ajouterFamille);
  dom.nouvelleFamille.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      ajouterFamille();
    }
  });
}

demarrer();
```

- [ ] **Step 6: Lancer les tests pour vérifier qu'ils passent**

Run: `node --test tests/js/admin.test.mjs`
Expected: 12 tests réussis.

Run: `cd tests/navigateur; node --test admin.test.mjs`
Expected: 13 tests réussis.

- [ ] **Step 7: Toutes les suites du site**

Run: `node --test "tests/js/*.test.mjs"`
Expected: 65 tests réussis.

Run: `cd tests/navigateur; npm test`
Expected: 117 tests réussis.

- [ ] **Step 8: Commit**

```bash
git add admin/modele.js admin/admin.js tests/js/admin.test.mjs tests/navigateur/admin.test.mjs
git commit -m "Admin : projets (nom, famille, description, lien, alias, fusion) et familles

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Page d'admin : entrées, synonymes, accessibilité

Onglet Entrées : liste cherchable (titre, projet ou identifiant), fiche de l'entrée choisie — titre et résumé modifiables, l'original affiché dès qu'il est corrigé, bouton « Rétablir », case « Masquer du site » (qui retire la correction, après confirmation : Choix 4) ; entrées masquées toujours listées, « masquer » lu comme l'export le lit. Onglet Recherche : groupes de synonymes (un champ par groupe, termes séparés par des virgules), ajouter, supprimer. Le parcours « réglages écrits à la main sous une forme tolérée » (Choix 19) se teste ici, une fois projets et entrées affichés. Le test d'accessibilité vérifie, une fois les quatre onglets remplis, que chaque champ a une étiquette et que les contrastes tiennent en clair comme en sombre.

**Files:**

- Modify: `admin/modele.js` (sections entrées et synonymes), `admin/admin.js` (import de `typeLabel` ; `CLE_TITRES` ; `memoriserTitres` ; panneaux Entrées et Recherche, `caseMasquer` ; `PANNEAUX` ; écouteurs)
- Test: `tests/js/admin.test.mjs`, `tests/navigateur/admin.test.mjs` (import de `contraste`)

**Interfaces:**

- Consumes: Task 5 et 6 (`champ`, `correspond`, `nomProjet`, `vide`, `rendreBarre`, `rapport`) ; `typeLabel(type)` de `docs/js/composants.js` ; `originaux` de `GET /api/etat`.
- Produces:
  - `admin/modele.js` : `listeEntrees(modele, memo = {}) -> [{ court, connue, type, projet, titreOrigine, resumeOrigine, titre, resume, masquee }]` (entrées de `data.json`, puis masquées absentes, `connue: false` ; toute valeur vraie de `masquer` masque, comme à l'export), `corriger(modele, court, champ, texte)` (`'titre'` ou `'resume'` ; texte vide ou égal à l'original : correction retirée), `masquer(modele, court, oui)` (`oui` : il ne reste que `{ masquer: true }`), `groupes(modele) -> string[][]`, `modifierGroupe(modele, i, texte)`, `ajouterGroupe(modele) -> index`, `supprimerGroupe(modele, i)`.
  - `admin/admin.js` : `CLE_TITRES = 'memoire-vive:admin-titres'`, `memoriserTitres(donnees)` (aussi appelée en Task 8), `caseMasquer(event)` (confirmation si une correction serait retirée) ; identifiants de la fiche : `titre-entree`, `entree-titre`, `entree-resume`, `origine-titre`, `origine-resume` (bouton `[data-retablir]`), `entree-masquer` ; groupes `groupe-<n>`, boutons `[data-supprimer]`.

- [ ] **Step 1: Tests Node du modèle**

Ajouter à la fin de `tests/js/admin.test.mjs`, après une ligne vide :

```js
test('entrées : titre et résumé d’origine, corrections, entrées masquées hors des données', () => {
  const modele = M.creerModele(etat());
  modele.brouillon.entrees.bbbbbbbbbbbb = { titre: 'Titre corrigé' };
  modele.brouillon.entrees.dddddddddddd = { masquer: true };
  const liste = M.listeEntrees(modele, { dddddddddddd: 'Une entrée masquée' });
  assert.deepEqual(liste.map((e) => [e.court, e.titre, e.titreOrigine, e.masquee, e.connue]), [
    ['aaaaaaaaaaaa', 'Jarvis — architecture', 'Jarvis — architecture', false, true],
    ['bbbbbbbbbbbb', 'Titre corrigé', 'Jarvis — premier réveil', false, true],
    ['cccccccccccc', 'Depths — donjon', 'Depths — donjon', false, true],
    ['dddddddddddd', 'Une entrée masquée', 'Une entrée masquée', true, false],
  ]);
  assert.equal(M.listeEntrees(modele).at(-1).titre, '', 'titre inconnu sans mémo');
});

test('entrées : corriger (égal à l’original : retiré), masquer (correction retirée), réafficher', () => {
  const modele = M.creerModele(etat());
  M.corriger(modele, 'aaaaaaaaaaaa', 'titre', '  Jarvis, l’architecture  ');
  M.corriger(modele, 'aaaaaaaaaaaa', 'resume', 'Pipeline vocal.');
  assert.deepEqual(modele.brouillon.entrees.aaaaaaaaaaaa, { titre: 'Jarvis, l’architecture' });
  M.masquer(modele, 'aaaaaaaaaaaa', true);
  assert.deepEqual(modele.brouillon.entrees.aaaaaaaaaaaa, { masquer: true }, 'le titre corrigé ne part pas dans le dépôt public');
  M.masquer(modele, 'aaaaaaaaaaaa', false);
  assert.equal('aaaaaaaaaaaa' in modele.brouillon.entrees, false);
  assert.deepEqual(M.fichiersModifies(modele), []);
});

test('entrées : « masquer » lu comme l’export, toute valeur vraie masque', () => {
  const modele = M.creerModele(etat());
  modele.brouillon.entrees.cccccccccccc = { masquer: 'false' };
  modele.brouillon.entrees.dddddddddddd = { masquer: 1 };
  modele.brouillon.entrees.eeeeeeeeeeee = { masquer: 0 };
  const liste = M.listeEntrees(modele);
  assert.equal(liste.find((e) => e.court === 'cccccccccccc').masquee, true);
  assert.deepEqual(liste.filter((e) => !e.connue).map((e) => e.court), ['dddddddddddd']);
});

test('synonymes : modifier, ajouter, supprimer un groupe', () => {
  const modele = M.creerModele(etat());
  M.modifierGroupe(modele, 0, 'ia, intelligence artificielle, llm');
  assert.equal(M.ajouterGroupe(modele), 2);
  M.modifierGroupe(modele, 2, 'local, hors ligne,');
  M.supprimerGroupe(modele, 1);
  assert.deepEqual(M.groupes(modele), [['ia', 'intelligence artificielle', 'llm'], ['local', 'hors ligne']]);
  assert.deepEqual(M.fichiersModifies(modele), ['recherche']);
});
```

- [ ] **Step 2: Tests navigateur**

2 remplacements dans `tests/navigateur/admin.test.mjs`, dans l'ordre (chaque texte à remplacer y est unique).

1. Remplacer :

```js
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { CHROME, pageInstrumentee, terminer, debordement } from './outils.mjs';
import { ouvrirBanc } from './banc-admin.mjs';

let navigateur;
```

par :

```js
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { CHROME, pageInstrumentee, terminer, debordement, contraste } from './outils.mjs';
import { ouvrirBanc } from './banc-admin.mjs';

let navigateur;
```

2. Remplacer :

```js
  assert.deepEqual(reglages.projets.depths, { nom: 'Depths' });
  await terminer(page);
});
```

par :

```js
  assert.deepEqual(reglages.projets.depths, { nom: 'Depths' });
  await terminer(page);
});

// ------------------------------------------------------------ entrées

test('entrées : corriger un titre, voir l’original, rétablir', async (t) => {
  const { banc, page } = await ouvrirAdmin(t);
  await page.click('#onglet-entrees');
  await page.fill('#filtre-entrees', 'reveil');
  assert.deepEqual(await page.locator('#liste-entrees .admin-item-titre').allTextContents(), ['Jarvis — premier réveil vocal']);
  await page.click('#liste-entrees button');
  await page.fill('#entree-titre', 'Jarvis se réveille');
  assert.equal(await page.isVisible('#origine-titre'), true);
  assert.equal(await page.textContent('#origine-titre .admin-origine-texte'), 'Jarvis — premier réveil vocal');
  assert.equal(await page.textContent('#liste-entrees .admin-item-sous'), 'Jalon · Jarvis · corrigée');
  await cliquerEtAttendre(page, '#bouton-enregistrer', 'Enregistré');
  assert.deepEqual((await banc.lire('config/entrees.json')), { _aide: 'Corrections de test.', '000000000002': { titre: 'Jarvis se réveille' } });

  await page.click('#origine-titre button');
  assert.equal(await page.inputValue('#entree-titre'), 'Jarvis — premier réveil vocal');
  assert.equal(await page.isHidden('#origine-titre'), true);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'entree-titre');
  await cliquerEtAttendre(page, '#bouton-enregistrer', 'Enregistré');
  assert.deepEqual((await banc.lire('config/entrees.json')), { _aide: 'Corrections de test.' });
  await terminer(page);
});

test('entrées : masquer du site (sa correction est retirée, après confirmation), puis réafficher', async (t) => {
  const { banc, page } = await ouvrirAdmin(t);
  await page.click('#onglet-entrees');
  await page.locator('#liste-entrees button', { hasText: 'Voxelcraft' }).click();
  const origine = await page.inputValue('#entree-titre');
  await page.fill('#entree-titre', 'Voxelcraft, un jeu de cubes');
  const message = accepterDialogue(page);
  await page.check('#entree-masquer');
  assert.match(await message, /^Masquer cette entrée retire aussi sa correction de titre et de résumé/);
  assert.equal(await page.inputValue('#entree-titre'), origine, 'titre d’origine rétabli');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'entree-masquer');
  assert.equal(await page.textContent('#liste-entrees [aria-current="true"] .admin-item-sous'), 'Note · Voxelcraft · masquée');
  await cliquerEtAttendre(page, '#bouton-enregistrer', 'Enregistré');
  assert.deepEqual((await banc.lire('config/entrees.json'))['000000000005'], { masquer: true });
  await page.uncheck('#entree-masquer');
  await cliquerEtAttendre(page, '#bouton-enregistrer', 'Enregistré');
  assert.deepEqual(await banc.lire('config/entrees.json'), { _aide: 'Corrections de test.' });
  await terminer(page);
});

test('réglages écrits à la main sous une forme que l’export tolère : signalés, réécrits par Enregistrer', async (t) => {
  const { banc, page } = await ouvrirAdmin(t);
  const projets = await banc.lire('config/projets.json');
  projets.projets.depths.alias = 'rogue-lite';
  await banc.remplacer('config/projets.json', JSON.stringify(projets));
  await banc.remplacer('config/entrees.json', JSON.stringify({ '000000000005': { masquer: 'false' } }));
  await page.reload();
  await page.locator('#compte-rendu-titre', { hasText: 'Réglages relus' }).waitFor();
  assert.deepEqual(await page.locator('#compte-rendu-message li').allTextContents(), [
    "config/projets.json, projet « depths » : alias écrit comme un texte seul, lu comme une liste d'un alias.",
    'config/entrees.json, entrée 000000000005 : « masquer » vaut "false" (ni true ni false) ; '
      + "pour l'export l'entrée est masquée, la page l'écrit true.",
  ]);
  assert.equal(await page.textContent('#etat-modifs'), 'Modifications non enregistrées : projets et familles, entrées.');
  assert.deepEqual(await page.locator('#liste-projets .admin-item-titre').allTextContents(), ['Depths', 'Jarvis', 'Voxelcraft']);
  await choisirProjet(page, 'Depths');
  assert.equal(await page.inputValue('#projet-alias'), 'rogue-lite');
  await page.click('#onglet-entrees');
  assert.equal(await page.locator('#liste-entrees button', { hasText: 'Voxelcraft' }).locator('.admin-item-sous').textContent(),
    'Note · Voxelcraft · masquée', 'comme sur le site');
  await cliquerEtAttendre(page, '#bouton-enregistrer', 'Enregistré');
  assert.deepEqual(await banc.lire('config/entrees.json'), { '000000000005': { masquer: true } });
  assert.deepEqual((await banc.lire('config/projets.json')).projets.depths.alias, ['rogue-lite']);
  await terminer(page);
});

// ------------------------------------------------------------ recherche

test('synonymes : modifier, ajouter et supprimer un groupe', async (t) => {
  const { banc, page } = await ouvrirAdmin(t);
  await page.click('#onglet-recherche');
  assert.equal(await page.inputValue('#groupe-1'), 'ia, intelligence artificielle');
  await page.fill('#groupe-1', 'ia, intelligence artificielle, llm');
  await page.click('#bouton-ajouter-groupe');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'groupe-3');
  await page.keyboard.type('local, hors ligne');
  await page.click('[aria-label="Supprimer le groupe n° 2"]');
  assert.equal(await page.inputValue('#groupe-2'), 'local, hors ligne');
  await cliquerEtAttendre(page, '#bouton-enregistrer', 'Enregistré');
  assert.deepEqual(await banc.lire('config/recherche.json'), {
    _aide: 'Synonymes de test.', synonymes: [['ia', 'intelligence artificielle', 'llm'], ['local', 'hors ligne']] });
  await terminer(page);
});

// ------------------------------------------------------------ accessibilité

test('accessibilité : chaque champ a une étiquette, contrastes AA en clair et en sombre', async (t) => {
  const { page } = await ouvrirAdmin(t);
  await choisirProjet(page, 'Jarvis');
  for (const onglet of ['projets', 'familles', 'entrees', 'recherche']) {
    await page.click('#onglet-' + onglet);
    if (onglet === 'entrees') await page.click('#liste-entrees button >> nth=0');
    const sansEtiquette = await page.evaluate(() => Array.from(document.querySelectorAll('input, select, textarea'))
      .filter((c) => c.offsetParent !== null && !(c.labels && c.labels.length) && !c.getAttribute('aria-label'))
      .map((c) => c.id || c.outerHTML));
    assert.deepEqual(sansEtiquette, [], onglet);
  }
  await page.click('#onglet-projets');
  for (const theme of ['light', 'dark']) {
    await page.evaluate((valeur) => { document.documentElement.dataset.theme = valeur; }, theme);
    const couleurs = await page.evaluate(() => {
      const style = (selecteur) => getComputedStyle(document.querySelector(selecteur));
      return {
        aide: style('#detail-projet .admin-aide').color,
        fond: style('#detail-projet').backgroundColor,
        bord: style('#projet-nom').borderTopColor,
        champ: style('#projet-nom').backgroundColor,
        sous: style('#liste-projets .admin-item-sous').color,
        item: style('#liste-projets .admin-item').backgroundColor,
      };
    });
    assert.ok(contraste(couleurs.aide, couleurs.fond) >= 4.5, theme + ' : texte d’aide');
    assert.ok(contraste(couleurs.sous, couleurs.item) >= 4.5, theme + ' : détails de la liste');
    assert.ok(contraste(couleurs.bord, couleurs.champ) >= 3, theme + ' : bord des champs');
    assert.ok(contraste(couleurs.bord, couleurs.fond) >= 3, theme + ' : bord des champs sur la fiche');
  }
  await terminer(page);
});
```

- [ ] **Step 3: Lancer les tests pour vérifier qu'ils échouent**

Run: `node --test tests/js/admin.test.mjs`
Expected: FAIL — les 4 nouveaux tests (`TypeError: M.listeEntrees is not a function`, `M.corriger`, `M.modifierGroupe`) ; les 12 autres passent.

Run: `cd tests/navigateur; node --test admin.test.mjs`
Expected: FAIL — les 5 nouveaux tests (listes d'entrées et de groupes vides : délais dépassés sur `#liste-entrees button` et `#groupe-1`, liste attendue pleine) ; les 13 autres passent.

- [ ] **Step 4: Compléter `admin/modele.js`**

Ajouter à la fin de `admin/modele.js`, après une ligne vide :

```js
// ------------------------------------------------------------ entrées

function corrections(modele) {
  return modele.brouillon.entrees;
}

/* Entrées à régler : celles des données (titre et résumé d'origine à côté
   des corrections), puis les entrées masquées qui n'y sont plus. memo :
   titres déjà vus, par identifiant court (une entrée masquée n'est plus dans
   data.json). */
export function listeEntrees(modele, memo = {}) {
  const toutes = corrections(modele);
  const vues = new Set();
  const liste = [];
  for (const entree of entreesPubliees(modele)) {
    if (!entree || typeof entree.id !== 'string') continue;
    const court = entree.id.slice(0, 12);
    vues.add(court);
    const origine = modele.originaux[court] || { titre: entree.titre, resume: entree.resume };
    const correction = toutes[court] || {};
    liste.push({
      court,
      connue: true,
      type: entree.type || null,
      projet: entree.projet || null,
      titreOrigine: origine.titre || '',
      resumeOrigine: origine.resume || '',
      titre: correction.titre || origine.titre || '',
      resume: correction.resume || origine.resume || '',
      // Comme l'export : toute valeur vraie masque (le serveur ramène déjà « masquer » à true ou false).
      masquee: Boolean(correction.masquer),
    });
  }
  for (const [court, correction] of Object.entries(toutes)) {
    if (court.startsWith('_') || vues.has(court) || !correction || !correction.masquer) continue;
    liste.push({
      court,
      connue: false,
      type: null,
      projet: null,
      titreOrigine: memo[court] || '',
      resumeOrigine: '',
      titre: correction.titre || memo[court] || '',
      resume: correction.resume || '',
      masquee: true,
    });
  }
  return liste;
}

function ecrireCorrection(modele, court, correction) {
  if (Object.keys(correction).length) corrections(modele)[court] = correction;
  else delete corrections(modele)[court];
}

/* Corrige le titre ou le résumé (champ 'titre' ou 'resume') ; un texte vide
   ou égal à l'original retire la correction. */
export function corriger(modele, court, champ, texte) {
  const correction = Object.assign({}, corrections(modele)[court]);
  const valeur = String(texte || '').trim();
  const origine = String((modele.originaux[court] || {})[champ] || '').trim();
  if (!valeur || valeur === origine) delete correction[champ];
  else correction[champ] = valeur;
  ecrireCorrection(modele, court, correction);
}

/* Masquer retire aussi la correction du titre et du résumé : config/entrees.json
   est publié avec le dépôt, et une entrée est souvent masquée parce qu'elle est
   privée. Réafficher ne la rend pas. */
export function masquer(modele, court, oui) {
  const correction = Object.assign({}, corrections(modele)[court]);
  if (oui) {
    ecrireCorrection(modele, court, { masquer: true });
    return;
  }
  delete correction.masquer;
  ecrireCorrection(modele, court, correction);
}

// ------------------------------------------------------------ synonymes

export function groupes(modele) {
  return modele.brouillon.recherche.synonymes || [];
}

export function modifierGroupe(modele, i, texte) {
  const recherche = modele.brouillon.recherche;
  recherche.synonymes = recherche.synonymes || [];
  recherche.synonymes[i] = termes(texte);
}

export function ajouterGroupe(modele) {
  const recherche = modele.brouillon.recherche;
  recherche.synonymes = recherche.synonymes || [];
  recherche.synonymes.push([]);
  return recherche.synonymes.length - 1;
}

export function supprimerGroupe(modele, i) {
  groupes(modele).splice(i, 1);
}
```

- [ ] **Step 5: Compléter `admin/admin.js`**

5 remplacements dans `admin/admin.js`, dans l'ordre (chaque texte à remplacer y est unique).

1. Remplacer :

```js
   publiée) : projets, familles, entrées et synonymes ; Enregistrer, Aperçu,
   Publier. Réutilise les composants, la recherche et le style du site ; le
   DOM est construit par el() (jamais d'innerHTML avec des données). */
import { el, plural } from '../js/composants.js';
import { normalize } from '../js/recherche.js';
import * as M from './modele.js';

const CLE_JETON = 'memoire-vive:admin-jeton';
const ONGLETS = ['projets', 'familles', 'entrees', 'recherche'];
const APERCU = 'memoire-vive-apercu';  // onglet de l'aperçu, réutilisé d'une fois sur l'autre
```

par :

```js
   publiée) : projets, familles, entrées et synonymes ; Enregistrer, Aperçu,
   Publier. Réutilise les composants, la recherche et le style du site ; le
   DOM est construit par el() (jamais d'innerHTML avec des données). */
import { el, plural, typeLabel } from '../js/composants.js';
import { normalize } from '../js/recherche.js';
import * as M from './modele.js';

const CLE_JETON = 'memoire-vive:admin-jeton';
const CLE_TITRES = 'memoire-vive:admin-titres';
const ONGLETS = ['projets', 'familles', 'entrees', 'recherche'];
const APERCU = 'memoire-vive-apercu';  // onglet de l'aperçu, réutilisé d'une fois sur l'autre
```

2. Remplacer :

```js
async function charger() {
  const etat = await api('GET', '/api/etat');
  ui.modele = M.creerModele(etat);
  dom.status.hidden = true;
  dom.onglets.hidden = false;
  for (const bouton of [dom.enregistrer, dom.apercu, dom.publier]) bouton.disabled = false;
```

par :

```js
async function charger() {
  const etat = await api('GET', '/api/etat');
  ui.modele = M.creerModele(etat);
  memoriserTitres(etat.donnees);
  dom.status.hidden = true;
  dom.onglets.hidden = false;
  for (const bouton of [dom.enregistrer, dom.apercu, dom.publier]) bouton.disabled = false;
```

3. Remplacer :

```js
async function rafraichirGit() {
  try { ui.modele.git = (await api('GET', '/api/etat')).git; } catch (e) { /* l'état affiché reste l'ancien */ }
}

// ------------------------------------------------------------ onglets
```

par :

```js
async function rafraichirGit() {
  try { ui.modele.git = (await api('GET', '/api/etat')).git; } catch (e) { /* l'état affiché reste l'ancien */ }
}

/* Titres vus dans data.json, gardés dans ce navigateur : une entrée masquée
   n'y est plus, la liste des masquées affiche ainsi son titre. Jamais écrits
   dans config/ (dépôt public). */
function memoriserTitres(donnees) {
  try {
    const memo = JSON.parse(localStorage.getItem(CLE_TITRES) || '{}');
    for (const entree of (donnees && Array.isArray(donnees.entrees)) ? donnees.entrees : []) {
      if (entree && typeof entree.id === 'string' && entree.titre) memo[entree.id.slice(0, 12)] = entree.titre;
    }
    localStorage.setItem(CLE_TITRES, JSON.stringify(memo));
    ui.memo = memo;
  } catch (e) {
    ui.memo = {};
  }
}

// ------------------------------------------------------------ onglets
```

4. Remplacer :

```js
  dom.nouvelleFamille.focus();
}

// ------------------------------------------------------------ événements

const PANNEAUX = { projets: rendreProjets, familles: rendreFamilles };

function lier() {
  for (const nom of ONGLETS) $('onglet-' + nom).addEventListener('click', () => afficherOnglet(nom, true));
```

par :

```js
  dom.nouvelleFamille.focus();
}

// ------------------------------------------------------------ entrées

function rendreEntrees() {
  rendreListeEntrees();
  rendreDetailEntree();
}

function descriptionEntree(entree) {
  return [
    entree.type ? typeLabel(entree.type) : null,
    entree.projet ? nomProjet(entree.projet) : (entree.connue ? 'Sans projet' : null),
    entree.masquee ? 'masquée' : null,
    entree.connue && (entree.titre !== entree.titreOrigine || entree.resume !== entree.resumeOrigine) ? 'corrigée' : null,
  ].filter(Boolean).join(' · ');
}

function rendreListeEntrees() {
  const toutes = M.listeEntrees(ui.modele, ui.memo);
  const requete = dom.filtreEntrees.value;
  const visibles = toutes.filter((e) => correspond([e.titre, e.titreOrigine, e.court, e.projet ? nomProjet(e.projet) : ''].join(' '), requete));
  dom.compteEntrees.textContent = (requete.trim() ? visibles.length + ' sur ' : '') + plural(toutes.length, 'entrée', 'entrées');
  dom.listeEntrees.replaceChildren(...visibles.map((e) => el('li', null,
    el('button', { type: 'button', class: 'admin-item', 'data-court': e.court, 'aria-current': e.court === ui.entree ? 'true' : null },
      el('span', { class: 'admin-item-titre' }, e.titre || 'Entrée masquée ' + e.court),
      el('span', { class: 'admin-item-sous' }, descriptionEntree(e))))));
}

function ligneOrigine(champEntree, entree) {
  const origine = champEntree === 'titre' ? entree.titreOrigine : entree.resumeOrigine;
  const actuel = champEntree === 'titre' ? entree.titre : entree.resume;
  return el('p', { class: 'admin-origine', id: 'origine-' + champEntree, hidden: actuel === origine },
    champEntree === 'titre' ? 'Titre d’origine : ' : 'Résumé d’origine : ',
    el('span', { class: 'admin-origine-texte' }, origine || '(vide)'), ' ',
    el('button', { type: 'button', class: 'link-button', 'data-retablir': champEntree }, 'Rétablir'));
}

function rendreDetailEntree() {
  const entree = M.listeEntrees(ui.modele, ui.memo).find((e) => e.court === ui.entree);
  if (!entree) {
    ui.entree = null;
    dom.detailEntree.replaceChildren(vide('Choisir une entrée dans la liste pour corriger son titre ou son résumé, ou la masquer du site.'));
    return;
  }
  const caseMasquer = el('div', { class: 'champ admin-case' },
    el('input', { type: 'checkbox', id: 'entree-masquer', checked: entree.masquee, 'aria-describedby': 'entree-masquer-aide' }),
    el('label', { for: 'entree-masquer' }, 'Masquer du site'),
    el('p', { class: 'admin-aide', id: 'entree-masquer-aide' },
      'L’entrée disparaît du site public à la prochaine publication (la mémoire n’est pas modifiée) ; elle reste listée ici pour pouvoir la réafficher. Masquer retire aussi sa correction de titre et de résumé : config/entrees.json est publié avec le dépôt.'));
  if (!entree.connue) {
    dom.detailEntree.replaceChildren(
      el('h2', { id: 'titre-entree', tabindex: '-1' }, entree.titre || 'Entrée masquée'),
      el('p', { class: 'admin-aide' }, 'Identifiant ' + entree.court + '. Masquée, elle n’est plus dans les données du site : la réafficher puis lancer un aperçu la ramène dans la liste, avec son titre et son résumé.'),
      caseMasquer);
    return;
  }
  dom.detailEntree.replaceChildren(
    el('h2', { id: 'titre-entree', tabindex: '-1' }, entree.titre),
    el('p', { class: 'admin-aide' },
      [typeLabel(entree.type), entree.projet ? 'projet ' + nomProjet(entree.projet) : 'sans projet', 'identifiant ' + entree.court].join(' · ') + ' · ',
      el('a', { href: '/#/entree/' + entree.court, target: APERCU }, 'Voir la fiche sur le site local ↗')),
    champ('entree-titre', 'Titre', el('input', { type: 'text', id: 'entree-titre', value: entree.titre, autocomplete: 'off' })),
    ligneOrigine('titre', entree),
    champ('entree-resume', 'Résumé', el('textarea', { id: 'entree-resume', rows: '4' }, entree.resume)),
    ligneOrigine('resume', entree),
    caseMasquer);
}

function choisirEntree(court) {
  ui.entree = court;
  rendreEntrees();
  $('titre-entree').focus();
}

/* Après une correction : ligne « d'origine », titre de la fiche, liste, barre. */
function entreeModifiee() {
  const entree = M.listeEntrees(ui.modele, ui.memo).find((e) => e.court === ui.entree);
  if (entree && entree.connue) {
    $('titre-entree').textContent = entree.titre;
    $('origine-titre').hidden = entree.titre === entree.titreOrigine;
    $('origine-resume').hidden = entree.resume === entree.resumeOrigine;
  }
  rendreListeEntrees();
  rendreBarre();
}

function saisieEntree(event) {
  const champs = { 'entree-titre': 'titre', 'entree-resume': 'resume' };
  const champEntree = champs[event.target.id];
  if (!champEntree) return;
  M.corriger(ui.modele, ui.entree, champEntree, event.target.value);
  entreeModifiee();
}

/* Masquer une entrée corrigée retire sa correction (config/ est publié) : on le demande d'abord. */
function caseMasquer(event) {
  if (event.target.id !== 'entree-masquer') return;
  const entree = M.listeEntrees(ui.modele, ui.memo).find((e) => e.court === ui.entree);
  const retireCorrection = event.target.checked && entree && entree.connue
    && (entree.titre !== entree.titreOrigine || entree.resume !== entree.resumeOrigine);
  if (retireCorrection && !window.confirm('Masquer cette entrée retire aussi sa correction de titre et de résumé (config/entrees.json est publié avec le dépôt). Continuer ?')) {
    event.target.checked = false;
    return;
  }
  M.masquer(ui.modele, ui.entree, event.target.checked);
  if (retireCorrection) {
    $('entree-titre').value = entree.titreOrigine;
    $('entree-resume').value = entree.resumeOrigine;
  }
  entreeModifiee();
}

function retablir(event) {
  const bouton = event.target.closest('button[data-retablir]');
  if (!bouton) return;
  const champEntree = bouton.dataset.retablir;
  M.corriger(ui.modele, ui.entree, champEntree, '');
  const entree = M.listeEntrees(ui.modele, ui.memo).find((e) => e.court === ui.entree);
  const saisie = $(champEntree === 'titre' ? 'entree-titre' : 'entree-resume');
  saisie.value = champEntree === 'titre' ? entree.titreOrigine : entree.resumeOrigine;
  entreeModifiee();
  saisie.focus();
}

// ------------------------------------------------------------ recherche

function rendreRecherche() {
  const liste = M.groupes(ui.modele);
  dom.listeGroupes.replaceChildren(...liste.map((groupe, i) => el('li', { class: 'admin-groupe' },
    el('label', { for: 'groupe-' + (i + 1), class: 'visually-hidden' }, 'Groupe de synonymes n° ' + (i + 1)),
    el('input', { type: 'text', id: 'groupe-' + (i + 1), value: groupe.join(', '), 'data-index': String(i),
      placeholder: 'terme, autre terme, …', autocomplete: 'off', spellcheck: 'false' }),
    el('button', { type: 'button', class: 'btn-secondary', 'data-supprimer': String(i),
      'aria-label': 'Supprimer le groupe n° ' + (i + 1) }, 'Supprimer'))));
}

function saisieGroupe(event) {
  if (event.target.dataset.index === undefined) return;
  M.modifierGroupe(ui.modele, Number(event.target.dataset.index), event.target.value);
  rendreBarre();
}

function supprimerGroupe(event) {
  const bouton = event.target.closest('button[data-supprimer]');
  if (!bouton) return;
  const i = Number(bouton.dataset.supprimer);
  M.supprimerGroupe(ui.modele, i);
  rendreRecherche();
  rendreBarre();
  ($('groupe-' + (i + 1)) || $('groupe-' + i) || dom.ajouterGroupe).focus();
}

function ajouterGroupe() {
  const i = M.ajouterGroupe(ui.modele);
  rendreRecherche();
  rendreBarre();
  $('groupe-' + (i + 1)).focus();
}

// ------------------------------------------------------------ événements

const PANNEAUX = { projets: rendreProjets, familles: rendreFamilles, entrees: rendreEntrees, recherche: rendreRecherche };

function lier() {
  for (const nom of ONGLETS) $('onglet-' + nom).addEventListener('click', () => afficherOnglet(nom, true));
```

5. Remplacer :

```js
      ajouterFamille();
    }
  });
}

demarrer();
```

par :

```js
      ajouterFamille();
    }
  });

  dom.filtreEntrees.addEventListener('input', rendreListeEntrees);
  dom.listeEntrees.addEventListener('click', (event) => {
    const bouton = event.target.closest('button[data-court]');
    if (bouton) choisirEntree(bouton.dataset.court);
  });
  dom.detailEntree.addEventListener('input', saisieEntree);
  dom.detailEntree.addEventListener('change', caseMasquer);
  dom.detailEntree.addEventListener('click', retablir);

  dom.listeGroupes.addEventListener('input', saisieGroupe);
  dom.listeGroupes.addEventListener('click', supprimerGroupe);
  dom.ajouterGroupe.addEventListener('click', ajouterGroupe);
}

demarrer();
```

- [ ] **Step 6: Lancer les tests pour vérifier qu'ils passent**

Run: `node --test tests/js/admin.test.mjs`
Expected: 16 tests réussis.

Run: `cd tests/navigateur; node --test admin.test.mjs`
Expected: 18 tests réussis.

- [ ] **Step 7: Toutes les suites du site**

Run: `node --test "tests/js/*.test.mjs"`
Expected: 69 tests réussis.

Run: `cd tests/navigateur; npm test`
Expected: 122 tests réussis.

- [ ] **Step 8: Commit**

```bash
git add admin/modele.js admin/admin.js tests/js/admin.test.mjs tests/navigateur/admin.test.mjs
git commit -m "Admin : entrées (titre, résumé, masquer), synonymes, accessibilité

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Page d'admin : Aperçu et Publier

« Aperçu » ouvre l'onglet nommé dès le clic (`window.open('', 'memoire-vive-apercu')`, réutilisé d'une fois sur l'autre : Choix 22), enregistre, lance `POST /api/apercu`, recharge réglages et données, rend compte (sortie de l'export repliée) et envoie l'onglet sur le site local ; en cas d'échec, l'onglet resté vide se referme (lien « Ouvrir l'aperçu du site ↗ » en secours si le navigateur l'a bloqué). « Publier » demande confirmation, enregistre, lance `POST /api/publier` et rend compte : publié, refusé (raison du serveur, aussi écrite dans l'en-tête, avec la liste des réglages invalides) ou inachevé (réglages commités mais export en échec : relancer ; push refusé : l'explication du serveur). Le parcours complet de la spec § 6 C (renommer, changer de famille, fusionner, masquer, corriger un titre, aperçu, vérification dans `data.json`) se joue ici, ainsi qu'un aperçu de plus de 5 s avec le bloqueur de fenêtres de Chrome actif.

**Files:**

- Modify: `admin/admin.js` (`SITE_PUBLIC` ; `recharger` ; `apercu(onglet)`, `publier` ; boutons, onglet de l'aperçu ouvert au clic)
- Test: `tests/navigateur/admin.test.mjs` (section « aperçu et publication »)

**Interfaces:**

- Consumes: Tasks 4 à 7 (`POST /api/apercu`, `POST /api/publier`, `enregistrer`, `rapport`, `memoriserTitres`, `afficherOnglet`) ; banc : `banc.dashboard.etat.recherches`, `banc.dashboard.etat.delai`, `banc.git`, `banc.gitDistant`, `banc.ecrire`, `banc.remplacer`.
- Produces: `recharger()` (garde onglet, sélection, saisies faites pendant l'opération et leur empreinte de base), `apercu(onglet)` (onglet : fenêtre ouverte au clic, ou `null`), `publier()` (affiche `explication` si le serveur en donne une), `SITE_PUBLIC = 'https://chipat-neko.github.io/memoire-vive/'`.

- [ ] **Step 1: Tests navigateur**

Ajouter à la fin de `tests/navigateur/admin.test.mjs`, après une ligne vide :

```js
// ------------------------------------------------------------ aperçu et publication

test('parcours complet puis aperçu : le site local et data.json montrent chaque réglage, sans aucune recherche', async (t) => {
  const { banc, page } = await ouvrirAdmin(t);
  await choisirProjet(page, 'Voxelcraft');
  await page.fill('#projet-nom', 'Voxelcraft 2');
  await page.selectOption('#projet-famille', 'jeux');
  await choisirProjet(page, 'Rogue lite');
  await page.selectOption('#projet-fusion', 'depths');
  const fusion = accepterDialogue(page);
  await page.click('#bouton-fusionner');
  await fusion;
  await page.click('#onglet-entrees');
  await page.locator('#liste-entrees button', { hasText: 'premier réveil' }).click();
  await page.fill('#entree-titre', 'Jarvis se réveille');
  await page.locator('#liste-entrees button', { hasText: 'assistant vocal' }).click();
  await page.check('#entree-masquer');

  const [apercu] = await Promise.all([page.waitForEvent('popup'), page.click('#bouton-apercu')]);
  await page.locator('#compte-rendu-titre', { hasText: 'Aperçu prêt' }).waitFor();
  assert.equal(await page.textContent('#compte-rendu-message'), 'Le site local montre les réglages enregistrés. Les voisins '
    + 'des entrées nouvelles seront calculés à la publication.Ouvrir l’aperçu du site ↗');
  assert.equal(await page.getAttribute('#compte-rendu-details', 'open'), null, 'détail de l’export replié');
  assert.match(await page.textContent('#compte-rendu-sortie'), /aucune recherche en --sans-recherche/);
  assert.equal(banc.dashboard.etat.recherches, 0, 'l’aperçu n’écrit rien dans la mémoire partagée');
  assert.equal(banc.git('log', '--format=%s'), 'init', 'l’aperçu ne commite rien');

  const donnees = await banc.lire('docs/data.json');
  const projets = Object.fromEntries(donnees.projets.map((p) => [p.id, p]));
  assert.deepEqual(Object.keys(projets).sort(), ['depths', 'jarvis', 'voxelcraft'], 'rogue-lite fusionné dans depths');
  assert.equal(projets.depths.nb, 2);
  assert.equal(projets.jarvis.nb, 1);
  assert.equal(projets.voxelcraft.nom, 'Voxelcraft 2');
  assert.equal(projets.voxelcraft.famille, 'jeux');
  const entrees = Object.fromEntries(donnees.entrees.map((e) => [e.id.slice(0, 12), e]));
  assert.equal(entrees['000000000002'].titre, 'Jarvis se réveille');
  assert.equal(entrees['000000000002'].corrige, true);
  assert.equal(entrees['000000000001'], undefined, 'entrée masquée');
  assert.equal(entrees['000000000004'].projet, 'depths');

  await apercu.locator('.project-card').first().waitFor();
  assert.deepEqual((await apercu.locator('.family-title').allTextContents()).map((titre) => titre.split(' · ')[0].trim()),
    ['Jeux', 'IA & simulations']);
  assert.deepEqual(await apercu.locator('.project-card h4').allTextContents(), ['Voxelcraft 2', 'Depths', 'Jarvis']);
  await apercu.goto(banc.admin.base + '#/entree/000000000002');
  await apercu.locator('#entry-title', { hasText: 'Jarvis se réveille' }).waitFor();
  await terminer(page);
});

test('entrée masquée : après l’aperçu, toujours listée sous son titre mémorisé, réaffichable', async (t) => {
  const { banc, page } = await ouvrirAdmin(t);
  await page.click('#onglet-entrees');
  await page.locator('#liste-entrees button', { hasText: 'Voxelcraft' }).click();
  await page.check('#entree-masquer');
  await cliquerEtAttendre(page, '#bouton-apercu', 'Aperçu prêt');
  await page.bringToFront();  // l'onglet de l'aperçu, ouvert au clic, a pris le premier plan
  assert.equal((await banc.lire('docs/data.json')).entrees.some((e) => e.id.startsWith('000000000005')), false);
  const masquee = page.locator('#liste-entrees button', { hasText: 'Voxelcraft' });
  assert.equal(await masquee.locator('.admin-item-sous').textContent(), 'masquée');
  await masquee.click();
  assert.match(await page.textContent('#detail-entree .admin-aide'), /^Identifiant 000000000005\. Masquée/);
  await page.uncheck('#entree-masquer');
  await cliquerEtAttendre(page, '#bouton-enregistrer', 'Enregistré');
  assert.deepEqual(await banc.lire('config/entrees.json'), { _aide: 'Corrections de test.' });
  await terminer(page);
});

test('publier : commit des réglages, export complet, push vers le dépôt distant', async (t) => {
  const { banc, page } = await ouvrirAdmin(t);
  await choisirProjet(page, 'Depths');
  await page.fill('#projet-nom', 'Depths II');
  const message = accepterDialogue(page);
  await page.click('#bouton-publier');
  assert.match(await message, /^Publier sur le site public \?/);
  await page.locator('#compte-rendu-titre', { hasText: 'Publié' }).waitFor({ timeout: 30000 });
  assert.match(await page.textContent('#compte-rendu-sortie'), /git : commit « Réglages : projets et familles »/);
  assert.match(await page.textContent('#compte-rendu-sortie'), /git : push effectué\./);
  const sujets = banc.gitDistant('log', '--format=%s', 'main').split('\n');
  assert.equal(sujets.length, 3);
  assert.match(sujets[0], /^Export mémoire : 5 entrées/);
  assert.deepEqual(sujets.slice(1), ['Réglages : projets et familles', 'init']);
  assert.equal(banc.dashboard.etat.recherches, 5, 'export réel : une recherche par entrée nouvelle');
  assert.equal(await page.textContent('#etat-git'), 'Branche main · rien en attente de publication.');
  await terminer(page);
});

test('réglage invalide écrit à la main : signalé à l’ouverture, Publier refusé, rien commité', async (t) => {
  const { banc, page } = await ouvrirAdmin(t);
  const projets = await banc.lire('config/projets.json');
  projets.projets.depths.description = 'Clé : sk-ant-' + 'x'.repeat(30);
  await banc.remplacer('config/projets.json', JSON.stringify(projets));
  await page.reload();
  await page.locator('#compte-rendu-titre', { hasText: 'Réglages à corriger' }).waitFor();
  const erreur = 'Projet « depths », description : ressemble à un secret (clé, jeton ou mot de passe) ; ce texte serait publié sur le site.';
  assert.deepEqual(await page.locator('#compte-rendu-message li').allTextContents(), [erreur]);
  assert.match(await page.textContent('#etat-git'),
    /Publier est impossible pour l’instant : des réglages enregistrés ne passent pas la vérification \(config\/projets\.json\)/);
  const message = accepterDialogue(page);
  await page.click('#bouton-publier');
  await message;
  await page.locator('#compte-rendu-titre', { hasText: 'Publication refusée' }).waitFor();
  assert.deepEqual(await page.locator('#compte-rendu-message li').allTextContents(), [erreur]);
  assert.equal(banc.git('log', '--format=%s'), 'init');
  assert.equal(banc.gitDistant('log', '--format=%s', 'main'), 'init');
  assert.equal(banc.dashboard.etat.recherches, 0);
  refusAttendu(page, 409);
  await terminer(page);
});

test('aperçu de plus de 5 s, bloqueur de fenêtres actif : l’onglet du site s’ouvre quand même', async (t) => {
  // Playwright coupe d'habitude le bloqueur de fenêtres de Chrome : ici, il reste actif.
  const bloqueur = await chromium.launch({ executablePath: CHROME, headless: true, ignoreDefaultArgs: ['--disable-popup-blocking'] });
  t.after(() => bloqueur.close());
  const banc = await ouvrirBanc();
  t.after(() => banc.fermer());
  const page = await pageInstrumentee(bloqueur);
  await page.goto(banc.admin.adresse);
  await page.locator('#panneau-projets:not([hidden])').waitFor();
  banc.dashboard.etat.delai = 6000;  // l'export attend le dashboard 6 s
  const [apercu] = await Promise.all([page.waitForEvent('popup'), page.click('#bouton-apercu')]);
  await page.locator('#compte-rendu-titre', { hasText: 'Aperçu prêt' }).waitFor({ timeout: 30000 });
  await apercu.locator('.project-card').first().waitFor();
  assert.equal(new URL(apercu.url()).pathname, '/');
  await terminer(page);
});

test('publier refusé : fichier sans rapport modifié, explication, rien commité', async (t) => {
  const { banc, page } = await ouvrirAdmin(t);
  await banc.ecrire('scripts/export.py', '# essai en cours\n');
  await choisirProjet(page, 'Depths');
  await page.fill('#projet-nom', 'Depths II');
  const message = accepterDialogue(page);
  await page.click('#bouton-publier');
  await message;
  await page.locator('#compte-rendu-titre', { hasText: 'Publication refusée' }).waitFor();
  assert.match(await page.textContent('#compte-rendu-message'),
    /^Publication refusée : d'autres fichiers que les réglages ont des modifications pas encore commitées \(scripts\/export\.py\)/);
  assert.match(await page.textContent('#etat-git'), /Publier est impossible pour l’instant : d'autres fichiers/);
  assert.equal(banc.git('log', '--format=%s'), 'init');
  assert.equal((await banc.lire('config/projets.json')).projets.depths.nom, 'Depths II', 'les réglages sont enregistrés');
  assert.equal(banc.dashboard.etat.recherches, 0);
  refusAttendu(page, 409);
  await terminer(page);
});
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `cd tests/navigateur; node --test admin.test.mjs`
Expected: FAIL — les 6 nouveaux tests, les boutons ne faisant rien encore : `page.waitForEvent: Timeout 10000ms exceeded while waiting for event "popup"` (parcours, bloqueur de fenêtres), `page.waitForFunction: Timeout 10000ms exceeded` (entrée masquée), `Error: aucune boîte de dialogue en 10 s` (les deux publications et le réglage invalide) ; les 18 autres passent (`tests 24`, `pass 18`, `fail 6`).

- [ ] **Step 3: Brancher Aperçu et Publier dans `admin/admin.js`**

4 remplacements dans `admin/admin.js`, dans l'ordre (chaque texte à remplacer y est unique).

1. Remplacer :

```js
const CLE_JETON = 'memoire-vive:admin-jeton';
const CLE_TITRES = 'memoire-vive:admin-titres';
const ONGLETS = ['projets', 'familles', 'entrees', 'recherche'];
const APERCU = 'memoire-vive-apercu';  // onglet de l'aperçu, réutilisé d'une fois sur l'autre

const $ = (id) => document.getElementById(id);
```

par :

```js
const CLE_JETON = 'memoire-vive:admin-jeton';
const CLE_TITRES = 'memoire-vive:admin-titres';
const ONGLETS = ['projets', 'familles', 'entrees', 'recherche'];
const SITE_PUBLIC = 'https://chipat-neko.github.io/memoire-vive/';
const APERCU = 'memoire-vive-apercu';  // onglet de l'aperçu, réutilisé d'une fois sur l'autre

const $ = (id) => document.getElementById(id);
```

2. Remplacer :

```js
    rapport('attente', 'Réglages relus', 'Ces réglages étaient écrits sous une forme que l’export accepte, mais que la page écrit autrement (même effet sur le site) : « Enregistrer » écrit la forme de la page.',
      { details: notes });
  }
}

async function rafraichirGit() {
```

par :

```js
    rapport('attente', 'Réglages relus', 'Ces réglages étaient écrits sous une forme que l’export accepte, mais que la page écrit autrement (même effet sur le site) : « Enregistrer » écrit la forme de la page.',
      { details: notes });
  }
}

/* Recharge réglages et données (après un aperçu ou une publication) ; garde
   l'onglet, le projet et l'entrée ouverts, et les saisies faites pendant
   l'opération (tout était enregistré au départ : elles restent à enregistrer). */
async function recharger() {
  const avant = ui.modele;
  try {
    const etat = await api('GET', '/api/etat');
    ui.modele = M.creerModele(etat);
    memoriserTitres(etat.donnees);
  } catch (e) {
    return;
  }
  for (const nom of M.fichiersModifies(avant)) {
    ui.modele.brouillon[nom] = avant.brouillon[nom];
    ui.modele.empreintes[nom] = avant.empreintes[nom];  // ces saisies partent du fichier d'avant
  }
  afficherOnglet(ui.onglet);
  rendreBarre();
}

async function rafraichirGit() {
```

3. Remplacer :

```js
      + '. « Aperçu » les montre sur le site local, « Publier » les met en ligne.');
  }
  return true;
}

// ------------------------------------------------------------ aides de formulaire
```

par :

```js
      + '. « Aperçu » les montre sur le site local, « Publier » les met en ligne.');
  }
  return true;
}

/* onglet : la fenêtre de l'aperçu, ouverte dès le clic (window.open), car le
   navigateur bloque une fenêtre ouverte plusieurs secondes après le clic. Elle
   va sur le site local si l'aperçu réussit ; restée vide, elle se referme s'il
   échoue. Lien « Ouvrir l'aperçu du site » en secours, si elle a été bloquée. */
async function apercu(onglet) {
  const fermerSiVide = () => {
    try {
      if (onglet && !onglet.closed && onglet.location.href === 'about:blank') onglet.close();
    } catch (e) { /* onglet parti sur un autre site : laissé tel quel */ }
  };
  if (!(await enregistrer({ silencieux: true }))) {
    fermerSiVide();
    return;
  }
  rapport('attente', 'Aperçu en cours…', 'L’export lit la mémoire, sans rien y écrire : quelques secondes.');
  let resultat;
  try {
    resultat = await api('POST', '/api/apercu', {});
  } catch (e) {
    fermerSiVide();
    rapport('erreur', 'Aperçu impossible', e.message, { details: e.details, focus: true });
    return;
  }
  if (!resultat.ok) {
    fermerSiVide();
    rapport('erreur', 'Aperçu impossible', 'L’export a échoué : voir son compte rendu ci-dessous (le dashboard tourne-t-il ?).',
      { sortie: resultat.sortie, focus: true });
    return;
  }
  await recharger();
  rapport('ok', 'Aperçu prêt', 'Le site local montre les réglages enregistrés. Les voisins des entrées nouvelles seront calculés à la publication.',
    { sortie: resultat.sortie, apercu: true, focus: true });
  if (onglet && !onglet.closed) onglet.location.replace('/');
}

async function publier() {
  const accord = window.confirm('Publier sur le site public ?\n\nLes réglages enregistrés sont commités, puis l’export complet met le site à jour (commit de data.json, push). Les entrées nouvelles reçoivent leurs voisins : une recherche chacune dans la mémoire partagée. Ne pas lancer « Mettre à jour Mémoire Vive » pendant ce temps.');
  if (!accord) return;
  if (!(await enregistrer({ silencieux: true }))) return;
  rapport('attente', 'Publication en cours…', 'Commit des réglages, export complet, push : jusqu’à quelques minutes s’il y a beaucoup d’entrées nouvelles.');
  let resultat;
  try {
    resultat = await api('POST', '/api/publier', {});
  } catch (e) {
    await rafraichirGit();
    rendreBarre();
    rapport('erreur', 'Publication refusée', e.message, { details: e.details, focus: true });
    return;
  }
  await recharger();
  if (resultat.ok) {
    rapport('ok', 'Publié', 'Le site public se met à jour en une à deux minutes : ' + SITE_PUBLIC, { sortie: resultat.sortie, focus: true });
  } else {
    rapport('erreur', 'Publication inachevée', resultat.explication || (resultat.commit
      ? 'Les réglages sont commités, mais l’export a échoué : relancer « Publier » une fois le problème réglé (le commit en attente partira avec).'
      : 'L’export a échoué : voir son compte rendu ci-dessous.'), { sortie: resultat.sortie, focus: true });
  }
}

// ------------------------------------------------------------ aides de formulaire
```

4. Remplacer :

```js
  for (const nom of ONGLETS) $('onglet-' + nom).addEventListener('click', () => afficherOnglet(nom, true));
  dom.onglets.addEventListener('keydown', clavierOnglets);
  dom.enregistrer.addEventListener('click', () => executer(() => enregistrer()));
  dom.fermerCompteRendu.addEventListener('click', () => {
    dom.compteRendu.hidden = true;
    dom.enregistrer.focus();
```

par :

```js
  for (const nom of ONGLETS) $('onglet-' + nom).addEventListener('click', () => afficherOnglet(nom, true));
  dom.onglets.addEventListener('keydown', clavierOnglets);
  dom.enregistrer.addEventListener('click', () => executer(() => enregistrer()));
  // Onglet de l'aperçu ouvert pendant le clic (sinon bloqué si l'export dure) ; aucun s'il est déjà occupé.
  dom.apercu.addEventListener('click', () => {
    if (ui.occupe || !ui.modele) return;
    const onglet = window.open('', APERCU);
    executer(() => apercu(onglet));
  });
  dom.publier.addEventListener('click', () => executer(publier));
  dom.fermerCompteRendu.addEventListener('click', () => {
    dom.compteRendu.hidden = true;
    dom.enregistrer.focus();
```

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

Run: `cd tests/navigateur; node --test admin.test.mjs`
Expected: 24 tests réussis (le test du bloqueur de fenêtres dure une dizaine de secondes : le faux dashboard répond en 6 s).

- [ ] **Step 5: Toute la suite navigateur**

Run: `cd tests/navigateur; npm test`
Expected: 128 tests réussis.

- [ ] **Step 6: Commit**

```bash
git add admin/admin.js tests/navigateur/admin.test.mjs
git commit -m "Admin : Aperçu et Publier dans la page, compte rendu

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Lanceur `admin.cmd`, une seule page d'admin par dépôt, raccourci « Gérer Mémoire Vive »

Comme `exporter.cmd` : un fichier batch double-cliquable dans le dépôt (CRLF : `.gitattributes` a déjà `*.cmd text eol=crlf`), qui garde la fenêtre ouverte tant que la page sert ; et, hors dépôt, un raccourci sur le Bureau, du même modèle que « Mettre à jour Mémoire Vive.cmd » (un petit `.cmd` qui appelle celui du dépôt). Un second double-clic ne doit pas lancer une seconde page d'admin sur le même dépôt (deux fenêtres pourraient publier en même temps : Choix 13) : `main()` prend d'abord un verrou système, et sinon le dit et s'arrête.

**Files:**

- Create: `admin.cmd` ; hors dépôt : `C:\Users\chipat\Desktop\Gérer Mémoire Vive.cmd` (Bureau de Noah)
- Modify: `scripts/admin.py` (imports de `tempfile` et de `msvcrt` ou `fcntl` ; `DEJA_OUVERTE`, `verrou_d_instance`, début de `main`)
- Test: `tests/test_admin.py` (imports de `contextlib`, `io`, `sys` ; `LanceurTest`)

**Interfaces:**

- Consumes: `python scripts\admin.py %*` (Task 3) ; `main(argv)` (Task 3).
- Produces: `verrou_d_instance(racine: Path) -> fichier ouvert | None` (verrou exclusif non bloquant sur `<dossier temporaire>/memoire-vive-admin-<16 caractères du SHA-256 du chemin>.lock`, tenu tant que le fichier reste ouvert) ; `DEJA_OUVERTE` (message) ; `main()` renvoie 1 avec ce message si une autre page d'admin tient le verrou. `admin.cmd [options de admin.py]` ; raccourci Bureau qui appelle `D:\memoire_vive\admin.cmd` (et le dit s'il n'existe pas encore).

- [ ] **Step 1: Écrire les tests qui échouent**

2 remplacements dans `tests/test_admin.py`, dans l'ordre (chaque texte à remplacer y est unique).

1. Remplacer :

```python
fichiers écrits, serveur (sécurité, API), aperçu et publication. Aucune donnée
réelle modifiée, aucun accès au réseau extérieur ni au vrai dépôt distant.
"""
import hashlib
import http.client
import json
import os
import shutil
import socket
import subprocess
import tempfile
import threading
import time
```

par :

```python
fichiers écrits, serveur (sécurité, API), aperçu et publication. Aucune donnée
réelle modifiée, aucun accès au réseau extérieur ni au vrai dépôt distant.
"""
import contextlib
import hashlib
import http.client
import io
import json
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import threading
import time
```

2. Remplacer :

```python
        self.assertIn("[masqué]", corps["sortie"])


if __name__ == "__main__":
    unittest.main()
```

par :

```python
        self.assertIn("[masqué]", corps["sortie"])


class LanceurTest(unittest.TestCase):
    def test_admin_cmd_lance_le_serveur_en_crlf(self):
        brut = (RACINE / "admin.cmd").read_bytes()
        self.assertIn(b"python scripts\\admin.py %*", brut)
        self.assertIn(b"pause", brut)
        self.assertNotIn(b"\n", brut.replace(b"\r\n", b""), "cmd.exe exige des fins de ligne CRLF")
        attribut = sh("git", "check-attr", "eol", "--", "admin.cmd", cwd=RACINE)
        self.assertEqual(attribut, "admin.cmd: eol: crlf", ".gitattributes garde le CRLF au checkout")

    def test_aide_de_la_ligne_de_commande(self):
        sortie = sh(sys.executable, str(RACINE / "scripts" / "admin.py"), "--help", cwd=RACINE)
        self.assertIn("--sans-navigateur", sortie)
        self.assertIn("premier port essayé (défaut 8790", sortie)

    def test_une_seule_page_d_admin_par_depot(self):
        with tempfile.TemporaryDirectory() as dossier:
            premier = admin.verrou_d_instance(Path(dossier))
            self.assertIsNotNone(premier)
            try:
                self.assertIsNone(admin.verrou_d_instance(Path(dossier)), "second lancement sur le même dépôt")
                autre = admin.verrou_d_instance(Path(dossier) / "autre-depot")
                self.assertIsNotNone(autre, "un autre dépôt a sa propre page d'admin")
                autre.close()
            finally:
                premier.close()
            apres = admin.verrou_d_instance(Path(dossier))
            self.assertIsNotNone(apres, "relâché à la fermeture")
            apres.close()

    def test_seconde_page_d_admin_refusee_avec_explication(self):
        erreurs = io.StringIO()
        with mock.patch.object(admin, "verrou_d_instance", return_value=None), contextlib.redirect_stderr(erreurs):
            self.assertEqual(admin.main(["--sans-navigateur"]), 1)
        self.assertEqual(erreurs.getvalue(), admin.DEJA_OUVERTE + "\n")
        self.assertIn("tourne déjà", admin.DEJA_OUVERTE)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `python -m unittest tests.test_admin.LanceurTest -v`
Expected: FAIL — `test_admin_cmd_lance_le_serveur_en_crlf` : `FileNotFoundError: [Errno 2] No such file or directory: '…admin.cmd'` ; `test_une_seule_page_d_admin_par_depot` : `AttributeError: module 'admin' has no attribute 'verrou_d_instance'` ; `test_seconde_page_d_admin_refusee_avec_explication` : `AttributeError: <module 'admin' …> does not have the attribute 'verrou_d_instance'` ; `test_aide_de_la_ligne_de_commande` passe déjà (`Ran 4 tests`, `FAILED (errors=3)`).

- [ ] **Step 3: Une seule page d'admin par dépôt, dans `scripts/admin.py`**

3 remplacements dans `scripts/admin.py`, dans l'ordre (chaque texte à remplacer y est unique).

1. Remplacer :

```python
import signal
import subprocess
import sys
import threading
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote

sys.path.insert(0, str(Path(__file__).resolve().parent))
import export  # noqa: E402  (même dossier : masquage des secrets, liens, titres)
```

par :

```python
import signal
import subprocess
import sys
import tempfile
import threading
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote

if os.name == "nt":
    import msvcrt
else:
    import fcntl

sys.path.insert(0, str(Path(__file__).resolve().parent))
import export  # noqa: E402  (même dossier : masquage des secrets, liens, titres)
```

2. Remplacer :

```python
        self.envoyer(200, cible.read_bytes(), TYPES[cible.suffix.lower()])


def main(argv: list[str] | None = None) -> int:
    for flux in (sys.stdout, sys.stderr):
        if hasattr(flux, "reconfigure"):
```

par :

```python
        self.envoyer(200, cible.read_bytes(), TYPES[cible.suffix.lower()])


DEJA_OUVERTE = ("Échec : la page d'admin de ce dépôt tourne déjà, dans une autre fenêtre « Mémoire Vive - page "
                "d'admin » (son adresse y est affichée). L'utiliser, ou la fermer (Ctrl+C) avant d'en relancer une.")


def verrou_d_instance(racine: Path):
    """Verrou système exclusif sur un fichier propre à ce dépôt (dans le dossier
    temporaire) : une seule page d'admin par dépôt, sinon deux publications
    lanceraient deux exports à la fois. Tenu tant que le fichier renvoyé reste
    ouvert, relâché par le système même si le processus meurt ; None si une
    autre page d'admin le tient déjà."""
    cle = hashlib.sha256(str(Path(racine).resolve()).lower().encode("utf-8")).hexdigest()[:16]
    fichier = open(Path(tempfile.gettempdir()) / f"memoire-vive-admin-{cle}.lock", "a+b")
    try:
        fichier.seek(0)
        if os.name == "nt":
            msvcrt.locking(fichier.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            fcntl.flock(fichier.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        fichier.close()
        return None
    return fichier


def main(argv: list[str] | None = None) -> int:
    for flux in (sys.stdout, sys.stderr):
        if hasattr(flux, "reconfigure"):
```

3. Remplacer :

```python
    parser.add_argument("--sans-navigateur", action="store_true", help="n'ouvre pas le navigateur")
    args = parser.parse_args(argv)

    jeton = secrets.token_urlsafe(32)
    try:
        serveur = creer_serveur(ROOT, jeton, args.port)
```

par :

```python
    parser.add_argument("--sans-navigateur", action="store_true", help="n'ouvre pas le navigateur")
    args = parser.parse_args(argv)

    instance = verrou_d_instance(ROOT)  # gardé jusqu'à la fin du processus
    if instance is None:
        print(DEJA_OUVERTE, file=sys.stderr)
        return 1
    jeton = secrets.token_urlsafe(32)
    try:
        serveur = creer_serveur(ROOT, jeton, args.port)
```

- [ ] **Step 4: Créer `admin.cmd`, en CRLF**

Contenu de `admin.cmd`, à la racine du dépôt :

```bat
@echo off
rem Page d'admin locale de Mémoire Vive : réglages des projets, des familles,
rem des entrées et de la recherche. Double-cliquable (raccourci « Gérer Mémoire
rem Vive » sur le Bureau). La fenêtre reste ouverte tant que la page sert ;
rem Ctrl+C l'arrête. Les options de scripts\admin.py passent telles quelles
rem (ex. admin.cmd --port 8800).
chcp 65001 >nul
title Mémoire Vive - page d'admin
cd /d "%~dp0"

python scripts\admin.py %*
set "RC=%ERRORLEVEL%"

echo.
if not "%RC%"=="0" echo Échec : voir le message ci-dessus.
pause
exit /b %RC%
```

Puis forcer les fins de ligne CRLF et l'UTF-8 sans BOM (un BOM ferait échouer `@echo off`) dans la copie de travail, sans attendre un checkout :

```powershell
$texte = [IO.File]::ReadAllText("$PWD\admin.cmd")
[IO.File]::WriteAllText("$PWD\admin.cmd", ($texte -replace "`r?`n", "`r`n"), (New-Object Text.UTF8Encoding $false))
git check-attr eol -- admin.cmd   # attendu : admin.cmd: eol: crlf
```

- [ ] **Step 5: Lancer les tests pour vérifier qu'ils passent**

Run: `python -m unittest tests.test_admin.LanceurTest -v`
Expected: `Ran 4 tests` … `OK`.

- [ ] **Step 6: Toute la suite Python**

Run: `python -m unittest discover -s tests`
Expected: `Ran 164 tests` … `OK`.

- [ ] **Step 7: Essai du double-clic**

Double-cliquer sur `D:\memoire_vive-chantier-c\admin.cmd`. Expected : une fenêtre « Mémoire Vive - page d'admin » affiche l'adresse (accents lisibles) et le navigateur s'ouvre sur la page (branche `chantier-c` : l'en-tête dit que publier est impossible, c'est normal). Ne cliquer ni « Aperçu » ni « Publier » (Choix 18). Double-cliquer une seconde fois sur `admin.cmd` pendant que la première fenêtre tourne : la seconde affiche « Échec : la page d'admin de ce dépôt tourne déjà, dans une autre fenêtre « Mémoire Vive - page d'admin » … », puis « Échec : voir le message ci-dessus. » ; une touche la ferme, la première continue. Ctrl+C dans la première fenêtre : « Page d'admin arrêtée. », puis « Terminer le programme de commandes (O/N) ? » ; répondre N : « Appuyez sur une touche pour continuer… », une touche ferme la fenêtre.

- [ ] **Step 8: Raccourci « Gérer Mémoire Vive » sur le Bureau (hors dépôt)**

Même modèle que le raccourci d'export (`C:\Users\chipat\Desktop\Mettre à jour Mémoire Vive.cmd`, qui fait `call "D:\memoire_vive\exporter.cmd" %*`). Tant que le chantier n'est pas publié, `D:\memoire_vive\admin.cmd` n'existe pas : le raccourci le dit au lieu d'échouer en silence.

```powershell
$raccourci = Join-Path ([Environment]::GetFolderPath('Desktop')) 'Gérer Mémoire Vive.cmd'
$lignes = @(
  '@echo off'
  'rem Raccourci : ouvre la page d''admin locale de Mémoire Vive (D:\memoire_vive\admin.cmd).'
  'chcp 65001 >nul'
  'if not exist "D:\memoire_vive\admin.cmd" ('
  '    echo La page d''admin n''est pas encore installée : D:\memoire_vive\admin.cmd est introuvable.'
  '    pause'
  '    exit /b 1'
  ')'
  'call "D:\memoire_vive\admin.cmd" %*'
)
[IO.File]::WriteAllText($raccourci, ($lignes -join "`r`n") + "`r`n", (New-Object Text.UTF8Encoding $false))
Get-Content -Encoding UTF8 $raccourci
```

Expected : le fichier `Gérer Mémoire Vive.cmd` apparaît sur le Bureau, à côté de « Mettre à jour Mémoire Vive.cmd » ; `Get-Content` affiche les neuf lignes, accents compris. Double-clic (avant publication) : « La page d'admin n'est pas encore installée : D:\memoire_vive\admin.cmd est introuvable. » puis une touche ferme la fenêtre. Après la publication (voir « Après le plan »), il ouvre la page d'admin sur `D:\memoire_vive`.

- [ ] **Step 9: Commit**

```bash
git add admin.cmd scripts/admin.py tests/test_admin.py
git commit -m "Admin : lanceur admin.cmd (CRLF), une seule page d'admin par dépôt

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: README : page d'admin, `--sans-recherche`, tests ; aide de `config/projets.json`

Documentation seulement ; le cycle de test consiste à exécuter chaque commande ajoutée au README. `admin-reel.test.mjs` n'existe qu'à la Task 11 : c'est elle qui le mentionne dans le README.

**Files:**

- Modify: `README.md` ; `config/projets.json` (texte de `_aide` seulement : « Modifiables à la main ou, plus tard, depuis la page d'admin locale » devient « Modifiables depuis la page d'admin locale (admin.cmd) ou à la main » ; rien d'autre ne change dans le fichier)

**Interfaces:**

- Consumes: tout ce qui précède.
- Produces: section « La page d'admin locale », option `--sans-recherche`, tests de l'admin, structure, dépannage.

- [ ] **Step 1: Modifier `README.md`**

7 remplacements dans `README.md`, dans l'ordre (chaque texte à remplacer y est unique).

1. Remplacer :

```markdown
- **Données** : `docs/data.json`, généré à l'avance. Le site ne fait aucun appel réseau
  en dehors de ce fichier.
- **Export** : `scripts/export.py` (Python 3.9+, bibliothèque standard uniquement).

## Mettre à jour le site
```

par :

```markdown
- **Données** : `docs/data.json`, généré à l'avance. Le site ne fait aucun appel réseau
  en dehors de ce fichier.
- **Export** : `scripts/export.py` (Python 3.9+, bibliothèque standard uniquement).
- **Réglages** : page d'admin locale, jamais publiée (`admin.cmd`, voir « La page d'admin
  locale »).

## Mettre à jour le site
```

2. Remplacer :

```markdown
| `--no-push` | commit sans push |
| `--force` | publie même si le nombre d'entrées a chuté de plus de moitié |
| `--recalculer-voisins` | recherche les voisins de toutes les entrées, pas seulement des nouvelles (une recherche par entrée) |

Tester le site en local : `node tests/navigateur/serveur.mjs` puis
<http://127.0.0.1:8080/memoire-vive/> (même sous-chemin que GitHub Pages ; Node seul, sans
```

par :

```markdown
| `--no-push` | commit sans push |
| `--force` | publie même si le nombre d'entrées a chuté de plus de moitié |
| `--recalculer-voisins` | recherche les voisins de toutes les entrées, pas seulement des nouvelles (une recherche par entrée) |
| `--sans-recherche` | écrit `data.json` sans **aucune** recherche de voisins (aperçu de la page d'admin) : les entrées nouvelles attendent le prochain export (`voisins_en_attente`) |

Tester le site en local : `node tests/navigateur/serveur.mjs` puis
<http://127.0.0.1:8080/memoire-vive/> (même sous-chemin que GitHub Pages ; Node seul, sans
```

3. Remplacer :

```markdown
l'éviter, publier les modules modifiés dans un nouveau dossier (`js/v2/…`, chemin de
`index.html` compris).

## Régler les projets, les entrées et la recherche

Trois fichiers facultatifs, dans `config/`, modifiables à la main. La clé `_aide` de
chacun rappelle son mode d'emploi ; l'export l'ignore.

### `config/projets.json` (version 2)
```

par :

```markdown
l'éviter, publier les modules modifiés dans un nouveau dossier (`js/v2/…`, chemin de
`index.html` compris).

## La page d'admin locale

Double-cliquer sur `admin.cmd` (raccourci « Gérer Mémoire Vive » sur le Bureau) : une
fenêtre de commande démarre un petit serveur local et ouvre la page dans le navigateur.
Laisser la fenêtre ouverte pendant les réglages ; Ctrl+C l'arrête. Rien de cette page
n'est publié (le dossier `admin/` est hors de `docs/`).

| Onglet | Réglages |
| --- | --- |
| Projets | nom affiché, famille, description, lien principal (un des liens du projet ou une autre adresse), alias ; « Fusionner dans… » : le projet devient un alias d'un autre, ses entrées y passent |
| Familles | ajouter, renommer, réordonner, couleur (1 à 6), supprimer (ses projets passent « Sans famille ») |
| Entrées | titre et résumé corrigés (l'original reste affiché, « Rétablir » y revient), « Masquer du site » (retire aussi la correction du titre et du résumé) |
| Recherche | groupes de synonymes |

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
```

4. Remplacer :

```markdown
Ni la mémoire réelle ni le réseau extérieur ne sont touchés : `tests/test_publication.py`
lance l'export contre un faux dashboard local, dans un dépôt git temporaire relié à un
dépôt distant local.

Tests navigateur : le Chrome installé, piloté par `playwright-core`, seule dépendance de
développement, isolée dans `tests/navigateur/` (le site n'en a aucune) :
```

par :

```markdown
Ni la mémoire réelle ni le réseau extérieur ne sont touchés : `tests/test_publication.py`
lance l'export contre un faux dashboard local, dans un dépôt git temporaire relié à un
dépôt distant local ; `tests/test_admin.py` fait de même avec le serveur de la page
d'admin, lancé sur un port libre.

Tests navigateur : le Chrome installé, piloté par `playwright-core`, seule dépendance de
développement, isolée dans `tests/navigateur/` (le site n'en a aucune) :
```

5. Remplacer :

```markdown
Chaque fichier de test démarre son propre serveur statique sur un port libre (`docs/` servi
sous `/memoire-vive/`, comme GitHub Pages) et l'arrête à la fin. Les données viennent de
jeux synthétiques (`donnees-test.mjs`), sauf `reel.test.mjs` qui lit le vrai `data.json`.

| Variable | Effet |
| --- | --- |
| `MEMOIRE_CHROME` | chemin de Chrome (défaut : `C:/Program Files/Google/Chrome/Application/chrome.exe`) |
| `MEMOIRE_SITE_URL` | rejoue la suite sur un site publié au lieu du serveur local |

Rejouer la suite sur le site publié : `$env:MEMOIRE_SITE_URL = 'https://chipat-neko.github.io/memoire-vive/'; npm test`.
```

par :

```markdown
Chaque fichier de test démarre son propre serveur statique sur un port libre (`docs/` servi
sous `/memoire-vive/`, comme GitHub Pages) et l'arrête à la fin. Les données viennent de
jeux synthétiques (`donnees-test.mjs`), sauf `reel.test.mjs` qui lit le vrai `data.json`.
La page d'admin (`admin.test.mjs`) est testée contre `scripts/admin.py`, que
`banc-admin.mjs` lance dans un dépôt git temporaire (copie du site, faux dashboard, dépôt
distant local).

| Variable | Effet |
| --- | --- |
| `MEMOIRE_CHROME` | chemin de Chrome (défaut : `C:/Program Files/Google/Chrome/Application/chrome.exe`) |
| `MEMOIRE_SITE_URL` | rejoue la suite sur un site publié au lieu du serveur local (les tests de la page d'admin restent locaux) |
| `MEMOIRE_PYTHON` | commande Python des tests de la page d'admin (défaut : `python`) |

Rejouer la suite sur le site publié : `$env:MEMOIRE_SITE_URL = 'https://chipat-neko.github.io/memoire-vive/'; npm test`.
```

6. Remplacer :

```markdown
  style.css         palette et proportions de l'artifact « Bibliothèque Claude »
  theme.js          thème clair/sombre mémorisé, appliqué avant le rendu
  data.json         généré par l'export, ne pas modifier à la main
scripts/export.py   export + commit + push
exporter.cmd        la même chose en double-clic (Windows)
config/             réglages facultatifs : projets.json, entrees.json, recherche.json
tests/              tests unitaires et d'intégration de l'export (Python)
  js/               tests unitaires du site (node --test)
  navigateur/       tests navigateur (playwright-core, Chrome installé)
phase2/             modèle de workflow GitHub Actions, inactif
```

par :

```markdown
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
```

7. Remplacer :

```markdown
| `Lien principal configuré refusé` | `lien_principal` d'un projet local, invalide ou contenant un secret : le corriger dans `config/projets.json` |
| `entrée(s) encore sans recherche de voisins` | budget de temps épuisé ou recherches en échec : elles seront cherchées au prochain export |
| `la correction « … » doit être un objet JSON` | valeur mal écrite dans `config/entrees.json` |
```

par :

```markdown
| `Lien principal configuré refusé` | `lien_principal` d'un projet local, invalide ou contenant un secret : le corriger dans `config/projets.json` |
| `entrée(s) encore sans recherche de voisins` | budget de temps épuisé ou recherches en échec : elles seront cherchées au prochain export |
| `la correction « … » doit être un objet JSON` | valeur mal écrite dans `config/entrees.json` |
| `Jeton absent`, `Accès refusé` (page d'admin) | page d'admin relancée, ou ouverte sans son adresse : fermer l'onglet et relancer `admin.cmd` |
| `Réglages refusés : rien n'a été enregistré.` | un champ ne passe pas la vérification : la liste dit lequel et pourquoi |
| `Publication refusée : …` | copie de travail hors de `main`, autres fichiers modifiés ou commits locaux sans rapport : le message dit quoi faire |
| `Occupé : un aperçu ou une publication est en cours` | attendre la fin de l'opération en cours |
| `… a changé depuis l'ouverture de la page` | le fichier a été modifié ailleurs (à la main, autre onglet) : recharger la page, refaire la modification |
| `Réglages à corriger` (à l'ouverture de la page) | un réglage modifié à la main ne passe pas la vérification : le corriger (la liste dit lequel), sinon « Aperçu » et « Publier » sont refusés |
| `Le dépôt GitHub a des commits que cet ordinateur n'a pas encore` | dans `D:\memoire_vive`, lancer `git pull --rebase`, puis « Publier » |
| `la page d'admin de ce dépôt tourne déjà` | utiliser la fenêtre « Mémoire Vive - page d'admin » déjà ouverte, ou la fermer d'abord |
| `aucun port libre entre 8790 et 8809` | ces ports sont pris par d'autres programmes : `admin.cmd --port 8900` |
| `Aperçu impossible` avec `injoignable (…)` | lancer `start-memory-rest.ps1` : l'aperçu lit la mémoire |
```

Puis, dans `config/projets.json` :

Remplacer :

```json
{
  "_aide": "Réglages des projets (version 2). Modifiables à la main ou, plus tard, depuis la page d'admin locale. familles : ordre d'affichage et couleur (1 à 6). projets : nom, famille, alias (tags fusionnés dans ce projet), description, lien_principal ; toutes les clés sont facultatives. tags_generiques : tags qui ne désignent jamais un projet. tags_exclus : entrées jamais publiées.",
  "version": 2,
  "familles": [
    { "id": "jeux", "nom": "Jeux & univers de jeu", "couleur": 1 },
```

par :

```json
{
  "_aide": "Réglages des projets (version 2). Modifiables depuis la page d'admin locale (admin.cmd) ou à la main. familles : ordre d'affichage et couleur (1 à 6). projets : nom, famille, alias (tags fusionnés dans ce projet), description, lien_principal ; toutes les clés sont facultatives. tags_generiques : tags qui ne désignent jamais un projet. tags_exclus : entrées jamais publiées.",
  "version": 2,
  "familles": [
    { "id": "jeux", "nom": "Jeux & univers de jeu", "couleur": 1 },
```

- [ ] **Step 2: Vérifier chaque commande documentée**

Run: `python scripts/admin.py --help`
Expected: l'aide cite `--port PORT` (« premier port essayé (défaut 8790, puis les suivants ; 0 : port choisi par le système) ») et `--sans-navigateur`.

Run: `python scripts/export.py --help`
Expected: l'aide cite `--sans-recherche`.

Run: `python -m unittest discover -s tests`
Expected: `Ran 164 tests` … `OK` (les réglages réels, `_aide` modifiée comprise, passent toujours la validation et l'aller-retour de `formater`).

Run: `node --test "tests/js/*.test.mjs"`
Expected: 69 tests réussis.

Run: `cd tests/navigateur; npm test`
Expected: 128 tests réussis.

- [ ] **Step 3: Commit**

```bash
git add README.md config/projets.json
git commit -m "Documentation : page d'admin locale, --sans-recherche, tests ; aide de config/projets.json

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Recette finale sur les données réelles (sans jamais publier)

Dernière vérification avant la revue, en deux temps. D'abord, un fichier de tests ouvre la page sur une **copie** des vrais réglages et du vrai `data.json` (dépôt temporaire, aucun dashboard interrogé) : chaque projet, chaque entrée s'ouvre, les originaux sont les titres publiés, et un réglage par fichier s'enregistre (les vrais fichiers passent la validation, le reste est intact). Ensuite, une recette à la main contre le **vrai** dashboard, dans un clone jetable de la branche, avec une copie de `.env` : l'aperçu lit la vraie mémoire sans y écrire, et la publication est refusée (branche `chantier-c`, aucun dépôt distant).

**Files:**

- Modify: `tests/navigateur/banc-admin.mjs` (option `reel` de `preparerDepot` et `ouvrirBanc`) ; `README.md` (paragraphe des tests navigateur : `admin-reel.test.mjs`)
- Test: `tests/navigateur/admin-reel.test.mjs` (créé)

**Interfaces:**

- Consumes: `ouvrirBanc`, `pageInstrumentee`, `terminer`, `debordement` ; vrais `config/*.json` et `docs/data.json` (lus, jamais modifiés).
- Produces: `preparerDepot(dossier, dashboard, { reel = false } = {})`, `ouvrirBanc({ reel = false } = {})` (reel : copies des vrais réglages et du vrai `data.json`, pas d'export initial) ; `tests/navigateur/admin-reel.test.mjs`.

- [ ] **Step 1: Ajouter l'option `reel` au banc**

2 remplacements dans `tests/navigateur/banc-admin.mjs`, dans l'ordre (chaque texte à remplacer y est unique).

1. Remplacer :

```js
  return execFileSync('git', args, { cwd: dossier, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

/* Dépôt de travail dans dossier : copie de scripts/, docs/ (sans le vrai
   data.json) et admin/, réglages de test, data.json tiré du faux dashboard ;
   premier commit poussé vers un dépôt distant local (branche main suivie). */
export async function preparerDepot(dossier, dashboard) {
  const racine = path.join(dossier, 'depot');
  const distant = path.join(dossier, 'distant.git');
  for (const sous of ['scripts', 'docs', 'admin']) {
    await fs.cp(path.join(RACINE_DEPOT, sous), path.join(racine, sous),
      { recursive: true, filter: (source) => !source.includes('__pycache__') });
  }
  await fs.rm(path.join(racine, 'docs', 'data.json'), { force: true });
  for (const fichier of ['.gitignore', '.gitattributes']) {
    await fs.copyFile(path.join(RACINE_DEPOT, fichier), path.join(racine, fichier));
  }
  await fs.mkdir(path.join(racine, 'config'));
  for (const [nom, contenu] of Object.entries(REGLAGES)) {
    await fs.writeFile(path.join(racine, 'config', nom + '.json'), JSON.stringify(contenu, null, 2) + '\n');
  }
  // Asynchrone : le faux dashboard tourne dans ce processus et doit pouvoir répondre.
  await promisify(execFile)(PYTHON, ['scripts/export.py', '--no-git', '--sans-recherche'],
    { cwd: racine, env: environnement(dashboard), encoding: 'utf8' });
  git(dossier, 'init', '-q', '--bare', '-b', 'main', distant);
  git(racine, 'init', '-q', '-b', 'main');
  git(racine, 'config', 'user.name', 'test');
```

par :

```js
  return execFileSync('git', args, { cwd: dossier, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

/* Dépôt de travail dans dossier : copie de scripts/, docs/ et admin/ ;
   réglages de test et data.json tiré du faux dashboard, ou (reel) copies des
   vrais réglages et du vrai data.json ; premier commit poussé vers un dépôt
   distant local (branche main suivie). */
export async function preparerDepot(dossier, dashboard, { reel = false } = {}) {
  const racine = path.join(dossier, 'depot');
  const distant = path.join(dossier, 'distant.git');
  for (const sous of ['scripts', 'docs', 'admin']) {
    await fs.cp(path.join(RACINE_DEPOT, sous), path.join(racine, sous),
      { recursive: true, filter: (source) => !source.includes('__pycache__') });
  }
  if (!reel) await fs.rm(path.join(racine, 'docs', 'data.json'), { force: true });
  for (const fichier of ['.gitignore', '.gitattributes']) {
    await fs.copyFile(path.join(RACINE_DEPOT, fichier), path.join(racine, fichier));
  }
  if (reel) {
    await fs.cp(path.join(RACINE_DEPOT, 'config'), path.join(racine, 'config'), { recursive: true });
  } else {
    await fs.mkdir(path.join(racine, 'config'));
    for (const [nom, contenu] of Object.entries(REGLAGES)) {
      await fs.writeFile(path.join(racine, 'config', nom + '.json'), JSON.stringify(contenu, null, 2) + '\n');
    }
    // Asynchrone : le faux dashboard tourne dans ce processus et doit pouvoir répondre.
    await promisify(execFile)(PYTHON, ['scripts/export.py', '--no-git', '--sans-recherche'],
      { cwd: racine, env: environnement(dashboard), encoding: 'utf8' });
  }
  git(dossier, 'init', '-q', '--bare', '-b', 'main', distant);
  git(racine, 'init', '-q', '-b', 'main');
  git(racine, 'config', 'user.name', 'test');
```

2. Remplacer :

```js
  };
}

/* Banc complet ; fermer() arrête tout et efface le dossier temporaire. */
export async function ouvrirBanc() {
  const dossier = await fs.mkdtemp(path.join(os.tmpdir(), 'mv-admin-'));
  const effacer = () => fs.rm(dossier, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  const dashboard = await demarrerDashboard();
  let depot;
  let admin;
  try {
    depot = await preparerDepot(dossier, dashboard);
    admin = await lancerAdmin(depot.racine, dashboard);
  } catch (erreur) {
    // Montage raté (admin/ absent, Python introuvable…) : tout est arrêté,
```

par :

```js
  };
}

/* Banc complet ; fermer() arrête tout et efface le dossier temporaire.
   reel : vrais réglages et vrai data.json (copiés, jamais modifiés). */
export async function ouvrirBanc({ reel = false } = {}) {
  const dossier = await fs.mkdtemp(path.join(os.tmpdir(), 'mv-admin-'));
  const effacer = () => fs.rm(dossier, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  const dashboard = await demarrerDashboard();
  let depot;
  let admin;
  try {
    depot = await preparerDepot(dossier, dashboard, { reel });
    admin = await lancerAdmin(depot.racine, dashboard);
  } catch (erreur) {
    // Montage raté (admin/ absent, Python introuvable…) : tout est arrêté,
```

- [ ] **Step 2: Créer `tests/navigateur/admin-reel.test.mjs`**

```js
/* Recette de la page d'admin sur les vrais réglages et le vrai data.json du
   dépôt, copiés dans un dépôt temporaire : rien de réel n'est modifié ni
   publié, aucun dashboard n'est interrogé. Vérifications indépendantes du contenu. */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { CHROME, pageInstrumentee, terminer, debordement } from './outils.mjs';
import { ouvrirBanc } from './banc-admin.mjs';

let navigateur;
let banc;
let donnees;
let reglages;
before(async () => {
  navigateur = await chromium.launch({ executablePath: CHROME, headless: true });
  banc = await ouvrirBanc({ reel: true });
  donnees = await banc.lire('docs/data.json');
  reglages = {
    projets: await banc.lire('config/projets.json'),
    entrees: await banc.lire('config/entrees.json'),
    recherche: await banc.lire('config/recherche.json'),
  };
});
after(async () => {
  await banc.fermer();
  await navigateur.close();
});

async function ouvrir() {
  const page = await pageInstrumentee(navigateur);
  await page.goto(banc.admin.adresse);
  await page.locator('#panneau-projets:not([hidden])').waitFor();
  return page;
}

test('réel : chaque projet est listé et sa fiche s’ouvre', async () => {
  const page = await ouvrir();
  const alias = new Set(Object.values(reglages.projets.projets).flatMap((r) => r.alias || []));
  const attendus = new Set([...donnees.projets.map((p) => p.id), ...Object.keys(reglages.projets.projets)]
    .filter((id) => !alias.has(id)));
  const ids = await page.locator('#liste-projets button').evaluateAll((boutons) => boutons.map((b) => b.dataset.id));
  assert.deepEqual(new Set(ids), attendus);
  assert.equal(ids.length, attendus.size);
  for (const id of ids) {
    await page.click(`#liste-projets button[data-id="${id}"]`);
    await page.locator(`#liste-projets button[data-id="${id}"][aria-current="true"]`).waitFor();
    await page.locator('#titre-projet').waitFor();
  }
  assert.ok(await debordement(page) <= 0);
  await terminer(page);
});

test('réel : chaque entrée est listée, sa fiche s’ouvre, l’original d’une entrée non corrigée est son titre', async () => {
  const page = await ouvrir();
  await page.click('#onglet-entrees');
  const publiees = new Set(donnees.entrees.map((e) => e.id.slice(0, 12)));
  const masquees = Object.entries(reglages.entrees)
    .filter(([cle, c]) => !cle.startsWith('_') && c.masquer === true && !publiees.has(cle));
  const courts = await page.locator('#liste-entrees button').evaluateAll((boutons) => boutons.map((b) => b.dataset.court));
  assert.equal(courts.length, donnees.entrees.length + masquees.length);
  for (const entree of donnees.entrees) {
    const court = entree.id.slice(0, 12);
    await page.click(`#liste-entrees button[data-court="${court}"]`);
    await page.locator('#titre-entree').waitFor();
    if (!entree.corrige) {
      assert.equal(await page.inputValue('#entree-titre'), entree.titre, court);
      assert.equal(await page.isHidden('#origine-titre'), true, court);
    }
  }
  await terminer(page);
});

test('réel : un réglage par fichier, enregistré ; les vrais fichiers passent la validation, le reste est intact', async () => {
  const page = await ouvrir();
  const premier = await page.locator('#liste-projets button').first().getAttribute('data-id');
  await page.click(`#liste-projets button[data-id="${premier}"]`);
  await page.fill('#projet-description', 'Description de recette.');
  await page.click('#onglet-entrees');
  const entree = donnees.entrees[0].id.slice(0, 12);
  await page.click(`#liste-entrees button[data-court="${entree}"]`);
  await page.fill('#entree-titre', 'Titre de recette');
  await page.click('#onglet-recherche');
  await page.click('#bouton-ajouter-groupe');
  await page.keyboard.type('recette, essai');
  await page.click('#bouton-enregistrer');
  await page.waitForFunction(() => document.getElementById('compte-rendu-titre').textContent === 'Enregistré');

  const attendu = structuredClone(reglages);
  attendu.projets.projets[premier] = { ...(attendu.projets.projets[premier] || {}), description: 'Description de recette.' };
  attendu.entrees[entree] = { ...(attendu.entrees[entree] || {}), titre: 'Titre de recette' };
  attendu.recherche.synonymes.push(['recette', 'essai']);
  assert.deepEqual(await banc.lire('config/projets.json'), attendu.projets);
  assert.deepEqual(await banc.lire('config/entrees.json'), attendu.entrees);
  assert.deepEqual(await banc.lire('config/recherche.json'), attendu.recherche);
  await terminer(page);
});
```

- [ ] **Step 3: Lancer la recette automatique**

Run: `cd tests/navigateur; node --test admin-reel.test.mjs`
Expected: 3 tests réussis (sur les données réelles du dépôt).

Si un test échoue, c'est un défaut de la page révélé par les vraies données : le reproduire dans `admin.test.mjs` ou `tests/js/admin.test.mjs` sur le jeu synthétique, corriger, puis reprendre.

- [ ] **Step 4: Documenter la recette dans `README.md`**

Remplacer :

```markdown
Chaque fichier de test démarre son propre serveur statique sur un port libre (`docs/` servi
sous `/memoire-vive/`, comme GitHub Pages) et l'arrête à la fin. Les données viennent de
jeux synthétiques (`donnees-test.mjs`), sauf `reel.test.mjs` qui lit le vrai `data.json`.
La page d'admin (`admin.test.mjs`) est testée contre `scripts/admin.py`, que
`banc-admin.mjs` lance dans un dépôt git temporaire (copie du site, faux dashboard, dépôt
distant local).

| Variable | Effet |
| --- | --- |
```

par :

```markdown
Chaque fichier de test démarre son propre serveur statique sur un port libre (`docs/` servi
sous `/memoire-vive/`, comme GitHub Pages) et l'arrête à la fin. Les données viennent de
jeux synthétiques (`donnees-test.mjs`), sauf `reel.test.mjs` qui lit le vrai `data.json`.
La page d'admin (`admin.test.mjs`, `admin-reel.test.mjs`) est testée contre
`scripts/admin.py`, que `banc-admin.mjs` lance dans un dépôt git temporaire (copie du site,
faux dashboard, dépôt distant local) ; `admin-reel.test.mjs` y copie les vrais réglages et
le vrai `data.json`.

| Variable | Effet |
| --- | --- |
```

- [ ] **Step 5: Toutes les suites, ensemble**

Run: `python -m unittest discover -s tests`
Expected: `Ran 164 tests` … `OK`.

Run: `node --test "tests/js/*.test.mjs"`
Expected: 69 tests réussis.

Run: `cd tests/navigateur; npm test`
Expected: 131 tests réussis, aucune erreur de console ni de CSP.

Run: `git status --short`
Expected: seuls `tests/navigateur/admin-reel.test.mjs` (nouveau), `tests/navigateur/banc-admin.mjs` et `README.md` (modifiés).

- [ ] **Step 6: Commit**

```bash
git add tests/navigateur/banc-admin.mjs tests/navigateur/admin-reel.test.mjs README.md
git commit -m "Tests navigateur : recette de la page d'admin sur les vrais réglages

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 7: Recette à la main contre le vrai dashboard (clone jetable, jamais publié)**

Prérequis : le dashboard tourne (`start-memory-rest.ps1`). Tout se passe dans un clone temporaire de la branche (tout est commité à l'étape précédente), sans dépôt distant : ni `D:\memoire_vive` ni la copie du chantier ne sont touchés, et rien ne peut être poussé.

```powershell
$recette = Join-Path $env:TEMP 'mv-recette-admin'
git clone -q --branch chantier-c D:\memoire_vive-chantier-c $recette
git -C $recette remote remove origin
Copy-Item D:\memoire_vive\.env (Join-Path $recette '.env')
python (Join-Path $recette 'scripts\admin.py')
```

Dans la page qui s'ouvre, vérifier :

0. À l'ouverture, aucun compte rendu « Réglages relus » ni « Réglages à corriger », et la barre dit « Tout est enregistré. » (les vrais réglages sont déjà sous la forme de la page et valides).
1. Projets : les 46 projets environ, par nom ; le filtre « outils » ne garde que la famille « Outils Claude » et les noms qui contiennent « outils ». Ouvrir « Jarvis » : famille « IA & simulations », liens en ligne proposés dans « Lien principal ».
2. Familles : les cinq familles dans l'ordre de `config/projets.json`, avec leur nombre de projets.
3. Entrées : environ 77 entrées ; chercher un mot d'un titre ; ouvrir une entrée, changer son titre : « Titre d'origine : … » et « Rétablir » apparaissent ; Rétablir.
4. Renommer un projet, masquer une entrée, ajouter un terme à un groupe de synonymes, puis **Aperçu** : un onglet s'ouvre aussitôt (vide le temps de l'export), puis montre le site local ; compte rendu « Aperçu prêt », et dans « Détail de l'export » la ligne `aucune recherche en --sans-recherche` ; l'onglet du site local montre le nouveau nom, l'entrée masquée n'y est plus. L'entrée masquée reste dans l'onglet Entrées, sous son titre, marquée « masquée ».
5. **Publier** (confirmer) : « Publication refusée : la copie de travail est sur la branche « chantier-c », pas sur main ; publier pousserait cette branche. Revenir sur main avant de publier. » ; l'en-tête dit la même chose.
6. Quitter l'onglet avec une modification non enregistrée : le navigateur demande confirmation.

Puis Ctrl+C dans la fenêtre, et :

```powershell
git -C D:\memoire_vive status --short                # attendu : rien
git -C D:\memoire_vive-chantier-c status --short     # attendu : rien
Remove-Item -Recurse -Force $recette
```

Noter tout défaut pour la revue.

---

## Après le plan (hors tâches)

- **Revue** : comme chaque chantier, revue multi-agents avec vérification adversariale avant publication (spec § 6), sur la branche `chantier-c` — en particulier la sécurité du serveur (jeton, `Host`, `Origin`, chemins servis, écritures) et les garde-fous de publication.
- **Publication** : décidée par Noah, après la revue. Le chantier ne touche pas `docs/data.json` : les exports faits sur `main` entre-temps se fusionnent sans conflit. D'abord, dans la copie du chantier :

```powershell
cd D:\memoire_vive-chantier-c
git log --oneline chantier-c..main    # vide : aucun export entre-temps, passer directement aux suites
git merge main -m "Fusion de main : exports faits pendant le chantier

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

  Relancer ensuite les trois suites (« Commandes ») : 164 tests Python, 69 tests Node, 131 tests navigateur. Puis, depuis `D:\memoire_vive` (sur `main`, aucun export ni aucune page d'admin en cours) :

```powershell
cd D:\memoire_vive
git merge --ff-only chantier-c
git push
```

  Si `git merge --ff-only` refuse (un export est arrivé sur `main` entre-temps), reprendre ce point depuis le début.

- **Premier usage réel** (Noah) : double-cliquer « Gérer Mémoire Vive » sur le Bureau (le dashboard doit tourner pour Aperçu et Publier ; ne pas lancer « Mettre à jour Mémoire Vive » pendant une publication). Le premier enregistrement de `config/projets.json` le remet au format de la page (Choix 7) : le premier commit « Réglages : projets et familles » montre donc aussi les lignes vides retirées. Les entrées nouvelles apparues depuis le dernier export reçoivent leurs voisins à la première publication, pas à l'aperçu.
- **Nettoyage** : retirer la copie du chantier une fois la publication faite :

```powershell
cd D:\memoire_vive
git worktree remove ..\memoire_vive-chantier-c
git branch -d chantier-c
```

- **Mémoire partagée** : proposer à Noah d'y noter le jalon (« Mémoire Vive : page d'admin locale livrée — admin.cmd, réglages des projets, familles, entrées, synonymes ; aperçu sans recherche, publication gardée »), selon ses règles (jalon livré, pas de détail de session).
