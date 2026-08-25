/**
 * @file model-usages.js
 * « Où ce modèle est-il utilisé ? », et comment s'y rendre.
 *
 * La bibliothèque du menu de gauche répond déjà à « puis-je supprimer ce fichier ? » (cf.
 * model-library.js). Ce module répond à la question d'après, celle qu'on se pose une fois qu'on sait
 * qu'un fichier sert quelque part : OÙ, exactement, et surtout, comment y aller.
 *
 * DEUX MÉTIERS, SÉPARÉS EXPRÈS. `modelUsageLocations` est PURE : elle lit un Projet et rend une
 * liste. `goToModelUsage` MUTE l'état affiché. La première se teste sans DOM ni WebGL ; la seconde
 * ne fait presque rien d'autre que poser quatre champs, ce qui est exactement ce qu'il faut pouvoir
 * vérifier. Les mélanger aurait rendu la première invérifiable.
 *
 * POURQUOI PAS DANS model-library.js : ce fichier-là s'annonce pur, et le reste. Y ajouter une
 * fonction qui écrit dans `S` aurait démenti son en-tête, et un en-tête qui ment coûte plus cher
 * qu'un fichier de plus.
 *
 * LE GROUPEMENT EST HIÉRARCHIQUE, sur demande : un en-tête par contenant (une Scène, ou une Case),
 * et dessous un Élément par ligne. Un même fichier peut être posé plusieurs fois dans la MÊME Case ;
 * les aplatir donnerait des lignes quasi identiques qu'on ne saurait pas distinguer, et un seul
 * en-tête par Case sans détail ne permettrait de sélectionner qu'un des exemplaires, arbitrairement
 * le premier. La hiérarchie dit les deux choses : combien, et lequel.
 */

import { S } from './state.js';
import { isImportedModel } from './model-store.js';

// Injectés (cf. docs/en/architecture.md règle n°2) : events.js importe ce module, l'importer en retour
// fermerait un cycle. `disableSceneCameraMode` n'est pas un ornement, quitter l'éditeur de Scène
// sans l'appeler laisse le mode Caméra actif « en arrière-plan » (cf. scenes.js).
let _cb = {};
export function setModelUsagesCallbacks(callbacks){ _cb = callbacks || {}; }

/**
 * Tous les endroits où un fichier est utilisé dans un Projet. Fonction PURE.
 *
 * @param {string} fichier            le nom de fichier (`modelFile`)
 * @param {object} projet             { tomes, scenes }
 * @returns {Array<object>}           groupes, dans l'ordre du Projet
 *
 * Chaque groupe : { kind: 'scene'|'panel', elements: [{ id, name }], … } avec de quoi s'y rendre,
 * `sceneId` pour une Scène, `tomeIndex`/`pageIndex` pour une Case. Les étiquettes ne sont PAS
 * composées ici : elles demandent la langue, et une fonction qui rend du texte traduit ne se
 * compare plus qu'à elle-même (cf. usageLabel plus bas).
 */
export function modelUsageLocations(fichier, { tomes = [], scenes = [] } = {}){
  if (!fichier) return [];
  const groupes = [];

  (scenes || []).forEach(scene => {
    const elements = elementsUtilisant(scene, fichier);
    if (elements.length) {
      groupes.push({ kind: 'scene', sceneId: scene.id, sceneName: scene.name || '', elements });
    }
  });

  (tomes || []).forEach((tome, tomeIndex) => {
    (tome.pages || []).forEach((page, pageIndex) => {
      // Regroupés par Case, dans l'ordre où les Éléments apparaissent, donc par ordre de
      // création. Une Map préserve cet ordre d'insertion, une clé numérique l'aurait perdu.
      const parCase = new Map();
      (page.objects || []).forEach(o => {
        if (!isImportedModel(o) || o.modelFile !== fichier) return;
        // `homePanelId` peut désigner une Case supprimée depuis : on ne devine pas, on l'assume.
        // La clé `null` regroupe alors ces Éléments sous la Page seule, les taire les rendrait
        // introuvables, ce qui est précisément ce que cette liste doit empêcher.
        const panel = (page.objects || []).find(p => p.type === 'panel' && p.id === o.homePanelId);
        const cle = panel ? panel.id : null;
        if (!parCase.has(cle)) parCase.set(cle, { panel, elements: [] });
        parCase.get(cle).elements.push({ id: o.id, name: o.name || '' });
      });
      parCase.forEach(({ panel, elements }) => {
        groupes.push({
          kind: 'panel',
          tomeIndex, pageIndex,
          tomeName: tome.name || '',
          pageNumber: pageIndex + 1,
          panelId: panel ? panel.id : null,
          caseNumber: panel ? (panel.caseNumber || null) : null,
          elements,
        });
      });
    });
  });

  return groupes;
}

