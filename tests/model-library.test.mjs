/**
 * tests/model-library.test.mjs, la bibliothèque de modèles, groupée par usage RÉEL.
 *
 * Le groupement affiché dans le menu de gauche est DÉDUIT du Projet ouvert, à chaque affichage. Ce
 * choix a été tranché contre deux alternatives, un manifeste, ou des sous-dossiers « Décors » /
 * « Objets », pour une raison qui se teste : un même fichier peut servir de décor dans une Scène ET
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
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  groupModelsByUsage, countModelUsages, messageSuppressionModele, messageRenommageModele,
  repointerModele3D, repointerPileAnnulation3D,
  resoudreRenommage3D, ajouterRenommage3D, modelesARepointer3D, messageRepointageModeles,
  MAX_RENOMMAGES_3D,
} from '../src/model-library.js';
import { renameModel } from '../src/model-store.js';

const el = (modelFile) => ({ id: 'e' + Math.random(), type: 'objet3d', objType: 'modele', modelFile });
const volume = (nom, ...objets) => ({ name: nom, pages: [{ objects: objets }] });

describe('groupModelsByUsage : le groupement ne peut pas mentir', () => {
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
    // qu'il n'a qu'un usage, donc qu'on peut le supprimer une fois cet usage traité.
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
    // liste, au motif qu'il n'est pas sur le disque, le rendrait introuvable au moment précis où
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

describe('countModelUsages : le chiffre annoncé avant une suppression', () => {
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
    // veut plus rien dire; le compter gonflerait le chiffre annoncé avant une suppression, donc
    // dissuaderait de supprimer un fichier que plus rien n'utilise.
    const projet = { scenes: [], tomes: [volume('T',
      { type: 'objet3d', objType: 'chaise', modelFile: 'x.glb' },
      { type: 'perso', modelFile: 'x.glb' })] };
    assert.equal(countModelUsages('x.glb', projet), 0);
  });
});

describe('messageSuppressionModele : dire les trois choses', () => {
  // Le message passe par tr() : la langue est fixée ici, sinon ces assertions dépendraient de
  // `S.appLang`, qui vaut 'en' par défaut dans state.js et n'a rien à voir avec ce qu'on vérifie.
  beforeEach(() => { S.appLang = 'fr'; });

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
    // qu'on n'a pas, et c'est justement ce que l'utilisateur risque de casser.
    [0, 3].forEach(n => assert.match(msg(n), /autres Projets/,
      'le message ne mentionne pas les autres Projets'));
  });

  test('il dit que c\'est définitif', () => {
    assert.match(msg(1), /définitive|irréversible/);
  });
});

/**
 * JOURNAL DE MUTATION : six fautes, toutes rouges.
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
 * le type a changé, il gonflerait le chiffre annoncé avant une suppression, et dissuaderait donc de
 * supprimer un fichier que plus rien n'utilise. Montage complété.
 *
 * PIÈGE DE CIBLAGE, noté pour la prochaine fois : ma première version de X5 mutait la chaîne
 * ANGLAISE, alors que le test lit la française. Elle s'annonçait « échappée » sans rien prouver.
 * Une mutation sur du texte bilingue doit viser la langue que le test observe.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Le câblage de la section Modèles
// ─────────────────────────────────────────────────────────────────────────────

import { sourceSansCommentaires } from './helpers/source.mjs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const HTML = readFileSync(join(RACINE, 'index.html'), 'utf8');
const EVENTS = readFileSync(join(RACINE, 'src/events.js'), 'utf8');
const TREE = readFileSync(join(RACINE, 'src/project-tree.js'), 'utf8');
const DRAW = readFileSync(join(RACINE, 'src/draw.js'), 'utf8');
const MAIN = readFileSync(join(RACINE, 'main.js'), 'utf8');
const IO = readFileSync(join(RACINE, 'src/io.js'), 'utf8');

// Le corps de `_renommerModele`, COMMENTAIRES RETIRÉS. Sans ce filtrage, le test « aucun
// snapshot() » échouait sur le commentaire de la fonction, qui explique justement pourquoi
// snapshot() n'y est pas appelé. Troisième fois que ce dépôt se fait prendre par un test satisfait
// — ou mis en échec — par du texte en commentaire (cf. Fix 88, puis la signature d'index du pont).
function corpsDuRenommage(){
  const i = EVENTS.indexOf('async function _renommerModele');
  assert.ok(i > 0, '_renommerModele introuvable');
  const bloc = EVENTS.slice(i);
  return sourceSansCommentaires(bloc.slice(0, bloc.indexOf('\nsetRenameModelCallback')));
}

describe('Section Modèles : le câblage', () => {
  test('la section et son menu contextuel existent', () => {
    ['modelTrigger', 'modelPanel', 'modelList', 'modelContextMenu', 'ctxDeleteModel', 'ctxRenameModel']
      .forEach(id => assert.match(HTML, new RegExp(`id="${id}"`), `absent : ${id}`));
  });

  // CE TEST DISAIT L'INVERSE. Il épinglait « le menu n'offre AUCUN renommage », au nom d'une
  // décision réelle : `modelFile` est un identifiant persisté, le renommer casse les Éléments des
  // autres Projets. La décision a été levée sur demande, et pour une raison qui tenait : la
  // SUPPRESSION, offerte juste à côté, fait exactement le même dégât en pire, le fichier ne revient
  // pas. Ce qui remplace l'interdit, ce sont les garanties ci-dessous.
  test('RÉGRESSION : le renommage demande confirmation AVANT de toucher au disque', () => {
    const corps = corpsDuRenommage();
    assert.ok(corps.indexOf('confirmAction') < corps.indexOf('renameModel('),
      'le fichier est renommé avant que l\'utilisateur ait répondu');
    assert.match(corps, /messageRenommageModele/, 'le message chiffré n\'est pas utilisé');
    assert.match(corps, /countModelUsages/, 'le décompte des usages n\'est pas fait');
  });

  test('RÉGRESSION : le disque D\'ABORD, les références ENSUITE', () => {
    // L'ordre inverse laisserait les Éléments pointer vers un fichier inexistant au premier refus
    // d'écriture, un Projet cassé par une opération qui a échoué.
    const corps = corpsDuRenommage();
    assert.ok(corps.indexOf('renameModel(') < corps.indexOf('repointerModele3D'),
      'les Éléments sont repointés avant de savoir si le renommage a réussi');
  });

  test('RÉGRESSION : la pile d\'annulation, la correspondance et le cache suivent', () => {
    // Les trois oublis possibles, et ce que chacun coûte :
    //   pile d'annulation  → Ctrl+Z ressuscite l'ancien nom, donc des boîtes de remplacement ;
    //   correspondance     → le travail de correspondance des os est à refaire ;
    //   cache              → le modèle continue de s'afficher sous son ancien nom.
    const corps = corpsDuRenommage();
    assert.match(corps, /repointerPileAnnulation3D/, 'la pile d\'annulation n\'est pas réécrite');
    assert.match(corps, /renommerCorrespondance/, 'la correspondance de squelette ne suit pas');
    assert.match(corps, /clearModelCache/, 'le cache n\'est pas vidé');
  });

  test('RÉGRESSION : le renommage est NOTÉ pour les autres Projets', () => {
    // Sans cette note, la réparation proposée à l'ouverture d'un autre Projet n'aurait jamais de
    // quoi travailler : c'est la seule trace de ce qui a été renommé.
    assert.match(corpsDuRenommage(), /noterRenommageModele/);
  });

  test('RÉGRESSION : le journal est chargé AVANT l\'ouverture du dernier Projet', () => {
    // Chargé après, il ne servirait qu'à l'ouverture SUIVANTE : le Projet rouvert au démarrage est
    // précisément celui qu'on veut réparer en premier.
    const src = sourceSansCommentaires(EVENTS);
    const chargement = src.indexOf('loadModelRenames()');
    const demarrage = src.indexOf('initStartupProject)');
    // ⚠️ LES DEUX PRÉSENCES D'ABORD. `indexOf` rend −1 quand l'appel disparaît, et −1 est inférieur
    // à tout : la comparaison seule restait verte alors que le chargement avait été supprimé.
    // Mutation échappée, puis rattrapée ici.
    assert.ok(chargement >= 0, 'loadModelRenames() n\'est plus appelé au démarrage');
    assert.ok(demarrage >= 0, 'initStartupProject introuvable');
    assert.ok(chargement < demarrage, 'loadModelRenames doit précéder initStartupProject');
  });

  test('RÉGRESSION : chaque ouverture de Projet propose le repointage', () => {
    // Trois chemins ouvrent un Projet existant : deux dans io.js (Electron et navigateur), un au
    // démarrage dans events.js. Un oubli sur l'un d'eux ne se verrait qu'à l'usage, et seulement
    // par la personne qui ouvre ses Projets de cette façon-là.
    const io = sourceSansCommentaires(IO);
    // Les APPELS, pas la déclaration : `export function applyProjectData(data){` répond au même
    // motif, et le compte devenait 3 pour 2 chemins.
    const ouvertures = (io.match(/\n\s+applyProjectData\(data\);/g) || []).length;
    assert.equal(ouvertures, 2, 'le nombre de chemins d\'ouverture dans io.js a changé');
    assert.equal((io.match(/proposerRepointageModeles\(\)/g) || []).length, 3,
      'la définition plus deux appels : un chemin d\'ouverture ne propose rien');
    assert.match(sourceSansCommentaires(EVENTS), /proposerRepointageModeles\(\)/,
      'le Projet rouvert au démarrage ne propose rien');
  });

  test('RÉGRESSION : aucun snapshot() avant un renommage', () => {
    // Un instantané rendrait l'opération « annulable », et l'annulation restaurerait l'ancien nom
    // de fichier alors que le disque porte le nouveau.
    const corps = corpsDuRenommage();
    assert.doesNotMatch(corps, /\bsnapshot\(\)/,
      'le renommage est rendu annulable, alors que le disque ne l\'est pas');
  });

  test('RÉGRESSION : la suppression demande confirmation AVANT de supprimer', () => {
    const bloc = EVENTS.slice(EVENTS.indexOf("ctxDeleteModel').onclick"));
    const corps = bloc.slice(0, bloc.indexOf('\n};'));
    assert.ok(corps.indexOf('confirmAction') < corps.indexOf('deleteModelFile'),
      'le fichier est supprimé avant que l\'utilisateur ait répondu');
    assert.match(corps, /messageSuppressionModele/, 'le message chiffré n\'est pas utilisé');
    assert.match(corps, /countModelUsages/, 'le décompte des usages n\'est pas fait');
  });

  test('RÉGRESSION : après suppression, le cache est vidé', () => {
    // Sans cela, un modèle supprimé du disque continuerait de s'afficher jusqu'au prochain
    // changement de Projet, un mensonge à l'écran, et le contraire de ce que l'utilisateur vient
    // de demander.
    const bloc = EVENTS.slice(EVENTS.indexOf("ctxDeleteModel').onclick"));
    assert.match(bloc.slice(0, bloc.indexOf('\n};')), /clearModelCache\(\)/,
      'le modèle supprimé resterait affiché');
  });

  test('un échec de suppression est rapporté, pas avalé', () => {
    const bloc = EVENTS.slice(EVENTS.indexOf("ctxDeleteModel').onclick"));
    assert.match(bloc.slice(0, bloc.indexOf('\n};')), /alertAction/);
  });

  test('la liste se recalcule à chaque rendu, comme celle des Scènes', () => {
    // Le groupement est DÉDUIT du Projet : il doit suivre les changements du Projet, pas seulement
    // l'ouverture.
    assert.match(DRAW, /_renderModelList\(\);/, 'renderAll ne rafraîchit pas la bibliothèque');
    assert.match(TREE, /export async function renderModelList/);
  });

  test('main.js garde la suppression comme il garde l\'écriture', () => {
    const bloc = MAIN.slice(MAIN.indexOf("'models:delete'"));
    assert.match(bloc.slice(0, 400), /nomDeModeleAcceptable\(name\)/,
      'la suppression ne passe pas par la garde de nom');
  });

  test('un fichier déjà absent n\'est pas une erreur', () => {
    // Le résultat voulu est atteint. Rapporter un échec ferait afficher un message d'erreur pour
    // une suppression qui a, de fait, réussi.
    const bloc = MAIN.slice(MAIN.indexOf("'models:delete'"));
    assert.match(bloc.slice(0, 600), /ENOENT.*return \{ ok: true \}/s);
  });
});

/**
 * JOURNAL DE MUTATION : le câblage, quatre fautes de plus (les six du noyau restent valables).
 *
 *   Y1 le fichier supprimé AVANT que l'utilisateur ait répondu                  ROUGE
 *   Y2 le cache non vidé après suppression                                      ROUGE
 *   Y3 la liste jamais rafraîchie par renderAll                                 ROUGE
 *   Y4 un fichier déjà absent rapporté comme un échec                           ROUGE
 *
 * Y1 EST LA PLUS IMPORTANTE, et elle ne se serait jamais vue à l'usage : en déplaçant l'appel de
 * confirmation APRÈS la suppression, l'application demande poliment « êtes-vous sûr ? » à propos
 * d'un fichier qu'elle vient d'effacer. Répondre « non » ne le ramène pas. Le test compare les
 * positions des deux appels, faute de pouvoir observer un disque.
 *
 * Y2 est du même genre : sans vidage du cache, un modèle supprimé continuerait de s'afficher, la
 * suppression aurait l'air de n'avoir rien fait, jusqu'au prochain changement de Projet.
 */

