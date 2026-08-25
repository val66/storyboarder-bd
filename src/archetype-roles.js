/**
 * @file archetype-roles.js
 * Ce qu'une pose peut VISER sur un squelette, et d'où cette liste vient.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * LE MANQUE QUE CE FICHIER COMBLE
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Depuis #374, une créature importée est pilotée par ses CHAÎNES, et chaque chaîne porte un nom que
 * l'utilisateur tape. Ce nom est du texte libre, propre à un fichier : « Patte avant gauche » dans
 * celui-ci, autre chose dans le suivant. Une pose d'archétype n'a donc rien à viser, et #375 n'a pas
 * de sol sous les pieds.
 *
 * Il manque un RÔLE : un identifiant stable, partagé par tous les modèles d'un même archétype.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * LES LISTES NE SONT PAS INVENTÉES, ELLES SONT DÉRIVÉES
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ Elles existent déjà, écrites en #367 en alignant les animaux intégrés sur les archétypes, sans
 * qu'on voie alors à quoi elles serviraient d'autre : ce sont les identifiants d'articulation de
 * `ANIMAL_JOINT_DEFS`, et ils sont DÉJÀ PERSISTÉS dans `animalJoints3d`, donc déjà protégés
 * (cf. docs/en/persisted-data.md). Les réutiliser veut dire qu'un chien importé et le loup intégré
 * parlent la même langue, et qu'une pose écrite une fois s'applique aux deux.
 *
 * Écrire une seconde table à la main aurait produit exactement l'énumération parallèle dont ce dépôt
 * a déjà souffert plusieurs fois : deux listes qui disent la même chose, et qui divergent.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * L'UNION, PAS L'INTERSECTION
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Deux animaux partagent l'archétype `quadrupede`, et ils ne portent pas les mêmes articulations :
 * le loup a `neck`, le lézard non. La liste de l'archétype est leur UNION.
 *
 * L'intersection aurait retiré le cou aux quadrupèdes, alors qu'un chien importé en a un : elle
 * aurait fait payer à tous les modèles la pauvreté du rig le plus pauvre. L'union coûte l'inverse,
 * un rôle qu'un fichier donné n'a pas, et ce cas est déjà réglé, un rôle absent est simplement sauté.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * LES LIBELLÉS SE DÉRIVENT DE LA CLÉ, ILS NE SE RECOPIENT PAS
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * `ANIMAL_JOINT_DEFS` porte des libellés FRANÇAIS uniquement : mesuré, 61 articulations sur 61 n'ont
 * pas de `labelEn`.
 *
 * ⚠️ J'EN AI TIRÉ UNE CONCLUSION FAUSSE, écrite ici même : « le panneau des Animaux s'affiche donc en
 * français même en anglais ». C'est démenti. `libelleAnimal3D` traduit ces libellés par
 * `ANIMAL_LABELS_EN`, un dictionnaire INDEXÉ PAR LE MOT FRANÇAIS plutôt que par un champ à côté de
 * chaque entrée. Les 36 mots y sont, sans exception. J'avais cherché un `labelEn` et conclu de son
 * absence à celle d'une traduction, sans vérifier ce que l'écran affiche : la même faute que
 * la tâche #372, où j'avais inventé une cause au lieu de la lire.
 *
 * Ce qui reste vrai, et qui justifie ce qui suit : ce dictionnaire est indexé par un LIBELLÉ, pas
 * par un identifiant. Y ajouter les rôles voudrait dire traduire « Hanche avant gauche » d'un bloc,
 * là où la clé `hipFL` se décompose. Un libellé traduit ne se recompose pas.
 *
 * Plutôt que d'étendre ce dictionnaire, ou pire d'en recopier une partie ici, le libellé se
 * DÉCOMPOSE depuis l'identifiant : `hipFL` se lit `hip` + `F` + `L`. Les vingt-et-une clés du dépôt
 * suivent cette forme sans exception. Conséquence recherchée : ajouter une articulation à un animal
 * lui donne son libellé dans les deux langues sans toucher à ce fichier.
 */

import { ANIMAL_JOINT_DEFS, ANIMAL_ARCHETYPES_3D } from './constants.js';
import {
  SLOTS, SLOT_GROUPS, slotLabel, lignesDeCorrespondance3D, typeDeChaine3D,
} from './skeleton-map.js';

/**
 * Les morceaux d'un identifiant d'articulation, et leur libellé dans les deux langues.
 *
 * L'ORDRE DE CETTE TABLE COMPTE : `wingTip` doit précéder `wing`, sans quoi `wingTipL` se lirait
 * « aile » suivie d'un reste incompréhensible. Même piège que la table des mots de région dans
 * skeleton-map.js, et il est ici épinglé par un test.
 */
const SEGMENTS_3D = [
  ['wingTip', ['Wing tip', 'Bout d\'aile'], 'm'],
  ['shoulder', ['Shoulder', 'Épaule'], 'f'],
  ['elbow', ['Elbow', 'Coude'], 'm'],
  ['wing', ['Wing', 'Aile'], 'f'],
  ['arm', ['Arm', 'Bras'], 'm'],
  ['knee', ['Knee', 'Genou'], 'm'],
  ['hip', ['Hip', 'Hanche'], 'f'],
  ['head', ['Head', 'Tête'], 'f'],
  ['neck', ['Neck', 'Cou'], 'm'],
  ['tentacle', ['Tentacle', 'Tentacule'], 'm'],
  ['tail', ['Tail', 'Queue'], 'f'],
  ['leg', ['Leg', 'Patte'], 'f'],
];

