/**
 * @file src/ground-water-3d.js
 * L'EAU du Sol, inspirée de Sea of Thieves : des vagues calculées par pixel, une couleur qui passe
 * du bleu profond au turquoise de « sous-surface » sur les crêtes rétroéclairées, un peu d'écume au
 * sommet des vagues, et le ciel qui s'y reflète aux angles rasants.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * CE QUE DÉCRIT RARE, ET CE QUI S'EN TRANSPOSE
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Ang, Catling, Ciardi et Kozin, « The Technical Art of Sea of Thieves », SIGGRAPH 2018 Talks :
 *
 *   « The water colour is based on scattering approximations. We blend between a deep water
 *     colour and a sub-surface water colour based on a combination of view angle, sun direction
 *     and a wave peak mask. »
 *
 * Quatre ingrédients, et un seul ne passe pas :
 *
 *   - leurs vagues sont une simulation FFT qui DÉPLACE la géométrie. Impossible ici : le Sol a une
 *     cellule tous les 120 m, #435b l'a mesuré, et un relief de vague ne s'y échantillonne pas. Les
 *     vagues sont donc calculées PAR PIXEL, comme une normale : elles donnent leurs reflets et leurs
 *     crêtes sans toucher au maillage ;
 *   - la couleur profonde / sous-surface selon l'angle de vue, le soleil et les crêtes : pur calcul
 *     de couleur, transposé tel quel. C'est le turquoise lumineux qui fait l'image du jeu ;
 *   - l'écume au sommet des vagues : transposée, discrète, pour une eau calme ;
 *   - le reflet : la lumière du soleil est rendue par three.js sur nos normales, et le ciel de la
 *     Case est ajouté selon Fresnel, fort aux angles rasants, faible à la verticale.
 *
 * ⚠️ LE CRÉNELAGE EST LE RISQUE PRINCIPAL D'UNE EAU CALCULÉE PAR PIXEL. Une vague plus courte que
 * quelques pixels ne peut pas être représentée : échantillonnée quand même, elle scintille en
 * points brillants dès qu'on recule. Chaque vague s'efface donc selon l'EMPREINTE du pixel au sol,
 * mesurée par les dérivées de la position monde : c'est l'équivalent analytique d'un mipmap.
 *
 * Une Case est une image fixe : les vagues sont figées à un instant, il n'y a pas d'animation.
 */

/**
 * Les vagues : longueur d'onde (m), pente maximale (sans unité), direction (degrés), phase.
 * La pente règle l'inclinaison des facettes, donc la vivacité des reflets ; l'amplitude s'en déduit.
 *
 * ⚠️ QUATORZE TRAINS, ET PAS SIX, PARCE QUE SIX SE VOYAIENT. Vue au banc, la première version
 * dessinait un QUADRILLAGE de taches turquoise : quelques sinus de directions voisines interfèrent
 * en un motif périodique, que l'œil lit aussitôt. Ici une suite géométrique de raison 0,7, de douze
 * mètres à douze centimètres, aux directions éparpillées sur ±85°. Les rides fines donnent aussi
 * ses scintillements au gros plan, que la version à six laissait lisse.
 */
const DIRECTIONS = [20, -35, 65, 5, -70, 40, -15, 85, -50, 30, -5, 55, -30, 75];
const PHASES = [0.0, 1.7, 4.1, 2.6, 5.3, 0.9, 3.4, 2.1, 4.8, 1.2, 5.9, 0.4, 3.0, 2.2];
export const EAU_VAGUES = DIRECTIONS.map((direction, i) => ({
  longueur: Number((12 * Math.pow(0.7, i)).toFixed(3)),
  pente: Number((0.10 - 0.003 * i).toFixed(3)),
  direction,
  phase: PHASES[i],
}));

