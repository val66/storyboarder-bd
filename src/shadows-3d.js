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
  // ⚠️ L'ALTITUDE DU SOL, ET ELLE SEULE (#422f). Sa TAILLE — `GROUND_PLANE_SIZE_3D`, 12 000 unités —
  // n'entre nulle part ici, et un test l'interdit nommément dans les deux fonctions de cadrage :
  // #422 a mesuré qu'une boîte étirée jusqu'à elle change 0,00 % des pixels. Une altitude n'est pas
  // une étendue ; celle-ci ne sert qu'à dire ce qui affleure le sol, et jamais à dimensionner quoi
  // que ce soit.
  GROUND_Y_DEFAULT_3D,
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
/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * LES DEUX CORRECTIONS DE #422g, SIGNALÉES À L'USAGE : « LES OMBRES BOUGENT QUAND JE ZOOME »
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ PREMIÈRE FAUTE : LA BOÎTE ÉTAIT CENTRÉE SUR L'ORIGINE DU MONDE. `boiteOmbreSoleil3D` ne
 * rendait qu'un RAYON, et `personaKeyLight3D.target` n'était jamais déplacé — il vaut l'origine par
 * défaut chez Three.js. La boîte couvrait donc un disque autour du point (0, 0, 0), pendant que la
 * Case, elle, regarde `panel._orbitCx/Cy/Cz`, que les flèches, la molette et le ré-ancrage
 * automatique déplacent librement.
 *
 * La note de #422 disait pourtant, en toutes lettres : « la boîte devra être CADRÉE SUR CE QUE LA
 * CASE REGARDE ». J'avais implémenté la TAILLE et oublié la POSITION. Une consigne écrite ne
 * protège de rien si on n'en relit que la moitié.
 *
 * ⚠️ SECONDE FAUTE : LE RAYON SUIVAIT `camDist` EN CONTINU. La taille d'un texel valant
 * `2 × rayon / résolution`, elle changeait à chaque cran de molette — de 3,9 mm tout près à 105 mm
 * très reculé. Or une ombre est QUANTIFIÉE sur cette grille : changer le pas de la grille redessine
 * tous les contours. C'est cela que l'utilisateur voyait ramper, et aucune lumière n'avait bougé.
 *
 * ⚠️ LA PARADE EST CELLE DES MOTEURS TEMPS RÉEL, et l'utilisateur l'a choisie devant les options :
 * **accrocher la grille au lieu de la laisser glisser.**
 *
 *   1. le rayon est arrondi au PALIER supérieur, par doublements. La taille du texel devient donc
 *      constante sur toute une plage de zoom, et les ombres ne bougent plus du tout tant qu'on
 *      reste dans le palier ;
 *   2. le centre est arrondi à un multiple entier de texel, DANS LE REPÈRE DE LA LUMIÈRE et non
 *      selon les axes du monde. C'est ce qui fait que déplacer la caméra fait glisser la grille
 *      d'un nombre ENTIER de texels : chaque ombre retombe exactement sur les mêmes texels
 *      qu'avant, au lieu de se re-quantifier.
 *
 * ⚠️ CE QUE L'ACCROCHAGE COÛTE, ET IL FAUT LE DIRE : arrondir au doublement supérieur peut doubler
 * la taille du texel dans le pire cas — une boîte de rayon 40,28 devient 64. On échange donc de la
 * finesse, au plus d'un facteur deux, contre de la STABILITÉ. C'est le bon échange ici : une ombre
 * un peu plus grossière se regarde, une ombre qui rampe se remarque. Relever la résolution du
 * soleil pour compenser serait tentant — #422 a mesuré que 1024 et 2048 coûtent le même temps —
 * mais 4096 n'a PAS été mesuré, et étendre une mesure au-delà de ce qu'elle couvre est précisément
 * ce que ce dépôt refuse. À juger à l'écran en #422z.
 */

/** Le pas d'accrochage du rayon. 2 = doublements. */
export const PALIER_RAYON_OMBRE = 2;

/**
 * Le repère de la caméra d'ombre du soleil, déduit de la direction. PURE.
 *
 * ⚠️ IL REPRODUIT CE QUE FAIT THREE.JS, et c'est pour cela qu'il est ici plutôt qu'approximé. Une
 * `DirectionalLightShadow` place sa caméra en `light.position`, la fait regarder `light.target`, et
 * son `up` vaut (0, 1, 0). L'axe Z de cette caméra va donc de la cible vers la lumière — c'est la
 * direction du soleil —, et les deux autres s'en déduisent. Accrocher le centre sur les axes du
 * MONDE au lieu de ceux-ci laisserait la grille glisser en biais, et l'accrochage ne servirait à
 * rien dès que le soleil n'est pas dans un plan d'axe.
 *
 * ⚠️ LE CAS DÉGÉNÉRÉ EST TRAITÉ : soleil au zénith, la direction est colinéaire à `up` et le
 * produit vectoriel est nul. Un axe de repli est alors pris, comme `lookAt` le ferait.
 */
