/**
 * @file tools/inspect-glb.mjs
 * Regarder DEDANS un `.glb` avant de décider quoi que ce soit sur les squelettes.
 *
 * Ce script ne modifie rien et n'entre dans aucun gate. C'est un instrument de mesure, écrit pour
 * une question précise : peut-on faire correspondre les os d'un fichier importé au vocabulaire
 * d'articulations de l'application (« épaule gauche », « genou droit »… cf. POSE_3D) ?
 *
 * POURQUOI CETTE QUESTION EST OUVERTE. glTF décrit un squelette mais ne normalise PAS le nom des
 * os. Mixamo écrit « mixamorig:LeftArm », Blender « upper_arm.L », un rig maison ce qu'il veut. La
 * bibliothèque de poses, elle, range ses angles sous des noms fixes. Sans correspondance, aucune
 * pose enregistrée ne peut s'appliquer à un personnage importé.
 *
 * IL LIT LE JSON DU FICHIER, PAS LA SCÈNE DÉCODÉE — et c'est un choix, pas un raccourci. Première
 * version : passer par GLTFLoader. Elle a échoué sur les fichiers réels de l'utilisateur avec
 * « self is not defined » : dès qu'un modèle porte des TEXTURES, le décodeur emprunte un chemin
 * navigateur (`self.URL.createObjectURL`) qui n'existe pas sous Node. Le pavé témoin, lui, n'avait
 * aucune texture — d'où un outil qui marchait sur l'exemple et sur rien d'autre.
 *
 * Or tout ce qu'on cherche ici est déjà dans le JSON : `skins[].joints` donne les os, `nodes[]`
 * leurs noms et leur hiérarchie, `animations[]` les clips. Aucune géométrie à décoder, aucune image
 * à charger, aucune dépendance à Three. Moins de code ET plus de fichiers lisibles.
 *
 * CE QU'IL RAPPORTE, et pourquoi chaque partie compte :
 *   — la hiérarchie des os : dit si le squelette est humanoïde et où sont les membres ;
 *   — les animations embarquées : s'il y en a, figer une image est une voie bien plus courte que
 *     poser les os un par un ;
 *   — le TAUX DE CORRESPONDANCE contre notre vocabulaire, avec la table d'alias utilisée. C'est le
 *     chiffre qui tranche : correspondance quasi complète → on peut viser les poses ; partielle ou
 *     nulle → il faudra désigner les os à la main, ou s'en passer.
 *
 * Usage :  node tools/inspect-glb.mjs [fichier.glb …]
 *          node tools/inspect-glb.mjs            (inspecte tous les .glb du dossier courant)
 */
import { readFileSync, readdirSync } from 'node:fs';
import { basename, extname, join } from 'node:path';

const { POSE_3D } = await import('../src/constants.js');

// ─────────────────────────────────────────────────────────────────────────────
// Lecture du conteneur GLB — la partie JSON seulement
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extrait le chunk JSON d'un `.glb`. Rend l'objet glTF, ou lève avec un motif lisible.
 *
 * Le format est simple et stable : en-tête de 12 octets (« glTF », version, longueur), puis des
 * chunks préfixés de leur longueur et de leur type. Le premier est le JSON, par obligation de la
 * spécification.
 */
function lireJsonGlb(chemin){
  const buf = readFileSync(chemin);
  if (buf.length < 20) throw new Error('fichier trop court pour être un GLB');
  if (buf.toString('ascii', 0, 4) !== 'glTF') throw new Error('signature « glTF » absente');
  const version = buf.readUInt32LE(4);
  if (version !== 2) throw new Error(`version ${version} non gérée (attendu 2)`);

  let offset = 12;
  while (offset + 8 <= buf.length) {
    const longueur = buf.readUInt32LE(offset);
    const type = buf.readUInt32LE(offset + 4);
    const debut = offset + 8;
    if (type === 0x4e4f534a) {                       // « JSON »
      return JSON.parse(buf.toString('utf8', debut, debut + longueur));
    }
    offset = debut + longueur;
  }
  throw new Error('aucun chunk JSON');
}

// ─────────────────────────────────────────────────────────────────────────────
// Le vocabulaire de l'application, et les alias qu'on tente
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Les emplacements dont une pose a besoin. Il faut trouver, dans le fichier, l'os qui joue chacun
 * de ces rôles — POSE_3D écrit `lShoulder`, `rElbow`, `torsoRotX`…
 */
