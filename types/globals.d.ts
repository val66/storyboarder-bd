// Déclarations ambiantes — lues UNIQUEMENT par la vérification de types (jsconfig.json).
// Ce fichier n'est jamais chargé à l'exécution et ne fait partie d'aucun bundle : il n'y en a pas.
//
// ─────────────────────────────────────────────────────────────────────────────
// POURQUOI CE FICHIER EXISTE
//
// La première mesure a donné 1070 diagnostics, dont 652 d'un seul code — TS2304, « Cannot find
// name ». Ce n'étaient pas 652 défauts : c'était UN fait de configuration, répété 652 fois.
// `THREE` est chargé par une balise <script> dans index.html, pas importé. Le vérificateur ne
// pouvait pas le savoir.
//
// C'est exactement le motif redouté en installant l'outil : du bruit de configuration qui noie le
// signal et finit par faire éteindre l'outil. On le retire ici, en une déclaration, plutôt qu'en
// touchant 458 lignes de code qui n'ont rien de faux.
// ─────────────────────────────────────────────────────────────────────────────

// three r128 ne publie PAS ses types (aucun champ `types` dans son package.json, aucun .d.ts dans
// le paquet). `any` est donc la seule description honnête disponible sans ajouter @types/three.
//
// CE QU'ON PERD, assumé : aucune vérification à l'intérieur du monde THREE — un `mesh.positionn`
// mal orthographié passera. CE QU'ON GARDE : tout le reste, c'est-à-dire les frontières entre nos
// propres modules, qui sont le sujet.
//
// À REVOIR si l'on passe à une version de three qui embarque ses types : la déclaration ci-dessous
// devient alors `const THREE: typeof import('three')` et le vérificateur couvre aussi le 3D.
declare const THREE: any;

/**
 * Pont Electron exposé par preload.js (contextIsolation). C'est LA frontière du renderer avec le
 * disque : tout ce qui sort de l'application passe par là.
 *
 * La typer sert deux choses. D'abord, un appel avec le mauvais nombre d'arguments devient visible —
 * c'est le genre de faute qu'aucun test du renderer n'attrape, puisqu'ils simulent ce pont. Ensuite,
 * la forme des RÉPONSES est documentée à l'endroit où on la lit : `{ ok, error }` pour une écriture,
 * `{ canceled, filePath, data }` pour une boîte de dialogue. Le défaut « un échec annoncé comme un
 * succès », corrigé aujourd'hui, vivait précisément dans la lecture de ce `ok`.
 */
interface StoryboarderAPI {
  // Recopié de preload.js, qui est la source de vérité. tests/electron-bridge.test.mjs vérifie que
  // les deux listes ne divergent pas — sans quoi une méthode ajoutée au pont resterait invisible
  // ici, et une méthode retirée continuerait d'être « déclarée » alors qu'elle n'existe plus.
  //
  // AUCUNE signature d'index. La première version en portait une (`[autre: string]: unknown`), et
  // elle rendait `unknown` TOUTE méthode non listée — donc non appelable. Neuf diagnostics
  // « This expression is not callable » en sont sortis, tous faux, tous produits par cette
  // déclaration et non par le code. Une signature d'index sur une interface de frontière ne
  // documente rien : elle autorise tout et ne vérifie rien.
  saveProjectAs(json: string, suggestedName: string):
    Promise<{ canceled: boolean; filePath?: string }>;
  writeProjectFile(filePath: string, json: string): Promise<{ ok: boolean; error?: string }>;
  openProjectDialog(): Promise<{ canceled: boolean; filePath?: string; data?: string }>;
  renameProjectFile(filePath: string, newName: string):
    Promise<{ ok: boolean; error?: string; filePath?: string }>;
  deleteProjectFile(filePath: string): Promise<{ ok: boolean; error?: string }>;
  getLastProject(): Promise<{ filePath?: string; data?: string } | null>;
  getSettings(): Promise<Record<string, unknown>>;
  setSetting(key: string, value: unknown): Promise<unknown>;
  getProjectsDir(): Promise<string>;
  chooseProjectsDir(): Promise<{ canceled: boolean; dir?: string }>;
  onRequestQuitConfirmation(callback: () => void): void;
  confirmQuit(): void;
  // Modèles 3D importés. `data` voyage en Uint8Array par le clonage structuré de l'IPC : décrire
  // ici la forme des réponses évite d'aller relire main.js pour savoir si un échec se lit sur `ok`
  // ou sur `error` — la même confusion qui avait produit « un échec annoncé comme un succès ».
  pickModelFile():
    Promise<{ canceled: true } | { canceled: false; name?: string; data?: Uint8Array; error?: string }>;
  writeModelFile(name: string, data: Uint8Array):
    Promise<{ ok: boolean; name?: string; error?: string }>;
  readModelFile(name: string): Promise<{ ok: boolean; data?: Uint8Array; error?: string }>;
  listModelFiles(): Promise<string[]>;
  deleteModelFile(name: string): Promise<{ ok: boolean; error?: string }>;
  // `ok: false` couvre aussi le refus d'écraser un homonyme : le renommage ne remplace jamais
  // un fichier existant, il échoue et le dit.
  renameModelFile(ancien: string, nouveau: string):
    Promise<{ ok: boolean; name?: string; error?: string }>;
  // Correspondances de squelette : un seul fichier partagé par tous les Projets, à côté du dossier
  // Modeles. `ok: false` couvre l'absence au premier usage comme le fichier illisible — les deux
  // se traitent pareil côté renderer, on repart d'une correspondance vide.
  readSkeletonMaps(): Promise<{ ok: boolean; data?: unknown; error?: string }>;
  writeSkeletonMaps(contenu: unknown): Promise<{ ok: boolean; error?: string }>;
}

interface Window {
  storyboarderAPI?: StoryboarderAPI;
  // Exposée volontairement : index.html porte des `onclick="toggleModalSection(this)"` en ligne, qui
  // ne peuvent atteindre qu'une globale. events.js l'y installe explicitement, avec un commentaire.
  // Ce n'est pas une fuite, c'est une liaison HTML → JS assumée.
  toggleModalSection?: (headerEl: HTMLElement) => void;
  // Poignée de diagnostic posée à la main depuis la console, quand il y en a une. Déclarée
  // optionnelle : rien dans l'application ne doit en dépendre.
  perf?: Record<string, (...args: unknown[]) => unknown>;
  // API File System Access — le chemin navigateur, alternatif au pont Electron. Le typage minimal
  // ci-dessous décrit CE QU'ON EN UTILISE, pas l'API complète : sans lui, le vérificateur rendait
  // `unknown` et signalait `getFile` et `requestPermission` comme inexistants. C'étaient deux faux
  // positifs venant de ma propre déclaration — pas du code.
  showOpenFilePicker?: (options?: unknown) => Promise<FileSystemFileHandleMinimal[]>;
  showSaveFilePicker?: (options?: unknown) => Promise<FileSystemFileHandleMinimal>;
}

/** Ce que l'application utilise réellement d'un handle File System Access. */
interface FileSystemFileHandleMinimal {
  name: string;
  getFile(): Promise<{ text(): Promise<string> }>;
  createWritable(): Promise<{ write(contenu: string): Promise<void>; close(): Promise<void> }>;
  requestPermission?(options?: { mode?: string }): Promise<string>;
}
