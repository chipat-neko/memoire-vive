"""
Intégration : export.py contre un faux dashboard (HTTP local) et un dépôt
distant local. Aucun accès réseau extérieur, aucune donnée réelle.
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from unittest import mock
from urllib.parse import parse_qs, urlparse

from tests.aides import export, hash_de

RACINE = Path(__file__).resolve().parent.parent
CLE = "cle-de-test-123"
ETAT = {"n": 130, "mode": "ok", "cle": CLE, "recherche": True, "posts": 0}
VERROU = threading.Lock()


def fausse_memoire(i):
    return {"content": f"Projet Test{i % 7} : entrée numéro {i}. Détail sur D:\\test\\{i} et https://exemple.fr/{i}.",
            "content_hash": hash_de(i), "tags": [f"test{i % 7}", "projet"], "memory_type": "note",
            "metadata": {"access_queries": ["requête secrète"]}, "created_at": 1_790_000_000 + i,
            "created_at_iso": None, "updated_at": None, "updated_at_iso": None}


class FauxDashboard(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def repondre(self, code, corps):
        data = json.dumps(corps).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.headers.get("X-API-Key") != ETAT["cle"]:
            return self.repondre(401, {"detail": "non"})
        q = parse_qs(urlparse(self.path).query)
        page, taille = int(q["page"][0]), int(q["page_size"][0])
        n = ETAT["n"]
        items = [fausse_memoire(i) for i in range(n)][(page - 1) * taille: page * taille]
        total = n
        if ETAT["mode"] == "page2-vide" and page == 2:
            items = []
        if ETAT["mode"] == "decalage" and page == 2 and not ETAT.get("decale"):
            ETAT["decale"] = True
            total = n - 1
        self.repondre(200, {"memories": items, "total": total, "page": page, "page_size": taille,
                            "has_more": page * taille < total and bool(items)})

    def do_POST(self):
        # Chaque POST /api/search écrit dans la vraie mémoire (historique d'accès) : on les compte.
        with VERROU:
            ETAT["posts"] += 1
        if urlparse(self.path).path != "/api/search":
            return self.repondre(404, {"detail": "inconnu"})
        if self.headers.get("X-API-Key") != ETAT["cle"]:
            return self.repondre(401, {"detail": "non"})
        if self.headers.get("Content-Type") != "application/json":
            return self.repondre(415, {"detail": "JSON attendu"})
        if not ETAT["recherche"]:
            return self.repondre(404, {"detail": "pas de recherche"})
        longueur = int(self.headers.get("Content-Length") or 0)
        requete = json.loads(self.rfile.read(longueur) or b"{}")
        i = int(requete["query"].split("numéro ")[1].split(".")[0])
        voisins = [(i, 1.0), ((i + 1) % ETAT["n"], 0.9), ((i + 2) % ETAT["n"], 0.5)]
        self.repondre(200, {"results": [{"memory": fausse_memoire(j), "similarity_score": s} for j, s in voisins]})


def sh(*args, cwd=None):
    r = subprocess.run(args, cwd=cwd, text=True, encoding="utf-8", stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    if r.returncode:
        raise AssertionError(f"{args} : {r.stdout}")
    return r.stdout.strip()


class PublicationTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.serveur = ThreadingHTTPServer(("127.0.0.1", 0), FauxDashboard)
        threading.Thread(target=cls.serveur.serve_forever, daemon=True).start()
        cls.dossier = Path(tempfile.mkdtemp(prefix="mv-test-"))
        cls.projet = cls.dossier / "proj"
        cls.distant = cls.dossier / "distant.git"
        for sous in ("scripts", "config"):
            shutil.copytree(RACINE / sous, cls.projet / sous)
        (cls.projet / "docs").mkdir()
        sh("git", "init", "--bare", "-b", "main", str(cls.distant))
        sh("git", "init", "-b", "main", cwd=cls.projet)
        sh("git", "config", "user.name", "test", cwd=cls.projet)
        sh("git", "config", "user.email", "test@example.invalid", cwd=cls.projet)
        sh("git", "remote", "add", "origin", str(cls.distant), cwd=cls.projet)
        sh("git", "add", "scripts", "config", cwd=cls.projet)
        sh("git", "commit", "-m", "init", cwd=cls.projet)

    @classmethod
    def tearDownClass(cls):
        cls.serveur.shutdown()
        cls.serveur.server_close()
        shutil.rmtree(cls.dossier, ignore_errors=True)

    def exporter(self, *options):
        ETAT["posts"] = 0
        env = dict(os.environ, MEMOIRE_API_URL=f"http://127.0.0.1:{self.serveur.server_address[1]}",
                   MEMOIRE_API_KEY=CLE, PYTHONIOENCODING="utf-8")
        r = subprocess.run([sys.executable, "scripts/export.py", *options], cwd=self.projet, env=env, text=True,
                           encoding="utf-8", stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
        return r.returncode, r.stdout

    def distant_dernier(self):
        return sh("git", "log", "-1", "--format=%s", cwd=self.distant)

    def donnees(self):
        return json.loads((self.projet / "docs" / "data.json").read_text(encoding="utf-8"))

    def entree(self, i):
        return next(e for e in self.donnees()["entrees"] if e["id"] == hash_de(i))

    # Les scénarios s'enchaînent : unittest les trie par nom, d'où la numérotation.
    def test_00_dry_run_sans_recherche(self):
        code, sortie = self.exporter("--dry-run")
        self.assertEqual(code, 0, sortie)
        self.assertEqual(ETAT["posts"], 0, "--dry-run ne lance aucune recherche")
        self.assertIn("aucune recherche en --dry-run ; recalcul complet à l'export réel (130 recherche(s)).", sortie)
        self.assertFalse((self.projet / "docs" / "data.json").exists())

    def test_01_premier_export_sans_amont(self):
        code, sortie = self.exporter()
        self.assertEqual(code, 0, sortie)
        self.assertTrue(self.distant_dernier().startswith("Export mémoire : 130"))
        self.assertEqual(ETAT["posts"], 130, "premier export : une recherche par entrée")

    def test_02_liste_blanche_et_voisins(self):
        texte = json.dumps(self.donnees(), ensure_ascii=False)
        self.assertNotIn("requête secrète", texte)
        # 5 trouve 6 (0,9) ; 4 trouve 5 (0,9), donc 5 reçoit 4 par symétrie.
        self.assertEqual(self.entree(5)["voisins"], [{"id": hash_de(4), "score": 0.9},
                                                     {"id": hash_de(6), "score": 0.9}])
        self.assertEqual(self.donnees()["schema"], 2)
        self.assertEqual(self.donnees()["voisins_reglage"], {"seuil": 0.8, "max": 5})
        self.assertEqual(self.donnees()["voisins_en_attente"], [])

    def test_02b_dry_run_avec_une_entree_nouvelle(self):
        avant = (self.projet / "docs" / "data.json").read_bytes()
        ETAT["n"] = 131
        code, sortie = self.exporter("--dry-run")
        ETAT["n"] = 130
        self.assertEqual(code, 0, sortie)
        self.assertEqual(ETAT["posts"], 0, "--dry-run ne lance aucune recherche")
        self.assertIn("1 nouvelle(s) entrée(s) : voisins calculés au prochain export réel.", sortie)
        self.assertEqual((self.projet / "docs" / "data.json").read_bytes(), avant)

    def test_02c_sans_entree_nouvelle_aucune_recherche(self):
        code, sortie = self.exporter()
        self.assertEqual(code, 0, sortie)
        self.assertEqual(ETAT["posts"], 0, sortie)
        self.assertIn("Contenu identique au dernier export", sortie)

    def test_02d_une_entree_nouvelle_une_recherche(self):
        ETAT["n"] = 131
        code, sortie = self.exporter("--no-git")
        self.assertEqual(code, 0, sortie)
        self.assertEqual(ETAT["posts"], 1, sortie)
        # 130 trouve 0 (131 % 131) : l'ancienne entrée 0 la reçoit par symétrie.
        self.assertEqual(self.entree(130)["voisins"], [{"id": hash_de(0), "score": 0.9}])
        self.assertIn({"id": hash_de(130), "score": 0.9}, self.entree(0)["voisins"])
        self.assertIn({"id": hash_de(1), "score": 0.9}, self.entree(0)["voisins"], "les anciens restent")

    def test_02e_recalculer_voisins(self):
        code, sortie = self.exporter("--no-git", "--recalculer-voisins")
        self.assertEqual(code, 0, sortie)
        self.assertEqual(ETAT["posts"], 131, sortie)
        self.assertIn("recalcul complet", sortie)

    def test_02f_sans_recherche_ecrit_sans_chercher(self):
        # Aperçu de la page d'admin : data.json écrit, aucune recherche ; l'entrée
        # nouvelle attend le prochain export réel.
        ETAT["n"] = 132
        code, sortie = self.exporter("--no-git", "--sans-recherche")
        self.assertEqual(code, 0, sortie)
        self.assertEqual(ETAT["posts"], 0, "--sans-recherche ne lance aucune recherche")
        self.assertIn("aucune recherche en --sans-recherche", sortie)
        self.assertIn("1 nouvelle(s) entrée(s) : voisins calculés au prochain export réel.", sortie)
        self.assertEqual(self.donnees()["nb_entrees"], 132, "data.json est bien écrit")
        self.assertEqual(self.donnees()["voisins_en_attente"], [hash_de(131)])
        self.assertEqual(self.entree(131)["voisins"], [])
        self.assertIn({"id": hash_de(1), "score": 0.9}, self.entree(0)["voisins"], "les voisins connus restent")

    def test_03_no_git_puis_rattrapage(self):
        ETAT["n"] = 140
        self.assertEqual(self.exporter("--no-git")[0], 0)
        self.assertTrue(self.distant_dernier().startswith("Export mémoire : 130"))
        code, sortie = self.exporter()
        self.assertEqual(code, 0, sortie)
        self.assertTrue(self.distant_dernier().startswith("Export mémoire : 140"))

    def test_04_rien_de_neuf(self):
        code, sortie = self.exporter()
        self.assertEqual(code, 0, sortie)
        self.assertIn("déjà à jour", sortie)

    def test_04b_depot_distant_en_avance_repris_tout_seul(self):
        # Phase 2 : l'export quotidien de GitHub a publié pendant la nuit. Une
        # publication lancée d'ici reprend son commit avant d'écrire quoi que ce
        # soit, et passe — personne n'a de « git pull --rebase » à taper, et
        # aucun conflit dans docs/data.json n'est possible.
        autre = self.dossier / "autre"
        sh("git", "clone", str(self.distant), str(autre))
        sh("git", "config", "user.name", "o", cwd=autre)
        sh("git", "config", "user.email", "o@example.invalid", cwd=autre)
        (autre / "LISEZMOI").write_text("modifié ailleurs", encoding="utf-8")
        sh("git", "add", "LISEZMOI", cwd=autre)
        sh("git", "commit", "-m", "ailleurs", cwd=autre)
        sh("git", "push", cwd=autre)
        ETAT["n"] = 150
        code, sortie = self.exporter()
        self.assertEqual(code, 0, sortie)
        self.assertIn("1 commit(s) repris depuis GitHub avant l'export.", sortie)
        self.assertIn("push effectué", sortie)
        self.assertTrue(self.distant_dernier().startswith("Export mémoire : 150"))
        self.assertEqual((self.projet / "LISEZMOI").read_text(encoding="utf-8"), "modifié ailleurs",
                         "le commit venu d'ailleurs est bien dans la copie de travail")

    def test_05_page_vide_refusee(self):
        ETAT.update(mode="page2-vide", n=160)
        code, sortie = self.exporter()
        self.assertEqual(code, 1, sortie)
        self.assertIn("incomplète", sortie)
        self.assertTrue(self.distant_dernier().startswith("Export mémoire : 150"))

    def test_06_total_qui_change(self):
        ETAT.update(mode="decalage")
        code, sortie = self.exporter()
        self.assertEqual(code, 0, sortie)
        self.assertIn("nouvelle tentative", sortie)
        self.assertTrue(self.distant_dernier().startswith("Export mémoire : 160"))

    def test_07_chute_refusee(self):
        ETAT.update(mode="ok", n=50)
        code, sortie = self.exporter()
        self.assertEqual(code, 1, sortie)
        self.assertIn("contre 160", sortie)
        self.assertEqual(ETAT["posts"], 0, "un export refusé ne lance aucune recherche")

    def test_08_recherche_absente_non_bloquante(self):
        ETAT.update(n=160, recherche=False)
        (self.projet / "docs" / "data.json").unlink()
        code, sortie = self.exporter("--no-git")
        self.assertEqual(code, 0, sortie)
        self.assertIn("recherche(s) de voisins en échec", sortie)
        self.assertEqual(ETAT["posts"], 3, "abandon après trois échecs consécutifs")
        self.assertTrue(all(e["voisins"] == [] for e in self.donnees()["entrees"]))
        self.assertEqual(len(self.donnees()["voisins_en_attente"]), 160, "toutes à chercher au prochain export")
        ETAT["recherche"] = True

    def test_09_mauvaise_cle(self):
        ETAT["cle"] = "autre"
        code, sortie = self.exporter()
        ETAT["cle"] = CLE
        self.assertEqual(code, 1, sortie)
        self.assertIn("HTTP 401", sortie)

    def test_10_lien_configure_refuse_signale(self):
        reglages = self.projet / "config" / "projets.json"
        avant = reglages.read_text(encoding="utf-8")
        cfg = json.loads(avant)
        cfg["projets"]["test3"] = {"lien_principal": "http://192.168.1.10:8080/"}
        reglages.write_text(json.dumps(cfg), encoding="utf-8")
        try:
            code, sortie = self.exporter("--dry-run")
        finally:
            reglages.write_text(avant, encoding="utf-8")
        self.assertEqual(code, 0, sortie)
        self.assertEqual(ETAT["posts"], 0)
        self.assertIn("Lien principal configuré refusé, calcul automatique à la place : test3 (adresse locale)",
                      sortie)



class RemplacementTest(unittest.TestCase):
    """Sous Windows, remplacer un fichier qu'un autre programme lit échoue
    (PermissionError) : l'écriture de data.json réessaie avant d'abandonner."""

    def test_remplacement_reessaye_puis_abandonne(self):
        with tempfile.TemporaryDirectory() as dossier:
            cible, tmp = Path(dossier) / "data.json", Path(dossier) / "data.json.tmp"
            cible.write_text("ancien", encoding="utf-8")
            tmp.write_text("nouveau", encoding="utf-8")
            vrai, essais = os.replace, []

            def replace(*args):
                essais.append(args)
                if len(essais) <= 2:
                    raise PermissionError(13, "fichier ouvert par un autre programme")
                return vrai(*args)

            with mock.patch.object(export.os, "replace", side_effect=replace):
                export.replace_file(tmp, cible, pause=0)
            self.assertEqual(len(essais), 3)
            self.assertEqual(cible.read_text(encoding="utf-8"), "nouveau")
            with mock.patch.object(export.os, "replace", side_effect=PermissionError(13, "toujours ouvert")):
                with self.assertRaises(PermissionError):
                    export.replace_file(tmp, cible, attempts=3, pause=0)


if __name__ == "__main__":
    unittest.main()
