import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock

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

    def test_alias_chaine_traitee_comme_liste_a_un_element(self):
        cfg = config(depths={"alias": "rogue-lite"})
        self.assertEqual(cfg["projets"]["depths"]["alias"], ["rogue-lite"])

    def test_alias_numerique_converti_en_chaine(self):
        cfg = config(depths={"alias": [56]})
        self.assertEqual(cfg["projets"]["depths"]["alias"], ["56"])

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

    def test_tags_exclus_chaine_seule(self):
        # list("perso") donnerait ['p','e','r','s','o'] : les entrées « perso » seraient publiées.
        for brut in ({"version": 2, "tags_exclus": "perso", "tags_generiques": "python"},
                     {"tags_exclus": "perso", "tags_generiques": "python"}):  # v2 et v1
            cfg = export.normalize_projects_config(brut)
            self.assertEqual(cfg["tags_exclus"], ["perso"])
            self.assertEqual(cfg["tags_generiques"], ["python"])

    def test_tags_exclus_chaine_seule_appliques_a_l_export(self):
        cfg = export.normalize_projects_config({"version": 2, "tags_exclus": "perso"})
        brut = [memoire(1, "Note perso : à ne pas publier. Suite.", ["perso"]),
                memoire(2, "Note publique : à publier. Suite.", ["public"])]
        payload, report = export.build_payload(brut, cfg)
        self.assertEqual([e["id"] for e in payload["entrees"]], [f"{2:064x}"])
        self.assertEqual(report["excluded"], 1)

    def test_tags_exclus_de_type_inattendu_refuses(self):
        for valeur in (True, 42, {"perso": True}):
            with self.assertRaises(export.ExportError, msg=repr(valeur)):
                export.normalize_projects_config({"version": 2, "tags_exclus": valeur})

    def test_tags_exclus_absents_ou_vides(self):
        for brut in ({}, {"tags_exclus": None}, {"tags_exclus": []}, {"tags_exclus": ""}):
            self.assertEqual(export.normalize_projects_config(brut)["tags_exclus"], [], brut)

    # Pré-classement du § 8 de la spec (18/09/2026). L'admin pourra classer
    # d'autres projets : on vérifie ceux-ci, pas un total exact.
    PRE_CLASSEMENT = {
        "jeux": ["depths", "void-atlas", "tactical-ops", "voxelcraft", "nova", "yuei-heroes-battle", "jeu-claude",
                 "plan-min", "wiki-star-citizen", "speedrush-dofus", "dosoft"],
        "cours": ["syntaxe", "devpath", "codelyngo", "cours-graph", "orbis", "claude-learning-apps", "check-code",
                  "un-monde-sans", "religions"],
        "ia": ["jarvis", "ai-creator", "code-ai", "help-code-ai", "roberta", "amalia", "mcai", "clipcoach",
               "pipeline-securite-n8n-ollama", "le-bocal"],
        "outils-claude": ["tour-de-controle", "antigravity-skills", "design-studio", "uiverse-components",
                          "deadline-command", "multi-claude-orchestrator", "pont-memoire", "memoire-vive",
                          "bibliotheque-claude"],
        "sites": ["my-watch", "jsl-metal", "ce-ventre", "opti-route", "trading-alert-bot", "decoupe-videos",
                  "presentation"],
    }

    def test_fichier_reel_v2_coherent(self):
        cfg = export.load_projects_config()
        self.assertEqual(len(cfg["familles"]), 5)
        self.assertEqual(sum(len(p) for p in self.PRE_CLASSEMENT.values()), 46)
        for famille, projets in self.PRE_CLASSEMENT.items():
            for projet in projets:
                self.assertIn(projet, cfg["projets"], projet)
                self.assertEqual(cfg["projets"][projet]["famille"], famille, projet)
        alias = [a for p in cfg["projets"].values() for a in p["alias"]]
        self.assertEqual(len(alias), len(set(alias)), "un alias ne peut viser qu'un projet")
        self.assertFalse(set(alias) & set(cfg["projets"]), "un alias ne peut pas être lui-même un projet")


class CorrectionsParEntreeTest(unittest.TestCase):
    def charger(self, contenu):
        with tempfile.TemporaryDirectory() as dossier:
            fichier = Path(dossier) / "entrees.json"
            fichier.write_text(json.dumps(contenu), encoding="utf-8")
            with mock.patch.object(export, "ENTRIES_CONFIG", fichier):
                return export.load_entry_overrides()

    def test_objets_charges_cles_aide_ignorees(self):
        self.assertEqual(self.charger({"_aide": "mode d'emploi", "A713BD8E2800FF": {"masquer": True}}),
                         {"a713bd8e2800": {"masquer": True}})

    def test_valeur_non_objet_refusee(self):
        # {"a713bd8e2800": true} était ignoré sans bruit : l'entrée restait publiée.
        for valeur in (True, "masquer", ["masquer"], None):
            with self.assertRaises(export.ExportError, msg=repr(valeur)) as ctx:
                self.charger({"_aide": "…", "a713bd8e2800": valeur})
            self.assertIn("a713bd8e2800", str(ctx.exception))


if __name__ == "__main__":
    unittest.main()
