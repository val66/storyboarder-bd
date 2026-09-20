/**
 * src/bubble-particle.js — le registre des PARTICULES semées autour d'une Bulle. Fonctions PURES.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * POURQUOI UN AXE À PART, ET NON UN MOTIF DU TRAIT
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ LE RATTACHEMENT A ÉTÉ DÉBATTU AVANT D'ÊTRE CODÉ, et le mouchetis d'encre aurait pu passer pour
 * un motif de bordure au même titre que les pointillés. C'est faux, et la raison est nette : un
 * motif de trait est une propriété d'UNE LIGNE, alors qu'une particule est une nuée répartie en DEUX
 * dimensions autour du bord. Les loger sur le même attribut aurait interdit « tremblé ET moucheté »,
 * combinaison que le relevé montre chez Lecteur omniscient.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * CE QUI SÉPARE UNE PARTICULE D'UNE TACHE DE TEXTURE
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ LES DEUX SE RESSEMBLENT ET N'ONT PAS LA MÊME LOI. Les taches du vieux papier (#425m) sont
 * CONFINÉES dans la Bulle : elles tiennent par calcul dans la plus grande ellipse inscrite, sans
 * découpe. Une particule, elle, se pose À CHEVAL SUR LE BORD — dedans et dehors —, parce que c'est
 * ce que montre le relevé : le mouchetis d'encre entoure la masse au lieu de la remplir.
 *
 * Elle n'a donc pas besoin de la même contrainte, et rien ne s'y oppose : #425k a figé qu'une Bulle
 * n'est jamais découpée par sa Case, si bien qu'une particule qui déborde est cohérente avec une
 * tache d'encre posée à cheval sur le blanc inter-cases.
 *
 * ⚠️ LES PARTICULES SONT DONNÉES EN COORDONNÉES POLAIRES NORMALISÉES — un angle et un rayon en
 * fraction du CONTOUR, pas de la boîte. Le dessin les ramène sur le contour réel de la forme, ce qui
 * les fait suivre une étoile ou un écu aussi bien qu'un ovale. La particule, elle, ne reçoit aucune
 * géométrie : c'est la même indépendance que pour les queues et les textures.
 *
 * ⚠️ LA TAILLE ET L'OPACITÉ DÉCROISSENT AVEC LA DISTANCE AU BORD, et c'est le relevé qui l'impose :
 * « des points dont la taille ET l'opacité décroissent avec la distance ». Un semis de points
 * identiques se lit comme une trame imprimée, pas comme de l'encre projetée.
 *
 * ⚠️ UNE PARTICULE N'EST PAS FORCÉMENT RONDE, ET IL A FALLU UN RENDU POUR S'EN APERCEVOIR. La
 * première version ne donnait qu'un rayon : la flamme n'était alors qu'un mouchetis poussé vers le
 * haut, ce qui ne ressemble à rien. Une langue de feu est ALLONGÉE. Chaque particule porte donc un
 * `allongement`, rapport de sa longueur à sa largeur ; le mouchetis d'encre garde 1 et reste rond.
 *
 * ⚠️ ET ELLE N'EST PAS FORCÉMENT RADIALE NON PLUS — second rendu, seconde correction. Allongée le
 * long du RAYON, une langue posée près du sommet d'une Bulle LARGE part à l'horizontale : sur une
 * ellipse aplatie, la direction radiale au voisinage du sommet est loin d'être verticale. Le feu
 * s'étalait en flaques de part et d'autre au lieu de monter.
 *
 * Or une flamme monte, quelle que soit la forme qui la porte. Une particule peut donc fixer son
 * `orientation` en absolu, et se décaler VERTICALEMENT plutôt que radialement. Le mouchetis, lui,
 * laisse les deux à leur défaut et reste gouverné par le rayon — ce qui est juste pour de l'encre
 * projetée, qui part bien du centre.
 */
import { graineDeLObjet, melangeEntier } from './cyclic-noise.js';

/** Les trois valeurs de l'axe particule. « Aucune » est un choix, pas une absence de réglage. */
export const PARTICULE_AUCUNE = 'aucune';
export const PARTICULE_TACHE = 'tache';
export const PARTICULE_FLAMME = 'flamme';

/**
 * ⚠️ « AUCUNE » EST LE DÉFAUT, ET C'EST CE QUI PROTÈGE L'EXISTANT. Aucune Bulle enregistrée ne porte
 * ce champ : toutes doivent continuer de se dessiner sans la moindre particule.
 */
export const PARTICULE_DEFAUT = PARTICULE_AUCUNE;

/** Un tirage stable dans [0, 1[ pour la particule `k`, canal `c`. */
const tirage = (graine, k, c) => melangeEntier(graine + k * 2749 + c * 8191);

