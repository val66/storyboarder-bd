/**
 * @file src/trace-textures-3d.js
 * Les TEXTURES des Traces en 3D (#437) : route, chemin, muret, clôture, haie, barrière.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * POURQUOI UN PLAQUAGE EN COORDONNÉES MONDE
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Les géométries des Traces sont construites à la main (rubans à onglets, murs extrudés le long
 * d'un tracé lissé, poteaux en boîtes), et la plupart n'ont pas de coordonnées de texture qui
 * vaillent : elles n'en avaient jamais eu besoin, tout était en aplat. Leur en ajouter une par
 * constructeur ferait six chantiers, et chacun devrait gérer les angles et les ouvertures.
 *
 * Deux plaquages, tous deux en MÈTRES, ce qui donne à une pierre du muret la même taille partout,
 * quelle que soit la longueur du tracé :
 *
 *   - « monde » : par projection sur les trois axes (« box mapping »). Un sol prend (x, z), une
 *     face verticale (son horizontale, y), et la normale choisit en fondu. Parfait pour ce qui est
 *     plat (route, chemin) ou petit (poteaux et lisses de la clôture) ;
 *   - « tracé » : les coordonnées portées par la géométrie des murs, l'abscisse le long du tracé
 *     et la hauteur (buildTracéWallGeometry3D les écrit). ⚠️ LA PROJECTION DÉDOUBLAIT LE MOTIF SUR
 *     UN MUR EN BIAIS : à 30° des axes, deux projections se mélangeaient, vu au banc. Le long du
 *     tracé, le motif suit le mur, courbes comprises.
 *
 * ⚠️ LA TEXTURE N'ARRIVE QU'APRÈS SON GRAIN. Le préchargement est asynchrone ; tant que le grain
 * manque, la Trace garde son aplat d'avant, et l'état du grain entre dans les signatures pour
 * qu'elle se refasse à son arrivée.
 */
import { TRACÉ_TEXTURES, couleurDeTrace3D } from './constants.js';
import { grainCharge3D } from './bubble-grain.js';
import { appliquerTeinteAuMotif3D, rvbDeCouleur3D, natureDuNom3D } from './bubble-texture.js';

/** La netteté du fondu entre les trois projections : plus grand, plus franc. */
export const PLAQUAGE_NETTETE = 4.0;

/**
 * Le GLSL du plaquage monde. Inséré après `map_pars_fragment`, il remplace `map_fragment`.
 * `uTuile` est la taille d'une tuile en mètres : x pour l'horizontale, y pour la verticale.
 */
export const GLSL_PLAQUAGE_DECLARATIONS = `
uniform vec2 uTuile;
varying vec3 vTraceMonde;
varying vec3 vTraceNormale;
vec4 traceEchantillon( vec2 uv ) { return mapTexelToLinear( texture2D( map, uv ) ); }
`;

/** Le plaquage le long du tracé : la géométrie porte (abscisse, hauteur) en mètres dans `uv`. */
export const GLSL_PLAQUAGE_TRACE = `
#ifdef USE_MAP
  vec4 texelColor = traceEchantillon( vUv / uTuile );
  diffuseColor *= texelColor;
#endif
`;

export const GLSL_PLAQUAGE_FRAGMENT = `
#ifdef USE_MAP
  vec3 nT = abs( normalize( vTraceNormale ) );
  vec3 wT = pow( nT, vec3( ${PLAQUAGE_NETTETE.toFixed(1)} ) );
  wT /= ( wT.x + wT.y + wT.z );
  // Une face tournée vers x se lit en (z, y), vers z en (x, y), vers le haut en (x, z).
  vec4 texelColor = wT.x * traceEchantillon( vec2( vTraceMonde.z / uTuile.x, vTraceMonde.y / uTuile.y ) )
                  + wT.z * traceEchantillon( vec2( vTraceMonde.x / uTuile.x, vTraceMonde.y / uTuile.y ) )
                  + wT.y * traceEchantillon( vec2( vTraceMonde.x / uTuile.x, vTraceMonde.z / uTuile.x ) );
  diffuseColor *= texelColor;
#endif
`;

/** Installe le plaquage monde sur un matériau standard. */
export function installerPlaquageMonde3D(materiau, tuile, mode = 'monde'){
  const uTuile = { value: new globalThis.THREE.Vector2(tuile[0], tuile[1]) };
  materiau.onBeforeCompile = (shader) => {
    shader.uniforms.uTuile = uTuile;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTraceMonde;\nvarying vec3 vTraceNormale;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n'
        + 'vTraceMonde = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;\n'
        + 'vTraceNormale = mat3( modelMatrix ) * objectNormal;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <map_pars_fragment>', '#include <map_pars_fragment>\n' + GLSL_PLAQUAGE_DECLARATIONS)
      .replace('#include <map_fragment>', mode === 'trace' ? GLSL_PLAQUAGE_TRACE : GLSL_PLAQUAGE_FRAGMENT);
  };
  materiau.customProgramCacheKey = () => 'trace-plaquage-1-' + mode;
  materiau.userData.uTuile = uTuile;
  materiau.needsUpdate = true;
  return materiau;
}