// ─────────────────────────────────────────────────────────────────────────────
// La FORME des lignes affichées
//
// Signalé à l'usage : dans un panneau étroit, le nom de fichier et les endroits se partageaient une
// ligne (flex, `justify-content: space-between`) et se coupaient tous les deux au milieu, on ne
// pouvait lire ni le nom du fichier, ni celui de la Scène, et le texte débordait de la section.
//
// Ce qui suit observe le DOM réellement construit. Les assertions par lecture du source ne valent
// rien ici : elles seraient satisfaites par le commentaire qui les explique (c'est arrivé trois
// fois dans ce dépôt). Le stub DOM conserve désormais les enfants pour rendre cela possible.
// ─────────────────────────────────────────────────────────────────────────────

const { renderModelList } = await import('../src/project-tree.js');
const { setModelBridge } = await import('../src/model-store.js');
const { S } = await import('../src/state.js');

const CSS = readFileSync(join(RACINE, 'style.css'), 'utf8');

/** Rend la liste pour un disque et un Projet donnés, et rend les lignes construites. */
async function rendre(fichiers, projet){
  setModelBridge({ listModelFiles: async () => fichiers });
  S.tomes = projet.tomes || [];
  S.scenes = projet.scenes || [];
  await renderModelList();
  const list = document.getElementById('modelList');
  return list.children.filter(n => String(n.className || '').includes('model-row'));
}

