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

/**
 * Combien de fois la recherche coupe l'intervalle en deux. Chaque pas divise par deux la distance
 * restante : à 14 pas, la butée est posée à moins d'un millième de la longueur du glissement, soit
 * une fraction de pixel pour tout geste réel. Le coût est de 14 essais de contact par mouvement de
 * souris, et seulement lorsque la position demandée est REFUSÉE — un glissement qui reste au
 * contact n'en paie aucun.
 */
export const PAS_DE_DICHOTOMIE_CONTACT = 14;

/**
 * Ce lobe touche-t-il au moins un de ses voisins ? Fonction PURE.
 *
 * ⚠️ « AU MOINS UN », ET NON « LE GROUPE RESTE D'UN SEUL TENANT ». Tranché par l'utilisateur. La
 * règle plus stricte — aucun lobe ne coupe la chaîne, même indirectement — interdirait d'écarter le
 * lobe du MILIEU d'un chapelet de trois, ce qui est un geste légitime tant que les deux bouts se
 * rejoignent autrement. Celle-ci autorise en échange qu'un groupe se range en deux paquets qui se
 * touchent chacun de leur côté ; ils restent un seul groupe, et « Séparer » les défait toujours.
 */
/**
 * Les points où les deux contours SE CROISENT, et la largeur de l'étranglement qu'ils forment.
 * Fonction PURE. Rend `0` si les contours ne se croisent pas, `Infinity` si l'un est entièrement
 * dans l'autre.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * DEUX INSTRUMENTS FAUX AVANT CELUI-CI, ET LA MÊME ERREUR LES DEUX FOIS
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Le premier comptait les points du contour de l'un tombant dans l'autre. Une mesure que la
 * DENSITÉ D'ÉCHANTILLONNAGE gouverne autant que la géométrie : les points d'une ellipse sont
 * serrés au bout du grand axe et clairsemés sur le flanc, si bien qu'un même seuil valait 4,75 px
 * de chevauchement horizontalement, ZÉRO verticalement, et 42 px pour une étoile.
 *
 * Le second — le mien aussi — interrogeait les deux contours le long de la DROITE DES CENTRES, et
 * additionnait les deux rayons moins l'écart. Une seule mesure, sur un seul axe : juste tant que
 * les Bulles sont posées côte à côte, aveugle dès qu'elles sont décalées en diagonale ou que la
 * forme présente un creux dans cette direction précise. J'avais remplacé un instrument biaisé par
 * un instrument borgne, et l'utilisateur a vu que c'était pire.
 *
 * Les deux fois, j'ai mesuré une grandeur COMMODE au lieu de celle qui se voit. Ce qui se voit,
 * c'est que les deux contours SE COUPENT en deux points et que la distance entre ces deux points
 * est la largeur de la taille. C'est cela, et rien d'autre, qu'il fallait calculer.
 *
 * ⚠️ LES CROISEMENTS SE TROUVENT PAR CHANGEMENT DE CÔTÉ, PAS PAR RÉSOLUTION D'ÉQUATION. On parcourt
 * le contour de A et on note où l'on entre dans B et où l'on en sort. Chaque changement est encadré
 * par deux échantillons voisins, et une dichotomie sur l'angle le resserre jusqu'au sous-pixel.
 * C'est exact pour toute forme du registre, sans une ligne par forme — et le prix est de N tests
 * d'appartenance, que l'ancienne version payait déjà.
 */
