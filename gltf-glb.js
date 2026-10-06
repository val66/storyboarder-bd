/**
 * gltf-glb.js, l'EMPAQUETAGE d'un glTF en un seul fichier .glb (#445, téléchargement).
 *
 * Poly Haven livre ses modèles en glTF « éclaté » : un `.gltf` (du JSON), un `.bin` (la géométrie)
 * et des textures à côté. L'application ne range que des `.glb` : un fichier, un modèle, ce qui
 * rend le dossier Modeles lisible et les renommages sûrs. On réunit donc tout ici, sans dépendance :
 * le format GLB tient en une page (spécification glTF 2.0, « GLB File Format Specification »).
 *
 *   en-tête   12 octets : « glTF », version 2, longueur totale
 *   bloc JSON 8 octets d'en-tête (longueur, « JSON ») + le JSON, complété d'espaces à un multiple de 4
 *   bloc BIN  8 octets d'en-tête (longueur, « BIN\0 ») + les données, complétées de zéros à 4
 *
 * Ce que fait l'empaquetage :
 *   - chaque `buffer` externe est recopié dans le bloc BIN, et ses `bufferViews` décalés d'autant ;
 *   - chaque image externe y est recopiée aussi, derrière une `bufferView` neuve, avec son type MIME ;
 *   - il ne reste qu'UN buffer, sans `uri`, comme l'exige le format.
 *
 * Fonction PURE (des octets en entrée, des octets en sortie) : CommonJS à la racine, testée sous
 * Node nu. Le réseau et le disque sont l'affaire de store.js.
 */
'use strict';

const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', ktx2: 'image/ktx2' };

const aligner = (n) => (n + 3) & ~3;

/** Les octets d'une `uri` : une donnée intégrée (`data:`), ou une ressource fournie. null si absente. */
function octetsDe(uri, ressources){
  if (typeof uri !== 'string') return null;
  const m = /^data:[^;,]*;base64,(.*)$/.exec(uri);
  if (m) return Buffer.from(m[1], 'base64');
  let cle = uri;
  try { cle = decodeURIComponent(uri); } catch (e) { /* une uri mal encodée se cherche telle quelle */ }
  const b = ressources.get(cle) || ressources.get(uri);
  return b ? Buffer.from(b) : null;
}

/**
 * Le .glb d'un glTF et de ses ressources. `ressources` : une Map chemin relatif → octets (Buffer ou
 * Uint8Array), avec les chemins tels que le .gltf les écrit (« textures/x_diff_1k.jpg »).
 * Lève une erreur nommant la ressource manquante : un .glb incomplet s'afficherait sans texture, ou
 * pas du tout, sans que personne sache pourquoi.
 */
