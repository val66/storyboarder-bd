/**
 * @file skeleton-map.js
 * Reconnaître un squelette importé : quel os joue quel rôle.
 *
 * LE PROBLÈME, MESURÉ SUR DE VRAIS FICHIERS. glTF décrit un squelette mais ne normalise PAS le nom
 * des os. Deux fichiers réels, tous deux exportés par Sketchfab, n'ont rien en commun :
 *
 *   — convention Unreal (1126 os) : pelvis, spine_01…05, clavicle_l, upperarm_l, lowerarm_l,
 *     thigh_l, calf_l. Les alias usuels la reconnaissent de bout en bout ;
 *   — convention maison (109 os) : Hips, Spine, Chest, Left_shoulder, Left_arm, Left_elbow,
 *     Left_wrist, Left_leg, Left_knee, Left_ankle. Ce rig nomme les os d'après l'ARTICULATION
 *     au-dessus d'eux, pas d'après le segment : « Left_leg » est la CUISSE, « Left_elbow » est
 *     l'AVANT-BRAS.
 *
 * SUR LE SECOND, LA RECHERCHE PAR NOM NE SE CONTENTE PAS D'ÉCHOUER : ELLE SE TROMPE. Elle rangeait
 * « Left_leg » dans l'emplacement du tibia parce que le mot « leg » y figurait. Un os mal attribué
 * est pire qu'un os manquant, le personnage se tord, et rien ne le signale.
 *
 * D'OÙ LE PARTAGE DES RÔLES, qui est l'idée de ce fichier :
 *
 *   — le NOM est fiable pour le CÔTÉ. « Left », « _L », « _l_ » : les trois conventions se
 *     reconnaissent, et les deux fichiers les respectent ;
 *   — la STRUCTURE est fiable pour le SEGMENT. Les deux squelettes ont exactement la même forme,
 *     un bassin d'où partent trois chaînes (deux jambes, une colonne), une poitrine d'où partent
 *     trois chaînes (deux bras, un cou). Cette forme-là ne dépend d'aucune convention de nommage.
 *
 * Chaque proposition porte donc son ORIGINE, 'nom' ou 'structure', et l'interface l'affiche.
 * Après ce qu'on vient de voir, une correspondance automatique silencieuse est inacceptable :
 * l'utilisateur doit pouvoir repérer d'un coup d'œil les lignes que le nom ne confirmait pas.
 *
 * LE PIÈGE DU BRUIT. Le rig Unreal porte des centaines d'os auxiliaires, `FX_`, `_twist_`,
 * `_vol_`, `_end`. Ils s'accrochent partout et fausseraient une descente naïve « premier enfant ».
 * On descend donc toujours par l'enfant dont la descendance est la plus PROFONDE : les auxiliaires
 * sont des culs-de-sac, les membres sont des chaînes.
 *
 * ENTRÉE : une liste d'os neutres `{ id, name, children: [id…] }`. Ni Three, ni glTF, ce qui rend
 * la reconnaissance testable contre des squelettes réels sans décoder un seul octet.
 */

/**
 * Les emplacements reconnus, dans l'ordre d'affichage.
 *
 * PLUS LARGE QUE CE QUE LE RIG INTÉGRÉ SAIT PILOTER AUJOURD'HUI (torse, tête, épaules, coudes,
 * hanches, genoux). La descente structurelle traverse de toute façon le cou, les clavicules, les
 * poignets et les chevilles : les recenser ne coûte rien, et les jeter obligerait à refaire le
 * travail le jour où le rig les gagne. Une correspondance décrit le FICHIER, pas nos capacités du
 * moment.
 */
export const SLOTS = [
  'bassin', 'poitrine', 'cou', 'tete',
  'clavicule_g', 'bras_g', 'avantbras_g', 'main_g',
  'clavicule_d', 'bras_d', 'avantbras_d', 'main_d',
  'cuisse_g', 'jambe_g', 'pied_g',
  'cuisse_d', 'jambe_d', 'pied_d',
];

/**
 * Les emplacements groupés pour l'affichage, avec leur libellé.
 *
 * Dix-huit lignes d'affilée sont illisibles ; groupées par membre, elles se parcourent. L'ordre est
 * anatomique, du tronc vers les extrémités, gauche avant droite, et non celui de SLOTS, qui suit
 * l'ordre de reconnaissance. Deux ordres pour deux métiers, et c'est délibéré : mélanger les deux
 * obligerait à réordonner la reconnaissance pour changer l'affichage.
 */
export const SLOT_GROUPS = [
  { titre: ['Torso', 'Tronc'], slots: ['bassin', 'poitrine', 'cou', 'tete'] },
  { titre: ['Left arm', 'Bras gauche'], slots: ['clavicule_g', 'bras_g', 'avantbras_g', 'main_g'] },
  { titre: ['Right arm', 'Bras droit'], slots: ['clavicule_d', 'bras_d', 'avantbras_d', 'main_d'] },
  { titre: ['Left leg', 'Jambe gauche'], slots: ['cuisse_g', 'jambe_g', 'pied_g'] },
  { titre: ['Right leg', 'Jambe droite'], slots: ['cuisse_d', 'jambe_d', 'pied_d'] },
];

/** Libellé d'un emplacement, sans son côté, le groupe le porte déjà. */
const LIBELLES = {
  bassin: ['Hips', 'Bassin'], poitrine: ['Chest', 'Poitrine'], cou: ['Neck', 'Cou'], tete: ['Head', 'Tête'],
  clavicule: ['Collarbone', 'Clavicule'], bras: ['Upper arm', 'Bras'],
  avantbras: ['Forearm', 'Avant-bras'], main: ['Hand', 'Main'],
  cuisse: ['Thigh', 'Cuisse'], jambe: ['Shin', 'Genou'], pied: ['Foot', 'Pied'],
};

/** @param {string} slot @param {(en:string,fr:string)=>string} traduire */
export function slotLabel(slot, traduire){
  const t = traduire || ((en) => en);
  const base = String(slot || '').replace(/_[gd]$/, '');
  const paire = LIBELLES[base];
  return paire ? t(paire[0], paire[1]) : String(slot || '');
}

/**
 * Extrait la liste d'os NEUTRE d'une scène Three décodée.
 *
 * Ne lit que des propriétés génériques, `isBone`, `uuid`, `name`, `children`, pour que la
 * reconnaissance reste testable contre des squelettes de fixture, sans Three ni WebGL. C'est ce qui
 * permet à tests/skeleton-map.test.mjs d'éprouver cinq rigs réels sans décoder un seul octet.
 */
export function bonesFromObject3D(racine){
  const os = [];
  const vus = new Set();
  const marcher = (n) => {
    if (!n) return;
    if (n.isBone && !vus.has(n.uuid)) {
      vus.add(n.uuid);
      os.push({ id: n.uuid, name: n.name || '', children: (n.children || []).filter(c => c && c.isBone).map(c => c.uuid) });
    }
    (n.children || []).forEach(marcher);
  };
  marcher(racine);
  return os;
}

/** Alias de noms, par emplacement. Utilisés seulement pour CONFIRMER ce que la structure propose. */
const ALIAS = {
  bassin:      ['hips', 'pelvis', 'bassin'],
  poitrine:    ['chest', 'spine02', 'spine2', 'spine03', 'spine3', 'upperchest', 'torso'],
  cou:         ['neck'],
  tete:        ['head'],
  clavicule_g: ['clavicle', 'shoulder', 'collar'], clavicule_d: ['clavicle', 'shoulder', 'collar'],
  bras_g:      ['upperarm', 'arm'],                bras_d:      ['upperarm', 'arm'],
  avantbras_g: ['forearm', 'lowerarm', 'elbow'],   avantbras_d: ['forearm', 'lowerarm', 'elbow'],
  main_g:      ['hand', 'wrist'],                  main_d:      ['hand', 'wrist'],
  cuisse_g:    ['thigh', 'upleg', 'upperleg'],     cuisse_d:    ['thigh', 'upleg', 'upperleg'],
  jambe_g:     ['calf', 'shin', 'lowerleg', 'knee'], jambe_d:   ['calf', 'shin', 'lowerleg', 'knee'],
  pied_g:      ['foot', 'ankle'],                  pied_d:      ['foot', 'ankle'],
};

