"""
Page d'admin locale (scripts/admin.py) : validation des réglages, format des
fichiers écrits, serveur (sécurité, API), aperçu et publication. Aucune donnée
réelle modifiée, aucun accès au réseau extérieur ni au vrai dépôt distant.
"""
import hashlib
import http.client
import json
import os
import shutil
import socket
import subprocess
import tempfile
import threading
import time
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from unittest import mock
from urllib.parse import parse_qs, urlparse

from tests.aides import RACINE, export, memoire

import admin  # noqa: E402  (scripts/ est ajouté au chemin par tests.aides)


def projets(**changements):
    """Réglages des projets valides ; changements remplace des clés de la racine."""
    reglages = {
        "_aide": "Mode d'emploi.",
        "version": 2,
        "familles": [{"id": "jeux", "nom": "Jeux", "couleur": 1}, {"id": "outils", "nom": "Outils", "couleur": 4}],
        "projets": {"depths": {"nom": "Depths", "famille": "jeux", "alias": ["rogue-lite"]}},
        "tags_generiques": ["python"],
        "tags_exclus": [],
    }
    reglages.update(changements)
    return reglages


def un_projet(**reglage):
    return projets(projets={"depths": reglage})


class ValidationProjetsTest(unittest.TestCase):
    def erreurs(self, donnees):
        return admin.valider("projets", donnees)

    def test_reglages_valides(self):
        self.assertEqual(self.erreurs(projets()), [])
        self.assertEqual(self.erreurs(un_projet(nom=None, famille=None, description=None, lien_principal=None)), [])

    def test_couleur_entier_de_1_a_6(self):
        for couleur in ("3", 0, 7, 2.5, True, None):
            with self.subTest(couleur=couleur):
                familles = [{"id": "jeux", "nom": "Jeux", "couleur": couleur}]
                self.assertEqual(self.erreurs(projets(familles=familles, projets={})),
                                 ["Famille « jeux » : la couleur doit être un nombre entier de 1 à 6."])

    def test_famille_identifiant_nom_doublon(self):
        familles = [{"id": "Jeux Vidéo", "nom": "Jeux", "couleur": 1}, {"id": "a", "nom": " ", "couleur": 2},
                    {"id": "a", "nom": "A", "couleur": 3}, "b"]
        self.assertEqual(self.erreurs(projets(familles=familles, projets={})), [
            "Famille n° 1 : identifiant invalide (minuscules, chiffres et tirets seulement).",
            "Famille « a », nom : texte attendu (non vide).",
            "Famille n° 3 : identifiant « a » en double.",
            "Famille n° 4 : un objet est attendu.",
        ])

    def test_projet_famille_inconnue_et_cle_inconnue(self):
        self.assertEqual(self.erreurs(un_projet(famille="sport", couleur=2)), [
            "Projet « depths » : clé inconnue « couleur ».",
            "Projet « depths » : famille « sport » inconnue.",
        ])

    def test_identifiant_de_projet(self):
        self.assertEqual(self.erreurs(projets(projets={"Mon Projet": {}})),
                         ["Projet « Mon Projet » : identifiant invalide (minuscules, chiffres et tirets seulement)."])

    def test_listes_de_tags(self):
        self.assertEqual(self.erreurs(projets(tags_exclus="perso", tags_generiques=["ok", 3, ""])), [
            "tags_generiques : une liste de tags (textes non vides) est attendue.",
            "tags_exclus : une liste de tags (textes non vides) est attendue.",
        ])
        self.assertEqual(self.erreurs(un_projet(alias="rogue-lite")),
                         ["Projet « depths », alias : une liste de tags (textes non vides) est attendue."])

    def test_alias_en_double(self):
        self.assertEqual(self.erreurs(un_projet(alias=["rogue-lite", "Rogue Lite"])),
                         ["Projet « depths », alias : « Rogue Lite » est en double."])

    def test_identifiant_avec_retour_a_la_ligne_final(self):
        familles = [{"id": "jeux\n", "nom": "Jeux", "couleur": 1}]
        self.assertEqual(self.erreurs(projets(familles=familles, projets={"depths\n": {}})), [
            "Famille n° 1 : identifiant invalide (minuscules, chiffres et tirets seulement).",
            "Projet « depths\n » : identifiant invalide (minuscules, chiffres et tirets seulement).",
        ])

    def test_alias_en_conflit(self):
        reglages = projets(projets={"depths": {"alias": ["rogue-lite", "depths"]}, "nova": {"alias": ["Rogue Lite"]},
                                    "rogue-lite": {"nom": "Rogue"}})
        self.assertEqual(self.erreurs(reglages), [
            "Projet « depths », alias : « depths » est l'identifiant du projet lui-même.",
            "Projet « nova », alias : « Rogue Lite » est déjà rattaché au projet « depths ».",
            "Projet « rogue-lite » : c'est aussi un alias de « depths » (projet fusionné) ; ses réglages seraient ignorés.",
        ])

    def test_lien_principal_refuse_avec_explication(self):
        cas = {
            "http://192.168.1.10:8080/": "adresse locale : le site public ne pourrait pas l'ouvrir "
                                         "(localhost, adresse privée, nom de machine)",
            "exemple.fr": "adresse invalide : une adresse web complète est attendue, par exemple https://exemple.fr",
            "https://noah:motdepasse1@exemple.fr/": "contient un secret ou des identifiants "
                                                   "(utilisateur:mot de passe@) ; les retirer",
            "https://noah@exemple.fr/": "contient un secret ou des identifiants (utilisateur:mot de passe@) ; les retirer",
            "https://exemple.fr/?token=ghp_" + "a" * 36: "contient un secret ou des identifiants "
                                                        "(utilisateur:mot de passe@) ; les retirer",
            "": "adresse web attendue (ou rien, pour le calcul automatique)",
        }
        for lien, message in cas.items():
            with self.subTest(lien=lien):
                self.assertEqual(self.erreurs(un_projet(lien_principal=lien)),
                                 [f"Projet « depths », lien principal : {message}."])
        self.assertEqual(self.erreurs(un_projet(lien_principal="https://exemple.github.io/depths/")), [])

    def test_textes_publics_sans_secret(self):
        secret = "Clé : sk-ant-" + "x" * 30
        self.assertEqual(self.erreurs(un_projet(nom=secret, description="api_key=abc123456789")), [
            "Projet « depths », nom : ressemble à un secret (clé, jeton ou mot de passe) ; "
            "ce texte serait publié sur le site.",
            "Projet « depths », description : ressemble à un secret (clé, jeton ou mot de passe) ; "
            "ce texte serait publié sur le site.",
        ])
        familles = [{"id": "jeux", "nom": "ghp_" + "b" * 36, "couleur": 1}]
        self.assertEqual(self.erreurs(projets(familles=familles, projets={})), [
            "Famille « jeux », nom : ressemble à un secret (clé, jeton ou mot de passe) ; "
            "ce texte serait publié sur le site."])

    def test_alias_tags_et_commentaires_sans_secret(self):
        # Pas affichés sur le site, mais config/projets.json est commité dans le dépôt public.
        jeton = "ghp_" + "a" * 36
        reglages = projets(_aide=f"Jeton : {jeton}", projets={"depths": {"alias": [jeton]}}, tags_exclus=[jeton])
        self.assertEqual(self.erreurs(reglages), [
            "Projet « depths », alias : un tag ressemble à un secret (clé, jeton ou mot de passe) ; "
            "ce fichier est publié avec le dépôt.",
            "tags_exclus : un tag ressemble à un secret (clé, jeton ou mot de passe) ; ce fichier est publié avec le dépôt.",
            "Commentaire « _aide » : ressemble à un secret (clé, jeton ou mot de passe) ; "
            "ce fichier est publié avec le dépôt.",
        ])

    def test_secret_ailleurs_dans_le_fichier(self):
        # Filet : aucun champ ne vérifie l'identifiant d'un projet, mais le fichier entier est publié.
        self.assertEqual(self.erreurs(projets(projets={"sk-ant-" + "a" * 24: {}})), [
            "Réglages des projets : un texte ressemble à un secret (clé, jeton ou mot de passe) ; "
            "ce fichier est publié avec le dépôt."])

    def test_vraie_cle_du_dashboard_refusee(self):
        erreurs = admin.valider("projets", un_projet(description="la clé est cle-tres-privee"),
                                connus=("cle-tres-privee",))
        self.assertEqual(len(erreurs), 1)
        self.assertIn("ressemble à un secret", erreurs[0])

    def test_racine(self):
        self.assertEqual(admin.valider("projets", []), ["Les réglages doivent être un objet JSON."])
        self.assertEqual(self.erreurs(projets(version=1, extra=True)), [
            "Réglages des projets : clé inconnue « extra ».",
            "Réglages des projets : « version » doit valoir 2.",
        ])


