/**
 * @file skeleton-store.js
 * Garder les correspondances de squelette, et les retrouver.
 *
 * OÙ, ET POURQUOI LÀ. Une correspondance appartient au FICHIER, pas à l'Élément ni au Projet : tous
 * les exemplaires de `worker_j.glb` partagent le même squelette, et le corriger une fois doit
 * suffire pour toujours. Elle est donc rangée à côté du dossier `Modeles`, comme la bibliothèque de
 * poses est rangée à côté des Projets — choix de l'utilisateur, en connaissance du prix : la
 * correspondance NE VOYAGE PAS avec un `.json` de Projet transmis à quelqu'un d'autre. Ce qui est
 * cohérent, puisque le `.glb` ne voyage pas non plus.
 *
 * ON MÉMORISE DES NOMS D'OS, PAS DES INDICES. Un indice de nœud glTF n'a de sens que pour un fichier
 * donné : réexporter le même personnage depuis Blender renumérote tout, et une correspondance par
 * indices désignerait alors des os arbitraires — silencieusement. Les noms, eux, survivent aux
 * réexports dans les cinq conventions mesurées, et ce sont eux que l'utilisateur lit à l'écran.
 *
 * CE FICHIER NE DEVINE RIEN. La reconnaissance automatique est dans skeleton-map.js et reste pure.
 * Ici on ne fait que ranger, relire, et FUSIONNER les deux : ce que l'utilisateur a corrigé prime
 * sur ce que la reconnaissance propose, et le reste vient de la reconnaissance.
 */

import { SLOTS } from './skeleton-map.js';

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
    // Une entrée sans aucun os n'apprend rien : la garder ferait croire à une correspondance
    // enregistrée là où il n'y a rien, et empêcherait de reproposer la reconnaissance.
    if (Object.keys(os).length) entrees[fichier] = { os };
  });
  return { version: SKELETON_MAP_FORMAT, entrees };
}

/**
 * Ce qu'on écrit sur le disque pour un fichier donné. Fonction PURE.
 *
 * N'enregistre QUE les emplacements que l'utilisateur a effectivement posés ou confirmés. Recopier
 * aussi les propositions automatiques figerait la reconnaissance d'aujourd'hui : une version
 * ultérieure qui saurait mieux faire ne pourrait plus s'appliquer, puisqu'elle trouverait une
 * correspondance « enregistrée » partout. On ne fige que les décisions humaines.
 */
export function entreePourFichier(carte){
  const os = {};
  SLOTS.forEach(slot => {
    const v = (carte || {})[slot];
    if (v && v.bone !== undefined && v.origine === 'manuel' && v.name) os[slot] = v.name;
  });
  return Object.keys(os).length ? { os } : null;
}

/**
 * Fusionne une correspondance enregistrée avec ce que la reconnaissance propose. Fonction PURE.
 *
 * @param {object} auto     ce que rend inferSkeletonMap (par emplacement, ou null)
 * @param {object} enregistree  { os: { slot: nomDOs } }, ou null
 * @param {Array}  osDuFichier  [{ id, name }] — les os réellement présents
 *
 * L'ENREGISTRÉ PRIME, MAIS SEULEMENT S'IL DÉSIGNE UN OS QUI EXISTE ENCORE. Un `.glb` remplacé par
 * une autre version peut avoir perdu l'os retenu ; l'entrée devient alors caduque, et on retombe
 * sur la reconnaissance pour cet emplacement plutôt que de pointer dans le vide. Le reste de la
 * correspondance enregistrée, lui, reste valable — on ne jette pas tout pour un os.
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

/** Relit le fichier des correspondances. Rend toujours une forme valide, jamais d'exception. */
export async function lireCorrespondances(){
  const p = pont();
  if (!p || !p.readSkeletonMaps) return normaliserFichier(null);
  try {
    const r = await p.readSkeletonMaps();
    return normaliserFichier(r && r.ok ? r.data : null);
  } catch {
    return normaliserFichier(null);
  }
}

/**
 * Enregistre la correspondance d'un fichier. Rend { ok, error? }.
 *
 * Relit AVANT d'écrire, puis réécrit l'ensemble. Le fichier est partagé par tous les Projets : entre
 * le moment où l'on a chargé les correspondances et celui où l'on enregistre, une autre fenêtre de
 * l'application a pu en ajouter une. Réécrire ce qu'on avait en mémoire l'effacerait.
 */
export async function enregistrerCorrespondance(fichier, carte){
  const p = pont();
  if (!p || !p.writeSkeletonMaps) return { ok: false, error: 'pont indisponible' };
  if (!fichier) return { ok: false, error: 'fichier manquant' };
  const tout = await lireCorrespondances();
  const entree = entreePourFichier(carte);
  if (entree) tout.entrees[fichier] = entree;
  else delete tout.entrees[fichier];   // plus aucune décision humaine : on ne garde pas une coquille
  try {
    const r = await p.writeSkeletonMaps(tout);
    return (r && r.ok) ? { ok: true } : { ok: false, error: (r && r.error) || 'écriture refusée' };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

/** Oublie la correspondance d'un fichier — appelé quand le `.glb` est supprimé du disque. */
export async function oublierCorrespondance(fichier){
  return enregistrerCorrespondance(fichier, {});
}
