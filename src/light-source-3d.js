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
  return { couleur: r.couleur, intensite: r.intensite, portee: r.portee };
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