export function largeurDeSoudure3D(a, b, echantillons = ECHANTILLONS_CONTACT){
  if (!a || !b) return 0;
  const pas = (Math.PI * 2) / echantillons;

  // ⚠️ ON PARCOURT LES DEUX CONTOURS, PAS SEULEMENT LE PREMIER. Les pointes d'une couronne d'épines
  // sont plus fines que le pas d'échantillonnage : marcher le contour de A y rate des croisements
  // que marcher celui de B trouve, et réciproquement. Avec un seul parcours, la même paire de
  // Bulles mesurait 59,8 px dans un sens et 43,3 px dans l'autre — donc se soudait ou non selon
  // lequel des deux lobes on déplaçait. Réunir les deux parcours rend la mesure symétrique par
  // construction, et non par espoir.
  const croisementsDe = (un, autre) => {
    const surUn = (t) => pointDuContourBulle(un, t);
    const dedans = [];
    for (let i = 0; i < echantillons; i++) {
      const p = surUn(pas * i);
      dedans.push(pointDansLaBulle3D(autre, p.x, p.y));
    }
    if (dedans.every(v => !v)) return { points: [], tousDedans: false };
    if (dedans.every(v => v)) return { points: [], tousDedans: true };

    // ⚠️ LA DICHOTOMIE RESTE ENTRE LES DEUX ÉCHANTILLONS VOISINS, jamais au-delà. Une première
    // version ramenait les bornes dans [0, 2π[ puis ajoutait un tour quand elles semblaient
    // inversées : pour une SORTIE, cela faisait parcourir tout le reste du cercle au lieu du petit
    // intervalle, et les deux croisements convergeaient vers le même point — la taille mesurée
    // valait 0,1 px pour deux Bulles enfoncées de 60 px l'une dans l'autre.
    const points = [];
    for (let i = 0; i < echantillons; i++) {
      if (dedans[i] === dedans[(i + 1) % echantillons]) continue;
      let bas = pas * i, haut = pas * (i + 1);
      const dedansEnBas = dedans[i];
      for (let k = 0; k < 12; k++) {
        const m = (bas + haut) / 2;
        const p = surUn(m % (Math.PI * 2));
        if (pointDansLaBulle3D(autre, p.x, p.y) === dedansEnBas) bas = m; else haut = m;
      }
      points.push(surUn(((bas + haut) / 2) % (Math.PI * 2)));
    }
    return { points, tousDedans: false };
  };

  const deA = croisementsDe(a, b);
  const deB = croisementsDe(b, a);
  if (deA.tousDedans || deB.tousDedans) return Infinity;
  const points = deA.points.concat(deB.points);

  // ⚠️ ON GARDE LA PLUS GRANDE TAILLE, PAS LA PREMIÈRE. Deux contours dentelés peuvent se couper en
  // quatre points ou plus — deux pointes d'étoile qui se croisent. C'est la plus large des
  // jonctions qui décide si l'ensemble se lit comme une seule Bulle.
  let large = 0;
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      large = Math.max(large, Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y));
    }
  }
  return large;
}

/**
 * La largeur d'étranglement exigée, en pixels : une part de la plus petite dimension du plus petit
 * lobe.
 *
 * ⚠️ UNE PROPORTION, ET NON UNE DISTANCE FIXE. Sur la Bulle par défaut (170 × 100) cela vaut 30 px,
 * soit une taille franche — deux contours tangents se croisent sur 0 px, et il en faut nettement
 * plus pour que l'œil lise une Bulle unique plutôt que deux contours accolés. Une distance fixe
 * donnerait un étranglement ridicule sur une grande Bulle et dévorerait une petite.
 */
export const PART_SOUDURE_MINIMALE = 0.30;

/** La largeur d'étranglement exigée entre ces deux lobes, en pixels. Fonction PURE. */
export function soudureExigee3D(a, b){
  const cote = Math.min(a.w, a.h, b.w, b.h);
  return cote * PART_SOUDURE_MINIMALE;
}

/** Ces deux lobes forment-ils une seule Bulle ? Fonction PURE. */
export function bullesSoudees3D(a, b){
  return largeurDeSoudure3D(a, b) >= soudureExigee3D(a, b);
}

export function lobeAuContactDuGroupe3D(lobe, voisins){
  for (const voisin of voisins || []) {
    if (voisin && voisin.id !== (lobe && lobe.id)
        && bullesSoudees3D(lobe, voisin)) return true;
  }
  return false;
}

