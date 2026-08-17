/**
 * @file skeleton-pose.js
 * Tourner un os d'un squelette importé — la forme persistée, et la seule opération qui compte.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * POURQUOI CE FICHIER N'EST PAS UNE COPIE DE `applyAnimalJointAngles`
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Le rig d'un Animal est construit par nous : chaque pivot naît à la rotation (0,0,0), et poser une
 * articulation s'écrit `pivot.rotation.set(x, y, z)`. La fonction commence même par remettre TOUS
 * les pivots à zéro, ce qui est exact — zéro y est la pose de repos.
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
 * 106 os sur 108. Écrire `bone.rotation.set(...)` — ou remettre à zéro avant d'écrire, comme le
 * fait la version Animal — DÉTRUIRAIT la pose de repos de presque chaque os : le personnage
 * s'effondrerait au premier curseur touché, et le curseur suivant partirait d'un corps déjà cassé.
 *
 * D'où l'unique règle de ce fichier : ON COMPOSE, ON N'ÉCRASE PAS.
 *
 *     orientation finale = repos ⊗ delta
 *
 * `repos` est le quaternion que l'os portait à la sortie du décodeur, capturé une fois à la
 * construction du rig. `delta` est ce que l'utilisateur demande, exprimé dans le repère LOCAL de
 * l'os. Une pose vide redonne exactement le repos — propriété qu'un test épingle, parce que c'est
 * elle qui garantit qu'ouvrir la fiche d'un modèle sans rien toucher ne l'abîme pas.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * CE QUE CE FICHIER NE PRÉTEND PAS FAIRE
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Les axes de repos DIFFÈRENT D'UN FICHIER À L'AUTRE, et parfois d'un os à l'autre : cinq des six
 * fichiers mesurés alignent leurs os sur +Y, le rig Unreal sur ±X selon le côté et le membre
 * (cf. docs/imported-skeletons.md). « Lever le bras » n'est donc pas le même axe partout, et
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

import { SLOTS, SLOT_GROUPS, slotLabel } from './skeleton-map.js';

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
 * female_pose. Son curseur faisait donc exactement ce que fait déjà l'Orientation de l'Élément —
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
 * `estPosee` fiable — voir plus bas.
 */
export function normaliserPose(brut){
  const sortie = {};
  if (!brut || typeof brut !== 'object') return sortie;
  SLOTS.forEach(slot => {
    // Un emplacement devenu non pilotable est JETÉ à la relecture. Un Projet enregistré par une
    // version où le bassin avait des curseurs porterait sinon une rotation que plus personne ne
    // peut voir ni annuler — le personnage resterait de travers, sans commande pour le redresser.
    // C'est une valeur qu'on cesse de lire, pas un champ renommé : la forme persistée ne bouge pas.
    if (!estPosable(slot)) return;
    const angles = brut[slot];
    if (!angles || typeof angles !== 'object') return;
    const garde = {};
    POSE_AXES.forEach(axe => {
      const v = Number(angles[axe]);
      if (Number.isFinite(v) && v !== 0) garde[axe] = v;
    });
    if (Object.keys(garde).length) sortie[slot] = garde;
  });
  return sortie;
}

/** Un Élément porte-t-il une pose ? Vrai seulement si un angle non nul subsiste après normalisation. */
export function estPosee(pose){
  return Object.keys(normaliserPose(pose)).length > 0;
}

/** L'angle d'un axe, en degrés arrondis — ce qu'un curseur affiche. Absent vaut 0. */
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
  if (!pose || !SLOTS.includes(slot) || !estPosable(slot) || !POSE_AXES.includes(axe)) return pose;
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
 * Un groupe entièrement vide disparaît aussi — un titre « Bras gauche » sans une ligne dessous
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

/** Combien d'emplacements sont pilotables — le chiffre que la fiche annonce avant de dérouler. */
export function nombrePosable(carte){
  return SLOTS.filter(slot => estPosable(slot) && (carte || {})[slot] && (carte || {})[slot].bone).length;
}

// ─────────────────────────────────────────────────────────────────────────────
// La composition. Vingt lignes, et tout le fichier existe pour elles.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Quaternion d'une rotation d'Euler (radians), convention XYZ — celle de THREE.Euler par défaut.
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

/** Produit de deux quaternions [x, y, z, w] — `a` puis `b`, dans le repère de `a`. */
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
 * qu'ils sont après le repos — c'est ce qu'on attend en attrapant un membre. `delta ⊗ repos`
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
