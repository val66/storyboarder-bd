/**
 * src/bubble-texture.js — le registre des TEXTURES de remplissage. Fonctions PURES.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * UNE TEXTURE EST UNE PILE DE COUCHES, ET C'EST TOUT
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ UNE TEXTURE PEUT IMPOSER SA COULEUR, OU SEULEMENT LA SUGGÉRER, ET LES DEUX DIFFÈRENT. La tache
 * d'encre du Lecteur omniscient est NOIRE, avec un lettrage blanc : elle IMPOSE, et la fiche masque
 * alors le sélecteur plutôt que de laisser tourner un bouton mort. Le vieux papier, lui, ne fait que
 * SUGGÉRER depuis #431b : son grain est photographié, donc monochrome, donc la couleur redevient
 * libre sans que le papier cesse d'être du papier.
 *
 * Une texture rend une chose : `couches` — le chemin de la Bulle ramené vers son centre par un
 * facteur, éventuellement variable selon l'ANGLE, peint d'une couleur, d'une opacité, et
 * éventuellement habillé d'un GRAIN que la couche se contente de NOMMER.
 *
 * ⚠️ IL A EXISTÉ UN SECOND AXE, `taches`, ET IL EST PARTI EN #431b3. Des disques libres posés en
 * coordonnées normalisées : il avait fallu deux rendus ratés pour comprendre qu'une couche ne peut
 * pas en tenir lieu — une couche est le contour mis à l'échelle, donc une boucle fermée qui ENTOURE
 * toujours le centre, jamais une tache localisée. Des couches concentriques ondulantes avaient donné
 * un oignon coupé, des couches en secteur un nœud papillon.
 *
 * La leçon reste vraie ; c'est le BESOIN qui a disparu, deux fois plutôt qu'une. Un grain
 * photographié porte déjà la matière, et #425n a tranché que les taches relèvent de l'axe PARTICULE
 * — où l'utilisateur les demande explicitement. Garder des auréoles cachées dans le remplissage,
 * c'était une seconde source de taches que personne ne commandait.
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
import { bruitCyclique, graineDeLObjet } from './cyclic-noise.js';

/** Les valeurs de l'axe texture. « Aucune » est un choix, pas une absence de réglage. */
export const TEXTURE_AUCUNE = 'aucune';
export const TEXTURE_PAPIER = 'papier';
export const TEXTURE_GLACE = 'glace';
export const TEXTURE_LAVE = 'lave';
export const TEXTURE_NUIT = 'nuit-etoile';

/**
 * Les clés persistées qui ont changé de nom, et ce qu'elles valent désormais.
 *
 * ⚠️ SANS CETTE TABLE, RENOMMER UNE CLÉ SERAIT INTERDIT — et ce module l'avait écrit noir sur
 * blanc. Un registre LÈVE sur une clé inconnue, c'est la politique de tout le chantier ; renommer
 * `fondus` ferait donc échouer bruyamment l'ouverture de tout Projet qui l'emploie. Le raisonnement
 * était juste et il lui manquait une issue : un alias n'est pas un repli silencieux, c'est une
 * DÉCISION ÉCRITE, qui dit exactement ce que devient l'ancienne valeur.
 *
 * ⚠️ ET LA MIGRATION SE FAIT À LA LECTURE, PAS PAR UNE PASSE AU CHARGEMENT. `textureDeLaBulle` est
 * le seul point par lequel tout le monde passe — dessin, fiche, tests. Une passe séparée devrait
 * parcourir Tomes, Planches, Cases et Éléments, et aurait à être rejouée pour tout Projet importé
 * plus tard, collé, ou restauré. Ici, une valeur ancienne est simplement LUE comme la nouvelle, et
 * elle se réécrit d'elle-même au premier enregistrement qui suit une modification.
 */
const ALIAS_TEXTURE = {
  // #430 — « Encre sombre » a cédé la place à la nuit étoilée, qui tient le même rôle graphique :
  // un fond sombre, un lettrage clair. Les Bulles concernées changent d'aspect, et c'est le sens
  // même d'un remplacement.
  fondus: TEXTURE_NUIT,
};

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

// ── Les grains, et la façon dont une teinte les habille ─────────────────────────────────────────

