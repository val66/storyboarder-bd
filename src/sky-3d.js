/**
 * @file src/sky-3d.js
 * Le CIEL d'une Case : entièrement calculé, en Jour, en Nuit comme en Personnalisé.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * POURQUOI PLUS AUCUNE PHOTO
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * #436 a d'abord livré des panoramas photographiés en Jour et en Nuit. Jugés à l'écran, ils étaient
 * flous, et ce n'était pas un réglage : une Case d'environ 2 000 pixels couvre 66°, et même un 8K qui
 * fait le tour complet n'en donne que 1 500. Les étoiles, des points, devenaient des taches. Être net
 * aurait demandé du 16K découpé en plusieurs textures, 340 Mo de mémoire graphique pour UN ciel.
 * S'y ajoutaient l'horizon d'une photo, toujours brumeux, et un soleil d'image qu'on ne peut que
 * tourner, jamais monter ni teinter.
 *
 * Calculé, le ciel est NET À TOUTE TAILLE : chaque détail plus petit qu'un pixel s'efface, aucun
 * n'est agrandi. Et le soleil comme la lune sont dessinés EXACTEMENT dans la direction de la lumière
 * de la scène, celle qui porte les ombres. Une première version stylisée, aux nuages en aplats, a
 * été jugée « trop stylisée » ; celle-ci approche le volume (voir `GLSL_CIEL_FRAGMENT`).
 *
 * ⚠️ LE CIEL EST UN FOND, PAS UNE LUMIÈRE. Il ne participe pas à l'éclairage des modèles : c'est
 * une décision prise pour juger d'abord le rendu, et la reprendre toucherait toutes les Cases.
 */
import { CLE_ACTUELLE } from './lighting-3d.js';

/**
 * Les deux couleurs du ciel, dérivées de LA couleur de ciel déjà résolue. Fonction PURE.
 * Le zénith est plus profond, l'horizon plus clair et délavé, comme l'est un vrai ciel par
 * l'épaisseur d'air qu'on regarde à travers. Rendre la couleur résolue en un seul point ferait
 * diverger le ciel de ce que la signature de Case connaît déjà.
 */
export const CIEL_ZENITH = 0.72;
// 0,45 jusqu'en #436d : un horizon délavé de près de moitié, jugé terne à l'écran.
export const CIEL_HORIZON_BLANC = 0.25;
export function couleursDuCielCalcule3D(hex){
  const c = rvb(hex);
  return {
    zenith: c.map(x => x * CIEL_ZENITH),
    horizon: c.map(x => x + (1 - x) * CIEL_HORIZON_BLANC),
  };
}

/**
 * Le degré de NUIT d'un ciel (0 à 1), d'après l'intensité de son soleil rapportée au plein jour.
 * Fonction PURE. Il allume les étoiles, change le disque en lune, assombrit et raréfie les nuages.
 *
 * ⚠️ IL VAUT 1 EXACTEMENT POUR LE MODE NUIT, et ce n'est pas un hasard de réglage : son soleil est
 * à 0,327 du plein jour (cf. PRESETS_LUMIERE), et la rampe s'achève à 0,33. Un Personnalisé
 * assombri glisse ainsi vers la même nuit, sans seconde définition de ce qu'est une nuit.
 */
export const NUIT_DEBUT = 0.6, NUIT_PLEINE = 0.33;
export function nuitDuCiel3D(intensiteRelative){
  const i = Number(intensiteRelative);
  if (!Number.isFinite(i)) return 0;
  return Math.min(1, Math.max(0, (NUIT_DEBUT - i) / (NUIT_DEBUT - NUIT_PLEINE)));
}

/** La couverture nuageuse : 42 % de jour, 30 % en pleine nuit, pour laisser voir les étoiles. */
export const NUAGES_JOUR = 0.42, NUAGES_NUIT = 0.30;
export function couvertureNuageuse3D(nuit){
  const n = Math.min(1, Math.max(0, Number(nuit) || 0));
  return NUAGES_JOUR + (NUAGES_NUIT - NUAGES_JOUR) * n;
}

