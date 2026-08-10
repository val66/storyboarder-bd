const { app, BrowserWindow, Menu, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

// Dossier "Projets" proposé par défaut pour l'enregistrement/le chargement : situé à côté de
// l'exécutable installé (donc visible/accessible facilement depuis le dossier d'installation), ou à
// côté de main.js en développement (npm start, app non packagée).
const defaultProjectsDir = app.isPackaged
  ? path.join(path.dirname(app.getPath('exe')), 'Projets')
  : path.join(__dirname, 'Projets');

// Mémorise le chemin du dernier fichier de Projet ouvert/enregistré, ainsi que les réglages de
// l'Application (cf. modale Configuration dans index.html : délai de sauvegarde automatique, dossier
// des Projets personnalisé, thème) dans le dossier de données utilisateur de l'app — sur demande
// utilisateur. Mis à jour à chaque saveAs/write/rename/open réussi ci-dessous.
const settingsFilePath = path.join(app.getPath('userData'), 'settings.json');

function readSettings() {
  try { return JSON.parse(fs.readFileSync(settingsFilePath, 'utf-8')); } catch (err) { return {}; }
}

// Dossier des Projets effectif : le dossier choisi par l'utilisateur (cf. settings:chooseProjectsDir)
// s'il y en a un, sinon le dossier par défaut ci-dessus — sur demande utilisateur ("possibilité de
// changer le dossier des Projets par défaut").
function getProjectsDir() {
  const { projectsDir } = readSettings();
  return projectsDir || defaultProjectsDir;
}

function ensureProjectsDir() {
  try { fs.mkdirSync(getProjectsDir(), { recursive: true }); } catch (err) { /* ignore */ }
}

function setLastProjectPath(filePath) {
  try {
    const settings = readSettings();
    settings.lastFilePath = filePath;
    fs.writeFileSync(settingsFilePath, JSON.stringify(settings), 'utf-8');
  } catch (err) { /* ignore */ }
}

// Devient true une fois que le renderer a explicitement confirmé qu'il faut fermer (après avoir
// proposé d'enregistrer ou non, cf. 'app:confirmQuit' ci-dessous) — sur demande utilisateur : plutôt
// que d'empêcher la fermeture tant que le Projet n'est pas enregistré, on intercepte la fermeture une
// première fois pour demander au renderer ce qu'il souhaite faire, puis on laisse la seconde tentative
// (déclenchée depuis le renderer lui-même) passer normalement.
let isQuitting = false;

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#F2EBDD',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    autoHideMenuBar: true,
  });

  // Intercepte TOUTE tentative de fermeture de la fenêtre (bouton natif "×", Alt+F4, le bouton "Fermer
  // l'application" de la modale Projet via window.close(), etc.) pour laisser le renderer décider quoi
  // faire s'il reste des modifications non enregistrées (cf. quitConfirmModal dans index.html).
  win.on('close', (e) => {
    if (isQuitting) return;
    e.preventDefault();
    win.webContents.send('app:requestQuitConfirmation');
  });

  Menu.setApplicationMenu(null);

  // F12 ou Ctrl+Shift+I pour ouvrir/fermer les DevTools (débogage)
  win.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12' ||
        (input.control && input.shift && input.key.toLowerCase() === 'i')) {
      win.webContents.toggleDevTools();
    }
  });

  win.loadFile(path.join(__dirname, 'index.html'));
}

// Gestion native des fichiers Projet (.json), cf. preload.js / index.html (section PROJET) : l'API web
// File System Access n'étant pas disponible pour les pages chargées en file://, on passe par les
// boîtes de dialogue Electron (dialog) et le module fs du process principal, exposés au renderer via
// contextBridge dans preload.js. C'est ce qui permet la sauvegarde automatique silencieuse (réécriture
// du même fichier sans reproposer de boîte de dialogue).
ipcMain.handle('project:saveAs', async (event, json, suggestedName) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    defaultPath: path.join(getProjectsDir(), suggestedName || 'Projet.json'),
    filters: [{ name: 'Projet Storyboard BD', extensions: ['json'] }],
  });
  if (canceled || !filePath) return { canceled: true };
  await fs.promises.writeFile(filePath, json, 'utf-8');
  setLastProjectPath(filePath);
  return { canceled: false, filePath };
});

