/**
 * @file src/glb-textures.js
 * Ne décoder qu'UNE fois une image qu'un `.glb` porte en double (#438).
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * LE CONSTAT, RELEVÉ SUR LES 22 MODÈLES DE L'UTILISATEUR
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Le GLTFLoader de three r128 décode et téléverse chaque TEXTURE séparément (son cache est indexé
 * par `texture:index`), même quand deux textures désignent des images aux octets identiques. Des
 * exportateurs en produisent : `centaur3.glb` porte 15 textures pour 11 images distinctes, soit
 * quatre 2048² décodées, téléversées et gardées en mémoire graphique pour rien (336 Mo estimés au
 * lieu de 246) ; la Porsche en a deux. Sur l'ensemble, 2 418 Mo deviennent 2 327.
 *
 * On réécrit donc, AVANT le décodage, le JSON du fichier : chaque référence de matériau vers une
 * texture en double est redirigée vers la première de son groupe. Rien d'autre ne change, donc le
 * rendu est identique au pixel près, et le décodage comme le téléversement sont épargnés.
 *
 * ⚠️ UN GROUPE EXIGE LES MÊMES OCTETS, LE MÊME ÉCHANTILLONNEUR ET LA MÊME FAMILLE D'USAGE. Le
 * chargeur règle l'encodage SUR l'objet texture : sRGB pour la couleur de base et l'émission,
 * linéaire pour le reste. Fusionner une texture de couleur avec la même image servant de normale
 * ferait que l'une écrase l'encodage de l'autre. Deux familles, donc : « couleur » et « donnée ».
 *
 * Fonctions PURES sur des octets : testées sous Node, sans WebGL ni décodage d'image.
 */

const MAGIC_GLTF = 0x46546C67, CHUNK_JSON = 0x4E4F534A, CHUNK_BIN = 0x004E4942;

/** Lit un GLB : son JSON, son chunk binaire, ou `null` si ce n'en est pas un. */
export function lireGlb3D(buffer, seulementSiTextures = false){
  const b = buffer instanceof ArrayBuffer ? buffer : null;
  if (!b || b.byteLength < 20) return null;
  const dv = new DataView(b);
  if (dv.getUint32(0, true) !== MAGIC_GLTF || dv.getUint32(4, true) !== 2) return null;
  let off = 12, json = null, bin = null;
  while (off + 8 <= b.byteLength) {
    const longueur = dv.getUint32(off, true), type = dv.getUint32(off + 4, true);
    const debut = off + 8;
    if (type === CHUNK_JSON) {
      const texte = new TextDecoder().decode(new Uint8Array(b, debut, longueur));
      // ⚠️ UN JSON PEUT PESER PLUSIEURS MÉGAOCTETS (animations) : 33 ms d'analyse pour bird.glb,
      // mesuré, qui n'a que deux textures. Sans au moins deux références d'image, aucune texture
      // ne peut être en double : on s'arrête avant l'analyse.
      if (seulementSiTextures) {
        const i = texte.indexOf('"source"');
        if (i < 0 || texte.indexOf('"source"', i + 1) < 0) return null;
      }
      json = JSON.parse(texte);
    }
    else if (type === CHUNK_BIN) bin = new Uint8Array(b, debut, longueur);
    off = debut + longueur;
  }
  return json ? { json, bin } : null;
}

/** Les références de texture d'un matériau, avec leur famille d'usage. */
function referencesDeTexture(m){
  const pbr = m.pbrMetallicRoughness || {};
  return [
    [pbr, 'baseColorTexture', 'couleur'], [m, 'emissiveTexture', 'couleur'],
    [pbr, 'metallicRoughnessTexture', 'donnee'], [m, 'normalTexture', 'donnee'],
    [m, 'occlusionTexture', 'donnee'],
  ].filter(([o, k]) => o && o[k] && Number.isInteger(o[k].index));
}

/** FNV-1a 32 bits sur des octets : assez pour départager des images de même taille. */
function empreinte(octets){
  let h = 0x811c9dc5;
  for (let i = 0; i < octets.length; i++) { h ^= octets[i]; h = Math.imul(h, 0x01000193) >>> 0; }
  return h;
}

