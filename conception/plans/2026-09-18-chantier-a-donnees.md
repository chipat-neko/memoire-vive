# Chantier A — données enrichies : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enrichir `docs/data.json` (familles, voisins, lien principal, corrections par entrée, synonymes, détails de projet) sans casser le site actuel.

**Architecture:** Tout se passe dans `scripts/export.py`, qui lit trois fichiers de réglages (`config/projets.json` v2, `config/entrees.json`, `config/recherche.json`) et interroge en plus `POST /api/search` du dashboard pour les voisins. Les nouveaux champs sont des **ajouts** : `schema` reste à 1 et le site actuel les ignore.

**Tech Stack:** Python 3.9+ bibliothèque standard uniquement (`unittest` pour les tests, pas de pytest) ; git.

**Spec:** `conception/2026-09-18-ameliorations-design.md` (§ 3 et § 6 A ; pré-classement § 8).

## Global Constraints

- Python 3.9+ ; bibliothèque standard uniquement, y compris pour les tests (`python -m unittest`).
- Aucune donnée réelle de la mémoire dans les tests : fixtures synthétiques.
- `data.json` garde `"schema": 1` pendant tout le chantier A (ajouts compatibles).
- Les voisins ne sont jamais bloquants : un échec du dashboard sur `/api/search` publie sans voisins, avec un avertissement.
- Phase 2 inchangée : seules l'URL et la clé changent de provenance.
- Textes, messages et commentaires en français ; accents corrects.
- Chaque commit se termine par la ligne `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.
- Ne jamais afficher la valeur de `MEMOIRE_API_KEY`.

---

## Carte des fichiers

| Fichier | Rôle | Action |
| --- | --- | --- |
| `scripts/export.py` | export ; nouvelles fonctions `normalize_projects_config`, `load_entry_overrides`, `load_search_config`, `normalize_term`, `link_kind`, `main_link`, `project_main_link`, `add_neighbours`, `Api.request`, `Api.search` | modifier |
| `config/projets.json` | réglages v2 + pré-classement des 46 projets | réécrire |
| `config/entrees.json` | corrections par entrée (vide au départ) | créer |
| `config/recherche.json` | groupes de synonymes | créer |
| `tests/__init__.py` | paquet de tests | créer |
| `tests/aides.py` | fabrique d'entrées synthétiques | créer |
| `tests/test_config.py` | configuration v2, migration v1 | créer |
| `tests/test_donnees.py` | corrections, lien principal, projets, voisins, synonymes | créer |
| `tests/test_publication.py` | intégration : faux dashboard, git, pagination, voisins | créer |
| `README.md` | documentation des réglages et des voisins | modifier |

Lancer tous les tests : `python -m unittest discover -s tests -v` depuis `D:\memoire_vive`.

---

### Task 1: Banc de tests et configuration des projets v2

**Files:**

- Create: `tests/__init__.py`, `tests/aides.py`, `tests/test_config.py`
- Modify: `scripts/export.py` (`load_projects_config`, `assign_projects`, `project_names`)

**Interfaces:**

- Produces: `normalize_projects_config(raw: dict) -> dict` renvoyant `{"version": 2, "familles": [{"id","nom","couleur"}], "projets": {id: {"nom","famille","alias","description","lien_principal"}}, "tags_generiques": [...], "tags_exclus": [...]}` ; `load_projects_config() -> dict` renvoie toujours cette forme. `tests/aides.py` fournit `memoire(n, contenu, tags, type="note", minute=0) -> dict` (forme d'une réponse de `/api/memories`).

- [ ] **Step 1: Écrire l'aide de tests**

`tests/__init__.py` : fichier vide.

`tests/aides.py` :

```python
"""Entrées synthétiques au format de GET /api/memories (aucune donnée réelle)."""
import sys
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RACINE / "scripts"))

import export  # noqa: E402  (après l'ajout au chemin)


def memoire(n, contenu, tags, type="note", minute=0):
    """n : entier qui fabrique un content_hash unique et stable."""
    return {
        "content": contenu,
        "content_hash": f"{n:064x}",
        "tags": list(tags),
        "memory_type": type,
        "metadata": {"access_queries": ["ne doit pas sortir"]},
        "created_at": 1_790_000_000 + minute * 60,
        "created_at_iso": None,
        "updated_at": None,
        "updated_at_iso": None,
    }


def config(**projets_v2):
    """Configuration v2 normalisée ; projets_v2 : {id: {clé: valeur}}."""
    return export.normalize_projects_config({"version": 2, "projets": projets_v2, "familles": [
        {"id": "jeux", "nom": "Jeux", "couleur": 1},
        {"id": "outils", "nom": "Outils", "couleur": 4},
    ]})
```

- [ ] **Step 2: Écrire les tests qui échouent**

`tests/test_config.py` :

```python
import unittest

from tests.aides import config, export, memoire


class ConfigProjetsTest(unittest.TestCase):
    def test_v1_est_convertie_en_v2(self):
        v1 = {"alias": {"rogue-lite": "depths"}, "noms": {"depths": "Depths", "pont-memoire": "Pont mémoire"},
              "tags_generiques": ["python"], "tags_exclus": ["perso"]}
        cfg = export.normalize_projects_config(v1)
        self.assertEqual(cfg["version"], 2)
        self.assertEqual(cfg["projets"]["depths"]["alias"], ["rogue-lite"])
        self.assertEqual(cfg["projets"]["depths"]["nom"], "Depths")
        self.assertEqual(cfg["projets"]["pont-memoire"]["nom"], "Pont mémoire")
        self.assertEqual(cfg["tags_generiques"], ["python"])
        self.assertEqual(cfg["tags_exclus"], ["perso"])
        self.assertEqual(cfg["familles"], [])

    def test_v2_complete_les_cles_manquantes(self):
        cfg = config(depths={"famille": "jeux"})
        self.assertEqual(cfg["projets"]["depths"], {
            "nom": None, "famille": "jeux", "alias": [], "description": None, "lien_principal": None})

    def test_famille_inconnue_ignoree(self):
        cfg = config(x={"famille": "nulle-part"})
        self.assertIsNone(cfg["projets"]["x"]["famille"])

    def test_config_vide(self):
        cfg = export.normalize_projects_config({})
        self.assertEqual(cfg["projets"], {})
        self.assertEqual(cfg["familles"], [])

    def test_alias_et_nom_appliques_a_l_export(self):
        cfg = config(depths={"nom": "Depths", "alias": ["rogue-lite"]})
        brut = [memoire(1, "Rogue-lite 2D Unity : prototype jouable. Suite.", ["rogue-lite", "unity"]),
                memoire(2, "Projet Depths (D:\\depths) : donjon procédural. Suite.", ["depths", "projet"])]
        payload, _ = export.build_payload(brut, cfg)
        self.assertEqual({e["projet"] for e in payload["entrees"]}, {"depths"})
        self.assertEqual([p["nom"] for p in payload["projets"]], ["Depths"])


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 3: Vérifier l'échec**

Run: `python -m unittest tests.test_config -v`
Expected: FAIL / ERROR — `AttributeError: module 'export' has no attribute 'normalize_projects_config'`.

- [ ] **Step 4: Implémenter**

