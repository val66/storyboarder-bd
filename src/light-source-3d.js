/**
 * @file light-source-3d.js
 * Une source de lumière POSÉE dans une Case, et ce qui se décide avant d'en poser une.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * POURQUOI CE FICHIER EXISTE
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * #414 a posé LE SOLEIL d'une Case : une direction, une couleur, une intensité, réglées dans le
 * menu de droite. Ce chantier-ci ajoute des sources **positionnées**, qu'on déplace dans la Scène
 * comme un meuble.
 *
 * Tout ce qui peut se décider sans Three.js vit ici, pour être vérifiable sous Node : ce qu'est une
 * lumière, ses valeurs de départ, et la traduction de ses champs en ce dont le moteur a besoin.
 *
 * ⚠️ UNE LUMIÈRE EST UN `objet3d`, ET C'EST UNE RÉVISION DE LA NOTE DE #414. Celle-ci annonçait
 * « un type à elles » tout en promettant l'héritage gratuit de la sélection, du glisser, de
 * `homePanelId`, du cache et de l'annulation. Les deux sont incompatibles, et c'est mesuré :
 * **70 sites** du dépôt testent `type === 'perso' || type === 'objet3d'`. Un type neuf n'hérite
 * d'aucun ; il faudrait les auditer un par un, et chaque oubli serait muet.
 *
 * Avec `type: 'objet3d'` et un `objType` à elle, les 70 sites l'acceptent par défaut, et on n'écrit
 * que les EXCLUSIONS voulues — chacune devenant alors une décision plutôt qu'un accident. Le dépôt
 * a déjà cet idiome : la dalle est un `objet3d` volontairement absent de `elementsInPanel`.
 *
 * ⚠️ LE NOM `lumiere` NE POURRA PLUS CHANGER. `objType` est persisté, et la règle du dépôt interdit
 * de renommer une donnée enregistrée (cf. docs/en/persisted-data.md). Il est choisi ici une fois.
 */

import { CLE_ACTUELLE } from './lighting-3d.js';

/** La valeur d'`objType` qui fait d'un `objet3d` une source de lumière. PERSISTÉE. */
export const OBJ_TYPE_LUMIERE = 'lumiere';

/**
 * Le prédicat, à un seul endroit. Toutes les exclusions du dépôt passeront par lui.
 *
 * ⚠️ IL TESTE LES DEUX CHAMPS, PAS SEULEMENT `objType`. Un jour où un autre `type` porterait le même
 * `objType`, une lumière fantôme apparaîtrait dans les listes ; et c'est exactement le genre de
 * confusion qu'un discriminant à une seule moitié laisse passer.
 */
export function estUneLumiere3D(o){
  return !!o && o.type === 'objet3d' && o.objType === OBJ_TYPE_LUMIERE;
}

