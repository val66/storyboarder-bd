/**
 * @file skeleton-store.js
 * Garder les correspondances de squelette, et les retrouver.
 *
 * OÙ, ET POURQUOI LÀ. Une correspondance appartient au FICHIER, pas à l'Élément ni au Projet : tous
 * les exemplaires de `worker_j.glb` partagent le même squelette, et le corriger une fois doit
 * suffire pour toujours. Elle est donc rangée à côté du dossier `Modeles`, comme la bibliothèque de
 * poses est rangée à côté des Projets, choix de l'utilisateur, en connaissance du prix : la
 * correspondance NE VOYAGE PAS avec un `.json` de Projet transmis à quelqu'un d'autre. Ce qui est
 * cohérent, puisque le `.glb` ne voyage pas non plus.
 *
 * ON MÉMORISE DES NOMS D'OS, PAS DES INDICES. Un indice de nœud glTF n'a de sens que pour un fichier
 * donné : réexporter le même personnage depuis Blender renumérote tout, et une correspondance par
 * indices désignerait alors des os arbitraires, silencieusement. Les noms, eux, survivent aux
 * réexports dans les cinq conventions mesurées, et ce sont eux que l'utilisateur lit à l'écran.
 *
 * CE FICHIER NE DEVINE RIEN. La reconnaissance automatique est dans skeleton-map.js et reste pure.
 * Ici on ne fait que ranger, relire, et FUSIONNER les deux : ce que l'utilisateur a corrigé prime
 * sur ce que la reconnaissance propose, et le reste vient de la reconnaissance.
 */

import { SLOTS } from './skeleton-map.js';
import { ARCHETYPES_3D } from './constants.js';

/** Les clés d'archétype acceptées à la relecture. Un fichier bricolé n'en impose pas d'autres. */
const MORPHOLOGIES_CONNUES = new Set(ARCHETYPES_3D.map(a => a.cle));

/** Version du format rangé. Incrémentée seulement si la forme change de façon incompatible. */
export const SKELETON_MAP_FORMAT = 1;

// Pont Electron, injecté (cf. model-store.js, même principe) pour que ce module se teste sans IPC.
let _pont = null;
export function setSkeletonBridge(pont){ _pont = pont; }
function pont(){
  return _pont || (typeof window !== 'undefined' ? window.storyboarderAPI : null);
}

/**
 * Normalise ce qui a été relu du disque. Fonction PURE.
 *
 * Un fichier écrit à la main, tronqué, ou venu d'une version future ne doit JAMAIS faire échouer le
 * chargement d'un Projet : au pire on repart d'une correspondance vide et la reconnaissance
 * automatique reprend la main. Une correspondance perdue se refait en trente secondes ; un Projet
 * qui refuse de s'ouvrir, non.
 */
export function normaliserFichier(brut){
  const vide = { version: SKELETON_MAP_FORMAT, entrees: {} };
  if (!brut || typeof brut !== 'object') return vide;
  // Une version FUTURE est ignorée plutôt que réinterprétée de travers. On ne sait pas ce qu'elle
  // contient ; prétendre le contraire écraserait le travail fait par une version plus récente.
  if (Number(brut.version) > SKELETON_MAP_FORMAT) return vide;
  const entrees = {};
  Object.entries(brut.entrees || {}).forEach(([fichier, entree]) => {
    if (!fichier || !entree || typeof entree !== 'object') return;
    const os = {};
    SLOTS.forEach(slot => {
      const nom = (entree.os || {})[slot];
      if (typeof nom === 'string' && nom) os[slot] = nom;
    });
    // `valide` dit que l'utilisateur A VU cet écran et l'a validé, indépendamment de savoir s'il a
    // corrigé quelque chose. Une entrée peut donc être vide d'os et malgré tout signifiante.
    const valide = entree.valide === true;
    // `morphologie` est un AJOUT (tâche #369), pas un renommage : `SKELETON_MAP_FORMAT` ne bouge
    // donc pas. Une version antérieure de l'application ignore simplement cette clé et continue de
    // lire `os` et `valide` ; la passer à 2 lui ferait au contraire rejeter le fichier ENTIER.
    // Une clé inconnue est écartée plutôt que reprise : elle ne s'afficherait nulle part.
    const morphologie = MORPHOLOGIES_CONNUES.has(entree.morphologie) ? entree.morphologie : null;
    // `membres` est un second AJOUT (tâche #373), suivant exactement la même règle que
    // `morphologie` : la version du format ne bouge pas, une clé inconnue est ignorée par les
    // versions antérieures. Une entrée mal formée est écartée plutôt que reprise, sans quoi une
    // ligne sans `racine` désignerait une chaîne introuvable et disparaîtrait de l'écran sans rien
    // dire, en emportant le nom que l'utilisateur avait tapé.
    const membres = normaliserMembres(entree.membres);
    if (Object.keys(os).length || valide || morphologie || membres.length) {
      entrees[fichier] = { os, valide };
      if (morphologie) entrees[fichier].morphologie = morphologie;
      if (membres.length) entrees[fichier].membres = membres;
    }
  });
  return { version: SKELETON_MAP_FORMAT, entrees };
}