/**
 * Les segments dont le RANG désigne le MEMBRE, et non la position dans le membre.
 *
 * ⚠️ LE MÊME CHIFFRE NE DIT PAS LA MÊME CHOSE SELON LA CLÉ, et s'en apercevoir en écrivant plutôt
 * qu'à l'usage a évité un écran illisible. `tail0`, `tail1`, `tail2` sont TROIS OS D'UNE MÊME queue :
 * le rang y compte les vertèbres. `hipL0` et `hipL3` sont deux PATTES DIFFÉRENTES d'une araignée :
 * le rang y compte les membres.
 *
 * Sans cette distinction, les huit pattes d'une araignée se seraient repliées dans un seul groupe,
 * et la queue d'un loup en aurait occupé trois.
 */
const RANG_DESIGNE_LE_MEMBRE_3D = new Set(['hip', 'knee', 'tentacle']);

/**
 * Le côté, ACCORDÉ AU GENRE du mot qu'il suit.
 *
 * « Bras droite » et « Genou droite » sont ce que produit une table qui ignore le genre, et c'est la
 * première chose qu'un lecteur francophone voit. L'anglais n'a pas ce problème, ce qui est
 * exactement pourquoi il faut y penser en écrivant plutôt qu'en relisant l'écran : la version
 * anglaise, elle, aurait été juste.
 *
 * `gauche`, `avant` et `arrière` sont invariables, seul `droit` s'accorde.
 */
const COTES_3D = {
  L: { en: 'left', m: 'gauche', f: 'gauche' },
  R: { en: 'right', m: 'droit', f: 'droite' },
};
const AVANT_ARRIERE_3D = { F: ['front', 'avant'], B: ['rear', 'arrière'] };

/**
 * Assemble un libellé DANS LES DEUX LANGUES, puis laisse le traducteur choisir. Fonction PURE.
 *
 * ⚠️ L'ORDRE DES MOTS DIFFÈRE D'UNE LANGUE À L'AUTRE, et c'est la raison d'être de cette fonction.
 * Le français place l'épithète APRÈS le nom, « hanche avant gauche » ; l'anglais AVANT, « front left
 * hip ». Traduire mot à mot en gardant un seul ordre donne « Shoulder left », qui se comprend et qui
 * sonne faux, exactement le genre de détail qu'on ne voit plus une fois qu'il est à l'écran.
 *
 * Le rang reste à la fin dans les deux langues.
 */
function assembler3D({ mot, genre, avant, cote, rang }, t){
  const cotes = cote ? COTES_3D[cote] : null;
  const av = avant ? AVANT_ARRIERE_3D[avant] : null;
  const numero = rang === null || rang === undefined ? [] : [String(rang + 1)];
  const avant2 = [...(av ? [av[0]] : []), ...(cotes ? [cotes.en] : [])];
  // LA MAJUSCULE SUIT LE MOT, PAS LA TABLE. Le nom anglais est écrit capitalisé dans SEGMENTS_3D
  // parce qu'il s'affiche seul la moitié du temps, « Head », « Tail ». Précédé d'une épithète il
  // devient un mot ordinaire, et « left Arm » se lit comme une faute de frappe. On abaisse le nom
  // dès qu'il n'ouvre plus la phrase, puis on capitalise ce qui l'ouvre.
  const nom = avant2.length ? mot[0].charAt(0).toLowerCase() + mot[0].slice(1) : mot[0];
  const en = [...avant2, nom, ...numero].join(' ');
  const fr = [mot[1], ...(av ? [av[1]] : []), ...(cotes ? [cotes[genre] || cotes.f] : []), ...numero].join(' ');
  return t(en.charAt(0).toUpperCase() + en.slice(1), fr);
}

/**
 * Décompose un identifiant d'articulation. Fonction PURE, rend `null` si la forme est inconnue.
 *
 * @returns `{ segment, avant, cote, rang }`, chaque champ pouvant être nul
 */
export function decomposerRole3D(cle){
  const brut = String(cle || '');
  const trouve = SEGMENTS_3D.find(([mot]) => brut.startsWith(mot));
  if (!trouve) return null;
  const reste = brut.slice(trouve[0].length);
  const m = /^(F|B)?(L|R)?(\d+)?$/.exec(reste);
  if (!m) return null;
  return {
    segment: trouve[0],
    avant: m[1] || null,
    cote: m[2] || null,
    rang: m[3] === undefined ? null : Number(m[3]),
  };
}

/**
 * Le libellé d'un rôle, dans la langue courante. Fonction PURE.
 *
 * Un identifiant que la décomposition ne reconnaît pas est rendu TEL QUEL plutôt que traduit en
 * « undefined » : c'est le repli qu'ont déjà les libellés d'articulation du Personnage, et il rend
 * l'écran lisible même quand on vient d'ajouter une clé d'une forme nouvelle.
 *
 * ⚠️ LE RANG EST AFFICHÉ +1. `tail0`, `tail1`, `tail2` sont trois os de queue et se lisent
 * « Queue 1 » à « Queue 3 » : l'identifiant compte à partir de zéro parce que c'est un indice, le
 * libellé compte à partir de un parce que c'est ce qu'on montre à quelqu'un. Un « Queue 0 » à
 * l'écran ferait chercher une queue numéro 1 qui n'existe pas.
 */
export function libelleDeRole3D(cle, traduire, avantUtile = true){
  const t = traduire || ((en) => en);
  const d = decomposerRole3D(cle);
  if (!d) return String(cle || '');
  const entree = SEGMENTS_3D.find(([m]) => m === d.segment);
  return assembler3D({
    mot: entree[1], genre: entree[2],
    avant: avantUtile ? d.avant : null, cote: d.cote, rang: d.rang,
  }, t);
}

