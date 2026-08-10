/**
 * render-stub.mjs — neutralise le RENDU pour les tests qui appellent du code applicatif réel.
 *
 * À importer juste après dom-stub.mjs, et seulement dans les fichiers dont le code sous test finit
 * par appeler `renderAll()` ou `drawCurrentPage()` — charger une Scène, ranger un outil du canevas.
 *
 * Deux murs se dressent là, et ce fichier les abat tous les deux :
 *
 *   1. `renderAll()` appelle quatre fonctions INJECTÉES dans draw.js, que seul events.js fournit au
 *      démarrage de l'application. Sans elles : « _renderTree is not a function ». On les remplace
 *      par des fonctions vides plutôt que d'importer events.js, qui rendrait un projet vide au
 *      chargement du module et écraserait le montage de chaque test.
 *
 *   2. Dès qu'une Case possède un Personnage ou un Objet, le dessin passe par le rendu 3D, qui
 *      construit un THREE.WebGLRenderer — impossible sous Node (« document.createElementNS is not
 *      a function »). On remplace la SEULE classe qui pose problème, en gardant tout le reste de
 *      THREE réel : rig3d.js lit `THREE` comme une globale à chaque appel, jamais à l'import, donc
 *      une copie du namespace suffit.
 *
 * CE QUE CELA IMPLIQUE, et qui vaut pour tout fichier qui importe ce stub : le code de rendu
 * s'exécute réellement mais ne produit rien. La couverture qu'il fait monter n'est donc PAS une
 * garantie — aucun test n'affirme sur un pixel. On teste des données.
 */
import { setDrawCallbacks } from '../../src/draw.js';

const fauxRendererWebGL = class {
  constructor(){ this.domElement = document.createElement('canvas'); this.shadowMap = {}; }
  setSize(){} setClearColor(){} setPixelRatio(){} render(){} clear(){} dispose(){}
  getContext(){ return null; }
};
globalThis.THREE = { ...globalThis.THREE, WebGLRenderer: fauxRendererWebGL };

const rienDeVisuel = () => {};
setDrawCallbacks({
  canvas: document.createElement('canvas'),
  ctx: document.createElement('canvas').getContext('2d'),
  applyZoom: rienDeVisuel, updateSidePanel: rienDeVisuel, renderTree: rienDeVisuel,
  renderSceneList: rienDeVisuel, updateContextualControls: rienDeVisuel,
  fitZoomToWrap: rienDeVisuel,
});
