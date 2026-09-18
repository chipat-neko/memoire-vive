#!/usr/bin/env python3
"""
Export de la mémoire partagée (mcp-memory-service) vers docs/data.json.

Lit toutes les entrées via l'API REST du dashboard (web/app.py), les nettoie
pour une publication publique, écrit docs/data.json puis commit et push.

Usage :
    python scripts/export.py              # export + commit + push
    python scripts/export.py --no-push    # export + commit, sans push
    python scripts/export.py --no-git     # écrit data.json, ne touche pas à git
    python scripts/export.py --dry-run    # récupère et résume, n'écrit rien
    python scripts/export.py --force      # passe outre le garde-fou de baisse

Configuration (voir load_config) — variables d'environnement, sinon .env :
    MEMOIRE_API_URL   adresse du dashboard (défaut http://127.0.0.1:8000)
    MEMOIRE_API_KEY   clé attendue par le dashboard (MCP_API_KEY côté serveur)
    MEMOIRE_CF_ACCESS_CLIENT_ID / MEMOIRE_CF_ACCESS_CLIENT_SECRET
                      optionnels : jeton de service Cloudflare Access, si le
                      tunnel de la phase 2 est lui-même protégé par Access.

Phase 1 → phase 2 : aucune ligne de ce script ne change. En local, les valeurs
viennent de .env ; dans GitHub Actions, des secrets du dépôt injectés en
variables d'environnement (qui priment toujours sur .env).

Aucune dépendance : bibliothèque standard Python 3.9+.
"""

from __future__ import annotations

import argparse
import hashlib
import ipaddress
import json
import os
import re
import subprocess
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_FILE = ROOT / "docs" / "data.json"
PROJECTS_CONFIG = ROOT / "config" / "projets.json"
ENTRIES_CONFIG = ROOT / "config" / "entrees.json"
SEARCH_CONFIG = ROOT / "config" / "recherche.json"
ENV_FILE = ROOT / ".env"

DEFAULT_API_URL = "http://127.0.0.1:8000"
PAGE_SIZE = 100          # maximum accepté par GET /api/memories
MAX_PAGES = 10_000       # garde-fou contre une pagination qui ne finirait pas
HTTP_TIMEOUT = 30
HTTP_RETRIES = 3
SCHEMA_VERSION = 1

# En dessous de cette proportion de l'export précédent, on refuse de publier
# sans --force : une base vide ou mal pointée ne doit pas écraser le site.
MIN_RATIO_VS_PREVIOUS = 0.5

# Tags qui décrivent la nature d'une entrée, jamais le projet auquel elle
# appartient. Complétés par "tags_generiques" dans config/projets.json.
GENERIC_TAGS = {
    "projet", "project", "architecture", "jalon", "milestone", "decision",
    "reference", "note", "error", "erreur", "livrable", "correction",
    "correctif", "bug", "test-conclu", "installation",
}

# Entrées jamais publiées. Complétés par "tags_exclus" dans config/projets.json.
EXCLUDED_TAGS = {
    "prive", "private", "secret", "confidentiel", "confidential", "sensitive", "sensible",
    "no-publish", "nopublish", "ne-pas-publier", "do-not-publish", "dont-publish", "non-public",
}

