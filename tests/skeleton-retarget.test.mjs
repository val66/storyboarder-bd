/**
 * tests/skeleton-retarget.test.mjs — le même geste, d'un corps à l'autre.
 *
 * CE QUI EST EN JEU. La bibliothèque de poses range « lElbow: 1.0 rad ». Appliquer cet angle tel
 * quel à un os importé produit un membre qui part de travers, SANS lever la moindre erreur — les
 * axes des os diffèrent d'un fichier à l'autre, et cela a été mesuré sur les six fichiers réels
 * (cf. docs/imported-skeletons.md) : cinq alignent leurs os sur +Y, le rig Unreal sur ±X avec un
 * signe qui s'inverse entre les côtés, et deux axes verticaux différents cohabitent.
 *
 * D'où le passage par le CORPS — haut, droite, avant — plutôt que par les axes bruts. Les tests
 * ci-dessous vérifient les propriétés de cette traduction, pas des valeurs d'exemple : un
 * changement de base se juge sur ce qu'il PRÉSERVE.
 *
 * Les valeurs numériques employées ici viennent des relevés réels consignés dans la note, et non
 * de repères inventés pour l'occasion : un test qui ne rencontre que des cas propres ne dit rien
 * du fichier qui pose problème.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  normaliser, repereDuCorps, coordonneesDansRepere, vecteurDepuisRepere,
  axeEquivalent, axeMondeVersLocal, quaternionAxeAngle, deltaPourOs,
} from '../src/skeleton-retarget.js';

const proche = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;
const vecteurProche = (a, b, tol = 1e-9) =>
  a && b && a.every((v, i) => proche(v, b[i], tol));

/** Un corps « Y en haut » : la plupart des fichiers mesurés. */
const CORPS_Y = repereDuCorps({
  bassin: [0, 0, 0], tete: [0, 1.6, 0],
  clavicule_g: [0.15, 1.4, 0], clavicule_d: [-0.15, 1.4, 0],
});
/** Un corps « Z en haut » : worker_j et le rig Unreal, mesurés. */
const CORPS_Z = repereDuCorps({
  bassin: [0, 0, 0], tete: [0, 0, 1.6],
  clavicule_g: [0.15, 0, 1.4], clavicule_d: [-0.15, 0, 1.4],
});

describe('normaliser — une direction, ou rien', () => {
  test('rend un vecteur unitaire', () => {
    assert.ok(vecteurProche(normaliser([0, 3, 0]), [0, 1, 0]));
    assert.ok(vecteurProche(normaliser([3, 4, 0]), [0.6, 0.8, 0]));
  });

  test('RÉGRESSION : un vecteur NUL rend null, jamais un axe inventé', () => {
    // Le cas se produit quand deux os sont confondus — une clavicule posée exactement sur la
    // précédente. Normaliser au hasard propagerait une orientation fausse dans tout le corps ;
    // rendre null laisse l'appelant renoncer proprement.
    assert.equal(normaliser([0, 0, 0]), null);
    assert.equal(normaliser([1e-12, 0, 0]), null);
    assert.equal(normaliser([NaN, 0, 0]), null);
    assert.equal(normaliser(null), null);
    assert.equal(normaliser([1, 2]), null);
  });
});

