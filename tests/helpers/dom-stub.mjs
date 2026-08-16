/**
 * dom-stub.mjs — Environnement DOM/THREE minimal pour charger les modules src/*.js sous Node
 * (node:test), qui n'a ni `document`, ni `window`, ni WebGL.
 *
 * Ce fichier DOIT être importé en toute première ligne de chaque fichier de test, AVANT tout
 * import depuis src/, car plusieurs modules (io.js notamment) exécutent du code au chargement du
 * module (déclarations `const X = document.getElementById('X')`, `window.addEventListener(...)`,
 * `X.addEventListener(...)`) — sans ce stub, importer draw.js/scene3d.js/sidebar.js (qui importent
 * transitivement i18n.js → io.js) provoquerait un ReferenceError immédiat.
 *
 * Ne couvre QUE ce qui est nécessaire pour que le chargement des modules (temps d'import) et les
 * fonctions pures testées ici (caméra, construction de Bâtiments) s'exécutent sans planter — ce
 * n'est pas un DOM fonctionnel (pas de rendu réel, pas de vrai cycle d'événements).
 *
 * personaRenderer3D (THREE.WebGLRenderer) n'est construit que paresseusement dans
 * ensurePersonaScene3D() (rig3d.js) — jamais au chargement du module — donc tant que les tests
 * n'appellent pas cette fonction (ou une fonction qui l'appelle), l'absence de vrai contexte WebGL
 * n'est jamais un problème.
 */
import * as THREE from 'three';

globalThis.THREE = THREE; // rig3d.js utilise `THREE` comme global (chargé via <script> dans index.html)

// Contexte canvas 2D factice : un Proxy qui accepte N'IMPORTE QUEL appel de méthode (save,
// translate, fillRect, drawImage, etc. — la surface de l'API Canvas2D utilisée par draw.js est bien
// trop large pour l'énumérer) en no-op, tout en spécial-casant les quelques méthodes dont le résultat
// est ensuite déréférencé (measureText().width, createLinearGradient().addColorStop(...)) — sans ce
// cas particulier, `c.measureText(x).width` planterait (`.width` sur `undefined`). Nécessaire pour
// que initStartupProject() (appelée au chargement du module events.js, qui rend un projet vide par
// défaut) ne plante pas dès l'import — même si aucun test ici ne vérifie le contenu réellement dessiné.
function makeFakeCanvasContext2D() {
  const fakeGradient = { addColorStop(){} };
  const specialReturns = {
    measureText: (text) => ({ width: (text ? String(text).length : 0) * 6 }),
    createLinearGradient: () => fakeGradient,
    createRadialGradient: () => fakeGradient,
    createPattern: () => ({}),
    getImageData: () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 }),
    isPointInPath: () => false,
    isPointInStroke: () => false,
  };
  const store = {};
  return new Proxy(store, {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (specialReturns[prop]) return specialReturns[prop];
      if (prop === 'canvas') return makeFakeElement();
      if (typeof prop === 'symbol') return undefined;
      return function fakeCanvasMethod(){ return undefined; };
    },
    set(target, prop, value) { target[prop] = value; return true; },
  });
}

function makeFakeElement() {
  // Les enfants sont RÉELLEMENT conservés. Un `appendChild` qui rend l'enfant sans le ranger nulle
  // part rendait indémontrable tout ce qui construit une liste : « une Scène par ligne » ne pouvait
  // s'affirmer que par lecture du source, c'est-à-dire pas du tout (le test aurait été satisfait par
  // le commentaire qui l'explique). Même famille de piège que la mémorisation par id plus bas.
  //
  // Ce n'est PAS un DOM : pas de parentNode tenu à jour, pas d'analyse du HTML posé en `innerHTML`.
  // Poser `innerHTML` vide seulement la liste d'enfants — ce qui suffit, car c'est ainsi que le code
  // de rendu remet une liste à zéro avant de la reconstruire.
  const enfants = [];
  const el = {
    style: {},
    classList: { add(){}, remove(){}, toggle(){}, contains(){ return false; } },
    dataset: {},
    children: enfants,
    childNodes: enfants,
    value: '',
    checked: false,
    _innerHTML: '',
    get innerHTML(){ return this._innerHTML; },
    set innerHTML(v){ this._innerHTML = String(v); enfants.length = 0; },
    textContent: '',
    width: 0,
    height: 0,
    clientWidth: 0,
    clientHeight: 0,
    addEventListener(){},
    removeEventListener(){},
    appendChild(child){ enfants.push(child); return child; },
    removeChild(child){
      const i = enfants.indexOf(child);
      if (i >= 0) enfants.splice(i, 1);
      return child;
    },
    insertBefore(child, avant){
      const i = enfants.indexOf(avant);
      enfants.splice(i >= 0 ? i : enfants.length, 0, child);
      return child;
    },
    setAttribute(){},
    getAttribute(){ return null; },
    removeAttribute(){},
    querySelector(){ return null; },
    querySelectorAll(){ return []; },
    closest(){ return null; },
    // '2d' → contexte factice fonctionnel (cf. makeFakeCanvasContext2D) ; 'webgl'/'webgl2' → null
    // intentionnellement (aucun test n'appelle jamais ensurePersonaScene3D, qui construirait un vrai
    // THREE.WebGLRenderer — cf. en-tête de ce fichier).
    getContext(type){ return type === '2d' ? makeFakeCanvasContext2D() : null; },
    getBoundingClientRect(){ return { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 }; },
    focus(){}, blur(){}, click(){}, remove(){},
    cloneNode(){ return makeFakeElement(); },
    scrollIntoView(){},
    parentNode: null,
    parentElement: null,
  };
  return el;
}

