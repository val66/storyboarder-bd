/**
 * tests/apercu-sol.test.mjs, la mise en page de la planche de contact du Sol.
 *
 * ⚠️ CE FICHIER NE TIENT QU'UNE CHOSE, ET C'EST DÉLIBÉRÉ. L'outil n'a presque pas de logique : il
 * appelle `buildGroundTexture`, déjà à l'œuvre dans l'application, et colle le canevas qu'elle rend.
 * La seule part qui peut être fausse SANS QUE ÇA SE VOIE est le placement des cellules. Une cellule
 * posée hors du canevas ne lève aucune erreur : `drawImage` accepte des coordonnées hors champ et
 * ne dessine rien. La planche sort incomplète, et on attribue à la matière ce qui appartient à
 * l'instrument. C'est exactement la faute que tests/apercu-bulle.test.mjs existe pour empêcher, sous
 * une autre forme.
 *
 * Ce qu'on ne teste PAS ici : l'aspect des matières, qui appartient à `src/rig3d.js`, et le rendu
 * réel, qui demande Electron et un canevas (cf. .github/workflows/ci.yml, « ce qui n'est pas ici »).
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { dispositionDeLaPlanche3D, VIGNETTE, BANDEAU, MARGE } from '../tools/apercu-sol.mjs';

/** Une cellule tient-elle entièrement dans la planche annoncée ? */
const dansLeCadre = (cell, d) =>
  cell.titre.x >= 0 && cell.titre.y >= 0
  && cell.repetee.x + cell.repetee.taille <= d.largeur
  && cell.tuile.y + cell.tuile.taille <= d.hauteur;

describe('Planche du Sol : aucune cellule ne se dessine dans le vide', () => {
  test('⚠️ CHAQUE CELLULE TIENT DANS LA PLANCHE, pour toutes les tailles utiles', () => {
    // Quatorze est le nombre actuel de matières ; les autres valeurs couvrent les bords où un
    // calcul de lignes se trompe d'une unité : la planche vide, une seule cellule, une ligne juste
    // pleine, et une ligne entamée d'une seule cellule.
    for (const n of [0, 1, 2, 3, 4, 13, 14, 15]) {
      const d = dispositionDeLaPlanche3D(n, 2);
      assert.equal(d.cellules.length, n, `${n} matières demandées, ${d.cellules.length} placées`);
      for (const cell of d.cellules) {
        assert.ok(dansLeCadre(cell, d),
          `avec ${n} matières, la cellule ${cell.index} déborde de la planche ${d.largeur}×${d.hauteur}`);
      }
    }
  });

  test('⚠️ AUCUNE CELLULE N’EN RECOUVRE UNE AUTRE', () => {
    // L'autre moitié du même défaut : des cellules qui tiennent dans le cadre mais se superposent
    // donnent une planche où une matière en efface une autre, et il n'y a rien pour le signaler.
    const d = dispositionDeLaPlanche3D(14, 2);
    const boites = d.cellules.map(c => ({
      x: c.titre.x, y: c.titre.y,
      x2: c.repetee.x + c.repetee.taille, y2: c.tuile.y + c.tuile.taille,
    }));
    for (let i = 0; i < boites.length; i++) {
      for (let j = i + 1; j < boites.length; j++) {
        const a = boites[i], b = boites[j];
        const seChevauchent = a.x < b.x2 && b.x < a.x2 && a.y < b.y2 && b.y < a.y2;
        assert.ok(!seChevauchent, `les cellules ${i} et ${j} se recouvrent`);
      }
    }
  });

  test('le garde-fou : la planche GRANDIT avec le nombre de matières', () => {
    // Sans ce repère, les deux tests ci-dessus seraient vrais d'une disposition qui empile tout au
    // même endroit, ou qui rend une planche démesurée où rien ne peut déborder. Mesurer une absence
    // sans vérifier que l'instrument sait voir une présence est la faute la plus répétée ici.
    const petite = dispositionDeLaPlanche3D(2, 2);
    const grande = dispositionDeLaPlanche3D(14, 2);
    assert.ok(grande.hauteur > petite.hauteur, 'la planche ne grandit pas quand on ajoute des lignes');
    assert.equal(petite.hauteur, grande.hauteur - 6 * (VIGNETTE + BANDEAU + MARGE),
      'la hauteur ne suit pas le nombre de LIGNES : 14 matières sur 2 colonnes en font 7, contre 1');
  });

  test('deux vignettes par matière, la tuile puis sa répétition, jamais confondues', () => {
    // La vue répétée est la seule qui montre le raccord, donc la seule qui réponde à la question du
    // chantier. Si les deux vignettes se posaient au même endroit, la planche montrerait deux fois
    // la même chose sans que rien ne le dise.
    const [cell] = dispositionDeLaPlanche3D(1, 2).cellules;
    assert.equal(cell.tuile.y, cell.repetee.y, 'les deux vues doivent être alignées pour se comparer');
    assert.ok(cell.repetee.x >= cell.tuile.x + cell.tuile.taille,
      'la vue répétée chevauche la tuile seule');
    assert.ok(cell.tuile.y >= cell.titre.y + cell.titre.hauteur,
      'le titre est écrit par-dessus la tuile');
  });

  test('une demande absurde ne rend pas une disposition absurde', () => {
    // `process.argv` et un futur appel depuis un autre outil peuvent tout envoyer.
    for (const n of [-3, 1.7, NaN]) {
      const d = dispositionDeLaPlanche3D(n, 2);
      assert.ok(Number.isFinite(d.largeur) && Number.isFinite(d.hauteur),
        `taille non finie pour ${n} matières`);
      assert.ok(d.cellules.length >= 0 && Number.isInteger(d.cellules.length));
    }
    assert.equal(dispositionDeLaPlanche3D(4, 0).cellules.length, 4, 'zéro colonne doit se rabattre sur une');
  });
});