/**
 * De combien l'horizon VISIBLE est sous l'horizon vrai (radians), quand le Sol est coupé par le
 * plan lointain de la caméra. Fonction PURE.
 *
 * ⚠️ C'EST CE QUI RENDAIT L'HORIZON « FLOU ET TERNE » (#436c). Le Sol fait 12 000 unités, mais la
 * caméra d'une Case ne voit qu'à `far` = distance × 2 + 10 : il s'arrête bien avant l'horizon. Entre
 * son bord et l'horizon vrai, on voyait le ciel SOUS l'horizon, un aplat d'environ huit degrés que
 * l'œil lisait comme un ciel délavé. La réponse n'est pas d'allonger `far`, qui règle la précision
 * de profondeur de toute la scène, mais d'abaisser l'horizon du ciel jusqu'au bord du Sol.
 *
 * Le bord du Sol est là où un rayon atteint la profondeur `lointain` le long de l'axe de visée :
 * un rayon d'élévation −β touche le sol à la distance h / sin β, de profondeur h·cos(β − φ) / sin β
 * pour une caméra piquée de φ. Cette profondeur décroît avec β : on la résout par dichotomie.
 * Exacte au centre de l'image ; sur les bords, où la profondeur se mesure de biais, le Sol s'arrête
 * un peu plus haut, ce que la continuité de la déformation absorbe.
 */
export function abaissementDeLHorizon3D(hauteur, lointain, pique){
  const h = Number(hauteur), f = Number(lointain), p = Number(pique) || 0;
  if (!(h > 0) || !(f > 0)) return 0;
  const profondeur = (b) => h * Math.cos(b - p) / Math.sin(b);
  let bas = 1e-6, haut = Math.PI / 2;
  if (profondeur(haut) >= f) return 0;
  for (let i = 0; i < 60; i++) {
    const m = (bas + haut) / 2;
    if (profondeur(m) > f) bas = m; else haut = m;
  }
  return (bas + haut) / 2;
}

/**
 * L'élévation du CIEL montrée dans une direction d'élévation `e` (radians), l'horizon étant abaissé
 * de `a`. Fonction PURE, modèle de `cielDirection` dans le GLSL : le bord du Sol (−a) reçoit
 * l'horizon du ciel (0), le zénith reste le zénith, et entre les deux c'est linéaire.
 */
export function elevationDuCiel3D(e, a){
  return (e + a) * (Math.PI / 2) / (Math.PI / 2 + a);
}

function rvb(hex){
  const s = String(hex || '').replace('#', '');
  const ok = /^[0-9a-fA-F]{6}$/.test(s) ? s : '8FCEF3';
  return [0, 2, 4].map(i => parseInt(ok.slice(i, i + 2), 16) / 255);
}

/** Les réglages des nuages, réunis pour pouvoir être affinés sans chercher dans le GLSL. */
export const NUAGES = {
  echelle: 2.0,      // densité de motifs sur le plafond nuageux
  plafond: 0.30,     // décalage de la projection : plus grand, moins de nuages géants au zénith
  bord: 0.07,        // largeur de la transition du bord : plus petit, plus net
  pas: 0.07,         // pas des échantillons de lumière vers le soleil
  absorption: 0.55,  // assombrissement par l'épaisseur traversée (Beer-Lambert)
};

/** Le sommet : la sphère suit la caméra et se dessine au plan lointain, quelle que soit sa taille. */
export const GLSL_CIEL_SOMMET = `
varying vec3 vDir;
void main() {
  vDir = ( modelMatrix * vec4( position, 0.0 ) ).xyz;
  vec4 p = projectionMatrix * viewMatrix * vec4( vDir + cameraPosition, 1.0 );
  // z = w place le fragment au plan lointain ; un rien en deçà pour ne pas y être découpé.
  gl_Position = p.xyww;
  gl_Position.z *= 0.99999;
}
`;

