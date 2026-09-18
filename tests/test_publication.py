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
from urllib.parse import parse_qs, urlparse

RACINE = Path(__file__).resolve().parent.parent
CLE = "cle-de-test-123"
ETAT = {"n": 130, "mode": "ok", "cle": CLE, "recherche": True}


def fausse_memoire(i):
    return {"content": f"Projet Test{i % 7} : entrée numéro {i}. Détail sur D:\\test\\{i} et https://exemple.fr/{i}.",
            "content_hash": f"{i:064x}", "tags": [f"test{i % 7}", "projet"], "memory_type": "note",
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
        shutil.rmtree(cls.dossier, ignore_errors=True)

    def exporter(self, *options):
        env = dict(os.environ, MEMOIRE_API_URL=f"http://127.0.0.1:{self.serveur.server_address[1]}",
                   MEMOIRE_API_KEY=CLE, PYTHONIOENCODING="utf-8")
        r = subprocess.run([sys.executable, "scripts/export.py", *options], cwd=self.projet, env=env, text=True,
                           encoding="utf-8", stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
        return r.returncode, r.stdout

    def distant_dernier(self):
        return sh("git", "log", "-1", "--format=%s", cwd=self.distant)

    def donnees(self):
        return json.loads((self.projet / "docs" / "data.json").read_text(encoding="utf-8"))

    # Les scénarios s'enchaînent : unittest les trie par nom, d'où la numérotation.
    def test_01_premier_export_sans_amont(self):
        code, sortie = self.exporter()
        self.assertEqual(code, 0, sortie)
        self.assertTrue(self.distant_dernier().startswith("Export mémoire : 130"))

    def test_02_liste_blanche_et_voisins(self):
        texte = json.dumps(self.donnees(), ensure_ascii=False)
        self.assertNotIn("requête secrète", texte)
        premiere = next(e for e in self.donnees()["entrees"] if e["id"] == f"{5:064x}")
        self.assertEqual(premiere["voisins"], [{"id": f"{6:064x}", "score": 0.9}])
        self.assertEqual(self.donnees()["schema"], 1)

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

    def test_04b_push_refuse_puis_relance(self):
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
        self.assertEqual(code, 1, sortie)
        self.assertIn("push a échoué", sortie)
        sh("git", "pull", "--rebase", cwd=self.projet)
        code, sortie = self.exporter()
        self.assertEqual(code, 0, sortie)
        self.assertTrue(self.distant_dernier().startswith("Export mémoire : 150"))

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

    def test_08_recherche_absente_non_bloquante(self):
        ETAT.update(n=160, recherche=False)
        (self.projet / "docs" / "data.json").unlink()
        code, sortie = self.exporter("--no-git")
        self.assertEqual(code, 0, sortie)
        self.assertIn("recherche(s) de voisins en échec", sortie)
        self.assertTrue(all(e["voisins"] == [] for e in self.donnees()["entrees"]))
        ETAT["recherche"] = True

    def test_09_mauvaise_cle(self):
        ETAT["cle"] = "autre"
        code, sortie = self.exporter()
        ETAT["cle"] = CLE
        self.assertEqual(code, 1, sortie)
        self.assertIn("HTTP 401", sortie)


if __name__ == "__main__":
    unittest.main()