/**
 * La DÉFORMATION du plan avant d'y poser les vagues : deux ondulations très longues qui courbent les
 * fronts. Même avec quatorze trains, les deux plus grands restaient alignés en diagonales dans une
 * vue plongeante. Courbés de quatre mètres sur une cinquantaine, ils ne le sont plus ; à sept, l'eau
 * devenait du marbre, essayé et écarté au banc.
 *
 * ⚠️ LA PENTE DOIT SUIVRE LA DÉFORMATION. Une vague posée sur un plan déformé a pour gradient celui
 * du plan d'arrivée multiplié par la jacobienne transposée ; l'oublier inclinerait les reflets dans
 * une direction qui n'est pas celle des crêtes qu'on voit.
 */
export const EAU_DEFORMATION = { ampleur: 4.0, ondes: [
  { longueur: 57, direction: 70, phase: 1.3 },
  { longueur: 43, direction: -20, phase: 4.2 },
] };

/** Une vague s'efface entre ce nombre de pixels par longueur d'onde et son double. */
export const EAU_PIXELS_MIN = 4;

/**
 * Les couleurs : profonde, sous-surface, écume. Telles qu'AFFICHÉES : le rendu de ce dépôt ne
 * convertit pas en sRGB, une valeur de 0,5 sort donc à 128.
 */
export const EAU_PROFONDE = [0.04, 0.22, 0.34];
export const EAU_SOUS_SURFACE = [0.10, 0.64, 0.60];
export const EAU_ECUME = [0.86, 0.94, 0.93];
/** Part du ciel reflété, multipliée par le facteur de Fresnel. */
export const EAU_REFLET = 0.85;
/** Seuil et force de l'écume sur le masque des crêtes. */
export const EAU_ECUME_SEUIL = 0.82, EAU_ECUME_FORCE = 0.55;

const RAD = Math.PI / 180;

/** Les paramètres dérivés d'une vague : nombre d'onde, amplitude, direction unitaire. Fonction PURE. */
export function parametresDeVague3D(v){
  const k = 2 * Math.PI / v.longueur;
  return { k, amplitude: v.pente / k, dx: Math.cos(v.direction * RAD), dz: Math.sin(v.direction * RAD) };
}

/** L'effacement d'une vague selon l'empreinte du pixel au sol (m/pixel). Fonction PURE. */
export function effacementDeVague3D(longueur, empreinte, pixelsMin = EAU_PIXELS_MIN){
  const e = Math.max(Number(empreinte) || 0, 1e-6);
  return Math.min(1, Math.max(0, (longueur / e - pixelsMin) / pixelsMin));
}

/**
 * Le champ des vagues en un point : hauteur et pente, avec l'effacement. Fonction PURE.
 * C'est le MODÈLE de ce que calcule le GLSL, généré depuis les mêmes constantes.
 */
export function vagues3D(x, z, empreinte = 0, vagues = EAU_VAGUES, deformation = EAU_DEFORMATION){
  // Le point déformé (px, pz) et la jacobienne J[i][j] = d p_i / d q_j.
  const W = deformation.ampleur;
  const [o1, o2] = deformation.ondes.map(ondeDeDeformation3D);
  const s1 = o1.ax * x + o1.az * z + o1.phase, s2 = o2.ax * x + o2.az * z + o2.phase;
  const px = x + W * Math.sin(s1), pz = z + W * Math.sin(s2);
  const J = [[1 + W * Math.cos(s1) * o1.ax, W * Math.cos(s1) * o1.az],
             [W * Math.cos(s2) * o2.ax, 1 + W * Math.cos(s2) * o2.az]];
  let h = 0, gx = 0, gz = 0;
  for (const v of vagues) {
    const { k, amplitude, dx, dz } = parametresDeVague3D(v);
    const f = effacementDeVague3D(v.longueur, empreinte);
    const ph = k * (dx * px + dz * pz) + v.phase;
    h += f * amplitude * Math.sin(ph);
    const c = f * amplitude * k * Math.cos(ph);
    gx += c * dx; gz += c * dz;
  }
  return { h, dhdx: J[0][0] * gx + J[1][0] * gz, dhdz: J[0][1] * gx + J[1][1] * gz };
}

