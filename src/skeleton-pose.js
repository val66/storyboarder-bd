/**
 * @file skeleton-pose.js
 * Tourner un os d'un squelette importé, la forme persistée, et la seule opération qui compte.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * POURQUOI CE FICHIER N'EST PAS UNE COPIE DE `applyAnimalJointAngles`
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Le rig d'un Animal est construit par nous : chaque pivot naît à la rotation (0,0,0), et poser une
 * articulation s'écrit `pivot.rotation.set(x, y, z)`. La fonction commence même par remettre TOUS
 * les pivots à zéro, ce qui est exact, zéro y est la pose de repos.
 *
 * UN SQUELETTE IMPORTÉ NE MARCHE PAS COMME ÇA, ET LE CHIFFRE EST SANS APPEL. Mesure faite sur les
 * six fichiers réels de l'utilisateur, en lisant les quaternions de repos des `nodes` glTF :
 *
 *   fichier            os mappés   repos = identité   repos DÉJÀ TOURNÉ
 *   anime_girl1.glb        18             0                  18
 *   anime_girl2.glb        18             0                  18
 *   capoera.glb            18             1                  17
 *   female_pose.glb        18             1                  17
 *   hulk_-_sm_bnd.glb      18             0                  18
 *   worker_j.glb           18             0                  18
 *   ─────────────────────────────────────────────────────────────────
 *   total                 108             2                 106
 *
 * 106 os sur 108. Écrire `bone.rotation.set(...)`, ou remettre à zéro avant d'écrire, comme le
 * fait la version Animal. DÉTRUIRAIT la pose de repos de presque chaque os : le personnage
 * s'effondrerait au premier curseur touché, et le curseur suivant partirait d'un corps déjà cassé.
 *
 * D'où l'unique règle de ce fichier : ON COMPOSE, ON N'ÉCRASE PAS.
 *
 *     orientation finale = repos ⊗ delta
 *
 * `repos` est le quaternion que l'os portait à la sortie du décodeur, capturé une fois à la
 * construction du rig. `delta` est ce que l'utilisateur demande, exprimé dans le repère LOCAL de
 * l'os. Une pose vide redonne exactement le repos, propriété qu'un test épingle, parce que c'est
 * elle qui garantit qu'ouvrir la fiche d'un modèle sans rien toucher ne l'abîme pas.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * CE QUE CE FICHIER NE PRÉTEND PAS FAIRE
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Les axes de repos DIFFÈRENT D'UN FICHIER À L'AUTRE, et parfois d'un os à l'autre : cinq des six
 * fichiers mesurés alignent leurs os sur +Y, le rig Unreal sur ±X selon le côté et le membre
 * (cf. docs/en/imported-skeletons.md). « Lever le bras » n'est donc pas le même axe partout, et
 * aucune correction générale n'est tentée ICI.
 *
 * ⚠️ UNE VERSION ANTÉRIEURE DE CE COMMENTAIRE AFFIRMAIT que sur anime_girl1 « les membres pointent
 * selon +Y et la colonne selon −Z ». C'était faux : la colonne pointe elle aussi vers +Y. Cette
 * phrase confondait la ROTATION de repos d'un os avec sa DIRECTION vers son enfant, et elle a été
 * recopiée de commentaire en commentaire avant d'être vérifiée.
 *
 * Ce que l'étape D promet est plus modeste et entièrement tenu : X, Y et Z tournent l'os dans SON
 * repère. L'utilisateur voit immédiatement lequel fait ce qu'il veut. Traduire un vocabulaire de
 * pose partagé (« bras levé ») vers le bon axe de chaque os est le travail de l'étape E, et c'est
 * précisément parce qu'il est difficile qu'il ne doit pas contaminer celui-ci.
 *
 * ENTRÉES ET SORTIES SONT DES NOMBRES ET DES OBJETS SIMPLES. Aucun import de Three : la composition
 * est écrite à la main sur des quaternions [x, y, z, w]. C'est vingt lignes d'algèbre, et cela rend
 * testable sous Node la seule chose qui puisse silencieusement tordre un personnage.
 */

import { SLOTS, SLOT_GROUPS, slotLabel, lignesDeCorrespondance3D } from './skeleton-map.js';

