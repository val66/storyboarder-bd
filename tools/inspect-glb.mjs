/**
 * @file tools/inspect-glb.mjs
 * Regarder DEDANS un `.glb` avant de décider quoi que ce soit sur les squelettes.
 *
 * Ce script ne modifie rien et ne fait partie d'aucun gate. C'est un instrument de mesure, écrit
 * pour une question précise : peut-on faire correspondre les os d'un fichier importé au vocabulaire
 * d'articulations de l'application (« épaule gauche », « genou droit »… cf. POSE_3D) ?
 *
 * POURQUOI CETTE QUESTION EST OUVERTE. glTF décrit un squelette mais ne normalise PAS les noms des
 * os. Mixamo écrit « mixamorig:LeftArm », Blender « upper_arm.L », un rig maison ce qu'il veut. La
 * bibliothèque de poses, elle, range ses angles sous des noms fixes. Sans correspondance, aucune
 * pose enregistrée ne peut s'appliquer à un personnage importé.
 *
 * CE QU'IL RAPPORTE, et pourquoi chaque partie compte :
 *   — la hiérarchie des os : dit si le squelette est humanoïde et où sont les membres ;
 *   — les animations embarquées : s'il y en a, figer une image est une voie bien plus courte que
 *     poser les os un par un ;
 *   — le TAUX DE CORRESPONDANCE contre notre vocabulaire, avec la table d'alias utilisée. C'est le
 *     chiffre qui tranche : correspondance quasi complète → on peut viser les poses ; correspondance
 *     partielle ou nulle → il faudra désigner les os à la main, ou s'en passer.
 *
 * Usage :  node tools/inspect-glb.mjs [fichier.glb …]
 *          node tools/inspect-glb.mjs            (inspecte tous les .glb du dossier courant)
 */
import '../tests/helpers/dom-stub.mjs';
import { readFileSync, readdirSync } from 'node:fs';
import { basename, extname, join } from 'node:path';

const { GLTFLoader } = await import('../src/vendor/GLTFLoader.js');
const { POSE_3D } = await import('../src/constants.js');

// ─────────────────────────────────────────────────────────────────────────────
// Le vocabulaire de l'application, et les alias qu'on tente
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Les emplacements dont une pose a besoin, tirés de POSE_3D — pas recopiés.
 * Une pose écrit `lShoulder`, `rElbow`, `torsoRotX`… ; il faut donc trouver, dans le fichier, l'os
 * qui joue chacun de ces rôles.
 */
const EMPLACEMENTS = {
  torse:        ['spine', 'spine1', 'spine2', 'chest', 'torso', 'abdomen', 'bip01spine'],
  tete:         ['head'],
  bras_g:       ['leftarm', 'upperarm', 'armupper', 'bicep', 'oberarm'],
  avantbras_g:  ['leftforearm', 'forearm', 'lowerarm', 'armlower', 'elbow'],
  bras_d:       ['rightarm', 'upperarm', 'armupper', 'bicep', 'oberarm'],
  avantbras_d:  ['rightforearm', 'forearm', 'lowerarm', 'armlower', 'elbow'],
  cuisse_g:     ['leftupleg', 'thigh', 'upleg', 'upperleg', 'legupper'],
  jambe_g:      ['leftleg', 'shin', 'calf', 'lowerleg', 'leglower', 'knee'],
  cuisse_d:     ['rightupleg', 'thigh', 'upleg', 'upperleg', 'legupper'],
  jambe_d:      ['rightleg', 'shin', 'calf', 'lowerleg', 'leglower', 'knee'],
  bassin:       ['hips', 'pelvis', 'root', 'bassin'],
};
const COTE_ATTENDU = {
  bras_g: 'g', avantbras_g: 'g', cuisse_g: 'g', jambe_g: 'g',
  bras_d: 'd', avantbras_d: 'd', cuisse_d: 'd', jambe_d: 'd',
};

/** « mixamorig:LeftForeArm » → « leftforearm ». Préfixe de rig retiré, ponctuation aussi. */
const normaliser = (nom) =>
  String(nom || '').toLowerCase().replace(/^.*:/, '').replace(/[^a-z0-9]/g, '');

/**
 * Le côté d'un os, déduit de son nom : 'g', 'd' ou null.
 *
 * Trois conventions cohabitent — « Left… », « …_L », « L_… » — et une quatrième piège : un os nommé
 * « leg » contient « l » sans être à gauche. D'où des motifs ancrés plutôt qu'une recherche de
 * lettre.
 */
