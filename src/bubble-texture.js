/**
 * src/bubble-texture.js — le registre des TEXTURES de remplissage. Fonctions PURES.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * UNE TEXTURE EST UNE PILE DE COUCHES, ET C'EST TOUT
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ UNE TEXTURE IMPOSE SA COULEUR DE FOND, SAUF « AUCUNE ». Demandé à l'usage, et c'est juste : un
 * vieux papier n'est pas « une couleur au choix, un peu tachée », c'est du parchemin ; la tache
 * d'encre du Lecteur omniscient est NOIRE, avec un lettrage blanc. Laisser l'utilisateur régler la
 * couleur sous une texture qui la teinte donnait des résultats que le relevé ne montre nulle part —
 * un parchemin bleu, une tache d'encre rose. « Aucune » reste le cas où la couleur est libre, et
 * c'est là que le sélecteur de couleur a un sens.
 *
 * Une texture rend DEUX choses, et la plupart n'en emploient qu'une :
 *
 *   1. `couches` — le chemin de la Bulle ramené vers son centre par un facteur, éventuellement
 *      variable selon l'ANGLE, peint d'une couleur et d'une opacité.
 *   2. `taches` — des disques libres, posés en coordonnées NORMALISÉES dans le DISQUE UNITÉ.
 *
 * ⚠️ IL A FALLU LES DEUX, ET DEUX RENDUS RATÉS POUR LE COMPRENDRE. Une couche est le contour mis à
 * l'échelle : c'est une boucle fermée qui ENTOURE toujours le centre. Elle ne peut donc jamais être
 * une tache localisée. Les deux tentatives l'ont montré sans appel — des couches concentriques dont
 * le rayon ondulait ont donné un oignon coupé, et des couches en secteur ont donné un nœud
 * papillon. Une tache de vieux papier n'entoure rien : il fallait un second type d'élément.
 *
 * ⚠️ ET LES TACHES SONT DONNÉES EN COORDONNÉES NORMALISÉES, avec `hypot(x, y) + r ≤ 1`. Le dessin
 * les ramène dans la plus grande ellipse INSCRITE dans la forme, ce qui garantit qu'elles restent
 * dans la Bulle SANS AUCUNE DÉCOUPE — #425k vient de figer qu'une Bulle ne se peint jamais sous
 * découpe, et une texture qui aurait eu besoin de `clip()` aurait forcé à desserrer cette règle une
 * étape après l'avoir écrite. La texture, elle, ne reçoit toujours aucune géométrie.
 *
 * ⚠️ LE FACTEUR DÉPEND DE L'ANGLE, PAS DU RANG DU POINT, et la première écriture faisait l'inverse.
 * Un facteur indexé sur les points du CONTOUR ne sait rien dire de la QUEUE, dont les points ne
 * viennent pas du contour : la queue serait restée pleinement opaque pendant que le corps
 * s'estompe. Un facteur fonction de l'angle s'applique à n'importe quel point du chemin, d'où qu'il
 * vienne — et il rend au passage la texture encore plus étrangère à la forme, puisqu'elle ne reçoit
 * même plus le nombre de points.
 *
 * ⚠️ POURQUOI DES COUCHES PLUTÔT QU'UN DÉGRADÉ DE CANEVAS. Un dégradé est radial ou linéaire ; une
 * forme est quelconque. Calé sur la boîte englobante — la seule chose qu'un dégradé sache viser —
 * le fondu devient INÉGAL autour du périmètre : l'étoile perd ses pointes, qui touchent la boîte,
 * pendant que ses creux restent opaques ; la bande se dissout par ses deux bouts seulement. C'est
 * juste pour la tache d'encre, qui remplit à peu près sa boîte et qui est grossièrement elliptique,
 * et faux partout ailleurs. Un rendu comparatif l'a montré avant qu'une ligne soit écrite.
 *
 * Des copies rétrécies de la SILHOUETTE, elles, épousent la forme quelle qu'elle soit.
 *
 * ⚠️ ET UNE TEXTURE FAIT VARIER LA COULEUR AUTANT QUE L'OPACITÉ. Ma première description de cet axe
 * ne parlait que d'opacité — le cœur opaque et les bords translucides de la tache d'encre. La
 * planche de La Licorne montre autre chose : des cartouches MARBRÉS, crème et ocre, avec des taches
 * plus sombres. Un contrat qui n'aurait porté que l'alpha n'aurait jamais pu recevoir « vieux
 * papier ». Chaque couche porte donc sa propre couleur.
 *
 * ⚠️ L'AXE EST INDÉPENDANT DE LA FORME, comme les deux registres précédents. Une couronne d'épines
 * doit pouvoir être marbrée, et la tache d'encre rester utilisable en aplat. Aucune texture ne lit
 * `o.bulleShape` : elle ne reçoit que la couleur et l’opacité, jamais la moindre géométrie.
 */
