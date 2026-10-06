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

/** Le côté d'une vignette, en pixels : assez pour une carte de la grille, même sur écran dense. */
export const TAILLE_VIGNETTE = 384;
/** L'angle de la photo : de trois quarts, un peu au-dessus, comme l'aperçu 3D à son ouverture. */
const ANGLES = { lacet: 0.6, tangage: 0.25 };

const urls = new Map();   // nom de modèle → adresse d'image (blob:) de sa vignette

/** L'adresse de la vignette d'un modèle, si on l'a ; null sinon. */
export function vignetteLocale(nom){
  return urls.get(nom) || null;
}

function retenir(nom, octets, type){
  const ancienne = urls.get(nom);
  if (ancienne && globalThis.URL && URL.revokeObjectURL) URL.revokeObjectURL(ancienne);
  urls.set(nom, URL.createObjectURL(new Blob([octets], { type })));
}

/** La boîte des maillages VISIBLES (Box3.setFromObject compterait aussi les égarés masqués). */
function boiteVisible(racine){
  const T = globalThis.THREE;
  const boite = new T.Box3();
  racine.updateMatrixWorld(true);
  racine.traverse(n => {
    if (!n.isMesh || !n.visible || !n.geometry) return;
    let visible = true;
    for (let p = n.parent; p; p = p.parent) if (!p.visible) { visible = false; break; }
    if (!visible) return;
    if (!n.geometry.boundingBox) n.geometry.computeBoundingBox();
    boite.union(n.geometry.boundingBox.clone().applyMatrix4(n.matrixWorld));
  });
  return boite;
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
    rendu.setSize(TAILLE_VIGNETTE, TAILLE_VIGNETTE, false);
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

/** Photographie un modèle : rend les octets PNG de sa vignette, ou null s'il ne se lit pas. */
async function photographier(nom){
  const T = globalThis.THREE;
  const octets = await readModel(nom);
  if (!octets) return null;
  const brut = octets.buffer.slice(octets.byteOffset, octets.byteOffset + octets.byteLength);
  const gltf = await new Promise((ok, ko) => { try { new GLTFLoader().parse(brut, '', ok, ko); } catch (e) { ko(e); } });
  const modele = preparerModeleImporte3D(gltf);
  try {
    maillagesParNom3D(modele, maillagesHorsCorps3D(modele)).forEach(m => { m.visible = false; });
    const scene = new T.Scene();
    scene.add(new T.AmbientLight(0xffffff, AMBIANTE_ACTUELLE));
    const cle = new T.DirectionalLight(0xffffff, CLE_ACTUELLE);
    scene.add(cle);
    scene.add(modele);
    const b = boiteVisible(modele);
    if (b.isEmpty()) return null;
    const { centre, distance } = cadrage3D(b.min.toArray(), b.max.toArray());
    const camera = new T.PerspectiveCamera(35, 1, distance / 100, distance * 20);
    camera.position.fromArray(positionCamera3D(centre, distance, ANGLES));
    camera.lookAt(centre[0], centre[1], centre[2]);
    cle.position.copy(camera.position).add(new T.Vector3(distance * 0.5, distance, 0));
    const r = obtenirRendu();
    r.render(scene, camera);
    const blob = await new Promise(ok => r.domElement.toBlob(ok, 'image/png'));
    return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
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
    for (const nom of etat.pretes || []) {
      if (urls.has(nom)) continue;
      const v = await pont.vignettesLire(nom);
      if (v && v.ok) retenir(nom, v.data, v.type);
    }
    if (avance) avance(0, (etat.aFaire || []).length, null);
    let fait = 0;
    for (const { nom } of etat.aFaire || []) {
      let png = null;
      try { png = await photographier(nom); } catch (e) { png = null; }   // un modèle illisible n'arrête pas la série
      if (png) {
        await pont.vignettesEcrire(nom, png);
        retenir(nom, png, 'image/png');
      }
      fait++;
      if (avance) avance(fait, etat.aFaire.length, nom);
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
