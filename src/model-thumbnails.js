/**
 * @file src/model-thumbnails.js
 * Les vignettes des modèles locaux (bibliothèque « Mes modèles »).
 *
 * Un modèle importé n'a pas d'image : on le RENDU une fois, de trois quarts, et la vignette est
 * gardée sur le disque (main.js, vignettes:*, cf. vignettes-modeles.js pour ce qui décide). Les
 * suivantes ouvertures la relisent ; un fichier qui change (signature) se fait rendre à nouveau.
 *
 * DÉCODÉ ICI, PAS DANS LE CACHE DES CASES. Le cache garde chaque modèle tant que le Projet est
 * ouvert ; y faire entrer vingt modèles juste pour leur photo les garderait tous en mémoire. On
 * décode, on prépare comme une Case (preparerModeleImporte3D : couleurs, métaux…), on photographie,
 * on libère. Les maillages égarés sont masqués, comme dans une Case, pour que le cadrage ne vise
 * pas le vide.
 *
 * Une toile WebGL à part, gardée le temps d'une série puis rendue (forceContextLoss) : rien ne reste
 * sur la carte graphique.
 */
import { GLTFLoader } from './vendor/GLTFLoader.js';
import { readModel } from './model-store.js';
import { preparerModeleImporte3D } from './model-cache.js';
import { maillagesHorsCorps3D, maillagesParNom3D } from './stray-meshes-3d.js';
import { CLE_ACTUELLE, AMBIANTE_ACTUELLE } from './lighting-3d.js';
import { cadrage3D, positionCamera3D } from './store-apercu-3d.js';
import { box3FromObjectSkinAware3D } from './skinned-box-3d.js';

/**
 * La taille d'une vignette, en pixels : AU FORMAT DES CARTES (16:9). Carrée, elle était rognée en haut
 * et en bas par la carte (signalé : têtes et pattes coupées) ; au bon format, le cadrage la remplit
 * sans rien perdre.
 */
export const LARGEUR_VIGNETTE = 512;
export const HAUTEUR_VIGNETTE = 288;
/** L'angle de la photo : de trois quarts, un peu au-dessus, comme l'aperçu 3D à son ouverture. */
const ANGLES = { lacet: 0.6, tangage: 0.25 };

const urls = new Map();   // nom de modèle → adresse d'image (blob:) de sa vignette
const mesures = new Map();   // nom de modèle → { dimensions, noms }, relevés au rendu

/** Ce qu'on sait de chaque modèle sans le décoder : { nom: { dimensions, noms } }. */
export function metasLocales(){
  return Object.fromEntries(mesures);
}

/** L'adresse de la vignette d'un modèle, si on l'a ; null sinon. */
export function vignetteLocale(nom){
  return urls.get(nom) || null;
}

function retenir(nom, octets, type){
  const ancienne = urls.get(nom);
  if (ancienne && globalThis.URL && URL.revokeObjectURL) URL.revokeObjectURL(ancienne);
  urls.set(nom, URL.createObjectURL(new Blob([octets], { type })));
}

function liberer(racine){
  racine.traverse(n => {
    if (n.geometry) n.geometry.dispose();
    const mats = n.material ? (Array.isArray(n.material) ? n.material : [n.material]) : [];
    mats.forEach(m => { Object.values(m).forEach(v => { if (v && v.isTexture) v.dispose(); }); m.dispose(); });
  });
}

let rendu = null;
function obtenirRendu(){
  const T = globalThis.THREE;
  if (!rendu) {
    rendu = new T.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    rendu.setPixelRatio(1);
    rendu.setSize(LARGEUR_VIGNETTE, HAUTEUR_VIGNETTE, false);
    rendu.setClearColor(0x000000, 0);
  }
  return rendu;
}
function rendreLaToile(){
  if (!rendu) return;
  rendu.dispose();
  if (rendu.forceContextLoss) rendu.forceContextLoss();
  rendu = null;
}

/**
 * Décode un modèle et le prépare comme une Case, égarés masqués. Rend `{ modele, boite, meta }`.
 *
 * ⚠️ LA BOÎTE SUIT LE SQUELETTE (box3FromObjectSkinAware3D), et c'est la correction de la version 2
 * du rendu : la géométrie brute d'un modèle articulé décrit sa pose de liaison, parfois à une autre
 * échelle (worker_j : facteur 7,7). Cadrée sur elle, la photo visait à côté (Hulk, worker_j, le
 * dragon) ou montrait un personnage minuscule (anime_girl1). Et pas d'élimination par le tronc de
 * vue, pour la même raison qu'en Case (cf. buildImportedModelRig3D) : la sphère englobante est
 * fausse, des morceaux disparaissaient.
 */