function cote(nom){
  const brut = String(nom || '').toLowerCase().replace(/^.*:/, '');
  if (/(^|[^a-z])left([^a-z]|$)|left[a-z]/.test(brut)) return 'g';
  if (/(^|[^a-z])right([^a-z]|$)|right[a-z]/.test(brut)) return 'd';
  if (/[._-]l$|^l[._-]|[._-]l[._-]/.test(brut)) return 'g';
  if (/[._-]r$|^r[._-]|[._-]r[._-]/.test(brut)) return 'd';
  return null;
}

/** Tente d'attribuer un os à chaque emplacement. Rend { emplacement: nomDOs | null }. */
function correspondance(os){
  const sortie = {};
  const pris = new Set();
  for (const [emplacement, alias] of Object.entries(EMPLACEMENTS)) {
    const attendu = COTE_ATTENDU[emplacement] || null;
    let trouve = null;
    for (const a of alias) {
      trouve = os.find(n => {
        if (pris.has(n)) return false;
        if (!normaliser(n).includes(a)) return false;
        // Un emplacement latéralisé n'accepte qu'un os du bon côté. Sans cette garde, « thigh »
        // attribuerait la même cuisse aux deux jambes — la faute qui donne un personnage tordu
        // sans qu'aucune erreur ne soit levée.
        return attendu ? cote(n) === attendu : true;
      });
      if (trouve) break;
    }
    if (trouve) pris.add(trouve);
    sortie[emplacement] = trouve || null;
  }
  return sortie;
}

// ─────────────────────────────────────────────────────────────────────────────
// Inspection
// ─────────────────────────────────────────────────────────────────────────────

function lire(chemin){
  const buf = readFileSync(chemin);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  return new Promise((resolve, reject) => {
    try { new GLTFLoader().parse(ab, '', resolve, reject); } catch (e) { reject(e); }
  });
}

function arbre(racine, profondeurMax = 30){
  const lignes = [];
  const marcher = (n, d) => {
    if (d > profondeurMax) return;
    if (n.isBone) lignes.push(`${'  '.repeat(d)}${n.name}`);
    n.children.forEach(c => marcher(c, n.isBone ? d + 1 : d));
  };
  marcher(racine, 0);
  return lignes;
}

async function inspecter(chemin){
  const titre = basename(chemin);
  console.log(`\n${'═'.repeat(72)}\n  ${titre}\n${'═'.repeat(72)}`);
  let gltf;
  try { gltf = await lire(chemin); } catch (e) {
    console.log(`  ILLISIBLE : ${(e && e.message) || e}`);
    return;
  }

  let maillages = 0, skinnes = 0, os = [];
  gltf.scene.traverse(n => {
    if (n.isSkinnedMesh) { skinnes++; if (n.skeleton) os = n.skeleton.bones.map(b => b.name); }
    else if (n.isMesh) maillages++;
  });

  const boite = new globalThis.THREE.Box3().setFromObject(gltf.scene);
  const taille = new globalThis.THREE.Vector3(); boite.getSize(taille);
  console.log(`  Taille (pose de repos) : ${taille.x.toFixed(2)} × ${taille.y.toFixed(2)} × ${taille.z.toFixed(2)} m`);
  console.log(`  Maillages : ${maillages} simple(s), ${skinnes} déformé(s) par un squelette`);

  const clips = gltf.animations || [];
  console.log(`  Animations embarquées : ${clips.length}`);
  clips.forEach(c => console.log(`    • « ${c.name} » — ${c.duration.toFixed(2)} s, ${c.tracks.length} pistes`));

  if (!os.length) {
    console.log('\n  AUCUN SQUELETTE. Ce fichier est un objet rigide : rien à articuler.');
    return;
  }

  console.log(`\n  ── ${os.length} os ──`);
  arbre(gltf.scene).forEach(l => console.log('  ' + l));

  const carte = correspondance(os);
  const trouves = Object.values(carte).filter(Boolean).length;
  const total = Object.keys(carte).length;
  console.log(`\n  ── Correspondance avec le vocabulaire de l'application : ${trouves}/${total} ──`);
  for (const [emplacement, nom] of Object.entries(carte)) {
    console.log(`    ${emplacement.padEnd(13)} ${nom ? '→ ' + nom : '✗ AUCUN'}`);
  }
}

const args = process.argv.slice(2);
const fichiers = args.length
  ? args
  : readdirSync(process.cwd()).filter(f => extname(f).toLowerCase() === '.glb').map(f => join(process.cwd(), f));

if (!fichiers.length) {
  console.log('Aucun .glb à inspecter. Déposez un fichier dans le dossier, ou passez son chemin en argument.');
} else {
  console.log(`Vocabulaire de l'application — ${Object.keys(POSE_3D.debout).length} champs par pose, ` +
              `${Object.keys(POSE_3D).length} poses de base.`);
  for (const f of fichiers) await inspecter(f);
  console.log('');
}
