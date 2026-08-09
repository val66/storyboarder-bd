/**
 * io.js — Project persistence: serialization, migrations, save/load,
 * Project management modals (rename, confirm, quit).
 *
 * Callbacks injected by app.js (setIOCallbacks) to avoid circular imports:
 *   - _renderAll        : triggers a full re-render after a Project loads
 *   - _applyRenameVolume  : applies a Volume rename (in renderTree)
 *   - _applyRenameScene : applies a Scene rename
 *   - _closeSettingsModal : closes the Settings modal (defined in the Settings section)
 */
import { S, tr, createVolume, addPageToVolume } from './state.js';
import { disposeAllRigs3D, findOwningPanel, ensureElementWorldPos3D, panelDepthToDistance3D } from './scene3d.js';
import {
  getElementDepth, repairElementBase3D,
  seedPoseLibrary3D, mergePoseLibrary3D, posesUsedByProject3D,
  rememberDismissedPose3D, missingBuiltinPoses3D, forgetDismissedPoses3D,
} from './utils.js';
import { WALL_TYPES, WALL_PX_PER_UNIT_3D, PANEL_CAM_DEFAULT_DIST_3D, GROUND_Y_DEFAULT_3D } from './constants.js';

// ── Callbacks injected by app.js (avoids a circular import) ─────────────────
let _renderAll = null;
let _applyRenameVolume = null;
let _applyRenameScene = null;
let _closeSettingsModal = null;

export function setIOCallbacks(onRenderAll, onRenameVolume, onRenameScene, onCloseSettings) {
  _renderAll           = onRenderAll;
  _applyRenameVolume     = onRenameVolume;
  _applyRenameScene    = onRenameScene;
  _closeSettingsModal  = onCloseSettings;
}

// ── DOM references used by several functions in this module ─────────────
// (each modal's own const variables are declared locally in their section below)
const _descModal     = document.getElementById('descModal');
const _objectModal   = document.getElementById('objectModal');
const _settingsModal = document.getElementById('settingsModal');

export function hasElectronAPI(){ return !!(window.storyboarderAPI); }
export function supportsFileSystemAccess(){ return typeof window.showSaveFilePicker === 'function'; }

// Fix 57 — `poses` n'embarque plus la bibliothèque entière, mais SEULEMENT les poses citées par ce
// projet. La bibliothèque appartient à l'application (settings.json) ; ce que le fichier porte est
// une copie de secours, pour qu'il reste lisible sur une autre machine — sans quoi un projet envoyé
// à quelqu'un afficherait « inconnue » sur chacune de ses poses.
//
// ⚠️ Le NOM du champ et sa forme ne changent pas : un fichier écrit avant ce changement reste lu à
// l'identique, et un fichier écrit après reste lisible par une version antérieure. Seule la portée
// change (cf. docs/donnees-persistees.md).
export function serializeProject(){
  return JSON.stringify({
    projectName: S.projectName, tomes: S.tomes,
    currentTomeIndex: S.currentTomeIndex, currentPageIndex: S.currentPageIndex,
    scenes: S.scenes, poses: posesUsedByProject3D(S.poses, S.tomes, S.scenes),
  });
}

// ── Bibliothèque de poses au niveau APPLICATION (Fix 57) ──────────────────────────────────────
//
// Vit dans settings.json (userData), comme le thème ou la langue. Toutes les lectures de
// l'application se font sur S.poses, de façon SYNCHRONE ; la persistance, elle, est asynchrone et
// silencieuse. Sans ce découplage, chaque affichage de la liste des poses attendrait une IPC.
//
// Sans window.storyboarderAPI — les tests sous Node, notamment — tout continue de fonctionner en
// mémoire. Une bibliothèque non persistée vaut mieux qu'une exception au démarrage.
export const POSE_LIBRARY_SETTING_KEY = 'poseLibrary';
// Fix 59 — ⚠️ CLÉ PERSISTÉE : la renommer ferait oublier toutes les suppressions, et les poses
// écartées réapparaîtraient au premier projet ouvert.
export const POSE_DISMISSED_SETTING_KEY = 'poseLibraryDismissed';

// Mémorise les ids supprimés. Même découplage que setPoseLibrary : écriture mémoire synchrone,
// persistance asynchrone et silencieuse.
// ─── Fix 83 (DIAGNOSTIC, TEMPORAIRE) — journal de glisser écrit sur DISQUE ───────────────────
//
// À retirer avec l'essai du glisser d'articulation.
//
// Passe par `writeProjectFile`, le seul pont capable d'écrire à un chemin choisi. Ouvrir un
// nouveau canal IPC pour un outil temporaire reviendrait à modifier preload.js et main.js — les
// fichiers de processus Electron, qu'on ne touche pas pour une fonctionnalité applicative.
//
// EFFET DE BORD À NEUTRALISER : côté main.js, `project:write` appelle setLastProjectPath. Sans
// précaution, l'application considérerait le journal comme le dernier Projet ouvert et tenterait
// de le charger au démarrage suivant. On relit donc `lastFilePath` AVANT d'écrire et on le
// restaure juste après, puis on vérifie que la restauration a pris — un diagnostic qui casserait
// l'ouverture du prochain projet ne vaudrait pas la peine d'exister.
export const DRAG_LOG_FILENAME = 'diagnostic-glisser-articulations.json';

export async function writeDragDiagnosticFile(dossier, contenu){
  const api = hasElectronAPI() ? window.storyboarderAPI : null;
  if (!api || typeof api.writeProjectFile !== 'function' || !dossier) return null;
  const chemin = `${dossier}/${DRAG_LOG_FILENAME}`;
  let avant = null;
  try {
    if (typeof api.getSettings === 'function') {
      const reglages = await api.getSettings();
      avant = (reglages && reglages.lastFilePath) || null;
    }
    const res = await api.writeProjectFile(chemin, JSON.stringify(contenu, null, 2));
    if (!res || res.ok === false) return null;
    if (typeof api.setSetting === 'function') {
      await api.setSetting('lastFilePath', avant);
      const apres = await api.getSettings();
      if (apres && apres.lastFilePath !== avant) {
        console.warn('[diagnostic] le dernier Projet ouvert n\'a pas pu être restauré :', avant);
      }
    }
    return chemin;
  } catch (err) {
    console.warn('[diagnostic] écriture du journal impossible :', err);
    return null;
  }
}

export function setDismissedPoses(ids){
  S.dismissedPoses = Array.isArray(ids) ? ids : [];
  const api = hasElectronAPI() ? window.storyboarderAPI : null;
  if (api && typeof api.setSetting === 'function') {
    try {
      Promise.resolve(api.setSetting(POSE_DISMISSED_SETTING_KEY, S.dismissedPoses))
        .catch(() => { /* la session reste utilisable */ });
    } catch { /* idem */ }
  }
  return S.dismissedPoses;
}

