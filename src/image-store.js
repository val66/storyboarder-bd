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
 * Les deux champs AJOUTÉS pour le cadrage. Mêmes précautions que `CHAMP_IMAGE_CASE` : rien n'est
 * renommé, et leur absence vaut la valeur par défaut, donc tous les Projets d'avant #403e s'ouvrent
 * exactement comme avant.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * UNE FRACTION, ET SURTOUT PAS DES PIXELS
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * L'ancrage dit QUELLE PART DU JEU DISPONIBLE est prise à gauche (ou en haut) : 0 colle l'image au
 * bord gauche, 1 au bord droit, 0,5 la centre — le comportement d'avant, et la valeur par défaut.
 *
 * Un décalage en pixels aurait été plus direct à écrire et faux dès le lendemain. Le jeu disponible
 * dépend de la taille de la Case ET de celle de l'image ; le premier redimensionnement de Case, ou
 * le premier « Changer l'image » vers un fichier d'une autre définition, aurait laissé un décalage
 * calculé pour une géométrie qui n'existe plus : soit l'image sort du cadre, soit une bande blanche
 * apparaît. Une fraction, elle, garde le même cadrage RELATIF quoi qu'il arrive à l'un ou à l'autre.
 *
 * C'est aussi ce qui rend le bornage gratuit : rester dans [0, 1] EST la garantie qu'aucune bande
 * blanche n'apparaît, sans avoir à la vérifier ailleurs.
 */
export const CHAMP_ANCRAGE_X_IMAGE = 'imageAnchorX';
export const CHAMP_ANCRAGE_Y_IMAGE = 'imageAnchorY';

/** Le centre : ce que vaut une Case qui n'a jamais été recadrée, et ce que vaut un champ absent. */
export const ANCRAGE_CENTRE_IMAGE = 0.5;

/**
 * Ramène une valeur d'ancrage dans [0, 1]. Tout ce qui n'est pas un nombre utilisable vaut centré.
 *
 * ⚠️ `null` ET LA CHAÎNE VIDE SONT ÉCARTÉS AVANT LA CONVERSION, et ce n'est pas une précaution
 * décorative : `Number(null)` vaut 0, tout comme `Number('')`. Sans ces deux lignes, un champ écrit
 * `null` dans un fichier de Projet — ce qu'un export, une fusion ou une édition à la main produisent
 * sans y penser — ne serait pas lu comme « absent, donc centré » mais comme « collé au bord gauche ».
 * L'image sauterait dans un coin à la réouverture, pour un fichier que personne n'a jugé fautif.
 *
 * Mon propre test l'a attrapé : j'avais écrit la garde sur `Number.isFinite` seul, en croyant que
 * l'absence y tombait toujours. C'est vrai de `undefined`, faux de `null`.
 */
export function ancrageValide3D(v){
  if (v === null || v === undefined || v === '') return ANCRAGE_CENTRE_IMAGE;
  const n = Number(v);
  if (!Number.isFinite(n)) return ANCRAGE_CENTRE_IMAGE;
  return Math.min(1, Math.max(0, n));
}

/**
 * L'ancrage d'une Case, toujours utilisable. Fonction PURE.
 *
 * ⚠️ ELLE NE REND JAMAIS `null`, et c'est le point : le dessin l'appelle à chaque image, et une
 * valeur manquante ou aberrante (un Projet écrit à la main, un champ corrompu) doit donner le
 * cadrage centré, pas une image invisible. Ce qui est lisible est lu, le reste est ramené au centre.
 */
export function ancrageDeLImage3D(o){
  return {
    x: ancrageValide3D(o && o[CHAMP_ANCRAGE_X_IMAGE]),
    y: ancrageValide3D(o && o[CHAMP_ANCRAGE_Y_IMAGE]),
  };
}

/**
 * Le zoom du cadrage (#403f). Champ AJOUTÉ, comme les deux précédents : absent vaut 1.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * POURQUOI LE PLANCHER EST 1 ET NON ZÉRO
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * 1 est le cadrage COUVRANT : l'image remplit exactement la Case. Zoomer vers l'avant ne peut donc
 * jamais faire apparaître de bande blanche, il ne fait qu'agrandir la matière disponible pour se
 * déplacer. Descendre SOUS 1 en ferait apparaître, et ce serait un autre besoin — montrer l'image
 * entière sur un fond — qui n'est plus du recadrage. Décidé avec l'utilisateur.
 *
 * ⚠️ LE PLAFOND EST UN CONFORT, PAS UNE MESURE, et il faut que ce soit écrit. 4 n'a été ni mesuré ni
 * déduit de quoi que ce soit : c'est un cran au-delà duquel personne n'a eu besoin d'aller pendant
 * la conception. La règle du dépôt est qu'un seuil se mesure ; celui-ci ne l'est pas, et le dire
 * vaut mieux que lui inventer une justification. S'il gêne à l'usage, il se change avec une raison.
 */
export const CHAMP_ZOOM_IMAGE = 'imageZoom';
export const ZOOM_IMAGE_MIN = 1;
export const ZOOM_IMAGE_MAX = 4;