Dans `scripts/export.py`, remplacer `load_projects_config` par :

```python
PROJECT_KEYS = ("nom", "famille", "alias", "description", "lien_principal")


def _read_json_config(path: Path) -> dict:
    if not path.is_file():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8-sig"))
    except ValueError as err:
        raise ExportError(f"{path.name} : JSON invalide ({err}).") from None
    if not isinstance(data, dict):
        raise ExportError(f"{path.name} : un objet JSON est attendu.")
    return data


def normalize_projects_config(raw: dict) -> dict:
    """
    Réglages des projets, toujours sous la forme v2. Une configuration v1
    (« alias » et « noms » globaux) est convertie à la volée.
    """
    raw = raw or {}
    projets: dict[str, dict] = {}

    def projet(key: str) -> dict:
        return projets.setdefault(slug(key), {
            "nom": None, "famille": None, "alias": [], "description": None, "lien_principal": None})

    if raw.get("version") == 2:
        for key, values in (raw.get("projets") or {}).items():
            target = projet(key)
            for name in PROJECT_KEYS:
                if isinstance(values, dict) and name in values:
                    target[name] = values[name]
            target["alias"] = [slug(a) for a in (target["alias"] or []) if slug(str(a))]
    else:
        for alias, key in (raw.get("alias") or {}).items():
            projet(key)["alias"].append(slug(alias))
        for key, name in (raw.get("noms") or {}).items():
            projet(key)["nom"] = name

    familles = [
        {"id": slug(f["id"]), "nom": f.get("nom") or f["id"], "couleur": int(f.get("couleur") or 0)}
        for f in (raw.get("familles") or []) if isinstance(f, dict) and f.get("id")
    ]
    known = {f["id"] for f in familles}
    for target in projets.values():
        famille = slug(target["famille"]) if target["famille"] else None
        target["famille"] = famille if famille in known else None

    return {
        "version": 2,
        "familles": familles,
        "projets": projets,
        "tags_generiques": list(raw.get("tags_generiques") or []),
        "tags_exclus": list(raw.get("tags_exclus") or []),
    }


def load_projects_config() -> dict:
    return normalize_projects_config(_read_json_config(PROJECTS_CONFIG))
```

Dans `assign_projects`, remplacer la ligne `aliases = {...}` par :

```python
    aliases = {alias: key for key, projet in config["projets"].items() for alias in projet["alias"]}
```

Dans `project_names`, remplacer la ligne `overrides = {...}` par :

```python
    overrides = {key: projet["nom"] for key, projet in config["projets"].items() if projet["nom"]}
```

Dans `build_payload`, remplacer `config.get("tags_exclus", [])` par `config["tags_exclus"]`, et dans `assign_projects` `config.get("tags_generiques", [])` par `config["tags_generiques"]`.

- [ ] **Step 5: Vérifier le succès et l'absence de régression**

Run: `python -m unittest tests.test_config -v`
Expected: 5 tests OK.

Run: `python scripts/export.py --dry-run`
Expected: « Contenu identique au dernier export. » (la config v1 actuelle, convertie, donne exactement le même `data.json`).

- [ ] **Step 6: Commit**

```bash
git add tests/ scripts/export.py
git commit -m "Export : réglages des projets v2 (migration v1 à la volée) et banc de tests

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Écrire `config/projets.json` v2 avec le pré-classement

**Files:**

- Modify: `config/projets.json` (réécriture complète)
- Test: `tests/test_config.py` (ajout)

**Interfaces:**

- Consumes: `normalize_projects_config`, `load_projects_config` (Task 1).
- Produces: 5 familles d'identifiants `jeux`, `cours`, `ia`, `outils-claude`, `sites` ; 46 projets classés.

- [ ] **Step 1: Écrire le test qui échoue**

Ajouter à `tests/test_config.py`, dans la classe :

```python
    def test_fichier_reel_v2_coherent(self):
        cfg = export.load_projects_config()
        self.assertEqual(len(cfg["familles"]), 5)
        classes = [p for p in cfg["projets"].values() if p["famille"]]
        self.assertEqual(len(classes), 46)
        alias = [a for p in cfg["projets"].values() for a in p["alias"]]
        self.assertEqual(len(alias), len(set(alias)), "un alias ne peut viser qu'un projet")
        self.assertFalse(set(alias) & set(cfg["projets"]), "un alias ne peut pas être lui-même un projet")
```

- [ ] **Step 2: Vérifier l'échec**

Run: `python -m unittest tests.test_config -v`
Expected: FAIL sur `test_fichier_reel_v2_coherent` (0 famille).

- [ ] **Step 3: Écrire le fichier**

`config/projets.json` (contenu complet) :

```json
{
  "_aide": "Réglages des projets (version 2). Modifiables à la main ou, plus tard, depuis la page d'admin locale. familles : ordre d'affichage et couleur (1 à 6). projets : nom, famille, alias (tags fusionnés dans ce projet), description, lien_principal ; toutes les clés sont facultatives. tags_generiques : tags qui ne désignent jamais un projet. tags_exclus : entrées jamais publiées.",
  "version": 2,
  "familles": [
    { "id": "jeux", "nom": "Jeux & univers de jeu", "couleur": 1 },
    { "id": "cours", "nom": "Cours & savoir", "couleur": 2 },
    { "id": "ia", "nom": "IA & simulations", "couleur": 3 },
    { "id": "outils-claude", "nom": "Outils Claude", "couleur": 4 },
    { "id": "sites", "nom": "Sites & applis", "couleur": 5 }
  ],
  "projets": {
    "depths": { "nom": "Depths", "famille": "jeux", "alias": ["rogue-lite"] },
    "void-atlas": { "famille": "jeux" },
    "tactical-ops": { "famille": "jeux" },
    "voxelcraft": { "famille": "jeux" },
    "nova": { "famille": "jeux", "alias": ["jeu-nova"] },
    "yuei-heroes-battle": { "famille": "jeux" },
    "jeu-claude": { "nom": "Workspace jeu_claude", "famille": "jeux" },
    "plan-min": { "famille": "jeux" },
    "wiki-star-citizen": { "famille": "jeux" },
    "speedrush-dofus": { "famille": "jeux", "alias": ["optimiseur-duo"] },
    "dosoft": { "famille": "jeux", "alias": ["orga-dof"] },

    "syntaxe": { "famille": "cours" },
    "devpath": { "famille": "cours" },
    "codelyngo": { "famille": "cours" },
    "cours-graph": { "famille": "cours" },
    "orbis": { "famille": "cours", "alias": ["courss"] },
    "claude-learning-apps": { "nom": "Applis d'apprentissage Claude", "famille": "cours" },
    "check-code": { "famille": "cours" },
    "un-monde-sans": { "famille": "cours" },
    "religions": { "famille": "cours" },

    "jarvis": { "famille": "ia" },
    "ai-creator": { "famille": "ia" },
    "code-ai": { "famille": "ia" },
    "help-code-ai": { "famille": "ia" },
    "roberta": { "famille": "ia" },
    "amalia": { "famille": "ia" },
    "mcai": { "famille": "ia" },
    "clipcoach": { "famille": "ia" },
    "pipeline-securite-n8n-ollama": { "nom": "Pipeline sécurité n8n + Ollama", "famille": "ia" },
    "le-bocal": { "famille": "ia" },

    "tour-de-controle": { "nom": "Tour de contrôle", "famille": "outils-claude" },
    "antigravity-skills": { "nom": "Antigravity Skills", "famille": "outils-claude" },
    "design-studio": { "famille": "outils-claude" },
    "uiverse-components": { "famille": "outils-claude" },
    "deadline-command": { "famille": "outils-claude" },
    "multi-claude-orchestrator": { "nom": "Multi-Claude Orchestrator", "famille": "outils-claude" },
    "pont-memoire": { "nom": "Pont mémoire", "famille": "outils-claude" },
    "memoire-vive": { "nom": "Mémoire Vive", "famille": "outils-claude" },
    "bibliotheque-claude": { "famille": "outils-claude" },

    "my-watch": { "famille": "sites" },
    "jsl-metal": { "famille": "sites" },
    "ce-ventre": { "famille": "sites" },
    "opti-route": { "famille": "sites" },
    "trading-alert-bot": { "nom": "Bot d'alertes trading", "famille": "sites" },
    "decoupe-videos": { "famille": "sites" },
    "presentation": { "nom": "Présentations PowerPoint", "famille": "sites" }
  },
  "tags_generiques": [
    "dashboard", "claude-code", "hooks", "monitoring", "python", "threejs", "3d",
    "windows", "powershell", "unity", "jeu-video", "pptx", "demo", "design",
    "dataviz", "canvas", "visualisation", "workspace", "claude-md", "mcp-memory-service", "lien"
  ],
  "tags_exclus": []
}
```

- [ ] **Step 4: Vérifier**

Run: `python -m unittest tests.test_config -v`
Expected: 6 tests OK.

Run: `python scripts/export.py --dry-run`
Expected: « Contenu identique au dernier export. » (les familles ne sont pas encore écrites dans `data.json` : Task 5).

- [ ] **Step 5: Commit**

```bash
git add config/projets.json tests/test_config.py
git commit -m "Réglages v2 : 5 familles et pré-classement des 46 projets

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Corrections par entrée (`config/entrees.json`)

