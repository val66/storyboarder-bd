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
// La proposition de rôles vient d'archetype-roles.js, qui n'importe que skeleton-map : aucune
// boucle. On la RELIT plutôt que de la refaire, comme l'écran de correspondance, pour qu'une pose
// vise exactement les os que l'utilisateur y voit attribués.
import { propositionDeRoles3D, decomposerRole3D } from './archetype-roles.js';
// ⚠️ `repereDuCorps` ET `normaliser` NE SONT PLUS IMPORTÉS ICI (#402c) : leur seule utilisatrice
// était `repereParChaines3D`, retirée plus bas. Ce fichier n'a plus de calcul de repère ; il n'en a
// jamais eu qu'un, et c'était celui qui ne pouvait pas tourner dans l'application.

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
    // ⚠️ LES CLÉS DE RÔLE PASSENT AUSSI, et les avoir oubliées était un défaut SILENCIEUX (#383).
    // Depuis #375a une pose de créature mémorise des RÔLES — `head`, `hipFL` — à côté de ses noms
    // d'os. Cette fonction ne gardait que les `os:` et les dix-huit emplacements : mesuré, une pose
    // `{ head, hipFL, os:Tail1, tete }` en ressortait `{ os:Tail1, tete }`. Chaque pose de créature
    // perdait donc sa part PORTABLE — les 22 % qui l'appliquent à un autre modèle du même archétype
    // — au premier enregistrement du Projet, sans un mot.
    //
    // Le rôle se vérifie par sa FORME, et c'est cohérent avec la règle du fichier : un emplacement
    // se vérifie parce que la liste est fermée, un nom d'os ne se vérifie pas faute d'avoir le
    // `.glb` sous la main, et un rôle se DÉCOMPOSE (cf. decomposerRole3D). Un rôle d'un autre
    // archétype est de toute façon inerte, comme une clé d'os absente.
    if (!estClePoseOs3D(cle) && !decomposerRole3D(cle)) return;
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

// `estPosee` A ÉTÉ RETIRÉE (#402d) : « cet Élément porte-t-il une pose ? », question que personne ne
// posait. `poseNonVide3D` répond à la question voisine, « y a-t-il quelque chose à enregistrer ? »,
// et elle, depuis #402b, a un appelant.

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
  // ⚠️ LES CLÉS DE RÔLE PASSENT AUSSI, ET LES AVOIR OUBLIÉES A COÛTÉ DEUX FOIS (#392b4). C'est la
  // SECONDE occurrence exacte du défaut que `normaliserPose` porte trente lignes plus haut : cette
  // garde ne connaissait que les clés `os:` et les dix-huit emplacements, si bien que tout angle
  // écrit sous `hipFL`, `head` ou `tail0` était REFUSÉ EN SILENCE. Le curseur bougeait, le nombre
  // changeait à l'écran, et le brouillon ne recevait rien : l'articulation restait au repos.
  //
  // Signalé à l'usage, et deux causes se cachaient l'une derrière l'autre. La première (#392b3)
  // faisait écrire les curseurs sous une clé `os:` que la récolte ne connaissait pas ; la corriger
  // les a fait écrire sous leur rôle, que cette garde-ci refusait. Même symptôme, deux fois : rien
  // ne bouge. La leçon est que corriger la première n'aurait jamais pu se voir sans la seconde.
  //
  // Le rôle se vérifie par sa FORME, exactement comme dans `normaliserPose`, et pour les mêmes
  // raisons : la liste des emplacements est fermée, un nom d'os ne se vérifie pas faute d'avoir le
  // `.glb` sous la main, et un rôle se DÉCOMPOSE.
  const accepte = estClePoseOs3D(slot) || !!decomposerRole3D(slot)
    || (SLOTS.includes(slot) && estPosable(slot));
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
 * Deux poses portent-elles les MÊMES angles ? Fonction PURE.
 *
 * ⚠️ ELLE NE COMPARE PAS DEUX JSON. L'ordre des clés d'un dictionnaire dépend de l'ordre où
 * l'utilisateur a bougé les curseurs : deux brouillons identiques au pixel près donneraient deux
 * chaînes différentes, et « Appliquer » resterait allumé sur une pose qu'on vient de reposer.
 *
 * ⚠️ ELLE PASSE PAR `normaliserPose`, donc par la règle du zéro : un angle remis à 0 doit être
 * ÉGAL à un angle jamais touché. Sans cela, bouger un curseur puis le ramener laisserait l'écran
 * croire à une modification, et fermer demanderait de confirmer une perte inexistante.
 */