/** « mixamorig:LeftForeArm » → « leftforearm ». Préfixe de rig retiré, ponctuation aussi. */
export function normaliserNom(nom){
  return String(nom || '').toLowerCase().replace(/^.*:/, '').replace(/[^a-z0-9]/g, '');
}

/**
 * Un mot de membre collé derrière une majuscule L ou R : la convention du rig CAT de 3ds Max.
 *
 * SE LIT SUR LE NOM BRUT, PAS SUR LE NOM EN MINUSCULES, seul motif du fichier dans ce cas. C'est
 * la MAJUSCULE qui distingue le côté du reste du mot : `CATRigLLeg1` est une patte gauche,
 * `catriglleg1` n'est plus rien de lisible. Les cinq autres conventions s'appuient sur un
 * séparateur ou sur un chiffre, qui survivent au passage en minuscules ; celle-ci n'a que la casse.
 *
 * POURQUOI UNE LISTE DE MOTS ET NON `[LR][A-Z][a-z]`, QUI MESURE PAREIL. Le motif générique donne
 * exactement le même résultat sur le corpus, +57 côtés et 0 conflit sur 2866 os. Il a pourtant été
 * écarté, parce qu'il ne doit ce score qu'à l'absence de contre-exemples : il lit `ARMature` comme
 * une droite, `CTRLRoot` comme une gauche, `MASTERControl` comme une droite. Aucun de ces noms
 * n'est dans les 21 modèles, tous sont plausibles dans le prochain. Un critère qui ne tient que
 * parce que ses contre-exemples manquent n'est pas un critère.
 *
 * `(?![a-z])` ferme le mot : sans lui, `LEarring` (une boucle d'oreille) passerait pour une
 * oreille gauche.
 *
 * PAS D'ANCRE DE DÉBUT, ET C'EST UNE CORRECTION. Ce motif exigeait d'abord que la lettre soit en
 * tête ou après un séparateur, avec une exception pour `CATRig`. La campagne de mutation a montré
 * que retirer l'ancre ne fait échouer aucun test ; en cherchant pourquoi, il est apparu qu'elle
 * était NUISIBLE, pas seulement inutile : elle refusait `SPRLArm`, `FLLeg` et `RigLWing`, dont le
 * côté est parfaitement lisible. Le besoin même d'une exception pour `CATRig` disait que l'ancre
 * faisait le mauvais travail. Ce qui porte la garde, c'est la liste de mots plus la casse.
 */
const COTE_MOT_COLLE = /([LR])(?:Leg|Arm|Hand|Foot|Finger|Toe|Thigh|Calf|Shin|Wing|Ear|Eye|Shoulder|Clavicle|Elbow|Wrist|Knee|Ankle|Palm|Tentacle)(?![a-z])/;

/**
 * Le côté d'un os d'après son nom : 'g', 'd' ou null.
 *
 * Le nom est fiable POUR ÇA, et seulement pour ça. HUIT conventions cohabitent, « Left… »,
 * « …_L », « L_… », « l101 », « Bone_L001 », le `.L` de Blender nettoyé par Three, et la majuscule
 * collée du rig CAT. Le piège : un os nommé « leg » contient un
 * « l » sans être à gauche, d'où des motifs ancrés plutôt qu'une recherche de lettre.
 */
export function coteDuNom(nom){
  const brut = String(nom || '').toLowerCase().replace(/^.*:/, '');
  if (/left/.test(brut)) return 'g';
  if (/right/.test(brut)) return 'd';
  if (/[._\- ]l$|^l[._\- ]|[._\- ]l[._\- ]/.test(brut)) return 'g';
  if (/[._\- ]r$|^r[._\- ]|[._\- ]r[._\- ]/.test(brut)) return 'd';
  // LETTRE PUIS CHIFFRE, sans séparateur : `l101`, `r301`. Convention mesurée sur un rig Maya de
  // kraken, dont les huit tentacules s'appellent l101 à l401 et r101 à r401. Sans ce motif, aucun
  // côté n'était lu, donc aucune paire latérale, donc zéro emplacement reconnu sur 47 os.
  //
  // LE CHIFFRE EST LA GARDE, et il n'est pas décoratif : exiger `^l` seul rangerait `leg`, `lower`,
  // `lip` du côté gauche, et `root`, `rib`, `ring` du côté droit. Une lettre suivie d'un chiffre ne
  // peut pas être un mot. Vérifié sur les dix-huit squelettes du corpus : ce motif ne change le
  // verdict d'aucun autre fichier.
  if (/^l\d/.test(brut)) return 'g';
  if (/^r\d/.test(brut)) return 'd';
  // La même chose PRÉCÉDÉE D'UN SÉPARATEUR : `Bone_L.001` devient `Bone_L001` une fois nettoyé par
  // Three, et le chiffre y joue exactement le même rôle de garde qu'au-dessus.
  if (/[._\- ]l\d/.test(brut)) return 'g';
  if (/[._\- ]r\d/.test(brut)) return 'd';
  // LE `.L` DE BLENDER, UNE FOIS NETTOYÉ PAR THREE. Se lit sur le nom BRUT, la casse portant ici
  // toute l'information, comme pour la convention CAT juste en dessous.
  //
  // POURQUOI CE MOTIF EXISTE, ET C'EST UN DÉFAUT SIGNALÉ À L'USAGE. Three supprime `. : / [ ]` des
  // noms de nœuds au décodage (`PropertyBinding.sanitizeNodeName`). `Ear1.L_5` arrive donc sous la
  // forme `Ear1L_5`, où plus aucun séparateur ne précède le `L` : les conventions ci-dessus n'y
  // voyaient RIEN. Le chien, le dragon et le raptor tombaient à ZÉRO membre latéral et étaient
  // classés « serpentin », alors que les fixtures, extraites du JSON brut, les donnaient justes.
  //
  // LA GARDE EST DOUBLE, et les deux moitiés comptent. La lettre doit SUIVRE une minuscule ou un
  // chiffre, ce qui écarte `MODEL_root`, `CTRL_x`, `ROOT_L` et tous les mots en capitales ; et elle
  // doit PRÉCÉDER un souligné, un chiffre ou la fin, ce qui écarte `PELVIS`. Mesuré sur les 3032 os
  // du corpus nettoyé : +408 côtés lus, 0 conflit.
  const blender = /[a-z0-9]([LR])(?=_|\d|$)/.exec(String(nom || ''));
  if (blender) return blender[1] === 'L' ? 'g' : 'd';

  // EN DERNIER, ET SUR LE NOM BRUT. Dernier parce que c'est la convention la moins sûre des six :
  // elle ne doit se prononcer que là où aucune autre n'a rien lu, jamais contredire un « Left »
  // explicite. Sur le nom brut parce que `toLowerCase()` détruit la seule information qu'elle a.
  const colle = COTE_MOT_COLLE.exec(String(nom || ''));
  if (colle) return colle[1] === 'L' ? 'g' : 'd';
  return null;
}

/** Indexe les os par id, et calcule parents + profondeur de descendance. */
function indexer(os){
  const parId = new Map(os.map(o => [o.id, o]));
  const parent = new Map();
  os.forEach(o => (o.children || []).forEach(c => { if (parId.has(c)) parent.set(c, o.id); }));

  // Profondeur = longueur de la plus longue chaîne sous cet os. Calculée en remontant depuis les
  // feuilles pour ne pas récurser sur des milliers d'os (le rig Unreal en a 1126).
  const profondeur = new Map();
  const ordre = [...parId.keys()].sort((a, b) => niveau(b) - niveau(a));
  function niveau(id){
    let n = 0, cur = id;
    while (parent.has(cur) && n < 200) { cur = parent.get(cur); n++; }
    return n;
  }
  ordre.forEach(id => {
    const enfants = (parId.get(id).children || []).filter(c => parId.has(c));
    profondeur.set(id, enfants.length ? 1 + Math.max(...enfants.map(c => profondeur.get(c) || 0)) : 0);
  });
  return { parId, parent, profondeur };
}

