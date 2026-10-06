const { app, BrowserWindow, Menu, ipcMain, dialog, screen, shell } = require('electron');
const path = require('path');
const fs = require('fs');

// Géométrie de la fenêtre : la DÉCISION est dans window-state.js, testable sous Node nu, ce
// fichier-ci n'en fait que l'entrée-sortie (cf. docs/en/architecture.md, règle n°1).
const {
  LARGEUR_DEFAUT, HAUTEUR_DEFAUT, LARGEUR_MINI, HAUTEUR_MINI,
  geometrieRestaurable, etatAEnregistrer,
} = require('./window-state');

// Mises à jour (#442) : la DÉCISION est dans update-policy.js, testable sous Node nu ; les
// entrées-sorties dans updater.js. Cf. la section MISES À JOUR en bas de ce fichier.
const politiqueMaj = require('./update-policy');
const majES = require('./updater');
const { CLE_PUBLIQUE } = require('./attestation-cle');

// Dossier "Projets" proposé par défaut. ⚠️ #447 : il était À CÔTÉ DE L'EXÉCUTABLE, et chaque mise à
// jour vide le dossier d'installation. Il est désormais dans Documents, et l'ancien est déménagé au
// démarrage (migrerAncienDossierProjets, plus bas). La décision vit dans projects-dir.js.
const dossiersProjets = require('./projects-dir');
const defaultProjectsDir = dossiersProjets.dossierParDefaut({
  packaged: app.isPackaged, documents: app.getPath('documents'), nomApp: app.getName(), appDir: __dirname,
});
const ancienDefaultProjectsDir = dossiersProjets.ancienDossierParDefaut({
  packaged: app.isPackaged, exeDir: path.dirname(app.getPath('exe')),
});

// #448 : l'application s'appelait « Storyboard BD ». Ses réglages vivaient dans
// %APPDATA%/Storyboard BD ; sous le nouveau nom, le dossier est neuf. Au premier lancement renommé,
// on recopie ce qui compte (projects-dir.js, DONNEES_A_RECOPIER), AVANT de lire le moindre réglage.
// En développement, le dossier vient du champ `name` (storyboard-bd), qui ne change pas : rien à faire.
function recupererDonneesAncienNom() {
  if (!app.isPackaged) return;
  try {
    const appData = app.getPath('appData');
    const nouveau = app.getPath('userData');
    const source = dossiersProjets.donneesARecuperer({
      appData,
      anciensExistants: dossiersProjets.ANCIENS_NOMS.map(n => path.join(appData, n)).filter(d => fs.existsSync(d)),
      nouveauARéglages: fs.existsSync(path.join(nouveau, 'settings.json')),
    });
    if (!source) return;
    fs.mkdirSync(nouveau, { recursive: true });
    for (const element of dossiersProjets.DONNEES_A_RECOPIER) {
      const de = path.join(source, element);
      if (fs.existsSync(de)) fs.cpSync(de, path.join(nouveau, element), { recursive: true, errorOnExist: false });
    }
  } catch (err) {
    console.error('Récupération des réglages de l\'ancien nom impossible :', err);
  }
}
recupererDonneesAncienNom();

// Mémorise le chemin du dernier fichier de Projet ouvert/enregistré, ainsi que les réglages de
// l'Application (cf. modale Configuration dans index.html : délai de sauvegarde automatique, dossier
// des Projets personnalisé, thème) dans le dossier de données utilisateur de l'app, sur demande
// utilisateur. Mis à jour à chaque saveAs/write/rename/open réussi ci-dessous.
const settingsFilePath = path.join(app.getPath('userData'), 'settings.json');

function readSettings() {
  try { return JSON.parse(fs.readFileSync(settingsFilePath, 'utf-8')); } catch (err) { return {}; }
}

// Dossier des Projets effectif : le dossier choisi par l'utilisateur (cf. settings:chooseProjectsDir)
// s'il y en a un, sinon le dossier par défaut ci-dessus, sur demande utilisateur ("possibilité de
// changer le dossier des Projets par défaut").
function getProjectsDir() {
  const { projectsDir } = readSettings();
  return projectsDir || defaultProjectsDir;
}

/** Un dossier existe-t-il et contient-il quelque chose ? */
function dossierNonVide(d) {
  try { return fs.readdirSync(d).length > 0; } catch (err) { return false; }
}

// #447 : déménage l'ancien dossier des Projets (à côté de l'exécutable) vers Documents, et réécrit
// les réglages qui pointaient dedans. Appelé au démarrage, avant toute fenêtre. L'installeur fait
// déjà ce déménagement avant de désinstaller l'ancienne version (build/installer.nsh) ; ceci couvre
// ce qu'il n'aurait pas pu faire. Une panne ne doit jamais empêcher de démarrer : on journalise.
function migrerAncienDossierProjets() {
  // Deux anciens emplacements, dans cet ordre : à côté du programme (#447), puis Documents sous
  // l'ancien nom de l'application (#448). Le second arrivé trouve la place prise s'il y a déjà
  // quelque chose : il va dans « Projets (anciens) », rien n'est écrasé.
  const anciens = [ancienDefaultProjectsDir];
  if (app.isPackaged) anciens.push(...dossiersProjets.anciensDossiersDocuments(app.getPath('documents')));
  anciens.filter(Boolean).forEach(migrerUnAncienDossier);
}