/**
 * Les valeurs de départ.
 *
 * ⚠️ ELLES SONT ANCRÉES SUR L'EXISTANT PLUTÔT QUE CHOISIES, autant que possible, et là où ce n'est
 * pas possible c'est écrit :
 *
 * `couleur`   blanc, comme le soleil du mode Jour (cf. PRESETS_LUMIERE dans lighting-3d.js). Une
 *             lumière colorée d'emblée serait un parti pris qu'on n'a pas demandé.
 * `intensite` celle de la lumière CLÉ de la scène, `CLE_ACTUELLE`, MAJORÉE (cf.
 *             `MAJORATION_LUMIERE_POSEE` juste en dessous). Ce n'est pas un nombre tiré au sort :
 *             une source ajoutée éclaire d'abord comme ce qui éclaire déjà, ce qui la rend visible
 *             sans écraser la Case.
 * `portee`    0, c'est-à-dire SANS LIMITE au sens de Three.js. ⚠️ Et c'est un choix de prudence
 *             assumé : la modale qui réglera la portée n'existe pas encore. Une portée finie posée
 *             au hasard donnerait des lumières qui n'éclairent rien à trois mètres, sans aucun
 *             moyen de le corriger, ce qui se lirait comme une panne plutôt que comme un réglage.
 *
 *             ⚠️ CE CHOIX TIENT TOUJOURS, MAIS IL A UN COÛT QU'ON IGNORAIT EN LE FAISANT (#420f).
 *             « Sans limite » ne veut pas dire « très loin » : dans le shader,
 *             `punctualLightIntensityToIrradianceFactor` rend littéralement `1.0` quand la portée
 *             vaut 0, donc AUCUNE atténuation, à AUCUNE distance. Une source à 900 mètres derrière
 *             la caméra éclaire aussi fort qu'une source à un mètre — mesuré, pas déduit.
 *
 *             Conséquence : il n'existe aucune sphère d'influence, donc aucune position ne peut
 *             prouver qu'une lumière ne sert à rien, donc AUCUN ÉLAGAGE N'EST POSSIBLE. Et c'est le
 *             seul levier qui existe, puisque le shader ne branche jamais : seul `visible = false`,
 *             c'est-à-dire le retrait du COMPTE, économise quoi que ce soit.
 *
 *             Exposer la portée en #421 n'est donc pas un réglage de confort, c'est la condition
 *             préalable de toute optimisation — et #422 la rendra nécessaire, une caméra d'ombre
 *             ayant besoin d'un plan éloigné. Voir docs/en/rendering-performance.md, septième
 *             campagne, § « Ce qui ne réduit PAS ce coût ».
 * `sphereVisible` vrai. Une lumière dont la sphère est masquée d'emblée n'affiche RIEN à l'ajout :
 *             on aurait cliqué « Ajouter → Lumière » pour voir une Case inchangée.
 * `diametre`  0,2 m, environ une tête (un Personnage fait 1,75 m). Assez gros pour se saisir, assez
 *             petit pour ne pas masquer ce qu'il éclaire. ⚠️ Choisi, pas dérivé.
 *
 *             ⚠️ ET C'EST UN DIAMÈTRE, PAS UN RAYON, parce qu'il est lu dans `realHeightFloor`, le
 *             champ qui signifie « hauteur réelle en mètres » pour TOUS les Éléments. La première
 *             version l'appelait `rayon` : deux sens pour un même champ, ce qui est la faute qui
 *             revient le plus souvent dans ce dépôt. Le champ garde son sens, c'est le nom de la
 *             lecture qui a changé.
 */
/**
 * De combien une source POSÉE dépasse la lumière clé, à réglage identique.
 *
 * ⚠️ CE NOMBRE VIENT DE L'ÉCRAN, ET IL NE POUVAIT PAS VENIR D'AILLEURS. Le module annonçait depuis
 * le premier jour que l'intensité de départ « reste à juger à l'écran », parce que « assez
 * lumineux » ne se calcule pas. Le rendu de #420c a permis de regarder, et le verdict était que la
 * source de départ éclairait trop peu. Majoration demandée : au moins 40 %.
 *
 * ⚠️ C'EST UN PLANCHER, PAS UNE MESURE FINE, et le dire honnêtement importe : « au moins 40 % »
 * signifie que 1,4 est le bas de la fourchette jugée acceptable, pas un optimum. Si l'usage montre
 * que c'est encore court, c'est CE facteur qui monte, à un seul endroit.
 *
 * ⚠️ ET IL EST UN FACTEUR, PAS UNE VALEUR. Écrire 0,77 en clair couperait le lien avec
 * `CLE_ACTUELLE` : la clé et la source posée dériveraient sans que rien ne le dise, ce qui est
 * exactement la faute de #415, rejouée par la mutation M4 de #420a. Le lien tient, l'écart est
 * nommé.
 */
export const MAJORATION_LUMIERE_POSEE = 1.4;

