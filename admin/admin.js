/* Page d'admin locale de Mémoire Vive, servie par scripts/admin.py (jamais
   publiée) : projets, familles, entrées et synonymes ; Enregistrer, Aperçu,
   Publier. Réutilise les composants, la recherche et le style du site ; le
   DOM est construit par el() (jamais d'innerHTML avec des données). */
import { el, plural } from '../js/composants.js';
import * as M from './modele.js';

const CLE_JETON = 'memoire-vive:admin-jeton';
const ONGLETS = ['projets', 'familles', 'entrees', 'recherche'];
const APERCU = 'memoire-vive-apercu';  // onglet de l'aperçu, réutilisé d'une fois sur l'autre

const $ = (id) => document.getElementById(id);
const dom = {
  status: $('status'), onglets: $('onglets'), etatGit: $('etat-git'), modifs: $('etat-modifs'), annonce: $('annonce'),
  enregistrer: $('bouton-enregistrer'), apercu: $('bouton-apercu'), publier: $('bouton-publier'),
  compteRendu: $('compte-rendu'), compteRenduTitre: $('compte-rendu-titre'),
  compteRenduMessage: $('compte-rendu-message'), compteRenduDetails: $('compte-rendu-details'),
  compteRenduSortie: $('compte-rendu-sortie'),
  fermerCompteRendu: $('fermer-compte-rendu'),
  filtreProjets: $('filtre-projets'), compteProjets: $('compte-projets'), listeProjets: $('liste-projets'),
  detailProjet: $('detail-projet'),
  listeFamilles: $('liste-familles'), nouvelleFamille: $('nouvelle-famille'), ajouterFamille: $('bouton-ajouter-famille'),
  filtreEntrees: $('filtre-entrees'), compteEntrees: $('compte-entrees'), listeEntrees: $('liste-entrees'),
  detailEntree: $('detail-entree'),
  listeGroupes: $('liste-groupes'), ajouterGroupe: $('bouton-ajouter-groupe'),
};

const ui = {
  jeton: '',
  modele: null,
  memo: {},          // titres déjà vus, par identifiant court (entrées masquées depuis)
  onglet: 'projets',
  projet: null,      // projet ouvert
  entree: null,      // identifiant court de l'entrée ouverte
  occupe: false,     // une opération (enregistrement, aperçu, publication) est en cours
};

class ErreurApi extends Error {
  constructor(message, details = []) {
    super(message);
    this.details = details;
  }
}

// ------------------------------------------------------------ serveur

/* Jeton tiré au lancement par admin.py, passé dans l'ancre (#jeton=…, jamais
   envoyée au serveur) : gardé pour l'onglet, puis retiré de l'adresse. */