/**
 * Ce qu'on écrit sur le disque pour un fichier donné. Fonction PURE.
 *
 * DEUX INFORMATIONS DISTINCTES, et les avoir confondues était un défaut signalé à l'usage.
 *
 *   — `os` : les emplacements que l'utilisateur a effectivement posés. On ne recopie PAS les
 *     propositions automatiques : les figer condamnerait toute amélioration future de la
 *     reconnaissance, qui trouverait une correspondance « enregistrée » partout ;
 *   — `valide` : l'utilisateur a VU cet écran et l'a validé. C'est ce qui empêche de le rouvrir
 *     tout seul au prochain import.
 *
 * Ma première version ne gardait que `os`, et n'écrivait donc RIEN quand l'utilisateur validait
 * sans rien corriger, le cas le plus fréquent, puisque la reconnaissance est souvent juste. La
 * modale se rouvrait alors à chaque import, ce qui revenait à n'avoir jamais enregistré. Le
 * commentaire que j'avais écrit à l'époque, « une entrée sans os n'apprend rien », était faux :
 * elle apprend que l'utilisateur a tranché.
 *
 * `morphologie` SUIT EXACTEMENT LA MÊME RÈGLE QUE `os`, et pour la même raison : on n'écrit que le
 * choix HUMAIN. Figer l'archétype proposé condamnerait toute amélioration du classement, qui
 * trouverait une morphologie « enregistrée » sur chaque fichier jamais touché. L'appelant ne passe
 * donc `morphologie` que lorsque l'utilisateur a touché au sélecteur.
 */
/**
 * Les lignes de membres qu'on accepte de garder. Fonction PURE.
 *
 * ON N'ÉCRIT QUE CE QUI EST UN CHOIX HUMAIN, comme pour `os` et `morphologie` : une ligne qui n'a
 * ni nom tapé ni décochage n'apprend rien, et la figer condamnerait toute amélioration du
 * vocabulaire de nommage, qui trouverait un nom « enregistré » sur chaque chaîne jamais touchée.
 */
function normaliserMembres(brut){
  return (Array.isArray(brut) ? brut : [])
    .filter(e => e && typeof e.racine === 'string' && e.racine)
    .map(e => ({
      racine: e.racine,
      nom: typeof e.nom === 'string' && e.nom ? e.nom : null,
      retenu: e.retenu !== false,
    }))
    .filter(e => e.nom !== null || e.retenu === false)
    .map(e => (e.nom !== null ? { racine: e.racine, nom: e.nom, retenu: e.retenu } : { racine: e.racine, retenu: false }));
}