class ValidationEntreesTest(unittest.TestCase):
    def erreurs(self, donnees):
        return admin.valider("entrees", donnees)

    def test_corrections_valides(self):
        self.assertEqual(self.erreurs({"_aide": "…", "a713bd8e2800": {"titre": "Titre", "resume": "Résumé.",
                                                                        "masquer": False}}), [])

    def test_masquer_vrai_booleen(self):
        # « "false" » entre guillemets masquerait l'entrée : l'export teste sa vérité.
        self.assertEqual(self.erreurs({"a713bd8e2800": {"masquer": "false"}}),
                         ["Entrée a713bd8e2800 : « masquer » doit valoir true ou false (sans guillemets)."])

    def test_correction_objet(self):
        self.assertEqual(self.erreurs({"a713bd8e2800": True}),
                         ['Entrée a713bd8e2800 : la correction doit être un objet, par exemple { "masquer": true }.'])

    def test_identifiant_court_et_cles(self):
        self.assertEqual(self.erreurs({"A713BD8E2800": {}, "a713bd8e2800": {"titre": "", "note": "x"}}), [
            "Entrée A713BD8E2800 : identifiant court attendu (les 12 premiers caractères, 0-9 et a-f, "
            "de l'identifiant de l'entrée).",
            "Entrée a713bd8e2800 : clé inconnue « note ».",
            "Entrée a713bd8e2800, titre : texte attendu (non vide).",
        ])

    def test_identifiant_court_avec_retour_a_la_ligne_final(self):
        self.assertEqual(self.erreurs({"a713bd8e2800\n": {"masquer": True}}), [
            "Entrée a713bd8e2800\n : identifiant court attendu (les 12 premiers caractères, 0-9 et a-f, "
            "de l'identifiant de l'entrée)."])

    def test_titre_et_resume_sans_secret(self):
        erreurs = self.erreurs({"a713bd8e2800": {"titre": "mot de passe : Azerty123", "resume": "Bearer " + "c" * 20}})
        self.assertEqual(erreurs, [
            "Entrée a713bd8e2800, titre : ressemble à un secret (clé, jeton ou mot de passe) ; "
            "ce texte serait publié sur le site.",
            "Entrée a713bd8e2800, résumé : ressemble à un secret (clé, jeton ou mot de passe) ; "
            "ce texte serait publié sur le site.",
        ])


class ValidationRechercheTest(unittest.TestCase):
    def erreurs(self, donnees):
        return admin.valider("recherche", donnees)

    def test_synonymes_valides(self):
        self.assertEqual(self.erreurs({"_aide": "…", "synonymes": [["ia", "intelligence artificielle"]]}), [])

    def test_groupes(self):
        self.assertEqual(self.erreurs({"synonymes": [["ia"], ["Local", "local"], "jeu", ["site", 3, " "]]}), [
            "Synonymes, groupe n° 1 : au moins deux termes différents sont nécessaires.",
            "Synonymes, groupe n° 2 : au moins deux termes différents sont nécessaires.",
            "Synonymes, groupe n° 3 : une liste de termes est attendue.",
            "Synonymes, groupe n° 4 : terme vide ou qui n'est pas du texte.",
            "Synonymes, groupe n° 4 : terme vide ou qui n'est pas du texte.",
            "Synonymes, groupe n° 4 : au moins deux termes différents sont nécessaires.",
        ])

    def test_synonyme_secret(self):
        self.assertEqual(self.erreurs({"synonymes": [["jeton", "xoxb-" + "1" * 12]]}), [
            "Synonymes, groupe n° 1 : ressemble à un secret (clé, jeton ou mot de passe) ; "
            "ce texte serait publié sur le site."])

    def test_racine(self):
        self.assertEqual(self.erreurs({"synonymes": {}, "autre": 1}), [
            "Réglages de la recherche : clé inconnue « autre ».",
            "Synonymes : une liste de groupes est attendue.",
        ])


class FormatTest(unittest.TestCase):
    def test_un_element_par_ligne(self):
        texte = admin.formater(projets())
        self.assertEqual(texte, "\n".join([
            "{",
            '  "_aide": "Mode d\'emploi.",',
            '  "version": 2,',
            '  "familles": [',
            '    { "id": "jeux", "nom": "Jeux", "couleur": 1 },',
            '    { "id": "outils", "nom": "Outils", "couleur": 4 }',
            "  ],",
            '  "projets": {',
            '    "depths": { "nom": "Depths", "famille": "jeux", "alias": ["rogue-lite"] }',
            "  },",
            '  "tags_generiques": ["python"],',
            '  "tags_exclus": []',
            "}",
            "",
        ]))

    def test_une_correction_par_ligne(self):
        corrections = {"_aide": "Corrections.", "a713bd8e2800": {"titre": "Titre", "masquer": True},
                       "b0c1d2e3f4a5": {"masquer": True}}
        self.assertEqual(admin.formater(corrections), "\n".join([
            "{",
            '  "_aide": "Corrections.",',
            '  "a713bd8e2800": { "titre": "Titre", "masquer": true },',
            '  "b0c1d2e3f4a5": { "masquer": true }',
            "}",
            "",
        ]))

    def test_aller_retour_sur_les_vrais_reglages(self):
        for nom, chemin in admin.FICHIERS.items():
            with self.subTest(nom=nom):
                donnees = json.loads((RACINE / chemin).read_text(encoding="utf-8"))
                self.assertEqual(json.loads(admin.formater(donnees)), donnees)

    def test_objets_vides_et_accents(self):
        self.assertEqual(admin.formater({"a": {}, "b": [], "c": "é"}), '{\n  "a": {},\n  "b": [],\n  "c": "é"\n}\n')