**Files:**

- Create: `config/entrees.json`, `tests/test_donnees.py`
- Modify: `scripts/export.py` (`build_payload`, nouvelle `load_entry_overrides`, constante `ENTRIES_CONFIG`)

**Interfaces:**

- Consumes: `normalize_projects_config`, `tests.aides.config`, `tests.aides.memoire`.
- Produces: `load_entry_overrides() -> dict[str, dict]` (clé = 12 premiers caractères du hash, en minuscules) ; `build_payload(raw, config, known_secrets=(), overrides=None, search_config=None)` — le paramètre `search_config` est ajouté ici avec la valeur `None` (utilisé en Task 5) ; chaque entrée gagne `"corrige": bool` ; `report` gagne `"masquees": int` et `"orphelines": list[str]`.

- [ ] **Step 1: Créer le fichier de corrections vide**

`config/entrees.json` :

```json
{
  "_aide": "Corrections par entrée, indexées par les 12 premiers caractères de l'identifiant (celui de l'URL #/entree/…). Clés : titre, resume, masquer (true pour retirer l'entrée du site)."
}
```

- [ ] **Step 2: Écrire les tests qui échouent**

`tests/test_donnees.py` :

```python
import unittest

from tests.aides import config, export, memoire

TEXTE = "Projet Alpha (D:\\alpha) : un outil de test. Il fait des choses utiles. Et encore."


class CorrectionsTest(unittest.TestCase):
    def test_titre_et_resume_corriges(self):
        brut = [memoire(1, TEXTE, ["alpha", "projet"])]
        cle = f"{1:064x}"[:12]
        payload, report = export.build_payload(brut, config(), overrides={cle: {"titre": "Alpha", "resume": "Résumé à la main."}})
        entree = payload["entrees"][0]
        self.assertEqual(entree["titre"], "Alpha")
        self.assertEqual(entree["resume"], "Résumé à la main.")
        self.assertTrue(entree["corrige"])
        self.assertEqual(report["orphelines"], [])

    def test_sans_correction(self):
        payload, _ = export.build_payload([memoire(1, TEXTE, ["alpha"])], config(), overrides={})
        self.assertFalse(payload["entrees"][0]["corrige"])

    def test_masquer_retire_l_entree(self):
        brut = [memoire(1, TEXTE, ["alpha"]), memoire(2, TEXTE + " Bis.", ["alpha"])]
        payload, report = export.build_payload(brut, config(), overrides={f"{2:064x}"[:12]: {"masquer": True}})
        self.assertEqual([e["id"] for e in payload["entrees"]], [f"{1:064x}"])
        self.assertEqual(report["masquees"], 1)

    def test_cle_orpheline_signalee(self):
        _, report = export.build_payload([memoire(1, TEXTE, ["alpha"])], config(), overrides={"ffffffffffff": {"titre": "x"}})
        self.assertEqual(report["orphelines"], ["ffffffffffff"])

    def test_correction_aussi_masquee_si_secret(self):
        cle = f"{1:064x}"[:12]
        payload, _ = export.build_payload([memoire(1, TEXTE, ["alpha"])], config(),
                                          overrides={cle: {"titre": "Alpha password=Hunter22!"}})
        self.assertNotIn("Hunter22", payload["entrees"][0]["titre"])


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 3: Vérifier l'échec**

Run: `python -m unittest tests.test_donnees -v`
Expected: ERROR — `build_payload() got an unexpected keyword argument 'overrides'`.

- [ ] **Step 4: Implémenter**

Près des autres chemins, en tête de `scripts/export.py` :

```python
ENTRIES_CONFIG = ROOT / "config" / "entrees.json"
SEARCH_CONFIG = ROOT / "config" / "recherche.json"
```

Après `load_projects_config` :

```python
def load_entry_overrides() -> dict[str, dict]:
    """Corrections par entrée, indexées par les 12 premiers caractères du hash."""
    data = _read_json_config(ENTRIES_CONFIG)
    return {str(key).lower()[:12]: value for key, value in data.items()
            if not str(key).startswith("_") and isinstance(value, dict)}
```

Dans `build_payload`, nouvelle signature et début de boucle :

```python
def build_payload(raw: list[dict], config: dict, known_secrets: tuple[str, ...] = (),
                  overrides: dict | None = None, search_config: dict | None = None) -> tuple[dict, dict]:
    overrides = overrides or {}
    excluded_tags = EXCLUDED_TAGS | {slug(t) for t in config["tags_exclus"]}
    report = {"excluded": 0, "masquees": 0, "redactions": 0, "redacted_entries": [], "orphelines": []}
    entries = []
    seen_keys = set()

    for item in raw:
        key = item["content_hash"][:12].lower()
        seen_keys.add(key)
        override = overrides.get(key, {})
        tags = [str(t).strip() for t in (item.get("tags") or []) if str(t).strip()]
        tags_slug = [slug(t) for t in tags]
        if excluded_tags.intersection(tags_slug):
            report["excluded"] += 1
            continue
        if override.get("masquer"):
            report["masquees"] += 1
            continue
        content, hits = redact(str(item.get("content") or ""), known_secrets)
        if hits:
            report["redactions"] += hits
            report["redacted_entries"].append(key)
        title, rest = split_title(content, tags)
        summary = derive_summary(rest)
        corrected = False
        if str(override.get("titre") or "").strip():
            title, _ = redact(str(override["titre"]).strip(), known_secrets)
            corrected = True
        if str(override.get("resume") or "").strip():
            summary, _ = redact(str(override["resume"]).strip(), known_secrets)
            corrected = True