import { bruitCyclique, graineDeLObjet, melangeEntier } from './cyclic-noise.js';

/** Les trois valeurs de l'axe texture. « Aucune » est un choix, pas une absence de réglage. */
export const TEXTURE_AUCUNE = 'aucune';
export const TEXTURE_FONDUS = 'fondus';
export const TEXTURE_PAPIER = 'papier';

/**
 * ⚠️ « AUCUNE » EST LE DÉFAUT, ET C'EST CE QUI PROTÈGE L'EXISTANT. Toute Bulle enregistrée avant
 * cette étape doit continuer de se remplir d'un aplat, au pixel près : une seule couche, le contour
 * entier, la couleur choisie, l'opacité choisie.
 */
export const TEXTURE_DEFAUT = TEXTURE_AUCUNE;

// ── Couleurs ────────────────────────────────────────────────────────────────────────────────────

/** `#rgb` ou `#rrggbb` → [r, g, b]. Rend `null` sur une entrée qu'on ne sait pas lire. */
function versRVB(couleur){
  const v = String(couleur || '').trim().replace('#', '');
  const n = v.length === 3 ? v.split('').map(c => c + c).join('') : v;
  if (!/^[0-9a-fA-F]{6}$/.test(n)) return null;
  return [0, 2, 4].map(i => parseInt(n.slice(i, i + 2), 16));
}

const versHex = (rvb) => '#' + rvb.map(v => Math.max(0, Math.min(255, Math.round(v)))
  .toString(16).padStart(2, '0')).join('');

/**
 * ⚠️ UNE TACHE DE VIEUX PAPIER TIRE VERS LE BRUN, PAS VERS LE NOIR — et la première version faisait
 * l'inverse. Foncer une couleur en la mélangeant au noir la DÉSATURE : un cartouche ocre virait au
 * gris verdâtre, ce qu'aucune planche de La Licorne ne montre. Une auréole d'humidité sur du papier
 * est plus SOMBRE ET PLUS CHAUDE que le fond ; la cible du mélange est donc une terre d'ombre, et
 * pour l'éclaircissement une crème, jamais le blanc pur.
 */
const TERRE = [0x6B, 0x4E, 0x2E];
const CREME = [0xFA, 0xF2, 0xDE];

/**
 * Éclaircit (`t > 0`) ou fonce (`t < 0`) une couleur, et rend la couleur d'origine si on ne sait
 * pas la lire.
 *
 * ⚠️ LE REPLI N'EST PAS UN OUBLI, ET IL NE MASQUE RIEN. `bulleColor` est un champ persisté, écrit
 * par un sélecteur de couleur mais lisible dans un fichier de Projet édité à la main. Une valeur
 * inconnue — un nom CSS, un `rgba()` — n'est pas une faute de programmation à signaler bruyamment
 * comme une clé de registre inconnue : c'est une couleur que le canevas saura peut-être peindre
 * lui-même. On la laisse donc passer telle quelle, sans marbrure, plutôt que de refuser de dessiner.
 */
function teinte(couleur, t){
  const rvb = versRVB(couleur);
  if (!rvb) return couleur;
  const cible = t >= 0 ? CREME : TERRE;
  return versHex(rvb.map((v, i) => v + (cible[i] - v) * Math.abs(t)));
}

// ── Les trois textures ──────────────────────────────────────────────────────────────────────────

/**
 * L'encre sombre du Lecteur omniscient : une masse NOIRE au cœur opaque, dont le bord translucide
 * laisse passer le fond, et qui porte un lettrage clair.
 *
 * ⚠️ LA CLÉ PERSISTÉE RESTE `fondus`, ALORS QUE LE LIBELLÉ DIT « ENCRE SOMBRE ». Le nom d'origine ne
 * décrivait que le bord ; la couleur en fait désormais partie. Mais un registre LÈVE sur une clé
 * inconnue — c'est la politique de tout ce chantier — et renommer la clé ferait échouer bruyamment
 * l'ouverture d'un Projet enregistré entre-temps. Le libellé peut mentir sans conséquence, une clé
 * persistée non.
 *
 * ⚠️ LE PROFIL RESTE PLAT JUSQU'À MI-CHEMIN. Un fondu qui commencerait au centre donnerait un halo,
 * pas une tache : le relevé décrit un CŒUR OPAQUE et un bord qui s'éteint, pas un dégradé continu.
 */