export function setPoseLibrary(poses){
  S.poses = Array.isArray(poses) ? poses : [];
  // hasElectronAPI ne garantit que la PRÉSENCE de l'objet, pas celle de chaque méthode. Constaté en
  // test : un pont partiel faisait lever une TypeError synchrone, qui remontait jusqu'à l'appelant et
  // annulait l'enregistrement de la pose. Perdre la persistance est acceptable, perdre la pose non.
  const api = hasElectronAPI() ? window.storyboarderAPI : null;
  if (api && typeof api.setSetting === 'function') {
    // Volontairement sans await : rien dans l'interface ne dépend de la fin de l'écriture, et
    // rendre synchrone chaque modification de pose ferait bégayer les curseurs.
    try {
      Promise.resolve(api.setSetting(POSE_LIBRARY_SETTING_KEY, S.poses))
        .catch(() => { /* disque en lecture seule : la session reste utilisable */ });
    } catch { /* idem */ }
  }
  return S.poses;
}

// Au démarrage. Premier lancement (clé absente) : on SÈME les poses intégrées, qui deviennent des
// entrées ordinaires — c'est ce qui rend leur traitement uniforme.
//
// ⚠️ Une bibliothèque VIDE n'est pas un premier lancement : c'est un utilisateur qui a tout
// supprimé. Resemer là ferait réapparaître les 15 poses à chaque redémarrage, en annulant sans
// cesse sa décision. D'où le test sur l'ABSENCE de la clé, pas sur la longueur.
export async function loadPoseLibrary(builtins, poseTable, skeleton){
  let stored = null;
  if (hasElectronAPI()) {
    try {
      const settings = await window.storyboarderAPI.getSettings();
      stored = settings ? settings[POSE_LIBRARY_SETTING_KEY] : null;
    } catch { stored = null; }
  }
  if (Array.isArray(stored)) { S.poses = normalizePoses3D(stored); return S.poses; }
  return setPoseLibrary(seedPoseLibrary3D(builtins, poseTable, skeleton));
}

// Fix 59 — charge la liste des suppressions mémorisées. Séparée de loadPoseLibrary : elle n'a pas
// de semis, une liste absente signifie simplement « rien de supprimé ».
export async function loadDismissedPoses(){
  if (!hasElectronAPI()) { S.dismissedPoses = []; return S.dismissedPoses; }
  try {
    const settings = await window.storyboarderAPI.getSettings();
    const stored = settings ? settings[POSE_DISMISSED_SETTING_KEY] : null;
    S.dismissedPoses = Array.isArray(stored) ? stored.filter(id => typeof id === 'string' && id) : [];
  } catch { S.dismissedPoses = []; }
  return S.dismissedPoses;
}

// Fix 59 — « Restaurer les poses de base » (modale Configuration).
//
// Comblement de trous, PAS remise à zéro d'usine : seules les poses intégrées ABSENTES sont
// réajoutées. Une pose de base renommée est présente, donc jamais écrasée — cliquer ne peut pas
// faire perdre un renommage. Les poses personnelles ne sont pas touchées non plus.
//
// Lève aussi leur mémorisation de suppression, sans quoi elles seraient réécartées au premier projet
// ouvert : restaurées à l'écran, puis disparues sans explication.
export function restoreBuiltinPoses(builtins, poseTable, skeleton){
  const manquantes = missingBuiltinPoses3D(builtins, poseTable, S.poses, skeleton);
  if (!manquantes.length) return 0;
  setPoseLibrary([...(Array.isArray(S.poses) ? S.poses : []), ...manquantes]);
  setDismissedPoses(forgetDismissedPoses3D(S.dismissedPoses, manquantes.map(p => p.id)));
  return manquantes.length;
}

// Combien de poses intégrées manquent — pour l'étiquette du bouton, qui se désactive à zéro.
export function missingBuiltinPoseCount(builtins, poseTable, skeleton){
  return missingBuiltinPoses3D(builtins, poseTable, S.poses, skeleton).length;
}

// Derives the Project name from the file name the user picked in the save dialog
// (e.g. "Adventure.json" -> "Adventure"), and updates the display accordingly — on user
// request, so that the name given to the file at creation time is the one shown at the
// top of the left-hand menu, instead of staying on the default "Projet".
export function applyProjectNameFromFileName(nameOrPath){
  if (!nameOrPath) return;
  const base = String(nameOrPath).split(/[\\/]/).pop().replace(/\.json$/i, '').trim();
  if (!base || base === S.projectName) return;
  S.projectName = base;
  const headerEl = document.getElementById('projectNameText');
  if (headerEl) headerEl.textContent = S.projectName;
  const modalNameEl = document.getElementById('projectModalCurrentName');
  if (modalNameEl) modalNameEl.textContent = S.projectName;
}

// [SCENE3D→scene3d.js] disposeAllRigs3D → exported from scene3d.js (accesses internal caches)

// Replaces the entire application state with a Project's data (new, or loaded from a
// .json file): used by createNewProjectFlow/loadExistingProjectFlow below.
// Defensive cleanup (following a now-fixed Panel-deletion bug, cf. the Delete/Backspace
// handler above): an Element whose homePanelId points to a Panel that no longer exists in
// its Page is unambiguously an orphan, even if it geometrically overlaps ANOTHER existing
// Panel (which would otherwise make it visually "latch onto" that other Panel without ever
// really belonging to it, cf. findOwningPanel — a RENDERING heuristic, not the source of
// truth for ownership). Run on every Project load to catch orphans already created by old
// bugs (cf. user feedback: "no Element should exist in the Page unless it's linked to a
// Panel").
export function cleanupOrphanedElements(){
  let removedCount = 0;
  function cleanPages(pages){
    (pages || []).forEach(page => {
      const panelIds = new Set(page.objects.filter(o => o.type === 'panel').map(o => o.id));
      const before = page.objects.length;
      page.objects = page.objects.filter(o => o.type === 'panel' || !o.homePanelId || panelIds.has(o.homePanelId));
      removedCount += before - page.objects.length;
    });
  }
  S.tomes.forEach(t => cleanPages(t.pages));
  S.scenes.forEach(s => cleanPages(s.pages));
  return removedCount;
}

