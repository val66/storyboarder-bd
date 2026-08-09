/**
 * tests/dom-ids.test.mjs — le code et le document parlent-ils des mêmes éléments ?
 *
 * Cette classe de défaut a déjà interrompu l'application DEUX fois, entièrement :
 *
 *   — Renommage Case/Tome/Pièce/Bâtiment → Panel/Volume/Room/Building : six ids d'index.html
 *     n'ont pas suivi le code qui les cherchait. `getElementById(...).onclick` a levé sur `null`,
 *     ce qui a interrompu le chargement d'events.js EN ENTIER : plus aucun bouton ne répondait,
 *     plus aucun projet ne se chargeait. Rien dans le message d'erreur ne pointait la cause.
 *   — Fix 89/90 : un `</div>` orphelin a sorti le panneau droit de l'éditeur de son conteneur.
 *     Les 822 tests d'alors sont restés verts.
 *
 * Le point commun : aucune de ces liaisons n'est vérifiée par quoi que ce soit. Le HTML n'est pas
 * compilé, `getElementById` ne se plaint pas d'un id absent, il renvoie `null` — et l'exception
 * n'arrive que plus tard, ailleurs, sous une forme qui ne désigne pas le coupable.
 *
 * Ce que ces tests couvrent : les ids littéraux. Un id CALCULÉ (`getElementById(btnId)`,
 * `'ctxAdd' + label`) leur échappe par construction, et c'est assumé — vérifier une chaîne
 * construite à l'exécution demanderait d'exécuter le code, pas de le lire.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(RACINE, 'index.html'), 'utf8');

const idsDuDocument = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
const IDS = new Set(idsDuDocument);

const modules = readdirSync(join(RACINE, 'src'))
  .filter(f => f.endsWith('.js'))
  .map(f => ({ nom: f, texte: readFileSync(join(RACINE, 'src', f), 'utf8') }));

// Chaque référence à un id ÉCRIT EN CLAIR, quelle que soit la forme d'accès.
function referencesLitterales() {
  const trouvees = [];
  const motifs = [
    /getElementById\('([^']+)'\)/g,
    /getElementById\("([^"]+)"\)/g,
    /querySelector\('#([A-Za-z0-9_-]+)'\)/g,
    /querySelectorAll\('#([A-Za-z0-9_-]+)'\)/g,
  ];
  modules.forEach(({ nom, texte }) => {
    motifs.forEach(re => {
      for (const m of texte.matchAll(re)) {
        const ligne = texte.slice(0, m.index).split('\n').length;
        trouvees.push({ id: m[1], nom, ligne });
      }
    });
  });
  return trouvees;
}

describe('index.html ↔ src/ — les ids cherchés existent', () => {
  const refs = referencesLitterales();

  test('le balayage trouve bien quelque chose à vérifier', () => {
    // Sans ce garde-fou, une expression cassée rendrait tous les tests suivants verts et vides —
    // le pire état possible, constaté ailleurs dans ce dépôt (cf. tests/i18n.test.mjs, Fix 92).
    assert.ok(refs.length > 400, `seulement ${refs.length} références trouvées`);
    assert.ok(IDS.size > 300, `seulement ${IDS.size} ids dans index.html`);
  });

  test('RÉGRESSION : aucun id cherché par le code n\'est absent du document', () => {
    // Le test qui aurait attrapé le renommage Panel/Volume/Room/Building au moment où il est
    // arrivé, au lieu de laisser l'application muette au démarrage suivant.
    const absents = refs.filter(r => !IDS.has(r.id));
    assert.deepEqual(absents.map(r => `${r.id} (${r.nom}:${r.ligne})`), [],
      `${absents.length} id(s) cherché(s) mais absent(s) d'index.html`);
  });

  test('RÉGRESSION : les sélecteurs de i18n.js désignent tous un élément réel', () => {
    // Une entrée i18n sans cible ne lève rien : la traduction ne s'applique simplement jamais, et
    // le libellé reste figé dans la langue d'origine. Silencieux, donc durable.
    const i18n = modules.find(m => m.nom === 'i18n.js').texte;
    const sels = [...i18n.matchAll(/\['#([A-Za-z0-9_-]+)['\s,]/g)].map(m => m[1]);
    assert.ok(sels.length > 50, `seulement ${sels.length} sélecteurs #id relevés`);
    assert.deepEqual(sels.filter(s => !IDS.has(s)), []);
  });

  test('RÉGRESSION : aucun id dupliqué dans index.html', () => {
    // Un id en double ne provoque aucune erreur : getElementById renvoie le PREMIER, et l'autre
    // élément devient inatteignable. Deux boutons identiques dont un seul répond.
    const vus = new Set(), doubles = new Set();
    idsDuDocument.forEach(id => (vus.has(id) ? doubles.add(id) : vus.add(id)));
    assert.deepEqual([...doubles], []);
  });
});

describe('index.html ↔ src/ — les liaisons vivantes ne sont pas cassées', () => {
  test('RÉGRESSION : setProjectModalStatus a bien une cible', () => {
    // Défaut trouvé en écrivant ce fichier : la fonction est appelée depuis quatorze endroits —
    // « Enregistré à 14:32 », « Échec de l'enregistrement du Projet » — et l'élément n'existait
    // pas. Sa garde `if (el)` absorbait l'absence, si bien que TOUS ces retours, y compris les
    // échecs d'enregistrement, n'arrivaient nulle part. Un test générique l'aurait signalé ; il
    // n'en existait aucun. Celui-ci nomme le cas pour qu'il ne se reperde pas dans la masse.
    assert.ok(IDS.has('projectModalStatus'));
    const io = modules.find(m => m.nom === 'io.js').texte;
    const appels = (io.match(/setProjectModalStatus\(/g) || []).length - 1;  // -1 : la définition
    assert.ok(appels >= 10, `${appels} appels seulement — la fonction a-t-elle été retirée ?`);
  });

  test('les messages de la modale Projet sont bilingues', () => {
    // Corollaire direct : les rendre visibles a exposé qu'ils étaient écrits en français en dur.
    // Invisibles, personne ne pouvait s'en apercevoir.
    const io = modules.find(m => m.nom === 'io.js').texte;
    [...io.matchAll(/setProjectModalStatus\(([^;]*)\);/g)].forEach(m => {
      const arg = m[1].trim();
      // `text)` : c'est la DÉFINITION que l'expression vient d'attraper, pas un appel — son
      // paramètre s'appelle `text`. `''` : l'effacement du message, rien à traduire.
      if (arg === "''" || /^text\)/.test(arg)) return;
      assert.match(arg, /^tr\(/, `message non traduit : ${arg.slice(0, 60)}`);
    });
  });
});