```

puis, dans le dictionnaire de l'entrée, utiliser `"titre": title`, `"resume": summary`, et ajouter `"corrige": corrected`. Juste après la boucle :

```python
    report["orphelines"] = sorted(set(overrides) - seen_keys)
```

- [ ] **Step 5: Vérifier**

Run: `python -m unittest discover -s tests -v`
Expected: tous les tests OK (6 + 5).

- [ ] **Step 6: Commit**

```bash
git add config/entrees.json scripts/export.py tests/test_donnees.py
git commit -m "Export : corrections par entrée (titre, résumé, masquer)

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Lien principal d'une entrée

**Files:**

- Modify: `scripts/export.py` (nouvelles `link_kind`, `main_link` ; `build_payload`)
- Test: `tests/test_donnees.py` (ajout)

**Interfaces:**

- Consumes: `_host_of` (existant), `detect_links` (existant).
- Produces: `link_kind(url: str) -> "site" | "depot"` ; `main_link(liens: list[dict]) -> {"url": str, "genre": str} | None` ; chaque entrée gagne `"lien_principal"`.

- [ ] **Step 1: Écrire les tests qui échouent**

Ajouter à `tests/test_donnees.py` :

```python
class LienPrincipalTest(unittest.TestCase):
    def test_genre(self):
        self.assertEqual(export.link_kind("https://github.com/a/b"), "depot")
        self.assertEqual(export.link_kind("https://www.github.com/a/b"), "depot")
        self.assertEqual(export.link_kind("https://gist.github.com/a/1"), "depot")
        self.assertEqual(export.link_kind("https://gitlab.com/a/b"), "depot")
        self.assertEqual(export.link_kind("https://chipat-neko.github.io/x/"), "site")
        self.assertEqual(export.link_kind("https://claude.ai/artifact/abc"), "site")

    def test_site_avant_depot(self):
        liens = [{"type": "en_ligne", "valeur": "https://github.com/a/b"},
                 {"type": "en_ligne", "valeur": "https://a.github.io/b/"},
                 {"type": "local", "valeur": "D:\\b"}]
        self.assertEqual(export.main_link(liens), {"url": "https://a.github.io/b/", "genre": "site"})

    def test_depot_a_defaut(self):
        self.assertEqual(export.main_link([{"type": "en_ligne", "valeur": "https://github.com/a/b"}]),
                         {"url": "https://github.com/a/b", "genre": "depot"})

    def test_aucun(self):
        self.assertIsNone(export.main_link([{"type": "local", "valeur": "D:\\b"}]))

    def test_present_dans_l_export(self):
        brut = [memoire(1, "Projet Alpha : en ligne sur https://a.github.io/alpha/ et github.com/a/alpha. Fin.", ["alpha"])]
        payload, _ = export.build_payload(brut, config())
        self.assertEqual(payload["entrees"][0]["lien_principal"]["url"], "https://a.github.io/alpha/")
```

- [ ] **Step 2: Vérifier l'échec**

Run: `python -m unittest tests.test_donnees -v`
Expected: ERROR — `module 'export' has no attribute 'link_kind'`.

- [ ] **Step 3: Implémenter**

Après `detect_links` dans `scripts/export.py` :

```python
CODE_HOSTS = ("github.com", "gitlab.com", "bitbucket.org", "codeberg.org")


def link_kind(url: str) -> str:
    """« depot » pour un hébergeur de code, « site » pour tout le reste."""
    host = _host_of(url).lower()
    if host.startswith("www."):
        host = host[4:]
    if host in CODE_HOSTS or host.endswith(tuple("." + h for h in CODE_HOSTS)):
        return "depot"
    return "site"


def main_link(liens: list[dict]) -> dict | None:
    """Premier site déployé, sinon premier dépôt, sinon rien."""
    online = [link["valeur"] for link in liens if link["type"] == "en_ligne"]
    for wanted in ("site", "depot"):
        for url in online:
            if link_kind(url) == wanted:
                return {"url": url, "genre": wanted}
    return None
```

Dans `build_payload`, calculer les liens une fois et les réutiliser :

```python
        liens = detect_links(content)
```

puis dans le dictionnaire de l'entrée : `"liens": liens,` et `"lien_principal": main_link(liens),`.

- [ ] **Step 4: Vérifier**

Run: `python -m unittest discover -s tests -v`
Expected: tous OK.

- [ ] **Step 5: Commit**

```bash
git add scripts/export.py tests/test_donnees.py
git commit -m "Export : lien principal de chaque entrée (site avant dépôt)

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Détails des projets, familles et synonymes dans `data.json`

**Files:**

- Create: `config/recherche.json`
- Modify: `scripts/export.py` (nouvelles `normalize_term`, `load_search_config`, `project_main_link` ; fin de `build_payload`)
- Test: `tests/test_donnees.py` (ajout)

**Interfaces:**

- Consumes: `main_link`, `link_kind`, `_is_valid_web_url` (existant), `config["familles"]`, `config["projets"]`.
- Produces: `normalize_term(text) -> str` ; `load_search_config() -> {"synonymes": list[list[str]]}` ; `project_main_link(members: list[dict]) -> dict | None` ; `payload["familles"]`, `payload["synonymes"]` ; chaque projet gagne `"famille"`, `"description"`, `"lien_principal"`.

- [ ] **Step 1: Créer les synonymes initiaux**

`config/recherche.json` :

```json
{
  "_aide": "Groupes de termes équivalents pour la recherche du site (minuscules et accents indifférents).",
  "synonymes": [
    ["ia", "intelligence artificielle", "llm", "modele", "modeles"],
    ["local", "locale", "hors-ligne", "hors ligne", "offline"],
    ["jeu", "game", "gameplay", "jeu video"],
    ["site", "page", "web"],
    ["depot", "repo", "github"],
    ["cours", "apprentissage", "formation", "tutoriel"],
    ["bug", "erreur", "correctif", "probleme"],
    ["3d", "three.js", "threejs", "webgpu"],
    ["claude", "claude code", "anthropic"],
    ["memoire", "mcp-memory-service", "pont memoire"]
  ]
}
```

- [ ] **Step 2: Écrire les tests qui échouent**

Ajouter à `tests/test_donnees.py` :

```python
class ProjetsEtRechercheTest(unittest.TestCase):
    def brut(self):
        return [
            memoire(1, "Projet Alpha (D:\\alpha) : outil de test en ligne sur https://a.github.io/alpha/. Fin.",
                    ["alpha", "projet", "architecture"], type="reference", minute=1),
            memoire(2, "Alpha — jalon livré : version 2 publiée sur github.com/a/alpha. Fin.",
                    ["alpha", "jalon"], type="milestone", minute=2),
        ]

    def test_details_du_projet(self):
        payload, _ = export.build_payload(self.brut(), config(alpha={"famille": "outils"}))
        projet = payload["projets"][0]
        self.assertEqual(projet["famille"], "outils")
        self.assertEqual(projet["description"], payload["entrees"][-1]["resume"])  # entrée d'architecture la plus ancienne
        self.assertEqual(projet["lien_principal"], {"url": "https://a.github.io/alpha/", "genre": "site"})

    def test_reglages_du_projet_prioritaires(self):
        cfg = config(alpha={"famille": "outils", "description": "À la main.", "lien_principal": "https://github.com/a/alpha"})
        projet = export.build_payload(self.brut(), cfg)[0]["projets"][0]
        self.assertEqual(projet["description"], "À la main.")
        self.assertEqual(projet["lien_principal"], {"url": "https://github.com/a/alpha", "genre": "depot"})

    def test_lien_configure_invalide_ignore(self):
        cfg = config(alpha={"lien_principal": "javascript:alert(1)"})
        projet = export.build_payload(self.brut(), cfg)[0]["projets"][0]
        self.assertEqual(projet["lien_principal"]["url"], "https://a.github.io/alpha/")

    def test_familles_et_synonymes_a_la_racine(self):
        payload, _ = export.build_payload(self.brut(), config(), search_config={"synonymes": [["ia", "llm"]]})
        self.assertEqual([f["id"] for f in payload["familles"]], ["jeux", "outils"])
        self.assertEqual(payload["synonymes"], [["ia", "llm"]])
        self.assertEqual(payload["schema"], 1)

    def test_normalisation_des_synonymes(self):
        self.assertEqual(export.normalize_term("  Modèle  Œuvre "), "modele oeuvre")