// Migration: assign homePanelId to Elements (perso/objet3d) that are missing it.
// Needed for old saved files predating homePanelId as the source of truth for ownership.
// Without this field, findOwningPanel falls back to the geometric heuristic (last panel in
// page.objects that the Element overlaps the most) — correct at creation time, but unstable
// if Panels move afterwards, and especially fragile for Build-Tool Walls whose 2D box can
// extend past the edges of their original panel. Visible symptom of the bug: a Panel shows
// the Walls of a NEIGHBORING Panel, and "nudging the Panel slightly" fixes it (because it
// changes the geometric overlap, changing findOwningPanel's assignment). This migration runs
// ONCE per load (only touches elements without homePanelId) and permanently stamps the
// field, making ownership stable regardless of Panel position.
export function migrateMissingHomePanelId(){
  function fixPage(page){
    // Index the panels with their position in page.objects (to reproduce findOwningPanel's logic).
    const panelEntries = [];
    page.objects.forEach((o, idx) => { if (o.type === 'panel') panelEntries.push({ panel: o, idx }); });
    if (!panelEntries.length) return;

    // Pass 1: build a pieceId → homePanelId map from elements that already have both, to
    // propagate the assignment to other members of the same Room (walls of the same
    // building, etc.) without depending on geometric overlap, which is often imprecise for
    // Build-Tool walls.
    const roomToPanel = new Map();
    page.objects.forEach(o => {
      if ((o.type === 'perso' || o.type === 'objet3d') && o.pieceId && o.homePanelId)
        if (!roomToPanel.has(o.pieceId)) roomToPanel.set(o.pieceId, o.homePanelId);
    });

    // Pass 2: assign homePanelId to every element that's missing it.
    page.objects.forEach(o => {
      if (o.type === 'panel' || o.type === 'tracé' || o.homePanelId) return;
      if (o.type !== 'perso' && o.type !== 'objet3d') return;

      // (a) Element belonging to an already-resolved Room.
      if (o.pieceId && roomToPanel.has(o.pieceId)) {
        o.homePanelId = roomToPanel.get(o.pieceId);
        return;
      }
      // (b) Geometric overlap — same logic as findOwningPanel (last panel by index).
      let best = null, bestIdx = -1;
      panelEntries.forEach(({ panel, idx }) => {
        const ow = Math.max(0, Math.min(o.x + o.w, panel.x + panel.w) - Math.max(o.x, panel.x));
        const oh = Math.max(0, Math.min(o.y + o.h, panel.y + panel.h) - Math.max(o.y, panel.y));
        if (ow * oh > 0 && idx > bestIdx) { bestIdx = idx; best = panel; }
      });
      if (best) {
        o.homePanelId = best.id;
        // Remember this for other members of the same Room still missing homePanelId.
        if (o.pieceId && !roomToPanel.has(o.pieceId)) roomToPanel.set(o.pieceId, best.id);
      }
    });
  }
  S.tomes.forEach(t => (t.pages || []).forEach(fixPage));
  S.scenes.forEach(s => (s.pages || []).forEach(fixPage));
}

// Migration for Scenes created before the default top-down view was introduced (cf.
// createScene/resetPanelCamera): their canvas then has no stored camRotX (never touched),
// so it fell back to the front view (fallback `|| 0`, cf. panelCamBasis3D) instead of the
// now-desired default top-down view. We do NOT touch Scenes whose Camera has already been
// manually rotated (camRotX already set): only the "never touched" state switches to the
// new default.
export function migrateSceneTopDownDefault(){
  S.scenes.forEach(s => {
    (s.pages || []).forEach(page => {
      (page.objects || []).forEach(o => {
        if (o.type === 'panel' && o.camRotX === undefined) {
          o.camRotX = Math.PI / 2; o.camRotY = 0;
        }
      });
    });
  });
}

// wxFloor migration: computes and stores wxFloor for every perso/objet3d that's missing it.
// Without an explicit wxFloor, renderPanelScene3D fell back to ensureElementWorldPos3D, which
// depends on the current camera angle — giving wrong positions after loadSceneIntoPanel
// (camera reset). After this migration, the world X position is always stored and stable
// regardless of the camera.
// Migration Phase 1: guarantees wxFloor, wzFloor and realHeightFloor are defined for every
// existing perso/objet3d element (projects saved before these fields were introduced).
// — wxFloor: derived from the 2D position via ensureElementWorldPos3D (unchanged).
// — wzFloor: equal to o.z (current depth); identical to the renderer's fallback.
// — realHeightFloor: derived from o.h / factor(o.z); identical to the renderer's fallback.
//   Stored explicitly to serve as the source of truth in migration Phase 2+.
export function migrateElementWxFloor(){
  const allPages = [];
  S.tomes.forEach(t => (t.pages || []).forEach(p => allPages.push(p)));
  S.scenes.forEach(s => (s.pages || []).forEach(p => allPages.push(p)));
  allPages.forEach(page => {
    (page.objects || []).forEach(o => {
      if (o.type !== 'perso' && o.type !== 'objet3d') return;
      const panel = o.wxFloor === undefined ? findOwningPanel(o, page) : null;
      // wxFloor
      if (o.wxFloor === undefined && panel) {
        o.wxFloor = ensureElementWorldPos3D(o, panel).x;
      }
      // wzFloor
      if (o.wzFloor === undefined) {
        o.wzFloor = typeof o.z === 'number' ? o.z : 0;
      }
      // realHeightFloor (excludes Walls — they use their own geometry)
      if (o.realHeightFloor === undefined && !WALL_TYPES.includes(o.objType)) {
        const dist = panelDepthToDistance3D(getElementDepth(o));
        const factor = WALL_PX_PER_UNIT_3D * (PANEL_CAM_DEFAULT_DIST_3D / dist);
        o.realHeightFloor = (o.h || WALL_PX_PER_UNIT_3D) / factor;
      }
      // Fix 22b: repair corrupted baseH/baseW on load (old projects where
      // loadSceneIntoPanel used to multiply baseH*s while realHeightFloor stayed unscaled).
      // Repaired eagerly here so the data is sound as soon as the project is read — the lazy
      // calls in getPersonaScalePercent/applyPersonaSizePercent remain as a safety net.
      if (!WALL_TYPES.includes(o.objType)) repairElementBase3D(o);
    });
  });
}

