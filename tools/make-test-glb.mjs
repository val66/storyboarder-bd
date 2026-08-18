/**
 * @file tools/make-test-glb.mjs
 * Fabrique le `.glb` d'essai versionné dans `tests/fixtures/`.
 *
 * POURQUOI UN GÉNÉRATEUR PLUTÔT QU'UN FICHIER DÉPOSÉ. Un `.glb` téléchargé est un binaire opaque :
 * on ne peut ni relire ses dimensions, ni savoir ce qu'il contient, ni justifier ce qu'un test en
 * attend. Un test qui affirme « ce modèle mesure 1,75 m » sans que personne ne puisse le vérifier
 * ne prouve rien — il déplace la confiance, il ne la construit pas.
 *
 * Ici, les dimensions sont ÉCRITES en clair, plus bas, et le fichier en découle. Le test compare
 * donc le décodage à une valeur dont la provenance est lisible. Et la question qu'on veut vraiment
 * trancher — « glTF garantit-il le mètre de bout en bout ? » — devient vérifiable : on écrit des
 * coordonnées en mètres, on relit une hauteur en mètres.
 *
 * CE QUE CE FICHIER NE PROUVE PAS : qu'un `.glb` sorti de Blender se décode. Il ne contient ni
 * texture, ni squelette, ni matériau, ni extension — c'est un pavé nu. Le vrai fichier d'un
 * modélisateur reste un essai manuel (cf. l'en-tête de tests/glb-decoding.test.mjs).
 *
 * Usage : node tools/make-test-glb.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');

// Les dimensions, en MÈTRES, et le seul endroit où elles sont écrites. Volontairement toutes
// différentes et non rondes : un pavé cubique laisserait passer une confusion d'axes (lire X ou Z
// à la place de Y donnerait la même réponse), et des valeurs entières pourraient coïncider avec un
// défaut de repli.
export const DIMENSIONS_M = { x: 0.6, y: 1.75, z: 0.3 };

/** Les 8 sommets d'un pavé centré en X/Z, POSÉ sur le sol (y de 0 à hauteur). */
function sommets({ x, y, z }){
  const hx = x / 2, hz = z / 2;
  return [
    [-hx, 0, -hz], [hx, 0, -hz], [hx, 0, hz], [-hx, 0, hz],
    [-hx, y, -hz], [hx, y, -hz], [hx, y, hz], [-hx, y, hz],
  ];
}

const FACES = [
  0, 1, 2, 0, 2, 3,   4, 6, 5, 4, 7, 6,   0, 4, 5, 0, 5, 1,
  1, 5, 6, 1, 6, 2,   2, 6, 7, 2, 7, 3,   3, 7, 4, 3, 4, 0,
];

/** Aligne une longueur sur 4 octets — le conteneur GLB l'exige pour chaque chunk. */
const aligner = (n) => (n + 3) & ~3;

export function construireGlb(dims = DIMENSIONS_M){
  const pts = sommets(dims);
  const positions = new Float32Array(pts.flat());
  const indices = new Uint16Array(FACES);

  const octetsPos = Buffer.from(positions.buffer);
  // Les indices sont alignés sur 4 : un accesseur glTF doit commencer à un multiple de la taille de
  // son composant, et l'implémentation la plus stricte réclame 4.
  const decalageIdx = aligner(octetsPos.length);
  const bin = Buffer.alloc(aligner(decalageIdx + indices.byteLength));
  octetsPos.copy(bin, 0);
  Buffer.from(indices.buffer).copy(bin, decalageIdx);

  const mins = [0, 1, 2].map(i => Math.min(...pts.map(p => p[i])));
  const maxs = [0, 1, 2].map(i => Math.max(...pts.map(p => p[i])));

  const json = {
    asset: { version: '2.0', generator: 'storyboarder-bd tools/make-test-glb.mjs' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: 'PavéTémoin' }],
    meshes: [{ name: 'PavéTémoin', primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: pts.length, type: 'VEC3', min: mins, max: maxs },
      { bufferView: 1, componentType: 5123, count: indices.length, type: 'SCALAR' },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: octetsPos.length, target: 34962 },
      { buffer: 0, byteOffset: decalageIdx, byteLength: indices.byteLength, target: 34963 },
    ],
    buffers: [{ byteLength: bin.length }],
  };

  return emballerGlb(json, bin);
}

