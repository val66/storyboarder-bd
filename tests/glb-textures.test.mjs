/**
 * tests/glb-textures.test.mjs, les textures en double d'un `.glb` (#438).
 * Des GLB construits à la main : deux images aux octets identiques, et toutes les raisons de NE PAS
 * les fusionner (échantillonneur, famille d'usage, collision d'empreinte).
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { lireGlb3D, redirectionsDeTextures3D, glbSansTexturesEnDouble3D } from '../src/glb-textures.js';

/** Un GLB : des images (tableaux d'octets), des textures {source, sampler}, des matériaux. */
function glb({ images, textures, materials, samplers }){
  const vues = [], morceaux = [];
  let off = 0;
  for (const im of images) {
    const o = new Uint8Array(im);
    vues.push({ buffer: 0, byteOffset: off, byteLength: o.length });
    morceaux.push(o);
    off += o.length;
    const pad = (4 - (off % 4)) % 4;
    if (pad) { morceaux.push(new Uint8Array(pad)); off += pad; }
  }
  const bin = new Uint8Array(off);
  let p = 0; for (const m of morceaux) { bin.set(m, p); p += m.length; }
  const json = { asset: { version: '2.0' }, buffers: [{ byteLength: off }], bufferViews: vues,
    images: images.map((_, i) => ({ bufferView: i, mimeType: 'image/png' })), textures, materials, samplers };
  const texte = new TextEncoder().encode(JSON.stringify(json));
  const jl = Math.ceil(texte.length / 4) * 4;
  const total = 12 + 8 + jl + 8 + bin.length;
  const out = new ArrayBuffer(total), dv = new DataView(out), u8 = new Uint8Array(out);
  dv.setUint32(0, 0x46546C67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true);
  dv.setUint32(12, jl, true); dv.setUint32(16, 0x4E4F534A, true); u8.set(texte, 20); u8.fill(0x20, 20 + texte.length, 20 + jl);
  dv.setUint32(20 + jl, bin.length, true); dv.setUint32(24 + jl, 0x004E4942, true); u8.set(bin, 28 + jl);
  return out;
}
const A = [1, 2, 3, 4, 5, 6, 7, 8], B = [9, 9, 9, 9, 9, 9, 9, 9];
const mat = (couleur, normale) => ({ pbrMetallicRoughness: couleur === undefined ? {} : { baseColorTexture: { index: couleur } },
  ...(normale === undefined ? {} : { normalTexture: { index: normale } }) });

