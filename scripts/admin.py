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
