/**
 * @file sidebar.js
 * Right-hand side panel (Panel/Bubble/Page/Camera menu) + "Elements" list.
 * Extracted from app.js. Refactor step B.12.
 *
 * Exported functions: renderSideElementRow, renderSidePersonas, renderTracéSideRow,
 * renderSidePagePanels, updateSidePanel, refreshCameraSliders, renderSideCameraGizmo,
 * refreshSceneTopDownBtn, closeRightPanelMenu, sideGroupCollapsed,
 * + helpers re-exported for app.js: isSceneTopDownView, setPanelNumber,
 * getLinkedElementName, homeOwningPanel, exitCameraMode, elementsInPanel,
 * getRoomConnectedComponents.
 */

import { S, currentPage, currentPageData, isLockedScenePanel, panelsInPage, ensurePanelNumbers, tr } from './state.js';
import { lumiereDeCase3D, projeterSurDome3D, geometrieDome3D,
  AZIMUTS_CARDINAUX } from './lighting-3d.js';
import { isImportedModel } from './model-store.js';
import { modelState } from './model-cache.js';
import { casePorteUneImage3D, imageDeLaCase3D, zoomDeLImage3D, cadrageParDefaut3D } from './image-store.js';
import {
  TRACÉ_EMOJI, OBJECT_TYPE_LABELS, OBJECT_TYPE_EMOJI,
  BUBBLE_PADDING_DEFAULT, BUBBLE_FONT_DEFAULT, GROUND_TYPE_DEFS,
  WALL_TYPES,
} from './constants.js';
import { clamp, getEmotion, libelleTable3D, libelleTypeObjet3D, pxPerMm } from './utils.js';
import { estUneLumiere3D } from './light-source-3d.js';
import {
  findOwningPanel, centerSceneCameraOnElement, centerSceneCameraOnRoom,
  drawAxisGizmoAt, panelSceneCache3D,

  elementHorsChamp3D,
} from './scene3d.js';
import { getPanelPoints, drawCurrentPage } from './draw.js';
import { stackRankLabel, noDescriptionLabel } from './i18n.js';

// ── Callbacks injected by app.js (avoids circular imports sidebar→app) ─────────────────────
// snapshot() (undo system) and the modal openers (src/modals.js to come, Step B.13)
// stay defined in app.js for now: they're received here via injection.
let _snapshot = null;
let _openPersonaModal = null;
let _openObjectModal = null;
let _openRoomModal = null;
let _openBuildingModal = null;
let _openTerrainModal = null;
let _openTracéModal = null;
// FIX (pre-existing bug, regression from extraction B.12): restoreSectionCollapseStates() (persistence
// of the right-hand panel's sections' collapsed/expanded state) lived in app.js/events.js, which tried
// to hook it at the end of updateSidePanel() by REASSIGNING the imported `updateSidePanel` binding
// (`updateSidePanel = function(){...}`), an ES import is a READ-ONLY binding, this
// reassignment threw a TypeError on every page load (silent: occurs at the very bottom
// of the file, after everything else had already initialized correctly). Injected here as a callback,
// like the modal openers above, and called directly from updateSidePanel (cf. further down).
let _restoreSectionCollapseStates = null;

export function setSidebarCallbacks({ snapshot, openPersonaModal, openObjectModal, openRoomModal, openBuildingModal, openTerrainModal, openTracéModal, restoreSectionCollapseStates }) {
  _snapshot = snapshot;
  _openPersonaModal = openPersonaModal;
  _openObjectModal = openObjectModal;
  _openRoomModal = openRoomModal;
  _openBuildingModal = openBuildingModal;
  _openTerrainModal = openTerrainModal;
  _openTracéModal = openTracéModal;
  _restoreSectionCollapseStates = restoreSectionCollapseStates;
}

// ── DOM references (right-hand side panel) ──────────────────────────────────────────────────────
const sidePersonas = document.getElementById('sidePersonas');
const sidePagePanels = document.getElementById('sidePagePanels');
const panelMenuHeader = document.getElementById('panelMenuHeader');
const bubbleMenuHeader = document.getElementById('bubbleMenuHeader');
const helpMenuHeader = document.getElementById('helpMenuHeader');
const pageMenuHeader = document.getElementById('pageMenuHeader');
const sidePagePanelsSection = document.getElementById('sidePagePanelsSection');
const sidePageBgSection = document.getElementById('sidePageBgSection');
const sideDimsSection = document.getElementById('sideDimsSection');
const sideStackSection = document.getElementById('sideStackSection');
const sideBubbleStackSection = document.getElementById('sideBubbleStackSection');
const sideBorderSection = document.getElementById('sideBorderSection');
const sideGroundSection = document.getElementById('sideGroundSection');
const sideLightSection = document.getElementById('sideLightSection');
const sideLightCustom = document.getElementById('sideLightCustom');
const sideLightShadowsCheckbox = document.getElementById('sideLightShadowsCheckbox');
const sideLightDomeCanvas = document.getElementById('sideLightDomeCanvas');
const sideLightResetBtn = document.getElementById('sideLightResetBtn');
const sideLightModeSelect = document.getElementById('sideLightModeSelect');
const sideLightColorInput = document.getElementById('sideLightColorInput');
const sideLightIntensityRange = document.getElementById('sideLightIntensityRange');
const sideLightIntensityValue = document.getElementById('sideLightIntensityValue');
const sidePersonasSection = document.getElementById('sidePersonasSection');
const sideImageSection = document.getElementById('sideImageSection');
const sideImageZoomInput = document.getElementById('sideImageZoomInput');
const sideImageZoomValue = document.getElementById('sideImageZoomValue');
const sideImageResetBtn  = document.getElementById('sideImageResetBtn');
const sideCadrageSection = document.getElementById('sideCadrageSection');
const sideImageName = document.getElementById('sideImageName');
const sideBubbleAppearanceSection = document.getElementById('sideBubbleAppearanceSection');
const sideBubbleBorderSection   = document.getElementById('sideBubbleBorderSection');
const sideDescSection = document.getElementById('sideDescSection');
const sideHelpSection = document.getElementById('sideHelpSection');
const sideCameraSection = document.getElementById('sideCameraSection');
const sideDescTitle = document.getElementById('sideDescTitle');
const sideDescInput = document.getElementById('sideDescInput');
const sideBubbleFontWrap = document.getElementById('sideBubbleFontWrap');
const sideBubbleFontSizeWrap = document.getElementById('sideBubbleFontSizeWrap');
const descEmptyHint = document.getElementById('descEmptyHint');
const sideDims = document.getElementById('sideDims');
const sideGroundGrid = document.getElementById('sideGroundGrid');
const panelMenuTitle = document.getElementById('panelMenuTitle');
const panelMenuNumber = document.getElementById('panelMenuNumber');
const pageMenuNumber = document.getElementById('pageMenuNumber');
const sidePageBgColorInput = document.getElementById('sidePageBgColorInput');
const sideBorderToggle = document.getElementById('sideBorderToggle');
const sideBorderColorInput = document.getElementById('sideBorderColorInput');
const sideBorderColorWrap = document.getElementById('sideBorderColorWrap');
const sideBorderWidthSelect = document.getElementById('sideBorderWidthSelect');
const sideBorderWidthWrap = document.getElementById('sideBorderWidthWrap');
const sideStackLevel = document.getElementById('sideStackLevel');
const sideBubbleStackLevel = document.getElementById('sideBubbleStackLevel');
const sideBubbleFontSelect = document.getElementById('sideBubbleFontSelect');
const sideBubbleFontSizeInput = document.getElementById('sideBubbleFontSizeInput');
const sideBubbleFontSizeValue = document.getElementById('sideBubbleFontSizeValue');
const sideBubbleBorderToggle     = document.getElementById('sideBubbleBorderToggle');
const sideBubbleBorderWidthSelect= document.getElementById('sideBubbleBorderWidthSelect');
const sideBubbleBorderColorInput = document.getElementById('sideBubbleBorderColorInput');
const sideBubbleBorderWidthWrap  = document.getElementById('sideBubbleBorderWidthWrap');
const sideBubbleBorderColorWrap  = document.getElementById('sideBubbleBorderColorWrap');
const sideBubbleTailToggle = document.getElementById('sideBubbleTailToggle');
const sideBubbleShapeSelect = document.getElementById('sideBubbleShapeSelect');
const sideBubblePaddingInput = document.getElementById('sideBubblePaddingInput');
const sideBubblePaddingValue = document.getElementById('sideBubblePaddingValue');
const rightPanel = document.getElementById('rightPanel');
const camSensRotInput = document.getElementById('camSensRotInput');
const camSensRotValue = document.getElementById('camSensRotValue');
const camSensPanInput = document.getElementById('camSensPanInput');
const camSensPanValue = document.getElementById('camSensPanValue');
const camRotYInput = document.getElementById('camRotYInput');
const camRotYValue = document.getElementById('camRotYValue');
const camRotXInput = document.getElementById('camRotXInput');
const camRotXValue = document.getElementById('camRotXValue');
const camOrbitTargetSelect = document.getElementById('camOrbitTargetSelect');
const sideCameraGizmoCanvas = document.getElementById('sideCameraGizmoCanvas');
const sceneTopDownBtn = document.getElementById('sceneTopDownBtn');


export function isSceneTopDownView(panel){
  if (!panel || !isLockedScenePanel(panel)) return false;
  const rotX = panel.camRotXTarget !== undefined ? panel.camRotXTarget : (panel.camRotX || 0);
  return Math.abs(rotX - Math.PI / 2) < 0.05;
}

export function setPanelNumber(page, panelObj, newNumber){
  const panels = panelsInPage(page);
  const total = panels.length;
  newNumber = clamp(Math.round(newNumber) || 1, 1, total);
  const others = panels.filter(p => p !== panelObj).sort((a, b) => (a.caseNumber || 0) - (b.caseNumber || 0));
  others.splice(newNumber - 1, 0, panelObj);
  others.forEach((p, i) => { p.caseNumber = i + 1; });
}

