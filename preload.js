// Pont sécurisé (contextIsolation: true, nodeIntegration: false) entre le renderer (index.html) et le
// process principal Electron, exposé sous window.storyboarderAPI. Nécessaire car l'API web File System
// Access (showSaveFilePicker/showOpenFilePicker) n'est PAS disponible pour les pages chargées en file://
// (ni dans Brave, ni dans Electron, qui utilise aussi file:// via win.loadFile) — seule la voie native
// Electron (dialog + fs côté main process, cf. main.js) permet de choisir un fichier .json et d'y
// réécrire ensuite silencieusement, ce qui est indispensable pour la sauvegarde automatique.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('storyboarderAPI', {
  saveProjectAs: (json, suggestedName) => ipcRenderer.invoke('project:saveAs', json, suggestedName),
  writeProjectFile: (filePath, json) => ipcRenderer.invoke('project:write', filePath, json),
  openProjectDialog: () => ipcRenderer.invoke('project:open'),
  renameProjectFile: (filePath, newName) => ipcRenderer.invoke('project:rename', filePath, newName),
  getLastProject: () => ipcRenderer.invoke('project:getLastProject'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSetting: (key, value) => ipcRenderer.invoke('settings:set', key, value),
  getProjectsDir: () => ipcRenderer.invoke('settings:getProjectsDir'),
  chooseProjectsDir: () => ipcRenderer.invoke('settings:chooseProjectsDir'),
  // Modèles 3D importés (.glb), rangés dans <dossier de Projets>/Modeles. Le pont ne fait que des
  // entrées-sorties : c'est src/model-store.js qui décide du nom retenu et des collisions, pour que
  // cette décision reste testable. Cf. l'exception documentée dans docs/architecture.md, règle n°1.
  pickModelFile: () => ipcRenderer.invoke('models:pick'),
  writeModelFile: (name, data) => ipcRenderer.invoke('models:write', name, data),
  readModelFile: (name) => ipcRenderer.invoke('models:read', name),
  listModelFiles: () => ipcRenderer.invoke('models:list'),
  // Flux de confirmation avant de quitter (cf. main.js, événement 'close' intercepté + quitConfirmModal
  // dans index.html) — sur demande utilisateur : propose Enregistrer et quitter / Quitter sans
  // enregistrer / Annuler plutôt que d'empêcher la fermeture en attendant une sauvegarde.
  onRequestQuitConfirmation: (callback) => ipcRenderer.on('app:requestQuitConfirmation', () => callback()),
  confirmQuit: () => ipcRenderer.send('app:confirmQuit'),
});
