/**
 * @file tools/bake-textures.mjs
 * Cuire un GRAIN de texture à partir d'un jeu de cartes PBR.
 *
 * Les licences et le filet de packaging sont l'affaire de #431c, sur le modèle de ce que #408c a
 * fait pour les polices. Cet outil ne s'occupe que de l'image.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * POURQUOI CET OUTIL EXISTE
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Les textures de remplissage d'une Bulle étaient PROCÉDURALES : des couches de couleur et des
 * taches tracées au canevas. Signalé à l'usage, le résultat manquait de matière. Les banques CC0
 * — Poly Haven, ambientCG — offrent des photographies carrelables, et cet outil les transforme en
 * quelque chose que l'application sait charger.
 *
 * ⚠️ CE QU'IL PRODUIT N'EST PAS UNE PHOTO, C'EST UN GRAIN EN NIVEAUX DE GRIS. Le choix vient de
 * l'utilisateur : une texture doit s'afficher avec sa couleur naturelle par défaut, mais rester
 * TEINTABLE si on le décide. On stocke donc le relief, monochrome, et la teinte vit dans le
 * registre sous forme de chaîne — d'où le sélecteur « Couleur du fond » qui retrouve un sens.
 *
 * ⚠️ ET LE GRAIN EST ÉCRIT SANS PERTE, CONTRE TOUTE TENTATION D'ÉCONOMIE. Mesuré sur le papier
 * froissé, à qualité décroissante :
 *
 *   format                poids   contraste   raccord
 *   PNG                  255 Ko        6,40      1,02
 *   JPEG q95             106 Ko        6,74      1,01
 *   JPEG q90              70 Ko        6,21      1,12
 *   JPEG q85              54 Ko        5,79      1,22   ← le « gain » que je visais
 *
 * Les deux colonnes qui se dégradent sont exactement celles que cet outil existe pour tenir. Le
 * raccord se défait pour une raison de fond, et non par malchance : un encodeur JPEG IGNORE que
 * l'image se carrelle, donc ses blocs de bord travaillent sans le contexte qui les prolonge. Un
 * grain compressé se répète en trahissant ses coutures — précisément le défaut qu'on traque.
 *
 * ⚠️ J'AI ANNONCÉ 54 Ko PENDANT TOUT #431a, ET C'ÉTAIT UN CHIFFRE DE JPEG POUR UN FICHIER PNG. Je
 * l'avais mesuré à l'époque où le format n'était pas tranché, puis répété sans le revérifier une
 * fois le PNG écrit. Le vrai poids est ici.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * ⚠️ LA CARTE DE COULEUR NE SERT PAS AU GRAIN, ET C'EST CONTRE-INTUITIF
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Premier réflexe : « un remplissage, donc la carte de couleur ». Faux, et mesuré. Un albédo PBR
 * est délibérément privé de tout éclairage et de toute ombre, pour que le moteur 3D puisse
 * éclairer lui-même. Relevé sur Paper005 :
 *
 *   carte           contraste local
 *   Color                      2,24   ← un aplat
 *   Displacement               5,95
 *
 * En 3D ce n'est pas un problème : three.js reconstruit le relief depuis la normale. En 2D il n'y
 * a AUCUN éclairage, donc un albédo reste plat. Le froissé qu'on voit sur les aperçus des banques
 * vient de la normale et du déplacement, pas de la couleur.
 *
 * La couleur ne sert donc qu'à une chose ici : en déduire la TEINTE PAR DÉFAUT.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * ⚠️ LE RELIEF A DEUX SOURCES POSSIBLES, ET AUCUNE N'EST GARANTIE
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ambientCG livre un `Displacement`. Poly Haven, pour certaines matières, n'en livre pas — mais
 * livre une occlusion ambiante, qui assombrit les creux et porte le même genre de signal. Pour un
 * tissage, elle est même meilleure : elle contient l'ombre entre les fils, ce qui fait qu'une
 * trame se lit comme une trame.
 *
 * Le cuiseur accepte donc l'un OU l'autre, et REFUSE de produire quoi que ce soit sans l'un des
 * deux. Fabriquer un grain depuis la seule normale donnerait un résultat pauvre, et surtout
 * silencieux : on ne saurait pas que la matière manquait.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * ⚠️ LE GAIN EST DÉDUIT D'UNE CIBLE, IL N'EST PAS CHOISI — ET C'EST UNE CORRECTION
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * La première version appliquait une amplification FIXE, réglée à l'œil sur un papier froissé.
 * Transportée telle quelle sur trois autres matières, elle a donné :
 *
 *   matière          contraste obtenu
 *   papier froissé              6,43   ← le réglage validé
 *   papier fin                 33,41   ← un crépi, le texte ne s'y lit plus
 *   carton                      7,88
 *   toile                      24,78
 *
 * La raison est mécanique : l'amplification normalise autour de la moyenne, donc elle POUSSE
 * d'autant plus fort que la matière porte peu de relief. Un papier lisse recevait quatre fois trop.
 *
 * On vise désormais le RÉSULTAT. La cible est `CONTRASTE_CIBLE`, le 6,4 du papier froissé validé à
 * l'œil, et chaque matière reçoit le gain qu'il faut pour l'atteindre. Les quatre retombent alors
 * entre 6,31 et 6,40, avec des gains allant de 0,23 à 1,19 : l'écart que la version fixe ignorait.
 *
 * ⚠️ ET CE QUE LA NORMALISATION NE PEUT PAS FAIRE. Elle ajuste l'INTENSITÉ du grain, pas sa
 * NATURE. Le carton d'essai portait des cannelures et des taches d'impression : ramené à 6,31, il
 * restait inutilisable — les taches devenaient seulement plus pâles, et se carrelaient en motif
 * régulier. Un bon chiffre ne garantit pas une texture utilisable, d'où l'avertissement plus bas.
 */

import { writeFileSync, mkdirSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, basename } from 'node:path';


// ── Réglages, tous mesurés ou choisis à l'œil, jamais devinés ─────────────────────────────────

/**
 * La taille du grain produit.
 *
 * ⚠️ 512 PLUTÔT QUE 1024, ET CE N'EST PAS LA FINESSE QUI A DÉCIDÉ. Relevé sur le papier froissé,
 * le contraste local ne bouge pas avec la résolution : 6,78 à 256², 6,43 à 512², 6,75 à 1024².
 * L'écart est du bruit. Quadrupler la résolution n'achète donc rien en grain.
 *
 * Ce qui a décidé, c'est la RÉPÉTITION : une tuile plus grande se répète moins souvent sur une
 * Bulle, et c'est le motif qui se répète — pas le grain — qui trahit une texture. Le poids arbitre
 * ensuite : 65 Ko à 256², 255 Ko à 512², 1006 Ko à 1024². Quadrupler paie une répétition moins
 * fréquente ; le faire deux fois ne paie plus rien.
 */
export const TAILLE_GRAIN = 512;