// Phase 3 — De-scaling world coords for old projects where loadSceneIntoPanel used to apply
// a factor s (panel.sceneScale) to every physical quantity. After this migration, all
// Elements are at real size and the camera is pulled back to camDist =
// PANEL_CAM_DEFAULT_DIST_3D/s to show the entirety of the content — identical to Phase 2's
// behavior for new loads. Called AFTER migrateElementWxFloor so the missing world coords are
// already populated (from the 2D position) before being de-scaled.
export function migratePanelWorldCoords(){
  const allPages = [];
  S.tomes.forEach(t => (t.pages || []).forEach(p => allPages.push(p)));
  S.scenes.forEach(sc => (sc.pages || []).forEach(p => allPages.push(p)));
  allPages.forEach(page => {
    (page.objects || []).filter(o => o.type === 'panel').forEach(panel => {
      const sc = panel.sceneScale;
      if (!(typeof sc === 'number' && sc > 0 && sc < 1)) return; // only scaled panels
      const invS = 1 / sc;
      (page.objects || []).forEach(o => {
        if (o.homePanelId !== panel.id) return;
        // World positions / sizes — multiplying by invS reverses the original factor s.
        if (typeof o.wxFloor        === 'number') o.wxFloor        *= invS;
        if (typeof o.wzFloor        === 'number') o.wzFloor        *= invS;
        if (typeof o.realHeightFloor=== 'number') o.realHeightFloor*= invS;
        if (typeof o.realLenFloor   === 'number') o.realLenFloor   *= invS;
        // wyFloor / worldY: anchored on GROUND_Y_DEFAULT_3D (only the part above ground is scaled).
        if (typeof o.wyFloor === 'number')
          o.wyFloor = GROUND_Y_DEFAULT_3D + (o.wyFloor - GROUND_Y_DEFAULT_3D) * invS;
        if (typeof o.worldY  === 'number')
          o.worldY  = GROUND_Y_DEFAULT_3D + (o.worldY  - GROUND_Y_DEFAULT_3D) * invS;
        // roomFloatY: vertical offset of a floating Room.
        if (typeof o.roomFloatY === 'number') o.roomFloatY *= invS;
        // Slab: XZ polygon.
        if (Array.isArray(o.polygon))
          o.polygon = o.polygon.map(pt => ({ x: pt.x * invS, z: pt.z * invS }));
        // wallHeight (low wall/fence/hedge Path)
        if (typeof o.wallHeight === 'number') o.wallHeight *= invS;
        // world (Terrain Zone / route / path / low wall Path)
        if (o.world) {
          if (o.tracéType === 'terrain') {
            o.world = {
              cx:  o.world.cx * invS,
              cz:  o.world.cz * invS,
              w:   o.world.w  * invS,
              h:   o.world.h  * invS,
              rotY: o.world.rotY,
              corners: (o.world.corners || []).map(c => ({ x: c.x * invS, z: c.z * invS })),
            };
          } else if (Array.isArray(o.world && o.world.pts)) {
            o.world = {
              pts:   o.world.pts.map(pt => ({ x: pt.x * invS, z: pt.z * invS })),
              width: typeof o.world.width === 'number' ? o.world.width * invS : o.world.width,
            };
          }
        }
      });
      // Pull the camera back so the real-size content fits in the Panel's field of view.
      const camDistNew = PANEL_CAM_DEFAULT_DIST_3D * invS;
      panel.camDist       = camDistNew;
      panel.camDistTarget = camDistNew;
      // Mark the panel as migrated: sceneScale = 1 = world coords at real size.
      panel.sceneScale = 1;
    });
  });
}

// Resyncs S.idCounter (cf. newId) to the largest numeric suffix already present in the
// loaded Project. Without this, S.idCounter would restart from 0 on every app launch while
// the saved Project's objects already carry ids "o1", "o2", ... : the very next newId() call
// would then reuse an id already used by an existing object, and
// page.objects.find(o => o.id === S.selectedId) would fall back to THAT existing object (the
// first in the array with that id) instead of the object just created — hence the reported
// symptom ("it selects a different Panel", especially after relaunching the app). Recursively
// walks everything that may contain ids (Volumes/Pages/Elements, Scenes) to cover every
// prefix (o/t/p/sc/piece...).
// Fix 47 — remet la bibliothèque de poses d'un fichier chargé dans une forme exploitable.
//
// Tolérante par principe : un projet enregistré avant l'existence des poses n'a pas le champ, et un
// fichier bricolé à la main peut contenir n'importe quoi. Rien de tout cela ne doit empêcher
// l'ouverture du projet — les Personnages, eux, portent déjà leurs angles et s'affichent
// correctement même sans bibliothèque du tout.
//
// Une entrée sans `id` utilisable est écartée : aucun Personnage ne peut la citer, elle
// n'encombrerait la liste des poses que pour rien. Les doublons d'id sont CONSERVÉS tels quels —
// les dédoublonner en silence masquerait un vrai problème ; la recherche prend simplement le
// premier, comportement couvert par un test.
export function normalizePoses3D(raw){
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(p => p && typeof p.id === 'string' && p.id && p.joints && typeof p.joints === 'object')
    .map(p => ({
      id: p.id,
      name: (typeof p.name === 'string' && p.name) ? p.name : p.id,
      skeleton: p.skeleton || 'humain',
      joints: p.joints,
    }));
}

export function resyncIdCounter(data){
  let maxN = 0;
  const visit = (v) => {
    if (Array.isArray(v)) { v.forEach(visit); return; }
    if (v && typeof v === 'object') {
      if (typeof v.id === 'string') {
        const m = v.id.match(/(\d+)$/);
        if (m) maxN = Math.max(maxN, parseInt(m[1], 10));
      }
      Object.values(v).forEach(visit);
    }
  };
  visit(data && data.tomes);
  visit(data && data.scenes);
  // Fix 47 — les poses portent des ids (« pose1 », « pose2 »…). Sans cette visite, une pose créée
  // après chargement réutiliserait un id déjà pris, et comme les Personnages citent leur pose PAR ID
  // (cf. resolvePoseLabel3D), c'est un Personnage qui se retrouverait avec la mauvaise pose.
  visit(data && data.poses);
  if (maxN > S.idCounter) S.idCounter = maxN;
}

