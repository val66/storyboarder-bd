/**
 * tests/model-library.test.mjs — la bibliothèque de modèles, groupée par usage RÉEL.
 *
 * Le groupement affiché dans le menu de gauche est DÉDUIT du Projet ouvert, à chaque affichage. Ce
 * choix a été tranché contre deux alternatives — un manifeste, ou des sous-dossiers « Décors » /
 * « Objets » — pour une raison qui se teste : un même fichier peut servir de décor dans une Scène ET
 * d'objet dans une Case. Le fichier ne peut donc pas porter la distinction ; l'usage la porte.
 *
 * CE QUE CES TESTS GARDENT, et qui n'est visible nulle part ailleurs :
 *
 *   — un fichier utilisé des deux façons apparaît dans les DEUX groupes. Le cacher ferait croire à
 *     un seul usage, donc à une suppression sans conséquence après avoir traité l'autre ;
 *   — un fichier RÉFÉRENCÉ mais absent du disque apparaît quand même. C'est celui dont l'utilisateur
 *     cherche la trace quand il voit une boîte orangée ;
 *   — le message de suppression dit les trois choses qu'il doit dire, dont celle qu'on ne peut PAS
 *     garantir : les autres Projets.
 */
import './helpers/dom-stub.mjs';
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  groupModelsByUsage, countModelUsages, messageSuppressionModele,
} from '../src/model-library.js';

const el = (modelFile) => ({ id: 'e' + Math.random(), type: 'objet3d', objType: 'modele', modelFile });
const volume = (nom, ...objets) => ({ name: nom, pages: [{ objects: objets }] });

describe('groupModelsByUsage — le groupement ne peut pas mentir', () => {
  test('chaque fichier tombe dans le groupe de son usage', () => {
    const projet = {
      scenes: [volume('Salon', el('salon.glb'))],
      tomes: [volume('Tome 1', el('chaise.glb'), el('chaise.glb'))],
    };
    const g = groupModelsByUsage(['salon.glb', 'chaise.glb', 'orphelin.glb'], projet);
    assert.deepEqual(g.parScenes, [{ nom: 'salon.glb', scenes: ['Salon'] }]);
    assert.deepEqual(g.dansCases, [{ nom: 'chaise.glb', count: 2 }]);
    assert.deepEqual(g.nonUtilises, ['orphelin.glb']);
  });

  test('RÉGRESSION : un fichier utilisé des DEUX façons apparaît deux fois', () => {
    // Le cas qui a fait écarter les sous-dossiers. Le montrer dans un seul groupe ferait croire
    // qu'il n'a qu'un usage — donc qu'on peut le supprimer une fois cet usage traité.
    const projet = {
      scenes: [volume('Salon', el('salon.glb'))],
      tomes: [volume('Tome 1', el('salon.glb'))],
    };
    const g = groupModelsByUsage(['salon.glb'], projet);
    assert.equal(g.parScenes.length, 1, 'absent du groupe Scènes');
    assert.equal(g.dansCases.length, 1, 'absent du groupe Cases');
    assert.deepEqual(g.nonUtilises, [], 'un fichier utilisé ne peut pas être « non utilisé »');
  });

  test('RÉGRESSION : un fichier référencé mais ABSENT du disque apparaît quand même', () => {
    // C'est le fichier que l'utilisateur cherche quand il voit une boîte orangée. L'omettre de la
    // liste — au motif qu'il n'est pas sur le disque — le rendrait introuvable au moment précis où
    // on le cherche.
    const projet = { scenes: [], tomes: [volume('Tome 1', el('disparu.glb'))] };
    const g = groupModelsByUsage([], projet);
    assert.deepEqual(g.dansCases, [{ nom: 'disparu.glb', count: 1 }]);
  });

  test('une Scène qui utilise deux fois le même fichier n\'est nommée qu\'une fois', () => {
    const projet = { scenes: [volume('Salon', el('mur.glb'), el('mur.glb'))], tomes: [] };
    assert.deepEqual(groupModelsByUsage(['mur.glb'], projet).parScenes,
      [{ nom: 'mur.glb', scenes: ['Salon'] }]);
  });

  test('un fichier partagé par deux Scènes les nomme toutes les deux', () => {
    const projet = {
      scenes: [volume('Salon', el('lampe.glb')), volume('Cuisine', el('lampe.glb'))], tomes: [],
    };
    assert.deepEqual(groupModelsByUsage(['lampe.glb'], projet).parScenes[0].scenes,
      ['Salon', 'Cuisine']);
  });

  test('seuls les modèles importés comptent, pas les autres Éléments', () => {
    const projet = { scenes: [], tomes: [volume('T', { type: 'objet3d', objType: 'chaise' },
      { type: 'perso' }, { type: 'objet3d', objType: 'modele' })] };
    assert.deepEqual(groupModelsByUsage(['x.glb'], projet).nonUtilises, ['x.glb']);
  });

  test('un Projet vide laisse tous les fichiers non utilisés', () => {
    const g = groupModelsByUsage(['a.glb', 'b.glb'], {});
    assert.deepEqual(g.nonUtilises, ['a.glb', 'b.glb']);
    assert.deepEqual(g.parScenes, []);
    assert.deepEqual(g.dansCases, []);
  });

  test('entrées absurdes : on ne lève pas', () => {
    [undefined, null, []].forEach(f =>
      assert.doesNotThrow(() => groupModelsByUsage(f, { tomes: null, scenes: undefined })));
  });
});

