/**
 * @file image-store.js
 * Les images de Case : comment elles sont nommées, rangées, et retrouvées.
 *
 * Ce module DÉCIDE ; le pont Electron se contente d'écrire et de lire (cf. main.js, section
 * « IMAGES DE CASE »). C'est la répartition de model-store.js, recopiée à dessein : le nommage, les
 * collisions et les messages restent du côté testable, et le process principal garde ce qu'il est
 * seul à pouvoir faire.
 *
 * OÙ VIVENT LES IMAGES. Dans `<dossier de Projets>/Images`, à côté de `Modeles` et pour la même
 * raison : beaucoup de gens rangent leurs Projets dans un dossier synchronisé, et ce qu'ils font
 * pour les sauvegarder couvre alors leurs images. Un dossier séparé plutôt qu'un sous-dossier de
 * `Modeles`, dont la liste filtre déjà sur l'extension et refuse tout le reste.
 *
 * CE QU'ON NE FAIT PAS, et c'est la même règle que pour un modèle : une image introuvable ne vide
 * JAMAIS la Case qui la porte. Le champ reste, la Case le signale, et tout redevient normal dès que
 * le fichier revient. Cf. docs/en/persisted-data.md et docs/en/panel-images.md.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * POURQUOI CE N'EST PAS `model-store.js` AVEC UNE LISTE D'EXTENSIONS DE PLUS
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * La tentation était réelle, les deux modules se ressemblent ligne pour ligne. Deux différences le
 * rendent impossible, et elles ne sont pas de forme :
 *
 *   — un modèle a UNE extension, qu'on peut réimposer ; une image en a quatre, et `photo.png` ne
 *     doit surtout pas devenir `photo.jpg`. `sanitizeImageName` GARDE l'extension d'origine, en la
 *     ramenant en minuscules, au lieu d'en imposer une : cela inverse la règle centrale de son
 *     jumeau ;
 *   — un modèle est porté par un Élément, une image est portée par une CASE. Les deux ne se rangent
 *     ni ne se comptent au même endroit.
 *
 * Ce qui EST commun a été mis en commun plutôt que recopié : `memeContenu` vit dans utils.js, et les
 * deux modules l'appellent.
 */

import { memeContenu } from './utils.js';

/**
 * Les extensions acceptées.
 *
 * PNG, JPG et WebP, décidé avec l'utilisateur (cf. docs/en/panel-images.md). GIF est écarté parce
 * qu'un canevas ne joue pas son animation et n'en dessinerait que la première image, sans que rien
 * ne le dise ; SVG parce qu'il ne porte aucune taille en pixels, et qu'il faudrait lui en imposer
 * une pour le recadrer.
 *
 * ⚠️ `.jpeg` EST DANS LA LISTE, ET CE N'EST PAS UN DOUBLON DE `.jpg` : les deux existent sur les
 * disques réels, et n'en accepter qu'une refuserait un fichier parfaitement valide.
 */
export const EXTENSIONS_IMAGE_3D = ['.png', '.jpg', '.jpeg', '.webp'];

/** L'extension d'un nom, en minuscules, point compris. Chaîne vide s'il n'y en a pas. */
function extensionDe(nom){
  const m = /\.[A-Za-z0-9]+$/.exec(String(nom || ''));
  return m ? m[0].toLowerCase() : '';
}

/** Ce nom désigne-t-il une image que nous savons afficher ? */
export function estNomDImage3D(nom){
  return EXTENSIONS_IMAGE_3D.includes(extensionDe(nom));
}

