import http.client
import json
import math
import socketserver
import tempfile
import threading
import unittest
from pathlib import Path
from unittest import mock

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
        payload, report = export.build_payload(self.brut(), cfg)
        self.assertEqual(payload["projets"][0]["lien_principal"]["url"], "https://a.github.io/alpha/")
        self.assertEqual(report["liens_refuses"], ["alpha (URL invalide)"])

    def lien_publie(self, url, secrets=()):
        payload, report = export.build_payload(self.brut(), config(alpha={"lien_principal": url}), secrets)
        return payload["projets"][0]["lien_principal"]["url"], report

    def test_lien_configure_sans_identifiants(self):
        url, report = self.lien_publie("https://user:jeton@exemple.fr/page")
        self.assertEqual(url, "https://exemple.fr/page")
        self.assertEqual(report["liens_refuses"], [])
        self.assertEqual(report["redactions"], 1)
        self.assertIn("projet alpha", report["redacted_entries"])

    def test_lien_configure_refuse_s_il_contient_un_secret(self):
        for lien, secrets in (("https://exemple.fr/?k=cle-du-dashboard-42", ("cle-du-dashboard-42",)),
                              ("https://exemple.fr/?token=abc123456789", ())):
            url, report = self.lien_publie(lien, secrets)
            self.assertEqual(url, "https://a.github.io/alpha/", lien)  # calcul automatique à la place
            self.assertEqual(report["liens_refuses"], ["alpha (secret masqué)"])
            self.assertNotIn("cle-du-dashboard-42", json.dumps(export.build_payload(
                self.brut(), config(alpha={"lien_principal": lien}), secrets)[0]))

    def test_lien_configure_local_refuse(self):
        for lien in ("http://192.168.1.10:8080/", "http://nas.local/", "http://localhost:8000/",
                     "https://100.101.102.103/", "http://nas:5000/"):
            url, report = self.lien_publie(lien)
            self.assertEqual(url, "https://a.github.io/alpha/", lien)
            self.assertEqual(report["liens_refuses"], ["alpha (adresse locale)"], lien)

    def test_description_et_nom_configures_masques(self):
        cfg = config(alpha={"nom": "Alpha sk-ant-abcdefghijklmnopqrstuvwxyz0123",
                            "description": "Accès : password=Hunter22! puis cle-du-dashboard-42."})
        payload, report = export.build_payload(self.brut(), cfg, ("cle-du-dashboard-42",))
        projet = payload["projets"][0]
        texte = json.dumps(payload, ensure_ascii=False)
        for secret in ("Hunter22", "sk-ant-abcdef", "cle-du-dashboard-42"):
            self.assertNotIn(secret, texte)
        self.assertIn("[masqué]", projet["nom"])
        self.assertIn("[masqué]", projet["description"])
        self.assertEqual(report["redactions"], 3)
        self.assertEqual(report["redacted_entries"], ["projet alpha"])

    def test_masquages_des_corrections_comptes(self):
        cle = f"{1:064x}"[:12]  # une seule entrée : memoire(2) aurait la même clé courte
        _, report = export.build_payload([memoire(1, TEXTE, ["alpha"])], config(), overrides={
            cle: {"titre": "Alpha password=Hunter22!", "resume": "Clé : sk-ant-abcdefghijklmnopqrstuvwxyz0123"}})
        self.assertEqual(report["redactions"], 2)
        self.assertEqual(report["redacted_entries"], [cle])

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


class ApiSearchTest(unittest.TestCase):
    """
    Analyse par Api.search de la réponse brute de /api/search. On construit
    un vrai Api (adresse locale bidon, jamais contactée) et on remplace son
    attribut d'instance « request » par un bouchon qui renvoie une réponse
    fabriquée : search() ne doit jamais lever autre chose qu'ExportError.
    """
    def _api(self, payload):
        api = export.Api({
            "api_url": "http://127.0.0.1:1", "api_key": "",
            "cf_client_id": "", "cf_client_secret": "", "local": True,
        })
        api.request = lambda *args, **kwargs: payload
        return api

    def test_resultats_bien_formes(self):
        api = self._api({"results": [
            {"memory": {"content_hash": f"{1:064x}"}, "similarity_score": 0.9},
            {"memory": {"content_hash": f"{2:064x}"}, "similarity_score": 0.5},
        ]})
        self.assertEqual(api.search("texte", 5), [(f"{1:064x}", 0.9), (f"{2:064x}", 0.5)])

    def test_elements_mal_formes_ignores(self):
        api = self._api({"results": [
            "pas un objet",
            42,
            {"memory": "pas un objet non plus"},
            {"similarity_score": 0.8},                # pas de "memory" du tout
            {"memory": {}},                            # pas de content_hash
            {"memory": {"content_hash": f"{3:064x}"}, "similarity_score": "pas un nombre"},
            {"memory": {"content_hash": f"{4:064x}"}, "similarity_score": 0.7},
        ]})
        self.assertEqual(api.search("texte", 5), [(f"{4:064x}", 0.7)])

    def test_reponse_sans_liste_results_leve_exporterror(self):
        api = self._api({"autre_chose": []})
        with self.assertRaises(export.ExportError):
            api.search("texte", 5)

    def test_hash_non_chaine_ignore(self):
        # Une liste ou un objet comme content_hash lèverait TypeError plus loin
        # (« other not in published » sur un ensemble de chaînes).
        api = self._api({"results": [
            {"memory": {"content_hash": ["a", "b"]}, "similarity_score": 0.9},
            {"memory": {"content_hash": {"a": 1}}, "similarity_score": 0.9},
            {"memory": {"content_hash": 42}, "similarity_score": 0.9},
            {"memory": {"content_hash": f"{5:064x}"}, "similarity_score": 0.9},
        ]})
        self.assertEqual(api.search("texte", 5), [(f"{5:064x}", 0.9)])

    def test_scores_non_finis_ignores(self):
        # json.loads accepte les jetons NaN et Infinity, et 1e999 devient l'infini :
        # publiés, ils rendraient data.json illisible pour JSON.parse (site cassé).
        brut = ('{"results": ['
                '{"memory": {"content_hash": "a"}, "similarity_score": "nan"},'
                '{"memory": {"content_hash": "b"}, "similarity_score": "inf"},'
                '{"memory": {"content_hash": "c"}, "similarity_score": 1e999},'
                '{"memory": {"content_hash": "d"}, "similarity_score": NaN},'
                '{"memory": {"content_hash": "e"}, "similarity_score": -Infinity},'
                '{"memory": {"content_hash": "f"}, "similarity_score": 0.85}]}')
        api = self._api(json.loads(brut))
        self.assertEqual(api.search("texte", 5), [("f", 0.85)])