/** Les Éléments d'un volume (Scène) qui utilisent ce fichier. */
function elementsUtilisant(volume, fichier){
  const out = [];
  ((volume && volume.pages) || []).forEach(page => {
    (page.objects || []).forEach(o => {
      if (isImportedModel(o) && o.modelFile === fichier) out.push({ id: o.id, name: o.name || '' });
    });
  });
  return out;
}

/**
 * L'étiquette d'un contenant : « Salon » pour une Scène, « Tome 1 › Page 2 › Case 3 » pour une Case.
 *
 * PURE, et séparée du calcul : c'est ce qui permet de vérifier le texte sans monter un Projet, et
 * de vérifier le groupement sans dépendre de la langue.
 *
 * Une Case sans numéro (Élément dont la Case a disparu) s'arrête à la Page, on n'invente pas un
 * numéro, et l'absence dit quelque chose de vrai.
 */
export function usageLabel(groupe, traduire){
  const t = traduire || ((en) => en);
  if (!groupe) return '';
  if (groupe.kind === 'scene') return groupe.sceneName || t('(unnamed Scene)', '(Scène sans nom)');
  const morceaux = [
    groupe.tomeName || t(`Volume ${groupe.tomeIndex + 1}`, `Tome ${groupe.tomeIndex + 1}`),
    t(`Page ${groupe.pageNumber}`, `Page ${groupe.pageNumber}`),
  ];
  if (groupe.caseNumber) morceaux.push(t(`Panel ${groupe.caseNumber}`, `Case ${groupe.caseNumber}`));
  return morceaux.join(' › ');
}

/**
 * Les étiquettes des Éléments d'un groupe. Fonction PURE.
 *
 * LE RANG NE S'AJOUTE QUE S'IL DÉPARTAGE. Un rang systématique, « (1/2) », « (2/2) », est du bruit
 * dès que les Éléments portent des noms différents : le nom suffit alors à les distinguer, et le
 * rang ne fait que compter quelque chose qu'on ne demandait pas. Pire, il survit au renommage :
 * l'utilisateur baptise l'un des deux exemplaires, le doublon disparaît, et l'étiquette continue
 * d'annoncer un choix qui n'existe plus.
 *
 * Le rang est donc calculé PAR NOM, pas par groupe : seuls les Éléments dont le nom est partagé en
 * reçoivent un, et la numérotation porte sur ce sous-ensemble. Trois Éléments nommés « A », « A »
 * et « B » donnent « A (1/2) », « A (2/2) » et « B », car c'est bien parmi les deux « A » qu'il
 * faut choisir, pas parmi les trois.
 *
 * Le repli (« Modèle ») entre dans le compte : deux Éléments sans nom se ressemblent tout autant.
 */
export function usageElementLabels(groupe, traduire){
  const t = traduire || ((en) => en);
  const defaut = t('Model', 'Modèle');
  const noms = (((groupe && groupe.elements) || [])).map(e => (e && e.name) || defaut);
  const total = new Map();
  noms.forEach(n => total.set(n, (total.get(n) || 0) + 1));
  const vus = new Map();
  return noms.map(n => {
    if (total.get(n) < 2) return n;
    const rang = (vus.get(n) || 0) + 1;
    vus.set(n, rang);
    return `${n} (${rang}/${total.get(n)})`;
  });
}

