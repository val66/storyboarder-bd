/**
 * src/bubble-library.js — la BIBLIOTHÈQUE de styles de Bulle. Fonctions PURES.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * CE QU'UN STYLE CONTIENT SE DÉCIDE PAR EXCLUSION, ET CETTE DÉCISION EST DÉJÀ PRISE
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ ON NE RÉÉCRIT PAS LA LISTE DES AXES GRAPHIQUES. La tentation est d'énumérer ce qu'un style
 * retient — forme, pointe, trait, texture, couleurs, police… — et `src/bubble-merge.js` a déjà
 * expliqué pourquoi c'est un piège : cette liste s'allonge à chaque axe ajouté et se périme en
 * SILENCE. Un axe oublié ne serait pas enregistré, le style rendrait une Bulle à moitié conforme,
 * et rien ne dirait pourquoi.
 *
 * La fusion a résolu le même problème en nommant ce qui NE se transporte pas : `CHAMPS_PROPRES_AU
 * _LOBE`, une liste stable et petite — identité, géométrie, texte, état de fusion. Un style pose
 * exactement la même question, et doit donc réutiliser cette réponse plutôt qu'en inventer une
 * seconde. Deux listes qui décrivent « ce qui est de l'apparence » divergeraient au premier axe
 * ajouté, et c'est le défaut que ce dépôt a rencontré quatre fois.
 *
 * ⚠️ CE QU'UN STYLE EXCLUT EN PLUS : L'ANGLE ET LA LONGUEUR DE LA POINTE. Ce sont des PLACEMENTS,
 * pas des réglages d'aspect : une pointe désigne qui parle, et son angle dépend de la Case, pas du
 * style. Appliquer un style à une Bulle déjà posée ne doit donc pas faire tourner sa pointe vers
 * un locuteur qui n'est pas le sien. Arbitré avec l'utilisateur au moment de l'ajout.
 *
 * ⚠️ ET LE TEXTE SORT, MAIS PAS SES RÉGLAGES. `description` est dans la liste de la fusion, donc
 * exclue ; la police, la couleur des lettres et leur contour n'y sont pas, donc retenues. C'est ce
 * que l'usage a demandé mot pour mot — « il garde par contre les attributs du texte » — et c'est
 * ce que l'exclusion donne sans qu'on ait à le dire une seconde fois.
 */

import { CHAMPS_PROPRES_AU_LOBE } from './bubble-merge.js';

/**
 * Les champs qu'un style ne retient JAMAIS.
 *
 * ⚠️ CONSTRUITE À PARTIR DE CELLE DE LA FUSION, ET NON RECOPIÉE. Un ajout à `CHAMPS_PROPRES_AU_LOBE`
 * — le jour où une Bulle gagnera un champ de relation de plus — entre ici tout seul. Recopier les
 * onze noms aurait fait deux listes à tenir, et la seconde se serait périmée sans bruit.
 */
export const CHAMPS_HORS_STYLE = [...CHAMPS_PROPRES_AU_LOBE, 'tailAngle', 'tailLen'];

/**
 * Le style d'une Bulle : tout ce qu'elle porte, sauf ce qui lui est propre. Fonction PURE.
 *
 * ⚠️ LES CLÉS ABSENTES RESTENT ABSENTES, ET C'EST UN RÉGLAGE. Une Bulle sans `bulleShape` est une
 * Bulle ovale par défaut ; enregistrer `bulleShape: undefined` puis l'appliquer ailleurs reviendrait
 * à imposer l'ovale à une Bulle rectangulaire, alors que le style ne dit rien de sa forme. C'est la
 * règle « pas de réglage vaut l'existant », et elle vaut ici comme partout — voir `appliquerStyle3D`,
 * qui en tire la conséquence symétrique.
 */
export function styleDeLaBulle3D(o){
  const out = {};
  for (const cle of Object.keys(o || {})) {
    if (!CHAMPS_HORS_STYLE.includes(cle)) out[cle] = o[cle];
  }
  return out;
}

/**
 * Applique un style à une Bulle. Fonction PURE : rend un NOUVEL objet.
 *
 * ⚠️ LES CHAMPS D'APPARENCE QUE LE STYLE NE NOMME PAS SONT RETIRÉS, ILS NE SURVIVENT PAS. C'est la
 * faute M14 de #426a, rencontrée des deux côtés de la fusion : `Object.assign` écrit ce qu'on lui
 * donne et laisse le reste intact, si bien qu'une Bulle texturée à qui l'on applique un style sans
 * texture GARDERAIT sa texture. L'utilisateur verrait alors un style rendre deux résultats
 * différents selon la Bulle de départ — ce qui est exactement ce qu'un style existe pour éviter.
 *
 * L'absence est donc un réglage : appliquer un style rend une Bulle dont l'apparence est CELLE du
 * style, et rien d'autre.
 */
export function appliquerStyle3D(o, style){
  const out = {};
  for (const cle of Object.keys(o || {})) {
    if (CHAMPS_HORS_STYLE.includes(cle)) out[cle] = o[cle];
  }
  return Object.assign(out, style || {});
}

