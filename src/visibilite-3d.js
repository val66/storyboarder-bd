/**
 * @file visibilite-3d.js
 * #449 : un Élément est-il VISIBLE dans sa Case ? Hors du cadre, OU caché derrière autre chose.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * LE PRINCIPE : UN RENDU D'IDENTIFIANTS
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * La décision « hors champ » d'avant (`estHorsChamp3D`, utils.js) projetait la BOÎTE d'un Élément et
 * regardait si elle touchait le cadre. Elle ne savait rien de ce qui se trouve DEVANT : un
 * personnage derrière un mur passait pour visible. Ici on rend la Case une seconde fois, petite,
 * avec la même caméra et la même scène, chaque Élément peint d'une couleur unique et tout le reste
 * en noir. Les pixels qui restent à un Élément sont ceux qu'on voit de lui. Le hors-cadre, le
 * partiel et l'occultation sont réglés d'un coup, avec la vraie géométrie et non une boîte.
 *
 * ⚠️ CE QUE CE RENDU NE VOIT PAS, et c'est décidé :
 *   - ce qui est TRANSPARENT ne cache rien (vitres, eau, fumée) : on le retire du rendu ;
 *   - les Bulles, qui sont en 2D par-dessus : un modèle sous une Bulle est dans l'image (crédits) ;
 *   - la FORME de la Case : on compte dans son rectangle, ce qui ne peut que trop compter.
 *
 * ⚠️ DANS LE DOUTE, VISIBLE. Un Élément qu'on n'a pas pu mesurer (rig pas encore chargé, rendu pas
 * encore fait, erreur WebGL) n'est PAS déclaré non visible : cacher un Élément de la liste se voit
 * mal, et un crédit manquant enfreint une licence. Les appelants retombent alors sur le hors-champ
 * géométrique, qui ne se trompe que dans le sens prudent.
 *
 * Les fonctions pures (couleurs, comptage, cadre, décision) sont testées sous Node ; la passe WebGL
 * (`mesurerVisibilites3D`) ne peut pas l'être et reste aussi courte que possible.
 */

/** Au moins autant de pixels pour être visible. Un seul suffit : un pied qui dépasse se voit. */
export const SEUIL_PIXELS_VISIBLE = 1;

/** La plus grande dimension du rectangle de la Case dans le rendu d'identifiants, en pixels. */
export const TAILLE_MESURE_PX = 192;

/** La couleur 0xRRGGBB de l'identifiant n (n ≥ 1). Le noir (0) est « rien, ou autre chose ». */
export function couleurIdentifiant(n){
  if (!Number.isInteger(n) || n < 1 || n > 0xffffff) throw new RangeError('identifiant hors plage : ' + n);
  return n;
}

/** L'identifiant d'un pixel RGB (0 : aucun Élément). */
export function identifiantDeCouleur(r, g, b){
  return (r << 16) | (g << 8) | b;
}

/**
 * Le nombre de pixels de chaque identifiant dans un tampon RGBA (Uint8Array, 4 octets par pixel).
 * @returns {Map<number, number>} identifiant → pixels (le noir n'y est pas)
 */
export function compterPixels(tampon){
  const comptes = new Map();
  for (let i = 0; i + 3 < tampon.length; i += 4) {
    const n = identifiantDeCouleur(tampon[i], tampon[i + 1], tampon[i + 2]);
    if (n) comptes.set(n, (comptes.get(n) || 0) + 1);
  }
  return comptes;
}

/**
 * La taille du rendu d'identifiants et le rectangle de la Case dedans.
 *
 * Le rendu normal couvre toute la PLANCHE (rw × rh, au format de la Page) et la Case en découpe un
 * rectangle centré, proportionnel à panel.w/page.w (cf. drawPanelScene3D). On garde ce cadrage et on
 * réduit l'échelle pour que ce rectangle mesure au plus `cible` pixels : assez fin pour voir un
 * Élément lointain, assez petit pour que lire les pixels ne coûte rien.
 */
export function cadreDeMesure(rw, rh, panel, page, cible = TAILLE_MESURE_PX){
  const fx = page && page.w > 0 ? Math.min(1, Math.max(0, panel.w / page.w)) : 1;
  const fy = page && page.h > 0 ? Math.min(1, Math.max(0, panel.h / page.h)) : 1;
  const cropW = rw * fx, cropH = rh * fy;
  const k = Math.min(1, cible / Math.max(1, cropW, cropH));
  const w = Math.max(1, Math.round(rw * k)), h = Math.max(1, Math.round(rh * k));
  const cw = Math.max(1, Math.min(w, Math.round(w * fx))), ch = Math.max(1, Math.min(h, Math.round(h * fy)));
  return { w, h, x: Math.floor((w - cw) / 2), y: Math.floor((h - ch) / 2), cw, ch };
}