// Les éléments sont MÉMORISÉS PAR ID. Sans cela, `getElementById('board')` rendait un objet neuf à
// chaque appel : poser `canvas.style.cursor` puis le relire depuis un autre appel donnait toujours
// `undefined`, et tout test qui l'observait était vrai quoi qu'il arrive — la même famille de piège
// que le `textContent` non conservé. Les mémoriser rend ces effets observables.
//
// Volontairement PAS de vidage entre les tests : ces éléments tiennent lieu de page HTML, qui ne se
// recharge pas non plus entre deux gestes de l'utilisateur. Un test qui dépend d'un attribut DOM
// doit le poser lui-même.
const _elementsParId = new Map();

globalThis.document = {
  getElementById(id){
    if (!_elementsParId.has(id)) _elementsParId.set(id, makeFakeElement());
    return _elementsParId.get(id);
  },
  createElement(){ return makeFakeElement(); },
  // Nœud texte factice minimal (nodeType 3, comme un vrai Text) — nécessaire pour i18n.js
  // (setLeadingText/setTrailingText appellent document.createTextNode au chargement/à l'usage).
  createTextNode(text){ return { nodeType: 3, textContent: text }; },
  // Comme getElementById : renvoie un élément factice plutôt que null, pour que le code au niveau
  // module qui fait `const x = document.querySelector('.foo'); x.addEventListener(...)` (cf.
  // events.js, canvasWrap) ne plante pas dès le chargement du module.
  querySelector(){ return makeFakeElement(); },
  querySelectorAll(){ return []; },
  addEventListener(){},
  removeEventListener(){},
  body: makeFakeElement(),
};

globalThis.window = globalThis.window || {
  addEventListener(){},
  removeEventListener(){},
  devicePixelRatio: 1,
  innerWidth: 1920,
  innerHeight: 1080,
  requestAnimationFrame(cb){ return setTimeout(cb, 0); },
  cancelAnimationFrame(id){ clearTimeout(id); },
};

// Node 21+ expose déjà un `navigator` global en lecture seule (getter) : le réassigner lèverait
// une TypeError. On le laisse tel quel s'il existe déjà (son .userAgent suffit pour nos besoins).
if (!globalThis.navigator) {
  globalThis.navigator = { platform: '', userAgent: 'node' };
}

globalThis.requestAnimationFrame = globalThis.requestAnimationFrame || ((cb) => setTimeout(cb, 0));
globalThis.cancelAnimationFrame = globalThis.cancelAnimationFrame || ((id) => clearTimeout(id));

// io.js appelle `setInterval(updateLastSavedIndicator, 1000)` au chargement du module (indicateur
// "Enregistré il y a...") : sous Node, un setInterval réel garderait le process vivant indéfiniment
// et ferait pendre `node --test`. On .unref() les timers créés pendant les tests pour ne jamais
// bloquer la sortie du process, sans changer leur comportement fonctionnel.
const _origSetInterval = globalThis.setInterval;
globalThis.setInterval = (...args) => {
  const t = _origSetInterval(...args);
  if (t && typeof t.unref === 'function') t.unref();
  return t;
};

const _memStore = {};
globalThis.localStorage = globalThis.localStorage || {
  getItem(k){ return Object.prototype.hasOwnProperty.call(_memStore, k) ? _memStore[k] : null; },
  setItem(k, v){ _memStore[k] = String(v); },
  removeItem(k){ delete _memStore[k]; },
};