/**
 * Le préfixe des clés de pose qui désignent un OS et non un emplacement (#374).
 *
 * POURQUOI UN PRÉFIXE PLUTÔT QUE LE NOM NU. Une pose est un dictionnaire `{ clé: {x,y,z} }` dont
 * les clés étaient jusqu'ici les dix-huit emplacements. Les membres surnuméraires n'en ont pas :
 * leur seule identité stable est le NOM de l'os, celui-là même que le fichier de correspondances
 * mémorise déjà (cf. skeleton-store.js). Un os pourrait donc s'appeler `tete` et écraser
 * l'emplacement du même nom.
 *
 * MESURÉ : sur les 3032 os des dix-sept fixtures, zéro nom coïncide avec un emplacement, et zéro
 * nom est en double dans son fichier. Le préfixe n'est donc PAS une réponse à un problème observé,
 * c'est le refus d'un pari : la même mesure « aucun contre-exemple dans le corpus » avait fait
 * accepter un motif de côté trop large en #363, et il lisait `ARMature` comme une droite. Deux
 * caractères coûtent moins cher qu'un fichier de Projet silencieusement faux.
 *
 * Aucun champ persisté nouveau : ces clés vivent dans `skeletonPose3d`, à côté des emplacements.
 */
export const PREFIXE_OS_3D = 'os:';

/** La clé de pose d'un os, depuis son nom. */
export function clePoseOs3D(nom){ return PREFIXE_OS_3D + nom; }

/** Cette clé désigne-t-elle un os plutôt qu'un emplacement ? */
export function estClePoseOs3D(cle){
  return typeof cle === 'string' && cle.startsWith(PREFIXE_OS_3D) && cle.length > PREFIXE_OS_3D.length;
}

/** Le nom d'os d'une clé, ou `null` si la clé est un emplacement. */
export function nomDOsDeCle3D(cle){
  return estClePoseOs3D(cle) ? cle.slice(PREFIXE_OS_3D.length) : null;
}

/**
 * Les trois axes pilotables, dans l'ordre d'affichage.
 *
 * Trois curseurs par os, sans exception ni cas particulier. Un descripteur par articulation
 * (comme `poseSliderSpecs3D` pour le rig intégré) serait ici une prétention : nous ne savons PAS
 * quel axe est le coude d'un fichier inconnu, et prétendre le savoir produirait exactement le
 * genre d'énumération incomplète tenue à la main dont ce dépôt a déjà souffert.
 */
export const POSE_AXES = ['x', 'y', 'z'];

/** Amplitude des curseurs, en degrés. Symétrique : aucun os importé n'a de butée connue. */
export const POSE_LIMITE_DEG = 180;

/**
 * Les emplacements RECONNUS mais NON pilotables par un curseur.
 *
 * LE BASSIN EST LA RACINE DU SQUELETTE, et le tourner fait pivoter le personnage ENTIER. Mesuré sur
 * les fichiers réels : il entraîne 108 os sur 109 dans worker_j, et la totalité dans capoera et
 * female_pose. Son curseur faisait donc exactement ce que fait déjà l'Orientation de l'Élément,
 * deux commandes pour un seul effet, sans que rien ne le dise. Signalé à l'usage, sous la forme
 * « les trois premiers curseurs sont les mêmes que ceux de l'orientation » : c'était exact.
 *
 * J'AVAIS VU CE PROBLÈME EN CONSTRUISANT CETTE ÉTAPE et je l'ai écarté, en me disant qu'exclure le
 * bassin serait un choix inventé. C'était le mauvais arbitrage : l'argument était mesurable, et il
 * ne demandait qu'à être mesuré.
 *
 * IL RESTE DANS LA CORRESPONDANCE, et ce n'est pas une inconséquence : la reconnaissance
 * structurelle PART du bassin pour trouver les jambes et la colonne (cf. skeleton-map.js). Le
 * retirer de là casserait tout le reste. Une correspondance décrit le FICHIER ; ce qu'on choisit de
 * piloter est une autre question.
 */
export const SLOTS_NON_POSABLES = ['bassin'];

/** Un emplacement mérite-t-il un curseur ? */
export function estPosable(slot){
  return !SLOTS_NON_POSABLES.includes(slot);
}

/**
 * Normalise une pose relue d'un Projet. Fonction PURE, et défensive par principe.
 *
 * Un Projet peut avoir été écrit par une version antérieure, édité à la main, ou porter une pose
 * pour un emplacement qu'une correspondance ultérieure a laissé vide. Aucun de ces cas ne doit
 * faire échouer l'ouverture : on garde ce qui a un sens, on jette le reste en silence.
 *
 * Les angles NULS SONT JETÉS. Un `{ x: 0, y: 0, z: 0 }` ne dit rien de plus qu'une absence, et le
 * garder ferait grossir chaque Projet d'un bruit que personne ne relit. C'est aussi ce qui rend
 * `estPosee` fiable, voir plus bas.
 */