/**
 * Les branches « sérieuses » d'un os : ses enfants dont la descendance atteint `minProfondeur`.
 *
 * Filtre anti-bruit : le rig Unreal accroche des dizaines d'auxiliaires (`FX_`, `_vol_`, `_twist_`)
 * à chaque articulation ; ils sont courts, les membres sont longs.
 *
 * SA VALEUR EST MAINTENANT MESURÉE, après l'avoir été à tort. Sur les deux premiers squelettes il
 * ne servait à rien, et je l'avais conservé sans justification. Le rig Unreal l'exige : ramené à 1,
 * la poitrine est trouvée quatre vertèbres trop bas et le cou devient `spine_04`. Les auxiliaires
 * courts de ce rig sont exactement ce que ce seuil écarte.
 *
 * Il ne s'applique PAS à la recherche du cou (cf. plus bas) : un cou minimal fait deux os, et le
 * filtre le jetait.
 */
function branches(id, ctx, minProfondeur = 2){
  return ((ctx.parId.get(id) || {}).children || [])
    .filter(c => ctx.parId.has(c) && (ctx.profondeur.get(c) || 0) >= minProfondeur)
    .sort((a, b) => (ctx.profondeur.get(b) || 0) - (ctx.profondeur.get(a) || 0));
}

/** Descend d'un cran en suivant l'enfant le plus profond. Rend null en bout de chaîne. */
function suivant(id, ctx){
  const b = branches(id, ctx, 0);
  return b.length ? b[0] : null;
}

/**
 * Reconnaît un squelette. Fonction PURE.
 *
 * @param {Array<{id:*, name:string, children:Array}>} os
 * @returns {Object} { slot: { bone: id, name, origine: 'nom'|'structure' } | null }
 *
 * La structure propose, le nom confirme. Un emplacement dont le nom corrobore la structure est
 * marqué 'nom', c'est le cas tranquille. Marqué 'structure', il signifie : le nom ne disait pas
 * ça, j'ai suivi la forme du squelette. C'est exactement là que l'utilisateur doit regarder.
 */
export function inferSkeletonMap(os){
  const liste = (os || []).filter(o => o && o.id !== undefined);
  const carte = Object.fromEntries(SLOTS.map(s => [s, null]));
  if (liste.length < 6) return carte;

  const ctx = indexer(liste);
  const racines = liste.filter(o => !ctx.parent.has(o.id));
  if (!racines.length) return carte;

  const taille = (id) => {
    let n = 0; const pile = [id];
    while (pile.length) { const x = pile.pop(); n++; ((ctx.parId.get(x) || {}).children || []).forEach(c => ctx.parId.has(c) && pile.push(c)); }
    return n;
  };

  /**
   * Les branches d'un os. Simple alias local, voir `branches` et son filtre de profondeur.
   *
   * J'AI D'ABORD ÉCRIT ICI UN SEUIL DE TAILLE RELATIF (3 % de la descendance du parent), en
   * croyant que c'était lui qui écartait les chaînes `ik_*` du rig Unreal. La campagne de mutation
   * a démenti : le retirer ne fait échouer aucun test, sur aucun des deux squelettes réels. Ce qui
   * écarte réellement ces chaînes, c'est l'exigence de PAIRE LATÉRALE plus bas, les hiérarchies IK
   * ne portent pas de couple gauche/droite au même niveau, donc la descente les traverse sans
   * s'arrêter. Le seuil a été supprimé : un nombre que j'avais choisi et que rien ne justifiait.
   */
  const substantielles = (id) => branches(id, ctx);

  /**
   * Les deux branches de sens opposés, s'il en existe.
   *
   * C'EST LA RÈGLE QUI PORTE TOUT LE FICHIER. Un couple gauche/droite au même niveau ne se produit
   * qu'aux deux endroits qui nous intéressent : le bassin (les jambes) et la poitrine (les bras).
   * Ni une racine technique, ni une chaîne d'aide à l'animation, ni un accessoire ne présentent
   * cette signature. Elle combine les deux forces mesurées : le NOM pour le côté, la STRUCTURE
   * pour le reste.
   */
  const paireLaterale = (liste2) => {
    const g = liste2.find(c => coteDuNom(ctx.parId.get(c).name) === 'g');
    const d = liste2.find(c => coteDuNom(ctx.parId.get(c).name) === 'd');
    return (g !== undefined && d !== undefined) ? [g, d] : null;
  };

  // ── Le bassin : en descendant depuis la racine la plus fournie, le premier os d'où partent une
  // PAIRE LATÉRALE (les deux jambes) et au moins une autre chaîne substantielle (la colonne).
  let bassin = racines.sort((a, b) => taille(b.id) - taille(a.id))[0].id;
  let garde = 0;
  while (garde++ < 60) {
    const sub = substantielles(bassin);
    if (sub.length >= 3 && paireLaterale(sub)) break;
    const s = suivant(bassin, ctx);
    if (s === null) break;
    bassin = s;
  }
  const sousBassin = substantielles(bassin);
  const jambes = paireLaterale(sousBassin);
  if (!jambes) return carte;
  // La colonne : ce qui reste, le plus fourni. Elle porte les bras ET la tête.
  const colonne = sousBassin.filter(c => !jambes.includes(c)).sort((a, b) => taille(b) - taille(a))[0];
  if (colonne === undefined) return carte;

  const poser = (slot, id) => {
    if (id === null || id === undefined || !ctx.parId.has(id)) return;
    const nom = ctx.parId.get(id).name || '';
    const alias = ALIAS[slot] || [];
    const n = normaliserNom(nom);
    const confirme = alias.some(a => n.includes(a));
    // Un emplacement latéralisé n'est confirmé par le nom que si le CÔTÉ colle aussi. Sinon on
    // reste en 'structure' : le nom n'a rien corroboré.
    const attendu = slot.endsWith('_g') ? 'g' : slot.endsWith('_d') ? 'd' : null;
    const coteOk = !attendu || coteDuNom(nom) === attendu;
    carte[slot] = { bone: id, name: nom, origine: (confirme && coteOk) ? 'nom' : 'structure' };
  };

  poser('bassin', bassin);

  // ── Les jambes : cuisse → genou → pied. Le côté vient du NOM, seul indice fiable pour ça.
  jambes.forEach(racineJambe => {
    const c = coteDuNom(ctx.parId.get(racineJambe).name) || (jambes.indexOf(racineJambe) === 0 ? 'g' : 'd');
    const genou = suivant(racineJambe, ctx);
    const pied = genou === null ? null : suivant(genou, ctx);
    poser(`cuisse_${c}`, racineJambe);
    poser(`jambe_${c}`, genou);
    poser(`pied_${c}`, pied);
  });

  // ── La colonne : on monte jusqu'à la POITRINE, l'os d'où part la PAIRE LATÉRALE des bras.
  let poitrine = colonne, pas = 0, bras = null;
  while (pas++ < 60) {
    bras = paireLaterale(substantielles(poitrine));
    if (bras) break;
    const s = suivant(poitrine, ctx);
    if (s === null) break;
    poitrine = s;
  }
  poser('poitrine', poitrine);
  if (!bras) return carte;

  // Le cou : parmi ce qui reste à la poitrine, la branche SANS côté. Ma première version prenait
  // « la moins fournie des trois », et elle a désigné un accessoire de torse sur le rig maison,
  // qui porte, en plus des bras et du cou, des chaînes décoratives. L'absence de côté distingue le
  // cou d'un membre bien mieux que sa taille, et c'est encore le nom utilisé pour ce qu'il sait
  // faire : dire un côté, ou dire qu'il n'y en a pas.
  // Le cou est cherché SANS le filtre de profondeur, contrairement aux membres. Un cou minimal fait
  // deux os, « Neck » puis « Head », et la spécification VRM ne demande rien de plus. Le filtre,
  // calibré pour écarter les auxiliaires courts des rigs bruités, jetait donc le cou des rigs
  // sobres : mesuré sur un squelette VRM minimal, cou et tête restaient vides. Chercher un couple
  // gauche/droite exige de trier le bruit ; trouver le seul enfant sans côté, non.
  const reste = branches(poitrine, ctx, 0).filter(c => !bras.includes(c));
  const cou = reste.filter(c => coteDuNom(ctx.parId.get(c).name) === null)
    .sort((a, b) => {
      const nomA = normaliserNom(ctx.parId.get(a).name), nomB = normaliserNom(ctx.parId.get(b).name);
      const score = (n) => (/neck|head|cou|tete/.test(n) ? 0 : 1);
      return score(nomA) - score(nomB) || taille(b) - taille(a);
    })[0];
  if (cou !== undefined) {
    poser('cou', cou);
    // La tête est sous le cou, mais pas forcément d'un cran : le rig Unreal enchaîne neck_01 →
    // neck_02 → head. Prendre l'enfant immédiat désignait donc `neck_02` comme tête, flagué
    // 'structure', donc visible, mais faux. On descend tant que le nom dit encore « cou », et on
    // s'arrête au premier qui dit « tête ». Le nom sert ici à AFFINER une chaîne que la structure
    // a déjà trouvée, pas à la deviner : s'il ne dit rien, on retombe sur l'enfant immédiat.
    let tete = suivant(cou, ctx), saut = 0;
    while (tete !== null && saut++ < 6) {
      const n = normaliserNom(ctx.parId.get(tete).name);
      if (n.includes('head')) break;
      if (!n.includes('neck')) break;
      const s = suivant(tete, ctx);
      if (s === null) break;
      tete = s;
    }
    poser('tete', tete);
  }

  // ── Les bras se lisent PAR LA FIN, contrairement aux jambes. La spécification VRM (humanoïde,
  // § « détails ») l'énonce : « les os non obligatoires peuvent être sautés, le parent du bras
  // peut être la poitrine plutôt qu'une clavicule ». Un rig sans clavicule existe donc légalement,
  // et descendre depuis la branche en supposant clavicule → bras → avant-bras → main décalerait
  // TOUT d'un cran, sans qu'aucune règle ne s'en aperçoive.
  //
  // Aucun de mes six squelettes n'est dans ce cas : ils ont tous une clavicule. C'est la
  // documentation qui a révélé le trou, pas les fichiers, et c'est précisément le genre de défaut
  // qui n'apparaît que chez l'utilisateur, sur le premier fichier qui sort de l'échantillon.
  //
  // J'AI D'ABORD VOULU LIRE LA CHAÎNE PAR LA FIN, en reconnaissant la main à l'embranchement des
  // doigts. Mesuré : ça casse sur le rig Unreal, où la clavicule porte trois os `FX_` et passe donc
  // elle-même pour une main. Sur ce rig, l'embranchement ne distingue rien.
  //
  // On descend donc depuis la racine de branche, comme pour les jambes, mais on décide D'ABORD si
  // cette racine est une clavicule. C'est le seul endroit où le nom sert à autre chose qu'un côté,
  // et c'est assumé : l'os en question est OPTIONNEL, donc aucune règle de structure ne peut
  // trancher son absence. Si le nom ne dit rien, on suppose une clavicule, le cas des six
  // squelettes mesurés, et la ligne part en 'structure', donc signalée à l'utilisateur.
  bras.forEach((racineBras, i) => {
    const c = coteDuNom(ctx.parId.get(racineBras).name) || (i === 0 ? 'g' : 'd');
    const nomRacine = normaliserNom(ctx.parId.get(racineBras).name);
    const estBrasDirect = /upperarm|upper_arm|oberarm/.test(nomRacine) && !/clavicle|shoulder|collar/.test(nomRacine);

    const chaine = [racineBras];
    let cur = racineBras, pasBras = 0;
    while (pasBras++ < 4) {
      const s = suivant(cur, ctx);
      if (s === null) break;
      cur = s; chaine.push(cur);
    }
    if (estBrasDirect) {
      // Pas de clavicule : la racine EST le bras. L'emplacement reste vide, ce qui est la vérité.
      poser(`bras_${c}`, chaine[0]);
      poser(`avantbras_${c}`, chaine[1] !== undefined ? chaine[1] : null);
      poser(`main_${c}`, chaine[2] !== undefined ? chaine[2] : null);
    } else {
      poser(`clavicule_${c}`, chaine[0]);
      poser(`bras_${c}`, chaine[1] !== undefined ? chaine[1] : null);
      poser(`avantbras_${c}`, chaine[2] !== undefined ? chaine[2] : null);
      poser(`main_${c}`, chaine[3] !== undefined ? chaine[3] : null);
    }
  });

  return carte;
}

