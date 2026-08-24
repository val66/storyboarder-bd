/**
 * @file pose-bridge.js
 * Le passage entre les DEUX VOCABULAIRES de pose de l'application.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * DEUX FAÇONS DE DIRE « le bras gauche est plié »
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * La bibliothèque de poses parle le langage du Personnage intégré : des CHAMPS, un par curseur,
 * `lElbow: 1.0` ou `lClavicleRotZ: 0.2`, qui pilotent des groupes Three nommés à la main
 * (cf. POSE_HANDLES dans src/constants.js). Un squelette importé, lui, parle celui de la
 * correspondance : des EMPLACEMENTS, `avantbras_g`, `clavicule_g`, résolus vers un os dont le nom
 * change d'un fichier à l'autre (cf. src/skeleton-map.js).
 *
 * Ce fichier est le seul endroit où les deux se rencontrent. Il tient donc :
 *
 *   1. la table qui dit quelle articulation du Personnage joue le rôle de quel emplacement ;
 *   2. la traduction d'une pose complète, en s'appuyant sur src/skeleton-retarget.js pour la
 *      géométrie, ce module-là ignore volontairement jusqu'au nom du Personnage.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * POURQUOI LE RÉSULTAT EST ÉCRIT DANS LA MÊME FORME QUE LES CURSEURS
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Appliquer une pose produit un quaternion par os. On aurait pu le garder tel quel et retenir « ce
 * modèle est dans la pose assise ». On rend à la place trois angles par emplacement, exactement
 * `skeletonPose3d`, la forme que les curseurs affichent et que l'enregistrement écrit déjà.
 *
 * Trois conséquences, et c'est pour elles que ce choix a été fait :
 *   — la pose appliquée est VISIBLE dans les curseurs, au lieu d'un écran resté à zéro sous un
 *     modèle manifestement plié ;
 *   — elle est RETOUCHABLE : on part d'une pose et on l'ajuste, sans quoi la bibliothèque serait un
 *     aller sans retour ;
 *   — aucun champ persisté n'est ajouté, donc aucune migration (cf. docs/persisted-data.md).
 *
 * Et cela dit sans ambiguïté ce qu'une pose fait aux réglages manuels : elle les REMPLACE. C'est le
 * comportement du Personnage, demandé explicitement pour que les deux se ressemblent.
 */

import { POSE_HANDLES } from './constants.js';
import { poseSliderSpecs3D, poseSpecRotationAxis3D, readPoseSliderRad3D, modelAxisVector3D } from './utils.js';
import { POSE_AXES, multiplierQuaternions, eulerDepuisQuaternion } from './skeleton-pose.js';
import { deltaPourOs } from './skeleton-retarget.js';

/**
 * Quelle articulation du Personnage tient le rôle de quel emplacement du squelette.
 *
 * ⚠️ UNE ÉNUMÉRATION TENUE À LA MAIN : la panne la plus fréquente de ce dépôt. Ajouter une
 * articulation au Personnage sans l'ajouter ici la laisserait sans effet sur les modèles importés,
 * en silence. Deux tests l'interdisent : l'un exige que chaque entrée de POSE_HANDLES ait sa ligne,
 * l'autre que chaque emplacement posable soit atteint, et une seule fois.
 *
 * `bassin` n'y figure pas, et c'est délibéré : c'est la racine du squelette, la tourner ferait
 * pivoter la figure entière, ce que l'Orientation de l'Élément fait déjà. Le Personnage n'a
 * d'ailleurs aucun curseur pour lui non plus (cf. SLOTS_NON_POSABLES).
 */
export const EMPLACEMENT_PAR_ARTICULATION = {
  torso: 'poitrine', neck: 'cou', head: 'tete',
  lClavicle: 'clavicule_g', lShoulder: 'bras_g', lElbow: 'avantbras_g', lWrist: 'main_g',
  rClavicle: 'clavicule_d', rShoulder: 'bras_d', rElbow: 'avantbras_d', rWrist: 'main_d',
  lHip: 'cuisse_g', lKnee: 'jambe_g', lFoot: 'pied_g',
  rHip: 'cuisse_d', rKnee: 'jambe_d', rFoot: 'pied_d',
};