export function normaliserPose(brut){
  const sortie = {};
  if (!brut || typeof brut !== 'object') return sortie;
  // LES CLÉS D'OS SONT GARDÉES SANS ÊTRE VÉRIFIÉES, et c'est le contraire d'un oubli. Un emplacement
  // se vérifie parce que les emplacements forment une liste FERMÉE ; un nom d'os ne se vérifie qu'en
  // ayant le `.glb` décodé sous la main, ce qui n'est pas garanti au moment où un Projet
  // s'enregistre. Une clé qui ne désigne aucun os du fichier est de toute façon INERTE :
  // `applySkeletonPose` parcourt les os récoltés, pas la pose. Le pire cas est donc quelques octets
  // conservés dans le Projet, et l'utilisateur retrouve sa pose s'il rebranche le bon fichier ; la
  // jeter serait perdre du travail pour cause de fichier momentanément absent.
  Object.keys(brut).forEach(cle => {
    if (!estClePoseOs3D(cle)) return;
    const garde = anglesNonNuls(brut[cle]);
    if (garde) sortie[cle] = garde;
  });
  SLOTS.forEach(slot => {
    // Un emplacement devenu non pilotable est JETÉ à la relecture. Un Projet enregistré par une
    // version où le bassin avait des curseurs porterait sinon une rotation que plus personne ne
    // peut voir ni annuler, le personnage resterait de travers, sans commande pour le redresser.
    // C'est une valeur qu'on cesse de lire, pas un champ renommé : la forme persistée ne bouge pas.
    if (!estPosable(slot)) return;
    const garde = anglesNonNuls(brut[slot]);
    if (garde) sortie[slot] = garde;
  });
  return sortie;
}

/**
 * Les angles non nuls d'une entrée de pose, ou `null` s'il n'en reste aucun. Fonction PURE.
 *
 * Extraite pour être appelée aux DEUX endroits de `normaliserPose`. Deux copies de cette boucle,
 * c'était deux endroits où oublier plus tard qu'un zéro se jette, et une mutation qui n'en casse
 * qu'un seul passe à travers les tests.
 */
function anglesNonNuls(angles){
  if (!angles || typeof angles !== 'object') return null;
  const garde = {};
  POSE_AXES.forEach(axe => {
    const v = Number(angles[axe]);
    if (Number.isFinite(v) && v !== 0) garde[axe] = v;
  });
  return Object.keys(garde).length ? garde : null;
}

/** Un Élément porte-t-il une pose ? Vrai seulement si un angle non nul subsiste après normalisation. */
export function estPosee(pose){
  return Object.keys(normaliserPose(pose)).length > 0;
}

/** L'angle d'un axe, en degrés arrondis, ce qu'un curseur affiche. Absent vaut 0. */
export function lireAngleDeg(pose, slot, axe){
  const angles = (pose || {})[slot];
  const rad = angles ? Number(angles[axe]) : 0;
  return Number.isFinite(rad) ? Math.round(rad * 180 / Math.PI) : 0;
}

/**
 * Écrit un angle, en degrés, DANS la pose passée (mutation assumée : c'est un brouillon d'interface).
 *
 * Un angle ramené à zéro EFFACE l'entrée plutôt que d'y laisser un zéro, et l'emplacement disparaît
 * s'il n'a plus aucun axe. Sans cela, toucher un curseur puis le remettre où il était laisserait
 * l'Élément marqué comme posé à jamais.
 */
export function ecrireAngleDeg(pose, slot, axe, deg){
  const accepte = estClePoseOs3D(slot) || (SLOTS.includes(slot) && estPosable(slot));
  if (!pose || !accepte || !POSE_AXES.includes(axe)) return pose;
  const rad = Number(deg) * Math.PI / 180;
  if (!Number.isFinite(rad) || Math.round(Number(deg)) === 0) {
    if (pose[slot]) {
      delete pose[slot][axe];
      if (!Object.keys(pose[slot]).length) delete pose[slot];
    }
    return pose;
  }
  if (!pose[slot]) pose[slot] = {};
  pose[slot][axe] = rad;
  return pose;
}