export function memesAngles3D(a, b){
  const na = normaliserPose(a), nb = normaliserPose(b);
  const cles = Object.keys(na);
  if (cles.length !== Object.keys(nb).length) return false;
  return cles.every(c => nb[c] && POSE_AXES.every(x => (na[c][x] || 0) === (nb[c][x] || 0)));
}

/**
 * Y a-t-il quelque chose à enregistrer ? Fonction PURE.
 *
 * ⚠️ UNE POSE OÙ RIEN N'EST TOURNÉ EST UN PIÈGE, pas une pose. Elle s'ajouterait à la bibliothèque
 * sous un nom, se proposerait comme les autres, et ne ferait rien — l'utilisateur ne s'en
 * apercevrait qu'en l'appliquant, longtemps après l'avoir enregistrée.
 *
 * ELLE RÉUTILISE LA RÈGLE DU ZÉRO de `normaliserPose`, qui jette déjà les angles nuls à la
 * relecture : sans cela, une pose « vide » selon l'enregistrement pourrait être « pleine » selon le
 * disque, ou l'inverse. Une seule définition de ce qu'est un angle qui compte.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * ELLE PARLE MAINTENANT LES DEUX FORMES DE POSE (#402b)
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Elle a été écrite pour la fiche d'un modèle importé, dont la pose est IMBRIQUÉE, un dictionnaire
 * d'axes par os : `{ hipFL: { x: 0.4 } }`. Celle du Personnage intégré est PLATE, un angle par
 * champ : `{ torsoRotX: 0.4 }`. Sur cette seconde forme, `anglesNonNuls` reçoit un nombre, n'y
 * trouve aucun axe et rend `null` : la fonction aurait déclaré vide TOUTE pose de Personnage.
 *
 * ⚠️ C'EST LA PANNE DE #383, DE #401b3, ET ELLE SERAIT REVENUE ICI : une fonction écrite pour un
 * vocabulaire, rebranchée sur un écran qui en parle deux. Reconnaître la forme au lieu de la
 * supposer coûte une ligne ; la supposer aurait éteint « Enregistrer » pour le Personnage, sans un
 * mot d'explication à l'écran.
 */
export function poseNonVide3D(joints){
  return Object.values(joints || {}).some(v => (typeof v === 'number'
    ? (Number.isFinite(v) && v !== 0)
    : !!anglesNonNuls(v)));
}

/**
 * Combien d'articulations d'une pose ATTEIGNENT ce squelette. Fonction PURE.
 *
 * ⚠️ LA MÊME POSE N'A PAS LE MÊME EFFET SELON LA CIBLE, et il faut le dire avant que l'utilisateur
 * ne le découvre. Une pose de créature mémorise deux sortes de clés (#375a) : des RÔLES, partagés
 * par tous les modèles de l'archétype, et des NOMS D'OS, propres au fichier où elle a été composée.
 * Appliquée à un autre quadrupède, la part des rôles atterrit — mesuré, 22 % des os pilotables — et
 * le reste est simplement sauté.
 *
 * Une clé absente est déjà INERTE : `applySkeletonPose` parcourt les os récoltés, pas la pose. Rien
 * ne casse donc, mais un modèle à moitié posé sans explication ferait chercher une panne là où il
 * n'y a qu'une différence de squelette.
 */
export function couverturePose3D(pose, osMappes){
  const cles = Object.keys(pose || {});
  const atteintes = cles.filter(c => (osMappes || {})[c]).length;
  return { atteintes, total: cles.length };
}

/**
 * La phrase qui dit ce qu'une pose a fait, ou `null` quand elle a tout fait. Fonction PURE.
 *
 * ⚠️ ELLE SE TAIT QUAND TOUT ATTERRIT, et c'est le cas ordinaire : une pose appliquée au squelette
 * sur lequel elle a été composée. Annoncer « 38 sur 38 » à chaque fois apprendrait à ne plus lire
 * le message, et la fois où il compte passerait inaperçue.
 */
export function messageDeCouverture3D(couverture, traduire){
  const t = traduire || ((en) => en);
  // ⚠️ `= {}` NE SUFFIT PAS : un paramètre par défaut ne s'applique qu'à `undefined`, jamais à
  // `null`. L'appelant passe précisément `null` quand il n'a pas pu mesurer — modèle pas encore
  // décodé — et la déstructuration levait alors une exception au milieu d'un choix de pose.
  const { atteintes, total } = couverture || {};
  if (!total || atteintes >= total) return null;
  return t(`${atteintes} of ${total} joints applied: this pose was built on another skeleton.`,
    `${atteintes} articulations sur ${total} appliquées : cette pose vient d'un autre squelette.`);
}

