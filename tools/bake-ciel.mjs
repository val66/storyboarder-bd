/**
 * @file tools/bake-ciel.mjs
 * Préparer les panoramas de ciel (#436) et les déposer dans `assets/textures/`.
 *
 * Usage : npm run bake-ciel
 *
 * Lit `assets/textures/sources/ciel-jour/` et `assets/textures/sources/ciel-nuit/`, un JPEG
 * équirectangulaire par dossier, en garde la MOITIÉ HAUTE, la réduit à la largeur que le registre
 * de `src/sky-3d.js` demande pour ce ciel, et l'écrit sous `ciel-jour.jpg` et `ciel-nuit.jpg`.
 *
 * ⚠️ IL TOURNE SOUS ELECTRON, COMME `bake-textures.mjs`, parce qu'il faut décoder et réencoder.
 * La première version tournait sous Node seul et ne faisait que copier : elle déposait des 4K
 * entières, dont la moitié basse n'est jamais vue et dont la taille, vue à l'écran, était floue
 * (#436b). `nativeImage` découpe, réduit et écrit sans dépendance de plus.
 *
 * ⚠️ LES DÉCISIONS SONT PURES ET TESTÉES SOUS NODE ; seule la colle à `nativeImage` ne l'est pas,
 * Electron ne tournant pas dans l'environnement des tests.
 */
