/**
 * @file src/store-apercu-3d.js
 * L'aperçu 3D d'un modèle du store, quand la source n'offre pas de visionneuse intégrable (#445 :
 * Poly Haven). Le .glb arrive du processus principal, EN MÉMOIRE (store:apercu) : rien n'est rangé
 * dans le dossier Modeles tant qu'on n'a pas cliqué « Télécharger ».
 *
 * Même chaîne que les Cases, pour que l'aperçu ne mente pas : GLTFLoader, la préparation des modèles
 * importés (preparerModeleImporte3D : couleurs, émission, métaux), l'éclairage par défaut d'une Case (ambiante et
 * clé de lighting-3d.js). On tourne autour au glisser, on zoome à la molette.
 *
 * Le dessin se fait À LA DEMANDE (un geste, un redimensionnement), pas en boucle : une fiche ouverte
 * ne doit pas faire tourner la carte graphique pour une image immobile. Tout est libéré à la
 * fermeture (géométries, matériaux, textures, contexte WebGL) : parcourir vingt fiches ne doit pas
 * en garder vingt.
 */
import { GLTFLoader } from './vendor/GLTFLoader.js';
import { CLE_ACTUELLE, AMBIANTE_ACTUELLE } from './lighting-3d.js';
import { preparerModeleImporte3D } from './model-cache.js';

/** L'angle de vue de la caméra, en degrés. */
const CHAMP = 35;
/** L'inclinaison maximale, en radians : on ne passe ni dessus ni dessous le modèle. */
const INCLINAISON_MAX = 1.4;

/**
 * Le cadrage d'une boîte englobante : le point visé (son centre) et la distance qui la fait tenir
 * dans le champ, avec une marge. Fonction PURE.
 */
export function cadrage3D(min, max, champDeg = CHAMP){
  const centre = [0, 1, 2].map(i => (min[i] + max[i]) / 2);
  const rayon = Math.max(1e-3, Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) / 2);
  const distance = (rayon / Math.sin((champDeg * Math.PI / 180) / 2)) * 1.1;
  return { centre, rayon, distance };
}

/** Tourner autour : le glisser horizontal fait le tour, le vertical incline, borné. PURE. */
export function orbite3D({ lacet, tangage }, dx, dy){
  return {
    lacet: lacet - dx * 0.01,
    tangage: Math.max(-INCLINAISON_MAX, Math.min(INCLINAISON_MAX, tangage + dy * 0.01)),
  };
}

/** Zoomer : la molette rapproche ou éloigne, entre deux bornes relatives au cadrage. PURE. */
export function zoom3D(distance, deltaY, distanceCadrage){
  const d = distance * Math.exp(deltaY * 0.001);
  return Math.max(distanceCadrage * 0.25, Math.min(distanceCadrage * 4, d));
}

/** La position de la caméra, d'après la cible, la distance et les deux angles. PURE. */
export function positionCamera3D(centre, distance, { lacet, tangage }){
  return [
    centre[0] + distance * Math.cos(tangage) * Math.sin(lacet),
    centre[1] + distance * Math.sin(tangage),
    centre[2] + distance * Math.cos(tangage) * Math.cos(lacet),
  ];
}

function decoder(octets){
  return new Promise((resolve, reject) => {
    const brut = octets.buffer ? octets.buffer.slice(octets.byteOffset, octets.byteOffset + octets.byteLength) : octets;
    try { new GLTFLoader().parse(brut, '', resolve, reject); } catch (e) { reject(e); }
  });
}

/**
 * Ouvre l'aperçu dans `conteneur` (un élément vide) et rend `{ fermer }`. Lève si le modèle ne se
 * décode pas : l'appelant revient alors à l'image et le dit.
 */
export async function ouvrirApercu3D(conteneur, octets){
  const T = globalThis.THREE;
  const gltf = await decoder(octets);
  const modele = preparerModeleImporte3D(gltf);

  const scene = new T.Scene();
  scene.add(new T.AmbientLight(0xffffff, AMBIANTE_ACTUELLE));
  const cle = new T.DirectionalLight(0xffffff, CLE_ACTUELLE);
  scene.add(cle);
  scene.add(modele);

  const boite = new T.Box3().setFromObject(modele);
  const { centre, distance: distanceCadrage } = cadrage3D(boite.min.toArray(), boite.max.toArray());
  let distance = distanceCadrage;
  let angles = { lacet: 0.6, tangage: 0.25 };

  const camera = new T.PerspectiveCamera(CHAMP, 1, distanceCadrage / 100, distanceCadrage * 20);
  const rendu = new T.WebGLRenderer({ antialias: true, alpha: true });
  rendu.setPixelRatio(Math.min(2, globalThis.devicePixelRatio || 1));
  rendu.domElement.className = 'store-apercu-3d';
  conteneur.appendChild(rendu.domElement);

  let demande = 0;
  const dessiner = () => {
    demande = 0;
    const l = conteneur.clientWidth || 1;
    const h = conteneur.clientHeight || 1;
    rendu.setSize(l, h, false);
    camera.aspect = l / h;
    camera.updateProjectionMatrix();
    camera.position.fromArray(positionCamera3D(centre, distance, angles));
    camera.lookAt(centre[0], centre[1], centre[2]);
    // La clé suit la caméra, de biais : le modèle reste éclairé de face quand on tourne autour.
    cle.position.copy(camera.position).add(new T.Vector3(distance * 0.5, distance, 0));
    rendu.render(scene, camera);
  };
  const redessiner = () => { if (!demande) demande = requestAnimationFrame(dessiner); };

  let glisser = null;
  const appui = (e) => { glisser = { x: e.clientX, y: e.clientY }; rendu.domElement.setPointerCapture(e.pointerId); };
  const deplacement = (e) => {
    if (!glisser) return;
    angles = orbite3D(angles, e.clientX - glisser.x, e.clientY - glisser.y);
    glisser = { x: e.clientX, y: e.clientY };
    redessiner();
  };
  const relache = () => { glisser = null; };
  const molette = (e) => { e.preventDefault(); distance = zoom3D(distance, e.deltaY, distanceCadrage); redessiner(); };
  const el = rendu.domElement;
  el.addEventListener('pointerdown', appui);
  el.addEventListener('pointermove', deplacement);
  el.addEventListener('pointerup', relache);
  el.addEventListener('pointercancel', relache);
  el.addEventListener('wheel', molette, { passive: false });
  const Observateur = globalThis.ResizeObserver;
  const observateur = Observateur ? new Observateur(redessiner) : null;
  if (observateur) observateur.observe(conteneur);
  dessiner();

  return {
    fermer(){
      if (demande) cancelAnimationFrame(demande);
      if (observateur) observateur.disconnect();
      modele.traverse(n => {
        if (n.geometry) n.geometry.dispose();
        const mats = n.material ? (Array.isArray(n.material) ? n.material : [n.material]) : [];
        mats.forEach(m => {
          Object.values(m).forEach(v => { if (v && v.isTexture) v.dispose(); });
          m.dispose();
        });
      });
      rendu.dispose();
      if (rendu.forceContextLoss) rendu.forceContextLoss();
      el.remove();
    },
  };
}
