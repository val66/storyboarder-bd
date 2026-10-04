/**
 * @file src/sky-3d.js
 * Le CIEL d'une Case : un panorama photographié en Jour et en Nuit, un ciel calculé en Personnalisé.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * POURQUOI DEUX CIELS, ET POURQUOI CE PARTAGE-LÀ
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Les deux ont été rendus côte à côte, aux mêmes cadrages, avant de décider (#436a) :
 *
 *   - le PANORAMA est nettement plus beau : de vrais nuages en volume, une vraie voûte étoilée.
 *     Mais il est FIGÉ. On peut le tourner pour amener son soleil dans la direction de celui de la
 *     scène, pas changer la hauteur de ce soleil ni sa couleur ;
 *   - le ciel CALCULÉ suit tout : direction, hauteur et couleur du soleil, intensité. Plus simple
 *     à l'œil, il ne contredit jamais la lumière de la scène.
 *
 * Or Jour et Nuit sont des ambiances FIXES : leur soleil ne bouge pas, un panorama choisi pour eux
 * ne peut donc pas se trouver en désaccord. Seul Personnalisé déplace le soleil et change sa
 * couleur. D'où le partage, choisi par l'utilisateur : la photo là où elle est juste, le calcul
 * là où rien d'autre ne peut suivre.
 *
 * ⚠️ LE CIEL EST UN FOND, PAS UNE LUMIÈRE. Il ne participe pas à l'éclairage des modèles : c'est
 * une décision prise pour juger d'abord le rendu, et la reprendre toucherait toutes les Cases.
 *
 * ⚠️ UN PANORAMA SE CHARGE DE FAÇON ASYNCHRONE. Tant qu'il n'est pas là, la Case reçoit le ciel
 * calculé avec les couleurs du mode, et non un aplat : c'est le même ciel en moins riche, pas un
 * autre. L'état de chargement entre dans la signature de Case, sans quoi l'image provisoire
 * resterait en cache pour toujours.
 */

/** Où vivent les panoramas, déposés par `tools/bake-ciel.mjs`. */
export const DOSSIER_CIELS = 'assets/textures/';

/**
 * Les panoramas, par mode d'éclairage. Un mode absent d'ici reçoit le ciel calculé.
 *
 * ⚠️ UN PANORAMA DÉPOSÉ N'EST QUE SA MOITIÉ HAUTE, en `largeur × largeur / 4`. Le bas est toujours
 * caché par le Sol ; le stocker coûtait la moitié de la mémoire pour des pixels jamais vus.
 *
 * ⚠️ LA LARGEUR N'EST PAS LA MÊME POUR LES DEUX, ET C'EST LE CŒUR DE #436b. Vue à l'écran en 4K,
 * chaque ciel était flou : une Case d'environ 2000 pixels couvre 66° de large, soit 750 pixels d'une
 * image de 4096 qui fait le tour complet. Agrandie 2,7 fois.
 *   - le JOUR passe à 8192 : 1 500 pixels pour 2 000, un agrandissement de 1,35 que des nuages aux
 *     bords doux supportent. 16K aurait été net, mais 340 Mo de mémoire graphique et une texture
 *     plus large que ce que bien des cartes acceptent ;
 *   - la NUIT ne peut PAS être nette en photo, à aucune taille raisonnable : une étoile est un point.
 *     Le panorama est donc réduit à 1024, où les étoiles se fondent en une lueur, celle de la Voie
 *     lactée, et les étoiles du ciel calculé, nettes à toute taille, sont dessinées par-dessus.
 */
export const CIEL_PANORAMAS = {
  jour: { fichier: 'ciel-jour.jpg', largeur: 8192, etoiles: 0 },
  nuit: { fichier: 'ciel-nuit.jpg', largeur: 1024, etoiles: 1 },
};

/** Le panorama d'un mode, ou `null` pour le ciel calculé. Fonction PURE. */
export function panoramaDuMode3D(mode){
  return Object.prototype.hasOwnProperty.call(CIEL_PANORAMAS, mode) ? mode : null;
}

