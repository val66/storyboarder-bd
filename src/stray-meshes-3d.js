/**
 * @file stray-meshes-3d.js
 * Les maillages d'un modèle importé qui ne sont PAS là où est le corps.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * CE QUE ÇA DONNE À L'ÉCRAN
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Signalé à l'usage sur `worker_j.glb` : un gros objet noir flotte en haut de la Case, très au-dessus
 * du personnage, et paraît « se décrocher » quand on redimensionne l'Élément.
 *
 * LA MESURE, faite directement sur le fichier avant d'écrire une ligne de ce module :
 *
 *   corps, cheveux, chapeau, épées, armure   →  y de −0,3 à 41,8
 *   Sheath_1_Outfit_0 (le fourreau)          →  y de 91,4 à 131,4
 *
 * Le personnage mesure 33 unités. Le fourreau flotte à trois fois sa hauteur au-dessus d'elle.
 *
 * RIEN NE SE DÉCROCHE, et c'est important pour ne pas chercher au mauvais endroit : le fourreau a
 * toujours été là-haut. Il est pesé à 100 % sur l'os `Sheath_080`, lequel est un enfant régulier de
 * `Spine_010` — la liaison est correcte. Ce qui ne l'est pas, c'est sa géométrie de liaison, qui le
 * projette hors du corps. L'illusion de décrochage vient d'un simple effet de LEVIER : la mise à
 * l'échelle est uniforme autour d'un centre calculé sur les os, donc un point trois fois plus loin
 * que le corps se déplace trois fois plus à l'écran.
 *
 * DEUX PISTES ONT ÉTÉ RÉFUTÉES AVANT CELLE-CI, et les écrire évite de les reprendre :
 *   — « le maillage n'est piloté par aucun os » : faux, il l'est, à 100 %. Et de toute façon
 *     indétectable après décodage (cf. le test « MESURE » de tests/glb-decoding.test.mjs :
 *     GLTFLoader normalise des poids nuls en (1, 0, 0, 0)) ;
 *   — « c'est le redimensionnement » : faux, le symptôme est là sans redimensionnement.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * LE CRITÈRE, ET POURQUOI IL N'A PAS DE SEUIL
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Un maillage est ÉGARÉ si sa boîte englobante ne recoupe pas celle de tous les autres réunis.
 * Pas de distance maximale, pas de multiple de la hauteur du corps, pas de nombre choisi à la main :
 * « ne touche rien » est une propriété du fichier, pas un réglage. Ce dépôt a déjà payé le prix des
 * seuils inventés (cf. tâche #334, où le seuil n'était pas en cause : c'était la mesure).
 *
 * VÉRIFIÉ SUR LES SIX FICHIERS RÉELS du dépôt, par lecture directe du glTF :
 *
 *   anime_girl1 (20 maillages)   aucun        hulk_-_sm_bnd (12)  aucun
 *   anime_girl2 (15 maillages)   aucun        worker_j (12)       Sheath_1_Outfit_0
 *   capoera, female_pose         un seul maillage → hors critère
 *
 * Zéro faux positif, une seule détection, celle qu'on cherchait.
 *
 * MOINS DE DEUX MAILLAGES : aucun signalement. « Loin des autres » n'a pas de sens quand il n'y a
 * pas d'autres — et un modèle d'un seul tenant est le cas le plus courant.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * CE QUE CE MODULE NE FAIT PAS
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Il ne masque rien et ne corrige rien : il NOMME. Le masquage est décidé ailleurs (rig3d.js), et
 * reste réversible depuis la fiche du modèle. Rendre des NOMS plutôt que des objets est délibéré :
 * la détection tourne UNE fois, au décodage, sur la scène du cache ; le masquage s'applique bien
 * plus tard, sur un CLONE de cette scène. Deux calculs de la même valeur finissent toujours par
 * diverger — c'est le défaut le plus fréquent de ce dépôt.
 */

import { expandBoxSkinAware3D } from './skinned-box-3d.js';

/**
 * La boîte de chaque maillage, en coordonnées MONDE, sensible au skinning.
 *
 * `expandBoxSkinAware3D` et non `Box3.setFromObject` : pour un `SkinnedMesh`, la géométrie brute est
 * celle de la position de liaison, que le squelette déforme au rendu. C'est précisément l'écart
 * entre les deux qui est en cause ici — mesurer la mauvaise donnerait une réponse fausse pour
 * exactement la bonne raison (cf. src/skinned-box-3d.js).
 */