/**
 * La taille des grains du SOL, double de celle des Bulles. Décidée avec l'utilisateur en #435k.
 *
 * ⚠️ POURQUOI LE SOL ET PAS LES BULLES. Une Bulle s'affiche sur deux cents pixels environ : un
 * grain de 512 y est déjà réduit. Le Sol, lui, se regarde de près quand la caméra descend : avec
 * une tuile de 4 m, un grain de 512 passe sous un texel par pixel dès une distance de 10, et la
 * photographie est grossie au-delà de sa résolution. En 1024, ce seuil recule à 5.
 *
 * ⚠️ ET TOUTES LES DÉCISIONS RESTENT PRISES À L'ÉCHELLE 512. Nature, gain, couture, motif : leurs
 * seuils ont été calibrés à 512, et les mesurer à 1024 les déplacerait. Le cas le plus net est le
 * gain. Normalisé naïvement à 1024, le grain revu au cadrage par défaut — c'est-à-dire au niveau de
 * mipmap 512 — sortait PLUS contrasté que l'actuel, de 11 % pour l'herbe à 51 % pour le sable, et
 * 16 % moins pour le gazon. J'avais annoncé « au cadrage par défaut rien ne change » sans l'avoir
 * mesuré, et c'était faux. Le gain se calcule donc sur la version réduite à 512 : relevé sur sept
 * matières, l'écart retombe sous 1 %. Le 1024 n'ajoute que du détail de près.
 */
export const TAILLE_GRAIN_SOL = 1024;

/** La taille de cuisson d'un identifiant : celle du Sol pour ses matières, celle des Bulles sinon. */
export function tailleDuGrain3D(id, idsDuSol = []){
  return (idsDuSol || []).includes(id) ? TAILLE_GRAIN_SOL : TAILLE_GRAIN;
}

/**
 * Les identifiants cuits en TAILLE_GRAIN_SOL : les matières du Sol, et depuis #437 celles des
 * Traces, qui se regardent d'aussi près (un muret ou une clôture à côté d'un personnage). Le
 * Terrain n'a pas de grain à lui : il emprunte ceux du Sol. Fonction PURE.
 */
export function idsEnGrandFormat3D(groundDefs, tracéDefaults){
  return [
    ...(groundDefs || []).map(d => d.id),
    ...Object.keys(tracéDefaults || {}).filter(id => id !== 'terrain'),
  ];
}

/**
 * Comment ramener une carte au carré du grain. Fonction PURE.
 *
 * ⚠️ UNE MATIÈRE SE DÉFORME, UNE IMAGE SE RECADRE (#437). Le recadrage au carré central avait été
 * écrit pour une panoramique de ciel en 2:1, qu'on ne voulait pas écraser. Appliqué à une MATIÈRE
 * non carrée, il casse le carrelage : la source de briques du muret fait 2048 × 1024, une période
 * entière dans chaque sens ; son carré central n'en garde qu'une demi-période en largeur, et chaque
 * raccord horizontal aurait montré une couture. On l'étire donc au carré, ce qui garde une période
 * entière dans les deux sens, et le RAPPORT est imprimé pour que la tuile 3D le rende.
 */
export function cadrageDeLaCarte3D(largeur, hauteur, regime){
  const rapport = largeur / hauteur;
  if (largeur === hauteur) return { mode: 'tel-quel', rapport: 1 };
  return { mode: regime === 'image' ? 'recadrer' : 'etirer', rapport };
}

/** Réduction 2×2 par moyenne, ce que fait un niveau de mipmap. Fonction PURE. */
export function reduireDeMoitie3D(g, taille){
  const h = Math.floor(taille / 2), o = new Float64Array(h * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < h; x++) {
      const i = 2 * y * taille + 2 * x;
      o[y * h + x] = (g[i] + g[i + 1] + g[i + taille] + g[i + taille + 1]) / 4;
    }
  }
  return o;
}

/**
 * Ramène une image à la taille de référence par réductions successives. Fonction PURE.
 * La taille doit valoir la référence multipliée par une puissance de deux : on refuse le reste
 * plutôt que de rééchantillonner à côté, ce qui fausserait en silence chaque mesure qui suit.
 */
export function versReference3D(g, taille, reference = TAILLE_GRAIN){
  let t = taille, img = g;
  while (t > reference) {
    if (t % 2) throw new Error(`taille ${taille} : pas un multiple de ${reference} par puissances de deux`);
    img = reduireDeMoitie3D(img, t); t /= 2;
  }
  if (t !== reference) throw new Error(`taille ${taille} : pas un multiple de ${reference} par puissances de deux`);
  return img;
}

/** Le contraste local visé. C'est le papier froissé validé à l'œil, devenu la référence. */
export const CONTRASTE_CIBLE = 6.4;

/**
 * Le gris sur lequel le grain est centré : la valeur qui, à l'affichage, ne change rien.
 *
 * ⚠️ CE NOMBRE EST UN CONTRAT AVEC `src/bubble-texture.js`, QUI NE PEUT PAS L'IMPORTER. Ce module
 * ouvre des fichiers ; le code de l'application tourne dans un navigateur. Les deux constantes
 * vivent donc séparément — c'est exactement « deux copies d'une même décision, d'accord seulement
 * aujourd'hui », la famille de défauts que ce dépôt nomme. Un test les compare, faute de pouvoir
 * les fondre : sans lui, un décalage assombrirait ou éclaircirait toutes les textures d'un bloc,
 * uniformément, donc invisiblement.
 */
export const GRIS_NEUTRE = 128;

/** Part du terme directionnel dans le mélange, le reste venant du relief brut. */
export const PART_OMBRAGE = 0.30;

/**
 * De combien on redresse les pentes de la normale avant d'éclairer.
 *
 * ⚠️ FIXE, ET CE N'EST PAS UNE INCOHÉRENCE AVEC LA NORMALISATION. Ce facteur ne DOSE pas le
 * résultat — le gain s'en charge —, il RÉVÈLE la pente. Relevé sur Paper005 : pente moyenne 0,029,
 * pente maximale 0,277. Sans redressement, l'éclairage de Lambert resterait dans le bruit avant
 * même qu'on puisse le doser.
 */
export const AMPLI_NORMALE = 6.0;

/**
 * La direction de la lumière cuite dans le grain.
 *
 * ⚠️ ON FIGE ICI CE QUE LA 3D REFERAIT À CHAQUE IMAGE. Un grain 2D n'a pas d'éclairage : il faut
 * donc décider une fois pour toutes d'où vient la lumière. Le haut-gauche est la convention du
 * dessin, et c'est ce qui fait qu'un pli se lit comme un pli plutôt que comme une tache.
 */
export const DIRECTION_LUMIERE = { x: -0.55, y: -0.55, z: 0.63 };

/**
 * Au-delà de cette part de contraste vivant à l'échelle de la tuile, on avertit.
 *
 * ⚠️ SEUIL PLACÉ DANS UN VIDE, PAS AJUSTÉ SUR UN CAS. Mesuré sur les quatre matières d'essai, le
 * grain produit donne 0,070 / 0,083 / 0,126 pour les trois utilisables et 0,241 pour le carton
 * taché. 0,18 tombe au milieu de l'écart, qui est presque du simple au double.
 */
export const PART_TUILE_SUSPECTE = 0.18;

/**
 * Au-delà de ce rapport, le raccord de la tuile se voit et la texture ne se carrelle pas.
 *
 * ⚠️ CE SEUIL N'EXISTAIT PAS, ET LA NUIT ÉTOILÉE A MONTRÉ CE QU'IL COÛTE. Sa couture valait 2,32 —
 * mesurée, imprimée, et laissée sans verdict. Le rendu a fini par le donner : une bande nette
 * coupait chaque Bulle. Mesurer sans conclure, c'est produire un chiffre que personne ne lit.
 *
 * Relevé sur les matières cuites : 1,01 pour la lave, 1,02 pour le papier froissé, 1,21 pour la
 * glace, 2,32 pour la nuit. 1,5 sépare franchement les trois qui se carrellent de celle qui ne se
 * carrelle pas — une équirectangulaire recadrée n'a aucune raison de boucler.
 */
