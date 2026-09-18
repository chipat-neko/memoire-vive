import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../../docs/style.css', import.meta.url), 'utf8');

/* Variables « --nom: #rrggbb; » du premier bloc qui suit le sélecteur. */
function bloc(selecteur) {
  const debut = css.indexOf(selecteur + ' {');
  assert.notEqual(debut, -1, 'bloc introuvable : ' + selecteur);
  const corps = css.slice(debut, css.indexOf('}', debut));
  return Object.fromEntries(Array.from(corps.matchAll(/(--[\w-]+):\s*(#[0-9a-fA-F]{6})\b/g), (m) => [m[1], m[2]]));
}

function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255]
    .map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; })
    .reduce((somme, v, i) => somme + v * [0.2126, 0.7152, 0.0722][i], 0);
}

function contraste(a, b) {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

const clair = bloc(':root');
const sombreAuto = bloc(':root:not([data-theme="light"])');
const sombre = bloc(':root[data-theme="dark"]');

test('six couleurs de famille dans chaque thème', () => {
  for (const theme of [clair, sombreAuto, sombre]) {
    for (let n = 1; n <= 6; n++) assert.match(theme['--famille-' + n] || '', /^#[0-9a-fA-F]{6}$/, '--famille-' + n);
  }
});

test('thème sombre identique en automatique et en choix explicite', () => {
  for (let n = 1; n <= 6; n++) assert.equal(sombreAuto['--famille-' + n], sombre['--famille-' + n]);
});

test('contraste AA (≥ 4,5) sur les fonds, dans les deux thèmes', () => {
  for (const [nom, theme] of [['clair', clair], ['sombre', sombre]]) {
    for (let n = 1; n <= 6; n++) {
      for (const fond of ['--bg', '--surface', '--surface-2']) {
        const ratio = contraste(theme['--famille-' + n], theme[fond]);
        assert.ok(ratio >= 4.5, `${nom} : --famille-${n} sur ${fond} = ${ratio.toFixed(2)}`);
      }
    }
  }
});
