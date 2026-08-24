/**
 * tests/pose-bridge.test.mjs, le passage entre les deux vocabulaires de pose.
 *
 * CE QUI EST COUVERT ICI : la table articulation ↔ emplacement (dans les DEUX sens, parce qu'une
 * énumération tenue à la main est la panne la plus fréquente de ce dépôt), l'ordre de composition
 * des axes, et la traduction elle-même sur des repères construits à la main.
 *
 * CE QUI NE L'EST PAS : le rendu WebGL, et la MESURE des repères sur de vrais fichiers `.glb`, les
 * six fichiers d'essai ne sont pas versionnés (cf. docs/imported-skeletons.md), et Three ne construit
 * pas de renderer sous Node. Les repères sont donc fournis en dur ici : ce qu'on vérifie, c'est le
 * calcul, pas la lecture du disque.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { POSE_HANDLES } from '../src/constants.js';
import { SLOTS } from '../src/skeleton-map.js';
import { SLOTS_NON_POSABLES, quaternionDepuisEuler } from '../src/skeleton-pose.js';
import {
  EMPLACEMENT_PAR_ARTICULATION, curseursOrdonnesParAxe, jointsDepuisOsMappes,
  poseOsDepuisPosePersonnage,
} from '../src/pose-bridge.js';

const REPERE_IDENTITE = { droite: [1, 0, 0], haut: [0, 1, 0], avant: [0, 0, 1] };
// Un corps dont la verticale est +Z : ce n'est pas une hypothèse d'école : `hulk_-_sm_bnd.glb` et
// `worker_j.glb` sont exactement dans ce cas (cf. docs/imported-skeletons.md §4).
const REPERE_VERTICAL_Z = { droite: [1, 0, 0], haut: [0, 0, 1], avant: [0, -1, 0] };

const IDENTITE = [0, 0, 0, 1];
const reposTous = () => Object.fromEntries(SLOTS.map(s => [s, IDENTITE]));

const presque = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg} : ${a} ≠ ${b}`);

// ─────────────────────────────────────────────────────────────────────────────
// La table, dans les deux sens
// ─────────────────────────────────────────────────────────────────────────────

test('chaque articulation du Personnage a son emplacement', () => {
  const manquantes = POSE_HANDLES
    .map(d => d.id)
    .filter(id => !EMPLACEMENT_PAR_ARTICULATION[id]);
  assert.deepEqual(manquantes, [],
    'une articulation sans ligne dans la table resterait sans effet sur les modèles importés, en silence');
});

test('chaque emplacement posable est atteint, et une seule fois', () => {
  const posables = SLOTS.filter(s => !SLOTS_NON_POSABLES.includes(s));
  const atteints = Object.values(EMPLACEMENT_PAR_ARTICULATION);
  assert.deepEqual([...atteints].sort(), [...posables].sort());
  assert.equal(new Set(atteints).size, atteints.length,
    'deux articulations sur le même os : la seconde écraserait la première');
});

test('le bassin n\'est piloté par aucune articulation', () => {
  // C\'est la racine du squelette : la tourner ferait pivoter la figure entière, ce que
  // l\'Orientation de l\'Élément fait déjà. Le Personnage n\'a pas non plus de curseur pour lui.
  assert.ok(!Object.values(EMPLACEMENT_PAR_ARTICULATION).includes('bassin'));
});

test('tous les emplacements cités existent vraiment', () => {
  Object.entries(EMPLACEMENT_PAR_ARTICULATION).forEach(([id, slot]) => {
    assert.ok(SLOTS.includes(slot), `${id} pointe sur « ${slot} », qui n'est pas un emplacement`);
  });
});

test('gauche va à gauche, droite va à droite', () => {
  // LE DÉFAUT QUE LA COMPLÉTUDE NE VOIT PAS. Une table où `lElbow` pointerait sur `avantbras_d` est
  // parfaitement complète et parfaitement bijective, elle produirait simplement un modèle importé
  // qui lève le mauvais bras, en miroir de ce que montre le Personnage. Les deux vocabulaires
  // portent le côté dans leur nom (`l`/`r` d'un côté, `_g`/`_d` de l'autre) : autant s'en servir.
  Object.entries(EMPLACEMENT_PAR_ARTICULATION).forEach(([id, slot]) => {
    const coteArticulation = /^l[A-Z]/.test(id) ? 'g' : /^r[A-Z]/.test(id) ? 'd' : null;
    const coteEmplacement = /_g$/.test(slot) ? 'g' : /_d$/.test(slot) ? 'd' : null;
    assert.equal(coteArticulation, coteEmplacement, `${id} → ${slot} : les côtés ne concordent pas`);
  });
});

test('la carte des poignées se dérive des os mappés, sans table nouvelle', () => {
  // Le dessin des points d'articulation lit `entry.joints[def.group]`, où `def.group` nomme un
  // groupe du rig intégré. Pour poser ces points sur un modèle importé il faut la même forme,
  // remplie d'os, et le seul lien manquant était articulation → emplacement, que la table
  // ci-dessus tient déjà. Une seconde correspondance groupe → emplacement aurait été l'énumération
  // parallèle de trop.
  const osMappes = Object.fromEntries(
    Object.values(EMPLACEMENT_PAR_ARTICULATION).map(slot => [slot, { os: { nom: slot } }]));
  const { joints, osImportes } = jointsDepuisOsMappes(osMappes);
  assert.equal(osImportes, true, 'le dessin doit savoir qu\'il s\'agit d\'os, pas du rig intégré');
  POSE_HANDLES.forEach(def => {
    assert.ok(joints[def.group], `aucune articulation pour la poignée « ${def.id} »`);
    assert.equal(joints[def.group].nom, EMPLACEMENT_PAR_ARTICULATION[def.id]);
  });
});

test('un os absent du fichier ne laisse pas de poignée fantôme', () => {
  // Une entrée présente mais vide ferait projeter un point sur `undefined` : le disque
  // apparaîtrait au centre du canevas, attrapable, et ne piloterait rien.
  const { joints } = jointsDepuisOsMappes({ tete: { os: {} }, bras_g: {} });
  assert.deepEqual(Object.keys(joints), ['headGroup']);
  assert.deepEqual(Object.keys(jointsDepuisOsMappes(null).joints), []);
});

// ─────────────────────────────────────────────────────────────────────────────
// L'ordre de composition
// ─────────────────────────────────────────────────────────────────────────────

test('l\'ordre des curseurs est bien imposé, et pas seulement hérité', () => {
  // Les descripteurs réels se trouvent DÉJÀ dans l'ordre X, Y, Z : un test qui ne regarderait
  // qu'eux passerait même si le tri était retiré, et ne protégerait donc rien. On fabrique ici un
  // descripteur volontairement à l'envers pour que le tri soit la seule chose qui puisse le
  // remettre d'aplomb.
  const alEnvers = { id: 'faux', mode: 'hinge2', fieldV: 'fauxRotZ', fieldH: 'fauxRotX' };
  assert.deepEqual(curseursOrdonnesParAxe(alEnvers).map(c => c.axe), ['x', 'z']);
});

test('les curseurs d\'une articulation sont composés dans l\'ordre X, Y, Z', () => {
  POSE_HANDLES.forEach(def => {
    const axes = curseursOrdonnesParAxe(def).map(c => c.axe);
    assert.deepEqual(axes, [...axes].sort(), `${def.id} : ordre ${axes.join(',')}`);
  });
});

test('une articulation à trois axes en fournit bien trois', () => {
  const tete = POSE_HANDLES.find(d => d.id === 'head');
  assert.deepEqual(curseursOrdonnesParAxe(tete).map(c => c.axe), ['x', 'y', 'z']);
});

// ─────────────────────────────────────────────────────────────────────────────
// La traduction
// ─────────────────────────────────────────────────────────────────────────────

test('deux corps identiques : la pose ressort inchangée', () => {
  // LE TEST QUI COMPTE LE PLUS. Si les deux repères coïncident et que l'os est au repos identité,
  // traduire ne doit RIEN changer, sans quoi le module déformerait gratuitement, et personne ne
  // pourrait dire de combien.
  const sortie = poseOsDepuisPosePersonnage({
    joints: { headRotX: 0.3, headRotY: -0.2, headRotZ: 0.1, lKnee: 0.7 },
    repereSource: REPERE_IDENTITE, repereCible: REPERE_IDENTITE,
    reposMondeParEmplacement: reposTous(),
  });
  presque(sortie.tete.x, 0.3, 'tête X');
  presque(sortie.tete.y, -0.2, 'tête Y');
  presque(sortie.tete.z, 0.1, 'tête Z');
  presque(sortie.jambe_g.x, 0.7, 'genou gauche');
  presque(sortie.jambe_g.y, 0, 'le genou ne gagne pas d\'axe');
  presque(sortie.jambe_g.z, 0, 'le genou ne gagne pas d\'axe');
});

test('un corps dont la verticale est +Z reçoit le geste sur son propre axe', () => {
  const sortie = poseOsDepuisPosePersonnage({
    joints: { headRotY: 0.5 },   // « tourner la tête », autour du haut du corps
    repereSource: REPERE_IDENTITE, repereCible: REPERE_VERTICAL_Z,
    reposMondeParEmplacement: reposTous(),
  });
  presque(sortie.tete.x, 0, 'aucune composante X');
  presque(sortie.tete.y, 0, 'aucune composante Y');
  presque(sortie.tete.z, 0.5, 'le geste est passé sur Z, la verticale de ce corps-là');
});

test('la rotation de repos de l\'os est prise en compte', () => {
  // Os couché de 90° autour de X : la verticale du monde tombe sur son axe −Z local.
  const repos = reposTous();
  repos.tete = quaternionDepuisEuler(Math.PI / 2, 0, 0);
  const sortie = poseOsDepuisPosePersonnage({
    joints: { headRotY: 0.4 },
    repereSource: REPERE_IDENTITE, repereCible: REPERE_IDENTITE,
    reposMondeParEmplacement: repos,
  });
  presque(sortie.tete.x, 0, 'aucune composante X');
  presque(sortie.tete.y, 0, 'aucune composante Y');
  presque(sortie.tete.z, -0.4, 'le geste est exprimé dans les axes de l\'os, pas dans ceux du monde');
});

test('un os absent du fichier est sauté, pas reporté ailleurs', () => {
  const repos = reposTous();
  delete repos.clavicule_g;
  const sortie = poseOsDepuisPosePersonnage({
    joints: { lClavicleRotX: 0.5, lShoulder: { x: 0.2, z: 0 } },
    repereSource: REPERE_IDENTITE, repereCible: REPERE_IDENTITE,
    reposMondeParEmplacement: repos,
  });
  assert.ok(!('clavicule_g' in sortie), 'aucune entrée pour un os introuvable');
  presque(sortie.bras_g.x, 0.2, 'l\'épaule, elle, reçoit bien son angle et RIEN de plus');
});

test('une pose sans angle ne produit aucune entrée', () => {
  const sortie = poseOsDepuisPosePersonnage({
    joints: {}, repereSource: REPERE_IDENTITE, repereCible: REPERE_IDENTITE,
    reposMondeParEmplacement: reposTous(),
  });
  assert.deepEqual(sortie, {},
    'skeletonPose3d doit rester creux : orientationFinale rend alors le repos au bit près');
});

test('sans repère, rien n\'est traduit', () => {
  // Un corps dont le repère n'est pas dérivable ne reçoit AUCUN geste, plutôt qu'un geste au hasard.
  assert.deepEqual(poseOsDepuisPosePersonnage({
    joints: { headRotX: 1 }, repereSource: null, repereCible: REPERE_IDENTITE,
    reposMondeParEmplacement: reposTous(),
  }), {});
  assert.deepEqual(poseOsDepuisPosePersonnage({
    joints: { headRotX: 1 }, repereSource: REPERE_IDENTITE, repereCible: null,
    reposMondeParEmplacement: reposTous(),
  }), {});
});

test('les rotules sont lues sur leurs deux axes', () => {
  const sortie = poseOsDepuisPosePersonnage({
    joints: { rHip: { x: 0.3, z: -0.25 } },
    repereSource: REPERE_IDENTITE, repereCible: REPERE_IDENTITE,
    reposMondeParEmplacement: reposTous(),
  });
  presque(sortie.cuisse_d.x, 0.3, 'hanche droite, avant/arrière');
  presque(sortie.cuisse_d.z, -0.25, 'hanche droite, écart');
});

test('les angles ne sont pas arrondis au degré en chemin', () => {
  // Le brouillon des curseurs est arrondi pour l'affichage ; la traduction, elle, compose des
  // rotations, et un arrondi avant composition ferait dériver toute la chaîne.
  const petit = 0.001;   // ≈ 0,057°, disparaîtrait entièrement avec un arrondi au degré
  const sortie = poseOsDepuisPosePersonnage({
    joints: { headRotX: petit },
    repereSource: REPERE_IDENTITE, repereCible: REPERE_IDENTITE,
    reposMondeParEmplacement: reposTous(),
  });
  presque(sortie.tete.x, petit, 'l\'angle traverse intact');
});

/**
 * JOURNAL DE MUTATION : le pont entre les deux vocabulaires de pose (tâche #310).
 *
 *   W9  les curseurs ne sont plus ordonnés par axe                              ROUGE
 *   W10 une rotation nulle compose quand même                                   ROUGE
 *   W11 un os sans repos connu est posé quand même                              ROUGE
 *   W12 l'ordre du produit de quaternions est inversé                           ROUGE
 *
 * W9 et W12 gardent la même propriété par deux portes : la composition de rotations n'est PAS
 * commutative. L'ordre des curseurs (x, puis y, puis z) et l'ordre du produit décrivent ensemble
 * un geste unique ; intervertir l'un ou l'autre donne un corps posé différemment, sans qu'aucune
 * erreur ne soit levée nulle part.
 */
