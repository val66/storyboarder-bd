/**
 * @file shadows-3d.js
 * Les ombres portées d'une Case : la DÉCISION, séparée de son application. Fonctions PURES.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * POURQUOI CE FICHIER EXISTE
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Poser une caméra d'ombre dans une scène Three.js ne se teste pas sous Node ; calculer OÙ elle doit
 * regarder et JUSQU'OÙ, si. C'est la cinquième fois que cette séparation revient — après #414a,
 * #420a, #425a et #421a — et toujours pour le même motif.
 *
 * Les décisions et les mesures qui les ont produites vivent dans docs/en/cast-shadows.md.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * ⚠️ LA MESURE QUI GOUVERNE TOUT CE FICHIER : LE SOL FAIT 12 000 UNITÉS
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * `GROUND_PLANE_SIZE_3D` vaut 12000, « très grand par rapport à la distance de caméra, pour qu'il
 * paraisse infini ». Une ombre directionnelle se rend depuis une caméra ORTHOGRAPHIQUE dont il faut
 * donner la boîte, et la tentation naturelle est de la faire couvrir ce qu'elle éclaire — donc le
 * Sol.
 *
 * Mesuré, en comptant les pixels qui changent : une boîte étirée au Sol change **0,00 %** de
 * l'image. L'ombre ne devient pas grossière, elle DISPARAÎT — 1024 texels sur 12 000 unités font
 * douze unités par texel, et un Personnage d'1,75 m n'y projette pas même un texel. Le tout pour le
 * prix complet des six passes de profondeur.
 *
 * ⚠️ ET LA MESURE DE TEMPS, SEULE, AURAIT VALIDÉ CETTE VERSION : elle coûte exactement le même prix,
 * puisque le travail a bien lieu. C'est le témoin — « l'image change-t-elle ? » — qui l'a démasquée.
 *
 * TOUT CE FICHIER EN DÉCOULE : la boîte se dérive de ce que la CASE REGARDE, et le Sol n'entre dans
 * aucun calcul. Un test le tient, parce que c'est précisément l'erreur qu'on referait.
 */

import {
  PANEL_CAM_DEFAULT_DIST_3D, PERSONA_REAL_HEIGHT_M, WALL_PX_PER_UNIT_3D,
} from './constants.js';

/**
 * Le demi-champ visible d'une Case, en unités monde, à la distance où sa caméra se trouve.
 *
 * ⚠️ DÉRIVÉ DE `framePanelCamera3D`, PAS RECALCULÉ À CÔTÉ. La caméra d'une Case a un champ calibré
 * sur la hauteur de la PLANCHE à la distance par défaut —
 * `fov = 2·atan(demiHauteur / PANEL_CAM_DEFAULT_DIST_3D)` — et c'est ce qui fait qu'avancer la
 * caméra zoome réellement au lieu de se recadrer. À la distance courante, le demi-champ vaut donc
 * `dist × demiHauteur / distanceParDéfaut`.
 *
 * Réécrire cette formule ailleurs qu'ici en ferait une seconde copie, et les deux ne s'accorderaient
 * que tant que personne ne touche au cadrage. C'est la faute la plus fréquente de ce dépôt.
 */
export function champVisibleDeCase3D(panel, page){
  const hPage = Math.max(1, Number(page && page.h) || 0);
  const wPage = Math.max(1, Number(page && page.w) || 0);
  const demiHauteurRef = (hPage / WALL_PX_PER_UNIT_3D) / 2;
  // `camDist` peut valoir 0,01 au bout de la molette : on ne divise jamais par lui, mais un champ
  // nul donnerait une boîte nulle, donc une ombre sans surface.
  const dist = Math.max(0.01, Number(panel && panel.camDist) || PANEL_CAM_DEFAULT_DIST_3D);
  const demiHauteur = dist * demiHauteurRef / PANEL_CAM_DEFAULT_DIST_3D;
  return { demiHauteur, demiLargeur: demiHauteur * (wPage / hPage) };
}