/**
 * Les deux couleurs du ciel calculé, dérivées de LA couleur de ciel déjà résolue. Fonction PURE.
 * Le zénith est plus profond, l'horizon plus clair et délavé, comme l'est un vrai ciel par
 * l'épaisseur d'air qu'on regarde à travers. Rendre la couleur résolue en un seul point ferait
 * diverger le ciel de ce que la signature de Case connaît déjà.
 */
export const CIEL_ZENITH = 0.72;
export const CIEL_HORIZON_BLANC = 0.45;
export function couleursDuCielCalcule3D(hex){
  const c = rvb(hex);
  return {
    zenith: c.map(x => x * CIEL_ZENITH),
    horizon: c.map(x => x + (1 - x) * CIEL_HORIZON_BLANC),
  };
}

/** Part du ciel couverte de nuages dans le ciel calculé. */
export const CIEL_NUAGES = 0.45;

/**
 * Les étoiles du ciel calculé selon l'intensité du soleil (0 à 1). Fonction PURE.
 * Un Personnalisé assombri finit en nuit : il doit en avoir les étoiles, et un plein jour aucune.
 */
export function etoilesDuCiel3D(intensite){
  const i = Number(intensite);
  if (!Number.isFinite(i)) return 0;
  return Math.min(1, Math.max(0, (0.45 - i) / 0.3));
}

/**
 * Le soleil d'un panorama, trouvé dans ses pixels, ou `null`. Fonction PURE.
 * `lum` est la luminance (0 à 255) d'une version réduite de la MOITIÉ HAUTE déposée, rangée ligne
 * par ligne depuis le zénith ; sa dernière ligne est l'horizon.
 *
 * ⚠️ UN SOLEIL EST UNE TACHE SATURÉE ET COMPACTE, et les deux conditions comptent. Relevé sur les
 * deux premiers panoramas du dépôt, réduits à 512 de large : le jour a 44 pixels au-dessus de 97 % du maximum,
 * étalés sur 2 pixels ; la nuit en a UN, une étoile, à 127 sur 255. Un nuage blanc saturé serait
 * nombreux mais étalé : on refuse alors de deviner, et le panorama n'est pas tourné.
 *
 * ⚠️ LA MOYENNE DE u EST CIRCULAIRE. Un soleil posé sur la couture tomberait sinon au milieu de
 * l'image, à l'opposé exact de sa vraie place.
 */
export const SOLEIL_SATURE = 240, SOLEIL_PIXELS_MIN = 8, SOLEIL_ETALEMENT_MAX = 6;
export function soleilDuPanorama3D(lum, largeur, hauteur){
  let max = 0;
  for (let i = 0; i < lum.length; i++) if (lum[i] > max) max = lum[i];
  if (max < SOLEIL_SATURE) return null;
  const seuil = 0.97 * max;
  let n = 0, sx = 0, sy = 0, sv = 0, sv2 = 0;
  for (let y = 0; y < hauteur; y++) {
    for (let x = 0; x < largeur; x++) {
      if (lum[y * largeur + x] < seuil) continue;
      const a = 2 * Math.PI * (x + 0.5) / largeur;
      sx += Math.cos(a); sy += Math.sin(a); sv += y; sv2 += y * y; n++;
    }
  }
  if (n < SOLEIL_PIXELS_MIN) return null;
  const r = Math.hypot(sx, sy) / n;
  const etalementU = Math.sqrt(Math.max(0, -2 * Math.log(Math.max(r, 1e-9)))) * largeur / (2 * Math.PI);
  const moyV = sv / n, etalementV = Math.sqrt(Math.max(0, sv2 / n - moyV * moyV));
  if (etalementU > SOLEIL_ETALEMENT_MAX || etalementV > SOLEIL_ETALEMENT_MAX) return null;
  let u = Math.atan2(sy, sx) / (2 * Math.PI);
  if (u < 0) u += 1;
  const elevation = (1 - (moyV + 0.5) / hauteur) * 90;
  return { u, v: 0.5 + elevation / 180, elevation };
}