export function repereOmbreSoleil3D(direction){
  const d = direction || {};
  let zx = Number(d.x) || 0, zy = Number(d.y) || 0, zz = Number(d.z) || 0;
  const n = Math.hypot(zx, zy, zz);
  if (!(n > 0)) { zx = 0; zy = 1; zz = 0; }
  else { zx /= n; zy /= n; zz /= n; }
  // up × z, avec up = (0, 1, 0) : (1·zz − 0·zy, 0·zx − 0·zz, 0·zy − 1·zx) = (zz, 0, −zx).
  let xx = zz, xy = 0, xz = -zx;
  const nx = Math.hypot(xx, xy, xz);
  if (nx < 1e-6) { xx = 1; xy = 0; xz = 0; }   // soleil au zénith : repli sur l'axe X du monde
  else { xx /= nx; xy /= nx; xz /= nx; }
  // y = z × x, unitaire par construction puisque z et x le sont et sont orthogonaux.
  return {
    x: { x: xx, y: xy, z: xz },
    y: { x: zy * xz - zz * xy, y: zz * xx - zx * xz, z: zx * xy - zy * xx },
    z: { x: zx, y: zy, z: zz },
  };
}

export function boiteOmbreSoleil3D(panel, page, direction){
  const champ = champVisibleDeCase3D(panel, page);
  const rayonBrut = Math.hypot(champ.demiLargeur, champ.demiHauteur) * MARGE_BOITE_OMBRE;
  // ⚠️ AU PALIER SUPÉRIEUR, JAMAIS À L'INFÉRIEUR. Arrondir vers le bas rétrécirait la boîte sous le
  // champ visible, et les ombres seraient COUPÉES près des bords — un défaut bien pire que celui
  // qu'on corrige, et qui ne se verrait que sur certaines Cases.
  const rayon = Math.pow(PALIER_RAYON_OMBRE,
    Math.ceil(Math.log(Math.max(rayonBrut, 1e-6)) / Math.log(PALIER_RAYON_OMBRE)));
  const tailleTexel = (2 * rayon) / RESOLUTION_OMBRE_SOLEIL;
  const centre = centreAccrocheOmbre3D(panel, direction, tailleTexel);
  return {
    rayon,
    rayonBrut,
    centre,
    // Le soleil est DIRECTIONNEL : sa caméra d'ombre n'a pas de position propre, elle est posée à
    // `rayon` du centre le long de la direction de la lumière. La profondeur couvre donc l'aller et
    // le retour, plus la hauteur de ce qui peut projeter.
    near: 0,
    far: 2 * rayon + PERSONA_REAL_HEIGHT_M,
    // ⚠️ ET LA CAMÉRA DOIT ÊTRE ASSEZ LOIN POUR ÊTRE HORS DU VOLUME, troisième faute trouvée en
    // corrigeant les deux autres. Elle était posée à 3 unités du centre quand le rayon peut valoir
    // 64 : elle se trouvait DANS la boîte, et tout ce qui était derrière elle tombait au-delà du
    // plan proche — donc ne projetait pas. Le défaut était invisible tant que la boîte était petite.
    //
    // La profondeur vue depuis la caméra couvre [k − rayon, k + rayon] ; il faut k ≥ rayon pour
    // rester devant `near: 0`, et k ≤ rayon + hauteur pour tenir sous `far`. La moitié de la
    // hauteur place la caméra au milieu de cet intervalle.
    distanceCamera: rayon + PERSONA_REAL_HEIGHT_M / 2,
    resolution: RESOLUTION_OMBRE_SOLEIL,
    tailleTexel,
  };
}

/**
 * Le centre de la boîte : ce que la Case REGARDE, arrondi à un multiple entier de texel. PURE.
 *
 * ⚠️ `_orbitCx/Cy/Cz` EST LE CENTRE D'ORBITE RÉSOLU, écrit par `framePanelCamera3D` juste avant le
 * rendu. Il est lu plutôt que recalculé, et ce n'est pas de la paresse : la résolution de ce centre
 * a trois cas en cascade — cible explicite du menu Caméra, Élément sélectionné, orbite libre — et
 * en refaire une copie ici serait la deuxième version d'un raisonnement, celle qui s'accorde avec
 * la première le premier jour seulement. Le dépôt a déjà nommé ce piège (« Fix 12.7 »), et la
 * sphère du repère d'orbite lit déjà ce même champ pour la même raison.
 */
