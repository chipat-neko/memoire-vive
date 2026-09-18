import http.client
import json
import math
import socketserver
import tempfile
import threading
import unittest
from pathlib import Path
from unittest import mock

from tests.aides import config, export, hash_de, memoire

TEXTE = "Projet Alpha (D:\\alpha) : un outil de test. Il fait des choses utiles. Et encore."


class CorrectionsTest(unittest.TestCase):
    def test_titre_et_resume_corriges(self):
        brut = [memoire(1, TEXTE, ["alpha", "projet"])]
        cle = hash_de(1)[:12]
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
        payload, report = export.build_payload(brut, config(), overrides={hash_de(2)[:12]: {"masquer": True}})
        self.assertEqual([e["id"] for e in payload["entrees"]], [hash_de(1)])
        self.assertEqual(report["masquees"], 1)

    def test_cle_orpheline_signalee(self):
        _, report = export.build_payload([memoire(1, TEXTE, ["alpha"])], config(), overrides={"ffffffffffff": {"titre": "x"}})
        self.assertEqual(report["orphelines"], ["ffffffffffff"])

    def test_correction_aussi_masquee_si_secret(self):
        cle = hash_de(1)[:12]
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
        cle = hash_de(1)[:12]
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
    return [{"id": hash_de(i), "contenu": f"texte {i}"} for i in range(1, n + 1)]


def h(i):
    return hash_de(i)


def v(i, score):
    return {"id": h(i), "score": score}


class FauxSens:
    """
    Imite POST /api/search : similarités symétriques fabriquées entre les
    entrées « texte i » (1,0 avec elle-même, 0,1 par défaut), meilleures d'abord.
    La base peut contenir des entrées non publiées (masquées, exclues).
    """
    def __init__(self, base, scores):
        self.base = list(base)
        self.scores = {frozenset(paire): s for paire, s in scores.items()}
        self.appels = []

    def search(self, query, n):
        i = int(query.split()[-1])
        self.appels.append(i)
        res = [(h(j), 1.0 if j == i else self.scores.get(frozenset((i, j)), 0.1)) for j in self.base]
        return sorted(res, key=lambda r: -r[1])[:n]


class VoisinsTest(unittest.TestCase):
    def test_filtre_soi_seuil_et_non_publiees(self):
        liste = entrees(3)
        sens = FauxSens([1, 2, 3, 99], {(1, 2): 0.9, (2, 3): 0.5, (1, 99): 0.95})  # 99 : non publiée
        bilan = export.add_neighbours(liste, sens.search, threshold=0.75)
        self.assertEqual(liste[0]["voisins"], [v(2, 0.9)])
        self.assertEqual(liste[1]["voisins"], [v(1, 0.9)])
        self.assertEqual(liste[2]["voisins"], [])
        self.assertEqual((bilan.linked, bilan.searches, bilan.failures, bilan.pending), (2, 3, 0, []))

    def test_recalcul_complet_symetrique(self):
        # Les 8 résultats de la recherche de 1 sont elle-même et 7 entrées non
        # publiées : 1 ne voit pas 2. Mais 2 voit 1 : par symétrie, 1 gagne 2.
        liste = entrees(2)
        proches = {(1, 90 + k): 0.99 - k / 100 for k in range(7)}
        sens = FauxSens([1, 2] + list(range(90, 97)), {**proches, (1, 2): 0.85})
        export.add_neighbours(liste, sens.search)
        self.assertNotIn(h(2), [r[0] for r in sens.search("texte 1", 8)])
        self.assertEqual(liste[0]["voisins"], [v(2, 0.85)])
        self.assertEqual(liste[1]["voisins"], [v(1, 0.85)])

    def test_au_plus_cinq(self):
        liste = entrees(8)
        def search(query, n):
            return [(e["id"], 0.9) for e in liste]
        export.add_neighbours(liste, search)
        self.assertEqual(len(liste[0]["voisins"]), export.MAX_VOISINS)
        self.assertEqual([x["id"] for x in liste[0]["voisins"]], [h(i) for i in range(2, 7)])  # à égalité : par id

    def test_echecs_tolerés_puis_abandon(self):
        liste = entrees(10)
        appels = []
        def search(query, n):
            appels.append(query)
            raise export.ExportError("indisponible")
        bilan = export.add_neighbours(liste, search)
        self.assertEqual((bilan.linked, bilan.searches, bilan.failures), (0, 3, 3))
        self.assertEqual(bilan.pending, [e["id"] for e in liste], "toutes restent à chercher")
        self.assertEqual(len(appels), 3, "on arrête d'appeler après trois échecs consécutifs")
        self.assertTrue(all(e["voisins"] == [] for e in liste))