/**
 * La rotation (radians, autour de l'axe vertical) qui amène le soleil d'un panorama dans la
 * direction du soleil de la scène. Fonction PURE.
 *
 * Convention équirectangulaire de three.js : u = atan2(z, x) / 2π + 0,5. Le soleil du panorama est
 * donc à l'angle local (u − 0,5)·2π ; une rotation r autour de y retire r à l'angle. Testé sur la
 * géométrie réelle de la sphère, pas sur cette formule.
 */
export function lacetDuPanorama3D(soleil, direction){
  if (!soleil || !direction) return 0;
  return (soleil.u - 0.5) * 2 * Math.PI - Math.atan2(direction.z, direction.x);
}

function rvb(hex){
  const s = String(hex || '').replace('#', '');
  const ok = /^[0-9a-fA-F]{6}$/.test(s) ? s : '8FCEF3';
  return [0, 2, 4].map(i => parseInt(ok.slice(i, i + 2), 16) / 255);
}

/**
 * La part de l'intensité de soleil qui correspond au plein jour, pour les étoiles. C'est la
 * constante de `lighting-3d.js`, recopiée et non importée : ce module est importé PAR lui, et la
 * garde de tests/sky-3d.test.mjs vérifie que les deux valeurs restent égales.
 */
export const CIEL_SOLEIL_PLEIN = 0.55;

/** Le sommet : la sphère suit la caméra et se dessine au plan lointain, quelle que soit sa taille. */
export const GLSL_CIEL_SOMMET = `
varying vec3 vDir;
varying vec2 vUv;
void main() {
  vUv = uv;
  vDir = ( modelMatrix * vec4( position, 0.0 ) ).xyz;
  vec4 p = projectionMatrix * viewMatrix * vec4( vDir + cameraPosition, 1.0 );
  // z = w place le fragment au plan lointain ; un rien en deçà pour ne pas y être découpé.
  gl_Position = p.xyww;
  gl_Position.z *= 0.99999;
}
`;

/** Le fragment : soit le panorama, soit le ciel calculé. */
export const GLSL_CIEL_FRAGMENT = `
uniform float uPanorama;
uniform sampler2D uCarte;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uSoleilDir;
uniform vec3 uSoleilCoul;
uniform float uNuages;
uniform float uEtoiles;
varying vec3 vDir;
varying vec2 vUv;

float cielHasard( vec2 p ) { p = fract( p * vec2( 123.34, 456.21 ) ); p += dot( p, p + 45.32 ); return fract( p.x * p.y ); }
float cielBruit( vec2 p ) {
  vec2 i = floor( p ), f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( cielHasard( i ), cielHasard( i + vec2( 1.0, 0.0 ) ), f.x ),
              mix( cielHasard( i + vec2( 0.0, 1.0 ) ), cielHasard( i + vec2( 1.0, 1.0 ) ), f.x ), f.y );
}
float cielFbm( vec2 p ) {
  float s = 0.0, a = 0.5;
  for ( int i = 0; i < 5; i++ ) { s += a * cielBruit( p ); p = p * 2.03 + vec2( 17.1, 3.7 ); a *= 0.5; }
  return s;
}

// Des étoiles PONCTUELLES, calculées : nettes à toute taille, ce qu'aucune photo n'est (#436b).
vec3 cielEtoiles( vec3 d, float couv ) {
  if ( uEtoiles <= 0.0 || d.y <= 0.0 ) return vec3( 0.0 );
  vec2 g = d.xz / ( d.y + 1.0 ) * 220.0;
  vec2 ci = floor( g );
  vec2 o = vec2( cielHasard( ci + 1.3 ), cielHasard( ci + 9.1 ) );
  float pt = smoothstep( 0.18, 0.0, length( fract( g ) - o ) ) * step( 0.93, cielHasard( ci + 7.0 ) );
  float bord = smoothstep( 0.0, 0.25, d.y );
  return vec3( 0.9, 0.95, 1.0 ) * pt * ( 1.0 - couv ) * bord * ( 0.4 + 0.6 * cielHasard( ci + 3.3 ) );
}

void main() {
  if ( uPanorama > 0.5 ) {
    // ⚠️ 1 − u : la SphereGeometry de three.js tourne dans le sens inverse de la convention
    // équirectangulaire. Sans ce retournement, le ciel serait vu en miroir.
    // L'image ne porte que la moitié haute : v de 0,5 à 1 s'étale sur toute sa hauteur, et sous
    // l'horizon on répète sa dernière ligne, que le Sol cache de toute façon.
    vec3 p = texture2D( uCarte, vec2( 1.0 - vUv.x, max( vUv.y * 2.0 - 1.0, 0.0 ) ) ).rgb;
    gl_FragColor = vec4( p + cielEtoiles( normalize( vDir ), 0.0 ) * uEtoiles, 1.0 );
    return;
  }
  vec3 d = normalize( vDir );
  float h = max( d.y, 0.0 );
  vec3 c = mix( uHorizon, uZenith, pow( h, 0.45 ) );
  float s = max( dot( d, normalize( uSoleilDir ) ), 0.0 );
  c += uSoleilCoul * ( 0.18 * pow( s, 6.0 ) + 0.35 * pow( s, 60.0 ) );
  float disque = smoothstep( 0.9993, 0.9997, s );
  if ( d.y > 0.0 ) {
    // Les nuages sont posés sur un plafond plat : ils rétrécissent vers l'horizon, où ils s'effacent.
    vec2 p = d.xz / ( d.y + 0.12 ) * 2.2 + 3.7;
    float n = cielFbm( p );
    float bord = smoothstep( 0.0, 0.25, d.y );
    float couv = smoothstep( 1.0 - uNuages, 1.0 - uNuages + 0.28, n ) * bord;
    // Le côté du nuage tourné vers le soleil est éclairé : on compare le bruit un pas plus loin.
    vec2 versSoleil = normalize( uSoleilDir.xz + vec2( 1e-4 ) );
    float lumiere = clamp( ( cielFbm( p + versSoleil * 0.06 ) - n ) * 4.0 + 0.6, 0.0, 1.0 );
    vec3 nuage = mix( uHorizon * 0.78 + uZenith * 0.1, mix( vec3( 1.0 ), uSoleilCoul, 0.25 ), lumiere );
    nuage += uSoleilCoul * 0.35 * pow( s, 8.0 );
    disque *= 1.0 - couv;
    c = mix( c, nuage, couv * 0.92 );
    c += cielEtoiles( d, couv ) * uEtoiles;
  }
  c += uSoleilCoul * disque * 1.5;
  gl_FragColor = vec4( c, 1.0 );
}
`;

