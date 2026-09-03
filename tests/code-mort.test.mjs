/**
 * tests/code-mort.test.mjs. Un export de `src/` que personne n'appelle.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * POURQUOI CE FICHIER EXISTE
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ESLint attrape la variable inutilisée DANS un fichier. Il ne dit rien d'une fonction EXPORTÉE que
 * plus personne n'importe : c'est du code parfaitement valide, simplement inatteignable. Le chantier
 * des poses en a laissé plusieurs, et il a fallu les chercher à la main, un par un, après coup.
 *
 * ⚠️ CE TEST NE DIT PAS « SUPPRIME ». Un export sans appelant est une QUESTION, pas un verdict : il
 * peut être un faux-seau pour les tests, une garde débranchée par mégarde, ou une intention restée
 * en chemin. Les trois cas se sont présentés dans ce dépôt le même jour. Ce que le test exige, c'est
 * que la réponse soit ÉCRITE ici, à côté du nom, plutôt que laissée à la prochaine relecture.
 *
 * ⚠️ LA LISTE NE PEUT QUE RACCOURCIR, et c'est le dernier test du fichier qui l'impose : sans lui,
 * exempter serait le moyen le plus rapide de faire taire le premier.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

const url = (f) => new URL('../' + f, import.meta.url);
const sansCommentaires = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');

const FICHIERS = readdirSync(new URL('../src', import.meta.url))
  .filter(f => f.endsWith('.js')).map(f => 'src/' + f);
const SOURCE = Object.fromEntries(FICHIERS.map(f => [f, sansCommentaires(readFileSync(url(f), 'utf8'))]));
const DEHORS = ['main.js', 'preload.js', 'index.html']
  .map(f => sansCommentaires(readFileSync(url(f), 'utf8'))).join('\n');

/**
 * Les faux-seaux d'accès pour les tests. Ils N'ONT PAS d'appelant dans l'application par
 * construction : ils existent pour qu'un test puisse injecter un pont ou vider un cache sans passer
 * par Electron. Leur préfixe `_` ou leur nom en `set…Bridge` le dit déjà.
 */
const SEAUX_DE_TEST = [
  '_setModelCacheEntry', '_applyAnisotropyForTests', '_viderCacheCorrespondances',
  '_reinitialiserPile', 'setModelBridge', 'setSkeletonBridge', 'fermeturesEnregistrees',
];

/**
 * Ce qui attend une DÉCISION, et laquelle. Chaque entrée nomme la tâche qui la tranchera : sans
 * cela, cette liste redeviendrait le tapis sous lequel on glisse ce qu'on ne veut pas regarder.
 */
const EN_ATTENTE = {
  // (#402b est RÉSOLUE : `poseNonVide3D` a retrouvé un appelant, dans l'Éditeur cette fois. C'était
  // une garde débranchée par #393, pas un oubli, et c'est bien la sortie qu'on attendait de cette
  // liste : un nom en sort parce qu'on a tranché, pas parce qu'on l'a effacé.)
  // #402c — une INTENTION restée en chemin. Elle donne à une créature un repère de corps dérivé de
  // ses chaînes, avec une validation mesurée sur quatre fixtures, et n'a jamais été branchée. C'est
  // la vraie réponse au repli à zéro d'`orbiteDouvertureEditeur3D` pour une créature sans
  // emplacements humanoïdes.
  repereParChaines3D: '#402c',
  // #402d — antérieurs au chantier des poses, à vérifier un par un avant retrait. Les trois de
  // draw.js n'ont d'appelant nulle part, pas même dans un test ; les autres n'en ont JAMAIS eu dans
  // l'application, ils ont été écrits pour une étape qui a pris un autre chemin.
  drawStickFigure: '#402d', drawCanvasOnly: '#402d', drawPending: '#402d',
  buildTryExtendWall: '#402d', wrapText: '#402d', getRoomOrBuildingScreenBBox: '#402d',
  panelApparentPx3D: '#402d', storeElementWxFloor: '#402d', estPosee: '#402d',
  nombrePosable: '#402d', animauxDeLArchetype3D: '#402d', getStyle3D: '#402d',
  getPosition: '#402d', clampAngle: '#402d',
};

function exportsSansAppelant(){
  const noms = [];
  for (const [f, code] of Object.entries(SOURCE)) {
    for (const m of code.matchAll(/^export (?:async )?function (\w+)/gm)) noms.push([f, m[1]]);
    for (const m of code.matchAll(/^export (?:const|let|class) (\w+)/gm)) noms.push([f, m[1]]);
  }
  return noms.filter(([f, nom]) => {
    const motif = new RegExp('\\b' + nom + '\\b', 'g');
    let vus = 0;
    for (const [g, code] of Object.entries(SOURCE)) {
      // Sa propre déclaration ne compte pas comme un appel.
      vus += Math.max(0, (code.match(motif) || []).length - (g === f ? 1 : 0));
    }
    return vus + (DEHORS.match(motif) || []).length === 0;
  }).map(([f, nom]) => ({ fichier: f, nom }));
}

describe('Aucun export de src/ ne reste sans appelant', () => {
  test('tout ce qui n\'est appelé nulle part est nommé, avec sa raison', () => {
    const inattendus = exportsSansAppelant()
      .filter(e => !SEAUX_DE_TEST.includes(e.nom) && !EN_ATTENTE[e.nom]);
    assert.deepEqual(inattendus, [],
      'exports que plus rien n\'appelle : '
      + inattendus.map(e => `${e.nom} (${e.fichier})`).join(', ')
      + '. Décidez, puis inscrivez la raison dans ce fichier.');
  });

  test('chaque exemption désigne un export que le détecteur trouve VRAIMENT sans appelant', () => {
    // ⚠️ DEUX DÉFAUTS D'UN SEUL COUP, et le second est le plus grave.
    //
    // Le premier : la liste survivrait à ce qu'elle exempte. Un nom retiré du code resterait ici, et
    // la liste finirait par décrire un dépôt qui n'existe plus — le défaut même que ce fichier
    // essaie d'attraper, un étage au-dessus.
    //
    // Le second : SANS CETTE ÉGALITÉ, LE DÉTECTEUR POURRAIT NE RIEN DÉTECTER. Ma mutation M182 l'a
    // montré : en comptant la déclaration d'un export comme un appel, `exportsSansAppelant` rendait
    // une liste VIDE, et le premier test devenait vert pour toujours. Une assertion d'absence a
    // besoin d'une assertion de présence en face, sinon elle finit par ne plus rien mesurer.
    const trouves = exportsSansAppelant().map(e => e.nom).sort();
    const exemptes = [...SEAUX_DE_TEST, ...Object.keys(EN_ATTENTE)].sort();
    assert.deepEqual(trouves, exemptes,
      'la liste des exports sans appelant ne correspond plus aux exemptions écrites ici');
  });

  test('la liste des décisions en attente ne s\'allonge pas', () => {
    // Elle valait seize, elle vaut quinze : #402b est tranchée. Restent une décision identifiée
    // (#402c) et quatorze restes antérieurs au chantier (#402d). Ajouter une ligne ici doit coûter
    // un test rouge, sans quoi c'est la sortie de secours qui devient le chemin normal.
    assert.equal(Object.keys(EN_ATTENTE).length, 15,
      'une décision de plus a été REPORTÉE au lieu d\'être prise');
  });
});