class VoisinsIncrementauxTest(unittest.TestCase):
    """Seules les entrées nouvelles sont cherchées : chaque recherche écrit dans la mémoire partagée."""
    CONNUS = {h(1): [v(2, 0.9)], h(2): [v(1, 0.9), v(3, 0.85)], h(3): [v(2, 0.85)]}

    def test_seule_la_nouvelle_entree_est_cherchee(self):
        liste = entrees(4)
        sens = FauxSens([1, 2, 3, 4], {(1, 2): 0.9, (2, 3): 0.85, (1, 4): 0.82})
        bilan = export.add_neighbours(liste, sens.search, self.CONNUS, {h(1), h(2), h(3)})
        self.assertEqual(sens.appels, [4])
        self.assertEqual(liste[3]["voisins"], [v(1, 0.82)])
        self.assertEqual(liste[0]["voisins"], [v(2, 0.9), v(4, 0.82)], "symétrie : 1 gagne la nouvelle entrée")
        self.assertEqual(liste[1]["voisins"], [v(1, 0.9), v(3, 0.85)])
        self.assertEqual(liste[2]["voisins"], [v(2, 0.85)])
        self.assertEqual((bilan.linked, bilan.searches, bilan.failures, bilan.pending), (4, 1, 0, []))

    def test_aucune_entree_nouvelle_aucune_recherche(self):
        liste = entrees(3)
        sens = FauxSens([1, 2, 3], {})
        bilan = export.add_neighbours(liste, sens.search, self.CONNUS, {h(1), h(2), h(3)})
        self.assertEqual(sens.appels, [])
        self.assertEqual({e["id"]: e["voisins"] for e in liste}, self.CONNUS)
        self.assertEqual((bilan.searches, bilan.pending), (0, []))

    def test_symetrie_garde_les_cinq_meilleurs(self):
        liste = entrees(8)
        connus = {h(1): [v(2, 0.95), v(3, 0.9), v(4, 0.88), v(5, 0.85), v(6, 0.81)]}
        sens = FauxSens(range(1, 9), {(1, 7): 0.87, (1, 8): 0.805})
        export.add_neighbours(liste, sens.search, connus, {h(i) for i in range(1, 7)})
        self.assertEqual(sens.appels, [7, 8])
        self.assertEqual(liste[0]["voisins"], [v(2, 0.95), v(3, 0.9), v(4, 0.88), v(7, 0.87), v(5, 0.85)])
        self.assertEqual(liste[7]["voisins"], [v(1, 0.805)])

    def test_sans_doublon(self):
        liste = entrees(2)
        def search(query, n):
            autre = h(2) if query.endswith(" 1") else h(1)
            return [(autre, 0.85), (autre, 0.9)]
        export.add_neighbours(liste, search)  # 1 et 2 nouvelles : chacune trouve l'autre
        self.assertEqual(liste[0]["voisins"], [v(2, 0.9)])
        self.assertEqual(liste[1]["voisins"], [v(1, 0.9)])

    def test_entree_disparue_retiree_sans_recherche(self):
        liste = [e for e in entrees(3) if e["id"] != h(3)]  # 3 masquée ou supprimée
        sens = FauxSens([1, 2], {})
        export.add_neighbours(liste, sens.search, self.CONNUS, {h(1), h(2), h(3)})
        self.assertEqual(sens.appels, [], "pas de recherche pour combler")
        self.assertEqual(liste[1]["voisins"], [v(1, 0.9)])

    def test_seuil_courant_applique_aux_anciens_voisins(self):
        liste = entrees(3)
        connus = {h(1): [v(2, 0.9), v(3, 0.78)]}
        export.add_neighbours(liste, FauxSens([], {}).search, connus, {h(1), h(2), h(3)}, threshold=0.8)
        self.assertEqual(liste[0]["voisins"], [v(2, 0.9)])

    def test_dry_run_aucune_recherche(self):
        liste = entrees(4)
        sens = FauxSens([1, 2, 3, 4], {(1, 4): 0.9})
        bilan = export.add_neighbours(liste, sens.search, self.CONNUS, {h(1), h(2), h(3)}, allow_search=False)
        self.assertEqual(sens.appels, [])
        self.assertEqual(liste[3]["voisins"], [])
        self.assertEqual(liste[0]["voisins"], [v(2, 0.9)], "les entrées inchangées gardent leurs voisins")
        self.assertEqual((bilan.searches, bilan.pending), (0, [h(4)]))

    def test_entree_en_attente_garde_ses_voisins_et_sera_cherchee(self):
        liste = entrees(2)
        connus = {h(1): [v(2, 0.9)], h(2): [v(1, 0.9)]}
        bilan = export.add_neighbours(liste, FauxSens([], {}).search, connus, {h(1)}, allow_search=False)
        self.assertEqual(liste[1]["voisins"], [v(1, 0.9)])
        self.assertEqual(bilan.pending, [h(2)])

    def test_echec_laisse_l_entree_en_attente(self):
        liste = entrees(3)
        sens = FauxSens([1, 2, 3], {(1, 3): 0.9})
        def search(query, n):
            if query.endswith(" 2"):
                raise export.ExportError("délai dépassé")
            return sens.search(query, n)
        bilan = export.add_neighbours(liste, search)
        self.assertEqual((bilan.searches, bilan.failures, bilan.pending), (3, 1, [h(2)]))
        self.assertEqual(liste[0]["voisins"], [v(3, 0.9)])

    def test_budget_de_temps(self):
        liste = entrees(5)
        maintenant = [1000.0]
        sens = FauxSens(range(1, 6), {})
        def search(query, n):
            maintenant[0] += 50  # chaque recherche « dure » 50 s
            return sens.search(query, n)
        bilan = export.add_neighbours(liste, search, budget=120, clock=lambda: maintenant[0])
        self.assertEqual(sens.appels, [1, 2, 3], "0 s, 50 s, 100 s : sous le budget ; 150 s : arrêt")
        self.assertTrue(bilan.out_of_time)
        self.assertEqual(bilan.pending, [h(4), h(5)])
        self.assertEqual(bilan.failures, 0)


