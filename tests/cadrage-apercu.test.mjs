/**
 * tests/cadrage-apercu.test.mjs : l'aperçu d'un modèle importé recadré sur ce qui est dessiné.
 * Les fonctions pures, exécutées ; le branchement dans draw.js et scene3d.js, lu dans la source.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { boiteOpaque, ajustementDuCadrage, PART_CIBLE, GAIN_MINIMAL, GAIN_MAXIMAL } from '../src/cadrage-apercu.js';

const image = (w, h, rect) => {
  const d = new Uint8ClampedArray(w * h * 4);
  if (rect) for (let y = rect.y0; y <= rect.y1; y++) for (let x = rect.x0; x <= rect.x1; x++) d[(y * w + x) * 4 + 3] = 255;
  return d;
};

describe('Le rectangle des pixels opaques', () => {
  test('bornes exactes, et null pour une image vide', () => {
    assert.deepEqual(boiteOpaque(image(20, 10, { x0: 3, y0: 2, x1: 7, y1: 8 }), 20, 10), { x0: 3, y0: 2, x1: 7, y1: 8 });
    assert.equal(boiteOpaque(image(20, 10), 20, 10), null);
  });
  test('un pixel presque transparent (anticrénelage) ne compte pas', () => {
    const d = image(10, 10); d[(5 * 10 + 5) * 4 + 3] = 4;
    assert.equal(boiteOpaque(d, 10, 10), null);
  });
});

describe('Le zoom correctif', () => {
  test('un modèle qui occupe un quart de la hauteur est rapproché jusqu\'à la part cible', () => {
    // Le cas signalé : hulk au quart de la hauteur, centré.
    const a = ajustementDuCadrage({ x0: 45, y0: 37, x1: 54, y1: 62 }, 100, 100);
    assert.ok(Math.abs(a.k - PART_CIBLE / 0.26) < 1e-9, `k = ${a.k}`);
    assert.ok(Math.abs(a.ndcX) < 1e-9 && Math.abs(a.ndcY) < 1e-9, 'centré : pas de recentrage');
  });
  test('un contenu décentré est recentré (y vers le haut)', () => {
    const a = ajustementDuCadrage({ x0: 60, y0: 10, x1: 79, y1: 29 }, 100, 100);
    assert.ok(a.k > 1);
    assert.ok(Math.abs(a.ndcX - 0.4) < 1e-9);
    assert.ok(Math.abs(a.ndcY - 0.6) < 1e-9);
  });
  test('jamais de dézoom : un contenu qui touche un bord, ou déjà bien cadré, n\'est pas touché', () => {
    assert.deepEqual(ajustementDuCadrage({ x0: 0, y0: 30, x1: 50, y1: 60 }, 100, 100), { k: 1, ndcX: 0, ndcY: 0 });
    const presque = Math.floor(100 * PART_CIBLE / GAIN_MINIMAL) + 2;
    const debut = Math.floor((100 - presque) / 2);
    assert.equal(ajustementDuCadrage({ x0: debut, y0: debut, x1: debut + presque - 1, y1: debut + presque - 1 }, 100, 100).k, 1);
    assert.equal(ajustementDuCadrage(null, 100, 100).k, 1);
  });
  test('le gain est plafonné', () => {
    assert.equal(ajustementDuCadrage({ x0: 50, y0: 50, x1: 50, y1: 50 }, 100, 100).k, GAIN_MAXIMAL);
  });
});

describe('Le branchement', () => {
  const DRAW = readFileSync(new URL('../src/draw.js', import.meta.url), 'utf8');
  const SC = readFileSync(new URL('../src/scene3d.js', import.meta.url), 'utf8');
  test('le correctif s\'applique SOUS le zoom de la molette et la taille réelle, au modèle importé seulement', () => {
    assert.match(DRAW, /const ajust = tempObj\.objType === 'modele' \? ajustementDeLApercu\(tempObj, style, scale\) : null;/);
    assert.match(DRAW, /S\.objectPreviewZoom \* sizeFactor \* \(ajust \? ajust\.k : 1\)/);
    assert.match(DRAW, /const brut = renderObjectToCanvas3D\(o, 1, style, undefined, scale\);/);
  });
  test('le recentrage passe par frameCameraToBox, dans la branche des modèles importés', () => {
    assert.match(SC, /frameCameraToBox\(personaCamera3D, boîte, zoom, recentrage \? panDeRecentrage3D\(boîte, recentrage\) : undefined\);/);
  });
});