async function decoderEtMesurer(nom){
  const octets = await readModel(nom);
  if (!octets) return null;
  const brut = octets.buffer.slice(octets.byteOffset, octets.byteOffset + octets.byteLength);
  const gltf = await new Promise((ok, ko) => { try { new GLTFLoader().parse(brut, '', ok, ko); } catch (e) { ko(e); } });
  const modele = preparerModeleImporte3D(gltf);
  maillagesParNom3D(modele, maillagesHorsCorps3D(modele)).forEach(m => { m.visible = false; });
  const noms = [];
  let os = 0;
  let articule = false;
  modele.traverse(n => {
    if (n.isMesh) n.frustumCulled = false;
    if (n.isSkinnedMesh) articule = true;
    if (n.isBone) os++;
    if (n.name && noms.length < 60) noms.push(n.name);
  });
  const boite = box3FromObjectSkinAware3D(modele);
  // glTF : Y vers le haut. Largeur (X) × profondeur (Z) × hauteur (Y), en mètres.
  // ⚠️ PAS DE TAILLE POUR UN MODÈLE ARTICULÉ : son fichier mêle souvent deux échelles (worker_j
  // mesurait « 42 m »). La Case le pose de toute façon à la hauteur choisie ; une taille fausse
  // affichée comme vraie ferait plus de mal que son absence.
  const t = boite.isEmpty() || articule ? null : boite.getSize(new globalThis.THREE.Vector3());
  return { modele, boite, meta: { dimensions: t ? [t.x, t.z, t.y] : null, noms, os } };
}

/** Photographie un modèle : rend `{ png, meta }`, ou null s'il ne se lit pas. */
async function photographier(nom){
  const T = globalThis.THREE;
  const d = await decoderEtMesurer(nom);
  if (!d) return null;
  const { modele, boite: b, meta } = d;
  try {
    const scene = new T.Scene();
    scene.add(new T.AmbientLight(0xffffff, AMBIANTE_ACTUELLE));
    const cle = new T.DirectionalLight(0xffffff, CLE_ACTUELLE);
    scene.add(cle);
    scene.add(modele);
    if (b.isEmpty()) return null;
    const { centre, distance } = cadrage3D(b.min.toArray(), b.max.toArray(), 35, LARGEUR_VIGNETTE / HAUTEUR_VIGNETTE);
    const camera = new T.PerspectiveCamera(35, LARGEUR_VIGNETTE / HAUTEUR_VIGNETTE, distance / 100, distance * 20);
    camera.position.fromArray(positionCamera3D(centre, distance, ANGLES));
    camera.lookAt(centre[0], centre[1], centre[2]);
    cle.position.copy(camera.position).add(new T.Vector3(distance * 0.5, distance, 0));
    const r = obtenirRendu();
    r.render(scene, camera);
    const blob = await new Promise(ok => r.domElement.toBlob(ok, 'image/png'));
    return blob ? { png: new Uint8Array(await blob.arrayBuffer()), meta } : null;
  } finally {
    liberer(modele);
  }
}

let enCours = null;
/**
 * Charge les vignettes prêtes, puis rend celles qui manquent, une à une. `avance(fait, total, nom)`
 * est appelée après chaque vignette (pour rafraîchir la carte et dire où l'on en est). Une seule
 * série à la fois : un second appel attend la première au lieu d'en lancer une autre.
 */
export function preparerVignettes(avance){
  if (enCours) return enCours;
  enCours = (async () => {
    const pont = globalThis.window && window.storyboarderAPI;
    if (!pont || !pont.vignettesEtat) return;
    const etat = await pont.vignettesEtat();
    Object.entries(etat.metas || {}).forEach(([nom, m]) => mesures.set(nom, m));
    const aRefaire = new Set((etat.aFaire || []).map(f => f.nom));
    for (const nom of etat.pretes || []) {
      if (urls.has(nom) && !aRefaire.has(nom)) continue;
      const v = await pont.vignettesLire(nom);
      if (v && v.ok) retenir(nom, v.data, v.type);
    }
    const total = (etat.aFaire || []).length + (etat.aMesurer || []).length;
    if (avance) avance(0, total, null);
    let fait = 0;
    for (const { nom } of etat.aFaire || []) {
      let photo = null;
      try { photo = await photographier(nom); } catch (e) { photo = null; }   // un modèle illisible n'arrête pas la série
      if (photo) {
        await pont.vignettesEcrire(nom, photo.png, photo.meta);
        retenir(nom, photo.png, 'image/png');
        mesures.set(nom, photo.meta);
      }
      fait++;
      if (avance) avance(fait, total, nom);
    }
    // Les vignettes venues d'une source sont gardées ; on mesure seulement le modèle (dimensions).
    for (const { nom } of etat.aMesurer || []) {
      try {
        const d = await decoderEtMesurer(nom);
        if (d) { liberer(d.modele); await pont.vignettesMesures(nom, d.meta); mesures.set(nom, d.meta); }
      } catch (e) { /* illisible : pas de dimensions, rien de plus */ }
      fait++;
      if (avance) avance(fait, total, nom);
    }
    rendreLaToile();
  })().finally(() => { enCours = null; });
  return enCours;
}

/** Oublie la vignette en mémoire d'un modèle (renommé, supprimé, remplacé) : elle sera relue. */
export function oublierVignette(nom){
  const u = urls.get(nom);
  if (u && globalThis.URL && URL.revokeObjectURL) URL.revokeObjectURL(u);
  urls.delete(nom);
}
