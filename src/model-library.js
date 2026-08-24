import { tr } from './state.js';
/**
 * @file model-library.js
 * La bibliothèque de modèles : ce qui est sur le disque, et ce qui s'en sert.
 *
 * POURQUOI GROUPER PAR USAGE PLUTÔT QUE PAR NATURE. On a envisagé de marquer chaque fichier
 * « décor » ou « objet » à l'import — un manifeste, ou deux sous-dossiers. Écarté, et la raison
 * tient en un cas banal : le même `salon.glb` peut servir de décor dans une Scène aujourd'hui et
 * d'objet posé dans une Case demain. Un fichier ne PEUT PAS porter cette distinction ; c'est son
 * usage qui la porte, et un fichier peut avoir les deux.
 *
 * Avec des sous-dossiers, réimporter ce salon comme objet obligerait soit à dupliquer ses vingt
 * méga-octets, soit à mentir sur le classement. Avec un manifeste, un `.glb` déposé à la main
 * n'y figurerait pas — une désynchronisation silencieuse de plus.
 *
 * Le groupement ci-dessous est DÉDUIT du Projet ouvert, à chaque affichage. Il ne peut donc pas
 * mentir, et il répond à la question qu'on se pose vraiment en ouvrant ce menu : « puis-je
 * supprimer ce fichier sans rien casser ? » — à quoi « non utilisé » répond, et à quoi « Décors »
 * n'aurait pas répondu.
 *
 * CE QU'ON NE PEUT PAS SAVOIR, et qu'il faut donc dire à l'utilisateur : les AUTRES Projets. On ne
 * connaît que celui qui est ouvert. Un fichier « non utilisé » ici peut être indispensable ailleurs.
 */

import { isImportedModel } from './model-store.js';

/**
 * Recense l'usage de chaque fichier dans un Projet. Fonction PURE.
 *
 * @param {string[]} fichiers  les .glb présents sur le disque
 * @param {object} projet      { tomes, scenes } — les deux racines d'un Projet
 * @returns {{parScenes: Array, dansCases: Array, nonUtilises: string[]}}
 *
 * Un fichier utilisé des deux façons apparaît dans les DEUX groupes. C'est la vérité, et la cacher
 * ferait croire qu'il n'a qu'un usage — donc qu'on peut le supprimer après avoir traité l'autre.
 */
export function groupModelsByUsage(fichiers, { tomes = [], scenes = [] } = {}){
  const parScene = new Map();      // fichier → noms de Scènes
  const parCase = new Map();       // fichier → nombre d'Éléments

  const recenser = (volumes, ajouter) => {
    (volumes || []).forEach(vol => {
      (vol.pages || []).forEach(page => {
        (page.objects || []).forEach(o => {
          if (isImportedModel(o) && o.modelFile) ajouter(o.modelFile, vol);
        });
      });
    });
  };

  recenser(scenes, (f, sc) => {
    if (!parScene.has(f)) parScene.set(f, []);
    const noms = parScene.get(f);
    const nom = sc.name || tr('(unnamed)', '(sans nom)');
    if (!noms.includes(nom)) noms.push(nom);
  });
  recenser(tomes, (f) => parCase.set(f, (parCase.get(f) || 0) + 1));

  const connus = new Set(fichiers || []);
  // Un fichier référencé par le Projet mais ABSENT du disque doit quand même apparaître : c'est
  // précisément celui dont l'utilisateur cherche la trace quand il voit une boîte orangée.
  [...parScene.keys(), ...parCase.keys()].forEach(f => connus.add(f));

  const tous = [...connus].sort((a, b) => a.localeCompare(b, 'fr'));
  return {
    parScenes: tous.filter(f => parScene.has(f)).map(f => ({ nom: f, scenes: parScene.get(f) })),
    dansCases: tous.filter(f => parCase.has(f)).map(f => ({ nom: f, count: parCase.get(f) })),
    nonUtilises: tous.filter(f => !parScene.has(f) && !parCase.has(f)),
  };
}

/**
 * Combien d'Éléments du Projet ouvert utilisent ce fichier — Scènes ET Cases confondues.
 *
 * C'est le chiffre annoncé avant une suppression. Il porte sur les ÉLÉMENTS, pas sur les Scènes :
 * « 3 Éléments » dit combien de choses vont se transformer en boîte de remplacement, ce qui est la
 * conséquence réelle.
 */
export function countModelUsages(fichier, { tomes = [], scenes = [] } = {}){
  let n = 0;
  [...(tomes || []), ...(scenes || [])].forEach(vol => {
    (vol.pages || []).forEach(page => {
      (page.objects || []).forEach(o => {
        if (isImportedModel(o) && o.modelFile === fichier) n++;
      });
    });
  });
  return n;
}