/**
 * Un nom de fichier sûr, ou `null` si l'extension n'est pas des nôtres.
 *
 * Retire les séparateurs de chemin, ce qui empêche `../../ailleurs` de sortir du dossier, les
 * caractères interdits par Windows, et les points de tête (fichiers cachés et `..`).
 *
 * ⚠️ IL REND `null` PLUTÔT QUE DE CORRIGER L'EXTENSION, et c'est la différence avec
 * `sanitizeModelName`, qui réimpose `.glb`. Renommer `dessin.bmp` en `dessin.png` produirait un
 * fichier dont le nom ment sur le contenu : le décodeur échouerait plus tard, loin d'ici, sur une
 * image que l'utilisateur croirait convertie. Un refus franc à l'entrée vaut mieux qu'une
 * conversion imaginaire.
 *
 * ⚠️ L'EXTENSION EST RAMENÉE EN MINUSCULES, ce qui n'est pas la conserver telle quelle. Le fichier
 * écrit est une COPIE dont nous choisissons le nom : laisser passer `.JPG` à côté de `.jpg`
 * remplirait le dossier de jumeaux que Windows tient pour identiques et que la liste montre
 * séparément. Le fichier d'origine de l'utilisateur, lui, n'est jamais touché.
 *
 * ⚠️ UN FICHIER CACHÉ EST REFUSÉ, ET LE COMPRENDRE A DEMANDÉ D'ESSAYER : les points de tête sont
 * retirés AVANT que l'extension soit lue, donc `.png` devient `png`, un nom sans extension, donc un
 * refus. C'est la bonne réponse — `.png` n'est pas une image nommée, c'est un fichier caché — et
 * c'est aussi ce qui rend impossible un nom de base vide. Une première version prévoyait un repli
 * « image » pour ce cas : il n'était pas atteignable, et une branche qu'on ne sait pas atteindre est
 * une branche qu'on ne sait pas vérifier.
 */
