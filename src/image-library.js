/**
 * @file image-library.js
 * La bibliothèque d'images : ce qui est sur le disque, quelles Cases s'en servent, et comment y aller.
 *
 * Jumelle de model-library.js, et elle existe pour la même raison : le choix « détacher plutôt
 * qu'effacer » (cf. docs/en/panel-images.md, décision 4) laisse des images qui ne servent plus dans
 * le dossier partagé. Sans un endroit pour les voir, elles s'y accumuleraient sans recours.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * DEUX GROUPES, LÀ OÙ LES MODÈLES EN ONT TROIS
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Un modèle se range par Scènes, dans des Cases, ou inutilisé. Une image n'a que deux cas, et ce
 * n'est pas une simplification de confort : **une image ne peut pas vivre dans une Scène**. Le
 * canevas d'une Scène refuse l'image (décision 2), et pendant l'édition d'une Scène toute Case EST
 * ce canevas (cf. `isLockedScenePanel`). Un groupe « par Scènes » serait donc toujours vide, et un
 * groupe toujours vide apprend à l'utilisateur à ne plus lire la section.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * UN ENDROIT = UNE DESTINATION, ET C'EST CE QUI DISPENSE D'UNE MODALE
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Les modèles ont une modale de choix (cf. model-usages.js) parce qu'une MÊME Case peut porter
 * plusieurs Éléments du même fichier : l'endroit ne suffit pas à désigner la destination, il faut
 * encore choisir lequel. Une Case porte AU PLUS UNE image (`imageFile` est un champ, pas une
 * liste) : chaque endroit est donc déjà une destination unique, et une modale n'aurait qu'à
 * recopier la liste qu'on vient d'afficher. Les endroits sont rendus cliquables sur place.
 *
 * CE QU'ON NE PEUT PAS SAVOIR, et qu'il faut donc dire : les AUTRES Projets. On ne connaît que celui
 * qui est ouvert. Une image « non utilisée » ici peut être la planche centrale d'un autre Projet.
 */

import { S } from './state.js';
import { imageDeLaCase3D } from './image-store.js';

/**
 * Recense l'usage de chaque image dans un Projet. Fonction PURE.
 *
 * @param {string[]} fichiers  les images présentes sur le disque
 * @param {object} projet      { tomes }, la racine d'un Projet
 * @returns {{dansCases: Array<{nom, count, endroits}>, nonUtilisees: string[]}}
 *
 * `endroits` nomme les Cases où l'image sert, sous forme de DESTINATIONS et non d'étiquettes : le
 * texte demande la langue, et une fonction qui rend du texte traduit ne se compare plus qu'à
 * elle-même. La composition est faite par `imageUsageLabel`, à côté, et se teste séparément.
 *
 * Le compte seul répondrait « 3 Cases » sans dire lesquelles, ce qui oblige à parcourir le Projet
 * pour vérifier avant de supprimer.
 */
export function groupImagesByUsage(fichiers, { tomes = [] } = {}){
  const parImage = new Map();      // fichier → { count, endroits: [] }

  (tomes || []).forEach((vol, tomeIndex) => {
    (vol && vol.pages || []).forEach((page, pageIndex) => {
      (page && page.objects || []).forEach(o => {
        const nom = imageDeLaCase3D(o);
        if (!nom) return;
        if (!parImage.has(nom)) parImage.set(nom, { count: 0, endroits: [] });
        const e = parImage.get(nom);
        e.count++;
        e.endroits.push({
          tomeIndex, pageIndex,
          tomeName: (vol && vol.name) || '',
          pageNumber: pageIndex + 1,
          panelId: o.id,
          // Une Case sans numéro existe (renumérotation en attente) : on ne l'invente pas, et
          // l'étiquette s'arrêtera à la Planche. L'absence dit quelque chose de vrai.
          caseNumber: o.caseNumber || null,
        });
      });
    });
  });

  const connus = new Set(fichiers || []);
  // Une image citée par le Projet mais ABSENTE du disque doit quand même apparaître : c'est
  // précisément celle dont l'utilisateur cherche la trace quand une Case affiche « introuvable ».
  parImage.forEach((_, f) => connus.add(f));

  const tous = [...connus].sort((a, b) => a.localeCompare(b, 'fr'));
  return {
    dansCases: tous.filter(f => parImage.has(f))
      .map(f => ({ nom: f, count: parImage.get(f).count, endroits: parImage.get(f).endroits })),
    nonUtilisees: tous.filter(f => !parImage.has(f)),
  };
}