export const COUTURE_SUSPECTE = 1.5;

/** Le côté du damier d'échantillonnage : 8 blocs, donc des pavés de 64 pixels à 512². */
export const BLOCS_ECHELLE_TUILE = 8;

// ── La moitié PURE : elle ne connaît ni fichier, ni image, seulement des tableaux ──────────────

/**
 * Le contraste LOCAL : l'écart moyen entre deux pixels voisins.
 *
 * ⚠️ PAS L'ÉCART-TYPE, ET LA DIFFÉRENCE EST TOUT LE SUJET. Une carte peut varier lentement d'un
 * bord à l'autre — donc afficher un bel écart-type — sans porter le moindre grain. C'est
 * exactement le cas d'un albédo : écart-type 3,67, contraste local 2,24. Le grain est une affaire
 * de VOISINAGE.
 */
export function contrasteLocal3D(gris, taille){
  let somme = 0, n = 0;
  for (let y = 0; y < taille; y++) {
    for (let x = 0; x < taille - 1; x++) {
      somme += Math.abs(gris[y * taille + x] - gris[y * taille + x + 1]); n++;
    }
  }
  for (let y = 0; y < taille - 1; y++) {
    for (let x = 0; x < taille; x++) {
      somme += Math.abs(gris[y * taille + x] - gris[(y + 1) * taille + x]); n++;
    }
  }
  return n ? somme / n : 0;
}

/**
 * La visibilité du raccord : l'écart AU BORD rapporté à l'écart INTERNE.
 *
 * ⚠️ UN RAPPORT, PAS UNE VALEUR ABSOLUE, parce qu'une texture très contrastée aura naturellement
 * un gros écart partout, bord compris. 1,0 signifie « le raccord ne se distingue pas du reste ».
 * Relevé sur les quatre matières d'essai : 0,99 à 1,10, y compris sur une trame régulière de jean,
 * qui était le cas le plus exposé — un tissage ne pardonne pas un décalage d'un pixel.
 */
/**
 * Le bord de la tuile tombe-t-il sur une ligne que le motif porte AUSSI ailleurs ? Fonction PURE.
 *
 * ⚠️ LA MESURE DE COUTURE DONNE DES FAUX POSITIFS, ET ELLE M'A FAIT ÉCARTER UN PARQUET SAIN. Elle
 * compare l'écart entre bords opposés au contraste MOYEN de l'image. Or un parquet carrelable pose
 * ses joints exactement sur le bord de la tuile : l'écart y est grand, mais pas plus grand que sur
 * n'importe quel autre joint. Relevé sur WoodFloor040 : 69,4 au bord gauche/droit, 66,2 entre deux
 * colonnes voisines au milieu. Couture annoncée 2,62 pour un seuil de 1,25, et un carrelage 2×2
 * parfaitement raccordé à l'œil. Deux sources de plancher ont été écartées ainsi, à tort.
 *
 * On compare donc l'écart du bord au PLUS GRAND écart entre lignes voisines à l'intérieur, dans le
 * même sens. Un vrai raccord raté dépasse tout ce que l'image contient ; un joint, non.
 */
export function coutureSurUnJoint3D(gris, taille, marge = 1.1){
  const t = taille;
  const ecartColonnes = (x1, x2) => { let s = 0; for (let y = 0; y < t; y++) s += Math.abs(gris[y * t + x1] - gris[y * t + x2]); return s / t; };
  const ecartLignes = (y1, y2) => { let s = 0; for (let x = 0; x < t; x++) s += Math.abs(gris[y1 * t + x] - gris[y2 * t + x]); return s / t; };
  let maxV = 0, maxH = 0;
  for (let i = 0; i + 1 < t; i++) { maxV = Math.max(maxV, ecartColonnes(i, i + 1)); maxH = Math.max(maxH, ecartLignes(i, i + 1)); }
  return ecartColonnes(0, t - 1) <= marge * maxV && ecartLignes(0, t - 1) <= marge * maxH;
}

export function coutureCarrelage3D(gris, taille){
  const interne = contrasteLocal3D(gris, taille);
  if (interne <= 0) return 0;
  let h = 0, v = 0;
  for (let x = 0; x < taille; x++) h += Math.abs(gris[x] - gris[(taille - 1) * taille + x]);
  for (let y = 0; y < taille; y++) v += Math.abs(gris[y * taille] - gris[y * taille + taille - 1]);
  return ((h / taille) + (v / taille)) / 2 / interne;
}

/**
 * La part du contraste qui vit à L'ÉCHELLE DE LA TUILE. La leçon du carton.
 *
 * ⚠️ CE QUE LE CONTRASTE LOCAL NE VOIT PAS. Le carton d'essai atteignait 6,31 et restait
 * inutilisable : il portait des taches d'impression qui, une fois carrelées, se répétaient en
 * motif visible. Un bon chiffre ne dit pas que les variations sont du grain.
 *
 * ⚠️ MA PREMIÈRE MESURE ÉTAIT FAUSSE, ET SON COMMENTAIRE AFFIRMAIT LE CONTRAIRE. J'avais compté
 * les pixels très éloignés de la moyenne, en supposant qu'une tache est plus extrême qu'un grain.
 * Mesuré : elle signalait le papier froissé — la SEULE texture retenue — à 0,95 %, parce qu'un pli
 * profond est exactement aussi extrême qu'une tache. J'avais écrit « repère le carton » sans
 * l'avoir vérifié une seule fois.
 *
 * Ce qui sépare réellement les deux, c'est ce que l'utilisateur a décrit : une tache SURVIT à
 * l'éloignement, un grain se moyenne. On ramène donc l'image à un damier de blocs et on regarde ce
 * qui reste. Sur du bruit pur, moyenner 64×64 pixels diviserait l'écart par 64 ; un motif de la
 * taille de la tuile, lui, traverse l'opération intact.
 *
 *   matière            part à l'échelle de la tuile
 *   papier froissé                            0,070
 *   papier fin                                0,083
 *   toile de jean                             0,126
 *   carton taché                              0,241   ← le seul jugé inutilisable
 *
 * ⚠️ ET C'EST UN AVERTISSEMENT, PAS UN REFUS. Ce dépôt préfère l'échec bruyant au silence, mais
 * juger qu'une texture est laide n'est pas du ressort d'un script. Il peut dire OÙ REGARDER ; il
 * ne peut pas décider à la place de l'œil.
 */
export function partAEchelleDeTuile3D(gris, taille, blocs = BLOCS_ECHELLE_TUILE){
  const n = taille * taille;
  let somme = 0;
  for (let i = 0; i < n; i++) somme += gris[i];
  const moyenne = somme / n;
  let v = 0;
  for (let i = 0; i < n; i++) v += (gris[i] - moyenne) ** 2;
  const ecartTotal = Math.sqrt(v / n);
  if (ecartTotal <= 1e-6) return { part: 0, suspect: false, ecartTotal: 0 };

  const cote = Math.floor(taille / blocs);
  const moyennes = [];
  for (let by = 0; by < blocs; by++) {
    for (let bx = 0; bx < blocs; bx++) {
      let s = 0;
      for (let y = by * cote; y < (by + 1) * cote; y++) {
        for (let x = bx * cote; x < (bx + 1) * cote; x++) s += gris[y * taille + x];
      }
      moyennes.push(s / (cote * cote));
    }
  }
  const mm = moyennes.reduce((a, b) => a + b, 0) / moyennes.length;
  const ecartBlocs = Math.sqrt(moyennes.reduce((a, b) => a + (b - mm) ** 2, 0) / moyennes.length);
  const part = ecartBlocs / ecartTotal;
  return { part, suspect: part > PART_TUILE_SUSPECTE, ecartTotal };
}

