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
 * `intensite` celle de la lumière CLÉ de la scène, `CLE_ACTUELLE`. Ce n'est pas un nombre tiré au
 *             sort : une source ajoutée éclaire d'abord comme ce qui éclaire déjà, ce qui la rend
 *             visible sans écraser la Case. ⚠️ Reste à juger À L'ÉCRAN : « assez lumineux » ne se
 *             calcule pas, et l'atténuation de Three.js dépend de la distance.
 * `portee`    0, c'est-à-dire SANS LIMITE au sens de Three.js. ⚠️ Et c'est un choix de prudence
 *             assumé : la modale qui réglera la portée n'existe pas encore. Une portée finie posée
 *             au hasard donnerait des lumières qui n'éclairent rien à trois mètres, sans aucun
 *             moyen de le corriger, ce qui se lirait comme une panne plutôt que comme un réglage.
 * `sphereVisible` vrai. Une lumière dont la sphère est masquée d'emblée n'affiche RIEN à l'ajout :
 *             on aurait cliqué « Ajouter → Lumière » pour voir une Case inchangée.
 * `rayon`     0,2 m, environ une tête (un Personnage fait 1,75 m). Assez gros pour se saisir, assez
 *             petit pour ne pas masquer ce qu'il éclaire. ⚠️ Choisi, pas dérivé.
 */
export const LUMIERE_POSEE_DEFAUT = {
  couleur: '#FFFFFF',
  intensite: CLE_ACTUELLE,
  portee: 0,
  sphereVisible: true,
  rayon: 0.2,
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
    rayon: Math.max(0.01, nombreFini(o.realHeightFloor, d.rayon)),
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
    realHeightFloor: d.rayon,
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