/**
 * Le libellé COURT d'un rôle : ce qu'on écrit sur une ligne rangée SOUS son membre. Fonction PURE.
 *
 * « Hanche avant gauche » sous un groupe intitulé « Patte avant gauche » dit trois fois la même
 * chose. Le côté et l'avant appartiennent au MEMBRE, la ligne ne porte que le segment.
 *
 * ⚠️ C'EST DÉJÀ LA RÈGLE DES EMPLACEMENTS HUMANOÏDES, et c'est ce test qui me l'a apprise :
 * `slotLabel` rend « Avant-bras » sans côté, avec pour commentaire « le groupe le porte déjà ». Ma
 * première version répétait le côté sur chaque ligne pour les animaux et pas pour les humanoïdes,
 * c'est-à-dire deux mises en page pour un seul écran, exactement ce que l'unification de #378 doit
 * supprimer.
 *
 * Le rang RESTE quand il numérote le segment, `tail0..2` sont trois lignes d'une même queue et
 * doivent se distinguer ; il part quand il numérote le membre, le groupe le porte alors.
 */
export function libelleCourtDeRole3D(cle, traduire){
  const t = traduire || ((en) => en);
  const d = decomposerRole3D(cle);
  if (!d) return String(cle || '');
  const entree = SEGMENTS_3D.find(([m]) => m === d.segment);
  const parMembre = RANG_DESIGNE_LE_MEMBRE_3D.has(d.segment) && d.rang !== null;
  return assembler3D({
    mot: entree[1], genre: entree[2], avant: null, cote: null, rang: parMembre ? null : d.rang,
  }, t);
}

/**
 * Le MEMBRE auquel un rôle appartient : sa clé de groupe, et son libellé. Fonction PURE.
 *
 * Deux rôles du même membre partagent ce groupe, `hipFL` et `kneeFL` sont « la patte avant gauche ».
 * C'est ce qui permet à l'écran de replier ses lignes comme il replie déjà les emplacements
 * humanoïdes, sans qu'une seconde table décrive les regroupements.
 */
export function membreDuRole3D(cle, traduire, avantUtile = true){
  const t = traduire || ((en) => en);
  const d = decomposerRole3D(cle);
  if (!d) return { cle: String(cle || ''), label: String(cle || '') };
  const famille = MEMBRE_PAR_SEGMENT_3D[d.segment] || d.segment;
  const parMembre = RANG_DESIGNE_LE_MEMBRE_3D.has(d.segment) && d.rang !== null;
  // LA CLÉ DE GROUPE GARDE L'AVANT, même quand le libellé le tait : deux membres distincts ne
  // doivent jamais partager un groupe, sous peine de replier ensemble des rôles qui n'ont rien à
  // voir. On tait un mot inutile, on ne fusionne pas des membres.
  const suffixe = (d.avant || '') + (d.cote || '') + (parMembre ? d.rang : '');
  const entree = SEGMENTS_3D.find(([m]) => m === famille);
  const label = assembler3D({
    mot: entree[1], genre: entree[2],
    avant: avantUtile ? d.avant : null, cote: d.cote, rang: parMembre ? d.rang : null,
  }, t);
  return { cle: famille + suffixe, label };
}

/**
 * À quel membre appartient chaque segment. La seule table de ce fichier qui ne se dérive pas.
 *
 * Elle tient en six lignes parce que c'est de l'anatomie et non de la syntaxe : rien dans la chaîne
 * `elbow` ne dit qu'un coude appartient à un bras. `head` et `neck` visent le TRONC, qui n'est pas
 * un membre mais qui doit être un groupe pour que l'écran ait où les ranger.
 */
const MEMBRE_PAR_SEGMENT_3D = {
  hip: 'leg', knee: 'leg', tentacle: 'tentacle',
  shoulder: 'arm', elbow: 'arm',
  wing: 'wing', wingTip: 'wing',
  head: 'head', neck: 'head',
  tail: 'tail',
};

/**
 * Tous les identifiants d'articulation des animaux d'un archétype, dans l'ordre de leur table.
 * Union et non intersection, cf. l'en-tête.
 */
function rolesDesAnimaux3D(archetype){
  const vus = [];
  Object.entries(ANIMAL_ARCHETYPES_3D)
    .filter(([, cle]) => cle === archetype)
    .forEach(([animal]) => {
      (ANIMAL_JOINT_DEFS[animal] || []).forEach(groupe => {
        groupe.joints.forEach(j => { if (!vus.includes(j.id)) vus.push(j.id); });
      });
    });
  return vus;
}

/**
 * L'ordre d'AFFICHAGE des membres, du tronc vers les extrémités.
 *
 * Il ne peut pas se dériver de `ANIMAL_JOINT_DEFS`, dont l'ordre est celui de son écriture et
 * diffère d'un animal à l'autre : sur `quadrupede`, l'union prise dans l'ordre des tables met `neck`
 * APRÈS la queue, parce que seul le loup le porte et qu'il vient en second. Deux ordres pour deux
 * métiers, exactement comme `SLOTS` et `SLOT_GROUPS` : l'un suit la reconnaissance, l'autre
 * l'anatomie.
 */
const ORDRE_MEMBRES_3D = ['head', 'arm', 'wing', 'leg', 'tentacle', 'tail'];
const ORDRE_SEGMENTS_3D = ['head', 'neck', 'shoulder', 'elbow', 'wing', 'wingTip', 'hip', 'knee', 'tentacle', 'tail'];

function rangDeMembre3D(cle){
  const d = decomposerRole3D(cle);
  if (!d) return [ORDRE_MEMBRES_3D.length, 0, 0, 0];
  const famille = MEMBRE_PAR_SEGMENT_3D[d.segment] || d.segment;
  return [
    ORDRE_MEMBRES_3D.indexOf(famille),
    d.avant === 'B' ? 1 : 0,
    d.cote === 'R' ? 1 : 0,
    ORDRE_SEGMENTS_3D.indexOf(d.segment) * 100 + (d.rang || 0),
  ];
}