/**
 * L'état le plus proche de celui visé qui garde le lobe au contact de son groupe. PURE.
 *
 * `depart` et `vise` décrivent le lobe : `{x, y}` pour un déplacement, `{x, y, w, h}` pour un
 * redimensionnement. Toute clé numérique présente dans `vise` est interpolée.
 *
 * ⚠️ UNE SEULE DÉCISION POUR LES DEUX GESTES, ET CE N'EST PAS DE L'ÉLÉGANCE. La première version ne
 * bridait que le DÉPLACEMENT ; le redimensionnement écrit `x`, `y`, `w` et `h` par un autre chemin,
 * et rétrécir un lobe le décollait donc de son voisin — rapporté à l'usage, capture à l'appui,
 * alors que la contrainte paraissait posée. Écrire une seconde fonction pour les rectangles aurait
 * donné deux copies d'une même règle, qui ne s'accordent que le jour où on les écrit : c'est la
 * faute retrouvée en #426 entre la fusion et la séparation, une semaine après l'avoir tuée d'un
 * côté. Un troisième geste qui écrirait la géométrie d'un lobe n'aura, lui, qu'à appeler ceci.
 *
 * ⚠️ ELLE REND TOUJOURS UN ÉTAT AU CONTACT, SANS SUPPOSER QUE LE CONTACT SOIT MONOTONE. La
 * dichotomie tient deux bornes : `bas`, dont on a VÉRIFIÉ qu'elle touche, et `haut`, dont on a
 * vérifié qu'elle ne touche pas. Elle ne rend jamais que `bas`. Un contour en croissant peut très
 * bien quitter puis retrouver le contact le long d'un même glissement ; la borne rendue reste
 * valide, elle n'est simplement pas garantie d'être LA dernière. Affirmer le contraire demanderait
 * un balayage, pour une différence qu'aucun œil ne verrait.
 *
 * ⚠️ UN DÉPART DÉJÀ HORS CONTACT NE LIBÈRE PAS LE LOBE : IL L'OBLIGE À SE RAPPROCHER. Première
 * version : « hors contact au départ, alors aucune contrainte ». C'était une porte de sortie, et
 * elle s'est ouverte toute seule. Il suffisait de changer la FORME d'un lobe depuis la fiche — un
 * chemin qui n'est ni le déplacement ni le redimensionnement — pour que les deux contours se
 * décollent ; à partir de là, tout glissement repartait d'un état hors contact, et la Bulle était
 * libre à jamais. Rapporté à l'usage : « si je change la forme de la bulle c'est pire, je peux
 * désormais la bouger sans contrainte ».
 *
 * La règle qui remplace la porte ne demande pas de position valide de référence, et c'est ce qui la
 * rend sûre : un lobe détaché peut bouger, mais jamais S'ÉLOIGNER. Il reste libre de revenir, se
 * recolle dès qu'il touche, et retrouve alors la butée ordinaire. Un Projet écrit à la main ou
 * hérité d'une version antérieure n'est donc pas figé — l'inquiétude qui avait fait écrire la
 * porte —, il est seulement empêché d'empirer.
 */
export function etatAuContactDuGroupe3D(lobe, voisins, depart, vise){
  const cles = Object.keys(vise || {}).filter(
    c => Number.isFinite(Number(vise[c])) && Number.isFinite(Number(depart && depart[c])));
  const a = (t) => {
    const etat = {};
    for (const c of cles) etat[c] = depart[c] + (vise[c] - depart[c]) * t;
    return Object.assign({}, lobe, vise, etat);
  };
  const touche = (etat) => lobeAuContactDuGroupe3D(etat, voisins);

  if (touche(a(1))) return Object.assign({}, vise);
  if (!touche(a(0))) {
    return ecartAuGroupe3D(a(1), voisins) <= ecartAuGroupe3D(a(0), voisins)
      ? Object.assign({}, vise)
      : Object.assign({}, vise, depart);
  }

  let bas = 0, haut = 1;
  for (let i = 0; i < PAS_DE_DICHOTOMIE_CONTACT; i++) {
    const milieu = (bas + haut) / 2;
    if (touche(a(milieu))) bas = milieu; else haut = milieu;
  }
  const retenu = Object.assign({}, vise);
  for (const c of cles) retenu[c] = depart[c] + (vise[c] - depart[c]) * bas;
  return retenu;
}