export function centreAccrocheOmbre3D(panel, direction, tailleTexel){
  const cx = Number(panel && panel._orbitCx) || 0;
  const cy = Number(panel && panel._orbitCy) || 0;
  const cz = Number(panel && panel._orbitCz) || 0;
  const t = Number(tailleTexel);
  if (!Number.isFinite(t) || t <= 0) return { x: cx, y: cy, z: cz };
  const r = repereOmbreSoleil3D(direction);
  // Les coordonnées du centre dans le repère de la lumière.
  const u = cx * r.x.x + cy * r.x.y + cz * r.x.z;
  const v = cx * r.y.x + cy * r.y.y + cz * r.y.z;
  const w = cx * r.z.x + cy * r.z.y + cz * r.z.z;
  // ⚠️ SEULS LES DEUX AXES DU PLAN DE LA CARTE SONT ARRONDIS. La profondeur `w` ne se quantifie pas
  // sur cette grille — elle vit dans le tampon de profondeur, pas dans les texels — et l'arrondir
  // ferait sauter la boîte d'avant en arrière sans rien stabiliser.
  const us = Math.round(u / t) * t;
  const vs = Math.round(v / t) * t;
  return {
    x: r.x.x * us + r.y.x * vs + r.z.x * w,
    y: r.x.y * us + r.y.y * vs + r.z.y * w,
    z: r.x.z * us + r.y.z * vs + r.z.z * w,
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
/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * UN DESSIN POSÉ SUR LE SOL N'EST PAS UN CORPS (#422f)
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ SIGNALÉ À L'USAGE : les chemins étaient rayés de bandes. La cause est exacte et elle était
 * dans ma règle de #422c. Un Tracé — chemin, route, terrain — est un ruban PLAT posé à
 * `GROUND_Y_DEFAULT_3D + 0,007`, soit **sept millimètres** au-dessus du Sol, avec un
 * `MeshStandardMaterial`. Ma règle disait « un matériau qui reçoit la lumière projette une ombre » :
 * le ruban projetait donc, sur le Sol situé sept millimètres dessous.
 *
 * ⚠️ ET LA CARTE D'OMBRE NE PEUT PAS SÉPARER DEUX SURFACES DISTANTES DE SEPT MILLIMÈTRES. Au
 * `camDist` par défaut de 30, un texel couvre **39 mm** — cinq fois l'écart à résoudre. La
 * quantification de profondeur tombe tantôt au-dessus, tantôt au-dessous du ruban : ce sont les
 * bandes. Ce n'est pas un réglage de biais à ajuster, c'est une mesure qu'on demande à un
 * instrument dont la graduation est plus grosse que la grandeur mesurée.
 *
 * ⚠️ LA RÈGLE RESTE GÉOMÉTRIQUE, PAS UNE LISTE DE TYPES, et c'est non négociable : #422c a écarté
 * l'énumération des sites de création parce qu'il y en avait une dizaine et qu'on en oublie
 * toujours un. Nommer ici `tracé`, `terrain` et `route` rouvrirait exactement ce trou.
 *
 * LE CRITÈRE : **ce qui n'a rien AU-DESSUS du sol n'a rien pour porter une ombre ailleurs.** Un
 * objet dont le point le plus haut affleure le sol ne peut projeter que sous lui-même, c'est à dire
 * sur la surface même dont il est indiscernable. Il ne perd donc aucune ombre — il n'en avait
 * aucune à donner — et cesse de produire du bruit.
 *
 * ⚠️ ET CE CRITÈRE COUVRE LE SOL LUI-MÊME, qui était jusqu'ici épargné par son NOM. Le nom reste,
 * comme court-circuit : calculer la boîte englobante d'un plan de 12 000 unités à chaque rendu pour
 * retrouver une conclusion connue d'avance serait payer pour rien. Mais la règle tient sans lui.
 *
 * ⚠️ CE QUE LE SEUIL NE DOIT PAS ATTRAPER : une dalle funéraire posée à plat, un seuil, une marche.
 * Ces objets ont une ÉPAISSEUR — ils dépassent —, et leur ombre, si rase soit-elle, est celle d'un
 * corps. Deux centimètres les laissent tous passer et ne retiennent que ce qui est rigoureusement
 * plat : les Tracés sont à 5 et 7 millimètres, les marquages routiers à 10.
 */
export const EPAISSEUR_MIN_PROJETEUR = 0.02;

export function estUnDessinAuSol3D(hautMonde){
  const y = Number(hautMonde);
  if (!Number.isFinite(y)) return false;
  return y <= GROUND_Y_DEFAULT_3D + EPAISSEUR_MIN_PROJETEUR;
}

export function ombreSoleilSeraVisible3D(panel, page){
  return boiteOmbreSoleil3D(panel, page).tailleTexel <= TAILLE_TEXEL_MAX;
}
