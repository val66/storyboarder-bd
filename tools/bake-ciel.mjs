/**
 * @file tools/bake-ciel.mjs
 * Déposer les panoramas de ciel (#436) dans `assets/textures/`, après les avoir vérifiés.
 *
 * Usage : npm run bake-ciel
 *
 * Lit `assets/textures/sources/ciel-jour/` et `assets/textures/sources/ciel-nuit/`, un JPEG
 * équirectangulaire par dossier, et les copie sous `ciel-jour.jpg` et `ciel-nuit.jpg`, les noms que
 * `src/sky-3d.js` charge.
 *
 * ⚠️ IL N'Y A RIEN À CUIRE, ET C'EST POURQUOI CET OUTIL N'EST PAS DANS `bake-textures.mjs`. Un
 * panorama s'affiche tel qu'il est : pas de grain à extraire, pas de contraste à normaliser, pas
 * de couture à mesurer, puisqu'il fait le tour complet. Il tourne donc sous Node seul, sans
 * Electron, et lit les dimensions dans l'en-tête du JPEG.
 *
 * ⚠️ MAIS LES DIMENSIONS SE VÉRIFIENT, ET LES DEUX BORNES ONT UNE RAISON :
 *   - 2:1, sans quoi ce n'est pas un panorama équirectangulaire et le ciel serait étiré ;
 *   - au plus 4096 de large : décodée, une image de 4096 × 2048 pèse 32 Mo de mémoire graphique,
 *     45 avec ses mipmaps. Une 8K en pèserait quatre fois plus, par ciel ;
 *   - au moins 2048 : un champ de 36° n'en reçoit qu'un dixième, soit 200 pixels pour toute la
 *     largeur d'une Case. En dessous, le ciel est visiblement flou.
 */
import { readFileSync, readdirSync, existsSync, copyFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');

export const CIELS = ['jour', 'nuit'];
export const LARGEUR_MIN = 2048, LARGEUR_MAX = 4096;

/**
 * Les dimensions d'un JPEG, lues dans son marqueur SOF. Fonction PURE, `null` si ce n'en est pas un.
 * Les marqueurs SOF0 à SOF15 portent la taille, sauf DHT (C4), JPG (C8) et DAC (CC), qui partagent
 * leur plage de numéros.
 */
export function dimensionsJpeg(octets){
  const b = octets;
  if (!b || b.length < 4 || b[0] !== 0xFF || b[1] !== 0xD8) return null;
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xFF) return null;
    const m = b[i + 1];
    if (m === 0xFF) { i++; continue; }
    const longueur = (b[i + 2] << 8) | b[i + 3];
    if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) {
      return { hauteur: (b[i + 5] << 8) | b[i + 6], largeur: (b[i + 7] << 8) | b[i + 8] };
    }
    i += 2 + longueur;
  }
  return null;
}

/** Le verdict sur un panorama : `null` s'il convient, sinon la raison du refus. Fonction PURE. */
export function refusDuPanorama(dim){
  if (!dim) return 'ce n\'est pas un JPEG lisible';
  const { largeur, hauteur } = dim;
  if (largeur !== 2 * hauteur) return `${largeur} × ${hauteur} n'est pas un panorama équirectangulaire (2:1 attendu)`;
  if (largeur > LARGEUR_MAX) return `${largeur} de large : prenez la version 4K, une ${Math.round(largeur / 1024)}K pèserait trop en mémoire graphique`;
  if (largeur < LARGEUR_MIN) return `${largeur} de large : trop peu pour une Case, prenez au moins la version 2K`;
  return null;
}

/** Le fichier source d'un dossier, ou la raison pour laquelle on ne peut pas choisir. Fonction PURE. */
export function sourceUnique(noms){
  const jpegs = noms.filter(n => /\.jpe?g$/i.test(n));
  if (jpegs.length === 0) return { refus: 'aucun JPEG (les .hdr et .exr ne sont pas lus : prenez le « JPG tonemappé »)' };
  if (jpegs.length > 1) return { refus: `${jpegs.length} JPEG, un seul attendu : retirez l'ancien avant de déposer le nouveau` };
  return { nom: jpegs[0] };
}

function main(){
  let echecs = 0;
  for (const ciel of CIELS) {
    const dossier = join(RACINE, 'assets', 'textures', 'sources', 'ciel-' + ciel);
    if (!existsSync(dossier)) { console.log(`ciel-${ciel} : pas de dossier source, le ciel calculé sera employé`); continue; }
    const choix = sourceUnique(readdirSync(dossier));
    if (choix.refus) { console.error(`ciel-${ciel} : ${choix.refus}`); echecs++; continue; }
    const source = join(dossier, choix.nom);
    const dim = dimensionsJpeg(readFileSync(source));
    const refus = refusDuPanorama(dim);
    if (refus) { console.error(`ciel-${ciel} : ${choix.nom} refusé, ${refus}`); echecs++; continue; }
    const cible = join(RACINE, 'assets', 'textures', `ciel-${ciel}.jpg`);
    copyFileSync(source, cible);
    console.log(`ciel-${ciel} : ${choix.nom} (${dim.largeur} × ${dim.hauteur}) déposé dans assets/textures/ciel-${ciel}.jpg`);
  }
  if (echecs) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) main();