/**
 * Un GRAIN est une image en niveaux de gris, carrelable, cuite par `tools/bake-textures.mjs` depuis
 * un jeu de cartes PBR. Cette constante en nomme le fichier, sans jamais le charger.
 *
 * ⚠️ CE MODULE NE CONNAÎT QUE DES NOMS, ET C'EST LA CONDITION DE SA PURETÉ. Charger une image est
 * asynchrone ; décider quoi peindre ne l'est pas. Une couche porte donc la CLÉ d'un grain, et c'est
 * `draw.js` qui la résout en motif — le même partage que partout ailleurs dans ce chantier.
 */
export const GRAIN_PAPIER = 'papier-froisse';
export const GRAIN_GLACE = 'glace';
export const GRAIN_LAVE = 'lave';
export const GRAIN_NUIT = 'nuit-etoile';

/**
 * Le gris qui ne change rien : un grain vaut 128 là où la matière est plate.
 *
 * ⚠️ CUIT DANS L'IMAGE PAR LE CUISEUR, qui centre son grain sur cette valeur après avoir soustrait
 * la moyenne du relief. Les deux nombres doivent rester d'accord, faute de quoi toutes les textures
 * s'assombriraient ou s'éclairciraient d'un bloc sans que rien ne le signale.
 */
export const GRAIN_NEUTRE = 128;

/**
 * De combien l'écart du grain se reporte sur la teinte. 1 = tel que cuit.
 *
 * ⚠️ « Force 1 me parait bien » — jugé à l'œil sur planche, après que le cuiseur a ramené toutes les
 * matières au même contraste local de 6,4. C'est justement parce que le grain arrive NORMALISÉ qu'un
 * facteur unique peut valoir pour toutes : avant normalisation, la même force donnait 6,43 sur un
 * papier froissé et 33,41 sur un papier lisse.
 */
export const FORCE_GRAIN = 1;

/**
 * De combien une valeur de grain décale les trois canaux d'une teinte. Fonction PURE, et c'est
 * elle qui définit le rendu d'une texture image.
 *
 * `rvb` est le triplet 0-255 de la teinte, tel que `rvbDeCouleur3D` le rend.
 *
 * ⚠️ NUMÉRIQUE ET NON EN CHAÎNES, PARCE QU'ELLE TOURNE 262 144 FOIS PAR TEINTE. Il a existé ici une
 * `teinteHabilleeDuGrain3D` qui prenait et rendait du `#rrggbb` : plus agréable à lire, mais aucun
 * appelant dans l'application, qui compose ses motifs pixel par pixel. Elle est partie plutôt que
 * d'entrer dans la liste d'attente de `tests/code-mort.test.mjs` — deux portes pour une règle,
 * dont une seule franchie, c'est une copie qui n'attend que de diverger. Les tests la recomposent
 * localement à partir d'ici.
 *
 * ⚠️ ADDITIF ET NON MULTIPLICATIF, ET C'EST UNE CORRECTION MESURÉE. Le premier mélange multipliait
 * la teinte par `grain / 128`. Deux défauts, tous deux constatés : le grain s'écrasait — contraste
 * 2,60 contre 6,03 au déplacement d'origine — et surtout le report cessait d'être le même sur les
 * trois canaux. Un canal déjà haut sature avant les autres, donc la TEINTE VIRE dans les clairs :
 * sur le parchemin #C9A779, le rouge plafonnait quand le bleu avait encore de la marge, et les
 * reliefs tournaient à l'orange.
 *
 * Reporter le MÊME écart sur les trois canaux conserve la distance entre eux, donc la teinte : un
 * pli éclaire ou assombrit le parchemin sans jamais le colorer.
 *
 * ⚠️ ET L'ÉCART EST BORNÉ AVANT D'ÊTRE APPLIQUÉ, PAS APRÈS — sans quoi le défaut revient par la
 * porte du bornage. Borner chaque canal à [0, 255] après coup fait saturer le canal le plus haut
 * AVANT les autres : sur le parchemin #C9A779 à grain 200, le rouge plafonne à 255 quand le vert
 * et le bleu ont encore de la marge, l'écart rouge-vert tombe de 34 à 16, et le relief tourne à
 * l'orange. C'est très exactement ce qu'on reprochait au mélange multiplicatif.
 *
 * On limite donc l'écart à ce que le canal le plus exposé peut encaisser. Le coût est réel et
 * assumé : sur une teinte très claire ou très sombre, le grain se COMPRIME au lieu de virer. Un
 * papier presque blanc ne montre plus que ses creux — ce qui, pour du relief, se défend.
 */