function migrerUnAncienDossier(ancien) {
  try {
    const reglages = readSettings();
    const plan = dossiersProjets.planMigration({
      ancien, nouveau: defaultProjectsDir,
      ancienContenu: dossierNonVide(ancien),
      nouveauContenu: dossierNonVide(defaultProjectsDir), reglages,
    });
    if (plan.deplacer) {
      fs.mkdirSync(path.dirname(plan.cible), { recursive: true });
      try {
        fs.renameSync(ancien, plan.cible);
      } catch (err) {
        // Autre volume, ou fichier verrouillé : on copie, et l'on n'efface l'original qu'une fois
        // la copie faite. Un échec de copie laisse l'original en place.
        fs.cpSync(ancien, plan.cible, { recursive: true, errorOnExist: false });
        fs.rmSync(ancien, { recursive: true, force: true });
      }
    }
    const modifs = Object.keys(plan.reglages);
    if (modifs.length || plan.annonce) {
      const s = readSettings();
      for (const cle of modifs) {
        if (plan.reglages[cle] === null) delete s[cle]; else s[cle] = plan.reglages[cle];
      }
      // Le renderer l'annonce une fois, puis l'efface (cf. src/events.js, projetsDeplaces).
      if (plan.annonce) s.projetsDeplaces = plan.annonce;
      fs.writeFileSync(settingsFilePath, JSON.stringify(s), 'utf-8');
    }
  } catch (err) {
    console.error('Déménagement du dossier des Projets impossible :', err);
  }
}

function ensureProjectsDir() {
  try { fs.mkdirSync(getProjectsDir(), { recursive: true }); } catch (err) { /* ignore */ }
}

// Mémorise la géométrie de la fenêtre dans le même settings.json (champ AJOUTÉ, `windowState` :
// aucun champ existant n'est renommé). Appelé à la fermeture, le seul moment où l'on est sûr que
// l'utilisateur a fini de la dimensionner.
//
// `getNormalBounds()` et non `getBounds()` : sur une fenêtre maximisée, le second rend les
// dimensions de l'écran, et la taille restaurée serait perdue pour de bon.
function enregistrerGeometrieFenetre(win) {
  try {
    const etat = etatAEnregistrer(win.getNormalBounds(), win.isMaximized());
    if (!etat) return;
    const settings = readSettings();
    settings.windowState = etat;
    fs.writeFileSync(settingsFilePath, JSON.stringify(settings), 'utf-8');
  } catch (err) { /* ignore */ }
}

function setLastProjectPath(filePath) {
  try {
    const settings = readSettings();
    settings.lastFilePath = filePath;
    fs.writeFileSync(settingsFilePath, JSON.stringify(settings), 'utf-8');
  } catch (err) { /* ignore */ }
}

// Devient true une fois que le renderer a explicitement confirmé qu'il faut fermer (après avoir
// proposé d'enregistrer ou non, cf. 'app:confirmQuit' ci-dessous), sur demande utilisateur : plutôt
// que d'empêcher la fermeture tant que le Projet n'est pas enregistré, on intercepte la fermeture une
// première fois pour demander au renderer ce qu'il souhaite faire, puis on laisse la seconde tentative
// (déclenchée depuis le renderer lui-même) passer normalement.
let isQuitting = false;