export const LUMIERE_POSEE_DEFAUT = {
  couleur: '#FFFFFF',
  intensite: CLE_ACTUELLE * MAJORATION_LUMIERE_POSEE,
  portee: 0,
  sphereVisible: true,
  diametre: 0.2,
  // ⚠️ DÉCOCHÉE, ET C'EST LE PRIX MESURÉ QUI L'A DÉCIDÉ (#422d). Une ombre de source ponctuelle est
  // une carte CUBIQUE : six passes de profondeur par lumière et par image. Huit sources qui
  // projettent coûtent 3,9 ms là où huit sources sans ombre en coûtent 0,9 — et surtout 2 004 ms à
  // la première rencontre de cette configuration, sept fois le pire à-coup que l'application se
  // permet. Le coût n'est donc payé que par qui le demande, source par source.
  projetteOmbre: false,
};

/**
 * ⚠️ `Number(null)` VAUT ZÉRO, ET UN TEST L'A ATTRAPÉ. La première version passait par
 * `Number.isFinite(Number(v))`, ce qui accepte `null`, `''`, `[]` et `false` comme des nombres
 * valant 0. Conséquence : un champ `intensite: null` dans un Projet — cas banal d'un fichier écrit
 * par une version antérieure ou édité à la main — éteignait la lumière au lieu de retomber sur son
 * défaut, et rien n'aurait relié la Case obscure à ce champ.
 *
 * On n'accepte donc que ce qui EST un nombre, ou une chaîne non vide qui en désigne un.
 */
const nombreFini = (v, defaut) => {
  const n = typeof v === 'number' ? v
    : (typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN);
  return Number.isFinite(n) ? n : defaut;
};

/**
 * Les réglages d'une source, lus avec leurs défauts. Fonction PURE, elle N'ÉCRIT JAMAIS.
 *
 * ⚠️ MÊME DISCIPLINE QUE `lumiereDeCase3D` (#414b) : lire ne doit pas créer. Un lecteur qui écrit
 * son défaut fait apparaître des champs dans les Projets simplement parce qu'on les a affichés, et
 * la sauvegarde suivante les grave.
 *
 * ⚠️ LA COULEUR VIT DANS `color`, LE CHAMP DE TOUS LES `objet3d`, et pas dans un `couleur` à part.
 * Deux champs de couleur sur le même objet seraient une invitation à les faire diverger ; celui-ci
 * existe déjà, il est déjà persisté, et il tient exactement ce rôle.
 */