# Motifs de secrets masqués avant publication. Filet de sécurité : la mémoire
# n'est pas censée en contenir, mais le site est public et git n'oublie rien.
# Un groupe nommé « keep » est conservé devant le masque (l'étiquette reste lisible).
SECRET_PATTERNS = [
    re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----.*?-----END [A-Z ]*PRIVATE KEY-----", re.S),
    re.compile(r"\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}\b"),
    re.compile(r"\bgithub_pat_[A-Za-z0-9_]{40,}\b"),
    re.compile(r"\bsk-(?:ant-|proj-)?[A-Za-z0-9_\-]{20,}\b"),
    re.compile(r"\b[rs]k_(?:live|test)_[A-Za-z0-9]{16,}"),          # Stripe
    re.compile(r"\bhf_[A-Za-z0-9]{30,}"),                           # Hugging Face
    re.compile(r"\bglpat-[\w-]{20,}"),                              # GitLab
    re.compile(r"\bnpm_[A-Za-z0-9]{36}\b"),
    re.compile(r"\bGOCSPX-[\w-]{20,}"),                             # Google OAuth
    re.compile(r"\bxox[abpors]-[A-Za-z0-9-]{10,}\b"),               # Slack
    re.compile(r"\bxapp-[\w-]{10,}"),
    re.compile(r"\bAKIA[0-9A-Z]{16}\b"),
    re.compile(r"\bAIza[0-9A-Za-z_\-]{35}\b"),
    re.compile(r"\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b"),
    # Jeton de bot Telegram, seul ou dans https://api.telegram.org/bot<jeton>/…
    re.compile(r"(?<![A-Za-z0-9])(?:bot)?\d{8,10}:[A-Za-z0-9_-]{35}(?![A-Za-z0-9_-])"),
    # Webhooks : l'URL reste reconnaissable, la partie secrète est masquée.
    re.compile(r"(?i)(?P<keep>discord(?:app)?\.com/api/webhooks/)\d+/[\w-]+"),
    re.compile(r"(?i)(?P<keep>hooks\.slack\.com/(?:services|workflows|triggers)/)[\w/-]+"),
    re.compile(r"(?i)\bbearer\s+[A-Za-z0-9._~+/=-]{16,}"),
    # identifiants dans une URL : scheme://utilisateur:motdepasse@hôte (le mot
    # de passe peut lui-même contenir « @ » : on va jusqu'au dernier).
    re.compile(r"(?<=://)[^/\s:@]+:[^/\s]+(?=@)"),
    # Affectations à étiquette technique, y compris composée (AWS_SECRET_ACCESS_KEY=,
    # PRIVATE_KEY=…). La valeur doit contenir un chiffre, pour ne pas masquer une
    # phrase ordinaire (« le secret : utiliser… »).
    re.compile(
        r"(?i)(?P<keep>(?<![A-Za-z0-9])[\w-]*(?:api[_-]?key|apikey|secret|token|passw(?:or)?d|passphrase|private[_-]?key)[\w-]*"
        r"[\"']?\s*[:=]\s*[\"']?)(?!\[masqué\])(?=[^\s\"']*\d)[^\s\"']{8,}"
    ),
    # Étiquettes sans ambiguïté, chiffre non exigé. Avec « = » la valeur est
    # toujours masquée ; avec « : » elle doit contenir autre chose que des
    # minuscules, pour laisser passer la prose (« mot de passe : jamais en clair »).
    re.compile(
        r"(?P<keep>(?<![A-Za-z0-9])(?i:password|passwd|pwd|passphrase|mot de passe|mdp|cl[ée] (?:d['’])?API)"
        r"\s*[\"']?\s*(?:=\s*[\"']?|:\s*[\"']?(?=[^\s\"']*[A-ZÀ-ÖØ-Þ0-9@#$%^&*_+=/\\|~-])))"
        r"(?!\[masqué\])[^\s\"']{4,}"
    ),
]
REDACTED = "[masqué]"

TYPE_ORDER = ["reference", "architecture", "decision", "milestone", "note", "observation", "error"]

# Détection des liens (champ "liens" de chaque entrée). Simple regex, aucune
# IA : une URL http(s) vers un hôte public est "en_ligne" (cliquable sur le
# site) ; chemins de fichiers, localhost, IP privées et ports sont "local"
# (affichés en texte, un visiteur du site ne peut pas les joindre).
# Crochets exclus : « [texte](https://…) » en Markdown donne l'URL seule.
# Seule exception : un hôte IPv6 entre crochets juste après le schéma.
URL_RE = re.compile(
    r"\bhttps?://(?:\[masqué\]@|[^\s/@<>\"'`«»\[\]]+@)?"    # identifiants éventuels, retirés ensuite
    r"(?:\[[0-9A-Fa-f:.]+\]|[^\s<>\"'`«»\[\]…—“”])[^\s<>\"'`«»\[\]…—“”]*",
    re.I,
)
# Cités sans schéma : dépôts (« dépôt github.com/owner/repo ») et sites
# déployés sur un hébergeur connu (« Hosting sur mon-app.web.app »).
BARE_REPO_RE = re.compile(r"(?<![\w/.@-])(?:www\.)?(?:github|gitlab)\.com/[\w.-]+(?:/[\w.-]+)?", re.I)
BARE_SITE_RE = re.compile(
    r"(?<![\w/.@-])(?:[a-z0-9-]+\.)+(?:web\.app|firebaseapp\.com|github\.io|vercel\.app|netlify\.app|pages\.dev)"
    r"(?:/[^\s,;\"'<>«»()“”…]*)?",
    re.I,
)
FILE_URL_RE = re.compile(r"\bfile:///[^\s<>\"'`«»()“”…]+", re.I)
# Chemin Windows entre guillemets : seul cas où les espaces sont admis
# (« C:\Program Files\… »). Sans guillemets, on s'arrête au premier espace :
# accepter les espaces avalerait la phrase qui suit le chemin.
WINDOWS_QUOTED_PATH_RE = re.compile(r"(?<=[\"“«])\s?([A-Za-z]:[\\/][^\"”»\n<>|*?]+?)\s?(?=[\"”»])")
WINDOWS_PATH_RE = re.compile(r"(?<![\w/\\])[A-Za-z]:[\\/][^\s,;\"<>|*?«»()“”‘]*")
UNC_PATH_RE = re.compile(r"(?<![\w\\])\\\\[\w.$-]+\\[^\s,;\"'<>|*?«»()“”]+")
HOME_PATH_RE = re.compile(r"(?<![\w/~%$])(?:~[\\/]|%USERPROFILE%[\\/]|\$HOME/)[^\s,;\"'<>«»()“”]+", re.I)
LOCAL_HOST_RE = re.compile(
    r"(?<![\w/.:-])(?:localhost|127\.\d{1,3}\.\d{1,3}\.\d{1,3}|0\.0\.0\.0|host\.docker\.internal|\[::1\]"
    # IP privées citées sans schéma ; port exigé pour 10.x et 172.x, sinon un
    # numéro de version (« 10.0.0.5 ») serait pris pour une adresse.
    r"|192\.168\.\d{1,3}\.\d{1,3}"
    r"|(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(?=:\d{2,5}))"
    r"(?::\d{2,5})?(?!\w|\.\w)(?:/[^\s,;\"'<>«»()“”…]*)?",
    re.I,
)
# « port 8766 », « port : 8000 », « PORT=8000 », « ports 8000 et 8765 ».
PORT_RE = re.compile(r"(?<![A-Za-z0-9-])ports?\s*[:=]?\s*(\d{2,5}(?:\s*(?:,|/|et|ou|and)\s*\d{4,5})*)\b", re.I)
TRAILING_PUNCTUATION = ".,;:!?\"'’”»…“‘«*_–"


