/**
 * tests/modal-chrome.test.mjs, la croix et le titre-poignée de toutes les modales (#440).
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decalageBorne, habillerModales, VISIBLE_MIN_PX, TITRE_PX } from '../src/modal-chrome.js';
import { enregistrerFermeture, fermerModale, _reinitialiserPile } from '../src/modal-stack.js';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(RACINE, 'index.html'), 'utf8');

/** Un DOM minimal : assez pour habillerModales, rien de plus. */
function element(tag, classes = [], id = ''){
  const el = {
    tagName: tag.toUpperCase(), id, children: [], ecouteurs: {}, title: '', textContent: '', type: '',
    classList: {
      _c: new Set(classes),
      contains(c){ return this._c.has(c); }, add(c){ this._c.add(c); }, remove(c){ this._c.delete(c); },
    },
    set className(v){ this.classList._c = new Set(v.split(' ')); },
    get firstChild(){ return this.children[0] || null; },
    insertBefore(n, ref){ const i = this.children.indexOf(ref); this.children.splice(i < 0 ? this.children.length : i, 0, n); },
    appendChild(n){ this.children.push(n); return n; },
    addEventListener(t, f){ (this.ecouteurs[t] ||= []).push(f); },
  };
  return el;
}
function documentDe(overlays){
  return {
    createElement: (t) => element(t),
    querySelectorAll: (sel) => sel === '.modal-overlay' ? overlays : [],
  };
}
function modale(id, avecCroix = false){
  const o = element('div', ['modal-overlay', 'hidden'], id);
  const box = o.appendChild(element('div', ['modal-box']));
  if (avecCroix) box.appendChild(element('button', ['modal-close-btn']));
  box.appendChild(element('h3'));
  box.appendChild(element('input'));
  return { o, box };
}

describe('La croix du coin, pour toutes les modales', () => {
  test('⚠️ CHAQUE MODALE SANS CROIX EN REÇOIT UNE, celles qui en ont une n’en reçoivent pas deux', () => {
    const a = modale('a'), b = modale('b', true);
    const n = habillerModales(documentDe([a.o, b.o]));
    assert.equal(n, 1);
    const croixDe = (box) => box.children.filter(c => c.classList.contains('modal-close-btn'));
    assert.equal(croixDe(a.box).length, 1);
    assert.equal(croixDe(b.box).length, 1);
    assert.equal(a.box.children[0], croixDe(a.box)[0], 'la croix est en tête de la boîte');
  });

  test('⚠️ LA CROIX APPELLE LA FERMETURE DÉCLARÉE, celle d’Échap, et rien d’autre', () => {
    _reinitialiserPile();
    let fermee = 0;
    enregistrerFermeture('a', () => { fermee++; });
    const a = modale('a');
    habillerModales(documentDe([a.o]));
    const croix = a.box.children.find(c => c.classList.contains('modal-close-btn'));
    croix.ecouteurs.click.forEach(f => f());
    assert.equal(fermee, 1);
    assert.equal(fermerModale('inconnue'), false);
  });

  test('le titre devient la poignée, et lui seul', () => {
    const a = modale('a');
    habillerModales(documentDe([a.o]));
    const titre = a.box.children.find(c => c.tagName === 'H3');
    assert.ok(titre.classList.contains('modal-poignee'));
    assert.ok(titre.ecouteurs.mousedown && titre.ecouteurs.mousedown.length === 1);
    const champ = a.box.children.find(c => c.tagName === 'INPUT');
    assert.equal(champ.ecouteurs.mousedown, undefined, 'un champ a été transformé en poignée');
  });

  test('⚠️ TOUTE MODALE D’index.html COMMENCE PAR UNE BOÎTE DONT LE TITRE EST UN h3', () => {
    // Sans h3, une modale n'aurait pas de poignée : on ne pourrait pas la déplacer.
    const blocs = html.split('class="modal-overlay').slice(1);
    assert.ok(blocs.length >= 18, `${blocs.length} modales lues seulement`);
    for (const b of blocs) {
      const id = (b.match(/id="([^"]+)"/) || [])[1];
      const debut = b.slice(0, 600).replace(/<!--[\s\S]*?-->/g, '');
      assert.match(debut, /<div class="modal-box[^"]*"[^>]*>\s*(<button class="modal-close-btn"[^>]*>[^<]*<\/button>\s*)?<h3/, `${id} n'a pas de titre h3 en tête`);
    }
  });

  test('io.js habille les modales après les avoir mises sous surveillance', () => {
    const io = readFileSync(join(RACINE, 'src', 'io.js'), 'utf8');
    assert.ok(io.indexOf('habillerModales();') > io.indexOf('surveillerModales();'));
  });
});

describe('Déplacer une modale', () => {
  const vue = { w: 1600, h: 900 };
  const rect0 = { left: 560, top: 250, width: 480, height: 400 };

  test('un déplacement dans la fenêtre est rendu tel quel', () => {
    assert.deepEqual(decalageBorne(-300, 100, rect0, vue), { dx: -300, dy: 100 });
  });

  test('⚠️ LE TITRE NE SORT JAMAIS PAR LE HAUT, et il en reste toujours de quoi la rattraper', () => {
    assert.equal(decalageBorne(0, -2000, rect0, vue).dy, -250, 'le haut de la modale passe sous 0');
    assert.equal(rect0.top + decalageBorne(0, 5000, rect0, vue).dy, vue.h - TITRE_PX);
    assert.equal(rect0.left + decalageBorne(-5000, 0, rect0, vue).dx + rect0.width, VISIBLE_MIN_PX);
    assert.equal(rect0.left + decalageBorne(5000, 0, rect0, vue).dx, vue.w - VISIBLE_MIN_PX);
  });

  test('le CSS : le titre-poignée laisse la place à la croix et montre qu’on peut l’attraper', () => {
    const css = readFileSync(join(RACINE, 'style.css'), 'utf8');
    assert.match(css, /\.modal-box > h3\.modal-poignee\{[^}]*cursor:move[^}]*padding-right:30px/);
  });
});
