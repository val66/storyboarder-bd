/**
 * @file src/bubble-merge.js — la FUSION de deux Bulles. Fonctions PURES.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * CE QU'EST UNE BULLE FUSIONNÉE
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Deux Bulles qui se touchent peuvent n'en former qu'une : un contour unique dont la frontière
 * interne a disparu, et autant de zones de texte que de LOBES. C'est le dispositif classique du
 * dialogue continu — un même personnage qui enchaîne deux répliques sans qu'on redessine une queue.
 *
 * ⚠️ UN GROUPE PORTE N LOBES, PAS UNE PAIRE, ET C'EST UNE DÉCISION PRISE AVANT D'EN AVOIR BESOIN.
 * Rien n'interdit qu'une troisième Bulle rejoigne un groupe déjà formé, et un modèle à deux devrait
 * alors être réécrit — geste, rendu, fiche et persistance compris. La liste ne coûte rien
 * aujourd'hui ; la paire coûterait tout demain.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * ⚠️ LES TROIS CONDITIONS SONT CUMULATIVES, ET LA DEUXIÈME EST LA PLUS IMPORTANTE
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Il faut que les contours se touchent, que les DEUX Bulles soient déclarées fusionnables, et
 * qu'aucune ne soit déjà prise dans un autre groupe.
 *
 * La case est décochée par défaut, et c'est ce qui protège l'existant. Des Bulles se chevauchent
 * dans presque toutes les planches — c'est même la façon ordinaire de serrer un dialogue — et une
 * fusion automatique les aurait toutes soudées à l'ouverture du Projet. « Pas de réglage vaut
 * l'existant » l'interdit, et ici le réglage doit être demandé DEUX fois : par chacune des Bulles.
 */
import { pointDuContourBulle } from './bubble-shape.js';

/** Le défaut de l'axe FUSION. Décoché : une Bulle ne fusionne que si on le lui demande. */
export const FUSIONNABLE_DEFAUT = false;

/**
 * Combien de points on échantillonne sur un contour pour chercher le contact.
 *
 * ⚠️ C'EST UNE RÉSOLUTION, DONC UNE LIMITE ASSUMÉE. Deux formes qui ne se recouvriraient que par un
 * éclat plus fin que l'écart entre deux échantillons passeraient inaperçues. 96 est le nombre que
 * `draw.js` emploie déjà pour approcher un contour texturé : au-delà, on paierait des calculs pour
 * une précision qu'aucun geste de souris ne produit.
 */
export const ECHANTILLONS_CONTACT = 96;

/**
 * Une Bulle accepte-t-elle de fusionner ? Fonction PURE.
 *
 * ⚠️ LE DÉFAUT EST RENDU PAR LA CONSTANTE, PAS RÉÉCRIT ICI. Un `!!(o && o.bulleFusionnable)` aurait
 * donné le même résultat aujourd'hui tout en laissant `FUSIONNABLE_DEFAUT` décoratif : deux endroits
 * diraient le défaut, un seul le ferait. Le jour où l'on voudrait changer d'avis, la constante
 * mentirait sans qu'aucun test ne bronche — c'est la « seconde source » que ce dépôt traque.
 */
export function bulleEstFusionnable3D(o){
  const v = o && o.bulleFusionnable;
  if (v == null) return FUSIONNABLE_DEFAUT;
  return !!v;
}

/**
 * Le point `(x, y)` est-il DANS cette Bulle ? Fonction PURE, et EXACTE.
 *
 * ⚠️ ELLE N'EST EXACTE QUE PARCE QUE TOUTE FORME DU REGISTRE EST ÉTOILÉE par rapport à son centre —
 * une propriété que #425e a figée et dont #425k dépend déjà pour garder les taches à l'intérieur.
 * Un contour étoilé se laisse interroger dans une DIRECTION : on demande où il passe dans celle du
 * point, et on compare les distances. Aucun parcours de segments, aucune règle de parité.
 *
 * Le jour où une forme cesserait d'être étoilée — une bande en U, par exemple —, cette fonction
 * deviendrait fausse en silence. C'est la raison pour laquelle le contrat des formes l'exige.
 */