/**
 * Cette Bulle porte-t-elle déjà ce style ? Fonction PURE.
 *
 * ⚠️ LA COMPARAISON PORTE SUR LE STYLE EXTRAIT, PAS SUR LA BULLE. Comparer la Bulle au style
 * ferait échouer toute comparaison sur la géométrie, que le style ne contient pas. On extrait donc
 * des deux côtés la même chose, et on compare ce qui est comparable.
 *
 * ⚠️ ET L'ÉGALITÉ EST EXACTE, CLÉ PAR CLÉ, DANS LES DEUX SENS. Ne vérifier que « le style est inclus
 * dans la Bulle » dirait « conforme » d'une Bulle qui porte en plus une texture : le bouton
 * s'éteindrait alors qu'enregistrer aurait produit un style différent.
 */
export function bulleSuitLeStyle3D(o, style){
  const a = styleDeLaBulle3D(o), b = styleDeLaBulle3D(style || {});
  const cles = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const cle of cles) {
    if (a[cle] !== b[cle]) return false;
  }
  return true;
}

/** Le style de la bibliothèque que cette Bulle porte déjà, ou `null`. Fonction PURE. */
export function styleCorrespondant3D(o, bibliotheque){
  for (const entree of bibliotheque || []) {
    if (entree && bulleSuitLeStyle3D(o, entree.style)) return entree;
  }
  return null;
}

/**
 * Le bouton « Enregistrer » est-il actif ? Fonction PURE.
 *
 * ⚠️ UNE SEULE SOURCE POUR L'ÉTAT DU BOUTON ET POUR LA LISTE. La fiche pourrait décider elle-même
 * « si un style correspond, je grise » — et ce serait une seconde copie de la même règle, à côté de
 * celle qui sélectionne l'entrée du menu. Ce chantier a vu quatre fois deux copies d'une décision
 * se contredire ; on n'en écrit qu'une.
 */
export function peutEnregistrerLeStyle3D(o, bibliotheque){
  return !!o && styleCorrespondant3D(o, bibliotheque) === null;
}

/** La longueur maximale d'un nom de style, pour que la liste reste lisible. */
export const NOM_STYLE_MAX = 40;

/**
 * Le nom proposé est-il recevable, dans cette bibliothèque ? Fonction PURE.
 *
 * Rend `null` si le nom convient, sinon une CLÉ de motif de refus — jamais une phrase. La phrase
 * appartient à `src/i18n.js`, et la décider ici rendrait ce module bilingue, donc impur.
 *
 * ⚠️ LA COMPARAISON DES DOUBLONS IGNORE LA CASSE ET LES ESPACES DE BORD. « Cri » et « cri  » sont le
 * même style pour qui lit la liste ; les laisser coexister donnerait deux entrées indiscernables,
 * et le menu deviendrait un piège plutôt qu'un raccourci.
 */
export function refusDuNomDeStyle3D(nom, bibliotheque){
  const propre = String(nom == null ? '' : nom).trim();
  if (!propre) return 'vide';
  if (propre.length > NOM_STYLE_MAX) return 'trop-long';
  const norme = (s) => String(s).trim().toLowerCase();
  if ((bibliotheque || []).some(e => e && norme(e.nom) === norme(propre))) return 'doublon';
  return null;
}

/**
 * La bibliothèque augmentée d'un style. Fonction PURE : rend un NOUVEAU tableau.
 *
 * ⚠️ LE NOM EST NETTOYÉ ICI, ET UNE SEULE FOIS. Le laisser à l'appelant reviendrait à espérer qu'il
 * applique le même `trim` que le contrôle des doublons — deux nettoyages, donc deux occasions de
 * diverger, et un nom qui passe le contrôle sans être celui qu'on enregistre.
 */
export function ajouterStyle3D(bibliotheque, nom, style){
  return [...(bibliotheque || []), { nom: String(nom).trim(), style: { ...style } }];
}

/**
 * La bibliothèque telle qu'on la relit d'un fichier de réglages. Fonction PURE.
 *
 * ⚠️ UNE BIBLIOTHÈQUE ILLISIBLE VAUT UNE BIBLIOTHÈQUE VIDE, ELLE NE LÈVE PAS. `settings.json` est
 * un fichier que l'utilisateur peut éditer, qu'une version antérieure a pu écrire autrement, et
 * qu'un disque plein a pu tronquer. Refuser de démarrer pour cela mettrait l'Application à genoux
 * pour un réglage d'agrément — c'est la même politique que la géométrie de fenêtre de #407b.
 *
 * Les entrées mal formées sont écartées UNE PAR UNE : une seule ligne abîmée ne doit pas emporter
 * les vingt autres.
 */
export function bibliothequeLue3D(brut){
  if (!Array.isArray(brut)) return [];
  return brut
    .filter(e => e && typeof e === 'object' && typeof e.nom === 'string' && e.nom.trim()
                 && e.style && typeof e.style === 'object' && !Array.isArray(e.style))
    .map(e => ({ nom: e.nom.trim(), style: styleDeLaBulle3D(e.style) }));
}