export function getLinkedElementName(o, page){
  if (!o || o.type !== 'objet3d' || !o.magnetWallId) return null;
  const wall = page.objects.find(w => w.id === o.magnetWallId);
  if (!wall) return null;
  // Tracé wall (low wall, fence, hedge, barrier)
  if (wall.type === 'tracé') {
    const tracéLabel = { muret: tr('Low wall', 'Muret'), cloture: tr('Fence', 'Clôture'),
    haie: tr('Hedge', 'Haie végétale'), barriere: tr('Road barrier', 'Barrière de route') };
    return wall.name || ((TRACÉ_EMOJI[wall.tracéType] || '') + ' ' + (tracéLabel[wall.tracéType] || 'Tracé'));
  }
  const wallName = wall.name || OBJECT_TYPE_LABELS[wall.objType] || 'Mur';
  // For a corner Wall, its two perpendicular sides are two distinct magnetism anchors
  // (cf. objectWallFaceSelect): specifying which one avoids having to open the Wall's modal to
  // figure it out, especially when several WallOpenings are magnetized to the same corner Wall on different sides.
  if (wall.objType === 'mur_coin') {
    const panLabel = (o.wallFace === 'B') ? 'Face 2' : 'Face 1';
    return wallName + ' — ' + panLabel;
  }
  return wallName;
}

export function edgeLengths(o){
  const pts = o.pts || getPanelPoints(o);
  const labels = S.appLang === 'en' ? ['Top', 'Right', 'Bottom', 'Left'] : ['Haut', 'Droite', 'Bas', 'Gauche'];
  return pts.map((p, i) => {
    const q = pts[(i + 1) % pts.length];
    return { label: labels[i] || tr(`Side ${i + 1}`, `${tr('Side', 'Côté')} ${i + 1}`), len: Math.hypot(q.x - p.x, q.y - p.y) };
  });
}

export function homeOwningPanel(el, page){
  if (el && el.homePanelId) {
    const home = page.objects.find(o => o.type === 'panel' && o.id === el.homePanelId);
    if (home) return home;
  }
  return findOwningPanel(el, page);
}

export function exitCameraMode(panel){
  panel.cameraMode = false;
  panel.camOrbitTargetId = null;
}

export function elementsInPanel(panel, page){
  // Uses the same criterion as findOwningPanel (the panel with which the Element overlaps the
  // most), instead of only testing whether the Element's center is inside the panel: an Element
  // that extends far beyond a panel while remaining visible inside it would otherwise keep its center
  // outside and wrongly disappear from this list.
  return page.objects.filter(o => (o.type === 'perso' || o.type === 'objet3d') &&
    o.objType !== 'dalle' &&
    findOwningPanel(o, page) === panel);
}

export const sideGroupCollapsed = {};

// Un seul avertissement par session pour une projection impossible (cf. renderSidePersonas).
let horsChampAlerteDonnee = false;

export function renderSideElementRow(p, panel, page){
  const row = document.createElement('div');
  row.className = 'perso-row' + (p.id === S.selectedId ? ' active' : '');
  const emoji = p.type === 'perso' ? getEmotion(p.emotion).label.split(' ')[0] : (OBJECT_TYPE_EMOJI[p.objType] || '📦');
  const nameSpan = document.createElement('span');
  nameSpan.className = 'perso-name';
  const nameMainSpan = document.createElement('span');
  nameMainSpan.className = 'perso-name-main';
  // ⚠️ « OBJET » EST LE REPLI DE TOUS LES OBJETS, ET IL RESTE. Une lumière fait exception parce
  // qu'elle vit dans un bloc à elle : trois lignes « Objet » sous un séparateur ne diraient plus
  // rien du tout, alors que dans la liste principale le voisinage et l'emoji suffisent. Étendre le
  // vrai libellé à TOUS les types serait un autre chantier, et un changement que personne n'a
  // demandé.
  nameMainSpan.textContent = p.name || (p.type === 'perso' ? 'Personnage'
    : (estUneLumiere3D(p) ? libelleTypeObjet3D(p.objType, tr) : 'Objet'));
  nameSpan.appendChild(nameMainSpan);
  // Modèle importé : dire son état sur la ligne. Un modèle qui n'arrive pas doit se voir ICI, à
  // côté de son nom, la boîte de remplacement dans la Case dit qu'il manque quelque chose, elle ne
  // dit pas quoi. L'Élément reste sélectionnable et déplaçable dans tous les cas.
  if (isImportedModel(p)) {
    const état = modelState(p.modelFile);
    if (état !== 'prêt') {
      const note = document.createElement('span');
      note.className = 'perso-name-sub' + (état === 'introuvable' ? ' perso-name-sub-warn' : '');
      note.textContent = état === 'introuvable'
        ? tr(' ⚠ file not found', ' ⚠ fichier introuvable')
        : tr(' loading…', ' chargement…');
      nameSpan.appendChild(note);
    }
  }
  // Makes visible the link to another Element (today: a WallOpening magnetized to a present Wall),
  // until now only perceptible through behavior (the WallOpening follows the Wall), cf.
  // getLinkedElementName.
  const linkedName = getLinkedElementName(p, page);
  if (linkedName) {
    const linkSpan = document.createElement('span');
    linkSpan.className = 'perso-link';
    linkSpan.textContent = '🧲 ' + tr('Linked to: ', 'Lié à : ') + linkedName;
    nameSpan.appendChild(linkSpan);
  }
  const emojiSpan = document.createElement('span');
  emojiSpan.className = 'perso-emoji';
  emojiSpan.textContent = emoji;
  row.appendChild(emojiSpan); row.appendChild(nameSpan);
  // A click selects the Element (on the Panel and in the list); a double-click directly
  // opens its edit modal (persona or object depending on the type). "mousedown" is used
  // rather than "click": a global handler window.addEventListener('mouseup', ...)
  // calls drawCurrentPage() on EVERY mouseup on the page (including ones that have nothing
  // to do with a drag on the canvas), which rebuilds this list (and therefore removes the row
  // being clicked) between the mousedown and the mouseup. Once the DOM node is detached, Chromium
  // no longer emits the corresponding "click" event, so onclick never fired. By
  // reacting to mousedown, our code runs before this rebuild. The native dblclick
  // isn't reliable here either (same reason): the double-click is detected ourselves via
  // the timestamp of the last click on the same Element (module-level state, so valid even if
  // the DOM row changes between the two clicks).
  row.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const now = Date.now();
    const isDoubleClick = S.sideElementLastClickId === p.id && (now - S.sideElementLastClickTime) < 450;
    if (isDoubleClick) {
      S.sideElementLastClickId = null; S.sideElementLastClickTime = 0;
      // Selecting an Element exits its Panel's Camera mode (cf. panel.cameraMode): this mode
      // only concerns navigating the Panel's own scene, not editing one of
      // its Elements. Also exits any WHOLE Room selection (cf. S.selectedRoomId): a
      // specific Wall has just been targeted, independent of the others.
      exitCameraMode(panel);
      S.selectedId = p.id; S.selectedRoomId = null;
      // If it's a Wall, remember it as the target for the next WallOpenings (window, door…).
      if (p.type === 'objet3d' && WALL_TYPES.includes(p.objType)) S.lastWallId = p.id;
      centerSceneCameraOnElement(panel, p);
      drawCurrentPage();
      // ⚠️ UNE LUMIÈRE OUVRE SA FICHE ICI AUSSI (#421d). La garde de #420b tenait tant que la modale
      // parlait d'un type, d'une taille et d'une matière ; #421c lui a donné ses propres champs.
      //
      // ⚠️ ET CETTE GARDE N'A JAMAIS COUVERT QUE DEUX CHEMINS SUR TROIS. La touche Entrée sur
      // l'Élément sélectionné (cf. events.js) ouvre `openObjectModal` pour tout `objet3d`, et une
      // Lumière EN EST UN : la fiche s'ouvrait donc déjà par là, sans que personne ne le sache.
      // Lever la garde ne crée pas un chemin, elle en aligne deux sur un troisième qui existait.
      if (p.type === 'perso') _openPersonaModal(p);
      else _openObjectModal(p);
    } else if (S.selectedId === p.id) {
      // A single click (outside the double-click window) on the already-selected Element deselects it
      // and selects its Panel instead, so the right-hand menu stays visible (the Panel's).
      // To fully close the menu, click outside of a Panel.
      const owningPanel = homeOwningPanel(p, currentPage());
      S.selectedId = owningPanel ? owningPanel.id : null;
      S.selectedRoomId = null;
      S.sideElementLastClickId = null; S.sideElementLastClickTime = 0;
      drawCurrentPage();
    } else {
      // Same: a single click on a different Element also exits its Panel's Camera mode and
      // any current WHOLE Room selection.
      exitCameraMode(panel);
      S.selectedId = p.id; S.selectedRoomId = null;
      // If it's a Wall, remember it as the target for the next WallOpenings (window, door…).
      if (p.type === 'objet3d' && WALL_TYPES.includes(p.objType)) S.lastWallId = p.id;
      centerSceneCameraOnElement(panel, p);
      S.sideElementLastClickId = p.id; S.sideElementLastClickTime = now;
      drawCurrentPage();
    }
  });
  // (#81) "Bring forward/Send backward" no longer makes sense for a 3D Element (depth, which now
  // takes its place, is set via the scroll wheel or the "Depth" field of its modal): right-click
  // here therefore no longer offers this menu (itemContextMenu remains used by Bubbles, which stay
  // in 2D, cf. right-click on the canvas). Only the browser's native menu is suppressed.
  row.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
  return row;
}