export function pointDansLaBulle3D(o, x, y){
  const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
  const dx = x - cx, dy = y - cy;
  if (dx === 0 && dy === 0) return true;
  const bord = pointDuContourBulle(o, Math.atan2(dy, dx));
  // Comparaison au CARRÉ : une racine de plus par échantillon, et elle ne changerait aucun verdict.
  const d2 = dx * dx + dy * dy;
  const b2 = (bord.x - cx) * (bord.x - cx) + (bord.y - cy) * (bord.y - cy);
  return d2 <= b2;
}

/**
 * Les deux contours se touchent-ils ? Fonction PURE.
 *
 * ⚠️ SUR LES CONTOURS RÉELS, PAS SUR LES BOÎTES ENGLOBANTES. Une étoile, un écu et une couronne
 * d'épines occupent une fraction de leur boîte : deux étoiles peuvent avoir des boîtes qui se
 * croisent alors qu'un vide franc les sépare à l'écran. Fusionner là serait incompréhensible.
 * C'est le même piège que l'encart inscriptible de #425e, où l'ovale déclare sa boîte ENTIÈRE.
 *
 * ⚠️ ET ON TESTE LES DEUX SENS, PARCE QU'UN SEUL NE SUFFIT PAS. Si A est entièrement CONTENUE dans
 * B, tous les points du contour de A sont dans B et le premier sens tranche. Mais si c'est B qui
 * est contenue dans A, aucun point de A n'est dans B : seul le second sens la voit. Une Bulle posée
 * au milieu d'une autre est pourtant le cas le plus évident à l'œil.
 *
 * ⚠️ J'AVAIS AJOUTÉ EN PLUS UN TEST DES CENTRES, ET IL ÉTAIT DÉMONTRABLEMENT MORT. Deux mutations
 * ont survécu en se masquant l'une l'autre : retirer un sens de boucle passait parce que les
 * centres rattrapaient, retirer les centres passait parce que la boucle rattrapait. Le code était
 * donc redondant, pas protégé.
 *
 * La démonstration tient en une ligne : si une forme en contient une autre, elle contient AUSSI
 * tout son contour — donc n'importe lequel des échantillons suffit, et le centre n'apprend rien de
 * plus. Le code est parti plutôt que de contrefaire un témoin pour le justifier, comme M152 en
 * #422g. Une redondance qui fait survivre des mutations n'est pas une ceinture de sécurité : c'est
 * deux mécanismes dont aucun n'est éprouvé.
 */
export function bullesEnContact3D(a, b, echantillons = ECHANTILLONS_CONTACT){
  if (!a || !b) return false;
  for (let i = 0; i < echantillons; i++) {
    const theta = (Math.PI * 2 * i) / echantillons;
    const pa = pointDuContourBulle(a, theta);
    if (pointDansLaBulle3D(b, pa.x, pa.y)) return true;
    const pb = pointDuContourBulle(b, theta);
    if (pointDansLaBulle3D(a, pb.x, pb.y)) return true;
  }
  return false;
}

/** L'identifiant du groupe d'une Bulle, ou `null` si elle est seule. Fonction PURE. */
export function groupeDeLaBulle3D(o){
  return (o && o.bulleGroupe) || null;
}

/**
 * Deux Bulles peuvent-elles fusionner, et sinon POURQUOI. Fonction PURE.
 *
 * ⚠️ LA RAISON EST RENDUE, PAS SEULEMENT LE VERDICT. Un booléen suffirait au geste, mais pas à
 * l'utilisateur : « rien ne se passe quand je les rapproche » est une question qu'on ne peut pas
 * résoudre sans savoir LAQUELLE des trois conditions manque. La fiche pourra le dire.
 */