/** Assemble le conteneur GLB autour d'un JSON et d'un binaire déjà constitués. */
function emballerGlb(json, bin){
  // Chunk JSON complété d'ESPACES, chunk BIN de zéros : c'est ce que la spécification impose comme
  // remplissage, et un décodeur strict rejette le reste.
  const brutJson = Buffer.from(JSON.stringify(json), 'utf8');
  const chunkJson = Buffer.alloc(aligner(brutJson.length), 0x20);
  brutJson.copy(chunkJson);

  const entete = Buffer.alloc(12);
  entete.writeUInt32LE(0x46546c67, 0);                              // « glTF »
  entete.writeUInt32LE(2, 4);                                       // version 2
  entete.writeUInt32LE(12 + 8 + chunkJson.length + 8 + bin.length, 8);

  const enteteJson = Buffer.alloc(8);
  enteteJson.writeUInt32LE(chunkJson.length, 0);
  enteteJson.writeUInt32LE(0x4e4f534a, 4);                          // « JSON »
  const enteteBin = Buffer.alloc(8);
  enteteBin.writeUInt32LE(bin.length, 0);
  enteteBin.writeUInt32LE(0x004e4942, 4);                           // « BIN\0 »

  return Buffer.concat([entete, enteteJson, chunkJson, enteteBin, bin]);
}

// ─────────────────────────────────────────────────────────────────────────────
// Le second témoin : un modèle ARTICULÉ dont un maillage n'est piloté par aucun os.
//
// POURQUOI IL EXISTE. Le pavé ci-dessus n'a pas de squelette — l'en-tête de tests/glb-decoding.test.mjs
// le dit lui-même comme une limite connue. Aucun test ne pouvait donc répondre à des questions qui
// ne se posent QUE sur un modèle articulé décodé pour de vrai.
//
// LA PREMIÈRE À LAQUELLE IL A RÉPONDU : que devient, après décodage, un maillage écrit dans le
// fichier avec des poids tous nuls ? Réponse mesurée : GLTFLoader le normalise en (1, 0, 0, 0), ce
// qui le rend indiscernable d'un maillage rigidement attaché au premier os (cf. le test « MESURE »
// dans tests/glb-decoding.test.mjs). Une piste entière de diagnostic est tombée sur cette mesure.
//
// CE QU'IL CONTIENT : un os, deux maillages liés au même squelette, l'un pesé sur l'os, l'autre
// portant des poids TOUS NULS. Rien d'autre — ni matériau, ni texture, ni animation.
// ─────────────────────────────────────────────────────────────────────────────

/** Les noms écrits dans le fichier, et le seul endroit où ils le sont. */
export const MAILLAGES_SQUELETTE = { pesé: 'Corps', orphelin: 'Fourreau', égaré: 'FourreauEgare' };

// À quelle hauteur, en unités du fichier, l'os égaré emporte son maillage. Le témoin mesure 1,75 :
// ce chiffre le place très au-delà, comme le fourreau de worker_j (y 91→131 pour un personnage qui
// tient dans 0→41,8). Sa seule exigence est de ne recouper AUCUN autre maillage.
const HAUTEUR_OS_EGARE = 100;