export function sanitizeImageName(nom){
  let n = String(nom || '').trim();
  n = n.replace(/^.*[\\/]/, '');               // ne garder que le nom de fichier
  n = n.replace(/[\\/:*?"<>|]/g, '_');         // caractères interdits sous Windows
  n = n.replace(/^\.+/, '');                   // ni « .. », ni fichier caché
  n = n.trim();
  if (!estNomDImage3D(n)) return null;
  const ext = extensionDe(n);
  return n.slice(0, -ext.length).trim() + ext;
}

/**
 * Un nom libre parmi ceux déjà pris : « croquis.png », « croquis (2).png », « croquis (3).png ».
 *
 * La comparaison ignore la casse, comme pour les modèles : Windows ne distingue pas `Croquis.png` de
 * `croquis.png`, et rendre « libre » un nom qui écrase un fichier existant serait la pire réponse.
 *
 * Rend `null` si le nom souhaité n'est pas celui d'une image acceptée, pour que l'appelant n'ait
 * jamais à deviner ce qui s'est passé.
 */
export function resolveImageName(souhaité, existants = []){
  const propre = sanitizeImageName(souhaité);
  if (!propre) return null;
  const pris = new Set(existants.map(n => String(n).toLowerCase()));
  if (!pris.has(propre.toLowerCase())) return propre;
  const ext = extensionDe(propre);
  const base = propre.slice(0, -ext.length);
  for (let i = 2; ; i++) {
    const essai = `${base} (${i})${ext}`;
    if (!pris.has(essai.toLowerCase())) return essai;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Le champ persisté d'une Case
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Le champ AJOUTÉ à une Case pour porter son image. Aucun champ existant n'est renommé ni retiré :
 * un Projet d'avant s'ouvre inchangé, et une version antérieure de l'application le relit en
 * ignorant simplement ce champ (cf. docs/en/persisted-data.md).
 *
 * Il porte un NOM DE FICHIER, jamais un chemin. Le dossier est décidé par le process principal, et
 * lui seul : un chemin absolu enregistré dans un Projet serait faux dès la première machine
 * suivante, exactement comme il l'aurait été pour les modèles.
 */
export const CHAMP_IMAGE_CASE = 'imageFile';

/** L'image d'une Case, ou `null`. Ne dit RIEN de l'existence du fichier, seulement de l'intention. */
export function imageDeLaCase3D(o){
  if (!o || o.type !== 'panel') return null;
  const nom = o[CHAMP_IMAGE_CASE];
  return (typeof nom === 'string' && nom) ? nom : null;
}

/**
 * Cette Case porte-t-elle une image ?
 *
 * ⚠️ C'EST LA QUESTION QUI DÉCIDERA DE TOUT LE RESTE (#403b, #403c) : ce qu'on dessine, ce que le
 * menu contextuel propose, ce que le panneau de droite montre. Elle est écrite ICI, une fois, pour
 * que ces trois écrans ne se mettent pas à répondre chacun de leur côté — c'est le défaut qui est
 * revenu trois fois pendant le chantier des poses (cf. docs/en/archetype-poses.md).
 */
export function casePorteUneImage3D(o){
  return imageDeLaCase3D(o) !== null;
}

/**
 * Cette Case peut-elle RECEVOIR une image ? Fonction PURE.
 *
 * Un seul refus, et c'est une décision de l'utilisateur : le canevas d'édition d'une Scène. Une
 * Scène est un décor 3D réutilisable ; une image n'y a rien à faire (cf. docs/en/panel-images.md,
 * décision 2).
 *
 * ⚠️ UNE CASE QUI AFFICHE UNE SCÈNE CHARGÉE N'EST PAS CONCERNÉE, et ce n'est pas un oubli : rien ne
 * la marque dans les données. Elle contient simplement les Éléments qu'on y a recopiés, et c'est la
 * règle générale qui s'applique — on demande confirmation avant de les supprimer.
 *
 * `estCanevasDeScene` est PASSÉ plutôt que lu ici : la réponse dépend de `S.editingSceneId`, un
 * état global que cette fonction n'a pas à connaître pour rester vérifiable.
 */
export function caseAccepteUneImage3D(o, estCanevasDeScene){
  return !!o && o.type === 'panel' && !estCanevasDeScene;
}

/**
 * Ce que le menu contextuel d'une Case doit MONTRER. Fonction PURE, et c'est le point de décision
 * unique de #403c.
 *
 * ⚠️ TROIS ÉCRANS POSAIENT LA MÊME QUESTION, ET C'EST EXACTEMENT AINSI QUE LE DÉFAUT DES POSES EST
 * REVENU TROIS FOIS (cf. docs/en/archetype-poses.md). Le menu contextuel, le panneau de droite et le
 * dessin ont tous besoin de savoir si une Case porte une image ; ils le demandent ici, ils ne le
 * recalculent pas.
 *
 * `ajouter3D` couvre « Ajouter », « Charger une Scène » et « Importer un Modèle » d'un seul tenant :
 * ces trois entrées ont exactement la même condition, et les séparer ferait diverger ce qui doit
 * disparaître ensemble.
 */
export function entreesImageDuMenu3D(o, estCanevasDeScene){
  const porte = casePorteUneImage3D(o);
  return {
    // RETIRÉES, pas grisées : décision de l'utilisateur. C'est la section Image du panneau de droite
    // qui porte l'explication.
    ajouter3D: !porte,
    insererImage: !porte && caseAccepteUneImage3D(o, estCanevasDeScene),
    retirerImage: porte,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Le pont, isolé derrière une indirection pour rester testable
// ─────────────────────────────────────────────────────────────────────────────

// Même dispositif que model-store.js : `window.storyboarderAPI` n'existe pas sous Node, et le
// remplacer entièrement dans un test ne vaudrait pas mieux que ne rien tester.
let _pont = null;
export function setImageBridge(pont){ _pont = pont; }
function pont(){
  return _pont || (typeof window !== 'undefined' ? window.storyboarderAPI : null);
}

/** Les images présentes dans le dossier. Tableau vide si le pont est absent (mode navigateur). */
export async function listImages(){
  const p = pont();
  if (!p || !p.listImageFiles) return [];
  try { return await p.listImageFiles() || []; } catch { return []; }
}

/**
 * Ouvre le sélecteur, range le fichier choisi, rend le nom retenu.
 *
 * Résultats possibles, tous explicites, aucun ne se tait :
 *   { canceled: true }               l'utilisateur a renoncé
 *   { ok: true, name, déjàPrésent }  rangée (ou retrouvée à l'identique, cf. `déjàPrésent`)
 *   { ok: false, error }             rien n'a été écrit, et on dit pourquoi
 */
export async function importImage(){
  const p = pont();
  if (!p || !p.pickImageFile) return { ok: false, error: 'indisponible hors de l\'application' };

  const choisi = await p.pickImageFile();
  if (!choisi || choisi.canceled) return { canceled: true };
  if (choisi.error) return { ok: false, error: choisi.error };
  if (!choisi.data || !choisi.data.length) return { ok: false, error: 'fichier vide' };

  const candidat = sanitizeImageName(choisi.name);
  // Le sélecteur filtre déjà sur l'extension ; cette garde couvre ce qu'un filtre de dialogue ne
  // couvre pas, un utilisateur qui saisit un nom à la main dans le champ du sélecteur.
  if (!candidat) return { ok: false, error: 'format d\'image non pris en charge' };

  const existants = await listImages();

  // Réimporter deux fois le même fichier ne doit pas produire « croquis.png » ET « croquis (2).png ».
  // On compare le CONTENU, pas le nom : c'est le seul critère qui ne se trompe pas.
  if (existants.some(n => n.toLowerCase() === candidat.toLowerCase())) {
    const actuel = await p.readImageFile(candidat);
    if (actuel && actuel.ok && memeContenu(actuel.data, choisi.data)) {
      return { ok: true, name: candidat, déjàPrésent: true };
    }
  }

  const nom = resolveImageName(choisi.name, existants);
  const écrit = await p.writeImageFile(nom, choisi.data);
  if (!écrit || !écrit.ok) return { ok: false, error: (écrit && écrit.error) || 'écriture refusée' };
  return { ok: true, name: nom, déjàPrésent: false };
}

/**
 * Lit une image du dossier. Rend `{ ok: false }` sans drame quand le fichier a disparu : c'est un
 * cas nominal, pas une panne, et l'appelant en fait une Case qui SIGNALE plutôt qu'une Case vidée.
 */
export async function readImage(nom){
  const p = pont();
  if (!p || !p.readImageFile) return { ok: false, error: 'indisponible hors de l\'application' };
  if (!sanitizeImageName(nom)) return { ok: false, error: 'nom d\'image refusé' };
  try { return await p.readImageFile(nom); } catch (err) { return { ok: false, error: String(err) }; }
}

/**
 * Renomme une image sur le disque. Rend `{ ok, name }` ou `{ ok: false, error }`.
 *
 * ⚠️ AUCUNE RÉSOLUTION DE COLLISION, contrairement à l'import, et pour la raison exacte de
 * `renameModel` : à l'import l'utilisateur demande « range ce fichier », au renommage il demande
 * « appelle-le comme ça ». Recevoir un autre nom que celui qu'on a écrit répondrait à une question
 * qui n'a pas été posée. Le process principal refuse d'écraser, et le dit.
 */
export async function renameImage(ancien, nouveau){
  const p = pont();
  if (!p || !p.renameImageFile) return { ok: false, error: 'indisponible hors de l\'application' };
  const propre = sanitizeImageName(nouveau);
  if (!propre) return { ok: false, error: 'format d\'image non pris en charge' };
  if (!sanitizeImageName(ancien)) return { ok: false, error: 'nom d\'image refusé' };
  try { return await p.renameImageFile(ancien, propre); }
  catch (err) { return { ok: false, error: String(err) }; }
}

/**
 * Efface une image du disque.
 *
 * ⚠️ CE N'EST PAS LE GESTE DE LA SECTION IMAGE D'UNE CASE. Celle-ci DÉTACHE : elle vide le champ de
 * la Case et ne touche à aucun fichier, parce que deux Cases peuvent porter la même image et que
 * l'une n'a pas à décider pour l'autre (cf. docs/en/panel-images.md, décision 4). Cette fonction
 * sert la section Images du menu de gauche (#403d), où l'on efface pour de bon, après confirmation.
 */
export async function deleteImage(nom){
  const p = pont();
  if (!p || !p.deleteImageFile) return { ok: false, error: 'indisponible hors de l\'application' };
  if (!sanitizeImageName(nom)) return { ok: false, error: 'nom d\'image refusé' };
  try { return await p.deleteImageFile(nom); }
  catch (err) { return { ok: false, error: String(err) }; }
}
