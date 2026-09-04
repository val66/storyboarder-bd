/**
 * tests/image-library.test.mjs, la bibliothèque d'images du menu de gauche.
 *
 * TROIS MÉTIERS, SÉPARÉS DANS LE MODULE ET SÉPARÉS ICI :
 *
 *   — le RECENSEMENT (`groupImagesByUsage`, `countImageUsages`), pur, qui dit ce qui sert et où ;
 *   — la NAVIGATION (`goToImageUsage`), qui pose quatre champs dans `S` et rien d'autre ;
 *   — la RÉPARATION d'un renommage (`repointerImage3D`, `repointerPileImages3D`).
 *
 * CE QUE CES TESTS GARDENT, et qui ne se voit à l'usage que trop tard :
 *
 *   — une image CITÉE PAR LE PROJET mais absente du disque apparaît quand même. C'est la seule
 *     ligne qui explique pourquoi une Case affiche « Image introuvable » ; la taire renverrait
 *     l'utilisateur à un dossier où il n'y a, précisément, rien à voir ;
 *   — deux Cases de la MÊME Planche portant la MÊME image font DEUX endroits distincts. Les
 *     confondre (un Set de libellés, ce qu'était la première version) en cacherait un, et l'endroit
 *     étant ici la destination, une des deux Cases deviendrait inatteignable depuis la liste ;
 *   — la PILE D'ANNULATION est réécrite au renommage. Sans cela Ctrl+Z ressuscite un nom de fichier
 *     mort, et des Cases sans rapport avec l'action annulée passent à « introuvable » ;
 *   — quitter l'éditeur de Scène appelle `quitterScene` AVANT d'effacer `editingSceneId`. La
 *     contrainte est écrite dans scenes.js et ne se devine pas : l'oublier laisse le mode Caméra
 *     actif en arrière-plan, où il se réveille à la prochaine ouverture.
 *
 * CE QU'ON N'AFFIRME PAS : le rendu. Aucun test ne dit à quoi ressemble une ligne, seulement ce
 * qu'elle a le droit de contenir (cf. docs/en/testing-method.md).
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * JOURNAL DE MUTATION, vingt fautes, une échappée
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 *   Z1  endroits dédupliqués par Planche (la première version du module)          ROUGE
 *   Z2  le numéro de Case toujours ajouté, même absent                            ROUGE
 *   Z3  quitterScene appelé APRÈS l'effacement de editingSceneId                  ROUGE
 *   Z4  la pile d'annulation rendue telle quelle                                  ROUGE
 *   Z5  confirmation demandée APRÈS le renommage sur le disque                    ROUGE
 *   Z6  cache non vidé après la suppression du disque                             ROUGE
 *   Z7  renderAll ne rafraîchit plus la liste                                     ROUGE
 *   Z8  tous les boutons d'une ligne pointent son premier endroit                 ROUGE
 *   Z9  toutes les lignes marquées inertes                                     ÉCHAPPÉE
 *   Z10 repointage sur le nom DEMANDÉ, pas sur celui rendu par le disque          ROUGE
 *   Z11 supprimer du disque vide aussi les Cases                                  ROUGE
 *   Z12 une image absente du disque n'est plus signalée sur sa ligne              ROUGE
 *   Z13 le genre « image » ne vérifie plus les collisions de noms                 ROUGE
 *   Z14 la confirmation de renommage part chez le renommeur de Scènes             ROUGE
 *   Z15 le nom proposé garde son extension                                        ROUGE
 *   Z16 seul « .png » est retiré du nom proposé                                   ROUGE
 *   Z17 cache non vidé après le renommage                                         ROUGE
 *   Z18 pile d'annulation non réécrite au renommage                               ROUGE
 *   Z19 un snapshot() rend le renommage annulable                                 ROUGE
 *   Z20 le volet Images ne se replie plus                                         ROUGE
 *
 * Z9 EST LA SEULE QUI COMPTE, et c'est la troisième fois que ce dépôt se fait prendre par cette
 * famille (cf. #403c). Le test vérifiait qu'une ligne INUTILISÉE porte `model-row-inert` ; il ne
 * vérifiait pas qu'une ligne utilisée ne la porte PAS. Marquer tout le monde le laissait donc vert,
 * pendant que la bibliothèque entière devenait grise et sans réponse au survol. La leçon est
 * toujours la même : une assertion de présence ne mesure rien sans son contraire en face, parce que
 * ce qui compte n'est pas la classe, c'est la DIFFÉRENCE qu'elle établit. Le test manquant a été
 * ajouté, et Z9 rejouée : rouge.
 *
 * Z1, Z8 et Z10 méritent d'être relues ensemble : les trois sont des fautes qu'aucun essai à l'œil
 * n'aurait attrapées avec UN seul fichier, UNE seule Case, ou UN nom déjà propre. Les montages de
 * ce fichier en portent délibérément plusieurs.
 */