# --------------------------------------------------------------------------
# Configuration
# --------------------------------------------------------------------------

class ExportError(Exception):
    pass


def read_env_file(path: Path) -> dict[str, str]:
    """Lit un fichier .env minimal : CLE=valeur, lignes et fins de ligne # ignorées."""
    values: dict[str, str] = {}
    if not path.is_file():
        return values
    raw_bytes = path.read_bytes()
    try:
        # Bloc-notes et PowerShell 5.1 écrivent parfois en UTF-16.
        encoding = "utf-16" if raw_bytes[:2] in (b"\xff\xfe", b"\xfe\xff") else "utf-8-sig"
        text = raw_bytes.decode(encoding)
    except UnicodeDecodeError:
        raise ExportError(f"{path.name} doit être encodé en UTF-8.") from None
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = re.sub(r"^export\s+", "", key.strip())
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        else:
            value = re.split(r"\s+#", value, maxsplit=1)[0].strip()
        values[key] = value
    return values


def load_config() -> dict[str, str]:
    """
    Seul endroit qui décide d'où viennent l'URL et la clé.
    Ordre : variable d'environnement > fichier .env local > défaut.
    Phase 1 : .env (localhost). Phase 2 : secrets GitHub Actions en env.
    """
    file_values = read_env_file(ENV_FILE)

    def pick(name: str, default: str = "") -> str:
        return (os.environ.get(name) or file_values.get(name) or default).strip()

    config = {
        "api_url": pick("MEMOIRE_API_URL", DEFAULT_API_URL).rstrip("/"),
        "api_key": pick("MEMOIRE_API_KEY"),
        "cf_client_id": pick("MEMOIRE_CF_ACCESS_CLIENT_ID"),
        "cf_client_secret": pick("MEMOIRE_CF_ACCESS_CLIENT_SECRET"),
    }
    config["local"] = _is_local_host(_host_of(config["api_url"]))
    if config["api_url"].lower().startswith("http://") and not config["local"]:
        # La clé partirait en clair sur Internet.
        raise ExportError("MEMOIRE_API_URL : utiliser https:// pour une adresse distante.")
    return config


def describe_source(config: dict[str, str]) -> str:
    # En phase 2, l'adresse du tunnel ne doit pas apparaître dans les logs publics.
    return config["api_url"] if config["local"] else "dashboard distant (MEMOIRE_API_URL)"


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
            raw_alias = target["alias"] or []
            if isinstance(raw_alias, str):
                raw_alias = [raw_alias]  # une chaîne seule vaut liste à un élément
            target["alias"] = [s for s in (slug(str(a)) for a in raw_alias) if s]
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


def load_entry_overrides() -> dict[str, dict]:
    """Corrections par entrée, indexées par les 12 premiers caractères du hash."""
    data = _read_json_config(ENTRIES_CONFIG)
    return {str(key).lower()[:12]: value for key, value in data.items()
            if not str(key).startswith("_") and isinstance(value, dict)}


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


# --------------------------------------------------------------------------
# Accès à l'API du dashboard
# --------------------------------------------------------------------------

class _RefuseRedirect(urllib.request.HTTPRedirectHandler):
    # urllib renverrait X-API-Key et le secret Cloudflare à la cible de la
    # redirection, quel que soit l'hôte : on s'arrête là.
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ExportError(
            f"redirection inattendue (HTTP {code}) : page de connexion Cloudflare Access "
            "(jeton de service manquant) ou mauvaise MEMOIRE_API_URL."
        )


_OPENER = urllib.request.build_opener(_RefuseRedirect)


