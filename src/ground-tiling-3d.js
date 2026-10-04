/**
 * @file src/ground-tiling-3d.js
 * Le PAVAGE ANTI-RÉPÉTITION du Sol : la texture n'est plus carrelée, elle est échantillonnée dans
 * des cellules hexagonales, chacune avec un décalage et une rotation tirés au hasard.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * POURQUOI, ET POURQUOI ICI
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Signalé à l'usage : quand on dézoome, la neige, le sable et le gravier montrent un quadrillage.
 * Mesuré : leurs photographies portent un motif à l'échelle d'un ou deux mètres (congères,
 * ondulations, paquets de cailloux) qui pèse de 4,8 à 9,5 % de la luminance, contre 0,3 à 0,5 %
 * pour l'herbe ou le bitume. Un carrelage simple répète ce motif à la période de la tuile, et dès
 * que assez de tuiles sont à l'écran, l'œil trouve la grille.
 *
 * Le pavage supprime la PÉRIODE, pas le motif : les congères restent, mais dispersées au lieu
 * d'être alignées. C'est la technique de Heitz et Neyret (2018), simplifiée comme le fait Mikkelsen
 * (2022) : une grille de triangles, trois échantillons par pixel, des poids barycentriques.
 *
 * ⚠️ DEUX RISQUES, ET CE QUI LES TRAITE
 *
 *   - LES COUTURES DE MIPMAP. Un décalage tiré au hasard rend la coordonnée de texture DISCONTINUE
 *     d'une cellule à l'autre ; le GPU déduit le niveau de mipmap des écarts entre pixels voisins,
 *     et à chaque frontière il verrait un écart énorme, donc un niveau grossier : une ligne floue
 *     autour de chaque cellule. On échantillonne donc avec `textureGrad`, en lui passant les
 *     dérivées de la coordonnée D'ORIGINE, continue, tournées comme l'échantillon.
 *
 *   - LA PERTE DE CONTRASTE DANS LES ZONES DE FUSION. Mélanger trois échantillons indépendants
 *     réduit leur écart-type : au centre d'un triangle, d'un facteur √3. C'est ce qui aurait
 *     repris au premier plan la netteté gagnée par le grain en 1024. Le mélange PRÉSERVE donc la
 *     variance : on ré-étire l'écart à la moyenne de 1/√(Σw²), ce qui rend exactement l'échantillon
 *     unique aux sommets et compense la fusion ailleurs. La moyenne vient du CPU, calculée sur la
 *     tuile composée : aucune dépendance au niveau de mipmap le plus haut.
 *
 * ⚠️ UN MOTIF RÉGULIER NE SE PAVE PAS. Même sans rotation, chaque cellule échantillonne une région
 * décalée : des lames de plancher ou des joints de carrelage y seraient coupés et désalignés à
 * chaque frontière. Sable, gravier, neige, herbe : oui ; plancher, carrelage : non. Le registre le
 * déclare matière par matière (`pavage`), et le pavage est inerte ailleurs.
 *
 * Le shader ne s'exécute pas sous Node. Les propriétés qui se calculent — continuité des poids,
 * conservation de la variance, poids qui somment à un — sont tenues par un MODÈLE en JavaScript
 * écrit avec les mêmes constantes, et le GLSL est généré depuis elles pour qu'il ne puisse pas
 * diverger de ce que les tests éprouvent. Le reste se juge sur le banc de `tools/banc-pavage.mjs`.
 */

/** Densité de la grille, en sommets par tuile. Un sommet par tuile environ : peu de fusions. */
export const PAVAGE_ECHELLE = 1.0;
/** Exposant appliqué aux poids barycentriques : plus il est fort, plus les fusions sont étroites. */
export const PAVAGE_NETTETE = 3.0;

