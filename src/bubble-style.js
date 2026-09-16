/**
 * @file bubble-style.js
 * L'apparence d'une Bulle : la DÉCISION, séparée de son dessin.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * POURQUOI CE FICHIER EXISTE
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Chantier #425a, premier morceau du vocabulaire graphique arrêté dans docs/en/bubble-styles.md.
 * Cette note décrit une Bulle comme une combinaison libre de SEPT AXES dont aucun n'implique les
 * autres. Ce fichier ouvre les deux moins coûteux, et les deux qui ne touchent à aucune géométrie :
 * le REMPLISSAGE (son opacité) et le TRAIT (son motif, sa régularité).
 *
 * Tout ce qui est ici est PUR — des nombres, des tableaux, des chaînes — donc vérifiable sous Node,
 * là où `drawBubble` ne l'est pas. Le dessin vit dans draw.js (#425b), l'interface dans le menu de
 * droite (#425c) ; ce module ne connaît que des valeurs.
 *
 * ⚠️ AUCUNE GÉOMÉTRIE ICI, ET C'EST DÉLIBÉRÉ. `bubbleEdgePoint` porte trois choses à la fois :
 * l'ancrage de la queue, le hit-test de son glisser, et le tracé continu qui saute l'arc sous la
 * queue. Un tremblement qui déplacerait le contour ferait décrocher les trois d'un coup. Le tremblé
 * de ce fichier est donc une PERTURBATION DE TRACÉ, appliquée au moment de dessiner, jamais une
 * modification du contour. `amplitudeTrembleBulle` rend des pixels à ajouter au trait ; elle ne rend
 * jamais un point.
 *
 * ⚠️ « PAS DE RÉGLAGE » VAUT L'EXISTANT. Aucune Bulle déjà dessinée ne porte ces champs. Les valeurs
 * par défaut sont donc choisies pour reproduire EXACTEMENT le rendu actuel — remplissage opaque,
 * trait plein, aucun tremblement — et c'est ce que `tests/bubble-style.test.mjs` vérifie en premier.
 * Même garantie que #414b pour l'éclairage, même raison : un Projet ouvert demain ne doit pas avoir
 * changé d'aspect pendant la nuit.
 *
 * ⚠️ LES NOMS DE CHAMPS SONT PERSISTÉS, DONC DÉFINITIFS. La règle du dépôt interdit de renommer une
 * donnée enregistrée (cf. docs/en/persisted-data.md). Ils sont choisis ici une fois. Ils gardent le
 * préfixe `bulle` des champs existants (`bulleShape`, `bulleColor`, `bulleBorderWidth`…) plutôt que
 * d'introduire un second vocabulaire pour le même objet.
 */

/**
 * ⚠️ L'OPACITÉ NE VAUT QUE POUR LE REMPLISSAGE, ET C'EST TOUT L'INTÉRÊT DU RÉGLAGE.
 *
 * Le relevé de douze œuvres donne quatre séries qui distinguent deux registres en ne touchant qu'au
 * remplissage, sans changer ni le contour ni la queue. Une bulle à demi transparente laisse voir le
 * décor derrière elle ; son trait et son texte, eux, doivent rester lisibles — sinon le réglage ne
 * sert plus à « poser une voix sur l'image » mais à « effacer la bulle », ce qui est le travail de
 * la case à cocher « Afficher la bordure » et de rien d'autre.
 *
 * Faire porter une seule valeur sur le fond ET sur le trait serait exactement le défaut d'une valeur
 * qui sert deux rôles opposés. `tests/bubble-style.test.mjs` l'interdit explicitement.
 */
import { bruitCyclique, graineDeLObjet } from './cyclic-noise.js';

export const BULLE_OPACITE_DEFAUT = 1;

/** Motifs de trait relevés dans le corpus. PERSISTÉS : ces chaînes ne changeront plus. */
export const TRAIT_PLEIN = 'plein';
export const TRAIT_POINTILLE = 'pointille';
export const TRAIT_TIRETS = 'tirets';

/** Régularité du trait. PERSISTÉES, même raison. */
export const TRAIT_NET = 'net';
export const TRAIT_TREMBLE = 'tremble';

const MOTIFS = new Set([TRAIT_PLEIN, TRAIT_POINTILLE, TRAIT_TIRETS]);
const REGULARITES = new Set([TRAIT_NET, TRAIT_TREMBLE]);