export function ecartDuGrain3D(rvb, valeurGrain){
  const brut = (Number(valeurGrain) - GRAIN_NEUTRE) * FORCE_GRAIN;
  if (!Number.isFinite(brut)) return 0;
  // Sans spread ni fermeture : cette fonction tourne une fois par pixel de chaque tuile.
  const marge = brut >= 0
    ? Math.min(255 - rvb[0], 255 - rvb[1], 255 - rvb[2])
    : Math.min(rvb[0], rvb[1], rvb[2]);
  return (brut >= 0 ? 1 : -1) * Math.min(Math.abs(brut), marge);
}

/** `#rgb` ou `#rrggbb` → `[r, v, b]`, ou `null` si on ne sait pas lire. Fonction PURE. */
export function rvbDeCouleur3D(couleur){
  return versRVB(couleur);
}

// ── Les textures ────────────────────────────────────────────────────────────────────────────────

/**
 * ⚠️ « ENCRE SOMBRE » A ÉTÉ RETIRÉE EN #430, ET CE N'EST PAS UN ÉLAGAGE MAIS UN REMPLACEMENT.
 *
 * Elle empilait quatorze copies rétrécies du contour, opaques jusqu'à 55 % du rayon puis s'éteignant
 * vers le bord : la masse d'encre du Lecteur omniscient, relevée sur planche et validée en #425b.
 * Le dispositif marchait ; c'est le RÉSULTAT qui ne satisfaisait pas à l'usage, et #430 existait
 * pour le revoir. Il a été tranché autrement — non pas en corrigeant le fondu, mais en lui
 * substituant trois matières photographiées, dont une nuit étoilée qui tient le même rôle
 * graphique : un fond sombre, un lettrage clair.
 *
 * Ce qui est perdu est nommé ici pour que la perte soit délibérée : le bord TRANSLUCIDE, qui
 * laissait voir la Case derrière la Bulle. Aucune des trois nouvelles ne le fait — elles sont
 * opaques. Si ce dispositif revient un jour, il reviendra comme un axe à lui, pas caché dans une
 * texture : c'est la leçon que #425n avait déjà tirée pour les taches.
 *
 * ⚠️ ET LA CLÉ `fondus` NE DISPARAÎT PAS, ELLE MIGRE. Voir `ALIAS_TEXTURE` plus bas. Le commentaire
 * qui vivait ici soutenait qu'une clé persistée ne se renomme pas, un registre levant sur
 * l'inconnu. C'était juste, et incomplet : il n'envisageait pas la table d'alias, qui est
 * précisément ce qui rend un renommage sûr.
 */

/**
 * Une matière photographiée, sans autre structure que son grain. La forme la plus simple du
 * contrat : une couche, le contour entier, la teinte habillée du grain.
 *
 * ⚠️ PAS DE LISERÉ NI DE COUCHE SUPPLÉMENTAIRE, ET C'EST DÉLIBÉRÉ. Le vieux papier en porte un
 * parce qu'un cartouche ancien se salit par les bords — c'est un fait observé sur planche, pas une
 * recette générale. De la glace, une coulée de lave ou un ciel n'ont aucune raison d'être plus
 * sombres au pourtour. Ajouter le liseré « pour faire pareil » aurait été décorer sans motif.
 */
const couchesDUneMatiere = (grain) => (o, ctx) => ({
  couches: [{ facteur: null, motif: grain, couleur: ctx.couleur, alpha: ctx.opacite }],
});

/**
 * Le vieux papier : un grain photographié, teinté, avec un pourtour plus sale que son cœur.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * ⚠️ LES AURÉOLES PROCÉDURALES ONT ÉTÉ RETIRÉES EN #431b3, ET POUR DEUX RAISONS CUMULÉES
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Cette texture posait 22 auréoles, chacune faite de 4 disques concentriques pour lui donner un
 * bord doux. Elles avaient un sens tant que le remplissage était entièrement dessiné : sans elles,
 * un cartouche n'était qu'un aplat un peu marbré.
 *
 * Un grain PHOTOGRAPHIÉ rend ce travail inutile — la matière est dans l'image — et signalé à
 * l'usage, l'empilement des deux chargeait le rendu.
 *
 * ⚠️ ET SURTOUT ELLES FAISAIENT DOUBLON AVEC UN AXE DÉJÀ TRANCHÉ. #425n a décidé que les taches
 * relevaient de l'axe PARTICULE, que #425p a construit : l'utilisateur y choisit « tache »,
 * « flamme » ou « aucune ». Garder des auréoles cachées dans le remplissage, c'était une seconde
 * source de taches que personne ne commandait — deux commandes pour un même effet, qui finissent
 * toujours par se contredire. Qui veut des auréoles les demande maintenant par la fiche.
 *
 * Avec elles part tout l'axe `taches` du contrat, qu'aucune texture ne peuplait plus.
 */
