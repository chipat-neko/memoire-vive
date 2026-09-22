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
"""

from __future__ import annotations

import argparse
import copy
import hashlib
import hmac
import json
import os
import re
import secrets
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


def etat_git(racine: Path, connus: tuple = ()) -> dict | None:
    """Branche, fichiers suivis modifiés et pas encore commités, commits pas
    encore poussés, refus de publier ; None hors d'un dépôt git (ou sans git).
    connus : valeurs des secrets (vérification des réglages enregistrés)."""
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
                        "git": etat_git(racine, connus)})

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