/**
 * La distance du centre du lobe au centre de son voisin le plus proche. Fonction PURE.
 *
 * ⚠️ UNE MESURE GROSSIÈRE, ET ELLE SUFFIT. Elle ne sert qu'à répondre à « ce geste éloigne-t-il, ou
 * rapproche-t-il ? » pour un lobe DÉJÀ détaché. Une vraie distance entre contours coûterait un
 * balayage à chaque mouvement de souris pour départager des cas que personne ne distingue à l'œil.
 * Sans voisin, la distance est infinie : rien ne rapproche ni n'éloigne.
 */
export function ecartAuGroupe3D(lobe, voisins){
  let mini = Infinity;
  for (const voisin of voisins || []) {
    if (!voisin || voisin.id === (lobe && lobe.id)) continue;
    const dx = (lobe.x + lobe.w / 2) - (voisin.x + voisin.w / 2);
    const dy = (lobe.y + lobe.h / 2) - (voisin.y + voisin.h / 2);
    mini = Math.min(mini, Math.hypot(dx, dy));
  }
  return mini;
}

/**
 * Ramène un lobe détaché au contact de son groupe, en le glissant vers son voisin le plus proche.
 * Fonction PURE : elle rend une position, elle n'écrit rien.
 *
 * ⚠️ ELLE RÉPARE CE QU'UN CHANGEMENT DE FORME VIENT DE CASSER. Changer la forme d'un lobe change
 * son contour, donc son contact : passer d'un rectangle à une étoile rétrécit la silhouette d'un
 * tiers, et les deux Bulles se décollent sans que personne ne les ait déplacées. Le geste ne peut
 * pas être refusé — l'utilisateur a le droit de choisir la forme qu'il veut —, donc c'est la
 * POSITION qui cède.
 *
 * ⚠️ LA CIBLE EST LE CENTRE DU VOISIN, ET NON UN POINT DE SON CONTOUR. Elle n'a pas à être proche :
 * elle doit seulement GARANTIR le contact, pour que la dichotomie ait une borne haute valide. Deux
 * Bulles de centres confondus se touchent quelle que soit leur forme, ce que le registre garantit
 * en exigeant des contours étoilés autour de leur centre (#425e). La dichotomie rend ensuite le
 * PLUS PETIT déplacement qui suffit, donc le lobe bouge le moins possible.
 */
export function rapprocherDuGroupe3D(lobe, voisins){
  const depart = { x: lobe.x, y: lobe.y };
  if (lobeAuContactDuGroupe3D(lobe, voisins)) return depart;

  let plusProche = null, mini = Infinity;
  for (const voisin of voisins || []) {
    if (!voisin || voisin.id === lobe.id) continue;
    const e = ecartAuGroupe3D(lobe, [voisin]);
    if (e < mini) { mini = e; plusProche = voisin; }
  }
  if (!plusProche) return depart;

  const cible = {
    x: plusProche.x + plusProche.w / 2 - lobe.w / 2,
    y: plusProche.y + plusProche.h / 2 - lobe.h / 2,
  };
  const touche = (t) => lobeAuContactDuGroupe3D(Object.assign({}, lobe, {
    x: depart.x + (cible.x - depart.x) * t,
    y: depart.y + (cible.y - depart.y) * t,
  }), voisins);
  // ⚠️ AUCUNE GARDE SUR « ET SI LE CENTRE DU VOISIN NE SUFFISAIT PAS ». Elle y était, et la
  // campagne l'a déclarée intuable : le registre de formes garantit un contour ÉTOILÉ autour du
  // centre, à distance strictement positive dans toutes les directions (contrat figé par
  // tests/bubble-shape.test.mjs, « la boucle se referme »). Deux contours de centres confondus se
  // coupent donc toujours. Une garde qu'aucun test ne peut atteindre est une garde que personne ne
  // maintient ; si le contrat du registre tombe un jour, c'est LUI qui doit rougir, pas ceci.
  //
  // On cherche le PLUS PETIT rapprochement qui suffit : `haut` touche toujours, `bas` jamais.
  let bas = 0, haut = 1;
  for (let i = 0; i < PAS_DE_DICHOTOMIE_CONTACT; i++) {
    const milieu = (bas + haut) / 2;
    if (touche(milieu)) haut = milieu; else bas = milieu;
  }
  return { x: depart.x + (cible.x - depart.x) * haut, y: depart.y + (cible.y - depart.y) * haut };
}
