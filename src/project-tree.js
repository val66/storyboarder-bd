/**
 * @file project-tree.js
 * The LEFT menu: the Volume → Page tree and the list of Scenes.
 *
 * Extracted from events.js, where it sat under a banner reading « SIDEBAR. TREE ». Its
 * counterpart, sidebar.js, is the RIGHT-hand panel and nothing else: two different panels, on two
 * sides of the screen, had ended up sharing one word.
 *
 * What lives here: rendering both lists, and the operations they offer, create a Volume, a Page,
 * a Scene; duplicate; reorder by drag-and-drop; rename. What does NOT: what a Scene IS
 * (createScene / openScene, still in events.js) and the context menus these rows open. Both are
 * injected, see setProjectTreeCallbacks.
 */

import { FORMATS } from './constants.js';
import { S, addPageToVolume, createVolume, newId, tr } from './state.js';
import { listModels } from './model-store.js';
import { groupModelsByUsage, filtrerModeles } from './model-library.js';
import { modelUsageLocations, usageLabel } from './model-usages.js';
import { listImages } from './image-store.js';
import { groupImagesByUsage, imageUsageLabel } from './image-library.js';
import { getFormat, libelleTable3D } from './utils.js';
import { alertAction, confirmAction, openRenameEntityModal, prechargerEnCascade3D } from './io.js';
import { renderAll } from './draw.js';
import { memoriserTome, groupeReplie, memoriserGroupe } from './section-memory.js';

// Six upward dependencies, all of them things the left menu TRIGGERS rather than owns: what a
// Scene is (createScene / openScene / disableSceneCameraMode), the context menus its rows open,
// and the undo stack. Injected rather than imported, events.js imports this module, so importing
// back would close a cycle (cf. docs/en/architecture.md rule #2).
let _cb = {};
export function setProjectTreeCallbacks(callbacks) { _cb = callbacks; }
const createScene              = (...a) => _cb.createScene(...a);
const openScene                = (...a) => _cb.openScene(...a);
const disableSceneCameraMode   = (...a) => _cb.disableSceneCameraMode(...a);
const openPageContextMenu      = (...a) => _cb.openPageContextMenu(...a);
const openVolumeContextMenu    = (...a) => _cb.openVolumeContextMenu(...a);
const openSceneContextMenu     = (...a) => _cb.openSceneContextMenu(...a);
const snapshot                 = (...a) => _cb.snapshot(...a);

// ---------- SCENES (work in progress, on user request) ----------
// Each Scene is listed here; clicking on it switches to the dedicated editor (openScene).
// Renaming/deletion (context menu) and loading into a Panel will come in a future step.
export function renderSceneList(){
  const list = document.getElementById('sceneList');
  list.innerHTML = '';
  if (!S.scenes.length) {
    list.innerHTML = '<div class="empty-hint">Aucune Scène pour l\'instant.</div>';
    return;
  }
  // Displayed in alphabetical order (not creation order), on user request. We sort a copy:
  // `S.scenes` itself must keep its original order (referenced elsewhere by id, not position).
  const sorted = S.scenes.slice().sort((a, b) => (a.name || '').localeCompare(b.name || '', 'fr', { sensitivity: 'base' }));
  sorted.forEach((s) => {
    const row = document.createElement('div');
    row.className = 'tome-row' + (S.editingSceneId === s.id ? ' active' : '');
    row.innerHTML = `<span>${s.name}</span>`;
    row.onclick = () => {
      openScene(s.id);
    };
    row.oncontextmenu = (e) => {
      e.preventDefault(); e.stopPropagation();
      openSceneContextMenu(e, s.id);
    };
    list.appendChild(row);
  });
}
// Was a bare top-level call. Kept, but note WHY it is safe where wirePersonaEditor was not:
// this only reads S.scenes and writes the DOM, it calls nothing injected. Any future
// top-level statement here that DOES would run before setProjectTreeCallbacks, since an
// imported module is evaluated before its importer.
renderSceneList();
document.getElementById('addSceneBtn').onclick = () => {
  snapshot();
  const s = createScene();
  openScene(s.id);
};

