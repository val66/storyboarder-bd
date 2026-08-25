/**
 * tests/skeleton-creatures.test.mjs, la reconnaissance face à ce qui n'est pas humanoïde.
 *
 * CE FICHIER N'ÉPINGLE PAS UN COMPORTEMENT CORRECT. Il épingle le comportement ACTUEL, fautes
 * comprises, sur DOUZE créatures réelles fournies par l'utilisateur. C'est un filet, pas un satisfecit.
 *
 * POURQUOI ÉCRIRE DES TESTS QUI CONSACRENT DES ERREURS. La reconnaissance a été écrite pour des
 * humanoïdes et le dit. Confrontée à un cerbère ou à une araignée, elle ne se contente pas
 * d'échouer, elle SE TROMPE : elle remplit ses dix-huit emplacements avec ce qu'elle trouve. Avant
 * de la généraliser, il faut savoir exactement ce qu'elle produit aujourd'hui sur chaque fichier,
 * sans quoi une « amélioration » pourrait dégrader un cas sans que personne le voie. Chaque
 * assertion ci-dessous porte donc en commentaire ce qui est juste et ce qui ne l'est pas, et les
 * valeurs sont destinées à CHANGER, délibérément, quand la reconnaissance progressera.
 *
 * LES SIX SQUELETTES HUMANOÏDES restent dans skeleton-map.test.mjs, et eux ne doivent pas bouger.
 * C'est la contrainte de non-régression du chantier.
 *
 * CE QUE CES FICHIERS APPRENNENT, et qu'aucun montage n'aurait donné :
 *
 *   1. la règle de la PAIRE LATÉRALE tient, elle ne boucle simplement pas. L'araignée porte quatre
 *      paires successives, une par segment de corps ; on n'en retient que deux ;
 *   2. le côté peut être dans le nom sous une forme que `coteDuNom` ignorait. Le kraken nomme ses
 *      tentacules `l101`, `r301` : lettre puis chiffres. Zéro emplacement reconnu sur 47 os, jusqu'à
 *      l'ajout du motif `^[lr]\d` (v1.4.30). Seul défaut du lot corrigeable par le nom seul ;
 *   3. une chaîne pure existe. Le serpent n'a AUCUNE paire latérale, nulle part ;
 *   4. la descente « branche la plus profonde » désigne systématiquement la mauvaise tête chez un
 *      quadrupède : une patte avant chez le cerbère, une oreille chez le chien ;
 *   5. le nom ne peut PAS décider avant/arrière. Le cerbère nomme ses pattes avant `UpperArm`, le
 *      chien les nomme `FrontUpperLeg`. Seule la structure, donc l'ancre, peut trancher ;
 *   6. les chaînes réelles sont longues. Patte arrière du dragon : 9 segments. On s'arrête à 3 ;
 *   7. (#364) un BIPÈDE peut avoir le tronc horizontal. Le raptor sort à 112° là où les bipèdes
 *      mesuraient 149 à 164°, ce qui a tué le critère d'angle : il mesurait « tronc vertical » ;
 *   8. (#364) la COLONNE BIFURQUÉE existe pour de bon, centaure1 et centaure3, ce dernier portant
 *      littéralement deux `Hub` sur son tronc. La doc l'annonçait absente du corpus ;
 *   9. (#365, CORRIGE LE POINT 9 D'AVANT) un membre peut être lui-même UN CORPS qui porte des
 *      membres. J'avais écrit que l'arrière-train de centaure2 « n'est pas riggé » : c'est faux,
 *      il a ses quatre pattes et ses sabots. C'est la DÉCOMPOSITION qui ne descend pas dans un
 *      membre, et un centaure est précisément ce cas. Tâche #368.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  inferSkeletonMap, membresDuSquelette3D, coteDuNom, motsDuNomDOs3D, nomSuggereDeChaine3D,
  signatureDuSquelette3D, archetypeSuggere3D, SLOTS,
} from '../src/skeleton-map.js';
import { ARCHETYPES_3D, ANIMAL_TYPES, ANIMAL_JOINT_DEFS } from '../src/constants.js';

/** Le traducteur du dépôt, réduit à ce dont ces tests ont besoin : la version française. */
const tr = (en, fr) => fr;

const charger = (nom) => {
  const d = JSON.parse(readFileSync(new URL(`fixtures/squelette-${nom}.json`, import.meta.url), 'utf8'));
  // `t`, la position de repos en monde, est transportée telle quelle. `membresDuSquelette3D` ne la
  // lit pas et ne doit pas la lire : elle ne sert qu'au classement par archétype (tâche #366), qui
  // est une couche AU-DESSUS de la décomposition. Un champ de plus ne change rien à celle-ci.
  return d.os.map(o => ({ id: o.i, name: o.name, children: o.children, t: o.t }));
};

/** La carte réduite à ce qui est rempli : `{ emplacement: nom d'os }`. */
const reconnu = (os) => {
  const carte = inferSkeletonMap(os);
  const sortie = {};
  SLOTS.forEach(s => { if (carte[s] && carte[s].bone !== null && carte[s].bone !== undefined) sortie[s] = carte[s].name; });
  return sortie;
};

describe('cerbère : un quadrupède à trois têtes, le pire cas mesuré', () => {
  // 18 emplacements sur 18 remplis, et l'essentiel est FAUX. Ce qui est juste : le bassin, la
  // colonne, le cou, et les deux pattes ARRIÈRE. Ce qui est faux, et gravement :
  //
  //   `tete` reçoit une PATTE AVANT (L Clavicle). La vraie tête, `Head_09`, n'est mappée nulle part,
  //     parce que depuis le cou la descente prend la branche la plus profonde, et une patte est plus
  //     longue qu'un enchaînement tête-mâchoire ;
  //   les bras reçoivent les DEUX TÊTES LATÉRALES (L_NECK → L_HEAD → L_JAW). Elles forment bien une
  //     paire latérale sur la poitrine, la règle est respectée, c'est son interprétation qui manque ;
  //   les deux pattes AVANT et la queue (6 os) ne sont nulle part.
  test('instantané du comportement actuel', () => {
    assert.deepEqual(reconnu(charger('cerbere')), {
      bassin: 'CERBERUS_ Spine_03',
      poitrine: 'CERBERUS_ Spine3_06',
      cou: 'CERBERUS_ Neck_07',
      tete: 'CERBERUS_ L Clavicle_011',
      clavicule_g: 'CERBERUS_L_NECK_1_022', bras_g: 'CERBERUS_L_NECK_2_023',
      avantbras_g: 'CERBERUS_L_HEAD_024', main_g: 'CERBERUS_L_JAW_025',
      clavicule_d: 'CERBERUS_R_NECK_1_026', bras_d: 'CERBERUS_R_NECK_2_027',
      avantbras_d: 'CERBERUS_R_HEAD_028', main_d: 'CERBERUS_R_JAW_029',
      cuisse_g: 'CERBERUS_ L Thigh_030', jambe_g: 'CERBERUS_ L Calf_031', pied_g: 'CERBERUS_ L HorseLink_032',
      cuisse_d: 'CERBERUS_ R Thigh_035', jambe_d: 'CERBERUS_ R Calf_036', pied_d: 'CERBERUS_ R HorseLink_037',
    });
  });
});

describe('araignée : quatre paires de pattes, deux reconnues', () => {
  // Le corps est une chaîne de quatre segments, et CHAQUE segment porte une paire de pattes. La
  // règle de la paire latérale est donc exactement la bonne règle : elle ne s'applique simplement
  // qu'aux deux ancres qu'on lui donne. `cou` et `tete` reçoivent deux segments de corps.
  test('instantané du comportement actuel', () => {
    assert.deepEqual(reconnu(charger('araignee')), {
      bassin: 'Bone_02', poitrine: 'Bone.004_03', cou: 'Bone.003_04', tete: 'Bone.002_05',
      clavicule_g: 'Bone.004_L_062', bras_g: 'Bone.004_L.001_063',
      avantbras_g: 'Bone.004_L.002_064', main_g: 'Bone.004_L.003_065',
      clavicule_d: 'Bone.004_R_070', bras_d: 'Bone.004_R.001_071',
      avantbras_d: 'Bone.004_R.002_072', main_d: 'Bone.004_R.003_073',
      cuisse_g: 'Bone_L_078', jambe_g: 'Bone_L.001_079', pied_g: 'Bone_L.002_080',
      cuisse_d: 'Bone_R_086', jambe_d: 'Bone_R.001_087', pied_d: 'Bone_R.002_088',
    });
  });
});