describe('Affichage de la bibliothèque : le nom d\'abord, un endroit par ligne', () => {
  test('RÉGRESSION : deux Scènes font DEUX lignes, pas une liste concaténée', async () => {
    // Joints par « , », la coupe tombait au milieu du premier nom et les suivants disparaissaient
    // sans qu'aucun signe ne dise qu'il y en avait, l'utilisateur croyait à un seul usage.
    const [ligne] = await rendre(['salon.glb'], {
      scenes: [volume('Salon principal', el('salon.glb')), volume('Cuisine', el('salon.glb'))],
    });
    const textes = ligne.children.map(c => c.textContent);
    assert.equal(textes[0], 'salon.glb', 'le nom de fichier n\'est pas la première ligne');
    assert.deepEqual(textes.slice(1), ['Salon principal', 'Cuisine'],
      'les Scènes ne sont pas sur des lignes distinctes');
  });

  test('chaque ligne de texte est coupable, et porte son texte entier en `title`', async () => {
    // La coupe n'est acceptable QUE parce que le texte complet reste atteignable au survol. Une
    // ligne coupée sans `title` perdrait l'information, pas seulement son affichage.
    const [ligne] = await rendre(['un_nom_de_fichier_vraiment_tres_long.glb'], {
      scenes: [volume('Une Scène au nom lui aussi interminable',
        el('un_nom_de_fichier_vraiment_tres_long.glb'))],
    });
    assert.ok(ligne.children.length >= 2);
    ligne.children.forEach(c => {
      assert.match(String(c.className), /model-row-name|model-row-where/,
        `texte sans classe coupante : « ${c.textContent} »`);
      assert.equal(c.title, c.textContent, 'le texte entier n\'est pas accessible au survol');
    });
  });

  test('RÉGRESSION : les classes annoncées par le rendu existent VRAIMENT dans style.css', async () => {
    // Deux fois déjà, un élément déclaré n'avait rien en face (le panneau sans setupDropdown, le
    // panneau sans `open`). Une classe posée par le JS et absente du CSS est le même défaut : la
    // ligne s'affiche, ne coupe rien, et déborde.
    ['model-row', 'model-row-name', 'model-row-where'].forEach(c =>
      assert.match(CSS, new RegExp(`\\.${c}[\\s,{]`), `classe absente de style.css : .${c}`));
    const bloc = CSS.slice(CSS.indexOf('.model-row-name'));
    assert.match(bloc.slice(0, 300), /text-overflow:\s*ellipsis/,
      'les lignes ne sont pas coupées aux points de suspension');
    assert.match(bloc.slice(0, 300), /white-space:\s*nowrap/,
      'sans `nowrap`, le texte passe à la ligne au lieu d\'être coupé');
    assert.match(CSS.slice(CSS.indexOf('.model-row {'), CSS.indexOf('.model-row {') + 400),
      /overflow:\s*hidden/, 'la ligne ne contient pas son propre débordement');
  });

  test('RÉGRESSION : le premier titre de groupe est à la MÊME distance du bouton que le bouton du haut de la carte', () => {
    // Signalé à l'œil : la liste commençait plus bas que le bouton ne commence lui-même, et la
    // section paraissait décentrée. L'égalité tient à TROIS valeurs dans TROIS règles distinctes,
    // exactement la forme de désaccord silencieux qui a déjà mordu ici. On l'épingle donc par le
    // calcul plutôt que par un chiffre recopié.
    const valeur = (regle, prop) => {
      const bloc = CSS.slice(CSS.indexOf(regle));
      const m = bloc.slice(0, 400).match(new RegExp(`${prop}\\s*:\\s*([^;]+);`));
      assert.ok(m, `${prop} introuvable dans ${regle}`);
      return m[1].trim();
    };
    const px = (v) => parseFloat(v);
    const carte = px(valeur('.side-section{', 'padding').split(/\s+/)[0]);
    const panneau = px(valeur('.dropdown-panel{', 'padding').split(/\s+/)[0]);
    const titre = px(valeur('.side-group-title:first-child', 'margin-top'));
    assert.equal(panneau + titre, carte,
      `le premier titre est à ${panneau + titre}px du bouton, qui est lui à ${carte}px du haut de la carte`);
  });

  test('RÉGRESSION : le bas de la carte respire autant que le haut', () => {
    // Le dernier élément se retrouvait à 31px du bord alors que le bouton du haut n'est qu'à 14px :
    // trois marges basses empilées (la ligne, le panneau, le menu déroulant) qui ne séparent de
    // RIEN, puisqu'il n'y a plus rien après. Seuls les 14px de `.side-section` doivent décider.
    const bas = (regle, prop) => {
      const bloc = CSS.slice(CSS.indexOf(regle));
      const m = bloc.slice(0, 400).match(new RegExp(`${prop}\\s*:\\s*([^;]+);`));
      assert.ok(m, `${prop} introuvable dans ${regle}`);
      const parts = m[1].trim().split(/\s+/);
      // raccourci `padding` : 1 valeur → partout, 2 → haut/bas, 3+ → la 3e est le bas.
      return parseFloat(parts.length >= 3 ? parts[2] : parts[parts.length === 2 ? 0 : 0]);
    };
    const restant = bas('.dropdown:last-child{', 'margin-bottom')
      + bas('.dropdown-panel{ display:none;', 'padding')
      + bas('.dropdown-panel > *:last-child > *:last-child{', 'margin-bottom');
    assert.equal(restant, 0,
      `${restant}px de marge s'ajoutent sous le dernier élément et déséquilibrent la carte`);
  });

  test('un titre de groupe est plus près de SES lignes que du groupe précédent', () => {
    // Sinon le titre flotte entre deux blocs et n'annonce plus rien : c'est l'écart, et lui seul,
    // qui dit à quel groupe appartient une ligne.
    const bloc = CSS.slice(CSS.indexOf('.side-group-title {'));
    const m = bloc.slice(0, 300).match(/margin:\s*([\d.]+)px\s+[^\s]+\s+([\d.]+)px/);
    assert.ok(m, 'la marge du titre de groupe n\'est plus lisible');
    const [haut, bas] = [parseFloat(m[1]), parseFloat(m[2])];
    assert.ok(bas > 2, `l'écart sous le titre (${bas}px) est trop serré pour se lire`);
    assert.ok(haut > bas, `le titre est aussi loin de ses lignes (${bas}px) que du groupe précédent (${haut}px)`);
  });

  test('un modèle sans usage n\'affiche que son nom', async () => {
    const [ligne] = await rendre(['orphelin.glb'], {});
    assert.deepEqual(ligne.children.map(c => c.textContent), ['orphelin.glb']);
  });

  test('un modèle introuvable garde son avertissement, sur sa propre ligne', async () => {
    // Il vient APRÈS les endroits : d'abord ce que le fichier sert, ensuite pourquoi c'est cassé.
    const [ligne] = await rendre([], { tomes: [volume('Tome 1', el('disparu.glb'))] });
    const dernier = ligne.children[ligne.children.length - 1];
    assert.match(dernier.textContent, /introuvable|not found/);
    assert.match(String(dernier.className), /perso-name-sub-warn/, 'l\'avertissement n\'est pas coloré');
    assert.match(String(dernier.className), /model-row-where/, 'l\'avertissement n\'est pas coupé');
  });
});