/**
 * Les redirections : index de texture → index de la première texture identique de sa famille.
 * Fonction PURE. N'inclut que les textures réellement redirigées.
 *
 * ⚠️ L'EMPREINTE NE SUFFIT PAS À CONCLURE : deux images de même taille et de même empreinte sont
 * encore COMPARÉES octet par octet. Une collision ne doit jamais remplacer une image par une autre.
 */
export function redirectionsDeTextures3D(json, bin){
  const textures = json.textures || [], images = json.images || [], vues = json.bufferViews || [];
  const octetsDe = (ti) => {
    const t = textures[ti];
    const im = t && images[t.source];
    if (!im || !Number.isInteger(im.bufferView) || !bin) return null;
    const v = vues[im.bufferView];
    if (!v || v.buffer !== 0 && v.buffer !== undefined) return null;
    return bin.subarray(v.byteOffset || 0, (v.byteOffset || 0) + v.byteLength);
  };
  const familles = new Map();   // index de texture → famille, si une seule
  for (const m of json.materials || []) {
    for (const [o, k, fam] of referencesDeTexture(m)) {
      const i = o[k].index;
      const f = familles.get(i);
      familles.set(i, f === undefined || f === fam ? fam : 'mixte');
    }
  }
  // ⚠️ ON NE HACHE QUE CE QUI PEUT ÊTRE EN DOUBLE. Hacher toutes les images coûtait jusqu'à 58 ms
  // pour un fichier qui n'en avait aucune en double (bird.glb, mesuré). On regroupe d'abord par
  // famille, échantillonneur et TAILLE en octets ; deux images de tailles différentes ne sont pas
  // identiques, et la plupart des groupes n'ont alors qu'un membre.
  const parTaille = new Map(), redirections = new Map();
  for (const [ti, fam] of [...familles].sort((a, b) => a[0] - b[0])) {
    if (fam === 'mixte') continue;
    const o = octetsDe(ti);
    if (!o) continue;
    const cle = [fam, JSON.stringify(textures[ti].sampler ?? null), JSON.stringify(textures[ti].extensions ?? null), o.length].join('|');
    if (!parTaille.has(cle)) parTaille.set(cle, []);
    parTaille.get(cle).push(ti);
  }
  for (const membres of parTaille.values()) {
    if (membres.length < 2) continue;
    const vus = [];   // { ti, h }
    for (const ti of membres) {
      const o = octetsDe(ti), h = empreinte(o);
      const egal = vus.find(v => v.h === h && octetsDe(v.ti).every((x, j) => x === o[j]));
      if (egal) redirections.set(ti, egal.ti);
      else vus.push({ ti, h });
    }
  }
  return redirections;
}

/**
 * Le GLB, ses références de texture redirigées. Rend le buffer d'origine s'il n'y a rien à faire.
 * Le JSON est réécrit et recalé sur 4 octets, le binaire recopié tel quel.
 */
export function glbSansTexturesEnDouble3D(buffer){
  const lu = lireGlb3D(buffer, true);
  if (!lu) return { buffer, redirigees: 0 };
  const red = redirectionsDeTextures3D(lu.json, lu.bin);
  if (!red.size) return { buffer, redirigees: 0 };
  for (const m of lu.json.materials || []) {
    for (const [o, k] of referencesDeTexture(m)) if (red.has(o[k].index)) o[k].index = red.get(o[k].index);
  }
  const texte = new TextEncoder().encode(JSON.stringify(lu.json));
  const jsonLong = Math.ceil(texte.length / 4) * 4;
  const binLong = lu.bin ? lu.bin.length : 0;
  const total = 12 + 8 + jsonLong + (lu.bin ? 8 + binLong : 0);
  const out = new ArrayBuffer(total), dv = new DataView(out), u8 = new Uint8Array(out);
  dv.setUint32(0, MAGIC_GLTF, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true);
  dv.setUint32(12, jsonLong, true); dv.setUint32(16, CHUNK_JSON, true);
  u8.set(texte, 20); u8.fill(0x20, 20 + texte.length, 20 + jsonLong);
  if (lu.bin) {
    const o = 20 + jsonLong;
    dv.setUint32(o, binLong, true); dv.setUint32(o + 4, CHUNK_BIN, true);
    u8.set(lu.bin, o + 8);
  }
  return { buffer: out, redirigees: red.size };
}