// ---------- TREE (S.tomes / pages) ----------
// Drag-and-drop to reorder the Pages of a Volume (on user request: a Page can't be renamed, but
// its order can be changed by dragging it, which changes its displayed number since that's just
// its position, cf. `Page ${pi + 1}` below, already recomputed dynamically, so nothing to do on
// that side). Limited to drag-and-drop BETWEEN Pages of the same Volume (moving a Page from one
// Volume to another wasn't requested).
// [STATE→S] let S.draggedPage = null;

// ════════════════════════════════════════════════════════════
// SIDEBAR : TREE
// ════════════════════════════════════════════════════════════
/**
 * Aller à une Planche : la rendre courante et l'afficher.
 *
 * Extraite du clic sur une ligne du menu parce qu'un SECOND appelant est arrivé, le raccourci
 * Ctrl+[ / Ctrl+]. Recopier ces six affectations là-bas aurait fait deux définitions de « changer de
 * Planche », et la première à être oubliée aurait été `editingSceneId`, qui laisse l'application
 * afficher une Scène tout en croyant être sur une Planche.
 *
 * `pageSelected` ouvre le menu « Planche » à droite (liste des Cases), sur demande utilisateur :
 * choisir une Planche, c'est aussi la sélectionner.
 */
export function allerALaPlanche(ti, pi){
  disableSceneCameraMode();
  S.currentTomeIndex = ti; S.currentPageIndex = pi; S.editingSceneId = null;
  S.selectedId = null; S.selectedRoomId = null;
  S.pageSelected = true;
  // ⚠️ ON REMET EN TÊTE CE QU'ON REGARDE MAINTENANT (#406b). Le préchargement en cascade sert les
  // vagues dans l'ordre : sans cette ligne, arriver sur une Planche d'un autre Tome ferait attendre
  // derrière la vague en cours, c'est-à-dire derrière des fichiers dont cette Planche n'a que faire.
  // C'est le coût que la cascade CRÉE, et c'est ici qu'il se paie.
  //
  // L'appel est idempotent : ce qui est déjà chargé ou en cours est ignoré. Changer de Planche ne
  // recharge donc rien, il ne fait que réordonner ce qui reste.
  prechargerEnCascade3D();
  renderAll();
}