/**
 * L'éclairage de Lambert cuit depuis une carte de normales, en convention OpenGL.
 *
 * ⚠️ OPENGL ET NON DIRECTX. Les banques livrent souvent les deux : `nor_gl` et `nor_dx`, ou
 * `NormalGL` et `NormalDX`. Ils diffèrent par le SIGNE DU CANAL VERT. Prendre le mauvais creuse ce
 * qui devrait bomber — le relief s'inverse, discrètement, et on met du temps à comprendre pourquoi
 * la lumière semble venir d'en bas.
 *
 * `normaleRgba` est un tableau plat, quatre octets par pixel.
 */
export function ombrageDepuisNormale3D(normaleRgba, taille, ampli = AMPLI_NORMALE,
  direction = DIRECTION_LUMIERE){
  const n = Math.hypot(direction.x, direction.y, direction.z) || 1;
  const lx = direction.x / n, ly = direction.y / n, lz = direction.z / n;
  const out = new Float64Array(taille * taille);
  for (let i = 0; i < taille * taille; i++) {
    const nx = ((normaleRgba[i * 4] - 128) / 127) * ampli;
    const ny = ((normaleRgba[i * 4 + 1] - 128) / 127) * ampli;
    const nz = Math.max(0.05, (normaleRgba[i * 4 + 2] - 128) / 127);
    const ln = Math.hypot(nx, ny, nz) || 1;
    // 0,75 recentre : une surface plate rend environ cette valeur, donc l'écart tourne autour de 0.
    out[i] = ((nx * lx + ny * ly + nz * lz) / ln - 0.75) * 255;
  }
  return out;
}

/**
 * Le grain final, normalisé sur la cible. C'est LA fonction que tout le reste sert.
 *
 * `relief` est une carte en niveaux de gris — déplacement ou occlusion ambiante, cf. l'en-tête.
 * Rend le grain en octets, plus le gain qu'il a fallu et le contraste atteint : ces deux nombres
 * sont ce qu'on regarde pour savoir si une matière se comporte normalement.
 *
 * ⚠️ `normaleRgba` PEUT ÊTRE `null`, ET C'EST UN SECOND RÉGIME, PAS UNE TOLÉRANCE. Une MATIÈRE est
 * photographiée sous plusieurs cartes : son relief se reconstruit, et l'éclairage qu'on en déduit
 * fait la moitié de ce qui la rend lisible. Une IMAGE — un ciel étoilé, par exemple — n'a pas de
 * surface du tout : elle EST déjà le motif, et sa luminance tient lieu de relief. Lui inventer une
 * normale n'aurait aucun sens ; refuser de la cuire non plus.
 *
 * Le terme directionnel disparaît alors, au lieu d'être approché : `brut` se réduit au relief
 * recentré. C'est exactement ce qui a été mesuré sur NightSkyHDRI012 avant d'écrire ces lignes —
 * gain 1,44, contraste 6,39 — et le rendu a montré des étoiles blanches sur un fond de nuit.
 *
 * ⚠️ CE QUI EMPÊCHE CE RÉGIME D'ÊTRE UN REPLI SILENCIEUX vit dans `main()`, pas ici : on n'y entre
 * que lorsqu'il n'y a NI relief NI normale — une seule image. Un déplacement SANS sa normale reste
 * un téléchargement incomplet, donc un refus. Sans cette condition, une carte oubliée produirait un
 * grain plausible et appauvri, et personne ne saurait qu'il manquait quelque chose.
 */
export function grainNormalise3D(relief, normaleRgba, taille, cible = CONTRASTE_CIBLE, reference = taille){
  const n = taille * taille;
  let somme = 0;
  for (let i = 0; i < n; i++) somme += relief[i];
  const moyenne = somme / n;
  const ombrage = normaleRgba ? ombrageDepuisNormale3D(normaleRgba, taille) : null;
  const brut = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    brut[i] = ombrage
      ? (1 - PART_OMBRAGE) * (relief[i] - moyenne) + PART_OMBRAGE * ombrage[i]
      : relief[i] - moyenne;
  }
  // Le contraste du mélange AVANT gain, pour en déduire le gain. Recentré sur 128 : la mesure
  // porte sur des écarts entre voisins, donc le décalage n'y change rien, mais on reste homogène.
  const centre = new Float64Array(n);
  for (let i = 0; i < n; i++) centre[i] = GRIS_NEUTRE + brut[i];
  // ⚠️ MESURÉ À L'ÉCHELLE DE RÉFÉRENCE, cf. TAILLE_GRAIN_SOL : à 1024 sans cela, le grain revu au
  // cadrage par défaut sortait jusqu'à 51 % plus contrasté. Sans référence fournie, rien ne change.
  const c0 = reference < taille
    ? contrasteLocal3D(versReference3D(centre, taille, reference), reference)
    : contrasteLocal3D(centre, taille);
  const gain = cible / Math.max(c0, 1e-6);
  const grain = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    grain[i] = Math.max(0, Math.min(255, Math.round(GRIS_NEUTRE + brut[i] * gain)));
  }
  return { grain, gain, contraste: contrasteLocal3D(grain, taille) };
}

/**
 * La teinte par défaut d'une matière : la couleur moyenne de son albédo.
 *
 * ⚠️ C'EST LE SEUL USAGE DE LA CARTE DE COULEUR, et il tient en trois nombres. Elle s'affiche tant
 * que l'utilisateur ne touche à rien — la texture apparaît alors telle qu'elle a été photographiée
 * — et le sélecteur reprend la main dès qu'il en choisit une autre.
 */
export function teinteDominante3D(albedoRgba){
  const n = Math.floor(albedoRgba.length / 4);
  if (!n) return '#FFFFFF';
  let r = 0, v = 0, b = 0;
  for (let i = 0; i < n; i++) { r += albedoRgba[i * 4]; v += albedoRgba[i * 4 + 1]; b += albedoRgba[i * 4 + 2]; }
  const hex = (x) => Math.max(0, Math.min(255, Math.round(x / n))).toString(16).padStart(2, '0').toUpperCase();
  return '#' + hex(r) + hex(v) + hex(b);
}

/**
 * Quelle carte d'un jeu sert de relief, et laquelle de normale.
 *
 * ⚠️ DEUX BANQUES, DEUX NOMMAGES, ET AUCUN N'EST UNE NORME. ambientCG écrit `Paper005_4K_Color`,
 * `_Displacement`, `_NormalGL` ; Poly Haven écrit `denmin_fabric_02_diff_4k`, `_ao_`, `_nor_gl_`.
 * On reconnaît donc par MOTIF, en acceptant les deux — et on rend `null` plutôt que de deviner.
 */
/** Les deux familles de relief, séparées : elles ne disent pas la même chose. */
const MOTIFS_DEPLACEMENT = [/_displacement/i, /_disp[_.]/i, /_height/i];
const MOTIFS_OCCLUSION = [/_ao[_.]/i, /_ambientocclusion/i];
const MOTIFS_NORMALE = [/_normalgl/i, /_nor_gl/i, /_normal_gl/i];
const MOTIFS_ALBEDO = [/_color/i, /_diff[_.]/i, /_albedo/i, /_basecolor/i];

