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

import { writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
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
 */
export function grainNormalise3D(relief, normaleRgba, taille, cible = CONTRASTE_CIBLE){
  const n = taille * taille;
  let somme = 0;
  for (let i = 0; i < n; i++) somme += relief[i];
  const moyenne = somme / n;
  const ombrage = ombrageDepuisNormale3D(normaleRgba, taille);
  const brut = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    brut[i] = (1 - PART_OMBRAGE) * (relief[i] - moyenne) + PART_OMBRAGE * ombrage[i];
  }
  // Le contraste du mélange AVANT gain, pour en déduire le gain. Recentré sur 128 : la mesure
  // porte sur des écarts entre voisins, donc le décalage n'y change rien, mais on reste homogène.
  const centre = new Float64Array(n);
  for (let i = 0; i < n; i++) centre[i] = GRIS_NEUTRE + brut[i];
  const c0 = contrasteLocal3D(centre, taille);
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
export function classerCartes3D(noms){
  const trouve = (motifs) => noms.find(f => motifs.some(m => m.test(f))) || null;
  return {
    relief: trouve([/_displacement/i, /_disp[_.]/i, /_height/i, /_ao[_.]/i, /_ambientocclusion/i]),
    normale: trouve([/_normalgl/i, /_nor_gl/i, /_normal_gl/i]),
    albedo: trouve([/_color/i, /_diff[_.]/i, /_albedo/i, /_basecolor/i]),
  };
}

/** Le nom du fichier produit, dérivé de l'identifiant de la matière. */
export function nomDuGrain3D(id){
  return String(id).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '.png';
}

// ── La moitié IMPURE : elle décode, elle écrit, et elle ne se teste pas ────────────────────────

/**
 * ⚠️ L'IMPORT D'ELECTRON EST DYNAMIQUE, ET C'EST INDISPENSABLE. Le décodage JPEG passe par
 * `nativeImage`, qui n'existe que sous Electron. Un `import` en tête de fichier ferait échouer
 * `node --test` au moment même où il importe les fonctions pures ci-dessus — celles qu'on veut
 * justement pouvoir tester sans rien lancer. C'est la même garde que `fetch-fonts.mjs` emploie
 * pour ne pas télécharger onze familles à chaque `npm test`.
 */
async function chargerCarte(chemin){
  const { nativeImage } = await import('electron');
  const img = nativeImage.createFromPath(chemin);
  if (img.isEmpty()) throw new Error(`carte illisible : ${chemin}`);
  const redim = img.resize({ width: TAILLE_GRAIN, height: TAILLE_GRAIN, quality: 'best' });
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

async function ecrireGrainPng(grain, taille, chemin){
  const { nativeImage } = await import('electron');
  const rgba = Buffer.alloc(taille * taille * 4);
  for (let i = 0; i < taille * taille; i++) {
    rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = grain[i]; rgba[i * 4 + 3] = 255;
  }
  const img = nativeImage.createFromBuffer(rgba, { width: taille, height: taille });
  writeFileSync(chemin, img.toPNG());
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
  const cartes = classerCartes3D(fichiers);

  // ⚠️ ON REFUSE, ON NE SE RABAT PAS. Sans relief, la seule normale donnerait un grain pauvre et
  // surtout SILENCIEUX : rien ne dirait que la matière manquait. Le dépôt paie assez cher les
  // replis silencieux pour ne pas en ajouter un ici.
  if (!cartes.relief) {
    throw new Error(`${id} : ni déplacement ni occlusion ambiante parmi ${fichiers.join(', ')}`);
  }
  if (!cartes.normale) throw new Error(`${id} : pas de carte de normales en convention OpenGL`);

  const relief = grisDepuisRgba(await chargerCarte(join(dossier, cartes.relief)));
  const normale = await chargerCarte(join(dossier, cartes.normale));
  const { grain, gain, contraste } = grainNormalise3D(relief, normale, TAILLE_GRAIN);
  const couture = coutureCarrelage3D(grain, TAILLE_GRAIN);
  // Mesuré sur le GRAIN et non sur le relief : c'est le grain qui est livré, et le rapport y est
  // plus tranché (0,126 contre 0,241) que sur les cartes d'origine (0,16 contre 0,26).
  const tuile = partAEchelleDeTuile3D(grain, TAILLE_GRAIN);
  const teinte = cartes.albedo
    ? teinteDominante3D(await chargerCarte(join(dossier, cartes.albedo))) : '#FFFFFF';

  mkdirSync(SORTIE, { recursive: true });
  const sortie = join(SORTIE, nomDuGrain3D(id));
  await ecrireGrainPng(grain, TAILLE_GRAIN, sortie);

  console.log(`${id} → ${basename(sortie)}`);
  console.log(`  relief    ${cartes.relief}`);
  console.log(`  normale   ${cartes.normale}`);
  console.log(`  teinte    ${teinte}${cartes.albedo ? '' : '  (aucun albédo : blanc par défaut)'}`);
  console.log(`  gain      ${gain.toFixed(2)}   contraste ${contraste.toFixed(2)} / ${CONTRASTE_CIBLE}`);
  console.log(`  couture   ${couture.toFixed(2)}   (1,0 = raccord invisible)`);
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