/**
 * Combien de paires latérales l'archétype `arachnide` déclare, et pourquoi ce nombre-là.
 *
 * QUATRE PAIRES, décision de l'utilisateur : « arachnide pourrait avoir une liste fixe si on se
 * limite aux pattes, éventuellement à une queue pour les scorpions ». Une araignée en a huit, et
 * c'est le seul arachnide du corpus.
 *
 * ⚠️ CE CHIFFRE NE REPOSE QUE SUR UN EXEMPLE, et le corpus ne contient aucun scorpion : la queue est
 * là par anticipation, pas par mesure. Consigné tel quel dans docs/en/archetype-roles.md.
 */
const PAIRES_ARACHNIDE_3D = 4;

/**
 * Les rôles d'un archétype. Fonction PURE, et le point d'entrée de tout ce fichier.
 *
 * @param archetype une clé d'`ARCHETYPES_3D`
 * @param {{chaines?: number}} [options] pour les archétypes NUMÉROTÉS, combien de membres le fichier
 *        porte réellement. Ignoré par les autres.
 * @returns `[{ cle, label, membre, membreLabel }]`, dans l'ordre d'affichage
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * TROIS FAMILLES D'ARCHÉTYPES, ET UNE LISTE VIDE N'EST PAS UN OUBLI
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * — DÉRIVÉS d'un animal intégré : `quadrupede`, `bipede_aile`, `quadrupede_aile`, `bipede_queue` ;
 * — DÉCLARÉS ici : `humanoide`, qui EST la liste des dix-huit emplacements, et `arachnide`, dont
 *   l'utilisateur a fixé la forme, quatre paires de pattes plus une queue ;
 * — NUMÉROTÉS : `radial`, dont les membres sont permutables. Le critère n'est pas le nombre, c'est
 *   la permutabilité : la troisième tentacule d'un kraken vaut la quatrième, alors que les pattes
 *   avant d'une araignée ne font pas le geste de ses pattes arrière.
 *
 * `serpentin`, `centaure` et `complexe` rendent une liste VIDE, et c'est mesuré, pas oublié. Un
 * serpent n'a aucun membre. `complexe` porte des poses attachées au FICHIER, pas à l'archétype,
 * décision de l'utilisateur. Le centaure n'a pas de liste parce que rien ne dit lequel de ses six
 * membres est un bras et lequel est une patte avant, alors que trois centaures sont dans le corpus :
 * c'est un trou reconnu, pas une omission.
 */
export function rolesDeLArchetype3D(archetype, options, traduire){
  const t = traduire || ((en) => en);
  const cles = clesDeLArchetype3D(archetype, options);
  // ⚠️ « AVANT » NE SE DIT QUE S'IL Y A UN ARRIÈRE. Les pattes d'un bipède portent `hipFL`, dont le
  // `F` veut dire « avant » : c'est un identifiant PERSISTÉ, hérité du singe, et le commentaire de
  // `ANIMAL_JOINT_DEFS` dit déjà qu'il « ne signifie rien pour un bipède ». Le taire à l'affichage
  // coûte une ligne ; en inventer un second jeu de clés coûterait une migration.
  //
  // DÉRIVÉ, PAS DÉCLARÉ : l'archétype a-t-il un membre arrière ? Une table « ces archétypes sont
  // bipèdes » aurait été une énumération de plus à tenir d'accord avec la première.
  const avantUtile = cles.some(c => (decomposerRole3D(c) || {}).avant === 'B');
  return cles.map(cle => {
    if (archetype === 'humanoide') {
      const groupe = SLOT_GROUPS.find(g => g.slots.includes(cle));
      return {
        cle,
        label: slotLabel(cle, t),
        membre: groupe ? groupe.slots.join('+') : cle,
        membreLabel: groupe ? t(groupe.titre[0], groupe.titre[1]) : slotLabel(cle, t),
      };
    }
    const membre = membreDuRole3D(cle, t, avantUtile);
    return {
      cle,
      // DEUX LIBELLÉS, PARCE QU'IL Y A DEUX SITUATIONS. `label` s'écrit sous son groupe, qui porte
      // déjà le côté ; `labelComplet` s'écrit seul, dans une liste de poses où aucun groupe ne le
      // situe (#375). Les dériver tous deux de la clé évite d'avoir à choisir trop tôt.
      label: libelleCourtDeRole3D(cle, t),
      labelComplet: libelleDeRole3D(cle, t, avantUtile),
      membre: membre.cle,
      membreLabel: membre.label,
    };
  });
}