/**
 * Les groupes de curseurs à afficher pour une correspondance donnée. Fonction PURE.
 *
 * UN EMPLACEMENT SANS OS N'A PAS DE CURSEUR. Ce n'est pas de la cosmétique : un curseur qui ne
 * pilote rien est un mensonge exactement de la même famille que « un succès annoncé pour un travail
 * sans effet ». L'utilisateur le tournerait, ne verrait rien, et n'aurait aucun moyen de savoir si
 * le modèle est en cause ou l'application.
 *
 * Un groupe entièrement vide disparaît aussi, un titre « Bras gauche » sans une ligne dessous
 * pose la même question sans y répondre.
 */
export function groupesPosables(carte, traduire){
  const t = traduire || ((en) => en);
  return SLOT_GROUPS
    .map(g => ({
      titre: t(g.titre[0], g.titre[1]),
      slots: g.slots.filter(slot => estPosable(slot) && (carte || {})[slot] && (carte || {})[slot].bone)
        .map(slot => ({ slot, label: slotLabel(slot, t) })),
    }))
    .filter(g => g.slots.length > 0);
}

/**
 * Les groupes de curseurs d'un squelette QUELCONQUE, engendrés depuis ses chaînes. Fonction PURE.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * POURQUOI CETTE FONCTION REMPLACE `groupesPosables` AU LIEU DE S'Y AJOUTER
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Sur une créature, les dix-huit emplacements ne sont pas incomplets, ils sont FAUX. Mesuré sur le
 * cerbère : `tete` reçoit le premier os de la patte avant gauche, et `clavicule_g` à `main_g`
 * reçoivent la TÊTE gauche. Sur l'araignée, `bras_g` et `cuisse_g` sont deux pattes sur huit et
 * `tete` est un segment de corps.
 *
 * Ajouter une section « membres surnuméraires » À CÔTÉ aurait donc laissé un curseur « Bras gauche »
 * qui bouge une tête, et la bonne tête juste en dessous : deux commandes pour un seul os, sans que
 * rien ne le dise. C'est exactement le défaut qui a fait retirer ses curseurs au bassin
 * (cf. SLOTS_NON_POSABLES), et il aurait été réintroduit à l'échelle d'un squelette entier.
 *
 * C'est donc la MORPHOLOGIE qui tranche, celle que le sélecteur de #369 laisse corriger :
 * `humanoide` garde les dix-huit emplacements, tout le reste passe par ici. Les six fichiers réels
 * de l'utilisateur sont humanoïdes, et ne bougent pas d'un pixel.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * CE QUI EST ÉCARTÉ EN TÊTE DE TRONC, ET POURQUOI CE N'EST PAS UN SEUIL
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Les os du tronc qui précèdent la première ancre, celle-ci comprise, N'ONT PAS DE CURSEUR : ce sont
 * ceux qui portent la TOTALITÉ des membres, donc les tourner fait pivoter la figure entière, ce que
 * l'Orientation de l'Élément fait déjà. Même argument que pour le bassin, appliqué à la lettre.
 *
 * ⚠️ J'AI D'ABORD CHERCHÉ UN SEUIL, « écarter un os qui entraîne plus de 90 % du squelette », et la
 * mesure l'a démenti. Fraction du squelette entraînée par les premiers os du tronc :
 *
 *   araignée   100, 99, 90, 67, 52, 37, 21 %
 *   cerbère    100, 98, 96, 94, 54, 52, 50 %
 *   serpent    100, 99, 92, 91, 90, 89, 88 %
 *
 * Aucun trou. N'importe quel pourcentage aurait coupé le serpent en plein milieu de son tronc de
 * 86 os. Le critère retenu est STRUCTUREL et ne se règle pas : « cet os porte-t-il tous les
 * membres ? ». Il coûte 2 os de tronc sur les fixtures, 4 au pire (cerbère), jamais plus.
 *
 * @param {Array<{id, name, children}>} os la liste d'os neutre
 * @param {Array<{racine, nom, retenu}>} [membres] les choix humains relus du disque
 * @returns `[{ titre, chaines: [{ titre, os: [{ cle, label }] }] }]`, `cle` étant préfixée `os:`
 */
