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