export function renderTree(){
  const list = document.getElementById('volumeList');
  list.innerHTML = '';
  // Displayed in alphabetical order (not creation order), on user request, same as for Scenes. We
  // sort a COPY: the `S.tomes` array itself keeps its original order, since `ti` (the real index in
  // `S.tomes`) is still used everywhere else (openVolumeContextMenu, S.ctxVolumeTarget,
  // S.currentTomeIndex...); so we recover this real ti via indexOf rather than via the position in
  // the sorted copy.
  const sortedVolumes = S.tomes.slice().sort((a, b) => (a.name || '').localeCompare(b.name || '', 'fr', { sensitivity: 'base' }));
  sortedVolumes.forEach((t) => {
    const ti = S.tomes.indexOf(t);
    const row = document.createElement('div');
    row.className = 'tome-row' + (ti === S.currentTomeIndex && !S.editingSceneId ? ' active' : '');
    const expanded = S.expandedVolumes.has(t.id);
    row.innerHTML = `<span>${t.name} <small style="color:var(--sepia)">— ${libelleTable3D(getFormat(t.format), tr).split(' (')[0]}</small></span><span class="caret">${expanded ? '▾' : '▸'}</span>`;
    row.onclick = () => {
      if (S.expandedVolumes.has(t.id)) S.expandedVolumes.delete(t.id); else S.expandedVolumes.add(t.id);
      // #441 : l'état du Tome survit à la fermeture de l'application.
      memoriserTome(globalThis.localStorage, t.id, S.expandedVolumes.has(t.id));
      renderTree();
    };
    row.oncontextmenu = (e) => {
      e.preventDefault(); e.stopPropagation();
      openVolumeContextMenu(e, ti);
    };
    list.appendChild(row);

    if (expanded) {
      const isCurrentVolume = ti === S.currentTomeIndex && !S.editingSceneId;
      const formatWrap = document.createElement('div');
      formatWrap.className = 'tome-format' + (isCurrentVolume ? ' active' : '');
      const formatLabel = document.createElement('label');
      formatLabel.textContent = 'Format du tome';
      const formatSelect = document.createElement('select');
      FORMATS.forEach(f => {
        const opt = document.createElement('option');
        opt.value = f.key; opt.textContent = libelleTable3D(f, tr);
        formatSelect.appendChild(opt);
      });
      formatSelect.value = t.format;
      formatSelect.onclick = (e) => e.stopPropagation();
      formatSelect.onchange = (e) => {
        snapshot();
        const f = getFormat(e.target.value);
        t.format = f.key; t.w = f.w; t.h = f.h; t.scale = f.scale;
        renderAll();
      };
      formatWrap.appendChild(formatLabel);
      formatWrap.appendChild(formatSelect);
      list.appendChild(formatWrap);

      const pagesWrap = document.createElement('div');
      pagesWrap.className = 'tome-pages' + (isCurrentVolume ? ' active' : '');

      const pagesLabel = document.createElement('label');
      pagesLabel.textContent = 'Planches';
      pagesWrap.appendChild(pagesLabel);

      const addBtn = document.createElement('button');
      addBtn.className = 'add-page-btn';
      addBtn.textContent = tr('Add a page', 'Ajouter une planche');
      addBtn.onclick = (e) => {
        e.stopPropagation();
        snapshot();
        addPageToVolume(t);
        S.currentTomeIndex = ti;
        S.currentPageIndex = t.pages.length - 1;
        disableSceneCameraMode();
        S.editingSceneId = null;
        S.selectedId = null; S.selectedRoomId = null;
        S.pageSelected = true;
        renderAll();
      };
      pagesWrap.appendChild(addBtn);

      t.pages.forEach((p, pi) => {
        const pdiv = document.createElement('div');
        pdiv.className = 'page-row' + (ti === S.currentTomeIndex && pi === S.currentPageIndex && !S.editingSceneId ? ' active' : '');
        pdiv.textContent = `${tr('Page', 'Planche')} ${pi + 1}`;
        pdiv.onclick = (e) => {
          e.stopPropagation();
          allerALaPlanche(ti, pi);
        };
        pdiv.oncontextmenu = (e) => {
          e.preventDefault(); e.stopPropagation();
          openPageContextMenu(e, ti, pi);
        };
        pdiv.draggable = true;
        pdiv.addEventListener('dragstart', (e) => {
          S.draggedPage = { volumeId: t.id, pageId: p.id };
          e.dataTransfer.effectAllowed = 'move';
        });
        pdiv.addEventListener('dragover', (e) => {
          if (!S.draggedPage || S.draggedPage.volumeId !== t.id) return;
          e.preventDefault();
          // We visualize the GAP where the Page will be inserted (above or below the hovered Page
          // depending on which half of its height the cursor is over), not the hovered Page itself,
          // on user request, more readable.
          const rect = pdiv.getBoundingClientRect();
          const before = (e.clientY - rect.top) < rect.height / 2;
          pdiv.classList.toggle('drag-over-top', before);
          pdiv.classList.toggle('drag-over-bottom', !before);
        });
        pdiv.addEventListener('dragleave', () => pdiv.classList.remove('drag-over-top', 'drag-over-bottom'));
        pdiv.addEventListener('dragend', () => { S.draggedPage = null; });
        pdiv.addEventListener('drop', (e) => {
          e.preventDefault(); e.stopPropagation();
          const rect = pdiv.getBoundingClientRect();
          const before = (e.clientY - rect.top) < rect.height / 2;
          pdiv.classList.remove('drag-over-top', 'drag-over-bottom');
          if (!S.draggedPage || S.draggedPage.volumeId !== t.id) { S.draggedPage = null; return; }
          const fromIdx = t.pages.findIndex(pg => pg.id === S.draggedPage.pageId);
          const toIdx = t.pages.findIndex(pg => pg.id === p.id);
          S.draggedPage = null;
          if (fromIdx === -1 || toIdx === -1) return;
          let insertIdx = toIdx + (before ? 0 : 1);
          if (fromIdx < insertIdx) insertIdx -= 1; // compensate for the shift caused by removing the moved Page
          if (insertIdx === fromIdx) return; // dropped in the gap adjacent to its own position: no change
          snapshot();
          // S.currentPageIndex is positional: we remember the currently displayed Page BY id before
          // the move, to reselect its new position rather than its old index.
          const wasCurrentPageId = (S.currentTomeIndex === ti && !S.editingSceneId && t.pages[S.currentPageIndex]) ? t.pages[S.currentPageIndex].id : null;
          const [moved] = t.pages.splice(fromIdx, 1);
          t.pages.splice(insertIdx, 0, moved);
          if (wasCurrentPageId) S.currentPageIndex = t.pages.findIndex(pg => pg.id === wasCurrentPageId);
          renderAll();
        });
        pagesWrap.appendChild(pdiv);
      });
      list.appendChild(pagesWrap);
    }
  });
}