class LectureTest(unittest.TestCase):
    def setUp(self):
        self.dossier = tempfile.TemporaryDirectory()
        self.racine = Path(self.dossier.name)
        (self.racine / "config").mkdir()

    def tearDown(self):
        self.dossier.cleanup()

    def ecrire(self, nom, texte):
        (self.racine / "config" / nom).write_text(texte, encoding="utf-8")

    def test_fichiers_absents(self):
        self.assertEqual(admin.lire_config(self.racine, "projets"),
                         {"version": 2, "familles": [], "projets": {}, "tags_generiques": [], "tags_exclus": []})
        self.assertEqual(admin.lire_config(self.racine, "entrees"), {})
        self.assertEqual(admin.lire_config(self.racine, "recherche"), {"synonymes": []})

    def test_v1_convertie_en_v2(self):
        self.ecrire("projets.json", json.dumps({"_aide": "v1", "alias": {"rogue-lite": "depths"},
                                                "noms": {"depths": "Depths"}, "tags_exclus": ["perso"]}))
        notes = []
        self.assertEqual(admin.lire_config(self.racine, "projets", notes), {
            "_aide": "v1", "version": 2, "familles": [],
            "projets": {"depths": {"nom": "Depths", "alias": ["rogue-lite"]}},
            "tags_generiques": [], "tags_exclus": ["perso"]})
        self.assertEqual(notes, ["config/projets.json : réglages en version 1, lus et convertis en version 2."])

    def test_formes_tolerees_par_l_export_ramenees(self):
        self.ecrire("projets.json", json.dumps({
            "version": 2, "familles": [{"id": "jeux", "nom": "Jeux", "couleur": "3"}],
            "projets": {"depths": {"alias": "rogue-lite"}, "nova": {"alias": None, "famille": "jeux"}},
            "tags_generiques": "python", "tags_exclus": None}))
        notes = []
        reglages = admin.lire_config(self.racine, "projets", notes)
        self.assertEqual(reglages, {
            "version": 2, "familles": [{"id": "jeux", "nom": "Jeux", "couleur": 3}],
            "projets": {"depths": {"alias": ["rogue-lite"]}, "nova": {"famille": "jeux"}},
            "tags_generiques": ["python"], "tags_exclus": []})
        self.assertEqual(notes, [
            "config/projets.json : « tags_generiques » est un texte seul, lu comme une liste d'un tag.",
            "config/projets.json : « tags_exclus » vaut null, lu comme une liste vide.",
            'config/projets.json, famille n° 1 : couleur "3" entre guillemets, lue comme le nombre 3.',
            "config/projets.json, projet « depths » : alias écrit comme un texte seul, lu comme une liste d'un alias.",
            "config/projets.json, projet « nova » : alias null, retiré.",
        ])
        self.assertEqual(admin.valider("projets", reglages), [], "la page peut enregistrer")

    def test_masquer_lu_comme_l_export(self):
        # « "false" » entre guillemets est vrai pour l'export : l'entrée est masquée.
        brutes = [memoire(5, "Voxelcraft — un jeu de cubes.", ["voxelcraft"])]
        payload, _ = export.build_payload(brutes, export.normalize_projects_config({}), (),
                                          {"000000000005": {"masquer": "false"}})
        self.assertEqual(payload["entrees"], [], "l'export masque l'entrée")
        self.ecrire("entrees.json", json.dumps({"000000000005": {"masquer": "false"},
                                                "000000000006": {"masquer": 0, "titre": "Titre"}}))
        notes = []
        self.assertEqual(admin.lire_config(self.racine, "entrees", notes), {
            "000000000005": {"masquer": True}, "000000000006": {"masquer": False, "titre": "Titre"}})
        self.assertEqual(notes, [
            'config/entrees.json, entrée 000000000005 : « masquer » vaut "false" (ni true ni false) ; '
            "pour l'export l'entrée est masquée, la page l'écrit true.",
            "config/entrees.json, entrée 000000000006 : « masquer » vaut 0 (ni true ni false) ; "
            "pour l'export l'entrée est affichée, la page l'écrit false.",
        ])

    def test_fichier_illisible(self):
        self.ecrire("recherche.json", "{ oups")
        with self.assertRaises(admin.ErreurAdmin) as contexte:
            admin.lire_config(self.racine, "recherche")
        self.assertIn("config/recherche.json est illisible", str(contexte.exception))
        self.ecrire("entrees.json", "[]")
        with self.assertRaises(admin.ErreurAdmin):
            admin.lire_config(self.racine, "entrees")


class OriginauxTest(unittest.TestCase):
    def test_titre_calcule_meme_si_corrige(self):
        brutes = [memoire(1, "Jarvis — architecture : pipeline vocal local. Trois étages.", ["jarvis"])]
        payload, _ = export.build_payload(brutes, export.normalize_projects_config({}), (),
                                          {"000000000001": {"titre": "Titre corrigé"}})
        self.assertEqual(payload["entrees"][0]["titre"], "Titre corrigé")
        self.assertEqual(admin.originaux(payload), {
            "000000000001": {"titre": "Jarvis — architecture", "resume": "Pipeline vocal local. Trois étages."}})
        self.assertEqual(admin.originaux(None), {})
        self.assertEqual(admin.originaux({"entrees": [None, {"id": 3}]}), {})


class ConfigReelleTest(unittest.TestCase):
    """Les réglages et les données du dépôt passent la validation de l'admin :
    la page s'ouvre et enregistre sans erreur sur l'état réel."""

    def test_reglages_reels_valides(self):
        for nom in admin.FICHIERS:
            with self.subTest(nom=nom):
                notes = []
                self.assertEqual(admin.valider(nom, admin.lire_config(RACINE, nom, notes)), [])
                self.assertEqual(notes, [], "déjà sous la forme que la page écrit")

    def test_originaux_identiques_aux_titres_publies_non_corriges(self):
        donnees = json.loads((RACINE / "docs" / "data.json").read_text(encoding="utf-8"))
        originaux = admin.originaux(donnees)
        for entree in donnees["entrees"]:
            if not entree.get("corrige"):
                self.assertEqual(originaux[entree["id"][:12]], {"titre": entree["titre"], "resume": entree["resume"]})


