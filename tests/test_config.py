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


if __name__ == "__main__":
    unittest.main()