export function reglagesLumierePosee3D(o){
  const d = LUMIERE_POSEE_DEFAUT;
  if (!estUneLumiere3D(o)) return { ...d };
  return {
    couleur: (typeof o.color === 'string' && /^#[0-9A-Fa-f]{6}$/.test(o.color)) ? o.color : d.couleur,
    intensite: Math.max(0, nombreFini(o.intensite, d.intensite)),
    portee: Math.max(0, nombreFini(o.portee, d.portee)),
    sphereVisible: o.sphereVisible === undefined ? d.sphereVisible : !!o.sphereVisible,
    projetteOmbre: o.projetteOmbre === undefined ? d.projetteOmbre : !!o.projetteOmbre,
    diametre: Math.max(0.01, nombreFini(o.realHeightFloor, d.diametre)),
  };
}

/**
 * Les champs à écrire sur un `objet3d` neuf pour en faire une source. Fonction PURE.
 *
 * Elle ne rend QUE ce qui est propre à une lumière : l'appelant compose avec la forme commune à
 * tous les `objet3d` (id, boîte 2D, `homePanelId`…), qui n'a pas à être dupliquée ici.
 *
 * ⚠️ `magnetGround` N'Y EST PAS, ET SON ABSENCE EST LA DÉCISION. `groundMagnetEligible` rend vrai
 * pour tout `objet3d` qui n'est ni un Mur ni une Paroi : une lumière serait donc collée au sol par
 * défaut, alors que l'essentiel d'une source posée est de flotter où on veut. L'exclusion se fait
 * chez `groundMagnetEligible`, et un test la tient.
 */
export function champsLumierePosee3D(){
  const d = LUMIERE_POSEE_DEFAUT;
  return {
    objType: OBJ_TYPE_LUMIERE,
    color: d.couleur,
    intensite: d.intensite,
    portee: d.portee,
    sphereVisible: d.sphereVisible,
    projetteOmbre: d.projetteOmbre,
    realHeightFloor: d.diametre,
  };
}

/**
 * Ce que le moteur doit poser, pour une source donnée. Fonction PURE.
 *
 * La position n'est pas calculée ici : elle vient des coordonnées monde de l'Élément, que seul le
 * chemin de rendu connaît (cf. #420c). On rend ce qui, lui, se décide sans Three.js.
 */
export function eclairagePosee3D(o){
  const r = reglagesLumierePosee3D(o);
  return { couleur: r.couleur, intensite: r.intensite, portee: r.portee, projetteOmbre: r.projetteOmbre };
}

/**
 * Ce que le rendu doit faire des lampes EN CACHE, pour la Case qu'il dessine. Fonction PURE.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * ⚠️ LA SCÈNE THREE.JS EST PARTAGÉE ENTRE TOUTES LES CASES, ET C'EST LE PIÈGE QUE LA NOTE ANNONCE
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Les Cases se dessinent l'une après l'autre dans la MÊME scène. Une `PointLight` laissée allumée
 * éclairerait la Case suivante, qui n'en a pas, et le défaut serait attribué à n'importe quoi sauf
 * à sa cause. Le dépôt tient déjà ce protocole pour le soleil : `renderPanelSceneUncached3D` repose
 * les lumières du style à chaque rendu, avec exactement ce commentaire.
 *
 * ⚠️ « TOUT ÉTEINDRE PUIS RALLUMER » NE SE VÉRIFIE PAS SOUS NODE, MAIS LE PLAN, SI. C'est la raison
 * d'être de cette fonction : elle décide, la couche Three.js exécute. Sans elle, la garantie
 * reposerait sur la lecture d'une boucle de rendu qu'aucun test ne peut faire tourner.
 *
 * LA PROPRIÉTÉ QUI COMPTE, et son test : **tout id du cache sort du plan exactement une fois**,
 * allumé ou éteint. Un id qui n'apparaîtrait nulle part est précisément une lumière qui fuit.
 *
 * ⚠️ `hidden3d` ÉTEINT, `sphereVisible` NON, et les deux ne disent pas la même chose. Masquer un
 * Élément en 3D veut dire « fais comme s'il n'était pas là » : une lumière masquée qui continuerait
 * d'éclairer serait introuvable, on chercherait la source d'une clarté que rien ne montre.
 * `sphereVisible` ne parle QUE de la petite sphère : on éteint l'ampoule visible, pas la lumière.
 */
export function planLumieresPosees3D(idsEnCache, elementsDeLaCase){
  const aAllumer = (elementsDeLaCase || [])
    .filter(o => estUneLumiere3D(o) && !o.hidden3d)
    .map(o => Object.assign({ id: o.id }, eclairagePosee3D(o)));
  const allumes = new Set(aAllumer.map(p => p.id));
  const aEteindre = Array.from(idsEnCache || []).filter(id => !allumes.has(id));
  return { aAllumer, aEteindre };
}

/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * CE QUE LA FICHE D'UNE LUMIÈRE MONTRE ET CE QU'ELLE MASQUE (#421a)
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * La fiche d'une Lumière EST celle des Éléments, `objectModal`, augmentée d'une section
 * « Luminosité » et amputée de ce qui ne veut rien dire pour une source. C'est un choix de
 * l'utilisateur, et le dépôt a déjà le mécanisme : un Mur appartenant à une Pièce masque ses
 * sections Position et Orientation et affiche un mot à leur place. `openObjectModal` porte une
 * trentaine de bascules du même genre.
 *
 * ⚠️ POURQUOI UNE FONCTION PURE PLUTÔT QU'UNE SUITE DE `style.display` DANS `openObjectModal`. La
 * modale ne s'ouvre pas sous Node — elle touche le DOM, le dessin, le brouillon. Une décision
 * enfouie dans ses trois cents lignes ne serait vérifiable que par lecture. Ici elle se teste, et
 * c'est la même discipline que `planLumieresPosees3D` : la décision d'un côté, les gestes de
 * l'autre.
 *
 * ⚠️ LA PROPRIÉTÉ QUI COMPTE, ET C'EST ELLE QUI JUSTIFIE LA FORME : **tout élément à bascule de la
 * modale sort d'ici EXACTEMENT UNE FOIS**, montré ou masqué. Un champ absent de cette table est
 * précisément celui qui restera visible par accident sur une Lumière — le « Type » proposant de
 * transformer une source en voiture, la « Pose » d'une sphère, la « Face du Mur » d'une lampe. Le
 * test ne se contente pas de vérifier les valeurs : il RELIT index.html et exige que les deux
 * ensembles coïncident. Ajouter un champ à la modale sans décider de son sort pour une Lumière fait
 * rougir la suite.
 *
 * C'est l'énumération incomplète, deuxième classe de défaut la plus fréquente de ce dépôt, et la
 * seule parade qui tienne dans le temps est de la rendre mécanique.
 *
 * ⚠️ CE QUI EST HORS DE PORTÉE ICI : que la fiche soit LISIBLE. Cette table dit ce qui s'affiche,
 * pas si l'ensemble se tient à l'écran. Le jugement d'œil appartient à #421z, comme l'intensité de
 * départ a dû être jugée à l'écran en #420c après avoir été « correctement » dérivée.
 */

/**
 * Les sections de `objectModal`, et leur sort pour une Lumière.
 *
 * ⚠️ « ORIENTATION » EST MASQUÉE, ET C'EST LA SEULE DES QUATRE. Une source ponctuelle n'a aucune
 * orientation : trois curseurs de rotation sans le moindre effet seraient un piège, du genre qu'on
 * manipule dix secondes avant de conclure que l'application est cassée.
 *
 * « Luminosité » n'existe pas encore dans index.html — elle arrive en #421b. Elle figure ici parce
 * que c'est cette table qui décide, et non l'inverse : le test de coïncidence la réclamera.
 */
export const SECTIONS_FICHE_LUMIERE = {
  principal: true,
  position: true,
  orientation: false,
  apercu: true,
  luminosite: true,
};

/**
 * Les champs et commandes à bascule de `objectModal`, et leur sort pour une Lumière.
 *
 * Les entrées en `…Field` sont les enveloppes que porte déjà index.html ; les cinq dernières sont
 * des commandes nues, nommées une par une parce qu'aucune enveloppe ne les regroupe.
 *
 * ⚠️ `objectHeightField` EST MONTRÉ ALORS QUE `objectSizeInput` NE L'EST PAS, et ce n'est pas une
 * hésitation. Les deux commandent la MÊME donnée, `realHeightFloor` : l'un en mètres, l'autre en
 * pourcentage d'une hauteur naturelle. Pour une Lumière cette donnée est le DIAMÈTRE de la sphère,
 * une grandeur qu'on pense en centimètres et pas en « 140 % d'une sphère de référence ». On garde
 * donc celui qui se lit, et le libellé change (cf. `LIBELLE_TAILLE_LUMIERE`).
 *
 * ⚠️ ET C'EST UN DIAMÈTRE, PAS UN RAYON. Le module s'est déjà trompé de nom une fois sur ce champ.
 *
 * ⚠️ `objectHidden3dCheckbox` EST MONTRÉ, ET C'EST LE SEUL VRAI INTERRUPTEUR. #420f l'a mesuré : une
 * lumière à intensité nulle est calculée intégralement et coûte le même prix qu'une lumière allumée.
 * Seul `hidden3d` la retire du compte. Masquer cette case pour « simplifier » retirerait la seule
 * commande qui économise quelque chose.
 *
 * ⚠️ `objectGroundMagnetField` EST MASQUÉ PARCE QUE LA COMMANDE SERAIT MORTE. `groundMagnetEligible`
 * exclut déjà les lumières (#420d) : la case cocherait sans rien commander. Une commande qui ne
 * commande rien est pire qu'une commande absente, on la croit en panne.
 */
export const CHAMPS_FICHE_LUMIERE = {
  // — Caractéristiques principales —
  objectFigureField: false,        // le modèle .glb : une source n'en porte aucun
  objectPoseField: false,          // la pose : une sphère n'en a pas
  objectStrayMeshField: false,     // les maillages parasites d'un modèle importé
  objectMagnetWallField: false,    // les quatre champs de Mur et d'ouverture, sans objet ici
  objectWallFaceField: false,
  objectWallSideField: false,
  objectWallSizeField: false,
  objectDoorField: false,
  objectDoorAngleField: false,
  objectWindowField: false,
  objectWindowAngleField: false,
  objectSizeField: true,           // l'enveloppe reste : elle porte la hauteur, ci-dessous
  objectHeightField: true,         // → « Diamètre de la sphère (m) »
  objectSizePercentField: false,   // le pourcentage, doublon de la hauteur : cf. ci-dessus
  objectLightShadowField: true,    // « Projette une ombre » (#422d), sous la portée dont elle dépend
  objectTraversantField: false,    // propriété d'une ouverture dans un Mur
  objectLinkedField: false,        // l'Élément hôte d'une ouverture
  // — Position —
  objectPosField: true,            // X / Y / Z : une source se place, c'est tout son intérêt
  objectGroundMagnetField: false,  // commande morte, cf. ci-dessus
  objectTraverseGroundField: false,// nichée dans l'aimant, elle disparaît avec lui
  objectDepthField: true,          // la profondeur fait partie du placement
  // — Commandes nues —
  objectNameInput: true,           // une source se nomme comme tout Élément
  objectTypeSelect: false,         // on ne transforme pas une Lumière en chaise
  objectPreview3D: true,           // l'aperçu montre la sphère, sa couleur et sa taille
  objectEditorOpenBtn: false,      // le crayon mène à l'Éditeur : rien à poser
  objectHidden3dCheckbox: true,    // le seul vrai interrupteur, cf. ci-dessus
  objectSphereVisibleField: true,  // la bille, pas la lumière — cf. le commentaire du HTML
};

/**
 * Le libellé que prend le champ de hauteur sur une Lumière — LES DEUX LANGUES, à UN seul endroit.
 *
 * ⚠️ PREMIÈRE VERSION CORRIGÉE EN #421c : elle rendait la chaîne `'lightSphereDiameter'`, présentée
 * comme « une clé d'i18n ». Ce dépôt N'A PAS de table de clés — `tr(en, fr)` prend les deux chaînes
 * en argument, et les tables de i18n.js associent un SÉLECTEUR à ses deux textes. La clé ne
 * désignait donc rien, et le test qui la validait ne vérifiait que sa forme.
 *
 * ⚠️ ET IL FAUT UNE SOURCE UNIQUE, PARCE QU'IL Y A DEUX LECTEURS. `openObjectModal` pose le libellé
 * à l'ouverture de la fiche ; `applyI18n` doit le reposer si la langue change pendant qu'elle est
 * ouverte, sans quoi une Lumière réafficherait « Hauteur (m) » pour un diamètre de sphère. Écrire
 * les phrases aux deux endroits les ferait diverger au premier ajustement de formulation.
 */
/**
 * ⚠️ CE QUE LA DISPOSITION POSSÈDE EN PROPRE, ET DOIT DONC DÉFAIRE (#421h).
 *
 * LA FAUTE, SIGNALÉE À L'USAGE : la disposition était à SENS UNIQUE. Elle sortait sans rien écrire
 * pour un Élément qui n'est pas une source — ce qui protégeait bien les trente bascules par type de
 * `openObjectModal`, comme voulu — mais laissait derrière elle tout ce qu'elle avait posé pour la
 * Lumière précédente. Ouvrir une Lumière puis une chaise montrait « Afficher la sphère de la
 * Lumière » sur la chaise, et la section Orientation avait disparu de TOUTES les fiches.
 *
 * ⚠️ LA PARTITION EST LA CLÉ, et c'est elle qui rend la correction sûre. Un `else` qui remettrait
 * tout serait la faute inverse, et pire : il se substituerait aux trente bascules sans connaître
 * leurs raisons, et une chaise retrouverait des champs de Mur. Chaque champ appartient donc à UN
 * propriétaire, et un seul :
 *
 *   — PROPRE à la disposition : personne d'autre ne l'écrit jamais. Elle doit donc le poser dans
 *     LES DEUX cas, sinon son état fuit d'une fiche à la suivante ;
 *   — PARTAGÉ avec `openObjectModal` : les bascules par type le réécrivent à chaque ouverture. La
 *     disposition ne le touche QUE pour une Lumière, et le laisse tranquille sinon.
 *
 * Un test vérifie cette partition contre la source de `openObjectModal` : un champ déclaré partagé
 * que la fiche n'écrirait plus deviendrait un champ orphelin, et le défaut reviendrait à
 * l'identique.
 */
export const CHAMPS_PROPRES_A_LA_LUMIERE = ['objectSphereVisibleField'];

export const LIBELLE_TAILLE_LUMIERE = {
  en: 'Sphere diameter (m)',
  fr: 'Diamètre de la sphère (m)',
};

/**
 * La disposition complète de la fiche d'une Lumière. Fonction PURE, sans DOM.
 *
 * ⚠️ ELLE NE PREND AUCUN ARGUMENT, ET C'EST VOLONTAIRE. Rien ne varie d'une source à l'autre :
 * toutes montrent et masquent la même chose. Accepter un objet pour l'ignorer laisserait croire
 * qu'un réglage pourrait changer la disposition, et le premier lecteur pressé chercherait où.
 *
 * Elle rend des COPIES : les tables ci-dessus sont la référence, et un appelant qui les modifierait
 * — fût-ce par mégarde, en cochant une case dans un objet qu'il croit à lui — changerait la fiche
 * de toutes les Lumières pour le reste de la session.
 */
export function dispositionFicheLumiere3D(){
  return {
    sections: { ...SECTIONS_FICHE_LUMIERE },
    champs: { ...CHAMPS_FICHE_LUMIERE },
    libelleTaille: LIBELLE_TAILLE_LUMIERE,
  };
}

/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * LE HALO REFLÈTE L'INTENSITÉ (#421f)
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Demandé à l'usage : les curseurs de la fiche ne changeaient rien à l'aperçu. Pour la couleur
 * c'était un défaut ; pour l'intensité, NON — et c'est ce qui rend cette décision intéressante. La
 * sphère est un repère en `MeshBasicMaterial` : elle ne reçoit aucune lumière, donc son aspect ne
 * dépendait de l'intensité NI dans l'aperçu NI dans les Cases. L'aperçu ne mentait pas, il disait
 * la vérité d'un repère purement décoratif.
 *
 * Le choix retenu est donc de rendre la bille INFORMATIVE plutôt que de faire semblant : son halo
 * suit l'intensité, dans l'aperçu ET dans les Cases. Une seule vérité, et d'un coup d'œil sur une
 * Planche on voit quelle source est forte.
 *
 * ⚠️ L'OPACITÉ, ET SURTOUT PAS LE RAYON, ET LA RAISON N'EST PAS ESTHÉTIQUE. Un rig est NORMALISÉ à
 * `realHeightFloor` au moment du rendu — `placeRigCentered3D` le met à l'échelle d'après sa boîte
 * englobante. Faire grossir le halo ferait donc RÉTRÉCIR le cœur d'autant, pour garder le diamètre
 * demandé : monter l'intensité aurait visuellement diminué la source, l'exact contraire de ce qu'on
 * veut dire. Et le champ « Diamètre de la sphère » cesserait de désigner quoi que ce soit de stable.
 *
 * ⚠️ ET L'ANCRAGE EST L'EXISTANT, PAS UN NOMBRE CHOISI. À l'intensité de départ, la formule rend
 * EXACTEMENT l'opacité d'aujourd'hui : aucune Lumière déjà posée ne change d'aspect. C'est la
 * discipline de `CLE_ACTUELLE` et de `MAJORATION_LUMIERE_POSEE` — on part de ce qui existe, et on
 * nomme l'écart.
 */

/** L'opacité du halo telle qu'elle était avant #421f, et le point d'ancrage de la loi. */
export const HALO_OPACITE_REF = 0.22;

/**
 * Le plafond. ⚠️ CHOISI, PAS DÉRIVÉ, et il ne mord qu'au-delà du curseur : à 200 % — le maximum de
 * la fiche — la loi rend 0,571. Il protège d'une intensité entrée à la main dans un fichier de
 * Projet, pas de l'usage normal. Un halo complètement opaque cesserait d'être un halo.
 */
export const HALO_OPACITE_MAX = 0.6;

/**
 * L'opacité du halo d'une source, d'après son intensité. Fonction PURE.
 *
 * ⚠️ ZÉRO EST UNE RÉPONSE VALIDE, et c'est voulu : une source à intensité nulle n'éclaire rien, son
 * halo disparaît. Le CŒUR de la sphère, lui, reste — sans quoi la Lumière deviendrait introuvable
 * dans la Case, et on ne pourrait plus la saisir pour la remonter.
 */
export function opaciteHaloLumiere3D(o){
  const intensite = reglagesLumierePosee3D(o).intensite;
  const proportion = intensite / LUMIERE_POSEE_DEFAUT.intensite;
  return Math.min(HALO_OPACITE_MAX, Math.max(0, HALO_OPACITE_REF * proportion));
}

/**
 * Le nom du maillage de halo dans le rig d'une Lumière.
 *
 * ⚠️ UN NOM PLUTÔT QU'UN RANG. Le retrouver par `children[1]` marcherait aujourd'hui et casserait
 * en silence le jour où le rig gagnerait un troisième maillage : le halo d'une autre pièce suivrait
 * l'intensité, ou plus rien ne la suivrait. Three.js indexe par nom, autant s'en servir.
 */
export const NOM_HALO_LUMIERE = 'haloLumiere';

/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * RÉPARER UNE LUMIÈRE CHANGÉE EN VOITURE (#421g)
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ UNE VERSION LIVRÉE A DÉTRUIT DE LA DONNÉE, ET IL FAUT LA RENDRE. `objectModalSave` écrivait
 * `objType = objectTypeSelect.value` en n'épargnant que le modèle importé ; le sélecteur étant
 * masqué pour une source depuis #421c, enregistrer une Lumière écrivait « voiture » — la valeur du
 * premier `<option>` — dans le fichier de Projet. La cause est corrigée en amont, mais les Projets
 * déjà enregistrés portent des voitures qui étaient des Lumières.
 *
 * ⚠️ LE CRITÈRE NE PEUT PAS ÊTRE « C'EST UNE VOITURE », il doit être SÛR dans les deux sens. Une
 * vraie voiture ne porte JAMAIS `intensite`, `portee` ni `sphereVisible` : ces trois champs
 * n'existent que sur une source (cf. `champsLumierePosee3D`). Leur présence sur un `objType`
 * « voiture » n'a donc qu'une explication, et aucune voiture légitime ne peut être prise pour une
 * Lumière.
 *
 * ⚠️ ET ON NE RÉPARE QUE « voiture », PAS N'IMPORTE QUEL TYPE. Le défaut écrivait toujours la même
 * valeur, celle du premier `<option>`. Accepter un autre type reviendrait à deviner : quelqu'un
 * pourrait avoir de bonnes raisons d'avoir des champs surnuméraires sur un Élément, et transformer
 * sa chaise en Lumière serait une seconde destruction, commise par la réparation elle-même.
 *
 * ⚠️ CE QUE LA RÉPARATION NE REND PAS : rien. Les trois réglages ont survécu à l'accident — le
 * défaut n'écrasait que `objType` —, donc rendre le discriminant suffit à retrouver la source
 * telle qu'elle était, couleur et intensité comprises.
 */
export function reparerLumiereChangeeEnVoiture3D(o){
  if (!o || o.type !== 'objet3d' || o.objType !== 'voiture') return false;
  const porteUnChampDeLumiere = o.intensite !== undefined
    || o.portee !== undefined
    || o.sphereVisible !== undefined;
  if (!porteUnChampDeLumiere) return false;
  o.objType = OBJ_TYPE_LUMIERE;
  return true;
}