describe('Les textures en double d’un .glb', () => {
  test('⚠️ DEUX TEXTURES DE COULEUR AUX MÊMES OCTETS : la seconde est redirigée vers la première', () => {
    const g = glb({ images: [A, A], textures: [{ source: 0 }, { source: 1 }], materials: [mat(0), mat(1)] });
    const { json, bin } = lireGlb3D(g);
    assert.deepEqual([...redirectionsDeTextures3D(json, bin)], [[1, 0]]);
    const r = glbSansTexturesEnDouble3D(g);
    assert.equal(r.redirigees, 1);
    const apres = lireGlb3D(r.buffer);
    assert.equal(apres.json.materials[1].pbrMetallicRoughness.baseColorTexture.index, 0);
    assert.deepEqual([...apres.bin], [...bin], 'le binaire a changé');
    // Tout le reste du JSON est intact.
    assert.deepEqual(apres.json.images, json.images);
    assert.deepEqual(apres.json.textures, json.textures);
  });

  test('des octets différents, un échantillonneur différent : rien n’est fusionné', () => {
    assert.equal(redirectionsDeTextures3D(...Object.values(lireGlb3D(glb({ images: [A, B], textures: [{ source: 0 }, { source: 1 }], materials: [mat(0), mat(1)] })))).size, 0);
    const g = glb({ images: [A, A], textures: [{ source: 0, sampler: 0 }, { source: 1, sampler: 1 }], materials: [mat(0), mat(1)],
      samplers: [{ wrapS: 10497 }, { wrapS: 33071 }] });
    assert.equal(redirectionsDeTextures3D(...Object.values(lireGlb3D(g))).size, 0);
  });

  test('⚠️ UNE IMAGE DE COULEUR ET LA MÊME EN NORMALE NE SE FUSIONNENT PAS : l’encodage diffère', () => {
    // Le chargeur règle l'encodage SUR l'objet texture (sRGB pour la couleur, linéaire sinon).
    const g = glb({ images: [A, A], textures: [{ source: 0 }, { source: 1 }], materials: [mat(0, 1)] });
    assert.equal(redirectionsDeTextures3D(...Object.values(lireGlb3D(g))).size, 0);
    // Et une texture servant dans les deux familles n'est jamais un groupe.
    const g2 = glb({ images: [A, A], textures: [{ source: 0 }, { source: 1 }], materials: [mat(0, 0), mat(1)] });
    assert.equal(redirectionsDeTextures3D(...Object.values(lireGlb3D(g2))).size, 0);
  });

  test('⚠️ À TAILLE ÉGALE, LES OCTETS SONT COMPARÉS UN À UN : jamais une image pour une autre', () => {
    const C = [1, 2, 3, 4, 5, 6, 7, 9];
    const g = glb({ images: [A, C], textures: [{ source: 0 }, { source: 1 }], materials: [mat(0), mat(1)] });
    assert.equal(redirectionsDeTextures3D(...Object.values(lireGlb3D(g))).size, 0);
  });

  test('⚠️ UNE VRAIE COLLISION D’EMPREINTE NE FUSIONNE PAS : la comparaison octet à octet tranche', () => {
    // Deux suites de 6 octets de même empreinte FNV-1a 32 bits, trouvées par recherche des
    // anniversaires. Sans la comparaison, l'une aurait été affichée à la place de l'autre.
    const X = [192, 202, 8, 107, 7, 184], Y = [127, 79, 38, 155, 151, 190];
    const g = glb({ images: [X, Y], textures: [{ source: 0 }, { source: 1 }], materials: [mat(0), mat(1)] });
    assert.equal(redirectionsDeTextures3D(...Object.values(lireGlb3D(g))).size, 0);
  });

  test('deux textures servant chacune en couleur ET en normale ne se fusionnent pas', () => {
    const g = glb({ images: [A, A], textures: [{ source: 0 }, { source: 1 }], materials: [mat(0, 0), mat(1, 1)] });
    assert.equal(redirectionsDeTextures3D(...Object.values(lireGlb3D(g))).size, 0);
  });

  test('sans rien à faire, le buffer d’origine est rendu tel quel, et un non-GLB aussi', () => {
    const g = glb({ images: [A, B], textures: [{ source: 0 }, { source: 1 }], materials: [mat(0), mat(1)] });
    assert.equal(glbSansTexturesEnDouble3D(g).buffer, g);
    const pasGlb = new ArrayBuffer(40);
    assert.equal(glbSansTexturesEnDouble3D(pasGlb).buffer, pasGlb);
    assert.equal(lireGlb3D(null), null);
  });

  test('trois copies : les deux dernières vont à la première', () => {
    const g = glb({ images: [A, A, A], textures: [{ source: 0 }, { source: 1 }, { source: 2 }], materials: [mat(0), mat(1), mat(2)] });
    assert.deepEqual([...redirectionsDeTextures3D(...Object.values(lireGlb3D(g)))], [[1, 0], [2, 0]]);
  });

  test('le décodage passe par la réécriture', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../src/model-cache.js', import.meta.url), 'utf8');
    assert.ok(src.includes('const { buffer, redirigees } = glbSansTexturesEnDouble3D(brut);'));
    assert.ok(src.includes("loader.parse(buffer, '',"));
  });
});