class Api:
    def __init__(self, config: dict[str, str]):
        self.base = config["api_url"]
        self.source = describe_source(config)
        self.uses_access = bool(config["cf_client_id"] and config["cf_client_secret"])
        self.headers = {"Accept": "application/json", "User-Agent": "memoire-vive-export/1"}
        if config["api_key"]:
            self.headers["X-API-Key"] = config["api_key"]
        if self.uses_access:
            self.headers["CF-Access-Client-Id"] = config["cf_client_id"]
            self.headers["CF-Access-Client-Secret"] = config["cf_client_secret"]

    def get(self, path: str, params: dict | None = None):
        url = self.base + path
        if params:
            url += "?" + urllib.parse.urlencode(params)
        problem = "aucune réponse"
        for attempt in range(1, HTTP_RETRIES + 1):
            request = urllib.request.Request(url, headers=self.headers)
            try:
                with _OPENER.open(request, timeout=HTTP_TIMEOUT) as response:
                    content_type = response.headers.get("Content-Type", "")
                    body = response.read()
                if "json" not in content_type:
                    raise ExportError(
                        f"{path} a répondu autre chose que du JSON ({content_type or 'type inconnu'}). "
                        "Le tunnel est-il protégé par Cloudflare Access sans jeton de service ?"
                    )
                try:
                    return json.loads(body.decode("utf-8"))
                except ValueError:
                    problem = f"JSON illisible : {body[:200]!r}"
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
            if attempt < HTTP_RETRIES:
                time.sleep(2 ** attempt)
        hint = " En local : lancer start-memory-rest.ps1 (port 8000)." if "injoignable" in problem else ""
        raise ExportError(f"{self.source} : {problem}.{hint}")


FETCH_PASSES = 3


def fetch_all_memories(api: Api) -> list[dict]:
    """
    Toutes les entrées, ou une erreur : jamais une liste partielle publiée
    comme complète. La pagination est par décalage : si la base change
    pendant la lecture (le serveur MCP écrit dans le même fichier), le total
    change d'une page à l'autre et on recommence depuis la première page.
    Le dashboard renvoie aussi une page vide en HTTP 200 sur une erreur
    SQLite passagère (base verrouillée) : même traitement.
    """
    problem = ""
    for attempt in range(1, FETCH_PASSES + 1):
        memories: dict[str, dict] = {}
        first_total = None
        for page in range(1, MAX_PAGES + 1):
            data = api.get("/api/memories", {"page": page, "page_size": PAGE_SIZE})
            if not isinstance(data, dict) or not isinstance(data.get("memories"), list):
                raise ExportError("réponse inattendue de /api/memories (pas de liste « memories »).")
            batch = data["memories"]
            total = data.get("total")
            if first_total is None:
                first_total = total
            if total != first_total:
                problem = f"total passé de {first_total} à {total} pendant la lecture"
                break
            for memory in batch:
                if isinstance(memory, dict) and memory.get("content_hash"):
                    memories.setdefault(memory["content_hash"], memory)
            if not data.get("has_more") or not batch:
                if first_total is None or len(memories) == first_total:
                    return list(memories.values())
                problem = f"{len(memories)} entrées lues pour un total annoncé de {first_total}"
                break
        else:
            raise ExportError(f"pagination interrompue après {MAX_PAGES} pages.")
        if attempt < FETCH_PASSES:
            print(f"  ! Lecture incomplète ({problem}), nouvelle tentative…")
            time.sleep(2 * attempt)
    raise ExportError(f"récupération incomplète après {FETCH_PASSES} passes : {problem}.")


# --------------------------------------------------------------------------
# Texte : secrets, titre, résumé, liens
# --------------------------------------------------------------------------

def slug(value: str) -> str:
    text = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def redact(text: str, known_secrets: tuple[str, ...] = ()) -> tuple[str, int]:
    count = 0
    # Les vraies valeurs de configuration (clé API, secret Cloudflare), si
    # une entrée les cite telles quelles, quel que soit leur format.
    for secret in known_secrets:
        if secret and len(secret) >= 6:
            text, n = re.subn(re.escape(secret), REDACTED, text, flags=re.I)
            count += n
    for pattern in SECRET_PATTERNS:
        # Le groupe « keep », s'il existe, est conservé devant le masque.
        text, n = pattern.subn(lambda m: (m.groupdict().get("keep") or "") + REDACTED, text)
        count += n
    return text, count


def strip_parentheses(text: str) -> str:
    previous = None
    while previous != text:
        previous = text
        text = re.sub(r"\s*\([^()]*\)", "", text)
    return re.sub(r"\s{2,}", " ", text).strip()


def shorten(text: str, limit: int) -> str:
    if len(text) <= limit:
        return text
    cut = text[:limit].rsplit(" ", 1)[0].rstrip(" ,;:—–-«“([\"'")
    return cut + "…"


MIN_TITLE_LENGTH = 20   # « Projet My Watch » seul n'apprend rien : la carte affiche déjà le projet

