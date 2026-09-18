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
        # n=2 * 16**52 (plutôt que 2 tout court) : content_hash étant n formé en
        # hexadécimal sur 64 caractères (voir tests/aides.py), un petit entier
        # laisse les 12 premiers caractères à "000000000000", identiques à
        # memoire(1, ...) — la clé de correction collisionnerait avec l'entrée 1.
        deuxieme = 2 * 16 ** 52
        brut = [memoire(1, TEXTE, ["alpha"]), memoire(deuxieme, TEXTE + " Bis.", ["alpha"])]
        payload, report = export.build_payload(brut, config(), overrides={f"{deuxieme:064x}"[:12]: {"masquer": True}})
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


if __name__ == "__main__":
    unittest.main()