export function groupesPosablesMembres3D(os, membres, traduire){
  const t = traduire || ((en) => en);
  const lignes = lignesDeCorrespondance3D(os, membres, t);
  if (!lignes.tronc) return [];

  const nomDe = new Map((os || []).filter(o => o && o.id !== undefined).map(o => [o.id, o.name]));
  const ancres = new Set(lignes.groupes.map(g => g.ancre));
  const rangees = (ids) => ids
    .map(id => nomDe.get(id))
    .filter(nom => typeof nom === 'string' && nom)
    .map(nom => ({ cle: clePoseOs3D(nom), label: nom }));

  const groupes = [];
  const segments = lignes.tronc.segments;
  // `findIndex` rend -1 quand AUCUN os du tronc n'est une ancre, cas du serpent, dont l'unique
  // chaîne part d'un os déjà écarté. Le `+ 1` ci-dessous en fait alors une coupe à zéro : tout le
  // tronc est pilotable, ce qui est exact, rien d'autre ne bouge avec lui.
  const coupe = segments.findIndex(id => ancres.has(id));
  const osTronc = rangees(segments.slice(coupe + 1));
  if (osTronc.length) groupes.push({ titre: lignes.tronc.nom, chaines: [{ titre: lignes.tronc.nom, os: osTronc }] });

  lignes.groupes.forEach(g => {
    // UNE CHAÎNE DÉCOCHÉE N'A PAS DE CURSEUR. C'est le seul filtre, et il est HUMAIN : la case de
    // l'écran de correspondance (#373). Le code n'écarte rien de lui-même, faute de savoir le faire,
    // cf. l'étape 3 de docs/en/creature-rigs.md et l'hypothèse de la longueur, démentie.
    const chaines = g.membres
      .filter(m => m.retenu)
      .map(m => ({ titre: m.rang > 1 ? `${m.nom} ${t('rank', 'rang')} ${m.rang}` : m.nom, os: rangees(m.segments) }))
      .filter(c => c.os.length);
    if (chaines.length) groupes.push({ titre: `${t('Anchor', 'Ancre')} ${g.ancreNom}`, chaines });
  });
  return groupes;
}

/**
 * Quels os récolter sur un modèle, et sous quelle clé. Fonction PURE.
 *
 * ⚠️ UN OS NE DOIT JAMAIS ÊTRE RÉCOLTÉ SOUS DEUX CLÉS, et c'est cette fonction qui le garantit.
 * `applySkeletonPose` réécrit le quaternion de chaque entrée récoltée ; deux entrées visant le même
 * os se termineraient par « la dernière parcourue gagne », c'est-à-dire par un curseur qui en annule
 * un autre selon un ordre de clés que personne ne contrôle. Sur une créature les chaînes et les
 * emplacements désignent LES MÊMES OS, la question n'est donc pas théorique.
 *
 * ELLE EXISTE PARCE QUE LA MUTATION A ÉCHAPPÉ. La décision vivait dans `recolterOsMappes`, sous la
 * forme « branche créature, `return`, puis les dix-huit emplacements ». Retirer ce `return` unissait
 * les deux sources sans qu'aucun test ne bronche : le test qui prétendait le surveiller cherchait la
 * position d'un `return sortie;` qui apparaît TROIS fois dans cette fonction, et lisait donc la
 * garde du haut. Une décision qu'on peut appeler et vérifier vaut mieux qu'une position dans un
 * corps de fonction.
 *
 * @returns `[{ cle, nom }]`, `nom` étant le nom de l'os à retrouver dans le clone
 */
export function clesARecolter3D({ morphologie, carte, os, membres } = {}, traduire){
  if (morphologie !== 'humanoide') {
    return groupesPosablesMembres3D(os, membres, traduire)
      .flatMap(g => g.chaines.flatMap(c => c.os.map(o => ({ cle: o.cle, nom: nomDOsDeCle3D(o.cle) }))));
  }
  // LE BASSIN EN FAIT PARTIE bien qu'il n'ait pas de curseur : `repereDuModeleImporte` a besoin de
  // sa POSITION pour orienter le corps. Récolter un os et lui donner un curseur sont deux questions
  // distinctes, et les confondre ferait disparaître le repère avec le curseur.
  return SLOTS
    .map(slot => ({ cle: slot, nom: ((carte || {})[slot] || {}).name }))
    .filter(e => typeof e.nom === 'string' && e.nom);
}

/** Combien d'emplacements sont pilotables : le chiffre que la fiche annonce avant de dérouler. */
export function nombrePosable(carte){
  return SLOTS.filter(slot => estPosable(slot) && (carte || {})[slot] && (carte || {})[slot].bone).length;
}