/** Les clés seules, sans libellé : ce que la persistance et les poses manipulent. Fonction PURE. */
export function clesDeLArchetype3D(archetype, options){
  if (archetype === 'humanoide') return [...SLOTS];
  if (archetype === 'arachnide') {
    const pattes = [];
    for (let i = 0; i < PAIRES_ARACHNIDE_3D; i++) {
      // Les paires sont ordonnées de l'AVANT vers l'ARRIÈRE, et c'est ce qui distingue `arachnide`
      // de `radial` : les pattes d'une araignée ne sont pas permutables, la première paire ne fait
      // pas le geste de la quatrième. Le rang porte donc un sens, il n'est pas un simple compteur.
      pattes.push(`hipL${i}`, `kneeL${i}`, `hipR${i}`, `kneeR${i}`);
    }
    return [...pattes, 'tail0'];
  }
  if (archetype === 'centaure') {
    // DEUX BRAS, QUATRE PATTES, UNE QUEUE OPTIONNELLE. Décision de l'utilisateur, et elle découle de
    // sa règle générale : l'archétype définit sa liste, un modèle qui n'y entre pas n'en est pas un.
    // Deux des quatre centaures du corpus n'ont que deux pattes ; le classement les propose
    // `humanoide`, et c'est JUSTE, c'est un défaut du modèle, corrigeable à la main.
    //
    // DÉRIVÉE PAR COMPOSITION, pas écrite à la main : le haut vient du singe, `bipede_queue`, et les
    // quatre pattes du loup, `quadrupede`. Un centaure est exactement cela, un torse d'humanoïde sur
    // un corps de quadrupède. Ajouter une articulation à l'un des deux animaux la propage ici, ce
    // qu'une liste recopiée n'aurait pas fait.
    const haut = rolesDesAnimaux3D('bipede_queue').filter(c => familleDuRole3D(c) !== 'leg');
    const bas = rolesDesAnimaux3D('quadrupede').filter(c => familleDuRole3D(c) === 'leg');
    return trierParAnatomie3D([...new Set([...haut, ...bas])]);
  }
  if (archetype === 'radial') {
    // NUMÉROTÉ, et le nombre vient du FICHIER : un radial n'a pas de compte canonique, le kraken en
    // a huit et le suivant en aura six ou douze. Une pose visant plus de membres que le modèle n'en
    // a pose ceux qui existent, les autres sont sautés, c'est la règle générale des poses.
    const n = Math.max(0, Number((options || {}).chaines) || 0);
    return Array.from({ length: n }, (_, i) => `tentacle${i}`);
  }
  return trierParAnatomie3D(rolesDesAnimaux3D(archetype));
}