/**
 * Les champs que ce chantier ajoute, et leurs valeurs de départ. Sert à la fiche (#425c) et aux
 * styles enregistrés (#425j), pour que la liste des champs existe à UN SEUL endroit.
 *
 * @returns {{bulleFillOpacity:number, bulleBorderDash:string, bulleBorderRegularity:string}}
 */
export function champsApparenceBulle(){
  return {
    bulleFillOpacity: BULLE_OPACITE_DEFAUT,
    bulleBorderDash: TRAIT_PLEIN,
    bulleBorderRegularity: TRAIT_NET,
  };
}

/**
 * Opacité du remplissage, bornée à [0, 1]. Fonction PURE.
 *
 * ⚠️ `null` ET `undefined` VALENT 1, MAIS `0` VAUT 0. Écrire `o.bulleFillOpacity || 1` donnerait 1
 * pour un fond volontairement invisible — une valeur légitime rendue impossible par le test de
 * vérité. Le corpus emploie ce cas : chez Jungle Juice, la bulle posée sur l'image sombre n'a ni
 * fond ni filet, seul le texte subsiste.
 */
export function opaciteRemplissageBulle(o){
  const v = o && o.bulleFillOpacity;
  if (v == null) return BULLE_OPACITE_DEFAUT;
  const n = Number(v);
  if (!Number.isFinite(n)) return BULLE_OPACITE_DEFAUT;
  return Math.min(1, Math.max(0, n));
}

/** Le motif demandé, ramené aux valeurs connues. Fonction PURE. */
export function motifTraitBulle(o){
  const v = o && o.bulleBorderDash;
  return MOTIFS.has(v) ? v : TRAIT_PLEIN;
}

/** La régularité demandée, ramenée aux valeurs connues. Fonction PURE. */
export function regulariteTraitBulle(o){
  const v = o && o.bulleBorderRegularity;
  return REGULARITES.has(v) ? v : TRAIT_NET;
}

/**
 * Le tableau à passer à `setLineDash`, en pixels. Fonction PURE.
 *
 * ⚠️ LE MOTIF SE MESURE EN ÉPAISSEURS DE TRAIT, PAS EN PIXELS FIXES. Un pointillé de 2 px est un
 * pointillé sur un filet fin et une ligne presque continue sous un trait de 6 px : à valeur
 * constante, le motif disparaît précisément là où l'utilisateur a demandé un trait plus visible.
 * Les longueurs sont donc des multiples de la largeur, et le motif garde le même aspect aux quatre
 * épaisseurs proposées dans le menu.
 *
 * Le trait plein rend `[]`, ce que `setLineDash` comprend comme « pas de motif » — c'est aussi
 * l'état dans lequel se trouve un contexte qui n'a jamais été touché, donc ce que voient les Bulles
 * existantes.
 */
export function tiretsTraitBulle(o, largeurTrait){
  const motif = motifTraitBulle(o);
  if (motif === TRAIT_PLEIN) return [];
  const w = Number(largeurTrait);
  const l = Number.isFinite(w) && w > 0 ? w : 1;
  // Le chuchotement du corpus : des points ronds nettement espacés, pas des tirets serrés.
  if (motif === TRAIT_POINTILLE) return [l * 0.1, l * 1.9];
  return [l * 3, l * 2];
}

/**
 * L'amplitude du tremblement, en pixels. Fonction PURE, et c'est tout ce que le tremblé produit.
 *
 * ⚠️ ELLE NE DÉPLACE PAS LE CONTOUR. Voir l'en-tête : la valeur rendue ici s'ajoute au TRACÉ dans
 * draw.js, pendant que `bubbleEdgePoint` continue de rendre le contour exact. C'est ce qui garantit
 * que la queue reste accrochée et que la poignée de glisser suit, quel que soit le tremblement.
 *
 * Elle est proportionnelle à l'épaisseur pour la même raison que le motif : un tremblement de 1 px
 * ne se voit pas sous un trait de 6 px, et déforme un filet fin.
 */
export function amplitudeTrembleBulle(o, largeurTrait){
  if (regulariteTraitBulle(o) !== TRAIT_TREMBLE) return 0;
  const w = Number(largeurTrait);
  const l = Number.isFinite(w) && w > 0 ? w : 1;
  // ⚠️ UNE PART FIXE, PLUS UNE PART PROPORTIONNELLE, ET LES DEUX ONT ÉTÉ MESURÉES À L'ŒIL.
  // La première version valait `l * 0.6`, purement proportionnelle. À l'épaisseur par défaut de
  // 2,25 px cela faisait 1,35 px d'ondulation, c'est-à-dire rien de visible : cocher « tremblé »
  // ne changeait rien à l'écran, et un réglage qui ne fait rien est pire qu'un réglage absent.
  // La part fixe garantit que le tremblement se voit au filet fin ; la part proportionnelle garde
  // l'ondulation lisible sous un trait épais, où 2 px disparaîtraient dans l'épaisseur.
  return 1.2 + l * 0.5;
}

