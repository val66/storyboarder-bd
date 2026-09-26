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

/**
 * Fusionne des lobes en un groupe. Fonction PURE : elle rend de NOUVEAUX objets.
 *
 * ⚠️ LA MÉMOIRE SE PREND AVANT L'ÉCRASEMENT, ET LA PLUS ANCIENNE GAGNE. Un lobe déjà fusionné
 * porte l'instantané de SA première fusion : le garder fait que « séparer » ramène à l'état
 * d'origine, et non à l'apparence du groupe précédent. Autrement, une chaîne de trois fusions
 * demanderait trois séparations pour revenir au point de départ, ce qu'aucune interface n'annonce.
 *
 * ⚠️ ET `source` N'EST PAS FORCÉMENT DANS `lobes` — c'est même le cas courant. La Bulle qui impose
 * son style est celle qu'on tient en main ; elle peut appartenir à l'un des groupes qu'on réunit,
 * ou n'être qu'un lobe parmi d'autres. On lit son apparence sans se demander d'où elle vient.
 */
export function fusionner3D(lobes, source, idGroupe){
  const transport = champsTransportesParLaFusion3D(source);
  return lobes.map(lobe => {
    const fusionne = Object.assign(
      {},
      lobe,
      { bulleAvantFusion: lobe.bulleAvantFusion || instantaneDeFusion3D(lobe) },
      transport,
      { bulleGroupe: idGroupe },
    );
    // ⚠️ L'ABSENCE DE RÉGLAGE EST ELLE AUSSI UN RÉGLAGE, ET ELLE SE TRANSPORTE. Un champ que la
    // source ne porte PAS ne figure pas dans `transport`, et le champ de l'autre lobe survivait
    // alors intact : fusionner une Bulle laissée au fond par défaut avec une Bulle bleue donnait
    // un lobe blanc et un lobe bleu, pour un geste dont tout annonçait le contraire. Le tort est
    // invisible tant que la source a une valeur pour tout, donc invisible la plupart du temps.
    for (const cle of Object.keys(champsTransportesParLaFusion3D(lobe))) {
      if (!(cle in transport)) delete fusionne[cle];
    }
    return fusionne;
  });
}

/**
 * La clé d'une paire, indépendante de l'ordre. Fonction PURE.
 *
 * ⚠️ TRIÉE, SANS QUOI LE REFUS NE SE RETROUVE PAS. On refuse en glissant A sur B, et la fois
 * suivante on glisse B sur A : sans tri, ce serait deux paires différentes et la question
 * reviendrait alors même qu'on vient d'y répondre.
 */
export function clePaire3D(a, b){
  return [String(a && a.id), String(b && b.id)].sort().join('|');
}

/**
 * La Bulle que `o` s'apprête à rejoindre, ou `null`. Fonction PURE.
 *
 * ⚠️ ON REND LA PREMIÈRE TROUVÉE, ET C'EST UN CHOIX. Une Bulle lâchée au milieu de trois autres
 * pourrait en toucher plusieurs ; poser trois confirmations d'affilée serait insupportable, et en
 * choisir une « au mieux » demanderait un critère que rien ne fonde. La première venue est
 * arbitraire mais PRÉVISIBLE — l'ordre de la planche —, et il reste à l'utilisateur de refaire le
 * geste pour la suivante.
 *
 * ⚠️ ET LES REFUS SONT ÉCARTÉS ICI, PAS AU MOMENT DE DEMANDER. Les écarter plus tard ferait
 * clignoter l'aperçu sur une paire dont on sait déjà qu'on ne demandera rien.
 */
export function candidateDeFusion3D(o, objets, refusees){
  if (!o || !Array.isArray(objets)) return null;
  for (const autre of objets) {
    // ⚠️ LE TYPE SE VÉRIFIE ICI, PAS AILLEURS. `fusionPossible3D` refuserait un Personnage parce
    // qu'il ne porte pas la case — donc pour la mauvaise raison, et seulement par chance. La
    // géométrie des Bulles serait pourtant interrogée au passage, sur un objet qui n'en a pas.
    //
    // ⚠️ EN REVANCHE « PAS SOI-MÊME » A QUITTÉ CETTE LIGNE. `fusionPossible3D` le dit déjà, et
    // le redire ici faisait survivre une mutation : deux gardes pour une condition, dont aucune
    // n'était éprouvée seule. Même verdict qu'au test des centres de #426a.
    if (!autre || autre.type !== 'bulle') continue;
    if (refusees && refusees.has(clePaire3D(o, autre))) continue;
    if (fusionPossible3D(o, autre).possible) return autre;
  }
  return null;
}

/**
 * Les clés de refus à OUBLIER, parce que les deux Bulles ne se touchent plus. Fonction PURE.
 *
 * ⚠️ SANS CET OUBLI, UN REFUS SERAIT DÉFINITIF. Deux Bulles refusées une fois ne pourraient plus
 * jamais fusionner, et rien à l'écran n'expliquerait pourquoi — la case resterait cochée des deux
 * côtés, les contours se toucheraient, et il ne se passerait rien. C'est le symétrique exact de la
 * mémoire : l'une empêche la question de revenir à chaque mouvement, l'autre l'empêche de
 * disparaître pour toujours.
 */
export function refusPerimes3D(refusees, objets){
  const out = [];
  if (!refusees) return out;
  const parId = new Map();
  for (const o of objets || []) if (o && o.type === 'bulle') parId.set(String(o.id), o);
  for (const cle of refusees) {
    const [ida, idb] = String(cle).split('|');
    const a = parId.get(ida), b = parId.get(idb);
    if (!a || !b || !bullesEnContact3D(a, b)) out.push(cle);
  }
  return out;
}

/**
 * Défait une fusion : chaque lobe redevient ce qu'il était. Fonction PURE.
 *
 * ⚠️ ON EFFACE TOUS LES CHAMPS GRAPHIQUES AVANT DE RENDRE LA MÉMOIRE, et non l'inverse. Un simple
 * `Object.assign(lobe, memoire)` laisserait en place les axes réglés APRÈS la fusion : une Bulle à
 * qui on a donné une texture une fois fusionnée la garderait en se séparant, alors que la mémoire
 * ne la mentionne pas. « Séparer » veut dire revenir à AVANT, pas « repeindre par-dessus ».
 *
 * ⚠️ ET LA GÉOMÉTRIE NE BOUGE PAS. L'instantané n'en contient aucune — voir `instantaneDeFusion3D`
 * — précisément pour que les lobes restent là où l'utilisateur les a laissés. Séparer un groupe
 * qu'on a déplacé ne doit pas le renvoyer à sa position d'il y a dix minutes.
 *
 * ⚠️ UN LOBE SANS MÉMOIRE SE CONTENTE DE QUITTER SON GROUPE. Le cas existe : un fichier de Projet
 * édité à la main, ou une version future qui poserait un groupe autrement. Effacer son apparence
 * sans rien avoir à remettre le laisserait nu, ce qui serait pire que de ne rien défaire.
 */
export function separer3D(lobes){
  return (lobes || []).map(lobe => {
    const memoire = lobe && lobe.bulleAvantFusion;
    const out = Object.assign({}, lobe);
    if (memoire) {
      for (const cle of Object.keys(champsTransportesParLaFusion3D(lobe))) delete out[cle];
      Object.assign(out, memoire);
    }
    delete out.bulleGroupe;
    delete out.bulleAvantFusion;
    return out;
  });
}