// ---------- `repereParChaines3D` A ÉTÉ RETIRÉE (#402c) ----------
//
// Elle donnait à une créature un repère de corps dérivé de ses CHAÎNES, là où `repereDuCorps` le
// tire des emplacements d'un humanoïde. Écrite en #383a, validée par une mesure d'écart angulaire
// sur quatre fixtures — unreal 1,9°, maison 5,0°, vrm 10,6° — elle n'a jamais eu d'appelant.
//
// ⚠️ ET ELLE NE POUVAIT PAS EN AVOIR, ce que la mesure a montré et que la lecture ne disait pas.
// Elle lit les POSITIONS des os, `o.t`. Les fixtures en portent ; la liste que l'application
// fabrique, elle, n'en a pas : `bonesFromObject3D` ne récolte qu'identifiant, nom et enfants.
// Branchée telle quelle, elle rendait `null` sur les cinq créatures essayées. Elle fonctionnait
// dans les tests et nulle part ailleurs.
//
// ⚠️ CE QU'ELLE DEVAIT CORRIGER L'A ÉTÉ AUTREMENT, ET POUR MOINS CHER. Le vrai défaut n'était pas
// l'ABSENCE de repère pour une créature, c'était le repère FAUX qu'on lui fabriquait : mesuré, le
// dragon s'ouvrait à 92° de son devant parce qu'`inferSkeletonMap` remplit `tete`, `bassin` et les
// clavicules avec ce qu'elle trouve. `repereDuCorpsPourFichier3D` refuse désormais de rendre un
// repère humanoïde pour une figure qui n'en est pas une, et l'azimut retombe à zéro — la valeur que
// la règle des chaînes donnait elle aussi sur toutes les créatures du corpus, à trois degrés près
// sur l'oiseau.
//
// Une intention restée en chemin, dont la destination était déjà atteinte par une autre route.

/**
 * Les os d'un humanoïde qu'aucun EMPLACEMENT ne couvre, groupés comme ceux d'une créature. PURE.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * POURQUOI UN HUMANOÏDE A AUSSI DES CHAÎNES (#389)
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Les dix-huit emplacements sont une liste FERMÉE, dessinée sur un corps humain : ni doigts, ni os
 * de torsion, ni queue de cheval. ⚠️ MESURÉ, les os pilotables laissés de côté : mixamo +12,
 * maison +44, vroid-alt +46, centaure1 +71, vrm +93, unreal +439. Un humanoïde était donc la seule
 * morphologie à ne pas pouvoir bouger tout son squelette, alors qu'une araignée le pouvait depuis
 * #374 — l'inverse de l'homogénéité que cet écran poursuit.
 *
 * ⚠️ LA PARTITION EST LA MÊME QUE POUR LES CRÉATURES, et pour la même raison : un os ne doit jamais
 * être récolté sous deux clés. Ici, `bras_g` et `os:LeftArm` désignent le même os ; sans ce filtre,
 * deux curseurs le piloteraient et s'annuleraient selon un ordre que personne ne contrôle.
 *
 * L'EMPLACEMENT GAGNE, jamais la chaîne. C'est lui qui porte le libellé humain, « Bras gauche »
 * plutôt que « mixamorig:LeftArm », et c'est lui qui rend une pose portable d'un rig à l'autre.
 */