document.getElementById('addVolumeBtn').onclick = () => {
  snapshot();
  const t = createVolume('fb');
  addPageToVolume(t);
  S.currentTomeIndex = S.tomes.length - 1;
  S.currentPageIndex = 0;
  disableSceneCameraMode();
  S.editingSceneId = null;
  S.expandedVolumes.add(t.id);
  memoriserTome(globalThis.localStorage, t.id, true);
  S.selectedId = null; S.selectedRoomId = null;
  renderAll();
};

export async function deleteVolume(ti){
  if (S.tomes.length <= 1) { await alertAction(tr('There must be at least one volume.', 'Il doit rester au moins un tome.')); return; }
  if (!await confirmAction(tr(`Delete "${S.tomes[ti].name}" and all its pages?`, `Supprimer "${S.tomes[ti].name}" et toutes ses planches ?`))) return;
  snapshot();
  S.tomes.splice(ti, 1);
  S.currentTomeIndex = Math.min(S.currentTomeIndex, S.tomes.length - 1);
  S.currentPageIndex = 0;
  S.selectedId = null; S.selectedRoomId = null;
  renderAll();
}

export async function deletePage(ti, pi){
  const t = S.tomes[ti];
  if (t.pages.length <= 1) { await alertAction(tr('There must be at least one page in this volume. Delete the entire volume if needed.', 'Il doit rester au moins une planche dans ce tome. Supprimez le tome entier si besoin.')); return; }
  if (!await confirmAction(tr('Delete this page?', 'Supprimer cette planche ?'))) return;
  snapshot();
  t.pages.splice(pi, 1);
  if (S.currentTomeIndex === ti) S.currentPageIndex = Math.min(S.currentPageIndex, t.pages.length - 1);
  S.selectedId = null; S.selectedRoomId = null;
  renderAll();
}