export function getRoomConnectedComponents(panel, page){
  const allRoomIds = [...new Set(
    page.objects.filter(o => o.pieceId && o.homePanelId === panel.id && o.objType === 'mur')
                .map(o => o.pieceId)
  )];
  if (allRoomIds.length === 0) return [];
  const CONN_EPS = 0.1;
  // Precomputes each Room's endpoints (recomputeBuildWallBox2D's formula).
  const roomEndpoints = {};
  allRoomIds.forEach(pid => {
    const walls = page.objects.filter(o => o.pieceId === pid && o.objType === 'mur' && o.wxFloor !== undefined);
    const eps = [];
    walls.forEach(w => {
      const half = (w.realLenFloor || 0) / 2;
      if (half < 0.01) return;
      const ca = Math.cos(w.rotY || 0), sa = Math.sin(w.rotY || 0);
      eps.push({ x: w.wxFloor - half * ca, z: w.wzFloor + half * sa });
      eps.push({ x: w.wxFloor + half * ca, z: w.wzFloor - half * sa });
    });
    roomEndpoints[pid] = eps;
  });
  // Union-Find.
  const parent = {};
  allRoomIds.forEach(pid => { parent[pid] = pid; });
  function find(x){ if (parent[x] !== x) parent[x] = find(parent[x]); return parent[x]; }
  function union(a, b){ parent[find(a)] = find(b); }
  for (let i = 0; i < allRoomIds.length; i++){
    for (let j = i + 1; j < allRoomIds.length; j++){
      const eA = roomEndpoints[allRoomIds[i]], eB = roomEndpoints[allRoomIds[j]];
      if (!eA || !eA.length || !eB || !eB.length) continue;
      let found = false;
      for (const a of eA){
        if (found) break;
        for (const b of eB){
          if (Math.hypot(a.x - b.x, a.z - b.z) < CONN_EPS){ union(allRoomIds[i], allRoomIds[j]); found = true; break; }
        }
      }
    }
  }
  // Group by root.
  const comps = {};
  allRoomIds.forEach(pid => { const r = find(pid); (comps[r] = comps[r] || []).push(pid); });
  return Object.values(comps);
}

/**
 * ⚠️ `horsChampFn` EST INJECTABLE, et ce n'est pas une commodité de test gratuite. Décider qu'un
 * Élément est hors champ demande de le PROJETER, donc la caméra de la Case, donc WebGL,
 * injoignable sous Node (cf. docs/en/testing-method.md). Sans ce paramètre, toute la construction de
 * cette liste devenait invérifiable, y compris ce qui n'a rien à voir avec la 3D : l'ordre des
 * groupes, le compte dans le titre, la présence des séparateurs. Le défaut par défaut reste le
 * vrai calcul ; seuls les tests passent autre chose.
 */