/**
 * La décision. `horsChamp` : le test géométrique (vrai = la boîte ne touche pas le cadre, ce qui
 * est sûr). `mesure` : les pixels comptés, ou null si l'Élément n'a pas été mesuré.
 */
export function estNonVisible({ horsChamp = false, mesure = null } = {}){
  if (horsChamp) return true;
  if (mesure == null) return false;
  return mesure < SEUIL_PIXELS_VISIBLE;
}

/** Un matériau qui laisse voir à travers lui ne cache rien. */
function laisseVoirATravers(m){
  if (!m) return true;
  if (m.visible === false) return true;
  if (m.transmission > 0) return true;
  return !!m.transparent && (m.opacity == null || m.opacity < 0.95);
}

/**
 * LA PASSE WebGL. La scène doit être exactement celle du rendu de la Case qui vient d'avoir lieu
 * (mêmes rigs placés, même caméra). Tout ce qu'on touche est remis en place avant de rendre la main,
 * y compris en cas d'erreur.
 *
 * @param {object} p
 * @param {object} p.renderer      le renderer partagé
 * @param {object} p.scene         la scène partagée
 * @param {object} p.camera        la caméra de la Case, déjà cadrée
 * @param {Map<string, object>} p.groupes  identifiant d'Élément → son groupe dans la scène
 * @param {{w,h,x,y,cw,ch}} p.cadre  cf. cadreDeMesure
 * @returns {{ comptes: Map<string, number>, mesurables: Set<string> }}
 */
export function mesurerVisibilites3D({ renderer, scene, camera, groupes, cadre }){
  const T = THREE;
  const comptes = new Map();
  const mesurables = new Set();
  // Chaque maillage VISIBLE d'un Élément reçoit le numéro de cet Élément.
  const numeroDuMaillage = new Map();
  const idDuNumero = new Map();
  let n = 0;
  groupes.forEach((groupe, id) => {
    if (!groupe || !groupe.visible) return;
    const numero = ++n;
    groupe.traverseVisible(o => { if (o.isMesh && !numeroDuMaillage.has(o)) numeroDuMaillage.set(o, numero); });
    idDuNumero.set(numero, id);
  });
  const sauves = [];
  const numerosDessines = new Set();
  const materiaux = new Map();
  const materiau = (couleur, m) => {
    const skinning = !!(m && m.skinning), morph = !!(m && m.morphTargets);
    const cle = couleur + '|' + skinning + '|' + morph;
    if (!materiaux.has(cle)) {
      materiaux.set(cle, new T.MeshBasicMaterial({
        color: couleur, side: T.DoubleSide, fog: false, toneMapped: false, skinning, morphTargets: morph,
      }));
    }
    return materiaux.get(cle);
  };
  const fond = scene.background, brouillard = scene.fog;
  const cible = new T.WebGLRenderTarget(cadre.w, cadre.h, { depthBuffer: true, stencilBuffer: false });
  const cibleAvant = renderer.getRenderTarget();
  const tampon = new Uint8Array(cadre.cw * cadre.ch * 4);
  try {
    scene.traverseVisible(o => {
      if (o.isMesh) {
        const premier = Array.isArray(o.material) ? o.material[0] : o.material;
        sauves.push([o, o.material, o.visible]);
        const tous = Array.isArray(o.material) ? o.material : [o.material];
        if (tous.every(laisseVoirATravers)) { o.visible = false; return; }
        const numero = numeroDuMaillage.get(o) || 0;
        if (numero) numerosDessines.add(numero);
        o.material = materiau(numero ? couleurIdentifiant(numero) : 0x000000, premier);
      } else if (o.isLine || o.isPoints || o.isSprite) {
        sauves.push([o, o.material, o.visible]);
        o.visible = false;
      }
    });
    scene.background = new T.Color(0x000000);
    scene.fog = null;
    renderer.setRenderTarget(cible);
    renderer.render(scene, camera);
    // readRenderTargetPixels compte depuis le BAS ; le rectangle est centré, la différence est nulle
    // à un pixel près, sans conséquence pour un comptage.
    renderer.readRenderTargetPixels(cible, cadre.x, cadre.y, cadre.cw, cadre.ch, tampon);
  } finally {
    renderer.setRenderTarget(cibleAvant);
    for (const [o, m, v] of sauves) { o.material = m; o.visible = v; }
    scene.background = fond;
    scene.fog = brouillard;
    cible.dispose();
    materiaux.forEach(m => m.dispose());
  }
  // Mesurable : l'Élément avait au moins un maillage opaque dessiné (sinon son rig n'est pas encore
  // là, ou il est tout en verre, et zéro pixel ne voudrait rien dire).
  idDuNumero.forEach((id, numero) => { if (numerosDessines.has(numero)) mesurables.add(id); });
  compterPixels(tampon).forEach((pixels, numero) => {
    const id = idDuNumero.get(numero);
    if (id != null) comptes.set(id, pixels);
  });
  return { comptes, mesurables };
}