// Duplicates Page (ti, pi): deep-clone + full remapping of all internal IDs to avoid conflicts
// with the original Page (Panel, Bubble, Room, Wall IDs, etc.). IDs are replaced via JSON string
// substitution ("oldId" → "newId") rather than walking each named field, more robust against
// cross-reference fields (altPieceId, camOrbitTargetId…) without having to list every property.
// Automatically navigates to the copy after insertion.
export function duplicatePage(ti, pi){
  const t = S.tomes[ti];
  const origPage = t.pages[pi];
  // Serialize for cloning + ID extraction
  let cloneStr = JSON.stringify(origPage);
  // Collect all object IDs present in the page (including page.id)
  const seenIds = new Set();
  function _collectIds(obj){
    if (!obj || typeof obj !== 'object') return;
    if (typeof obj.id === 'string' && obj.id) seenIds.add(obj.id);
    for (const v of Object.values(obj)){
      if (Array.isArray(v)) v.forEach(_collectIds);
      else if (v && typeof v === 'object') _collectIds(v);
    }
  }
  _collectIds(origPage);
  // Generate new IDs and replace them in the JSON (wrapped in quotes so we only match exact
  // values, not accidental substrings).
  seenIds.forEach(oldId => {
    const prefix = oldId.match(/^[a-z]+/)?.[0] || 'o';
    const fresh = newId(prefix);
    cloneStr = cloneStr.split('"' + oldId + '"').join('"' + fresh + '"');
  });
  const clonedPage = JSON.parse(cloneStr);
  snapshot();
  t.pages.splice(pi + 1, 0, clonedPage);
  // Navigate to the copy, adjusting S.currentPageIndex since we're in the same Volume
  S.currentTomeIndex = ti;
  S.currentPageIndex = pi + 1;
  S.selectedId = null; S.selectedRoomId = null;
  renderAll();
}

// Renames a Volume (on user request, so Volumes follow the same logic as Scenes: default name
// "Volume N" freely editable afterward). window.prompt() isn't reliable in Electron (and doesn't
// allow live validation), instead we open the dedicated renameEntityModal (cf. below), which
// applies the rename via applyRenameVolume/applyRenameScene.
export function renameVolume(ti){
  const t = S.tomes[ti];
  if (!t) return;
  openRenameEntityModal('tome', ti, t.name);
  // renameEntityModal's title is refreshed inside openRenameEntityModal itself (cf. below).
}
export function applyRenameVolume(ti, newName){
  const t = S.tomes[ti];
  if (!t) return;
  snapshot();
  t.name = newName;
  renderAll();
}

export function renameScene(id){
  const s = S.scenes.find(sc => sc.id === id);
  if (!s) return;
  openRenameEntityModal('scene', id, s.name);
}
export function applyRenameScene(id, newName){
  const s = S.scenes.find(sc => sc.id === id);
  if (!s) return;
  snapshot();
  s.name = newName;
  renderAll();
}

export async function deleteScene(id){
  const s = S.scenes.find(sc => sc.id === id);
  if (!s) return;
  if (!await confirmAction(tr(`Delete the Scene "${s.name}"? Panels that already loaded it will not be affected.`, `Supprimer la Scène "${s.name}" ? Les Cases l'ayant déjà chargée ne seront pas affectées.`))) return;
  snapshot();
  S.scenes = S.scenes.filter(sc => sc.id !== id);
  if (S.editingSceneId === id) S.editingSceneId = null;
  renderAll();
}
/**
 * La bibliothèque de modèles 3D importés, dans le menu de gauche.
 *
 * Elle montre le DISQUE, pas le Projet, les Scènes et les Éléments ont déjà leurs propres listes.
 * Le groupement par usage est DÉDUIT à chaque affichage (cf. model-library.js) : rien n'est
 * mémorisé, donc rien ne peut diverger de la réalité.
 *
 * Asynchrone parce que la liste des fichiers vient du disque. L'appelant n'attend pas : la liste se
 * remplit quand elle arrive, comme le reste de ce qui touche aux modèles.
 */