/**
 * L'étiquette d'un endroit : « Tome 1 › Planche 2 › Case 3 ». Fonction PURE.
 *
 * Séparée du calcul, comme `usageLabel` pour les modèles : c'est ce qui permet de vérifier le texte
 * sans monter un Projet, et de vérifier le recensement sans dépendre de la langue.
 */
export function imageUsageLabel(endroit, traduire){
  const t = traduire || ((en) => en);
  if (!endroit) return '';
  const morceaux = [
    endroit.tomeName || t(`Volume ${endroit.tomeIndex + 1}`, `Tome ${endroit.tomeIndex + 1}`),
    t(`Page ${endroit.pageNumber}`, `Planche ${endroit.pageNumber}`),
  ];
  if (endroit.caseNumber) morceaux.push(t(`Panel ${endroit.caseNumber}`, `Case ${endroit.caseNumber}`));
  return morceaux.join(' › ');
}

/** Combien de Cases du Projet ouvert portent cette image. */
export function countImageUsages(fichier, { tomes = [] } = {}){
  let n = 0;
  (tomes || []).forEach(vol => {
    (vol && vol.pages || []).forEach(page => {
      (page && page.objects || []).forEach(o => { if (imageDeLaCase3D(o) === fichier) n++; });
    });
  });
  return n;
}

/**
 * Se rendre à une Case qui porte l'image, et l'y sélectionner. MUTE l'état affiché.
 *
 * `quitterScene` est injecté et n'est pas un ornement : effacer `editingSceneId` sans appeler
 * `disableSceneCameraMode` laisse le mode Caméra de la Scène actif en arrière-plan, et il se
 * réveille à la prochaine ouverture (cf. scenes.js, et le même soin dans `goToModelUsage`).
 *
 * Rend `true` si l'on a bougé. Une destination qui ne désigne plus rien (Planche supprimée depuis
 * l'affichage de la liste) rend `false` plutôt que de poser des index hors des tableaux.
 */
export function goToImageUsage(cible, { quitterScene } = {}){
  if (!cible || !cible.panelId) return false;
  const tome = S.tomes[cible.tomeIndex];
  if (!tome || !tome.pages || !tome.pages[cible.pageIndex]) return false;
  if (S.editingSceneId && quitterScene) quitterScene();
  S.editingSceneId = null;
  S.currentTomeIndex = cible.tomeIndex;
  S.currentPageIndex = cible.pageIndex;
  S.selectedId = cible.panelId;
  S.selectedRoomId = null;
  S.dragMode = null;
  return true;
}

/**
 * Repointe vers `nouveau` toutes les Cases qui citent `ancien`. MUTE les Cases et rend leur nombre.
 *
 * Muter plutôt que copier, comme pour les modèles : les Cases sont partagées par référence avec la
 * sélection et le panneau latéral, et reconstruire les tableaux ferait perdre la sélection en cours
 * pour un simple changement de nom de fichier.
 *
 * ⚠️ LES SCÈNES NE SONT PAS PARCOURUES, et ce n'est pas un oubli : une image ne peut pas y vivre
 * (voir l'en-tête). Les parcourir donnerait un test toujours faux, donc une ligne que rien ne
 * vérifie, et le jour où quelqu'un la casserait personne ne le saurait.
 */