export function renderSidePersonas(panel, page, horsChampFn = elementHorsChamp3D){
  sidePersonas.innerHTML = '';
  const list = elementsInPanel(panel, page);
  // Tracés (Roads, Paths, Zones) attached to this panel.
  const panelTracés = page.objects.filter(o => o.type === 'tracé' && o.panelId === panel.id);
  if (list.length === 0 && panelTracés.length === 0) {
    const hint = document.createElement('div');
    hint.className = 'empty-hint';
    hint.textContent = tr('No Element in this panel.', 'Aucun Élément dans cette case.');
    sidePersonas.appendChild(hint);
    return;
  }

  const renderedRoomIds = new Set();

  /**
   * Le filet qui SÉPARE deux blocs de cette liste. À appeler EN TÊTE de chaque bloc non vide.
   *
   * ⚠️ IL DÉCIDE LUI-MÊME S'IL A LIEU D'ÊTRE, et c'est ce qui a changé. Chacun des quatre blocs
   * portait sa propre condition « y a-t-il quelque chose avant moi ? », réécrite à sa façon et
   * mise à jour à la main : quatre copies d'une seule question, qui ne s'accordaient que tant que
   * personne n'ajoutait de bloc. En ajouter un cinquième (les Lumières) a suffi à les faire
   * diverger, et ma première version doublait le filet dans un cas.
   *
   * La question se pose donc une fois, au seul endroit qui connaît vraiment la réponse : le
   * conteneur. Rien avant lui, pas de filet.
   *
   * ⚠️ ET IL NE SE GARDE PAS DES DOUBLONS, PARCE QU'IL NE PEUT PAS EN PRODUIRE. J'avais ajouté
   * « et pas deux filets de suite » ; une mutation a montré que retirer cette clause ne faisait
   * rien échouer, pour la meilleure des raisons : chaque appel est à l'intérieur d'un `if (bloc
   * non vide)`, donc un filet est toujours suivi de lignes. Une garde qu'aucun chemin n'atteint
   * n'est pas une sécurité, c'est un décor qui laisse croire qu'on surveille quelque chose. La
   * propriété, elle, reste tenue par un test sur la liste assemblée.
   */
  const separer = () => {
    const enfants = sidePersonas.children || [];
    if (enfants.length === 0) return;
    const sep = document.createElement('div');
    sep.className = 'side-liste-sep';
    sidePersonas.appendChild(sep);
  };

  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // LES LUMIÈRES, TOUT EN HAUT ET DANS LEUR PROPRE BLOC (#420e)
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  //
  // ⚠️ QUATRIÈME EXCLUSION VOULUE. Une source posée n'est pas un Élément qu'on compose : elle n'a
  // ni taille ni matière, elle éclaire ce que les autres montrent. Mêlée à eux, elle allongeait la
  // liste sans jamais répondre à la question qu'on lui pose (« qu'y a-t-il dans cette Case ? »).
  //
  // ⚠️ ET ELLE NE VA JAMAIS DANS « HORS CHAMP », par voie de conséquence : cette sous-section range
  // ce qui ne se rapporte à aucun pixel de l'image, or une lumière hors cadre éclaire toujours la
  // Case. La reléguer là dirait le contraire de ce qui se passe, et la ferait changer de bloc au
  // gré de la caméra. Son propre bloc joue déjà le rôle « on la retrouve ici ».
  //
  // ⚠️ EN TÊTE, ET C'EST DEMANDÉ. Un premier essai la posait après les Tracés, par symétrie avec
  // eux ; à l'usage, une source est ce qu'on cherche EN PREMIER quand on ouvre la liste, et la
  // faire descendre au gré du nombre d'Éléments la rendait introuvable. Une position fixe se
  // retient, une position relative se cherche.
  //
  // ⚠️ LES MÊMES LIGNES QUE LES ÉLÉMENTS, ET C'EST DÉLIBÉRÉ. `renderTracéSideRow` a déjà recopié
  // une fois la mécanique du clic — mousedown plutôt que click, double-clic détecté à la
  // milliseconde, second clic qui désélectionne. Une TROISIÈME copie serait la faute la plus chère
  // de ce dépôt. Seul le RANGEMENT change ; le comportement d'une ligne reste celui de
  // `renderSideElementRow`, qui sait déjà qu'une lumière n'ouvre pas de fiche.
  const lumieres = list.filter(estUneLumiere3D);
  if (lumieres.length > 0) {
    // En tête : `separer()` ne trouve rien avant lui et ne pose donc aucun filet ici.
    separer();
    lumieres.forEach(l => sidePersonas.appendChild(renderSideElementRow(l, panel, page)));
  }


  // ── Helper: builds a Room's expandable header + its members block.
  // A Wall belonging to a Room is grouped under a "🧱 <pieceLabel>" header:
  // single click = select the whole Room, double-click = open the Room modal,
  // click on ▾/▸ = collapse/expand the Walls.
  function renderRoomGroup(p, container, inBuilding = false) {
    const members = list.filter(o => o.pieceId === p.pieceId);
    const isCollapsed = !!sideGroupCollapsed[p.pieceId];

    // Room header
    const header = document.createElement('div');
    header.className = 'piece-group-header' + (S.selectedRoomId === p.pieceId ? ' active' : '');

    const labelNode = document.createTextNode('🧱 ' + (p.pieceLabel || 'Pièce'));
    header.appendChild(labelNode);

    const toggle = document.createElement('span');
    toggle.className = 'piece-toggle';
    toggle.textContent = isCollapsed ? '▸' : '▾';
    header.appendChild(toggle);

    // Members block (Walls)
    const groupWrap = document.createElement('div');
    groupWrap.className = 'piece-group-members' + (isCollapsed ? ' collapsed' : '');
    members.forEach(m => groupWrap.appendChild(renderSideElementRow(m, panel, page)));

    // Click on the ▾/▸ toggle: collapse/expand, without selecting
    toggle.addEventListener('mousedown', (e) => {
      e.preventDefault(); e.stopPropagation();
      sideGroupCollapsed[p.pieceId] = !sideGroupCollapsed[p.pieceId];
      groupWrap.classList.toggle('collapsed', !!sideGroupCollapsed[p.pieceId]);
      toggle.textContent = sideGroupCollapsed[p.pieceId] ? '▸' : '▾';
    });

    // Click / double-click on the rest of the header: selection or modal opening
    header.addEventListener('mousedown', (e) => {
      if (e.target === toggle) return;
      e.preventDefault(); e.stopPropagation();
      const now = Date.now();
      const isDoubleClick = S.sideHeaderLastClickId === p.pieceId && (now - S.sideHeaderLastClickTime) < 450;
      S.sideHeaderLastClickId = p.pieceId;
      S.sideHeaderLastClickTime = now;
      if (isDoubleClick) {
        S.sideHeaderLastClickId = null; S.sideHeaderLastClickTime = 0;
        _openRoomModal(p.pieceId, panel, page, inBuilding);
        return;
      }
      exitCameraMode(panel);
      S.sideElementLastClickId = null; S.sideElementLastClickTime = 0;
      if (S.selectedRoomId === p.pieceId) {
        S.selectedId = panel.id; S.selectedRoomId = null;
      } else {
        S.selectedId = panel.id; S.selectedRoomId = p.pieceId; S.selectedBuildingKey = null;
        centerSceneCameraOnRoom(panel, p.pieceId, page);
      }
      drawCurrentPage();
    });
    header.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); });

    container.appendChild(header);
    container.appendChild(groupWrap);
  }

  // Groups Rooms by connected components (shared walls).
  const components = getRoomConnectedComponents(panel, page);
  if (!panel.batimentNames) panel.batimentNames = {};

  components.forEach(component => {
    if (component.length >= 2) {
      // ── Building: several spatially connected Rooms.
      const buildingKey      = component.slice().sort().join(',');
      const buildingCollapsed = !!sideGroupCollapsed[buildingKey];
      const buildingName = panel.batimentNames[buildingKey] || 'Bâtiment';

      const buildingHeader = document.createElement('div');
      buildingHeader.className = 'batiment-group-header' + (S.selectedBuildingKey === buildingKey ? ' active' : '');
      buildingHeader.appendChild(document.createTextNode('🏠 ' + buildingName));
      const buildingToggle = document.createElement('span');
      buildingToggle.className = 'batiment-toggle';
      buildingToggle.textContent = buildingCollapsed ? '▸' : '▾';
      buildingHeader.appendChild(buildingToggle);

      const buildingMembers = document.createElement('div');
      buildingMembers.className = 'batiment-group-members' + (buildingCollapsed ? ' collapsed' : '');

      buildingToggle.addEventListener('mousedown', (e) => {
        e.preventDefault(); e.stopPropagation();
        sideGroupCollapsed[buildingKey] = !sideGroupCollapsed[buildingKey];
        buildingMembers.classList.toggle('collapsed', !!sideGroupCollapsed[buildingKey]);
        buildingToggle.textContent = sideGroupCollapsed[buildingKey] ? '▸' : '▾';
      });

      // Single click → select the Building; double-click → Building modal
      // Note: buildingLastClickTime MUST be a module-level variable (S.sideHeaderLastBuildingKey/Time)
      // because drawCurrentPage() recreates the DOM on every click, a variable local to the closure
      // would be reset to 0 on the second click, making the double-click undetectable.
      buildingHeader.addEventListener('mousedown', (e) => {
        if (e.target === buildingToggle) return;
        e.preventDefault(); e.stopPropagation();
        const now = Date.now();
        const isDoubleClick = S.sideHeaderLastBuildingKey === buildingKey && (now - S.sideHeaderLastBuildingClickTime) < 450;
        S.sideHeaderLastBuildingKey       = buildingKey;
        S.sideHeaderLastBuildingClickTime = now;
        if (isDoubleClick) {
          S.sideHeaderLastBuildingKey = null; S.sideHeaderLastBuildingClickTime = 0;
          _openBuildingModal(buildingKey, component, panel, page);
          return;
        }
        // Single click: select/deselect the Building
        exitCameraMode(panel);
        S.sideElementLastClickId = null; S.sideElementLastClickTime = 0;
        S.sideHeaderLastClickId  = null; S.sideHeaderLastClickTime  = 0;
        if (S.selectedBuildingKey === buildingKey) {
          S.selectedBuildingKey = null;
        } else {
          S.selectedId = panel.id; S.selectedRoomId = null; S.selectedBuildingKey = buildingKey;
        }
        drawCurrentPage();
      });
      buildingHeader.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); });

      sidePersonas.appendChild(buildingHeader);
      sidePersonas.appendChild(buildingMembers);

      component.forEach(pid => {
        if (renderedRoomIds.has(pid)) return;
        renderedRoomIds.add(pid);
        const rep = list.find(o => o.pieceId === pid);
        if (rep) renderRoomGroup(rep, buildingMembers, true);
      });

    } else {
      // ── Isolated Room (not connected to others).
      const pid = component[0];
      if (renderedRoomIds.has(pid)) return;
      renderedRoomIds.add(pid);
      const rep = list.find(o => o.pieceId === pid);
      if (rep) renderRoomGroup(rep, sidePersonas);
    }
  });

  // Rooms present in the list but absent from the components (no wall with homePanelId).
  list.forEach(p => {
    if (p.pieceId && !renderedRoomIds.has(p.pieceId)){
      renderedRoomIds.add(p.pieceId);
      renderRoomGroup(p, sidePersonas);
    }
  });

  // Free Elements (personas, objects without pieceId).
  //
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // CEUX QU'ON NE VOIT PAS SONT RANGÉS À PART, EN BAS
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  //
  // Demandé à l'usage : une Case chargée finit par mêler, dans la même liste, ce qu'on est en
  // train de composer et ce qui a glissé hors du cadre. Les seconds ne se distinguent par rien,
  // alors qu'ils ne se rapportent à aucun pixel de l'image.
  //
  // ⚠️ RANGÉS, PAS CACHÉS. Ils restent listés, sélectionnables et nommés, c'est souvent par cette
  // liste qu'on va les rechercher. Une sous-section dépliée mais atténuée dit « ils sont là, ils
  // ne comptent pas pour l'image » ; la replier ferait disparaître l'information qu'ils existent,
  // qui est précisément ce qu'on veut signaler.
  //
  // ⚠️ LES ÉLÉMENTS LIBRES SEULEMENT. Ni les Pièces/Bâtiments, reléguer un GROUPE entier parce
  // que ses murs sortent du cadre dirait autre chose que ce qu'on veut dire, ni les Tracés, qui
  // ont déjà leur propre bloc. Décidé avec l'utilisateur ; à rouvrir à l'usage, pas avant.
  const freeElements = list.filter(p => !p.pieceId && !estUneLumiere3D(p));
  // UNE SEULE passe : deux `filter` appelleraient la décision deux fois par Élément, donc
  // projetteraient chacun deux fois. Deux calculs de la même chose, c'est déjà un de trop.
  //
  // ⚠️ ET LA DÉCISION NE PEUT PAS INTERROMPRE LA LISTE. Elle traverse la projection, donc la caméra,
  // donc du code qui a ses propres cas particuliers (Parois aimantées, Murs d'outil, Tracés…). Une
  // exception ici arrêterait `renderSidePersonas` en plein milieu : les Éléments déjà ajoutés
  // resteraient, les suivants ne viendraient jamais, et la section se retrouverait vide sans que
  // rien ne l'explique, signalé à l'usage sur la première version.
  //
  // LE GARDE EST ICI, PAS DANS LE PRÉDICAT. Le mettre dans `elementHorsChamp3D` ne protégerait que
  // le prédicat par défaut : cette liste doit tenir quel qu'il soit. C'est aussi ce qui le rend
  // vérifiable, puisque les tests injectent le leur.
  //
  // EN CAS D'ÉCHEC, L'ÉLÉMENT EST DÉCLARÉ VISIBLE, le doute profite à la liste principale : montrer
  // un Élément de trop se voit et se comprend, en cacher un ne se voit pas du tout. ⚠️ ET ON LE DIT,
  // UNE FOIS : un `catch` muet transformerait un défaut en comportement, et la fonctionnalité se
  // désactiverait toute seule sans que personne ne l'apprenne. Une seule fois, parce que cette
  // liste se reconstruit à chaque rendu.
  const dansLeCadre = [], horsChamp = [];
  freeElements.forEach(p => {
    let hors = false;
    try {
      hors = horsChampFn(p, panel, page);
    } catch (e) {
      if (!horsChampAlerteDonnee) {
        horsChampAlerteDonnee = true;
        console.warn('[hors champ] décision impossible pour un Élément, il reste dans la liste '
          + 'principale. Type :', p && p.type, p && p.objType, 'cause :', e);
      }
    }
    (hors ? horsChamp : dansLeCadre).push(p);
  });
  if (dansLeCadre.length > 0) {
    separer();
    dansLeCadre.forEach(p => sidePersonas.appendChild(renderSideElementRow(p, panel, page)));
  }

  // Tracés (Roads, Dirt paths, Terrain Zones) associated with this panel.
  if (panelTracés.length > 0) {
    // Visual separator between 3D Elements and 2D Tracés.
    separer();
    panelTracés.forEach(t => sidePersonas.appendChild(renderTracéSideRow(t, panel, page)));
  }

  // ⚠️ TOUT EN BAS, APRÈS LES TRACÉS, demandé après un premier essai où ce bloc s'intercalait
  // entre les Éléments libres et les Tracés. Ce qui ne se voit pas doit venir après TOUT ce qui se
  // voit, sans quoi la sous-section coupe la liste en deux au lieu de la conclure.
  if (horsChamp.length > 0) {
    separer();
    const titre = document.createElement('div');
    titre.className = 'side-hors-champ-titre';
    // Le NOMBRE est dans le titre : sans lui, il faudrait compter les lignes pour savoir combien
    // d'Éléments ont quitté le cadre, c'est la première question qu'on se pose en le lisant.
    titre.textContent = tr(`Off-frame (${horsChamp.length})`, `Hors champ (${horsChamp.length})`);
    sidePersonas.appendChild(titre);
    const bloc = document.createElement('div');
    bloc.className = 'side-hors-champ';
    horsChamp.forEach(p => bloc.appendChild(renderSideElementRow(p, panel, page)));
    sidePersonas.appendChild(bloc);
  }
}

export function renderTracéSideRow(t, panel, page){
  const row = document.createElement('div');
  row.className = 'perso-row' + (t.id === S.selectedId ? ' active' : '');
  const emojiSpan = document.createElement('span');
  emojiSpan.className = 'perso-emoji';
  emojiSpan.textContent = TRACÉ_EMOJI[t.tracéType] || '📍';
  const nameSpan = document.createElement('span');
  nameSpan.className = 'perso-name';
  const nameMainSpan = document.createElement('span');
  nameMainSpan.className = 'perso-name-main';
  nameMainSpan.textContent = t.name || (t.tracéType === 'terrain' ? 'Terrain' : 'Tracé');
  nameSpan.appendChild(nameMainSpan);
  row.appendChild(emojiSpan);
  row.appendChild(nameSpan);
  row.addEventListener('mousedown', (e) => {
    e.preventDefault(); e.stopPropagation();
    const now = Date.now();
    const isDblClick = S.sideElementLastClickId === t.id && (now - S.sideElementLastClickTime) < 450;
    if (isDblClick) {
      S.sideElementLastClickId = null; S.sideElementLastClickTime = 0;
      S.selectedId = t.id; S.selectedRoomId = null;
      drawCurrentPage();
      if (t.tracéType === 'terrain') _openTerrainModal(t); else _openTracéModal(t);
    } else if (S.selectedId === t.id) {
      S.selectedId = panel.id; S.selectedRoomId = null;
      S.sideElementLastClickId = null; S.sideElementLastClickTime = 0;
      drawCurrentPage();
    } else {
      S.selectedId = t.id; S.selectedRoomId = null;
      S.sideElementLastClickId = t.id; S.sideElementLastClickTime = now;
      drawCurrentPage();
    }
  });
  row.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); });
  return row;
}

