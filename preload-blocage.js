// Pont de l'ÉCRAN BLOQUANT (#442) : mise à jour obligatoire, ou connexion requise. Il n'expose QUE
// les mises à jour. Le pont de l'application (preload.js) n'est jamais chargé dans cette fenêtre :
// sans lui, rien de ce qui ouvre ou enregistre un Projet n'est joignable d'ici, même en forçant la
// page à charger index.html.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('storyboarderMaj', {
  etat: () => ipcRenderer.invoke('maj:etat'),
  installer: () => ipcRenderer.invoke('maj:installer'),
  reessayer: () => ipcRenderer.invoke('maj:reessayer'),
  onProgression: (callback) => ipcRenderer.on('maj:progression', (e, recus, total) => callback(recus, total)),
});