import './helpers/dom-stub.mjs';
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  groupImagesByUsage, imageUsageLabel, countImageUsages, goToImageUsage,
  repointerImage3D, repointerPileImages3D,
  messageSuppressionImage, messageRenommageImage,
} from '../src/image-library.js';
import { S } from '../src/state.js';

const FR = (en, fr) => fr;

/** Une Case, avec ou sans image. `imageFile` est le champ persisté (cf. CHAMP_IMAGE_CASE). */
const caseObj = (id, imageFile, caseNumber) => {
  const o = { id, type: 'panel' };
  if (imageFile) o.imageFile = imageFile;
  if (caseNumber) o.caseNumber = caseNumber;
  return o;
};
const page = (...objects) => ({ objects });
const tome = (name, ...pages) => ({ name, pages });

describe('groupImagesByUsage : ce qui sert, et où', () => {
  test('deux groupes seulement, triés, et le disque décide de « non utilisée »', () => {
    const projet = { tomes: [tome('Tome 1', page(caseObj('c1', 'b.png', 1)))] };
    const g = groupImagesByUsage(['b.png', 'a.png', 'c.webp'], projet);

    assert.deepEqual(g.dansCases.map(e => e.nom), ['b.png']);
    // Triées : sans ordre stable, la liste changerait de disposition à chaque relecture du dossier,
    // et l'œil ne retrouverait pas la ligne qu'il vient de lire.
    assert.deepEqual(g.nonUtilisees, ['a.png', 'c.webp']);
    // ⚠️ Il n'y a PAS de troisième groupe. Une image ne peut pas vivre dans une Scène (le canevas
    // d'une Scène refuse l'image), et un groupe toujours vide apprend à ne plus lire la section.
    assert.deepEqual(Object.keys(g).sort(), ['dansCases', 'nonUtilisees']);
  });

  test('une image citée par le Projet mais absente du disque est LISTÉE quand même', () => {
    const projet = { tomes: [tome('Tome 1', page(caseObj('c1', 'perdue.png', 1)))] };
    const g = groupImagesByUsage([], projet);
    // C'est LA ligne qui explique une Case « Image introuvable ». Sans elle, l'utilisateur vient
    // chercher ici la trace d'un fichier disparu et repart sans réponse.
    assert.deepEqual(g.dansCases.map(e => e.nom), ['perdue.png']);
    assert.deepEqual(g.nonUtilisees, []);
  });

  test('deux Cases de la même Planche font DEUX endroits, pas un', () => {
    const projet = { tomes: [tome('Tome 1', page(
      caseObj('c1', 'ciel.png', 1),
      caseObj('c2', 'ciel.png', 2),
    ))] };
    const g = groupImagesByUsage(['ciel.png'], projet);
    const e = g.dansCases[0];
    assert.equal(e.count, 2);
    assert.equal(e.endroits.length, 2, 'les endroits ne doivent pas être dédupliqués par libellé');
    // Chaque endroit désigne SA Case : c'est ce qui rend les deux atteignables depuis la liste.
    assert.deepEqual(e.endroits.map(x => x.panelId), ['c1', 'c2']);
    assert.deepEqual(e.endroits.map(x => x.caseNumber), [1, 2]);
  });

  test('un endroit porte de quoi s\'y rendre, et pas de texte', () => {
    const projet = { tomes: [tome('Tome A', page(), page(caseObj('c9', 'x.png', 3)))] };
    const e = groupImagesByUsage(['x.png'], projet).dansCases[0].endroits[0];
    assert.deepEqual(e, {
      tomeIndex: 0, pageIndex: 1, tomeName: 'Tome A', pageNumber: 2, panelId: 'c9', caseNumber: 3,
    });
    // Aucune chaîne traduite dans le recensement : une fonction qui rend du texte traduit ne se
    // compare plus qu'à elle-même, et le groupement ne se vérifierait plus qu'en une seule langue.
    assert.equal(typeof e.tomeName, 'string');
    assert.ok(!('label' in e));
  });

  test('les Cases sans image et les Planches vides ne cassent rien', () => {
    const projet = { tomes: [tome('T', page(caseObj('c1'), { objects: null }), null)] };
    assert.deepEqual(groupImagesByUsage(['seule.png'], projet),
      { dansCases: [], nonUtilisees: ['seule.png'] });
    assert.deepEqual(groupImagesByUsage(null, undefined), { dansCases: [], nonUtilisees: [] });
  });
});