export function construireGlbSquelette(){
  const pts = sommets(DIMENSIONS_M);
  const positions = new Float32Array(pts.flat());
  const indices = new Uint16Array(FACES);
  const n = pts.length;
  // Les deux premiers maillages désignent l'os 0 ; seule la table de POIDS les distingue.
  const jointures = new Uint16Array(n * 4);
  const poidsPleins = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) poidsPleins[i * 4] = 1;
  const poidsNuls = new Float32Array(n * 4);
  // Le troisième désigne l'os 1, celui qui est perché. Mêmes poids pleins : ce maillage est
  // PARFAITEMENT lié — c'est tout l'intérêt, il montre qu'un maillage égaré n'a rien d'un maillage
  // mal pesé, et que les deux défauts sont indépendants.
  const jointuresEgare = new Uint16Array(n * 4);
  for (let i = 0; i < n; i++) jointuresEgare[i * 4] = 1;
  // Les DEUX matrices de liaison inverse valent l'identité, y compris celle de l'os perché — et
  // c'est là qu'est le défaut reproduit. Pour l'os 1, `positionMonde × liaisonInverse` vaut donc sa
  // translation entière : le maillage part à y = 100 alors que sa géométrie décrit un pavé de
  // 1,75 m posé au sol. Exactement l'incohérence mesurée sur `Sheath_1_Outfit_0` de worker_j.
  const I4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const bindInverse = new Float32Array([...I4, ...I4]);

  // Les vues sont posées à la suite, chacune alignée sur 4 octets (cf. `aligner`).
  const morceaux = [positions, indices, jointures, poidsPleins, poidsNuls, bindInverse, jointuresEgare];
  const vues = [];
  let curseur = 0;
  morceaux.forEach((m) => {
    curseur = aligner(curseur);
    vues.push({ buffer: 0, byteOffset: curseur, byteLength: m.byteLength });
    curseur += m.byteLength;
  });
  const bin = Buffer.alloc(aligner(curseur));
  morceaux.forEach((m, i) => Buffer.from(m.buffer, m.byteOffset, m.byteLength).copy(bin, vues[i].byteOffset));

  const mins = [0, 1, 2].map(i => Math.min(...pts.map(p => p[i])));
  const maxs = [0, 1, 2].map(i => Math.max(...pts.map(p => p[i])));
  const primitive = (poids, jointures2 = 2) => ({
    attributes: { POSITION: 0, JOINTS_0: jointures2, WEIGHTS_0: poids }, indices: 1,
  });

  const json = {
    asset: { version: '2.0', generator: 'storyboarder-bd tools/make-test-glb.mjs' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [
      { name: 'Racine', children: [1, 3, 4, 5] },
      { name: 'Os', children: [2] },
      { name: 'OsPerche', translation: [0, HAUTEUR_OS_EGARE, 0] },
      { name: MAILLAGES_SQUELETTE.pesé, mesh: 0, skin: 0 },
      { name: MAILLAGES_SQUELETTE.orphelin, mesh: 1, skin: 0 },
      { name: MAILLAGES_SQUELETTE.égaré, mesh: 2, skin: 0 },
    ],
    meshes: [
      { name: MAILLAGES_SQUELETTE.pesé, primitives: [primitive(3)] },
      { name: MAILLAGES_SQUELETTE.orphelin, primitives: [primitive(4)] },
      { name: MAILLAGES_SQUELETTE.égaré, primitives: [primitive(3, 6)] },
    ],
    skins: [{ joints: [1, 2], inverseBindMatrices: 5 }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: n, type: 'VEC3', min: mins, max: maxs },
      { bufferView: 1, componentType: 5123, count: indices.length, type: 'SCALAR' },
      { bufferView: 2, componentType: 5123, count: n, type: 'VEC4' },
      { bufferView: 3, componentType: 5126, count: n, type: 'VEC4' },
      { bufferView: 4, componentType: 5126, count: n, type: 'VEC4' },
      { bufferView: 5, componentType: 5126, count: 2, type: 'MAT4' },
      { bufferView: 6, componentType: 5123, count: n, type: 'VEC4' },
    ],
    bufferViews: vues,
    buffers: [{ byteLength: bin.length }],
  };

  return emballerGlb(json, bin);
}

export const CHEMIN_FIXTURE = join(RACINE, 'tests/fixtures/pave-1m75.glb');
export const CHEMIN_FIXTURE_SQUELETTE = join(RACINE, 'tests/fixtures/squelette-fourreau.glb');

if (import.meta.url === `file://${process.argv[1]}`) {
  mkdirSync(dirname(CHEMIN_FIXTURE), { recursive: true });
  writeFileSync(CHEMIN_FIXTURE, construireGlb());
  console.log(`écrit : ${CHEMIN_FIXTURE} (${DIMENSIONS_M.x} × ${DIMENSIONS_M.y} × ${DIMENSIONS_M.z} m)`);
  writeFileSync(CHEMIN_FIXTURE_SQUELETTE, construireGlbSquelette());
  console.log(`écrit : ${CHEMIN_FIXTURE_SQUELETTE} (« ${MAILLAGES_SQUELETTE.pesé} » pesé, `
    + `« ${MAILLAGES_SQUELETTE.orphelin} » sans poids, `
    + `« ${MAILLAGES_SQUELETTE.égaré} » à y = ${HAUTEUR_OS_EGARE})`);
}
