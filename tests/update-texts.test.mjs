/**
 * tests/update-texts.test.mjs, les textes des mises à jour (#442) : la modale et l'écran bloquant.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { JOURS_HORS_LIGNE, textesMaj, contenuDuBlocage, pourcentage, notesEnHtml, nouveautesEnHtml } from '../src/update-texts.js';
import politique from '../update-policy.js';

const base = {
  etat: 'obligatoire', raison: null, jours: null, enLigne: true, versionMinimale: '1.9.0',
  installee: '1.8.4', disponible: true, version: '1.9.1', taille: '124 Mo', notes: [], lang: 'fr',
};

describe('l\'écran bloquant', () => {
  test('obligatoire, en ligne : on explique, on donne le poids et le redémarrage, on propose d\'installer', () => {
    const c = contenuDuBlocage(base);
    assert.equal(c.titre, 'Mise à jour obligatoire');
    assert.equal(c.action, 'installer');
    assert.equal(c.notes, true);
    assert.match(c.paragraphes[0], /1\.9\.0.*obligatoire.*1\.8\.4/);
    assert.ok(c.paragraphes.includes('Téléchargement : 124 Mo.'));
    assert.ok(c.paragraphes.some(p => /redémarrera/.test(p)));
  });
  test('obligatoire, hors ligne : on dit de se connecter, et on propose de réessayer', () => {
    const c = contenuDuBlocage({ ...base, enLigne: false });
    assert.equal(c.titre, 'Mise à jour obligatoire');
    assert.equal(c.action, 'reessayer');
    assert.ok(c.paragraphes.some(p => /hors ligne/.test(p)));
    assert.ok(!c.paragraphes.some(p => /redémarrera/.test(p)));
  });
  test('obligatoire, en ligne mais installeur introuvable : réessayer', () => {
    const c = contenuDuBlocage({ ...base, disponible: false, taille: '' });
    assert.equal(c.action, 'reessayer');
    assert.ok(c.paragraphes.some(p => /inaccessible/.test(p)));
    assert.ok(!c.paragraphes.some(p => /Téléchargement/.test(p)));
  });
  test('⚠️ HORS LIGNE TROP LONGTEMPS N\'EST PAS UNE MISE À JOUR OBLIGATOIRE : autre titre, pas de notes', () => {
    const c = contenuDuBlocage({ ...base, etat: 'horsLigne', raison: 'expire', jours: 17 });
    assert.equal(c.titre, 'Connexion requise');
    assert.equal(c.action, 'reessayer');
    assert.equal(c.notes, false);
    assert.match(c.paragraphes[0], /depuis 17 jours/);
    assert.match(c.paragraphes[0], new RegExp(`jusqu'à ${JOURS_HORS_LIGNE} jours`));
    assert.ok(!/Mise à jour obligatoire/.test(c.titre + c.paragraphes.join(' ')));
  });
  test('jamais vérifié, puis horloge reculée : chacun son titre', () => {
    assert.equal(contenuDuBlocage({ ...base, etat: 'horsLigne', raison: 'jamais' }).titre, 'Première vérification nécessaire');
    const h = contenuDuBlocage({ ...base, etat: 'horsLigne', raison: 'horloge' });
    assert.equal(h.titre, 'Date de l\'ordinateur incorrecte');
    assert.equal(h.notes, false);
  });
  test('en anglais aussi, unité comprise', () => {
    const c = contenuDuBlocage({ ...base, lang: 'en' });
    assert.equal(c.titre, 'Required update');
    assert.ok(c.paragraphes.includes('Download: 124 MB.'));
    assert.equal(contenuDuBlocage({ ...base, lang: 'en', etat: 'horsLigne', raison: 'expire', jours: 20 }).titre, 'Connection required');
  });
});

describe('les deux langues', () => {
  test('ont exactement les mêmes clés, erreurs comprises', () => {
    const fr = textesMaj('fr'); const en = textesMaj('en');
    assert.deepEqual(Object.keys(fr).sort(), Object.keys(en).sort());
    assert.deepEqual(Object.keys(fr.erreurs).sort(), Object.keys(en.erreurs).sort());
  });
  test('une langue inconnue rend le français', () => {
    assert.equal(textesMaj('de'), textesMaj('fr'));
  });
  test('chaque erreur que main.js peut renvoyer a son texte, dans les deux langues', () => {
    const main = readFileSync(new URL('../main.js', import.meta.url), 'utf8');
    const codes = new Set([...main.matchAll(/erreur: '(\w+)'/g)].map(m => m[1]));
    for (const m of main.matchAll(/includes\('empreinte'\) \? '(\w+)' : '(\w+)'/g)) { codes.add(m[1]); codes.add(m[2]); }
    assert.deepEqual([...codes].sort(), ['aucune', 'empreinte', 'enCours', 'reseau', 'simulation']);
    for (const e of codes) {
      assert.ok(textesMaj('fr').erreurs[e], e);
      assert.ok(textesMaj('en').erreurs[e], e);
    }
  });
  test('le bail affiché est celui de la politique', () => {
    assert.equal(JOURS_HORS_LIGNE * politique.JOUR_MS, politique.BAIL_HORS_LIGNE_MS);
  });
});

describe('progression', () => {
  test('bornée et entière', () => {
    assert.equal(pourcentage(50, 200), 25);
    assert.equal(pourcentage(199, 200), 99);
    assert.equal(pourcentage(300, 200), 100);
    assert.equal(pourcentage(-5, 200), 0);
    assert.equal(pourcentage(5, 0), 0);
    assert.equal(pourcentage(5, undefined), 0);
  });
});

describe('les notes en HTML', () => {
  test('⚠️ TOUT EST ÉCHAPPÉ : le texte vient du réseau', () => {
    const h = notesEnHtml('<img src=x onerror="alert(1)"> & **<b>**');
    assert.ok(!h.includes('<img'));
    assert.ok(!h.includes('<b>'));
    assert.match(h, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt; &amp; <strong>&lt;b&gt;<\/strong>/);
  });
  test('paragraphes, gras, code, titres', () => {
    assert.equal(notesEnHtml('**Le ciel.** Plus net\nque jamais.\n\nAvec `code`.'),
      '<p><strong>Le ciel.</strong> Plus net que jamais.</p><p>Avec <code>code</code>.</p>');
    assert.equal(notesEnHtml('### Titre'), '<h4>Titre</h4>');
  });
  test('listes, lignes de continuation comprises', () => {
    assert.equal(notesEnHtml('- un\n  suite\n- deux'), '<ul><li>un suite</li><li>deux</li></ul>');
    assert.equal(notesEnHtml('* étoile'), '<ul><li>étoile</li></ul>');
  });
  test('vide ou absent : rien', () => {
    assert.equal(notesEnHtml(''), '');
    assert.equal(notesEnHtml(null), '');
    assert.equal(notesEnHtml('\r\n\r\n'), '');
  });
  test('une section par version, le badge sur les obligatoires seulement', () => {
    const h = nouveautesEnHtml([
      { version: '1.9.1', obligatoire: false, notes: 'a' },
      { version: '1.9.0', obligatoire: true, notes: 'b' },
    ], 'fr');
    assert.equal((h.match(/<section class="maj-version">/g) || []).length, 2);
    assert.equal((h.match(/maj-badge/g) || []).length, 1);
    assert.match(h, /1\.9\.0 <span class="maj-badge">obligatoire<\/span>/);
    assert.match(nouveautesEnHtml([{ version: '1.9.0', obligatoire: true, notes: '' }], 'en'), />required</);
    assert.equal(nouveautesEnHtml([{ version: '<x>', obligatoire: false, notes: '' }], 'fr').includes('<x>'), false);
  });
});