const FONDUS_COUCHES = 14;
const FONDUS_PLEIN = 0.55;   // fraction du rayon qui reste totalement opaque

function couchesFondus(o, ctx){
  const out = [];
  for (let k = FONDUS_COUCHES; k >= 1; k--) {
    const f = k / FONDUS_COUCHES;
    const a = f <= FONDUS_PLEIN ? 1 : Math.max(0, 1 - (f - FONDUS_PLEIN) / (1 - FONDUS_PLEIN));
    out.push({ facteur: () => f, couleur: ctx.couleur, alpha: a * ctx.opacite });
  }
  return { couches: out, taches: [] };
}

/**
 * ⚠️ LA COULEUR DU TEXTE EST UN DÉFAUT, PAS UNE CONTRAINTE — même dispositif que la queue par défaut
 * d'une forme. Une encre sombre garderait sinon le texte anthracite des autres Bulles, donc noir sur
 * noir : la texture serait inutilisable telle quelle. Le champ `bulleTextColor` de l'utilisateur
 * l'emporte toujours ; la texture ne dit que « à défaut ».
 */

/**
 * Le vieux papier de La Licorne : un cartouche marbré, crème et ocre, taché de plus sombre.
 *
 * ⚠️ DES TACHES, PAS DES COUCHES — voir l'en-tête du module : deux rendus ratés ont établi qu'une
 * couche entoure toujours le centre et ne peut donc pas faire une marbrure.
 *
 * ⚠️ CHAQUE TACHE EST UN EMPILEMENT DE DISQUES CONCENTRIQUES, et c'est ce qui lui donne un bord
 * doux. Un disque net se lit comme une pastille collée ; une auréole d'humidité n'a pas d'arête.
 * C'est le dessin qui les peint, sans rien savoir de ce qu'ils représentent.
 *
 * ⚠️ LA GRAINE VIENT DE LA BULLE, comme le contour de la tache d'encre. Un tirage à chaque rendu
 * ferait frémir le cartouche, et l'impression ne serait pas ce qu'on a validé à l'écran.
 */
const PAPIER_TACHES = 22;         // nombre d'auréoles
const PAPIER_ANNEAUX = 4;         // disques concentriques par auréole, pour un bord doux
const PAPIER_TEINTE = 0.34;       // écart de teinte maximal d'une auréole au fond

function couchesPapier(o, ctx){
  const graine = graineDeLObjet(o);
  const taches = [];
  for (let k = 0; k < PAPIER_TACHES; k++) {
    // Posées en coordonnées normalisées dans la zone inscriptible : le dessin les y ramène, et
    // elles ne peuvent donc pas sortir de la Bulle.
    // Tirage dans le disque unité, rayon compris : `distance + rayon ≤ 1`.
    const r = 0.10 + tirage(graine, k, 2) * 0.30;
    const ang = tirage(graine, k, 0) * Math.PI * 2;
    const d = Math.sqrt(tirage(graine, k, 1)) * (1 - r);
    const x = Math.cos(ang) * d, y = Math.sin(ang) * d;
    const sens = tirage(graine, k, 3) < 0.6 ? -1 : 1;   // plus sombre le plus souvent
    const force = PAPIER_TEINTE * (0.3 + 0.7 * tirage(graine, k, 4));
    const couleur = teinte(ctx.couleur, sens * force);
    for (let j = 0; j < PAPIER_ANNEAUX; j++) {
      taches.push({ x, y, r: r * (1 - j / PAPIER_ANNEAUX),
                    couleur, alpha: 0.11 * ctx.opacite });
    }
  }
  // ⚠️ LE BORD EST PLUS SALE QUE LE CŒUR, et les taches seules ne pouvaient pas le dire : posées
  // dans l'ellipse INSCRITE, elles n'atteignent jamais le contour. Or c'est précisément là qu'un
  // papier se salit — le pourtour d'un cartouche de La Licorne est nettement plus brun que son
  // milieu. Deux couches suffisent : le contour entier dans une teinte terre, puis la couleur
  // choisie ramenée un peu vers le centre. Il en reste un liseré sale tout autour.
  const couches = [
    { facteur: null, couleur: teinte(ctx.couleur, -0.42), alpha: ctx.opacite },
    { facteur: (t) => 0.88 + bruitCyclique(graine, t, 4242, 5) * 0.06,
      couleur: ctx.couleur, alpha: ctx.opacite },
  ];
  return { couches, taches };
}

