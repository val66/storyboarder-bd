/**
 * tests/banc-pavage.test.mjs, le banc d'essai du pavage.
 *
 * Le banc embarque `src/ground-tiling-3d.js` dans une page en retirant ses `export`. C'est la seule
 * transformation qu'il fait subir au code qu'il prétend montrer, et elle doit rester la seule : un
 * banc qui exécuterait autre chose que le module livré montrerait un rendu qui n'est pas celui de
 * l'application, exactement la faute de mon premier rasteriseur de Bulles en #425y.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { moduleSansExports } from '../tools/banc-pavage.mjs';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('Banc du pavage : il montre le module livré, et rien d’autre', () => {
  test('seuls les mots-clés `export` en tête de ligne disparaissent', () => {
    const avant = 'export const A = 1;\n  const exportateur = 2;\nexport function f(){ return "export "; }';
    const apres = moduleSansExports(avant);
    assert.equal(apres, 'const A = 1;\n  const exportateur = 2;\nfunction f(){ return "export "; }');
  });

  test('⚠️ LE MODULE RÉEL, UNE FOIS TRANSFORMÉ, NE GARDE AUCUN EXPORT ET PERD SEULEMENT CEUX-LÀ', () => {
    const source = readFileSync(join(RACINE, 'src', 'ground-tiling-3d.js'), 'utf8');
    const banc = moduleSansExports(source);
    assert.ok(!/^export\s/m.test(banc), 'il reste un export : la page ne chargerait pas le script');
    // Même texte, à la longueur des mots retirés près : rien d'autre n'a bougé.
    const retires = (source.match(/^export\s+/gm) || []).join('').length;
    assert.ok(retires > 0, 'le module n’exporte plus rien : ce test ne regarde plus rien');
    assert.equal(banc.length, source.length - retires);
  });
});
