/**
 * tests/skeleton-map.test.mjs — reconnaître un squelette importé.
 *
 * CE FICHIER EST ÉPROUVÉ CONTRE CINQ SQUELETTES RÉELS, pas contre des montages. `tests/fixtures/`
 * contient les os et la hiérarchie de cinq `.glb` fournis par l'utilisateur — noms et arborescence
 * seulement, 140 Ko au lieu de 35 Mo. Un montage inventé aurait respecté les conventions que je
 * connais ; ces cinq-là en respectent quatre différentes.
 *
 *   — squelette-unreal (1126 os) : pelvis, spine_01…05, clavicle_l, upperarm_l, thigh_l, calf_l.
 *     Porte des centaines d'auxiliaires (`FX_`, `_twist_`, `_vol_`) et deux hiérarchies `ik_*`
 *     parallèles au vrai squelette ;
 *   — squelette-maison (109 os) et squelette-vroid-alt (101 os) : Hips, Chest, Left shoulder,
 *     Left arm, Left elbow, Left wrist, Left leg, Left knee, Left ankle. Nomment les os d'après
 *     l'ARTICULATION au-dessus d'eux : « Left leg » est la CUISSE, « Left elbow » l'AVANT-BRAS ;
 *   — squelette-mixamo (65 os) : mixamorig:LeftUpLeg / LeftLeg / LeftForeArm. Converti depuis un
 *     .fbx via Blender — le seul chemin possible, Mixamo n'exportant pas de glTF. Porte 2 clips ;
 *   — squelette-vrm (152 os) : J_Bip_L_UpperArm, J_Bip_L_LowerLeg. Norme humanoïde VRM, la seule
 *     qui nomme par SEGMENT. Porte aussi des chaînes secondaires `J_Sec_` (jupe, poitrine souple)
 *     longues et partant du bassin, comme des jambes.
 *
 * LES DÉFAUTS QUE CES FIXTURES ONT TROUVÉS, et qu'aucun montage n'aurait révélés :
 *
 *   1. les chaînes IK du rig Unreal partent de la racine, en parallèle du vrai squelette. Une règle
 *      « le premier os à trois branches est le bassin » désignait la RACINE, puis rangeait les
 *      chaînes IK dans les jambes : 14 emplacements remplis, tous faux. Corrigé en exigeant une
 *      PAIRE LATÉRALE — une hiérarchie IK ne présente pas de couple gauche/droite au même niveau ;
 *   2. « le cou est la moins fournie des branches de la poitrine » désignait un accessoire de torse
 *      sur le rig maison. Corrigé par l'ABSENCE DE CÔTÉ : un cou n'a pas de côté, un bras si.
 *
 * CE QU'ON N'AFFIRME PAS : que la reconnaissance marche sur tout squelette humanoïde. Cinq fichiers
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
const MIXAMO = charger('squelette-mixamo');
const VRM    = charger('squelette-vrm');
const VROID  = charger('squelette-vroid-alt');

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


// ─────────────────────────────────────────────────────────────────────────────
// Les trois conventions ajoutées, et le mot qui piège
// ─────────────────────────────────────────────────────────────────────────────

describe('inferSkeletonMap — les cinq conventions réunies', () => {
  const TOUS = [
    ['Unreal', UNREAL], ['maison', MAISON], ['Mixamo', MIXAMO], ['VRM', VRM], ['VRoid alt.', VROID],
  ];

  test('les 18 emplacements sont trouvés sur les CINQ', () => {
    TOUS.forEach(([nom, os]) => {
      const r = resumeCorrespondance(inferSkeletonMap(os));
      assert.equal(r.remplis, 18, `${nom} : ${r.remplis}/18`);
    });
  });

  test('aucun côté n\'est jamais interverti, sur aucune convention', () => {
    // La seule faute vraiment coûteuse : elle ne se voit qu'une fois une pose asymétrique appliquée.
    const gauche = /left|_l$|_l_| l$|:l|l_/i, droite = /right|_r$|_r_| r$|:r|r_/i;
    TOUS.forEach(([nom, os]) => {
      const c = inferSkeletonMap(os);
      ['bras', 'avantbras', 'main', 'cuisse', 'jambe', 'pied'].forEach(base => {
        assert.match(c[`${base}_g`].name, gauche, `${nom} : ${base}_g`);
        assert.match(c[`${base}_d`].name, droite, `${nom} : ${base}_d`);
      });
    });
  });
});

describe('RÉGRESSION — « leg » désigne DEUX os différents selon la convention', () => {
  // LA TROUVAILLE DE L'ÉCHANTILLON ÉLARGI, et la meilleure justification de ce module.
  //
  //   Mixamo   : LeftUpLeg = cuisse, LeftLeg = TIBIA
  //   VRoid    : Left leg  = CUISSE, Left knee = tibia
  //
  // Le même mot, deux os différents, dans deux conventions répandues. Aucune table d'alias ne peut
  // trancher : ajouter « leg » aux alias du tibia validerait Mixamo ET casserait VRoid.

  test('chez Mixamo, LeftLeg est le TIBIA', () => {
    const c = inferSkeletonMap(MIXAMO);
    assert.equal(c.cuisse_g.name, 'mixamorig:LeftUpLeg');
    assert.equal(c.jambe_g.name, 'mixamorig:LeftLeg');
  });

  test('chez VRoid, « Left leg » est la CUISSE', () => {
    const c = inferSkeletonMap(VROID);
    assert.equal(c.cuisse_g.name, 'Left leg_085');
    assert.equal(c.jambe_g.name, 'Left knee_090');
  });

  test('les DEUX sont signalées, parce que le nom ne confirme ni l\'une ni l\'autre', () => {
    // La ligne signalée n'est pas un défaut à corriger : c'est le mot ambigu qui se déclare. La
    // faire disparaître en enrichissant les alias reviendrait à valider l'une des deux lectures.
    assert.equal(inferSkeletonMap(MIXAMO).jambe_g.origine, 'structure');
    assert.equal(inferSkeletonMap(VROID).cuisse_g.origine, 'structure');
  });
});

describe('inferSkeletonMap — le rig VRM, seule convention entièrement corroborée', () => {
  const carte = inferSkeletonMap(VRM);

  test('zéro ligne à vérifier', () => {
    // La norme humanoïde VRM nomme ses os d'après le SEGMENT (UpperArm, LowerLeg) : le vocabulaire
    // et la structure disent la même chose. C'est le seul de mes cinq échantillons dans ce cas.
    assert.equal(resumeCorrespondance(carte).aVerifier, 0);
  });

  test('la chaîne complète est reconnue', () => {
    assert.equal(carte.poitrine.name, 'J_Bip_C_UpperChest_06');
    assert.equal(carte.clavicule_g.name, 'J_Bip_L_Shoulder_050');
    assert.equal(carte.cuisse_d.name, 'J_Bip_R_UpperLeg_094');
  });

  test('les os secondaires (J_Sec_ : jupe, poitrine souple) ne prennent aucune place', () => {
    // Ces chaînes sont nombreuses, longues, et partent du bassin comme les jambes.
    SLOTS.forEach(s => assert.doesNotMatch(String(carte[s] && carte[s].name), /J_Sec_/,
      `un os secondaire a été retenu pour « ${s} »`));
  });
});

describe('RÉGRESSION — un rig SANS clavicule (cas prévu par la spécification VRM)', () => {
  // « Les os non obligatoires peuvent être sautés : le parent du bras peut être la poitrine plutôt
  // qu'une clavicule » — spécification humanoïde VRM. AUCUN de mes cinq fichiers n'est dans ce cas.
  // C'est la DOCUMENTATION qui a révélé le trou, pas l'échantillon : descendre en supposant
  // clavicule → bras → avant-bras → main décalait tout d'un cran, en silence.
  const os = [
    { id: 0, name: 'Hips', children: [1, 10, 20] },
    { id: 1, name: 'Spine', children: [2] },
    { id: 2, name: 'Chest', children: [3, 30, 40] },
    { id: 3, name: 'Neck', children: [4] }, { id: 4, name: 'Head', children: [] },
    { id: 30, name: 'LeftUpperArm', children: [31] }, { id: 31, name: 'LeftLowerArm', children: [32] },
    { id: 32, name: 'LeftHand', children: [33] }, { id: 33, name: 'f1', children: [] },
    { id: 40, name: 'RightUpperArm', children: [41] }, { id: 41, name: 'RightLowerArm', children: [42] },
    { id: 42, name: 'RightHand', children: [43] }, { id: 43, name: 'g1', children: [] },
    { id: 10, name: 'LeftUpperLeg', children: [11] }, { id: 11, name: 'LeftLowerLeg', children: [12] },
    { id: 12, name: 'LeftFoot', children: [] },
    { id: 20, name: 'RightUpperLeg', children: [21] }, { id: 21, name: 'RightLowerLeg', children: [22] },
    { id: 22, name: 'RightFoot', children: [] },
  ];
  const carte = inferSkeletonMap(os);

  test('le bras reste le bras — rien n\'est décalé', () => {
    assert.equal(carte.bras_g.name, 'LeftUpperArm');
    assert.equal(carte.avantbras_g.name, 'LeftLowerArm');
    assert.equal(carte.main_g.name, 'LeftHand');
  });

  test('l\'emplacement clavicule reste VIDE, ce qui est la vérité', () => {
    assert.equal(carte.clavicule_g, null);
    assert.equal(carte.clavicule_d, null);
    assert.equal(resumeCorrespondance(carte).remplis, 16);
  });

  test('RÉGRESSION : un cou de deux os est quand même trouvé', () => {
    // Le filtre de profondeur, calibré pour les rigs bruités, jetait le cou des rigs sobres :
    // « Neck → Head » ne fait qu'un cran. La recherche du cou s'en passe désormais.
    assert.equal(carte.cou.name, 'Neck');
    assert.equal(carte.tete.name, 'Head');
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
 * M7 ÉTAIT ASSUMÉE, ELLE NE L'EST PLUS. J'avais conservé le filtre de profondeur sans justification,
 * en notant qu'un troisième squelette trancherait. Il a tranché : cf. N2 ci-dessous.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SECONDE CAMPAGNE — après l'élargissement à cinq conventions et la lecture de la spécification.
 *
 *   N1 clavicule toujours supposée présente                            ROUGE
 *   N2 filtre de profondeur ramené à 1                                 ROUGE (6 tests)
 *   N3 le cou repasse par le filtre de profondeur                      ROUGE
 *   N4 alias « leg » ajouté au tibia                                   ROUGE
 *
 * N2 RÈGLE LA QUESTION LAISSÉE OUVERTE. Le rig Unreal exige ce filtre : ramené à 1, la poitrine est
 * trouvée quatre vertèbres trop bas et le cou devient `spine_04`. Ce que deux squelettes ne
 * justifiaient pas, un cinquième l'impose. La note « à supprimer si rien ne le justifie » a fait son
 * travail : elle a tenu la question ouverte jusqu'à ce qu'une mesure y réponde.
 *
 * N3 EST L'AUTRE MOITIÉ DE LA MÊME LEÇON : ce filtre est nécessaire pour trouver une paire de
 * membres au milieu du bruit, et NUISIBLE pour trouver un cou de deux os. Un seuil unique appliqué
 * partout se trompait forcément quelque part.
 *
 * N4 EST LA PLUS INSTRUCTIVE. Ajouter « leg » aux alias du tibia fait disparaître les deux lignes
 * signalées de Mixamo — ça a tout l'air d'une amélioration. Un seul test tombe : celui de VRoid, où
 * « Left leg » est la cuisse. Le mot est irrémédiablement ambigu entre deux conventions répandues,
 * et aucune table d'alias ne peut le trancher. La ligne signalée n'est pas un défaut à corriger.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Ce que l'écran de correspondance affiche
// ─────────────────────────────────────────────────────────────────────────────

import { SLOT_GROUPS, slotLabel, bonesFromObject3D } from '../src/skeleton-map.js';

describe('SLOT_GROUPS — les 18 emplacements, groupés pour être lus', () => {
  test('RÉGRESSION : les groupes couvrent TOUS les emplacements, sans doublon', () => {
    // Deux énumérations du même ensemble — SLOTS pour la reconnaissance, SLOT_GROUPS pour
    // l'affichage. C'est la première famille de défaut de ce dépôt : un emplacement ajouté à l'une
    // et pas à l'autre disparaîtrait de l'écran sans que rien ne le signale.
    const affiches = SLOT_GROUPS.flatMap(g => g.slots);
    assert.deepEqual(affiches.slice().sort(), SLOTS.slice().sort());
    assert.equal(new Set(affiches).size, affiches.length, 'un emplacement apparaît deux fois');
  });

  test('chaque groupe a un titre bilingue', () => {
    SLOT_GROUPS.forEach(g => {
      assert.equal(g.titre.length, 2, `titre incomplet : ${g.slots[0]}`);
      g.titre.forEach(t => assert.ok(t && t.length, 'titre vide'));
    });
  });

  test('l\'ordre est anatomique : le tronc d\'abord, puis les membres', () => {
    assert.deepEqual(SLOT_GROUPS[0].slots, ['bassin', 'poitrine', 'cou', 'tete']);
  });
});

describe('slotLabel — nommer un rôle sans répéter son côté', () => {
  const FR = (en, fr) => fr;

  test('le côté n\'apparaît pas dans le libellé : le groupe le porte', () => {
    assert.equal(slotLabel('bras_g', FR), 'Bras');
    assert.equal(slotLabel('bras_d', FR), 'Bras');
    assert.equal(slotLabel('cuisse_g', FR), 'Cuisse');
  });

  test('les deux langues existent', () => {
    assert.equal(slotLabel('tete', (en) => en), 'Head');
    assert.equal(slotLabel('tete', FR), 'Tête');
  });

  test('RÉGRESSION : chaque emplacement a un libellé, aucun ne retombe sur sa clé', () => {
    // Un emplacement sans libellé afficherait « avantbras_g » à l'utilisateur. Le repli existe pour
    // ne pas lever, pas pour être vu.
    SLOTS.forEach(s => {
      const l = slotLabel(s, FR);
      assert.notEqual(l, s, `« ${s} » n'a pas de libellé`);
      assert.doesNotMatch(l, /_[gd]$/, `« ${s} » : le côté fuit dans le libellé`);
    });
  });

  test('une clé inconnue ne lève pas', () => {
    assert.equal(slotLabel('inventé', FR), 'inventé');
    assert.equal(slotLabel(null, FR), '');
  });
});

describe('bonesFromObject3D — extraire les os d\'une scène décodée', () => {
  // Objets factices : la fonction ne lit que `isBone`, `uuid`, `name`, `children`. C'est ce qui la
  // rend testable sans Three ni WebGL — et c'est aussi ce qui permet à toute la reconnaissance
  // d'être éprouvée contre cinq rigs réels sans décoder un seul octet.
  const os = (uuid, name, children = []) => ({ isBone: true, uuid, name, children });
  const maillage = (children = []) => ({ isMesh: true, uuid: 'm', name: 'mesh', children });

  test('les os sont trouvés même sous des nœuds qui n\'en sont pas', () => {
    const racine = { uuid: 'r', name: 'racine', children: [maillage([os('a', 'Hips', [os('b', 'Spine')])])] };
    const r = bonesFromObject3D(racine);
    assert.deepEqual(r.map(o => o.name), ['Hips', 'Spine']);
  });

  test('seuls les enfants OS sont recensés comme enfants', () => {
    // Un maillage accroché à un os ne doit pas devenir une branche du squelette : la reconnaissance
    // compterait alors des « chaînes » qui n'existent pas.
    const r = bonesFromObject3D(os('a', 'Hips', [maillage(), os('b', 'Spine')]));
    assert.deepEqual(r.find(o => o.id === 'a').children, ['b']);
  });

  test('un os partagé par deux peaux n\'est compté qu\'une fois', () => {
    const partage = os('x', 'Hips');
    const r = bonesFromObject3D({ uuid: 'r', children: [partage, { uuid: 'g', children: [partage] }] });
    assert.equal(r.filter(o => o.id === 'x').length, 1);
  });

  test('une scène sans os rend une liste vide, sans lever', () => {
    [null, undefined, { children: [] }, maillage()].forEach(x =>
      assert.deepEqual(bonesFromObject3D(x), []));
  });
});