# Un point après ces mots n'est pas une fin de phrase (« p. ex. », « cf. », « etc. »).
ABBREVIATION_END = re.compile(
    r"(?:^|[\s(«“\"'])(?:p|ex|cf|etc|env|vs|réf|ref|fig|chap|vol|M|Mme|Mlle|Dr|n°|no|approx|av|apr|min|max|c\.-à-d|i\.e|e\.g)\.$",
    re.I,
)
OPENING, CLOSING = "([«“", ")]»”"


def _is_sentence_end(text: str, i: int) -> bool:
    """Le caractère text[i] (. ! ?) termine-t-il une phrase ?"""
    if text[i] not in ".!?" or not text.startswith(" ", i + 1) or i == 0:
        return False
    return not (text[i] == "." and ABBREVIATION_END.search(text[: i + 1]))


def _first_breaks(text: str) -> tuple[int, int]:
    """
    Positions du premier « : » et de la première fin de phrase hors
    parenthèses et guillemets — « (recherche des dashboards : a, b) » ou
    « "en cas de doute : ne rien écrire" » ne coupent rien.
    """
    straight_quotes = text.count('"') % 2 == 0  # guillemets droits appariés seulement
    depth, in_quote, colon, sentence = 0, False, -1, -1
    for i, char in enumerate(text):
        if char in OPENING:
            depth += 1
        elif char in CLOSING:
            depth = max(0, depth - 1)
        elif char == '"' and straight_quotes:
            in_quote = not in_quote
        elif depth == 0 and not in_quote:
            if colon < 0 and text.startswith(" : ", i):
                colon = i
            if sentence < 0 and _is_sentence_end(text, i):
                sentence = i
        if colon >= 0 and sentence >= 0:
            break
    return colon, sentence


def split_title(content: str, tags: list[str]) -> tuple[str, str]:
    """(titre, reste du texte) : le titre est le début du texte, à défaut les tags."""
    text = " ".join(content.split())
    colon, sentence = _first_breaks(text)
    cuts = [(pos, skip) for pos, skip in ((colon, 3), (sentence, 1)) if pos > 0]
    pos, skip = min(cuts) if cuts else (len(text), 0)
    title = strip_parentheses(text[:pos]).rstrip(" .:;")
    rest = text[pos + skip:]
    if len(title) < MIN_TITLE_LENGTH:
        # « Correction : … », « Projet mcai : … » : on prend la phrase entière.
        end = sentence if sentence > 0 else len(text)
        title = strip_parentheses(text[:end]).rstrip(" .")
        rest = text[end + 1:]
    if not title:
        title = " · ".join(tags[:3]) or "Entrée sans texte"
    return shorten(title, 110), rest.lstrip(" .:;—–-")


SENTENCE_BREAK = re.compile(r"(?<=[.!?])\s+(?=[A-ZÀ-ÖØ-Þ«(\"0-9])")


def derive_summary(rest: str) -> str:
    """Résumé : les une ou deux phrases qui suivent le titre, 260 caractères au plus."""
    sentences, start = [], 0
    for match in SENTENCE_BREAK.finditer(rest):
        if ABBREVIATION_END.search(rest[: match.start()]):
            continue  # « ex. "Agent IA Minecraft" » : pas une fin de phrase
        sentences.append(rest[start: match.start()])
        start = match.end()
    sentences.append(rest[start:])
    summary = ""
    for sentence in sentences:
        summary = f"{summary} {sentence}".strip()
        if len(summary) >= 120:
            break
    summary = shorten(summary, 260)
    # Majuscule initiale sur un mot ordinaire seulement : pas sur « npm »,
    # « iPhone » ou « mcai/train.py ».
    first_word = summary.split(" ", 1)[0]
    if re.fullmatch(r"[a-zà-öø-ÿ'’-]+", first_word):
        summary = summary[:1].upper() + summary[1:]
    return summary


def _trim_link(value: str) -> str:
    value = value.rstrip(TRAILING_PUNCTUATION)
    # Parenthèse ou crochet fermant qui appartient à la phrase, pas au lien.
    for opening, closing in (("(", ")"), ("[", "]")):
        while value.endswith(closing) and value.count(closing) > value.count(opening):
            value = value[:-1].rstrip(TRAILING_PUNCTUATION)
    return value


URL_HOST_RE = re.compile(r"^[a-z][a-z0-9+.-]*://(?:[^@/?#]*@)?(\[[^\]]*\]|[^/:?#]*)", re.I)


def _host_of(url: str) -> str:
    # Pas urlsplit : il lève une exception sur « https://[masqué]@hôte ».
    match = URL_HOST_RE.match(url)
    return match.group(1) if match else ""


LOCAL_SUFFIXES = (".local", ".internal", ".localhost", ".lan", ".home", ".arpa", ".localdomain")


def _is_local_host(host: str) -> bool:
    host = (host or "").strip("[]").lower()
    if not host or host == "localhost" or host.endswith(LOCAL_SUFFIXES):
        return True
    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        return "." not in host  # nom machine nu, ex. http://nas:5000
    # Privées, bouclage, lien local, mais aussi 100.64/10 (Tailscale) et
    # plages réservées : tout ce qui n'est pas joignable depuis Internet.
    return not ip.is_global