/**
 * Part de rotation aléatoire par cellule, de 0 (aucune) à 1 (un tour complet possible).
 *
 * ⚠️ ZÉRO, ET C'EST LE BANC QUI L'A DÉCIDÉ, PAS LA LITTÉRATURE. Heitz, Neyret et Mikkelsen tournent
 * chaque cellule, et la première version de ce module le faisait. Rendu dans tools/banc-pavage.mjs
 * sur le grain de sable, le gros plan montrait des creux sombres en haut dans une cellule et en bas
 * dans la voisine : chaque cellule semblait éclairée d'ailleurs.
 *
 * La cause est dans le cuiseur : un grain gris mêle 30 % d'OMBRAGE tiré de la normale, calculé avec
 * une direction de lumière fixe (PART_OMBRAGE et DIRECTION_LUMIERE de tools/bake-textures.mjs).
 * Tourner la texture tourne cette lumière cuite. Les techniques publiées supposent un albédo pur ;
 * nos grains n'en sont pas. Le DÉCALAGE seul suffit à casser la période, ce qui était le but.
 */
export const PAVAGE_ROTATION = 0.0;

/** Le passage du repère de la texture à la grille inclinée des triangles. */
const INCL_A = -0.57735027, INCL_B = 1.15470054;

/**
 * La grille de triangles, en JavaScript : le MODÈLE de ce que fait le GLSL. Fonction PURE.
 * Rend les trois sommets du triangle qui contient (u, v) et leurs poids barycentriques bruts.
 */
export function grilleTriangulaire3D(u, v, echelle = PAVAGE_ECHELLE){
  const gx = u * echelle, gy = v * echelle;
  const sx = gx, sy = INCL_A * gx + INCL_B * gy;
  const bx = Math.floor(sx), by = Math.floor(sy);
  const fx = sx - bx, fy = sy - by, fz = 1 - fx - fy;
  if (fz > 0) {
    return { poids: [fz, fy, fx], sommets: [[bx, by], [bx, by + 1], [bx + 1, by]] };
  }
  return { poids: [-fz, 1 - fy, 1 - fx], sommets: [[bx + 1, by + 1], [bx + 1, by], [bx, by + 1]] };
}

/** Les poids aiguisés puis normalisés, comme dans le GLSL. Fonction PURE. */
export function poidsAiguises3D(poids, nettete = PAVAGE_NETTETE){
  const p = poids.map(w => Math.pow(Math.max(w, 0), nettete));
  const s = p.reduce((a, b) => a + b, 0) || 1;
  return p.map(w => w / s);
}

/**
 * Le mélange qui préserve la variance, sur une valeur scalaire. Fonction PURE.
 * moyenne + (Σ wᵢ (sᵢ − moyenne)) / √(Σ wᵢ²), avec Σ wᵢ = 1.
 */
export function melangePreservant3D(echantillons, poids, moyenne){
  let m = 0, q = 0;
  for (let i = 0; i < poids.length; i++) { m += poids[i] * echantillons[i]; q += poids[i] * poids[i]; }
  return moyenne + (m - moyenne) / Math.sqrt(q || 1);
}