// ── La moitié impure : la sphère, et le chargement des panoramas ───────────────────────────────

let _sphere = null;
/** Par nom de panorama : { etat: 'charge' | 'en-cours' | 'absent', texture, soleil }. */
const _panoramas = {};

function sphereDuCiel3D(){
  if (_sphere) return _sphere;
  const THREE = globalThis.THREE;
  const mat = new THREE.ShaderMaterial({
    vertexShader: GLSL_CIEL_SOMMET,
    fragmentShader: GLSL_CIEL_FRAGMENT,
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uPanorama: { value: 0 }, uCarte: { value: null },
      uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() },
      uSoleilDir: { value: new THREE.Vector3(0, 1, 0) }, uSoleilCoul: { value: new THREE.Color() },
      uNuages: { value: CIEL_NUAGES }, uEtoiles: { value: 0 },
    },
  });
  _sphere = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), mat);
  // Le ciel est derrière tout et ne se découpe jamais.
  // ⚠️ IL NE PROJETTE AUCUNE OMBRE, ET CE N'EST PAS UNE LIGNE D'ICI QUI LE GARANTIT. `castShadow`
  // vaut faux par défaut ; le risque est `marquerProjectionDOmbre3D`, qui l'allume sur toute la
  // scène. C'est l'ORDRE dans scene3d.js qui protège : le ciel est posé après ce marquage et retiré
  // après le rendu, donc il n'est jamais dans la scène quand le marquage passe. Écrire ici
  // `castShadow = false` aurait été une ligne sans effet, et un mutant l'a montré.
  _sphere.frustumCulled = false;
  _sphere.renderOrder = -1;
  _sphere.name = 'ciel';
  return _sphere;
}