/**
 * Le nombre total d'Éléments visés par une liste de groupes.
 *
 * Sert à décider du geste : un seul endroit, on y va tout de suite ; plusieurs, on demande lequel.
 * C'est un décompte d'ÉLÉMENTS et non de groupes, car c'est l'Élément qu'on finit par sélectionner :
 * deux exemplaires dans une même Case font bien deux destinations, et sauter directement à l'un
 * d'eux serait un choix arbitraire déguisé en évidence.
 */
export function countUsageTargets(groupes){
  return (groupes || []).reduce((n, g) => n + ((g && g.elements) || []).length, 0);
}

/** La première destination d'une liste de groupes, ou null. */
export function firstUsageTarget(groupes){
  const g = (groupes || []).find(x => x && x.elements && x.elements.length);
  return g ? targetFor(g, g.elements[0]) : null;
}

/** La destination correspondant à un Élément d'un groupe. */
export function targetFor(groupe, element){
  if (!groupe || !element) return null;
  return {
    kind: groupe.kind,
    sceneId: groupe.sceneId,
    tomeIndex: groupe.tomeIndex,
    pageIndex: groupe.pageIndex,
    elementId: element.id,
  };
}

/**
 * Ce que doit produire un clic gauche sur une ligne de la bibliothèque. Fonction PURE.
 *
 * C'est LA décision de cette fonctionnalité, et elle est ici plutôt que dans le câblage pour qu'elle
 * se teste : trois issues, `'rien' | 'aller' | 'choisir'`.
 *
 * Un usage unique mène DIRECTEMENT à destination (choix utilisateur) : une modale qui ne propose
 * qu'une ligne fait cliquer deux fois pour un choix qui n'existe pas. Le prix assumé de ce raccourci
 * est que le clic ne fait pas toujours la même chose, d'où l'importance que `'rien'` se voie AVANT
 * le clic, par le curseur, et pas seulement après.
 */
export function resolveModelClick(fichier, projet){
  const groupes = modelUsageLocations(fichier, projet);
  const count = countUsageTargets(groupes);
  if (count === 0) return { action: 'rien', groupes, count };
  if (count === 1) return { action: 'aller', cible: firstUsageTarget(groupes), groupes, count };
  return { action: 'choisir', groupes, count };
}

/**
 * Se rendre à une destination, et y sélectionner l'Élément.
 *
 * Rend `true` si l'on a bougé. La sélection est posée APRÈS `openScene`, qui sélectionne le canevas
 * de la Scène : dans l'autre ordre, l'ouverture écraserait la sélection demandée et l'utilisateur
 * arriverait au bon endroit sans que rien n'y soit désigné, un déplacement qui a l'air de n'avoir
 * rien fait.
 */
export function goToModelUsage(cible){
  if (!cible || !cible.elementId) return false;
  if (cible.kind === 'scene') {
    if (!cible.sceneId || !S.scenes.some(s => s.id === cible.sceneId)) return false;
    if (_cb.openScene) _cb.openScene(cible.sceneId);
    S.selectedId = cible.elementId;
  } else {
    const tome = S.tomes[cible.tomeIndex];
    if (!tome || !tome.pages || !tome.pages[cible.pageIndex]) return false;
    // Quitter l'éditeur de Scène AVANT d'effacer editingSceneId, sinon le mode Caméra de la Scène
    // reste actif en arrière-plan et se réveille à la prochaine ouverture (cf. scenes.js).
    if (S.editingSceneId && _cb.disableSceneCameraMode) _cb.disableSceneCameraMode();
    S.editingSceneId = null;
    S.currentTomeIndex = cible.tomeIndex;
    S.currentPageIndex = cible.pageIndex;
    S.selectedId = cible.elementId;
  }
  S.selectedRoomId = null;
  S.dragMode = null;
  if (_cb.renderAll) _cb.renderAll();
  return true;
}
