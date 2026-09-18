import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

/* GitHub Pages sert chaque fichier avec « Cache-Control: max-age=600 ». Au
   rechargement, le navigateur ne revalide que la page : une feuille de style
   ou un script classique gardés en cache sous la même adresse pourraient
   accompagner un nouvel index.html pendant dix minutes. index.html les charge
   donc avec « ?v= » suivi de l'empreinte du fichier (adresse de même origine :
   CSP inchangée) ; ce test échoue tant qu'elle n'est pas à jour. */

const lire = (chemin) => readFileSync(new URL('../../docs/' + chemin, import.meta.url), 'utf8');
const index = lire('index.html');

function empreinte(chemin) {
  return createHash('sha256').update(lire(chemin).replace(/\r\n/g, '\n')).digest('hex').slice(0, 10);
}

for (const [fichier, balise] of [['style.css', /<link rel="stylesheet" href="([^"]+)">/], ['theme.js', /<script src="([^"]+)"><\/script>/]]) {
  test(`index.html charge ${fichier} avec l’empreinte de son contenu`, () => {
    const adresse = (index.match(balise) || [])[1];
    const attendue = fichier + '?v=' + empreinte(fichier);
    assert.equal(adresse, attendue, `mettre à jour docs/index.html : ${attendue}`);
  });
}

test('aucune autre ressource locale de index.html sans version, hormis les modules (adresses propres à cette version)', () => {
  const adresses = Array.from(index.matchAll(/\b(?:href|src)="([^"#][^"]*)"/g), (m) => m[1]);
  const locales = adresses.filter((a) => !/^[a-z]+:/i.test(a));
  assert.deepEqual(locales.filter((a) => !a.includes('?v=')).sort(), ['favicon.svg', 'js/app.js']);
});