/**
 * Le mouchetis d'encre du Lecteur omniscient : des points projetés autour de la masse.
 *
 * ⚠️ DEUX DÉCROISSANCES, PAS UNE. Le relevé dit « la taille ET l'opacité décroissent avec la
 * distance ». Ne faire décroître que l'une donne soit des gros points fantômes au loin, soit des
 * points minuscules mais francs : dans les deux cas la projection ne se lit pas.
 *
 * ⚠️ ET LA PORTÉE EST ASYMÉTRIQUE : beaucoup plus DEHORS que dedans. De l'encre projetée part de la
 * masse vers l'extérieur ; un semis symétrique ressemblerait à un contour bruité, pas à une
 * éclaboussure.
 */
const TACHE_NOMBRE = 34;
const TACHE_DEDANS = 0.10;     // pénétration maximale sous le contour
const TACHE_DEHORS = 0.42;     // portée maximale au-delà du contour
const TACHE_RAYON = 0.055;     // rayon du plus gros point, en fraction du demi-axe

function particulesTache(o, ctx){
  const graine = graineDeLObjet(o);
  const out = [];
  for (let k = 0; k < TACHE_NOMBRE; k++) {
    const angle = tirage(graine, k, 0);
    // ⚠️ RACINE CARRÉE DU TIRAGE : sans elle, les points se massent près du contour et se raréfient
    // au loin d'une façon qui se lit comme une seconde bordure. La racine étale la nuée.
    const versDehors = Math.sqrt(tirage(graine, k, 1));
    const rayonRelatif = 1 - TACHE_DEDANS + versDehors * (TACHE_DEDANS + TACHE_DEHORS);
    // `distance` vaut 0 sur le contour et 1 au bout de la portée : les deux décroissances en
    // dépendent, et d'elle seule.
    const distance = Math.max(0, (rayonRelatif - 1) / TACHE_DEHORS);
    const attenuation = Math.max(0, 1 - distance);
    out.push({
      angle,
      rayonRelatif,
      taille: TACHE_RAYON * (0.35 + 0.65 * tirage(graine, k, 2)) * attenuation,
      // ⚠️ L'ATTÉNUATION NE DESCEND PAS À ZÉRO : la plus lointaine des gouttes doit rester PÂLE, pas
      // absente. À zéro, on peignait des particules parfaitement invisibles — du travail pour rien,
      // et une coupure franche au bout de la portée là où le relevé montre une raréfaction.
      alpha: (0.25 + 0.55 * tirage(graine, k, 3)) * (0.15 + 0.85 * attenuation) * ctx.opacite,
      allongement: 1,
      decalageVertical: 0,
      orientation: null,      // ronde : l'orientation n'a aucun effet, mais on ne la laisse pas deviner
      couleur: ctx.couleur,
    });
  }
  return out;
}

/**
 * La flamme : des langues qui montent, plus denses vers le haut.
 *
 * ⚠️ AUCUNE SOURCE DANS LE RELEVÉ — c'est un ajout demandé, et il faut que ce soit écrit. Les douze
 * œuvres examinées ne montrent pas de Bulle enflammée ; les réglages ci-dessous ne reproduisent donc
 * rien, ils inventent. À ne jamais présenter comme relevé, et à revoir sans scrupule si une planche
 * finit par en fournir une.
 *
 * ⚠️ CE QUI LA REND DIFFÉRENTE DU MOUCHETIS, ET PAS SEULEMENT PLUS DENSE : elle est ORIENTÉE. Les
 * particules se concentrent vers le haut de la Bulle et y portent plus loin. Un semis isotrope, si
 * serré soit-il, ne se lit jamais comme une flamme.
 */
const FLAMME_NOMBRE = 34;
const FLAMME_PORTEE = 0.55;      // portée vers le haut, en fraction du rayon du contour
const FLAMME_LARGEUR = 0.105;    // demi-largeur d'une langue, en fraction du plus petit demi-axe
const FLAMME_ALLONGEMENT = 3.2;  // combien une langue est plus longue que large
// ⚠️ L'ÉTALEMENT RESTE SOUS UN QUART DE TOUR, ET C'EST UN INVARIANT, PAS UN RÉGLAGE. À 0,25 une
// langue se poserait exactement à l'horizontale, et au-delà elle PENDRAIT SOUS la Bulle. Le feu
// monte : rien ne doit descendre sous l'horizon de la Bulle, quelle que soit la graine.
const FLAMME_ARC = 0.22;         // étalement angulaire, en fraction du tour
const FLAMME_EVASEMENT = 0.55;   // inclinaison maximale d'une langue écartée, en radians

// ⚠️ LA LARGEUR A ÉTÉ MULTIPLIÉE PAR TROIS APRÈS UN RENDU, et la cause valait d'être comprise :
// `taille` est une fraction du PLUS PETIT demi-axe. Sur une Bulle large et plate — 210 × 80, le
// gabarit d'une tache d'encre — cela fait 40 px, donc des langues d'un pixel de rayon. Invisibles.
// Une valeur réglée sur une Bulle carrée ne dit rien de ce qu'elle donnera sur une Bulle allongée.