/**
 * Plusieurs fichiers pour un même RÔLE ? Fonction PURE. Rend la liste des rôles en double.
 *
 * ⚠️ TROUVÉ AU MOMENT OÙ L'UTILISATEUR ALLAIT REMPLACER TROIS SOURCES. Déposer un nouveau jeu sans
 * retirer l'ancien laissait deux déplacements, deux normales et deux albédos dans le même dossier,
 * et `find` prenait le premier dans l'ordre alphabétique, sans un mot. Relevé : avec Ground080 et
 * Ground054 côte à côte, c'est 054 qui sortait, par chance ; avec un numéro plus grand, l'ANCIEN
 * aurait été cuit. Et deux jeux nommés autrement pouvaient se MÉLANGER, le relief de l'un avec la
 * normale de l'autre : un grain plausible, cohérent nulle part.
 */
export function rolesEnDouble3D(noms){
  const liste = noms || [];
  const compte = (motifs) => liste.filter(f => motifs.some(m => m.test(f)));
  const doublons = [];
  for (const [role, motifs] of [['relief', MOTIFS_DEPLACEMENT], ['occlusion', MOTIFS_OCCLUSION],
    ['normale', MOTIFS_NORMALE], ['albédo', MOTIFS_ALBEDO]]) {
    const vus = compte(motifs);
    if (vus.length > 1) doublons.push({ role, fichiers: vus });
  }
  return doublons;
}

export function classerCartes3D(noms){
  const trouve = (motifs) => noms.find(f => motifs.some(m => m.test(f))) || null;
  return {
    relief: trouve([...MOTIFS_DEPLACEMENT, ...MOTIFS_OCCLUSION]),
    normale: trouve(MOTIFS_NORMALE),
    albedo: trouve(MOTIFS_ALBEDO),
  };
}

/**
 * Un déplacement ET une occlusion dans le même dossier ? Fonction PURE.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * ⚠️ QUAND LES DEUX SONT LÀ, C'EST L'ORDRE ALPHABÉTIQUE QUI TRANCHAIT
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Les deux familles portent du relief, et le cuiseur accepte l'une OU l'autre pour une bonne
 * raison, écrite plus haut : Poly Haven ne livre pas toujours de déplacement, et sur un tissage
 * l'occlusion est même MEILLEURE, puisqu'elle contient l'ombre entre les fils.
 *
 * Mais `find` rend la PREMIÈRE correspondance, et les fichiers arrivent triés par nom. Un dossier
 * contenant `..._ao_1k.jpg` et `..._disp_1k.png` donnait donc le relief à l'occlusion, par le seul
 * fait que « ao » précède « disp » dans l'alphabet. Aucune décision derrière, aucun message, et un
 * grain plausible tiré de la mauvaise carte.
 *
 * ⚠️ ON REFUSE PLUTÔT QUE DE CHOISIR À LA PLACE DE L'UTILISATEUR, comme partout ailleurs dans cet
 * outil. Poser une priorité fixe serait contredit par le cas du tissage ; imprimer un avertissement
 * le noierait dans un rapport qu'on lit en diagonale — c'est exactement ce qui est arrivé à la
 * ligne « tuile », lue pendant des semaines sans être entendue. Le refus, lui, ne se rate pas.
 */
export function reliefAmbigu3D(noms){
  const liste = noms || [];
  const deplacement = liste.find(f => MOTIFS_DEPLACEMENT.some(m => m.test(f))) || null;
  const occlusion = liste.find(f => MOTIFS_OCCLUSION.some(m => m.test(f))) || null;
  return deplacement && occlusion ? { deplacement, occlusion } : null;
}

/**
 * Comment cuire ce dossier : en MATIÈRE, en IMAGE, ou pas du tout. Fonction PURE.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * ⚠️ DEUX RÉGIMES, ET LA FRONTIÈRE ENTRE EUX EST TOUT L'ENJEU
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Une MATIÈRE est une surface photographiée sous plusieurs cartes : relief, normale, couleur. Son
 * grain se reconstruit, et l'éclairage déduit de la normale fait 30 % de ce qui le rend lisible.
 *
 * Une IMAGE n'a pas de surface : un ciel étoilé EST déjà le motif. Sa luminance tient lieu de
 * relief, et il n'y a pas de normale à inventer. Mesuré sur NightSkyHDRI012 : gain 1,44, contraste
 * 6,39, des étoiles blanches sur un fond de nuit.
 *
 * ⚠️ LA CONDITION D'ENTRÉE EN RÉGIME IMAGE EST CE QUI L'EMPÊCHE D'ÊTRE UN REPLI SILENCIEUX. On n'y
 * entre que s'il n'y a NI relief NI normale, et qu'UNE SEULE image. Les deux moitiés comptent :
 *
 *   - un déplacement SANS sa normale est un téléchargement incomplet. Se rabattre sur le régime
 *     image produirait un grain plausible et appauvri, de 30 % exactement, sans que rien ne le
 *     dise. C'est la première famille de défauts que ce dépôt nomme ;
 *   - plusieurs images non classées, et on ne sait pas laquelle est le motif. Prendre la première
 *     venue serait deviner. On refuse en les nommant toutes.
 */
export function regimeDeCuisson3D(fichiers){
  const cartes = classerCartes3D(fichiers);
  // ⚠️ UN RÔLE EN DOUBLE EST REFUSÉ AVANT TOUT, cf. rolesEnDouble3D : sinon l'ordre alphabétique
  // choisit entre l'ancien et le nouveau jeu, et peut même les mélanger.
  const doublons = rolesEnDouble3D(fichiers);
  if (doublons.length) {
    return { regime: null, ...cartes,
      refus: 'plusieurs jeux de cartes dans le même dossier ('
        + doublons.map(d => `${d.role} : ${d.fichiers.join(', ')}`).join(' ; ')
        + '). Retirez l\'ancien jeu avant de cuire le nouveau.' };
  }
  // ⚠️ L'AMBIGUÏTÉ SE TRANCHE AVANT TOUT LE RESTE. Un dossier qui porte les deux sources de relief
  // ne manque de rien : il en a trop, et personne n'a dit laquelle compte.
  const ambigu = reliefAmbigu3D(fichiers);
  if (ambigu) {
    return { regime: null, ...cartes,
      refus: `deux sources de relief dans le même dossier, ${ambigu.deplacement} et `
        + `${ambigu.occlusion}. N'en gardez qu'une : le déplacement convient à presque tout, `
        + "l'occlusion est préférable pour un tissage, dont elle porte l'ombre entre les fils" };
  }
  if (cartes.relief && cartes.normale) {
    return { regime: 'matiere', ...cartes, refus: null };
  }
  // ⚠️ L'ORDRE DE CES DEUX REFUS COMPTE : une normale sans relief se plaint du relief manquant, un
  // relief sans normale se plaint de la normale. Un message unique pour les deux cas laisserait
  // chercher la mauvaise carte.
  if (cartes.relief) {
    return { regime: null, ...cartes,
      refus: 'un relief est là mais pas de carte de normales en convention OpenGL — '
        + 'téléchargement incomplet ? (NormalDX ne convient pas : il inverserait le relief)' };
  }
  if (cartes.normale) {
    return { regime: null, ...cartes,
      refus: 'une normale est là mais ni déplacement ni occlusion ambiante' };
  }
  if (fichiers.length === 1) {
    return { regime: 'image', relief: fichiers[0], normale: null, albedo: fichiers[0], refus: null };
  }
  return { regime: null, ...cartes,
    refus: fichiers.length
      ? `${fichiers.length} images sans carte reconnaissable, et rien ne dit laquelle est le motif : `
        + fichiers.join(', ')
      : 'aucune image dans ce dossier' };
}

