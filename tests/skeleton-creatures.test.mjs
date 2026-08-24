/**
 * tests/skeleton-creatures.test.mjs, la reconnaissance face à ce qui n'est pas humanoïde.
 *
 * CE FICHIER N'ÉPINGLE PAS UN COMPORTEMENT CORRECT. Il épingle le comportement ACTUEL, fautes
 * comprises, sur huit créatures réelles fournies par l'utilisateur. C'est un filet, pas un satisfecit.
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
 * CE QUE CES HUIT FICHIERS APPRENNENT, et qu'aucun montage n'aurait donné :
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
 *   6. les chaînes réelles sont longues. Patte arrière du dragon : 9 segments. On s'arrête à 3.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { inferSkeletonMap, membresDuSquelette3D, SLOTS } from '../src/skeleton-map.js';

const charger = (nom) => {
  const d = JSON.parse(readFileSync(new URL(`fixtures/squelette-${nom}.json`, import.meta.url), 'utf8'));
  return d.os.map(o => ({ id: o.i, name: o.name, children: o.children }));
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

  test('le dernier segment porte TROIS paires de plus, et ce ne sont pas des pattes', () => {
    // MON ASSERTION ÉTAIT FAUSSE AVANT CELLE-CI, et c'est le fichier qui a corrigé : je comptais
    // huit membres latéraux, il y en a douze. Le dernier segment du tronc porte trois paires
    // supplémentaires, de 6, 5 et 1 os. Sur une araignée ce sont les pédipalpes et les chélicères,
    // appendices buccaux bien réels et parfaitement posables.
    //
    // Consigné parce que c'est exactement ce que la décomposition générique doit savoir faire : ne
    // pas décider d'avance combien de paires un corps peut porter.
    const derniere = r.membres.filter(m => m.cote && m.segments.length !== 7);
    assert.equal(derniere.length, 6, 'trois paires : 6 os, 5 os, et une de 1 os');
    assert.equal(new Set(derniere.map(m => m.ancre)).size, 1, 'toutes sur la même ancre');
    assert.deepEqual(derniere.map(m => m.rang), [1, 1, 2, 2, 3, 3]);
    assert.deepEqual(derniere.map(m => m.segments.length), [6, 6, 5, 5, 1, 1]);
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
  test('rig Unreal : 185 membres, dont 131 de DEUX os', () => {
    // Os de torsion, correctifs, auxiliaires `FX_`, `_twist_`. Ils forment de vraies paires
    // latérales, la règle les attrape donc légitimement. Ce qui manque n'est pas une exception à la
    // règle, c'est un critère d'IMPORTANCE, et ce chiffre le donne : la longueur sépare nettement
    // les quatre vrais membres (6 à 10 os) du bruit (2 os).
    const r = membresDuSquelette3D(charger('unreal'));
    assert.equal(r.membres.length, 185);
    const parLongueur = {};
    r.membres.forEach(m => { parLongueur[m.segments.length] = (parLongueur[m.segments.length] || 0) + 1; });
    assert.equal(parLongueur[2], 131);
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
    assert.equal(trouves.length, 62, 'le compte d\'échafaudages du corpus a changé');
    // ⚠️ LA GARDE SE FAIT SUR DES NOMS EXACTS, pas sur un mot contenu. Ma première version
    // cherchait « thigh » quelque part dans le nom, et elle a accusé le filet à tort :
    // `thigh_vol_end_rSocket` est une prise d'attache, pas une cuisse. Le mot d'une partie du corps
    // apparaît couramment dans le nom d'un accessoire qui s'y rattache.
    const vraisMembres = ['thigh_l', 'thigh_r', 'clavicle_l', 'clavicle_r', 'Wing1.L', 'Wing1.R',
      'ThighBase.L', 'ThighBase.R', 'FrontUpperLeg.L', 'BackShoulder.L'];
    vraisMembres.forEach(n => assert.ok(!trouves.includes(n), `${n} est tombé dans le filet`));
  });
});