function particulesFlamme(o, ctx){
  const graine = graineDeLObjet(o);
  const out = [];
  for (let k = 0; k < FLAMME_NOMBRE; k++) {
    // ⚠️ LES LANGUES SE CONCENTRENT VERS LE HAUT, et le biais est calculé plutôt que décoratif. Un
    // tirage élevé au CARRÉ resserre la nuée autour du sommet sans l'y écraser — le cube, essayé
    // d'abord, les tassait sur une bande si étroite qu'on n'y voyait plus un feu mais une touffe.
    const ecart = tirage(graine, k, 0) * 2 - 1;
    const biais = Math.pow(Math.abs(ecart), 2) * Math.sign(ecart);
    // 0,75 est le HAUT dans le repère écran, où `y` descend.
    const angle = (0.75 + biais * FLAMME_ARC + 1) % 1;
    // Les langues centrales montent le plus haut : c'est ce qui donne la silhouette d'un feu.
    const versLeHaut = 1 - Math.abs(biais);
    const montee = (0.25 + 0.75 * tirage(graine, k, 1)) * FLAMME_PORTEE * (0.35 + 0.65 * versLeHaut);
    // `montee` et `largeur` sont des fractions du plus petit demi-axe : le dessin les y ramène.
    const attenuation = 1 - (montee / FLAMME_PORTEE) * 0.8;
    const allongement = FLAMME_ALLONGEMENT * (0.7 + 0.6 * tirage(graine, k, 4));
    const largeur = FLAMME_LARGEUR * (0.55 + 0.45 * tirage(graine, k, 2)) * attenuation;
    out.push({
      angle,
      // La langue part DU CONTOUR et monte : elle ne s'éloigne pas le long du rayon.
      rayonRelatif: 1,
      // ⚠️ POSÉE À MI-HAUTEUR DE SA PROPRE MONTÉE, parce qu'elle est allongée : son centre doit se
      // trouver entre le bord et sa pointe, sinon la moitié basse pend sous le contour.
      // Négatif = vers le haut, le repère écran ayant `y` qui descend.
      decalageVertical: -(montee + largeur * allongement),
      taille: largeur,
      alpha: (0.30 + 0.45 * tirage(graine, k, 3)) * attenuation * ctx.opacite,
      allongement,
      // ⚠️ VERS LE HAUT, LÉGÈREMENT ÉVASÉE — et les deux extrêmes ont été essayés puis écartés.
      // Le long du RAYON : sur une Bulle large et plate, la direction radiale près du sommet est
      // presque horizontale, et les langues du bord se couchaient. Toutes STRICTEMENT verticales :
      // une rangée de traits parallèles, mécanique, qui ne brûle pas. L'évasement suit le même
      // biais que la position, de sorte qu'une langue écartée penche vers l'extérieur sans jamais
      // se coucher.
      orientation: -Math.PI / 2 + biais * FLAMME_EVASEMENT,
      couleur: ctx.couleur,
    });
  }
  return out;
}

const REGISTRE = {
  [PARTICULE_AUCUNE]: { semer: () => [] },
  [PARTICULE_TACHE]: { semer: particulesTache },
  [PARTICULE_FLAMME]: { semer: particulesFlamme },
};

/** Les clés enregistrées, pour la fiche et pour les tests. */
export function particulesConnues(){
  return Object.keys(REGISTRE);
}

/**
 * La particule d'une Bulle, ramenée à une clé connue. Fonction PURE.
 *
 * ⚠️ MÊME POLITIQUE QUE LES TROIS AUTRES REGISTRES : un champ absent ou vide vaut « aucune », mais
 * une clé INCONNUE lève. Retomber en silence sur « aucune » donnerait une Bulle d'apparence normale
 * dont personne ne saurait dire pourquoi son mouchetis a disparu.
 */
export function particuleDeLaBulle(o){
  const v = o && o.bulleParticule;
  if (v == null || v === '') return PARTICULE_DEFAUT;
  if (!Object.prototype.hasOwnProperty.call(REGISTRE, v)) {
    throw new Error(`Particule de Bulle inconnue : « ${v} ». Particules enregistrées : ${particulesConnues().join(', ')}.`);
  }
  return v;
}

/**
 * Les particules à semer. Fonction PURE.
 *
 * Chacune porte `angle` dans [0, 1[ — la position sur le tour —, `rayonRelatif` en fraction du
 * CONTOUR (1 = sur le bord, au-delà = dehors), `decalageVertical` en fraction du demi-axe (négatif
 * = vers le haut), `taille` en fraction du demi-axe, `allongement` (1 = ronde), `orientation` en
 * radians ou `null` pour « le long du rayon », `alpha` et `couleur`.
 *
 * ⚠️ L'OPACITÉ DE LA BULLE MULTIPLIE CELLE DES PARTICULES, elle ne la remplace pas — même règle que
 * pour les textures. Sans cela, une Bulle réglée à 0 % resterait visible par son seul mouchetis, et
 * le curseur deviendrait inopérant sans qu'on sache pourquoi.
 */
export function particulesDeLaBulle(o, ctx){
  const cle = particuleDeLaBulle(o);
  return REGISTRE[cle].semer(o, {
    couleur: (ctx && ctx.couleur) || '#23242A',
    opacite: ctx && Number.isFinite(ctx.opacite) ? ctx.opacite : 1,
  });
}