/**
 * Le pas du zoom, PARTAGÉ par le curseur et par la molette (#403i).
 *
 * Une seule valeur pour les deux commandes : passer de l'une à l'autre ne doit pas changer la
 * sensation du réglage, et deux pas différents auraient fini par diverger au premier ajustement.
 * Le `step` du curseur dans index.html en est une copie d'affichage, comme pour les bornes.
 */
export const PAS_ZOOM_IMAGE = 0.1;

/**
 * Le silence qui clôt une salve de molette, en millisecondes.
 *
 * ⚠️ C'EST UN DÉLAI DE REGROUPEMENT DE GESTE, PAS UN SEUIL MESURÉ, et la différence doit rester
 * écrite. Il ne décide de rien de visible : il dit seulement à partir de quand deux coups de
 * molette comptent pour deux gestes distincts dans la pile d'annulation. Choisi plus long que
 * l'écart entre deux crans d'une roulette normale, et rien de plus.
 */
export const MOLETTE_FIN_DE_SALVE_MS = 500;

/** Ramène un zoom dans [1, 4]. Tout ce qui n'est pas lisible vaut 1, le cadrage couvrant. */
export function zoomValide3D(v){
  // Mêmes écueils que pour l'ancrage : `Number(null)` et `Number('')` valent 0, qui deviendrait ici
  // le plancher, donc un cadrage couvrant — inoffensif par chance, mais on ne compte pas dessus.
  if (v === null || v === undefined || v === '') return ZOOM_IMAGE_MIN;
  const n = Number(v);
  if (!Number.isFinite(n)) return ZOOM_IMAGE_MIN;
  return Math.min(ZOOM_IMAGE_MAX, Math.max(ZOOM_IMAGE_MIN, n));
}

/** Le zoom d'une Case, toujours utilisable. Ne rend jamais null, comme `ancrageDeLImage3D`. */
export function zoomDeLImage3D(o){
  return zoomValide3D(o && o[CHAMP_ZOOM_IMAGE]);
}

/**
 * Le cadrage de cette Case est-il celui d'origine ? Fonction PURE.
 *
 * C'est ce qui décide de MONTRER OU NON « Recentrer ». Le bouton n'apparaît que lorsqu'il a quelque
 * chose à défaire : proposer en permanence de remettre à zéro un cadrage que personne n'a touché
 * occupe une place pour rien, et fait douter d'avoir modifié quelque chose sans le vouloir.
 *
 * C'est aussi la raison pour laquelle il y a un BOUTON et pas un menu déroulant « Centré / Libre » :
 * la seconde valeur d'un tel menu ne se choisirait jamais, elle n'arriverait que par effet de bord
 * d'un déplacement ou d'un zoom. Un menu dont une valeur n'est qu'un affichage est un bouton
 * déguisé, et l'utilisateur a tranché pour le bouton.
 */
export function cadrageParDefaut3D(o){
  const a = ancrageDeLImage3D(o);
  return a.x === ANCRAGE_CENTRE_IMAGE && a.y === ANCRAGE_CENTRE_IMAGE
    && zoomDeLImage3D(o) === ZOOM_IMAGE_MIN;
}

/** Efface les trois champs de cadrage. L'absence VAUT le défaut : rien à écrire, tout à retirer. */
export function reinitialiserCadrage3D(o){
  if (!o) return false;
  // ⚠️ ON SUPPRIME, ON N'ÉCRIT PAS 0,5 ET 1. Un Projet recentré redevient alors identique, octet
  // pour octet, à un Projet qui n'a jamais été recadré : rien ne distingue « remis au centre » de
  // « jamais touché », ce qui est exactement la vérité, et évite de faire grossir le fichier avec
  // des valeurs qui sont déjà la règle.
  const avant = cadrageParDefaut3D(o);
  delete o[CHAMP_ANCRAGE_X_IMAGE];
  delete o[CHAMP_ANCRAGE_Y_IMAGE];
  delete o[CHAMP_ZOOM_IMAGE];
  return !avant;
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
export function entreesImageDuMenu3D(o, estCanevasDeScene, contientDesElements){
  const porte = casePorteUneImage3D(o);
  return {
    // RETIRÉES, pas grisées : décision de l'utilisateur. C'est la section Image du panneau de droite
    // qui porte l'explication.
    ajouter3D: !porte,
    // ⚠️ UNE CASE QUI CONTIENT DES ÉLÉMENTS N'ACCEPTE PLUS D'IMAGE (#403m), et c'est un CHANGEMENT
    // de la décision 1. L'exclusivité se tenait après coup, en supprimant les Éléments derrière une
    // confirmation ; elle se tient maintenant avant, en retirant l'entrée. Pour mettre une image
    // dans une Case occupée, on la vide d'abord.
    //
    // Le geste est plus long d'un pas, et il est plus sûr : la seule façon de perdre des Éléments
    // est désormais de demander explicitement à les perdre, au lieu de l'accepter dans une modale
    // qui interrompt un geste dont ce n'était pas le sujet.
    insererImage: !porte && !contientDesElements && caseAccepteUneImage3D(o, estCanevasDeScene),
    // Même condition que « Vider la Case », qui détache aussi l'image : « Retirer l'image » a été
    // retirée du menu contextuel (#403m) parce que les deux faisaient le même geste à un pas l'une
    // de l'autre. Le bouton de la section Image, lui, reste : c'est là qu'on vient pour l'image.
    deplacerImage: porte,
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