export async function renderModelList(){
  const list = document.getElementById('modelList');
  if (!list) return;
  const fichiers = await listModels();
  const tous = groupModelsByUsage(fichiers, { tomes: S.tomes, scenes: S.scenes });
  list.innerHTML = '';

  // La barre de recherche : cachée tant qu'il n'y a rien à chercher. Le texte tapé n'est PAS
  // mémorisé : une liste rouverte filtrée sans qu'on s'en souvienne ferait croire à des modèles
  // perdus.
  const filtre = document.getElementById('modelFiltre');
  const total = tous.parScenes.length + tous.dansCases.length + tous.nonUtilises.length;
  if (filtre) {
    filtre.hidden = !total;
    filtre.placeholder = tr('Filter models…', 'Filtrer les modèles…');
    if (!filtre._cable) {
      filtre._cable = true;
      filtre.addEventListener('input', () => renderModelList());
    }
  }
  if (!total) {
    list.innerHTML = `<div class="empty-hint">${tr('No model imported.', 'Aucun modèle importé.')}</div>`;
    return;
  }
  const texte = filtre ? filtre.value : '';
  const g = filtrerModeles(tous, texte);
  const filtrage = !!String(texte || '').trim();
  if (filtrage && !(g.parScenes.length + g.dansCases.length + g.nonUtilises.length)) {
    list.innerHTML = `<div class="empty-hint">${tr('No model matches this filter.', 'Aucun modèle ne correspond à ce filtre.')}</div>`;
    return;
  }

  /**
   * Une ligne de la bibliothèque : le nom de fichier, puis UN endroit PAR LIGNE.
   *
   * La disposition est verticale, et ce n'est pas cosmétique. En flex horizontal (le défaut de
   * `.tome-row`), le nom et les endroits se partagent la largeur : deux noms longs se coupaient
   * tous les deux au milieu, et le panneau étant étroit, on ne pouvait plus lire ni l'un ni
   * l'autre. Empilés, chaque texte dispose de toute la largeur ; ce qui dépasse est coupé par
   * `.model-row-*` (une seule ligne, points de suspension) plutôt que de déborder du panneau.
   *
   * Le texte complet reste accessible en `title`, c'est ce qui rend la coupe acceptable : on perd
   * l'affichage, pas l'information.
   *
   * MÊME FORME QUE LA SECTION IMAGES (demandé) : chaque endroit, Scène ou Case, est un bouton qui y
   * mène, et le nom du fichier n'est qu'un titre. Un endroit qui porte plusieurs Éléments du fichier
   * le dit (« ×2 ») et demande lequel au clic (cf. `resolvePlaceClick`). Au-delà de
   * `ENDROITS_VISIBLES`, un bouton « + N autres » déplie le reste : un décor utilisé dans trente Cases
   * ne doit pas noyer la liste.
   *
   * @param {string} nom        le nom de fichier
   * @param {object[]} endroits  les groupes de `modelUsageLocations`, une Scène ou une Case chacun
   */
  const ligne = (nom, endroits = [], groupe = '') => {
    const row = document.createElement('div');
    row.className = 'tome-row model-row' + (endroits.length ? '' : ' model-row-inert');
    const n = document.createElement('div');
    n.className = 'model-row-name';
    n.textContent = nom;
    n.title = nom;
    row.appendChild(n);
    const bouton = (endroit) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'image-row-where';
      const combien = endroit.elements.length;
      b.textContent = usageLabel(endroit, tr) + (combien > 1 ? ` ×${combien}` : '');
      b.title = b.textContent;
      b.onclick = (e) => {
        if (e) e.stopPropagation();
        _cb.openModelPlace(nom, endroit);
      };
      return b;
    };
    ajouterEndroits(row, `modeles:${groupe}:${nom}`, endroits, bouton, renderModelList);
    // Un modèle introuvable se signale ICI aussi : c'est la liste où l'on vient chercher pourquoi
    // une boîte orangée est apparue dans une Case.
    if (!fichiers.includes(nom)) {
      const d = document.createElement('div');
      d.className = 'perso-name-sub perso-name-sub-warn model-row-where';
      d.textContent = tr('⚠ file not found', '⚠ fichier introuvable');
      row.appendChild(d);
    }
    row.oncontextmenu = (e) => {
      e.preventDefault(); e.stopPropagation();
      _cb.openModelContextMenu(e, nom);
    };
    return row;
  };

  // Un endroit par ligne, jamais concaténés : c'est la seule forme où l'on peut lire le nom d'une
  // Scène jusqu'au bout. Chaque groupe ne montre que les endroits de SA nature : un fichier utilisé
  // des deux façons apparaît dans les deux, avec ses Scènes dans l'un et ses Cases dans l'autre.
  const projet = { tomes: S.tomes, scenes: S.scenes };
  const endroits = (nom, kind) => modelUsageLocations(nom, projet).filter(e => e.kind === kind);
  groupeRepliable(list, 'modeles:parScenes', tr('Used by Scenes', 'Utilisés par des Scènes'),
    g.parScenes.map(e => ligne(e.nom, endroits(e.nom, 'scene'), 'parScenes')));
  groupeRepliable(list, 'modeles:dansCases', tr('Used in Panels', 'Utilisés dans des Cases'),
    g.dansCases.map(e => ligne(e.nom, endroits(e.nom, 'panel'), 'dansCases')));
  groupeRepliable(list, 'modeles:nonUtilises', tr('Unused', 'Non utilisés'), g.nonUtilises.map(n => ligne(n, [])));
}

