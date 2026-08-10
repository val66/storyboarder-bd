/**
 * @file model-store.js
 * Les modèles 3D importés : comment ils sont nommés, rangés, et retrouvés.
 *
 * Ce module DÉCIDE ; le pont Electron se contente d'écrire et de lire (cf. main.js, section
 * « MODÈLES 3D IMPORTÉS »). La séparation n'est pas cosmétique : elle met le nommage, les collisions
 * et les messages du côté testable, et laisse au process principal ce qu'il est seul à pouvoir faire.
 *
 * OÙ VIVENT LES MODÈLES. Dans `<dossier de Projets>/Modeles`, donc à l'endroit que l'utilisateur a
 * choisi pour ses Projets. C'est délibéré : beaucoup y mettent un dossier synchronisé (OneDrive,
 * Dropbox). Ranger les modèles dans les données d'application les ferait rester sur place, et le
 * Projet s'ouvrirait amputé sur la seconde machine sans que personne comprenne pourquoi.
 *
 * CE QU'ON NE FAIT PAS, et c'est une règle : un modèle introuvable ne supprime JAMAIS l'Élément qui
 * le porte. Un disque externe non monté, un antivirus qui verrouille un fichier, et le placement
 * patiemment réglé — position, échelle, orientation — disparaîtrait, gravé quelques secondes plus
 * tard par la sauvegarde automatique. L'Élément reste, en boîte de remplacement, et redevient normal
 * dès que le fichier revient. Cf. docs/persisted-data.md § 5.
 */

/** Extension acceptée. `.gltf` est lisible aussi, mais il traîne ses textures en fichiers séparés. */
const EXTENSION = '.glb';

/**
 * Rend un nom de fichier sûr et lisible à partir de ce que l'utilisateur a fourni.
 *
 * On NETTOIE ici ; le process principal, lui, REFUSE tout ce qui n'est pas déjà propre (cf.
 * `nomDeModeleAcceptable` dans main.js). Deux métiers différents, pas un doublon : si l'un des deux
 * disparaissait, l'autre ne le remplacerait pas.
 *
 * Retire les séparateurs de chemin — c'est ce qui empêche un nom comme `../../ailleurs` de sortir du
 * dossier —, les caractères interdits par Windows, les points de tête (fichiers cachés et `..`), et
 * force l'extension.
 */
export function sanitizeModelName(nom){
  let n = String(nom || '').trim();
  n = n.replace(/^.*[\\/]/, '');               // ne garder que le nom de fichier
  n = n.replace(/[\\/:*?"<>|]/g, '_');         // caractères interdits sous Windows
  n = n.replace(/^\.+/, '');                   // ni « .. », ni fichier caché
  n = n.replace(/\.(glb|gltf)$/i, '');         // extension retirée puis réimposée, une seule fois
  n = n.trim();
  if (!n) n = 'modele';
  return n + EXTENSION;
}

/**
 * Un nom libre parmi ceux déjà pris, sur le modèle de `project:rename` : « chaise.glb »,
 * « chaise (2).glb », « chaise (3).glb ».
 *
 * La comparaison ignore la casse : Windows ne distingue pas `Chaise.glb` de `chaise.glb`, et rendre
 * un nom « libre » qui écrase un fichier existant serait la pire réponse possible.
 */
export function resolveModelName(souhaité, existants = []){
  const propre = sanitizeModelName(souhaité);
  const pris = new Set(existants.map(n => String(n).toLowerCase()));
  if (!pris.has(propre.toLowerCase())) return propre;
  const base = propre.slice(0, -EXTENSION.length);
  for (let i = 2; ; i++) {
    const essai = `${base} (${i})${EXTENSION}`;
    if (!pris.has(essai.toLowerCase())) return essai;
  }
}

/** Deux contenus identiques ? Sert à ne pas recopier un modèle déjà importé sous un autre nom. */
export function memeContenu(a, b){
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Le pont, isolé derrière une indirection pour rester testable
// ─────────────────────────────────────────────────────────────────────────────

// `window.storyboarderAPI` n'existe pas sous Node, et le remplacer entièrement dans un test serait
// aussi valable que de ne rien tester. On passe par ce point unique, que les tests substituent.
let _pont = null;
export function setModelBridge(pont){ _pont = pont; }
function pont(){
  return _pont || (typeof window !== 'undefined' ? window.storyboarderAPI : null);
}

/** Les modèles présents dans le dossier. Tableau vide si le pont est absent (mode navigateur). */
export async function listModels(){
  const p = pont();
  if (!p || !p.listModelFiles) return [];
  try { return await p.listModelFiles() || []; } catch { return []; }
}

/**
 * Ouvre le sélecteur, range le fichier choisi, rend le nom retenu.
 *
 * Résultats possibles, tous explicites — aucun ne se tait :
 *   { canceled: true }               l'utilisateur a renoncé
 *   { ok: true, name, déjàPrésent }  rangé (ou retrouvé à l'identique, cf. `déjàPrésent`)
 *   { ok: false, error }             rien n'a été écrit, et on dit pourquoi
 */
export async function importModel(){
  const p = pont();
  if (!p || !p.pickModelFile) return { ok: false, error: 'indisponible hors de l\'application' };

  const choisi = await p.pickModelFile();
  if (!choisi || choisi.canceled) return { canceled: true };
  if (choisi.error) return { ok: false, error: choisi.error };
  if (!choisi.data || !choisi.data.length) return { ok: false, error: 'fichier vide' };

  const existants = await listModels();

  // Réimporter deux fois le même fichier ne doit pas produire « chaise.glb » ET « chaise (2).glb ».
  // On compare le CONTENU, pas le nom : c'est le seul critère qui ne se trompe pas.
  const candidat = sanitizeModelName(choisi.name);
  if (existants.some(n => n.toLowerCase() === candidat.toLowerCase())) {
    const actuel = await p.readModelFile(candidat);
    if (actuel && actuel.ok && memeContenu(actuel.data, choisi.data)) {
      return { ok: true, name: candidat, déjàPrésent: true };
    }
  }

  const nom = resolveModelName(choisi.name, existants);
  const écrit = await p.writeModelFile(nom, choisi.data);
  if (!écrit || !écrit.ok) return { ok: false, error: (écrit && écrit.error) || 'écriture refusée' };
  return { ok: true, name: nom, déjàPrésent: false };
}

/**
 * Les octets d'un modèle rangé, ou null s'il est introuvable.
 *
 * `null` veut dire « affiche une boîte de remplacement », jamais « supprime l'Élément ». L'appelant
 * qui confondrait les deux détruirait le travail de l'utilisateur sur une panne passagère.
 */
export async function readModel(name){
  const p = pont();
  if (!p || !p.readModelFile) return null;
  try {
    const r = await p.readModelFile(name);
    return (r && r.ok && r.data) ? r.data : null;
  } catch {
    return null;
  }
}