const f4 = (x) => Number(x).toFixed(4);

/**
 * Le fragment.
 *
 * LES NUAGES sont posés sur un plafond plat, projeté dans la direction de chaque pixel. Leur forme
 * est un bruit fractal doucement déformé, et leur bord un bruit « en chou-fleur » (1 − |2b − 1|) qui
 * donne les volutes d'un cumulus. Leur lumière approche le volume : on mesure l'épaisseur de nuage
 * traversée en trois pas vers le soleil, et on assombrit selon Beer-Lambert ; face au soleil, la
 * diffusion vers l'avant (Henyey-Greenstein) allume un liseré sur les bords minces.
 *
 * ⚠️ NET À TOUTE TAILLE, SANS SCINTILLER. Chaque octave du bruit s'efface quand sa période tombe
 * sous trois pixels, mesurés par les dérivées de la position sur le plafond : c'est le même mipmap
 * analytique que l'eau de #435m. Un détail est donc soit net, soit absent, jamais agrandi.
 *
 * ⚠️ LE DISQUE EST DANS LA VRAIE DIRECTION DE LA LUMIÈRE, pas dans la direction déformée par
 * l'abaissement de l'horizon. Sinon il se serait décalé de quelques degrés de l'ombre qu'il porte.
 */
export const GLSL_CIEL_FRAGMENT = `
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uSoleilDir;
uniform vec3 uSoleilCoul;
uniform float uNuages;
uniform float uNuit;
uniform float uAbaisse;
varying vec3 vDir;

float cielHasard( vec2 p ) { p = fract( p * vec2( 123.34, 456.21 ) ); p += dot( p, p + 45.32 ); return fract( p.x * p.y ); }
float cielBruit( vec2 p ) {
  vec2 i = floor( p ), f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( cielHasard( i ), cielHasard( i + vec2( 1.0, 0.0 ) ), f.x ),
              mix( cielHasard( i + vec2( 0.0, 1.0 ) ), cielHasard( i + vec2( 1.0, 1.0 ) ), f.x ), f.y );
}
const mat2 cielRot = mat2( 1.6, -1.2, 1.2, 1.6 );
// Un octave s'efface quand sa période tombe sous trois pixels (e = empreinte du pixel sur le plafond).
float cielPoids( float freq, float e ) { return clamp( ( 1.0 / ( freq * e ) - 3.0 ) / 3.0, 0.0, 1.0 ); }
float cielFbm3( vec2 p, float e ) {
  float s = 0.0, a = 0.5, fr = 1.0;
  for ( int i = 0; i < 3; i++ ) { float w = cielPoids( fr, e ); s += a * mix( 0.5, cielBruit( p ), w ); p = cielRot * p + vec2( 17.1, 3.7 ); a *= 0.5; fr *= 2.0; }
  return s / 0.875;
}
float cielFbm5( vec2 p, float e ) {
  float s = 0.0, a = 0.5, fr = 1.0;
  for ( int i = 0; i < 5; i++ ) { float w = cielPoids( fr, e ); s += a * mix( 0.5, cielBruit( p ), w ); p = cielRot * p + vec2( 17.1, 3.7 ); a *= 0.5; fr *= 2.0; }
  return s / 0.96875;
}
float cielVolutes( vec2 p, float e ) {
  float s = 0.0, a = 0.5, fr = 1.0;
  for ( int i = 0; i < 5; i++ ) { float w = cielPoids( fr, e ); s += a * mix( 0.5, 1.0 - abs( 2.0 * cielBruit( p ) - 1.0 ), w ); p = cielRot * p + vec2( 17.1, 3.7 ); a *= 0.5; fr *= 2.0; }
  return s / 0.96875;
}
float cielNuage( vec2 q, float e ) {
  vec2 w = vec2( cielFbm3( q * 0.5 + vec2( 5.2, 1.3 ), e * 0.5 ), cielFbm3( q * 0.5 + vec2( 1.7, 9.2 ), e * 0.5 ) ) - 0.5;
  vec2 q2 = q + w * 0.6;
  return cielFbm3( q2, e ) * 0.78 + cielVolutes( q2 * 4.0, e * 4.0 ) * 0.22;
}

// La direction du ciel, l'horizon abaissé jusqu'au bord du Sol : voir abaissementDeLHorizon3D.
vec3 cielDirection( vec3 d ) {
  float e = asin( clamp( d.y, -1.0, 1.0 ) );
  float e2 = ( e + uAbaisse ) * 1.5707963 / ( 1.5707963 + uAbaisse );
  vec2 h = d.xz / max( length( d.xz ), 1e-6 );
  return vec3( h.x * cos( e2 ), sin( e2 ), h.y * cos( e2 ) );
}

// Des étoiles PONCTUELLES : nettes à toute taille.
float cielEtoiles( vec3 d ) {
  vec2 g = d.xz / ( d.y + 1.0 ) * 260.0;
  vec2 ci = floor( g );
  vec2 o = vec2( cielHasard( ci + 1.3 ), cielHasard( ci + 9.1 ) ) * 0.7 + 0.15;
  float pt = smoothstep( 0.16, 0.04, length( fract( g ) - o ) ) * step( 0.92, cielHasard( ci + 7.0 ) );
  return pt * ( 0.35 + 0.65 * cielHasard( ci + 3.3 ) );
}

void main() {
  vec3 vrai = normalize( vDir );
  vec3 d = cielDirection( vrai );
  vec3 L = normalize( uSoleilDir );
  float h = max( d.y, 0.0 );
  vec3 c = mix( uHorizon, uZenith, pow( h, 0.5 ) );
  float s = max( dot( vrai, L ), 0.0 );
  c += uSoleilCoul * ( 0.12 * pow( s, 4.0 ) + 0.25 * pow( s, 40.0 ) ) * ( 1.0 - 0.7 * uNuit );
  float a = 0.0;
  if ( d.y > 0.0 ) {
    vec2 p = d.xz / ( d.y + ${f4(NUAGES.plafond)} ) * ${f4(NUAGES.echelle)} + 3.7;
    float e = max( length( dFdx( p ) ), length( dFdy( p ) ) ) + 1e-5;
    float n = cielNuage( p, e );
    float seuil = 1.0 - uNuages;
    float dens = smoothstep( seuil, seuil + ${f4(NUAGES.bord)}, n );
    // L'épaisseur traversée vers le soleil, en trois pas : Beer-Lambert.
    vec2 vs = L.xz / max( length( L.xz ), 1e-4 );
    float opt = 0.0;
    for ( int j = 1; j <= 3; j++ ) {
      opt += smoothstep( seuil, seuil + 0.10, cielNuage( p + vs * ${f4(NUAGES.pas)} * float( j ), e ) );
    }
    float T = exp( -opt * ${f4(NUAGES.absorption)} );
    // La diffusion vers l'avant : un liseré lumineux sur les bords minces, face au soleil.
    float g = 0.6;
    float phase = ( 1.0 - g * g ) / pow( 1.0 + g * g - 2.0 * g * dot( vrai, L ), 1.5 ) * 0.06;
    vec3 cielMoyen = mix( uHorizon, uZenith, 0.5 );
    vec3 ombre = mix( cielMoyen * 0.55 + vec3( 0.36, 0.37, 0.40 ), cielMoyen * 1.10, uNuit );
    vec3 eclaire = mix( vec3( 0.72 ) + uSoleilCoul * 0.25, cielMoyen * 1.5 + uSoleilCoul * 0.12, uNuit );
    vec3 nuage = mix( ombre, eclaire, T ) + uSoleilCoul * phase * ( 1.0 - dens ) * ( 1.0 - 0.7 * uNuit );
    nuage *= 0.80 + 0.40 * cielFbm5( p * 3.0 + vec2( 2.2, 7.7 ), e * 3.0 );
    a = dens * smoothstep( 0.0, 0.10, d.y );
    c = mix( c, nuage, a );
    c += vec3( 0.92, 0.95, 1.0 ) * cielEtoiles( d ) * uNuit * ( 1.0 - a ) * smoothstep( 0.0, 0.15, d.y );
  }
  // Le disque, soleil ou lune, au bord net et anticrénelé.
  float ang = acos( clamp( dot( vrai, L ), -1.0, 1.0 ) );
  float r = mix( 0.022, 0.03, uNuit );
  float aad = max( fwidth( ang ), 1e-4 );
  float disque = 1.0 - smoothstep( r - aad, r + aad, ang );
  vec3 couleurDisque = mix( vec3( 1.0, 0.98, 0.92 ) * 1.6, vec3( 0.93, 0.94, 0.9 ), uNuit );
  c = mix( c, couleurDisque, disque * ( 1.0 - a * 0.9 ) );
  gl_FragColor = vec4( c, 1.0 );
}
`;