/**
 * Une graine stable tirée de l'identifiant de la Bulle. Fonction PURE.
 *
 * ⚠️ SANS ELLE, UNE BULLE TREMBLÉE SCINTILLERAIT. `Math.random()` au moment de dessiner donnerait un
 * contour différent à chaque rendu, donc à chaque déplacement de la caméra, à chaque frappe au
 * clavier, à chaque redessin de la Planche. Le tremblé serait une animation permanente et non un
 * style. La même Bulle doit trembler de la même façon aussi longtemps qu'elle existe, et c'est son
 * `id` — déjà unique et déjà persisté — qui le garantit.
 */
export function graineTrembleBulle(o){
  // ⚠️ DÉLÉGUÉ À src/cyclic-noise.js EN #425g, et volontairement conservé comme nom. Le tremblé
  // n'est plus seul à vouloir une graine stable : la tache d'encre en veut une aussi. La décision
  // — « la graine vient de l'identifiant » — est donc descendue dans la primitive, et il n'en
  // reste qu'UNE. Ce nom-ci reste l'entrée du vocabulaire du trait, pour que les appelants de
  // bubble-style n'aient pas à connaître un second module.
  return graineDeLObjet(o);
}

/**
 * Les décalages à ajouter aux points du TRACÉ, deux par point. Fonction PURE.
 *
 * ⚠️ C'EST LA SEULE FORME SOUS LAQUELLE LE TREMBLÉ EXISTE. draw.js les ajoute aux coordonnées au
 * moment d'émettre le chemin ; `bubbleEdgePoint` n'en sait rien et continue de rendre le contour
 * exact, ce qui garde la queue accrochée et la poignée de glisser au bon endroit.
 *
 * Rend un tableau vide quand la Bulle est nette : l'appelant n'a alors aucun décalage à appliquer,
 * et peut emprunter le chemin de tracé d'origine sans rien recalculer. C'est ce qui protège les
 * Bulles existantes d'un arrondi qui les déplacerait d'un demi-pixel.
 */
export function decalagesTrembleBulle(o, largeurTrait, nombreDePoints){
  const amplitude = amplitudeTrembleBulle(o, largeurTrait);
  const n = Math.max(0, Math.floor(Number(nombreDePoints) || 0));
  if (amplitude === 0 || n === 0) return [];
  const graine = graineTrembleBulle(o);
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    // Deux tirages décorrélés par point : un même bruit sur x et y ferait glisser tous les points
    // le long de la diagonale, ce qui se lit comme une ombre portée, pas comme un tremblement.
    out[i] = {
      dx: bruitCyclique(graine, i / n, 0, POINTS_DE_CONTROLE_TREMBLE) * amplitude,
      dy: bruitCyclique(graine, i / n, 1000, POINTS_DE_CONTROLE_TREMBLE) * amplitude,
    };
  }
  return out;
}

/**
 * Nombre de points de contrôle du bruit, sur un tour complet.
 *
 * ⚠️ CE CHIFFRE A ÉTÉ CHOISI EN REGARDANT, PAS EN RAISONNANT. La première version tirait un bruit
 * INDÉPENDANT à chaque point du tracé. Les tests étaient tous verts — le contour changeait bien,
 * il était bien stable, il différait bien d'une Bulle à l'autre — et le rendu montrait une pomme de
 * terre : du bruit blanc à haute fréquence, pas une ligne tracée à la main. Une main qui tremble
 * produit des ondulations LARGES, une dizaine sur un tour, pas soixante-douze.
 */
const POINTS_DE_CONTROLE_TREMBLE = 9;

/**
 * Le regroupement dont draw.js a besoin, en un appel. Fonction PURE.
 *
 * ⚠️ IL NE DÉCIDE RIEN LUI-MÊME, il compose. Chaque valeur reste calculée par sa propre fonction,
 * testable seule : un regroupement qui recalculerait à sa façon ferait une seconde copie des mêmes
 * décisions, et deux copies ne concordent que le jour où on les écrit.
 */
export function apparenceBulle(o, largeurTrait){
  return {
    opacite: opaciteRemplissageBulle(o),
    tirets: tiretsTraitBulle(o, largeurTrait),
    tremble: amplitudeTrembleBulle(o, largeurTrait),
  };
}