```

- [ ] **Step 3: Vérifier l'échec**

Run: `python -m unittest tests.test_donnees -v`
Expected: ERROR / FAIL — `KeyError: 'famille'` ou `no attribute 'normalize_term'`.

- [ ] **Step 4: Implémenter**

Après `load_entry_overrides` :

```python
def normalize_term(text: str) -> str:
    """Même normalisation que la recherche du site : minuscules, sans accents."""
    decomposed = unicodedata.normalize("NFD", str(text)).lower()
    plain = "".join(char for char in decomposed if not unicodedata.combining(char))
    plain = plain.replace("œ", "oe").replace("æ", "ae").replace("’", "'").replace("‘", "'")
    return " ".join(plain.split())


def load_search_config() -> dict:
    data = _read_json_config(SEARCH_CONFIG)
    groups = []
    for group in data.get("synonymes") or []:
        if isinstance(group, list):
            terms = list(dict.fromkeys(normalize_term(t) for t in group if str(t).strip()))
            if len(terms) >= 2:
                groups.append(terms)
    return {"synonymes": groups}
```

Après `main_link` :

```python
def project_main_link(members: list[dict]) -> dict | None:
    """Premier site parmi les entrées (de la plus récente à la plus ancienne), sinon premier dépôt."""
    recent_first = sorted(members, key=lambda e: e["cree_le"] or "", reverse=True)
    for wanted in ("site", "depot"):
        for entry in recent_first:
            link = entry.get("lien_principal")
            if link and link["genre"] == wanted:
                return link
    return None
```

Dans `build_payload`, remplacer la construction de `projects` par :

```python
    projects = []
    for key, name in names.items():
        members = [e for e in entries if e["projet"] == key]
        dates = [e["cree_le"] for e in members if e["cree_le"]]
        settings = config["projets"].get(key) or {}
        architecture = sorted(
            (e for e in members if e["type"] in ("reference", "architecture")
             or "architecture" in (slug(t) for t in e["tags"])),
            key=lambda e: e["cree_le"] or "")
        description = settings.get("description") or (architecture[0]["resume"] if architecture else None) or None
        configured = settings.get("lien_principal")
        if configured and _is_valid_web_url(str(configured)):
            lien = {"url": str(configured), "genre": link_kind(str(configured))}
        else:
            lien = project_main_link(members)
        projects.append({
            "id": key,
            "nom": name,
            "famille": settings.get("famille"),
            "description": description,
            "lien_principal": lien,
            "nb": len(members),
            "types": dict(Counter(e["type"] for e in members).most_common()),
            "premiere": min(dates, default=None),
            "derniere": max(dates, default=None),
        })
    projects.sort(key=lambda p: (p["derniere"] or "", p["id"]), reverse=True)
```

et, dans le dictionnaire `payload`, ajouter après `"ordre_types"` :

```python
        "familles": config["familles"],
        "synonymes": (search_config or {}).get("synonymes", []),
```

- [ ] **Step 5: Vérifier**

Run: `python -m unittest discover -s tests -v`
Expected: tous OK.

- [ ] **Step 6: Commit**

```bash
git add config/recherche.json scripts/export.py tests/test_donnees.py
git commit -m "Export : famille, description et lien principal des projets ; synonymes

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Voisins par le dashboard

**Files:**

- Modify: `scripts/export.py` (`Api.get` → `Api.request` + `Api.get` + `Api.search` ; nouvelle `add_neighbours` ; `main`)
- Test: `tests/test_donnees.py` (ajout)

**Interfaces:**

- Consumes: `Api` (existant), `ExportError`.
- Produces: `Api.request(method, path, params=None, body=None, retries=HTTP_RETRIES)` ; `Api.search(query: str, n: int) -> list[tuple[str, float]]` (hash complet, score) ; `add_neighbours(entries: list[dict], search, threshold=SEUIL_VOISINS) -> tuple[int, int]` (entrées reliées, recherches échouées) ; chaque entrée gagne `"voisins": [{"id": str, "score": float}]` ; constantes `SEUIL_VOISINS = 0.75`, `MAX_VOISINS = 5`.

- [ ] **Step 1: Écrire les tests qui échouent**

Ajouter à `tests/test_donnees.py` :

```python
def entrees(n):
    return [{"id": f"{i:064x}", "contenu": f"texte {i}"} for i in range(1, n + 1)]


class VoisinsTest(unittest.TestCase):
    def test_filtre_soi_seuil_et_non_publiees(self):
        liste = entrees(3)
        def search(query, n):
            return [(f"{1:064x}", 1.0), (f"{2:064x}", 0.9), (f"{3:064x}", 0.5), (f"{99:064x}", 0.95)]
        relies, echecs = export.add_neighbours(liste, search, threshold=0.75)
        self.assertEqual(liste[0]["voisins"], [{"id": f"{2:064x}", "score": 0.9}])
        self.assertEqual(liste[1]["voisins"], [{"id": f"{1:064x}", "score": 1.0}])
        self.assertEqual((relies, echecs), (3, 0))

    def test_au_plus_cinq(self):
        liste = entrees(8)
        def search(query, n):
            return [(e["id"], 0.9) for e in liste]
        export.add_neighbours(liste, search)
        self.assertEqual(len(liste[0]["voisins"]), export.MAX_VOISINS)

    def test_echecs_tolerés_puis_abandon(self):
        liste = entrees(10)
        appels = []
        def search(query, n):
            appels.append(query)
            raise export.ExportError("indisponible")
        relies, echecs = export.add_neighbours(liste, search)
        self.assertEqual((relies, echecs), (0, 10))
        self.assertEqual(len(appels), 3, "on arrête d'appeler après trois échecs consécutifs")
        self.assertTrue(all(e["voisins"] == [] for e in liste))
```