describe('imageUsageLabel : le texte de l\'endroit', () => {
  const endroit = { tomeIndex: 0, pageIndex: 1, tomeName: 'Tome 1', pageNumber: 2, panelId: 'c', caseNumber: 3 };

  test('Tome › Planche › Case, dans l\'ordre où l\'utilisateur les cherche', () => {
    assert.equal(imageUsageLabel(endroit, FR), 'Tome 1 › Planche 2 › Case 3');
    // ⚠️ LE NOM DU TOME NE SE TRADUIT PAS, et c'est délibéré : « Tome 1 » est ici le nom que
    // l'utilisateur a donné, pas un mot de l'interface. Le traduire renverrait l'anglophone vers
    // un « Volume 1 » qu'il ne trouverait nulle part dans son arborescence.
    assert.equal(imageUsageLabel(endroit, null), 'Tome 1 › Page 2 › Panel 3');
  });

  test('une Case sans numéro s\'arrête à la Planche : on n\'invente pas un numéro', () => {
    assert.equal(imageUsageLabel({ ...endroit, caseNumber: null }, FR), 'Tome 1 › Planche 2');
  });

  test('un Tome sans nom retombe sur son rang, jamais sur du vide', () => {
    assert.equal(imageUsageLabel({ ...endroit, tomeName: '' }, FR), 'Tome 1 › Planche 2 › Case 3');
    assert.equal(imageUsageLabel(null, FR), '');
  });
});

describe('countImageUsages : le décompte qui arme les deux messages', () => {
  test('compte les Cases, pas les Planches ni les fichiers', () => {
    const projet = { tomes: [
      tome('T1', page(caseObj('a', 'x.png'), caseObj('b', 'x.png')), page(caseObj('c', 'y.png'))),
      tome('T2', page(caseObj('d', 'x.png'))),
    ] };
    assert.equal(countImageUsages('x.png', projet), 3);
    assert.equal(countImageUsages('y.png', projet), 1);
    assert.equal(countImageUsages('z.png', projet), 0);
    assert.equal(countImageUsages('x.png', {}), 0);
  });
});

describe('goToImageUsage : se rendre à la Case', () => {
  beforeEach(() => {
    S.tomes = [tome('T1', page(caseObj('c1', 'x.png', 1))), tome('T2', page(caseObj('c2', 'x.png', 1)))];
    S.currentTomeIndex = 0; S.currentPageIndex = 0;
    S.selectedId = 'autre'; S.selectedRoomId = 'r'; S.dragMode = 'move'; S.editingSceneId = null;
  });

  test('pose la Planche ET la sélection, et rend true', () => {
    const cible = { tomeIndex: 1, pageIndex: 0, panelId: 'c2' };
    assert.equal(goToImageUsage(cible), true);
    assert.equal(S.currentTomeIndex, 1);
    assert.equal(S.currentPageIndex, 0);
    // La Case est SÉLECTIONNÉE : arriver sur la bonne Planche sans que rien n'y soit désigné
    // ressemble à un déplacement qui n'a rien fait.
    assert.equal(S.selectedId, 'c2');
    // Une sélection de Pièce ou un glissement en cours survivraient au changement de Planche et
    // s'appliqueraient à des objets qui ne sont plus à l'écran.
    assert.equal(S.selectedRoomId, null);
    assert.equal(S.dragMode, null);
  });

  test('quitte l\'éditeur de Scène AVANT d\'effacer editingSceneId', () => {
    S.editingSceneId = 's1';
    const ordre = [];
    goToImageUsage({ tomeIndex: 0, pageIndex: 0, panelId: 'c1' }, {
      // Au moment de l'appel, editingSceneId doit encore valoir la Scène : c'est ce dont
      // disableSceneCameraMode a besoin pour éteindre le bon mode Caméra (cf. scenes.js).
      quitterScene: () => ordre.push(S.editingSceneId),
    });
    assert.deepEqual(ordre, ['s1']);
    assert.equal(S.editingSceneId, null);
  });

  test('hors de l\'éditeur de Scène, on n\'appelle rien', () => {
    let appels = 0;
    goToImageUsage({ tomeIndex: 0, pageIndex: 0, panelId: 'c1' }, { quitterScene: () => appels++ });
    assert.equal(appels, 0);
  });

  test('une destination qui ne désigne plus rien rend false, sans rien poser', () => {
    // La liste a pu être affichée avant qu'une Planche soit supprimée. On refuse plutôt que de
    // poser des index hors des tableaux, ce qui laisserait l'écran sur une Planche inexistante.
    for (const cible of [null, {}, { tomeIndex: 9, pageIndex: 0, panelId: 'c1' },
      { tomeIndex: 0, pageIndex: 7, panelId: 'c1' }]) {
      assert.equal(goToImageUsage(cible), false);
      assert.equal(S.selectedId, 'autre', 'rien ne doit être posé sur un refus');
    }
  });
});