export function applyProjectData(data){
  disposeAllRigs3D();
  S.projectName = (data && data.projectName) || 'Projet';
  S.tomes = (data && data.tomes) || [];
  S.currentTomeIndex = (data && data.currentTomeIndex) || 0;
  S.currentPageIndex = (data && data.currentPageIndex) || 0;
  S.scenes = (data && data.scenes) || [];
  // Fix 57 — la bibliothèque de poses appartient désormais à l'APPLICATION, pas au projet. Un
  // fichier n'en porte qu'une copie des poses qu'il utilise, pour rester lisible ailleurs : on
  // FUSIONNE au lieu de remplacer. Écraser S.poses ici ferait qu'ouvrir un projet effacerait toute
  // la bibliothèque personnelle — y compris les poses semées au premier lancement.
  //
  // La fusion n'ajoute que les ids inconnus (cf. mergePoseLibrary3D) : un projet ancien ne peut donc
  // pas annuler un renommage fait depuis.
  setPoseLibrary(mergePoseLibrary3D(S.poses, normalizePoses3D(data && data.poses), S.dismissedPoses));
  S.editingSceneId = null;
  resyncIdCounter(data);
  cleanupOrphanedElements();
  migrateMissingHomePanelId();
  migrateSceneTopDownDefault();
  migrateElementWxFloor();
  migratePanelWorldCoords(); // Phase 3: de-scale world coords for old projects
  // Reset the animation locks and Camera mode of every Panel on load.
  //
  // BUG: `panel._camAnimating` is a runtime property set by startCamSmoothing(). It's
  // included in JSON.stringify() (not Symbol-prefixed, enumerable) so it ends up in the
  // .json file if autosave runs WHILE a camera animation is in progress (the
  // requestAnimationFrame loop is active, _camAnimating = true). After reloading,
  // _camAnimating = true but the rAF loop is dead: startCamSmoothing() returns immediately on
  // every call ("if (panel._camAnimating) return;"), so no animation ever starts → the camera
  // is completely frozen, sliders revert to their initial value. We force _camAnimating to
  // false here on every Panel (both Scenes AND Volumes) to guarantee a clean starting state.
  //
  // While we're at it, we also reset the Camera mode of Scene canvases: if the project was
  // saved while Camera mode was active, it ends up persisted and can produce erratic behavior
  // (clicking the left-hand panel → exitCameraMode() + S.selectedId = null via the document
  // 'mousedown' listener, leaving the camera "stuck" with no explicit user action). So we
  // reset it here exactly as disableSceneCameraMode() does when normally exiting the Scene
  // editor.
  function _resetPanelAnimState(o){
    if (o.type !== 'panel') return;
    o._camAnimating = false;          // unlocks startCamSmoothing after reload
    o.cameraMode = false;             // leave no Camera mode active (only relevant for Scenes,
    o.camOrbitTargetId = null;        // but harmless for normal Panels)
    // Align camRotX/Y/PanX/Y/Dist/Wx/y/z on their targets in case autosave happened mid-animation
    if (o.camRotXTarget  !== undefined) o.camRotX  = o.camRotXTarget;
    if (o.camRotYTarget  !== undefined) o.camRotY  = o.camRotYTarget;
    if (o.camPanXTarget  !== undefined) o.camPanX  = o.camPanXTarget;
    if (o.camPanYTarget  !== undefined) o.camPanY  = o.camPanYTarget;
    if (o.camDistTarget  !== undefined) o.camDist  = o.camDistTarget;
    if (o.camWxTarget    !== undefined) o.camWx    = o.camWxTarget;
    if (o.camWyTarget    !== undefined) o.camWy    = o.camWyTarget;
    if (o.camWzTarget    !== undefined) o.camWz    = o.camWzTarget;
    // Fix 14d: correct camWy's underground drift on reload.
    // If camWy < GROUND_Y_DEFAULT_3D - 4 (= -7), that's an unintentional drift from repeated
    // zooming: the low-angle threshold would be crossed at ~5° → Ground flickering on every
    // rotation. Resetting to 0 (orbit center at ground level) fixes it without disrupting
    // normal use.
    if ((o.camWy || 0) < GROUND_Y_DEFAULT_3D - 4) {
      o.camWy = 0; if (o.camWyTarget !== undefined) o.camWyTarget = 0;
    }
    // Fix 13d: reset the one-shot centering state (Element selection outside Camera mode).
    // These fields are included in JSON.stringify (runtime, non-Symbol): if a save happens
    // while an Element was selected (_lastOrbitSelId ≠ null) and the pre-centering restore is
    // pending (_preCenterWx set), reloading restores this intermediate state — on the first
    // render, framePanelCamera3D's "deselection" branch triggers camWxTarget = _preCenterWx,
    // diverging from camWx (aligned above on camWxTarget BEFORE the reload) and restarting a
    // spurious animation. Resetting here guarantees a neutral starting state: the next
    // Element selection starts with a clean slate.
    o._lastOrbitSelId = null;
    o._preCenterWx = undefined; o._preCenterWy = undefined; o._preCenterWz = undefined;
  }
  S.tomes.forEach(t => { (t.pages || []).forEach(tp => { (tp.objects || []).forEach(_resetPanelAnimState); }); });
  S.scenes.forEach(s => { (s.pages || []).forEach(sp => { (sp.objects || []).forEach(_resetPanelAnimState); }); });
  S.selectedId = null; S.selectedRoomId = null; S.dragMode = null; S.snapGuide = null;
  S.undoStack = [];
  S.expandedVolumes = new Set(S.tomes.length ? [S.tomes[0].id] : []);
  document.getElementById('projectNameText').textContent = S.projectName;
  const undoBtnEl = document.getElementById('undoBtn');
  if (undoBtnEl) undoBtnEl.disabled = true;
  if (_renderAll) _renderAll();
  S.projectDirty = false;
}

export function setProjectModalStatus(text){
  const el = document.getElementById('projectModalStatus');
  if (el) el.textContent = text || '';
}

// "Time since last save" indicator at the bottom of the right-hand menu (on user request):
// in seconds while under a minute, then in minutes beyond that. Updated on every successful
// save (cf. writeProjectToHandle/writeProjectToPath/downloadProjectAsFile) and refreshed
// every second to stay accurate even without a new save.
// [STATE→S] let S.lastSaveDate = null;
export function markProjectSaved(){
  S.lastSaveDate = new Date();
  updateLastSavedIndicator();
}
export function updateLastSavedIndicator(){
  const el = document.getElementById('lastSavedIndicator');
  if (!el) return;
  if (!S.lastSaveDate) { el.textContent = S.appLang === 'en' ? 'No save yet' : "Aucune sauvegarde pour l'instant"; return; }
  const elapsedSec = Math.max(0, Math.floor((Date.now() - S.lastSaveDate.getTime()) / 1000));
  if (elapsedSec < 60) {
    el.textContent = S.appLang === 'en' ? `Last saved: ${elapsedSec}s ago` : `Dernière sauvegarde : il y a ${elapsedSec} s`;
  } else {
    const elapsedMin = Math.floor(elapsedSec / 60);
    el.textContent = S.appLang === 'en' ? `Last saved: ${elapsedMin}min ago` : `Dernière sauvegarde : il y a ${elapsedMin} min`;
  }
}
setInterval(updateLastSavedIndicator, 1000);

// Silently writes the Project's current state to an already-obtained file handle (cf.
// S.projectFileHandle) — used by both manual save and autosave.
export async function writeProjectToHandle(handle){
  try {
    const writable = await handle.createWritable();
    await writable.write(serializeProject());
    await writable.close();
    S.projectDirty = false;
    markProjectSaved();
    const now = new Date();
    setProjectModalStatus(`Enregistré à ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`);
    return true;
  } catch (err) {
    console.warn('Échec de l\'enregistrement du Projet :', err);
    setProjectModalStatus('Échec de l\'enregistrement du Projet.');
    return false;
  }
}

// Electron-side write (window.storyboarderAPI path, cf. preload.js/main.js) to the
// already-known file (S.projectFilePath) — equivalent to writeProjectToHandle above but for
// the native IPC path.
export async function writeProjectToPath(filePath){
  try {
    const res = await window.storyboarderAPI.writeProjectFile(filePath, serializeProject());
    if (!res || !res.ok) throw new Error((res && res.error) || 'échec inconnu');
    S.projectDirty = false;
    markProjectSaved();
    const now = new Date();
    setProjectModalStatus(`Enregistré à ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`);
    return true;
  } catch (err) {
    console.warn('Échec de l\'enregistrement du Projet :', err);
    setProjectModalStatus('Échec de l\'enregistrement du Projet.');
    return false;
  }
}