URL_AUTHORITY_RE = re.compile(r"^https?://(?:[^@/?#]*@)?(?:\[[0-9a-f:.]+\]|([a-z0-9.-]+))(?::(\d{1,5}))?(?:[/?#]|$)", re.I)
HOSTNAME_RE = re.compile(r"^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]+|\d{1,3})$", re.I)


def _is_valid_web_url(url: str) -> bool:
    """Un lien cliquable doit mener quelque part : hôte bien formé, port valide."""
    match = URL_AUTHORITY_RE.match(url)
    if not match:
        return False
    host, port = match.group(1), match.group(2)
    if port and not 0 < int(port) < 65536:
        return False
    return host is None or bool(HOSTNAME_RE.match(host))  # None : IPv6 entre crochets


def detect_links(text: str) -> list[dict[str, str]]:
    """
    Liens présents dans le texte brut, dans leur ordre d'apparition :
    [{"type": "en_ligne" | "local", "valeur": "..."}], en ligne d'abord.
    """
    found: list[tuple[int, str, str]] = []
    taken: list[tuple[int, int]] = []

    def overlaps(start: int, end: int) -> bool:
        return any(start < b and a < end for a, b in taken)

    def add(start: int, end: int, kind: str, value: str) -> None:
        # Un lien qui contient un secret masqué ne mène nulle part.
        if value and REDACTED not in value and not overlaps(start, end):
            taken.append((start, end))
            found.append((start, kind, value))

    for match in URL_RE.finditer(text):
        raw_value = _trim_link(match.group())
        # Jamais d'identifiants dans un lien publié (ils sont déjà masqués
        # dans le texte ; « https://[masqué]@hôte » ne mènerait nulle part).
        value = re.sub(r"(?<=://)[^/\s]*@", "", raw_value, count=1)
        if _is_local_host(_host_of(value)):
            add(match.start(), match.start() + len(raw_value), "local", value)
        elif _is_valid_web_url(value):
            add(match.start(), match.start() + len(raw_value), "en_ligne", value)
        else:
            taken.append((match.start(), match.start() + len(raw_value)))  # ni lien, ni adresse
    for pattern in (BARE_REPO_RE, BARE_SITE_RE):
        for match in pattern.finditer(text):
            value = _trim_link(match.group())
            add(match.start(), match.start() + len(value), "en_ligne", "https://" + value)
    for match in WINDOWS_QUOTED_PATH_RE.finditer(text):
        value = match.group(1).rstrip(" .,;:!?")
        add(match.start(1), match.start(1) + len(value), "local", value)
    for pattern in (FILE_URL_RE, LOCAL_HOST_RE, WINDOWS_PATH_RE, UNC_PATH_RE, HOME_PATH_RE):
        for match in pattern.finditer(text):
            value = _trim_link(match.group())
            if len(value) > 3:
                add(match.start(), match.start() + len(value), "local", value)
    for match in PORT_RE.finditer(text):
        if overlaps(match.start(), match.end()):
            continue
        taken.append((match.start(), match.end()))
        for number in re.findall(r"\d{2,5}", match.group(1)):  # « ports 8000 et 8765 »
            found.append((match.start(), "local", f"port {number}"))

    ordered = sorted(found, key=lambda f: (f[1] != "en_ligne", f[0]))
    locals_lower = [value.lower() for _, kind, value in ordered if kind == "local"]

    def redundant(kind: str, value: str) -> bool:
        # « localhost:11434 » déjà contenu dans « http://localhost:11434 »,
        # « port 11434 » déjà porté par une adresse « …:11434 ». Les chemins
        # parent et enfant (E:\a et E:\a\b) restent tous deux, tout comme
        # « localhost:80 » face à « http://localhost:8080 ».
        if kind != "local":
            return False
        low = value.lower()
        if low.startswith("port "):
            return any(re.search(rf":{low[5:]}(?!\d)", other) for other in locals_lower)
        pattern = re.escape(low) + r"(?![\w.-])"
        return any(low != other and "://" in other and re.search(pattern, other) for other in locals_lower)

    links, seen = [], set()
    for _, kind, value in ordered:
        key = (kind, value.lower())
        if key not in seen and not redundant(kind, value):
            seen.add(key)
            links.append({"type": kind, "valeur": value})
    return links


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


def project_main_link(members: list[dict]) -> dict | None:
    """Premier site parmi les entrées (de la plus récente à la plus ancienne), sinon premier dépôt."""
    recent_first = sorted(members, key=lambda e: e["cree_le"] or "", reverse=True)
    for wanted in ("site", "depot"):
        for entry in recent_first:
            link = entry.get("lien_principal")
            if link and link["genre"] == wanted:
                return link
    return None


# --------------------------------------------------------------------------
# Projets
# --------------------------------------------------------------------------