JETON = "jeton-de-test-0123456789"
CLE_ENV = "cle-secrete-du-test"


def empreinte_de(chemin):
    """Empreinte d'un fichier telle que GET /api/etat la donne ("" s'il n'existe pas)."""
    return hashlib.sha256(chemin.read_bytes()).hexdigest() if chemin.is_file() else ""


class Client:
    """Requêtes HTTP brutes vers le serveur d'admin : en-têtes Host, Origin et
    jeton choisis par le test (urllib les imposerait)."""

    def __init__(self, port):
        self.port = port

    def __call__(self, methode, chemin, corps=None, jeton=JETON, hote=None, type_="application/json", entetes=None,
                 base=None):
        tout = {"Host": hote or f"127.0.0.1:{self.port}"}
        if jeton is not None:
            tout["X-Admin-Jeton"] = jeton
        if base is not None:
            tout["X-Admin-Base"] = base  # empreinte du fichier sur lequel la modification a été faite
        donnees = None
        if corps is not None:
            donnees = corps if isinstance(corps, bytes) else json.dumps(corps).encode("utf-8")
            tout["Content-Type"] = type_
        tout.update(entetes or {})
        connexion = http.client.HTTPConnection("127.0.0.1", self.port, timeout=60)
        try:
            connexion.request(methode, chemin, body=donnees, headers=tout)
            reponse = connexion.getresponse()
            brut = reponse.read()
            return reponse.status, {k.lower(): v for k, v in reponse.getheaders()}, brut
        finally:
            connexion.close()

    def json(self, *args, **kwargs):
        statut, _, brut = self(*args, **kwargs)
        return statut, json.loads(brut.decode("utf-8"))


def demarrer(racine, **options):
    serveur = admin.creer_serveur(racine, JETON, port=0, journal=lambda message: None, **options)
    threading.Thread(target=serveur.serve_forever, daemon=True).start()
    return serveur


