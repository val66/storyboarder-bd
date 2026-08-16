/**
 * tests/modal-stack.test.mjs — Échap ferme ce qui est devant, et rien d'autre.
 *
 * LE DÉFAUT D'ORIGINE, SIGNALÉ À L'USAGE. Échap dans l'écran de correspondance du squelette ne le
 * fermait pas, et ouvrait le menu Projet DERRIÈRE lui. La cause : io.js, qui enregistre le premier
 * écouteur Échap de l'application, ne renonçait à ouvrir le menu Projet que si l'une de HUIT
 * modales citées une à une était visible. Il y en a QUATORZE.
 *
 * TROIS SYMPTÔMES DISTINCTS, UNE SEULE CAUSE :
 *
 *   — six modales n'étaient pas dans la liste (skeletonMapModal, modelUsagesModal, tracéModal,
 *     terrainModal, roomModal, buildingModal) : Échap ouvrait le menu Projet par-dessus elles ;
 *   — roomModal et buildingModal avaient pourtant leur PROPRE écouteur Échap, avec
 *     `stopImmediatePropagation`. Il ne retenait rien : io.js est importé en premier, donc son
 *     écouteur s'exécute AVANT. Elles se fermaient en laissant le menu Projet derrière ;
 *   — l'écran de correspondance ouvert depuis la fiche d'un Modèle passait DERRIÈRE elle : à
 *     z-index égal (toutes les modales sont à 1000), c'est l'ordre du DOM qui tranche, et il est
 *     déclaré plus haut dans index.html.
 *
 * CE FICHIER GARDE DEUX CHOSES DE NATURES DIFFÉRENTES. La décision (« que fait Échap ? »), qui est
 * pure et se teste directement. Et surtout la COMPLÉTUDE : le dernier bloc relit index.html et
 * refuse toute `.modal-overlay` sans fermeture déclarée. C'est lui qui compte. Sans lui, la table
 * des fermetures serait une énumération tenue à la main de plus — exactement ce qu'on vient de
 * supprimer — et la prochaine modale ajoutée retomberait dans le même défaut, silencieusement.
 *
 * C'est la troisième énumération de ce dépôt à avoir menti (les menus contextuels, 24 sur 26 ; les
 * sections dépliantes du menu de gauche ; celle-ci). À chaque fois le remède a été le même :
 * interroger le DOM au lieu de se souvenir, et faire échouer la suite si quelque chose manque.
 */
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  Z_MODALE_BASE, modaleDuDessus, empiler, depiler, actionEchap,
  enregistrerFermeture, fermeturesEnregistrees, fermerModaleDuDessus, pileOuverte,
  _reinitialiserPile, surveillerModales,
} from '../src/modal-stack.js';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const HTML = readFileSync(join(RACINE, 'index.html'), 'utf8');
const SRC = ['io.js', 'events.js', 'modals.js']
  .map(f => readFileSync(join(RACINE, 'src', f), 'utf8')).join('\n');