describe('repointerImage3D : le Projet ouvert suit le renommage', () => {
  test('mute les Cases concernées et rend leur nombre', () => {
    const a = caseObj('a', 'vieux.png'), b = caseObj('b', 'vieux.png'), c = caseObj('c', 'autre.png');
    const racines = { tomes: [tome('T', page(a, c), page(b))] };
    assert.equal(repointerImage3D(racines, 'vieux.png', 'neuf.png'), 2);
    assert.equal(a.imageFile, 'neuf.png');
    assert.equal(b.imageFile, 'neuf.png');
    assert.equal(c.imageFile, 'autre.png');
  });

  test('MUTE, et ne remplace pas les tableaux', () => {
    // Les Cases sont partagées par référence avec la sélection et le panneau latéral : reconstruire
    // les tableaux ferait perdre la sélection en cours pour un simple changement de nom de fichier.
    const a = caseObj('a', 'v.png');
    const objets = [a];
    const racines = { tomes: [{ name: 'T', pages: [{ objects: objets }] }] };
    repointerImage3D(racines, 'v.png', 'n.png');
    assert.equal(racines.tomes[0].pages[0].objects, objets);
    assert.equal(racines.tomes[0].pages[0].objects[0], a);
  });

  test('un renommage qui n\'en est pas un ne touche à rien', () => {
    const a = caseObj('a', 'x.png');
    const racines = { tomes: [tome('T', page(a))] };
    assert.equal(repointerImage3D(racines, 'x.png', 'x.png'), 0);
    assert.equal(repointerImage3D(racines, '', 'y.png'), 0);
    assert.equal(repointerImage3D(racines, 'x.png', ''), 0);
    assert.equal(a.imageFile, 'x.png');
  });
});

describe('repointerPileImages3D : Ctrl+Z ne ressuscite pas un nom mort', () => {
  const etat = (nom) => JSON.stringify({ tomes: [{ name: 'T', pages: [{ objects: [caseObj('a', nom)] }] }] });

  test('réécrit TOUS les états de la pile', () => {
    const pile = [etat('vieux.png'), etat('vieux.png'), etat('intact.png')];
    const neuve = repointerPileImages3D(pile, 'vieux.png', 'neuf.png');
    const noms = neuve.map(e => JSON.parse(e).tomes[0].pages[0].objects[0].imageFile);
    assert.deepEqual(noms, ['neuf.png', 'neuf.png', 'intact.png']);
    // La pile est REMPLACÉE, pas mutée : `S.undoStack` reçoit le retour, et une pile mutée sur
    // place laisserait les deux versions coexister si l'affectation était oubliée.
    assert.notEqual(neuve, pile);
    assert.equal(JSON.parse(pile[0]).tomes[0].pages[0].objects[0].imageFile, 'vieux.png');
  });

  test('une entrée illisible est rendue telle quelle, elle n\'efface pas la pile', () => {
    const neuve = repointerPileImages3D(['{pas du JSON', etat('v.png')], 'v.png', 'n.png');
    assert.equal(neuve[0], '{pas du JSON');
    assert.equal(JSON.parse(neuve[1]).tomes[0].pages[0].objects[0].imageFile, 'n.png');
  });

  test('rien à faire : une copie, jamais null', () => {
    assert.deepEqual(repointerPileImages3D(null, 'a', 'b'), []);
    const pile = [etat('x.png')];
    assert.deepEqual(repointerPileImages3D(pile, 'x.png', 'x.png'), pile);
  });
});