function lireJeton() {
  const trouve = /(?:^#|&)jeton=([^&]+)/.exec(location.hash);
  if (trouve) {
    history.replaceState(null, '', location.pathname + location.search);
    const jeton = decodeURIComponent(trouve[1]);
    try { sessionStorage.setItem(CLE_JETON, jeton); } catch (e) { /* sans stockage : jeton gardé en mémoire */ }
    return jeton;
  }
  try { return sessionStorage.getItem(CLE_JETON) || ''; } catch (e) { return ''; }
}

async function api(methode, chemin, corps, entetes = {}) {
  const options = { method: methode, headers: Object.assign({ 'X-Admin-Jeton': ui.jeton }, entetes), cache: 'no-store' };
  if (corps !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(corps);
  }
  let reponse;
  try {
    reponse = await fetch(chemin, options);
  } catch (e) {
    throw new ErreurApi('Le serveur de la page d’admin ne répond pas : la fenêtre « Gérer Mémoire Vive » est-elle encore ouverte ?');
  }
  let donnees = null;
  try { donnees = await reponse.json(); } catch (e) { donnees = null; }
  if (reponse.status === 403) {
    throw new ErreurApi('Accès refusé : cette page n’a pas le bon jeton (la page d’admin a peut-être été relancée). Fermer cet onglet et relancer « Gérer Mémoire Vive ».');
  }
  if (!reponse.ok) {
    throw new ErreurApi((donnees && donnees.erreur) || 'Erreur ' + reponse.status + '.', (donnees && donnees.erreurs) || []);
  }
  return donnees;
}

// ------------------------------------------------------------ démarrage

async function demarrer() {
  lier();
  ui.jeton = lireJeton();
  if (!ui.jeton) {
    echec('Jeton absent : ouvrir cette page avec « Gérer Mémoire Vive » (l’adresse qu’il ouvre contient le jeton).');
    return;
  }
  try {
    await charger();
  } catch (e) {
    echec(e.message);
  }
}

function echec(message) {
  dom.status.hidden = false;
  dom.status.classList.add('error');
  dom.status.textContent = message;
  dom.onglets.hidden = true;
  for (const nom of ONGLETS) $('panneau-' + nom).hidden = true;
}

async function charger() {
  const etat = await api('GET', '/api/etat');
  ui.modele = M.creerModele(etat);
  dom.status.hidden = true;
  dom.onglets.hidden = false;
  for (const bouton of [dom.enregistrer, dom.apercu, dom.publier]) bouton.disabled = false;
  afficherOnglet(ui.onglet);
  rendreBarre();
  signalerLecture(etat);
}

/* Réglages modifiés hors de la page : lus sous une forme que la page a
   corrigée (à enregistrer), ou qui ne passent pas la vérification. */
function signalerLecture(etat) {
  const notes = Object.values(etat.normalisations || {}).flat();
  const erreurs = Object.values(etat.erreurs || {}).flat();
  if (erreurs.length) {
    rapport('erreur', 'Réglages à corriger', 'Ces réglages enregistrés ne passent pas la vérification : « Aperçu » et « Publier » sont refusés tant qu’ils ne sont pas corrigés (ici, ou à la main dans config/).',
      { details: [...notes, ...erreurs] });
  } else if (notes.length) {
    rapport('attente', 'Réglages relus', 'Ces réglages étaient écrits sous une forme que l’export accepte, mais que la page écrit autrement (même effet sur le site) : « Enregistrer » écrit la forme de la page.',
      { details: notes });
  }
}

async function rafraichirGit() {
  try { ui.modele.git = (await api('GET', '/api/etat')).git; } catch (e) { /* l'état affiché reste l'ancien */ }
}

// ------------------------------------------------------------ onglets

function afficherOnglet(nom, focus = false) {
  ui.onglet = nom;
  for (const autre of ONGLETS) {
    const onglet = $('onglet-' + autre);
    const actif = autre === nom;
    onglet.setAttribute('aria-selected', String(actif));
    onglet.tabIndex = actif ? 0 : -1;
    $('panneau-' + autre).hidden = !actif;
  }
  const rendre = PANNEAUX[nom];
  if (rendre) rendre();
  if (focus) $('onglet-' + nom).focus();
}

/* Flèches, Début et Fin déplacent l'onglet actif (motif « onglets » de l'ARIA). */
function clavierOnglets(event) {
  const i = ONGLETS.indexOf(ui.onglet);
  const cible = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: ONGLETS.length - 1 }[event.key];
  if (cible === undefined) return;
  event.preventDefault();
  afficherOnglet(ONGLETS[(cible + ONGLETS.length) % ONGLETS.length], true);
}

// ------------------------------------------------------------ barre et compte rendu

function rendreBarre() {
  const modifies = M.fichiersModifies(ui.modele);
  dom.modifs.textContent = modifies.length
    ? 'Modifications non enregistrées : ' + modifies.map((nom) => M.LIBELLES[nom]).join(', ') + '.'
    : 'Tout est enregistré.';
  dom.modifs.classList.toggle('admin-a-enregistrer', modifies.length > 0);
  rendreGit();
}

function rendreGit() {
  const git = ui.modele.git;
  if (!git) {
    dom.etatGit.textContent = 'Dossier hors de git : l’aperçu marche, la publication non.';
    return;
  }
  const enAttente = git.modifies.filter((chemin) => chemin.startsWith('config/') || chemin === 'docs/data.json');
  const parties = ['Branche ' + git.branche,
    enAttente.length ? 'pas encore publié : ' + enAttente.join(', ') : 'rien en attente de publication'];
  if (git.commits_en_attente) parties.push(plural(git.commits_en_attente, 'commit local non poussé', 'commits locaux non poussés'));
  dom.etatGit.textContent = parties.join(' · ') + '.'
    + (git.refus_publication ? ' Publier est impossible pour l’instant : ' + git.refus_publication : '');
}