describe('countModelUsages — le chiffre annoncé avant une suppression', () => {
  test('compte les Éléments, Scènes et Cases confondues', () => {
    const projet = {
      scenes: [volume('S', el('x.glb'))],
      tomes: [volume('T', el('x.glb'), el('x.glb'), el('autre.glb'))],
    };
    assert.equal(countModelUsages('x.glb', projet), 3);
    assert.equal(countModelUsages('autre.glb', projet), 1);
    assert.equal(countModelUsages('jamais.glb', projet), 0);
  });

  test('RÉGRESSION : un `modelFile` résiduel sur un autre type ne compte pas', () => {
    // Trou trouvé par mutation. Un Élément dont le type a changé peut garder un `modelFile` qui ne
    // veut plus rien dire ; le compter gonflerait le chiffre annoncé avant une suppression — donc
    // dissuaderait de supprimer un fichier que plus rien n'utilise.
    const projet = { scenes: [], tomes: [volume('T',
      { type: 'objet3d', objType: 'chaise', modelFile: 'x.glb' },
      { type: 'perso', modelFile: 'x.glb' })] };
    assert.equal(countModelUsages('x.glb', projet), 0);
  });
});

describe('messageSuppressionModele — dire les trois choses', () => {
  const msg = (n) => messageSuppressionModele('salon.glb', n, (en, fr) => fr);

  test('il nomme le fichier et annonce la conséquence chiffrée', () => {
    assert.match(msg(3), /salon\.glb/);
    assert.match(msg(3), /3 Élément/);
    assert.match(msg(3), /boîtes de remplacement/);
  });

  test('zéro usage se dit aussi, plutôt que de rester muet', () => {
    // Un message qui ne parle des conséquences que lorsqu'il y en a laisse l'utilisateur deviner
    // que l'absence de phrase signifie « aucune ». Autant l'écrire.
    assert.match(msg(0), /Aucun Élément/);
  });

  test('RÉGRESSION : il avoue ce qu\'on ne peut PAS vérifier', () => {
    // On ne connaît que le Projet ouvert. Taire les autres Projets laisserait croire à une garantie
    // qu'on n'a pas — et c'est justement ce que l'utilisateur risque de casser.
    [0, 3].forEach(n => assert.match(msg(n), /autres Projets/,
      'le message ne mentionne pas les autres Projets'));
  });

  test('il dit que c\'est définitif', () => {
    assert.match(msg(1), /définitive|irréversible/);
  });
});

/**
 * JOURNAL DE MUTATION — six fautes, toutes rouges.
 *
 *   X1 « non utilisé » calculé sans tenir compte de l'usage en Scène        ROUGE
 *   X2 un fichier référencé mais absent du disque, oublié de la liste       ROUGE
 *   X3 une Scène nommée deux fois pour deux Éléments du même fichier        ROUGE
 *   X4 le décompte cesse de filtrer sur le type d'Élément                   ROUGE (après ajout)
 *   X5 « cette suppression est définitive » retiré du message               ROUGE
 *   X6 l'aveu sur les autres Projets retiré du message                      ROUGE
 *
 * X4 A ÉCHAPPÉ D'ABORD : tous mes montages n'avaient que de vrais modèles importés, donc retirer le
 * filtre de type ne changeait rien. Le cas manquant est un `modelFile` RÉSIDUEL sur un Élément dont
 * le type a changé — il gonflerait le chiffre annoncé avant une suppression, et dissuaderait donc de
 * supprimer un fichier que plus rien n'utilise. Montage complété.
 *
 * PIÈGE DE CIBLAGE, noté pour la prochaine fois : ma première version de X5 mutait la chaîne
 * ANGLAISE, alors que le test lit la française. Elle s'annonçait « échappée » sans rien prouver.
 * Une mutation sur du texte bilingue doit viser la langue que le test observe.
 */