export function renderSidePagePanels(page){
  sidePagePanels.innerHTML = '';
  const panels = panelsInPage(page).slice().sort((a, b) => (a.caseNumber || 0) - (b.caseNumber || 0));
  if (panels.length === 0) {
    const hint = document.createElement('div');
    hint.className = 'empty-hint';
    hint.textContent = tr('No panel on this page.', 'Aucune Case dans cette planche.');
    sidePagePanels.appendChild(hint);
    return;
  }
  panels.forEach(p => {
    const row = document.createElement('div');
    row.className = 'planche-case-row' + (S.selectedId === p.id ? ' active' : '');
    const num = document.createElement('span');
    num.className = 'planche-case-num';
    num.textContent = String(p.caseNumber || '?');
    const desc = document.createElement('span');
    desc.className = 'planche-case-desc';
    desc.textContent = p.description || noDescriptionLabel();
    row.appendChild(num);
    row.appendChild(desc);
    // Clicking the row (without dragging) selects this Panel on the canvas, like for Element
    // rows, handy for finding it, in addition to the requested listing/reordering.
    row.addEventListener('click', () => {
      S.selectedId = p.id;
      S.selectedRoomId = null;
      drawCurrentPage();
    });
    row.draggable = true;
    row.addEventListener('dragstart', (e) => {
      S.draggedPageThumbnail = p.id;
      e.dataTransfer.effectAllowed = 'move';
    });
    row.addEventListener('dragover', (e) => {
      if (!S.draggedPageThumbnail) return;
      e.preventDefault();
      const rect = row.getBoundingClientRect();
      const before = (e.clientY - rect.top) < rect.height / 2;
      row.classList.toggle('drag-over-top', before);
      row.classList.toggle('drag-over-bottom', !before);
    });
    row.addEventListener('dragleave', () => row.classList.remove('drag-over-top', 'drag-over-bottom'));
    row.addEventListener('dragend', () => { S.draggedPageThumbnail = null; });
    row.addEventListener('drop', (e) => {
      e.preventDefault(); e.stopPropagation();
      const rect = row.getBoundingClientRect();
      const before = (e.clientY - rect.top) < rect.height / 2;
      row.classList.remove('drag-over-top', 'drag-over-bottom');
      const draggedId = S.draggedPageThumbnail;
      S.draggedPageThumbnail = null;
      if (!draggedId || draggedId === p.id) return;
      const sorted = panelsInPage(page).slice().sort((a, b) => (a.caseNumber || 0) - (b.caseNumber || 0));
      const draggedObj = sorted.find(o => o.id === draggedId);
      if (!draggedObj) return;
      const fromIdx = sorted.indexOf(draggedObj);
      const toIdx = sorted.indexOf(p);
      let insertIdx = toIdx + (before ? 0 : 1);
      if (fromIdx < insertIdx) insertIdx -= 1; // compensates for the removal of the dragged Panel from the list
      if (insertIdx === fromIdx) return; // dropped adjacent to its own position: no change
      _snapshot();
      setPanelNumber(page, draggedObj, insertIdx + 1);
      drawCurrentPage();
    });
    sidePagePanels.appendChild(row);
  });
}

