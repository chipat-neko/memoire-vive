"""
Phase 2 : l'export réglé par les seules variables d'environnement (secrets
GitHub Actions), le jeton de service Cloudflare Access, le refus d'une adresse
distante en http:// et le silence sur l'adresse du tunnel.

Comme tests/test_publication.py : faux dashboard local, dossier temporaire,
aucun accès au réseau extérieur ni à la mémoire réelle. S'y ajoute une lecture
des deux fichiers de workflow YAML — ils ne sont jamais joués ici, une faute de
frappe ne se verrait autrement que sur GitHub.
"""
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import unittest
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from unittest import mock
from urllib.parse import parse_qs, urlparse

from tests.aides import export, hash_de

RACINE = Path(__file__).resolve().parent.parent
CLE = "cle-de-test-phase2"
CF_ID = "jeton-de-service.access"
CF_SECRET = "secret-du-jeton-de-service"
NB = 6
ETAT = {"cle": CLE, "recus": []}
VERROU = threading.Lock()


def fausse_memoire(i):
    return {"content": f"Projet Phase{i % 3} : entrée numéro {i}. Détail sans secret.",
            "content_hash": hash_de(i), "tags": [f"phase{i % 3}", "projet"], "memory_type": "note",
            "metadata": {"access_queries": ["requête secrète"]}, "created_at": 1_790_000_000 + i,
            "created_at_iso": None, "updated_at": None, "updated_at_iso": None}


class FauxDashboard(BaseHTTPRequestHandler):
    """Répond comme le dashboard et garde les en-têtes reçus."""

    def log_message(self, *args):
        pass

    def noter(self):
        with VERROU:
            ETAT["recus"].append({"chemin": self.path, "entetes": dict(self.headers)})

    def repondre(self, code, corps):
        data = json.dumps(corps).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        self.noter()
        if self.headers.get("X-API-Key") != ETAT["cle"]:
            return self.repondre(401, {"detail": "non"})
        q = parse_qs(urlparse(self.path).query)
        page, taille = int(q["page"][0]), int(q["page_size"][0])
        items = [fausse_memoire(i) for i in range(NB)][(page - 1) * taille: page * taille]
        self.repondre(200, {"memories": items, "total": NB, "page": page, "page_size": taille,
                            "has_more": page * taille < NB and bool(items)})

    def do_POST(self):
        self.noter()
        self.repondre(200, {"results": []})