// `mode` vaut 'app' (l'application) ou 'blocage' (#442 : l'écran plein de mise à jour obligatoire
// ou de connexion requise, sans menus, avec son propre pont qui n'expose QUE les mises à jour).
function createWindow(mode = 'app') {
  const bloque = mode === 'blocage';
  // La fenêtre renaît là où l'utilisateur l'avait laissée. Ce n'est pas qu'un confort : elle
  // naissait à 1280 × 860 et se faisait maximiser à la main juste après, ce qui obligeait le
  // renderer à recalculer son échelle et à REDESSINER toute la Planche pendant le chargement
  // (cf. docs/en/rendering-performance.md).
  //
  // `screen` n'est interrogeable qu'une fois l'application prête : createWindow n'est appelé que
  // depuis whenReady et depuis 'activate', donc jamais avant.
  const enregistre = readSettings().windowState;
  const restaure = geometrieRestaurable(enregistre, screen.getAllDisplays().map(d => d.workArea),
    { largeur: LARGEUR_MINI, hauteur: HAUTEUR_MINI });

  const win = new BrowserWindow({
    ...(restaure || { width: LARGEUR_DEFAUT, height: HAUTEUR_DEFAUT }),
    minWidth: LARGEUR_MINI,
    minHeight: HAUTEUR_MINI,
    backgroundColor: '#F2EBDD',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, bloque ? 'preload-blocage.js' : 'preload.js'),
    },
    autoHideMenuBar: true,
  });

  // Intercepte TOUTE tentative de fermeture de la fenêtre (bouton natif "×", Alt+F4, le bouton "Fermer
  // l'application" de la modale Projet via window.close(), etc.) pour laisser le renderer décider quoi
  // faire s'il reste des modifications non enregistrées (cf. quitConfirmModal dans index.html).
  win.on('close', (e) => {
    // L'écran bloquant n'a pas de Projet ouvert : rien à proposer d'enregistrer.
    if (bloque) return;
    // AVANT la garde : la fermeture peut être annulée par l'utilisateur, mais la géométrie du
    // moment est bonne à prendre dans les deux cas, et c'est le dernier instant où la fenêtre
    // existe encore.
    enregistrerGeometrieFenetre(win);
    if (isQuitting) return;
    e.preventDefault();
    win.webContents.send('app:requestQuitConfirmation');
  });

  Menu.setApplicationMenu(null);

  // F12 ou Ctrl+Shift+I pour ouvrir/fermer les DevTools (débogage)
  win.webContents.on('before-input-event', (event, input) => {
    // Pas d'outils de développement sur l'écran bloquant : ils permettraient de le retirer.
    if (bloque) return;
    if (input.key === 'F12' ||
        (input.control && input.shift && input.key.toLowerCase() === 'i')) {
      win.webContents.toggleDevTools();
    }
  });

  // AVANT loadFile, et c'est tout l'intérêt de la tâche : le renderer ne mesure sa zone de dessin
  // qu'une fois, à la taille définitive. Maximiser après le chargement rendrait la Planche deux
  // fois, ce qui était exactement la situation d'origine.
  if (restaure && enregistre.maximized === true) win.maximize();

  if (bloque) {
    // L'écran bloquant ne mène nulle part : ni navigation, ni nouvelle fenêtre.
    win.webContents.on('will-navigate', (e) => e.preventDefault());
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.loadFile(path.join(__dirname, 'blocage.html'));
  } else {
    // #444b : un lien qui s'ouvre dans une nouvelle fenêtre (la page d'un auteur, d'un modèle, d'une
    // licence) part dans le NAVIGATEUR de l'utilisateur, jamais dans une fenêtre Electron : celle-ci
    // hériterait d'un contexte qui n'est pas fait pour la navigation libre. Seul https est accepté.
    win.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https:\/\//.test(url)) shell.openExternal(url);
      return { action: 'deny' };
    });
    // #443 : en développement, STORYBOARD_SIMULER_RESSOURCES montre la modale des ressources
    // introuvables avec des données factices (cf. src/missing-resources.js, simulationRessources).
    const simulerRessources = !app.isPackaged && process.env.STORYBOARD_SIMULER_RESSOURCES;
    win.loadFile(path.join(__dirname, 'index.html'), simulerRessources ? { query: { simulerRessources: '1' } } : undefined);
  }
  return win;
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
    filters: [{ name: 'Projet Storyboarder BD', extensions: ['json'] }],
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

// Suppression du fichier d'un Projet (#399). PASSE-PLAT STRICT : la decision — le mot a ecrire,
// et le retour a un Projet vierge — vit dans src/, ou elle se teste. Ici on ne fait qu'effacer le
// fichier nomme, exactement comme `models:delete` efface un `.glb`.
//
// `setLastProjectPath('')` EST LA MOITIE QUI COMPTE : sans elle, le prochain demarrage rouvrirait
// le fichier qu'on vient de supprimer, echouerait en silence et repartirait sur un Projet vierge
// sans que rien n'explique pourquoi.
ipcMain.handle('project:delete', async (event, filePath) => {
  try {
    await fs.promises.unlink(filePath);
    const settings = readSettings();
    if (settings.lastFilePath === filePath) setLastProjectPath('');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

ipcMain.handle('project:open', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    defaultPath: getProjectsDir(),
    properties: ['openFile'],
    filters: [{ name: 'Projet Storyboarder BD', extensions: ['json'] }],
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
// démarrage de l'app (cf. initStartupProject dans index.html), sur demande utilisateur. Si le fichier
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
// l'Application (cf. modale Configuration dans index.html, ex. délai de sauvegarde automatique), sur
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
// renderer, sur demande utilisateur.
ipcMain.handle('settings:getProjectsDir', async () => {
  return getProjectsDir();
});

// Ouvre un sélecteur de dossier natif pour choisir un nouveau dossier de Projets par défaut (cf. bouton
// "Choisir un dossier..." de la modale Configuration), sur demande utilisateur. Le dossier est créé
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
// Écrire un .glb, du binaire, est de l'accès disque, et aucun canal existant ne sait le faire :
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
// Ce n'est PAS un doublon de l'assainissement de src/model-store.js, les deux font des métiers
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
    return { canceled: false, ...(await modeleAImporter(filePaths[0])) };
  } catch (err) {
    return { canceled: false, error: String(err) };
  }
});

/**
 * Le fichier choisi, prêt à ranger : `{ name, data }` ou `{ error }`.
 *
 * ⚠️ UN .gltf N'EST PAS UN FICHIER, C'EST UN DOSSIER (relevé à l'audit qui a suivi le canard orange).
 * Son JSON renvoie vers un .bin et des textures VOISINS ; seul le JSON était recopié, sous un nom en
 * .glb, et le modèle s'affichait ensuite en boîte « introuvable » alors que le fichier était là. On
 * lit donc ses voisins et on empaquette le tout en un vrai .glb (gltf-glb.js, le même que pour Poly
 * Haven). Un voisin hors du dossier du .gltf est refusé : le JSON ne dicte pas où l'on lit.
 *
 * Un fichier qui EXIGE une compression qu'on ne sait pas décoder (Draco, Meshopt, KTX2) est refusé
 * avec son nom, plutôt que rangé pour rien.
 */
async function modeleAImporter(chemin){
  const gltfGlb = require('./gltf-glb');
  let data = await fs.promises.readFile(chemin);
  let name = path.basename(chemin);
  if (/\.gltf$/i.test(name)) {
    let json;
    try { json = JSON.parse(data.toString('utf8')); } catch (e) { return { error: 'ce fichier .gltf est illisible' }; }
    const dossier = path.dirname(path.resolve(chemin));
    const ressources = new Map();
    for (const uri of gltfGlb.ressourcesExternes(json)) {
      let relatif = uri;
      try { relatif = decodeURIComponent(uri); } catch (e) { /* telle quelle */ }
      const voisin = path.resolve(dossier, relatif);
      if (!voisin.startsWith(dossier + path.sep)) return { error: `ressource hors du dossier du .gltf : ${uri}` };
      try { ressources.set(uri, await fs.promises.readFile(voisin)); } catch (e) {
        return { error: `fichier manquant à côté du .gltf : ${relatif}` };
      }
    }
    data = gltfGlb.empaqueterGlb(json, ressources);
    name = name.replace(/\.gltf$/i, '.glb');
  }
  const refus = gltfGlb.extensionsNonPrisesEnCharge(gltfGlb.jsonDuModele(data));
  if (refus.length) return { error: `ce modèle utilise une compression que l'application ne sait pas lire (${refus.join(', ')}) : réexportez-le sans compression` };
  return { name, data: new Uint8Array(data) };
}

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
    // Le renderer en fait un Élément de remplacement, il ne supprime SURTOUT pas l'Élément.
    return { ok: false, error: String(err) };
  }
});

