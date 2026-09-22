/* Page d'admin locale de Mémoire Vive, servie par scripts/admin.py (jamais
   publiée) : projets, familles, entrées et synonymes ; Enregistrer, Aperçu,
   Publier. Réutilise les composants, la recherche et le style du site ; le
   DOM est construit par el() (jamais d'innerHTML avec des données). */
import { el, plural, typeLabel } from '../js/composants.js';
import { normalize } from '../js/recherche.js';
import * as M from './modele.js';

const CLE_JETON = 'memoire-vive:admin-jeton';
const CLE_TITRES = 'memoire-vive:admin-titres';
const ONGLETS = ['projets', 'familles', 'entrees', 'recherche'];
const SITE_PUBLIC = 'https://chipat-neko.github.io/memoire-vive/';
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
  memoriserTitres(etat.donnees);
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

/* Recharge réglages et données (après un aperçu ou une publication) ; garde
   l'onglet, le projet et l'entrée ouverts, et les saisies faites pendant
   l'opération (tout était enregistré au départ : elles restent à enregistrer). */
async function recharger() {
  const avant = ui.modele;
  try {
    const etat = await api('GET', '/api/etat');
    ui.modele = M.creerModele(etat);
    memoriserTitres(etat.donnees);
  } catch (e) {
    return;
  }
  for (const nom of M.fichiersModifies(avant)) {
    ui.modele.brouillon[nom] = avant.brouillon[nom];
    ui.modele.empreintes[nom] = avant.empreintes[nom];  // ces saisies partent du fichier d'avant
  }
  afficherOnglet(ui.onglet);
  rendreBarre();
}

async function rafraichirGit() {
  try { ui.modele.git = (await api('GET', '/api/etat')).git; } catch (e) { /* l'état affiché reste l'ancien */ }
}

/* Titres vus dans data.json, gardés dans ce navigateur : une entrée masquée
   n'y est plus, la liste des masquées affiche ainsi son titre. Jamais écrits
   dans config/ (dépôt public). */