class BancDExport(unittest.TestCase):
    """Copie de scripts/ et config/ dans un dossier temporaire, faux dashboard."""

    @classmethod
    def setUpClass(cls):
        cls.serveur = ThreadingHTTPServer(("127.0.0.1", 0), FauxDashboard)
        threading.Thread(target=cls.serveur.serve_forever, daemon=True).start()
        cls.port = cls.serveur.server_address[1]
        cls.dossier = Path(tempfile.mkdtemp(prefix="mv-phase2-"))
        cls.projet = cls.dossier / "proj"
        for sous in ("scripts", "config"):
            shutil.copytree(RACINE / sous, cls.projet / sous)
        (cls.projet / "docs").mkdir()

    @classmethod
    def tearDownClass(cls):
        cls.serveur.shutdown()
        cls.serveur.server_close()
        shutil.rmtree(cls.dossier, ignore_errors=True)

    def setUp(self):
        ETAT["recus"] = []
        self.env_local.unlink(missing_ok=True)
        self.data.unlink(missing_ok=True)

    @property
    def env_local(self):
        return self.projet / ".env"

    @property
    def data(self):
        return self.projet / "docs" / "data.json"

    @property
    def adresse(self):
        return f"http://127.0.0.1:{self.port}"

    def exporter(self, *options, **variables):
        """Lance l'export dans le dossier temporaire ; seules les variables
        données sont posées (celles de la session sont retirées)."""
        env = {k: v for k, v in os.environ.items() if not k.startswith("MEMOIRE_")}
        env["PYTHONIOENCODING"] = "utf-8"
        env.update({k: v for k, v in variables.items() if v is not None})
        r = subprocess.run([sys.executable, "scripts/export.py", *options], cwd=self.projet, env=env,
                           text=True, encoding="utf-8", stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
        return r.returncode, r.stdout

    def entetes_recues(self):
        """En-têtes de la première requête reçue, nommées en minuscules :
        urllib envoie « X-api-key » et « Cf-access-client-id » (il met une
        majuscule initiale et rien d'autre), et HTTP les dit équivalentes."""
        self.assertTrue(ETAT["recus"], "le dashboard n'a reçu aucune requête")
        return {nom.lower(): valeur for nom, valeur in ETAT["recus"][0]["entetes"].items()}


class VariablesEnvironnementTest(BancDExport):
    """Phase 2 : tout vient de l'environnement, il n'y a pas de fichier .env."""

    def test_00_sans_fichier_env(self):
        self.assertFalse(self.env_local.exists())
        code, sortie = self.exporter("--no-git", "--sans-recherche",
                                     MEMOIRE_API_URL=self.adresse, MEMOIRE_API_KEY=CLE)
        self.assertEqual(code, 0, sortie)
        self.assertEqual(json.loads(self.data.read_text(encoding="utf-8"))["nb_entrees"], NB)
        self.assertEqual(self.entetes_recues().get("x-api-key"), CLE)

    def test_01_env_faux_ignore_quand_les_variables_sont_posees(self):
        # 127.0.0.1:1 : personne n'écoute. Si .env l'emportait, l'export échouerait.
        self.env_local.write_text("MEMOIRE_API_URL=http://127.0.0.1:1\nMEMOIRE_API_KEY=mauvaise-cle\n",
                                  encoding="utf-8")
        code, sortie = self.exporter("--dry-run", MEMOIRE_API_URL=self.adresse, MEMOIRE_API_KEY=CLE)
        self.assertEqual(code, 0, sortie)
        self.assertIn(f"{NB} entrées lues", sortie)
        self.assertEqual(self.entetes_recues().get("x-api-key"), CLE)

    def test_02_sans_variables_le_fichier_env_sert_encore(self):
        # Phase 1 : rien ne change pour l'export local lancé à la main.
        self.env_local.write_text(f"MEMOIRE_API_URL={self.adresse}\nMEMOIRE_API_KEY={CLE}\n", encoding="utf-8")
        code, sortie = self.exporter("--dry-run")
        self.assertEqual(code, 0, sortie)
        self.assertIn(f"{NB} entrées lues", sortie)

    def test_03_secret_absent_vaut_variable_vide(self):
        # GitHub Actions pose une variable vide pour un secret qui n'existe pas :
        # l'export doit alors retomber sur .env, pas refuser de partir.
        self.env_local.write_text(f"MEMOIRE_API_KEY={CLE}\n", encoding="utf-8")
        code, sortie = self.exporter("--dry-run", MEMOIRE_API_URL=self.adresse, MEMOIRE_API_KEY="")
        self.assertEqual(code, 0, sortie)
        self.assertEqual(self.entetes_recues().get("x-api-key"), CLE)


class JetonCloudflareTest(BancDExport):
    """Le jeton de service Access voyage dans deux en-têtes, ou pas du tout."""

    def test_00_entetes_envoyees_quand_les_deux_variables_existent(self):
        code, sortie = self.exporter("--dry-run", MEMOIRE_API_URL=self.adresse, MEMOIRE_API_KEY=CLE,
                                     MEMOIRE_CF_ACCESS_CLIENT_ID=CF_ID,
                                     MEMOIRE_CF_ACCESS_CLIENT_SECRET=CF_SECRET)
        self.assertEqual(code, 0, sortie)
        entetes = self.entetes_recues()
        self.assertEqual(entetes.get("cf-access-client-id"), CF_ID)
        self.assertEqual(entetes.get("cf-access-client-secret"), CF_SECRET)

    def test_01_aucune_entete_sans_jeton(self):
        code, sortie = self.exporter("--dry-run", MEMOIRE_API_URL=self.adresse, MEMOIRE_API_KEY=CLE)
        self.assertEqual(code, 0, sortie)
        entetes = self.entetes_recues()
        self.assertNotIn("cf-access-client-id", entetes)
        self.assertNotIn("cf-access-client-secret", entetes)

    def test_02_un_seul_des_deux_ne_suffit_pas(self):
        # Un identifiant sans son secret ne protège rien : Access refuserait de
        # toute façon, autant ne rien envoyer (et ne pas croire l'accès protégé).
        code, sortie = self.exporter("--dry-run", MEMOIRE_API_URL=self.adresse, MEMOIRE_API_KEY=CLE,
                                     MEMOIRE_CF_ACCESS_CLIENT_ID=CF_ID)
        self.assertEqual(code, 0, sortie)
        self.assertNotIn("cf-access-client-id", self.entetes_recues())


class AdresseDistanteTest(BancDExport):
    """http:// distant refusé, et l'adresse du tunnel ne sort jamais."""

    def test_00_http_distant_refuse(self):
        code, sortie = self.exporter("--dry-run", MEMOIRE_API_URL="http://memoire-api.exemple.invalid",
                                     MEMOIRE_API_KEY=CLE)
        self.assertEqual(code, 1, sortie)
        self.assertIn("utiliser https:// pour une adresse distante", sortie)
        self.assertEqual(ETAT["recus"], [], "rien n'est demandé quand l'adresse est refusée")

    def test_01_http_local_accepte(self):
        code, sortie = self.exporter("--dry-run", MEMOIRE_API_URL=self.adresse, MEMOIRE_API_KEY=CLE)
        self.assertEqual(code, 0, sortie)
        self.assertIn(f"Source : {self.adresse}", sortie, "en local, l'adresse est affichée telle quelle")

    def test_02_adresse_du_tunnel_jamais_dans_le_journal(self):
        # Le journal d'une exécution GitHub Actions est public : ni l'adresse du
        # tunnel, ni la clé ne doivent y apparaître, même quand tout échoue.
        hote = "memoire-api.exemple.invalid"
        code, sortie = self.exporter("--dry-run", MEMOIRE_API_URL=f"https://{hote}", MEMOIRE_API_KEY=CLE,
                                     MEMOIRE_CF_ACCESS_CLIENT_ID=CF_ID,
                                     MEMOIRE_CF_ACCESS_CLIENT_SECRET=CF_SECRET)
        self.assertEqual(code, 1, sortie)
        self.assertIn("dashboard distant (MEMOIRE_API_URL)", sortie)
        for secret in (hote, CLE, CF_ID, CF_SECRET):
            self.assertNotIn(secret, sortie, f"« {secret} » ne doit pas sortir")


class ConfigurationTest(unittest.TestCase):
    """load_config, describe_source et les en-têtes, sans lancer de processus."""

    @contextmanager
    def reglages(self, fichier=None, **variables):
        with tempfile.TemporaryDirectory() as dossier:
            chemin = Path(dossier) / ".env"
            if fichier is not None:
                chemin.write_text(fichier, encoding="utf-8")
            propres = {k: v for k, v in os.environ.items() if not k.startswith("MEMOIRE_")}
            with mock.patch.object(export, "ENV_FILE", chemin), \
                    mock.patch.dict(os.environ, {**propres, **variables}, clear=True):
                yield

    def config(self, fichier=None, **variables):
        with self.reglages(fichier, **variables):
            return export.load_config()

    def test_variables_seules(self):
        config = self.config(MEMOIRE_API_URL="https://memoire-api.exemple.fr/", MEMOIRE_API_KEY="k")
        self.assertEqual(config["api_url"], "https://memoire-api.exemple.fr")  # « / » final retiré
        self.assertEqual(config["api_key"], "k")
        self.assertFalse(config["local"])

    def test_variable_prime_sur_le_fichier(self):
        config = self.config("MEMOIRE_API_URL=http://127.0.0.1:8000\nMEMOIRE_API_KEY=ancienne\n",
                             MEMOIRE_API_URL="https://memoire-api.exemple.fr", MEMOIRE_API_KEY="neuve")
        self.assertEqual((config["api_url"], config["api_key"]), ("https://memoire-api.exemple.fr", "neuve"))

    def test_sans_rien_du_tout(self):
        config = self.config()
        self.assertEqual(config["api_url"], export.DEFAULT_API_URL)
        self.assertTrue(config["local"])

    def test_http_distant_refuse(self):
        with self.assertRaises(export.ExportError) as erreur:
            self.config(MEMOIRE_API_URL="http://memoire-api.exemple.fr")
        self.assertIn("https://", str(erreur.exception))

    def test_adresses_locales_acceptees_en_http(self):
        for adresse in ("http://127.0.0.1:8000", "http://localhost:8000", "http://192.168.1.20:8000",
                        "http://nas:5000", "http://portable.local:8000", "http://[::1]:8000"):
            with self.subTest(adresse=adresse):
                config = self.config(MEMOIRE_API_URL=adresse)
                self.assertTrue(config["local"], adresse)
                self.assertEqual(export.describe_source(config), adresse)

    def test_source_distante_anonyme(self):
        config = self.config(MEMOIRE_API_URL="https://memoire-api.exemple.fr")
        self.assertEqual(export.describe_source(config), "dashboard distant (MEMOIRE_API_URL)")

    def test_adresse_du_tunnel_masquee_dans_les_entrees(self):
        # main() ajoute l'hôte distant aux secrets connus (scripts/export.py,
        # « known_secrets += (_host_of(...),) ») : une entrée qui cite le tunnel
        # est masquée comme le serait une clé.
        hote = export._host_of("https://memoire-api.exemple.fr/api/memories")
        self.assertEqual(hote, "memoire-api.exemple.fr")
        texte, masques = export.redact(f"Le tunnel {hote} répond.", (hote,))
        self.assertEqual((texte, masques), ("Le tunnel [masqué] répond.", 1))

    def test_entetes_de_lapi(self):
        entetes = export.Api(self.config(MEMOIRE_API_URL="https://memoire-api.exemple.fr", MEMOIRE_API_KEY="k",
                                         MEMOIRE_CF_ACCESS_CLIENT_ID=CF_ID,
                                         MEMOIRE_CF_ACCESS_CLIENT_SECRET=CF_SECRET)).headers
        self.assertEqual(entetes["X-API-Key"], "k")
        self.assertEqual(entetes["CF-Access-Client-Id"], CF_ID)
        self.assertEqual(entetes["CF-Access-Client-Secret"], CF_SECRET)
        sans = export.Api(self.config(MEMOIRE_API_URL="https://memoire-api.exemple.fr", MEMOIRE_API_KEY="k"))
        self.assertNotIn("CF-Access-Client-Id", sans.headers)
        self.assertFalse(sans.uses_access)


# --------------------------------------------------------------------------
# Lecture des deux fichiers de workflow
# --------------------------------------------------------------------------

BLOCS = ("|", "|-", "|+", ">", ">-", ">+")


def _sans_commentaire(texte):
    texte = texte.strip()
    if texte.startswith("#"):
        return ""            # « workflow_dispatch:   # lancement manuel » : pas de valeur
    if texte[:1] in "\"'":
        return texte         # le commentaire éventuel est retiré par _scalaire
    return re.split(r"\s+#", texte, maxsplit=1)[0].strip()


def _scalaire(texte, numero):
    texte = texte.strip()
    if texte[:1] in "\"'":
        fin = texte.find(texte[0], 1)
        if fin < 0:
            raise ValueError(f"ligne {numero} : guillemet jamais refermé")
        return texte[1:fin]
    texte = _sans_commentaire(texte)
    if texte.startswith("[") and texte.endswith("]"):
        return [_scalaire(part, numero) for part in texte[1:-1].split(",") if part.strip()]
    if " : " in texte:
        # « name: Alerte : ouvrir une issue » : YAML y voit deux clés et refuse.
        raise ValueError(f"ligne {numero} : « : » dans une valeur sans guillemets")
    if texte in ("true", "false"):
        return texte == "true"
    if re.fullmatch(r"-?\d+", texte):
        return int(texte)
    return None if texte in ("null", "~", "") else texte


class LecteurYaml:
    """
    Lecteur d'un sous-ensemble de YAML : assez pour les deux workflows du
    dépôt (dictionnaires, listes, chaînes, blocs « | » et « >- », commentaires),
    et assez sévère pour refuser les fautes qu'on y ferait — tabulation,
    « : » nu dans une valeur, guillemet ouvert, deux-points manquants.
    Aucune dépendance : PyYAML n'est pas installé sur une machine neuve.
    """

    def __init__(self, texte):
        self.lignes = texte.splitlines()
        self.i = 0

    def _utile(self):
        while self.i < len(self.lignes):
            nue = self.lignes[self.i].strip()
            if nue and not nue.startswith("#"):
                return True
            self.i += 1
        return False

    def _indentation(self):
        if not self._utile():
            return -1
        ligne = self.lignes[self.i]
        if "\t" in ligne[: len(ligne) - len(ligne.lstrip())]:
            raise ValueError(f"ligne {self.i + 1} : tabulation en début de ligne")
        return len(ligne) - len(ligne.lstrip(" "))

    def lire(self):
        valeur = self.bloc(self._indentation())
        if self._utile():
            raise ValueError(f"ligne {self.i + 1} : indentation inattendue")
        return valeur

    def bloc(self, indentation):
        if self._indentation() != indentation:
            return None
        return self.liste(indentation) if self.lignes[self.i].strip().startswith("-") \
            else self.dictionnaire(indentation)

    def dictionnaire(self, indentation):
        valeurs = {}
        while self._indentation() == indentation:
            numero = self.i + 1
            ligne = self.lignes[self.i].strip()
            if ligne.startswith("- "):
                break
            cle, separateur, reste = ligne.partition(":")
            if not separateur:
                raise ValueError(f"ligne {numero} : « : » attendu après « {cle} »")
            if cle in valeurs:
                raise ValueError(f"ligne {numero} : « {cle} » en double")
            self.i += 1
            valeurs[cle.strip()] = self.valeur(_sans_commentaire(reste), indentation, numero)
        return valeurs

    def liste(self, indentation):
        elements = []
        while self._indentation() == indentation and self.lignes[self.i].strip().startswith("-"):
            numero = self.i + 1
            reste = _sans_commentaire(self.lignes[self.i].strip()[1:])
            self.i += 1
            cle, separateur, suite = reste.partition(":")
            if reste and separateur and not reste.startswith(("\"", "'")):
                element = {cle.strip(): self.valeur(_sans_commentaire(suite), indentation, numero)}
                if self._indentation() > indentation:
                    element.update(self.dictionnaire(self._indentation()))
                elements.append(element)
            elif reste:
                elements.append(_scalaire(reste, numero))
            else:
                elements.append(self.bloc(self._indentation()) if self._indentation() > indentation else None)
        return elements

    def valeur(self, reste, indentation, numero):
        if reste in BLOCS:
            return self.bloc_scalaire(indentation, reste)
        if reste:
            return _scalaire(reste, numero)
        suivante = self._indentation()
        if suivante > indentation or (suivante == indentation and self.lignes[self.i].strip().startswith("-")):
            return self.bloc(suivante)
        return None

    def bloc_scalaire(self, indentation, marqueur):
        lignes, base = [], None
        while self.i < len(self.lignes):
            brute = self.lignes[self.i]
            if brute.strip():
                courante = len(brute) - len(brute.lstrip(" "))
                if courante <= indentation:
                    break
                base = courante if base is None else base
                lignes.append(brute[base:])
            else:
                lignes.append("")
            self.i += 1
        while lignes and not lignes[-1].strip():
            lignes.pop()
        texte = " ".join(l.strip() for l in lignes if l.strip()) if marqueur.startswith(">") \
            else "\n".join(lignes)
        return texte if marqueur.endswith("-") else texte + "\n"


def lire_yaml(chemin):
    return LecteurYaml(chemin.read_text(encoding="utf-8")).lire()


class LecteurYamlTest(unittest.TestCase):
    """Le lecteur ci-dessus doit vraiment refuser une faute, sinon les tests
    des deux workflows ne prouveraient rien."""

    def test_lecture(self):
        lu = LecteurYaml(
            'name: Essai\n'
            '# commentaire\n'
            'on:\n'
            '  push:\n'
            '    branches: [main]\n'
            '  workflow_dispatch:\n'
            'jobs:\n'
            '  un:\n'
            '    timeout-minutes: 10   # commentaire de fin\n'
            '    steps:\n'
            '      - uses: actions/checkout@v4\n'
            '      - name: Deux lignes\n'
            '        run: |\n'
            '          echo a\n'
            '          echo b\n'
        ).lire()
        self.assertEqual(lu["name"], "Essai")
        self.assertEqual(lu["on"], {"push": {"branches": ["main"]}, "workflow_dispatch": None})
        self.assertEqual(lu["jobs"]["un"]["timeout-minutes"], 10)
        self.assertEqual(lu["jobs"]["un"]["steps"][0], {"uses": "actions/checkout@v4"})
        self.assertEqual(lu["jobs"]["un"]["steps"][1]["run"], "echo a\necho b\n")

    def test_fautes_refusees(self):
        fautes = {
            "tabulation": "a:\n\tb: 1\n",
            "deux-points manquants": "a:\n  b 1\n",
            "guillemet ouvert": 'a: "pas refermé\n',
            "deux-points nus": "name: Alerte : ouvrir une issue\n",
            "clé en double": "a: 1\na: 2\n",
        }
        for nom, texte in fautes.items():
            with self.subTest(faute=nom), self.assertRaises(ValueError):
                LecteurYaml(texte).lire()


class WorkflowsTest(unittest.TestCase):
    """Les deux fichiers YAML du dépôt : celui qui vérifie (actif) et celui de
    la phase 2 (inactif tant qu'il n'est pas copié dans .github/workflows)."""

    CI = RACINE / ".github" / "workflows" / "tests.yml"
    PHASE2 = RACINE / "phase2" / "export-quotidien.yml"

    def etapes(self, travail):
        return travail["steps"]

    def test_00_les_deux_fichiers_se_lisent(self):
        for chemin in (self.CI, self.PHASE2):
            with self.subTest(fichier=chemin.name):
                self.assertIsInstance(lire_yaml(chemin), dict)

    def test_01_pyyaml_si_disponible(self):
        try:
            import yaml
        except ImportError:
            self.skipTest("PyYAML absent (le dépôt n'en dépend pas) : lecteur maison seulement")
        for chemin in (self.CI, self.PHASE2):
            with self.subTest(fichier=chemin.name):
                self.assertIsInstance(yaml.safe_load(chemin.read_text(encoding="utf-8")), dict)

    def test_02_ci_declencheurs_et_droits(self):
        ci = lire_yaml(self.CI)
        self.assertEqual(ci["on"]["push"]["branches"], ["main"])
        self.assertEqual(ci["on"]["pull_request"]["branches"], ["main"])
        self.assertIn("workflow_dispatch", ci["on"])
        self.assertEqual(ci["permissions"], {"contents": "read"}, "la vérification ne publie rien")
        self.assertIn("concurrency", ci)
        for nom, travail in ci["jobs"].items():
            with self.subTest(travail=nom):
                self.assertEqual(travail["runs-on"], "ubuntu-latest")
                self.assertIsInstance(travail["timeout-minutes"], int)

    def test_03_ci_joue_les_commandes_du_readme(self):
        commandes = [e["run"] for t in lire_yaml(self.CI)["jobs"].values() for e in self.etapes(t) if "run" in e]
        readme = (RACINE / "README.md").read_text(encoding="utf-8")
        for attendue in ('python -m unittest discover -s tests', 'node --test "tests/js/*.test.mjs"'):
            with self.subTest(commande=attendue):
                self.assertTrue(any(attendue in c for c in commandes), "absente du workflow")
                self.assertIn(attendue, readme, "absente du README")

    def test_04_actions_epinglees(self):
        for chemin in (self.CI, self.PHASE2):
            for travail in lire_yaml(chemin)["jobs"].values():
                for etape in self.etapes(travail):
                    if "uses" in etape:
                        with self.subTest(action=etape["uses"]):
                            self.assertRegex(etape["uses"], r"^actions/[a-z-]+@v\d+$")

    def test_05_phase2_inactif_ou_copie_a_lidentique(self):
        # Tant que la phase 2 n'est pas installée, le modèle reste dans phase2/
        # (GitHub ne lit que .github/workflows/). Une fois installé, il y est
        # copié : la copie doit alors rester identique au modèle — cette suite
        # est justement jouée par le workflow quotidien avant chaque push.
        copie = RACINE / ".github" / "workflows" / "export-quotidien.yml"
        if not copie.exists():
            return
        self.assertEqual(copie.read_text(encoding="utf-8"), self.PHASE2.read_text(encoding="utf-8"),
                         "la copie active et le modèle phase2/ ont divergé : recopier le modèle")

    def test_06_phase2_declencheurs_et_droits(self):
        modele = lire_yaml(self.PHASE2)
        self.assertEqual(modele["on"]["schedule"], [{"cron": "0 0 * * *"}])
        self.assertIn("force", modele["on"]["workflow_dispatch"]["inputs"])
        self.assertEqual(modele["permissions"], {"contents": "write", "issues": "write"})
        self.assertIs(modele["concurrency"]["cancel-in-progress"], False)
        self.assertIsInstance(modele["jobs"]["export"]["timeout-minutes"], int)

    def test_07_phase2_options_et_variables_existent(self):
        source = (RACINE / "scripts" / "export.py").read_text(encoding="utf-8")
        texte = self.PHASE2.read_text(encoding="utf-8")
        etapes = self.etapes(lire_yaml(self.PHASE2)["jobs"]["export"])
        export_ = next(e for e in etapes if "scripts/export.py" in (e.get("run") or ""))
        for option in set(re.findall(r"--[a-z-]+", export_["run"])):
            with self.subTest(option=option):
                self.assertIn(f'parser.add_argument("{option}"', source, "option inconnue de export.py")
        citees = sorted(set(re.findall(r"\bMEMOIRE_[A-Z_]+\b", texte)))
        for variable in citees:
            with self.subTest(variable=variable):
                self.assertIn(f'pick("{variable}"', source, "variable que export.py ne lit pas")
                self.assertIn(f"secrets.{variable}", texte, "variable jamais reliée à un secret")
        self.assertEqual(sorted(export_["env"]), citees, "toutes passées à l'export, et elles seules")

    def test_07b_phase2_controle_le_data_json_avant_de_publier(self):
        # GitHub ne lance aucun workflow pour un événement déclenché par
        # GITHUB_TOKEN : tests.yml ne verra jamais les commits du robot. Le
        # filet est donc dans ce workflow, entre l'export et le push.
        etapes = self.etapes(lire_yaml(self.PHASE2)["jobs"]["export"])
        commandes = [e.get("run") or "" for e in etapes]
        rang_export = next(i for i, c in enumerate(commandes) if "scripts/export.py" in c)
        rang_controle = next(i for i, c in enumerate(commandes) if "unittest discover -s tests" in c)
        rang_push = next(i for i, c in enumerate(commandes) if c.strip() == "git push")
        self.assertIn("--no-push", commandes[rang_export], "l'export ne publie pas lui-même")
        self.assertLess(rang_export, rang_controle, "le contrôle relit le data.json qui vient d'être écrit")
        self.assertLess(rang_controle, rang_push, "rien n'est publié avant le contrôle")
        for attendue in ('python -m unittest discover -s tests', 'node --test "tests/js/*.test.mjs"'):
            with self.subTest(commande=attendue):
                self.assertIn(attendue, commandes[rang_controle], "les deux suites du README, telles quelles")

    def test_08_alerte_une_seule_issue(self):
        etapes = self.etapes(lire_yaml(self.PHASE2)["jobs"]["export"])
        alerte = [e for e in etapes if e.get("if") == "failure()"]
        self.assertEqual(len(alerte), 1, "une seule étape d'alerte")
        commande = alerte[0]["run"]
        self.assertIn("gh issue list", commande)
        self.assertIn("gh issue comment", commande, "une issue déjà ouverte est complétée")
        self.assertIn("gh issue create", commande)
        self.assertNotIn("--search", commande,
                         "l'index de recherche de GitHub retarde : il ferait ouvrir des doublons")
        self.assertEqual(alerte[0]["env"]["GH_TOKEN"], "${{ secrets.GITHUB_TOKEN }}")
        # Le titre cherché est celui qui sera créé : sans cela, une issue par jour.
        self.assertIn(r'select(.title == \"$TITRE\")', commande, "issue cherchée par son titre")
        self.assertIn('--title "$TITRE"', commande, "et créée avec le même titre")

    def test_09_alerte_refermee_au_retour_a_la_normale(self):
        etapes = self.etapes(lire_yaml(self.PHASE2)["jobs"]["export"])
        retour = [e for e in etapes if e.get("if") == "success()"]
        self.assertEqual(len(retour), 1)
        self.assertIn("gh issue close", retour[0]["run"])
        self.assertEqual(retour[0]["env"]["TITRE"], etapes[-2]["env"]["TITRE"], "le même titre des deux côtés")


if __name__ == "__main__":
    unittest.main()