function couchesPapier(o, ctx){
  const graine = graineDeLObjet(o);
  // ⚠️ LE BORD EST PLUS SALE QUE LE CŒUR, et c'est ce qui reste du relevé de La Licorne : le
  // pourtour d'un cartouche y est nettement plus brun que son milieu. Deux couches suffisent — le
  // contour entier dans une teinte terre, puis la couleur choisie ramenée un peu vers le centre.
  // Il en reste un liseré sale tout autour.
  //
  // ⚠️ LES DEUX COUCHES PORTENT LE GRAIN, PAS SEULEMENT CELLE DU CŒUR. Le liseré sale fait deux à
  // trois pixels de large : laissé en aplat sous un cœur grainé, il se lit comme un jonc de
  // plastique posé autour du papier. Le motif étant carrelé dans le repère de la page, il traverse
  // la frontière des deux couches sans raccord visible.
  const couches = [
    { facteur: null, motif: GRAIN_PAPIER, couleur: teinte(ctx.couleur, -0.42), alpha: ctx.opacite },
    { facteur: (t) => 0.88 + bruitCyclique(graine, t, 4242, 5) * 0.06,
      motif: GRAIN_PAPIER, couleur: ctx.couleur, alpha: ctx.opacite },
  ];
  return { couches };
}