// Renamed to an internal function (updateSidePanel becomes a wrapper just below): cf. the FIX
// above on _restoreSectionCollapseStates, which must run after EVERY call to
// updateSidePanel() regardless of its exit point (several `return`s below).
function updateSidePanelImpl(){
  const page = currentPage();
  const selRaw = page.objects.find(o => o.id === S.selectedId);
  // The right-hand panel (Dimensions / Elements / Description) must stay displayed as long as we're
  // "inside" a panel, even when the selected object is an Element (persona/object) of
  // that panel rather than the panel itself: otherwise, selecting an Element in the
  // "Elements" list would immediately make that list disappear (nothing left to double-click), and the
  // next click would fall through to the canvas, giving the impression of selecting the Panel.
  const sel = (selRaw && (selRaw.type === 'panel' || selRaw.type === 'bulle')) ? selRaw
    : (selRaw && (selRaw.type === 'perso' || selRaw.type === 'objet3d')) ? homeOwningPanel(selRaw, page)
    : (selRaw && selRaw.type === 'tracé') ? page.objects.find(p => p.id === selRaw.panelId && p.type === 'panel') || null
    : null;
  if (sel) S.helpPanelDismissed = false;
  if (sel && sel.type === 'panel' && sel.cameraMode) {
    // In Camera mode, the Panel's usual right-hand menu (Dimensions/Elements/Description) is
    // replaced by the Camera menu (sensitivities + rotation sliders), cf. user request:
    // "on the right it should no longer be the Panel's menu but a new menu, the Camera's".
    S.sideDescTarget = null;
    S.sideCameraTarget = sel;
    panelMenuHeader.style.display = 'none';
    bubbleMenuHeader.style.display = 'none';
    helpMenuHeader.style.display = 'none';
    pageMenuHeader.style.display = 'none';
    sidePagePanelsSection.style.display = 'none';
    sidePageBgSection.style.display = 'none';
    sideDimsSection.style.display = 'none';
    sideStackSection.style.display = 'none';
    sideBubbleStackSection.style.display = 'none';
    sideBorderSection.style.display = 'none';
    sideGroundSection.style.display = 'none';
    sideLightSection.style.display = 'none';
    sideImageSection.style.display = 'none';
    sideCadrageSection.style.display = 'none';
    sidePersonasSection.style.display = 'none';
    sideBubbleAppearanceSection.style.display = 'none';
    sideBubbleBorderSection.style.display = 'none';
    sideDescSection.style.display = 'none';
    sideHelpSection.style.display = 'none';
    sideCameraSection.style.display = 'block';
    refreshCameraSliders(sel);
    renderSideCameraGizmo(sel);
    refreshSceneTopDownBtn(sel);
    return;
  }
  S.sideCameraTarget = null;
  sideCameraSection.style.display = 'none';
  if (sel && sel.type === 'panel') {
    // A Scene's locked canvas (cf. isLockedScenePanel) is not a Panel: its header
    // therefore shows "Scène" rather than "Case", and its "Dimensions" section (edges in mm) doesn't
    // make sense for it (it has no separate Page format to speak of), per user request.
    const isSceneCanvas = isLockedScenePanel(sel);
    // For a Scene's canvas, the menu title is that Scene's NAME (not just a generic "Scène")
    // — per user request, more informative when several Scenes exist.
    if (isSceneCanvas) {
      const editingScene = S.scenes.find(s => s.id === S.editingSceneId);
      panelMenuTitle.textContent = (editingScene && editingScene.name) || (S.appLang === 'en' ? 'Scene' : 'Scène');
    } else {
      panelMenuTitle.textContent = S.appLang === 'en' ? 'Panel' : 'Case';
    }
    // The Panel's number within its Page (cf. caseNumber), shown right next to the "Case" title
    // rather than in a dedicated section, per user request.
    if (!isSceneCanvas) {
      ensurePanelNumbers(page);
      panelMenuNumber.textContent = ' ' + (sel.caseNumber || 1);
    } else {
      panelMenuNumber.textContent = '';
    }
    panelMenuHeader.style.display = 'grid';
    bubbleMenuHeader.style.display = 'none';
    helpMenuHeader.style.display = 'none';
    pageMenuHeader.style.display = 'none';
    sidePagePanelsSection.style.display = 'none';
    sidePageBgSection.style.display = 'none';
    if (S.sideDescTarget !== sel) {
      S.sideDescTarget = sel;
      sideDescInput.value = sel.description || '';
      S.sideDescSnapshotTaken = false;
    }
    sideDescTitle.textContent = 'Description';
    sideDescInput.placeholder = isSceneCanvas
      ? tr('Describe what this scene represents…', 'Décrivez ce que représente cette scène…')
      : tr('Describe what happens in this panel...', 'Décrivez ce qui se passe dans cette case...');
    sideBubbleFontWrap.style.display = 'none';
    sideBubbleFontSizeWrap.style.display = 'none';
    descEmptyHint.style.display = 'none';
    sideDescInput.style.display = 'block';
    sideDescSection.style.display = 'block';
    sideHelpSection.style.display = 'none';
    if (isSceneCanvas) {
      sideDimsSection.style.display = 'none';
      sideStackSection.style.display = 'none';
      sideBubbleStackSection.style.display = 'none';
    } else {
      const ratio = pxPerMm(page.format);
      sideDims.innerHTML = edgeLengths(sel)
        .map(e => `<span class="dim-chip">${e.label} <b>${Math.round(e.len / ratio)}</b> mm</span>`)
        .join('');
      sideDims.style.display = 'flex';
      sideDimsSection.style.display = 'block';
      // The Panel's stacking level relative to the OTHER Panels of this Page (stacking
      // order = order in page.objects, same order as Bring forward/Send backward and as the
      // rendering anchor in drawContent), dedicated section between Dimensions and Elements, per
      // user request, to visually understand which Panel is "in front" when several
      // overlap.
      const panelsInOrder = page.objects.filter(o => o.type === 'panel' && !isLockedScenePanel(o));
      const rank = panelsInOrder.indexOf(sel) + 1;
      const total = panelsInOrder.length;
      sideBubbleStackSection.style.display = 'none';
      if (total > 1) {
        const pos = stackRankLabel(rank, total);
        sideStackLevel.textContent = `${rank} / ${total} (${pos})`;
        sideStackSection.style.display = 'block';
      } else {
        sideStackSection.style.display = 'none';
      }
    }
    // "Border" section (cf. o.borderVisible/o.borderColor), per user request, right after
    // Dimensions/Stacking level, before the Elements list. Doesn't make sense for a Scene's
    // canvas (which never has a drawn border): section hidden in that case, per user
    // request.
    if (isSceneCanvas) {
      sideBorderSection.style.display = 'none';
    } else {
      sideBorderToggle.checked = sel.borderVisible !== false;
      sideBorderColorInput.value = sel.borderColor || '#23242a';
      sideBorderWidthSelect.value = sel.borderWidth || 2.25;
      sideBorderColorWrap.style.display = sideBorderToggle.checked ? 'block' : 'none';
      sideBorderWidthWrap.style.display = sideBorderToggle.checked ? 'block' : 'none';
      sideBorderSection.style.display = 'block';
    }
    // ⚠️ UNE CASE À IMAGE REMPLACE Sol ET Éléments PAR Image, elle ne les complète pas (#403c).
    // Ces deux sections règlent un décor 3D que cette Case n'a pas : les laisser proposerait des
    // réglages sans effet, ce qui est pire que de ne rien proposer.
    if (casePorteUneImage3D(sel)) {
      sideImageName.textContent = imageDeLaCase3D(sel);
      // Le curseur et le bouton lisent la Case, jamais leur propre état : rouvrir la fiche d'une
      // autre Case doit montrer SON cadrage, pas celui de la précédente.
      const zoom = zoomDeLImage3D(sel);
      sideImageZoomInput.value = String(zoom);
      sideImageZoomValue.textContent = S.appLang === 'en'
        ? zoom.toFixed(1) : zoom.toFixed(1).replace('.', ',');
      // « Recentrer » n'a de sens que s'il a quelque chose à défaire (cf. cadrageParDefaut3D).
      sideImageResetBtn.style.display = cadrageParDefaut3D(sel) ? 'none' : 'block';
      sideImageSection.style.display = 'block';
      // Cadrage suit Image, toujours : sans image, il n'y a rien à cadrer, et une section de
      // réglages sans objet est pire que pas de section du tout.
      sideCadrageSection.style.display = 'block';
      sideGroundSection.style.display = 'none';
      sideLightSection.style.display = 'none';
      sidePersonasSection.style.display = 'none';
      sideBubbleAppearanceSection.style.display = 'none';
      sideBubbleBorderSection.style.display = 'none';
      return;
    }
    sideImageSection.style.display = 'none';
    sideCadrageSection.style.display = 'none';
    // Ground section : floor plan texture type for this Panel/Scene
    {
      const currentGroundType = sel.groundType || 'herbe';
      sideGroundGrid.innerHTML = '';
      GROUND_TYPE_DEFS.forEach(def => {
        const btn = document.createElement('button');
        btn.className = 'sol-ground-btn' + (def.id === currentGroundType ? ' active' : '');
        btn.innerHTML = `<span class="sol-ground-swatch" style="background:${def.swatch}"></span>${libelleTable3D(def, tr)}`;
        // mousedown rather than click: window.addEventListener('mouseup') calls drawCurrentPage()
        // on EVERY mouseup, which rebuilds the buttons (sideGroundGrid.innerHTML='') before
        // the click is emitted. Chromium doesn't fire click on a DOM-detached node.
        // Same workaround as for the Element rows (cf. renderSideElementRow).
        btn.addEventListener('mousedown', (e) => {
          e.preventDefault();
          e.stopPropagation();
          _snapshot();
          sel.groundType = def.id;
          panelSceneCache3D.delete(sel.id);
          drawCurrentPage();
        });
        sideGroundGrid.appendChild(btn);
      });
      sideGroundSection.style.display = 'block';
      sideLightSection.style.display = 'block';
      rafraichirSectionLumiere();
    }
    renderSidePersonas(sel, page);
    sidePersonas.style.display = 'flex';
    sidePersonasSection.style.display = 'block';
    sideBubbleAppearanceSection.style.display = 'none';
    sideBubbleBorderSection.style.display = 'none';
  } else if (sel && sel.type === 'bulle') {
    // A speech Bubble has neither border dimensions nor contained Elements: only its text
    // (description) is edited here, like for a Panel, plus the option to show/hide its
    // tail (shown by default) and the choice of its shape (Oval by default, or Rectangle).
    panelMenuHeader.style.display = 'none';
    bubbleMenuHeader.style.display = 'grid';
    helpMenuHeader.style.display = 'none';
    pageMenuHeader.style.display = 'none';
    sidePagePanelsSection.style.display = 'none';
    sidePageBgSection.style.display = 'none';
    if (S.sideDescTarget !== sel) {
      S.sideDescTarget = sel;
      sideDescInput.value = sel.description || '';
      S.sideDescSnapshotTaken = false;
    }
    sideDescTitle.textContent = 'Texte';
    sideDescInput.placeholder = tr('Write the bubble content', 'Écrivez le contenu de la bulle');
    sideBubbleFontWrap.style.display = 'block';
    sideBubbleFontSelect.value = sel.bulleFont || BUBBLE_FONT_DEFAULT;
    document.getElementById('sideBubbleTextColorWrap').style.display = 'block';
    sideBubbleFontSizeWrap.style.display = 'block';
    const fontSizePct = Math.round((sel.bulleFontScale != null ? sel.bulleFontScale : 1) * 100);
    sideBubbleFontSizeInput.value = fontSizePct;
    sideBubbleFontSizeValue.textContent = fontSizePct;
    descEmptyHint.style.display = 'none';
    sideDescInput.style.display = 'block';
    sideDescSection.style.display = 'block';
    sideHelpSection.style.display = 'none';
    sideDimsSection.style.display = 'none';
    sideBorderSection.style.display = 'none';
    sideGroundSection.style.display = 'none';
    sideLightSection.style.display = 'none';
    // QUATRIÈME BRANCHE, trouvée par le test et non par moi : sélectionner une Bulle après une Case
    // à image laissait cette image annoncée en haut du panneau, au-dessus des réglages de la Bulle.
    // Le rapport utilisateur ne portait que sur le clic hors Planche ; l'invariant en couvre trois.
    sideImageSection.style.display = 'none';
    sideCadrageSection.style.display = 'none';
    // The Bubble's stacking level relative to the OTHER Bubbles of this Page, same logic
    // as for a Panel (cf. the "panel" branch above), per user request.
    {
      const bubblesInOrder = page.objects.filter(o => o.type === 'bulle');
      const rank = bubblesInOrder.indexOf(sel) + 1;
      const total = bubblesInOrder.length;
      sideStackSection.style.display = 'none';
      if (total > 1) {
        const pos = stackRankLabel(rank, total);
        sideBubbleStackLevel.textContent = `${rank} / ${total} (${pos})`;
        sideBubbleStackSection.style.display = 'block';
      } else {
        sideBubbleStackSection.style.display = 'none';
      }
    }
    sidePersonasSection.style.display = 'none';
    sideBubbleAppearanceSection.style.display = 'block';
    sideBubbleBorderSection.style.display = 'block';
    sideBubbleBorderToggle.checked = sel.bulleBorderVisible !== false;
    sideBubbleBorderWidthSelect.value = sel.bulleBorderWidth || 2.25;
    sideBubbleBorderColorInput.value  = sel.bulleBorderColor  || '#23242a';
    sideBubbleBorderWidthWrap.style.display  = sideBubbleBorderToggle.checked ? 'block' : 'none';
    sideBubbleBorderColorWrap.style.display  = sideBubbleBorderToggle.checked ? 'block' : 'none';
    sideBubbleTailToggle.checked = sel.tailVisible !== false;
    sideBubbleShapeSelect.value = sel.bulleShape === 'rect' ? 'rect' : 'ovale';
    const paddingPct = Math.round((sel.bullePadding != null ? sel.bullePadding : BUBBLE_PADDING_DEFAULT) * 100);
    sideBubblePaddingInput.value = paddingPct;
    sideBubblePaddingValue.textContent = paddingPct;
    document.getElementById('sideBubbleBgColorInput').value   = sel.bulleColor     || '#ffffff';
    document.getElementById('sideBubbleTextColorInput').value = sel.bulleTextColor || '#23242a';
  } else {
    S.sideDescTarget = null;
    descEmptyHint.style.display = 'block';
    sideDescInput.style.display = 'none';
    sideBubbleFontWrap.style.display = 'none';
    document.getElementById('sideBubbleTextColorWrap').style.display = 'none';
    sideBubbleFontSizeWrap.style.display = 'none';
    sideDimsSection.style.display = 'none';
    sideStackSection.style.display = 'none';
    sideBubbleStackSection.style.display = 'none';
    sideBorderSection.style.display = 'none';
    sideGroundSection.style.display = 'none';
    sideLightSection.style.display = 'none';
    // ⚠️ SIGNALÉ À L'USAGE : la section Image restait en haut du panneau droit après un clic hors de
    // la Planche, au-dessus du Manuel. Elle n'était masquée que sur le chemin « Case SANS image »,
    // pas sur ceux où plus rien n'est sélectionné. Elle appartient à la même famille que Sol et
    // Éléments : ce qui les cache doit la cacher, et un test le déduit désormais du source.
    sideImageSection.style.display = 'none';
    sideCadrageSection.style.display = 'none';
    sidePersonasSection.style.display = 'none';
    sideBubbleAppearanceSection.style.display = 'none';
    sideBubbleBorderSection.style.display = 'none';
    sideDescSection.style.display = 'none';
    panelMenuHeader.style.display = 'none';
    bubbleMenuHeader.style.display = 'none';
    // Nothing selected on the canvas (Panel/Bubble): if a Page has been explicitly
    // selected (cf. S.pageSelected, renderTree) and we're not in the Scene editor, the
    // "Page" menu is shown (list of its Panels, reorderable) rather than the Manual, per user
    // request. Deselecting the current Panel/Bubble (click in empty space) therefore falls back here rather
    // than to the Manual, since the user is still "inside" the Page.
    if (S.pageSelected && !S.editingSceneId) {
      helpMenuHeader.style.display = 'none';
      sideHelpSection.style.display = 'none';
      pageMenuHeader.style.display = 'grid';
      // Number of the displayed Page (its position within its Volume), shown next to the "Planche" title,
      // same style as the Panel's number in its own menu, per user request.
      pageMenuNumber.textContent = ' ' + (S.currentPageIndex + 1);
      ensurePanelNumbers(page);
      renderSidePagePanels(page);
      sidePagePanelsSection.style.display = 'block';
      // "Background" section (cf. pd.bgColor), per user request. pd rather than `page`
      // (synthetic, cf. currentPage()) since it's the actually persisted object that needs modifying.
      sidePageBgColorInput.value = page.bgColor || '#ffffff';
      sidePageBgSection.style.display = 'block';
      rightPanel.classList.remove('collapsed');
      return;
    }
    pageMenuHeader.style.display = 'none';
    sidePagePanelsSection.style.display = 'none';
    sidePageBgSection.style.display = 'none';
    if (S.helpPanelDismissed) {
      // The user explicitly closed the user Manual (cf. helpMenuCloseBtn): the right-hand
      // panel stays entirely empty as long as nothing is selected, rather than immediately
      // making the Manual reappear, per user request ("the right-hand menu must
      // disappear"). Also, the panel must no longer reserve its width (280px) once empty: it's
      // collapsed entirely to free up space for the canvas, per user request
      // ("this must completely remove the space to the right of the application").
      helpMenuHeader.style.display = 'none';
      sideHelpSection.style.display = 'none';
      rightPanel.classList.add('collapsed');
      return;
    } else {
      // No Element selected: no Text/Description to show, the user Manual is shown instead
      // (same content as the menu of the application title's "?" button).
      helpMenuHeader.style.display = 'grid';
      sideHelpSection.style.display = 'block';
    }
  }
  rightPanel.classList.remove('collapsed');
}

