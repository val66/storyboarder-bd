/**
 * @file tools/make-skeleton-fixture.mjs
 * Fabriquer, et REFABRIQUER, les fixtures de squelette de `tests/fixtures/squelette-*.json`.
 *
 * POURQUOI CET OUTIL EXISTE MAINTENANT ET PAS AVANT. Les huit premières fixtures ont été extraites
 * à la main, une par une. Tant qu'elles ne portaient que `{i, name, children}`, c'était tenable.
 * L'ajout des positions de repos (chantier créatures, tâche #364) demande de toutes les reprendre,
 * et une extraction manuelle répétée sur douze fichiers finit toujours par diverger d'un fichier.
 *
 * CE QU'IL PRÉSERVE, ET C'EST L'ESSENTIEL. Le champ `origine` de chaque fixture est une phrase
 * écrite à la main qui dit d'où vient le rig et ce qu'il apporte au corpus. Elle ne se régénère
 * pas, elle se recopie. Une fixture régénérée qui perdrait sa phrase perdrait la seule chose que
 * le `.glb` ne contient pas.
 *
 * IL REFUSE DE RÉÉCRIRE UNE FIXTURE QUI NE CORRESPOND PAS. Avant d'écrire, il compare la liste
 * d'os régénérée à l'existante, identifiants et noms. Au moindre écart il s'arrête sans rien
 * toucher : les `.glb` ne sont pas versionnés (ils appartiennent à l'utilisateur), donc rien ne
 * garantit qu'un fichier du même nom soit le même fichier. Se tromper de source réécrirait
 * silencieusement un instantané que toute la suite prend pour référence.
 *
 * LES POSITIONS SONT EN MONDE, AU REPOS, ET À PRÉCISION RELATIVE. `toPrecision(6)` plutôt qu'un
 * arrondi décimal : les échelles vont du centième au millier selon l'exportateur, et un arrondi à
 * quatre décimales écraserait à zéro tout un rig modélisé en unités Blender. Aucune normalisation
 * n'est appliquée, la fixture reste une réduction FIDÈLE du fichier ; ramener à l'échelle est une
 * décision du code, pas de la donnée.
 *
 * Usage :  node tools/make-skeleton-fixture.mjs <dossier-des-glb>
 *          node tools/make-skeleton-fixture.mjs <dossier> --nouveau <nom-fixture> <fichier.glb>
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURES = join(RACINE, 'tests/fixtures');

/** Le morceau JSON d'un `.glb`, sans décoder un seul octet de géométrie (cf. inspect-glb.mjs). */
export function lireJsonGlb(chemin){
  const b = readFileSync(chemin);
  if (b.length < 12 || b.readUInt32LE(0) !== 0x46546C67) return null;
  let o = 12;
  while (o + 8 <= b.length) {
    const len = b.readUInt32LE(o), typ = b.readUInt32LE(o + 4);
    if (typ === 0x4E4F534A) return JSON.parse(b.slice(o + 8, o + 8 + len).toString('utf8'));
    o += 8 + len;
  }
  return null;
}

const mul = (a, b) => {
  const r = new Array(16).fill(0);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) for (let k = 0; k < 4; k++) r[i * 4 + j] += a[i * 4 + k] * b[k * 4 + j];
  return r;
};

/** La matrice locale d'un nœud glTF, que sa transformation soit donnée en TRS ou en matrice. */
const matriceLocale = (n) => {
  if (n.matrix) return n.matrix.slice();
  const t = n.translation || [0, 0, 0], q = n.rotation || [0, 0, 0, 1], s = n.scale || [1, 1, 1];
  const [x, y, z, w] = q, x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  return [
    (1 - (yy + zz)) * s[0], (xy + wz) * s[0], (xz - wy) * s[0], 0,
    (xy - wz) * s[1], (1 - (xx + zz)) * s[1], (yz + wx) * s[1], 0,
    (xz + wy) * s[2], (yz - wx) * s[2], (1 - (xx + yy)) * s[2], 0,
    t[0], t[1], t[2], 1,
  ];
};

const arrondi = (v) => Number(Number(v).toPrecision(6));