// ── La moitié impure : la sphère ────────────────────────────────────────────────────────────────

let _sphere = null;

function sphereDuCiel3D(){
  if (_sphere) return _sphere;
  const THREE = globalThis.THREE;
  const mat = new THREE.ShaderMaterial({
    vertexShader: GLSL_CIEL_SOMMET,
    fragmentShader: GLSL_CIEL_FRAGMENT,
    side: THREE.BackSide,
    depthWrite: false,
    // dFdx et fwidth : l'effacement des octaves et l'anticrénelage du disque.
    extensions: { derivatives: true },
    uniforms: {
      uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() },
      uSoleilDir: { value: new THREE.Vector3(0, 1, 0) }, uSoleilCoul: { value: new THREE.Color() },
      uNuages: { value: NUAGES_JOUR }, uNuit: { value: 0 }, uAbaisse: { value: 0 },
    },
  });
  _sphere = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), mat);
  // Le ciel est derrière tout et ne se découpe jamais.
  // ⚠️ IL NE PROJETTE AUCUNE OMBRE, ET CE N'EST PAS UNE LIGNE D'ICI QUI LE GARANTIT. `castShadow`
  // vaut faux par défaut ; le risque est `marquerProjectionDOmbre3D`, qui l'allume sur toute la
  // scène. C'est l'ORDRE dans scene3d.js qui protège : le ciel est posé après ce marquage et retiré
  // après le rendu, donc il n'est jamais dans la scène quand le marquage passe.
  _sphere.frustumCulled = false;
  _sphere.renderOrder = -1;
  _sphere.name = 'ciel';
  return _sphere;
}