class ServeurTest(unittest.TestCase):
    """Serveur réel sur un port libre, dans un dossier temporaire (hors de tout dépôt git)."""

    @classmethod
    def setUpClass(cls):
        cls.dossier = tempfile.TemporaryDirectory()
        cls.racine = Path(cls.dossier.name)
        for sous in ("docs", "admin", "config"):
            (cls.racine / sous).mkdir()
        (cls.racine / "docs" / "index.html").write_text("<!DOCTYPE html><title>site</title>", encoding="utf-8")
        (cls.racine / "admin" / "index.html").write_text("<!DOCTYPE html><title>admin</title>", encoding="utf-8")
        brutes = [memoire(1, "Jarvis — architecture : pipeline vocal local. Trois étages.", ["jarvis"])]
        payload, _ = export.build_payload(brutes, export.normalize_projects_config({}))
        (cls.racine / "docs" / "data.json").write_text(json.dumps(payload), encoding="utf-8")
        (cls.racine / ".env").write_text(f"MEMOIRE_API_KEY={CLE_ENV}\n", encoding="utf-8")
        cls.serveur = demarrer(cls.racine)
        cls.client = Client(cls.serveur.server_address[1])

    @classmethod
    def tearDownClass(cls):
        cls.serveur.shutdown()
        cls.serveur.server_close()
        cls.dossier.cleanup()

    def setUp(self):
        self.projets = self.racine / "config" / "projets.json"
        self.projets.write_text(admin.formater(projets()), encoding="utf-8")
        self.avant = self.projets.read_bytes()

    def test_jeton_absent_ou_faux_refuse(self):
        for jeton in (None, "", "faux", JETON + "x"):
            with self.subTest(jeton=jeton):
                statut, corps = self.client.json("GET", "/api/etat", jeton=jeton)
                self.assertEqual(statut, 403)
                self.assertIn("Jeton absent ou refusé", corps["erreur"])
        statut, _ = self.client.json("PUT", "/api/config/projets", projets(), jeton=None)
        self.assertEqual(statut, 403)
        self.assertEqual(self.projets.read_bytes(), self.avant)

    def test_host_etranger_refuse(self):
        port = self.serveur.server_address[1]
        for hote in ("evil.example", f"evil.example:{port}", "127.0.0.1:1", f"127.0.0.1.evil.example:{port}"):
            with self.subTest(hote=hote):
                self.assertEqual(self.client("GET", "/api/etat", hote=hote)[0], 403)
                self.assertEqual(self.client("GET", "/", hote=hote)[0], 403)
        self.assertEqual(self.client("GET", "/api/etat", hote=f"localhost:{port}")[0], 200)

    def test_origin_different_refuse(self):
        port = self.serveur.server_address[1]
        for origine in ("http://evil.example", f"http://localhost:{port}", "null", f"https://127.0.0.1:{port}"):
            with self.subTest(origine=origine):
                statut, _ = self.client.json("PUT", "/api/config/projets", projets(), entetes={"Origin": origine})
                self.assertEqual(statut, 403)
        self.assertEqual(self.projets.read_bytes(), self.avant)
        statut, _ = self.client.json("PUT", "/api/config/projets", projets(),
                                     entetes={"Origin": f"http://127.0.0.1:{port}"}, base=empreinte_de(self.projets))
        self.assertEqual(statut, 200)

    def test_ecriture_json_seulement(self):
        for type_ in ("text/plain", "application/x-www-form-urlencoded", "multipart/form-data; boundary=x", ""):
            with self.subTest(type_=type_):
                statut, corps = self.client.json("PUT", "/api/config/projets", b"{}", type_=type_)
                self.assertEqual(statut, 415)
                self.assertIn("que du JSON", corps["erreur"])
        self.assertEqual(self.projets.read_bytes(), self.avant)
        statut, _ = self.client.json("PUT", "/api/config/projets", b"{ pas du json", type_="application/json")
        self.assertEqual(statut, 400)

    def test_fichier_hors_liste(self):
        for chemin in ("/api/config/autre", "/api/config/../../.env", "/api/config/projets.json", "/api/config/"):
            with self.subTest(chemin=chemin):
                self.assertEqual(self.client("PUT", chemin, {"a": 1})[0], 404)
        self.assertEqual(self.client("GET", "/api/config/projets")[0], 404)
        self.assertEqual(self.client("POST", "/api/inconnu", {})[0], 404)
        self.assertFalse((self.racine / "config" / "autre").exists())

    def test_ecriture_atomique(self):
        nouveau = projets(projets={"depths": {"nom": "Depths II", "famille": "jeux"}})
        statut, corps = self.client.json("PUT", "/api/config/projets", nouveau, base=empreinte_de(self.projets))
        self.assertEqual((statut, corps), (200, {"ok": True, "fichier": "config/projets.json",
                                                 "empreinte": empreinte_de(self.projets)}))
        self.assertEqual(self.projets.read_text(encoding="utf-8"), admin.formater(nouveau))
        self.assertNotIn(b"\r\n", self.projets.read_bytes())
        avant = self.projets.read_bytes()
        with mock.patch.object(admin.os, "replace", side_effect=OSError("disque plein")):
            statut, corps = self.client.json("PUT", "/api/config/projets", projets(), base=empreinte_de(self.projets))
        self.assertEqual(statut, 500)
        self.assertIn("rien n'a été modifié", corps["erreur"])
        self.assertEqual(self.projets.read_bytes(), avant, "l'ancien fichier reste intact")
        self.assertEqual(sorted(p.name for p in (self.racine / "config").iterdir()), ["projets.json"],
                         "aucun fichier temporaire laissé")

    def test_remplacement_reessaye_si_windows_le_refuse_un_instant(self):
        vrai, essais = os.replace, []

        def replace(*args):
            essais.append(args)
            if len(essais) <= 2:
                raise PermissionError(13, "fichier lu par un autre programme")
            return vrai(*args)

        with mock.patch.object(admin.os, "replace", side_effect=replace):
            statut, corps = self.client.json("PUT", "/api/config/projets", un_projet(nom="Depths II"),
                                             base=empreinte_de(self.projets))
        self.assertEqual((statut, len(essais)), (200, 3), corps)
        self.assertEqual(json.loads(self.projets.read_text(encoding="utf-8"))["projets"], {"depths": {"nom": "Depths II"}})

    def test_fichier_modifie_ailleurs_jamais_ecrase(self):
        base = empreinte_de(self.projets)
        with open(self.projets, "a", encoding="utf-8") as fichier:
            fichier.write("\n")  # modifié à la main, ou dans un autre onglet, depuis l'ouverture de la page
        modifie = self.projets.read_bytes()
        statut, corps = self.client.json("PUT", "/api/config/projets", un_projet(nom="Depths II"), base=base)
        self.assertEqual(statut, 409)
        self.assertEqual(corps["erreur"], "config/projets.json a changé depuis l'ouverture de la page (modifié à la "
                                          "main ou dans un autre onglet) : rien n'a été enregistré. Recharger la page "
                                          "pour repartir du fichier actuel (les modifications non enregistrées de la "
                                          "page seront perdues).")
        self.assertEqual(self.projets.read_bytes(), modifie, "rien n'est écrasé")
        statut, corps = self.client.json("PUT", "/api/config/projets", un_projet(nom="Depths II"),
                                         base=empreinte_de(self.projets))
        self.assertEqual(statut, 200)
        self.assertEqual(corps["empreinte"], empreinte_de(self.projets))
        statut, corps = self.client.json("PUT", "/api/config/projets", un_projet(nom="Depths III"))
        self.assertEqual(statut, 428)
        self.assertIn("X-Admin-Base", corps["erreur"])
        entrees = self.racine / "config" / "entrees.json"
        try:
            statut, _ = self.client.json("PUT", "/api/config/entrees", {"a713bd8e2800": {"masquer": True}}, base="")
            self.assertEqual(statut, 200, "fichier absent : empreinte vide")
        finally:
            entrees.unlink(missing_ok=True)

    def test_validation_refusee_rien_ecrit(self):
        statut, corps = self.client.json("PUT", "/api/config/projets",
                                         projets(familles=[{"id": "jeux", "nom": "Jeux", "couleur": "3"}], projets={}))
        self.assertEqual(statut, 422)
        self.assertEqual(corps["erreur"], "Réglages refusés : rien n'a été enregistré.")
        self.assertEqual(corps["erreurs"], ["Famille « jeux » : la couleur doit être un nombre entier de 1 à 6."])
        self.assertEqual(self.projets.read_bytes(), self.avant)

    def test_secret_refuse_et_cle_jamais_renvoyee(self):
        statut, corps = self.client.json("PUT", "/api/config/entrees",
                                         {"a713bd8e2800": {"titre": f"La clé {CLE_ENV} du dashboard"}})
        self.assertEqual(statut, 422)
        self.assertIn("ressemble à un secret", corps["erreurs"][0])
        self.assertFalse((self.racine / "config" / "entrees.json").exists())
        statut, _, brut = self.client("GET", "/api/etat")
        self.assertEqual(statut, 200)
        self.assertNotIn(CLE_ENV.encode(), brut)
        self.assertEqual(self.client("GET", "/.env")[0], 404)

    def test_etat(self):
        statut, corps = self.client.json("GET", "/api/etat")
        self.assertEqual(statut, 200)
        self.assertEqual(corps["fichiers"]["projets"], projets())
        self.assertEqual(corps["fichiers"]["entrees"], {})
        self.assertEqual(corps["fichiers"]["recherche"], {"synonymes": []})
        self.assertEqual(corps["donnees"]["nb_entrees"], 1)
        self.assertEqual(corps["originaux"], {"000000000001": {"titre": "Jarvis — architecture",
                                                              "resume": "Pipeline vocal local. Trois étages."}})
        self.assertIsNone(corps["git"], "dossier temporaire hors de tout dépôt git")
        self.assertEqual(corps["empreintes"], {"projets": empreinte_de(self.projets), "entrees": "", "recherche": ""})
        self.assertEqual((corps["normalisations"], corps["erreurs"]), ({}, {}))

    def test_etat_signale_formes_tolerees_et_reglages_invalides(self):
        entrees = self.racine / "config" / "entrees.json"
        entrees.write_text(json.dumps({"000000000001": {"masquer": "false"}}), encoding="utf-8")
        self.projets.write_text(json.dumps(un_projet(description="clé sk-ant-" + "x" * 30)), encoding="utf-8")
        try:
            statut, corps = self.client.json("GET", "/api/etat")
        finally:
            entrees.unlink()
        self.assertEqual(statut, 200)
        self.assertEqual(corps["fichiers"]["entrees"], {"000000000001": {"masquer": True}})
        self.assertEqual(corps["normalisations"], {"entrees": [
            'config/entrees.json, entrée 000000000001 : « masquer » vaut "false" (ni true ni false) ; '
            "pour l'export l'entrée est masquée, la page l'écrit true."]})
        self.assertEqual(corps["erreurs"], {"projets": [
            "Projet « depths », description : ressemble à un secret (clé, jeton ou mot de passe) ; "
            "ce texte serait publié sur le site."]})

    def test_fichiers_statiques_et_entetes(self):
        statut, entetes, brut = self.client("GET", "/")
        self.assertEqual((statut, brut), (200, b"<!DOCTYPE html><title>site</title>"))
        self.assertTrue(entetes["content-type"].startswith("text/html"))
        self.assertIn("frame-ancestors 'none'", entetes["content-security-policy"])
        self.assertEqual(entetes["x-frame-options"], "DENY")
        self.assertEqual(entetes["cache-control"], "no-store")
        self.assertEqual(self.client("GET", "/admin/")[2], b"<!DOCTYPE html><title>admin</title>")
        statut, entetes, _ = self.client("GET", "/admin")
        self.assertEqual((statut, entetes["location"]), (301, "/admin/"))
        statut, entetes, _ = self.client("GET", "/data.json")
        self.assertEqual(statut, 200)
        self.assertTrue(entetes["content-type"].startswith("application/json"))
        for chemin in ("/.env", "/../.env", "/%2e%2e/.env", "/admin/..%2f..%2f.env", "/admin/../config/projets.json",
                       "/..\\.env", "/%00", "/absent.js", "/config/projets.json", "//evil/api/etat",
                       "/C:/Windows/win.ini"):
            with self.subTest(chemin=chemin):
                self.assertEqual(self.client("GET", chemin)[0], 404)
        self.assertEqual(self.client("PUT", "/", {"a": 1})[0], 405)

    def test_corps_trop_volumineux_ou_sans_longueur(self):
        statut, _ = self.client.json("PUT", "/api/config/projets", b" " * (admin.CORPS_MAX + 1))
        self.assertEqual(statut, 413)
        # Sans Content-Length (corps envoyé par morceaux), le corps serait lu vide.
        connexion = http.client.HTTPConnection("127.0.0.1", self.serveur.server_address[1], timeout=30)
        try:
            connexion.putrequest("PUT", "/api/config/entrees", skip_host=True)
            for cle, valeur in {"Host": f"127.0.0.1:{self.serveur.server_address[1]}", "X-Admin-Jeton": JETON,
                                "Content-Type": "application/json"}.items():
                connexion.putheader(cle, valeur)
            connexion.endheaders()
            self.assertEqual(connexion.getresponse().status, 411)
        finally:
            connexion.close()
        self.assertFalse((self.racine / "config" / "entrees.json").exists())

    def test_occupe_pendant_un_export(self):
        self.assertTrue(self.serveur.admin.verrou.acquire(blocking=False))
        try:
            statut, corps = self.client.json("PUT", "/api/config/projets", projets(), base=empreinte_de(self.projets))
        finally:
            self.serveur.admin.verrou.release()
        self.assertEqual(statut, 409)
        self.assertIn("Occupé", corps["erreur"])

    def test_connexion_muette_fermee_au_bout_du_delai(self):
        port = self.serveur.server_address[1]
        with mock.patch.object(admin.Gestionnaire, "timeout", 0.5), \
                socket.create_connection(("127.0.0.1", port), timeout=10) as brut:
            brut.sendall(f"GET / HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\n".encode())  # en-têtes jamais finis
            debut = time.monotonic()
            try:
                recu = brut.recv(100)
            except ConnectionResetError:
                recu = b""
            duree = time.monotonic() - debut
        self.assertEqual(recu, b"", "connexion fermée, sans réponse")
        self.assertLess(duree, 5)