/**
 * La morphologie EFFECTIVE d'un fichier : le choix humain s'il existe, sinon le proposé. PURE.
 *
 * MÊME RÈGLE QUE `fusionner` POUR LES EMPLACEMENTS, et elle est ici pour être à côté d'elle : ce
 * fichier tient déjà « l'enregistré prime, le proposé comble ». La dupliquer à l'endroit qui lit le
 * disque l'aurait rendue invérifiable, et la mutation qui supprime la priorité du choix humain
 * ÉCHAPPAIT à la campagne de la tâche #374, faute d'un appelant testable.
 *
 * Sans os, on rend `humanoide`, la valeur qui laisse tout comme avant : à cet instant on ne sait
 * rien, et supposer une créature ferait disparaître les dix-huit emplacements d'un personnage le
 * temps d'un décodage.
 *
 * @param propose une fonction `(os) => cle`, injectée pour que ce module n'importe pas la
 *                reconnaissance : skeleton-store ne devine RIEN, c'est sa règle d'en-tête.
 */
export function morphologieEffective3D(enregistree, osDuFichier, propose){
  if (enregistree && enregistree.morphologie) return enregistree.morphologie;
  const os = osDuFichier || [];
  return (os.length && propose) ? propose(os) : 'humanoide';
}

export function entreePourFichier(carte, { valide = false, morphologie = null, membres = null } = {}){
  const os = {};
  SLOTS.forEach(slot => {
    const v = (carte || {})[slot];
    if (v && v.bone !== undefined && v.origine === 'manuel' && v.name) os[slot] = v.name;
  });
  const m = MORPHOLOGIES_CONNUES.has(morphologie) ? morphologie : null;
  const mem = normaliserMembres(membres);
  if (!Object.keys(os).length && !valide && !m && !mem.length) return null;
  const sortie = { os, valide };
  if (m) sortie.morphologie = m;
  if (mem.length) sortie.membres = mem;
  return sortie;
}

/**
 * Fusionne une correspondance enregistrée avec ce que la reconnaissance propose. Fonction PURE.
 *
 * @param {object} auto     ce que rend inferSkeletonMap (par emplacement, ou null)
 * @param {object} enregistree  { os: { slot: nomDOs } }, ou null
 * @param {Array}  osDuFichier  [{ id, name }], les os réellement présents
 *
 * L'ENREGISTRÉ PRIME, MAIS SEULEMENT S'IL DÉSIGNE UN OS QUI EXISTE ENCORE. Un `.glb` remplacé par
 * une autre version peut avoir perdu l'os retenu ; l'entrée devient alors caduque, et on retombe
 * sur la reconnaissance pour cet emplacement plutôt que de pointer dans le vide. Le reste de la
 * correspondance enregistrée, lui, reste valable, on ne jette pas tout pour un os.
 */
export function fusionner(auto, enregistree, osDuFichier){
  const parNom = new Map((osDuFichier || []).filter(o => o && o.name).map(o => [o.name, o.id]));
  const sortie = {};
  SLOTS.forEach(slot => {
    const nomEnregistre = ((enregistree || {}).os || {})[slot];
    if (nomEnregistre && parNom.has(nomEnregistre)) {
      sortie[slot] = { bone: parNom.get(nomEnregistre), name: nomEnregistre, origine: 'manuel' };
    } else {
      sortie[slot] = (auto || {})[slot] || null;
    }
  });
  return sortie;
}

// ─────────────────────────────────────────────────────────────────────────────
// Disque
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Dernier état relu du disque, gardé en mémoire.
 *
 * POURQUOI UN CACHE, ALORS QUE LA LECTURE EST DÉJÀ RAPIDE. Ce n'est pas une optimisation, c'est une
 * question de FORME : construire le rig 3D d'un modèle importé se fait à l'intérieur d'un rendu, un
 * chemin strictement synchrone (cf. l'en-tête de model-cache.js, « le chemin de dessin n'attend
 * jamais »). Une lecture disque y est impossible, et la rendre asynchrone contaminerait tout
 * `buildPropRig3D`.
 *
 * Le cache est rempli au démarrage puis tenu à jour à chaque enregistrement. S'il est vide, au
 * tout premier rendu, avant que le préchargement n'aboutisse, la reconnaissance automatique fait
 * le travail seule : c'est le comportement de l'étape A, correct sur les six fichiers mesurés. Une
 * correction manuelle apparaît donc au pire au rendu suivant, jamais « jamais ».
 */
