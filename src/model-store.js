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
 * patiemment réglé, position, échelle, orientation, disparaîtrait, gravé quelques secondes plus
 * tard par la sauvegarde automatique. L'Élément reste, en boîte de remplacement, et redevient normal
 * dès que le fichier revient. Cf. docs/en/persisted-data.md § 5.
 */

import { OBJECT_REAL_HEIGHT_M, WALL_PX_PER_UNIT_3D } from './constants.js';
import { newId } from './state.js';
import { clamp } from './utils.js';

/** Extension acceptée. `.gltf` est lisible aussi, mais il traîne ses textures en fichiers séparés. */
const EXTENSION = '.glb';

/**
 * Le discriminant persisté d'un modèle importé.
 *
 * PAS de nouveau `type` : un modèle importé est un `type: 'objet3d'` comme les autres, avec un
 * `objType` nouveau. C'est le choix qui coûte le moins et rapporte le plus, il hérite d'un coup du
 * placement, de l'aimantation au Sol, des coordonnées monde, de la ligne de panneau latéral, du
 * glisser, du redimensionnement. Trente-huit constructeurs de rigs se distinguent déjà par `objType` ;
 * celui-ci en est un trente-neuvième, qui lit un fichier au lieu de bâtir des boîtes.
 *
 * Un SEUL objType pour tous les modèles importés : ce qui les distingue est le fichier qu'ils
 * portent, pas leur type. Ajouter une valeur de discriminant est permis ; en renommer une casserait
 * tous les Projets déjà enregistrés (cf. docs/en/persisted-data.md).
 */
export const MODEL_OBJ_TYPE = 'modele';

/** Cet Élément est-il un modèle importé ? Les deux conditions comptent : `type` ET `objType`. */
export function isImportedModel(o){
  return !!o && o.type === 'objet3d' && o.objType === MODEL_OBJ_TYPE;
}

/**
 * Construit l'Élément persisté d'un modèle importé. Fonction PURE : elle ne touche ni `S`, ni la
 * Page, c'est l'appelant qui range le résultat où il veut (une Case, ou le canevas d'une Scène).
 *
 * `modelFile` est le seul champ vraiment nouveau du format. Tout le reste, x, y, w, h, baseW/baseH,
 * z, rotations, realHeightFloor, magnetGround, est la forme d'un objet3d ordinaire, délibérément
 * recopiée d'addObjectToPanel pour qu'un modèle importé se comporte comme une chaise.
 *
 * La hauteur : `realHeightM` est la source de vérité du rendu 3D, qui normalise le modèle dessus
 * (cf. scene3d.js). Une valeur fausse se corrige donc dans la modale sans rien casser, c'est ce qui
 * nous dispense d'aller lire les dimensions du fichier ici, où elles ne sont pas encore disponibles.
 */
export function createModelElement({ panel, page, modelFile, name, realHeightM, ratioLargeur } = {}){
  const realH = Number.isFinite(realHeightM) && realHeightM > 0
    ? realHeightM
    : OBJECT_REAL_HEIGHT_M[MODEL_OBJ_TYPE];
  const h = clamp(realH * WALL_PX_PER_UNIT_3D, 2, page.h * 0.95);
  // L'EMPREINTE 2D SUIT LA SILHOUETTE, elle n'est plus carrée. Elle l'était sur ce commentaire,
  // « 1:1 tant qu'on n'a pas lu le fichier », devenu faux : le fichier EST décodé à cet instant,
  // c'est de lui que vient `realHeightM`, et sa largeur se mesure au même endroit (cf.
  // ratioLargeurModele3D dans model-cache.js). Mesuré : worker_j 0,86, anime_girl1 0,49, un
  // Personnage intégré 0,63, une boîte carrée était donc jusqu'à deux fois trop large.
  //
  // 1 PAR DÉFAUT, ET CE N'EST PAS UN REPLI PARESSEUX : sans fichier lisible, l'Élément s'affiche en
  // boîte de remplacement, qui est un CUBE. Carré est alors la bonne réponse.
  const ratio = (Number.isFinite(ratioLargeur) && ratioLargeur > 0) ? ratioLargeur : 1;
  const w = clamp(h * ratio, 2, page.w * 0.95);
  return {
    id: newId(), type: 'objet3d', objType: MODEL_OBJ_TYPE,
    modelFile,
    x: clamp(panel.x + panel.w / 2 - w / 2, 0, page.w - w),
    y: clamp(panel.y + panel.h / 2 - h / 2, 0, page.h - h),
    w, h, baseW: w, baseH: h, z: 0,
    name: name || 'Modèle',
    rotX: 0, rotY: 0, rotZ: 0,
    realHeightFloor: realH,
    magnetGround: true,
    homePanelId: panel.id,
  };
}

/**
 * Rend un nom de fichier sûr et lisible à partir de ce que l'utilisateur a fourni.
 *
 * On NETTOIE ici ; le process principal, lui, REFUSE tout ce qui n'est pas déjà propre (cf.
 * `nomDeModeleAcceptable` dans main.js). Deux métiers différents, pas un doublon : si l'un des deux
 * disparaissait, l'autre ne le remplacerait pas.
 *
 * Retire les séparateurs de chemin, c'est ce qui empêche un nom comme `../../ailleurs` de sortir du
 * dossier, les caractères interdits par Windows, les points de tête (fichiers cachés et `..`), et
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
 * Résultats possibles, tous explicites, aucun ne se tait :
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
 * Renomme un modèle sur le disque. Rend { ok, name } ou { ok: false, error }.
 *
 * Le nom demandé est ASSAINI ici (`sanitizeModelName`), comme à l'import : l'utilisateur tape ce
 * qu'il veut, l'extension est réimposée, les séparateurs de chemin retirés. Le process principal
 * refusera de son côté tout ce qui ne serait pas déjà propre.
 *
 * ⚠️ AUCUNE RÉSOLUTION DE COLLISION, contrairement à l'import. `resolveModelName` transformerait
 * « chaise » en « chaise (2) » si le nom est pris, acceptable pour un import, où l'utilisateur
 * demande « range ce fichier », inacceptable pour un renommage, où il demande « appelle-le
 * comme ça ». Recevoir un autre nom que celui qu'on a écrit est une réponse à une question qu'on
 * n'a pas posée. On refuse, et on le dit.
 */
export async function renameModel(ancien, nouveau){
  const p = pont();
  if (!p || !p.renameModelFile) return { ok: false, error: 'indisponible hors de l\'application' };
  if (!ancien) return { ok: false, error: 'modèle manquant' };
  const propre = sanitizeModelName(nouveau);
  if (propre === ancien) return { ok: true, name: ancien, inchangé: true };
  const existants = await listModels();
  // La casse ne distingue pas deux fichiers sous Windows. Le seul cas autorisé est le renommage du
  // fichier vers lui-même à la casse près, « chaise.glb » → « Chaise.glb », que le process
  // principal sait exécuter et qui n'écrase rien.
  const conflit = existants.some(n => n.toLowerCase() === propre.toLowerCase()
    && n.toLowerCase() !== ancien.toLowerCase());
  if (conflit) return { ok: false, error: 'un modèle porte déjà ce nom', collision: true, name: propre };
  try {
    const r = await p.renameModelFile(ancien, propre);
    if (!r || !r.ok) return { ok: false, error: (r && r.error) || 'renommage refusé' };
    return { ok: true, name: propre };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
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