/**
 * Le message de confirmation d'une suppression. Fonction PURE — c'est ce qui la rend vérifiable.
 *
 * Il dit TROIS choses, et les trois comptent : que c'est irréversible, ce que ça casse ici, et
 * qu'on ne peut rien affirmer des autres Projets. Taire la troisième serait laisser croire à une
 * garantie qu'on n'a pas.
 */
export function messageSuppressionModele(fichier, usages, traduire){
  const t = traduire || ((en) => en);
  const conséquence = usages > 0
    ? t(`${usages} Element(s) in this project use it — they will show as placeholder boxes.`,
      `${usages} Élément(s) de ce Projet l'utilisent — ils deviendront des boîtes de remplacement.`)
    : t('No Element in this project uses it.', tr('No Element of this project uses it.', 'Aucun Élément de ce Projet ne l\'utilise.'));
  return t(
    `Delete "${fichier}" from disk? ${conséquence} Other projects cannot be checked from here, and this cannot be undone.`,
    `Supprimer « ${fichier} » du disque ? ${conséquence} Les autres Projets ne peuvent pas être vérifiés d'ici, et cette suppression est définitive.`,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Renommer un modèle
// ─────────────────────────────────────────────────────────────────────────────
//
// CE REFUS A ÉTÉ LEVÉ, ET IL FAUT SAVOIR CE QU'IL PROTÉGEAIT. Le menu portait cette note :
// « PAS de renommage de fichier : `modelFile` est un identifiant persisté, et le renommer casserait
// les Éléments des AUTRES Projets, qu'on ne peut pas réparer d'ici. »
//
// C'est exact, et ça le reste. Mais c'est aussi mot pour mot ce que fait déjà la SUPPRESSION, qui
// est offerte : elle casse les autres Projets sans pouvoir les réparer. La différence n'était donc
// pas dans le danger, elle était dans le fait qu'un danger avait été assumé et l'autre non. Le
// renommage est même le moins grave des deux — le fichier existe toujours, sous un autre nom, et
// rien n'est perdu que des références réparables à la main.
//
// Ce qui est réparé automatiquement : le Projet OUVERT, sa pile d'annulation, et la correspondance
// de squelette du fichier. Ce qui ne l'est pas, et que le message doit dire : les autres Projets.

/**
 * Repointe vers `nouveau` tous les Éléments qui citent `ancien`. MUTE les Éléments et rend leur
 * nombre.
 *
 * Muter plutôt que copier : les Éléments sont partagés par référence avec la sélection, les caches
 * de rig et le panneau latéral. Reconstruire les tableaux romprait ces identités et ferait perdre
 * la sélection en cours pour un simple changement de nom de fichier.
 *
 * Le champ `name` de l'Élément n'est PAS touché, même s'il reprenait le nom du fichier à l'import :
 * c'est l'étiquette de l'utilisateur, il a pu la choisir. Renommer un fichier ne renomme pas ce
 * qu'on a écrit dessus.
 */
export function repointerModele3D(racines, ancien, nouveau){
  if (!ancien || !nouveau || ancien === nouveau) return 0;
  let n = 0;
  [...(racines && racines.tomes || []), ...(racines && racines.scenes || [])].forEach(vol => {
    (vol && vol.pages || []).forEach(page => {
      (page && page.objects || []).forEach(o => {
        if (isImportedModel(o) && o.modelFile === ancien) { o.modelFile = nouveau; n++; }
      });
    });
  });
  return n;
}

/**
 * La même substitution, dans la pile d'annulation.
 *
 * ⚠️ SANS ÇA, Ctrl+Z RESSUSCITE UN NOM DE FICHIER MORT. La pile contient des états ANTÉRIEURS du
 * Projet, sérialisés (cf. snapshot dans events.js) : ils citent tous l'ancien nom. Annuler
 * n'importe quelle action faite AVANT le renommage restaurerait donc des Éléments pointant vers un
 * fichier qui n'existe plus — ils deviendraient des boîtes de remplacement, sans un mot, pour une
 * opération sans rapport avec celle qu'on annulait.
 *
 * Rend une NOUVELLE pile ; l'appelant remplace la sienne. Une entrée illisible est laissée telle
 * quelle plutôt que perdue : une pile d'annulation amputée serait pire qu'une entrée périmée.
 */
export function repointerPileAnnulation3D(pile, ancien, nouveau){
  if (!Array.isArray(pile)) return [];
  if (!ancien || !nouveau || ancien === nouveau) return pile.slice();
  return pile.map(entree => {
    let etat;
    try { etat = JSON.parse(entree); } catch { return entree; }
    repointerModele3D(etat, ancien, nouveau);
    return JSON.stringify(etat);
  });
}

/**
 * Le message de confirmation d'un renommage. Fonction PURE, comme celui de la suppression.
 *
 * Il dit ce qui sera réparé ici, et ce qui ne peut pas l'être ailleurs. La deuxième moitié est la
 * plus importante : c'est elle qui distingue « je range mes fichiers » de « je casse un Projet que
 * je n'ai pas ouvert depuis six mois ».
 */
export function messageRenommageModele(ancien, nouveau, usages, traduire){
  const t = traduire || ((en) => en);
  const conséquence = usages > 0
    ? t(`${usages} Element(s) in this project use it and will follow automatically.`,
      `${usages} Élément(s) de ce Projet l'utilisent et suivront automatiquement.`)
    : t('No Element in this project uses it.', 'Aucun Élément de ce Projet ne l\'utilise.');
  return t(
    `Rename "${ancien}" to "${nouveau}" on disk? ${conséquence} Other projects that use this model cannot be checked or repaired from here: they will show placeholder boxes until you rename it back.`,
    `Renommer « ${ancien} » en « ${nouveau} » sur le disque ? ${conséquence} Les autres Projets qui utilisent ce modèle ne peuvent être ni vérifiés ni réparés d'ici : ils afficheront des boîtes de remplacement tant que le nom n'aura pas été remis.`,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Le journal des renommages
// ─────────────────────────────────────────────────────────────────────────────
//
// À QUOI IL RÉPOND. Renommer un modèle répare le Projet ouvert, et lui seul : les autres Projets
// citent encore l'ancien nom et afficheront des boîtes de remplacement. On ne peut pas aller les
// corriger, on ne sait même pas où ils sont. En revanche on sait ce qu'on a renommé, et on peut
// le PROPOSER au moment où l'un d'eux s'ouvre.
//
// OÙ IL VIT. Dans les réglages de l'application (settings.json), à côté de la bibliothèque de poses,
// parce qu'il concerne le dossier Modeles, lui aussi partagé par tous les Projets.
//
// CE QU'IL NE COUVRE PAS, et c'est à dire clairement : un Projet envoyé à quelqu'un d'autre, ou
// ouvert sur une autre machine, n'a pas ce journal. La réparation ne le suit pas.

/** Au-delà, les plus anciennes entrées sont oubliées. Même ordre de grandeur que MAX_UNDO. */
export const MAX_RENOMMAGES_3D = 50;

/**
 * Le nom actuel d'un fichier, en suivant la chaîne des renommages. Fonction PURE.
 *
 * LES RENOMMAGES S'ENCHAÎNENT : A vers B, puis B vers C. Un Projet qui cite A doit atterrir sur C,
 * pas sur B qui n'existe plus. D'où le suivi de proche en proche plutôt qu'une simple lecture.
 *
 * Le garde-fou de cycle n'est pas théorique : renommer A en B puis B en A produit exactement
 * `[{de:'A',vers:'B'},{de:'B',vers:'A'}]`, et une boucle sans fin au premier appel.
 *
 * DEUX GARDE-FOUS, ET LE SECOND N'EST PAS REDONDANT. `vus` donne le bon RÉSULTAT sur un cycle : on
 * s'arrête au dernier nom sain. La borne, elle, garantit qu'on s'arrête TOUT COURT. La distinction
 * s'est payée comptant : en campagne de mutation, retirer `vus` n'a pas donné un test rouge mais
 * une suite de tests qui ne rendait jamais la main, tuée au bout de deux minutes. Une application
 * gelée est le pire des retours, et un test qui gèle n'en est pas un.
 *
 * La borne est donc INATTEIGNABLE tant que `vus` est en place : aucun test ne peut la distinguer,
 * et retirer `for (let i = 0; i <= entrees.length; i++)` ne fait échouer personne. C'est une
 * équivalence assumée, consignée plutôt que masquée, pas une évasion à rattraper.
 */
export function resoudreRenommage3D(journal, nom){
  const entrees = Array.isArray(journal) ? journal : [];
  let courant = nom;
  const vus = new Set([nom]);
  for (let i = 0; i <= entrees.length; i++) {
    const e = entrees.find(x => x && x.de === courant);
    if (!e || !e.vers || vus.has(e.vers)) return courant;
    courant = e.vers;
    vus.add(courant);
  }
  return courant;
}

/**
 * Ajoute un renommage au journal. Rend un NOUVEAU tableau.
 *
 * Une entrée dont la source est déjà citée est remplacée : renommer A en B puis A en C (après avoir
 * réimporté un A) laisserait sinon deux chemins pour A, et `resoudreRenommage3D` prendrait le
 * premier trouvé, c'est-à-dire le plus ancien.
 */
export function ajouterRenommage3D(journal, de, vers, max = MAX_RENOMMAGES_3D){
  const entrees = (Array.isArray(journal) ? journal : []).filter(e => e && e.de && e.vers);
  if (!de || !vers || de === vers) return entrees.slice();
  const suivant = [...entrees.filter(e => e.de !== de), { de, vers }];
  return suivant.length > max ? suivant.slice(suivant.length - max) : suivant;
}

/**
 * Ce qu'il y aurait à repointer dans un Projet. Fonction PURE.
 *
 * TROIS CONDITIONS, ET LES TROIS COMPTENT :
 *   le fichier cité est ABSENT du disque,
 *   le journal connaît un successeur pour lui,
 *   ce successeur est PRÉSENT sur le disque.
 *
 * La première est celle qu'on oublierait. Renommer `chaise.glb` en `tabouret.glb` puis réimporter
 * un AUTRE modèle sous le nom `chaise.glb` est parfaitement légitime : un Projet citant
 * `chaise.glb` est alors correct, et le repointer vers `tabouret.glb` lui changerait son décor
 * sous prétexte de le réparer.
 *
 * Rend une entrée par fichier concerné, avec le nombre d'Éléments : c'est ce chiffre qui distingue
 * un détail d'une demi-planche.
 */
export function modelesARepointer3D(racines, journal, fichiersPresents){
  const presents = new Set((fichiersPresents || []).map(n => String(n).toLowerCase()));
  const cites = new Map();
  [...(racines && racines.tomes || []), ...(racines && racines.scenes || [])].forEach(vol => {
    (vol && vol.pages || []).forEach(page => {
      (page && page.objects || []).forEach(o => {
        if (!isImportedModel(o) || !o.modelFile) return;
        cites.set(o.modelFile, (cites.get(o.modelFile) || 0) + 1);
      });
    });
  });
  const sortie = [];
  cites.forEach((usages, de) => {
    if (presents.has(de.toLowerCase())) return;              // le fichier est là : rien à réparer
    const vers = resoudreRenommage3D(journal, de);
    if (vers === de || !presents.has(vers.toLowerCase())) return;
    sortie.push({ de, vers, usages });
  });
  return sortie;
}

/**
 * Le message de la proposition. Fonction PURE, comme les deux autres.
 *
 * Deux formes selon le nombre d'entrées : une phrase qui se lit d'un trait pour un seul fichier,
 * une liste dès qu'il y en a plusieurs. La liste demande `white-space: pre-line` sur
 * `#confirmActionMessage`, sans quoi les retours à la ligne sont écrasés.
 *
 * « depuis cet ordinateur » est délibéré : c'est la seule phrase qui dise à l'utilisateur d'où
 * l'application tient ce qu'elle affirme, et donc pourquoi elle ne le saurait pas ailleurs.
 *
 * Ce qui n'est PAS promis : que rien ne sera enregistré avant qu'il ne le demande. Ce serait faux,
 * la sauvegarde automatique écrirait la modification quelques secondes plus tard. Ce qui est vrai
 * et vaut d'être dit, c'est que le placement n'est jamais perdu, quelle que soit la réponse.
 */
export function messageRepointageModeles(entrees, traduire){
  const t = traduire || ((en) => en);
  const liste = (entrees || []);
  const conserve = t(
    'Their position, size and pose are kept either way.',
    'Leur position, leur taille et leur pose sont conservées dans tous les cas.');
  if (liste.length === 1) {
    const { de, vers, usages } = liste[0];
    return t(
      `This project uses "${de}", which no longer exists under that name: it was renamed to "${vers}" on this computer. ${usages} Element(s) refer to it.\n\nUpdate this project so they point at the new name? Otherwise they will show as placeholder boxes. ${conserve}`,
      `Ce Projet utilise « ${de} », qui n'existe plus sous ce nom : il a été renommé en « ${vers} » depuis cet ordinateur. ${usages} Élément(s) le citent.\n\nMettre à jour ce Projet pour qu'ils pointent vers le nouveau nom ? Sans cela ils s'afficheront en boîtes de remplacement. ${conserve}`);
  }
  const lignes = liste.map(({ de, vers, usages }) => t(
    `${de} → ${vers} (${usages} Element(s))`,
    `${de} → ${vers} (${usages} Élément(s))`)).join('\n');
  return t(
    `This project uses ${liste.length} models that no longer exist under those names. They were renamed on this computer:\n\n${lignes}\n\nUpdate this project so they point at the new names? Otherwise these Elements will show as placeholder boxes. ${conserve}`,
    `Ce Projet utilise ${liste.length} modèles qui n'existent plus sous ce nom. Ils ont été renommés depuis cet ordinateur :\n\n${lignes}\n\nMettre à jour ce Projet pour qu'ils pointent vers les nouveaux noms ? Sans cela ces Éléments s'afficheront en boîtes de remplacement. ${conserve}`);
}
