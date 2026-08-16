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
 * est pire qu'un os manquant — le personnage se tord, et rien ne le signale.
 *
 * D'OÙ LE PARTAGE DES RÔLES, qui est l'idée de ce fichier :
 *
 *   — le NOM est fiable pour le CÔTÉ. « Left », « _L », « _l_ » : les trois conventions se
 *     reconnaissent, et les deux fichiers les respectent ;
 *   — la STRUCTURE est fiable pour le SEGMENT. Les deux squelettes ont exactement la même forme —
 *     un bassin d'où partent trois chaînes (deux jambes, une colonne), une poitrine d'où partent
 *     trois chaînes (deux bras, un cou). Cette forme-là ne dépend d'aucune convention de nommage.
 *
 * Chaque proposition porte donc son ORIGINE — 'nom' ou 'structure' — et l'interface l'affiche.
 * Après ce qu'on vient de voir, une correspondance automatique silencieuse est inacceptable :
 * l'utilisateur doit pouvoir repérer d'un coup d'œil les lignes que le nom ne confirmait pas.
 *
 * LE PIÈGE DU BRUIT. Le rig Unreal porte des centaines d'os auxiliaires — `FX_`, `_twist_`,
 * `_vol_`, `_end`. Ils s'accrochent partout et fausseraient une descente naïve « premier enfant ».
 * On descend donc toujours par l'enfant dont la descendance est la plus PROFONDE : les auxiliaires
 * sont des culs-de-sac, les membres sont des chaînes.
 *
 * ENTRÉE : une liste d'os neutres `{ id, name, children: [id…] }`. Ni Three, ni glTF — ce qui rend
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
 * anatomique — du tronc vers les extrémités, gauche avant droite — et non celui de SLOTS, qui suit
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

/** Libellé d'un emplacement, sans son côté — le groupe le porte déjà. */
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
 * Ne lit que des propriétés génériques — `isBone`, `uuid`, `name`, `children` — pour que la
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
 * Le côté d'un os d'après son nom : 'g', 'd' ou null.
 *
 * Le nom est fiable POUR ÇA, et seulement pour ça. Trois conventions cohabitent — « Left… »,
 * « …_L », « L_… ». Le piège : un os nommé « leg » contient un « l » sans être à gauche, d'où des
 * motifs ancrés plutôt qu'une recherche de lettre.
 */
export function coteDuNom(nom){
  const brut = String(nom || '').toLowerCase().replace(/^.*:/, '');
  if (/left/.test(brut)) return 'g';
  if (/right/.test(brut)) return 'd';
  if (/[._\- ]l$|^l[._\- ]|[._\- ]l[._\- ]/.test(brut)) return 'g';
  if (/[._\- ]r$|^r[._\- ]|[._\- ]r[._\- ]/.test(brut)) return 'd';
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
 * marqué 'nom' — c'est le cas tranquille. Marqué 'structure', il signifie : le nom ne disait pas
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
   * Les branches d'un os. Simple alias local — voir `branches` et son filtre de profondeur.
   *
   * J'AI D'ABORD ÉCRIT ICI UN SEUIL DE TAILLE RELATIF (3 % de la descendance du parent), en
   * croyant que c'était lui qui écartait les chaînes `ik_*` du rig Unreal. La campagne de mutation
   * a démenti : le retirer ne fait échouer aucun test, sur aucun des deux squelettes réels. Ce qui
   * écarte réellement ces chaînes, c'est l'exigence de PAIRE LATÉRALE plus bas — les hiérarchies IK
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
  // « la moins fournie des trois », et elle a désigné un accessoire de torse sur le rig maison —
  // qui porte, en plus des bras et du cou, des chaînes décoratives. L'absence de côté distingue le
  // cou d'un membre bien mieux que sa taille, et c'est encore le nom utilisé pour ce qu'il sait
  // faire : dire un côté, ou dire qu'il n'y en a pas.
  // Le cou est cherché SANS le filtre de profondeur, contrairement aux membres. Un cou minimal fait
  // deux os — « Neck » puis « Head » — et la spécification VRM ne demande rien de plus. Le filtre,
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
    // neck_02 → head. Prendre l'enfant immédiat désignait donc `neck_02` comme tête — flagué
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
  // § « détails ») l'énonce : « les os non obligatoires peuvent être sautés — le parent du bras
  // peut être la poitrine plutôt qu'une clavicule ». Un rig sans clavicule existe donc légalement,
  // et descendre depuis la branche en supposant clavicule → bras → avant-bras → main décalerait
  // TOUT d'un cran, sans qu'aucune règle ne s'en aperçoive.
  //
  // Aucun de mes six squelettes n'est dans ce cas : ils ont tous une clavicule. C'est la
  // documentation qui a révélé le trou, pas les fichiers — et c'est précisément le genre de défaut
  // qui n'apparaît que chez l'utilisateur, sur le premier fichier qui sort de l'échantillon.
  //
  // J'AI D'ABORD VOULU LIRE LA CHAÎNE PAR LA FIN, en reconnaissant la main à l'embranchement des
  // doigts. Mesuré : ça casse sur le rig Unreal, où la clavicule porte trois os `FX_` et passe donc
  // elle-même pour une main. Sur ce rig, l'embranchement ne distingue rien.
  //
  // On descend donc depuis la racine de branche, comme pour les jambes, mais on décide D'ABORD si
  // cette racine est une clavicule. C'est le seul endroit où le nom sert à autre chose qu'un côté,
  // et c'est assumé : l'os en question est OPTIONNEL, donc aucune règle de structure ne peut
  // trancher son absence. Si le nom ne dit rien, on suppose une clavicule — le cas des six
  // squelettes mesurés — et la ligne part en 'structure', donc signalée à l'utilisateur.
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
