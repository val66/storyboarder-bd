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
    // `roles` est un TROISIÈME ajout (tâche #378b), et il vit à CÔTÉ de `os` sans jamais le
    // remplacer. Voir normaliserRoles3D pour la raison, qui n'est pas une commodité.
    const roles = normaliserRoles3D(entree.roles);
    // `empreinte` est un QUATRIÈME ajout (tâche #387), même règle que les trois autres : la version
    // du format ne bouge pas, une version antérieure l'ignore. ⚠️ ELLE DOIT ÊTRE RECOPIÉE ICI, et
    // l'oublier serait invisible : cette fonction RECONSTRUIT l'entrée clé par clé, donc toute clé
    // non citée disparaît à la première relecture-réécriture, en silence.
    const empreinte = (typeof entree.empreinte === 'string' && entree.empreinte) ? entree.empreinte : null;
    if (Object.keys(os).length || valide || morphologie || membres.length || Object.keys(roles).length) {
      entrees[fichier] = { os, valide };
      if (morphologie) entrees[fichier].morphologie = morphologie;
      if (membres.length) entrees[fichier].membres = membres;
      if (Object.keys(roles).length) entrees[fichier].roles = roles;
      if (empreinte) entrees[fichier].empreinte = empreinte;
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
 * Les rôles enregistrés d'un fichier, `{ role: nomDOs }`. Fonction PURE, défensive comme le reste.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * POURQUOI UN CHAMP À CÔTÉ DE `os`, ET NON `os` ÉLARGI
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * `os` est indexé par les DIX-HUIT emplacements humanoïdes, et une version antérieure de
 * l'application le relit en filtrant sur cette liste fermée. Y glisser `hipFL` ne casserait rien
 * chez elle, mais lui ferait perdre la clé en silence à la première réécriture : elle relirait le
 * fichier, jetterait ce qu'elle ne connaît pas, et le réenregistrerait amputé.
 *
 * ⚠️ ET SURTOUT, LES DEUX NE COEXISTENT JAMAIS DANS UN MÊME FICHIER. Un humanoïde écrit `os`, une
 * créature écrit `roles`, et c'est la morphologie qui tranche. La même règle que la récolte des os
 * de #374, pour la même raison : deux clés désignant le même bout de squelette finiraient par se
 * contredire, et rien ne dirait laquelle croire.
 *
 * LES CLÉS NE SONT PAS VÉRIFIÉES contre une liste d'archétypes. Un rôle inconnu est INERTE, comme
 * une clé de pose d'os : l'écran ne l'affiche que s'il figure dans l'archétype courant. Le vérifier
 * ici demanderait de connaître la morphologie du fichier, que cette fonction n'a pas, et le prix
 * d'une clé oubliée serait de perdre un choix humain pour cause de morphologie changée un instant.
 */
function normaliserRoles3D(brut){
  const sortie = {};
  if (!brut || typeof brut !== 'object') return sortie;
  Object.entries(brut).forEach(([cle, nom]) => {
    if (typeof cle === 'string' && cle && typeof nom === 'string' && nom) sortie[cle] = nom;
  });
  return sortie;
}

/**
 * L'empreinte d'un squelette : « 49-1a2b3c4d ». Fonction PURE, sans dépendance.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * POURQUOI ELLE EXISTE (#387)
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * #386 proposait de reprendre la correspondance d'un fichier voisin, à condition que chacun des os
 * qu'elle NOMME existe ici. ⚠️ MESURÉ SUR LE FICHIER RÉEL DE L'UTILISATEUR, et le résultat est sans
 * appel : dix entrées, ZÉRO os nommé, une seule morphologie corrigée. Le critère écartait donc tout,
 * y compris le cas le plus utile — la morphologie corrigée à la main, précisément ce que la
 * reconnaissance automatique rate le plus souvent.
 *
 * ⚠️ J'AVAIS ÉCRIT « une entrée qui ne nomme aucun os n'apprend rien ». C'est la MÊME PHRASE, mot
 * pour mot, que celle démentie plus haut dans ce fichier à propos de `entreePourFichier` : « une
 * entrée sans os n'apprend rien », déjà fausse à l'époque, déjà pour la même raison. Une entrée
 * apprend ce que l'utilisateur a TRANCHÉ, et un choix ne se mesure pas au nombre d'os qu'il touche.
 *
 * Sans os nommés, rien dans le fichier ne disait que deux squelettes sont les mêmes. Cette empreinte
 * le dit.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * LA FORME EST CHOISIE POUR RESTER LISIBLE, ET MESURÉE
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Enregistrer la LISTE des noms aurait été le plus lisible, et c'est mesuré comme intenable : 1,1 ko
 * pour le cerbère, et 31 ko pour un rig Unreal à 1126 os, dans un fichier partagé par tous les
 * Projets. On garde donc le NOMBRE d'os en clair — un humain qui ouvre le fichier voit tout de suite
 * de quoi il parle — suivi d'un condensé des noms.
 *
 * LES NOMS SONT TRIÉS AVANT D'ÊTRE CONDENSÉS : un réexport qui réordonne ses nœuds sans rien changer
 * d'autre doit donner la même empreinte, sans quoi la fonctionnalité s'éteindrait au premier
 * réexport, c'est-à-dire dans le cas même qu'elle vise.
 *
 * FNV-1a, écrit ici plutôt qu'importé : `crypto` n'est pas garanti dans le renderer, et une
 * dépendance pour huit lignes de décalages coûterait plus cher que ces huit lignes.
 */
export function empreinteDeSquelette3D(osDuFichier){
  const noms = (osDuFichier || [])
    .map(o => o && o.name)
    .filter(n => typeof n === 'string' && n)
    .sort();
  if (!noms.length) return null;
  let h = 0x811c9dc5;
  const texte = noms.join('\n');
  for (let i = 0; i < texte.length; i++) {
    h ^= texte.charCodeAt(i);
    // FNV-1a multiplie par 16777619. `Math.imul` fait la multiplication 32 bits SANS passer par les
    // flottants, où le produit dépasserait 2^53 et perdrait ses bits de poids faible : ce sont
    // justement eux qui portent l'information.
    h = Math.imul(h, 0x01000193);
  }
  return `${noms.length}-${(h >>> 0).toString(16).padStart(8, '0')}`;
}

/**
 * Les os qu'une entrée DÉSIGNE par leur nom, tous champs confondus. Fonction PURE.
 *
 * C'est la question qui décide si une correspondance peut resservir ailleurs : une correspondance ne
 * mémorise que des NOMS d'os, jamais des indices, et c'est vrai depuis le premier jour de ce
 * fichier. Elle s'applique donc telle quelle à tout squelette qui porte ces mêmes noms.
 */
export function osDesignesParEntree3D(entree){
  const e = entree || {};
  const noms = new Set();
  Object.values(e.os || {}).forEach(n => { if (typeof n === 'string' && n) noms.add(n); });
  Object.values(e.roles || {}).forEach(n => { if (typeof n === 'string' && n) noms.add(n); });
  (e.membres || []).forEach(m => { if (m && typeof m.racine === 'string' && m.racine) noms.add(m.racine); });
  return noms;
}

/**
 * Ce qu'une option du menu de reprise affiche : le fichier, ce qu'il apporte, sa morphologie. PURE.
 *
 * LES INFORMATIONS SONT CELLES QUI DÉCIDENT. Le nom seul ne distingue pas deux réexports ; le nombre
 * d'os nommés dit combien de travail est repris ; la morphologie dit dans quel écran on va atterrir,
 * et c'est souvent elle qu'on vient chercher.
 *
 * ⚠️ ELLE A VÉCU DANS events.js, où elle était INVÉRIFIABLE : un fichier qui touche au DOM ne
 * s'importe pas dans un test sans monter tout un décor. Un texte destiné à être lu par un humain est
 * exactement le genre de chose qu'une mutation peut vider sans que rien ne tombe. Elle est ici parce
 * qu'elle est pure, comme `sousTitreCorrespondance3D` l'est devenue pour la même raison.
 */
export function libelleCandidatReprise3D(candidat, traduire){
  const t = traduire || ((en) => en);
  const c = candidat || {};
  const morpho = ARCHETYPES_3D.find(a => a.cle === (c.entree || {}).morphologie);
  const nom = morpho ? t(morpho.labelEn, morpho.label) : null;
  // ⚠️ « 0 os nommés » EST LE CAS ORDINAIRE, pas un cas limite (#387) : mesuré, dix entrées sur dix
  // dans le fichier réel de l'utilisateur ne nomment aucun os, et une seule porte une morphologie.
  // Annoncer « 0 » ferait passer pour vide ce qui est justement l'entrée la plus utile.
  if (!c.os) {
    return nom ? `${c.fichier} — ${nom}`
      : t(`${c.fichier} — its chains`, `${c.fichier} — ses chaînes`);
  }
  // Sans morphologie enregistrée, on n'en INVENTE pas : l'entrée n'en portait pas, et écrire
  // « humanoïde » par défaut annoncerait un basculement d'écran qui n'aura pas lieu.
  const suffixe = nom ? `, ${nom}` : '';
  return t(`${c.fichier} — ${c.os} named bones${suffixe}`, `${c.fichier} — ${c.os} os nommés${suffixe}`);
}

/**
 * Cette entrée transmet-elle une DÉCISION de l'utilisateur ? Fonction PURE.
 *
 * ⚠️ `valide` N'EN EST PAS UNE, ici. Il dit « j'ai vu cet écran », ce qui suffit à mériter une
 * entrée sur le disque (cf. entreePourFichier) mais ne se REPREND pas : rien à copier. Confondre
 * les deux ferait proposer les dix fichiers simplement validés, et le bandeau s'afficherait partout
 * en ne promettant rien.
 */
function apporteQuelqueChose3D(entree){
  const e = entree || {};
  return !!(e.morphologie
    || Object.keys(e.os || {}).length
    || Object.keys(e.roles || {}).length
    || (e.membres || []).length);
}

/**
 * Les correspondances d'AUTRES fichiers qui s'appliqueraient telles quelles à ce squelette. PURE.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * PAS UN SEUIL DE RESSEMBLANCE, UNE QUESTION FONCTIONNELLE
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * La question n'est pas « ces deux squelettes se ressemblent-ils ? », qui demanderait un seuil, mais
 * « cette correspondance peut-elle s'appliquer ICI ? », qui se répond par oui ou par non : chacun des
 * os qu'elle nomme existe-t-il dans ce fichier ? Un seuil inventé aurait été le travers habituel ;
 * ici la mesure ne sert qu'à vérifier que la réponse discrimine, et elle discrimine largement.
 *
 * ⚠️ MESURE DU RISQUE DE FAUX POSITIF, sur les 136 paires des dix-sept fixtures : 87 paires n'ont
 * AUCUN os en commun, et la paire la plus proche en partage DEUX. Aucun couple de modèles distincts
 * n'approche, même de loin, le partage total qu'exige cette fonction.
 *
 * ⚠️ CE QUE LA MESURE NE DIT PAS, et il faut le dire aussi : le corpus ne contient AUCUN couple de
 * fichiers qui soient le même squelette. Le risque de faux positif est donc mesuré, la fréquence des
 * vrais positifs ne l'est pas. Cette fonction peut très bien ne se déclencher qu'une fois sur vingt.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * DEUX PORTES, PARCE QUE LA PREMIÈRE NE S'OUVRAIT JAMAIS (#387)
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ MESURÉ SUR LE FICHIER RÉEL DE L'UTILISATEUR APRÈS LIVRAISON : dix entrées, ZÉRO os nommé. La
 * condition ci-dessus écartait donc la totalité de son corpus, et la fréquence de vrais positifs
 * annoncée comme non mesurée valait en fait zéro. Le cas écarté était le plus utile de tous : une
 * morphologie corrigée à la main, sans un seul os touché.
 *
 * Une entrée est donc retenue si :
 *   — son EMPREINTE est celle de ce squelette : c'est le même, la question ne se pose plus ; ou
 *   — chacun des os qu'elle NOMME existe ici, la règle d'origine, qui reste seule utilisable pour
 *     les entrées écrites avant #387 et couvre en plus le squelette élargi d'un réexport.
 *
 * ET elle doit APPORTER quelque chose : une entrée sans morphologie, sans os, sans rôle et sans
 * chaîne nommée ne transmet aucune décision. La condition porte désormais sur les DÉCISIONS, non
 * plus sur le nombre d'os, ce qui est la correction du défaut.
 *
 * ⚠️ RIEN N'EST APPLIQUÉ EN SILENCE. Elle PROPOSE, l'écran affiche, l'utilisateur tranche. Reprendre
 * une correspondance sans le dire serait exactement le genre d'aide dont on ne comprend pas d'où
 * elle vient, et qu'on ne sait pas défaire.
 *
 * @param osDuFichier la liste d'os neutre du fichier ouvert
 * @param entrees `{ nomDeFichier: entree }`, tout le fichier de correspondances
 * @param sauf le fichier ouvert, à ne pas se proposer à lui-même
 * @returns `[{ fichier, entree, os, memeSquelette }]`, la plus riche d'abord
 */
export function correspondancesApplicables3D(osDuFichier, entrees, sauf){
  const presents = new Set((osDuFichier || [])
    .map(o => o && o.name).filter(n => typeof n === 'string' && n));
  if (!presents.size) return [];
  const empreinte = empreinteDeSquelette3D(osDuFichier);
  return Object.entries(entrees || {})
    .filter(([fichier]) => fichier !== sauf)
    .map(([fichier, entree]) => ({
      fichier, entree,
      noms: osDesignesParEntree3D(entree),
      memeSquelette: !!(empreinte && entree && entree.empreinte === empreinte),
    }))
    .filter(c => apporteQuelqueChose3D(c.entree)
      && (c.memeSquelette || (c.noms.size > 0 && [...c.noms].every(n => presents.has(n)))))
    .map(c => ({ fichier: c.fichier, entree: c.entree, os: c.noms.size, memeSquelette: c.memeSquelette }))
    // LA PLUS RICHE D'ABORD, et à égalité d'os nommés celle dont on SAIT que c'est le même
    // squelette : elle vaut mieux qu'une entrée simplement compatible.
    .sort((a, b) => b.os - a.os
      || (b.memeSquelette ? 1 : 0) - (a.memeSquelette ? 1 : 0)
      || a.fichier.localeCompare(b.fichier));
}

/**
 * Ce que devient l'écran quand on reprend la correspondance d'un autre fichier. Fonction PURE.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * TOUT OU RIEN, ET C'EST LE POINT
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Une reprise ligne par ligne existerait, et elle transformerait un raccourci en travail : décider
 * quatorze fois coûte exactement ce que la reprise prétend économiser. On reprend donc l'entrée
 * ENTIÈRE — emplacements, rôles, chaînes, morphologie — et l'utilisateur corrige ensuite ce qui ne
 * lui va pas, avec les mêmes menus que d'habitude. Défaire une reprise, c'est « Réinitialiser ».
 *
 * ⚠️ LA MORPHOLOGIE VIENT AVEC, ET C'EST LE PLUS UTILE DU LOT. Le cas qui a fait naître cette
 * fonction est un cerbère proposé `humanoide` par la reconnaissance, alors que le fichier voisin
 * porte le `quadrupede` corrigé à la main. C'est aussi pourquoi les candidats ne sont PAS filtrés
 * sur leur archétype (cf. correspondancesApplicables3D) : filtrer sur une morphologie encore
 * fausse écarterait le candidat précisément quand il a raison contre l'écran.
 *
 * ⚠️ RIEN N'EST ÉCRIT ICI. Cette fonction rend un BROUILLON, comme tout le reste de cet écran ; le
 * disque n'est touché qu'à « Enregistrer ».
 *
 * @param entree l'entrée du fichier voisin, telle qu'elle a été relue
 * @param osDuFichier les os du fichier OUVERT, `[{ id, name }]`
 * @param auto ce que rend `inferSkeletonMap` sur ce fichier : les emplacements que la reprise ne
 *             couvre pas restent proposés, on ne les vide pas
 * @returns `{ carte, roles, membres, morphologie, cles }`, `cles` étant les emplacements et rôles
 *          repris, pour que l'écran puisse dire d'où vient chaque ligne.
 */
export function repriseDeCorrespondance3D(entree, osDuFichier, auto){
  const e = entree || {};
  const osRepris = normaliserRoles3D(e.os);
  const rolesRepris = normaliserRoles3D(e.roles);
  // Les os REPRIS sont marqués `manuel` par `fusionner`, et ce n'est pas une approximation : ce
  // sont bien des choix humains, faits sur le fichier voisin, et `entreePourFichier` n'écrit que
  // les emplacements marqués ainsi. Les marquer `repris` ici les ferait disparaître à
  // l'enregistrement — une perte silencieuse, exactement du genre de #382 et #385. L'étiquette
  // `repris` de l'écran est une information d'AFFICHAGE, tenue à part, dans `cles`.
  const carte = fusionner(auto, { os: osRepris }, osDuFichier);
  // Une entrée peut nommer un os que ce fichier n'a plus : `fusionner` retombe alors sur la
  // proposition automatique pour cet emplacement. La clé ne doit pas se dire « reprise » dans ce
  // cas, sans quoi l'écran désignerait comme repris un os que personne n'a repris.
  const cles = new Set();
  Object.entries(osRepris).forEach(([slot, nom]) => {
    const v = carte[slot];
    if (v && v.name === nom) cles.add(slot);
  });
  const presents = new Set((osDuFichier || []).map(o => o && o.name).filter(Boolean));
  const roles = {};
  Object.entries(rolesRepris).forEach(([cle, nom]) => {
    if (!presents.has(nom)) return;
    roles[cle] = nom;
    cles.add(cle);
  });
  // LES CHAÎNES RENOMMÉES COMPTENT AUSSI. Une chaîne dont le nom vient d'ailleurs affiche « votre
  // choix » si on l'oublie ici, et c'est faux au même titre qu'une ligne de rôle. Seules celles qui
  // portent un NOM entrent : une chaîne simplement décochée n'a pas d'étiquette à corriger.
  const membres = normaliserMembres(e.membres);
  membres.forEach(m => { if (m.nom) cles.add(m.racine); });
  return {
    carte,
    roles,
    membres,
    morphologie: MORPHOLOGIES_CONNUES.has(e.morphologie) ? e.morphologie : null,
    cles,
  };
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

export function entreePourFichier(carte, {
  valide = false, morphologie = null, membres = null, roles = null,
  humanoide = true, precedente = null, empreinte = null,
} = {}){
  const avant = precedente || {};
  // ═════════════════════════════════════════════════════════════════════════════════════════════
  // L'AUTRE VOCABULAIRE EST CONSERVÉ TEL QUEL (#382)
  // ═════════════════════════════════════════════════════════════════════════════════════════════
  //
  // Un humanoïde écrit `os`, une créature écrit `roles` : c'est la morphologie qui dit LEQUEL des
  // deux est lu, et cette règle-là ne bouge pas. Mais l'écrire n'oblige pas à EFFACER l'autre.
  //
  // ⚠️ SIGNALÉ PAR L'UTILISATEUR AVANT QUE ÇA NE LUI COÛTE : corriger dix emplacements en
  // humanoïde, basculer en quadrupède par curiosité, enregistrer, revenir en humanoïde, et les dix
  // corrections avaient disparu sans un mot. Le même genre de perte silencieuse que #385.
  //
  // ⚠️ LE DRAPEAU EST EXPLICITE, il ne se déduit PAS d'un `os` vide. « Aucun emplacement manuel »
  // est un état légitime pour un humanoïde, celui de quelqu'un qui vient de tout remettre en
  // automatique : le déduire ferait ressusciter les choix qu'il vient d'effacer.
  const os = {};
  SLOTS.forEach(slot => {
    const v = (carte || {})[slot];
    if (v && v.bone !== undefined && v.origine === 'manuel' && v.name) os[slot] = v.name;
  });
  const m = MORPHOLOGIES_CONNUES.has(morphologie) ? morphologie : null;
  const mem = normaliserMembres(membres);
  const rol = normaliserRoles3D(roles);
  const osFinal = humanoide ? os : normaliserRoles3D(avant.os);
  const rolFinal = humanoide ? normaliserRoles3D(avant.roles) : rol;
  if (!Object.keys(osFinal).length && !valide && !m && !mem.length && !Object.keys(rolFinal).length) {
    return null;
  }
  const sortie = { os: osFinal, valide };
  if (m) sortie.morphologie = m;
  if (mem.length) sortie.membres = mem;
  // MÊME RÈGLE QUE `os` : seuls les choix HUMAINS sont écrits. Figer l'attribution proposée
  // condamnerait toute amélioration de #379, #381 et de la suite, qui trouveraient un rôle
  // « enregistré » sur chaque fichier jamais touché. L'appelant ne passe donc que ce qui a été
  // choisi à la main.
  if (Object.keys(rolFinal).length) sortie.roles = rolFinal;
  // L'EMPREINTE N'EST PAS UN CHOIX HUMAIN, et c'est la seule chose écrite ici qui n'en soit pas un
  // (#387). Elle ne dit pas ce que l'utilisateur veut, elle dit DE QUEL SQUELETTE il parlait : sans
  // elle, une entrée qui ne nomme aucun os ne peut être proposée à personne, faute de pouvoir
  // vérifier qu'elle s'applique. Elle ne CRÉE jamais une entrée à elle seule — la condition
  // ci-dessus ne la compte pas — sans quoi tout fichier seulement ouvert en écrirait une.
  //
  // ⚠️ CELLE D'AVANT EST CONSERVÉE À DÉFAUT, même règle que les deux vocabulaires : un appelant qui
  // ne la transmet pas ne doit pas effacer celle du disque, ce qui rendrait le fichier muet à la
  // première sauvegarde faite par un chemin plus ancien.
  const emp = (typeof empreinte === 'string' && empreinte) ? empreinte
    : ((typeof avant.empreinte === 'string' && avant.empreinte) ? avant.empreinte : null);
  if (emp) sortie.empreinte = emp;
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
 * Le cache est rempli au démarrage (cf. la chaîne de lancement dans events.js) puis tenu à jour à
 * chaque enregistrement.
 *
 * ⚠️ CE COMMENTAIRE A ÉTÉ FAUX PENDANT TOUT LE CHANTIER, et le défaut qu'il cachait était exactement
 * celui qu'il déclarait impossible (#383b). Il disait déjà « rempli au démarrage » alors que RIEN ne
 * le remplissait au démarrage : les deux seuls appels à `lireCorrespondances` étaient l'ouverture de
 * l'écran de correspondance et l'import d'un modèle. Tant qu'on n'avait pas ouvert l'un des deux,
 * toute correction enregistrée — morphologie, os nommés, rôles — était INVISIBLE, et l'application
 * repartait de la reconnaissance automatique en silence.
 *
 * Il ajoutait, pour rassurer, que la reconnaissance automatique seule est « correcte sur les six
 * fichiers mesurés ». C'est vrai et hors sujet : une correction manuelle n'existe que là où
 * l'automatique se trompe. La phrase mesurait la seule population où le défaut ne se voit pas.
 *
 * Si le cache est vide malgré tout — lecture disque en échec — la reconnaissance automatique
 * reprend la main, et une correction manuelle réapparaît dès la lecture suivante.
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
export async function enregistrerCorrespondance(fichier, carte, {
  valide = true, morphologie = null, membres = null, roles = null, humanoide = true,
  osDuFichier = null,
} = {}){
  const p = pont();
  if (!p || !p.writeSkeletonMaps) return { ok: false, error: 'pont indisponible' };
  if (!fichier) return { ok: false, error: 'fichier manquant' };
  const tout = await lireCorrespondances();
  // `precedente` porte l'autre vocabulaire, celui que cet enregistrement ne réécrit pas.
  // L'empreinte est calculée ICI, à partir des os que l'appelant vient d'afficher (#387) : c'est le
  // seul instant où l'on tient à la fois le fichier et son squelette décodé.
  const entree = entreePourFichier(carte, {
    valide, morphologie, membres, roles, humanoide, precedente: tout.entrees[fichier],
    empreinte: empreinteDeSquelette3D(osDuFichier),
  });
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