/**
 * De combien la boîte d'ombre dépasse le champ visible.
 *
 * ⚠️ CHOISI, PAS DÉRIVÉ, et il faut que ce soit écrit. Un Élément HORS du champ peut projeter DANS
 * le champ — un Mur posé à gauche jette son ombre vers la droite —, donc la boîte doit être plus
 * large que ce qu'on voit. Mais de combien dépend de ce qu'on met autour, et aucune formule ne le
 * sait : trop serré, les ombres se coupent net au bord de la Case ; trop large, chaque texel couvre
 * plus de terrain et l'ombre se brouille.
 *
 * 1,5 est un point de départ à juger À L'ÉCRAN (#422z), comme l'intensité de départ d'une source
 * l'a été en #420c — et celle-là était « correctement dérivée » avant de se révéler trop faible.
 */
export const MARGE_BOITE_OMBRE = 1.5;

/**
 * La RÉSOLUTION de la carte d'ombre du soleil.
 *
 * ⚠️ 2048 PLUTÔT QUE 1024, ET C'EST GRATUIT — MESURÉ. Les deux donnent le même temps de rendu
 * (0,9 contre 1,0 ms, dans le bruit) : doubler la finesse ne se paie pas ici. On s'attend à arbitrer
 * entre qualité et vitesse, et il n'y a rien à arbitrer, donc on prend la meilleure.
 *
 * ⚠️ CE N'EST PAS UN RÉGLAGE, ET ÇA NE DOIT PAS LE DEVENIR. Exposer un curseur qui ne change rien au
 * prix et peu à l'œil ajouterait une commande sans décision derrière.
 */
export const RESOLUTION_OMBRE_SOLEIL = 2048;

/**
 * La boîte orthographique de l'ombre du soleil, pour une Case. Fonction PURE.
 *
 * ⚠️ ELLE EST CARRÉE, ET SON CÔTÉ VIENT DE LA DIAGONALE DU CHAMP. La boîte est alignée sur le repère
 * du SOLEIL, pas sur celui de la caméra : tourner le soleil la fait pivoter au-dessus de la Case. Une
 * boîte ajustée à la largeur et à la hauteur visibles laisserait donc des coins hors couverture dès
 * qu'on déplace le soleil sur son dôme, et l'ombre y serait tronquée — un défaut qui n'apparaîtrait
 * qu'à certains azimuts, le pire genre.
 *
 * Le rayon du disque qui contient le rectangle visible, lui, ne dépend d'aucune orientation.
 *
 * ⚠️ ET LE SOL N'ENTRE PAS DANS CE CALCUL. C'est la mesure de #422 : une boîte à l'échelle du Sol
 * rend une ombre invisible. Un test refuse que `GROUND_PLANE_SIZE_3D` apparaisse dans ce fichier.
 */
export function boiteOmbreSoleil3D(panel, page){
  const champ = champVisibleDeCase3D(panel, page);
  const rayon = Math.hypot(champ.demiLargeur, champ.demiHauteur) * MARGE_BOITE_OMBRE;
  return {
    rayon,
    // Le soleil est DIRECTIONNEL : sa caméra d'ombre n'a pas de position propre, elle est posée à
    // `rayon` du centre le long de la direction de la lumière. La profondeur couvre donc l'aller et
    // le retour, plus la hauteur de ce qui peut projeter.
    near: 0,
    far: 2 * rayon + PERSONA_REAL_HEIGHT_M,
    resolution: RESOLUTION_OMBRE_SOLEIL,
    tailleTexel: (2 * rayon) / RESOLUTION_OMBRE_SOLEIL,
  };
}