/**
 * JOURNAL DE MUTATION : la forme des lignes.
 *
 *   Z1 les Scènes rejointes par « , » sur une seule ligne                        ROUGE
 *   Z2 `title` retiré des lignes                                                 ROUGE
 *   Z3 `text-overflow: ellipsis` retiré du CSS                                   ROUGE
 *   Z4 l'avertissement « introuvable » placé avant les endroits                  ROUGE
 *   Z5 la classe `model-row-where` retirée des endroits                          ROUGE
 *   Z6 `.model-row { display: block }` retiré                                    ÉCHAPPÉE, assumé
 *
 * Z6 EST ASSUMÉE, et mérite d'être dite plutôt que maquillée : on peut vérifier que les classes
 * existent et qu'elles coupent, pas que la disposition obtenue à l'écran est bien verticale, il
 * faudrait un moteur de rendu. Ce qui est gardé ici, c'est que le JS produit des lignes séparées et
 * coupables ; que le navigateur les empile relève de l'essai à l'œil.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Le clic GAUCHE : mener aux usages, ou ne rien promettre
//
// La décision elle-même est testée dans model-usages.test.mjs (resolveModelClick). Ce qui se garde
// ICI, c'est que la LIGNE affichée soit d'accord avec elle : une ligne qui invite au clic doit
// mener quelque part, et une ligne qui ne mène nulle part ne doit pas y inviter.
// ─────────────────────────────────────────────────────────────────────────────

const { setProjectTreeCallbacks: _setTreeCb } = await import('../src/project-tree.js');

describe('Bibliothèque : un clic gauche qui tient sa promesse', () => {
  let demandes;
  const rendreAvecClic = async (fichiers, projet) => {
    demandes = [];
    _setTreeCb({ openModelUsages: (nom) => demandes.push(nom), openModelContextMenu: () => {} });
    return rendre(fichiers, projet);
  };

  test('RÉGRESSION : chaque ligne demande SES usages, pas ceux d\'une autre', async () => {
    // Trois fichiers, et on interroge le DEUXIÈME. Avec un seul fichier, n'importe quelle
    // expression rendant « le fichier » passait, y compris `fichiers[0]`, qui aurait fait pointer
    // toutes les lignes vers la première. Les lignes sont construites en boucle : c'est exactement
    // l'endroit où une fermeture mal fermée fait tout désigner la même chose.
    const lignes = await rendreAvecClic(['a.glb', 'b.glb', 'c.glb'], {
      scenes: [volume('Salon', el('a.glb'), el('b.glb'), el('c.glb'))],
    });
    assert.equal(lignes.length, 3);
    lignes.forEach(l => assert.equal(typeof l.onclick, 'function', 'une ligne ne réagit pas au clic'));
    lignes[1].onclick();
    assert.deepEqual(demandes, ['b.glb'], 'le clic a demandé les usages d\'un autre fichier');
  });

  test('RÉGRESSION : un modèle inutilisé ne réagit pas, ET le montre avant le clic', () => {
    // Décision utilisateur : plutôt qu'une fenêtre disant « rien », la ligne est inerte, mais
    // l'inertie doit se LIRE. Un clic sans effet, sur une ligne qui ressemble à toutes les autres,
    // passe pour une panne.
    return rendreAvecClic(['orphelin.glb'], {}).then(([ligne]) => {
      assert.equal(ligne.onclick, undefined, 'une ligne inerte réagit quand même au clic');
      assert.match(String(ligne.className), /model-row-inert/,
        'rien ne distingue une ligne inerte d\'une ligne cliquable');
    });
  });

  test('RÉGRESSION : la classe inerte existe VRAIMENT dans style.css, et retire le curseur', () => {
    // Même piège que pour les classes coupantes : une classe posée par le JS et absente du CSS
    // laisse la ligne cliquable en apparence. `.tome-row` pose `cursor:pointer` pour tout le monde.
    const i = CSS.indexOf('.model-row-inert');
    assert.ok(i > 0, 'classe absente de style.css : .model-row-inert');
    assert.match(CSS.slice(i, i + 120), /cursor:\s*default/,
      'la ligne inerte garde le curseur main : elle promet un clic qui ne fera rien');
  });

  test('la modale des usages existe et n\'a qu\'une sortie neutre', () => {
    ['modelUsagesModal', 'modelUsagesList', 'modelUsagesClose']
      .forEach(id => assert.match(HTML, new RegExp(`id="${id}"`), `absent : ${id}`));
    // Aucun bouton de validation : chaque ligne EST l'action. Un « Confirmer » laisserait croire
    // qu'il faut sélectionner puis valider, alors qu'un seul clic suffit.
    const bloc = HTML.slice(HTML.indexOf('id="modelUsagesModal"'));
    const modale = bloc.slice(0, bloc.indexOf('id="confirmActionModal"'));
    assert.doesNotMatch(modale, /full-btn/, 'un bouton de validation brouille le geste');
  });
});

/**
 * JOURNAL DE MUTATION : le clic gauche.
 *
 *   T1 la ligne inutilisée reçoit quand même un onclick                          ROUGE
 *   T2 la classe .model-row-inert n'est plus posée                               ROUGE
 *   T3 `cursor: default` retiré du CSS                                           ROUGE
 *   T4 le clic demande les usages d'un AUTRE fichier                             ROUGE
 *
 * T4 A ÉCHAPPÉ D'ABORD, et pour la raison la plus banale : mon montage n'avait qu'UN seul fichier.
 * Remplacer `nom` par `fichiers[0]` ne changeait donc rien, les deux désignaient la même chose. Or
 * c'est précisément la faute que ce test doit attraper : les lignes sont construites en boucle, et
 * c'est l'endroit classique où toutes finissent par désigner la même. Montage porté à TROIS
 * fichiers, en interrogeant celui du MILIEU ; la mutation devient rouge.
 *
 * C'est la deuxième fois qu'un montage trop régulier laisse passer une mutation dans ce dépôt (cf.
 * hit-test.test.mjs, où aucune Bulle ne se chevauchait). La leçon se répète : un montage où toutes
 * les valeurs coïncident ne teste pas qu'on a choisi la bonne.
 */