/**
 * Où vit la structure d'une texture : dans sa COULEUR, ou dans son RELIEF ? Fonction PURE.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * ⚠️ LA QUESTION QUI A OUVERT #433, ET LA MESURE QUI Y RÉPOND
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Signalé à l'usage : « pour la lave, plusieurs couleurs étaient utilisées, le rendu final avec une
 * seule appauvrit beaucoup ». Mesuré, c'est vrai, et c'est PROPRE À LA LAVE. On relève, le long de
 * la luminance de l'albédo, de combien la teinte varie :
 *
 *   matière          variation de teinte   saturation du décile sombre → clair
 *   papier froissé                   0,3                         80 → 80
 *   glace                            3,5                         28 → 18
 *   nuit étoilée                     3,9                         29 →  8
 *   lave                            18,7                        71 → 170
 *
 * La croûte de lave est un brun désaturé, ses fissures un orange vif : la saturation PLUS QUE
 * DOUBLE. Un grain monochrome teinté d'une seule couleur ne peut pas le rendre, par construction.
 *
 * ⚠️ ET LA PREMIÈRE RÉPARATION QUE J'AI ESSAYÉE NE MARCHAIT PAS. J'avais généralisé le mélange en
 * faisant croître la chroma avec le grain — un paramètre de plus, mesurable. Rendu côte à côte : la
 * différence était invisible. Deux raisons, et la seconde est la vraie. D'abord le grain, normalisé
 * à 6,4 de contraste, reste serré autour du gris neutre, donc le facteur ne variait que de quelques
 * pour cent. Surtout, la structure que l'œil cherche dans la lave N'EST PAS DANS LE DÉPLACEMENT :
 * celui-ci décrit un écoulement, une sorte de fil du bois, pendant que la couleur raconte la croûte
 * et les fissures. Aucun réglage appliqué au grain ne pouvait restituer une information absente.
 *
 * ⚠️ LE CRITÈRE EST DONC : QUELLE CARTE PORTE LE PLUS DE STRUCTURE. On compare leurs contrastes
 * locaux, la mesure qui a déjà servi à écarter l'albédo en #431a — et qui donne ici la réponse
 * INVERSE pour certaines matières, ce qui est précisément l'intérêt de mesurer plutôt que de
 * supposer. Le papier avait 2,24 contre 5,95 : son relief est dans le déplacement. Une lave fait
 * l'inverse.
 *
 * ⚠️ ON EXIGE UNE MARGE, PAS UNE SIMPLE INÉGALITÉ. Deux cartes à 5,90 et 5,95 ne disent rien : les
 * départager reviendrait à tirer à pile ou face sur du bruit, et la nature d'une texture changerait
 * d'une version de la source à l'autre. Sous la marge, on reste sur le GRIS, qui est le régime
 * historique et le plus léger.
 */
export const MARGE_NATURE = 1.4;

export function natureDeLaTexture3D(contrasteAlbedo, contrasteRelief){
  const a = Number(contrasteAlbedo), r = Number(contrasteRelief);
  if (!Number.isFinite(a) || !Number.isFinite(r) || r <= 0) return 'gris';
  return a > r * MARGE_NATURE ? 'couleur' : 'gris';
}

/**
 * Le nom du fichier produit, dérivé de l'identifiant et de la NATURE de la texture.
 *
 * ⚠️ LA NATURE VIT DANS LE NOM, ET C'EST CE QUI ÉVITE UNE SECONDE SOURCE. Le dessin doit savoir
 * s'il compose par ÉCART — même décalage sur les trois canaux, qui préserve la teinte — ou par
 * RAPPORT — l'image multipliée par teinte/moyenne, qui préserve les couleurs de la photo. Les deux
 * règles sont incompatibles : appliquer le rapport à un grain gris ramènerait le mélange
 * multiplicatif que #431b1 a mesuré et rejeté.
 *
 * Le déclarer dans le registre en ferait une valeur à tenir d'accord avec un fichier, donc à
 * périmer. Le porter dans le nom du fichier fait que le cuiseur, seul à décider, est aussi seul à
 * nommer : changer de nature RENOMME le fichier, et le registre ne peut pas ne pas suivre.
 *
 * ⚠️ LA RELECTURE VIT AILLEURS, dans `src/bubble-texture.js` : c'est le DESSIN qui en a besoin, et
 * il ne peut pas importer un module qui ouvre des fichiers. Ce fichier-ci ne fait qu'écrire des
 * noms ; il n'en relit aucun.
 */
export function nomDuGrain3D(id, nature = 'gris'){
  // ⚠️ LES ACCENTS SE DÉCOMPOSENT AVANT D'ÊTRE RETIRÉS, ET C'EST UNE CORRECTION. Sans cette
  // normalisation, `[^a-z0-9]+` traitait le « é » comme n'importe quel caractère interdit et le
  // remplaçait par un TIRET : la matière « béton » sortait en `b-ton.png`. Le registre, lui, aurait
  // demandé `beton.png`, et le chargement aurait échoué en laissant la matière sur sa recette
  // dessinée. Trouvé sur la première cuisson réelle d'un identifiant accentué, pas par un test.
  //
  // NFD sépare la lettre de son signe diacritique, la plage \u0300-\u036f les supprime, et « béton »
  // devient « beton ». C'est ce qu'on attend d'un nom de fichier dérivé d'un mot français.
  const base = String(id).trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return nature === 'couleur' ? base + '.couleur.png' : base + '.png';
}


// ── La moitié IMPURE : elle décode, elle écrit, et elle ne se teste pas ────────────────────────

/**
 * ⚠️ L'IMPORT D'ELECTRON EST DYNAMIQUE, ET C'EST INDISPENSABLE. Le décodage JPEG passe par
 * `nativeImage`, qui n'existe que sous Electron. Un `import` en tête de fichier ferait échouer
 * `node --test` au moment même où il importe les fonctions pures ci-dessus — celles qu'on veut
 * justement pouvoir tester sans rien lancer. C'est la même garde que `fetch-fonts.mjs` emploie
 * pour ne pas télécharger onze familles à chaque `npm test`.
 */