/**
 * L'état du panorama d'une Case, pour sa signature : chargé, absent, ou encore attendu. Seul celui
 * de LA Case compte ; l'état de tous ferait redessiner une Case de jour à l'arrivée du ciel de nuit.
 */
export function etatDuPanorama3D(nom){
  if (!nom) return 'calcule';
  const p = _panoramas[nom];
  return p && p.etat !== 'en-cours' ? p.etat : 'attente';
}

function chargerPanorama3D(nom, apres){
  if (_panoramas[nom]) return;
  const THREE = globalThis.THREE;
  if (typeof Image === 'undefined' || !THREE || !THREE.TextureLoader) { _panoramas[nom] = { etat: 'absent' }; return; }
  _panoramas[nom] = { etat: 'en-cours' };
  new THREE.TextureLoader().load(DOSSIER_CIELS + CIEL_PANORAMAS[nom].fichier, (texture) => {
    _panoramas[nom] = { etat: 'charge', texture, soleil: soleilDeLImage3D(texture.image) };
    if (typeof apres === 'function') apres();
  }, undefined, () => {
    console.warn(`[ciel] introuvable : ${DOSSIER_CIELS}${CIEL_PANORAMAS[nom].fichier}, le ciel calculé le remplace. `
      + 'Déposez le panorama avec : npm run bake-ciel');
    _panoramas[nom] = { etat: 'absent' };
    if (typeof apres === 'function') apres();
  });
}

function soleilDeLImage3D(image){
  try {
    const l = 512, h = 128;
    const cv = document.createElement('canvas'); cv.width = l; cv.height = h;
    const ctx = cv.getContext('2d');
    ctx.drawImage(image, 0, 0, l, h);
    const px = ctx.getImageData(0, 0, l, h).data;
    const lum = new Float32Array(l * h);
    for (let i = 0; i < lum.length; i++) lum[i] = 0.2126 * px[4 * i] + 0.7152 * px[4 * i + 1] + 0.0722 * px[4 * i + 2];
    return soleilDuPanorama3D(lum, l, h);
  } catch (e) { return null; }
}

/**
 * Pose le ciel d'une Case dans la scène, juste avant son rendu. `retirerCiel3D` l'enlève juste
 * après, comme le fond : la scène est partagée, et les aperçus n'ont rien demandé.
 */
export function poserCiel3D(scene, eclairage, apres){
  const sphere = sphereDuCiel3D();
  const u = sphere.material.uniforms;
  const nom = eclairage.panorama || null;
  if (nom) chargerPanorama3D(nom, apres);
  const pano = nom && _panoramas[nom];
  if (pano && pano.etat === 'charge') {
    u.uPanorama.value = 1;
    u.uCarte.value = pano.texture;
    u.uEtoiles.value = CIEL_PANORAMAS[nom].etoiles;
    // Seul un panorama AVEC soleil se tourne : celui de nuit n'en a pas, il garde son orientation.
    sphere.rotation.y = lacetDuPanorama3D(pano.soleil, eclairage.soleil.direction);
  } else {
    const { zenith, horizon } = couleursDuCielCalcule3D(eclairage.ciel);
    u.uPanorama.value = 0;
    u.uZenith.value.setRGB(...zenith);
    u.uHorizon.value.setRGB(...horizon);
    const d = eclairage.soleil.direction;
    u.uSoleilDir.value.set(d.x, d.y, d.z);
    u.uSoleilCoul.value.set(eclairage.soleil.couleur);
    u.uEtoiles.value = etoilesDuCiel3D(eclairage.soleil.intensite / CIEL_SOLEIL_PLEIN);
    sphere.rotation.y = 0;
  }
  scene.add(sphere);
  return sphere;
}

export function retirerCiel3D(scene){
  if (_sphere && _sphere.parent === scene) scene.remove(_sphere);
}

/** Pour les tests : oublier les panoramas et la sphère. */
export function _viderCiel3D(){
  for (const k of Object.keys(_panoramas)) delete _panoramas[k];
  _sphere = null;
}

/** Pour les tests : poser un panorama chargé sans passer par le réseau. */
export function _poserPanoramaPourTests3D(nom, texture, soleil){
  _panoramas[nom] = { etat: 'charge', texture, soleil };
}