// ─────────────────────────────────────────────────────────────────────────────
// Renommer un modèle
// ─────────────────────────────────────────────────────────────────────────────
describe('repointerModele3D : les Éléments suivent le fichier', () => {
  test('Cases ET Scènes, et rien d\'autre', () => {
    const suit = el('vieux.glb');
    const autre = el('autre.glb');
    const perso = { id: 'p1', type: 'perso', modelFile: 'vieux.glb' };   // pas un modèle importé
    const racines = { tomes: [volume('T', suit, autre)], scenes: [volume('S', el('vieux.glb'), perso)] };
    assert.equal(repointerModele3D(racines, 'vieux.glb', 'neuf.glb'), 2);
    assert.equal(suit.modelFile, 'neuf.glb');
    assert.equal(autre.modelFile, 'autre.glb', 'un autre fichier n\'est pas touché');
    assert.equal(perso.modelFile, 'vieux.glb', 'un Personnage n\'est pas un modèle importé');
  });

  test('MUTE les Éléments plutôt que de les recopier', () => {
    // L'identité des objets est partagée avec la sélection, les caches de rig et le panneau
    // latéral. Reconstruire les tableaux ferait perdre la sélection pour un changement de nom.
    const e = el('vieux.glb');
    const page = { objects: [e] };
    const racines = { tomes: [{ pages: [page] }] };
    repointerModele3D(racines, 'vieux.glb', 'neuf.glb');
    assert.equal(page.objects[0], e, 'l\'Élément a été remplacé au lieu d\'être modifié');
  });

  test('les cas qui ne font rien ne cassent rien', () => {
    assert.equal(repointerModele3D({}, 'a.glb', 'b.glb'), 0);
    assert.equal(repointerModele3D({ tomes: [volume('T', el('a.glb'))] }, 'a.glb', 'a.glb'), 0);
    assert.equal(repointerModele3D({ tomes: [volume('T', el('a.glb'))] }, '', 'b.glb'), 0);
  });
});