function memoriserTitres(donnees) {
  try {
    const memo = JSON.parse(localStorage.getItem(CLE_TITRES) || '{}');
    for (const entree of (donnees && Array.isArray(donnees.entrees)) ? donnees.entrees : []) {
      if (entree && typeof entree.id === 'string' && entree.titre) memo[entree.id.slice(0, 12)] = entree.titre;
    }
    localStorage.setItem(CLE_TITRES, JSON.stringify(memo));
    ui.memo = memo;
  } catch (e) {
    ui.memo = {};
  }
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

/* onglet : la fenêtre de l'aperçu, ouverte dès le clic (window.open), car le
   navigateur bloque une fenêtre ouverte plusieurs secondes après le clic. Elle
   va sur le site local si l'aperçu réussit ; restée vide, elle se referme s'il
   échoue. Lien « Ouvrir l'aperçu du site » en secours, si elle a été bloquée. */
async function apercu(onglet) {
  const fermerSiVide = () => {
    try {
      if (onglet && !onglet.closed && onglet.location.href === 'about:blank') onglet.close();
    } catch (e) { /* onglet parti sur un autre site : laissé tel quel */ }
  };
  if (!(await enregistrer({ silencieux: true }))) {
    fermerSiVide();
    return;
  }
  rapport('attente', 'Aperçu en cours…', 'L’export lit la mémoire, sans rien y écrire : quelques secondes.');
  let resultat;
  try {
    resultat = await api('POST', '/api/apercu', {});
  } catch (e) {
    fermerSiVide();
    rapport('erreur', 'Aperçu impossible', e.message, { details: e.details, focus: true });
    return;
  }
  if (!resultat.ok) {
    fermerSiVide();
    rapport('erreur', 'Aperçu impossible', 'L’export a échoué : voir son compte rendu ci-dessous (le dashboard tourne-t-il ?).',
      { sortie: resultat.sortie, focus: true });
    return;
  }
  await recharger();
  rapport('ok', 'Aperçu prêt', 'Le site local montre les réglages enregistrés. Les voisins des entrées nouvelles seront calculés à la publication.',
    { sortie: resultat.sortie, apercu: true, focus: true });
  if (onglet && !onglet.closed) onglet.location.replace('/');
}

async function publier() {
  const accord = window.confirm('Publier sur le site public ?\n\nLes réglages enregistrés sont commités, puis l’export complet met le site à jour (commit de data.json, push). Les entrées nouvelles reçoivent leurs voisins : une recherche chacune dans la mémoire partagée. Ne pas lancer « Mettre à jour Mémoire Vive » pendant ce temps.');
  if (!accord) return;
  if (!(await enregistrer({ silencieux: true }))) return;
  rapport('attente', 'Publication en cours…', 'Commit des réglages, export complet, push : jusqu’à quelques minutes s’il y a beaucoup d’entrées nouvelles.');
  let resultat;
  try {
    resultat = await api('POST', '/api/publier', {});
  } catch (e) {
    await rafraichirGit();
    rendreBarre();
    rapport('erreur', 'Publication refusée', e.message, { details: e.details, focus: true });
    return;
  }
  await recharger();
  if (resultat.ok) {
    rapport('ok', 'Publié', 'Le site public se met à jour en une à deux minutes : ' + SITE_PUBLIC, { sortie: resultat.sortie, focus: true });
  } else {
    rapport('erreur', 'Publication inachevée', resultat.explication || (resultat.commit
      ? 'Les réglages sont commités, mais l’export a échoué : relancer « Publier » une fois le problème réglé (le commit en attente partira avec).'
      : 'L’export a échoué : voir son compte rendu ci-dessous.'), { sortie: resultat.sortie, focus: true });
  }
}

// ------------------------------------------------------------ aides de formulaire

/* Champ étiqueté : label, contrôle, aide reliée par aria-describedby. */
function champ(id, libelle, controle, aide) {
  if (aide) controle.setAttribute('aria-describedby', id + '-aide');
  return el('div', { class: 'champ' },
    el('label', { for: id }, libelle), controle,
    aide ? el('p', { class: 'admin-aide', id: id + '-aide' }, aide) : null);
}

/* Tous les mots de la requête présents dans le texte (minuscules et accents indifférents). */
function correspond(texte, requete) {
  const cible = normalize(texte);
  return normalize(requete).split(/\s+/).filter(Boolean).every((mot) => cible.includes(mot));
}

function famille(id) {
  return M.familles(ui.modele).find((f) => f.id === id) || null;
}

function nomFamille(id) {
  const trouvee = famille(id);
  return trouvee ? trouvee.nom : 'Sans famille';
}

function nomProjet(id) {
  const reglage = M.reglageProjet(ui.modele, id);
  const publie = ((ui.modele.donnees && ui.modele.donnees.projets) || []).find((p) => p && p.id === id);
  return reglage.nom || (publie && publie.nom) || id;
}

function vide(texte) {
  return el('p', { class: 'admin-vide' }, texte);
}

// ------------------------------------------------------------ projets

function rendreProjets() {
  rendreListeProjets();
  rendreDetailProjet();
}

function rendreListeProjets() {
  const tous = M.listeProjets(ui.modele);
  const requete = dom.filtreProjets.value;
  const visibles = tous.filter((p) => correspond([p.nom, p.id, nomFamille(p.famille)].join(' '), requete));
  dom.compteProjets.textContent = (requete.trim() ? visibles.length + ' sur ' : '') + plural(tous.length, 'projet', 'projets');
  dom.listeProjets.replaceChildren(...visibles.map((p) => el('li', null,
    el('button', {
      type: 'button', class: 'admin-item', 'data-id': p.id, 'data-couleur': famille(p.famille) ? famille(p.famille).couleur : null,
      'aria-current': p.id === ui.projet ? 'true' : null,
    },
    el('span', { class: 'admin-item-titre' }, p.nom),
    el('span', { class: 'admin-item-sous' }, nomFamille(p.famille) + ' · ' + plural(p.nb, 'entrée publiée', 'entrées publiées'))))));
}

function rendreDetailProjet() {
  const projet = M.listeProjets(ui.modele).find((p) => p.id === ui.projet);
  if (!projet) {
    ui.projet = null;
    dom.detailProjet.replaceChildren(vide('Choisir un projet dans la liste pour régler son nom, sa famille, sa description, son lien principal et ses alias.'));
    return;
  }
  const reglage = M.reglageProjet(ui.modele, projet.id);
  const liens = M.liensDuProjet(ui.modele, projet.id);
  const lienRegle = reglage.lien_principal || '';
  const choix = !lienRegle ? '' : liens.includes(lienRegle) ? lienRegle : 'autre';
  const autres = M.listeProjets(ui.modele).filter((p) => p.id !== projet.id);

  dom.detailProjet.replaceChildren(
    el('h2', { id: 'titre-projet', tabindex: '-1' }, projet.nom),
    el('p', { class: 'admin-aide' }, 'Identifiant ' + projet.id + ' · ' + plural(projet.nb, 'entrée publiée', 'entrées publiées') + ' · ',
      el('a', { href: '/#/projet/' + encodeURIComponent(projet.id), target: APERCU }, 'Voir sur le site local ↗')),
    champ('projet-nom', 'Nom affiché',
      el('input', { type: 'text', id: 'projet-nom', value: reglage.nom || '', placeholder: projet.nomPublie || projet.id, autocomplete: 'off' }),
      'Vide : nom trouvé dans les entrées.'),
    champ('projet-famille', 'Famille',
      el('select', { id: 'projet-famille' },
        el('option', { value: '' }, 'Sans famille'),
        M.familles(ui.modele).map((f) => el('option', { value: f.id, selected: f.id === reglage.famille }, f.nom)))),
    champ('projet-description', 'Description',
      el('textarea', { id: 'projet-description', rows: '3', placeholder: projet.descriptionPubliee || '' }, reglage.description || ''),
      'Vide : résumé de la plus ancienne entrée d’architecture du projet.'),
    champ('projet-lien', 'Lien principal',
      el('select', { id: 'projet-lien' },
        el('option', { value: '' }, 'Automatique (premier site des entrées, sinon premier dépôt)'),
        liens.map((url) => el('option', { value: url, selected: url === choix }, url)),
        el('option', { value: 'autre', selected: choix === 'autre' }, 'Autre adresse…')),
      'Bouton « Ouvrir le site » ou « Dépôt » des cartes du projet.'),
    el('div', { class: 'champ', id: 'projet-lien-autre-bloc', hidden: choix !== 'autre' },
      el('label', { for: 'projet-lien-autre' }, 'Adresse du lien principal'),
      el('input', { type: 'url', id: 'projet-lien-autre', value: choix === 'autre' ? lienRegle : '', placeholder: 'https://…', autocomplete: 'off', spellcheck: 'false' })),
    champ('projet-alias', 'Alias',
      el('input', { type: 'text', id: 'projet-alias', value: M.aliasDe(reglage).join(', '), autocomplete: 'off', spellcheck: 'false' }),
      'Tags rattachés à ce projet, séparés par des virgules : leurs entrées y sont regroupées.'),
    el('div', { class: 'champ' },
      el('label', { for: 'projet-fusion' }, 'Fusionner dans…'),
      el('div', { class: 'admin-ligne' },
        el('select', { id: 'projet-fusion', 'aria-describedby': 'projet-fusion-aide' },
          el('option', { value: '' }, 'Choisir un projet'),
          autres.map((p) => el('option', { value: p.id }, p.nom))),
        el('button', { type: 'button', class: 'btn-secondary', id: 'bouton-fusionner' }, 'Fusionner')),
      el('p', { class: 'admin-aide', id: 'projet-fusion-aide' },
        'Ce projet devient un alias du projet choisi : ses entrées y passent, ses propres réglages sont abandonnés.')),
  );
}

function choisirProjet(id) {
  ui.projet = id;
  rendreProjets();
  $('titre-projet').focus();
}

/* Après une saisie : liste (nom, famille), titre de la fiche, barre. */
function projetModifie() {
  const titre = $('titre-projet');
  if (titre) titre.textContent = nomProjet(ui.projet);
  rendreListeProjets();
  rendreBarre();
}

function saisieProjet(event) {
  const cible = event.target;
  const champs = { 'projet-nom': 'nom', 'projet-description': 'description', 'projet-lien-autre': 'lien_principal' };
  if (cible.id === 'projet-alias') M.modifierProjet(ui.modele, ui.projet, 'alias', M.termes(cible.value));
  else if (champs[cible.id]) M.modifierProjet(ui.modele, ui.projet, champs[cible.id], cible.value);
  else return;
  projetModifie();
}

function choixProjet(event) {
  const cible = event.target;
  if (cible.id === 'projet-famille') {
    M.modifierProjet(ui.modele, ui.projet, 'famille', cible.value || null);
  } else if (cible.id === 'projet-lien') {
    const autre = cible.value === 'autre';
    $('projet-lien-autre-bloc').hidden = !autre;
    M.modifierProjet(ui.modele, ui.projet, 'lien_principal', autre ? $('projet-lien-autre').value : cible.value || null);
    if (autre) $('projet-lien-autre').focus();
  } else {
    return;
  }
  projetModifie();
}

function fusionnerProjet() {
  const source = ui.projet;
  const cible = $('projet-fusion').value;
  if (!cible) {
    $('projet-fusion').focus();
    return;
  }
  const de = nomProjet(source);
  const dans = nomProjet(cible);
  const accord = window.confirm('Fusionner « ' + de + ' » dans « ' + dans + ' » ?\n\n« ' + de + ' » devient un alias : ses entrées passent dans « '
    + dans + ' », ses propres réglages (nom, description, lien…) sont abandonnés. Pour annuler, retirer l’alias.');
  if (!accord) return;
  M.fusionner(ui.modele, source, cible);
  choisirProjet(cible);
  rendreBarre();
  dom.annonce.textContent = '« ' + de + ' » fusionné dans « ' + dans + ' ».';
}

// ------------------------------------------------------------ familles

function rendreFamilles() {
  const liste = M.familles(ui.modele);
  dom.listeFamilles.replaceChildren(...liste.map((f, i) => {
    const n = i + 1;
    return el('li', { class: 'admin-famille', 'data-id': f.id, 'data-couleur': f.couleur },
      el('span', { class: 'family-dot', 'aria-hidden': 'true' }),
      el('label', { for: 'famille-nom-' + n, class: 'visually-hidden' }, 'Nom de la famille n° ' + n),
      el('input', { type: 'text', id: 'famille-nom-' + n, value: f.nom, 'data-champ': 'nom', autocomplete: 'off' }),
      el('label', { for: 'famille-couleur-' + n, class: 'visually-hidden' }, 'Couleur de la famille n° ' + n),
      el('select', { id: 'famille-couleur-' + n, 'data-champ': 'couleur' },
        M.COULEURS.map((nom, k) => el('option', { value: String(k + 1), selected: f.couleur === k + 1 }, (k + 1) + ' — ' + nom))),
      el('span', { class: 'admin-aide admin-famille-compte' }, plural(M.nombreDeProjets(ui.modele, f.id), 'projet', 'projets')),
      el('span', { class: 'admin-ligne' },
        el('button', { type: 'button', class: 'btn-secondary', 'data-action': 'monter', 'aria-label': 'Monter la famille n° ' + n,
          'aria-disabled': i === 0 ? 'true' : null }, '↑'),
        el('button', { type: 'button', class: 'btn-secondary', 'data-action': 'descendre', 'aria-label': 'Descendre la famille n° ' + n,
          'aria-disabled': i === liste.length - 1 ? 'true' : null }, '↓'),
        el('button', { type: 'button', class: 'btn-secondary', 'data-action': 'supprimer', 'aria-label': 'Supprimer la famille n° ' + n },
          'Supprimer')));
  }));
}

function saisieFamille(event) {
  const ligne = event.target.closest('li[data-id]');
  const champFamille = event.target.dataset.champ;
  if (!ligne || !champFamille) return;
  M.modifierFamille(ui.modele, ligne.dataset.id, champFamille, event.target.value);
  if (champFamille === 'couleur') ligne.dataset.couleur = event.target.value;
  rendreBarre();
}

function actionFamille(event) {
  const bouton = event.target.closest('button[data-action]');
  const ligne = bouton && bouton.closest('li[data-id]');
  if (!ligne || bouton.getAttribute('aria-disabled') === 'true') return;
  const id = ligne.dataset.id;
  const action = bouton.dataset.action;
  if (action === 'supprimer') {
    const nb = M.nombreDeProjets(ui.modele, id);
    const accord = window.confirm('Supprimer la famille « ' + nomFamille(id) + ' » ?'
      + (nb ? '\n\n' + plural(nb, 'projet passera', 'projets passeront') + ' « Sans famille ».' : ''));
    if (!accord) return;
    M.supprimerFamille(ui.modele, id);
    rendreFamilles();
    dom.nouvelleFamille.focus();
  } else {
    M.deplacerFamille(ui.modele, id, action === 'monter' ? -1 : 1);
    rendreFamilles();
    // Focus sur le même bouton de la famille déplacée ; arrivée au bout, sur l'autre sens.
    const deplace = dom.listeFamilles.querySelector('li[data-id="' + CSS.escape(id) + '"]');
    const meme = deplace.querySelector('button[data-action="' + action + '"]');
    const autre = deplace.querySelector('button[data-action="' + (action === 'monter' ? 'descendre' : 'monter') + '"]');
    const cible = [meme, autre].find((b) => b.getAttribute('aria-disabled') !== 'true');
    (cible || deplace.querySelector('input')).focus();
  }
  rendreBarre();
}

function ajouterFamille() {
  const nom = dom.nouvelleFamille.value.trim();
  if (!nom) {
    dom.nouvelleFamille.focus();
    return;
  }
  M.ajouterFamille(ui.modele, nom);
  dom.nouvelleFamille.value = '';
  rendreFamilles();
  rendreBarre();
  dom.annonce.textContent = 'Famille « ' + nom + ' » ajoutée.';
  dom.nouvelleFamille.focus();
}

// ------------------------------------------------------------ entrées

function rendreEntrees() {
  rendreListeEntrees();
  rendreDetailEntree();
}

function descriptionEntree(entree) {
  return [
    entree.type ? typeLabel(entree.type) : null,
    entree.projet ? nomProjet(entree.projet) : (entree.connue ? 'Sans projet' : null),
    entree.masquee ? 'masquée' : null,
    entree.connue && (entree.titre !== entree.titreOrigine || entree.resume !== entree.resumeOrigine) ? 'corrigée' : null,
  ].filter(Boolean).join(' · ');
}

function rendreListeEntrees() {
  const toutes = M.listeEntrees(ui.modele, ui.memo);
  const requete = dom.filtreEntrees.value;
  const visibles = toutes.filter((e) => correspond([e.titre, e.titreOrigine, e.court, e.projet ? nomProjet(e.projet) : ''].join(' '), requete));
  dom.compteEntrees.textContent = (requete.trim() ? visibles.length + ' sur ' : '') + plural(toutes.length, 'entrée', 'entrées');
  dom.listeEntrees.replaceChildren(...visibles.map((e) => el('li', null,
    el('button', { type: 'button', class: 'admin-item', 'data-court': e.court, 'aria-current': e.court === ui.entree ? 'true' : null },
      el('span', { class: 'admin-item-titre' }, e.titre || 'Entrée masquée ' + e.court),
      el('span', { class: 'admin-item-sous' }, descriptionEntree(e))))));
}

function ligneOrigine(champEntree, entree) {
  const origine = champEntree === 'titre' ? entree.titreOrigine : entree.resumeOrigine;
  const actuel = champEntree === 'titre' ? entree.titre : entree.resume;
  return el('p', { class: 'admin-origine', id: 'origine-' + champEntree, hidden: actuel === origine },
    champEntree === 'titre' ? 'Titre d’origine : ' : 'Résumé d’origine : ',
    el('span', { class: 'admin-origine-texte' }, origine || '(vide)'), ' ',
    el('button', { type: 'button', class: 'link-button', 'data-retablir': champEntree }, 'Rétablir'));
}

function rendreDetailEntree() {
  const entree = M.listeEntrees(ui.modele, ui.memo).find((e) => e.court === ui.entree);
  if (!entree) {
    ui.entree = null;
    dom.detailEntree.replaceChildren(vide('Choisir une entrée dans la liste pour corriger son titre ou son résumé, ou la masquer du site.'));
    return;
  }
  const caseMasquer = el('div', { class: 'champ admin-case' },
    el('input', { type: 'checkbox', id: 'entree-masquer', checked: entree.masquee, 'aria-describedby': 'entree-masquer-aide' }),
    el('label', { for: 'entree-masquer' }, 'Masquer du site'),
    el('p', { class: 'admin-aide', id: 'entree-masquer-aide' },
      'L’entrée disparaît du site public à la prochaine publication (la mémoire n’est pas modifiée) ; elle reste listée ici pour pouvoir la réafficher. Masquer retire aussi sa correction de titre et de résumé : config/entrees.json est publié avec le dépôt.'));
  if (!entree.connue) {
    dom.detailEntree.replaceChildren(
      el('h2', { id: 'titre-entree', tabindex: '-1' }, entree.titre || 'Entrée masquée'),
      el('p', { class: 'admin-aide' }, 'Identifiant ' + entree.court + '. Masquée, elle n’est plus dans les données du site : la réafficher puis lancer un aperçu la ramène dans la liste, avec son titre et son résumé.'),
      caseMasquer);
    return;
  }
  dom.detailEntree.replaceChildren(
    el('h2', { id: 'titre-entree', tabindex: '-1' }, entree.titre),
    el('p', { class: 'admin-aide' },
      [typeLabel(entree.type), entree.projet ? 'projet ' + nomProjet(entree.projet) : 'sans projet', 'identifiant ' + entree.court].join(' · ') + ' · ',
      el('a', { href: '/#/entree/' + entree.court, target: APERCU }, 'Voir la fiche sur le site local ↗')),
    champ('entree-titre', 'Titre', el('input', { type: 'text', id: 'entree-titre', value: entree.titre, autocomplete: 'off' })),
    ligneOrigine('titre', entree),
    champ('entree-resume', 'Résumé', el('textarea', { id: 'entree-resume', rows: '4' }, entree.resume)),
    ligneOrigine('resume', entree),
    caseMasquer);
}

function choisirEntree(court) {
  ui.entree = court;
  rendreEntrees();
  $('titre-entree').focus();
}

/* Après une correction : ligne « d'origine », titre de la fiche, liste, barre. */
function entreeModifiee() {
  const entree = M.listeEntrees(ui.modele, ui.memo).find((e) => e.court === ui.entree);
  if (entree && entree.connue) {
    $('titre-entree').textContent = entree.titre;
    $('origine-titre').hidden = entree.titre === entree.titreOrigine;
    $('origine-resume').hidden = entree.resume === entree.resumeOrigine;
  }
  rendreListeEntrees();
  rendreBarre();
}

function saisieEntree(event) {
  const champs = { 'entree-titre': 'titre', 'entree-resume': 'resume' };
  const champEntree = champs[event.target.id];
  if (!champEntree) return;
  M.corriger(ui.modele, ui.entree, champEntree, event.target.value);
  entreeModifiee();
}

/* Masquer une entrée corrigée retire sa correction (config/ est publié) : on le demande d'abord. */
function caseMasquer(event) {
  if (event.target.id !== 'entree-masquer') return;
  const entree = M.listeEntrees(ui.modele, ui.memo).find((e) => e.court === ui.entree);
  const retireCorrection = event.target.checked && entree && entree.connue
    && (entree.titre !== entree.titreOrigine || entree.resume !== entree.resumeOrigine);
  if (retireCorrection && !window.confirm('Masquer cette entrée retire aussi sa correction de titre et de résumé (config/entrees.json est publié avec le dépôt). Continuer ?')) {
    event.target.checked = false;
    return;
  }
  M.masquer(ui.modele, ui.entree, event.target.checked);
  if (retireCorrection) {
    $('entree-titre').value = entree.titreOrigine;
    $('entree-resume').value = entree.resumeOrigine;
  }
  entreeModifiee();
}

function retablir(event) {
  const bouton = event.target.closest('button[data-retablir]');
  if (!bouton) return;
  const champEntree = bouton.dataset.retablir;
  M.corriger(ui.modele, ui.entree, champEntree, '');
  const entree = M.listeEntrees(ui.modele, ui.memo).find((e) => e.court === ui.entree);
  const saisie = $(champEntree === 'titre' ? 'entree-titre' : 'entree-resume');
  saisie.value = champEntree === 'titre' ? entree.titreOrigine : entree.resumeOrigine;
  entreeModifiee();
  saisie.focus();
}

// ------------------------------------------------------------ recherche

function rendreRecherche() {
  const liste = M.groupes(ui.modele);
  dom.listeGroupes.replaceChildren(...liste.map((groupe, i) => el('li', { class: 'admin-groupe' },
    el('label', { for: 'groupe-' + (i + 1), class: 'visually-hidden' }, 'Groupe de synonymes n° ' + (i + 1)),
    el('input', { type: 'text', id: 'groupe-' + (i + 1), value: groupe.join(', '), 'data-index': String(i),
      placeholder: 'terme, autre terme, …', autocomplete: 'off', spellcheck: 'false' }),
    el('button', { type: 'button', class: 'btn-secondary', 'data-supprimer': String(i),
      'aria-label': 'Supprimer le groupe n° ' + (i + 1) }, 'Supprimer'))));
}

function saisieGroupe(event) {
  if (event.target.dataset.index === undefined) return;
  M.modifierGroupe(ui.modele, Number(event.target.dataset.index), event.target.value);
  rendreBarre();
}

function supprimerGroupe(event) {
  const bouton = event.target.closest('button[data-supprimer]');
  if (!bouton) return;
  const i = Number(bouton.dataset.supprimer);
  M.supprimerGroupe(ui.modele, i);
  rendreRecherche();
  rendreBarre();
  ($('groupe-' + (i + 1)) || $('groupe-' + i) || dom.ajouterGroupe).focus();
}

function ajouterGroupe() {
  const i = M.ajouterGroupe(ui.modele);
  rendreRecherche();
  rendreBarre();
  $('groupe-' + (i + 1)).focus();
}

// ------------------------------------------------------------ événements

const PANNEAUX = { projets: rendreProjets, familles: rendreFamilles, entrees: rendreEntrees, recherche: rendreRecherche };

function lier() {
  for (const nom of ONGLETS) $('onglet-' + nom).addEventListener('click', () => afficherOnglet(nom, true));
  dom.onglets.addEventListener('keydown', clavierOnglets);
  dom.enregistrer.addEventListener('click', () => executer(() => enregistrer()));
  // Onglet de l'aperçu ouvert pendant le clic (sinon bloqué si l'export dure) ; aucun s'il est déjà occupé.
  dom.apercu.addEventListener('click', () => {
    if (ui.occupe || !ui.modele) return;
    const onglet = window.open('', APERCU);
    executer(() => apercu(onglet));
  });
  dom.publier.addEventListener('click', () => executer(publier));
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

  dom.filtreProjets.addEventListener('input', rendreListeProjets);
  dom.listeProjets.addEventListener('click', (event) => {
    const bouton = event.target.closest('button[data-id]');
    if (bouton) choisirProjet(bouton.dataset.id);
  });
  dom.detailProjet.addEventListener('input', saisieProjet);
  dom.detailProjet.addEventListener('change', choixProjet);
  dom.detailProjet.addEventListener('click', (event) => {
    if (event.target.id === 'bouton-fusionner') fusionnerProjet();
  });

  dom.listeFamilles.addEventListener('input', saisieFamille);
  dom.listeFamilles.addEventListener('click', actionFamille);
  dom.ajouterFamille.addEventListener('click', ajouterFamille);
  dom.nouvelleFamille.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      ajouterFamille();
    }
  });

  dom.filtreEntrees.addEventListener('input', rendreListeEntrees);
  dom.listeEntrees.addEventListener('click', (event) => {
    const bouton = event.target.closest('button[data-court]');
    if (bouton) choisirEntree(bouton.dataset.court);
  });
  dom.detailEntree.addEventListener('input', saisieEntree);
  dom.detailEntree.addEventListener('change', caseMasquer);
  dom.detailEntree.addEventListener('click', retablir);

  dom.listeGroupes.addEventListener('input', saisieGroupe);
  dom.listeGroupes.addEventListener('click', supprimerGroupe);
  dom.ajouterGroupe.addEventListener('click', ajouterGroupe);
}

demarrer();