describe('kraken : le côté était dans le nom, sous une forme ignorée', () => {
  // Huit tentacules `l101 l201 l301 l401 r101 r201 r301 r401`, plus une tête. `coteDuNom` rendait
  // `null` sur tous : elle connaissait `_l`, `.L`, `Left`, mais pas une lettre suivie de chiffres.
  // Aucun côté lu, donc aucune paire latérale, donc ZÉRO emplacement sur 47 os.
  //
  // Le motif `^[lr]\d` a été ajouté, et son effet est mesuré ici, gain ET dégât :
  //
  //   GAIN : six emplacements JUSTES, deux tentacules entiers rangés dans les jambes. Le côté est
  //     désormais lu partout où il est écrit, et la règle de la paire latérale se déclenche ;
  //   DÉGÂT : `poitrine` reçoit `l205`, un segment d'un TROISIÈME tentacule. Il était vide avant,
  //     il est faux maintenant. La cause n'est pas le motif de nom mais la règle inchangée « la
  //     colonne est la plus grosse branche restante », qui n'a aucun sens sur une symétrie radiale.
  //     C'est l'étape suivante du chantier qui la traitera.
  //
  // Le tort est SIGNALÉ à l'utilisateur, `origine: 'structure'`, ce qui est précisément le contrat
  // que la reconnaissance s'était fixé : proposer, en disant ce que le nom n'a pas corroboré.
  test('huit emplacements, dont six justes et un faux', () => {
    assert.deepEqual(reconnu(charger('kraken')), {
      bassin: 'krakenjoints_01',
      poitrine: 'l205_011',
      cuisse_g: 'l101_02', jambe_g: 'l102_03', pied_g: 'l103_04',
      cuisse_d: 'r101_021', jambe_d: 'r102_022', pied_d: 'r103_023',
    });
  });

  test('les six tentacules restants ne sont toujours atteints par rien', () => {
    // Le vrai manque, celui que le motif de nom ne pouvait pas combler : la reconnaissance ne
    // retient qu'UNE paire par ancre, alors que le kraken en présente quatre.
    const carte = reconnu(charger('kraken'));
    const cites = new Set(Object.values(carte));
    const tentaculesAtteints = ['l1', 'l2', 'l3', 'l4', 'r1', 'r2', 'r3', 'r4']
      .filter(t => [...cites].some(n => n.startsWith(t + '0')));
    assert.deepEqual(tentaculesAtteints, ['l1', 'l2', 'r1'],
      'l2 n\'est atteint que par l\'erreur sur `poitrine`');
  });
});

describe('serpent : une chaîne pure, sans aucune symétrie latérale', () => {
  // Deux chaînes partant d'un os médian, 91 os, pas une seule paire gauche/droite. Contrairement au
  // kraken, ce vide-là est LÉGITIME : il n'y a rien à apparier. Un serpent demande un traitement de
  // chaîne, pas une correction de la reconnaissance latérale.
  test('rien n\'est reconnu, et c\'est cohérent avec le fichier', () => {
    assert.deepEqual(reconnu(charger('serpent')), {});
  });
});

describe('dragon : la wyverne passe, mais les chaînes sont tronquées', () => {
  // Le meilleur résultat du lot, et il reste faux sur les pattes. Les ailes tombent correctement
  // dans les bras (Shoulder → Wing1 → Wing2 → Hand, quatre os pour quatre emplacements). Les pattes,
  // elles, font NEUF segments : `pied_g` reçoit `Thigh.L`, la cuisse, alors que le vrai pied est
  // deux os plus loin (ThighBase → Chain2 Thigh → Thigh → Shin → Foot → ToeBase → …).
  // La queue, 8 os, n'est nulle part.
  test('instantané du comportement actuel', () => {
    assert.deepEqual(reconnu(charger('dragon')), {
      bassin: 'Pelvis_140_40', poitrine: 'Torso_118_70', cou: 'Neck_66_71', tete: 'Head_65_72',
      clavicule_g: 'Shoulder.L_91_86', bras_g: 'Wing1.L_90_87',
      avantbras_g: 'Wing2.L_87_88', main_g: 'Hand.L_86_89',
      clavicule_d: 'Shoulder.R_115_110', bras_d: 'Wing1.R_114_111',
      avantbras_d: 'Wing2.R_111_112', main_d: 'Hand.R_110_113',
      cuisse_g: 'ThighBase.L_52_49', jambe_g: 'Chain2 Thigh.L_49_50', pied_g: 'Thigh.L_48_55',
      cuisse_d: 'ThighBase.R_139_136', jambe_d: 'Chain2 Thigh.R_136_137', pied_d: 'Thigh.R_135_142',
    });
  });
});

describe('centaure : le fichier est riggé en BIPÈDE', () => {
  // Demandé comme cas de « colonne qui bifurque en deux torses ». Le fichier ne l'est pas : rig
  // Mixamo standard, `Hips` ne porte que la colonne et deux jambes, le corps de cheval n'a pas
  // d'ossature propre. La reconnaissance donne donc 18/18 justes, dont 16 confirmés par le nom.
  //
  // Consigné tel quel plutôt que corrigé : ce test dit ce que le FICHIER contient. Le cas de la
  // colonne bifurquée reste, à ce jour, non couvert par le corpus.
  test('18 emplacements justes, comme pour un humanoïde ordinaire', () => {
    const carte = reconnu(charger('centaure'));
    assert.equal(Object.keys(carte).length, 18);
    assert.equal(carte.bassin, 'mixamorig:Hips_01');
    assert.equal(carte.tete, 'mixamorig:Head_06');
    assert.equal(carte.cuisse_g, 'mixamorig:LeftUpLeg_00');
    assert.equal(carte.main_d, 'mixamorig:RightHand_035');
  });
});

describe('oiseau : les ailes passent pour des bras, la poitrine pour un cou', () => {
  // 554 os, dont l'immense majorité en plumes. Les ailes tombent dans les bras, ce qui est le bon
  // rôle. Deux erreurs : `poitrine` reçoit `CK Neck`, le cou lui-même, et `pied` reçoit
  // `HorseLink`, la cheville d'une patte digitigrade, le pied étant plus loin.
  test('instantané du comportement actuel', () => {
    const carte = reconnu(charger('oiseau'));
    assert.equal(carte.poitrine, 'CK Neck_0114', 'la poitrine reçoit le cou');
    assert.equal(carte.cou, 'CK Neck1_0115');
    assert.equal(carte.tete, 'CK Head_0118', 'la tête, elle, est juste');
    assert.equal(carte.bras_g, 'CK L UpperArm_0165', 'l\'aile tombe dans le bras');
    assert.equal(carte.pied_g, 'CK L HorseLink_011', 'la cheville prise pour le pied');
    assert.equal(Object.keys(carte).length, 18);
  });
});

describe('chien : un quadrupède ordinaire, et la question du nommage tranchée', () => {
  // CE FICHIER RÉPOND À UNE QUESTION QUE LE CERBÈRE LAISSAIT OUVERTE. Le cerbère nomme ses pattes
  // avant `Clavicle` et `UpperArm`, convention biped 3ds Max plaquée sur une bête. Le chien les
  // nomme `FrontShoulder` et `FrontUpperLeg`. Les deux conventions existent donc, et le NOM ne peut
  // pas décider seul si une chaîne est un bras ou une patte avant. Seule l'ancre le peut.
  //
  // `tete` reçoit `Ear1.L`, une oreille : même défaut de descente que sur le cerbère, deuxième
  // occurrence sur trois quadrupèdes. `main_g` et `main_d` restent vides, les pattes avant ne
  // faisant que trois os avant la patte elle-même.
  test('instantané du comportement actuel', () => {
    assert.deepEqual(reconnu(charger('chien')), {
      bassin: 'Back_38', poitrine: 'Torso2_22', cou: 'Torso3_15', tete: 'Ear1.L_5',
      clavicule_g: 'FrontShoulder.L_18', bras_g: 'FrontUpperLeg.L_17', avantbras_g: 'FrontLowerLeg.L_16',
      clavicule_d: 'FrontShoulder.R_21', bras_d: 'FrontUpperLeg.R_20', avantbras_d: 'FrontLowerLeg.R_19',
      cuisse_g: 'BackShoulder.L_27', jambe_g: 'BackLeg.L_26', pied_g: 'BackUpperLeg.L_25',
      cuisse_d: 'BackShoulder.R_31', jambe_d: 'BackLeg.R_30', pied_d: 'BackUpperLeg.R_29',
    });
  });
});