/** Combien d'emplacements sont remplis, et combien le sont sans confirmation par le nom. */
export function resumeCorrespondance(carte){
  const valeurs = SLOTS.map(s => (carte || {})[s]);
  return {
    total: SLOTS.length,
    remplis: valeurs.filter(Boolean).length,
    aVerifier: valeurs.filter(v => v && v.origine === 'structure').length,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Le squelette vu comme un TRONC et des MEMBRES, sans présupposé de morphologie
// ─────────────────────────────────────────────────────────────────────────────
//
// POURQUOI UNE SECONDE LECTURE. `inferSkeletonMap` répond à « où sont les dix-huit os d'un
// humanoïde ». C'est la bonne question pour un humanoïde et une mauvaise pour tout le reste : elle
// n'a pas de case pour une cinquième patte, une aile, une queue, une deuxième tête. Pire, elle
// remplit ses cases avec ce qu'elle trouve, mesuré sur huit créatures réelles (cf.
// tests/skeleton-creatures.test.mjs) : chez un cerbère, `tete` reçoit une patte avant.
//
// Ce qui suit répond à une autre question, sans réponse préétablie : « quelles chaînes ce squelette
// porte-t-il, et où s'accrochent-elles ». Un humanoïde en est un cas particulier.
//
// LA RÈGLE, ET C'EST L'ANCIENNE RETOURNÉE. Le fichier savait déjà que le NOM est fiable pour le
// CÔTÉ et pour lui seul. On en tirait « deux branches de côtés opposés forment une paire de
// membres ». On en tire maintenant le complément, qui vaut partout :
//
//   UNE BRANCHE QUI PORTE UN CÔTÉ EST UN MEMBRE. Une branche qui n'en porte pas continue le tronc,
//   ou en est une annexe (queue, tête).
//
// Vérifiée sur les quatorze squelettes du corpus. Elle traite d'un coup ce que la règle des deux
// paires ratait : les huit pattes de l'araignée, les huit tentacules du kraken, les trois têtes du
// cerbère, et surtout elle mène le tronc jusqu'à la VRAIE tête, parce que la tête est la seule
// continuation sans côté là où la descente « branche la plus profonde » partait dans une patte.

/**
 * Décompose un squelette en un tronc et des membres. Fonction PURE.
 *
 * @param {Array<{id, name, children}>} os la liste d'os neutre, cf. bonesFromObject3D
 * @returns {{ tronc: Array<number>, membres: Array<{ancre, cote, rang, segments}> }}
 *
 * `tronc` va de la racine retenue jusqu'à sa dernière continuation sans côté, tête comprise.
 * `membres` liste chaque chaîne accrochée au tronc, dans l'ordre de la descente :
 *   `ancre`    l'os du tronc d'où elle part ;
 *   `cote`     'g', 'd', ou null pour une annexe (queue, tête surnuméraire) ;
 *   `rang`     le numéro de la paire sur cette ancre, 1 pour la première. Toujours 1 pour une annexe;
 *   `segments` la chaîne d'os, de l'attache vers l'extrémité, en suivant la branche la plus profonde.
 *
 * CE QU'ELLE NE FAIT PAS : nommer. « Patte avant gauche » suppose de savoir où est l'avant, ce que
 * la hiérarchie seule ne dit pas, faute de coordonnées dans la liste d'os neutre. L'ordre de
 * descente du tronc en tient lieu pour l'instant, et c'est à l'appelant d'en faire un libellé.
 */
export function membresDuSquelette3D(os){
  const liste = (os || []).filter(o => o && o.id !== undefined);
  const vide = { tronc: [], membres: [] };
  if (liste.length < 2) return vide;

  const ctx = indexer(liste);
  const racines = liste.filter(o => !ctx.parent.has(o.id));
  if (!racines.length) return vide;

  const taille = (id) => {
    let n = 0; const pile = [id];
    while (pile.length) {
      const x = pile.pop(); n++;
      ((ctx.parId.get(x) || {}).children || []).forEach(c => ctx.parId.has(c) && pile.push(c));
    }
    return n;
  };

  /**
   * Parcourt UNE chaîne, et rend ce qui s'en détache.
   *
   * LA MÊME FONCTION SERT AU TRONC ET À CHAQUE MEMBRE, et c'est tout l'objet de la tâche #368. La
   * version précédente avait deux traitements : une boucle qui descendait le tronc en examinant ses
   * branches, et `chaineDepuis` qui suivait un membre en IGNORANT les siennes. D'où le défaut :
   * un membre qui est lui-même un corps portant des membres était invisible.
   *
   * CE QUE CENTAURE2 A MONTRÉ. `LowerBody1` est une branche de la racine, donc un membre. Elle
   * porte pourtant les quatre pattes du cheval, sabots compris. Elles étaient avalées dans une
   * chaîne de sept os, et neuf os de patte sur douze n'étaient atteints par rien. Ce n'est pas un
   * cas particulier : c'est ce qu'est un centaure.
   *
   * @param {*} debut premier os de la chaîne
   * @param {'g'|'d'|null} coteChaine le côté que porte CETTE chaîne
   * @param {boolean} estTronc le tronc rend ses annexes sans côté (queue, tête) ; un membre non
   */
  const parcourir = (debut, coteChaine, estTronc) => {
    const segments = [];
    const sorties = [];
    let id = debut, garde = 0;

    while (id !== null && id !== undefined && garde++ < 200) {
      segments.push(id);
      const enfants = branches(id, ctx, 0);

      // UN CÔTÉ QUE LA CHAÎNE N'A PAS, voilà ce qui fait un membre, et c'est la règle du fichier
      // généralisée d'un cran. Sur le tronc, qui n'a pas de côté, toute branche latéralisée en est
      // un : c'est l'ancienne règle, mot pour mot. Dans un bras GAUCHE, une branche gauche de plus
      // n'est qu'un doigt, elle continue la chaîne ; mais dans le corps du cheval, qui n'a pas de
      // côté, une branche gauche est bel et bien une patte.
      const etrangers = enfants.filter(c => {
        const k = coteDuNom(ctx.parId.get(c).name);
        return k !== null && k !== coteChaine;
      });
      const gauches = etrangers.filter(c => coteDuNom(ctx.parId.get(c).name) === 'g');
      const droites = etrangers.filter(c => coteDuNom(ctx.parId.get(c).name) === 'd');

      // Les paires, appariées RANG PAR RANG. Une ancre peut en porter plusieurs : le kraken en a
      // quatre sur la sienne, l'araignée une par segment de corps. Zipper les deux listes dans leur
      // ordre d'apparition est le seul appariement disponible, la liste d'os neutre ne portant aucune
      // coordonnée qui permettrait de trier d'avant en arrière.
      const paires = Math.max(gauches.length, droites.length);
      for (let i = 0; i < paires; i++) {
        if (gauches[i] !== undefined) sorties.push({ ancre: id, cote: 'g', rang: i + 1, depart: gauches[i] });
        if (droites[i] !== undefined) sorties.push({ ancre: id, cote: 'd', rang: i + 1, depart: droites[i] });
      }

      const suite = enfants.filter(c => !etrangers.includes(c));
      if (!suite.length) break;

      // LA PLUS FOURNIE DES BRANCHES RESTANTES CONTINUE LA CHAÎNE. C'est ce choix qui mène le tronc
      // jusqu'à la tête : chez le cerbère, `Neck_07` porte deux clavicules (avec côté, donc
      // membres) et `Neck1` (sans côté, donc suite), là où la descente par profondeur partait dans
      // une patte avant.
      //
      // UNE SEULE MESURE, ET C'EST UNE SIMPLIFICATION DUE À LA MUTATION. Le tronc triait par taille
      // de descendance, un membre suivait la branche la plus PROFONDE, héritage de l'ancienne
      // `chaineDepuis`. Intervertir les deux ne fait échouer aucun test : sur les dix-sept
      // squelettes, les deux mesures désignent toujours la même branche. Deux critères qui ne se
      // départagent nulle part sont un critère de trop, et celui du tronc est le seul dont un cas
      // réel justifie le choix.
      const triees = [...suite].sort((a, b) => taille(b) - taille(a));
      // Les branches délaissées ne deviennent des membres QUE sur le tronc : ce sont ses annexes,
      // queue et têtes surnuméraires. Dans un membre, les rendre ferait de chaque doigt d'un
      // humanoïde un membre à part, et passerait le rig Unreal de 222 chaînes à 464. Question
      // distincte de #368, à trancher séparément si elle se pose.
      if (estTronc) triees.slice(1).forEach(c => sorties.push({ ancre: id, cote: coteChaine, rang: 1, depart: c }));
      id = triees[0];
    }
    return { segments, sorties };
  };

  const depart = racines.sort((a, b) => taille(b.id) - taille(a.id))[0].id;
  const { segments: tronc, sorties } = parcourir(depart, null, true);

  // Largeur d'abord : les membres du tronc, puis ce qu'ils portent à leur tour. L'ordre du tronc
  // reste donc en tête, et un membre de second rang suit celui dont il dépend.
  const membres = [];
  const file = [...sorties];
  let tour = 0;
  while (file.length && tour++ < 5000) {
    const s = file.shift();
    const { segments, sorties: enDessous } = parcourir(s.depart, s.cote, false);
    membres.push({ ancre: s.ancre, cote: s.cote, rang: s.rang, segments });
    enDessous.forEach(x => file.push(x));
  }

  return { tronc, membres };
}

/**
 * Découpe un nom d'os en MOTS, casse chameau comprise.
 *
 * POURQUOI CETTE ÉTAPE EXISTE, ET CE QU'ELLE A CORRIGÉ. Le premier jet cherchait les mots avec des
 * `\b` directement dans le nom brut, et manquait la moitié du corpus pour deux raisons opposées :
 * `_` est un caractère de mot pour une expression régulière, donc `L_HEAD` n'a AUCUNE frontière
 * avant « head » ; et la casse chameau n'a pas de séparateur du tout, donc `IKBackLeg` n'en a pas
 * non plus avant « leg ». Les têtes latérales du cerbère et les quatre pattes du chien passaient
 * ainsi à travers.
 *
 * `IKBackLeg.L_45` devient « ik back leg l », `CATRigLLeg1_065` devient « cat rig l leg », et un
 * `\bleg\b` les attrape tous les deux. Les chiffres disparaissent, ils ne portent jamais de sens
 * anatomique.
 */
export function motsDuNomDOs3D(nom){
  return String(nom || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/[^A-Za-z]+/g, ' ')
    .toLowerCase()
    .trim();
}

/**
 * Les mots qui IDENTIFIENT un membre, cherchés dans TOUTE la chaîne.
 *
 * LA PRIORITÉ EST LE CŒUR DE LA TABLE, et elle vient d'une mesure, pas d'une intuition. La chaîne
 * `L_NECK_1 > L_NECK_2 > L_HEAD > L_JAW` du cerbère est une TÊTE, pas un cou : le mot qui dit ce
 * que le membre EST l'emporte sur celui qui nomme l'articulation à sa racine. Sans cette règle, les
 * deux têtes latérales du cerbère s'appelaient « Cou ».
 *
 * LES MOTS DE PATTE SONT ICI, ET C'EST UNE CORRECTION MESURÉE. Ils étaient d'abord rangés dans la
 * table des RÉGIONS, lue à partir de la racine. Le chien nomme ses pattes `BackShoulder >
 * BackUpperLeg > …` : la racine dit « épaule », la chaîne dit « patte ». Quatre pattes sur quatre
 * étaient proposées comme des bras. Un membre se nomme par ce qu'il est, jamais par son attache.
 */
const MOTS_IDENTITE_3D = [
  ['tentacule', /\btentacle\b/, ['Tentacle', 'Tentacule']],
  ['aile', /\bwing\b/, ['Wing', 'Aile']],
  ['tete', /\bhead\b|\bskull\b|\bcabeza\b/, ['Head', 'Tête']],
  ['queue', /\btail\b|\bqueue\b/, ['Tail', 'Queue']],
  ['corne', /\bhorn\b/, ['Horn', 'Corne']],
  ['antenne', /\bantenna\b/, ['Antenna', 'Antenne']],
  ['patte', /\bleg\b|\bthigh\b|\bcalf\b|\bshin\b|\bupleg\b|\bpaw\b|\bhoof\b|\bhorselink\b/, ['Leg', 'Patte']],
];

/**
 * Les mots qui situent une RÉGION, cherchés os par os dans l'ORDRE de la chaîne.
 *
 * L'ordre de la chaîne, donc la racine en premier : c'est son attache qui situe un membre quand
 * aucun mot d'identité ne le nomme. Une chaîne partant d'une main est un doigt, pas un bras.
 *
 * L'ORDRE DES LIGNES COMPTE quand un SEUL nom porte deux mots. `CATRigRArmDigit21` donne « cat rig
 * r arm digit », et les deux motifs y répondent : c'est la position dans cette table qui tranche, et
 * « bras » l'emporte parce qu'un os de doigt nommé d'après le bras qui le porte reste, à ce niveau
 * de lecture, un morceau de bras. Intervertir les deux lignes change le verdict sans rien casser
 * ailleurs, d'où le test qui l'épingle.
 */
const MOTS_REGION_3D = [
  ['patte', /\bfoot\b|\bankle\b|\btoe\b/, ['Leg', 'Patte']],
  ['bras', /\bclavicle\b|\bcollarbone\b|\bshoulder\b|\bupperarm\b|\bforearm\b|\blowerarm\b|\barm\b|\bhand\b|\bwrist\b/, ['Arm', 'Bras']],
  ['doigt', /\bfinger\b|\bdigit\b|\bthumb\b/, ['Finger', 'Doigt']],
  ['oreille', /\bear\b/, ['Ear', 'Oreille']],
  ['oeil', /\beye\b|\beyelid\b|\beyebrow\b|\bbrow\b/, ['Eye', 'Œil']],
  ['machoire', /\bjaw\b|\bmandible\b/, ['Jaw', 'Mâchoire']],
  ['cou', /\bneck\b/, ['Neck', 'Cou']],
  ['meche', /\bhair\b|\bbraid\b|\bponytail\b/, ['Hair strand', 'Mèche']],
  ['poitrine', /\bbreast\b|\btitty\b/, ['Chest', 'Poitrine']],
  ['visage', /\blip\b|\bcheek\b|\bnose\b|\bnostril\b|\btongue\b/, ['Face', 'Visage']],
  ['plume', /\bfeather\b|\bplume\b/, ['Feather', 'Plume']],
  ['vetement', /\bcloth\b|\bskirt\b|\bcape\b|\bcoat\b|\brobe\b|\bbelt\b/, ['Clothing', 'Vêtement']],
  ['accessoire', /\bweapon\b|\bsword\b|\bquiver\b|\barrow\b|\bshield\b|\bbag\b/, ['Accessory', 'Accessoire']],
];

const chercher3D = (table, mots) => {
  for (const entree of table) if (entree[1].test(mots)) return entree;
  return null;
};

/**
 * Un nom PROPOSÉ pour une chaîne d'os, ou `null` quand le fichier ne dit rien.
 *
 * @param {string[]} nomsDOs les noms des os de la chaîne, de la racine vers l'extrémité
 * @param {(en: string, fr: string) => string} [traduire]
 *
 * `null` EST UNE RÉPONSE, ET LA MOITIÉ DE L'HISTOIRE. Mesurée sur le corpus, cette table nomme
 * 51 % des chaînes, et ce n'est pas un dégradé : c'est un interrupteur par fichier. Le cerbère
 * rend 7 chaînes sur 7, le chien 13 sur 17, le dragon 15 sur 18 ; l'araignée, le kraken, le raptor,
 * le serpent et centaure2 rendent ZÉRO. Soit le modeleur a écrit `Thigh` et `Tail`, soit il a
 * écrit `Bone.004_L.001` et `l101`, et aucune astuce ne fera parler le second.
 *
 * CE N'EST QU'UNE PROPOSITION, jamais un verdict. La fonction lit ce que le nom DIT, pas ce que le
 * membre EST : la patte avant du cerbère s'appelle `L Clavicle > L UpperArm > L Forearm`, donc elle
 * est proposée comme « Bras ». C'est la lecture honnête de ce fichier. Corriger en « Patte avant »
 * relève de l'archétype ou de l'utilisateur, pas d'ici.
 */
export function typeDeChaine3D(nomsDOs){
  const mots = (Array.isArray(nomsDOs) ? nomsDOs : []).map(motsDuNomDOs3D);
  if (!mots.length) return null;
  for (const entree of MOTS_IDENTITE_3D) {
    if (mots.some(m => entree[1].test(m))) return entree;
  }
  // UN SEUL PARCOURS, DE LA RACINE VERS L'EXTRÉMITÉ. Il y avait ici un cas particulier pour la
  // racine, suivi de la même boucle sur le reste : la campagne de mutation a montré que le retirer
  // ne fait échouer aucun test, et pour cause, les deux formes sont strictement équivalentes. Du
  // code en double qui donnait à croire à une règle supplémentaire.
  for (const m of mots) {
    const trouve = chercher3D(MOTS_REGION_3D, m);
    if (trouve) return trouve;
  }
  return null;
}

/**
 * Le nom PROPOSÉ pour une chaîne, dans la langue de l'interface, ou `null`.
 *
 * @param {string[]} nomsDOs @param {(en:string,fr:string)=>string} [traduire]
 *
 * SÉPARÉE DE `typeDeChaine3D` PARCE QUE LE CLASSEMENT NE DOIT PAS LIRE DES LIBELLÉS. Première
 * version : `archetypeSuggere3D` comptait les chaînes en comparant à « Patte » et « Bras ». Sans
 * traducteur la fonction rend l'anglais, donc le compte était toujours nul et TOUS les archétypes
 * tombaient dans le repli, 6 fichiers correctement classés sur 17. Un identifiant stable ne se
 * traduit pas ; un libellé, si.
 */
// ⚠️ LA CLÉ DE `typeDeChaine3D` EST JETÉE ICI, et c'est le sujet de la tâche #378 : seul le libellé
// traduit survit, alors que c'est la clé stable qui permettrait à une pose d'archétype de viser une
// chaîne. Mesuré sur le corpus, 253 chaînes sur 488 en ont une. Cf. docs/archetype-roles.md.
export function nomSuggereDeChaine3D(nomsDOs, traduire){
  const t = traduire || ((en) => en);
  const entree = typeDeChaine3D(nomsDOs);
  return entree ? t(entree[2][0], entree[2][1]) : null;
}

/**
 * La SIGNATURE structurelle d'un squelette décomposé. Fonction PURE.
 *
 * @param {{tronc: Array, membres: Array}} decomposition la sortie de membresDuSquelette3D
 * @returns {{lateraux, ancres, rangMax, ancresSuccessives, paires}}
 *
 * Ces cinq nombres sont tout ce que la STRUCTURE dit d'une morphologie, et c'est peu. Ils sont
 * séparés du classement pour une raison précise : ils se mesurent et se lisent, alors que le
 * classement les interprète. Un test peut donc épingler ce que le corpus donne, indépendamment de
 * la règle qui s'en sert.
 */
export function signatureDuSquelette3D(decomposition){
  const { tronc = [], membres = [] } = decomposition || {};
  const surTronc = membres.filter(m => m.cote && tronc.indexOf(m.ancre) >= 0);
  const parAncre = new Map();
  surTronc.forEach(m => {
    const i = tronc.indexOf(m.ancre);
    if (!parAncre.has(i)) parAncre.set(i, { g: 0, d: 0 });
    parAncre.get(i)[m.cote]++;
  });
  const indices = [...parAncre.keys()].sort((a, b) => a - b);
  const rangs = [...parAncre.values()].map(v => Math.min(v.g, v.d));

  // La plus longue suite d'ancres CONSÉCUTIVES le long du tronc. C'est la signature du corps
  // segmenté : l'araignée en a cinq d'affilée, une par segment.
  let meilleure = 0, courante = 0;
  indices.forEach((v, k) => {
    courante = (k > 0 && v === indices[k - 1] + 1) ? courante + 1 : 1;
    if (courante > meilleure) meilleure = courante;
  });

  return {
    lateraux: membres.filter(m => m.cote).length,
    ancres: indices.length,
    rangMax: rangs.length ? Math.max(...rangs) : 0,
    ancresSuccessives: meilleure,
    paires: rangs.reduce((s, v) => s + v, 0),
  };
}

/**
 * Compte les chaînes par nom proposé : `{ Patte: 4, Bras: 2, … }`. Fonction PURE.
 *
 * NE RETIENT QUE LES CHAÎNES D'AU MOINS TROIS OS, et ce n'est pas un seuil d'importance déguisé :
 * c'est la longueur en dessous de laquelle le corpus ne contient plus que des cils, des lèvres et
 * des paupières, qui portent bien un nom mais ne disent rien de la morphologie. Mesuré : sans ce
 * filtre, le rig Unreal noie le compte sous vingt « Visage » et seize « Œil ».
 */
function comptesParNom3D(os, membres){
  const parId = new Map(os.map(o => [o.id, o]));
  const comptes = {};
  membres.filter(m => m.segments.length >= 3).forEach(m => {
    const entree = typeDeChaine3D(m.segments.map(s => parId.get(s).name));
    if (entree) comptes[entree[0]] = (comptes[entree[0]] || 0) + 1;
  });
  return comptes;
}

/**
 * Propose un archétype de morphologie. Fonction PURE.
 *
 * @param {Array<{id, name, children}>} os la liste d'os neutre
 * @returns {{ cle: string, origine: 'topologie'|'nom'|'structure' }}
 *
 * TROIS ARCHÉTYPES SEULEMENT SE DÉTECTENT, ET LA MESURE LE DIT. Serpentin, radial et segmenté ont
 * chacun une signature que rien d'autre ne présente dans le corpus. Tout le reste est PROPOSÉ, et
 * `origine` le dit à l'interface, qui doit afficher « à confirmer ».
 *
 * ⚠️ L'HUMANOÏDE NE SE DÉTECTE PAS DAVANTAGE, contrairement à ce que le plan affirmait. Mesuré
 * slot par slot, l'oiseau fait aussi bien que `maison` et `vroid-alt` sur les emplacements clés
 * corroborés par le nom, et mieux que le dragon. Le compte d'emplacements ne sépare pas, et
 * prétendre le contraire aurait consacré une erreur de plus.
 *
 * CE QUI CLASSE LE MIEUX, ce sont les NOMS DE CHAÎNES, et c'est mesuré : `Patte:2 Bras:2` pour les
 * cinq humanoïdes, `Patte:4` pour le chien, `Patte:2 Aile:2` pour la wyverne, `Patte:4 Bras:2`
 * pour deux centaures sur trois. Mais ils se trompent aussi : le cerbère nomme ses pattes avant
 * `Clavicle` / `UpperArm`, il sort donc « humanoïde ». D'où `origine: 'nom'`, et le mot
 * « proposé » plutôt que « reconnu ».
 */
export function archetypeSuggere3D(os){
  const liste = (os || []).filter(o => o && o.id !== undefined);
  if (liste.length < 2) return { cle: 'complexe', origine: 'structure' };

  const decomposition = membresDuSquelette3D(liste);
  const s = signatureDuSquelette3D(decomposition);

  // ── Ce que la TOPOLOGIE tranche, sans ambiguïté sur les dix-sept squelettes ──────────────
  //
  // AUCUNE PAIRE LATÉRALE, nulle part. Le serpent est le seul, et il l'est absolument : il n'a pas
  // « peu » de paires, il n'en a aucune. Pas de seuil à choisir.
  if (!s.lateraux) return { cle: 'serpentin', origine: 'topologie' };

  // PLUSIEURS RANGS SUR UNE SEULE ANCRE : la symétrie radiale. Le kraken porte ses huit tentacules
  // sur `krakenjoints`, en quatre rangs. Seul cas du corpus à n'avoir qu'une ancre ET plus d'un
  // rang ; centaure2 n'a qu'une ancre mais un seul rang, et n'est donc pas radial.
  if (s.ancres === 1 && s.rangMax >= 2) return { cle: 'radial', origine: 'topologie' };

  // QUATRE ANCRES CONSÉCUTIVES OU PLUS le long du tronc : un corps segmenté. L'araignée en a CINQ,
  // et le suivant du corpus en a TROIS (rig Unreal, chien). Le seuil est posé dans un écart mesuré,
  // ce qui n'est pas la même chose qu'un nombre inventé : il n'y a aucune valeur entre 3 et 5.
  if (s.ancresSuccessives >= 4) return { cle: 'arachnide', origine: 'topologie' };

  // ── Ce que les NOMS proposent, et qui peut se tromper ────────────────────────────────────
  const c = comptesParNom3D(liste, decomposition.membres);
  const pattes = c.patte || 0, bras = c.bras || 0, ailes = c.aile || 0;

  if (ailes >= 2 && pattes >= 4) return { cle: 'quadrupede_aile', origine: 'nom' };
  if (ailes >= 2) return { cle: 'bipede_aile', origine: 'nom' };
  if (pattes >= 4 && bras >= 2) return { cle: 'centaure', origine: 'nom' };
  if (pattes >= 4) return { cle: 'quadrupede', origine: 'nom' };
  if (pattes >= 2 && bras >= 2) return { cle: 'humanoide', origine: 'nom' };

  // ── Ce qui reste, proposé sur le seul nombre de paires ───────────────────────────────────
  //
  // Le raptor tombe ici : ses os s'appellent `Bone.034.L`, aucun nom ne dit rien. Il est proposé
  // humanoïde alors que c'est un bipède à queue, et c'est assumé. Sa queue de 14 os pourrait le
  // trahir, mais aucun seuil ne sépare une queue de raptor d'une queue de cerbère (8 os) sans
  // inventer un nombre, ce que ce fichier s'interdit.
  if (s.paires === 2) return { cle: 'humanoide', origine: 'structure' };
  if (s.paires === 3) return { cle: 'centaure', origine: 'structure' };
  return { cle: 'complexe', origine: 'structure' };
}

/**
 * Les lignes de l'écran de correspondance pour un squelette QUELCONQUE. Fonction PURE.
 *
 * @param {Array<{id, name, children}>} os la liste d'os neutre
 * @param {Array<{racine: string, nom: string, retenu: boolean}>} [enregistres] les choix humains
 * @param {(en: string, fr: string) => string} [traduire]
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * POURQUOI CETTE FONCTION EXISTE, ET CE QU'ELLE NE REMPLACE PAS
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * L'écran de correspondance affiche DIX-HUIT lignes humanoïdes, et rien d'autre. Signalé à l'usage :
 * sur un cerbère on ne voit pas ses deux têtes latérales, sur une araignée pas ses pattes
 * surnuméraires. Ce n'est pas un défaut de la reconnaissance, qui les trouve toutes ; c'est l'écran
 * qui n'a pas de case pour elles.
 *
 * ELLE NE REMPLACE PAS LES DIX-HUIT EMPLACEMENTS, elle s'y ajoute. Depuis #374, c'est la MORPHOLOGIE
 * qui dit lesquels pilotent le rig : un humanoïde garde ses emplacements, une créature est pilotée
 * par ses chaînes (cf. groupesPosablesMembres3D dans skeleton-pose.js, et docs/creature-rigs.md).
 * Les remplacer pour tout le monde d'un coup aurait cassé tout modèle déjà posé.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * CE QU'ELLE REND, ET POURQUOI GROUPÉ PAR ANCRE
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * `{ tronc, groupes }`, où chaque groupe rassemble les membres qui partent du MÊME os. Décision
 * prise avec l'utilisateur, contre un regroupement des paires gauche/droite : une liste plus longue
 * mais où chaque chaîne se coche séparément, quitte à corriger à l'usage. Sur le rig Unreal, 222
 * chaînes sur une poignée d'ancres, c'est le repli par ancre qui rend l'écran lisible.
 *
 * TROIS SOURCES POUR LE NOM, ET LA PREMIÈRE QUI RÉPOND GAGNE :
 *
 *   'manuel'     ce que l'utilisateur a tapé, relu du fichier de correspondances ;
 *   'nom'        ce que le vocabulaire tire des os de la chaîne (cf. nomSuggereDeChaine3D) ;
 *   'structure'  le descripteur neutre, « gauche, 5 os », quand le fichier ne dit rien. Mesuré :
 *                l'araignée, le kraken, le raptor et le serpent sont dans ce cas, ZÉRO nom lisible.
 *
 * `retenu` VAUT VRAI PAR DÉFAUT. Une chaîne que personne n'a décochée est proposée, c'est le contrat
 * de tout cet écran : proposer sans décider. Seul un `false` enregistré la retire.
 */
/**
 * Le sous-titre de l'écran de correspondance. Fonction PURE.
 *
 * IL DOIT COMPTER CE QUE L'ÉCRAN MONTRE. « 12 sur 18 associés » sous une araignée annonçait un
 * travail à finir sur des emplacements qu'elle n'utilise pas depuis #374 ; ses chaînes, elles, sont
 * toutes trouvées, il n'y a rien à vérifier, seulement à cocher.
 *
 * Validé, on ne compte plus ce qu'il « reste à vérifier » : il ne reste rien, c'est fait.
 */
export function sousTitreCorrespondance3D({ fichier, os, carte, lignes, humanoide, valide } = {}, traduire){
  const t = traduire || ((en) => en);
  const nb = (os || []).length;
  const tete = t(`"${fichier}" — ${nb} bones`, `« ${fichier} » — ${nb} os`);
  const confirme = valide ? t(' · ✓ confirmed', ' · ✓ correspondance validée') : '';
  if (humanoide) {
    const r = resumeCorrespondance(carte);
    return tete + (valide
      ? t(` · ${r.remplis} of ${r.total} mapped`, ` · ${r.remplis} sur ${r.total} associés`)
      : t(` · ${r.remplis} of ${r.total} found, ${r.aVerifier} to check`,
        ` · ${r.remplis} sur ${r.total} trouvés, ${r.aVerifier} à vérifier`)) + confirme;
  }
  const groupes = (lignes && lignes.groupes) || [];
  const chaines = groupes.reduce((n, g) => n + g.membres.length, 0);
  const retenues = groupes.reduce((n, g) => n + g.membres.filter(m => m.retenu).length, 0);
  return tete + t(` · ${chaines} chains, ${retenues} kept`, ` · ${chaines} chaînes, ${retenues} retenues`) + confirme;
}

/**
 * Le chemin d'une chaîne d'os, « Hips › Spine › Chest ». Fonction PURE.
 *
 * @param segments les identifiants d'os, dans l'ordre
 * @param os la liste d'os neutre
 * @param max au-delà, la suite est remplacée par « … ». Sans limite si absent.
 *
 * EXTRAITE PARCE QUE DEUX MUTATIONS ONT ÉCHAPPÉ. Ce texte était construit en ligne dans deux
 * endroits de l'écran, la ligne d'un membre et celle du tronc, donc vérifiable seulement en lisant
 * le code source. Or `lignes.tronc.segments` apparaît DEUX fois dans la fonction qui l'affiche, une
 * fois pour le compte et une fois pour le chemin : un test qui cherchait cette chaîne de caractères
 * ne voyait pas la disparition du chemin. Un texte qu'on peut appeler et comparer ne pose pas cette
 * question.
 */
export function cheminDOs3D(segments, os, max){
  const parId = new Map((os || []).filter(o => o && o.id !== undefined).map(o => [o.id, o.name]));
  const noms = (segments || []).map(id => parId.get(id)).filter(n => typeof n === 'string' && n);
  if (!max || noms.length <= max) return noms.join(' › ');
  return noms.slice(0, max).join(' › ') + ' › …';
}

export function lignesDeCorrespondance3D(os, enregistres, traduire){
  const t = traduire || ((en) => en);
  const liste = (os || []).filter(o => o && o.id !== undefined);
  const vide = { tronc: null, groupes: [] };
  if (liste.length < 2) return vide;

  const parId = new Map(liste.map(o => [o.id, o]));
  const { tronc, membres } = membresDuSquelette3D(liste);
  if (!tronc.length) return vide;

  // Les choix humains sont retrouvés par le NOM de l'os racine, jamais par un indice : un `.glb`
  // réexporté renumérote tout, et une correspondance par indices désignerait alors des chaînes
  // arbitraires, silencieusement. C'est la règle du fichier de correspondances (skeleton-store.js).
  const choix = new Map((enregistres || [])
    .filter(e => e && typeof e.racine === 'string')
    .map(e => [e.racine, e]));

  const groupes = new Map();
  membres.forEach(m => {
    const noms = m.segments.map(s => parId.get(s).name);
    const racine = noms[0];
    const memoire = choix.get(racine);
    const propose = nomSuggereDeChaine3D(noms, t);

    // Le descripteur neutre reste lisible quand rien d'autre ne l'est : le côté, puis la longueur.
    // Les ancres étant ordonnées le long du tronc, « gauche, 7 os » sous la troisième ancre se lit
    // comme « la patte gauche du troisième segment », ce qui suffit à taper un nom.
    const cote = m.cote === 'g' ? t('left', 'gauche') : m.cote === 'd' ? t('right', 'droite') : t('centre', 'centre');
    const neutre = `${cote}, ${m.segments.length} ${t('bones', 'os')}`;

    // LE CÔTÉ EST COLLÉ AU NOM PROPOSÉ, et pas seulement rangé dans un champ. Sans lui, le cerbère
    // affiche deux lignes « Patte » et deux lignes « Tête » strictement identiques : le champ que
    // l'utilisateur va éditer doit se distinguer tout seul, sans dépendre d'une colonne d'à côté.
    const suffixe = m.cote === 'g' ? ` ${t('L', 'G')}` : m.cote === 'd' ? ` ${t('R', 'D')}` : '';

    const ligne = {
      racine,
      cote: m.cote,
      rang: m.rang,
      segments: m.segments,
      nom: (memoire && memoire.nom) || (propose ? propose + suffixe : neutre),
      origine: (memoire && memoire.nom) ? 'manuel' : (propose ? 'nom' : 'structure'),
      retenu: memoire ? memoire.retenu !== false : true,
    };
    const cle = m.ancre;
    if (!groupes.has(cle)) groupes.set(cle, { ancre: cle, ancreNom: parId.get(cle).name, membres: [] });
    groupes.get(cle).membres.push(ligne);
  });

  return {
    tronc: { segments: tronc, nom: t('Spine', 'Colonne') },
    groupes: [...groupes.values()],
  };
}