export function fusionPossible3D(a, b){
  if (!a || !b || a === b || a.id === b.id) return { possible: false, raison: 'meme' };
  if (!bulleEstFusionnable3D(a) || !bulleEstFusionnable3D(b)) {
    return { possible: false, raison: 'non-fusionnable' };
  }
  if (groupeDeLaBulle3D(a) && groupeDeLaBulle3D(a) === groupeDeLaBulle3D(b)) {
    return { possible: false, raison: 'deja-fusionnees' };
  }
  if (!bullesEnContact3D(a, b)) return { possible: false, raison: 'sans-contact' };
  return { possible: true, raison: null };
}

/**
 * Les champs qui appartiennent au LOBE et ne se transportent jamais.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * ⚠️ PAR EXCLUSION, ET NON PAR ÉNUMÉRATION — C'EST LA DÉCISION CENTRALE DE CE FICHIER
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * La tentation est d'énumérer ce que la fusion TRANSPORTE : forme, couleur, bordure, texture,
 * particule, police, contour du texte… Cette liste-là s'allonge à chaque axe ajouté, et elle se
 * périme en SILENCE : un axe oublié ne se transporterait pas, la Bulle fusionnée garderait deux
 * apparences par endroits, et rien ne dirait pourquoi. Ce chantier a ajouté SEPT axes en quelques
 * tâches — une énumération aurait déjà divergé.
 *
 * Ce qui reste propre au lobe, en revanche, est STABLE et petit : son identité, sa géométrie, son
 * texte, et les champs de la fusion elle-même. Aucun axe graphique n'y entrera jamais, puisque tout
 * axe graphique est précisément ce qui doit se transporter.
 *
 * ⚠️ `description` EST PROPRE AU LOBE, et c'est tout le sens de « deux zones de texte au lieu
 * d'une ». Une fusion unifie l'apparence, jamais la parole : c'est la seule chose que les deux
 * Bulles avaient à dire séparément.
 */
export const CHAMPS_PROPRES_AU_LOBE = [
  'id', 'type', 'x', 'y', 'w', 'h', 'z',
  'description',
  'bulleGroupe', 'bulleFusionnable', 'bulleAvantFusion',
];

/**
 * Ce que la Bulle qui IMPOSE son style donne à l'autre. Fonction PURE.
 *
 * ⚠️ C'EST LA SÉLECTIONNÉE QUI IMPOSE, PAS CELLE DE DEVANT. Demandé à l'usage, et c'est le choix
 * qui se devine : la Bulle qu'on tient en main est celle qu'on regarde, donc celle dont on attend
 * l'apparence. L'ordre d'affichage continue de décider qui sert de support au groupe — ce sont
 * deux questions distinctes, et les confondre donnerait un résultat dépendant d'un `z` que
 * l'utilisateur ne voit pas.
 */
export function champsTransportesParLaFusion3D(source){
  const out = {};
  for (const cle of Object.keys(source || {})) {
    if (!CHAMPS_PROPRES_AU_LOBE.includes(cle)) out[cle] = source[cle];
  }
  return out;
}

/**
 * L'instantané qu'un lobe garde pour pouvoir redevenir lui-même. Fonction PURE.
 *
 * ⚠️ PRIS À LA FUSION, JAMAIS REMIS À JOUR. « Séparer » veut dire « revenir à avant la fusion » :
 * si on modifie la Bulle fusionnée puis qu'on sépare, ces modifications sont perdues. C'est la
 * seule lecture qui reste vraie quoi qu'il arrive, et elle fait coïncider le bouton de la fiche
 * avec Ctrl+Z — sans quoi le même mot désignerait deux résultats différents selon le chemin pris.
 *
 * ⚠️ ET IL NE MÉMORISE QUE CE QUE LA FUSION VA ÉCRASER. Garder le lobe entier serait plus simple et
 * faux : la géométrie change après la fusion — on déplace le groupe —, et la rendre au moment de la
 * séparation ferait SAUTER les lobes à leur position d'il y a dix minutes.
 */
export function instantaneDeFusion3D(lobe){
  return champsTransportesParLaFusion3D(lobe);
}