/** Un tirage stable dans [0, 1[ pour l'élément `k`, canal `c`. */
const tirage = (graine, k, c) => melangeEntier(graine + k * 131 + c * 7919);

const REGISTRE = {
  [TEXTURE_AUCUNE]: {
    // Une seule couche, le contour tel quel : exactement le remplissage d'avant cette étape.
    rendu: (o, ctx) => ({ couches: [{ facteur: null, couleur: ctx.couleur, alpha: ctx.opacite }], taches: [] }),
    // ⚠️ AUCUNE COULEUR IMPOSÉE, ET C'EST TOUT L'INTÉRÊT DE CETTE ENTRÉE : c'est le seul cas où le
    // sélecteur « Couleur du fond » commande vraiment quelque chose.
    couleurImposee: null,
    couleurTexteParDefaut: null,
  },
  [TEXTURE_FONDUS]: {
    rendu: couchesFondus,
    couleurImposee: '#1B1B1F',        // le noir d'encre du relevé, pas un gris
    couleurTexteParDefaut: '#FFFFFF', // lettrage clair, comme sur la planche
  },
  [TEXTURE_PAPIER]: {
    rendu: couchesPapier,
    couleurImposee: '#E3D2A8',        // le parchemin de La Licorne
    couleurTexteParDefaut: '#3A2B18',
  },
};

/** Les clés enregistrées, pour la fiche et pour les tests. */
export function texturesConnues(){
  return Object.keys(REGISTRE);
}

/**
 * La texture d'une Bulle, ramenée à une clé connue. Fonction PURE.
 *
 * ⚠️ MÊME POLITIQUE QUE LES DEUX AUTRES REGISTRES : un champ absent ou vide vaut « aucune », mais
 * une clé INCONNUE lève. Retomber en silence sur l'aplat donnerait une Bulle d'apparence normale
 * dont personne ne saurait dire pourquoi elle a perdu sa texture.
 */
export function textureDeLaBulle(o){
  const v = o && o.bulleTexture;
  if (v == null || v === '') return TEXTURE_DEFAUT;
  if (!Object.prototype.hasOwnProperty.call(REGISTRE, v)) {
    throw new Error(`Texture de Bulle inconnue : « ${v} ». Textures enregistrées : ${texturesConnues().join(', ')}.`);
  }
  return v;
}

/**
 * La couleur de fond qu'une texture IMPOSE, ou `null` si elle laisse le choix. Fonction PURE.
 *
 * ⚠️ `null` N'EST PAS « BLANC », c'est « l'utilisateur décide ». Les deux se confondraient dans un
 * appelant distrait, et le sélecteur de couleur deviendrait inopérant pour tout le monde.
 */
export function couleurImposeeParLaTexture(o){
  return REGISTRE[textureDeLaBulle(o)].couleurImposee;
}

/** La couleur de texte qu'une texture suggère À DÉFAUT, ou `null`. Fonction PURE. */
export function couleurTexteParDefautDeLaTexture(o){
  return REGISTRE[textureDeLaBulle(o)].couleurTexteParDefaut;
}

/**
 * Ce qu'il y a à peindre : `{ couches, taches }`. Fonction PURE.
 *
 * Une couche : `facteur` vaut `null` pour « le chemin tel quel », ou une fonction de l'angle
 * normalisé `t` dans [0, 1[ rendant le facteur de rapprochement vers le centre en ce point.
 * Une tache : `x`, `y` dans [-1, 1] et `r` en fraction de la demi-zone inscriptible.
 *
 * ⚠️ L'OPACITÉ DE LA BULLE MULTIPLIE CELLE DE CHAQUE COUCHE, elle ne la remplace pas. Les deux
 * réglages agiraient sinon sur la même chose, et l'un des deux deviendrait inopérant sans qu'on
 * sache lequel — le défaut qui a mordu quatre fois dans ce chantier. `bulleFillOpacity` reste un
 * variateur global : à 0, une Bulle marbrée disparaît entièrement, marbrure comprise.
 */
export function couchesDeTextureBulle(o, ctx){
  const cle = textureDeLaBulle(o);
  const contexte = {
    couleur: (ctx && ctx.couleur) || '#fff',
    opacite: ctx && Number.isFinite(ctx.opacite) ? ctx.opacite : 1,
  };
  return REGISTRE[cle].rendu(o, contexte);
}
