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
  // LA LISTE EST VIDE, et les trois sorties ont pris trois chemins différents — c'était tout l'objet
  // de ce fichier, qui refuse de confondre « sans appelant » et « à supprimer » :
  //
  //   #402b — `poseNonVide3D` a retrouvé un APPELANT. C'était une garde débranchée par #393.
  //   #402c — `repereParChaines3D` est PARTIE, et la mesure a montré qu'elle ne pouvait pas tourner
  //           dans l'application : elle lit les positions des os, que la liste fabriquée par
  //           `bonesFromObject3D` ne porte pas. Le défaut qu'elle devait corriger — le dragon
  //           ouvert à 92° de son devant — l'a été autrement, en refusant un repère humanoïde à
  //           une figure qui n'en est pas une.
  //   #402d — les quatorze autres sont PARTIES, vérifiées une par une.
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
    // Elle valait seize, elle vaut ZÉRO. Ajouter une ligne ici doit coûter un test rouge, sans quoi
    // la sortie de secours devient le chemin normal — et une liste qui s'allonge finit par ne plus
    // se lire, ce qui est exactement l'état dont ce fichier est né.
    assert.equal(Object.keys(EN_ATTENTE).length, 0,
      'une décision de plus a été REPORTÉE au lieu d\'être prise');
  });
});