class PortTest(unittest.TestCase):
    def test_port_suivant_si_occupe(self):
        with tempfile.TemporaryDirectory() as dossier, socket.socket() as occupe:
            occupe.bind(("127.0.0.1", 0))
            occupe.listen()
            port = occupe.getsockname()[1]
            serveur = admin.creer_serveur(Path(dossier), JETON, port=port, essais=5)
            try:
                self.assertEqual(serveur.server_address[0], "127.0.0.1")
                self.assertGreater(serveur.server_address[1], port)
            finally:
                serveur.server_close()

    def test_aucun_port_libre(self):
        with tempfile.TemporaryDirectory() as dossier, socket.socket() as occupe:
            occupe.bind(("127.0.0.1", 0))
            occupe.listen()
            port = occupe.getsockname()[1]
            with self.assertRaises(admin.ErreurAdmin) as contexte:
                admin.creer_serveur(Path(dossier), JETON, port=port, essais=1)
        self.assertIn(f"aucun port libre entre {port} et {port}", str(contexte.exception))


CLE_DASHBOARD = "cle-du-faux-dashboard"
MEMOIRES = [
    memoire(1, "Projet Jarvis : assistant vocal local. Trois étages.", ["jarvis", "architecture"], "architecture"),
    memoire(2, "Jarvis — premier réveil vocal : le mot de réveil déclenche l'écoute.", ["jarvis"], "milestone", 5),
    memoire(3, "Projet Depths : rogue-lite en 2D, donjons procéduraux.", ["depths"], "architecture", 9),
]


class FauxDashboard(BaseHTTPRequestHandler):
    """GET /api/memories et POST /api/search ; les recherches sont comptées
    (chacune écrirait dans la vraie mémoire partagée). delai : secondes
    d'attente avant de répondre à la lecture (dashboard lent)."""
    recherches = 0
    delai = 0

    def log_message(self, *args):
        pass

    def repondre(self, code, corps):
        brut = json.dumps(corps).encode("utf-8")
        try:
            self.send_response(code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(brut)))
            self.end_headers()
            self.wfile.write(brut)
        except ConnectionError:
            pass  # export arrêté avant la réponse (délai dépassé)

    def do_GET(self):
        time.sleep(FauxDashboard.delai)
        if self.headers.get("X-API-Key") != CLE_DASHBOARD:
            return self.repondre(401, {"detail": "non"})
        adresse = urlparse(self.path)
        if adresse.path != "/api/memories":
            return self.repondre(404, {"detail": "inconnu"})
        page = int(parse_qs(adresse.query)["page"][0])
        self.repondre(200, {"memories": MEMOIRES if page == 1 else [], "total": len(MEMOIRES), "has_more": False})

    def do_POST(self):
        FauxDashboard.recherches += 1
        self.rfile.read(int(self.headers.get("Content-Length") or 0))
        self.repondre(200, {"results": []})


def sh(*args, cwd):
    resultat = subprocess.run(args, cwd=cwd, text=True, encoding="utf-8", stdout=subprocess.PIPE,
                              stderr=subprocess.STDOUT)
    if resultat.returncode:
        raise AssertionError(f"{args} : {resultat.stdout}")
    return resultat.stdout.strip()