class VoisinsPrecedentsTest(unittest.TestCase):
    REGLAGE = {"seuil": export.SEUIL_VOISINS, "max": export.MAX_VOISINS}

    def precedent(self, **racine):
        donnees = {"schema": 1, "voisins_reglage": dict(self.REGLAGE), "voisins_en_attente": [], "entrees": [
            {"id": h(1), "voisins": [v(2, 0.9)]},
            {"id": h(2), "voisins": [v(1, 0.9), "pas un objet", {"id": ["x"], "score": 0.9},
                                     {"id": h(3), "score": float("nan")}, {"id": h(3), "score": True},
                                     {"id": h(3), "score": "0.9"}]},
            {"id": h(3)},                      # pas de liste « voisins » : à chercher
            "pas une entrée",
        ]}
        donnees.update(racine)
        return donnees

    def test_reutilisables(self):
        connus, cherches = export.previous_neighbours(self.precedent(), self.REGLAGE)
        self.assertEqual(connus, {h(1): [v(2, 0.9)], h(2): [v(1, 0.9)]})
        self.assertEqual(cherches, {h(1), h(2)})

    def test_entrees_en_attente_a_chercher(self):
        connus, cherches = export.previous_neighbours(self.precedent(voisins_en_attente=[h(2), 7]), self.REGLAGE)
        self.assertIn(h(2), connus, "elle garde ses voisins en attendant")
        self.assertEqual(cherches, {h(1)})

    def test_recalcul_complet(self):
        for precedent in (None, "pas un objet", {"entrees": []}, self.precedent(voisins_reglage=None),
                          self.precedent(voisins_reglage={"seuil": 0.75, "max": 5}),
                          self.precedent(voisins_reglage={"seuil": export.SEUIL_VOISINS, "max": 8})):
            self.assertIsNone(export.previous_neighbours(precedent, self.REGLAGE), precedent)