// ─────────────────────────────────────────────────────────────────────────────
// La composition. Vingt lignes, et tout le fichier existe pour elles.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Quaternion d'une rotation d'Euler (radians), convention XYZ, celle de THREE.Euler par défaut.
 *
 * Réécrit ici plutôt qu'emprunté à Three pour que la composition reste vérifiable sous Node, sans
 * WebGL ni dépendance. La convention DOIT rester XYZ : c'est celle que THREE.Euler applique aux
 * `rotation` du rig intégré, et deux conventions dans la même application donneraient deux gestes
 * différents pour un même curseur selon le type d'Élément.
 */
export function quaternionDepuisEuler(x, y, z){
  const c1 = Math.cos(x / 2), s1 = Math.sin(x / 2);
  const c2 = Math.cos(y / 2), s2 = Math.sin(y / 2);
  const c3 = Math.cos(z / 2), s3 = Math.sin(z / 2);
  return [
    s1 * c2 * c3 + c1 * s2 * s3,
    c1 * s2 * c3 - s1 * c2 * s3,
    c1 * c2 * s3 + s1 * s2 * c3,
    c1 * c2 * c3 - s1 * s2 * s3,
  ];
}

/**
 * L'INVERSE de la précédente : les trois angles d'Euler XYZ d'un quaternion. Fonction PURE.
 *
 * Nécessaire parce que la forme PERSISTÉE d'une pose d'os importé est un triplet d'angles
 * (cf. l'en-tête de ce fichier), alors qu'un geste retargeté arrive sous forme de quaternion :
 * appliquer une pose de la bibliothèque à un squelette importé, c'est composer des rotations autour
 * d'axes quelconques, puis les redire dans le vocabulaire que les curseurs savent afficher et
 * l'enregistrement sait écrire. Sans ce retour, une pose appliquée serait invisible dans les
 * curseurs et impossible à retoucher.
 *
 * VERROUILLAGE DU PÔLE. Quand la rotation approche ±90° sur Y, X et Z tournent autour du même axe et
 * ne se distinguent plus. On met alors Z à zéro et on met tout dans X : le quaternion reconstruit
 * est le bon, seule la RÉPARTITION entre les deux curseurs est arbitraire. Renvoyer NaN ou lever
 * serait pire, l'os serait juste perdu.
 */
export function eulerDepuisQuaternion(q){
  const [x, y, z, w] = Array.isArray(q) && q.length === 4 ? q : [0, 0, 0, 1];
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2;
  const yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  const m11 = 1 - (yy + zz), m12 = xy - wz, m13 = xz + wy;
  const m22 = 1 - (xx + zz), m23 = yz - wx;
  const m32 = yz + wx, m33 = 1 - (xx + yy);
  const ey = Math.asin(Math.max(-1, Math.min(1, m13)));
  if (Math.abs(m13) < 0.9999999) {
    return [Math.atan2(-m23, m33), ey, Math.atan2(-m12, m11)];
  }
  return [Math.atan2(m32, m22), ey, 0];
}

/** Produit de deux quaternions [x, y, z, w], `a` puis `b`, dans le repère de `a`. */
export function multiplierQuaternions(a, b){
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

/**
 * L'orientation finale d'un os : son repos, puis la demande de l'utilisateur.
 *
 * L'ORDRE N'EST PAS INTERCHANGEABLE. `repos ⊗ delta` tourne l'os autour de SES propres axes, tels
 * qu'ils sont après le repos, c'est ce qu'on attend en attrapant un membre. `delta ⊗ repos`
 * tournerait autour des axes du parent, et un bras déjà orienté vers le bas partirait de travers.
 * Une mutation épingle cet ordre, parce que les deux formes se compilent aussi bien et que
 * l'inversion ne se voit qu'à l'écran.
 *
 * Une pose absente ou nulle rend le repos INCHANGÉ, au bit près : c'est ce qui garantit qu'ouvrir
 * la fiche d'un modèle importé sans rien toucher ne le déforme pas.
 */
export function orientationFinale(repos, angles){
  const r = Array.isArray(repos) && repos.length === 4 ? repos : [0, 0, 0, 1];
  const x = Number((angles || {}).x) || 0;
  const y = Number((angles || {}).y) || 0;
  const z = Number((angles || {}).z) || 0;
  if (x === 0 && y === 0 && z === 0) return r.slice();
  return multiplierQuaternions(r, quaternionDepuisEuler(x, y, z));
}