/** Range des rôles du tronc vers les extrémités, cf. ORDRE_MEMBRES_3D. Fonction PURE. */
function trierParAnatomie3D(cles){
  return [...cles].sort((a, b) => {
    const ra = rangDeMembre3D(a), rb = rangDeMembre3D(b);
    for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) return ra[i] - rb[i];
    return 0;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// L'ATTRIBUTION : quelle chaîne du fichier tient quel membre de l'archétype.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Du vocabulaire des CHAÎNES à celui des RÔLES.
 *
 * `typeDeChaine3D` lit un nom d'os et rend « patte », « bras », « aile » ; les rôles parlent de
 * `leg`, `arm`, `wing`. Deux vocabulaires nés à deux moments, et cette table est le seul endroit qui
 * les rapproche. `cou` vise `head` parce que le cou appartient au groupe de la tête, exactement
 * comme `neck` chez les animaux intégrés.
 */
const FAMILLE_DE_TYPE_3D = {
  patte: 'leg', bras: 'arm', aile: 'wing', tete: 'head', cou: 'head', queue: 'tail',
  tentacule: 'tentacle',
};

/**
 * Les mots qui désignent un ÉCHAFAUDAGE de rig plutôt qu'un os du corps.
 *
 * ⚠️ CHAQUE MOTIF EST MESURÉ, ET TROIS CANDIDATS ÉVIDENTS ONT ÉTÉ REJETÉS. Le piège est celui de
 * #363, où un motif de côté trop large lisait `ARMature` comme une droite. Comptés sur les 3032 os
 * du corpus :
 *
 *   `root`  166 os dans 15 fichiers, dont `_rootJoint` mais aussi `..._root_bind_jnt`, qui est un
 *           VRAI os de bras chez centaure1. Bien trop large.
 *   `bind`  226 os, `jnt` 130 os : ce sont des CONVENTIONS DE NOMMAGE Maya, pas des échafaudages.
 *           Les écarter supprimerait le squelette entier de centaure1.
 *   `twist` 46 os. Un os de torsion est un vrai morceau de bras, pas une poignée de rig.
 *
 * ⚠️ LE MOTIF D'`IK` A ÉTÉ REPRIS TROIS FOIS, et les deux premiers essais sont instructifs :
 *
 *   1. `IK` précédé ET suivi d'un non-lettre. Attrape 12 os, mais laisse passer `HeadIK`, dont le
 *      `d` qui précède est une lettre. Le dragon gardait donc `HeadIK` comme tête, étiqueté « nom »,
 *      donc replié : un membre FAUX présenté comme sûr.
 *   2. `IK` non suivi d'une minuscule. Attrape les 13, zéro contre-exemple dans le corpus. Rejeté
 *      quand même : il lit `SPIKE_01` et `STRIKE_L` comme des échafaudages, et « aucun
 *      contre-exemple dans le corpus » est exactement le raisonnement qui a fait accepter un motif
 *      de côté trop large en #363.
 *   3. `IK` touchant un BORD de mot, d'un côté ou de l'autre. Attrape les mêmes 13, et rejette
 *      `SPIKE`, `STRIKE`, `VIKING` par construction plutôt que par chance.
 *
 * Jamais la sous-chaîne minuscule `ik`, qui vit dans des mots ordinaires comme `Mikael`.
 */
const ECHAFAUDAGES_3D = [
  /(^|[^A-Za-z])IK|IK($|[^A-Za-z])/,
  /Pole/i, /Target/i, /neutral_bone/i, /Socket/i, /Dummy/i,
  /(^|[^A-Za-z])F[Xx]_/,
  /RollControl|RollTarget/i,
];

/** Cet os porte-t-il un mot d'échafaudage ? Fonction PURE. */
export function estEchafaudage3D(nom){
  const n = String(nom || '');
  return ECHAFAUDAGES_3D.some(r => r.test(n));
}

/**
 * Cette chaîne est-elle un échafaudage ? Fonction PURE, décidée sur sa RACINE.
 *
 * ⚠️ LA RACINE, ET NON « TOUS SES OS ». Mesuré, et la différence porte exactement les six chaînes
 * qui ont motivé cette tâche : les quatre pattes `IKBackLegL FFBL` du chien et les deux `Cou` de
 * l'oiseau, dont la racine est un `Neck_Dummy` et la suite un brin musculaire. La règle « tous les
 * os » les gardait, parce que leur second os ne porte aucun mot suspect.
 *
 * ⚠️ MESURE QUI RASSURE : la règle « au moins un os suspect » écarte exactement les MÊMES chaînes
 * que la règle de la racine, 64 sur les 488 du corpus. Aucun échafaudage ne se cache donc au milieu d'une vraie chaîne, et la
 * racine n'est pas un critère arbitrairement étroit, c'est le même critère écrit plus simplement.
 *
 * ⚠️ ÉCARTÉE DES CANDIDATES À UN RÔLE, PAS DES CURSEURS. Un échafaudage reste un os que
 * l'utilisateur peut vouloir tourner, et le retirer de l'écran des membres serait décider à sa
 * place. C'est le contrat de tout ce chantier : on propose, il tranche.
 */
export function chaineEchafaudage3D(osNoms){
  const liste = Array.isArray(osNoms) ? osNoms : [];
  return liste.length > 0 && estEchafaudage3D(liste[0]);
}

/**
 * Le type de chaîne qu'un rôle du TRONC réclame. Deux lignes, et elles ne se dérivent pas.
 *
 * `FAMILLE_DE_TYPE_3D` va du vocabulaire des chaînes vers celui des rôles ; il faut ici l'inverse,
 * et l'inverse d'une table qui écrase (`tete` et `cou` visent tous deux `head`) ne s'obtient pas en
 * la retournant.
 */
const TYPE_DU_SEGMENT_3D = { head: 'tete', neck: 'cou' };

/**
 * Les os du TRONC qui portent un rôle, cherchés PAR LEUR NOM. Fonction PURE.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * POURQUOI LE TRONC EST UN CAS À PART
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * L'attribution cherche une CHAÎNE pour chaque membre. Or la tête n'est pas une chaîne : c'est
 * l'extrémité du TRONC. Les rôles `head` et `neck` ne pouvaient donc presque jamais être attribués.
 * Mesuré avant correction, sur les sept fixtures non humanoïdes : trois têtes sur sept sont sur le
 * tronc, hors d'atteinte ; le cerbère donnait `head` à une de ses TÊTES LATÉRALES ; le dragon le
 * donnait à `HeadIK`, un échafaudage, jusqu'à ce que #379 l'écarte.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * PAR LE NOM, ET NON PAR LA POSITION
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ J'AI ESSAYÉ DEUX RÈGLES POSITIONNELLES, et la mesure les a démenties toutes les deux :
 *
 *   — « les k derniers os du tronc » : le tronc du cerbère finit par un os de QUEUE DE CHEVAL, pas
 *     par sa tête ;
 *   — « les k derniers, pris de la fin » : sur Mixamo le tronc finit par `Head` puis
 *     `HeadTop_End`, ce qui donnerait `neck` = la tête et `head` = le bout du crâne.
 *
 * Le nom, lui, tient : 14 fixtures sur 17 portent un os de tête ou de cou nommé sur leur tronc,
 * `Cabeza` espagnol compris. Le vocabulaire est celui de `typeDeChaine3D`, déjà mesuré, et non une
 * seconde liste de mots.
 *
 * PLUSIEURS CANDIDATS VALENT « structure », pas « nom » : le chien porte CINQ os de cou sur son
 * tronc, et rien ne dit lequel est LE cou. Même règle que pour les chaînes, et c'est elle qui fait
 * déplier le membre plutôt que de replier un choix arbitraire.
 */
export function rolesDuTronc3D(troncNoms, cles){
  const noms = (troncNoms || []).filter(n => typeof n === 'string' && n);
  const sortie = {};
  (cles || []).forEach(cle => {
    const d = decomposerRole3D(cle);
    const type = d ? TYPE_DU_SEGMENT_3D[d.segment] : null;
    if (!type) return;
    const trouves = noms.filter(n => {
      const t = typeDeChaine3D([n]);
      return t && t[0] === type;
    });
    if (trouves.length) sortie[cle] = { nom: trouves[0], origine: trouves.length === 1 ? 'nom' : 'structure' };
  });
  return sortie;
}

/** Le côté d'un membre, dans le vocabulaire des chaînes ('g' / 'd'), ou null. */
function coteDuMembre3D(cleDeRole){
  const d = decomposerRole3D(cleDeRole);
  if (!d || !d.cote) return null;
  return d.cote === 'L' ? 'g' : 'd';
}

/** La famille anatomique d'un membre, depuis la clé d'un de ses rôles. */
function familleDuRole3D(cleDeRole){
  const d = decomposerRole3D(cleDeRole);
  return d ? (MEMBRE_PAR_SEGMENT_3D[d.segment] || d.segment) : null;
}

/**
 * Les chaînes d'un squelette, prêtes à être attribuées. Fonction PURE.
 *
 * @returns `[{ racine, nom, cote, rang, osNoms, famille }]`, `famille` étant nulle quand le nom des
 *          os ne dit rien. Mesuré : c'est le cas de 235 chaînes sur 488 dans le corpus.
 */
export function chainesAttribuables3D(os, membresEnregistres, traduire){
  const t = traduire || ((en) => en);
  const liste = (os || []).filter(o => o && o.id !== undefined);
  const nomDe = new Map(liste.map(o => [o.id, o.name]));
  const lignes = lignesDeCorrespondance3D(liste, membresEnregistres, t);
  const sortie = [];
  lignes.groupes.forEach(g => g.membres.forEach(m => {
    const osNoms = m.segments.map(id => nomDe.get(id)).filter(Boolean);
    const type = typeDeChaine3D(osNoms);
    sortie.push({
      racine: m.racine, nom: m.nom, cote: m.cote, rang: m.rang, retenu: m.retenu, osNoms,
      famille: type ? (FAMILLE_DE_TYPE_3D[type[0]] || null) : null,
      echafaudage: chaineEchafaudage3D(osNoms),
    });
  }));
  return sortie;
}

/**
 * Ce que l'écran de correspondance propose : un MEMBRE par ligne, et la chaîne qui le tient.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * POURQUOI LE MEMBRE ET NON LE RÔLE
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Ma première conception donnait une ligne par RÔLE, avec un menu de tous les os du fichier : sur un
 * cerbère, treize lignes et des menus de quarante-neuf entrées. La mesure a dit autre chose. `hipFL`
 * veut dire « le premier os de la patte avant gauche », et cette patte est une CHAÎNE que la
 * décomposition connaît déjà. Attribuer la chaîne donne tous les rôles du membre d'un coup, dans
 * l'ordre : six lignes, des menus de sept entrées.
 *
 * Le niveau du rôle reste atteignable, replié, pour les fichiers où l'ordre des segments trompe.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * L'HUMANOÏDE PASSE PAR LA RECONNAISSANCE EXISTANTE, ET C'EST DÉLIBÉRÉ
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * `inferSkeletonMap` attribue déjà les dix-huit emplacements, elle est mesurée et éprouvée sur les
 * six fichiers réels. La refaire ici pour l'uniformité aurait été une seconde reconnaissance à côté
 * de la première, c'est-à-dire la faute que ce chantier passe son temps à éviter. L'unification est
 * dans la FORME de l'écran, pas dans la duplication de ce qui marche.
 *
 * @param enregistre `{ os: { role: nomDOs }, membres: [...] }`, les choix humains relus du disque
 * @returns `[{ cle, label, chaine, origine, sur, roles: [{ cle, label, osNom }] }]`
 */
export function propositionDeRoles3D({ os, archetype, carte, enregistre } = {}, traduire){
  const t = traduire || ((en) => en);
  const memoire = enregistre || {};
  const roles = rolesDeLArchetype3D(archetype, { chaines: chainesAttribuables3D(os, memoire.membres, t).length }, t);
  if (!roles.length) return [];

  const membres = [];
  roles.forEach(r => {
    let m = membres.find(x => x.cle === r.membre);
    if (!m) m = membres[membres.push({ cle: r.membre, label: r.membreLabel, roles: [] }) - 1];
    m.roles.push({ cle: r.cle, label: r.label, osNom: null });
  });

  if (archetype === 'humanoide') return depuisLaCarte3D(membres, carte, memoire);
  const lignes = lignesDeCorrespondance3D(os, memoire.membres, t);
  const nomDe = new Map((os || []).filter(o => o && o.id !== undefined).map(o => [o.id, o.name]));
  const tronc = lignes.tronc ? lignes.tronc.segments.map(id => nomDe.get(id)).filter(Boolean) : [];
  return depuisLesChaines3D(membres, chainesAttribuables3D(os, memoire.membres, t), memoire, tronc);
}

/** Cas humanoïde : on RELIT `inferSkeletonMap`, on ne la refait pas. */
function depuisLaCarte3D(membres, carte, memoire){
  const choix = (memoire.os) || {};
  return membres.map(m => {
    const roles = m.roles.map(r => {
      const e = (carte || {})[r.cle];
      return { ...r, osNom: choix[r.cle] || (e && e.name) || null, origine: origineDe3D(r.cle, choix, e) };
    });
    return { ...m, chaine: null, roles, origine: pireOrigine3D(roles), sur: estSur3D(roles) };
  });
}

function origineDe3D(cle, choix, entree){
  if (choix[cle]) return 'manuel';
  if (!entree || entree.bone === undefined) return 'vide';
  return entree.origine || 'structure';
}

/** Cas créature : on attribue une chaîne par membre, et ses segments prennent les rôles dans l'ordre. */
function depuisLesChaines3D(membres, chaines, memoire, tronc){
  const choix = (memoire.os) || {};
  const prises = new Set();
  // LA TÊTE VIENT DU TRONC, PAS D'UNE CHAÎNE, et c'est le seul membre dans ce cas : elle en est
  // l'extrémité, pas une branche. Cf. rolesDuTronc3D pour la mesure qui l'impose.
  const surTronc = rolesDuTronc3D(tronc, membres.flatMap(m => m.roles.map(r => r.cle)));
  // ⚠️ SUR UN QUADRUPÈDE, « BRAS » EST UNE PATTE AVANT. Mesuré sur le cerbère, dont les pattes avant
  // s'appellent `Clavicle`, `UpperArm`, `Forearm` : `typeDeChaine3D` les lit « bras », ce qui est
  // exact au niveau du NOM et faux au niveau de l'anatomie. Sans cette équivalence, ces chaînes ne
  // trouvent aucun membre, et les pattes arrière remplissent les emplacements avant par défaut.
  const familles = (cleDeRole) => {
    const f = familleDuRole3D(cleDeRole);
    if (f !== 'leg') return [f];
    const aDesBras = membres.some(m => familleDuRole3D(m.roles[0].cle) === 'arm');
    return aDesBras ? ['leg'] : ['leg', 'arm'];
  };
  // LE NOM D'ABORD, POUR TOUS LES MEMBRES, ensuite seulement le repli par côté. Attribuer membre par
  // membre en essayant les deux à chaque fois laisserait le premier membre voler par sa règle faible
  // une chaîne que le second aurait réclamée par son nom. Deux passes, et l'ordre des membres cesse
  // de décider à la place du fichier.
  const parNom = new Map(), ambigus = new Set();
  membres.forEach(m => {
    const fam = familles(m.roles[0].cle);
    const cote = coteDuMembre3D(m.roles[0].cle);
    const candidats = chaines.filter(x => !prises.has(x.racine) && x.retenu !== false && !x.echafaudage
      && fam.includes(x.famille) && (cote === null || x.cote === cote));
    if (!candidats.length) return;
    // ⚠️ UNE ATTRIBUTION AMBIGUË N'EST PAS UNE ATTRIBUTION SÛRE, et cette distinction est ce qui
    // rend la règle de repli utilisable. Deux chaînes du même côté et de la même famille se
    // disputent le membre : le fichier ne dit pas laquelle, et rien ici ne le sait.
    //
    // MESURÉ, ET C'EST LE CAS LE PLUS FRÉQUENT. Sur le cerbère, `head` est réclamé par ses DEUX
    // têtes latérales, la vraie étant sur le tronc. Sur le chien, quatre chaînes réclament `patte`
    // de chaque côté, dont des échafaudages `IKBackLegL`. Une première version prenait la première
    // venue et l'étiquetait « nom » : elle repliait donc un membre faux, ce qui est exactement le
    // défaut des dix-huit emplacements sur un cerbère, réintroduit à l'échelle des rôles.
    //
    // ⚠️ AVANT ET ARRIÈRE NE SE DISTINGUENT PAS ENCORE. `typeDeChaine3D` rend « patte » sans dire
    // laquelle, et l'ordre des ancres le long du tronc pourrait le dire, mais ce n'est PAS mesuré.
    // Les quatre pattes d'un quadrupède sortent donc ambiguës, donc dépliées : l'utilisateur voit
    // le problème au lieu de le subir.
    const avantEtArriere = membres.some(x => (decomposerRole3D(x.roles[0].cle) || {}).avant === 'B')
      && familleDuRole3D(m.roles[0].cle) === 'leg';
    prises.add(candidats[0].racine);
    parNom.set(m.cle, candidats[0]);
    if (candidats.length > 1 || avantEtArriere) ambigus.add(m.cle);
  });
  return membres.map(m => {
    const cote = coteDuMembre3D(m.roles[0].cle);
    const manuel = m.roles.map(r => choix[r.cle]).find(Boolean);
    let chaine = parNom.get(m.cle) || null;
    let origine = chaine ? (ambigus.has(m.cle) ? 'structure' : 'nom') : 'vide';
    if (manuel) {
      const c = chaines.find(x => x.osNoms.includes(manuel));
      if (c) { chaine = c; origine = 'manuel'; }
    } else if (!chaine) {
      const c = chaines.find(x => !prises.has(x.racine) && x.retenu !== false && !x.echafaudage
        && (cote === null || x.cote === cote));
      if (c) { prises.add(c.racine); chaine = c; origine = 'structure'; }
    }
    // LES SEGMENTS PRENNENT LES RÔLES DANS L'ORDRE, de la racine vers l'extrémité. Une chaîne plus
    // longue que la liste de rôles laisse ses derniers os sans rôle, ce qui est exact : une patte de
    // chien importé a six os, l'archétype quadrupède n'en nomme que deux.
    // TROIS SOURCES, ET L'ORDRE EST CELUI DE LA CERTITUDE : le choix humain, puis le TRONC, puis la
    // chaîne. Elles se composent RÔLE PAR RÔLE, pas membre par membre.
    //
    // ⚠️ UNE PREMIÈRE VERSION CHOISISSAIT UNE SOURCE POUR TOUT LE MEMBRE, et le chien y perdait sa
    // tête : son tronc nomme cinq os de cou mais aucune tête, alors que son `Head_1` EST une
    // chaîne. Prendre le tronc pour le membre entier vidait donc le rôle `head`. Les deux sources ne
    // visent pas le même genre d'os, elles se complètent au lieu de se disputer.
    const roles = m.roles.map((r, i) => {
      if (choix[r.cle]) return { ...r, osNom: choix[r.cle], origine: 'manuel' };
      if (surTronc[r.cle]) return { ...r, osNom: surTronc[r.cle].nom, origine: surTronc[r.cle].origine };
      const osNom = chaine ? (chaine.osNoms[i] || null) : null;
      return { ...r, osNom, origine: osNom ? origine : 'vide' };
    });
    return { ...m, chaine, roles, origine: pireOrigine3D(roles), sur: estSur3D(roles) };
  });
}

/**
 * Ce membre est-il SÛR, c'est-à-dire replié à l'ouverture ? Fonction PURE.
 *
 * ⚠️ LA RÈGLE NE PARLE PAS D'ARCHÉTYPE, et c'est l'utilisateur qui l'a redressée. Je proposais de
 * déplier selon la morphologie, humanoïde ouvert, créature repliée. Sa règle est meilleure : on
 * déplie ce qui demande une DÉCISION, pas ce qui appartient à une catégorie. Une araignée dont les
 * huit pattes ont été nommées à la main se replie donc comme un humanoïde bien rangé, alors que ma
 * version l'aurait gardée ouverte à vie.
 *
 * Mesuré sur les dix humanoïdes du corpus, membres dépliés sur cinq : vrm 0, unreal 1, mixamo,
 * maison, vroid-alt et centaure 2, oiseau 3, cerbère, centaur1 et raptor 5. Le raptor est à 100 %
 * de « structure », il s'ouvre en entier, ce qui est juste.
 *
 * « votre choix » COMPTE COMME SÛR : un os choisi à la main est une décision prise, la redemander à
 * chaque ouverture reviendrait à ne pas l'avoir enregistrée.
 */
export function estSur3D(roles){
  return (roles || []).every(r => r.origine === 'nom' || r.origine === 'manuel');
}

/** L'origine la MOINS sûre parmi les rôles d'un membre : c'est elle que l'étiquette affiche. */
function pireOrigine3D(roles){
  const rang = { manuel: 0, nom: 1, structure: 2, vide: 3 };
  return (roles || []).reduce((pire, r) => (rang[r.origine] > rang[pire] ? r.origine : pire), 'manuel');
}