export function repointerImage3D(racines, ancien, nouveau){
  if (!ancien || !nouveau || ancien === nouveau) return 0;
  let n = 0;
  ((racines && racines.tomes) || []).forEach(vol => {
    (vol && vol.pages || []).forEach(page => {
      (page && page.objects || []).forEach(o => {
        if (imageDeLaCase3D(o) === ancien) { o.imageFile = nouveau; n++; }
      });
    });
  });
  return n;
}

/**
 * La même substitution, dans la pile d'annulation.
 *
 * ⚠️ SANS ÇA, Ctrl+Z RESSUSCITE UN NOM DE FICHIER MORT, exactement comme pour les modèles. La pile
 * contient des états ANTÉRIEURS du Projet, sérialisés : ils citent tous l'ancien nom. Annuler
 * n'importe quelle action faite AVANT le renommage rendrait donc des Cases pointant vers un fichier
 * qui n'existe plus, et qui afficheraient « Image introuvable » sans rapport avec ce qu'on annulait.
 */
export function repointerPileImages3D(pile, ancien, nouveau){
  if (!Array.isArray(pile)) return [];
  if (!ancien || !nouveau || ancien === nouveau) return pile.slice();
  return pile.map(entree => {
    let etat;
    try { etat = JSON.parse(entree); } catch { return entree; }
    repointerImage3D(etat, ancien, nouveau);
    return JSON.stringify(etat);
  });
}

/**
 * Le message de confirmation d'une suppression du disque. Fonction PURE, c'est ce qui la rend
 * vérifiable.
 *
 * Il dit TROIS choses, et les trois comptent : que c'est irréversible, ce que ça casse ici, et qu'on
 * ne peut rien affirmer des autres Projets. Taire la troisième laisserait croire à une garantie
 * qu'on n'a pas.
 *
 * ⚠️ ET IL DIT CE QUI *NE* SE PASSE *PAS* : les Cases ne sont pas vidées. Une image supprimée du
 * disque laisse ses Cases en place, qui le signalent ; elles redeviennent normales si le fichier
 * revient. C'est la même règle que pour un modèle, et l'inverse effacerait du travail sans le dire.
 */
export function messageSuppressionImage(fichier, usages, traduire){
  const t = traduire || ((en) => en);
  const conséquence = usages > 0
    ? t(`${usages} panel(s) of the open project use it: they will show "image not found", and are not emptied.`,
      `${usages} Case(s) du Projet ouvert l'utilisent : elles afficheront « image introuvable », et ne sont pas vidées.`)
    : t('No panel in the open project uses it.',
      'Aucune Case du Projet ouvert ne l\'utilise.');
  return t(
    `Delete "${fichier}" from disk? ${conséquence} Other projects may use it too, and cannot be checked from here. This cannot be undone.`,
    `Supprimer « ${fichier} » du disque ? ${conséquence} D'autres Projets peuvent l'utiliser aussi, sans qu'on puisse le vérifier d'ici. Cette action est irréversible.`);
}

/**
 * Le message de confirmation d'un renommage.
 *
 * Il dit ce qui sera réparé ici, et ce qui ne peut pas l'être ailleurs. La seconde moitié est la
 * plus importante : c'est elle qui distingue « je range mes fichiers » de « je casse un Projet que
 * je n'ai pas ouvert depuis six mois ».
 */
export function messageRenommageImage(ancien, nouveau, usages, traduire){
  const t = traduire || ((en) => en);
  const ici = usages > 0
    ? t(`${usages} panel(s) of the open project follow the rename.`,
      `${usages} Case(s) du Projet ouvert suivent le renommage.`)
    : t('No panel in the open project uses it.',
      'Aucune Case du Projet ouvert ne l\'utilise.');
  return t(
    `Rename "${ancien}" to "${nouveau}"? ${ici} Other projects that still name the old file will show "image not found" until you rename it back.`,
    `Renommer « ${ancien} » en « ${nouveau} » ? ${ici} Les autres Projets qui citent encore l'ancien nom afficheront « image introuvable » jusqu'à ce que vous le remettiez.`);
}