async function chargerCarte(chemin, taille = TAILLE_GRAIN, regime = 'matiere'){
  const { nativeImage } = await import('electron');
  const img = nativeImage.createFromPath(chemin);
  if (img.isEmpty()) throw new Error(`carte illisible : ${chemin}`);
  // ⚠️ RECADRER AU CARRÉ AVANT DE RÉDUIRE, ET NON L'INVERSE. Les cartes d'une matière sont carrées,
  // mais une panoramique de ciel fait 2:1 : la ramener directement en 512² l'écraserait du double
  // en largeur. C'est l'erreur exacte qui avait déformé ma première planche de comparaison, et
  // qu'on m'avait signalée. On prend donc le carré CENTRAL, qui est aussi, sur une équirectangulaire,
  // la bande la moins étirée par la projection.
  const { width, height } = img.getSize();
  const cote = Math.min(width, height);
  // Une matière non carrée est étirée, pas recadrée : voir cadrageDeLaCarte3D.
  const carre = cadrageDeLaCarte3D(width, height, regime).mode !== 'recadrer' ? img
    : img.crop({ x: Math.floor((width - cote) / 2), y: Math.floor((height - cote) / 2),
                 width: cote, height: cote });
  const redim = carre.resize({ width: taille, height: taille, quality: 'best' });
  // ⚠️ toBitmap() REND DU BGRA, PAS DU RGBA. Inverser les deux donnerait une teinte par défaut
  // fausse — un parchemin ocre reviendrait bleuté — et un ombrage dont la pente X serait celle
  // du canal bleu. Le genre d'erreur qui produit une image plausible et fausse. La première
  // cuisson réelle l'a confirmé sans ambiguïté : elle rend #C8A678, un ocre. À l'envers, on
  // aurait lu #78A6C8, un bleu.
  const bgra = redim.toBitmap();
  const rgba = Buffer.alloc(bgra.length);
  for (let i = 0; i < bgra.length; i += 4) {
    rgba[i] = bgra[i + 2]; rgba[i + 1] = bgra[i + 1]; rgba[i + 2] = bgra[i]; rgba[i + 3] = bgra[i + 3];
  }
  return rgba;
}

function grisDepuisRgba(rgba){
  const n = Math.floor(rgba.length / 4);
  const g = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    g[i] = 0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2];
  }
  return g;
}

/**
 * Écrit un RGBA. C'est le chemin des textures COULEUR, où l'albédo est le produit.
 *
 * ⚠️ `createFromBuffer` ATTEND DU BGRA, COMME `toBitmap` EN REND. La symétrie est logique et je l'ai
 * manquée : `chargerCarte` reconvertit en RGBA pour que le reste du fichier raisonne en clair, donc
 * il faut RE-inverser avant d'écrire. Le défaut a vécu dans `ecrireGrainPng` depuis #431a sans
 * jamais se voir — un grain est gris, R = G = B, l'inversion n'y change rien. La première texture
 * en couleur l'a révélé au premier coup d'œil : la lave est sortie BLEUE, #2D43AB au lieu de
 * #AC442E, les mêmes octets à l'envers.
 *
 * C'est le cas d'école d'un défaut que seule une donnée plus riche peut faire apparaître, et la
 * raison pour laquelle les deux écritures partagent désormais cette fonction : un seul endroit sait
 * dans quel ordre le moteur veut ses octets.
 */
async function ecrireImagePng(rgba, taille, chemin){
  const { nativeImage } = await import('electron');
  const bgra = Buffer.alloc(rgba.length);
  for (let i = 0; i < rgba.length; i += 4) {
    bgra[i] = rgba[i + 2]; bgra[i + 1] = rgba[i + 1]; bgra[i + 2] = rgba[i]; bgra[i + 3] = 255;
  }
  writeFileSync(chemin, nativeImage.createFromBuffer(bgra, { width: taille, height: taille }).toPNG());
}

async function ecrireGrainPng(grain, taille, chemin){
  const rgba = Buffer.alloc(taille * taille * 4);
  for (let i = 0; i < taille * taille; i++) {
    rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = grain[i]; rgba[i * 4 + 3] = 255;
  }
  await ecrireImagePng(rgba, taille, chemin);
}