/** Le vecteur d'onde d'une ondulation de déformation. Fonction PURE. */
export function ondeDeDeformation3D(o){
  const k = 2 * Math.PI / o.longueur;
  return { ax: k * Math.cos(o.direction * RAD), az: k * Math.sin(o.direction * RAD), phase: o.phase };
}

/** L'amplitude totale, qui normalise le masque des crêtes. */
export const EAU_AMPLITUDE_TOTALE = EAU_VAGUES.reduce((a, v) => a + parametresDeVague3D(v).amplitude, 0);

const vec3 = (c) => `vec3( ${c.map(x => x.toFixed(4)).join(', ')} )`;

/** Le GLSL des vagues, déroulé depuis EAU_VAGUES pour ne pas pouvoir s'en écarter. */
const GLSL_UNE_VAGUE = (v) => {
  const { k, amplitude, dx, dz } = parametresDeVague3D(v);
  return `  {
    vec2 d = vec2( ${dx.toFixed(6)}, ${dz.toFixed(6)} );
    float f = clamp( ( ${v.longueur.toFixed(4)} / e - ${EAU_PIXELS_MIN.toFixed(1)} ) / ${EAU_PIXELS_MIN.toFixed(1)}, 0.0, 1.0 );
    float ph = ${k.toFixed(6)} * dot( d, p ) + ${v.phase.toFixed(4)};
    r.x += f * ${amplitude.toFixed(6)} * sin( ph );
    r.yz += f * ${(amplitude * k).toFixed(6)} * cos( ph ) * d;
  }`;
};

const [D1, D2] = EAU_DEFORMATION.ondes.map(ondeDeDeformation3D);
const f6 = (x) => x.toFixed(6);

export const GLSL_EAU_DECLARATIONS = `
uniform float uEau;
uniform vec3 uEauCiel;
varying vec2 vSolMonde;

// Hauteur et pente des vagues en un point du sol, effacées selon l'empreinte e du pixel (m/pixel).
vec3 eauVagues( vec2 q, float e ) {
  vec3 r = vec3( 0.0 );
  vec2 a1 = vec2( ${f6(D1.ax)}, ${f6(D1.az)} );
  vec2 a2 = vec2( ${f6(D2.ax)}, ${f6(D2.az)} );
  float s1 = dot( a1, q ) + ${f6(D1.phase)};
  float s2 = dot( a2, q ) + ${f6(D2.phase)};
  vec2 p = q + ${f6(EAU_DEFORMATION.ampleur)} * vec2( sin( s1 ), sin( s2 ) );
${EAU_VAGUES.map(GLSL_UNE_VAGUE).join('\n')}
  // Le gradient revient au plan d'origine par la jacobienne transposée. GLSL range une mat2 par
  // COLONNES : la première colonne est (J00, J10), et v * M vaut transpose(M) * v.
  mat2 J = mat2( 1.0 ) + ${f6(EAU_DEFORMATION.ampleur)} * mat2( cos( s1 ) * a1.x, cos( s2 ) * a2.x, cos( s1 ) * a1.y, cos( s2 ) * a2.y );
  r.yz = r.yz * J;
  return r;
}
`;