- [ ] **Step 2: Vérifier l'échec**

Run: `python -m unittest tests.test_donnees -v`
Expected: ERROR — `no attribute 'add_neighbours'`.

- [ ] **Step 3: Implémenter `add_neighbours`**

Après `project_main_link` :

```python
# Voisins : entrées proches par le sens, calculées par le dashboard. Le seuil
# est réglé sur les données réelles (voir Task 8 du plan du chantier A).
SEUIL_VOISINS = 0.75
MAX_VOISINS = 5


def add_neighbours(entries: list[dict], search, threshold: float = SEUIL_VOISINS) -> tuple[int, int]:
    """
    Ajoute « voisins » à chaque entrée. search(texte, n) renvoie des couples
    (hash, score). Jamais bloquant : un échec laisse la liste vide, et après
    trois échecs consécutifs on n'interroge plus le dashboard.
    Renvoie (entrées reliées, recherches échouées).
    """
    published = {entry["id"] for entry in entries}
    linked = failures = consecutive = 0
    for entry in entries:
        entry["voisins"] = []
        if consecutive >= 3:
            failures += 1
            continue
        try:
            results = search(entry["contenu"], MAX_VOISINS + 3)
        except ExportError:
            failures += 1
            consecutive += 1
            continue
        consecutive = 0
        seen = set()
        for other, score in results:
            if other == entry["id"] or other not in published or other in seen or score < threshold:
                continue
            seen.add(other)
            entry["voisins"].append({"id": other, "score": round(float(score), 3)})
        entry["voisins"] = entry["voisins"][:MAX_VOISINS]
        linked += bool(entry["voisins"])
    return linked, failures
```

- [ ] **Step 4: Généraliser l'accès HTTP**

Dans la classe `Api`, remplacer toute la méthode `get` par ces trois méthodes (`request`
reprend le corps de l'ancien `get`, avec la méthode HTTP, le corps JSON et le nombre de
tentatives en paramètres) :

```python
    def request(self, method: str, path: str, params: dict | None = None,
                body: dict | None = None, retries: int = HTTP_RETRIES):
        url = self.base + path
        if params:
            url += "?" + urllib.parse.urlencode(params)
        headers = dict(self.headers)
        data = None
        if body is not None:
            data = json.dumps(body).encode("utf-8")
            headers["Content-Type"] = "application/json"
        problem = "aucune réponse"
        for attempt in range(1, retries + 1):
            request = urllib.request.Request(url, data=data, headers=headers, method=method)
            try:
                with _OPENER.open(request, timeout=HTTP_TIMEOUT) as response:
                    content_type = response.headers.get("Content-Type", "")
                    raw_body = response.read()
                if "json" not in content_type:
                    raise ExportError(
                        f"{path} a répondu autre chose que du JSON ({content_type or 'type inconnu'}). "
                        "Le tunnel est-il protégé par Cloudflare Access sans jeton de service ?"
                    )
                try:
                    return json.loads(raw_body.decode("utf-8"))
                except ValueError:
                    problem = f"JSON illisible : {raw_body[:200]!r}"
            except urllib.error.HTTPError as err:
                if err.code == 401 or (err.code == 403 and not self.uses_access):
                    raise ExportError(
                        f"{path} refuse l'accès (HTTP {err.code}) : MEMOIRE_API_KEY absente ou "
                        "différente de MCP_API_KEY côté dashboard."
                    ) from None
                if err.code == 403:
                    raise ExportError(
                        f"{path} refuse l'accès (HTTP 403) : clé du dashboard ou jeton de service "
                        "Cloudflare Access (MEMOIRE_CF_ACCESS_CLIENT_ID / _SECRET) refusé."
                    ) from None
                if err.code < 500 and err.code != 429:
                    raise ExportError(f"{path} : HTTP {err.code} {err.reason}") from None
                detail = err.read()[:200].decode("utf-8", "replace").strip()
                problem = f"le dashboard répond HTTP {err.code}" + (f" : {detail}" if detail else "")
            except urllib.error.URLError as err:
                if isinstance(err.reason, ExportError):
                    raise err.reason from None
                problem = f"injoignable ({err.reason})"
            except OSError as err:  # délais dépassés, connexion coupée, lecture incomplète
                problem = f"injoignable ({err})"
            if attempt < retries:
                time.sleep(2 ** attempt)
        hint = " En local : lancer start-memory-rest.ps1 (port 8000)." if "injoignable" in problem else ""
        raise ExportError(f"{self.source} : {problem}.{hint}")

    def get(self, path: str, params: dict | None = None):
        return self.request("GET", path, params)

    def search(self, query: str, n: int) -> list[tuple[str, float]]:
        # Une seule tentative : les voisins ne valent pas d'attendre.
        data = self.request("POST", "/api/search", body={"query": query, "n_results": n}, retries=1)
        results = data.get("results") if isinstance(data, dict) else None
        if not isinstance(results, list):
            raise ExportError("réponse inattendue de /api/search.")
        pairs = []
        for result in results:
            memory = (result or {}).get("memory") or {}
            if memory.get("content_hash"):
                pairs.append((memory["content_hash"], float(result.get("similarity_score") or 0)))
        return pairs
```

- [ ] **Step 5: Brancher dans `main`**

Dans `main`, remplacer tout le bloc `try: … except ExportError …` du début par :

```python
    try:
        config = load_config()
        print(f"Source : {describe_source(config)}" + ("" if config["api_key"] else " (sans clé API)"))
        known_secrets = (config["api_key"], config["cf_client_id"], config["cf_client_secret"])
        if not config["local"]:
            known_secrets += (_host_of(config["api_url"]),)  # adresse du tunnel
        api = Api(config)
        raw = fetch_all_memories(api)
        payload, report = build_payload(raw, load_projects_config(), known_secrets,
                                        load_entry_overrides(), load_search_config())
    except ExportError as err:
        print(f"Échec : {err}", file=sys.stderr)
        return 1

    linked, failures = add_neighbours(payload["entrees"], api.search)
```

Puis remplacer le `print` du résumé (qui commence par `nb_links = Counter(…)`) par :

```python
    nb_links = Counter(link["type"] for e in payload["entrees"] for link in e["liens"])
    print(f"  {len(raw)} entrées lues, {payload['nb_entrees']} publiables, "
          f"{report['excluded']} exclues par tag, {report['masquees']} masquées, "
          f"{len(payload['projets'])} projets, "
          f"liens : {nb_links['en_ligne']} en ligne / {nb_links['local']} locaux, "
          f"voisins : {linked} entrées reliées.")
    if failures:
        print(f"  ! {failures} recherche(s) de voisins en échec : publié sans ces voisins.")
    if report["orphelines"]:
        print(f"  ! Corrections sans entrée correspondante : {', '.join(report['orphelines'])}")
```

- [ ] **Step 6: Vérifier**

Run: `python -m unittest discover -s tests -v`
Expected: tous OK.

Run: `python scripts/export.py --dry-run`
Expected: « voisins : N entrées reliées » avec N > 0, sans échec, puis « --dry-run : rien n'est écrit. » (le contenu a changé : nouveaux champs).