describe('Les deux messages de confirmation', () => {
  test('la suppression dit les trois choses, dont ce qui NE se passe PAS', () => {
    const m = messageSuppressionImage('ciel.png', 2, FR);
    assert.match(m, /ciel\.png/);
    assert.match(m, /2 Case/, 'le décompte du Projet ouvert');
    assert.match(m, /ne sont pas vidées/, 'les Cases gardent leur champ : elles signalent, elles ne s\'effacent pas');
    assert.match(m, /D'autres Projets/, 'ce qu\'on ne peut pas vérifier d\'ici');
    assert.match(m, /irréversible/);
  });

  test('la suppression d\'une image inutilisée le dit, plutôt que d\'écrire « 0 Case »', () => {
    const m = messageSuppressionImage('ciel.png', 0, FR);
    assert.match(m, /Aucune Case/);
    assert.ok(!/0 Case/.test(m));
    assert.match(m, /D'autres Projets/, 'inutilisée ICI ne veut pas dire inutilisée partout');
  });

  test('le renommage dit ce qui suit ici, et ce qui casse ailleurs', () => {
    const m = messageRenommageImage('a.png', 'b.png', 3, FR);
    assert.match(m, /a\.png/); assert.match(m, /b\.png/);
    assert.match(m, /3 Case\(s\) du Projet ouvert suivent/);
    assert.match(m, /autres Projets/);
    assert.match(m, /introuvable/);
  });

  test('les deux messages existent en anglais', () => {
    // Le traducteur absent retombe sur l'anglais : c'est ce qui permet de les vérifier sans monter
    // l'application, et ce qui garantit qu'aucune des deux langues n'est une chaîne vide.
    for (const m of [messageSuppressionImage('a.png', 1), messageRenommageImage('a.png', 'b.png', 1)]) {
      assert.match(m, /a\.png/);
      assert.ok(!/[«»É]/.test(m), 'la version anglaise ne doit pas laisser passer de français');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// LE CÂBLAGE
//
// Les fonctions ci-dessus sont pures : elles peuvent être toutes justes pendant que la section
// n'existe pas à l'écran. C'est exactement ce qui s'est produit deux fois dans ce chantier (#403b,
// #403c), et à chaque fois la faute était la même : une pièce écrite, testée, et jamais branchée.
//
// ⚠️ LEÇON DE #403c, APPLIQUÉE ICI : une assertion qui vérifie qu'un identifiant APPARAÎT dans le
// fichier ne vérifie rien. Trois mutations lui avaient échappé parce que le nom restait présent
// ailleurs, ou dans le commentaire qui l'explique. Ce qui suit lit des BLOCS délimités, sans
// commentaires, et compare des POSITIONS quand c'est l'ordre qui compte.
// ─────────────────────────────────────────────────────────────────────────────

import { sourceSansCommentaires } from './helpers/source.mjs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const HTML   = readFileSync(join(RACINE, 'index.html'), 'utf8');
const EVENTS = readFileSync(join(RACINE, 'src/events.js'), 'utf8');
const TREE   = readFileSync(join(RACINE, 'src/project-tree.js'), 'utf8');
const DRAW   = readFileSync(join(RACINE, 'src/draw.js'), 'utf8');
const IO     = readFileSync(join(RACINE, 'src/io.js'), 'utf8');
const CSS    = readFileSync(join(RACINE, 'style.css'), 'utf8');

/** Le corps de `_renommerImage`, COMMENTAIRES RETIRÉS (cf. l'avertissement ci-dessus). */
function corpsDuRenommage(){
  const i = EVENTS.indexOf('async function _renommerImage');
  assert.ok(i > 0, '_renommerImage introuvable');
  const bloc = EVENTS.slice(i);
  return sourceSansCommentaires(bloc.slice(0, bloc.indexOf('\nsetRenameImageCallback')));
}
/** Le corps d'un gestionnaire `document.getElementById('X').onclick`, sans commentaires. */
function corpsDuClic(id){
  const i = EVENTS.indexOf(`${id}').onclick`);
  assert.ok(i > 0, `${id} n'est branché nulle part`);
  const bloc = EVENTS.slice(i);
  return sourceSansCommentaires(bloc.slice(0, bloc.indexOf('\n};')));
}

describe('Section Images : le câblage', () => {
  test('la section et son menu contextuel existent', () => {
    ['imageTrigger', 'imagePanel', 'imageList', 'imageContextMenu', 'ctxRenameImage', 'ctxDeleteImage']
      .forEach(id => assert.match(HTML, new RegExp(`id="${id}"`), `absent : ${id}`));
  });

  test('le volet s\'ouvre et se ferme, comme celui des Modèles', () => {
    // Sans cette ligne la section s'affiche mais son entête ne répond pas : un volet qu'on ne peut
    // ni replier ni déplier au milieu de quatre autres qui le peuvent.
    assert.match(sourceSansCommentaires(EVENTS), /setupDropdown\('imageTrigger', 'imagePanel'\)/);
  });

  test('la liste se recalcule à chaque rendu, comme celle des Modèles', () => {
    // Les groupes sont DÉDUITS du Projet : détacher une image d'une Case la fait passer d'un groupe
    // à l'autre, et une liste figée dirait le contraire de ce que l'utilisateur vient de faire.
    assert.match(sourceSansCommentaires(DRAW), /_renderImageList\(\);/,
      'renderAll ne rafraîchit pas la bibliothèque d\'images');
    assert.match(TREE, /export async function renderImageList/);
  });

  test('RÉGRESSION : le renommage demande confirmation AVANT de toucher au disque', () => {
    const corps = corpsDuRenommage();
    assert.ok(corps.indexOf('confirmAction') < corps.indexOf('renameImage('),
      'le fichier est renommé avant que l\'utilisateur ait répondu');
    assert.match(corps, /messageRenommageImage/, 'le message chiffré n\'est pas utilisé');
    assert.match(corps, /countImageUsages/, 'le décompte des usages n\'est pas fait');
  });

  test('RÉGRESSION : le disque D\'ABORD, les références ENSUITE', () => {
    const corps = corpsDuRenommage();
    assert.ok(corps.indexOf('renameImage(') < corps.indexOf('repointerImage3D'),
      'les Cases sont repointées avant de savoir si le renommage a réussi');
  });

  test('RÉGRESSION : le renommage suit le NOM RENDU par le disque, pas celui demandé', () => {
    // `renameImage` peut assainir le nom (extension, minuscules). Repointer sur `nouveau` plutôt
    // que sur `r.name` ferait citer aux Cases un fichier qui n'a pas ce nom-là sur le disque, et
    // toutes afficheraient « introuvable » après un renommage pourtant réussi.
    const corps = corpsDuRenommage();
    assert.match(corps, /repointerImage3D\([^)]*r\.name\)/);
    assert.match(corps, /repointerPileImages3D\(S\.undoStack, ancien, r\.name\)/);
  });

  test('RÉGRESSION : la pile d\'annulation et le cache suivent, et aucun snapshot n\'est pris', () => {
    const corps = corpsDuRenommage();
    //   pile d'annulation → Ctrl+Z ressusciterait l'ancien nom, donc des Cases « introuvable » ;
    //   cache             → l'image resterait affichée sous son ancien nom jusqu'au prochain Projet.
    assert.match(corps, /S\.undoStack = repointerPileImages3D/);
    assert.match(corps, /clearImageCache\(\)/);
    // Et surtout PAS de snapshot() : annuler restaurerait l'ancien nom alors que le disque porte le
    // nouveau, ce qui casserait les Cases pour une opération qui a réussi.
    assert.ok(!/snapshot\(\)/.test(corps), 'un instantané rendrait le renommage annulable à tort');
  });

  test('RÉGRESSION : un échec de renommage est rapporté, et ne repointe rien', () => {
    const corps = corpsDuRenommage();
    assert.match(corps, /alertAction/);
    assert.ok(corps.indexOf('alertAction') < corps.indexOf('repointerImage3D'),
      'un refus d\'écriture laisserait quand même les Cases repointées');
  });

  test('RÉGRESSION : la suppression confirme AVANT d\'effacer, et vide le cache après', () => {
    const corps = corpsDuClic('ctxDeleteImage');
    assert.match(corps, /messageSuppressionImage/);
    assert.ok(corps.indexOf('confirmAction') < corps.indexOf('deleteImage('),
      'le fichier est effacé avant que l\'utilisateur ait répondu, et « non » ne le ramène pas');
    assert.ok(corps.indexOf('deleteImage(') < corps.indexOf('clearImageCache'),
      'le cache est vidé avant la suppression, donc rechargé aussitôt');
    assert.match(corps, /alertAction/, 'un échec de suppression serait avalé');
  });

  test('RÉGRESSION : supprimer du disque NE VIDE PAS les Cases', () => {
    // C'est la promesse du message de confirmation, et l'inverse effacerait du travail sans le
    // dire. Une Case garde son champ, signale, et redevient normale si le fichier revient.
    const corps = corpsDuClic('ctxDeleteImage');
    assert.ok(!/imageFile/.test(corps), 'la suppression touche au champ des Cases');
    assert.ok(!/repointerImage3D/.test(corps));
  });

  test('la modale de renommage connaît le genre « image », de bout en bout', () => {
    // Quatre endroits, et en oublier un ne casse rien de visible : le titre reste celui d'une
    // Scène, ou la confirmation part chez le mauvais destinataire et le renommage n'a pas lieu.
    const io = sourceSansCommentaires(IO);
    assert.match(io, /kind === 'modele' \|\| kind === 'image'/, 'la collision de noms n\'est pas vérifiée');
    assert.match(io, /Rename the image file/, 'le titre de la modale');
    assert.match(io, /An image file already has that name/, 'le message de collision');
    assert.match(io, /kind === 'image'.*_applyRenameImage\(target, newName\)/s,
      'la confirmation n\'atteint pas le renommeur d\'images');
    assert.match(sourceSansCommentaires(EVENTS), /setRenameImageCallback\(_renommerImage\)/);
  });

  test('le nom proposé arrive SANS son extension, et pour les trois formats', () => {
    // La garder mettrait « .png » sous le curseur et le premier geste serait de l'effacer. Une
    // expression qui n'ôterait que `.png` laisserait « photo.jpg » se faire renommer en
    // « photo.jpg.jpg » au premier Entrée.
    const corps = sourceSansCommentaires(EVENTS.slice(EVENTS.indexOf("ctxRenameImage').onclick")));
    const m = corps.match(/replace\((\/[^/]+\/i?), ''\)/);
    assert.ok(m, 'l\'extension n\'est pas retirée du nom proposé');
    const motif = new RegExp(m[1].slice(1, -2), m[1].endsWith('i') ? 'i' : '');
    ['a.png', 'a.jpg', 'a.jpeg', 'a.webp', 'a.PNG'].forEach(n =>
      assert.equal(n.replace(motif, ''), 'a', `extension non retirée : ${n}`));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// LA FORME DES LIGNES, observée sur le DOM réellement construit.
//
// Les assertions par lecture du source ne valent rien ici : elles seraient satisfaites par le
// commentaire qui les explique (trois précédents dans ce dépôt).
// ─────────────────────────────────────────────────────────────────────────────

const { renderImageList, setProjectTreeCallbacks } = await import('../src/project-tree.js');
const { setImageBridge } = await import('../src/image-store.js');

let _ctx, _allees;
/** Rend la liste pour un disque et un Projet donnés, et rend les lignes construites. */
async function rendre(fichiers, projet){
  _ctx = []; _allees = [];
  setImageBridge({ listImageFiles: async () => fichiers });
  setProjectTreeCallbacks({
    openImageContextMenu: (e, nom) => _ctx.push(nom),
    openImageUsage: (endroit) => _allees.push(endroit),
  });
  // La langue est FIXÉE, elle n'est pas héritée : les libellés d'endroit sont traduits, et un test
  // qui lit du français en dépendant de l'état laissé par un autre fichier se met à échouer pour
  // une raison qui n'a rien à voir avec ce qu'il vérifie.
  S.appLang = 'fr';
  S.tomes = projet.tomes || [];
  S.editingSceneId = null;
  await renderImageList();
  return document.getElementById('imageList').children
    .filter(n => String(n.className || '').includes('model-row'));
}

describe('Affichage de la bibliothèque d\'images', () => {
  test('le nom d\'abord, puis un endroit par ligne', async () => {
    const [ligne] = await rendre(['ciel.png'], { tomes: [
      tome('Tome 1', page(caseObj('c1', 'ciel.png', 1), caseObj('c2', 'ciel.png', 2))),
    ] });
    const textes = ligne.children.map(c => c.textContent);
    assert.equal(textes[0], 'ciel.png', 'le nom de fichier n\'est pas la première ligne');
    assert.deepEqual(textes.slice(1), ['Tome 1 › Planche 1 › Case 1', 'Tome 1 › Planche 1 › Case 2'],
      'les deux Cases doivent être lisibles séparément, jamais concaténées');
  });

  test('RÉGRESSION : chaque endroit mène à SA Case, pas à celle d\'une autre ligne', async () => {
    // Les lignes ET les endroits sont construits en boucle : c'est exactement l'endroit où une
    // fermeture mal fermée fait tout désigner la même chose, et le défaut est invisible tant qu'on
    // n'essaie qu'un seul fichier.
    const lignes = await rendre(['a.png', 'b.png'], { tomes: [
      tome('T1', page(caseObj('ca', 'a.png', 1))),
      tome('T2', page(), page(caseObj('cb', 'b.png', 1))),
    ] });
    assert.equal(lignes.length, 2);
    const bouton = (l) => l.children.find(c => String(c.className || '') === 'image-row-where');
    bouton(lignes[1]).onclick({ stopPropagation(){} });
    assert.equal(_allees.length, 1);
    assert.deepEqual(
      [_allees[0].tomeIndex, _allees[0].pageIndex, _allees[0].panelId], [1, 1, 'cb'],
      'le clic a demandé une autre Case que celle de sa ligne');
  });

  test('RÉGRESSION : sur une ligne à plusieurs endroits, chaque bouton porte LE SIEN', async () => {
    // Le test précédent ne suffit pas : une ligne n'y avait qu'un endroit, donc `endroits[0]`
    // l'aurait satisfait. C'est la BOUCLE INTÉRIEURE qu'on vérifie ici — trois destinations sur
    // une même ligne, et c'est la troisième qu'on demande.
    const [ligne] = await rendre(['ciel.png'], { tomes: [tome('T',
      page(caseObj('c1', 'ciel.png', 1), caseObj('c2', 'ciel.png', 2)),
      page(caseObj('c3', 'ciel.png', 1)),
    )] });
    const boutons = ligne.children.filter(c => String(c.className || '') === 'image-row-where');
    assert.equal(boutons.length, 3);
    boutons[2].onclick({ stopPropagation(){} });
    assert.deepEqual([_allees[0].pageIndex, _allees[0].panelId], [1, 'c3']);
    boutons[1].onclick({ stopPropagation(){} });
    assert.deepEqual([_allees[1].pageIndex, _allees[1].panelId], [0, 'c2']);
  });

  test('RÉGRESSION : une image inutilisée n\'invite pas au clic, et le montre AVANT', async () => {
    const [ligne] = await rendre(['orpheline.png'], { tomes: [] });
    assert.match(String(ligne.className), /model-row-inert/,
      'rien ne distingue une ligne inerte d\'une ligne cliquable');
    assert.ok(!ligne.children.some(c => String(c.className || '') === 'image-row-where'),
      'une image inutilisée ne doit offrir aucune destination');
  });

  test('RÉGRESSION : et une image UTILISÉE n\'est pas inerte', async () => {
    // ⚠️ ÉCHAPPÉE DE MA CAMPAGNE (Z9), et c'est la même famille que #403c : poser `model-row-inert`
    // sur TOUTES les lignes laissait le test précédent vert, puisqu'il ne vérifiait que la présence
    // de la classe, jamais son absence. Toute la bibliothèque serait devenue grise et morte au
    // survol sans qu'un seul test bronche. Une assertion de présence a besoin de son contraire en
    // face, sinon elle ne mesure plus la DIFFÉRENCE, qui est pourtant tout ce qui compte ici.
    const [ligne] = await rendre(['ciel.png'], { tomes: [tome('T', page(caseObj('c1', 'ciel.png', 1)))] });
    assert.ok(!/model-row-inert/.test(String(ligne.className)),
      'une image utilisée est présentée comme si elle ne menait nulle part');
  });

  test('RÉGRESSION : une image citée mais absente du disque se signale sur SA ligne', async () => {
    const [ligne] = await rendre([], { tomes: [tome('T', page(caseObj('c1', 'perdue.png', 1)))] });
    const textes = ligne.children.map(c => c.textContent);
    assert.ok(textes.some(t => /introuvable/.test(t)),
      'c\'est ici qu\'on vient chercher pourquoi une Case affiche « Image introuvable »');
  });

  test('RÉGRESSION : le clic droit ouvre le menu de CETTE image', async () => {
    const lignes = await rendre(['a.png', 'b.png', 'c.png'], { tomes: [] });
    assert.equal(lignes.length, 3);
    lignes[1].oncontextmenu({ preventDefault(){}, stopPropagation(){} });
    assert.deepEqual(_ctx, ['b.png'], 'le menu porterait sur un autre fichier');
  });

  test('un dossier vide affiche une indication, pas une section blanche', async () => {
    await rendre([], { tomes: [] });
    assert.match(document.getElementById('imageList').innerHTML, /Aucune image/);
  });

  test('RÉGRESSION : le déplacement est branché, et ne redessine que s\'il a eu lieu', () => {
    // La liste délègue (`_cb.openImageUsage`) : sans ce câblage dans events.js, les endroits
    // seraient de beaux boutons qui ne mènent nulle part, et les tests ci-dessus resteraient verts
    // puisqu'ils injectent le destinataire eux-mêmes.
    const src = sourceSansCommentaires(EVENTS);
    assert.match(src, /function openImageUsage\(endroit\)\s*\{[^}]*goToImageUsage\(endroit, \{ quitterScene: disableSceneCameraMode \}\)[^}]*renderAll\(\)/,
      'le déplacement n\'appelle pas goToImageUsage, ou ne redessine pas ensuite');
    assert.match(src, /setProjectTreeCallbacks\(\{[^}]*openImageUsage[^}]*\}\)/s,
      'openImageUsage n\'est pas injecté dans la liste');
  });

  test('les classes posées par le JS existent VRAIMENT dans style.css', () => {
    // Même piège que pour les modèles : une classe absente du CSS laisse une ligne qui n'a l'air
    // de rien de ce qu'elle prétend être. `.image-row-where` est LE bouton de cette section.
    assert.match(CSS, /\.image-row-where\s*\{/, '.image-row-where n\'est pas stylée');
    assert.match(CSS, /\.image-row-where:hover/, 'l\'endroit n\'a pas d\'état de survol : il ne se lit pas comme cliquable');
    const bloc = CSS.slice(CSS.indexOf('.image-row-where {'));
    assert.match(bloc.slice(0, bloc.indexOf('}')), /cursor:\s*pointer/);
  });
});