ipcMain.handle('project:write', async (event, filePath, json) => {
  try {
    await fs.promises.writeFile(filePath, json, 'utf-8');
    setLastProjectPath(filePath);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

// Renomme le fichier .json du Projet (cf. confirmRenameProject dans index.html) : le fichier est
// renommé sur disque (même dossier) pour que "Enregistrer" continue d'écrire dans le même fichier
// au lieu de redemander un nouvel emplacement après un renommage.
ipcMain.handle('project:rename', async (event, oldFilePath, newName) => {
  try {
    const safeName = String(newName || 'Projet').replace(/[\\/:*?"<>|]/g, '_');
    const dir = path.dirname(oldFilePath);
    let newFilePath = path.join(dir, `${safeName}.json`);
    if (newFilePath === oldFilePath) return { ok: true, filePath: oldFilePath };
    // Évite d'écraser un fichier existant portant déjà ce nom.
    let counter = 1;
    while (fs.existsSync(newFilePath)) {
      newFilePath = path.join(dir, `${safeName} (${counter}).json`);
      counter++;
    }
    await fs.promises.rename(oldFilePath, newFilePath);
    setLastProjectPath(newFilePath);
    return { ok: true, filePath: newFilePath };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

ipcMain.handle('project:open', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    defaultPath: getProjectsDir(),
    properties: ['openFile'],
    filters: [{ name: 'Projet Storyboard BD', extensions: ['json'] }],
  });
  if (canceled || !filePaths || !filePaths.length) return { canceled: true };
  try {
    const data = await fs.promises.readFile(filePaths[0], 'utf-8');
    setLastProjectPath(filePaths[0]);
    return { canceled: false, filePath: filePaths[0], data };
  } catch (err) {
    return { canceled: true, error: String(err) };
  }
});

// Récupère le dernier Projet ouvert/enregistré (cf. settings.json) pour le rouvrir automatiquement au
// démarrage de l'app (cf. initStartupProject dans index.html) — sur demande utilisateur. Si le fichier
// mémorisé n'existe plus (déplacé/supprimé), on l'ignore silencieusement : l'app retombe alors sur le
// comportement par défaut (nouveau Projet vierge "Projet").
ipcMain.handle('project:getLastProject', async () => {
  const { lastFilePath } = readSettings();
  if (!lastFilePath) return { filePath: null };
  try {
    const data = await fs.promises.readFile(lastFilePath, 'utf-8');
    return { filePath: lastFilePath, data };
  } catch (err) {
    return { filePath: null };
  }
});

// Accès générique au même fichier settings.json (cf. lastFilePath ci-dessus) pour les réglages de
// l'Application (cf. modale Configuration dans index.html, ex. délai de sauvegarde automatique) — sur
// demande utilisateur. 'settings:get' renvoie l'objet entier, 'settings:set' fusionne une clé/valeur.
ipcMain.handle('settings:get', async () => {
  return readSettings();
});

ipcMain.handle('settings:set', async (event, key, value) => {
  try {
    const settings = readSettings();
    settings[key] = value;
    fs.writeFileSync(settingsFilePath, JSON.stringify(settings), 'utf-8');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

// Dossier des Projets affiché dans la modale Configuration (cf. getProjectsDir ci-dessus) : calculé
// côté main process car il dépend du chemin de l'exécutable (app.getPath/app.isPackaged), inconnu du
// renderer — sur demande utilisateur.
ipcMain.handle('settings:getProjectsDir', async () => {
  return getProjectsDir();
});

// Ouvre un sélecteur de dossier natif pour choisir un nouveau dossier de Projets par défaut (cf. bouton
// "Choisir un dossier..." de la modale Configuration) — sur demande utilisateur. Le dossier est créé
// s'il n'existe pas encore, mais PAS encore persisté ici : c'est le renderer qui appelle ensuite
// settings:set('projectsDir', ...) pour rester cohérent avec le reste des réglages.
ipcMain.handle('settings:chooseProjectsDir', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    defaultPath: getProjectsDir(),
    properties: ['openDirectory', 'createDirectory'],
  });
  if (canceled || !filePaths || !filePaths.length) return { canceled: true };
  try { fs.mkdirSync(filePaths[0], { recursive: true }); } catch (err) { /* ignore */ }
  return { canceled: false, filePath: filePaths[0] };
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// MODÈLES 3D IMPORTÉS (.glb)
// ════════════════════════════════════════════════════════════════════════════════════════════════
//
// EXCEPTION ASSUMÉE à la règle n°1 d'architecture.md (« main.js ne se touche jamais pour une
// fonctionnalité applicative »), documentée là-bas. La règle interdit d'y mettre de la LOGIQUE
// applicative ; sa propre description range l'« accès disque » dans les attributions de ce fichier.
// Écrire un .glb — du binaire — est de l'accès disque, et aucun canal existant ne sait le faire :
// project:write écrit une chaîne. Le remède habituel de la règle (« pousser l'information en
// fichier généré ») ne s'applique pas : ces octets arrivent à l'exécution, choisis par
// l'utilisateur.
//
// La répartition tient en une phrase : ICI on fait des entrées-sorties et on se défend ; c'est
// src/model-store.js qui DÉCIDE (nom retenu, collisions, messages).
//
// Les modèles vivent dans le dossier de Projets choisi par l'utilisateur, pas dans les données
// d'application : ce qu'il fait pour synchroniser ou sauvegarder ses Projets couvre alors ses
// modèles. Les mettre ailleurs les ferait disparaître au premier changement de machine, sans que
// personne comprenne pourquoi.
function getModelsDir() {
  return path.join(getProjectsDir(), 'Modeles');
}

function ensureModelsDir() {
  try { fs.mkdirSync(getModelsDir(), { recursive: true }); } catch (err) { /* ignore */ }
}

// Le renderer propose un nom ; ce process REFUSE tout ce qui n'est pas déjà un nom de fichier nu.
// Ce n'est PAS un doublon de l'assainissement de src/model-store.js — les deux font des métiers
// différents : là-bas on NETTOIE ce que l'utilisateur a fourni, ici on n'accepte que du déjà propre.
// Sans cette garde, un nom comme « ../../../Bureau/quelque-chose » écrirait hors du dossier des
// modèles. Un process principal ne fait jamais confiance à son renderer, même quand c'est le nôtre.
function nomDeModeleAcceptable(name) {
  if (typeof name !== 'string' || !name) return false;
  if (name !== path.basename(name)) return false;      // aucun séparateur de chemin
  if (name.startsWith('.')) return false;              // ni « .. », ni fichier caché
  return /\.glb$/i.test(name);
}

// Choisit un .glb et rend son contenu SANS l'écrire : c'est le renderer qui décide ensuite du nom
// retenu (cf. resolveModelName) puis rappelle models:write. Deux allers-retours plutôt qu'un, pour
// que la décision reste dans src/ où elle est testable.
ipcMain.handle('models:pick', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    defaultPath: getModelsDir(),
    filters: [{ name: 'Modèles 3D glTF', extensions: ['glb', 'gltf'] }],
    properties: ['openFile'],
  });
  if (canceled || !filePaths || !filePaths.length) return { canceled: true };
  try {
    const data = await fs.promises.readFile(filePaths[0]);
    return { canceled: false, name: path.basename(filePaths[0]), data: new Uint8Array(data) };
  } catch (err) {
    return { canceled: false, error: String(err) };
  }
});

ipcMain.handle('models:write', async (event, name, data) => {
  if (!nomDeModeleAcceptable(name)) return { ok: false, error: 'nom de modèle refusé' };
  try {
    ensureModelsDir();
    await fs.promises.writeFile(path.join(getModelsDir(), name), Buffer.from(data));
    return { ok: true, name };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

ipcMain.handle('models:read', async (event, name) => {
  if (!nomDeModeleAcceptable(name)) return { ok: false, error: 'nom de modèle refusé' };
  try {
    const data = await fs.promises.readFile(path.join(getModelsDir(), name));
    return { ok: true, data: new Uint8Array(data) };
  } catch (err) {
    // Cas nominal, pas une panne : le fichier a été déplacé ou supprimé hors de l'application.
    // Le renderer en fait un Élément de remplacement — il ne supprime SURTOUT pas l'Élément.
    return { ok: false, error: String(err) };
  }
});

ipcMain.handle('models:list', async () => {
  try {
    return fs.readdirSync(getModelsDir()).filter(nomDeModeleAcceptable);
  } catch (err) {
    return [];   // dossier pas encore créé : aucun modèle, ce n'est pas une erreur
  }
});

// Le renderer a tranché (Enregistrer et quitter / Quitter sans enregistrer, cf. quitConfirmModal) :
// on autorise la fermeture réelle, qui redéclenche l'événement 'close' ci-dessus, cette fois laissé
// passer puisque isQuitting est désormais true.
ipcMain.on('app:confirmQuit', (event) => {
  isQuitting = true;
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) win.close(); else app.quit();
});

app.whenReady().then(() => {
  ensureProjectsDir();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