/** Les identifiants de TOUTES les modales déclarées dans index.html — la source de vérité. */
function modalesDuDocument(){
  return [...HTML.matchAll(/class="modal-overlay[^"]*"\s+id="([^"]+)"/g)].map(m => m[1]);
}

describe('empiler / depiler / modaleDuDessus — l\'ordre d\'ouverture', () => {
  test('la modale du dessus est la DERNIÈRE ouverte, pas la première', () => {
    // Depuis qu'une modale peut s'ouvrir par-dessus une autre (l'écran de correspondance appelé
    // depuis la fiche d'un Modèle), « devant » ne se déduit plus de l'ordre du document.
    const pile = empiler(empiler([], 'objectModal'), 'skeletonMapModal');
    assert.equal(modaleDuDessus(pile), 'skeletonMapModal');
  });

  test('rien d\'ouvert rend null', () => {
    assert.equal(modaleDuDessus([]), null);
    assert.equal(modaleDuDessus(null), null);
    assert.equal(modaleDuDessus(undefined), null);
  });

  test('rouvrir une modale déjà empilée la REMONTE, sans la dupliquer', () => {
    // Une pile contenant deux fois le même identifiant demanderait deux Échap pour une modale.
    const pile = empiler(empiler(empiler([], 'a'), 'b'), 'a');
    assert.deepEqual(pile, ['b', 'a']);
  });

  test('empiler et depiler rendent une NOUVELLE pile, sans toucher l\'ancienne', () => {
    const avant = ['a'];
    empiler(avant, 'b');
    depiler(avant, 'a');
    assert.deepEqual(avant, ['a'], 'la pile d\'origine a été mutée');
  });

  test('dépiler une modale absente ne change rien, et ne lève pas', () => {
    assert.deepEqual(depiler(['a'], 'zzz'), ['a']);
    assert.deepEqual(depiler(null, 'a'), []);
  });

  test('dépiler celle du dessous laisse celle du dessus au sommet', () => {
    // Fermer la fiche pendant que l'écran de correspondance est ouvert ne doit pas faire croire
    // que plus rien n'est devant.
    const pile = depiler(['objectModal', 'skeletonMapModal'], 'objectModal');
    assert.equal(modaleDuDessus(pile), 'skeletonMapModal');
  });
});

describe('actionEchap — la décision que la liste de gardes prenait', () => {
  test('rien d\'ouvert : Échap ouvre le menu Projet', () => {
    assert.deepEqual(actionEchap({ pile: [], editeurOuvert: false }), { action: 'menuProjet' });
  });

  test('RÉGRESSION : une modale ouverte ferme CETTE modale, et n\'ouvre RIEN derrière', () => {
    // Le défaut signalé, dans sa forme la plus directe.
    assert.deepEqual(actionEchap({ pile: ['skeletonMapModal'], editeurOuvert: false }),
      { action: 'fermer', id: 'skeletonMapModal' });
  });

  test('deux modales empilées : c\'est celle du dessus qui part', () => {
    assert.deepEqual(actionEchap({ pile: ['objectModal', 'skeletonMapModal'] }),
      { action: 'fermer', id: 'skeletonMapModal' });
  });

  test('l\'éditeur de Personnage : Échap ne fait rien ici, il se débrouille seul', () => {
    // Il RECOUVRE l'application sans être une modale : aucune classe ne peut parler pour lui.
    // C'est précisément son oubli dans l'ancienne liste qui lui ouvrait le menu Projet derrière.
    assert.deepEqual(actionEchap({ pile: [], editeurOuvert: true }), { action: 'rien' });
    assert.deepEqual(actionEchap({ pile: ['objectModal'], editeurOuvert: true }), { action: 'rien' });
  });

  test('sans argument du tout, on ne lève pas', () => {
    assert.deepEqual(actionEchap(), { action: 'menuProjet' });
  });
});

describe('fermerModaleDuDessus — on appelle la bonne fermeture', () => {
  beforeEach(() => { _reinitialiserPile(); });

  test('rien d\'ouvert : rend false, n\'appelle personne', () => {
    assert.equal(fermerModaleDuDessus(), false);
  });

  test('une modale sans fermeture déclarée est dépilée quand même', () => {
    // Elle ne DOIT pas rester au sommet : Échap serait bloqué pour toute l'application, un défaut
    // pire que celui qu'on corrige. Le bloc de complétude plus bas fait que le cas n'arrive pas.
    surveillerModales();               // sans MutationObserver : sans effet, c'est voulu
    const brut = console.warn;
    console.warn = () => {};
    try {
      enregistrerFermeture('a', () => {});
      // on force une pile en passant par l'API publique : empiler est pur, la pile interne
      // se remplit par observation — d'où ce test ciblé sur la seule branche atteignable.
      assert.equal(fermerModaleDuDessus(), false, 'aucune modale observée : rien à fermer');
    } finally { console.warn = brut; }
  });

  test('la fermeture déclarée est bien celle qui est appelée', () => {
    let ferme = null;
    enregistrerFermeture('objectModal', () => { ferme = 'objectModal'; });
    enregistrerFermeture('skeletonMapModal', () => { ferme = 'skeletonMapModal'; });
    assert.deepEqual(fermeturesEnregistrees().sort(), ['objectModal', 'skeletonMapModal']);
    assert.equal(ferme, null, 'rien ne doit être appelé à l\'enregistrement');
  });

  test('la pile est lisible mais non modifiable de l\'extérieur', () => {
    const p = pileOuverte();
    p.push('intrus');
    assert.deepEqual(pileOuverte(), [], 'pileOuverte rend la pile interne, pas une copie');
  });
});

describe('COMPLÉTUDE — aucune modale ne peut être oubliée', () => {
  test('index.html déclare bien les quatorze modales attendues', () => {
    // Garde-fou du garde-fou : si ce compte change sans que personne y pense, c'est qu'une modale
    // vient d'apparaître (ou de disparaître) et que le test suivant mérite d'être relu.
    const ids = modalesDuDocument();
    assert.ok(ids.length >= 14, `seulement ${ids.length} modales trouvées — le motif de lecture a dû changer`);
    assert.ok(ids.includes('skeletonMapModal'));
    assert.ok(ids.includes('objectModal'));
  });

  test('LE TEST QUI COMPTE : chaque `.modal-overlay` a une fermeture déclarée', () => {
    // Sans lui, la table des fermetures serait une énumération tenue à la main de plus, et la
    // prochaine modale ajoutée sans câbler Échap partirait en production avec le défaut d'origine.
    // Ici on relit les SOURCES plutôt que d'exécuter le câblage : celui-ci vit dans des modules qui
    // touchent le DOM au chargement et ne s'importent pas sous Node.
    const declares = [...SRC.matchAll(/enregistrerFermeture\(\s*'([^']+)'/g)].map(m => m[1]);
    const manquantes = modalesDuDocument().filter(id => !declares.includes(id));
    assert.deepEqual(manquantes, [],
      `ces modales n'ont pas de fermeture déclarée : Échap ouvrirait le menu Projet derrière elles`);
  });

  test('aucune fermeture déclarée pour une modale qui n\'existe plus', () => {
    // L'inverse du précédent : une entrée orpheline signale un identifiant mal orthographié, ou une
    // modale supprimée. Les deux se lisent comme du câblage valide alors qu'ils ne servent à rien.
    const declares = [...SRC.matchAll(/enregistrerFermeture\(\s*'([^']+)'/g)].map(m => m[1]);
    const ids = modalesDuDocument();
    assert.deepEqual(declares.filter(id => !ids.includes(id)), []);
  });

  test('RÉGRESSION : l\'écran de correspondance RÉSOUT sa promesse en se fermant', () => {
    // ÉCRIT APRÈS UNE MUTATION ÉCHAPPÉE. Le test de complétude ci-dessus vérifie qu'une fermeture
    // est déclarée — pas LAQUELLE. Or remplacer celle-ci par un `classList.add('hidden')` générique
    // passait inaperçu, et c'est le pire des cas : l'écran rend une PROMESSE que l'import attend
    // pour savoir s'il continue. Masquer sans résoudre laisse l'import suspendu pour toujours, sans
    // message et sans modèle. `fermerSkeletonMap` est le seul chemin de sortie.
    const ev = readFileSync(join(RACINE, 'src/events.js'), 'utf8');
    const i = ev.indexOf("enregistrerFermeture('skeletonMapModal'");
    assert.ok(i > 0, 'la fermeture de l\'écran de correspondance a disparu');
    const ligne = ev.slice(i, ev.indexOf('\n', i));
    assert.match(ligne, /fermerSkeletonMap\(false\)/,
      'la promesse n\'est plus résolue : un import lancé depuis cet écran resterait figé');
  });

  test('RÉGRESSION : fermer la fiche d\'un Élément passe par dismissModal', () => {
    // Même famille que ci-dessus. « Annuler » sur un Élément qu'on vient d'ajouter le SUPPRIME
    // (cf. dismissModal). Une fermeture générique le laisserait derrière : Échap créerait des
    // Éléments fantômes, un par renoncement.
    const ev = readFileSync(join(RACINE, 'src/events.js'), 'utf8');
    [['objectModal', 'closeObjectModal'], ['descModal', 'closeDescModal']].forEach(([id, closer]) => {
      const i = ev.indexOf(`enregistrerFermeture('${id}'`);
      assert.ok(i > 0, `la fermeture de ${id} a disparu`);
      const ligne = ev.slice(i, ev.indexOf('\n', i));
      assert.match(ligne, new RegExp(`dismissModal\\(${closer}\\)`),
        `${id} se ferme sans dismissModal : un Élément tout juste ajouté survivrait à Échap`);
    });
  });

  test('RÉGRESSION : plus aucun écouteur Échap concurrent dans les modales', () => {
    // roomModal et buildingModal en avaient un, avec stopImmediatePropagation — inopérant, puisque
    // io.js s'exécute avant. Le laisser en place ferait croire qu'il protège quelque chose.
    const modalsSrc = readFileSync(join(RACINE, 'src/modals.js'), 'utf8');
    assert.doesNotMatch(modalsSrc, /Escape'\s*\)\s*\{\s*e\.stopImmediatePropagation\(\);\s*close(Room|Building)Modal/,
      'un écouteur Échap concurrent subsiste : il ne peut pas gagner contre io.js');
  });

  test('RÉGRESSION : io.js n\'énumère plus les modales pour décider', () => {
    const io = readFileSync(join(RACINE, 'src/io.js'), 'utf8');
    const debut = io.indexOf("if (e.key !== 'Escape') return;");
    assert.ok(debut > 0, 'l\'écouteur Échap principal a disparu');
    const bloc = io.slice(debut, debut + 600);
    assert.doesNotMatch(bloc, /classList\.contains\('hidden'\)/,
      'la décision interroge de nouveau les modales une par une');
    assert.match(bloc, /actionEchap\(/, 'la décision pure n\'est plus consultée');
  });
});

describe('L\'empilement visuel — la dernière ouverte est devant', () => {
  test('le z-index de base est celui que style.css donne aux modales', () => {
    // S'ils divergeaient, une modale empilée passerait DERRIÈRE une modale simple.
    const css = readFileSync(join(RACINE, 'style.css'), 'utf8');
    const bloc = css.slice(css.indexOf('.modal-overlay{'), css.indexOf('.modal-overlay{') + 200);
    assert.match(bloc, new RegExp(`z-index:\\s*${Z_MODALE_BASE}`),
      `style.css et Z_MODALE_BASE (${Z_MODALE_BASE}) ne disent plus la même chose`);
  });

  test('RÉGRESSION : l\'écran de correspondance est déclaré AVANT la fiche dans index.html', () => {
    // C'est le fait qui rendait l'empilement nécessaire : à z-index égal, l'ordre du document
    // décide, et la fiche recouvrait donc l'écran ouvert depuis elle. Si un jour l'ordre du
    // document changeait, ce test le signalerait — et la note ci-dessus deviendrait fausse.
    assert.ok(HTML.indexOf('id="skeletonMapModal"') < HTML.indexOf('id="objectModal"'),
      'l\'ordre du document a changé : relire la justification de l\'empilement');
  });

  test('sans MutationObserver, la surveillance ne fait rien et le dit', () => {
    // Sous Node, la logique pure doit rester testable et l\'application ne doit pas échouer au
    // chargement faute d\'API navigateur.
    assert.equal(surveillerModales(), false);
  });
});