/**
 * La caméra d'ombre d'une source POSÉE qui projette. Fonction PURE.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * ⚠️ UNE CAMÉRA D'OMBRE EXIGE UN PLAN ÉLOIGNÉ FINI, ET UNE SOURCE N'EN A PAS FORCÉMENT
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * `portee: 0` est le défaut de #420a, et il signifie « SANS LIMITE » — pas « zéro ». Mesuré en
 * #420f : à portée nulle, Three.js rend un facteur d'atténuation de 1,0 à TOUTE distance, si bien
 * qu'une source à 900 mètres éclaire aussi fort qu'à un mètre. Il n'y a alors aucune distance
 * au-delà de laquelle plus rien n'est éclairé, donc aucun plan éloigné naturel.
 *
 * DEUX ISSUES ÉTAIENT POSSIBLES, et celle-ci est retenue : DÉRIVER un plan éloigné du champ visible
 * de la Case, plutôt qu'EXIGER une portée finie de l'utilisateur. Exiger aurait fait d'une case à
 * cocher — « projette une ombre » — un réglage qui en impose un autre, et refuser de cocher tant
 * qu'un champ n'est pas rempli est une porte close dont la raison ne se lit pas.
 *
 * ⚠️ CE QUE CETTE DÉRIVATION COÛTE, ET IL FAUT LE DIRE : une source sans portée n'ombre que ce qui
 * est DANS le champ de la Case. Un Élément plus loin ne projettera pas. C'est cohérent — on ne voit
 * pas non plus son ombre — mais ça cesse de l'être si la caméra recule ensuite sans que la Case soit
 * re-rendue. La signature de Case doit donc inclure `camDist` : elle le fait déjà (#414c).
 *
 * Quand la portée EST finie, elle fait autorité : au-delà, la lumière ne porte plus du tout, donc
 * rien n'y est à ombrer.
 */
export const RESOLUTION_OMBRE_SOURCE = 512;

/** Le plan proche, en fraction du plan éloigné. Une caméra d'ombre à `near: 0` perd sa précision. */
export const NEAR_OMBRE_SOURCE = 0.05;

export function cameraOmbreSource3D(portee, champVisible){
  const p = Number(portee);
  const porteeValide = Number.isFinite(p) && p > 0;
  // Le repli : le rayon du champ visible, la même grandeur qui cadre la boîte du soleil.
  const rayon = champVisible && Number.isFinite(champVisible.rayon) && champVisible.rayon > 0
    ? champVisible.rayon : 1;
  const far = porteeValide ? p : rayon;
  return {
    near: far * NEAR_OMBRE_SOURCE,
    far,
    resolution: RESOLUTION_OMBRE_SOURCE,
    // ⚠️ DIT D'OÙ VIENT LE PLAN ÉLOIGNÉ, et ce n'est pas décoratif : c'est ce qui permet à l'écran
    // d'expliquer pourquoi une ombre s'arrête là, et à un test de vérifier laquelle des deux règles
    // a joué plutôt que de constater un nombre.
    source: porteeValide ? 'portee' : 'champ',
  };
}

/**
 * ⚠️ LE SEUIL QUI DIT SI UNE OMBRE SERA VISIBLE, et il vient d'une mesure, pas d'un usage.
 *
 * #422 a mesuré une ombre étalée sur le Sol : douze unités par texel, 0,00 % des pixels changés. Une
 * ombre n'existe que si son texel est nettement plus petit que ce qui la projette, et la plus petite
 * chose qui projette dans ce dépôt est un Personnage — `PERSONA_REAL_HEIGHT_M`, 1,75.
 *
 * Le huitième est choisi : il laisse huit texels en travers d'un Personnage, de quoi lire une
 * silhouette plutôt qu'une tache. Ce qui n'est PAS choisi, c'est l'existence du seuil : sans lui,
 * rien n'empêche un futur cadrage d'étirer la boîte jusqu'à rendre l'ombre invisible, exactement
 * comme la version mesurée — et au prix complet.
 */
export const TAILLE_TEXEL_MAX = PERSONA_REAL_HEIGHT_M / 8;

/** L'ombre du soleil sera-t-elle VISIBLE pour cette Case ? Fonction PURE. */
export function ombreSoleilSeraVisible3D(panel, page){
  return boiteOmbreSoleil3D(panel, page).tailleTexel <= TAILLE_TEXEL_MAX;
}