class MiseAJourDesVoisinsTest(unittest.TestCase):
    """update_neighbours : ce que fait main() (réglage, entrées en attente, recalcul complet)."""
    def payload(self, n):
        brut = [memoire(i, f"Projet Alpha : entrée. Numéro {i}", ["alpha"], minute=i)
                for i in range(1, n + 1)]
        return export.build_payload(brut, config())[0]

    def sens(self, n):
        sens = FauxSens([], {})
        def search(query, n_results):
            i = int(query.split()[-1])
            sens.appels.append(i)
            return [(hash_de(j), 0.95 if abs(i - j) == 1 else 0.1) for j in range(1, n + 1) if j != i]
        sens.search = search
        return sens

    def test_premier_export_puis_rien_de_neuf(self):
        sens = self.sens(4)
        premier = self.payload(4)
        bilan = export.update_neighbours(premier, None, sens.search)
        self.assertTrue(bilan.full)
        self.assertEqual(sorted(sens.appels), [1, 2, 3, 4])
        self.assertEqual(premier["voisins_reglage"], {"seuil": export.SEUIL_VOISINS, "max": export.MAX_VOISINS})
        self.assertEqual(premier["voisins_en_attente"], [])
        premier["empreinte"] = export.fingerprint(premier)
        precedent = json.loads(json.dumps(premier))  # relu depuis data.json

        sens.appels.clear()
        second = self.payload(4)
        bilan = export.update_neighbours(second, precedent, sens.search)
        self.assertFalse(bilan.full)
        self.assertEqual(sens.appels, [], "aucune entrée nouvelle : aucune recherche")
        self.assertEqual(export.fingerprint(second), precedent["empreinte"], "« Contenu identique »")

    def test_une_entree_nouvelle(self):
        sens = self.sens(5)
        premier = self.payload(4)
        export.update_neighbours(premier, None, sens.search)
        sens.appels.clear()
        second = self.payload(5)
        export.update_neighbours(second, json.loads(json.dumps(premier)), sens.search)
        self.assertEqual(sens.appels, [5])
        quatre = next(e for e in second["entrees"] if e["id"] == hash_de(4))
        self.assertIn({"id": hash_de(5), "score": 0.95}, quatre["voisins"])

    def test_recalcul_force_ou_reglage_change(self):
        sens = self.sens(3)
        premier = self.payload(3)
        export.update_neighbours(premier, None, sens.search)
        for precedent, force in ((premier, True), (dict(premier, voisins_reglage={"seuil": 0.75, "max": 5}), False)):
            sens.appels.clear()
            bilan = export.update_neighbours(self.payload(3), json.loads(json.dumps(precedent)), sens.search,
                                             recompute=force)
            self.assertTrue(bilan.full)
            self.assertEqual(sorted(sens.appels), [1, 2, 3])

    def test_dry_run(self):
        sens = self.sens(3)
        bilan = export.update_neighbours(self.payload(3), None, sens.search, allow_search=False)
        self.assertEqual(sens.appels, [])
        self.assertEqual((bilan.full, bilan.searches, len(bilan.pending)), (True, 0, 3))