const REGISTRE = {
  [TEXTURE_AUCUNE]: {
    // Une seule couche, le contour tel quel : exactement le remplissage d'avant cette étape.
    rendu: (o, ctx) => ({ couches: [{ facteur: null, couleur: ctx.couleur, alpha: ctx.opacite }] }),
    // Aucune suggestion : le sélecteur commande seul, sur un blanc par défaut.
    teinteParDefaut: null,
    couleurTexteParDefaut: null,
  },
  /**
   * ⚠️ LES TROIS TEINTES SONT RELEVÉES PAR LE CUISEUR, PAS CHOISIES. Chacune est la moyenne de
   * l'albédo de sa matière : la couleur qu'elle a vraiment. Pour la nuit étoilée, qui est une
   * IMAGE et non une matière, c'est la moyenne de l'image elle-même.
   *
   * ⚠️ ET AUCUNE N'IMPOSE SA COULEUR. C'est la conséquence directe de ce qui a été décidé en #431b
   * pour le parchemin : un grain photographié est monochrome, la matière vit dans le relief, donc
   * la couleur reste libre. Une lave bleue est une décision de l'utilisateur, pas un accident.
   */
  [TEXTURE_GLACE]: {
    rendu: couchesDUneMatiere(GRAIN_GLACE),
    teinteParDefaut: '#627B70',
    // ⚠️ BLANC, ET C'EST UN RETOUR D'USAGE. Un lettrage sombre passait sous les craquelures, qui
    // sont presque noires : le texte s'y perdait par endroits. Le blanc tient sur toute la surface.
    // Le vrai remède est un CONTOUR de texte, mais c'est #432 — pas une raison de laisser celle-ci
    // difficile à lire en attendant.
    couleurTexteParDefaut: '#FFFFFF',
  },
  [TEXTURE_LAVE]: {
    rendu: couchesDUneMatiere(GRAIN_LAVE),
    teinteParDefaut: '#AC452F',
    couleurTexteParDefaut: '#FFFFFF',
  },
  [TEXTURE_NUIT]: {
    rendu: couchesDUneMatiere(GRAIN_NUIT),
    teinteParDefaut: '#1D242A',
    couleurTexteParDefaut: '#FFFFFF',
  },
  [TEXTURE_PAPIER]: {
    rendu: couchesPapier,
    /**
     * ⚠️ IMPOSÉE → SUGGÉRÉE, ET C'EST UN CHANGEMENT DÉLIBÉRÉ DE COMPORTEMENT. Cette entrée imposait
     * `#E3D2A8` et masquait le sélecteur, parce qu'un parchemin dessiné à la main n'est pas « une
     * couleur au choix, un peu tachée ». Un grain PHOTOGRAPHIÉ renverse l'argument : la matière
     * tient désormais dans le relief, qui est monochrome, et la couleur redevient libre sans que le
     * papier cesse d'être du papier. C'est la raison pour laquelle on cuit un grain en niveaux de
     * gris plutôt que de stocker l'image en couleur.
     *
     * ⚠️ ET UNE BULLE DÉJÀ DESSINÉE PEUT CHANGER D'ASPECT. `bulleColor` n'est écrit que si
     * l'utilisateur touche au sélecteur : une Bulle qui n'a jamais eu de couleur garde donc son
     * parchemin, à la teinte près. Mais une Bulle à qui une couleur avait été donnée AVANT le choix
     * du papier portait cette valeur en dormance, masquée par la couleur imposée — elle va
     * maintenant la reprendre. C'est la seconde entorse assumée à « pas de réglage vaut l'existant »
     * après #429, et elle est le prix exact de ce qui a été demandé : que le sélecteur redevienne
     * actif. Le cas contraire — garder la couleur imposée — rendrait le sélecteur visible et
     * inopérant, ce que ce chantier refuse depuis #425m.
     *
     * ⚠️ ET LE MÉCANISME LUI-MÊME A DISPARU EN #430. Le parchemin fut la dernière texture à imposer
     * sa couleur ; « Encre sombre » l'a suivi, remplacé par des matières photographiées. Plus
     * aucune n'imposait rien : `couleurImposee` était devenu un champ toujours nul, et le sélecteur
     * ne se masquait plus jamais. Une machinerie qu'aucun cas n'emprunte n'est pas une réserve pour
     * l'avenir, c'est du code mort qui a l'air vivant. Il ne reste qu'un concept, la teinte
     * SUGGÉRÉE, et le sélecteur commande toujours.
     */
    // ⚠️ RELEVÉE PAR LE CUISEUR, PAS CHOISIE. C'est la moyenne de l'albédo de Paper005 : la couleur
    // qu'a vraiment ce papier-là, telle que `npm run bake-textures -- papier-froisse` la rapporte.
    // Je l'avais d'abord écrite de mémoire, à une unité près par canal, avant la première cuisson
    // réelle — invisible à l'œil, mais c'était une valeur inventée là où une valeur mesurée existe.
    teinteParDefaut: '#C8A678',
    couleurTexteParDefaut: '#3A2B18',
  },
};

/**
 * Les champs qu'un changement de texture REND à la nouvelle matière.
 *
 * ⚠️ CHANGER DE TEXTURE EFFACE DEUX CHOIX EXPLICITES, ET C'EST UNE DÉCISION, PAS UN EFFET DE BORD.
 * La règle ordinaire est « choisi > suggéré » : une couleur donnée à la main survit à tout. Le
 * changement de texture en est la seule exception, demandée à l'usage, et pour une raison nette —
 * sans elle, passer du parchemin à la lave garderait l'ocre, et il faudrait rouvrir le sélecteur
 * pour découvrir à quoi la lave ressemble. On choisit une matière pour la voir.
 *
 * ⚠️ LA COULEUR DU TEXTE SUIT, ET CE N'EST PAS UNE EXTENSION GRATUITE. Elle a le même dispositif de
 * défaut par texture, et le laisser en arrière produirait exactement le défaut que #430 vient de
 * corriger pour la glace : un lettrage sombre choisi sur du parchemin resterait sur une nuit
 * étoilée, donc noir sur noir. Effacer l'un sans l'autre rendrait la Bulle illisible par un geste
 * qui ne portait pas sur le texte.
 *
 * ⚠️ CE QUI REND CETTE DESTRUCTION ACCEPTABLE est qu'elle est ANNULABLE : le gestionnaire prend un
 * instantané avant de toucher quoi que ce soit. C'est la seule chose qui distingue « rendre la main
 * à la matière » de « perdre son travail ».
 */