def assign_projects(entries: list[dict], config: dict) -> None:
    """
    Le projet d'une entrée est porté par un de ses tags. Heuristique :
    chaque entrée « vote » pour son premier tag non générique ; le projet
    retenu est, parmi ses tags, celui qui a reçu le plus de votes sur
    l'ensemble de la mémoire (à égalité, le plus tôt dans la liste).
    Les alias de config/projets.json fusionnent deux tags d'un même projet.
    """
    generic = GENERIC_TAGS | {slug(t) for t in config["tags_generiques"]}
    aliases = {alias: key for key, projet in config["projets"].items() for alias in projet["alias"]}

    def candidates(entry: dict) -> list[str]:
        return [t for t in entry["_tags_slug"] if t and t not in generic]

    votes = Counter()
    for entry in entries:
        first = candidates(entry)[:1]
        if first:
            votes[aliases.get(first[0], first[0])] += 1

    for entry in entries:
        options = [aliases.get(t, t) for t in candidates(entry)]
        if not options:
            entry["projet"] = None
            continue
        best = max(range(len(options)), key=lambda i: (votes[options[i]], -i))
        entry["projet"] = options[best]


FIRST_CLAUSE = re.compile(r"^(.+?)\s*(?:\(|\s—\s|\s–\s|\s:\s|,|\.\s|$)")
QUOTED = re.compile(r"[«\"“]\s*([^»\"”]{2,40}?)\s*[»\"”]")


def _name_from_text(content: str) -> str | None:
    """« Projet Jarvis (…) » → Jarvis ; « Compétence "design-studio" (…) » → design-studio."""
    match = FIRST_CLAUSE.match(" ".join(content.split()))
    if not match:
        return None
    clause = match.group(1)
    quoted = QUOTED.search(clause)
    if quoted:
        return quoted.group(1)
    if clause.startswith("Projet ") and 2 <= len(clause) - 7 <= 40:
        return clause[7:]
    return None


def project_names(entries: list[dict], config: dict) -> dict[str, str]:
    overrides = {key: projet["nom"] for key, projet in config["projets"].items() if projet["nom"]}
    extracted: dict[str, str] = {}
    # Le nom vient de la plus ancienne entrée qui nomme le projet.
    for entry in sorted(entries, key=lambda e: e["cree_le"] or ""):
        key = entry["projet"]
        if key and key not in extracted:
            name = _name_from_text(entry["contenu"])
            if name:
                extracted[key] = name
    names = {}
    for entry in entries:
        key = entry["projet"]
        if key and key not in names:
            names[key] = overrides.get(key) or extracted.get(key) or key.replace("-", " ").capitalize()
    return names


# --------------------------------------------------------------------------
# Construction de data.json
# --------------------------------------------------------------------------

def iso(value) -> str | None:
    if not value:
        return None
    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(value, tz=timezone.utc).isoformat().replace("+00:00", "Z")
    return str(value)


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
        liens = detect_links(content)
        # Liste blanche : rien d'autre ne sort (ni metadata, ni access_queries).
        entries.append({
            "id": item["content_hash"],
            "titre": title,
            "resume": summary,
            "contenu": content,
            "type": (item.get("memory_type") or "note").strip().lower(),
            "tags": tags,
            "cree_le": iso(item.get("created_at_iso") or item.get("created_at")),
            "modifie_le": iso(item.get("updated_at_iso") or item.get("updated_at")),
            "liens": liens,
            "lien_principal": main_link(liens),
            "corrige": corrected,
            "_tags_slug": tags_slug,
        })

    report["orphelines"] = sorted(set(overrides) - seen_keys)

    assign_projects(entries, config)
    names = project_names(entries, config)
    for entry in entries:
        del entry["_tags_slug"]

    entries.sort(key=lambda e: (e["cree_le"] or "", e["id"]), reverse=True)

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

    payload = {
        "schema": SCHEMA_VERSION,
        "genere_le": None,  # posé à l'écriture, seulement si le contenu a changé
        "source": "mcp-memory-service",
        "nb_entrees": len(entries),
        "types": dict(Counter(e["type"] for e in entries).most_common()),
        "ordre_types": TYPE_ORDER,
        "familles": config["familles"],
        "synonymes": (search_config or {}).get("synonymes", []),
        "projets": projects,
        "entrees": entries,
    }
    return payload, report