describe('repereDuCorps — mesurer l\'orientation d\'un corps', () => {
  test('les trois axes sont unitaires et orthogonaux', () => {
    [CORPS_Y, CORPS_Z].forEach(r => {
      assert.ok(r, 'repère non calculé');
      ['droite', 'haut', 'avant'].forEach(a => assert.ok(proche(Math.hypot(...r[a]), 1)));
      assert.ok(proche(r.droite[0] * r.haut[0] + r.droite[1] * r.haut[1] + r.droite[2] * r.haut[2], 0));
      assert.ok(proche(r.haut[0] * r.avant[0] + r.haut[1] * r.avant[1] + r.haut[2] * r.avant[2], 0));
    });
  });

  test('« haut » suit la colonne, quel que soit l\'axe vertical du fichier', () => {
    // Deux axes verticaux cohabitent dans les fichiers réels : +Y et +Z. Rien n'est supposé.
    assert.ok(vecteurProche(CORPS_Y.haut, [0, 1, 0]));
    assert.ok(vecteurProche(CORPS_Z.haut, [0, 0, 1]));
  });

  test('« droite » va de la clavicule DROITE vers la GAUCHE', () => {
    assert.ok(vecteurProche(CORPS_Y.droite, [1, 0, 0]));
  });

  test('RÉGRESSION : une ligne d\'épaules oblique est REDRESSÉE', () => {
    // Mesuré sur anime_girl1 : 0,105 de non-orthogonalité, soit environ 6°, parce que le modèle
    // n'est pas dans une pose neutre. Sans redressement, le repère ne serait pas orthogonal et
    // l'aller-retour source → cible déformerait chaque geste d'autant.
    const oblique = repereDuCorps({
      bassin: [0, 0, 0], tete: [0, 1.6, 0],
      clavicule_g: [0.15, 1.5, 0], clavicule_d: [-0.15, 1.3, 0],  // épaules franchement penchées
    });
    assert.ok(oblique);
    const d = oblique.droite, h = oblique.haut;
    assert.ok(proche(d[0] * h[0] + d[1] * h[1] + d[2] * h[2], 0),
      'la droite n\'a pas été redressée par rapport à la colonne');
    assert.ok(proche(Math.hypot(...d), 1));
  });

  test('des os manquants ou dégénérés rendent null, sans exception', () => {
    assert.equal(repereDuCorps(null), null);
    assert.equal(repereDuCorps({ bassin: [0, 0, 0], tete: [0, 1, 0] }), null);
    // Colonne et épaules colinéaires : aucun « avant » définissable.
    assert.equal(repereDuCorps({
      bassin: [0, 0, 0], tete: [0, 1, 0], clavicule_g: [0, 2, 0], clavicule_d: [0, 1.5, 0],
    }), null);
    // Bassin et tête confondus : pas de colonne.
    assert.equal(repereDuCorps({
      bassin: [0, 1, 0], tete: [0, 1, 0], clavicule_g: [1, 1, 0], clavicule_d: [-1, 1, 0],
    }), null);
  });

  test('clavicules confondues : les bras prennent le relais', () => {
    // CE N'EST PAS UN CAS D'ÉCOLE. Le Personnage intégré de cette application est exactement dans
    // cette situation : ses deux clavicules pivotent au sternum, donc au MÊME point, et
    // l'écartement latéral ne commence qu'au bras. Sans ce repli, il n'aurait aucun repère — et la
    // bibliothèque de poses ne pourrait s'appliquer à aucun modèle importé.
    const r = repereDuCorps({
      bassin: [0, 0, 0], tete: [0, 1.6, 0],
      clavicule_g: [0, 1.3, 0], clavicule_d: [0, 1.3, 0],
      bras_g: [0.25, 1.3, 0], bras_d: [-0.25, 1.3, 0],
    });
    assert.ok(r, 'les bras doivent suffire quand les clavicules ne disent rien');
    assert.ok(Math.abs(r.droite[0] - 1) < 1e-9, `droite mesurée ${JSON.stringify(r.droite)}`);
  });

  test('les clavicules restent prioritaires quand elles sont exploitables', () => {
    // Les deux paires doivent donner le MÊME repère : si l'ordre de préférence changeait quelque
    // chose au résultat, c'est que l'une des deux serait orientée à l'envers.
    const commun = { bassin: [0, 0, 0], tete: [0, 1.6, 0] };
    const parClavicules = repereDuCorps({
      ...commun, clavicule_g: [0.2, 1.3, 0], clavicule_d: [-0.2, 1.3, 0],
      bras_g: [-9, 1.3, 0], bras_d: [9, 1.3, 0],   // volontairement à l'envers : ne doit pas servir
    });
    const parBras = repereDuCorps({ ...commun, bras_g: [0.25, 1.3, 0], bras_d: [-0.25, 1.3, 0] });
    assert.deepEqual(parClavicules, parBras);
  });

  test('sans aucune paire latérale, toujours null', () => {
    assert.equal(repereDuCorps({
      bassin: [0, 0, 0], tete: [0, 1.6, 0], bras_g: [0.2, 1.3, 0],
    }), null, 'un seul bras ne donne pas de direction');
  });
});

describe('coordonnées ↔ vecteur — l\'aller-retour ne perd rien', () => {
  test('un vecteur quelconque revient identique', () => {
    [[1, 0, 0], [0, 0, 1], [0.3, -0.5, 0.81]].forEach(v => {
      const retour = vecteurDepuisRepere(coordonneesDansRepere(v, CORPS_Z), CORPS_Z);
      assert.ok(vecteurProche(retour, v, 1e-12), `aller-retour perdu pour ${v}`);
    });
  });
});