class ServeurBrut(socketserver.BaseRequestHandler):
    """Lit la requête puis renvoie les octets de server.reponse tels quels et ferme."""
    def handle(self):
        recu = b""
        while b"\r\n\r\n" not in recu:
            morceau = self.request.recv(4096)
            if not morceau:
                break
            recu += morceau
        self.request.sendall(self.server.reponse)


class ApiRequestTest(unittest.TestCase):
    """Réponses HTTP cassées : Api.request ne doit lever qu'ExportError."""
    def setUp(self):
        self.serveur = socketserver.ThreadingTCPServer(("127.0.0.1", 0), ServeurBrut)
        self.serveur.daemon_threads = True
        threading.Thread(target=self.serveur.serve_forever, daemon=True).start()
        self.api = export.Api({"api_url": f"http://127.0.0.1:{self.serveur.server_address[1]}", "api_key": "",
                               "cf_client_id": "", "cf_client_secret": "", "local": True})

    def tearDown(self):
        self.serveur.shutdown()
        self.serveur.server_close()

    def test_corps_tronque(self):  # http.client.IncompleteRead
        self.serveur.reponse = (b"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n"
                                b"Content-Length: 100\r\nConnection: close\r\n\r\n{\"a\": 1")
        with self.assertRaises(export.ExportError) as ctx:
            self.api.request("GET", "/api/memories", retries=1)
        self.assertIn("IncompleteRead", str(ctx.exception))

    def test_ligne_de_statut_illisible(self):  # http.client.BadStatusLine
        self.serveur.reponse = b"CECI N'EST PAS DU HTTP\r\n\r\n"
        with self.assertRaises(export.ExportError) as ctx:
            self.api.request("GET", "/api/memories", retries=1)
        self.assertIn("BadStatusLine", str(ctx.exception))


class VoisinsJamaisBloquantsTest(unittest.TestCase):
    def test_toute_exception_de_recherche_comptee_en_echec(self):
        for erreur in (TypeError("hash"), KeyError("memory"), ValueError("x"), http.client.IncompleteRead(b"")):
            liste = entrees(2)
            def search(query, n):
                raise erreur
            relies, echecs = export.add_neighbours(liste, search)
            self.assertEqual((relies, echecs), (0, 2), repr(erreur))
            self.assertTrue(all(e["voisins"] == [] for e in liste))

    def test_resultats_mal_formes_d_une_recherche_maison(self):
        liste = entrees(2)
        def search(query, n):
            return [("un seul élément",)]  # ne se déballe pas en (hash, score)
        relies, echecs = export.add_neighbours(liste, search)
        self.assertEqual((relies, echecs), (0, 2))


class ValeursNonFiniesTest(unittest.TestCase):
    def test_voisin_nan_ou_infini_ecarte(self):
        liste = entrees(4)
        def search(query, n):
            return [(f"{2:064x}", float("nan")), (f"{3:064x}", float("inf")), (f"{4:064x}", 0.9)]
        export.add_neighbours(liste, search)
        for entree in liste:
            for voisin in entree["voisins"]:
                self.assertTrue(math.isfinite(voisin["score"]), entree["voisins"])
        self.assertEqual([v["id"] for v in liste[0]["voisins"]], [f"{4:064x}"])

    def test_empreinte_refuse_nan(self):
        with self.assertRaises(ValueError):
            export.fingerprint({"entrees": [{"voisins": [{"id": "a", "score": float("nan")}]}]})

    def test_ecriture_refuse_infini(self):
        with tempfile.TemporaryDirectory() as dossier:
            cible = Path(dossier) / "docs" / "data.json"
            with mock.patch.object(export, "DATA_FILE", cible):
                with self.assertRaises(ValueError):
                    export.write_payload({"score": float("inf")})
            self.assertFalse(cible.exists(), "aucun data.json invalide ne doit être écrit")
            self.assertFalse(cible.with_suffix(".json.tmp").exists(), "ni fichier temporaire")


if __name__ == "__main__":
    unittest.main()