/** Au-delà, les endroits d'un fichier se replient derrière « + N autre(s) ». */
const ENDROITS_VISIBLES = 3;

/**
 * Les lignes dont l'utilisateur a déplié tous les endroits, par clé `modeles|images:{groupe}:{fichier}`.
 *
 * ⚠️ TENU HORS DU RENDU, et c'est tout l'objet : cliquer un endroit déplace l'écran, ce qui refait
 * la liste (renderAll). Gardé dans la ligne elle-même, le dépliage se perdait à chaque clic, alors
 * que ce n'est pas l'utilisateur qui avait choisi de replier (signalé à l'usage). Le temps de la
 * session seulement : rouvrir l'application repart de la forme courte.
 */
const endroitsDeplies = new Set();

/**
 * Ajoute à `row` les boutons d'endroits : les `ENDROITS_VISIBLES` premiers, puis « + N autre(s) »
 * qui déplie le reste, ou « Réduire » qui le replie. Partagé par les sections Modèles et Images.
 * `refaire` redessine la liste : le choix est retenu dans `endroitsDeplies`, puis relu au rendu.
 */
function ajouterEndroits(row, cle, endroits, bouton, refaire){
  const deplie = endroitsDeplies.has(cle);
  (deplie ? endroits : endroits.slice(0, ENDROITS_VISIBLES)).forEach(e => row.appendChild(bouton(e)));
  const reste = endroits.length - ENDROITS_VISIBLES;
  if (reste <= 0) return;
  const bascule = document.createElement('button');
  bascule.type = 'button';
  bascule.className = 'model-row-plus';
  bascule.textContent = deplie ? tr('Show less', 'Réduire') : tr(`+ ${reste} more`, `+ ${reste} autre(s)`);
  bascule.onclick = (e) => {
    if (e) e.stopPropagation();
    if (deplie) endroitsDeplies.delete(cle); else endroitsDeplies.add(cle);
    return refaire();
  };
  row.appendChild(bascule);
}

/**
 * Une sous-section repliable des sections Modèles et Images (demandé : elles se remplissent vite).
 * Le titre porte le nombre de fichiers, pour savoir ce qu'on a replié. L'état est mémorisé comme les
 * groupes Pièce et Bâtiment (section-memory.js), sous la clé donnée (`modeles:…`, `images:…`).
 *
 * PENDANT UN FILTRAGE, les sous-sections gardent leur état et restent repliables (demandé) : le
 * nombre du titre dit combien de résultats un groupe replié contient.
 */
function groupeRepliable(list, cle, titre, lignes){
  if (!lignes.length) return;
  const replie = groupeReplie(globalThis.localStorage, cle);
  const t = document.createElement('div');
  t.className = 'side-group-title model-group-title';
  const caret = document.createElement('span');
  caret.className = 'model-group-caret';
  caret.textContent = replie ? '▸' : '▾';
  const nom = document.createElement('span');
  nom.className = 'model-group-nom';
  nom.textContent = titre;
  const nombre = document.createElement('span');
  nombre.className = 'model-group-nombre';
  nombre.textContent = String(lignes.length);
  t.appendChild(caret);
  t.appendChild(nom);
  t.appendChild(nombre);
  const contenu = document.createElement('div');
  contenu.className = 'model-group';
  contenu.hidden = replie;
  lignes.forEach(l => contenu.appendChild(l));
  t.onclick = () => {
    const r = !groupeReplie(globalThis.localStorage, cle);
    memoriserGroupe(globalThis.localStorage, cle, r);
    contenu.hidden = r;
    caret.textContent = r ? '▸' : '▾';
  };
  list.appendChild(t);
  list.appendChild(contenu);
}