/** Inséré avant `color_fragment` : la couleur de l'eau, et la normale qui servira à l'éclairage. */
export const GLSL_EAU_COULEUR = `
  vec3 eauNormaleVue = vec3( 0.0, 0.0, 1.0 );
  if ( uEau > 0.5 ) {
    float e = max( length( dFdx( vSolMonde ) ), length( dFdy( vSolMonde ) ) ) + 1e-4;
    vec3 v = eauVagues( vSolMonde, e );
    vec3 nMonde = normalize( vec3( -v.y, 1.0, -v.z ) );
    eauNormaleVue = normalize( ( viewMatrix * vec4( nMonde, 0.0 ) ).xyz );
    vec3 versCamera = normalize( vViewPosition );
    vec3 versSoleil = vec3( 0.0, 1.0, 0.0 );
    #if NUM_DIR_LIGHTS > 0
      versSoleil = directionalLights[ 0 ].direction;
    #endif
    // Le masque des crêtes, de 0 au creux à 1 au sommet.
    float crete = clamp( v.x / ${EAU_AMPLITUDE_TOTALE.toFixed(6)} * 0.5 + 0.5, 0.0, 1.0 );
    // La sous-surface : la lumière traverse la crête vers l'observateur quand le soleil est DERRIÈRE
    // la vague, et l'angle rasant l'allonge. Rare combine les mêmes trois facteurs.
    float contreJour = pow( clamp( dot( versCamera, -versSoleil ), 0.0, 1.0 ), 3.0 );
    float rasant = 1.0 - clamp( dot( eauNormaleVue, versCamera ), 0.0, 1.0 );
    float sous = smoothstep( 0.35, 0.95, crete ) * ( 0.45 + 0.35 * contreJour + 0.2 * rasant );
    vec3 c = mix( ${vec3(EAU_PROFONDE)}, ${vec3(EAU_SOUS_SURFACE)}, clamp( sous, 0.0, 1.0 ) );
    float ecume = smoothstep( ${EAU_ECUME_SEUIL.toFixed(4)}, 1.0, crete ) * ${EAU_ECUME_FORCE.toFixed(4)};
    diffuseColor.rgb = mix( c, ${vec3(EAU_ECUME)}, ecume );
    // Le ciel reflété, selon Fresnel-Schlick avec F0 = 0,02, celui de l'eau.
    float fresnel = 0.02 + 0.98 * pow( rasant, 5.0 );
    totalEmissiveRadiance += uEauCiel * fresnel * ${EAU_REFLET.toFixed(4)} * ( 1.0 - ecume );
  }
`;

/** Inséré après `normal_fragment_maps` : l'éclairage de three.js voit nos vagues. */
export const GLSL_EAU_NORMALE = `
  if ( uEau > 0.5 ) normal = eauNormaleVue;
`;

/**
 * Installe l'eau sur un matériau, PAR-DESSUS ce qu'un autre module a déjà posé.
 *
 * ⚠️ ON ENCHAÎNE `onBeforeCompile`, ON NE LE REMPLACE PAS. Le pavage l'occupe déjà ; l'écraser le
 * supprimerait sans un message, et les tests du pavage ne le verraient pas puisqu'ils l'installent
 * seul. L'ordre compte aussi : le pavage remplace `map_fragment`, donc l'eau s'ancre ailleurs, sur
 * `color_fragment`, qui le suit immédiatement.
 */
export function installerEau3D(materiau, uniformes){
  const precedent = materiau.onBeforeCompile;
  const clePrecedente = materiau.customProgramCacheKey ? materiau.customProgramCacheKey() : '';
  materiau.extensions = Object.assign({}, materiau.extensions, { derivatives: true });
  materiau.onBeforeCompile = (shader, renderer) => {
    if (typeof precedent === 'function') precedent(shader, renderer);
    shader.uniforms.uEau = uniformes.uEau;
    shader.uniforms.uEauCiel = uniformes.uEauCiel;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vSolMonde;')
      .replace('#include <begin_vertex>',
        '#include <begin_vertex>\nvSolMonde = ( modelMatrix * vec4( transformed, 1.0 ) ).xz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + GLSL_EAU_DECLARATIONS)
      .replace('#include <color_fragment>', GLSL_EAU_COULEUR + '\n#include <color_fragment>')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + GLSL_EAU_NORMALE);
  };
  materiau.customProgramCacheKey = () => clePrecedente + '+eau-1';
  materiau.needsUpdate = true;
  return materiau;
}
