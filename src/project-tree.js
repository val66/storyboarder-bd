/**
 * @file project-tree.js
 * The LEFT menu: the Volume → Page tree and the list of Scenes.
 *
 * Extracted from events.js, where it sat under a banner reading « SIDEBAR — TREE ». Its
 * counterpart, sidebar.js, is the RIGHT-hand panel and nothing else: two different panels, on two
 * sides of the screen, had ended up sharing one word.
 *
 * What lives here: rendering both lists, and the operations they offer — create a Volume, a Page,
 * a Scene; duplicate; reorder by drag-and-drop; rename. What does NOT: what a Scene IS
 * (createScene / openScene, still in events.js) and the context menus these rows open. Both are
 * injected — see setProjectTreeCallbacks.
 */

import { FORMATS } from './constants.js';
import { S, addPageToVolume, createVolume, newId, tr } from './state.js';
import { getFormat } from './utils.js';
import { alertAction, confirmAction, openRenameEntityModal } from './io.js';
import { renderAll } from './draw.js';

// Six upward dependencies, all of them things the left menu TRIGGERS rather than owns: what a
// Scene is (createScene / openScene / disableSceneCameraMode), the context menus its rows open,
// and the undo stack. Injected rather than imported — events.js imports this module, so importing
// back would close a cycle (cf. docs/architecture.md rule #2).
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
  // Displayed in alphabetical order (not creation order) — on user request. We sort a copy:
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
// this only reads S.scenes and writes the DOM — it calls nothing injected. Any future
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
// its position — cf. `Page ${pi + 1}` below, already recomputed dynamically, so nothing to do on
// that side). Limited to drag-and-drop BETWEEN Pages of the same Volume (moving a Page from one
// Volume to another wasn't requested).
// [STATE→S] let S.draggedPage = null;

// ════════════════════════════════════════════════════════════
// SIDEBAR — TREE
// ════════════════════════════════════════════════════════════
export function renderTree(){
  const list = document.getElementById('volumeList');
  list.innerHTML = '';
  // Displayed in alphabetical order (not creation order), on user request — same as for Scenes. We
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
    row.innerHTML = `<span>${t.name} <small style="color:var(--sepia)">— ${getFormat(t.format).label.split(' (')[0]}</small></span><span class="caret">${expanded ? '▾' : '▸'}</span>`;
    row.onclick = () => {
      if (S.expandedVolumes.has(t.id)) S.expandedVolumes.delete(t.id); else S.expandedVolumes.add(t.id);
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
        opt.value = f.key; opt.textContent = f.label;
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
          disableSceneCameraMode();
          S.currentTomeIndex = ti; S.currentPageIndex = pi; S.editingSceneId = null;
          S.selectedId = null; S.selectedRoomId = null;
          // Clicking a Page in the left-hand menu "selects" it: opens its "Page" menu (list of
          // Panels) in the right-hand panel — on user request.
          S.pageSelected = true;
          renderAll();
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
          // depending on which half of its height the cursor is over), not the hovered Page itself —
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
// substitution ("oldId" → "newId") rather than walking each named field — more robust against
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
// allow live validation) — instead we open the dedicated renameEntityModal (cf. below), which
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