export function groupesPosablesEnPlus3D({ carte, os, membres } = {}, traduire){
  const prisParEmplacement = new Set(
    SLOTS.map(slot => ((carte || {})[slot] || {}).name).filter(n => typeof n === 'string' && n));
  return groupesPosablesMembres3D(os, membres, traduire)
    .map(g => ({
      ...g,
      chaines: g.chaines
        .map(c => ({ ...c, os: c.os.filter(o => !prisParEmplacement.has(nomDOsDeCle3D(o.cle))) }))
        .filter(c => c.os.length),
    }))
    .filter(g => g.chaines.length);
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
/**
 * Quel os porte quelle clé de RÔLE, pour cette figure. Rend une `Map(nomDOs → cleDeRole)`.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * L'AUTORITÉ UNIQUE DE LA PARTITION (#392b3)
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ ELLE EXISTE PARCE QUE DEUX ÉCRANS RÉPONDAIENT DIFFÉREMMENT À LA MÊME QUESTION, et le défaut
 * était SILENCIEUX. La récolte appliquait la partition — un os prend son rôle s'il en a un, son nom
 * sinon — pendant que la liste des curseurs, elle, nommait TOUS les os sous leur clé `os:`. Le même
 * os portait donc deux clés selon l'écran qui le regardait.
 *
 * MESURÉ SUR LE CORPUS, les os concernés : 13 sur le cerbère (`head`, `neck`, les quatre hanches,
 * les quatre genoux, les trois os de queue), 13 sur le chien, 17 sur l'araignée. Autrement dit, sur
 * un quadrupède, la tête, le cou, le haut de chaque patte et la queue — les articulations qu'on
 * vient chercher en premier. Leurs curseurs écrivaient sous une clé qu'`applySkeletonPose` ne
 * connaît pas : ils ne bougeaient RIEN, sans un mot, depuis #375a.
 *
 * Le commentaire de `clesARecolter3D` juste en dessous décrivait pourtant exactement ce piège, « cet
 * os partirait sous `head` ET sous `os:CERBERUS_Head` ». Il le décrivait pour l'écarter d'un côté,
 * et l'écran d'à côté le faisait.
 */
export function rolesParOs3D({ morphologie, carte, os, membres, roles } = {}, traduire){
  const parOs = new Map();
  if (!morphologie || morphologie === 'humanoide') return parOs;
  const proposition = propositionDeRoles3D(
    { os, archetype: morphologie, carte, enregistre: { os: roles || {}, membres } }, traduire);
  proposition.forEach(m => m.roles.forEach(r => {
    // Deux rôles ne peuvent pas viser le même os : le premier rencontré le garde, comme partout
    // ailleurs dans cet écran.
    if (!r.osNom || parOs.has(r.osNom)) return;
    parOs.set(r.osNom, r.cle);
  }));
  return parOs;
}

/**
 * Cette clé désigne-t-elle un RÔLE de l'archétype, plutôt qu'un os quelconque ? Fonction PURE.
 *
 * Les deux moitiés de la partition (#375a) : un os prend son rôle s'il en a un, son nom sinon. Ce
 * qui n'est pas préfixé `os:` et se DÉCOMPOSE en segment, côté et rang est un rôle.
 */
export function estCleDeRole3D(cle){
  return !estClePoseOs3D(cle) && !!decomposerRole3D(cle);
}

/**
 * Les poignées à montrer quand rien n'est survolé, ou `null` pour « toutes ». Fonction PURE (#392e).
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * LES RÔLES D'ABORD, LE RESTE AU SURVOL
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Demandé à l'usage, et la mesure lui donne raison : une créature porte de 45 à 103 articulations
 * pilotables, et les montrer toutes couvre la figure de points. Les RÔLES, eux, sont peu nombreux et
 * ce sont ceux qu'on vient chercher — la tête, le cou, le haut de chaque patte, la queue. Mesuré sur
 * les fixtures : cerbère 13 sur 45, chien 13 sur 52, araignée 17 sur 103, centaure 16 sur 50,
 * kraken 9 sur 45, dragon 8 sur 68, raptor 6 sur 63.
 *
 * Ce sont aussi la part PORTABLE de la pose, la seule qui s'applique à un autre modèle du même
 * archétype : les mettre en avant n'est donc pas qu'une question d'encombrement.
 *
 * ⚠️ LE SERPENT N'A AUCUN RÔLE, ET C'EST MESURÉ : 0 sur 89 os. L'archétype serpentin n'en définit
 * pas, et il n'est pas seul dans ce cas (cf. #380). « Seulement les rôles » lui laisserait une
 * figure SANS UN SEUL POINT, donc rien à cliquer et rien qui invite à survoler. D'où le repli : pas
 * de rôle sur ce fichier, on montre tout, exactement comme avant.
 */
export function poigneesParDefaut3D(cles){
  const roles = (cles || []).filter(estCleDeRole3D);
  return roles.length ? roles : null;
}

/**
 * Les chaînes d'une figure, à plat, telles que le SURVOL les manipule (#392c). Fonction PURE.
 *
 * @param groupes la forme rendue par `groupesDeCurseurs3D`
 * @return `[{ id, titre, cles }]`, `cles` dans l'ordre des os de la chaîne
 *
 * ⚠️ L'IDENTIFIANT EST LA PREMIÈRE CLÉ DE LA CHAÎNE, pas un compteur. Un indice se décalerait au
 * premier changement de morphologie ou de membre coché, et le survol allumerait alors une autre
 * chaîne que celle qu'on désigne. La première clé, elle, désigne un os : elle est stable tant que la
 * chaîne existe, et elle disparaît avec elle.
 *
 * LE TITRE VIENT DE LA CHAÎNE, jamais du groupe : c'est celui que le panneau droit affiche, et les
 * deux moitiés de l'écran doivent nommer la même chose de la même façon pour que le survol de l'une
 * se comprenne dans l'autre.
 */
export function chainesAPlat3D(groupes){
  const sortie = [];
  (groupes || []).forEach(g => (g.chaines || []).forEach(c => {
    const cles = (c.os || []).map(o => o.cle).filter(Boolean);
    if (!cles.length) return;
    sortie.push({ id: cles[0], titre: c.titre, cles });
  }));
  return sortie;
}

export function clesARecolter3D({ morphologie, carte, os, membres, roles } = {}, traduire){
  if (morphologie !== 'humanoide') {
    // ═══════════════════════════════════════════════════════════════════════════════════════════
    // DEUX VOCABULAIRES, UNE PARTITION STRICTE (#375a)
    // ═══════════════════════════════════════════════════════════════════════════════════════════
    //
    // ⚠️ MESURÉ SUR LES HUIT CRÉATURES DU CORPUS : les rôles ne couvrent que 22 % des os pilotables,
    // de 8 % sur l'oiseau à 45 % sur le chien. Une patte de cerbère a cinq os, l'archétype
    // quadrupède n'en nomme que deux. Une pose qui ne viserait que des rôles figerait donc un
    // cinquième du mouvement et laisserait le reste raide.
    //
    // Un os prend donc son RÔLE s'il en a un, son NOM sinon. Le rôle est la part PORTABLE de la
    // pose, la seule qui s'applique à un autre modèle du même archétype ; le nom d'os ne vaut que
    // pour ce squelette, et c'est déjà le contrat d'une clé `os:` (cf. normaliserPose).
    //
    // ⚠️ LA PARTITION EST LA RAISON D'ÊTRE DE CETTE FONCTION, et le cas n'a rien de théorique : la
    // tête d'un cerbère est portée par le TRONC (#381), lequel est aussi une chaîne posable. Sans
    // le filtre ci-dessous, cet os partirait sous `head` ET sous `os:CERBERUS_Head`, et
    // `applySkeletonPose` réécrirait deux fois son quaternion — « la dernière clé parcourue gagne »,
    // selon un ordre que personne ne contrôle.
    // La partition vient de `rolesParOs3D`, seule autorité (#392b3) : la liste des curseurs la lit
    // aussi, et deux calculs séparés donnaient au même os deux clés différentes selon l'écran.
    const roleDe = rolesParOs3D({ morphologie, carte, os, membres, roles }, traduire);
    const prisParRole = new Set(roleDe.keys());
    const parRole = [...roleDe.entries()].map(([nom, cle]) => ({ cle, nom }));
    const parOs = groupesPosablesMembres3D(os, membres, traduire)
      .flatMap(g => g.chaines.flatMap(c => c.os.map(o => ({ cle: o.cle, nom: nomDOsDeCle3D(o.cle) }))))
      .filter(e => !prisParRole.has(e.nom));
    return [...parRole, ...parOs];
  }
  // LE BASSIN EN FAIT PARTIE bien qu'il n'ait pas de curseur : `repereDuModeleImporte` a besoin de
  // sa POSITION pour orienter le corps. Récolter un os et lui donner un curseur sont deux questions
  // distinctes, et les confondre ferait disparaître le repère avec le curseur.
  const emplacements = SLOTS
    .map(slot => ({ cle: slot, nom: ((carte || {})[slot] || {}).name }))
    .filter(e => typeof e.nom === 'string' && e.nom);
  // ET SES CHAÎNES EN PLUS (#389), exactement comme une créature. Les dix-huit emplacements restent
  // en tête : ce sont eux la part PORTABLE d'une pose, celle qui atteint un autre rig humanoïde.
  // Le reste — doigts, os de torsion, queue de cheval — ne vaut que pour ce fichier, ce qui est
  // déjà le contrat d'une clé `os:`.
  const enPlus = groupesPosablesEnPlus3D({ carte, os, membres }, traduire)
    .flatMap(g => g.chaines.flatMap(c => c.os.map(o => ({ cle: o.cle, nom: nomDOsDeCle3D(o.cle) }))));
  return [...emplacements, ...enPlus];
}

// `nombrePosable` A ÉTÉ RETIRÉE (#402d). Son commentaire disait « le chiffre que la fiche annonce
// avant de dérouler » : cette fiche ne l'a jamais annoncé, la fonction n'a jamais eu d'appelant. Elle
// partageait ce sort avec `resumeCorrespondance` (#402a), l'autre compteur écrit pour un affichage
// qui n'est pas venu.

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