export const CHAMPS_RENDUS_PAR_LA_TEXTURE = ['bulleColor', 'bulleTextColor'];

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
  // ⚠️ L'ALIAS PASSE AVANT LE REFUS, ET APRÈS LE DÉFAUT. Avant, sinon une clé renommée lèverait
  // comme une clé inventée — or ce n'est pas la même faute : l'une est un Projet d'hier, l'autre un
  // fichier abîmé. Après le défaut, parce qu'un champ absent n'est pas une valeur à migrer.
  if (Object.prototype.hasOwnProperty.call(ALIAS_TEXTURE, v)) return ALIAS_TEXTURE[v];
  if (!Object.prototype.hasOwnProperty.call(REGISTRE, v)) {
    throw new Error(`Texture de Bulle inconnue : « ${v} ». Textures enregistrées : ${texturesConnues().join(', ')}.`);
  }
  return v;
}

/** La couleur de texte qu'une texture suggère À DÉFAUT, ou `null`. Fonction PURE. */
export function couleurTexteParDefautDeLaTexture(o){
  return REGISTRE[textureDeLaBulle(o)].couleurTexteParDefaut;
}

/**
 * La teinte qu'une texture SUGGÈRE, ou `null`. Fonction PURE.
 *
 * ⚠️ SUGGÉRER N'EST PAS IMPOSER, ET LES DEUX NE DOIVENT PAS SE CONFONDRE. Une couleur imposée
 * MASQUE le sélecteur ; une teinte suggérée le laisse visible et ne sert que tant que l'utilisateur
 * n'a rien choisi. Les fondre en un seul champ rendrait indicible la différence entre « cette
 * texture ne se colore pas » et « cette texture a une couleur d'origine ».
 */
export function teinteParDefautDeLaTexture(o){
  return REGISTRE[textureDeLaBulle(o)].teinteParDefaut;
}

/**
 * La couleur de fond d'une Bulle, toutes règles appliquées. Fonction PURE.
 *
 * ⚠️ L'ORDRE DES TROIS TERMES EST LA RÈGLE ELLE-MÊME. Une couleur IMPOSÉE passe avant tout, y
 * compris avant un choix de l'utilisateur, parce que son sélecteur est masqué : le laisser gagner
 * donnerait une tache d'encre rose sans qu'aucune commande visible ne l'explique. Le CHOIX vient
 * ensuite, sinon le sélecteur serait décoratif. La SUGGESTION ferme la marche : c'est ce qu'on voit
 * tant qu'on n'a rien demandé.
 *
 * ⚠️ CETTE DÉCISION VIVAIT DANS `draw.js`, où elle n'était pas testable. Elle n'y avait que deux
 * termes ; en ajouter un troisième dans un fichier de dessin aurait été le troisième endroit du
 * dépôt où une règle de couleur se serait écrite à la main.
 */
export function couleurDeFondDeLaBulle3D(o){
  return (o && o.bulleColor) || teinteParDefautDeLaTexture(o) || '#fff';
}

/**
 * Les grains que l'application doit précharger, déduits du registre. Fonction PURE.
 *
 * ⚠️ DÉDUITE, JAMAIS ÉCRITE À LA MAIN. Une liste de préchargement tenue en parallèle du registre
 * est une énumération qui se périme : on ajoute une texture, on oublie la liste, et le grain
 * manque au premier dessin — sans rien dire, puisqu'une couleur de repli existe. Ce dépôt a déjà
 * payé ce défaut plusieurs fois.
 *
 * On interroge donc chaque texture avec un contexte factice, et on récolte les `motif` rencontrés.
 *
 * ⚠️ LES CLÉS SE PASSENT EN PARAMÈTRE, ET CE N'EST PAS UNE COMMODITÉ DE TEST. Sans ce paramètre,
 * aucune assertion ne pouvait distinguer cette dérivation d'un `return ['papier-froisse']` écrit
 * en dur : avec un seul grain au registre, les deux rendent la même chose AUJOURD'HUI. En pouvant
 * demander les grains d'un SOUS-ENSEMBLE, on interroge la propriété qui distingue vraiment les
 * deux — une texture sans grain doit rendre une liste vide.
 */
export function grainsAPrecharger3D(cles = texturesConnues()){
  const vus = new Set();
  for (const cle of cles) {
    const { couches } = couchesDeTextureBulle({ bulleTexture: cle }, { couleur: '#808080', opacite: 1 });
    for (const couche of couches) if (couche.motif) vus.add(couche.motif);
  }
  return [...vus];
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