class PublicationAdminTest(unittest.TestCase):
    """Aperçu et publication dans un dépôt git temporaire relié à un dépôt
    distant local (jamais le vrai), contre un faux dashboard."""

    @classmethod
    def setUpClass(cls):
        cls.dashboard = ThreadingHTTPServer(("127.0.0.1", 0), FauxDashboard)
        threading.Thread(target=cls.dashboard.serve_forever, daemon=True).start()
        cls.url_dashboard = f"http://127.0.0.1:{cls.dashboard.server_address[1]}"

    @classmethod
    def tearDownClass(cls):
        cls.dashboard.shutdown()
        cls.dashboard.server_close()

    def setUp(self):
        self.dossier = tempfile.TemporaryDirectory()
        self.depot = Path(self.dossier.name) / "depot"
        self.distant = Path(self.dossier.name) / "distant.git"
        shutil.copytree(RACINE / "scripts", self.depot / "scripts", ignore=shutil.ignore_patterns("__pycache__"))
        shutil.copy(RACINE / ".gitignore", self.depot / ".gitignore")
        (self.depot / "config").mkdir()
        (self.depot / "docs").mkdir()
        (self.depot / "config" / "projets.json").write_text(admin.formater(projets()), encoding="utf-8")
        sh("git", "init", "--bare", "-b", "main", str(self.distant), cwd=self.dossier.name)
        sh("git", "init", "-b", "main", cwd=self.depot)
        sh("git", "config", "user.name", "test", cwd=self.depot)
        sh("git", "config", "user.email", "test@example.invalid", cwd=self.depot)
        sh("git", "remote", "add", "origin", str(self.distant), cwd=self.depot)
        sh("git", "add", ".", cwd=self.depot)
        sh("git", "commit", "-m", "init", cwd=self.depot)
        sh("git", "push", "-u", "origin", "main", cwd=self.depot)
        # Variables explicites : l'export ne doit jamais joindre le vrai dashboard.
        self.environnement = {"MEMOIRE_API_URL": self.url_dashboard, "MEMOIRE_API_KEY": CLE_DASHBOARD}
        self.serveur = demarrer(self.depot, environnement=self.environnement)
        self.client = Client(self.serveur.server_address[1])
        FauxDashboard.recherches = 0
        FauxDashboard.delai = 0

    def tearDown(self):
        self.serveur.shutdown()
        self.serveur.server_close()
        self.dossier.cleanup()

    def git(self, *args, cwd=None):
        return sh("git", *args, cwd=cwd or self.depot)

    def donnees(self):
        return json.loads((self.depot / "docs" / "data.json").read_text(encoding="utf-8"))

    def renommer_depths(self):
        statut, _ = self.client.json("PUT", "/api/config/projets",
                                     projets(projets={"depths": {"nom": "Depths II", "famille": "jeux"}}),
                                     base=empreinte_de(self.depot / "config" / "projets.json"))
        self.assertEqual(statut, 200)

    def test_apercu_sans_recherche_ni_commit(self):
        self.renommer_depths()
        statut, corps = self.client.json("POST", "/api/apercu", {})
        self.assertEqual(statut, 200, corps)
        self.assertTrue(corps["ok"], corps["sortie"])
        self.assertIn("aucune recherche en --sans-recherche", corps["sortie"])
        self.assertEqual(FauxDashboard.recherches, 0, "l'aperçu n'écrit rien dans la mémoire partagée")
        noms = {p["id"]: p["nom"] for p in self.donnees()["projets"]}
        self.assertEqual(noms["depths"], "Depths II", "l'aperçu montre le réglage enregistré")
        self.assertEqual(self.git("log", "--format=%s"), "init", "aucun commit")
        self.assertEqual(self.git("status", "--porcelain", "--", "config"), "M config/projets.json")

    def test_publier_commit_des_reglages_puis_export_et_push(self):
        self.renommer_depths()
        statut, corps = self.client.json("POST", "/api/publier", {})
        self.assertEqual(statut, 200, corps)
        self.assertTrue(corps["ok"], corps["sortie"])
        self.assertEqual(corps["commit"], "Réglages : projets et familles")
        self.assertIn("git : commit « Réglages : projets et familles »", corps["sortie"])
        self.assertIn("git : push effectué.", corps["sortie"])
        sujets = self.git("log", "--format=%s", "main", cwd=self.distant).splitlines()
        self.assertEqual(len(sujets), 3)
        self.assertTrue(sujets[0].startswith("Export mémoire : 3 entrées"), sujets)
        self.assertEqual(sujets[1:], ["Réglages : projets et familles", "init"])
        self.assertEqual(self.git("rev-parse", "HEAD"), self.git("rev-parse", "main", cwd=self.distant))
        self.assertEqual(self.git("status", "--porcelain"), "", "rien ne reste à commiter")
        self.assertEqual(FauxDashboard.recherches, 3, "export réel : une recherche par entrée nouvelle")

    def test_publier_sans_reglage_modifie(self):
        statut, corps = self.client.json("POST", "/api/publier", {})
        self.assertEqual(statut, 200, corps)
        self.assertTrue(corps["ok"], corps["sortie"])
        self.assertIsNone(corps["commit"])
        self.assertTrue(self.git("log", "-1", "--format=%s", "main", cwd=self.distant).startswith("Export mémoire"))

    def test_publier_refuse_hors_de_main(self):
        self.git("switch", "-q", "-c", "essai")
        self.renommer_depths()
        statut, corps = self.client.json("POST", "/api/publier", {})
        self.assertEqual(statut, 409)
        self.assertEqual(corps["erreur"], "Publication refusée : la copie de travail est sur la branche « essai », "
                                          "pas sur main ; publier pousserait cette branche. Revenir sur main "
                                          "avant de publier.")
        self.assertEqual(self.git("log", "--format=%s"), "init")
        self.assertEqual(FauxDashboard.recherches, 0)

    def test_publier_refuse_modifications_sans_rapport(self):
        self.renommer_depths()
        with open(self.depot / "scripts" / "export.py", "a", encoding="utf-8") as fichier:
            fichier.write("# essai\n")
        statut, corps = self.client.json("POST", "/api/publier", {})
        self.assertEqual(statut, 409)
        self.assertEqual(corps["erreur"], "Publication refusée : d'autres fichiers que les réglages ont des "
                                          "modifications pas encore commitées (scripts/export.py). Publier "
                                          "maintenant mêlerait ces changements en cours à la publication : les "
                                          "commiter ou les annuler d'abord.")
        self.assertEqual(self.git("log", "--format=%s"), "init", "les réglages ne sont pas commités non plus")

    def test_publier_refuse_commit_local_sans_rapport(self):
        (self.depot / "NOTES.md").write_text("brouillon\n", encoding="utf-8")
        self.git("add", "NOTES.md")
        self.git("commit", "-q", "-m", "notes")
        statut, corps = self.client.json("POST", "/api/publier", {})
        self.assertEqual(statut, 409)
        self.assertEqual(corps["erreur"], "Publication refusée : des commits locaux pas encore publiés modifient "
                                          "d'autres fichiers que les réglages et data.json (NOTES.md) ; publier "
                                          "les pousserait aussi. Les publier à part ou les retirer d'abord.")

    def test_publier_refuse_sans_branche_distante(self):
        self.git("branch", "--unset-upstream")
        statut, corps = self.client.json("POST", "/api/publier", {})
        self.assertEqual(statut, 409)
        self.assertIn("ne suit aucune branche distante", corps["erreur"])

    def test_reglage_invalide_ecrit_a_la_main_jamais_publie(self):
        # Modifié hors de la page : jamais passé par sa validation.
        reglages = projets(projets={"depths": {"description": "clé sk-ant-" + "x" * 30}})
        (self.depot / "config" / "projets.json").write_text(json.dumps(reglages), encoding="utf-8")
        erreur = ("Projet « depths », description : ressemble à un secret (clé, jeton ou mot de passe) ; "
                  "ce texte serait publié sur le site.")
        statut, etat = self.client.json("GET", "/api/etat")
        self.assertEqual(etat["erreurs"], {"projets": [erreur]})
        self.assertEqual(etat["git"]["refus_publication"],
                         "des réglages enregistrés ne passent pas la vérification (config/projets.json) : les "
                         "corriger d'abord (la page liste les erreurs à son ouverture) ; rien n'est commité d'ici là.")
        statut, corps = self.client.json("POST", "/api/publier", {})
        self.assertEqual((statut, corps["erreurs"]), (409, [erreur]))
        self.assertTrue(corps["erreur"].startswith("Publication refusée : des réglages enregistrés"), corps)
        statut, corps = self.client.json("POST", "/api/apercu", {})
        self.assertEqual((statut, corps["erreurs"]), (409, [erreur]))
        self.assertEqual(self.git("log", "--format=%s"), "init", "rien n'est commité")
        self.assertEqual(self.git("log", "--format=%s", "main", cwd=self.distant), "init", "rien n'est poussé")
        self.assertEqual(FauxDashboard.recherches, 0)

    def test_git_en_panne_publication_refusee(self):
        vrai = admin.git

        def git(racine, *args):
            if args[:1] == ("status",):
                return subprocess.CompletedProcess(["git", *args], 128, "", "fatal: index file corrupt\n")
            return vrai(racine, *args)

        with mock.patch.object(admin, "git", side_effect=git):
            statut, corps = self.client.json("POST", "/api/publier", {})
        self.assertEqual(statut, 409)
        self.assertEqual(corps["erreur"], "Publication refusée : git ne répond pas normalement (git status a échoué : "
                                          "fatal: index file corrupt) : publication impossible pour l'instant.")
        self.assertEqual(FauxDashboard.recherches, 0)

    def test_push_refuse_explique(self):
        # Le dépôt distant a avancé depuis ailleurs (GitHub, autre ordinateur).
        autre = Path(self.dossier.name) / "autre"
        sh("git", "clone", "-q", str(self.distant), str(autre), cwd=self.dossier.name)
        sh("git", "-c", "user.name=test", "-c", "user.email=test@example.invalid", "commit", "-q", "--allow-empty",
           "-m", "ailleurs", cwd=autre)
        sh("git", "push", "-q", cwd=autre)
        self.renommer_depths()
        statut, corps = self.client.json("POST", "/api/publier", {})
        self.assertEqual(statut, 200, corps)
        self.assertFalse(corps["ok"])
        self.assertEqual(corps["commit"], "Réglages : projets et familles")
        self.assertEqual(corps["explication"], f"Le dépôt GitHub a des commits que cet ordinateur n'a pas encore : dans "
                                               f"{self.depot}, lancer « git pull --rebase », puis « Publier » de nouveau "
                                               "(ce qui est déjà commité ici partira avec).")
        self.assertIn("[rejected]", corps["sortie"])
        self.assertEqual(self.git("log", "-1", "--format=%s", "main", cwd=self.distant), "ailleurs")

    def test_export_trop_long_arrete(self):
        FauxDashboard.delai = 4
        debut = time.monotonic()
        with mock.patch.object(admin, "EXPORT_DELAI", 1):
            statut, corps = self.client.json("POST", "/api/apercu", {})
        self.assertEqual((statut, corps), (200, {"ok": False, "code": 1, "sortie": "Échec : l'export n'a pas fini "
                                                 "en 1 s ; il a été arrêté (git compris)."}))
        self.assertLess(time.monotonic() - debut, 4, "arrêté au bout du délai, sans attendre le dashboard")
        self.assertTrue(self.serveur.admin.verrou.acquire(blocking=False), "verrou relâché")
        self.serveur.admin.verrou.release()

    def test_fichiers_non_suivis_ignores(self):
        (self.depot / "brouillon.txt").write_text("sans rapport, jamais commité\n", encoding="utf-8")
        statut, corps = self.client.json("POST", "/api/publier", {})
        self.assertEqual(statut, 200, corps)
        self.assertTrue(corps["ok"], corps["sortie"])
        self.assertEqual(self.git("status", "--porcelain"), "?? brouillon.txt")

    def test_etat_git(self):
        statut, corps = self.client.json("GET", "/api/etat")
        self.assertEqual(corps["git"], {"branche": "main", "modifies": [], "commits_en_attente": 0,
                                        "refus_publication": None})
        self.renommer_depths()
        (self.depot / "scripts" / "export.py").write_text("# vide\n", encoding="utf-8")
        statut, corps = self.client.json("GET", "/api/etat")
        self.assertEqual(corps["git"]["modifies"], ["config/projets.json", "scripts/export.py"])
        self.assertIn("(scripts/export.py)", corps["git"]["refus_publication"])

    def test_un_seul_export_a_la_fois(self):
        self.assertTrue(self.serveur.admin.verrou.acquire(blocking=False))
        try:
            for chemin in ("/api/apercu", "/api/publier"):
                statut, corps = self.client.json("POST", chemin, {})
                self.assertEqual(statut, 409)
                self.assertEqual(corps["erreur"], admin.OCCUPE)
        finally:
            self.serveur.admin.verrou.release()
        self.assertEqual(FauxDashboard.recherches, 0)
        self.assertEqual(self.client.json("POST", "/api/apercu", {})[0], 200)

    def test_deux_apercus_simultanes_un_seul_passe(self):
        verrou_pris, liberer = threading.Event(), threading.Event()
        vrai_lancer = admin.lancer_export

        def lent(*args, **kwargs):
            verrou_pris.set()
            liberer.wait(10)
            return vrai_lancer(*args, **kwargs)

        resultats = []
        with mock.patch.object(admin, "lancer_export", side_effect=lent):
            premier = threading.Thread(target=lambda: resultats.append(self.client.json("POST", "/api/apercu", {})))
            premier.start()
            self.assertTrue(verrou_pris.wait(10))
            second = self.client.json("POST", "/api/apercu", {})
            liberer.set()
            premier.join(30)
        self.assertEqual(second, (409, {"erreur": admin.OCCUPE}))
        self.assertEqual(resultats[0][0], 200)

    def test_json_exige_et_secrets_masques_dans_le_compte_rendu(self):
        self.assertEqual(self.client("POST", "/api/apercu", b"", type_="text/plain")[0], 415)
        self.serveur.admin.environnement["MEMOIRE_API_URL"] = f"{self.url_dashboard}/{CLE_DASHBOARD}"
        statut, corps = self.client.json("POST", "/api/apercu", {})
        self.assertEqual(statut, 200)
        self.assertFalse(corps["ok"])
        self.assertNotIn(CLE_DASHBOARD, corps["sortie"])
        self.assertIn("[masqué]", corps["sortie"])


if __name__ == "__main__":
    unittest.main()
