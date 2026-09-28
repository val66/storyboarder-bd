/**
 * tests/ground-3d.test.mjs, le Sol : ce que son maillage peut porter, et ce qu'il ne peut pas.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * ⚠️ CE FICHIER EXISTE À CAUSE D'UN RÉGLAGE QUI A MENTI PENDANT QUATRE VERSIONS
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * `GROUND_TYPE_DEFS` portait un `dispScale` par matière, de 0,08 pour le marbre à 4,5 pour la
 * terre, et la fiche promettait donc un relief de Sol. Il n'y en a jamais eu. Le Sol est un plan de
 * `GROUND_PLANE_SEGMENTS_3D` segments et les `repeat` valent de 1200 à 9600 : la carte de relief se
 * répétait de 12 à 96 fois ENTRE DEUX SOMMETS VOISINS, si bien que tous retombaient sur le même
 * texel. Relevé aux sommets, en refaisant le calcul du shader, l'écart-type du relief valait
 * exactement 0,0000 pour les treize matières.
 *
 * ⚠️ ET LE DÉFAUT NE S'ARRÊTAIT PAS À « ÇA NE FAIT RIEN ». Un texel unique n'est pas la moyenne de
 * la carte. `displacementBias = -dispScale / 2` supposait un relief centré ; ce qu'il produisait
 * était un décalage du plan ENTIER, d'une quantité tirée au hasard par la recette de chaque
 * matière : -0,843 unité sur le Gravier, pour des personnages qui en font 1,75. Ils flottaient.
 * Constaté à l'écran après que la mesure l'eut prédit, et pas l'inverse.
 *
 * ⚠️ POURQUOI PERSONNE N'AVAIT RIEN VU. `applyGroundType` remettait le déplacement à zéro dès qu'une
 * Case contenait un Bâtiment, une Piscine ou un Tracé. Ces trois contournements masquaient le
 * défaut dans la majorité des Cases, et ils ont disparu avec lui.
 *
 * CE QUI EST GARDÉ ICI EST LA RÈGLE, PAS LE RETRAIT. Épingler « aucune matière n'a de dispScale »
 * protégerait du passé. La question qui se posera est celle de quelqu'un qui rebranche un relief
 * avec d'autres chiffres, et c'est à celle-là que ce fichier répond.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  GROUND_TYPE_DEFS, GROUND_PLANE_SEGMENTS_3D, GROUND_PLANE_SIZE_3D, reliefRepresentable3D,
} from '../src/constants.js';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('Sol : un relief annoncé doit pouvoir exister', () => {
  test('⚠️ AUCUNE MATIÈRE NE DÉCLARE UN RELIEF QUE LE MAILLAGE NE PEUT PAS PORTER', () => {
    // La règle, énoncée sur ce qui serait FAUX plutôt que sur ce qui est absent aujourd'hui : une
    // matière peut porter un dispScale le jour où son repeat satisfait le critère, et pas avant.
    const menteuses = GROUND_TYPE_DEFS.filter(d =>
      d.dispScale > 0 && !reliefRepresentable3D(d.repeat, GROUND_PLANE_SEGMENTS_3D));
    assert.deepEqual(menteuses.map(d => d.id), [],
      'ces matières annoncent un relief que leurs sommets ne peuvent pas échantillonner : '
      + menteuses.map(d => `${d.id} (repeat ${d.repeat} pour ${GROUND_PLANE_SEGMENTS_3D} segments)`).join(', '));
  });

  test('le garde-fou : le critère REFUSE bien les valeurs qui ont causé le défaut', () => {
    // Sans ce repère, le test ci-dessus serait satisfait par un critère qui dit toujours oui, et il
    // le serait aussi par un registre vide. Mesurer une absence sans vérifier que l'instrument sait
    // voir une présence est la faute la plus répétée de ce dépôt.
    assert.ok(GROUND_TYPE_DEFS.length > 10, 'le registre a fondu : le test ne regarde plus rien');
    for (const repeat of [1200, 1800, 2400, 3000, 3600, 4800, 6000, 7200, 9600]) {
      assert.equal(reliefRepresentable3D(repeat, GROUND_PLANE_SEGMENTS_3D), false,
        `repeat ${repeat} est l'une des valeurs livrées, le critère doit la refuser`);
    }
    // Et il dit oui quand c'est possible : une période sur deux sommets, la limite exacte.
    assert.equal(reliefRepresentable3D(GROUND_PLANE_SEGMENTS_3D / 2, GROUND_PLANE_SEGMENTS_3D), true);
    assert.equal(reliefRepresentable3D(GROUND_PLANE_SEGMENTS_3D / 2 + 1, GROUND_PLANE_SEGMENTS_3D), false);
  });

  test('le critère ne se laisse pas avoir par une entrée absurde', () => {
    // `repeat` vient d'un registre qu'on édite à la main, et un champ oublié vaut undefined.
    for (const mauvais of [undefined, null, NaN, 0, -5, 'douze', Infinity]) {
      assert.equal(reliefRepresentable3D(mauvais, GROUND_PLANE_SEGMENTS_3D), false,
        `${String(mauvais)} comme repeat doit être refusé, jamais accepté par défaut`);
      assert.equal(reliefRepresentable3D(10, mauvais), false,
        `${String(mauvais)} comme nombre de segments doit être refusé`);
    }
  });

  test('ce qu’il faudrait vraiment pour un relief de matière, écrit en chiffres', () => {
    // Ce test ne garde pas un comportement : il garde le RAISONNEMENT qui a fait retirer le
    // déplacement, pour que personne n'ait à le refaire avant de proposer de le rebrancher.
    const tuileEnUnites = 1;                       // une touffe d'herbe, environ un mètre
    const repeatVoulu = GROUND_PLANE_SIZE_3D / tuileEnUnites;
    const segmentsNecessaires = 2 * repeatVoulu;
    assert.ok(segmentsNecessaires > 20000,
      'si ce chiffre devient petit, le plan du Sol a changé et la décision de #435b est à rouvrir');
    assert.ok((segmentsNecessaires + 1) ** 2 > 100e6,
      `${((segmentsNecessaires + 1) ** 2 / 1e6).toFixed(0)} millions de sommets : hors de portée`);
  });
});

describe('Sol : le critère et la géométrie ne peuvent pas diverger', () => {
  /**
   * ⚠️ CE TEST EST NÉ D'UN MUTANT QUI A ÉCHAPPÉ. Passer GROUND_PLANE_SEGMENTS_3D de 100 à 50 ne
   * rendait aucun test rouge, et c'est légitime : le critère est RELATIF au maillage, donc il suit.
   * Mais cette légitimité repose entièrement sur un fait que rien ne tenait — que la géométrie du
   * Sol soit CONSTRUITE avec cette constante, et non avec un nombre écrit à côté.
   *
   * Elle l'était : `PlaneGeometry(GROUND_PLANE_SIZE_3D, GROUND_PLANE_SIZE_3D, 100, 100)`, un 100
   * littéral face à un critère qui en aurait supposé un autre. Deux exemplaires d'une même décision
   * qui ne s'accordent qu'aujourd'hui, la famille de défaut que ce dépôt nomme le plus souvent.
   *
   * Le mutant est donc équivalent, et il ne l'est qu'à cause de ce test.
   */
  test('⚠️ LE MAILLAGE DU SOL EST CONSTRUIT AVEC LA CONSTANTE, PAS AVEC UN NOMBRE', () => {
    const rig = readFileSync(join(RACINE, 'src/rig3d.js'), 'utf8');
    const appel = rig.match(/new THREE\.PlaneGeometry\(\s*GROUND_PLANE_SIZE_3D[^)]*\)/);
    assert.ok(appel, 'le plan du Sol ne se construit plus comme attendu : ce test ne regarde plus rien');
    assert.match(appel[0], /GROUND_PLANE_SEGMENTS_3D\s*,\s*GROUND_PLANE_SEGMENTS_3D/,
      `le Sol déclare ses segments en dur : ${appel[0]} — le critère de relief raisonnerait sur `
      + 'un maillage qui n\'est pas le sien');
  });

  test('⚠️ PLUS AUCUN DÉPLACEMENT N’EST POSÉ SUR LE MATÉRIAU DU SOL', () => {
    // L'autre moitié du retrait. Le registre peut bien ne plus déclarer de dispScale : si
    // `applyGroundType` rebranchait un displacementMap par un autre chemin, le décalage du plan
    // reviendrait, et c'est lui qui faisait flotter les personnages.
    const rig = readFileSync(join(RACINE, 'src/rig3d.js'), 'utf8');
    const corps = rig.slice(rig.indexOf('export function applyGroundType'));
    const fin = corps.indexOf('\n}');
    const fonction = corps.slice(0, fin);
    assert.ok(fonction.includes('groundMesh3D'), 'applyGroundType est introuvable : test aveugle');
    assert.doesNotMatch(fonction, /displacement/i,
      'applyGroundType repose un déplacement sur le Sol : cf. l\'en-tête de ce fichier');
  });
});