/**
 * Afficher / masquer le Manuel dans le panneau droit.
 *
 * POURQUOI CES DEUX FONCTIONS EXISTENT PLUTÔT QUE DEUX PAIRES D'AFFECTATIONS. Le bouton « ? » est
 * un BASCULEUR : il lit l'état affiché et l'inverse. Or l'Éditeur de modèle recouvre le panneau
 * droit, l'utilisateur qui cliquait « ? » depuis l'éditeur agissait sur un état qu'il ne voyait
 * pas, et refermait le Manuel qu'il croyait ouvrir. La sortie de l'éditeur doit donc pouvoir dire
 * « AFFICHE le Manuel », sans basculer.
 *
 * Nommer l'action au lieu de recopier les deux affectations chez l'appelant : c'est la même paire
 * de drapeaux qu'`updateSidePanel` relit juste en dessous, et deux endroits qui les posent
 * séparément finiraient par ne plus s'accorder sur ce que « affiché » veut dire.
 */
export function afficherManuelLateral(){
  // ⚠️ TROIS NIVEAUX DE PRIORITÉ, PAS DEUX. `updateSidePanel` choisit dans cet ordre : la fiche de
  // l'Élément sélectionné, puis le menu de la Planche (S.pageSelected), puis le Manuel. Je n'avais
  // levé que le premier, si bien que cliquer « ? » avec le menu Planche ouvert ne faisait RIEN de
  // visible, le Manuel était bien « autorisé », mais la Planche passait devant.
  //
  // Afficher le Manuel, c'est donc libérer TOUS les niveaux au-dessus de lui.
  S.selectedId = null;
  S.pageSelected = false;
  S.helpPanelDismissed = false;
}

export function masquerManuelLateral(){
  S.helpPanelDismissed = true;
}

/**
 * Le Manuel est-il À L'ÉCRAN ?
 *
 * ⚠️ ON LIT LE DOM, PAS LES DRAPEAUX. C'est délibéré, et c'est la leçon du défaut ci-dessus : une
 * condition qui recopie l'arbitrage d'`updateSidePanel` en oublie une branche tôt ou tard, et le
 * bouton « ? » se met alors à basculer un état que personne ne voit. La visibilité réelle de la
 * section, elle, ne peut pas diverger de ce qui est affiché.
 *
 * `#sideHelpSection` part de `display:none` dans index.html et `updateSidePanel` n'y écrit ensuite
 * que 'block' ou 'none' : la chaîne vide, ambiguë, ne se produit pas.
 */
export function manuelEstAffiche(){
  return sideHelpSection.style.display !== 'none';
}

export function updateSidePanel(){
  updateSidePanelImpl();
  if (_restoreSectionCollapseStates) _restoreSectionCollapseStates();
}

export function refreshCameraSliders(panel){
  const sensRot = Math.round((panel.camRotSensitivity != null ? panel.camRotSensitivity : 1) * 100);
  const sensPan = Math.round((panel.camPanSensitivity != null ? panel.camPanSensitivity : 1) * 100);
  camSensRotInput.value = sensRot; camSensRotValue.textContent = sensRot;
  camSensPanInput.value = sensPan; camSensPanValue.textContent = sensPan;
  const rotYDeg = Math.round((panel.camRotY || 0) * 180 / Math.PI);
  const rotXDeg = Math.round((panel.camRotX || 0) * 180 / Math.PI);
  camRotYInput.value = rotYDeg; camRotYValue.textContent = rotYDeg;
  camRotXInput.value = rotXDeg; camRotXValue.textContent = rotXDeg;
  // Populates the "Rotation center" selector with this panel's Elements (perso + objet3d).
  // Walls belonging to the same Room are grouped into a single "Room: [label]" entry.
  const page = currentPageData();
  const elems = page.objects.filter(o => o.homePanelId === panel.id && (o.type === 'perso' || o.type === 'objet3d'));
  // Extract the distinct Rooms (identified by pieceId) and the elements outside any Room
  const seenRooms = new Set();
  const options = [{ value: '', label: 'Aucun (caméra libre)' }];
  for (const o of elems) {
    if (o.pieceId) {
      if (!seenRooms.has(o.pieceId)) {
        seenRooms.add(o.pieceId);
        options.push({ value: 'piece:' + o.pieceId, label: '🏠 ' + (o.pieceLabel || o.pieceId) });
      }
    } else {
      const icon = o.type === 'perso' ? '🧍' : (OBJECT_TYPE_EMOJI[o.objType] || '📦');
      options.push({ value: 'el:' + o.id, label: icon + ' ' + (o.name || o.id) });
    }
  }
  // Rebuild the select's options only if they changed (avoids unnecessary flicker)
  camOrbitTargetSelect.innerHTML = '';
  for (const opt of options) {
    const el = document.createElement('option');
    el.value = opt.value; el.textContent = opt.label;
    camOrbitTargetSelect.appendChild(el);
  }
  camOrbitTargetSelect.value = panel.camOrbitTargetId || '';
  // If the stored value no longer exists (element deleted), fall back to "None"
  if (camOrbitTargetSelect.value !== (panel.camOrbitTargetId || '')) {
    panel.camOrbitTargetId = null;
    camOrbitTargetSelect.value = '';
  }
}

export function renderSideCameraGizmo(panel){
  if (!sideCameraGizmoCanvas) return;
  const ctx = sideCameraGizmoCanvas.getContext('2d');
  const w = sideCameraGizmoCanvas.width, h = sideCameraGizmoCanvas.height;
  ctx.clearRect(0, 0, w, h);
  drawAxisGizmoAt(ctx, w / 2, h / 2, 32, panel);
}

export function refreshSceneTopDownBtn(panel){
  if (!sceneTopDownBtn) return;
  if (!isLockedScenePanel(panel)) {
    sceneTopDownBtn.style.display = 'none';
    return;
  }
  // The visual state (pressed/not, label) is now based on the Camera's REAL angle (cf.
  // isSceneTopDownView), not on panel._topDownActive alone: the latter was only updated by
  // clicking this button, so it stayed "active" even after manually rotating the Camera out of
  // the top-down view (dragging in Camera Mode, sliders, 3D gizmo...), the button then appeared
  // permanently pressed while the Camera was no longer in top-down view at all, which misled the
  // user about drag-and-drop behavior (meant to change axis ONLY in a real top-down
  // view), per user report.
  const isTD = isSceneTopDownView(panel);
  sceneTopDownBtn.style.display = 'block';
  sceneTopDownBtn.classList.toggle('active', isTD);
  sceneTopDownBtn.textContent = isTD ? '📐 ' + tr('Top-down view (click to go back)', 'Vue de dessus (cliquer pour revenir)') : '📐 Vue de dessus';
}

export function closeRightPanelMenu(){
  S.selectedId = null;
  drawCurrentPage();
}

/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * LA SECTION LUMIÈRE : UN SEUL ENDROIT QUI L'AFFICHE (#414d)
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ IL VIT ICI ET NON DANS events.js, ET CE N'EST PAS UN CHOIX DE RANGEMENT. C'est le panneau
 * latéral qui sait QUAND la sélection change ; events.js importe déjà sidebar.js, et l'inverse
 * ferait un cycle d'imports (cf. docs/en/architecture.md).
 *
 * ⚠️ UN SEUL ENDROIT REMPLIT LA SECTION. Sans cette règle, chaque écouteur finirait par recopier
 * l'affichage à sa façon, et les quatre états divergeraient les uns des autres — le genre de défaut
 * qui ne se voit qu'en enchaînant les gestes dans un ordre inhabituel.
 *
 * L'affichage progressif est ici, pas dans le CSS : en Jour ou en Nuit, le dôme, la couleur et
 * l'intensité disparaissent, parce qu'ils montreraient des valeurs qu'on ne peut pas changer, ce
 * qui se lit comme une panne.
 */
