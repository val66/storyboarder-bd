/**
 * tests/texture-licences.test.mjs, le récapitulatif des licences des textures (#431c).
 *
 * Le modèle est celui des polices (#408c) : un fichier qui voyage avec ce qu'il décrit, et un test
 * qui interdit qu'ils divergent. Les sources (assets/textures/sources/) ne sont ni dans le dépôt ni
 * dans l'installeur : seul ce récapitulatif dit d'où vient chaque texture livrée.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const DOSSIER = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'textures');
const recap = readFileSync(join(DOSSIER, 'LICENSES.md'), 'utf8');
const lignes = recap.split('\n').filter(l => /^\| `[^`]+\.png` \|/.test(l));
const fichiersDuRecap = lignes.map(l => l.match(/^\| `([^`]+)`/)[1]);
const livres = readdirSync(DOSSIER).filter(f => f.endsWith('.png'));

describe('Les licences des textures livrées', () => {
  test('⚠️ CHAQUE TEXTURE LIVRÉE A SA LIGNE', () => {
    const manquantes = livres.filter(f => !fichiersDuRecap.includes(f));
    assert.deepEqual(manquantes, [], `sans ligne dans assets/textures/LICENSES.md : ${manquantes.join(', ')}`);
  });

  test('⚠️ CHAQUE LIGNE DÉSIGNE UNE TEXTURE QUI EXISTE, une seule fois', () => {
    const fantomes = fichiersDuRecap.filter(f => !livres.includes(f));
    assert.deepEqual(fantomes, [], `lignes sans fichier : ${fantomes.join(', ')}`);
    assert.equal(new Set(fichiersDuRecap).size, fichiersDuRecap.length, 'une texture a deux lignes');
  });

  test('chaque ligne nomme sa banque, sa licence et la page de sa source', () => {
    for (const l of lignes) {
      const c = l.split('|').map(x => x.trim());
      const [, , usage, source, banque, licence, page] = c;
      assert.ok(usage && source, l);
      assert.ok(['ambientCG', 'Poly Haven'].includes(banque), `banque inconnue : ${l}`);
      assert.equal(licence, 'CC0 1.0', l);
      const attendue = banque === 'ambientCG' ? `https://ambientcg.com/view?id=${source}` : `https://polyhaven.com/a/${source}`;
      assert.equal(page, attendue, l);
    }
  });

  test('le garde-fou : le test lit vraiment un tableau', () => {
    assert.ok(lignes.length >= 20, `${lignes.length} lignes lues seulement`);
    assert.ok(livres.length >= 20);
  });
});
