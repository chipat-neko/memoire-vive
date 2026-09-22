/* Outils communs des tests navigateur : serveur statique local (ou site
   distant), Chrome installé piloté par playwright-core, pages instrumentées. */
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { demarrerServeur } from './serveur.mjs';
import { MAINTENANT_TEST } from './donnees-test.mjs';

export const CHROME = process.env.MEMOIRE_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const BUREAU = { viewport: { width: 1280, height: 900 } };
const MOBILE = { viewport: { width: 375, height: 800 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };

/* MEMOIRE_SITE_URL (facultatif) : rejoue la suite sur un site déjà publié,
   par exemple https://chipat-neko.github.io/memoire-vive/ ; sinon un serveur
   local sert docs/ sous /memoire-vive/ sur un port libre. */
export async function ouvrirSite() {
  const distant = process.env.MEMOIRE_SITE_URL;
  const serveur = distant ? null : await demarrerServeur();
  const base = distant ? distant.replace(/\/?$/, '/') : serveur.url;
  const navigateur = await chromium.launch({ executablePath: CHROME, headless: true });

  return {
    base,
    url: (ancre = '') => base + ancre,

    /* Page neuve (contexte isolé : stockage vide). Options :
       - donnees : objet servi à la place de data.json, ou fonction (route) => … ;
         absent : le vrai data.json du site ;
       - mobile : écran de téléphone ;
       - horloge : heure figée (ISO) ; par défaut MAINTENANT_TEST avec des données
         de test ; false : horloge réelle (l'horloge simulée neutralise les mesures
         de performance.measure) ;
       page.erreurs recueille erreurs et avertissements de la console, erreurs
       JavaScript, requêtes échouées et violations de la CSP. */
    async page({ donnees, mobile = false, horloge } = {}) {
      const page = await pageInstrumentee(navigateur, { mobile });
      const heure = horloge === undefined ? (donnees ? MAINTENANT_TEST : null) : horloge;
      if (heure) await page.clock.setFixedTime(new Date(heure));
      if (typeof donnees === 'function') {
        await page.route('**/data.json', donnees);
      } else if (donnees) {
        const corps = JSON.stringify(donnees);
        await page.route('**/data.json', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: corps }));
      }
      return page;
    },

    async fermer() {
      await navigateur.close();
      if (serveur) await serveur.arreter();
    },
  };
}

/* Page neuve dans un contexte isolé (stockage vide), écran d'ordinateur
   (1280 × 900) ou de téléphone ; 10 s d'attente au plus par action.
   page.erreurs recueille erreurs et avertissements de la console, erreurs
   JavaScript, requêtes échouées et violations de la CSP. */
export async function pageInstrumentee(navigateur, { mobile = false } = {}) {
  const contexte = await navigateur.newContext({
    ...(mobile ? MOBILE : BUREAU), locale: 'fr-FR', timezoneId: 'Europe/Paris',
  });
  // 10 s par attente (au lieu de 30) : un test en échec le dit vite.
  contexte.setDefaultTimeout(10000);
  const page = await contexte.newPage();
  page.erreurs = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') page.erreurs.push(`[console.${m.type()}] ${m.text()}`);
  });
  page.on('pageerror', (e) => page.erreurs.push(`[pageerror] ${e.message}`));
  page.on('requestfailed', (r) => page.erreurs.push(`[requestfailed] ${r.url()} ${r.failure()?.errorText}`));
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => {
      console.error('Violation CSP : ' + e.violatedDirective + ' ' + e.blockedURI);
    });
  });
  return page;
}

/* Ferme la page ; échoue si la console a reçu une erreur, un avertissement
   ou une violation de CSP pendant le test. */
export async function terminer(page) {
  const erreurs = page.erreurs.slice();
  await page.context().close();
  assert.deepEqual(erreurs, [], 'erreurs de console, JavaScript ou CSP');
}

/* Attend que l'ancre de la page contienne un texte (navigation dans la page). */
export async function attendreAncre(page, morceau) {
  await page.waitForFunction((m) => location.hash.includes(m), morceau);
}

/* Largeur qui dépasse de l'écran (0 : pas de défilement horizontal). */
export function debordement(page) {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
}

/* Rapport de contraste WCAG entre deux couleurs CSS calculées « rgb(r, g, b) ». */
export function contraste(couleurA, couleurB) {
  const lum = (c) => {
    const [r, g, b] = c.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number).map((v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const a = lum(couleurA);
  const b = lum(couleurB);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