async function main(){
  const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
  const SOURCES = join(RACINE, 'assets', 'textures', 'sources');
  const SORTIE = join(RACINE, 'assets', 'textures');
  const id = process.argv[2];
  if (!id) {
    console.error('usage : npm run bake-textures -- <identifiant>');
    console.error('  les cartes sont lues dans assets/textures/sources/<identifiant>/');
    process.exit(1);
  }
  const dossier = join(SOURCES, id);
  if (!existsSync(dossier)) throw new Error(`dossier introuvable : ${dossier}`);
  const fichiers = readdirSync(dossier).filter(f => /\.(jpe?g|png)$/i.test(f));
  const cartes = regimeDeCuisson3D(fichiers);

  // ⚠️ ON REFUSE, ON NE SE RABAT PAS. Le régime « image » existe pour les textures qui n'ont pas de
  // surface ; il ne doit jamais rattraper une matière à qui il manque une carte. La distinction
  // vit dans `regimeDeCuisson3D`, et le message dit quelle carte chercher.
  if (cartes.refus) throw new Error(`${id} : ${cartes.refus}`);

  // ⚠️ RECADRÉ AU CARRÉ AVANT TOUT, et ce n'est pas cosmétique. Une panoramique fait 2:1 ; la
  // redimensionner en 512² l'écraserait du double dans un sens. C'est l'erreur exacte qui avait
  // déformé ma première planche de comparaison, signalée à l'époque.
  const { GROUND_TYPE_DEFS, TRACÉ_DEFAULTS } = await import('../src/constants.js');
  const taille = tailleDuGrain3D(id, idsEnGrandFormat3D(GROUND_TYPE_DEFS, TRACÉ_DEFAULTS));
  const aRef = (g) => versReference3D(g, taille, TAILLE_GRAIN);
  const regime = cartes.regime === 'image' ? 'image' : 'matiere';
  const relief = grisDepuisRgba(await chargerCarte(join(dossier, cartes.relief), taille, regime));
  const normale = cartes.normale ? await chargerCarte(join(dossier, cartes.normale), taille, regime) : null;
  const albedoRgba = cartes.albedo ? await chargerCarte(join(dossier, cartes.albedo), taille, regime) : null;
  const { nativeImage } = await import('electron');
  const dim = nativeImage.createFromPath(join(dossier, cartes.relief)).getSize();
  const cadrage = cadrageDeLaCarte3D(dim.width, dim.height, regime);
  const teinte = albedoRgba ? teinteDominante3D(albedoRgba) : '#FFFFFF';

  // ⚠️ LA NATURE SE MESURE SUR LES CARTES D'ORIGINE, PAS SUR LE GRAIN. Le grain est normalisé à
  // 6,4 par construction : le comparer à quoi que ce soit ne dirait rien. Ce qu'on veut savoir est
  // laquelle des deux cartes SOURCES porte le plus de structure.
  const contrasteRelief = contrasteLocal3D(aRef(relief), TAILLE_GRAIN);
  const contrasteAlbedo = albedoRgba
    ? contrasteLocal3D(aRef(grisDepuisRgba(albedoRgba)), TAILLE_GRAIN) : 0;
  const nature = natureDeLaTexture3D(contrasteAlbedo, contrasteRelief);

  // Le grain sert au régime GRIS, et sa luminance sert de support aux mesures dans les deux cas :
  // couture et motif se jugent sur ce qui se répète, indépendamment de la couleur.
  const { grain, gain } = grainNormalise3D(relief, normale, taille, CONTRASTE_CIBLE, TAILLE_GRAIN);
  // Toutes les mesures se lisent à l'échelle de référence, où leurs seuils ont été calibrés.
  const mesure = aRef(nature === 'couleur' ? grisDepuisRgba(albedoRgba) : grain);
  const contraste = contrasteLocal3D(mesure, TAILLE_GRAIN);
  const couture = coutureCarrelage3D(mesure, TAILLE_GRAIN);
  // Mesuré sur ce qui est LIVRÉ et non sur les cartes d'origine : le rapport y est plus tranché
  // (0,126 contre 0,241) que sur le déplacement (0,16 contre 0,26).
  const tuile = partAEchelleDeTuile3D(mesure, TAILLE_GRAIN);

  mkdirSync(SORTIE, { recursive: true });
  const sortie = join(SORTIE, nomDuGrain3D(id, nature));
  // ⚠️ LE FICHIER DE L'AUTRE NATURE EST SUPPRIMÉ, sans quoi il survit à la recuisson. Trouvé quand
  // une nouvelle source a fait basculer le sable de gris à couleur et le gravier de couleur à gris :
  // `sable.couleur.png` s'écrivait à côté de l'ancien `sable.png`, que le registre continuait de
  // désigner. L'application aurait affiché l'ANCIENNE texture, sans un mot, pendant que le rapport
  // annonçait la nouvelle. Un seul fichier par identifiant, et c'est le dernier cuit.
  const concurrent = join(SORTIE, nomDuGrain3D(id, nature === 'couleur' ? 'gris' : 'couleur'));
  if (existsSync(concurrent)) {
    rmSync(concurrent);
    console.warn(`  ⚠️  ${basename(concurrent)} supprimé : la nature a changé. Le registre doit maintenant`
      + ` déclarer grain: '${basename(sortie, '.png')}'.`);
  }
  if (nature === 'couleur') await ecrireImagePng(albedoRgba, taille, sortie);
  else await ecrireGrainPng(grain, taille, sortie);

  console.log(`${id} → ${basename(sortie)}  (${taille}², mesures à ${TAILLE_GRAIN}²)`);
  // ⚠️ LE RÉGIME EST IMPRIMÉ, JAMAIS DEVINÉ EN SILENCE. Une matière cuite par erreur en image
  // perdrait 30 % de son grain — le terme directionnel — sans rien changer d'autre. Le seul moyen
  // de s'en apercevoir est de le lire ici.
  console.log(`  régime    ${cartes.regime === 'image'
    ? 'IMAGE — la luminance tient lieu de relief, pas de terme directionnel'
    : 'matière — relief + normale'}`);
  console.log(`  relief    ${cartes.relief}`);
  if (cadrage.mode === 'etirer') {
    console.log(`  rapport   ${cadrage.rapport.toFixed(2)}:1 (${dim.width} × ${dim.height}), ÉTIRÉ au carré pour garder le carrelage :`);
    console.log('            la tuile 3D doit rendre ce rapport, sinon le motif paraîtra écrasé.');
  }
  if (cartes.normale) console.log(`  normale   ${cartes.normale}`);
  console.log(`  teinte    ${teinte}${cartes.albedo ? '' : '  (aucun albédo : blanc par défaut)'}`);
  // ⚠️ LA NATURE ET SA MESURE SONT IMPRIMÉES ENSEMBLE. Le verdict seul ne se relit pas : c'est le
  // RAPPORT qui dit s'il était franc ou de justesse, donc s'il vaut la peine d'être discuté.
  console.log(`  nature    ${nature.toUpperCase()}  — albédo ${contrasteAlbedo.toFixed(2)} contre `
    + `relief ${contrasteRelief.toFixed(2)}, rapport ${(contrasteAlbedo / Math.max(contrasteRelief, 1e-6)).toFixed(2)}`
    + ` (bascule au-delà de ${MARGE_NATURE})`);
  if (nature === 'couleur') {
    console.log('            → l\'albédo est livré TEL QUEL, la teinte agira en rapport');
  } else {
    console.log(`  gain      ${gain.toFixed(2)}   contraste ${contraste.toFixed(2)} / ${CONTRASTE_CIBLE}`);
  }
  console.log(`  couture   ${couture.toFixed(2)}   (1,0 = raccord invisible)`);
  if (couture > COUTURE_SUSPECTE && coutureSurUnJoint3D(mesure, TAILLE_GRAIN)) {
    console.log(`  ℹ️  ${couture.toFixed(2)} > ${COUTURE_SUSPECTE}, mais le bord tombe sur un JOINT du motif :`);
    console.log('      son écart ne dépasse pas celui des autres lignes de l\'image. Faux positif probable,');
    console.log('      fréquent sur un parquet ou un carrelage. Vérifiez sur un carrelage 2×2.');
  } else if (couture > COUTURE_SUSPECTE) {
    console.warn(`  ⚠️  ${couture.toFixed(2)} > ${COUTURE_SUSPECTE} : cette texture NE SE CARRELLE PAS.`);
    console.warn(`      Le dessin centre la tuile sur la Bulle, donc rien ne se voit tant qu'une`);
    console.warn(`      Bulle reste plus petite que ${TAILLE_GRAIN} px. Au-delà, le raccord apparaîtra.`);
  }
  console.log(`  tuile     ${tuile.part.toFixed(3)}   (part du contraste à l'échelle de la tuile)`);
  if (tuile.suspect) {
    console.warn(`  ⚠️  ${tuile.part.toFixed(3)} > ${PART_TUILE_SUSPECTE} : taches ou impressions ?`);
    console.warn('      Ce motif survivra au carrelage. Un contraste correct ne garantit pas');
    console.warn('      une texture utilisable — regardez-la avant de la retenir.');
  }
}

/**
 * Rendre la main, ce qu'un script Electron ne fait PAS tout seul.
 *
 * ⚠️ LES AUTRES OUTILS DE `tools/` TOURNENT SOUS NODE, QUI S'ARRÊTE QUAND IL N'A PLUS RIEN À FAIRE.
 * Electron, lui, est une APPLICATION : démarrer un script sous `electron` ouvre une boucle
 * d'événements qui attend des fenêtres et des signaux, indéfiniment. Sans sortie explicite, le
 * cuiseur écrivait son PNG, imprimait son rapport complet… et laissait le terminal pendu.
 *
 * ⚠️ ET JE L'AI DÉCLARÉ « VALIDÉ DE BOUT EN BOUT » SUR LA FOI DE CE RAPPORT. Le signalement est
 * venu de l'usage. J'avais vérifié que l'outil IMPRIME, jamais qu'il SE TERMINE — la même erreur
 * de mesure que ce dépôt nomme ailleurs : constater une présence en croyant mesurer une absence.
 * Un rapport complet ressemble beaucoup à une fin normale.
 *
 * ⚠️ ON VIDE `stdout` AVANT DE COUPER. Sous Windows, une sortie REDIRIGÉE — vers un fichier, ou
 * dans un tube — est écrite de façon asynchrone. Couper aussitôt tronquerait les dernières lignes,
 * et le premier à s'en apercevoir serait celui qui journalise une cuisson plutôt que de la lire.
 */
async function rendreLaMain(code){
  await new Promise(r => process.stdout.write('', r));
  try {
    const { app } = await import('electron');
    if (app && typeof app.exit === 'function') { app.exit(code); return; }
  } catch { /* hors Electron : la sortie ordinaire suffit */ }
  process.exit(code);
}

/**
 * La garde de `fetch-fonts.mjs` et de `bump-version.mjs` : importer ce module ne déclenche rien.
 *
 * ⚠️ `pathToFileURL` ET NON UNE CONCATÉNATION. Trois variantes de cette garde cohabitent dans
 * `tools/`, et l'une d'elles écrit `file://${argv[1]}` — ce qui, sur Windows, produit
 * `file://C:\WebProjects\...`, une URL qui ne correspondra JAMAIS à `import.meta.url`. L'outil ne
 * se lancerait pas, et ne dirait pas pourquoi. `tools/make-test-glb.mjs` porte encore cette forme.
 */
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().then(
    () => rendreLaMain(0),
    (e) => { console.error(e.message); return rendreLaMain(1); },
  );
}
