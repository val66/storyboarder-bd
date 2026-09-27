/**
 * Planche de contact d'une Bulle : rend le contour et la frange avec le VRAI code de
 * `src/bubble-shape.js` et `src/bubble-style.js`, en PNG, pour que les réglages d'aspect soient
 * REGARDÉS et non déduits.
 *
 * ⚠️ POURQUOI CET OUTIL EXISTE, ET POURQUOI IL SURÉCHANTILLONNE. Sa première version, jetable,
 * posait une valeur pleine sans alpha et arrondissait le rayon du trait au pixel supérieur : un
 * trait de 0,4 px y devenait un trait NOIR de 1 px là où un canevas en fait un gris à 40 %. La
 * planche noircissait donc systématiquement ce que l'application éclaircissait, et elle a fait
 * écarter à tort deux réglages de densité avant que l'écart avec le rendu réel ne soit relevé à
 * l'usage — « comment cela se fait que le rendu dans l'application change autant par rapport à tes
 * rendus ». C'est la famille « mesurer sans vérifier que l'instrument voit ce qu'on lui demande ».
 *
 * Le rendu se fait donc à SURECHANTILLONNAGE fois la résolution demandée, puis chaque pixel final
 * est la moyenne de son bloc : un trait sous-pixel y couvre une fraction des sous-pixels et ressort
 * en gris, comme sur un canevas. C'est la seule façon d'utiliser cette planche pour juger une
 * finesse.
 *
 * Usage : node tools/apercu-bulle.mjs <sortie.png> [--forme=ovale] [--zoom=1] [--queue]
 */
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SURECHANTILLONNAGE = 4;
const ENCRE = 30;

export function toile(w, h, s = SURECHANTILLONNAGE) {
  const W = w * s, H = h * s;
  const px = new Float64Array(W * H).fill(255);
  const pose = (x, y) => {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    px[y * W + x] = ENCRE;
  };
  /** Un segment d'épaisseur `ep` exprimée dans les unités de l'APPELANT, pas en sous-pixels. */
  const ligne = (x0, y0, x1, y1, ep) => {
    const [X0, Y0, X1, Y1] = [x0 * s, y0 * s, x1 * s, y1 * s];
    const r = Math.max(0.5, (ep * s) / 2);
    const n = Math.max(2, Math.ceil(Math.hypot(X1 - X0, Y1 - Y0) * 2));
    for (let i = 0; i <= n; i++) {
      const t = i / n, cx = X0 + (X1 - X0) * t, cy = Y0 + (Y1 - Y0) * t;
      const b = Math.ceil(r);
      for (let dy = -b; dy <= b; dy++) {
        for (let dx = -b; dx <= b; dx++) if (dx * dx + dy * dy <= r * r) pose(cx + dx, cy + dy);
      }
    }
  };
  const reduire = () => {
    const out = Buffer.alloc(w * h * 3);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let somme = 0;
        for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) somme += px[(y * s + j) * W + (x * s + i)];
        const v = Math.round(somme / (s * s));
        const k = (y * w + x) * 3; out[k] = out[k + 1] = out[k + 2] = v;
      }
    }
    return out;
  };
  const png = () => {
    const plat = reduire();
    const brut = Buffer.alloc((w * 3 + 1) * h);
    for (let y = 0; y < h; y++) {
      brut[y * (w * 3 + 1)] = 0;
      plat.copy(brut, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3);
    }
    const crcT = [...Array(256)].map((_, n) => { let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
    const crc = (b) => { let c = 0xFFFFFFFF;
      for (const o of b) c = crcT[(c ^ o) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
    const bloc = (type, data) => { const l = Buffer.alloc(4); l.writeUInt32BE(data.length);
      const td = Buffer.concat([Buffer.from(type), data]);
      const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
    ihdr[8] = 8; ihdr[9] = 2;
    return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      bloc('IHDR', ihdr), bloc('IDAT', zlib.deflateSync(brut)), bloc('IEND', Buffer.alloc(0))]);
  };
  return { ligne, png };
}

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Les trois proportions qui séparent les politiques de direction et de densité. */
export const PROPORTIONS = [[380, 160], [560, 110], [170, 300]];

export async function planche({ sortie, forme = 'ovale', zoom = 1, trait = 3 }) {
  const { pointDuContourBulle } = await import(path.join(RACINE, 'src/bubble-shape.js'));
  const style = await import(path.join(RACINE, 'src/bubble-style.js'));
  const { pointesDeLEpine3D, EPINE_FINESSE, EPINE_SOCLE } = style;
  const CASE_L = 640, CASE_H = 360, N = 240;
  const t = toile(CASE_L * PROPORTIONS.length * zoom, CASE_H * zoom);
  PROPORTIONS.forEach(([w, h], k) => {
    const o = { id: 'aperçu', type: 'bulle', x: 0, y: 0, w, h, bulleShape: forme };
    const contour = [];
    for (let i = 0; i < N; i++) contour.push(pointDuContourBulle(o, (Math.PI * 2 * i) / N));
    const dx = (k * CASE_L + (CASE_L - w) / 2) * zoom, dy = ((CASE_H - h) / 2) * zoom;
    const P = (p) => ({ x: p.x * zoom + dx, y: p.y * zoom + dy });
    for (let i = 0; i < N; i++) {
      const a = P(contour[i]), b = P(contour[(i + 1) % N]);
      t.ligne(a.x, a.y, b.x, b.y, trait * EPINE_SOCLE * zoom);
    }
    const pointes = pointesDeLEpine3D({ x: w / 2, y: h / 2 }, contour, trait, 7);
    for (let i = 0; i < pointes.length; i += 2) {
      const a = P(pointes[i]), b = P(pointes[i + 1]);
      t.ligne(a.x, a.y, b.x, b.y, trait * EPINE_FINESSE * zoom);
    }
  });
  fs.writeFileSync(sortie, t.png());
  return sortie;
}

if (process.argv[1] && process.argv[1].endsWith('apercu-bulle.mjs')) {
  const arg = (nom, defaut) => {
    const t = process.argv.find(a => a.startsWith(`--${nom}=`));
    return t ? t.split('=')[1] : defaut;
  };
  const sortie = process.argv[2];
  if (!sortie) { console.error('usage : node tools/apercu-bulle.mjs <sortie.png> [--forme=] [--zoom=]'); process.exit(1); }
  await planche({ sortie, forme: arg('forme', 'ovale'), zoom: Number(arg('zoom', 1)) });
  console.log(sortie);
}