function empaqueterGlb(gltfSource, ressources){
  const gltf = JSON.parse(JSON.stringify(gltfSource));
  const morceaux = [];
  let longueur = 0;
  const placer = (octets) => {
    const debut = aligner(longueur);
    if (debut > longueur) morceaux.push(Buffer.alloc(debut - longueur));
    morceaux.push(octets);
    longueur = debut + octets.length;
    return debut;
  };

  const debuts = (gltf.buffers || []).map((b, i) => {
    const octets = octetsDe(b.uri, ressources);
    if (!octets) throw new Error(`ressource manquante : ${b.uri || `buffer ${i}`}`);
    return placer(octets);
  });
  (gltf.bufferViews || []).forEach(v => {
    v.byteOffset = (v.byteOffset || 0) + debuts[v.buffer || 0];
    v.buffer = 0;
  });
  (gltf.images || []).forEach(img => {
    if (img.bufferView !== undefined || typeof img.uri !== 'string') return;
    const octets = octetsDe(img.uri, ressources);
    if (!octets) throw new Error(`ressource manquante : ${img.uri}`);
    const ext = (/\.([a-z0-9]+)$/i.exec(img.uri.split('?')[0]) || [])[1];
    const mime = img.mimeType || MIME[String(ext).toLowerCase()];
    if (!mime) throw new Error(`type d'image inconnu : ${img.uri}`);
    gltf.bufferViews = gltf.bufferViews || [];
    gltf.bufferViews.push({ buffer: 0, byteOffset: placer(octets), byteLength: octets.length });
    img.bufferView = gltf.bufferViews.length - 1;
    img.mimeType = mime;
    delete img.uri;
  });

  const bin = Buffer.concat([...morceaux, Buffer.alloc(aligner(longueur) - longueur)]);
  if (bin.length) gltf.buffers = [{ byteLength: longueur }];
  else delete gltf.buffers;

  const texte = Buffer.from(JSON.stringify(gltf), 'utf8');
  const json = Buffer.concat([texte, Buffer.alloc(aligner(texte.length) - texte.length, 0x20)]);
  const total = 12 + 8 + json.length + (bin.length ? 8 + bin.length : 0);

  const tete = Buffer.alloc(12);
  tete.write('glTF', 0, 'ascii');
  tete.writeUInt32LE(2, 4);
  tete.writeUInt32LE(total, 8);
  const blocJson = Buffer.alloc(8);
  blocJson.writeUInt32LE(json.length, 0);
  blocJson.write('JSON', 4, 'ascii');
  const parts = [tete, blocJson, json];
  if (bin.length) {
    const blocBin = Buffer.alloc(8);
    blocBin.writeUInt32LE(bin.length, 0);
    blocBin.write('BIN\0', 4, 'ascii');
    parts.push(blocBin, bin);
  }
  return Buffer.concat(parts);
}

/** Lit un .glb : `{ json, bin }`. Sert aux tests, et à vérifier ce qu'on vient d'écrire. */
function lireGlb(octets){
  const b = Buffer.from(octets);
  if (b.length < 20 || b.toString('ascii', 0, 4) !== 'glTF' || b.readUInt32LE(4) !== 2) throw new Error('pas un GLB 2.0');
  if (b.readUInt32LE(8) !== b.length) throw new Error('longueur annoncée fausse');
  const lj = b.readUInt32LE(12);
  if (b.toString('ascii', 16, 20) !== 'JSON') throw new Error('bloc JSON absent');
  const json = JSON.parse(b.toString('utf8', 20, 20 + lj));
  let bin = null;
  const suite = 20 + lj;
  if (suite < b.length) {
    const lb = b.readUInt32LE(suite);
    if (b.toString('ascii', suite + 4, suite + 8) !== 'BIN\0') throw new Error('bloc BIN mal formé');
    bin = b.subarray(suite + 8, suite + 8 + lb);
  }
  return { json, bin };
}

/** Les `uri` EXTERNES d'un glTF (buffers et images), dans l'ordre, sans doublon ni donnée intégrée. */
function ressourcesExternes(gltf){
  const uris = [...(gltf.buffers || []), ...(gltf.images || [])]
    .map(x => x && x.uri).filter(u => typeof u === 'string' && !/^data:/.test(u));
  return [...new Set(uris)];
}

/**
 * Les extensions OBLIGATOIRES qu'on ne sait pas décoder. Le GLTFLoader de l'application (three
 * 0.128) n'a ni décodeur Draco, ni Meshopt, ni KTX2 : un fichier qui les exige ne se lit pas. Mieux
 * vaut le dire à l'import que de ranger un fichier qui s'affichera en boîte « introuvable ».
 */
const SANS_DECODEUR = ['KHR_draco_mesh_compression', 'EXT_meshopt_compression', 'KHR_texture_basisu'];
function extensionsNonPrisesEnCharge(gltf){
  return ((gltf && gltf.extensionsRequired) || []).filter(e => SANS_DECODEUR.includes(e));
}

/** Le JSON d'un modèle, .glb ou .gltf (texte). null s'il n'est ni l'un ni l'autre. */
function jsonDuModele(octets){
  const b = Buffer.from(octets);
  try {
    if (b.toString('ascii', 0, 4) === 'glTF') return lireGlb(b).json;
    return JSON.parse(b.toString('utf8'));
  } catch (e) { return null; }
}

module.exports = { empaqueterGlb, lireGlb, ressourcesExternes, extensionsNonPrisesEnCharge, jsonDuModele, MIME };