- [ ] **Step 7: Commit**

```bash
git add scripts/export.py tests/test_donnees.py
git commit -m "Export : voisins par le sens, calculés par le dashboard (non bloquants)

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Tests d'intégration avec un faux dashboard

**Files:**

- Create: `tests/test_publication.py`

**Interfaces:**

- Consumes: `scripts/export.py` lancé en sous-processus avec `MEMOIRE_API_URL` / `MEMOIRE_API_KEY` en variables d'environnement.
- Produces: 10 scénarios enchaînés qui couvrent les 11 vérifications git/pagination déjà validées à la main (premier push sans amont, liste blanche, `--no-git` puis rattrapage, rien de neuf, push refusé puis relance, page vide, total qui change, chute refusée, mauvaise clé) plus les voisins (présents, et absents sans blocage).

- [ ] **Step 1: Écrire les tests**

`tests/test_publication.py` :

```python
"""
Intégration : export.py contre un faux dashboard (HTTP local) et un dépôt
distant local. Aucun accès réseau extérieur, aucune donnée réelle.
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

RACINE = Path(__file__).resolve().parent.parent
CLE = "cle-de-test-123"
ETAT = {"n": 130, "mode": "ok", "cle": CLE, "recherche": True}


def fausse_memoire(i):
    return {"content": f"Projet Test{i % 7} : entrée numéro {i}. Détail sur D:\\test\\{i} et https://exemple.fr/{i}.",
            "content_hash": f"{i:064x}", "tags": [f"test{i % 7}", "projet"], "memory_type": "note",
            "metadata": {"access_queries": ["requête secrète"]}, "created_at": 1_790_000_000 + i,
            "created_at_iso": None, "updated_at": None, "updated_at_iso": None}


class FauxDashboard(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def repondre(self, code, corps):
        data = json.dumps(corps).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.headers.get("X-API-Key") != ETAT["cle"]:
            return self.repondre(401, {"detail": "non"})
        q = parse_qs(urlparse(self.path).query)
        page, taille = int(q["page"][0]), int(q["page_size"][0])
        n = ETAT["n"]
        items = [fausse_memoire(i) for i in range(n)][(page - 1) * taille: page * taille]
        total = n
        if ETAT["mode"] == "page2-vide" and page == 2:
            items = []
        if ETAT["mode"] == "decalage" and page == 2 and not ETAT.get("decale"):
            ETAT["decale"] = True
            total = n - 1
        self.repondre(200, {"memories": items, "total": total, "page": page, "page_size": taille,
                            "has_more": page * taille < total and bool(items)})

    def do_POST(self):
        if not ETAT["recherche"]:
            return self.repondre(404, {"detail": "pas de recherche"})
        longueur = int(self.headers.get("Content-Length") or 0)
        requete = json.loads(self.rfile.read(longueur) or b"{}")
        i = int(requete["query"].split("numéro ")[1].split(".")[0])
        voisins = [(i, 1.0), ((i + 1) % ETAT["n"], 0.9), ((i + 2) % ETAT["n"], 0.5)]
        self.repondre(200, {"results": [{"memory": fausse_memoire(j), "similarity_score": s} for j, s in voisins]})


def sh(*args, cwd=None):
    r = subprocess.run(args, cwd=cwd, text=True, encoding="utf-8", stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    if r.returncode:
        raise AssertionError(f"{args} : {r.stdout}")
    return r.stdout.strip()


class PublicationTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.serveur = ThreadingHTTPServer(("127.0.0.1", 0), FauxDashboard)
        threading.Thread(target=cls.serveur.serve_forever, daemon=True).start()
        cls.dossier = Path(tempfile.mkdtemp(prefix="mv-test-"))
        cls.projet = cls.dossier / "proj"
        cls.distant = cls.dossier / "distant.git"
        for sous in ("scripts", "config"):
            shutil.copytree(RACINE / sous, cls.projet / sous)
        (cls.projet / "docs").mkdir()
        sh("git", "init", "--bare", "-b", "main", str(cls.distant))
        sh("git", "init", "-b", "main", cwd=cls.projet)
        sh("git", "config", "user.name", "test", cwd=cls.projet)
        sh("git", "config", "user.email", "test@example.invalid", cwd=cls.projet)
        sh("git", "remote", "add", "origin", str(cls.distant), cwd=cls.projet)
        sh("git", "add", "scripts", "config", cwd=cls.projet)
        sh("git", "commit", "-m", "init", cwd=cls.projet)

    @classmethod
    def tearDownClass(cls):
        cls.serveur.shutdown()
        shutil.rmtree(cls.dossier, ignore_errors=True)

    def exporter(self, *options):
        env = dict(os.environ, MEMOIRE_API_URL=f"http://127.0.0.1:{self.serveur.server_address[1]}",
                   MEMOIRE_API_KEY=CLE, PYTHONIOENCODING="utf-8")
        r = subprocess.run([sys.executable, "scripts/export.py", *options], cwd=self.projet, env=env, text=True,
                           encoding="utf-8", stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
        return r.returncode, r.stdout

    def distant_dernier(self):
        return sh("git", "log", "-1", "--format=%s", cwd=self.distant)

    def donnees(self):
        return json.loads((self.projet / "docs" / "data.json").read_text(encoding="utf-8"))

    # Les scénarios s'enchaînent : unittest les trie par nom, d'où la numérotation.
    def test_01_premier_export_sans_amont(self):
        code, sortie = self.exporter()
        self.assertEqual(code, 0, sortie)
        self.assertTrue(self.distant_dernier().startswith("Export mémoire : 130"))

    def test_02_liste_blanche_et_voisins(self):
        texte = json.dumps(self.donnees(), ensure_ascii=False)
        self.assertNotIn("requête secrète", texte)
        premiere = next(e for e in self.donnees()["entrees"] if e["id"] == f"{5:064x}")
        self.assertEqual(premiere["voisins"], [{"id": f"{6:064x}", "score": 0.9}])
        self.assertEqual(self.donnees()["schema"], 1)

    def test_03_no_git_puis_rattrapage(self):
        ETAT["n"] = 140
        self.assertEqual(self.exporter("--no-git")[0], 0)
        self.assertTrue(self.distant_dernier().startswith("Export mémoire : 130"))
        code, sortie = self.exporter()
        self.assertEqual(code, 0, sortie)
        self.assertTrue(self.distant_dernier().startswith("Export mémoire : 140"))

    def test_04_rien_de_neuf(self):
        code, sortie = self.exporter()
        self.assertEqual(code, 0, sortie)
        self.assertIn("déjà à jour", sortie)

    def test_04b_push_refuse_puis_relance(self):
        autre = self.dossier / "autre"
        sh("git", "clone", str(self.distant), str(autre))
        sh("git", "config", "user.name", "o", cwd=autre)
        sh("git", "config", "user.email", "o@example.invalid", cwd=autre)
        (autre / "LISEZMOI").write_text("modifié ailleurs", encoding="utf-8")
        sh("git", "add", "LISEZMOI", cwd=autre)
        sh("git", "commit", "-m", "ailleurs", cwd=autre)
        sh("git", "push", cwd=autre)
        ETAT["n"] = 150
        code, sortie = self.exporter()
        self.assertEqual(code, 1, sortie)
        self.assertIn("push a échoué", sortie)
        sh("git", "pull", "--rebase", cwd=self.projet)
        code, sortie = self.exporter()
        self.assertEqual(code, 0, sortie)
        self.assertTrue(self.distant_dernier().startswith("Export mémoire : 150"))

    def test_05_page_vide_refusee(self):
        ETAT.update(mode="page2-vide", n=160)
        code, sortie = self.exporter()
        self.assertEqual(code, 1, sortie)
        self.assertIn("incomplète", sortie)
        self.assertTrue(self.distant_dernier().startswith("Export mémoire : 150"))

    def test_06_total_qui_change(self):
        ETAT.update(mode="decalage")
        code, sortie = self.exporter()
        self.assertEqual(code, 0, sortie)
        self.assertIn("nouvelle tentative", sortie)
        self.assertTrue(self.distant_dernier().startswith("Export mémoire : 160"))

    def test_07_chute_refusee(self):
        ETAT.update(mode="ok", n=50)
        code, sortie = self.exporter()
        self.assertEqual(code, 1, sortie)
        self.assertIn("contre 160", sortie)

    def test_08_recherche_absente_non_bloquante(self):
        ETAT.update(n=160, recherche=False)
        (self.projet / "docs" / "data.json").unlink()
        code, sortie = self.exporter("--no-git")
        self.assertEqual(code, 0, sortie)
        self.assertIn("recherche(s) de voisins en échec", sortie)
        self.assertTrue(all(e["voisins"] == [] for e in self.donnees()["entrees"]))
        ETAT["recherche"] = True

    def test_09_mauvaise_cle(self):
        ETAT["cle"] = "autre"
        code, sortie = self.exporter()
        ETAT["cle"] = CLE
        self.assertEqual(code, 1, sortie)
        self.assertIn("HTTP 401", sortie)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Lancer**

Run: `python -m unittest tests.test_publication -v`
Expected: 10 tests OK (moins de 60 s ; les scénarios 05 et 06 attendent les reprises). Si le seuil des voisins est un jour relevé au-dessus de 0,9, ajuster le score 0,9 du faux dashboard.

- [ ] **Step 3: Commit**

```bash
git add tests/test_publication.py
git commit -m "Tests : intégration de l'export avec un faux dashboard (git, pagination, voisins)

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Réglage sur les données réelles, documentation, revue et publication

**Files:**

- Modify: `scripts/export.py` (valeur de `SEUIL_VOISINS` si le réglage le demande), `README.md`

- [ ] **Step 1: Mesurer la distribution des scores réels**

Run (depuis `D:\memoire_vive`) :

```bash
python - <<'EOF'
import sys; sys.path.insert(0, "scripts"); import export as ex
c = ex.load_config(); api = ex.Api(c)
raw = ex.fetch_all_memories(api)
p, _ = ex.build_payload(raw, ex.load_projects_config(), (c["api_key"],), ex.load_entry_overrides(), ex.load_search_config())
titres = {e["id"]: (e["titre"], e["projet"]) for e in p["entrees"]}
for e in p["entrees"][:69]:
    res = [(h, s) for h, s in api.search(e["contenu"], 8) if h != e["id"] and h in titres]
    print(f"\n{e['titre'][:60]}  [{e['projet']}]")
    for h, s in res[:6]:
        print(f"   {s:.3f}  {titres[h][0][:60]}  [{titres[h][1]}]")
EOF
```

Expected: pour chaque entrée, ses 6 meilleurs voisins avec leur score.

- [ ] **Step 2: Choisir le seuil**

Règle : le seuil est le plus bas score à partir duquel les voisins affichés restent pertinents (même projet, même thème) pour au moins 9 voisins sur 10 lus. Mettre à jour `SEUIL_VOISINS` dans `scripts/export.py` si la valeur diffère de 0,75, avec en commentaire la date et la méthode (« réglé le JJ/MM/AAAA sur 69 entrées réelles »).

- [ ] **Step 3: Comparer avec le `data.json` publié**

Run :

```bash
python - <<'EOF'
import json, subprocess, sys
sys.path.insert(0, "scripts"); import export as ex
old = json.loads(subprocess.run(["git", "show", "HEAD:docs/data.json"], capture_output=True, text=True, encoding="utf-8").stdout)
c = ex.load_config(); api = ex.Api(c)
new, rep = ex.build_payload(ex.fetch_all_memories(api), ex.load_projects_config(), (c["api_key"],), ex.load_entry_overrides(), ex.load_search_config())
o = {e["id"]: e for e in old["entrees"]}
for e in new["entrees"]:
    for k in ("titre", "resume", "contenu", "projet", "liens", "type", "tags"):
        if o.get(e["id"], {}).get(k) != e[k]:
            print("DIFF", e["id"][:12], k)
print("projets sans famille :", [p["id"] for p in new["projets"] if not p["famille"]])
print("rapport :", rep)
EOF
```

Expected : aucune ligne `DIFF` (seuls des champs sont **ajoutés**), « projets sans famille : [] », rapport sans orpheline.

- [ ] **Step 4: Documenter**

Dans `README.md` :
- section « Régler les projets » : remplacer par la description des trois fichiers (`config/projets.json` v2 avec familles et projets, `config/entrees.json`, `config/recherche.json`), en reprenant les exemples JSON du § 3 de la spec ;
- section « Ce que l'export calcule » : ajouter `lien_principal`, `voisins` (et le seuil), `corrige`, `familles`, `synonymes`, et les champs ajoutés aux projets ;
- section « Phase 2 », étape 1 : remplacer « n'autoriser que `GET /api/memories` » par « n'autoriser que `GET /api/memories` et `POST /api/search` » ;
- section « Tests » (nouvelle) : `python -m unittest discover -s tests -v`.

- [ ] **Step 5: Lancer toute la suite**

Run: `python -m unittest discover -s tests -v`
Expected : tous les tests OK.

- [ ] **Step 6: Commit**

```bash
git add scripts/export.py README.md
git commit -m "Chantier A : seuil des voisins réglé sur les données réelles, documentation

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 7: Revue avant publication**

Lancer une revue multi-agents du chantier (diff depuis le commit de la spec) avec vérification adversariale de chaque constat, axes : confidentialité (rien de neuf ne fuit, corrections masquées), robustesse (voisins non bloquants, config invalide), conformité à la spec § 3. Corriger les constats confirmés, relancer la suite.

- [ ] **Step 8: Publier et vérifier**

Run : `exporter.cmd` (ou `python scripts/export.py`).
Expected : commit « Export mémoire : … », push effectué.

Vérifier après une à deux minutes que le site publié fonctionne toujours (les nouveaux champs sont ignorés par le site actuel) :

```bash
curl -s https://chipat-neko.github.io/memoire-vive/data.json | python -c "import json,sys; d=json.load(sys.stdin); print(d['schema'], d['nb_entrees'], len(d['familles']), sum(bool(e['voisins']) for e in d['entrees']))"
```

Expected : `1 69 5 N` avec N > 0 ; puis ouvrir le site : la liste s'affiche normalement.