/** Le GLSL, généré depuis les constantes ci-dessus pour ne pas pouvoir s'en écarter. */
export const GLSL_PAVAGE = `
uniform float uPavage;
uniform vec3 uPavageMoyenne;

vec2 pavageHasard( vec2 p ) {
  vec3 p3 = fract( vec3( p.xyx ) * vec3( 0.1031, 0.1030, 0.0973 ) );
  p3 += dot( p3, p3.yzx + 33.33 );
  return fract( ( p3.xx + p3.yz ) * p3.zy );
}

// La position d'un sommet de la grille, ramenée dans le repère de la texture.
vec2 pavageSommetUV( vec2 s ) {
  return vec2( s.x, ( s.y - ${INCL_A.toFixed(8)} * s.x ) / ${INCL_B.toFixed(8)} ) / ${PAVAGE_ECHELLE.toFixed(4)};
}

vec4 pavageEchantillon( vec2 uv, vec2 s, vec2 dx, vec2 dy ) {
  vec2 h = pavageHasard( s );
  vec2 d = pavageHasard( s + 17.0 );
  float a = h.x * 6.28318530718 * ${PAVAGE_ROTATION.toFixed(4)};
  float c = cos( a ), si = sin( a );
  mat2 r = mat2( c, si, -si, c );
  // Coordonnées LOCALES au sommet : de petites valeurs, donc toute la précision du flottant,
  // là où une coordonnée brute monte jusqu'à plusieurs milliers.
  vec2 u = r * ( uv - pavageSommetUV( s ) ) + d;
  #if __VERSION__ >= 300 || defined( TEXTURE_LOD_EXT )
    return texture2DGradEXT( map, u, r * dx, r * dy );
  #else
    return texture2D( map, u );
  #endif
}

vec4 pavageMap( vec2 uv ) {
  vec2 dx = dFdx( uv ), dy = dFdy( uv );
  vec2 g = uv * ${PAVAGE_ECHELLE.toFixed(4)};
  vec2 sk = vec2( g.x, ${INCL_A.toFixed(8)} * g.x + ${INCL_B.toFixed(8)} * g.y );
  vec2 b = floor( sk );
  vec2 f = fract( sk );
  float fz = 1.0 - f.x - f.y;
  vec3 w; vec2 s1; vec2 s2; vec2 s3;
  if ( fz > 0.0 ) {
    w = vec3( fz, f.y, f.x ); s1 = b; s2 = b + vec2( 0.0, 1.0 ); s3 = b + vec2( 1.0, 0.0 );
  } else {
    w = vec3( -fz, 1.0 - f.y, 1.0 - f.x ); s1 = b + vec2( 1.0 ); s2 = b + vec2( 1.0, 0.0 ); s3 = b + vec2( 0.0, 1.0 );
  }
  w = pow( max( w, vec3( 0.0 ) ), vec3( ${PAVAGE_NETTETE.toFixed(4)} ) );
  w /= ( w.x + w.y + w.z );
  vec4 e1 = mapTexelToLinear( pavageEchantillon( uv, s1, dx, dy ) );
  vec4 e2 = mapTexelToLinear( pavageEchantillon( uv, s2, dx, dy ) );
  vec4 e3 = mapTexelToLinear( pavageEchantillon( uv, s3, dx, dy ) );
  vec4 m = w.x * e1 + w.y * e2 + w.z * e3;
  vec4 moy = vec4( uPavageMoyenne, m.a );
  return clamp( moy + ( m - moy ) / sqrt( dot( w, w ) ), 0.0, 1.0 );
}
`;

/** Le remplacement de `map_fragment` : le pavage quand il est demandé, le chemin d'origine sinon. */
export const GLSL_MAP_FRAGMENT = `
#ifdef USE_MAP
  vec4 texelColor;
  if ( uPavage > 0.5 ) {
    texelColor = pavageMap( vUv );
  } else {
    texelColor = mapTexelToLinear( texture2D( map, vUv ) );
  }
  diffuseColor *= texelColor;
#endif
`;

/**
 * Installe le pavage sur un matériau, avec des uniformes PARTAGÉS.
 *
 * ⚠️ LES UNIFORMES SONT CRÉÉS UNE FOIS, AU-DEHORS. three.js peut recompiler le programme, par
 * exemple quand l'aoMap apparaît ou que les ombres basculent, et chaque recompilation rappelle
 * `onBeforeCompile` avec un shader neuf. Y créer les uniformes les détacherait de ce que le rendu
 * d'une Case écrit : on y raccroche donc toujours les MÊMES objets.
 */
export function installerPavage3D(materiau, uniformes){
  materiau.extensions = Object.assign({}, materiau.extensions, { derivatives: true, shaderTextureLOD: true });
  materiau.onBeforeCompile = (shader) => {
    shader.uniforms.uPavage = uniformes.uPavage;
    shader.uniforms.uPavageMoyenne = uniformes.uPavageMoyenne;
    // ⚠️ APRÈS `map_pars_fragment`, PAS APRÈS `common`. Mes fonctions lisent l'échantillonneur
    // `map`, déclaré par ce chunk, qui vient APRÈS `common` dans le shader du matériau standard.
    // Insérées plus haut, elles auraient référencé une variable pas encore déclarée, et le shader
    // n'aurait pas compilé. Vérifié dans la source de three r128 avant d'écrire, pas après coup.
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <map_pars_fragment>', '#include <map_pars_fragment>\n' + GLSL_PAVAGE)
      .replace('#include <map_fragment>', GLSL_MAP_FRAGMENT);
  };
  materiau.customProgramCacheKey = () => 'sol-pavage-1';
  materiau.needsUpdate = true;
  return materiau;
}