/**
 * La bibliothèque d'images de Case, dans le menu de gauche. Jumelle de `renderModelList`.
 *
 * DEUX DIFFÉRENCES AVEC SA JUMELLE, et toutes deux viennent de la même propriété : une Case porte
 * AU PLUS UNE image.
 *
 * 1. Deux groupes au lieu de trois, une image ne pouvant pas vivre dans une Scène (cf. l'en-tête
 *    de image-library.js).
 * 2. Un endroit EST une destination : jamais de modale. Chez les modèles, une même Case peut porter
 *    plusieurs Éléments du fichier (« ×2 »), et le clic demande alors lequel. Dans les deux listes,
 *    ce sont les endroits qui sont cliquables, et le nom de fichier reste un titre.
 */
export async function renderImageList(){
  const list = document.getElementById('imageList');
  if (!list) return;
  const fichiers = await listImages();
  const g = groupImagesByUsage(fichiers, { tomes: S.tomes });
  list.innerHTML = '';

  if (!g.dansCases.length && !g.nonUtilisees.length) {
    list.innerHTML = `<div class="empty-hint">${tr('No image imported.', 'Aucune image importée.')}</div>`;
    return;
  }

  const ligne = (nom, endroits = []) => {
    const row = document.createElement('div');
    // `model-row-inert` sur une ligne sans endroit : le curseur dit AVANT le clic qu'il n'y a nulle
    // part où aller. Les classes sont celles des modèles, la mise en page étant la même ; le CSS
    // les cite côte à côte plutôt que de dupliquer les règles.
    row.className = 'tome-row model-row' + (endroits.length ? '' : ' model-row-inert');
    const n = document.createElement('div');
    n.className = 'model-row-name';
    n.textContent = nom;
    n.title = nom;
    row.appendChild(n);
    const bouton = (endroit) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'image-row-where';
      b.textContent = imageUsageLabel(endroit, tr);
      b.title = b.textContent;
      // Le DÉPLACEMENT lui-même est injecté, comme `openModelPlace` chez la jumelle : ce module
      // rend des listes, il ne décide pas de ce que devient l'écran. Ce qui se garde ici, et qui a
      // déjà mordu ailleurs, c'est que chaque bouton emporte SON endroit et pas celui d'un voisin.
      b.onclick = (e) => {
        e.stopPropagation();
        _cb.openImageUsage(endroit);
      };
      return b;
    };
    // Comme chez les modèles : trois endroits, puis « + N autre(s) », et le dépliage survit au clic.
    ajouterEndroits(row, `images:dansCases:${nom}`, endroits, bouton, renderImageList);
    // Une image introuvable se signale ICI aussi : c'est la liste où l'on vient chercher pourquoi
    // une Case affiche « Image introuvable ».
    if (!fichiers.includes(nom)) {
      const d = document.createElement('div');
      d.className = 'perso-name-sub perso-name-sub-warn model-row-where';
      d.textContent = tr('⚠ file not found', '⚠ fichier introuvable');
      row.appendChild(d);
    }
    row.oncontextmenu = (e) => {
      e.preventDefault(); e.stopPropagation();
      _cb.openImageContextMenu(e, nom);
    };
    return row;
  };

  // Repliables comme celles des Modèles (demandé), avec leur propre mémoire (`images:…`).
  groupeRepliable(list, 'images:dansCases', tr('Used in Panels', 'Utilisées dans des Cases'),
    g.dansCases.map(e => ligne(e.nom, e.endroits)));
  groupeRepliable(list, 'images:nonUtilisees', tr('Unused', 'Non utilisées'), g.nonUtilisees.map(n => ligne(n, [])));
}