/**
 * La carte que le dessin des poignées attend, `{ nomDeGroupe: os }`, construite depuis les os
 * mappés d'un modèle importé. Fonction PURE : elle ne fait que déplacer des références.
 *
 * POURQUOI ELLE N'EST PAS UNE TABLE DE PLUS. `projectPoseHandlePositions3D` lit
 * `entry.joints[def.group]`, où `def.group` nomme un groupe du rig intégré. Pour poser les poignées
 * sur un modèle importé, il faut la même forme, remplie d'os. Tout ce qu'il manquait était le lien
 * articulation → emplacement, celui-là même que la table ci-dessus tient déjà. Écrire une seconde
 * correspondance `groupe → emplacement` aurait créé exactement le genre d'énumération parallèle que
 * ce fichier existe pour éviter.
 *
 * `osImportes` accompagne la carte : il dit au dessin que les décalages LOCAUX de LIMB_SEGMENTS
 * (`toLocal`, sept entrées sur dix-huit) sont exprimés en unités du rig intégré et n'ont aucun sens
 * ici, un os importé est en mètres, avec ses propres axes.
 */
export function jointsDepuisOsMappes(osMappes){
  const joints = {};
  POSE_HANDLES.forEach(def => {
    const emplacement = EMPLACEMENT_PAR_ARTICULATION[def.id];
    const entree = emplacement ? (osMappes || {})[emplacement] : null;
    if (entree && entree.os) joints[def.group] = entree.os;
  });
  return { joints, osImportes: true };
}

/**
 * Les curseurs d'une articulation, rangés par axe X puis Y puis Z. Fonction PURE.
 *
 * L'ORDRE N'EST PAS DÉCORATIF. Trois rotations ne commutent pas : les composer dans un autre ordre
 * donne une autre orientation. Le Personnage les applique dans l'ordre XYZ (c'est l'ordre d'Euler
 * par défaut de Three, cf. quaternionDepuisEuler), il faut donc les composer ici dans le même. Les
 * descripteurs se trouvent DÉJÀ dans cet ordre, mais s'appuyer là-dessus sans le dire, c'est
 * accepter qu'un jour un descripteur réordonné torde les poses sans que rien ne le signale.
 */
export function curseursOrdonnesParAxe(def){
  return poseSliderSpecs3D(def)
    .map(spec => ({ spec, axe: poseSpecRotationAxis3D(spec) }))
    .sort((a, b) => POSE_AXES.indexOf(a.axe) - POSE_AXES.indexOf(b.axe));
}

/**
 * Une pose du Personnage, traduite en pose d'os pour un squelette importé. Fonction PURE.
 *
 * @param joints    la pose au format bibliothèque (`{ lElbow: 1.0, headRotX: 0.2, … }`)
 * @param repereSource  le repère du corps du Personnage (cf. repereDuCorps)
 * @param repereCible   celui du modèle importé
 * @param reposMondeParEmplacement  `{ avantbras_g: [x,y,z,w], … }`, rotation de repos EN MONDE de
 *                                  chaque os mappé. C'est elle qui dit comment les axes de l'os sont
 *                                  posés dans le monde, et donc comment y ramener un axe du corps.
 * @returns `{ emplacement: { x, y, z } }` au format `skeletonPose3d`
 *
 * UN EMPLACEMENT ABSENT DU FICHIER EST SIMPLEMENT SAUTÉ. Un modèle sans clavicules reconnues garde
 * ses épaules au repos plutôt que de recevoir leur rotation sur un autre os : mieux vaut un geste
 * qui manque qu'un geste posé au mauvais endroit, parce que le second se voit sans s'expliquer.
 */
export function poseOsDepuisPosePersonnage({ joints, repereSource, repereCible, reposMondeParEmplacement }){
  const sortie = {};
  if (!joints || !repereSource || !repereCible) return sortie;
  const repos = reposMondeParEmplacement || {};
  POSE_HANDLES.forEach(def => {
    const emplacement = EMPLACEMENT_PAR_ARTICULATION[def.id];
    const reposMondeOs = emplacement ? repos[emplacement] : null;
    if (!reposMondeOs) return;
    let q = null;
    curseursOrdonnesParAxe(def).forEach(({ spec, axe }) => {
      const radians = readPoseSliderRad3D(joints, spec);
      if (!radians) return;   // une rotation nulle ne compose rien : on évite un produit inutile
      const delta = deltaPourOs({
        axeSource: modelAxisVector3D(axe), radians, repereSource, repereCible, reposMondeOs,
      });
      q = q ? multiplierQuaternions(q, delta) : delta;
    });
    // Un os dont aucun curseur n'est armé n'a pas d'entrée du tout : `skeletonPose3d` reste aussi
    // creux que possible dans le fichier de Projet, et `orientationFinale` rend alors le repos au
    // bit près. Le test s'en assure sur une pose vide.
    if (!q) return;
    const [x, y, z] = eulerDepuisQuaternion(q);
    sortie[emplacement] = { x, y, z };
  });
  return sortie;
}