/* genre : 'ok', 'erreur' ou 'attente'. Le titre est aussi annoncé aux lecteurs d'écran. */
function rapport(genre, titre, message, { details = [], sortie = '', apercu = false, focus = false } = {}) {
  dom.compteRendu.hidden = false;
  dom.compteRendu.dataset.genre = genre;
  dom.compteRenduTitre.textContent = titre;
  dom.compteRenduMessage.replaceChildren(...[
    el('p', null, message),
    details.length ? el('ul', null, details.map((detail) => el('li', null, detail))) : null,
    apercu ? el('p', null, el('a', { href: '/', target: APERCU }, 'Ouvrir l’aperçu du site ↗')) : null,
  ].filter(Boolean));
  // Sortie de l'export repliée, sauf en cas d'échec.
  dom.compteRenduSortie.textContent = sortie;
  dom.compteRenduDetails.hidden = !sortie;
  dom.compteRenduDetails.open = genre === 'erreur';
  dom.annonce.textContent = titre + ' : ' + message;
  if (focus) dom.compteRenduTitre.focus();
}

/* Une seule opération à la fois ; les boutons restent focalisables. */
async function executer(action) {
  if (ui.occupe || !ui.modele) return;
  ui.occupe = true;
  const boutons = [dom.enregistrer, dom.apercu, dom.publier];
  for (const bouton of boutons) bouton.setAttribute('aria-disabled', 'true');
  try {
    await action();
  } finally {
    ui.occupe = false;
    for (const bouton of boutons) bouton.removeAttribute('aria-disabled');
  }
}

async function enregistrer({ silencieux = false } = {}) {
  const modifies = M.fichiersModifies(ui.modele);
  if (!modifies.length) {
    if (!silencieux) rapport('ok', 'Rien à enregistrer', 'Aucune modification en attente.');
    return true;
  }
  if (!silencieux) rapport('attente', 'Enregistrement en cours…', 'Envoi des réglages à la page d’admin.');
  for (const nom of modifies) {
    let reponse;
    try {
      // Empreinte du fichier lu : le serveur refuse d'écraser une modification faite ailleurs entre-temps.
      reponse = await api('PUT', '/api/config/' + nom, ui.modele.brouillon[nom], { 'X-Admin-Base': ui.modele.empreintes[nom] || '' });
    } catch (e) {
      rendreBarre();
      rapport('erreur', 'Enregistrement refusé', e.message, { details: e.details, focus: true });
      return false;
    }
    M.marquerEnregistre(ui.modele, nom, reponse.empreinte);
  }
  await rafraichirGit();
  rendreBarre();
  if (!silencieux) {
    rapport('ok', 'Enregistré', 'Réglages enregistrés sur cet ordinateur : ' + modifies.map((nom) => M.LIBELLES[nom]).join(', ')
      + '. « Aperçu » les montre sur le site local, « Publier » les met en ligne.');
  }
  return true;
}

// ------------------------------------------------------------ événements

const PANNEAUX = {};

function lier() {
  for (const nom of ONGLETS) $('onglet-' + nom).addEventListener('click', () => afficherOnglet(nom, true));
  dom.onglets.addEventListener('keydown', clavierOnglets);
  dom.enregistrer.addEventListener('click', () => executer(() => enregistrer()));
  dom.fermerCompteRendu.addEventListener('click', () => {
    dom.compteRendu.hidden = true;
    dom.enregistrer.focus();
  });
  // Alerte du navigateur si l'on quitte avec des modifications non enregistrées.
  window.addEventListener('beforeunload', (event) => {
    if (ui.modele && M.fichiersModifies(ui.modele).length) {
      event.preventDefault();
      event.returnValue = '';
    }
  });
}

demarrer();