/**
 * La liste d'os d'un `.glb` : `{ i, name, children, t }`.
 *
 * Ne retient que les nœuds cités par `skins[].joints`, et ne garde d'`children` que ceux qui sont
 * eux-mêmes des os. Un `.glb` sans `skin` ne contient AUCUN squelette et rend `null` : trois des
 * modèles fournis sont dans ce cas (`bison`, `gecko`, `bed_bug`).
 */
export function osDuGlb(gltf){
  const nodes = gltf.nodes || [];
  const joints = new Set();
  (gltf.skins || []).forEach(s => (s.joints || []).forEach(j => joints.add(j)));
  if (!joints.size) return null;

  const parent = new Array(nodes.length).fill(-1);
  nodes.forEach((n, i) => (n.children || []).forEach(c => { parent[c] = i; }));
  const cache = new Array(nodes.length).fill(null);
  const monde = (i) => {
    if (cache[i]) return cache[i];
    const l = matriceLocale(nodes[i]);
    cache[i] = parent[i] < 0 ? l : mul(l, monde(parent[i]));
    return cache[i];
  };

  return [...joints].map(i => {
    const m = monde(i);
    return {
      i,
      name: nodes[i].name || String(i),
      children: (nodes[i].children || []).filter(c => joints.has(c)),
      t: [arrondi(m[12]), arrondi(m[13]), arrondi(m[14])],
    };
  });
}

/** Deux listes d'os décrivent-elles le MÊME squelette ? Identifiants et noms, dans l'ordre. */
const memeSquelette = (a, b) =>
  a.length === b.length &&
  a.every((o, k) => o.i === b[k].i && o.name === b[k].name &&
    JSON.stringify(o.children) === JSON.stringify(b[k].children));

const ecrire = (nom, origine, os) =>
  writeFileSync(join(FIXTURES, `squelette-${nom}.json`),
    JSON.stringify({ origine, os }, null, 1) + '\n', 'utf8');

function principal(){
  const [dossier, drapeau, nomNouveau, fichierNouveau] = process.argv.slice(2);
  if (!dossier || !existsSync(dossier)) {
    console.error('Usage : node tools/make-skeleton-fixture.mjs <dossier-des-glb> [--nouveau <nom> <fichier.glb>]');
    process.exit(2);
  }

  const glbs = readdirSync(dossier).filter(f => f.toLowerCase().endsWith('.glb'));
  const parFichier = new Map();
  glbs.forEach(f => {
    const g = lireJsonGlb(join(dossier, f));
    const os = g && osDuGlb(g);
    if (os) parFichier.set(f, os);
    else console.log(`  ${f} : AUCUN RIG, ignoré`);
  });

  if (drapeau === '--nouveau') {
    const os = parFichier.get(fichierNouveau);
    if (!os) { console.error(`${fichierNouveau} : introuvable ou sans rig`); process.exit(1); }
    const chemin = join(FIXTURES, `squelette-${nomNouveau}.json`);
    const origine = existsSync(chemin) ? JSON.parse(readFileSync(chemin, 'utf8')).origine : `À DÉCRIRE (${fichierNouveau}).`;
    ecrire(nomNouveau, origine, os);
    console.log(`squelette-${nomNouveau}.json écrit, ${os.length} os`);
    return;
  }

  let touchees = 0, ignorees = 0;
  readdirSync(FIXTURES).filter(f => /^squelette-.*\.json$/.test(f)).forEach(f => {
    const nom = f.replace(/^squelette-|\.json$/g, '');
    const ancien = JSON.parse(readFileSync(join(FIXTURES, f), 'utf8'));
    const trouve = [...parFichier.entries()].find(([, os]) => memeSquelette(os, ancien.os));
    if (!trouve) { console.log(`  ${f} : aucun .glb correspondant, LAISSÉE INTACTE`); ignorees++; return; }
    ecrire(nom, ancien.origine, trouve[1]);
    console.log(`  ${f} ← ${trouve[0]}, ${trouve[1].length} os, positions ajoutées`);
    touchees++;
  });
  console.log(`\n${touchees} fixtures régénérées, ${ignorees} laissées intactes.`);
}

if (process.argv[1] && process.argv[1].endsWith('make-skeleton-fixture.mjs')) principal();