export function boitesDesMaillages3D(racine){
  const boites = [];
  if (!racine || !racine.traverse) return boites;
  // Pas d'`updateMatrixWorld` ici : `expandBoxSkinAware3D` appelle déjà `updateWorldMatrix(true, …)`
  // sur chaque nœud, qui remonte toute la chaîne des parents. La campagne de mutation l'a établi —
  // retirer l'appel ne faisait échouer aucun test, y compris celui qui vérifie que la boîte est
  // bien mesurée en MONDE. Le garder aurait été une seconde source de vérité pour la même chose.
  racine.traverse(n => {
    if (!n || !n.isMesh) return;
    const boite = new THREE.Box3();
    expandBoxSkinAware3D(boite, n);
    // Un maillage sans géométrie exploitable rend une boîte vide. L'écarter ici plutôt que plus bas :
    // une boîte vide ne recoupe rien, elle serait donc signalée comme égarée alors qu'elle n'est
    // nulle part — un faux positif garanti sur tout maillage vide.
    if (boite.isEmpty()) return;
    boites.push({ nom: n.name || '(sans nom)', boite });
  });
  return boites;
}

/**
 * Retrouver, DANS UN CLONE, les maillages désignés par leurs noms.
 *
 * POURQUOI PAR LE NOM. La détection tourne une fois, au décodage, sur la scène du cache ; le
 * masquage s'applique sur un clone construit bien plus tard. Le nom est le seul lien stable entre
 * les deux — `cloneSkinned` le conserve, contrairement aux `uuid`, qui sont refaits à chaque clone.
 *
 * DEUX MAILLAGES DE MÊME NOM seraient masqués ensemble. C'est assumé : un fichier qui nomme deux
 * fois la même chose ne permet pas de les distinguer, et le cas ne s'est présenté sur aucun des six
 * fichiers réels du dépôt.
 */
// ⚠️ « (sans nom) » N'EST PAS TRADUIT, et c'est délibéré : la même chaîne sert de CLÉ entre
// `maillagesHorsCorps3D`, qui la met dans sa liste, et `maillagesParNom3D`, qui la cherche. Traduite,
// un maillage relevé en français ne serait plus retrouvé après un passage en anglais — et le
// masquage viserait alors dans le vide, sans rien signaler.
export function maillagesParNom3D(racine, noms){
  const cherchés = new Set(noms || []);
  const trouvés = [];
  if (!racine || !racine.traverse || !cherchés.size) return trouvés;
  racine.traverse(n => {
    if (n && n.isMesh && cherchés.has(n.name || '(sans nom)')) trouvés.push(n);
  });
  return trouvés;
}

/**
 * Montrer ou masquer les maillages égarés d'un rig.
 *
 * MASQUÉ PAR DÉFAUT, ET JAMAIS SUPPRIMÉ : la géométrie reste dans le clone, le fichier de
 * l'utilisateur n'est pas touché, et décocher la case de la fiche suffit à tout revoir.
 *
 * Une ligne, mais EXPORTÉE et testée : une campagne de mutation a montré qu'inverser la condition
 * ne faisait rougir aucun test tant qu'elle vivait au milieu de rig3d.js, hors de portée des tests.
 */
export function appliquerVisibiliteEgares3D(maillages, afficher){
  (maillages || []).forEach(m => { if (m) m.visible = !!afficher; });
}

/**
 * Les noms des maillages égarés — ceux qui ne touchent aucun autre. Tableau vide si le modèle est
 * sain, s'il n'a qu'un maillage, ou si la scène est absente.
 *
 * Fonction PURE vis-à-vis de l'état : elle ne fait que lire une scène décodée.
 */
export function maillagesHorsCorps3D(racine){
  const boites = boitesDesMaillages3D(racine);
  if (boites.length < 2) return [];
  return boites
    // `intersectsBox` est FAUX exactement quand il existe un axe séparateur — c'est mot pour mot le
    // critère énoncé plus haut, et c'est pourquoi il n'y a rien à régler ici.
    .filter((b, i) => {
      const autres = new THREE.Box3();
      boites.forEach((o, k) => { if (k !== i) autres.union(o.boite); });
      return !autres.intersectsBox(b.boite);
    })
    .map(b => b.nom);
}
