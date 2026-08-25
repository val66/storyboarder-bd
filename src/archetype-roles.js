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
 * pas de `labelEn`. Le panneau des Animaux s'affiche donc en français même en anglais, ce qui est un
 * défaut existant et pas le sujet ici.
 *
 * Plutôt que d'y ajouter 61 traductions, ou pire d'en recopier une partie ici, le libellé se
 * DÉCOMPOSE depuis l'identifiant : `hipFL` se lit `hip` + `F` + `L`. Les vingt-et-une clés du dépôt
 * suivent cette forme sans exception. Conséquence recherchée : ajouter une articulation à un animal
 * lui donne son libellé dans les deux langues sans toucher à ce fichier.
 */

import { ANIMAL_JOINT_DEFS, ANIMAL_ARCHETYPES_3D } from './constants.js';
import { SLOTS, SLOT_GROUPS, slotLabel } from './skeleton-map.js';

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
  if (archetype === 'radial') {
    // NUMÉROTÉ, et le nombre vient du FICHIER : un radial n'a pas de compte canonique, le kraken en
    // a huit et le suivant en aura six ou douze. Une pose visant plus de membres que le modèle n'en
    // a pose ceux qui existent, les autres sont sautés, c'est la règle générale des poses.
    const n = Math.max(0, Number((options || {}).chaines) || 0);
    return Array.from({ length: n }, (_, i) => `tentacle${i}`);
  }
  const derives = rolesDesAnimaux3D(archetype);
  return derives.sort((a, b) => {
    const ra = rangDeMembre3D(a), rb = rangDeMembre3D(b);
    for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) return ra[i] - rb[i];
    return 0;
  });
}