describe('ce que le corpus couvre, et ce qu\'il ne couvre pas', () => {
  // Un test qui décrit le CORPUS lui-même. Il ne vérifie pas la reconnaissance : il empêche qu'une
  // fixture disparaisse ou change de taille sans qu'on s'en aperçoive, et il tient à jour, en un
  // seul endroit, l'inventaire des morphologies éprouvées.
  test('les huit créatures sont là, avec leur volumétrie', () => {
    const attendu = {
      cerbere: 49, araignee: 113, kraken: 47, serpent: 91,
      dragon: 127, centaure: 66, oiseau: 554, chien: 53,
    };
    Object.entries(attendu).forEach(([nom, n]) => {
      assert.equal(charger(nom).length, n, `${nom} : la fixture a changé de taille`);
    });
  });

  test('LE TROU CONNU : aucune créature à colonne bifurquée', () => {
    // Un centaure correctement riggé, ou toute créature dont le tronc porte deux torses, reste à
    // trouver. Écrit ici pour que le manque soit visible dans la suite de tests plutôt que dans une
    // conversation, et pour qu'on n'affirme jamais que le cas est couvert.
    const bifurque = ['cerbere', 'araignee', 'kraken', 'serpent', 'dragon', 'centaure', 'oiseau', 'chien']
      .filter(nom => {
        const os = charger(nom);
        const enfantDe = new Set(os.flatMap(o => o.children));
        const racines = os.filter(o => !enfantDe.has(o.id));
        // Une colonne bifurquée porterait DEUX chaînes sans côté et substantielles sous une même
        // ancre. Aucun fichier du lot ne présente cette signature.
        return racines.length > 3;
      });
    assert.deepEqual(bifurque, [], 'un fichier à colonne bifurquée est peut-être arrivé, à vérifier');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Étape 2 : le squelette vu comme un tronc et des membres
// ─────────────────────────────────────────────────────────────────────────────
//
// `membresDuSquelette3D` ne remplit pas des cases, elle DÉCRIT. Elle applique une seule règle, qui
// est l'ancienne retournée : une branche qui porte un côté est un membre, une branche qui n'en
// porte pas continue le tronc. Ce qui suit mesure ce qu'elle rend sur les quatorze squelettes.
//
// ELLE NE FILTRE RIEN, et c'est délibéré. Sur le rig Unreal elle rend 185 membres, dont 131 de deux
// os : chaînes de torsion, correctifs, auxiliaires. Ce bruit est CONSIGNÉ ici plutôt qu'écarté par
// un seuil, parce que ce dépôt s'est déjà fait prendre à inventer un seuil (« 3 % de la descendance
// du parent ») dont la campagne de mutation a montré qu'il ne servait à rien. Distinguer la chaîne
// principale de ses extrémités est l'objet de l'étape 3, et la mesure ci-dessous lui donne son
// critère : la longueur.
describe('membresDuSquelette3D : le cerbère retrouve sa vraie tête', () => {
  const os = charger('cerbere');
  const parId = new Map(os.map(o => [o.id, o]));
  const nom = (id) => parId.get(id).name;
  const r = membresDuSquelette3D(os);

  test('LE DÉFAUT CENTRAL EST CORRIGÉ : le tronc va jusqu\'à Head', () => {
    // `inferSkeletonMap` mettait `L Clavicle`, une patte avant, dans `tete`. La descente par
    // profondeur partait dans la patte, plus longue qu'un enchaînement cou-tête. Ici le tronc suit
    // la seule continuation SANS CÔTÉ, et une patte en a toujours un.
    assert.ok(r.tronc.map(nom).some(n => n.includes('Head_09')), 'la vraie tête n\'est pas sur le tronc');
    assert.ok(!r.tronc.map(nom).some(n => n.includes('Clavicle')), 'une patte avant s\'est glissée dans le tronc');
  });

  test('les sept membres sont là, les trois têtes comprises', () => {
    const parCote = r.membres.map(m => `${m.cote || '-'} ${nom(m.segments[0]).replace(/^CERBERUS_ ?/, '')}`);
    assert.deepEqual(parCote, [
      'g L Thigh_030', 'd R Thigh_035',      // pattes arrière
      '- Tail_040',                          // la queue, invisible pour l'ancienne reconnaissance
      'g L_NECK_1_022', 'd R_NECK_1_026',    // les deux têtes latérales, sur la poitrine
      'g L Clavicle_011', 'd R Clavicle_016', // pattes avant, invisibles elles aussi
    ]);
  });
});

describe('membresDuSquelette3D : les huit pattes de l\'araignée', () => {
  const os = charger('araignee');
  const r = membresDuSquelette3D(os);

  test('quatre paires de pattes, une par segment de corps', () => {
    // L'ancienne reconnaissance en trouvait deux, faute de boucler. Les quatre ancres sont quatre
    // os successifs du tronc, et les huit pattes font TOUTES exactement sept os.
    const pattes = r.membres.filter(m => m.cote && m.segments.length === 7);
    assert.equal(pattes.length, 8, 'huit pattes attendues');
    assert.equal(new Set(pattes.map(m => m.ancre)).size, 4, 'sur quatre ancres distinctes');
  });

  test('des paires d\'appendices en plus, sur QUATRE ancres depuis #368', () => {
    // MON ASSERTION ÉTAIT FAUSSE AVANT CELLE-CI, et c'est le fichier qui a corrigé : je comptais
    // huit membres latéraux, il y en avait douze. Le dernier segment du tronc porte des paires
    // supplémentaires de 6, 5 et 1 os. Sur une araignée ce sont les pédipalpes et les chélicères,
    // appendices buccaux bien réels et parfaitement posables.
    //
    // #368 EN A RÉVÉLÉ D'AUTRES. La descente récursive trouve maintenant vingt appendices latéraux
    // au lieu de six, répartis sur quatre ancres au lieu d'une : chaque segment de corps porte,
    // au bout de sa patte ou de son appendice, une petite paire terminale d'un seul os qui était
    // avalée par la chaîne. Consigné parce que c'est exactement ce que la décomposition doit
    // savoir faire : ne pas décider d'avance combien de paires un corps peut porter.
    const derniere = r.membres.filter(m => m.cote && m.segments.length !== 7);
    assert.equal(derniere.length, 20);
    assert.equal(new Set(derniere.map(m => m.ancre)).size, 4);
    assert.deepEqual(derniere.map(m => m.segments.length),
      [6, 6, 5, 5, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
  });
});

describe('membresDuSquelette3D : les huit tentacules du kraken', () => {
  const os = charger('kraken');
  const parId = new Map(os.map(o => [o.id, o]));
  const r = membresDuSquelette3D(os);

  test('quatre paires sur UNE seule ancre, et un tronc qui est la tête', () => {
    // La symétrie radiale : pas de bassin, pas de colonne, une ancre qui porte tout. C'est le cas
    // où l'appariement rang par rang compte, quatre gauches et quatre droites au même niveau.
    const tentacules = r.membres.filter(m => m.cote);
    assert.equal(tentacules.length, 8);
    assert.equal(new Set(tentacules.map(m => m.ancre)).size, 1, 'toutes sur la même ancre');
    assert.deepEqual([...new Set(tentacules.map(m => m.rang))], [1, 2, 3, 4]);
    assert.ok(r.tronc.map(i => parId.get(i).name).some(n => n.startsWith('head')),
      'le tronc doit suivre la tête, seule branche sans côté');
  });
});

describe('membresDuSquelette3D : le serpent devient posable', () => {
  test('un tronc de 86 os, là où rien n\'était reconnu', () => {
    // Aucune paire latérale nulle part, donc zéro emplacement pour l'ancienne reconnaissance. Vu
    // comme un tronc, le serpent est au contraire le cas le plus simple du corpus.
    const r = membresDuSquelette3D(charger('serpent'));
    assert.equal(r.tronc.length, 86);
    assert.equal(r.membres.filter(m => m.cote).length, 0, 'et aucun membre latéral, ce qui est juste');
  });
});

describe('membresDuSquelette3D : le dragon, chaînes complètes', () => {
  const os = charger('dragon');
  const parId = new Map(os.map(o => [o.id, o]));
  const r = membresDuSquelette3D(os);
  const parNom = (debut) => r.membres.find(m => parId.get(m.segments[0]).name.startsWith(debut));

  test('les chaînes ne sont plus tronquées à trois', () => {
    // L'ancienne reconnaissance mettait `Thigh.L`, la cuisse, dans `pied_g`. La chaîne entière fait
    // neuf os. La queue, huit, n'était nulle part.
    assert.equal(parNom('ThighBase.L').segments.length, 9, 'patte arrière gauche');
    assert.equal(parNom('Shoulder.L').segments.length, 7, 'aile gauche');
    assert.equal(parNom('TailBase').segments.length, 8, 'queue');
    assert.equal(parNom('TailBase').cote, null, 'la queue n\'a pas de côté, c\'est une annexe');
  });
});

describe('membresDuSquelette3D : un rig humanoïde propre ne donne QUE quatre membres', () => {
  // La contrepartie du reste : sur un rig sans auxiliaires, la décomposition générique retrouve
  // exactement les quatre membres attendus, sans rien inventer. C'est ce qui rend crédible qu'elle
  // puisse un jour remplacer la reconnaissance humanoïde.
  ['mixamo', 'centaure'].forEach(nom => {
    test(`${nom} : deux bras, deux jambes, rien d'autre`, () => {
      const r = membresDuSquelette3D(charger(nom));
      assert.equal(r.membres.length, 4);
      assert.deepEqual(r.membres.map(m => m.segments.length).sort(), [5, 5, 8, 8]);
      assert.deepEqual(r.membres.map(m => m.cote), ['g', 'd', 'g', 'd']);
    });
  });
});

describe('membresDuSquelette3D : le bruit mesuré, que l\'étape 3 devra trier', () => {
  test('rig Unreal : 222 membres, dont 156 de DEUX os', () => {
    // Os de torsion, correctifs, auxiliaires `FX_`, `_twist_`. Ils forment de vraies paires
    // latérales, la règle les attrape donc légitimement.
    //
    // ⚠️ LE COMMENTAIRE D'ORIGINE CONCLUAIT ICI QUE « la longueur sépare nettement les vrais
    // membres du bruit ». C'ÉTAIT FAUX, mesuré sur un seul rig, et l'étape 3 l'a démenti sur le
    // corpus entier, cf. le test « la longueur NE sépare PAS » plus bas.
    //
    // Le passage de 185 à 222 vient de #368 : la descente récursive atteint les sous-chaînes
    // faciales (mâchoire, nez, dents) qui portent leurs propres paires latérales, invisibles tant
    // qu'on ne descendait pas dans un membre.
    const r = membresDuSquelette3D(charger('unreal'));
    assert.equal(r.membres.length, 222);
    const parLongueur = {};
    r.membres.forEach(m => { parLongueur[m.segments.length] = (parLongueur[m.segments.length] || 0) + 1; });
    assert.equal(parLongueur[2], 156);
    assert.equal(r.membres.filter(m => m.segments.length >= 6).length, 6, 'six chaînes longues seulement');
  });

  test('les chaînes IK et les cibles sont des membres comme les autres, pour l\'instant', () => {
    // Dragon et chien portent des chaînes `IK`, `Pole`, `Target`, `neutral_bone`. Elles portent un
    // côté, donc la règle en fait des membres. Les écarter demande de se fier au NOM pour EXCLURE,
    // alors que le fichier ne s'en sert jusqu'ici que pour CONFIRMER. Ce renversement mérite d'être
    // décidé, pas glissé : il est renvoyé à l'étape 3.
    const r = membresDuSquelette3D(charger('chien'));
    const parId = new Map(charger('chien').map(o => [o.id, o]));
    const noms = r.membres.map(m => parId.get(m.segments[0]).name);
    assert.ok(noms.some(n => n.startsWith('IKBackLeg')), 'la chaîne IK est bien présente');
    assert.ok(noms.some(n => n.startsWith('PoleTarget')), 'les cibles de pôle aussi');
  });
});

describe('étape 3 : la longueur NE sépare PAS, mesuré', () => {
  // CE TEST A INVALIDÉ L'HYPOTHÈSE SUR LAQUELLE L'ÉTAPE 3 REPOSAIT. Le commit de l'étape 2 concluait
  // que « la longueur sépare nettement les quatre vrais membres du bruit ». C'était vrai sur le
  // seul rig Unreal, et faux sur le corpus entier.
  //
  // Mesuré sur les treize squelettes : les chaînes au nom non anatomique montent jusqu'à SEPT
  // segments (les mèches de cheveux d'un rig VRM), et les chaînes anatomiques descendent à UN
  // (les chélicères de l'araignée, les brins musculaires du cou de l'oiseau). Le recouvrement est
  // total : aucun seuil de longueur ne peut trancher.
  //
  // CE QUE ÇA CHANGE. Il n'y a pas de critère automatique à trouver, et en chercher un revient à
  // inventer un seuil, ce que ce dépôt s'interdit. La conséquence est écrite dans
  // docs/creature-rigs.md : c'est l'ÉCRAN DE CORRESPONDANCE qui doit trancher, en proposant les
  // chaînes classées et en laissant l'utilisateur cocher. Ce qui est d'ailleurs le contrat que la
  // reconnaissance s'était fixé depuis le début, proposer sans décider.
  const noms = ['cerbere', 'araignee', 'kraken', 'serpent', 'dragon', 'chien', 'oiseau',
    'centaure', 'unreal', 'maison', 'mixamo', 'vrm', 'vroid-alt'];
  // Les mots qui désignent une vraie partie de corps dans AU MOINS un fichier du corpus. Sert
  // uniquement à séparer les deux populations pour cette mesure, jamais à décider quoi que ce soit
  // dans le code de production.
  const ANATOMIQUE = /thigh|clavicle|upperarm|upleg|shoulder|wing|leg|^l\d|^r\d|bone_|bone\.00|tail|neck/i;

  test('les deux populations se recouvrent complètement', () => {
    const longueurs = { anatomique: [], autre: [] };
    noms.forEach(nom => {
      const os = charger(nom);
      const parId = new Map(os.map(o => [o.id, o]));
      membresDuSquelette3D(os).membres.forEach(m => {
        const n = parId.get(m.segments[0]).name.replace(/_\d+(_\d+)?$/, '');
        longueurs[ANATOMIQUE.test(n) ? 'anatomique' : 'autre'].push(m.segments.length);
      });
    });
    const max = (a) => Math.max(...a), min = (a) => Math.min(...a);
    assert.equal(min(longueurs.anatomique), 1, 'une vraie chaîne peut ne faire QU\'UN os');
    assert.equal(max(longueurs.autre), 7, 'une mèche de cheveux en fait SEPT');
    assert.ok(max(longueurs.autre) > min(longueurs.anatomique),
      'si un jour ces deux populations se séparent, un seuil redevient envisageable');
  });

  test('les chaînes d\'aide à l\'animation, elles, se nomment', () => {
    // Le seul sous-ensemble que le nom identifie sans ambiguïté : `IK`, `Pole`, `Target`,
    // `neutral_bone`, `FX_`, `Socket`. Ce sont des échafaudages de rig, jamais de l'anatomie.
    // Consigné ici comme point de départ possible de l'étape 3, à distinguer du reste du bruit,
    // qui est de l'anatomie mineure (cils, lèvres, mèches) et ne se règle pas par un nom.
    const ECHAFAUDAGE = /\bik\b|^ik|ik$|pole|target|neutral_bone|^fx_|socket/i;
    const trouves = [];
    noms.forEach(nom => {
      const os = charger(nom);
      const parId = new Map(os.map(o => [o.id, o]));
      membresDuSquelette3D(os).membres.forEach(m => {
        const n = parId.get(m.segments[0]).name.replace(/_\d+(_\d+)?$/, '');
        if (ECHAFAUDAGE.test(n)) trouves.push(n);
      });
    });
    assert.equal(trouves.length, 67, 'le compte d\'échafaudages du corpus a changé');
    // ⚠️ LA GARDE SE FAIT SUR DES NOMS EXACTS, pas sur un mot contenu. Ma première version
    // cherchait « thigh » quelque part dans le nom, et elle a accusé le filet à tort :
    // `thigh_vol_end_rSocket` est une prise d'attache, pas une cuisse. Le mot d'une partie du corps
    // apparaît couramment dans le nom d'un accessoire qui s'y rattache.
    const vraisMembres = ['thigh_l', 'thigh_r', 'clavicle_l', 'clavicle_r', 'Wing1.L', 'Wing1.R',
      'ThighBase.L', 'ThighBase.R', 'FrontUpperLeg.L', 'BackShoulder.L'];
    vraisMembres.forEach(n => assert.ok(!trouves.includes(n), `${n} est tombé dans le filet`));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// LES QUATRE CRÉATURES DE LA TÂCHE #364, et ce que chacune a démenti ou apporté.
//
// Elles n'ont pas été ajoutées pour grossir le corpus. Chacune a changé une décision : le raptor a
// tué le critère d'angle, centaure1 et centaure3 ont apporté la colonne bifurquée que la doc
// déclarait absente, centaure3 a imposé la sixième convention de nommage, et centaure2 a montré un
// mode d'échec qu'aucune reconnaissance ne rattrapera.
// ─────────────────────────────────────────────────────────────────────────────

describe('raptor : le bipède qui a démenti le critère d\'angle', () => {
  const os = charger('raptor');
  const parId = new Map(os.map(o => [o.id, o]));
  const r = membresDuSquelette3D(os);

  test('deux paires et une queue démesurée', () => {
    const lat = r.membres.filter(m => m.cote);
    assert.equal(lat.length, 4, 'deux pattes et deux bras');
    const centrales = r.membres.filter(m => !m.cote).map(m => m.segments.length);
    assert.ok(centrales.includes(14), 'la queue fait 14 os, la plus longue chaîne centrale du corpus');
  });

  test('LE FICHIER QUI A TUÉ LE CRITÈRE D\'ANGLE', () => {
    // Deux bandes semblaient nettes sur les onze premiers modèles, bipèdes 149 à 164°, quadrupèdes
    // 87 à 102°. Le raptor sort à 112° et 122°, PILE DANS LE TROU, et c'est un bipède. Le critère
    // ne mesurait pas « bipède », il mesurait « tronc vertical », et le raptor a le tronc
    // horizontal. Le repli sur le rapport de longueurs échoue aussi (worker_j 2,51, labrador 3,42).
    //
    // Ce test n'épingle pas un angle, il épingle la STRUCTURE qui rend le critère indécidable :
    // deux paires, comme un quadrupède, comme un humanoïde, comme un oiseau. Voir
    // docs/creature-rigs.md, section « Deux hypothèses énoncées avec assurance, et démenties ».
    assert.equal(r.membres.filter(m => m.cote).length, 4,
      'même signature topologique qu\'un quadrupède : c\'est tout le problème');
  });

  test('aucun os ne porte de mot anatomique', () => {
    // `Bone.034.L`, `Bone.020.R`. Le vocabulaire de nommage (tâche #365) rendra ZÉRO sur ce
    // fichier, et c'est la moitié de l'histoire qu'il faut garder : la couverture de 54 % mesurée
    // sur le corpus n'est pas un dégradé, c'est un interrupteur par fichier.
    const ANATOMIQUE = /thigh|calf|shin|foot|hand|head|neck|tail|wing|arm|leg/i;
    const parlants = os.filter(o => ANATOMIQUE.test(o.name));
    assert.deepEqual(parlants, [], 'un os parlant est apparu, la mesure de #365 est à refaire');
    assert.ok(parId.get(r.membres[0].segments[0]).name.startsWith('Bone.'));
  });
});

describe('centaure1 : LA COLONNE BIFURQUÉE, enfin', () => {
  const os = charger('centaure1');
  const parId = new Map(os.map(o => [o.id, o]));
  const r = membresDuSquelette3D(os);
  const surTronc = r.membres.filter(m => m.cote && r.tronc.indexOf(m.ancre) >= 0 && m.segments.length >= 4);

  test('trois paires sur trois ancres successives du tronc', () => {
    // La doc annonçait ce cas comme NON COUVERT, le centaure Mixamo du corpus étant riggé en
    // bipède. Celui-ci l'apporte pour de bon : pattes arrière au pelvis, pattes avant à spine_02,
    // bras humains au chest. Un tronc, trois étages, six membres.
    assert.equal(surTronc.length, 6);
    assert.equal(new Set(surTronc.map(m => m.ancre)).size, 3, 'trois ancres distinctes');
    const ancres = [...new Set(surTronc.map(m => r.tronc.indexOf(m.ancre)))].sort((a, b) => a - b);
    assert.deepEqual(ancres.map((v, k) => v > (ancres[k - 1] ?? -1)), [true, true, true],
      'et elles se suivent le long du tronc');
  });

  test('MÊME SIGNATURE QUE LE GRIFFON, et c\'est pourquoi l\'archétype est proposé', () => {
    // Trois paires : exactement ce que porte le griffon intégré (quatre pattes plus deux ailes).
    // Rien dans la structure ne distingue « bras humains » de « ailes ». C'est la raison pour
    // laquelle Centaure et Quadrupède ailé sont des archétypes PROPOSÉS et non détectés.
    assert.equal(surTronc.length, 6, 'trois paires, comme le griffon');
  });

  test('des accessoires riggés sont des membres au sens de la décomposition', () => {
    // `weapon`, `quiver`, `arrow`. La décomposition ne filtre rien, délibérément : ce sont bien des
    // branches du squelette. C'est à l'écran de correspondance de les décocher.
    const noms = r.membres.map(m => parId.get(m.segments[0]).name);
    assert.ok(noms.some(n => n.startsWith('weapon')), 'l\'arme doit apparaître, pas être écartée');
    assert.ok(noms.some(n => n.startsWith('quiver')));
  });
});

describe('centaure2 : un membre qui est lui-même un corps (#368)', () => {
  const os = charger('centaure2');
  const parId = new Map(os.map(o => [o.id, o]));
  const nom = (id) => parId.get(id).name;
  const r = membresDuSquelette3D(os);

  // L'HISTOIRE DE CE FICHIER, en trois temps, parce qu'elle vaut mieux que son résultat.
  //
  //   #364 : j'ai écrit ici que l'arrière-train « n'est pas riggé » et que « le fichier ne contient
  //     pas l'information ». Affirmation commise dans un test ET dans la doc, sans l'avoir
  //     vérifiée ;
  //   #365 : le vocabulaire de nommage proposait « Patte » là où j'attendais rien. La chaîne
  //     contenait `UpperBackRightLeg`. Le cheval a ses quatre pattes et ses sabots, correctement
  //     latéralisés ;
  //   #368 : le défaut était dans la DÉCOMPOSITION, qui suivait un membre sans jamais examiner ses
  //     branches. `LowerBody1` est une branche de la racine, donc un membre, et elle avalait les
  //     quatre pattes dans une chaîne de sept os.
  //
  // La règle qui corrige est celle du fichier généralisée d'un cran : est un membre une branche qui
  // porte un côté que SA CHAÎNE n'a pas. Sur le tronc, sans côté, c'est l'ancienne règle mot pour
  // mot. Dans un bras gauche, une branche gauche de plus n'est qu'un doigt. Dans le corps du
  // cheval, qui n'a pas de côté, une branche gauche est une patte.

  test('les quatre pattes du cheval sont des membres, sur le CORPS et non sur le tronc', () => {
    const pattes = r.membres.filter(m => /Leg/.test(nom(m.segments[0])));
    assert.equal(pattes.length, 4);
    assert.deepEqual(pattes.map(m => `${m.cote} ${nom(m.ancre)}`), [
      'g LowerBody1_033', 'd LowerBody1_033',   // antérieures, sur le premier os du corps
      'g LowerBody3_035', 'd LowerBody3_035',   // postérieures, deux os plus loin
    ]);
    // L'ancre est un os du CORPS, pas du tronc : c'est ce qui fait la récursion, et c'est ce qui
    // permettra à un archétype Centaure de rattacher les pattes au bon endroit.
    pattes.forEach(m => assert.ok(!r.tronc.includes(m.ancre), 'ancrée hors du tronc'));
  });

  test('le corps du cheval reste un membre, réduit à ce qu\'il est vraiment', () => {
    const bas = r.membres.find(m => nom(m.segments[0]).startsWith('LowerBody'));
    assert.equal(bas.cote, null, 'le corps n\'a pas de côté, ce sont ses pattes qui en ont un');
    assert.equal(bas.segments.length, 3, 'trois os, contre sept quand il avalait une patte');
    assert.deepEqual(bas.segments.map(nom), ['LowerBody1_033', 'LowerBody2_034', 'LowerBody3_035']);
  });

  test('PLUS AUCUN os de patte n\'est perdu, contre neuf sur douze avant', () => {
    const atteints = new Set(r.membres.flatMap(m => m.segments).concat(r.tronc));
    const pattes = os.filter(o => /Leg|Hoof/.test(o.name) && !/_end/.test(o.name));
    assert.equal(pattes.length, 12, 'quatre pattes de trois os');
    assert.deepEqual(pattes.filter(o => !atteints.has(o.id)), []);
  });

  test('trois paires au total, alors qu\'une seule était vue', () => {
    assert.equal(r.membres.filter(m => m.cote).length, 6, 'deux bras et quatre pattes');
  });
});

describe('centaure3 : le fichier qui a imposé la sixième convention', () => {
  const os = charger('centaure3');
  const parId = new Map(os.map(o => [o.id, o]));
  const r = membresDuSquelette3D(os);
  const nom = (id) => parId.get(id).name;

  test('le côté se lit, et sans lui il n\'y avait RIEN', () => {
    // Avant la tâche #363, `coteDuNom` rendait null sur les 79 os : aucun côté, donc aucune paire,
    // donc zéro membre latéral. Ce test relie les deux tâches : si quelqu'un retire la convention
    // CAT de skeleton-map.js, c'est ici que la conséquence se voit, sur un vrai fichier.
    assert.equal(coteDuNom('CATRigLLeg1_065'), 'g');
    assert.equal(r.membres.filter(m => m.cote).length, 6, 'trois paires');
  });

  test('DEUX `Hub`, deux colonnes : la bifurcation à l\'état explicite', () => {
    const hubs = r.tronc.map(nom).filter(n => n.includes('Hub'));
    assert.deepEqual(hubs, ['CATRigHub001_01', 'CATRigHub002_07'],
      'le tronc traverse les deux hubs, et c\'est ce qui fait un centaure');
    const parAncre = new Map();
    r.membres.filter(m => m.cote).forEach(m => parAncre.set(nom(m.ancre), (parAncre.get(nom(m.ancre)) || 0) + 1));
    assert.deepEqual([...parAncre.entries()], [
      ['CATRigHub001_01', 2],   // pattes arrière du cheval
      ['CATRigHub002_07', 2],   // pattes avant du cheval
      ['Pecho_011', 2],         // bras humains, « pecho » = poitrine
    ]);
  });

  test('la queue est sur le PREMIER hub, pas sur le second', () => {
    // Détail qui a son importance pour l'archétype Centaure : la queue s'ancre sur le bassin
    // animal, pas sur le buste. Une table d'emplacements qui la rattacherait au tronc humain
    // produirait une queue qui pivote depuis les épaules.
    const queue = r.membres.find(m => nom(m.segments[0]).startsWith('CATRigTail'));
    assert.equal(nom(queue.ancre), 'CATRigHub001_01');
    assert.equal(queue.cote, null);
  });
});

describe('les fixtures portent la position de repos de chaque os (#364)', () => {
  // POURQUOI CE CHAMP EXISTE. Le classement par archétype (#366) a besoin de géométrie, ne
  // serait-ce que pour constater qu'elle ne tranche pas. Les fixtures ne portaient jusqu'ici que
  // `{i, name, children}`, délibérément, pour que la suite tourne sans Three ni WebGL. Une
  // position de repos est une donnée de TEST, pas une donnée persistée : elle n'entre dans aucun
  // fichier de Projet et ne relève donc pas de la règle de non-renommage.
  //
  // Les positions sont en MONDE, au repos, à précision relative (`toPrecision(6)`). Aucune
  // normalisation : la fixture reste une réduction fidèle du `.glb`, et ramener à l'échelle est
  // une décision du code.
  const avecPositions = ['cerbere', 'araignee', 'kraken', 'serpent', 'dragon', 'chien', 'oiseau',
    'centaure', 'unreal', 'maison', 'vrm', 'raptor', 'centaure1', 'centaure2', 'centaure3'];

  avecPositions.forEach(nom => {
    test(`${nom} : chaque os a trois coordonnées finies`, () => {
      const os = charger(nom);
      os.forEach(o => {
        assert.ok(Array.isArray(o.t) && o.t.length === 3, `${o.name} n'a pas de position`);
        o.t.forEach(v => assert.ok(Number.isFinite(v), `${o.name} a une coordonnée non finie`));
      });
      // Un squelette entier au même point signalerait une accumulation de matrices ratée, le
      // défaut le plus probable de l'extracteur et le plus silencieux.
      const distincts = new Set(os.map(o => o.t.join(',')));
      assert.ok(distincts.size > os.length / 2, 'les os se superposent, l\'extraction est fausse');
    });
  });

  test('DEUX FIXTURES N\'EN ONT PAS, et il faut le savoir', () => {
    // `mixamo` et `vroid-alt` viennent de `.glb` que l'utilisateur n'a plus dans son dossier. Le
    // générateur REFUSE de réécrire une fixture dont il ne retrouve pas la source exacte, ce qui
    // est le bon comportement : les `.glb` ne sont pas versionnés, et un fichier du même nom n'est
    // pas forcément le même fichier.
    //
    // Sans conséquence pour l'instant : ce sont deux humanoïdes, reconnus par le NOM, et le
    // classement par archétype n'a pas besoin de leur géométrie. À reprendre si ces deux fichiers
    // réapparaissent.
    ['mixamo', 'vroid-alt'].forEach(nom => {
      assert.equal(charger(nom)[0].t, undefined, `${nom} a gagné des positions, mettre à jour ce test`);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// #365 — LE VOCABULAIRE DE NOMMAGE DES CHAÎNES
//
// Il lit ce que le nom DIT, pas ce que le membre EST. Ces tests épinglent les deux : ce qu'il
// nomme juste, et les cinq fichiers sur lesquels il ne rend rien du tout.
// ─────────────────────────────────────────────────────────────────────────────

/** Le nom proposé pour chaque membre d'une créature, dans l'ordre de la décomposition. */
const nomsProposes = (nom) => {
  const os = charger(nom);
  const parId = new Map(os.map(o => [o.id, o]));
  return membresDuSquelette3D(os).membres
    .map(m => nomSuggereDeChaine3D(m.segments.map(s => parId.get(s).name), tr));
};

describe('nomSuggereDeChaine3D : découper le nom en mots', () => {
  test('la casse chameau et le souligné sont des séparateurs', () => {
    // LES DEUX DÉFAUTS QUI ONT MOTIVÉ CETTE ÉTAPE, opposés l'un à l'autre. Un `\b` posé sur le nom
    // brut ne voit RIEN dans `L_HEAD`, le souligné étant un caractère de mot ; et rien non plus
    // dans `IKBackLeg`, la casse chameau n'ayant aucun séparateur. Les têtes du cerbère et les
    // quatre pattes du chien passaient à travers, chacune pour une raison différente.
    assert.equal(motsDuNomDOs3D('CERBERUS_L_HEAD_024'), 'cerberus l head');
    assert.equal(motsDuNomDOs3D('IKBackLeg.L_45'), 'ik back leg l');
    assert.equal(motsDuNomDOs3D('CATRigLLeg1_065'), 'cat rig l leg');
    assert.equal(motsDuNomDOs3D('mixamorig:LeftForeArm'), 'mixamorig left fore arm');
  });

  test('un nom vide ou absent ne fait rien exploser', () => {
    assert.equal(motsDuNomDOs3D(''), '');
    assert.equal(motsDuNomDOs3D(null), '');
    assert.equal(nomSuggereDeChaine3D([], tr), null);
    assert.equal(nomSuggereDeChaine3D(null, tr), null);
  });
});

describe('nomSuggereDeChaine3D : le mot d\'IDENTITÉ l\'emporte', () => {
  test('la tête latérale du cerbère est une TÊTE, pas un cou', () => {
    // `L_NECK_1 > L_NECK_2 > L_HEAD > L_JAW`. Le mot à la racine dit « cou », le mot au milieu dit
    // ce que le membre EST. Sans la règle de priorité, le cerbère a deux « Cou » latéraux.
    assert.equal(nomSuggereDeChaine3D(['L_NECK_1', 'L_NECK_2', 'L_HEAD', 'L_JAW'], tr), 'Tête');
  });

  test('LA PATTE DU CHIEN EST UNE PATTE, même attachée à une « épaule »', () => {
    // Correction mesurée : les mots de patte étaient d'abord rangés dans les RÉGIONS, lues à
    // partir de la racine. Le chien nomme ses pattes `BackShoulder > BackUpperLeg > …`, donc les
    // quatre étaient proposées comme des bras. Un membre se nomme par ce qu'il est, pas par son
    // attache.
    assert.equal(nomSuggereDeChaine3D(['BackShoulder.L', 'BackUpperLeg.L', 'BackLowerLeg.L'], tr), 'Patte');
  });

  test('LE DÉFAUT DE CENTAURE3 EST CORRIGÉ : patte avant doigt', () => {
    // `CATRigLLeg1 > … > CATRigLLegDigit11`. La chaîne contient un os de doigt, et la première
    // version proposait « Bras ». Les mots de patte doivent primer sur les mots de doigt.
    assert.equal(nomSuggereDeChaine3D(['CATRigLLeg1', 'CATRigLLegDigit11'], tr), 'Patte');
  });

  test('l\'aile de la wyverne est une AILE, même enracinée sur une épaule', () => {
    assert.equal(nomSuggereDeChaine3D(['Shoulder.L', 'Wing1.L', 'Wing2.L'], tr), 'Aile');
  });
});

describe('nomSuggereDeChaine3D : la RÉGION se lit dans l\'ordre de la chaîne', () => {
  test('une chaîne partant d\'une main est un doigt, pas un bras', () => {
    // La racine décide, puisqu'elle est lue en premier : sans cet ordre, `hand` gagnerait et toute
    // chaîne de doigt s'appellerait « Bras ».
    assert.equal(nomSuggereDeChaine3D(['Finger01.L', 'Finger02.L'], tr), 'Doigt');
    assert.equal(nomSuggereDeChaine3D(['Hand.L', 'Finger01.L'], tr), 'Bras');
  });

  test('L\'ORDRE DES LIGNES DE LA TABLE tranche quand UN nom porte deux mots', () => {
    // TROU DE TEST TROUVÉ PAR MUTATION. Intervertir « bras » et « doigt » dans la table ne faisait
    // échouer aucun test, alors que le verdict change bel et bien : `CATRigRArmDigit21`, un os réel
    // de centaure3, donne « cat rig r arm digit », et les DEUX motifs y répondent. Les cas montés
    // à la main ne le voyaient pas, chacun de leurs noms ne portant qu'un seul mot.
    assert.equal(nomSuggereDeChaine3D(['CATRigRArmDigit21'], tr), 'Bras');
    assert.equal(nomSuggereDeChaine3D(['CATRigLArmPalm'], tr), 'Bras');
  });

  test('repli sur le reste de la chaîne quand la racine est muette', () => {
    // Cas courant : la racine est un `Bone.004_L` sans le moindre mot, et l'information est plus
    // loin. Sans le repli, la moitié des chaînes nommables seraient perdues.
    assert.equal(nomSuggereDeChaine3D(['Bone.004_L', 'Bone.004_L.001', 'Ear_tip'], tr), 'Oreille');
  });
});

describe('nomSuggereDeChaine3D : mesuré sur le corpus', () => {
  test('le cerbère nomme ses sept chaînes, les trois têtes comprises', () => {
    assert.deepEqual(nomsProposes('cerbere'),
      ['Patte', 'Patte', 'Queue', 'Tête', 'Tête', 'Bras', 'Bras']);
    // ⚠️ LES PATTES AVANT SORTENT « BRAS », et c'est JUSTE au niveau où cette fonction travaille :
    // le fichier les nomme `L Clavicle > L UpperArm > L Forearm > L Hand`. Elle lit ce que le nom
    // dit. Corriger en « Patte avant » relève de l'archétype ou de l'utilisateur, pas d'ici.
  });

  test('centaure3 : trois paires nommées, dont les pattes du fix', () => {
    assert.deepEqual(nomsProposes('centaure3'),
      ['Patte', 'Patte', 'Queue', 'Patte', 'Patte', 'Bras', 'Bras']);
  });

  test('QUATRE FICHIERS NE RENDENT RIEN, et c\'est la moitié de l\'histoire', () => {
    // Ce n'est pas un dégradé, c'est un interrupteur par fichier. Soit le modeleur a écrit `Thigh`
    // et `Tail`, soit il a écrit `Bone.004_L.001` et `l101`. Aucune astuce ne fera parler le
    // second, et l'écran de correspondance doit donc rester utilisable SANS aucun nom proposé.
    ['araignee', 'kraken', 'raptor', 'serpent'].forEach(nom => {
      const proposes = nomsProposes(nom).filter(Boolean);
      assert.deepEqual(proposes, [], `${nom} a gagné des noms, la mesure est à refaire`);
    });
  });

  test('⚠️ CE TEST A DÉBUSQUÉ UN DÉFAUT DE LA DÉCOMPOSITION', () => {
    // Il proposait « Patte » sur centaure2 là où j'attendais rien, parce que la chaîne contenait
    // `UpperBackRightLeg`. J'avais affirmé en #364, dans un test ET dans la doc, que
    // l'arrière-train de ce fichier « n'est pas riggé ». C'était faux, et c'est le vocabulaire qui
    // l'a montré : il lit les noms, et les noms disaient « patte ».
    //
    // Le défaut n'était pas ici mais dans `membresDuSquelette3D`, corrigé par #368. Ce test reste
    // pour garder la trace de qui a trouvé quoi : un outil qui LIT les données finit par contredire
    // ce qu'on croit savoir d'elles, à condition de le laisser parler.
    const proposes = nomsProposes('centaure2').filter(Boolean);
    assert.ok(proposes.filter(n => n === 'Patte').length >= 4,
      'les quatre pattes du cheval doivent se nommer');
    assert.equal(coteDuNom('UpperBackRightLeg'), 'd', 'et leur côté se lit sans peine');
  });

  test('la couverture globale du corpus est de 49 %', () => {
    // Chiffre épinglé pour qu'un ajout de mots se mesure au lieu de se supposer. Il DOIT changer
    // quand la table change : c'est un instantané, pas un objectif.
    const noms = ['cerbere', 'araignee', 'kraken', 'serpent', 'dragon', 'chien', 'oiseau',
      'centaure', 'raptor', 'centaure1', 'centaure2', 'centaure3', 'maison', 'vrm', 'unreal'];
    let total = 0, nommees = 0;
    noms.forEach(n => nomsProposes(n).forEach(s => { total++; if (s) nommees++; }));
    assert.equal(total, 457);
    assert.equal(nommees, 226);
  });

  test('la traduction passe par le paramètre, jamais par un import d\'état', () => {
    // `skeleton-map.js` est pur et doit le rester : `state.js` importe `utils.js`, et un import
    // d'état ici fermerait un cycle. Le traducteur est donc un paramètre, comme partout ailleurs.
    const en = (a) => a;
    assert.equal(nomSuggereDeChaine3D(['Tail_01'], en), 'Tail');
    assert.equal(nomSuggereDeChaine3D(['Tail_01'], tr), 'Queue');
    assert.equal(nomSuggereDeChaine3D(['Tail_01']), 'Tail', 'sans traducteur, l\'anglais');
  });
});

describe('membresDuSquelette3D : le squelette à PLUSIEURS racines', () => {
  // TROU DE TEST TROUVÉ PAR MUTATION. Les dix-sept fixtures ont toutes exactement UNE racine, donc
  // le tri « la racine la plus fournie d'abord » n'y change jamais rien : l'inverser ne faisait
  // échouer aucun test. Ce n'est pas du code mort pour autant, un `.glb` peut parfaitement déclarer
  // plusieurs os racines dans son `skin`, et prendre le mauvais donnerait un tronc d'un seul os.
  //
  // Le cas n'existant pas dans le corpus, il se monte à la main. C'est l'exception assumée : un
  // squelette de fixture épingle du RÉEL, un squelette monté épingle une garde.
  const os = [
    { id: 1, name: 'Accessoire', children: [2] },
    { id: 2, name: 'Accessoire_bout', children: [] },
    { id: 10, name: 'Hips', children: [11, 20, 30] },
    { id: 11, name: 'Spine', children: [12] },
    { id: 12, name: 'Head', children: [] },
    { id: 20, name: 'LeftUpLeg', children: [21] },
    { id: 21, name: 'LeftLeg', children: [] },
    { id: 30, name: 'RightUpLeg', children: [31] },
    { id: 31, name: 'RightLeg', children: [] },
  ];

  test('la racine la PLUS FOURNIE porte le tronc, pas la première venue', () => {
    const r = membresDuSquelette3D(os);
    assert.deepEqual(r.tronc, [10, 11, 12], 'le corps, pas l\'accessoire à deux os');
    assert.equal(r.membres.filter(m => m.cote).length, 2, 'les deux jambes');
  });

  test('l\'ordre de déclaration ne change rien', () => {
    // La garde vaut surtout contre un fichier où l'accessoire est déclaré en premier.
    const inverse = [...os].reverse();
    assert.deepEqual(membresDuSquelette3D(inverse).tronc, [10, 11, 12]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// #366 — PROPOSER UN ARCHÉTYPE DE MORPHOLOGIE
//
// Trois archétypes se DÉTECTENT, les autres se PROPOSENT. Ces tests épinglent les deux, et surtout
// les quatre fichiers sur dix-sept où la proposition est fausse : c'est ce qui justifie que
// l'écran affiche « à confirmer » au lieu de « reconnu ».
// ─────────────────────────────────────────────────────────────────────────────

describe('signatureDuSquelette3D : cinq nombres, et rien d\'autre', () => {
  test('la signature du corpus, épinglée', () => {
    // Séparée du classement à dessein : elle se MESURE, il INTERPRÈTE. Ces valeurs doivent changer
    // quand la décomposition change, jamais quand une règle de classement change.
    const sig = (n) => {
      const s = signatureDuSquelette3D(membresDuSquelette3D(charger(n)));
      return [s.lateraux, s.ancres, s.rangMax, s.ancresSuccessives];
    };
    assert.deepEqual(sig('serpent'), [0, 0, 0, 0], 'aucune paire, nulle part');
    assert.deepEqual(sig('kraken'), [8, 1, 4, 1], 'une ancre, quatre rangs');
    assert.deepEqual(sig('araignee'), [28, 5, 3, 5], 'cinq ancres consécutives');
    assert.deepEqual(sig('mixamo'), [4, 2, 1, 1], 'deux paires, deux ancres');
  });

  test('un squelette vide ou absent ne fait rien exploser', () => {
    assert.deepEqual(signatureDuSquelette3D(null),
      { lateraux: 0, ancres: 0, rangMax: 0, ancresSuccessives: 0, paires: 0 });
    assert.deepEqual(signatureDuSquelette3D({ tronc: [], membres: [] }).lateraux, 0);
  });
});

describe('archetypeSuggere3D : ce que la TOPOLOGIE tranche', () => {
  // Ces trois-là sont sûrs, et chacun pour une raison qu'aucun autre fichier du corpus ne présente.
  test('serpentin : AUCUNE paire latérale, pas un « peu »', () => {
    // Le serpent n'a pas peu de paires, il n'en a aucune. Aucun seuil à choisir, donc aucun seuil
    // à inventer. C'est le seul des dix-sept dans ce cas.
    assert.deepEqual(archetypeSuggere3D(charger('serpent')), { cle: 'serpentin', origine: 'topologie' });
  });

  test('radial : plusieurs rangs sur UNE seule ancre', () => {
    // Huit tentacules sur `krakenjoints`, en quatre rangs. Centaure2 n'a lui aussi qu'UNE ancre sur
    // le tronc, mais un seul rang : la condition porte bien sur les deux, sans quoi un centaure
    // sortirait radial.
    assert.deepEqual(archetypeSuggere3D(charger('kraken')), { cle: 'radial', origine: 'topologie' });
    assert.notEqual(archetypeSuggere3D(charger('centaure2')).cle, 'radial');
  });

  test('arachnide : quatre ancres consécutives ou plus', () => {
    // L'araignée en a CINQ d'affilée, une par segment de corps. Le suivant du corpus en a TROIS,
    // le rig Unreal et le chien. Le seuil est posé dans un écart mesuré, ce qui n'est pas un nombre
    // inventé : il n'existe aucune valeur entre 3 et 5 dans le corpus.
    assert.deepEqual(archetypeSuggere3D(charger('araignee')), { cle: 'arachnide', origine: 'topologie' });
    ['unreal', 'chien'].forEach(n =>
      assert.notEqual(archetypeSuggere3D(charger(n)).cle, 'arachnide', `${n} ne doit pas être segmenté`));
  });
});

describe('archetypeSuggere3D : ce que les NOMS proposent, et où ils se trompent', () => {
  const cle = (n) => archetypeSuggere3D(charger(n)).cle;

  test('les six humanoïdes sont proposés humanoïdes', () => {
    ['maison', 'unreal', 'mixamo', 'vrm', 'vroid-alt', 'centaure']
      .forEach(n => assert.equal(cle(n), 'humanoide', n));
  });

  test('chien quadrupède, wyverne bipède ailé, deux centaures centaures', () => {
    assert.equal(cle('chien'), 'quadrupede');
    assert.equal(cle('dragon'), 'bipede_aile');
    assert.equal(cle('centaure2'), 'centaure');
    assert.equal(cle('centaure3'), 'centaure');
  });

  test('⚠️ QUATRE FICHIERS SUR DIX-SEPT SONT MAL PROPOSÉS, avec leur cause', () => {
    // C'EST LA RAISON D'ÊTRE DU MOT « PROPOSÉ ». Ces quatre erreurs ne sont pas des bugs à corriger
    // mais la limite mesurée de ce que le nom peut dire, et l'écran doit donc afficher
    // « à confirmer » sur tout ce qui n'est pas d'origine 'topologie'.
    //
    //   CERBÈRE : ses pattes AVANT s'appellent `L Clavicle > L UpperArm > L Forearm > L Hand`. Le
    //     vocabulaire lit « Bras », donc deux pattes et deux bras, donc humanoïde. Le fichier ment,
    //     pas la règle ;
    //   OISEAU : ses ailes sont nommées comme des bras, même cause exactement ;
    //   RAPTOR : ses os s'appellent `Bone.034.L`. AUCUN nom ne dit rien, il tombe dans le repli par
    //     nombre de paires, qui ne connaît que l'humanoïde à deux paires ;
    //   CENTAURE1 : ses pattes avant de cheval s'appellent `lower_L_shoulder`. Quatre « Bras » et
    //     deux « Pattes », donc humanoïde. Compter `bras >= 4` le rattraperait et casserait le rig
    //     Unreal, qui en a quatre aussi. Pas de règle sans contre-exemple, donc pas de règle.
    assert.equal(cle('cerbere'), 'humanoide', 'devrait être quadrupède');
    assert.equal(cle('oiseau'), 'humanoide', 'devrait être bipède ailé');
    assert.equal(cle('raptor'), 'humanoide', 'devrait être bipède à queue');
    assert.equal(cle('centaure1'), 'humanoide', 'devrait être centaure');
  });

  test('AUCUNE erreur ne porte l\'origine « topologie »', () => {
    // La garde qui rend les quatre erreurs ci-dessus acceptables : elles sont toutes signalées.
    ['cerbere', 'oiseau', 'raptor', 'centaure1'].forEach(n =>
      assert.notEqual(archetypeSuggere3D(charger(n)).origine, 'topologie', n));
  });

  test('un squelette vide tombe dans le refuge, jamais dans une forme', () => {
    assert.deepEqual(archetypeSuggere3D([]), { cle: 'complexe', origine: 'structure' });
    assert.deepEqual(archetypeSuggere3D(null), { cle: 'complexe', origine: 'structure' });
  });

  test('chaque clé proposée existe dans ARCHETYPES_3D', () => {
    // Une clé inventée passerait tous les tests ci-dessus et ne s'afficherait nulle part.
    const connues = new Set(ARCHETYPES_3D.map(a => a.cle));
    ['serpent', 'kraken', 'araignee', 'chien', 'dragon', 'centaure2', 'centaure3', 'mixamo',
      'cerbere', 'oiseau', 'raptor', 'centaure1', 'maison', 'unreal', 'vrm', 'vroid-alt', 'centaure']
      .forEach(n => assert.ok(connues.has(cle(n)), `${cle(n)} n'est pas un archétype connu`));
  });
});

describe('ARCHETYPES_3D : la table, et son lien avec les animaux intégrés', () => {
  test('les tables d\'emplacements existaient déjà dans ANIMAL_JOINT_DEFS', () => {
    // C'est le constat qui a fait cette tâche : le loup EST la table du quadrupède, le singe celle
    // du bipède à queue, le griffon celle du quadrupède ailé. Rien à inventer.
    const par = Object.fromEntries(ARCHETYPES_3D.map(a => [a.cle, a.animal]));
    assert.equal(par.quadrupede, 'loup');
    assert.equal(par.bipede_queue, 'singe');
    assert.equal(par.quadrupede_aile, 'griffon');
    assert.equal(par.bipede_aile, 'oiseau');
  });

  test('chaque animal cité existe vraiment, et a ses articulations', () => {
    ARCHETYPES_3D.filter(a => a.animal).forEach(a => {
      assert.ok(ANIMAL_TYPES.includes(a.animal), `${a.animal} n'est pas un animal intégré`);
      assert.ok((ANIMAL_JOINT_DEFS[a.animal] || []).length, `${a.animal} n'a aucune articulation`);
    });
  });

  test('« complexe » est le refuge, et n\'emprunte à personne', () => {
    const refuge = ARCHETYPES_3D.find(a => a.cle === 'complexe');
    assert.ok(refuge, 'le refuge doit exister, c\'est la sortie de secours de l\'écran');
    assert.equal(refuge.animal, null);
  });

  test('les clés sont uniques et les deux langues présentes', () => {
    assert.equal(new Set(ARCHETYPES_3D.map(a => a.cle)).size, ARCHETYPES_3D.length);
    ARCHETYPES_3D.forEach(a => assert.ok(a.label && a.labelEn, `${a.cle} n'a pas ses deux libellés`));
    // « Radial » s'écrit pareil dans les deux langues, et c'est le seul du lot : une garde
    // « les deux libellés diffèrent » l'exclurait à tort, donc elle porte sur les autres.
    const identiques = ARCHETYPES_3D.filter(a => a.label === a.labelEn).map(a => a.cle);
    assert.deepEqual(identiques, ['radial']);
  });
});

describe('archetypeSuggere3D : trois gardes que le corpus ne couvre pas', () => {
  // TROUS TROUVÉS PAR MUTATION. Trois altérations du code ne faisaient échouer aucun test, non pas
  // parce que le code s'en moque, mais parce que le corpus ne contient aucun fichier qui les
  // distingue. Les cas se montent donc à la main, et ils disent chacun pourquoi.

  /** Un tronc de trois os, et les paires qu'on lui accroche. */
  const squelette = (paires) => {
    const os = [
      { id: 1, name: 'Hips', children: [2] },
      { id: 2, name: 'Spine', children: [3] },
      { id: 3, name: 'Head', children: [] },
    ];
    let prochain = 100;
    paires.forEach(({ ancre, noms }) => {
      noms.forEach(n => {
        const racine = prochain++;
        os.find(o => o.id === ancre).children.push(racine);
        os.push({ id: racine, name: n + '1', children: [prochain] });
        os.push({ id: prochain, name: n + '2', children: [prochain + 1] });
        os.push({ id: prochain + 1, name: n + '3', children: [] });
        prochain += 2;
      });
    });
    return os;
  };

  test('UNE seule paire ne fait pas un serpent', () => {
    // Le serpent n'a AUCUNE paire ; remplacer l'égalité par un seuil (`< 3`) ne fait échouer aucun
    // test du corpus, faute d'un fichier à une ou deux chaînes latérales. Un poisson à deux
    // nageoires en serait un, et il n'a rien de serpentin.
    const poisson = squelette([{ ancre: 1, noms: ['LeftFin', 'RightFin'] }]);
    assert.notEqual(archetypeSuggere3D(poisson).cle, 'serpentin');
    assert.equal(archetypeSuggere3D(squelette([])).cle, 'serpentin', 'zéro paire, lui, en est un');
  });

  test('un QUADRUPÈDE AILÉ se propose, alors qu\'aucun modèle importé n\'en est un', () => {
    // La branche `ailes >= 2 && pattes >= 4` ne se déclenche sur AUCUN des dix-sept fichiers : le
    // griffon intégré a cette forme, mais le corpus importé n'en contient pas, ce que la doc
    // signale déjà. Sans ce cas monté à la main, la branche est du code jamais exécuté.
    const griffon = squelette([
      { ancre: 1, noms: ['LeftHindLeg', 'RightHindLeg'] },
      { ancre: 2, noms: ['LeftFrontLeg', 'RightFrontLeg', 'LeftWing', 'RightWing'] },
    ]);
    assert.deepEqual(archetypeSuggere3D(griffon), { cle: 'quadrupede_aile', origine: 'nom' });
  });

  test('un RANG demande les DEUX côtés, pas le plus fourni', () => {
    // `rangMax` prend le MINIMUM des deux côtés : trois chaînes à gauche et une à droite font UN
    // rang, pas trois. Prendre le maximum ne fait échouer aucun test du corpus, où les ancres sont
    // toutes symétriques. Sur un rig incomplet, cela ferait passer un modèle pour radial.
    const bancal = [
      { id: 1, name: 'Body', children: [10, 11, 12, 20] },
      { id: 10, name: 'LeftArm1', children: [] },
      { id: 11, name: 'LeftLeg1', children: [] },
      { id: 12, name: 'LeftWing1', children: [] },
      { id: 20, name: 'RightArm1', children: [] },
    ];
    const s = signatureDuSquelette3D(membresDuSquelette3D(bancal));
    assert.equal(s.rangMax, 1, 'un seul rang complet');
    assert.equal(s.lateraux, 4, 'quatre chaînes latérales tout de même');
  });
});
