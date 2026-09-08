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
 * ⚠️ LA LISTE S'ALLONGE POUR UNE SEULE RAISON, ET LE DERNIER TEST LA CHIFFRE. J'avais d'abord écrit
 * qu'elle « ne peut que raccourcir » : c'était trop absolu, et #403a l'a montré. Des FONDATIONS
 * peuvent atterrir avant leurs appelants — un magasin de fichiers écrit et testé pendant que
 * l'interface qui s'en servira reste à faire. Ces exports-là ne sont pas morts, ils sont EN AVANCE,
 * et le dire ici est plus honnête que d'attendre trois tâches en gardant le silence.
 *
 * Ce que le chiffre empêche reste le même : exempter au lieu de décider.
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
  '_reinitialiserPile', 'setModelBridge', 'setSkeletonBridge', 'setImageBridge',
  '_setImageCacheEntry', 'fermeturesEnregistrees',
];

/**
 * Ce qui attend une DÉCISION, et laquelle. Chaque entrée nomme la tâche qui la tranchera : sans
 * cela, cette liste redeviendrait le tapis sous lequel on glisse ce qu'on ne veut pas regarder.
 */
const EN_ATTENTE = {
  // #414a — L'ÉCLAIRAGE : LA DÉCISION EST ARRIVÉE AVANT SON APPLICATION, comme le magasin d'images
  // de #403a en son temps. Ces exports ne sont pas morts, ils sont EN AVANCE, et chaque échéance
  // est un NUMÉRO DE TÂCHE : c'est la leçon que #403 a laissée ici même, « à brancher plus tard »
  // n'aurait rien fait échouer le jour où « plus tard » serait passé.
  //
  // La séparation est délibérée : poser des lumières dans une scène Three.js ne se teste pas sous
  // Node, décider où va le soleil si. Écrire la décision d'abord est ce qui rend cette moitié-là
  // vérifiable pour de bon.
  //
  // ⚠️ TROIS NOMS, PAS DIX. J'en avais inscrit dix, et le détecteur en a refusé sept : les
  // constantes et les deux fonctions d'angles sont déjà APPELÉES, à l'intérieur du module. Une
  // exemption qui ne correspond à rien est pire qu'inutile, elle laisse croire qu'on surveille un
  // export qui n'a jamais eu besoin de l'être. Le garde-fou du fichier a fait exactement son
  // travail.
  // `lumiereDeCase3D` et `LUMIERE_DEFAUT` ne sont PAS ici : le détecteur les voit appelées à
  // l'intérieur du module, par `definirLumiereDeCase3D` et `copierLumiere3D`. Deuxième fois que ce
  // garde-fou m'évite une exemption qui ne surveille rien.
  // #420a — LES SOURCES POSÉES : MÊME FIGURE, MÊME RAISON. La décision arrive encore avant son
  // application, et pour le motif qui l'a déjà justifié deux fois : décider ce qu'est une lumière,
  // ce qu'elle vaut par défaut et ce qu'on en donne au moteur se teste sous Node ; poser une
  // `PointLight` dans une scène Three.js, non. Chaque échéance est un NUMÉRO DE TÂCHE.
  //
  // `estUneLumiere3D`, `OBJ_TYPE_LUMIERE` et `LUMIERE_POSEE_DEFAUT` ne sont PAS ici : le détecteur
  // les voit appelés à l'intérieur du module. Troisième fois que ce garde-fou évite une exemption
  // qui ne surveillerait rien.
  champsLumierePosee3D: '#420b — la création depuis « Ajouter → Lumière »',
  eclairagePosee3D: '#420c — le rendu : la sphère, le cache de lumières, la signature',

  //
  // ⚠️ ET LA LISTE A ÉTÉ VIDE ENTRE-TEMPS : #414f a payé la dernière échéance. `copierLumiere3D` est
  // appelée par `loadSceneIntoPanel`, l'éclairage d'une Scène passe dans la Case qu'on charge.
  // La dette de #414a a donc été remboursée en entier, comme celle de #403a avant elle, et pour la
  // même raison : chaque échéance était un NUMÉRO DE TÂCHE et non une intention.

  // VIDE AVANT #414a, ET LA DETTE DE #403 AVAIT ÉTÉ PAYÉE EN ENTIER.
  //
  // Le chantier #402 avait vidé cette liste une première fois, et ses trois sorties avaient pris
  // trois chemins différents : #402b a retrouvé un appelant, #402c est partie, #402d a été vérifiée
  // nom par nom.
  //
  // #403a y avait inscrit cinq noms d'une QUATRIÈME nature, et c'était la première fois : le
  // magasin des images de Case — nommage, collisions, pont — a atterri avant l'interface qui s'en
  // sert. Ces exports n'étaient pas morts, ils étaient EN AVANCE, et l'échéance était écrite à côté
  // de chaque nom. Elle a été tenue : #403b en a remboursé deux (`casePorteUneImage3D` pour le
  // dessin, `readImage` pour le cache), #403c une troisième (`importImage`), et #403d les deux
  // dernières, `renameImage` et `deleteImage`, branchées sur le menu de la bibliothèque d'images.
  //
  // CE QUE CET ÉPISODE APPREND, et qui vaut d'être gardé : une dette à échéance ne tient que si
  // l'échéance est un NUMÉRO DE TÂCHE, pas une intention. « à brancher plus tard » n'aurait rien
  // fait échouer le jour où « plus tard » serait passé.
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
    // Elle a valu seize, puis zéro, puis cinq avec les fondations de #403a, trois après #403b, deux
    // après #403c, zéro à nouveau depuis #403d, trois avec celles de #414a, cinq avec le champ
    // persisté de #414b, quatre après #414c, trois après #414d, une seule depuis que #414e a
    // branché le dôme, ZÉRO depuis que #414f a branché l'héritage d'une Scène vers une Case, et
    // DEUX depuis les fondations de #420a. L'échéance de chacune est un numéro de tâche, et toutes
    // celles arrivées à terme ont été tenues.
    // Ajouter une ligne doit coûter un test rouge,
    // sans quoi la sortie de secours devient le chemin normal, et une liste qui s'allonge finit par
    // ne plus se lire, ce qui est exactement l'état dont ce fichier est né.
    assert.equal(Object.keys(EN_ATTENTE).length, 2,
      'une décision de plus a été REPORTÉE au lieu d\'être prise');
  });
});