let _enMemoire = { version: SKELETON_MAP_FORMAT, entrees: {} };

/**
 * La correspondance enregistrée d'un fichier, SANS toucher au disque. Rend `null` si aucune.
 *
 * C'est l'accès dont dispose le constructeur de rig. Il ne rend que ce que l'utilisateur a
 * réellement enregistré : la fusion avec la reconnaissance automatique reste l'affaire de
 * `fusionner`, ici comme ailleurs.
 */
export function correspondanceEnregistreeSync(fichier){
  return (_enMemoire.entrees || {})[fichier] || null;
}

/** Relit le fichier des correspondances. Rend toujours une forme valide, jamais d'exception. */
export async function lireCorrespondances(){
  const p = pont();
  if (!p || !p.readSkeletonMaps) return normaliserFichier(null);
  try {
    const r = await p.readSkeletonMaps();
    const tout = normaliserFichier(r && r.ok ? r.data : null);
    _enMemoire = tout;
    return tout;
  } catch {
    // Le cache N'EST PAS vidé sur échec, et c'est délibéré : une lecture qui rate ne prouve pas que
    // les correspondances ont disparu, seulement qu'on n'a pas pu les relire. Les oublier ferait
    // perdre à l'utilisateur, le temps d'un incident disque, un travail de correction qui est
    // toujours sur le disque.
    return normaliserFichier(null);
  }
}

/**
 * Vide le cache résident. Réservé aux tests, un état qui survit d'un test à l'autre est un test
 * qui passe pour une mauvaise raison, et ce dépôt s'y est déjà laissé prendre.
 */
export function _viderCacheCorrespondances(){
  _enMemoire = { version: SKELETON_MAP_FORMAT, entrees: {} };
}

/**
 * Enregistre la correspondance d'un fichier. Rend { ok, error? }.
 *
 * Relit AVANT d'écrire, puis réécrit l'ensemble. Le fichier est partagé par tous les Projets : entre
 * le moment où l'on a chargé les correspondances et celui où l'on enregistre, une autre fenêtre de
 * l'application a pu en ajouter une. Réécrire ce qu'on avait en mémoire l'effacerait.
 */