describe('axeEquivalent — LE cœur : le même geste dans un autre corps', () => {
  test('GARANTIE : entre deux corps identiques, l\'axe ne bouge pas', () => {
    // La propriété qui interdit toute déformation gratuite. Si elle tombe, appliquer une pose du
    // rig intégré AU rig intégré la modifierait déjà.
    [[1, 0, 0], [0, 1, 0], [0, 0, 1], [0.3, -0.5, 0.81]].forEach(v => {
      const u = normaliser(v);
      assert.ok(vecteurProche(axeEquivalent(u, CORPS_Y, CORPS_Y), u, 1e-12));
    });
  });

  test('d\'un corps Y-haut vers un corps Z-haut, « vers le haut » suit le corps', () => {
    // Le cas réel : worker_j et le rig Unreal sont en Z-haut, les quatre autres en Y-haut.
    assert.ok(vecteurProche(axeEquivalent([0, 1, 0], CORPS_Y, CORPS_Z), [0, 0, 1], 1e-12));
    assert.ok(vecteurProche(axeEquivalent([1, 0, 0], CORPS_Y, CORPS_Z), [1, 0, 0], 1e-12));
  });

  test('la traduction est RÉVERSIBLE', () => {
    const u = normaliser([0.3, -0.5, 0.81]);
    const aller = axeEquivalent(u, CORPS_Y, CORPS_Z);
    assert.ok(vecteurProche(axeEquivalent(aller, CORPS_Z, CORPS_Y), u, 1e-12));
  });

  test('la traduction préserve les ANGLES entre deux axes', () => {
    // Un changement de base entre repères orthonormés est une isométrie : deux gestes
    // perpendiculaires le restent. C'est ce qui garantit qu'une pose n'est pas « écrasée » en
    // passant d'un corps à l'autre.
    const a = normaliser([1, 0, 0]), b = normaliser([0, 1, 0]);
    const a2 = axeEquivalent(a, CORPS_Y, CORPS_Z), b2 = axeEquivalent(b, CORPS_Y, CORPS_Z);
    const cos = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
    assert.ok(proche(cos(a, b), cos(a2, b2), 1e-12));
  });

  test('un repère manquant rend null plutôt qu\'un axe faux', () => {
    assert.equal(axeEquivalent([1, 0, 0], null, CORPS_Y), null);
    assert.equal(axeEquivalent(null, CORPS_Y, CORPS_Y), null);
  });
});

describe('axeMondeVersLocal — descendre du monde jusqu\'à l\'os', () => {
  test('un os au repos non tourné laisse l\'axe inchangé', () => {
    assert.ok(vecteurProche(axeMondeVersLocal([1, 0, 0], [0, 0, 0, 1]), [1, 0, 0], 1e-12));
  });

  test('un os tourné d\'un quart de tour rend l\'axe DANS SON repère', () => {
    // Rotation de +90° autour de Z : l'axe monde X se lit comme −Y... non : dans le repère de
    // l'os, l'axe monde X devient +Y. On vérifie l'inverse exact, pas une intuition.
    const q = quaternionAxeAngle([0, 0, 1], Math.PI / 2);
    assert.ok(vecteurProche(axeMondeVersLocal([0, 1, 0], q), [1, 0, 0], 1e-9));
  });

  test('l\'opération est bien l\'INVERSE de la rotation de repos', () => {
    // Propriété plutôt qu'exemple : appliquer le repos à ce que rend la fonction doit redonner
    // l'axe monde de départ. Un conjugué pris à l'endroit au lieu de l'envers échouerait ici.
    const q = quaternionAxeAngle(normaliser([0.3, 0.7, -0.2]), 0.9);
    const axeMonde = normaliser([0.2, -0.4, 0.9]);
    const local = axeMondeVersLocal(axeMonde, q);
    // Rotation directe de `local` par q — l'opération inverse, écrite ici indépendamment.
    const [x, y, z, w] = q;
    const ix = w * local[0] + y * local[2] - z * local[1];
    const iy = w * local[1] + z * local[0] - x * local[2];
    const iz = w * local[2] + x * local[1] - y * local[0];
    const iw = -x * local[0] - y * local[1] - z * local[2];
    const retour = [
      ix * w + iw * -x + iy * -z - iz * -y,
      iy * w + iw * -y + iz * -x - ix * -z,
      iz * w + iw * -z + ix * -y - iy * -x,
    ];
    assert.ok(vecteurProche(retour, axeMonde, 1e-9), 'le conjugué a été pris à l\'envers');
  });

  test('un repos absent vaut l\'identité, jamais une exception', () => {
    assert.ok(vecteurProche(axeMondeVersLocal([1, 0, 0], null), [1, 0, 0], 1e-12));
    assert.equal(axeMondeVersLocal(null, [0, 0, 0, 1]), null);
  });
});