def fingerprint(payload: dict) -> str:
    stable = {k: v for k, v in payload.items() if k not in ("genere_le", "empreinte")}
    blob = json.dumps(stable, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()


# --------------------------------------------------------------------------
# Écriture et publication
# --------------------------------------------------------------------------

def read_previous() -> dict | None:
    if not DATA_FILE.is_file():
        return None
    try:
        return json.loads(DATA_FILE.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def write_payload(payload: dict) -> None:
    DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
    tmp = DATA_FILE.with_suffix(".json.tmp")
    with open(tmp, "w", encoding="utf-8", newline="\n") as handle:
        handle.write(json.dumps(payload, ensure_ascii=False, indent=1) + "\n")
    os.replace(tmp, DATA_FILE)


def git(*args: str, check: bool = True) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["git", *args], cwd=ROOT, check=check, text=True, encoding="utf-8",
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
    )


def publish(payload: dict, push: bool) -> None:
    """
    Commit de data.json s'il diffère de HEAD, puis push de tout commit pas
    encore sur le dépôt distant. Rattrape donc un export précédent resté
    local (--no-git, --no-push, push refusé) même si le contenu n'a pas bougé.
    """
    relative = DATA_FILE.relative_to(ROOT).as_posix()
    git("add", "--", relative)
    if git("diff", "--cached", "--quiet", "--", relative, check=False).returncode != 0:
        stamp = (payload.get("genere_le") or "")[:16].replace("T", " ")
        message = f"Export mémoire : {payload['nb_entrees']} entrées ({stamp} UTC)"
        # Pathspec : seul data.json part dans ce commit, même si d'autres
        # fichiers sont indexés à côté.
        git("commit", "-m", message, "--", relative)
        print(f"  git : commit « {message} »")
    else:
        print("  git : data.json déjà commité.")
    if not push:
        return

    if git("rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}", check=False).returncode != 0:
        # Premier push : la branche n'a pas encore d'amont.
        if "origin" not in git("remote", check=False).stdout.split():
            raise ExportError("aucun dépôt distant « origin » : voir « Première mise en place » dans le README.")
        result = git("push", "-u", "origin", "HEAD", check=False)
    else:
        ahead = git("rev-list", "--count", "@{u}..HEAD", check=False)
        if ahead.returncode == 0 and ahead.stdout.strip() == "0":
            print("  git : dépôt distant déjà à jour.")
            return
        result = git("push", check=False)
    if result.returncode != 0:
        raise ExportError("git push a échoué :\n" + result.stdout.strip())
    print("  git : push effectué.")


def main() -> int:
    parser = argparse.ArgumentParser(description="Exporte la mémoire partagée vers docs/data.json.")
    parser.add_argument("--dry-run", action="store_true", help="récupère et résume, n'écrit rien")
    parser.add_argument("--no-git", action="store_true", help="écrit data.json sans commit ni push")
    parser.add_argument("--no-push", action="store_true", help="commit sans push")
    parser.add_argument("--force", action="store_true", help="publie même si le nombre d'entrées chute")
    args = parser.parse_args()

    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")

    try:
        config = load_config()
        print(f"Source : {describe_source(config)}" + ("" if config["api_key"] else " (sans clé API)"))
        known_secrets = (config["api_key"], config["cf_client_id"], config["cf_client_secret"])
        if not config["local"]:
            known_secrets += (_host_of(config["api_url"]),)  # adresse du tunnel
        raw = fetch_all_memories(Api(config))
        payload, report = build_payload(raw, load_projects_config(), known_secrets)
    except ExportError as err:
        print(f"Échec : {err}", file=sys.stderr)
        return 1

    nb_links = Counter(link["type"] for e in payload["entrees"] for link in e["liens"])
    print(f"  {len(raw)} entrées lues, {payload['nb_entrees']} publiables, "
          f"{report['excluded']} exclues par tag, {len(payload['projets'])} projets, "
          f"liens : {nb_links['en_ligne']} en ligne / {nb_links['local']} locaux.")
    if report["redactions"]:
        print(f"  ! {report['redactions']} secret(s) masqué(s) dans : {', '.join(report['redacted_entries'])}")

    previous = read_previous()
    previous_count = (previous or {}).get("nb_entrees") or 0
    if payload["nb_entrees"] == 0 and not args.force:
        print("Échec : aucune entrée à publier (base vide ou mal pointée ?). --force pour passer outre.",
              file=sys.stderr)
        return 1
    if previous_count and payload["nb_entrees"] < previous_count * MIN_RATIO_VS_PREVIOUS and not args.force:
        print(f"Échec : {payload['nb_entrees']} entrées contre {previous_count} au dernier export. "
              "Vérifier la base ; --force pour publier quand même.", file=sys.stderr)
        return 1

    payload["empreinte"] = fingerprint(payload)
    unchanged = bool(previous) and previous.get("empreinte") == payload["empreinte"]
    if args.dry_run:
        print("  Contenu identique au dernier export." if unchanged else "  --dry-run : rien n'est écrit.")
        return 0
    if unchanged:
        # data.json est à jour, mais peut-être pas encore commité ou poussé :
        # publish() s'en assure, avec la date de l'export d'origine.
        print("  Contenu identique au dernier export : data.json inchangé.")
        payload = previous
    else:
        payload["genere_le"] = datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
        write_payload(payload)
        print(f"  Écrit : {DATA_FILE.relative_to(ROOT).as_posix()}")

    if args.no_git:
        return 0
    try:
        publish(payload, push=not args.no_push)
    except (ExportError, subprocess.CalledProcessError) as err:
        detail = getattr(err, "stdout", None) or str(err)
        print(f"Échec git : {detail}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