import { readdirSync, existsSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { CIEL_PANORAMAS } from '../src/sky-3d.js';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Au-delà, une image source ne se décode plus raisonnablement : 16K fait déjà 512 Mo décodé. */
export const LARGEUR_SOURCE_MAX = 16384;

/** La qualité JPEG du dépôt. Un ciel n'a pas de couture à protéger, contrairement aux grains. */
export const QUALITE_JPEG = 92;

/**
 * Le verdict sur une source : `null` si elle convient, sinon la raison du refus. Fonction PURE.
 * `cible` est la largeur que le registre demande pour ce ciel.
 */
export function refusDuPanorama(dim, cible){
  if (!dim || !(dim.largeur > 0)) return 'image illisible';
  const { largeur, hauteur } = dim;
  if (largeur !== 2 * hauteur) return `${largeur} × ${hauteur} n'est pas un panorama équirectangulaire (2:1 attendu)`;
  if (largeur > LARGEUR_SOURCE_MAX) return `${largeur} de large : 16K au plus`;
  if (largeur < cible) return `${largeur} de large : ce ciel en demande ${cible}, prenez au moins la version ${Math.round(cible / 1024)}K`;
  return null;
}

/** Ce qu'on découpe puis la taille à laquelle on réduit. Fonction PURE. */
export function decoupeDuPanorama(dim, cible){
  return {
    rectangle: { x: 0, y: 0, width: dim.largeur, height: dim.hauteur / 2 },
    taille: { width: cible, height: cible / 4 },
  };
}

/** Le fichier source d'un dossier, ou la raison pour laquelle on ne peut pas choisir. Fonction PURE. */
export function sourceUnique(noms){
  const jpegs = noms.filter(n => /\.jpe?g$/i.test(n));
  if (jpegs.length === 0) return { refus: 'aucun JPEG (les .hdr et .exr ne sont pas lus : prenez le « JPG tonemappé »)' };
  if (jpegs.length > 1) return { refus: `${jpegs.length} JPEG, un seul attendu : retirez l'ancien avant de déposer le nouveau` };
  return { nom: jpegs[0] };
}

/**
 * La saturation moyenne (0 à 255) de la bande que voit une Case, de 2 à 15° au-dessus de
 * l'horizon. Fonction PURE, sur des pixels BGRA de la moitié haute (dernière ligne = horizon).
 *
 * ⚠️ C'EST LA SEULE BANDE QU'UN CADRAGE HABITUEL MONTRE, et le premier ciel de jour l'a appris à
 * ses dépens : bleu à partir de 25°, une brume grise presque uniforme en dessous. À l'écran, la
 * Case ne montrait que du gris (#436b). Mesuré sur lui : 26 dans cette bande, 53 de 15 à 30°.
 * L'outil n'en refuse pas pour autant un ciel, c'est une affaire de goût ; il le DIT.
 */
export const BANDE_BASSE = [2, 15], SATURATION_BANDE_MIN = 35;
export function saturationDeLaBandeBasse(bgra, largeur, hauteur){
  const ligne = (e) => Math.round(hauteur * (1 - e / 90));
  const [r0, r1] = [ligne(BANDE_BASSE[1]), ligne(BANDE_BASSE[0])];
  let somme = 0, n = 0;
  for (let y = r0; y < r1; y++) {
    for (let x = 0; x < largeur; x++) {
      const i = 4 * (y * largeur + x);
      const b = bgra[i], g = bgra[i + 1], r = bgra[i + 2];
      somme += Math.max(r, g, b) - Math.min(r, g, b); n++;
    }
  }
  return n ? somme / n : 0;
}

/**
 * Effacer les étoiles d'un ciel de nuit en gardant sa lueur : une OUVERTURE morphologique, un
 * minimum puis un maximum sur un carré de côté 2·rayon + 1, canal par canal. Fonction PURE.
 *
 * ⚠️ RÉDUIRE NE SUFFIT PAS, ET JE L'AI VU AVANT DE L'ÉCRIRE. À 1024 de large, les étoiles brillantes
 * survivent en points d'un pixel, que la Case agrandit 5 fois : des taches floues à nouveau. Le
 * minimum efface tout ce qui est plus petit que le carré, le maximum rend aux formes larges, la
 * Voie lactée, leur étendue. Essayé sur le panorama du dépôt, rayon 2 à 2048 de large : plus une
 * étoile, la lueur intacte.
 *
 * L'horizontale BOUCLE : le panorama fait le tour, son bord gauche touche son bord droit.
 */
export const RAYON_OUVERTURE = 2;
export function ouvertureMorphologique(bgra, largeur, hauteur, rayon = RAYON_OUVERTURE){
  const passe = (src, choix) => {
    const tmp = new Uint8Array(src.length), dst = new Uint8Array(src.length);
    for (let y = 0; y < hauteur; y++) for (let x = 0; x < largeur; x++) for (let k = 0; k < 3; k++) {
      let v = src[4 * (y * largeur + x) + k];
      for (let d = -rayon; d <= rayon; d++) v = choix(v, src[4 * (y * largeur + ((x + d) % largeur + largeur) % largeur) + k]);
      tmp[4 * (y * largeur + x) + k] = v;
    }
    for (let y = 0; y < hauteur; y++) for (let x = 0; x < largeur; x++) {
      for (let k = 0; k < 3; k++) {
        let v = tmp[4 * (y * largeur + x) + k];
        for (let d = -rayon; d <= rayon; d++) {
          const yy = Math.min(hauteur - 1, Math.max(0, y + d));
          v = choix(v, tmp[4 * (yy * largeur + x) + k]);
        }
        dst[4 * (y * largeur + x) + k] = v;
      }
      dst[4 * (y * largeur + x) + 3] = 255;
    }
    return dst;
  };
  return passe(passe(bgra, Math.min), Math.max);
}

async function main(){
  const { nativeImage } = await import('electron');
  let echecs = 0;
  for (const [ciel, def] of Object.entries(CIEL_PANORAMAS)) {
    const dossier = join(RACINE, 'assets', 'textures', 'sources', 'ciel-' + ciel);
    if (!existsSync(dossier)) { console.log(`ciel-${ciel} : pas de dossier source, le ciel calculé sera employé`); continue; }
    const choix = sourceUnique(readdirSync(dossier));
    if (choix.refus) { console.error(`ciel-${ciel} : ${choix.refus}`); echecs++; continue; }
    const img = nativeImage.createFromPath(join(dossier, choix.nom));
    const { width, height } = img.getSize();
    const dim = img.isEmpty() ? null : { largeur: width, hauteur: height };
    const refus = refusDuPanorama(dim, def.largeur);
    if (refus) { console.error(`ciel-${ciel} : ${choix.nom} refusé, ${refus}`); echecs++; continue; }
    const { rectangle, taille } = decoupeDuPanorama(dim, def.largeur);
    let sortie;
    if (def.etoiles) {
      // Un ciel qui reçoit les étoiles calculées perd les siennes : on ouvre au double de la taille
      // finale, puis on réduit, ce qui adoucit encore la lueur.
      const l2 = 2 * taille.width, h2 = 2 * taille.height;
      const double = img.crop(rectangle).resize({ width: l2, height: h2, quality: 'best' });
      const ouvert = ouvertureMorphologique(double.toBitmap(), l2, h2);
      sortie = nativeImage.createFromBuffer(Buffer.from(ouvert), { width: l2, height: h2 }).resize({ ...taille, quality: 'best' });
    } else {
      sortie = img.crop(rectangle).resize({ ...taille, quality: 'best' });
    }
    writeFileSync(join(RACINE, 'assets', 'textures', def.fichier), sortie.toJPEG(QUALITE_JPEG));
    console.log(`ciel-${ciel} : ${choix.nom} (${width} × ${height}) → ${def.fichier} (${taille.width} × ${taille.height})`);
    if (def.etoiles === 0) {
      const sat = saturationDeLaBandeBasse(sortie.toBitmap(), taille.width, taille.height);
      console.log(`  saturation de 2 à 15° au-dessus de l'horizon : ${sat.toFixed(0)}`
        + (sat < SATURATION_BANDE_MIN ? `  ⚠️ sous ${SATURATION_BANDE_MIN} : la bande qu'une Case montre est grise, cherchez un ciel aux nuages bas` : ''));
    }
  }
  return echecs;
}

/** Electron ne rend pas la main tout seul : voir la même fonction dans `bake-textures.mjs`. */
async function rendreLaMain(code){
  await new Promise(r => process.stdout.write('', r));
  try {
    const { app } = await import('electron');
    if (app && typeof app.exit === 'function') { app.exit(code); return; }
  } catch { /* hors Electron : la sortie ordinaire suffit */ }
  process.exit(code);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().then(
    (echecs) => rendreLaMain(echecs ? 1 : 0),
    (e) => { console.error(e.message); return rendreLaMain(1); },
  );
}