describe('quaternionAxeAngle', () => {
  test('un angle nul rend l\'identité', () => {
    assert.ok(vecteurProche(quaternionAxeAngle([0, 1, 0], 0), [0, 0, 0, 1], 1e-12));
  });

  test('RÉGRESSION : un axe inexploitable rend l\'IDENTITÉ, pas un quaternion nul', () => {
    // Un quaternion nul écraserait silencieusement l'orientation de l'os — le membre disparaîtrait
    // ou se replierait sur lui-même, sans message.
    assert.deepEqual(quaternionAxeAngle([0, 0, 0], 1.2), [0, 0, 0, 1]);
    assert.deepEqual(quaternionAxeAngle(null, 1.2), [0, 0, 0, 1]);
    assert.deepEqual(quaternionAxeAngle([0, 1, 0], NaN), [0, 0, 0, 1]);
  });

  test('le quaternion produit est unitaire', () => {
    const q = quaternionAxeAngle(normaliser([1, 2, 3]), 1.1);
    assert.ok(proche(Math.hypot(...q), 1, 1e-12));
  });
});

describe('deltaPourOs — le geste complet', () => {
  test('entre corps identiques et os au repos, on retrouve la rotation d\'origine', () => {
    // Le cas de référence : rien à traduire, rien à corriger. Le résultat doit être exactement la
    // rotation demandée, sinon le rig intégré lui-même serait altéré.
    const q = deltaPourOs({
      axeSource: [1, 0, 0], radians: 0.7,
      repereSource: CORPS_Y, repereCible: CORPS_Y, reposMondeOs: [0, 0, 0, 1],
    });
    assert.ok(vecteurProche(q, quaternionAxeAngle([1, 0, 0], 0.7), 1e-9));
  });

  test('l\'angle est PRÉSERVÉ quel que soit le corps cible', () => {
    // La traduction change l'axe, jamais l'amplitude : un coude plié à 40° doit rester à 40°.
    [CORPS_Y, CORPS_Z].forEach(cible => {
      const q = deltaPourOs({
        axeSource: [1, 0, 0], radians: 0.7,
        repereSource: CORPS_Y, repereCible: cible,
        reposMondeOs: quaternionAxeAngle(normaliser([0.2, 1, 0.3]), 1.4),
      });
      assert.ok(proche(2 * Math.acos(Math.min(1, Math.abs(q[3]))), 0.7, 1e-9),
        'l\'amplitude du geste a changé en traversant le corps');
    });
  });

  test('RÉGRESSION : un ingrédient manquant laisse l\'os AU REPOS', () => {
    // Mieux vaut une articulation immobile qu'une articulation tournée au hasard : la seconde se
    // voit mais ne s'explique pas, et sur un modèle importé on l'attribuera au fichier.
    const identite = [0, 0, 0, 1];
    assert.deepEqual(deltaPourOs({ axeSource: [1, 0, 0], radians: 0.5,
      repereSource: null, repereCible: CORPS_Y, reposMondeOs: identite }), identite);
    assert.deepEqual(deltaPourOs({ axeSource: [0, 0, 0], radians: 0.5,
      repereSource: CORPS_Y, repereCible: CORPS_Y, reposMondeOs: identite }), identite);
    assert.deepEqual(deltaPourOs({}), identite);
  });
});

describe('Le rig intégré n\'est pas un cas particulier', () => {
  test('son repère se mesure avec LA MÊME fonction que celui d\'un modèle importé', () => {
    // C'est ce qui interdit d'écrire des signes à la main. Si le rig intégré changeait
    // d'orientation, ce fichier suivrait sans être touché — et un signe écrit en dur, non.
    const src = readFileSync(new URL('../src/skeleton-retarget.js', import.meta.url), 'utf8');
    assert.doesNotMatch(src, /PERSONA|persona/i,
      'le module connaît le rig intégré par son nom : il en fait un cas particulier');
    assert.equal((src.match(/export function repereDuCorps/g) || []).length, 1,
      'il doit y avoir UNE seule façon de mesurer un repère de corps');
  });
});

/**
 * JOURNAL DE MUTATION — le changement de repère (tâche #310).
 *
 *   W6 deltaPourOs ignore le repère cible (l'axe source est pris tel quel)      ROUGE
 *   W7 deltaPourOs ignore le repos de l'os                                      ROUGE
 *   W8 la garde « axe inconvertible » est retirée                               ÉCHAPPÉE
 *
 * W8 A ÉTÉ CORRIGÉE DANS LE CODE, pas dans les tests : la garde était REDONDANTE.
 * `axeMondeVersLocal` commence par `normaliser`, qui rend `null` sur une entrée nulle, et la garde
 * suivante faisait déjà le travail. Deux gardes pour un seul cas, c'était une de trop — et son seul
 * effet était de rendre l'autre inatteignable par les tests.
 */