class DelaiDesRecherchesTest(unittest.TestCase):
    def test_search_demande_dix_secondes(self):
        api = export.Api({"api_url": "http://127.0.0.1:1", "api_key": "", "cf_client_id": "",
                          "cf_client_secret": "", "local": True})
        appels = []
        api.request = lambda *args, **kwargs: appels.append(kwargs) or {"results": []}
        api.search("texte", 8)
        self.assertEqual(appels[0]["timeout"], export.SEARCH_TIMEOUT)
        self.assertEqual(export.SEARCH_TIMEOUT, 10)
        self.assertEqual(appels[0]["retries"], 1)

    def test_request_transmet_le_delai(self):
        api = export.Api({"api_url": "http://127.0.0.1:1", "api_key": "", "cf_client_id": "",
                          "cf_client_secret": "", "local": True})
        delais = []
        def ouvrir(requete, timeout):
            delais.append(timeout)
            raise OSError("refusé")
        with mock.patch.object(export._OPENER, "open", ouvrir):
            with self.assertRaises(export.ExportError):
                api.request("GET", "/x", retries=1, timeout=7)
            with self.assertRaises(export.ExportError):
                api.request("GET", "/x", retries=1)
        self.assertEqual(delais, [7, export.HTTP_TIMEOUT])


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
            {"memory": {"content_hash": hash_de(1)}, "similarity_score": 0.9},
            {"memory": {"content_hash": hash_de(2)}, "similarity_score": 0.5},
        ]})
        self.assertEqual(api.search("texte", 5), [(hash_de(1), 0.9), (hash_de(2), 0.5)])

    def test_elements_mal_formes_ignores(self):
        api = self._api({"results": [
            "pas un objet",
            42,
            {"memory": "pas un objet non plus"},
            {"similarity_score": 0.8},                # pas de "memory" du tout
            {"memory": {}},                            # pas de content_hash
            {"memory": {"content_hash": hash_de(3)}, "similarity_score": "pas un nombre"},
            {"memory": {"content_hash": hash_de(4)}, "similarity_score": 0.7},
        ]})
        self.assertEqual(api.search("texte", 5), [(hash_de(4), 0.7)])

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
            {"memory": {"content_hash": hash_de(5)}, "similarity_score": 0.9},
        ]})
        self.assertEqual(api.search("texte", 5), [(hash_de(5), 0.9)])

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

    def test_erreur_serveur_au_corps_tronque(self):  # IncompleteRead pendant err.read() d'une HTTP 500
        self.serveur.reponse = (b"HTTP/1.1 500 Internal Server Error\r\nContent-Type: text/plain\r\n"
                                b"Content-Length: 100\r\nConnection: close\r\n\r\nbase verrou")
        with self.assertRaises(export.ExportError) as ctx:
            self.api.request("GET", "/api/memories", retries=1)
        self.assertIn("HTTP 500", str(ctx.exception))

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
            bilan = export.add_neighbours(liste, search)
            self.assertEqual((bilan.linked, bilan.failures), (0, 2), repr(erreur))
            self.assertTrue(all(e["voisins"] == [] for e in liste))

    def test_resultats_mal_formes_d_une_recherche_maison(self):
        liste = entrees(2)
        def search(query, n):
            return [("un seul élément",)]  # ne se déballe pas en (hash, score)
        bilan = export.add_neighbours(liste, search)
        self.assertEqual((bilan.linked, bilan.failures), (0, 2))


class ValeursNonFiniesTest(unittest.TestCase):
    def test_voisin_nan_ou_infini_ecarte(self):
        liste = entrees(4)
        def search(query, n):
            return [(hash_de(2), float("nan")), (hash_de(3), float("inf")), (hash_de(4), 0.9)]
        export.add_neighbours(liste, search)
        for entree in liste:
            for voisin in entree["voisins"]:
                self.assertTrue(math.isfinite(voisin["score"]), entree["voisins"])
        self.assertEqual([v["id"] for v in liste[0]["voisins"]], [hash_de(4)])

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