describe('repointerPileAnnulation3D : Ctrl+Z ne ressuscite pas un nom mort', () => {
  const etat = (fichier) => JSON.stringify({ tomes: [volume('T', el(fichier))], scenes: [] });

  test('RÉGRESSION : chaque état antérieur cite le nouveau nom', () => {
    // Sans cela, annuler une action ANTÉRIEURE au renommage restaure des Éléments pointant vers un
    // fichier qui n'existe plus : ils deviennent des boîtes de remplacement, sans un mot, pour une
    // opération sans rapport avec celle qu'on annulait.
    const pile = [etat('vieux.glb'), etat('vieux.glb')];
    const suivante = repointerPileAnnulation3D(pile, 'vieux.glb', 'neuf.glb');
    suivante.forEach(e => {
      assert.match(e, /neuf\.glb/);
      assert.doesNotMatch(e, /vieux\.glb/);
    });
  });

  test('une entrée illisible est gardée telle quelle, pas perdue', () => {
    // Une pile d'annulation amputée serait pire qu'une entrée périmée : elle ferait disparaître des
    // états valides qui n'ont rien à voir avec le modèle renommé.
    const pile = ['{ ceci n\'est pas du JSON', etat('vieux.glb')];
    const suivante = repointerPileAnnulation3D(pile, 'vieux.glb', 'neuf.glb');
    assert.equal(suivante.length, 2);
    assert.equal(suivante[0], pile[0]);
    assert.match(suivante[1], /neuf\.glb/);
  });

  test('pile absente ou renommage nul : une copie, jamais une exception', () => {
    assert.deepEqual(repointerPileAnnulation3D(null, 'a.glb', 'b.glb'), []);
    const pile = [etat('a.glb')];
    assert.deepEqual(repointerPileAnnulation3D(pile, 'a.glb', 'a.glb'), pile);
  });
});

describe('messageRenommageModele : ce qu\'il promet, et ce qu\'il ne promet pas', () => {
  test('il chiffre ce qui suivra, et nomme ce qui ne peut pas être vérifié', () => {
    const m = messageRenommageModele('a.glb', 'b.glb', 3, null);
    assert.match(m, /a\.glb/); assert.match(m, /b\.glb/);
    assert.match(m, /3 Element/, 'le décompte manque');
    assert.match(m, /Other projects/, 'la limite sur les autres Projets n\'est pas dite');
  });

  test('zéro usage : le message ne prétend pas qu\'il y en a', () => {
    assert.match(messageRenommageModele('a.glb', 'b.glb', 0, null), /No Element/);
  });

  test('il suit la langue', () => {
    const fr = messageRenommageModele('a.glb', 'b.glb', 2, (en, f) => f);
    assert.match(fr, /Renommer/); assert.match(fr, /autres Projets/);
  });
});