/** Les textures teintées, par grain et couleur. Une Trace n'en a qu'une par couleur choisie. */
const _textures = new Map();

/** La texture teintée d'une Trace, ou `null` si son grain n'est pas encore chargé. */
export function textureDeTrace3D(type, couleur){
  const tex = TRACÉ_TEXTURES[type];
  if (!tex) return null;
  const img = grainCharge3D(tex.grain);
  if (!img) return null;
  const teinte = couleurDeTrace3D(type, couleur);
  const cle = tex.grain + '|' + teinte;
  if (_textures.has(cle)) return _textures.get(cle);
  const rvb = rvbDeCouleur3D(teinte);
  if (!rvb || typeof document === 'undefined') return null;
  const tuile = document.createElement('canvas');
  tuile.width = img.width; tuile.height = img.height;
  const tc = tuile.getContext('2d');
  tc.drawImage(img, 0, 0);
  const donnees = tc.getImageData(0, 0, tuile.width, tuile.height);
  appliquerTeinteAuMotif3D(donnees.data, rvb, natureDuNom3D(tex.grain));
  tc.putImageData(donnees, 0, 0);
  const THREE = globalThis.THREE;
  const carte = new THREE.CanvasTexture(tuile);
  carte.wrapS = carte.wrapT = THREE.RepeatWrapping;
  carte.anisotropy = 4;
  carte.needsUpdate = true;
  _textures.set(cle, carte);
  return carte;
}

/** Le grain d'une Trace est-il là ? Pour les signatures. */
export function grainDeTracePret3D(type){
  const tex = TRACÉ_TEXTURES[type];
  return !!(tex && grainCharge3D(tex.grain));
}

/**
 * Le matériau d'une partie de Trace. Texturé si le grain est là, en aplat sinon (l'aplat d'avant).
 * `ombre` assombrit une couche (l'intérieur d'une haie, la base d'une barrière) sans changer la
 * couleur choisie : elle multiplie la texture.
 */
/**
 * ⚠️ LES MATÉRIAUX TEXTURÉS SONT PARTAGÉS, ET JAMAIS LIBÉRÉS (#437c). Mesuré dans un vrai WebGL
 * (ANGLE, Direct3D 11) : libérer le dernier matériau d'un programme LIBÈRE LE PROGRAMME, et le
 * suivant le recompile, 8,7 ms au lieu de 0,7 pour un rendu ordinaire (51,6 ms la toute première
 * fois). Or une Trace se reconstruit à chaque pas d'un glissé, et libérait ses matériaux : un muret
 * seul dans sa Case recompilait son programme à chaque image. Avant #437, ses aplats partageaient
 * le programme standard de tous les modèles, qui ne mourait jamais ; le plaquage, lui, a sa propre
 * clé. On garde donc une instance par réglage, marquée `partage`, que les libérations sautent.
 */
const _materiaux = new Map();

export function materiauDeTrace3D(type, couleur, options = {}){
  const THREE = globalThis.THREE;
  const { ombre = 1, couleurAplat, plaquage = 'monde', ...reste } = options;
  const carte = textureDeTrace3D(type, couleur);
  if (!carte) {
    return new THREE.MeshStandardMaterial({ color: new THREE.Color(couleurAplat || couleur), ...reste });
  }
  const cle = [type, couleurDeTrace3D(type, couleur), ombre, plaquage, JSON.stringify(reste)].join('|');
  if (_materiaux.has(cle)) return _materiaux.get(cle);
  const mat = new THREE.MeshStandardMaterial({ map: carte, color: new THREE.Color(ombre, ombre, ombre), ...reste });
  installerPlaquageMonde3D(mat, TRACÉ_TEXTURES[type].tuile, plaquage);
  mat.userData.partage = true;
  _materiaux.set(cle, mat);
  return mat;
}

/** Libère un matériau de Trace, sauf s'il est partagé. Voir `materiauDeTrace3D`. */
export function libererMateriauDeTrace3D(materiau){
  if (materiau && !(materiau.userData && materiau.userData.partage)) materiau.dispose();
}

/** Pour les tests : oublier les textures. */
export function _viderTexturesDesTraces3D(){ _textures.clear(); _materiaux.clear(); }