const EMPLACEMENTS = {
  bassin:       ['hips', 'pelvis', 'bassin', 'root'],
  torse:        ['spine', 'chest', 'torso', 'abdomen'],
  tete:         ['head'],
  bras_g:       ['leftarm', 'upperarm', 'armupper', 'bicep', 'oberarm', 'arm'],
  avantbras_g:  ['leftforearm', 'forearm', 'lowerarm', 'armlower'],
  bras_d:       ['rightarm', 'upperarm', 'armupper', 'bicep', 'oberarm', 'arm'],
  avantbras_d:  ['rightforearm', 'forearm', 'lowerarm', 'armlower'],
  cuisse_g:     ['leftupleg', 'thigh', 'upleg', 'upperleg', 'legupper'],
  jambe_g:      ['leftleg', 'shin', 'calf', 'lowerleg', 'leglower'],
  cuisse_d:     ['rightupleg', 'thigh', 'upleg', 'upperleg', 'legupper'],
  jambe_d:      ['rightleg', 'shin', 'calf', 'lowerleg', 'leglower'],
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
 * « leg » contient un « l » sans être à gauche. D'où des motifs ancrés plutôt qu'une recherche de
 * lettre.
 */
function cote(nom){
  const brut = String(nom || '').toLowerCase().replace(/^.*:/, '');
  if (/left/.test(brut)) return 'g';
  if (/right/.test(brut)) return 'd';
  if (/[._\- ]l$|^l[._\- ]|[._\- ]l[._\- ]/.test(brut)) return 'g';
  if (/[._\- ]r$|^r[._\- ]|[._\- ]r[._\- ]/.test(brut)) return 'd';
  return null;
}

/**
 * Tente d'attribuer un os à chaque emplacement. Rend { emplacement: nomDOs | null }.
 *
 * Un os déjà pris ne peut pas resservir : sans quoi le premier alias qui matche largement
 * (« arm ») raflerait tout. Et un emplacement latéralisé n'accepte qu'un os du bon côté — sans
 * cette garde, « thigh » attribuerait la MÊME cuisse aux deux jambes, donnant un personnage tordu
 * sans qu'aucune erreur ne soit levée.
 */
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
// Rapport
// ─────────────────────────────────────────────────────────────────────────────

/** La durée d'un clip : le plus grand temps d'entrée parmi ses échantillonneurs. */
function dureeClip(clip, gltf){
  let max = 0;
  (clip.samplers || []).forEach(s => {
    const acc = (gltf.accessors || [])[s.input];
    if (acc && Array.isArray(acc.max)) max = Math.max(max, acc.max[0]);
  });
  return max;
}

function inspecter(chemin){
  console.log(`\n${'═'.repeat(74)}\n  ${basename(chemin)}\n${'═'.repeat(74)}`);
  let gltf;
  try { gltf = lireJsonGlb(chemin); } catch (e) {
    console.log(`  ILLISIBLE : ${(e && e.message) || e}`);
    return;
  }

  const nodes = gltf.nodes || [];
  const skins = gltf.skins || [];
  const clips = gltf.animations || [];

  console.log(`  Généré par : ${(gltf.asset && gltf.asset.generator) || '(non renseigné)'}`);
  console.log(`  Nœuds : ${nodes.length} · Maillages : ${(gltf.meshes || []).length} · ` +
              `Matériaux : ${(gltf.materials || []).length} · Images : ${(gltf.images || []).length}`);
  console.log(`  Animations embarquées : ${clips.length}`);
  clips.forEach(c => console.log(
    `    • « ${c.name || '(sans nom)'} » — ${dureeClip(c, gltf).toFixed(2)} s, ${(c.channels || []).length} canaux`));

  if (!skins.length) {
    console.log('\n  AUCUN SQUELETTE. Objet rigide : rien à articuler.');
    return;
  }

  // Un fichier peut porter plusieurs peaux ; on réunit leurs os, sans doublon.
  const indices = [...new Set(skins.flatMap(s => s.joints || []))];
  const os = indices.map(i => (nodes[i] && nodes[i].name) || `(nœud ${i})`);

  console.log(`\n  ── ${os.length} os, ${skins.length} peau(x) ──`);
  // Hiérarchie : on part des os sans parent os, et on descend.
  const parent = new Map();
  indices.forEach(i => (nodes[i].children || []).forEach(c => { if (indices.includes(c)) parent.set(c, i); }));
  const racines = indices.filter(i => !parent.has(i));
  const descendre = (i, d) => {
    console.log(`  ${'  '.repeat(d)}${(nodes[i] && nodes[i].name) || `(nœud ${i})`}`);
    (nodes[i].children || []).filter(c => indices.includes(c)).forEach(c => descendre(c, d + 1));
  };
  racines.forEach(r => descendre(r, 0));

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
  fichiers.forEach(inspecter);
  console.log('');
}