// Suppression d'un modèle du disque. Le renderer a DÉJÀ confirmé auprès de l'utilisateur, avec le
// décompte de ce que ça casse (cf. model-library.js) : ici on exécute, on ne redemande pas. La garde
// de nom s'applique comme pour l'écriture, un process principal ne fait pas confiance à son
// renderer, et une suppression est la pire opération sur laquelle se tromper de chemin.
// ─── Vignettes des modèles (bibliothèque « Mes modèles ») ───
// Même exception de règle que `models:*` : de l'accès disque. Ce qui DÉCIDE (signature, à refaire,
// suivi des renommages) est dans vignettes-modeles.js, testé sous Node.
const vignettes = require('./vignettes-modeles');
const getVignettesDir = () => path.join(getProjectsDir(), vignettes.DOSSIER);
async function lireIndexVignettes(){
  try { return JSON.parse(await fs.promises.readFile(path.join(getVignettesDir(), vignettes.INDEX), 'utf8')); }
  catch (e) { return null; }
}
// Les écritures de l'index passent L'UNE APRÈS L'AUTRE : deux vignettes notées en même temps (un
// rendu et un téléchargement) liraient le même index et la seconde effacerait la première.
let _fileIndexVignettes = Promise.resolve();
function modifierIndexVignettes(modifier){
  _fileIndexVignettes = _fileIndexVignettes.then(async () => {
    fs.mkdirSync(getVignettesDir(), { recursive: true });
    const cible = path.join(getVignettesDir(), vignettes.INDEX);
    await fs.promises.writeFile(cible + '.tmp', JSON.stringify(modifier(await lireIndexVignettes()), null, 2), 'utf8');
    await fs.promises.rename(cible + '.tmp', cible);
  }).catch(() => {});
  return _fileIndexVignettes;
}
async function signatureModele(nom){
  try { return vignettes.signatureFichier(await fs.promises.stat(path.join(getModelsDir(), nom))); } catch (e) { return null; }
}
/** Écrit la vignette d'un modèle (octets d'image) et la note avec la signature ACTUELLE du fichier. */
async function ecrireVignette(nom, data, origine){
  if (!nomDeModeleAcceptable(nom) || !data || !data.length || !vignettes.typeImage(data)) return { ok: false };
  const signature = await signatureModele(nom);
  if (!signature) return { ok: false };
  fs.mkdirSync(getVignettesDir(), { recursive: true });
  await fs.promises.writeFile(path.join(getVignettesDir(), vignettes.nomVignette(nom)), Buffer.from(data));
  await modifierIndexVignettes(i => vignettes.noter(i, nom, signature, origine));
  return { ok: true };
}
// Ce qui est à rendre, et ce qui est prêt.
ipcMain.handle('vignettes:etat', async () => {
  let noms = [];
  try { noms = fs.readdirSync(getModelsDir()).filter(nomDeModeleAcceptable); } catch (e) { return { aFaire: [], pretes: [] }; }
  const fichiers = await Promise.all(noms.map(async nom => ({ nom, signature: await signatureModele(nom) })));
  const index = await lireIndexVignettes();
  const aFaire = vignettes.aGenerer(index, fichiers.filter(f => f.signature));
  const aFaireNoms = new Set(aFaire.map(f => f.nom));
  return { aFaire, pretes: noms.filter(n => !aFaireNoms.has(n)) };
});
// Le dossier Modeles avec, pour chaque fichier, sa taille et sa date (tri « récents »).
ipcMain.handle('models:infos', async () => {
  let noms = [];
  try { noms = fs.readdirSync(getModelsDir()).filter(nomDeModeleAcceptable); } catch (e) { return []; }
  return Promise.all(noms.map(async nom => {
    try { const s = await fs.promises.stat(path.join(getModelsDir(), nom)); return { nom, taille: s.size, modifie: s.mtimeMs }; }
    catch (e) { return { nom, taille: null, modifie: null }; }
  }));
});
ipcMain.handle('vignettes:lire', async (event, nom) => {
  if (!nomDeModeleAcceptable(nom)) return { ok: false };
  try {
    const data = await fs.promises.readFile(path.join(getVignettesDir(), vignettes.nomVignette(nom)));
    const type = vignettes.typeImage(data);
    return type ? { ok: true, data: new Uint8Array(data), type } : { ok: false };
  } catch (e) { return { ok: false }; }
});
ipcMain.handle('vignettes:ecrire', async (event, nom, data) => ecrireVignette(nom, data, 'rendu'));
/** Un modèle renommé ou supprimé : sa vignette suit, ou s'en va. Rien de grave si elle manque. */
async function suivreVignette(ancien, nouveau){
  const de = path.join(getVignettesDir(), vignettes.nomVignette(ancien));
  try {
    if (nouveau) await fs.promises.rename(de, path.join(getVignettesDir(), vignettes.nomVignette(nouveau)));
    else await fs.promises.unlink(de);
  } catch (e) { /* pas de vignette : rien à suivre */ }
  await modifierIndexVignettes(i => (nouveau ? vignettes.renommer(i, ancien, nouveau) : vignettes.oublier(i, ancien)));
}