// Fallback without the File System Access API nor window.storyboarderAPI: a plain classic
// download (the user then chooses where to save it via the browser's usual dialog), with no
// reusable handle — autosave will therefore remain unavailable in this case.
export function downloadProjectAsFile(){
  const blob = new Blob([serializeProject()], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `${S.projectName || 'projet'}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  S.projectDirty = false;
  markProjectSaved();
  setProjectModalStatus('Projet téléchargé (.json).');
}

export function stopAutosave(){
  if (S.autosaveIntervalId) { clearInterval(S.autosaveIntervalId); S.autosaveIntervalId = null; }
}
// Autosave every minute — on user request ("once the project is created, have an automatic
// save every minute"): only rewrites the file if the Project has actually changed since the
// last save (cf. S.projectDirty) and only if a file location is already known, preferring the
// Electron IPC path (S.projectFilePath), otherwise the web File System Access API path
// (S.projectFileHandle) if it was available.
export function startAutosave(){
  stopAutosave();
  if (!S.autosaveIntervalMs) return; // 0 = autosave disabled (cf. Settings modal).
  S.autosaveIntervalId = setInterval(() => {
    if (!S.projectDirty) return;
    if (S.projectFilePath) writeProjectToPath(S.projectFilePath);
    else if (S.projectFileHandle) writeProjectToHandle(S.projectFileHandle);
  }, S.autosaveIntervalMs);
}

// Returns true if the save succeeded, false if it was canceled or failed — needed so the
// "Save and quit" button in quitConfirmModal knows whether it can quit or must stay open (on
// user request).

// ════════════════════════════════════════════════════════════
// PROJECT SAVE / LOAD
// ════════════════════════════════════════════════════════════
export async function saveProjectFlow(){
  if (hasElectronAPI()) {
    if (S.projectFilePath) {
      const ok = await writeProjectToPath(S.projectFilePath);
      closeProjectModal();
      return ok;
    }
    try {
      const res = await window.storyboarderAPI.saveProjectAs(serializeProject(), `${S.projectName || 'projet'}.json`);
      if (res && !res.canceled) {
        S.projectFilePath = res.filePath;
        applyProjectNameFromFileName(res.filePath);
        const ok = await writeProjectToPath(S.projectFilePath);
        setProjectModalStatus('Projet enregistré.');
        startAutosave();
        closeProjectModal();
        return ok;
      }
      return false;
    } catch (err) {
      setProjectModalStatus('Échec de l\'enregistrement du Projet.');
      return false;
    }
  }
  if (S.projectFileHandle) {
    const ok = await writeProjectToHandle(S.projectFileHandle);
    closeProjectModal();
    return ok;
  }
  if (!supportsFileSystemAccess()) {
    downloadProjectAsFile();
    closeProjectModal();
    return true;
  }
  try {
    const handle = await window.showSaveFilePicker({
      suggestedName: `${S.projectName || 'projet'}.json`,
      types: [{ description: 'Projet Storyboard BD', accept: { 'application/json': ['.json'] } }],
    });
    S.projectFileHandle = handle;
    applyProjectNameFromFileName(handle.name);
    const ok = await writeProjectToHandle(handle);
    startAutosave();
    closeProjectModal();
    return ok;
  } catch (err) {
    if (err && err.name !== 'AbortError') setProjectModalStatus('Échec de l\'enregistrement du Projet.');
    return false;
  }
}

export async function createNewProjectFlow(){
  if (S.projectDirty && !await confirmAction(tr('The current project has unsaved changes. Continue without saving?', 'Le Projet actuel contient des modifications non enregistrées. Continuer sans les enregistrer ?'))) return;
  stopAutosave();
  S.projectFileHandle = null;
  S.projectFilePath = null;
  S.tomes = [];
  const t0 = createVolume('fb');
  addPageToVolume(t0);
  applyProjectData({ projectName: 'Projet', tomes: S.tomes, currentTomeIndex: 0, currentPageIndex: 0 });
  // Immediately triggers a save (on user request): proposes a .json location (or rewrites the
  // already-known file) via the same logic as the "Save project" button.
  await saveProjectFlow();
}

export async function loadExistingProjectFlow(){
  if (hasElectronAPI()) {
    if (S.projectDirty && !await confirmAction(tr('The current project has unsaved changes. Continue without saving?', 'Le Projet actuel contient des modifications non enregistrées. Continuer sans les enregistrer ?'))) return;
    try {
      const res = await window.storyboarderAPI.openProjectDialog();
      if (!res || res.canceled) return;
      const data = JSON.parse(res.data);
      stopAutosave();
      applyProjectData(data);
      S.projectFilePath = res.filePath;
      S.projectFileHandle = null;
      startAutosave();
      setProjectModalStatus(`Projet « ${S.projectName} » chargé.`);
      closeProjectModal();
    } catch (err) {
      setProjectModalStatus('Impossible de charger ce fichier de Projet.');
    }
    return;
  }
  if (!supportsFileSystemAccess()) {
    setProjectModalStatus('Le chargement nécessite un navigateur compatible (accès au système de fichiers).');
    return;
  }
  if (S.projectDirty && !await confirmAction(tr('The current project has unsaved changes. Continue without saving?', 'Le Projet actuel contient des modifications non enregistrées. Continuer sans les enregistrer ?'))) return;
  try {
    const [handle] = await window.showOpenFilePicker({
      types: [{ description: 'Projet Storyboard BD', accept: { 'application/json': ['.json'] } }],
    });
    const file = await handle.getFile();
    const text = await file.text();
    const data = JSON.parse(text);
    try { await handle.requestPermission({ mode: 'readwrite' }); } catch (e) {}
    stopAutosave();
    applyProjectData(data);
    S.projectFileHandle = handle;
    startAutosave();
    setProjectModalStatus(`Projet « ${S.projectName} » chargé.`);
  } catch (err) {
    if (err && err.name !== 'AbortError') setProjectModalStatus('Impossible de charger ce fichier de Projet.');
  }
}

const projectModal = document.getElementById('projectModal');
export function openProjectModal(){
  document.getElementById('projectModalCurrentName').textContent = S.projectName;
  setProjectModalStatus('');
  projectModal.classList.remove('hidden');
}
export function closeProjectModal(){ projectModal.classList.add('hidden'); }
document.getElementById('projectNameHeader').addEventListener('click', openProjectModal);
// Round button top right + clicking outside the modal: two extra ways to close the Project
// modal (on user request), in addition to the Escape key (cf. listener further down).
document.getElementById('projectModalCornerClose').onclick = closeProjectModal;
projectModal.addEventListener('mousedown', (e) => { if (e.target === projectModal) closeProjectModal(); });
// The big bottom button, which used to close the modal, now closes the entire Application
// (on user request). We reproduce here directly the same logic as
// app:requestQuitConfirmation (cf. QUIT section further down) rather than going through
// window.close(): this avoids leaving the Project modal open behind quitConfirmModal, and it
// also works in the browser fallback (without the Electron API, where there's no
// main-process-side interception).
document.getElementById('projectModalClose').onclick = () => {
  closeProjectModal();
  if (!S.projectDirty) {
    if (hasElectronAPI()) { S.quittingConfirmed = true; window.storyboarderAPI.confirmQuit(); }
    else window.close();
    return;
  }
  if (hasElectronAPI()) openQuitConfirmModal();
  else window.close();
};
document.getElementById('projectModalNew').onclick = () => createNewProjectFlow();
document.getElementById('projectModalLoad').onclick = () => loadExistingProjectFlow();
document.getElementById('projectModalSave').onclick = () => saveProjectFlow();
document.getElementById('headerSaveBtn').onclick = () => saveProjectFlow();
// Ctrl+S (or Cmd+S on Mac) keyboard shortcut to save the Project without going through the
// modal — preventDefault is essential to stop the browser's "Save page" dialog.
window.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault();
    saveProjectFlow();
  }
});
// Escape opens the Project modal — on user request — unless another, more specific modal is
// already in front (each already handles its own closing via Escape, cf. closeDescModal/
// closeObjectModal/closeRenameProjectModal just above/below): we don't want to steal the
// event from it in that case. If the Project modal is already open, Escape closes it —
// consistent with the other modals' behavior (Escape always closes the frontmost modal).
//
// Fix 67 — this listener is the FIRST one registered on window for Escape (io.js is imported
// before events.js), so a later listener calling stopImmediatePropagation cannot hold it back:
// by the time that listener runs, the Project modal has already opened. Anything that covers the
// application therefore has to declare itself HERE, in the guard list below — that is what the
// character editor was missing, and why leaving it opened the Project modal behind itself.
window.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  // The character editor COVERS the application (cf. S.personaEditorOpen — it does not replace
  // what is on screen, it hides it), so no modal class can speak for it: only this flag can.
  if (S.personaEditorOpen) return;
  // FIX (pre-existing bug): descModal/objectModal/settingsModal were referenced here without
  // the _ prefix (cf. _descModal/_objectModal/_settingsModal declared above) — an immediate
  // ReferenceError, which broke the Escape key in the ENTIRE application from the very first
  // press.
  if (!_descModal.classList.contains('hidden')) return;
  if (!_objectModal.classList.contains('hidden')) return;
  if (!renameProjectModal.classList.contains('hidden')) return;
  if (!renameEntityModal.classList.contains('hidden')) return;
  if (!confirmActionModal.classList.contains('hidden')) return;
  if (!quitConfirmModal.classList.contains('hidden')) { closeQuitConfirmModal(); return; }
  if (!_settingsModal.classList.contains('hidden')) { if (_closeSettingsModal) _closeSettingsModal(); return; }
  if (!projectModal.classList.contains('hidden')) { closeProjectModal(); return; }
  openProjectModal();
});

// "Rename project" sub-modal (cf. #projectModalRename): the "Rename" button stays disabled
// as long as the text field matches the Project's current name (on user request).
const renameProjectModal = document.getElementById('renameProjectModal');
const renameProjectInput = document.getElementById('renameProjectInput');
const renameProjectConfirm = document.getElementById('renameProjectConfirm');
function updateRenameConfirmState(){
  renameProjectConfirm.disabled = renameProjectInput.value.trim() === S.projectName || renameProjectInput.value.trim() === '';
}
export function openRenameProjectModal(){
  renameProjectInput.value = S.projectName;
  updateRenameConfirmState();
  renameProjectModal.classList.remove('hidden');
  // Deferred focus (cf. the same fix on renameEntityModal, just below): avoids the same
  // intermittent bug where the cursor is visible but keystrokes are ignored.
  setTimeout(() => { renameProjectInput.focus(); renameProjectInput.select(); }, 0);
}
export function closeRenameProjectModal(){ renameProjectModal.classList.add('hidden'); }
// Also renames the .json file on disk when a Project file already exists (preferring the
// Electron IPC path, cf. window.storyboarderAPI.renameProjectFile/main.js) — on user request,
// so that a "Save" after renaming rewrites that same renamed file instead of proposing a new one.
export async function confirmRenameProject(){
  const newName = renameProjectInput.value.trim();
  if (!newName || newName === S.projectName) return;
  S.projectName = newName;
  document.getElementById('projectNameText').textContent = S.projectName;
  document.getElementById('projectModalCurrentName').textContent = S.projectName;
  S.projectDirty = true;
  closeRenameProjectModal();
  if (hasElectronAPI() && S.projectFilePath) {
    try {
      const res = await window.storyboarderAPI.renameProjectFile(S.projectFilePath, newName);
      if (res && res.ok) S.projectFilePath = res.filePath;
    } catch (err) {
      console.warn('Échec du renommage du fichier de Projet :', err);
    }
    // Triggers a save (on user request): rewrites the file (already renamed above) with the
    // Project's current state.
    await saveProjectFlow();
    return;
  }
  if (S.projectFileHandle && typeof S.projectFileHandle.move === 'function') {
    // Browser fallback (web File System Access API): handle.move() is only available on
    // certain recent Chromium versions; without it, the Project's name changes but not the
    // .json file.
    try {
      await S.projectFileHandle.move(`${newName}.json`);
    } catch (err) {
      console.warn('Échec du renommage du fichier de Projet :', err);
    }
  }
  // No known file yet (or browser fallback without handle.move): triggers a save, which will
  // propose a .json location if needed.
  await saveProjectFlow();
}
document.getElementById('projectModalRename').onclick = openRenameProjectModal;
document.getElementById('renameProjectCancel').onclick = closeRenameProjectModal;
document.getElementById('renameProjectConfirm').onclick = confirmRenameProject;
renameProjectInput.addEventListener('input', updateRenameConfirmState);
renameProjectInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !renameProjectConfirm.disabled) { e.preventDefault(); confirmRenameProject(); }
  else if (e.key === 'Escape') { e.preventDefault(); closeRenameProjectModal(); }
});

// ---------- Generic rename modal (Volume or Scene) ----------
// Replaces the old window.prompt() (unreliable in Electron, and with no live validation)
// with a dedicated modal, on the same principle as renameProjectModal above.
// S.renameModalContext remembers the entity type ('tome'|'scene') and its target (the
// Volume's real index, or the Scene's id) between opening and confirming.
const renameEntityModal = document.getElementById('renameEntityModal');
const renameEntityTitle = document.getElementById('renameEntityTitle');
const renameEntityInput = document.getElementById('renameEntityInput');
const renameEntityError = document.getElementById('renameEntityError');
const renameEntityConfirm = document.getElementById('renameEntityConfirm');
// [STATE→S] let S.renameModalContext = null;
function isEntityNameTakenByOther(kind, target, name){
  const norm = name.trim().toLowerCase();
  if (kind === 'tome') {
    return S.tomes.some((t, ti) => ti !== target && (t.name || '').trim().toLowerCase() === norm);
  }
  return S.scenes.some(s => s.id !== target && (s.name || '').trim().toLowerCase() === norm);
}
function updateRenameEntityConfirmState(){
  const newName = renameEntityInput.value.trim();
  const currentName = (S.renameModalContext && S.renameModalContext.currentName) || '';
  let errorMsg = '';
  let disabled = false;
  if (!newName || newName === currentName) {
    disabled = true;
  } else if (S.renameModalContext && isEntityNameTakenByOther(S.renameModalContext.kind, S.renameModalContext.target, newName)) {
    disabled = true;
    errorMsg = S.renameModalContext.kind === 'tome' ? 'Ce nom est déjà utilisé par un autre tome.' : 'Ce nom est déjà utilisé par une autre scène.';
  }
  renameEntityConfirm.disabled = disabled;
  renameEntityError.textContent = errorMsg;
}
export function openRenameEntityModal(kind, target, currentName){
  S.renameModalContext = { kind, target, currentName };
  renameEntityTitle.textContent = kind === 'tome' ? tr('Rename volume', 'Renommer le tome') : tr('Rename scene', 'Renommer la scène');
  renameEntityInput.value = currentName;
  updateRenameEntityConfirmState();
  renameEntityModal.classList.remove('hidden');
  // Deferred focus (on the next task, not synchronously with classList.remove): calling
  // focus() right after making the modal visible can, intermittently under
  // Electron/Chromium, produce a visibly blinking cursor that doesn't actually receive
  // keystrokes until the next event-loop tick (user feedback: "the cursor is clearly
  // visible... but the text field doesn't register what I type"). Same safety net already in
  // place for the Persona/Object modals (cf. personaNameInput.focus()/objectNameInput.focus() above).
  setTimeout(() => { renameEntityInput.focus(); renameEntityInput.select(); }, 0);
}
export function closeRenameEntityModal(){
  renameEntityModal.classList.add('hidden');
  S.renameModalContext = null;
}
export function confirmRenameEntity(){
  if (!S.renameModalContext || renameEntityConfirm.disabled) return;
  const newName = renameEntityInput.value.trim();
  const { kind, target } = S.renameModalContext;
  closeRenameEntityModal();
  if (kind === 'tome') if (_applyRenameVolume) _applyRenameVolume(target, newName);
  else if (_applyRenameScene) _applyRenameScene(target, newName);
}
document.getElementById('renameEntityCancel').onclick = closeRenameEntityModal;
renameEntityConfirm.onclick = confirmRenameEntity;
renameEntityInput.addEventListener('input', updateRenameEntityConfirmState);
renameEntityInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !renameEntityConfirm.disabled) { e.preventDefault(); confirmRenameEntity(); }
  else if (e.key === 'Escape') { e.preventDefault(); closeRenameEntityModal(); }
});
renameEntityModal.addEventListener('mousedown', (e) => {
  if (e.target === renameEntityModal) closeRenameEntityModal();
});

// ---------- Generic confirmation modal (replaces window.confirm()) ----------
// window.confirm() opens a blocking NATIVE dialog under Electron: beyond the visual
// inconsistency with the rest of the app, closing such a dialog sometimes desyncs the main
// window's keyboard focus for several seconds (user feedback: after deleting/renaming
// several Scenes in a row — thus triggering several confirm() calls — the rename modal
// showed a cursor that stopped receiving keystrokes for ~10s). confirmAction() replaces
// confirm() with this modal, and returns a Promise<boolean> (true = confirmed).
const confirmActionModal = document.getElementById('confirmActionModal');
const confirmActionTitle = document.getElementById('confirmActionTitle');
const confirmActionMessage = document.getElementById('confirmActionMessage');
const confirmActionOk = document.getElementById('confirmActionOk');
const confirmActionCancel = document.getElementById('confirmActionCancel');
// [STATE→S] let S.confirmActionResolve = null;
export function confirmAction(message, title){
  confirmActionCancel.style.display = '';
  confirmActionOk.textContent = 'Confirmer';
  confirmActionTitle.textContent = title || 'Confirmer';
  confirmActionMessage.textContent = message;
  confirmActionModal.classList.remove('hidden');
  // Deferred focus (cf. renameEntityModal above) to avoid the same keyboard desync.
  setTimeout(() => confirmActionOk.focus(), 0);
  return new Promise((resolve) => { S.confirmActionResolve = resolve; });
}
// "Information" variant (a single OK button) — replaces window.alert(), which causes exactly
// the same keyboard-focus-desync issue we're trying to avoid with confirm()/prompt().
export function alertAction(message, title){
  confirmActionCancel.style.display = 'none';
  confirmActionOk.textContent = 'OK';
  confirmActionTitle.textContent = title || 'Information';
  confirmActionMessage.textContent = message;
  confirmActionModal.classList.remove('hidden');
  setTimeout(() => confirmActionOk.focus(), 0);
  return new Promise((resolve) => { S.confirmActionResolve = resolve; });
}
export function settleConfirmAction(result){
  confirmActionModal.classList.add('hidden');
  const resolve = S.confirmActionResolve;
  S.confirmActionResolve = null;
  if (resolve) resolve(result);
}
confirmActionOk.onclick = () => settleConfirmAction(true);
confirmActionCancel.onclick = () => settleConfirmAction(false);
confirmActionModal.addEventListener('mousedown', (e) => {
  if (e.target === confirmActionModal) settleConfirmAction(false);
});
confirmActionModal.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); settleConfirmAction(true); }
  else if (e.key === 'Escape') { e.preventDefault(); settleConfirmAction(false); }
});

// ---------- QUIT (confirmation before closing the Application) ----------
// Rather than preventing the app from closing until the Project is saved, we now offer the
// user the choice to save then quit, quit without saving, or cancel — on user request. The
// 'beforeunload' safety net below stays in place as an ultimate fallback (in case the window
// gets closed through a mechanism that doesn't go through main.js), but is neutralized once
// the user has explicitly decided via quitConfirmModal (cf. S.quittingConfirmed).
// [STATE→S] let S.quittingConfirmed = false;

const quitConfirmModal = document.getElementById('quitConfirmModal');
export function openQuitConfirmModal(){ quitConfirmModal.classList.remove('hidden'); }
export function closeQuitConfirmModal(){ quitConfirmModal.classList.add('hidden'); }

if (hasElectronAPI() && window.storyboarderAPI.onRequestQuitConfirmation) {
  window.storyboarderAPI.onRequestQuitConfirmation(() => {
    if (!S.projectDirty) {
      S.quittingConfirmed = true;
      window.storyboarderAPI.confirmQuit();
      return;
    }
    openQuitConfirmModal();
  });
}

document.getElementById('quitConfirmSave').onclick = async () => {
  const ok = await saveProjectFlow();
  if (ok) {
    S.quittingConfirmed = true;
    closeQuitConfirmModal();
    window.storyboarderAPI.confirmQuit();
  }
};
document.getElementById('quitConfirmDiscard').onclick = () => {
  S.quittingConfirmed = true;
  closeQuitConfirmModal();
  window.storyboarderAPI.confirmQuit();
};
document.getElementById('quitConfirmCancel').onclick = closeQuitConfirmModal;
quitConfirmModal.addEventListener('mousedown', (e) => { if (e.target === quitConfirmModal) closeQuitConfirmModal(); });

// Native warning when closing the application if there are unsaved changes left (cf.
// S.projectDirty) — used only as a browser fallback (without the Electron API) or if closing
// couldn't be intercepted on the main-process side. Neutralized as soon as
// S.quittingConfirmed is true, so as not to re-prompt for confirmation after the user has
// already decided via quitConfirmModal.
window.addEventListener('beforeunload', (e) => {
  if (!S.projectDirty || S.quittingConfirmed) return;
  e.preventDefault();
  e.returnValue = '';
});
// ↳ src/i18n.js
// ↳ src/i18n.js
// ════════════════════════════════════════════════════════════