describe('renameModel : le pont, et le refus d\'écraser', () => {
  let appels;
  const pont = (existants) => {
    appels = [];
    setModelBridge({
      listModelFiles: async () => existants,
      renameModelFile: async (a, b) => { appels.push([a, b]); return { ok: true, name: b }; },
    });
  };

  test('le nom tapé est assaini, comme à l\'import', () => {
    pont(['vieux.glb']);
    return renameModel('vieux.glb', '  ../ailleurs/mon modèle  ').then(r => {
      assert.equal(r.ok, true);
      assert.deepEqual(appels, [['vieux.glb', 'mon modèle.glb']],
        'le chemin doit être retiré et l\'extension réimposée');
    });
  });

  test('RÉGRESSION : un homonyme fait ÉCHOUER le renommage, sans suffixe inventé', () => {
    // `resolveModelName` transformerait « chaise » en « chaise (2) ». Acceptable pour un import,
    // où l'utilisateur demande « range ce fichier » ; inacceptable ici, où il demande « appelle-le
    // comme ça ». Recevoir un autre nom que celui qu'on a écrit répond à une question non posée.
    pont(['vieux.glb', 'chaise.glb']);
    return renameModel('vieux.glb', 'chaise').then(r => {
      assert.equal(r.ok, false);
      assert.equal(r.collision, true);
      assert.deepEqual(appels, [], 'le pont a été appelé malgré la collision');
    });
  });

  test('la collision ignore la casse : Windows ne distingue pas deux noms', () => {
    pont(['vieux.glb', 'Chaise.glb']);
    return renameModel('vieux.glb', 'chaise').then(r => assert.equal(r.ok, false));
  });

  test('changer la CASSE de son propre nom reste permis', () => {
    // Le seul cas où le nom voulu figure déjà dans la liste sans être un conflit : c'est le fichier
    // lui-même. L'interdire empêcherait « chaise.glb » → « Chaise.glb ».
    pont(['chaise.glb']);
    return renameModel('chaise.glb', 'Chaise').then(r => {
      assert.equal(r.ok, true);
      assert.deepEqual(appels, [['chaise.glb', 'Chaise.glb']]);
    });
  });

  test('même nom exactement : rien n\'est demandé au disque', () => {
    pont(['chaise.glb']);
    return renameModel('chaise.glb', 'chaise').then(r => {
      assert.equal(r.ok, true);
      assert.equal(r.inchangé, true);
      assert.deepEqual(appels, []);
    });
  });

  test('sans pont : un échec explicite, jamais un silence', () => {
    setModelBridge(null);
    return renameModel('a.glb', 'b').then(r => {
      assert.equal(r.ok, false);
      assert.ok(r.error);
    });
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// Le journal des renommages
// ─────────────────────────────────────────────────────────────────────────────
describe('resoudreRenommage3D : suivre la chaîne jusqu\'au nom actuel', () => {
  test('un renommage simple', () => {
    assert.equal(resoudreRenommage3D([{ de: 'a.glb', vers: 'b.glb' }], 'a.glb'), 'b.glb');
  });

  test('LES RENOMMAGES S\'ENCHAÎNENT : A vers B, puis B vers C', () => {
    // Un Projet qui cite A doit atterrir sur C. S'arrêter à B le ferait pointer vers un fichier qui
    // n'existe pas davantage que A.
    const journal = [{ de: 'a.glb', vers: 'b.glb' }, { de: 'b.glb', vers: 'c.glb' }];
    assert.equal(resoudreRenommage3D(journal, 'a.glb'), 'c.glb');
    assert.equal(resoudreRenommage3D(journal, 'b.glb'), 'c.glb');
  });

  test('RÉGRESSION : un cycle s\'arrête au dernier nom sain', () => {
    // Renommer A en B puis B en C puis C en A produit exactement ce journal.
    //
    // ⚠️ LE CYCLE À DEUX NE PROUVE RIEN, et c'est une mutation échappée qui l'a montré. Avec
    // `a→b, b→a`, la version SANS garde-fou rend elle aussi « b » : la borne de boucle l'arrête au
    // même endroit, par accident. Il faut trois maillons pour que les deux versions divergent,
    // « c » avec le garde-fou contre « b » sans lui.
    const journal = [
      { de: 'a.glb', vers: 'b.glb' }, { de: 'b.glb', vers: 'c.glb' }, { de: 'c.glb', vers: 'a.glb' },
    ];
    assert.equal(resoudreRenommage3D(journal, 'a.glb'), 'c.glb');
  });

  test('un nom inconnu du journal ressort tel quel', () => {
    assert.equal(resoudreRenommage3D([{ de: 'a.glb', vers: 'b.glb' }], 'z.glb'), 'z.glb');
    assert.equal(resoudreRenommage3D(null, 'z.glb'), 'z.glb');
  });
});

describe('ajouterRenommage3D : un journal qui ne grandit pas sans fin', () => {
  test('une entrée est ajoutée, sans muter le journal reçu', () => {
    const journal = [];
    const suivant = ajouterRenommage3D(journal, 'a.glb', 'b.glb');
    assert.deepEqual(suivant, [{ de: 'a.glb', vers: 'b.glb' }]);
    assert.deepEqual(journal, [], 'le journal d\'origine a été modifié');
  });

  test('RÉGRESSION : une seconde origine identique REMPLACE la première', () => {
    // Renommer A en B, réimporter un nouveau A, le renommer en C : deux chemins pour A
    // coexisteraient, et la résolution prendrait le plus ancien.
    const journal = ajouterRenommage3D([{ de: 'a.glb', vers: 'b.glb' }], 'a.glb', 'c.glb');
    assert.deepEqual(journal, [{ de: 'a.glb', vers: 'c.glb' }]);
  });

  test('au-delà du plafond, les plus anciennes sont oubliées', () => {
    let journal = [];
    for (let i = 0; i < MAX_RENOMMAGES_3D + 5; i++) journal = ajouterRenommage3D(journal, `a${i}.glb`, `b${i}.glb`);
    assert.equal(journal.length, MAX_RENOMMAGES_3D);
    assert.equal(journal[journal.length - 1].de, `a${MAX_RENOMMAGES_3D + 4}.glb`, 'la dernière doit être la plus récente');
    assert.ok(!journal.some(e => e.de === 'a0.glb'), 'la plus ancienne aurait dû être oubliée');
  });

  test('les entrées vides ou nulles sont écartées', () => {
    assert.deepEqual(ajouterRenommage3D(null, 'a.glb', 'a.glb'), []);
    assert.deepEqual(ajouterRenommage3D([{ de: 'x' }], 'a.glb', 'b.glb'), [{ de: 'a.glb', vers: 'b.glb' }]);
  });
});

describe('modelesARepointer3D : les trois conditions', () => {
  const projet = (...fichiers) => ({ tomes: [volume('T', ...fichiers.map(el))], scenes: [] });
  const journal = [{ de: 'vieux.glb', vers: 'neuf.glb' }];

  test('fichier absent + successeur présent : à repointer, avec le compte', () => {
    const r = modelesARepointer3D(projet('vieux.glb', 'vieux.glb'), journal, ['neuf.glb']);
    assert.deepEqual(r, [{ de: 'vieux.glb', vers: 'neuf.glb', usages: 2 }]);
  });

  test('RÉGRESSION : un homonyme réimporté n\'est PAS repointé', () => {
    // Renommer « vieux » en « neuf » puis réimporter un AUTRE modèle sous le nom « vieux » est
    // légitime. Le Projet qui cite « vieux » est alors correct : le repointer lui changerait son
    // décor sous prétexte de le réparer. C'est la condition qu'on oublierait.
    assert.deepEqual(modelesARepointer3D(projet('vieux.glb'), journal, ['vieux.glb', 'neuf.glb']), []);
  });

  test('successeur absent lui aussi : rien à proposer', () => {
    // Le fichier a été renommé puis supprimé. Proposer un repointage vers un fichier qui n'existe
    // pas remplacerait une boîte de remplacement par une autre.
    assert.deepEqual(modelesARepointer3D(projet('vieux.glb'), journal, []), []);
  });

  test('la comparaison ignore la casse, comme le système de fichiers', () => {
    assert.deepEqual(modelesARepointer3D(projet('vieux.glb'), journal, ['Neuf.GLB']),
      [{ de: 'vieux.glb', vers: 'neuf.glb', usages: 1 }]);
  });

  test('Scènes comprises, et un seul Personnage ne compte pas', () => {
    const racines = {
      tomes: [volume('T', el('vieux.glb'))],
      scenes: [volume('S', el('vieux.glb'), { id: 'p', type: 'perso', modelFile: 'vieux.glb' })],
    };
    assert.deepEqual(modelesARepointer3D(racines, journal, ['neuf.glb']),
      [{ de: 'vieux.glb', vers: 'neuf.glb', usages: 2 }]);
  });

  test('projet vide, journal vide : rien, et aucune exception', () => {
    assert.deepEqual(modelesARepointer3D({}, journal, ['neuf.glb']), []);
    assert.deepEqual(modelesARepointer3D(projet('vieux.glb'), [], ['neuf.glb']), []);
  });
});

describe('messageRepointageModeles : une phrase pour un, une liste pour plusieurs', () => {
  const une = [{ de: 'a.glb', vers: 'b.glb', usages: 8 }];
  const deux = [...une, { de: 'c.glb', vers: 'd.glb', usages: 6 }];

  test('un seul modèle : le nom, le nouveau nom, et le décompte', () => {
    const m = messageRepointageModeles(une, (en, fr) => fr);
    assert.match(m, /« a\.glb »/); assert.match(m, /« b\.glb »/);
    assert.match(m, /8 Élément/, 'le décompte distingue un détail d\'une demi-planche');
    assert.match(m, /depuis cet ordinateur/, 'la provenance de l\'information n\'est pas dite');
  });

  test('plusieurs : une ligne par modèle, séparées par des retours à la ligne', () => {
    const m = messageRepointageModeles(deux, (en, fr) => fr);
    assert.match(m, /a\.glb → b\.glb \(8 Élément/);
    assert.match(m, /c\.glb → d\.glb \(6 Élément/);
    assert.ok(m.split('\n').length >= 5, 'la liste doit être sur plusieurs lignes');
  });

  test('il ne promet PAS que rien ne sera enregistré', () => {
    // Ce serait faux : la sauvegarde automatique écrirait la modification quelques secondes plus
    // tard. Ce qui est promis, et qui est vrai, c'est que le placement n'est jamais perdu.
    const m = messageRepointageModeles(une, (en, fr) => fr);
    assert.doesNotMatch(m, /tant que vous n'enregistrez pas/);
    assert.match(m, /conservées dans tous les cas/);
  });

  test('il suit la langue', () => {
    assert.match(messageRepointageModeles(une, (en) => en), /on this computer/);
  });
});