ipcMain.handle('models:delete', async (event, name) => {
  if (!nomDeModeleAcceptable(name)) return { ok: false, error: 'nom de modèle refusé' };
  try {
    await fs.promises.unlink(path.join(getModelsDir(), name));
    await suivreVignette(name, null);
    return { ok: true };
  } catch (err) {
    // Déjà supprimé à la main hors de l'application : le résultat voulu est atteint, ce n'est pas
    // un échec. Le renderer rafraîchira sa liste et le fichier n'y sera plus.
    if (err && err.code === 'ENOENT') return { ok: true };
    return { ok: false, error: String(err) };
  }
});

// Renommage d'un modèle sur le disque. Même exception de règle que les autres canaux `models:*`
// (cf. docs/en/architecture.md, règle n°1) : renommer un fichier est de l'accès disque, et aucun canal
// existant ne sait le faire.
//
// LE REFUS D'ÉCRASER EST ICI, PAS SEULEMENT DANS LE RENDERER. `fs.rename` écrase silencieusement un
// fichier existant, sur toutes les plateformes visées : renommer « a.glb » en « b.glb » détruirait
// b.glb sans un mot, et avec lui tous les Éléments de tous les Projets qui le citent. La vérification
// d'existence laisse une fenêtre théorique entre le test et le renommage, deux instances de
// l'application renommant vers le même nom à la milliseconde près. Le dossier des modèles est local
// et mono-utilisateur : cette fenêtre est acceptée, la perte qu'elle éviterait ne l'était pas.
ipcMain.handle('models:rename', async (event, ancien, nouveau) => {
  if (!nomDeModeleAcceptable(ancien) || !nomDeModeleAcceptable(nouveau)) {
    return { ok: false, error: 'nom de modèle refusé' };
  }
  const dir = getModelsDir();
  const src = path.join(dir, ancien);
  const dst = path.join(dir, nouveau);
  // Même nom à la casse près sous Windows : `fs.existsSync(dst)` répondrait « oui » alors que c'est
  // le fichier source lui-même, et un simple changement de casse deviendrait impossible.
  const memeFichier = src.toLowerCase() === dst.toLowerCase();
  try {
    if (!memeFichier && fs.existsSync(dst)) return { ok: false, error: 'un modèle porte déjà ce nom' };
    await fs.promises.rename(src, dst);
    // #444e : un modèle venu du store garde son attribution sous son nouveau nom, et sa vignette.
    await store.renommerAttribution(getProjectsDir(), ancien, nouveau);
    await suivreVignette(ancien, nouveau);
    return { ok: true, name: nouveau };
  } catch (err) {
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

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// IMAGES DE CASE
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// MÊME EXCEPTION, MÊME RÉPARTITION QUE `models:*` (cf. docs/en/architecture.md, règle n°1, et la
// section « MODÈLES 3D IMPORTÉS » ci-dessus) : écrire un PNG est de l'accès disque, le métier
// déclaré de ce fichier, et aucun canal existant ne sait le faire — `project:write` écrit une
// chaîne. ICI on fait des entrées-sorties et on se défend ; c'est src/image-store.js qui DÉCIDE du
// nom retenu, des collisions et des messages.
//
// Les images vivent à côté des modèles, dans le dossier de Projets choisi par l'utilisateur, et
// pour la même raison : ce qu'il fait pour synchroniser ou sauvegarder ses Projets couvre alors ses
// images. Un dossier SÉPARÉ de `Modeles`, et non un sous-dossier : `models:list` filtre déjà sur
// l'extension et refuse tout le reste, y ranger des images obligerait à percer cette garde.
function getImagesDir() {
  return path.join(getProjectsDir(), 'Images');
}

function ensureImagesDir() {
  try { fs.mkdirSync(getImagesDir(), { recursive: true }); } catch (err) { /* ignore */ }
}

// ⚠️ QUATRE EXTENSIONS, LÀ OÙ UN MODÈLE N'EN A QU'UNE, et c'est la seule vraie différence entre
// cette garde et `nomDeModeleAcceptable`. Le reste est identique et le reste volontairement : un
// process principal ne fait jamais confiance à son renderer, même quand c'est le nôtre, et un nom
// comme « ../../../Bureau/quelque-chose » écrirait hors du dossier des images.
//
// GIF et SVG sont ABSENTS, et c'est une décision, pas un oubli (cf. docs/en/panel-images.md) : un
// canevas ne joue pas l'animation d'un GIF, et un SVG ne porte aucune taille en pixels.
function nomDImageAcceptable(name) {
  if (typeof name !== 'string' || !name) return false;
  if (name !== path.basename(name)) return false;      // aucun séparateur de chemin
  if (name.startsWith('.')) return false;              // ni « .. », ni fichier caché
  return /\.(png|jpe?g|webp)$/i.test(name);
}

// Choisit une image et rend son contenu SANS l'écrire, comme `models:pick` : c'est le renderer qui
// décide ensuite du nom retenu (cf. resolveImageName) puis rappelle images:write.
ipcMain.handle('images:pick', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    defaultPath: getImagesDir(),
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
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

ipcMain.handle('images:write', async (event, name, data) => {
  if (!nomDImageAcceptable(name)) return { ok: false, error: 'nom d\'image refusé' };
  try {
    ensureImagesDir();
    await fs.promises.writeFile(path.join(getImagesDir(), name), Buffer.from(data));
    return { ok: true, name };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

ipcMain.handle('images:read', async (event, name) => {
  if (!nomDImageAcceptable(name)) return { ok: false, error: 'nom d\'image refusé' };
  try {
    const data = await fs.promises.readFile(path.join(getImagesDir(), name));
    return { ok: true, data: new Uint8Array(data) };
  } catch (err) {
    // Cas nominal, pas une panne : le fichier a été déplacé ou supprimé hors de l'application. La
    // Case le signale, elle ne se vide SURTOUT pas d'elle-même.
    return { ok: false, error: String(err) };
  }
});

// Suppression d'une image du disque. Le renderer a DÉJÀ confirmé auprès de l'utilisateur.
//
// ⚠️ CE N'EST PAS LE GESTE DE LA SECTION IMAGE D'UNE CASE, qui DÉTACHE et ne touche à aucun fichier
// (cf. docs/en/panel-images.md, décision 4) : deux Cases peuvent porter la même image. Ce canal-ci
// sert la section Images du menu de gauche, où l'on efface pour de bon.
ipcMain.handle('images:delete', async (event, name) => {
  if (!nomDImageAcceptable(name)) return { ok: false, error: 'nom d\'image refusé' };
  try {
    await fs.promises.unlink(path.join(getImagesDir(), name));
    return { ok: true };
  } catch (err) {
    // Déjà supprimée à la main hors de l'application : le résultat voulu est atteint.
    if (err && err.code === 'ENOENT') return { ok: true };
    return { ok: false, error: String(err) };
  }
});

// Renommage sur le disque. LE REFUS D'ÉCRASER EST ICI, PAS SEULEMENT DANS LE RENDERER, pour la même
// raison que `models:rename` : `fs.rename` écrase silencieusement un fichier existant, et avec lui
// toutes les Cases de tous les Projets qui le citent.
ipcMain.handle('images:rename', async (event, ancien, nouveau) => {
  if (!nomDImageAcceptable(ancien) || !nomDImageAcceptable(nouveau)) {
    return { ok: false, error: 'nom d\'image refusé' };
  }
  const dir = getImagesDir();
  const src = path.join(dir, ancien);
  const dst = path.join(dir, nouveau);
  // Même nom à la casse près sous Windows : voir models:rename, le piège est identique.
  const memeFichier = src.toLowerCase() === dst.toLowerCase();
  try {
    if (!memeFichier && fs.existsSync(dst)) return { ok: false, error: 'une image porte déjà ce nom' };
    await fs.promises.rename(src, dst);
    return { ok: true, name: nouveau };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

ipcMain.handle('images:list', async () => {
  try {
    return fs.readdirSync(getImagesDir()).filter(nomDImageAcceptable);
  } catch (err) {
    return [];   // dossier pas encore créé : aucune image, ce n'est pas une erreur
  }
});

// ─── Correspondances de squelette ───
// Un seul fichier, à CÔTÉ du dossier Modeles et non dedans : ce dossier ne contient que des `.glb`,
// et models:list y refuse déjà tout le reste. Le mettre à l'intérieur obligerait à percer cette
// garde pour un cas particulier.
//
// Ces deux canaux relèvent de la même exception que `models:*` (cf. docs/en/architecture.md, règle
// n°1) : l'accès disque est le métier déclaré du processus principal, et la logique, reconnaître,
// fusionner, décider quoi enregistrer, reste dans src/, où elle se teste.
function getSkeletonMapsPath() {
  return path.join(getProjectsDir(), 'correspondances-squelettes.json');
}

ipcMain.handle('skeletons:read', async () => {
  try {
    const txt = await fs.promises.readFile(getSkeletonMapsPath(), 'utf-8');
    return { ok: true, data: JSON.parse(txt) };
  } catch (err) {
    // Absent au premier usage, ou illisible : dans les deux cas le renderer repart d'une
    // correspondance vide et la reconnaissance automatique reprend la main. Une correspondance
    // perdue se refait ; un Projet qui refuse de s'ouvrir, non.
    return { ok: false, error: String(err) };
  }
});

ipcMain.handle('skeletons:write', async (event, contenu) => {
  try {
    ensureProjectsDir();
    // Écriture par fichier temporaire puis renommage : une coupure en pleine écriture laisserait
    // sinon un JSON tronqué, donc illisible, donc TOUTES les correspondances perdues d'un coup,
    // et pas seulement celle qu'on était en train d'enregistrer.
    const cible = getSkeletonMapsPath();
    const temporaire = cible + '.tmp';
    await fs.promises.writeFile(temporaire, JSON.stringify(contenu, null, 2), 'utf-8');
    await fs.promises.rename(temporaire, cible);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
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

// ════════════════════════════════════════════════════════════════════════════════════════════════
// MISES À JOUR (#442)
// ════════════════════════════════════════════════════════════════════════════════════════════════
//
// EXCEPTION ASSUMÉE à la règle n°1 d'architecture.md, documentée là-bas : télécharger un
// installeur et le lancer ne se fait que dans ce processus. La répartition reste celle des modèles :
// update-policy.js DÉCIDE, updater.js fait les entrées-sorties, ce fichier branche.
//
// Au démarrage, AVANT toute fenêtre : on vérifie, puis on ouvre soit l'application, soit l'écran
// bloquant (mise à jour obligatoire, ou connexion requise). En développement (`npm start`), rien
// n'est vérifié : l'application n'est pas installée. STORYBOARD_SIMULER_MAJ montre alors chaque
// écran avec des données factices (cf. politiqueMaj.SIMULATIONS).
const SIMULATION_MAJ = process.env.STORYBOARD_SIMULER_MAJ || '';
let etatMaj = { decision: { etat: 'libre' }, latest: null };
let fenetreBlocage = null;

async function preparerMaj() {
  const version = app.getVersion();
  const simule = politiqueMaj.simulation(SIMULATION_MAJ, version, Date.now());
  if (simule) return simule;
  if (!app.isPackaged) return { decision: { etat: 'libre' }, latest: null };
  const r = await majES.verifier({ version, clePublique: CLE_PUBLIQUE, dossier: path.join(app.getPath('userData'), 'maj') });
  // Sans clé publique, la vérification obligatoire est éteinte (cf. attestation-cle.js) : on garde
  // seulement ce qu'il faut pour proposer une mise à jour facultative.
  if (!CLE_PUBLIQUE) return { decision: { etat: 'libre' }, latest: r.latest };
  return r;
}

const ecranBloquant = (e) => e.decision.etat === 'obligatoire' || e.decision.etat === 'horsLigne';

/** Ce que le renderer reçoit : rien de plus que ce qu'il affiche. */
function etatPourAffichage() {
  const version = app.getVersion();
  const { decision, latest } = etatMaj;
  const disponible = !!(latest && politiqueMaj.comparerVersions(latest.version, version) > 0);
  return {
    etat: decision.etat, raison: decision.raison || null, jours: decision.jours ?? null,
    enLigne: decision.enLigne ?? true, versionMinimale: decision.versionMinimale || null,
    installee: version, disponible,
    version: latest ? latest.version : null,
    taille: latest ? politiqueMaj.tailleLisible(latest.taille) : '',
    notes: politiqueMaj.notesAAfficher(decision.charge, version, latest ? latest.version : null),
    lang: readSettings().lang === 'en' ? 'en' : 'fr',
    theme: readSettings().theme || null,
    contraste: readSettings().contrast === true,
    // Le NOM de la simulation, ou null : l'écran l'affiche, pour qu'elle ne passe jamais pour réelle.
    simulation: politiqueMaj.simulation(SIMULATION_MAJ, version, Date.now()) ? SIMULATION_MAJ : null,
  };
}

ipcMain.handle('maj:etat', async () => etatPourAffichage());

// ════════════════════════════════════════════════════════════════════════════════════════════════
// STORE DE RESSOURCES (#444)
// ════════════════════════════════════════════════════════════════════════════════════════════════
// Même exception documentée que les mises à jour (architecture.md, règle n°1) : le réseau, et bientôt
// le jeton de connexion, vivent ici. store-sources.js et le module de chaque site DÉCIDENT ;
// store.js fait les requêtes. En développement, STORYBOARD_SIMULER_STORE rend une réponse enregistrée.
const store = require('./store');
const SIMULATION_STORE = !app.isPackaged && !!process.env.STORYBOARD_SIMULER_STORE;
ipcMain.handle('store:infos', async (event, sourceId) => ({ ...store.infos(sourceId), simulation: SIMULATION_STORE }));
ipcMain.handle('store:chercher', async (event, sourceId, params) =>
  store.chercher(sourceId, params, SIMULATION_STORE ? __dirname : null));
ipcMain.handle('store:telecharges', async () => store.telecharges(getProjectsDir(), SIMULATION_STORE ? __dirname : null));
// #445 : le téléchargement. Le .glb revient au renderer, qui le RANGE par le chemin de l'import
// (src/model-store.js : nom libre, doublon à l'identique) ; puis il demande l'attribution.
ipcMain.handle('store:poids', async (event, sourceId, id) => store.poids(sourceId, id, SIMULATION_STORE ? __dirname : null));
ipcMain.handle('store:telecharger', async (event, sourceId, id, resolution) =>
  store.telecharger(sourceId, id, resolution, (recus, total) => {
    if (!event.sender.isDestroyed()) event.sender.send('store:progression', recus, total);
  }, SIMULATION_STORE ? __dirname : null));
// L'aperçu 3D d'une fiche : un .glb en mémoire, rien sur le disque. Sa progression a son canal, pour
// ne pas se mêler à celle d'un téléchargement en cours.
ipcMain.handle('store:apercu', async (event, sourceId, id) =>
  store.apercu(sourceId, id, (recus, total) => {
    if (!event.sender.isDestroyed()) event.sender.send('store:apercuProgression', sourceId, id, recus, total);
  }, SIMULATION_STORE ? __dirname : null));
ipcMain.handle('store:attribuer', async (event, resultat, fichier, resolution) => {
  const r = await store.attribuer(getProjectsDir(), resultat, fichier, resolution);
  // La vignette de la source devient celle du modèle local : déjà belle, et sans rien à rendre.
  if (r.ok) {
    const image = await store.vignetteSource(resultat);
    if (image) await ecrireVignette(fichier, image, 'source');
  }
  return r;
});

// Télécharge puis installe. La progression part vers la fenêtre qui a demandé. En simulation, on
// joue une progression factice et on s'arrête là : `npm start` n'a rien à remplacer.
let installationEnCours = false;
ipcMain.handle('maj:installer', async (event) => {
  const latest = etatMaj.latest;
  if (installationEnCours) return { ok: false, erreur: 'enCours' };
  if (!latest || politiqueMaj.comparerVersions(latest.version, app.getVersion()) <= 0) return { ok: false, erreur: 'aucune' };
  installationEnCours = true;
  const envoyer = (recus, total) => { if (!event.sender.isDestroyed()) event.sender.send('maj:progression', recus, total); };
  try {
    if (politiqueMaj.simulation(SIMULATION_MAJ, app.getVersion(), Date.now())) {
      for (let i = 1; i <= 20; i++) { await new Promise(r => setTimeout(r, 100)); envoyer(latest.taille * i / 20, latest.taille); }
      return { ok: false, erreur: 'simulation' };
    }
    const chemin = await majES.telechargerInstalleur(latest, envoyer);
    majES.lancerInstalleur(chemin);
    isQuitting = true;
    app.quit();
    return { ok: true };
  } catch (err) {
    return { ok: false, erreur: String(err && err.message || err).includes('empreinte') ? 'empreinte' : 'reseau' };
  } finally {
    installationEnCours = false;
  }
});

// L'écran bloquant redemande : si la situation s'est réglée (le réseau est revenu, et rien
// d'obligatoire n'attend), l'application s'ouvre à sa place.
ipcMain.handle('maj:reessayer', async () => {
  etatMaj = await preparerMaj();
  if (!ecranBloquant(etatMaj) && fenetreBlocage) {
    const ancienne = fenetreBlocage;
    fenetreBlocage = null;
    createWindow('app');
    ancienne.destroy();
  }
  return etatPourAffichage();
});

app.whenReady().then(async () => {
  migrerAncienDossierProjets();
  ensureProjectsDir();
  try { etatMaj = await preparerMaj(); } catch (err) { /* une panne de vérification ne bloque pas */ }
  if (ecranBloquant(etatMaj)) fenetreBlocage = createWindow('blocage');
  else createWindow('app');
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    if (ecranBloquant(etatMaj)) fenetreBlocage = createWindow('blocage');
    else createWindow('app');
  }
});