export function rafraichirSectionLumiere(){
  const cible = S.sideDescTarget;
  if (!cible || cible.type !== 'panel') return;
  const l = lumiereDeCase3D(cible);
  sideLightCustom.style.display = l.mode === 'perso' ? 'block' : 'none';
  // ⚠️ HORS DE L'AFFICHAGE PROGRESSIF : les ombres sont un axe indépendant du mode (#422e). Une
  // Case en Jour doit pouvoir en avoir sans passer en Personnalisé.
  sideLightShadowsCheckbox.checked = l.ombresPortees;
  sideLightModeSelect.value = l.mode;
  sideLightColorInput.value = l.couleur;
  const pourcent = Math.round(l.intensite * 100);
  sideLightIntensityRange.value = String(pourcent);
  // L'unité se traduit, comme celle du curseur de mémoire de la Configuration.
  sideLightIntensityValue.textContent = `${pourcent} %`;
  // Il ne paraît que s'il a quelque chose à défaire : une Case sans champ EST déjà à l'état de base.
  sideLightResetBtn.style.display = cible.lumiere ? 'block' : 'none';
  dessinerDomeLumiere3D(l);
}

/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * LE DÔME (#414e) : DU DESSIN, ET RIEN QUE DU DESSIN
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Toute la géométrie vient de `projeterSurDome3D` (lighting-3d.js), pure et testée. Ici on ne fait
 * que tracer, et c'est délibéré : ce qui se calcule doit être testable sous Node, ce qui se dessine
 * ne le sera jamais.
 *
 * ⚠️ LA SILHOUETTE EST UN DEMI-CERCLE POSÉ SUR UNE ELLIPSE, ET CES DEUX FORMES SONT DÉDUITES DE LA
 * PROJECTION, pas choisies. L'horizon, à élévation nulle, se projette en une ellipse de demi-axes 1
 * et sin(inclinaison) : c'est la base plate. Le reste de l'hémisphère tient dans le cercle unité :
 * c'est la coupole. Changer l'inclinaison de vue redessine donc les deux du même coup, sans qu'on
 * ait rien à réajuster à la main.
 *
 * ⚠️ LES COULEURS SE LISENT SUR `document.body`, PAS SUR `documentElement`. Les jetons de thème sont
 * redéfinis par `body.theme-light` et `body.theme-contraste` (cf. #409c) : les lire sur la racine
 * rendrait toujours la variante sombre, et le dôme resterait sombre en thème Clair.
 */
function jetonDeTheme3D(nom, repli){
  try {
    const v = getComputedStyle(document.body).getPropertyValue(nom).trim();
    return v || repli;
  } catch { return repli; }
}

export function dessinerDomeLumiere3D(lumiere){
  if (!sideLightDomeCanvas || !sideLightDomeCanvas.getContext) return;
  const ctx = sideLightDomeCanvas.getContext('2d');
  if (!ctx) return;
  const w = sideLightDomeCanvas.width, h = sideLightDomeCanvas.height;
  ctx.clearRect(0, 0, w, h);

  // La géométrie vient de `geometrieDome3D`, PARTAGÉE avec le test de clic : deux copies de la même
  // formule finiraient par diverger, et le point tomberait à côté du curseur.
  const { cx, cy, R, sinP } = geometrieDome3D(w, h);

  const p = projeterSurDome3D(lumiere.azimut, lumiere.elevation, S.lightDomeRotation || 0);
  const sx = cx + p.u * R, sy = cy - p.v * R;

  // ⚠️ CES DEUX JETONS ONT CHANGÉ AVEC LE FOND (#414l), ET C'EST LA MESURE QUI LES A CHOISIS. Le
  // dôme ne se dessine plus sur le papier 3D clair mais sur celui de sa section, `--paper`. Contre
  // ce fond, `--line-strong` tombait à 2,09 en thème Sombre, sous le seuil de 3 que WCAG 1.4.11
  // demande au contour d'un composant qu'on manipule ; `--ink-soft` tient 6,10 / 3,82 / 13,55 /
  // 11,37 dans les quatre palettes.
  //
  // Le remplissage passe de `--paper-dark` à `--creux` pour la même raison : sur son ancien fond
  // clair il valait 1,14 en thème Clair et 1,02 en contraste clair, c'est à dire un dôme sans
  // corps. Il reste DÉLIBÉRÉMENT discret, entre 1,07 et 1,19 selon le thème : c'est le CONTOUR qui
  // porte la forme, le remplissage ne sert qu'à voiler un soleil passé derrière la coupole.
  const trait = jetonDeTheme3D('--ink-soft', '#9A9AA2');
  const fond = jetonDeTheme3D('--creux', '#0E0F12');

  const dessinerSoleil = (alpha) => {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.beginPath(); ctx.arc(sx, sy, 6, 0, Math.PI * 2);
    ctx.fillStyle = lumiere.couleur; ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = trait; ctx.stroke();
    ctx.restore();
  };

  // Un soleil DERRIÈRE se dessine avant la coupole, qui le voile ensuite : il reste visible, et sa
  // position reste lisible. Le faire disparaître donnerait l'impression d'un réglage perdu.
  if (!p.devant) dessinerSoleil(0.85);

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, R, Math.PI, Math.PI * 2);
  ctx.ellipse(cx, cy, R, R * sinP, 0, 0, Math.PI);
  ctx.closePath();
  ctx.globalAlpha = 0.55; ctx.fillStyle = fond; ctx.fill();
  ctx.globalAlpha = 1; ctx.lineWidth = 1.5; ctx.strokeStyle = trait; ctx.stroke();
  ctx.restore();

  // L'arrière de la base en pointillé : c'est ce qui donne le volume.
  ctx.save();
  ctx.setLineDash([3, 3]); ctx.lineWidth = 1; ctx.strokeStyle = trait; ctx.globalAlpha = 0.7;
  ctx.beginPath(); ctx.ellipse(cx, cy, R, R * sinP, 0, Math.PI, Math.PI * 2); ctx.stroke();
  ctx.restore();

  // ⚠️ LES REPÈRES DE LA BASE, ET C'EST UN RETOUR D'USAGE QUI LES A AMENÉS. Un dôme nu est
  // parfaitement symétrique : le tourner ne déplaçait VISIBLEMENT que le soleil, et quand celui-ci
  // est haut, presque rien ne bougeait. Le geste paraissait sans effet. Ces huit repères, posés à
  // des azimuts fixes du MONDE, glissent le long de la base quand la vue tourne : c'est eux qui
  // rendent la rotation lisible, pas le soleil.
  //
  // Celui de l'azimut zéro est plus long : sans un repère distinct des autres, huit traits
  // identiques disent qu'on tourne, mais pas de combien ni dans quel sens.
  // Les repères INTERMÉDIAIRES, aux azimuts à 45° des cardinaux : ils densifient la graduation sans
  // ajouter de texte à lire.
  ctx.save();
  ctx.lineWidth = 1.5; ctx.strokeStyle = trait;
  for (const a of [45, 135, 225, 315]) {
    const q = projeterSurDome3D(a, 0, S.lightDomeRotation || 0);
    const bx = cx + q.u * R, by = cy - q.v * R;
    ctx.globalAlpha = q.devant ? 0.8 : 0.25;
    // Le repère pointe vers l'EXTÉRIEUR : la direction du centre vers le point, en pixels d'écran,
    // ramenée à une longueur de 1. En repartant des coordonnées normalisées on obtiendrait une
    // direction juste dans le repère du dôme mais fausse à l'écran, l'ellipse étant aplatie.
    const dx = bx - cx, dy = by - cy;
    const n = Math.hypot(dx, dy) || 1;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(bx + (dx / n) * 4, by + (dy / n) * 4);
    ctx.stroke();
  }
  ctx.restore();

  // ⚠️ LES POINTS CARDINAUX, ET LEUR LETTRE SE TRADUIT. « O » en français, « W » en anglais : une
  // lettre écrite en dur laisserait un O au milieu d'une interface anglaise, et personne ne le
  // signalerait avant longtemps. Les azimuts, eux, sont dérivés de la caméra par défaut d'une Case
  // (cf. AZIMUTS_CARDINAUX) : ce qui s'éloigne est au nord, ce qui vient vers nous est au sud.
  //
  // ⚠️ LES LETTRES PORTENT L'ENCRE PRINCIPALE, PAS `--ink-soft`, ET C'EST UN CHOIX DE RÔLE (#414k).
  // Demandées « plus foncées », elles ont changé de JETON et non de valeur : `--ink-soft` est la
  // couleur des légendes, `--ink` celle du texte qu'on lit. Prendre littéralement « plus foncé »
  // aurait dégradé le thème Sombre, où assombrir c'est se rapprocher du fond. Mesuré sur le papier
  // du panneau : 5,69 → 13,59 en Sombre, 3,34 → 10,55 en Clair.
  //
  // Le NORD a sa propre couleur, par jeton de thème : un seul rouge ne tient pas sur les deux
  // papiers (cf. le commentaire de `--nord-boussole` dans style.css).
  const LETTRES = { N: tr('N', 'N'), E: tr('E', 'E'), S: tr('S', 'S'), O: tr('W', 'O') };
  const encre = jetonDeTheme3D('--ink', '#EDEDEF');
  const encreNord = jetonDeTheme3D('--nord-boussole', '#E85B45');
  ctx.save();
  ctx.font = '600 10px sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  AZIMUTS_CARDINAUX.forEach(({ cle, azimut }) => {
    const q = projeterSurDome3D(azimut, 0, S.lightDomeRotation || 0);
    const bx = cx + q.u * R, by = cy - q.v * R;
    const dx = bx - cx, dy = by - cy;
    const n = Math.hypot(dx, dy) || 1;
    // Un point cardinal derrière le dôme reste lisible, juste estompé : le faire disparaître ferait
    // croire qu'il n'y en a que deux ou trois.
    ctx.globalAlpha = q.devant ? 1 : 0.4;
    ctx.fillStyle = cle === 'N' ? encreNord : encre;
    ctx.fillText(LETTRES[cle], bx + (dx / n) * 8, by + (dy / n) * 8);
  });
  ctx.restore();

  if (p.devant) dessinerSoleil(1);
}