/**
 * Pose le ciel d'une Case dans la scène, juste avant son rendu. `retirerCiel3D` l'enlève juste
 * après, comme le fond : la scène est partagée, et les aperçus n'ont rien demandé.
 */
export function poserCiel3D(scene, eclairage, abaissement = 0){
  const sphere = sphereDuCiel3D();
  const u = sphere.material.uniforms;
  const { zenith, horizon } = couleursDuCielCalcule3D(eclairage.ciel);
  const nuit = nuitDuCiel3D(eclairage.soleil.intensite / CLE_ACTUELLE);
  u.uZenith.value.setRGB(...zenith);
  u.uHorizon.value.setRGB(...horizon);
  const d = eclairage.soleil.direction;
  u.uSoleilDir.value.set(d.x, d.y, d.z);
  u.uSoleilCoul.value.set(eclairage.soleil.couleur);
  u.uNuit.value = nuit;
  u.uNuages.value = couvertureNuageuse3D(nuit);
  u.uAbaisse.value = Number(abaissement) > 0 ? Number(abaissement) : 0;
  scene.add(sphere);
  return sphere;
}

export function retirerCiel3D(scene){
  if (_sphere && _sphere.parent === scene) scene.remove(_sphere);
}

/** Pour les tests : oublier la sphère. */
export function _viderCiel3D(){ _sphere = null; }