export async function enregistrerCorrespondance(fichier, carte, { valide = true, morphologie = null, membres = null } = {}){
  const p = pont();
  if (!p || !p.writeSkeletonMaps) return { ok: false, error: 'pont indisponible' };
  if (!fichier) return { ok: false, error: 'fichier manquant' };
  const tout = await lireCorrespondances();
  const entree = entreePourFichier(carte, { valide, morphologie, membres });
  // COPIE, ET NON MUTATION DE `tout`. La relecture ci-dessus vient de poser SON résultat dans le
  // cache résident : `tout` et `_enMemoire` désignent alors le MÊME objet. Écrire dans `tout`
  // écrirait donc dans le cache, avant l'écriture disque, et sans moyen de revenir en arrière si
  // elle échoue. Le garde-fou « ne mettre à jour qu'en cas de succès » plus bas était strictement
  // inopérant tant que cette copie manquait : c'est une mutation de test échappée qui l'a montré,
  // puis le test lui-même qui a mis au jour le partage de référence.
  const suivant = { version: tout.version, entrees: { ...tout.entrees } };
  if (entree) suivant.entrees[fichier] = entree;
  else delete suivant.entrees[fichier];   // ni décision, ni validation : rien à garder
  try {
    const r = await p.writeSkeletonMaps(suivant);
    // Le cache résident ne suit QUE les écritures réussies. Le mettre à jour avant, ou malgré un
    // échec, ferait afficher au rig une correspondance que le disque ne porte pas, et l'écart ne
    // se verrait qu'au redémarrage suivant, longtemps après la cause.
    if (r && r.ok) _enMemoire = suivant;
    return (r && r.ok) ? { ok: true } : { ok: false, error: (r && r.error) || 'écriture refusée' };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

/**
 * L'écran de correspondance doit-il s'ouvrir tout seul après un import ? Fonction PURE.
 *
 * TROIS CAS, ET UN SEUL OUVRE.
 *
 *   — pas d'os : une chaise, un bâtiment, un décor. C'est probablement la majorité des imports, et
 *     l'écran n'aurait littéralement aucune ligne à afficher ;
 *   — une correspondance déjà VALIDÉE : l'utilisateur a vu cet écran et l'a enregistré. Peu importe
 *     qu'il reste des lignes « structure », il les a vues, signalées, et a tranché. Les lui
 *     remontrer à chaque import reviendrait à ne pas avoir enregistré (signalé à l'usage) ;
 *   — un squelette, jamais vu : on ouvre. MÊME si la reconnaissance est complète et sans
 *     avertissement, choix de l'utilisateur, contre mon avis initial. Sa raison est meilleure que
 *     la mienne : c'est le seul moment où l'on pense à ce modèle, et un écran qui ne s'ouvre jamais
 *     quand tout va bien est un écran dont on ignore l'existence le jour où ça va mal.
 */
export function doitOuvrirCorrespondance({ osDuFichier, dejaEnregistree } = {}){
  if (!Array.isArray(osDuFichier) || osDuFichier.length === 0) return false;
  if (dejaEnregistree) return false;
  return true;
}

/**
 * Oublie la correspondance d'un fichier, appelé quand le `.glb` est supprimé du disque.
 *
 * `valide: false` est essentiel : sans lui, on réécrirait une coquille validée pour un fichier qui
 * n'existe plus, et un homonyme réimporté plus tard n'ouvrirait jamais l'écran.
 */
export async function oublierCorrespondance(fichier){
  return enregistrerCorrespondance(fichier, {}, { valide: false });
}

/**
 * Fait suivre la correspondance quand le `.glb` est RENOMMÉ. Rend { ok, error? }.
 *
 * Les correspondances sont indexées par NOM DE FICHIER : renommer sans les déplacer laisserait la
 * carte d'os attachée à un fichier disparu, et le modèle renommé repartirait de la reconnaissance
 * automatique, l'écran de correspondance se rouvrirait, et le travail de correction serait à
 * refaire alors qu'il est là, dans le fichier, sous l'ancienne clé.
 *
 * DÉPLACEMENT, PAS COPIE : l'ancienne clé est retirée. La garder ferait ressusciter la carte de
 * l'ANCIEN squelette le jour où un homonyme est réimporté, la panne exacte contre laquelle
 * `oublierCorrespondance` a été écrite.
 *
 * Une seule écriture pour les deux moitiés : écrire la nouvelle clé puis effacer l'ancienne, en deux
 * temps, laisserait un doublon sur le disque si la seconde échouait.
 */
export async function renommerCorrespondance(ancien, nouveau){
  const p = pont();
  if (!p || !p.writeSkeletonMaps) return { ok: false, error: 'pont indisponible' };
  if (!ancien || !nouveau) return { ok: false, error: 'fichier manquant' };
  if (ancien === nouveau) return { ok: true };
  const tout = await lireCorrespondances();
  const entree = (tout.entrees || {})[ancien];
  // Rien à déplacer : ce n'est pas un échec. Un modèle sans os n'a jamais eu de correspondance, et
  // c'est le cas le plus courant (une chaise, un décor).
  if (!entree) return { ok: true };
  // Copie, pour la même raison que dans enregistrerCorrespondance : `tout` et le cache résident
  // désignent le même objet après la relecture.
  const suivant = { version: tout.version, entrees: { ...tout.entrees } };
  suivant.entrees[nouveau] = entree;
  delete suivant.entrees[ancien];
  try {
    const r = await p.writeSkeletonMaps(suivant);
    if (r && r.ok) _enMemoire = suivant;
    return (r && r.ok) ? { ok: true } : { ok: false, error: (r && r.error) || 'écriture refusée' };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}
