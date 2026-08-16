/**
 * tests/skeleton-map.test.mjs — reconnaître un squelette importé.
 *
 * CE FICHIER EST ÉPROUVÉ CONTRE DEUX SQUELETTES RÉELS, pas contre des montages. `tests/fixtures/`
 * contient les os et la hiérarchie de deux `.glb` de l'utilisateur — noms et arborescence
 * seulement, 110 Ko au lieu de 22 Mo. Un montage inventé aurait respecté les conventions que je
 * connais ; ces deux-là n'en respectent qu'une seule, et pas la même.
 *
 *   — squelette-unreal (1126 os) : pelvis, spine_01…05, clavicle_l, upperarm_l, thigh_l, calf_l.
 *     Porte en plus des centaines d'auxiliaires (`FX_`, `_twist_`, `_vol_`) et deux hiérarchies
 *     `ik_*` parallèles au vrai squelette ;
 *   — squelette-maison (109 os) : Hips, Chest, Left_shoulder, Left_arm, Left_elbow, Left_wrist,
 *     Left_leg, Left_knee, Left_ankle. Nomme les os d'après l'ARTICULATION au-dessus d'eux :
 *     « Left_leg » est la CUISSE, « Left_elbow » est l'AVANT-BRAS.
 *
 * LES DEUX DÉFAUTS QUE CES FIXTURES ONT TROUVÉS, et qu'aucun montage n'aurait révélés :
 *
 *   1. les chaînes IK du rig Unreal partent de la racine, en parallèle du vrai squelette. Une règle
 *      « le premier os à trois branches est le bassin » désignait la RACINE, puis rangeait les
 *      chaînes IK dans les jambes : 14 emplacements remplis, tous faux. Corrigé en exigeant une
 *      PAIRE LATÉRALE — une hiérarchie IK ne présente pas de couple gauche/droite au même niveau ;
 *   2. « le cou est la moins fournie des branches de la poitrine » désignait un accessoire de torse
 *      sur le rig maison. Corrigé par l'ABSENCE DE CÔTÉ : un cou n'a pas de côté, un bras si.
 *
 * CE QU'ON N'AFFIRME PAS : que la reconnaissance marche sur tout squelette humanoïde. Deux fichiers
 * ne font pas une preuve. Ce qui est garanti, c'est qu'elle marche sur ceux-là, et que toute
 * proposition non corroborée par le nom est SIGNALÉE — c'est cette signalisation, pas le taux de
 * réussite, qui rend l'automatisme acceptable.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  inferSkeletonMap, resumeCorrespondance, coteDuNom, normaliserNom, SLOTS,
} from '../src/skeleton-map.js';

const charger = (nom) => {
  const d = JSON.parse(readFileSync(new URL(`fixtures/${nom}.json`, import.meta.url), 'utf8'));
  return d.os.map(o => ({ id: o.i, name: o.name, children: o.children }));
};
const UNREAL = charger('squelette-unreal');
const MAISON = charger('squelette-maison');

describe('coteDuNom — le nom est fiable pour le CÔTÉ, et pour lui seul', () => {
  test('les trois conventions se reconnaissent', () => {
    ['LeftArm', 'mixamorig:LeftForeArm', 'upper_arm.L', 'thigh_l_0566', 'L_hand']
      .forEach(n => assert.equal(coteDuNom(n), 'g', n));
    ['RightArm', 'upper_arm.R', 'calf_r_0601', 'R_hand']
      .forEach(n => assert.equal(coteDuNom(n), 'd', n));
  });

  test('RÉGRESSION : un os nommé « leg » n\'est pas à gauche', () => {
    // Le « l » de « leg », « pelvis », « clavicle »… Chercher la lettre plutôt qu'un motif ancré
    // latéraliserait la moitié du squelette, et un membre attribué au mauvais côté ne lève rien.
    ['leg', 'pelvis', 'clavicle', 'spine_01', 'Hips', 'Chest'].forEach(n =>
      assert.equal(coteDuNom(n), null, `${n} a reçu un côté`));
  });

  test('le préfixe de rig est ignoré', () => {
    assert.equal(normaliserNom('mixamorig:LeftForeArm'), 'leftforearm');
    assert.equal(normaliserNom('upper_arm.L'), 'upperarml');
  });
});

describe('inferSkeletonMap — le rig Unreal (1126 os, auxiliaires et chaînes IK)', () => {
  const carte = inferSkeletonMap(UNREAL);

  test('les 18 emplacements sont trouvés', () => {
    const r = resumeCorrespondance(carte);
    assert.equal(r.remplis, 18, `${r.remplis}/18 seulement`);
  });

  test('RÉGRESSION : le bassin est pelvis, PAS la racine porteuse des chaînes IK', () => {
    // Le défaut d'origine, et le plus coûteux : root_016 porte pelvis + ik_foot_root + ik_hand_root,
    // soit trois branches longues. La règle naïve s'arrêtait là et rangeait les chaînes IK dans les
    // jambes. Dix-huit emplacements remplis, dix-huit faux, et rien pour le dire.
    assert.equal(carte.bassin.name, 'pelvis_017');
    SLOTS.forEach(s => assert.doesNotMatch(String(carte[s] && carte[s].name), /^ik_/,
      `une chaîne IK a été retenue pour « ${s} »`));
  });

  test('les membres suivent la convention Unreal, de bout en bout', () => {
    assert.equal(carte.bras_g.name, 'upperarm_l_024');
    assert.equal(carte.avantbras_g.name, 'lowerarm_l_025');
    assert.equal(carte.main_g.name, 'hand_l_026');
    assert.equal(carte.cuisse_d.name, 'thigh_r_0600');
    assert.equal(carte.jambe_d.name, 'calf_r_0601');
    assert.equal(carte.pied_d.name, 'foot_r_0605');
  });

  test('RÉGRESSION : la tête traverse une chaîne de cou à deux segments', () => {
    // neck_01 → neck_02 → head. L'enfant immédiat du cou donnait neck_02 : signalé, mais faux.
    assert.equal(carte.tete.name, 'head_0174');
    assert.equal(carte.cou.name, 'neck_01_0172');
  });

  test('aucun os auxiliaire ne se glisse dans un emplacement', () => {
    // FX_, _twist_, _vol_, _end : des centaines d'os courts accrochés aux vraies articulations.
    SLOTS.forEach(s => {
      const n = String(carte[s] && carte[s].name);
      assert.doesNotMatch(n, /^fx_|_twist_|_vol_|_end$|socket/i, `« ${s} » a retenu un auxiliaire : ${n}`);
    });
  });
});

describe('inferSkeletonMap — le rig maison (os nommés d\'après l\'articulation)', () => {
  const carte = inferSkeletonMap(MAISON);

  test('les 18 emplacements sont trouvés', () => {
    assert.equal(resumeCorrespondance(carte).remplis, 18);
  });

  test('RÉGRESSION : « Left_leg » est reconnu comme la CUISSE, pas comme le tibia', () => {
    // Le cas qui a motivé tout ce fichier. La recherche par nom rangeait Left_leg dans le tibia
    // parce que le mot « leg » y figurait — et le personnage se serait tordu sans un message.
    // La structure tranche : Hips → Left_leg → Left_knee → Left_ankle.
    assert.equal(carte.cuisse_g.name, 'Left_leg_02');
    assert.equal(carte.jambe_g.name, 'Left_knee_03');
    assert.equal(carte.pied_g.name, 'Left_ankle_04');
  });

  test('RÉGRESSION : cette cuisse est SIGNALÉE comme non confirmée par le nom', () => {
    // La signalisation vaut autant que la correction : c'est elle qui envoie l'utilisateur
    // vérifier la seule ligne que le vocabulaire du fichier contredisait.
    assert.equal(carte.cuisse_g.origine, 'structure');
    assert.equal(carte.cuisse_d.origine, 'structure');
    assert.equal(carte.jambe_g.origine, 'nom', 'le genou, lui, est corroboré par son nom');
  });

  test('RÉGRESSION : le cou n\'est pas un accessoire de torse', () => {
    // « la branche la moins fournie de la poitrine » désignait une chaîne décorative. Un cou n'a
    // pas de côté ; un bras en a un. C'est cette absence qui le distingue, pas sa taille.
    assert.equal(carte.cou.name, 'Neck_036');
    assert.equal(carte.tete.name, 'Head_038');
  });

  test('« Left_elbow » est l\'avant-bras, et « Left_wrist » la main', () => {
    assert.equal(carte.avantbras_g.name, 'Left_elbow_020');
    assert.equal(carte.main_g.name, 'Left_wrist_021');
  });

  test('les côtés ne sont jamais intervertis', () => {
    ['clavicule', 'bras', 'avantbras', 'main', 'cuisse', 'jambe', 'pied'].forEach(base => {
      assert.match(carte[`${base}_g`].name, /^Left/, `${base}_g n'est pas à gauche`);
      assert.match(carte[`${base}_d`].name, /^Right/, `${base}_d n'est pas à droite`);
    });
  });
});

describe('inferSkeletonMap — entrées qui ne sont pas des humanoïdes', () => {
  test('une liste vide, absurde ou trop courte rend des emplacements vides, sans lever', () => {
    [undefined, null, [], [{ id: 1, name: 'seul', children: [] }]].forEach(x => {
      let c;
      assert.doesNotThrow(() => { c = inferSkeletonMap(x); }, `entrée : ${JSON.stringify(x)}`);
      assert.equal(resumeCorrespondance(c).remplis, 0);
    });
  });

  test('RÉGRESSION : un squelette sans paire latérale ne remplit RIEN', () => {
    // Un serpent, une caméra sur bras articulé, une chaîne quelconque. Remplir au hasard serait le
    // pire résultat possible : l'utilisateur croirait à une reconnaissance et poserait des angles
    // sur des os arbitraires. Mieux vaut zéro, qui envoie vers « poser les os à la main ».
    const chaine = Array.from({ length: 12 }, (_, i) => ({ id: i, name: `seg${i}`, children: i < 11 ? [i + 1] : [] }));
    assert.equal(resumeCorrespondance(inferSkeletonMap(chaine)).remplis, 0);
  });

  test('un squelette sans nom de côté ne remplit rien non plus, plutôt que d\'inventer', () => {
    // Deux jambes indiscernables : on ne peut pas dire laquelle est laquelle. Choisir au hasard
    // donnerait un personnage dont la gauche et la droite sont peut-être inversées — invisible
    // jusqu'à ce qu'une pose asymétrique soit appliquée.
    const os = [
      { id: 0, name: 'racine', children: [1] },
      { id: 1, name: 'bassin', children: [2, 5, 8] },
      { id: 2, name: 'jambeA', children: [3] }, { id: 3, name: 'A2', children: [4] }, { id: 4, name: 'A3', children: [] },
      { id: 5, name: 'jambeB', children: [6] }, { id: 6, name: 'B2', children: [7] }, { id: 7, name: 'B3', children: [] },
      { id: 8, name: 'colonne', children: [9] }, { id: 9, name: 'c2', children: [10] }, { id: 10, name: 'c3', children: [] },
    ];
    assert.equal(resumeCorrespondance(inferSkeletonMap(os)).remplis, 0);
  });
});

describe('resumeCorrespondance — le chiffre affiché à l\'utilisateur', () => {
  test('il compte les emplacements remplis ET ceux à vérifier', () => {
    const r = resumeCorrespondance(inferSkeletonMap(MAISON));
    assert.equal(r.total, 18);
    assert.equal(r.remplis, 18);
    assert.equal(r.aVerifier, 2, 'les deux cuisses sont les seules non corroborées par le nom');
  });

  test('une carte vide ou absente ne lève pas', () => {
    [null, undefined, {}].forEach(c =>
      assert.deepEqual(resumeCorrespondance(c), { total: 18, remplis: 0, aVerifier: 0 }));
  });
});

/**
 * JOURNAL DE MUTATION.
 *
 *   M1 seuil de taille relatif supprimé                                ÉCHAPPÉE → code retiré
 *   M2 le cou repris comme « la branche la moins fournie »             ROUGE
 *   M3 la tête prise comme enfant immédiat du cou                      ROUGE
 *   M4 côté déduit par recherche de la lettre « l »                    ROUGE
 *   M5 paire latérale absente : on prend les deux premières branches   ÉCHAPPÉE — équivalente
 *   M6 origine 'structure' remplacée par 'nom' partout                 ROUGE
 *   M7 filtre de profondeur des branches ramené à 0                    ÉCHAPPÉE — assumée
 *
 * M6 EST LA PLUS IMPORTANTE et ne change AUCUN os retenu : elle ne fait que mentir sur la
 * provenance. Sans elle, rien ne garderait la seule chose qui rend cet automatisme acceptable —
 * qu'une proposition non corroborée par le nom soit visible comme telle.
 *
 * M1 A ÉCHAPPÉ, ET J'AVAIS TORT. J'avais écrit — ici et dans le module — que le seuil relatif était
 * ce qui écartait les chaînes IK. La mutation prouve le contraire : le retirer ne fait échouer
 * aucun test. Ce qui les écarte réellement, c'est l'exigence de paire latérale. Le seuil était un
 * nombre que j'avais choisi (3 %) et que rien ne justifiait : il a été SUPPRIMÉ, pas conservé avec
 * un commentaire arrangé. Les deux explications fausses ont été corrigées.
 *
 * M5 EST UNE MUTATION ÉQUIVALENTE, et il faut le dire plutôt que la maquiller. Remplacer la garde
 * par « prendre les deux premières branches » ne change rien, parce que la boucle de descente ne
 * s'arrête QUE sur une paire latérale : sans paire, elle descend jusqu'à une feuille et la liste
 * est vide de toute façon. La garde reste — elle protège le cas où la boucle sort par épuisement —
 * mais aucun test ne peut la distinguer, et prétendre le contraire serait faux.
 *
 * M7 EST ASSUMÉE : le filtre de profondeur ne se justifie sur aucun des deux squelettes mesurés.
 * Conservé, avec cette mesure écrite dans le module. Un troisième squelette tranchera.
 */
