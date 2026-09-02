/**
 * tests/skeleton-store.test.mjs, ranger une correspondance de squelette, et la retrouver.
 *
 * TROIS DÉCISIONS SONT GARDÉES ICI, et aucune ne se voit à l'usage tant que rien ne casse :
 *
 *   — ON MÉMORISE DES NOMS D'OS, PAS DES INDICES. Un indice de nœud glTF n'a de sens que pour un
 *     fichier donné : réexporter le même personnage depuis Blender renumérote tout, et une
 *     correspondance par indices désignerait alors des os arbitraires. Sans bruit ;
 *   — ON N'ENREGISTRE QUE LES DÉCISIONS HUMAINES. Recopier aussi les propositions automatiques
 *     figerait la reconnaissance d'aujourd'hui : une version ultérieure qui saurait mieux faire ne
 *     s'appliquerait plus jamais, puisqu'elle trouverait une correspondance « enregistrée » partout ;
 *   — UN FICHIER ABÎMÉ NE FAIT JAMAIS ÉCHOUER L'OUVERTURE D'UN PROJET. Au pire on repart d'une
 *     correspondance vide. Une correspondance perdue se refait en trente secondes ; un Projet qui
 *     refuse de s'ouvrir, non.
 *
 * CE QU'ON N'AFFIRME PAS : que l'écriture sur le disque fonctionne. Elle est dans main.js, hors de
 * portée des tests (cf. docs/en/architecture.md, l'unique exception). Ce qui est testé, c'est tout ce
 * qui décide de CE QU'ON ÉCRIT et de comment on relit.
 */
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  normaliserFichier, entreePourFichier, fusionner, setSkeletonBridge,
  lireCorrespondances, enregistrerCorrespondance, oublierCorrespondance, renommerCorrespondance,
  SKELETON_MAP_FORMAT,
  doitOuvrirCorrespondance, correspondanceEnregistreeSync, _viderCacheCorrespondances,
} from '../src/skeleton-store.js';
import { SLOTS, sousTitreCorrespondance3D, cheminDOs3D } from '../src/skeleton-map.js';

/** Le traducteur du dépôt, réduit à la version française : c'est elle que ces tests comparent. */
const tr = (en, fr) => fr;

const OS = [
  { id: 3, name: 'mixamorig:LeftUpLeg' },
  { id: 4, name: 'mixamorig:LeftLeg' },
  { id: 5, name: 'mixamorig:Hips' },
];

describe('Les RÔLES d\'un archétype se rangent à côté des emplacements (#378b)', () => {
  test('`roles` est un AJOUT : la version du format ne bouge pas', () => {
    // Troisième ajout après `morphologie` et `membres`, et pour la même raison : passer
    // SKELETON_MAP_FORMAT à 2 ferait REJETER le fichier entier par une version antérieure, alors
    // qu'une clé inconnue est simplement ignorée.
    assert.equal(SKELETON_MAP_FORMAT, 1);
    const lu = normaliserFichier({ version: 1, entrees: {
      'chien.glb': { os: {}, valide: true, roles: { hipFL: 'BackShoulderL_27', tail0: 'Tail1_37' } },
    } });
    assert.deepEqual(lu.entrees['chien.glb'].roles, { hipFL: 'BackShoulderL_27', tail0: 'Tail1_37' });
  });

  test('une entrée qui n\'a QUE des rôles est conservée', () => {
    // Sans cette condition, une créature dont l'utilisateur n'a corrigé que des rôles verrait son
    // travail jeté à la relecture : `os` reste vide sur une créature, c'est le cas NORMAL.
    const lu = normaliserFichier({ version: 1, entrees: {
      'cerberus.glb': { roles: { head: 'CERBERUS__Head_09' } },
    } });
    assert.ok(lu.entrees['cerberus.glb'], 'l\'entrée a été jetée');
    assert.deepEqual(lu.entrees['cerberus.glb'].roles, { head: 'CERBERUS__Head_09' });
  });

  test('les entrées malformées sont écartées, jamais reprises', () => {
    const lu = normaliserFichier({ version: 1, entrees: {
      'x.glb': { valide: true, roles: { bon: 'Os_1', '': 'Os_2', vide: '', nul: null, nombre: 3 } },
    } });
    assert.deepEqual(lu.entrees['x.glb'].roles, { bon: 'Os_1' });
  });

  test('RÉGRESSION : changer d\'archétype ne détruit plus l\'autre vocabulaire (#382)', () => {
    // Signalé par l'utilisateur AVANT que ça ne lui coûte : corriger dix emplacements en humanoïde,
    // basculer en quadrupède par curiosité, enregistrer, revenir en humanoïde, et les dix
    // corrections avaient disparu sans un mot. Même famille de perte silencieuse que #385.
    //
    // La morphologie dit lequel des deux est LU ; elle n'oblige pas à effacer l'autre.
    const avant = { os: { tete: 'Head', bras_g: 'ArmL' }, valide: true, roles: { head: 'H2' } };

    const creature = entreePourFichier({}, {
      valide: true, humanoide: false, roles: { hipFL: 'ThighL' }, precedente: avant,
    });
    assert.deepEqual(creature.roles, { hipFL: 'ThighL' }, 'les rôles écrits sont ceux du moment');
    assert.deepEqual(creature.os, { tete: 'Head', bras_g: 'ArmL' },
      'les emplacements humanoïdes ont été détruits par un enregistrement de créature');

    const humain = entreePourFichier({ tete: { bone: 1, name: 'Head2', origine: 'manuel' } }, {
      valide: true, humanoide: true, precedente: avant,
    });
    assert.deepEqual(humain.os, { tete: 'Head2' });
    assert.deepEqual(humain.roles, { head: 'H2' },
      'les rôles ont été détruits par un enregistrement humanoïde');
  });

  test('RÉGRESSION : le drapeau est EXPLICITE, il ne se déduit pas d\'un `os` vide', () => {
    // « Aucun emplacement manuel » est un état légitime pour un humanoïde, celui de quelqu'un qui
    // vient de tout remettre en automatique. Le déduire ferait ressusciter les choix qu'il vient
    // d'effacer, ce qui est exactement le contraire du service rendu.
    const avant = { os: { tete: 'Head' }, valide: true };
    const e = entreePourFichier({}, { valide: true, humanoide: true, precedente: avant });
    assert.deepEqual(e.os, {}, 'un humanoïde qui efface tout doit voir ses emplacements partir');
  });

  test('un fichier SANS rôles n\'en gagne pas un champ vide', () => {
    // Un humanoïde écrit `os` et rien d'autre : le champ ne doit pas apparaître pour rien, sous
    // peine de faire grossir le fichier d'un objet vide par modèle.
    const lu = normaliserFichier({ version: 1, entrees: { 'h.glb': { os: { tete: 'Head' }, valide: true } } });
    assert.equal('roles' in lu.entrees['h.glb'], false);
    assert.equal('roles' in entreePourFichier({ tete: { bone: 1, name: 'Head', origine: 'manuel' } }, {}), false);
  });

  test('entreePourFichier écrit les rôles qu\'on lui donne, et eux seuls', () => {
    // Même règle que `os` et `morphologie` : on n'écrit que le choix HUMAIN. Figer l'attribution
    // proposée condamnerait toute amélioration de #379 et #381, qui trouveraient un rôle
    // « enregistré » sur chaque fichier jamais touché.
    const e = entreePourFichier({}, {
      valide: true, humanoide: false, roles: { head: 'CERBERUS__Head_09' },
    });
    assert.deepEqual(e.roles, { head: 'CERBERUS__Head_09' });
    assert.deepEqual(e.os, {}, 'une créature n\'écrit pas d\'emplacements');
  });
});

describe('normaliserFichier : relire sans jamais faire échouer une ouverture', () => {
  test('un contenu valide traverse intact', () => {
    const r = normaliserFichier({ version: 1, entrees: { 'a.glb': { os: { bassin: 'Hips' }, valide: true } } });
    assert.deepEqual(r.entrees['a.glb'], { os: { bassin: 'Hips' }, valide: true });
  });

  test('n\'importe quelle absurdité rend une forme vide, sans lever', () => {
    [null, undefined, 42, 'texte', [], { entrees: 'pas un objet' }, { entrees: { 'a.glb': 7 } }]
      .forEach(x => {
        let r;
        assert.doesNotThrow(() => { r = normaliserFichier(x); }, JSON.stringify(x));
        assert.deepEqual(r, { version: SKELETON_MAP_FORMAT, entrees: {} });
      });
  });

  test('RÉGRESSION : une version FUTURE est ignorée, pas réinterprétée', () => {
    // On ne sait pas ce que contient un format plus récent. Le lire de travers puis le RÉÉCRIRE
    // écraserait le travail fait par une version plus récente de l'application, sur un fichier
    // partagé par tous les Projets, donc sans recours.
    const r = normaliserFichier({ version: 99, entrees: { 'a.glb': { os: { bassin: 'Hips' } } } });
    assert.deepEqual(r.entrees, {});
  });

  test('les emplacements inconnus sont écartés, les connus gardés', () => {
    const r = normaliserFichier({ version: 1, entrees: { 'a.glb': {
      os: { bassin: 'Hips', inventé: 'Truc', tete: 'Head' } } } });
    assert.deepEqual(Object.keys(r.entrees['a.glb'].os).sort(), ['bassin', 'tete']);
  });

  test('RÉGRESSION : une entrée VALIDÉE sans aucun os est conservée', () => {
    // Signalé à l'usage. J'écrivais qu'une entrée sans os « n'apprend rien », c'était faux : elle
    // apprend que l'utilisateur a VU cet écran et l'a tranché. Sans elle, valider sans rien
    // corriger, le cas le plus fréquent, n'écrivait rien, et la modale se rouvrait à chaque
    // import. Ce qui revient exactement à ne pas avoir enregistré.
    const r = normaliserFichier({ version: 1, entrees: {
      'valide.glb': { os: {}, valide: true },
      'rien.glb': { os: {} },
      'corrige.glb': { os: { tete: 'H' } },
    } });
    assert.deepEqual(Object.keys(r.entrees).sort(), ['corrige.glb', 'valide.glb']);
  });

  test('un nom d\'os qui n\'est pas une chaîne est écarté', () => {
    const r = normaliserFichier({ version: 1, entrees: { 'a.glb': { os: { bassin: 12, tete: 'Head' } } } });
    assert.deepEqual(r.entrees['a.glb'].os, { tete: 'Head' });
  });
});

describe('entreePourFichier : n\'enregistrer que ce que l\'utilisateur a décidé', () => {
  test('RÉGRESSION : les propositions automatiques ne sont PAS enregistrées', () => {
    // Les figer condamnerait toute amélioration future de la reconnaissance : elle ne s'appliquerait
    // plus jamais, puisqu'elle trouverait une correspondance « enregistrée » partout. La validation
    // est une information SÉPARÉE, qui n'entraîne aucune recopie des propositions.
    const carte = {
      bassin: { bone: 5, name: 'Hips', origine: 'nom' },
      tete: { bone: 6, name: 'Head', origine: 'structure' },
    };
    assert.equal(entreePourFichier(carte), null);
    assert.deepEqual(entreePourFichier(carte, { valide: true }), { os: {}, valide: true });
  });

  test('seules les entrées « manuel » sont retenues', () => {
    const carte = {
      bassin: { bone: 5, name: 'Hips', origine: 'nom' },
      cuisse_g: { bone: 3, name: 'mixamorig:LeftUpLeg', origine: 'manuel' },
    };
    assert.deepEqual(entreePourFichier(carte), { os: { cuisse_g: 'mixamorig:LeftUpLeg' }, valide: false });
  });

  test('RÉGRESSION : c\'est le NOM de l\'os qui est enregistré, jamais son indice', () => {
    // Un indice de nœud glTF n'a de sens que pour un fichier donné. Réexporter le personnage
    // renumérote tout, et la correspondance désignerait des os arbitraires, sans bruit.
    const e = entreePourFichier({ bassin: { bone: 5, name: 'Hips', origine: 'manuel' } });
    assert.equal(e.os.bassin, 'Hips');
    assert.deepEqual(Object.values(e.os).filter(v => typeof v !== 'string'), []);
  });

  test('une carte vide ou absurde rend null', () => {
    [null, undefined, {}, { bassin: null }].forEach(c => assert.equal(entreePourFichier(c), null));
  });
});

describe('fusionner : l\'enregistré prime, tant qu\'il désigne un os qui existe', () => {
  const auto = {
    cuisse_g: { bone: 3, name: 'mixamorig:LeftUpLeg', origine: 'structure' },
    bassin: { bone: 5, name: 'mixamorig:Hips', origine: 'nom' },
  };

  test('une correction enregistrée remplace la proposition, et se déclare « manuel »', () => {
    const r = fusionner(auto, { os: { cuisse_g: 'mixamorig:LeftLeg' } }, OS);
    assert.deepEqual(r.cuisse_g, { bone: 4, name: 'mixamorig:LeftLeg', origine: 'manuel' });
  });

  test('les emplacements non corrigés gardent la proposition automatique', () => {
    const r = fusionner(auto, { os: { cuisse_g: 'mixamorig:LeftLeg' } }, OS);
    assert.deepEqual(r.bassin, auto.bassin);
  });

  test('RÉGRESSION : un os enregistré qui a DISPARU du fichier ne pointe pas dans le vide', () => {
    // Le `.glb` a été remplacé par une autre version, et l'os retenu n'existe plus. On retombe sur
    // la reconnaissance pour CET emplacement, pointer vers un os absent tordrait le personnage
    // ou ne ferait rien, selon les cas, sans jamais le dire.
    const r = fusionner(auto, { os: { cuisse_g: 'os_qui_nexiste_plus' } }, OS);
    assert.deepEqual(r.cuisse_g, auto.cuisse_g);
  });

  test('… et le RESTE de la correspondance enregistrée survit', () => {
    // On ne jette pas tout le travail de l'utilisateur parce qu'un seul os a changé de nom.
    const r = fusionner(auto, { os: { cuisse_g: 'disparu', bassin: 'mixamorig:Hips' } }, OS);
    assert.equal(r.bassin.origine, 'manuel');
    assert.equal(r.cuisse_g.origine, 'structure');
  });

  test('tous les emplacements sont présents, même vides', () => {
    // L'écran de correspondance affiche 18 lignes quoi qu'il arrive ; une clé absente y ferait un
    // trou, et un trou ne se distingue pas d'un oubli.
    const r = fusionner({}, null, OS);
    assert.deepEqual(Object.keys(r).sort(), SLOTS.slice().sort());
    SLOTS.forEach(s => assert.equal(r[s], null));
  });

  test('entrées absurdes : on ne lève pas', () => {
    [null, undefined].forEach(x =>
      assert.doesNotThrow(() => fusionner(x, x, x)));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Le disque, à travers un pont simulé
// ─────────────────────────────────────────────────────────────────────────────

let ecrit, pontRepond;
beforeEach(() => {
  ecrit = [];
  pontRepond = { ok: true, data: { version: 1, entrees: {} } };
  setSkeletonBridge({
    readSkeletonMaps: async () => pontRepond,
    writeSkeletonMaps: async (c) => { ecrit.push(JSON.parse(JSON.stringify(c))); return { ok: true }; },
  });
});

describe('Enregistrer une créature ne détruit pas le travail humanoïde (#382)', () => {
  test('BOUT EN BOUT : les emplacements survivent à un enregistrement de créature', () => {
    // ⚠️ TROU TROUVÉ PAR MUTATION. Mes tests passaient `precedente` À LA MAIN à
    // `entreePourFichier` : retirer sa transmission depuis `enregistrerCorrespondance` ne faisait
    // donc échouer personne, alors que c'est le SEUL chemin par lequel l'application l'obtient.
    // Une garantie vérifiée sur une fonction qu'aucun appelant ne nourrit ne garantit rien.
    _viderCacheCorrespondances();
    pontRepond = { ok: true, data: { version: 1, entrees: {
      'cerberus.glb': { os: { tete: 'Head', bras_g: 'ArmL' }, valide: true },
    } } };
    return enregistrerCorrespondance('cerberus.glb', {}, {
      humanoide: false, morphologie: 'quadrupede', roles: { hipFL: 'ThighL' },
    }).then(() => {
      const entree = ecrit[ecrit.length - 1].entrees['cerberus.glb'];
      assert.deepEqual(entree.os, { tete: 'Head', bras_g: 'ArmL' },
        'les emplacements humanoïdes ont été écrasés par un enregistrement de créature');
      assert.deepEqual(entree.roles, { hipFL: 'ThighL' });
      assert.equal(entree.morphologie, 'quadrupede');
    });
  });
});

describe('Le cache résident : la correspondance sans attendre le disque', () => {
  // POURQUOI CE CACHE EXISTE. Construire le rig 3D d'un modèle importé se fait DANS un rendu, un
  // chemin strictement synchrone : on ne peut pas y attendre une lecture disque. Le rig lit donc
  // `correspondanceEnregistreeSync`, alimentée par les lectures et les écritures réussies.
  //
  // CE BLOC A ÉTÉ ÉCRIT APRÈS UNE MUTATION ÉCHAPPÉE : mettre à jour le cache SANS vérifier que
  // l'écriture a réussi ne faisait échouer aucun test. À l'usage, cela ferait afficher au rig une
  // correspondance que le disque ne porte pas, et l'écart ne se verrait qu'au redémarrage
  // suivant, très loin de sa cause.
  beforeEach(() => { _viderCacheCorrespondances(); });

  test('avant toute lecture, le cache est vide : la reconnaissance automatique fait le travail', () => {
    assert.equal(correspondanceEnregistreeSync('a.glb'), null);
  });

  test('une lecture réussie remplit le cache', async () => {
    pontRepond = { ok: true, data: { version: 1, entrees: { 'a.glb': { os: { bassin: 'Hips' }, valide: true } } } };
    await lireCorrespondances();
    assert.deepEqual(correspondanceEnregistreeSync('a.glb'), { os: { bassin: 'Hips' }, valide: true });
    assert.equal(correspondanceEnregistreeSync('inconnu.glb'), null);
  });

  test('une lecture qui ÉCHOUE ne vide pas ce qu\'on savait déjà', async () => {
    // Une lecture ratée ne prouve pas que les correspondances ont disparu, seulement qu'on n'a pas
    // pu les relire. Les oublier ferait perdre, le temps d'un incident disque, un travail de
    // correction qui est toujours là.
    pontRepond = { ok: true, data: { version: 1, entrees: { 'a.glb': { os: { bassin: 'Hips' }, valide: true } } } };
    await lireCorrespondances();
    setSkeletonBridge({ readSkeletonMaps: async () => { throw new Error('disque absent'); } });
    await lireCorrespondances();
    assert.deepEqual(correspondanceEnregistreeSync('a.glb'), { os: { bassin: 'Hips' }, valide: true });
  });

  test('un enregistrement réussi est visible immédiatement, sans relire le disque', async () => {
    const carte = { bassin: { bone: 5, name: 'mixamorig:Hips', origine: 'manuel' } };
    await enregistrerCorrespondance('b.glb', carte, { valide: true });
    assert.deepEqual(correspondanceEnregistreeSync('b.glb'),
      { os: { bassin: 'mixamorig:Hips' }, valide: true });
  });

  test('RÉGRESSION : une écriture REFUSÉE ne met pas le cache à jour', async () => {
    setSkeletonBridge({
      readSkeletonMaps: async () => ({ ok: true, data: { version: 1, entrees: {} } }),
      writeSkeletonMaps: async () => ({ ok: false, error: 'disque plein' }),
    });
    const carte = { bassin: { bone: 5, name: 'mixamorig:Hips', origine: 'manuel' } };
    const r = await enregistrerCorrespondance('c.glb', carte, { valide: true });
    assert.equal(r.ok, false);
    assert.equal(correspondanceEnregistreeSync('c.glb'), null,
      'le cache annonce une correspondance que le disque ne porte pas');
  });

  test('RÉGRESSION : une écriture qui LÈVE ne met pas le cache à jour', async () => {
    setSkeletonBridge({
      readSkeletonMaps: async () => ({ ok: true, data: { version: 1, entrees: {} } }),
      writeSkeletonMaps: async () => { throw new Error('disque arraché'); },
    });
    const carte = { bassin: { bone: 5, name: 'mixamorig:Hips', origine: 'manuel' } };
    const r = await enregistrerCorrespondance('d.glb', carte, { valide: true });
    assert.equal(r.ok, false);
    assert.equal(correspondanceEnregistreeSync('d.glb'), null);
  });
});

describe('lireCorrespondances / enregistrerCorrespondance', () => {
  test('sans pont, on rend une correspondance vide plutôt que d\'échouer', async () => {
    setSkeletonBridge(null);
    assert.deepEqual(await lireCorrespondances(), { version: SKELETON_MAP_FORMAT, entrees: {} });
  });

  test('un pont qui lève ne fait pas échouer la lecture', async () => {
    setSkeletonBridge({ readSkeletonMaps: async () => { throw new Error('disque en vrac'); } });
    assert.deepEqual((await lireCorrespondances()).entrees, {});
  });

  test('RÉGRESSION : on RELIT avant d\'écrire, pour ne pas écraser une autre fenêtre', async () => {
    // Le fichier est partagé par tous les Projets. Entre le chargement et l'enregistrement, une
    // autre fenêtre de l'application a pu ajouter la correspondance d'un autre modèle. Réécrire ce
    // qu'on avait en mémoire l'effacerait, et personne ne s'en apercevrait avant de rouvrir.
    pontRepond = { ok: true, data: { version: 1, entrees: { 'autre.glb': { os: { tete: 'Head' } } } } };
    await enregistrerCorrespondance('a.glb', { bassin: { bone: 5, name: 'Hips', origine: 'manuel' } });
    assert.deepEqual(Object.keys(ecrit[0].entrees).sort(), ['a.glb', 'autre.glb']);
  });

  test('RÉGRESSION : valider sans rien corriger écrit quand même une entrée', async () => {
    // LE défaut signalé à l'usage. Sans cela, la modale se rouvrait à chaque import d'un fichier
    // dont la reconnaissance était juste, c'est-à-dire la plupart.
    pontRepond = { ok: true, data: { version: 1, entrees: {} } };
    await enregistrerCorrespondance('a.glb', { bassin: { bone: 5, name: 'Hips', origine: 'nom' } });
    assert.deepEqual(ecrit[0].entrees['a.glb'], { os: {}, valide: true });
  });

  test('« Tout remettre en automatique » efface l\'entrée, validation comprise', async () => {
    // L'utilisateur renonce à ses corrections ET à sa validation : la modale doit pouvoir se
    // reproposer. C'est la seule façon de revenir en arrière complètement.
    pontRepond = { ok: true, data: { version: 1, entrees: { 'a.glb': { os: { bassin: 'Hips' }, valide: true } } } };
    await enregistrerCorrespondance('a.glb', {}, { valide: false });
    assert.deepEqual(ecrit[0].entrees, {});
  });

  test('RÉGRESSION : oublierCorrespondance n\'écrit pas une coquille VALIDÉE', async () => {
    // Un `.glb` supprimé du disque. Sans `valide: false`, on réécrirait une entrée validée pour un
    // fichier qui n'existe plus, et un homonyme réimporté plus tard n'ouvrirait jamais l'écran.
    pontRepond = { ok: true, data: { version: 1, entrees: {
      'a.glb': { os: { bassin: 'H' }, valide: true }, 'b.glb': { os: { tete: 'T' }, valide: true } } } };
    await oublierCorrespondance('a.glb');
    assert.deepEqual(Object.keys(ecrit[0].entrees), ['b.glb']);
  });

  test('un échec d\'écriture est RAPPORTÉ, pas avalé', async () => {
    // La faute la plus coûteuse de ce dépôt reste « un succès annoncé pour un travail sans effet ».
    setSkeletonBridge({
      readSkeletonMaps: async () => ({ ok: true, data: { version: 1, entrees: {} } }),
      writeSkeletonMaps: async () => ({ ok: false, error: 'disque plein' }),
    });
    const r = await enregistrerCorrespondance('a.glb', { bassin: { bone: 5, name: 'H', origine: 'manuel' } });
    assert.equal(r.ok, false);
    assert.match(r.error, /disque plein/);
  });

  test('sans pont d\'écriture, on refuse plutôt que de prétendre avoir enregistré', async () => {
    setSkeletonBridge({ readSkeletonMaps: async () => ({ ok: false }) });
    assert.equal((await enregistrerCorrespondance('a.glb', {})).ok, false);
  });
});

/**
 * JOURNAL DE MUTATION.
 *
 *   P1 les propositions automatiques sont enregistrées comme les manuelles     ROUGE
 *   P2 on enregistre l'indice de l'os au lieu de son nom                       ROUGE
 *   P3 un os enregistré disparu écrase quand même la proposition               ROUGE
 *   P4 on écrit sans relire (une autre fenêtre est écrasée)                    ROUGE
 *   P5 une version future est relue comme la version courante                  ROUGE
 *   P6 un échec d'écriture est rendu comme un succès                           ROUGE
 *
 * P4 EST CELLE QU'ON NE VERRAIT JAMAIS EN DÉVELOPPANT. Elle demande deux fenêtres ouvertes, et son
 * effet, la correspondance d'un autre modèle effacée, ne se découvre qu'en rouvrant le fichier
 * bien plus tard. C'est exactement la forme des défauts que ce dépôt collectionne : rien ne lève,
 * rien ne s'affiche, et le problème se manifeste ailleurs, plus tard.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Le câblage vers le disque, par lecture de source, faute de pouvoir l'exécuter
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync as _lire } from 'node:fs';
import { fileURLToPath as _chemin } from 'node:url';
import { dirname as _dossier, join as _joindre } from 'node:path';

const _RACINE = _joindre(_dossier(_chemin(import.meta.url)), '..');
const MAIN = _lire(_joindre(_RACINE, 'main.js'), 'utf8');
const PRELOAD = _lire(_joindre(_RACINE, 'preload.js'), 'utf8');
const TYPES = _lire(_joindre(_RACINE, 'types/globals.d.ts'), 'utf8');

describe('Câblage des correspondances vers le processus principal', () => {
  test('les deux canaux existent des DEUX côtés du pont', () => {
    // Un canal déclaré d'un seul côté ne lève pas : `invoke` reste en attente, ou le handler n'est
    // jamais appelé. C'est la panne silencieuse type de l'IPC.
    ['skeletons:read', 'skeletons:write'].forEach(canal => {
      assert.match(MAIN, new RegExp(`ipcMain\\.handle\\('${canal}'`), `main.js : ${canal}`);
      assert.match(PRELOAD, new RegExp(`invoke\\('${canal}'`), `preload.js : ${canal}`);
    });
  });

  test('les méthodes exposées sont décrites dans les types', () => {
    // Un test existant refuse déjà toute méthode de preload absente de globals.d.ts. On épingle
    // ici les deux nouvelles nommément, parce qu'elles portent la seule persistance partagée
    // entre Projets.
    ['readSkeletonMaps', 'writeSkeletonMaps'].forEach(m => {
      assert.match(PRELOAD, new RegExp(`${m}:`), `preload.js : ${m}`);
      assert.match(TYPES, new RegExp(`${m}\\(`), `globals.d.ts : ${m}`);
    });
  });

  test('RÉGRESSION : le fichier est écrit par un TEMPORAIRE puis renommé', () => {
    // Une coupure en pleine écriture laisserait sinon un JSON tronqué, donc illisible, donc TOUTES
    // les correspondances perdues d'un coup, pas seulement celle qu'on enregistrait. Le renommage
    // est atomique sur les systèmes de fichiers visés.
    const bloc = MAIN.slice(MAIN.indexOf("ipcMain.handle('skeletons:write'"));
    const corps = bloc.slice(0, bloc.indexOf('\n});'));
    assert.match(corps, /\.tmp/, 'écriture directe sur le fichier final');
    assert.ok(corps.indexOf('writeFile') < corps.indexOf('rename'),
      'le renommage doit venir APRÈS l\'écriture du temporaire');
  });

  test('RÉGRESSION : le fichier est à CÔTÉ du dossier Modeles, pas dedans', () => {
    // Ce dossier ne contient que des .glb, et models:list y refuse déjà tout le reste. Y glisser un
    // .json obligerait à percer cette garde pour un cas particulier.
    const bloc = MAIN.slice(MAIN.indexOf('function getSkeletonMapsPath'));
    assert.match(bloc.slice(0, 200), /getProjectsDir\(\)/);
    assert.doesNotMatch(bloc.slice(0, 200), /getModelsDir\(\)/);
  });

  test('une lecture impossible n\'est pas une panne', () => {
    // Absent au premier usage, ou illisible : les deux se traitent pareil côté renderer.
    const bloc = MAIN.slice(MAIN.indexOf("ipcMain.handle('skeletons:read'"));
    assert.match(bloc.slice(0, 600), /catch/);
    assert.match(bloc.slice(0, 600), /ok: false/);
  });
});

describe('doitOuvrirCorrespondance : n\'ouvrir que quand il y a quelque chose à montrer', () => {
  const os = [{ id: 1, name: 'Hips' }];

  test('RÉGRESSION : un modèle SANS squelette n\'ouvre jamais l\'écran', () => {
    // Une chaise, un bâtiment, un décor, probablement la majorité des imports. L'écran n'aurait
    // littéralement aucune ligne à afficher.
    assert.equal(doitOuvrirCorrespondance({ osDuFichier: [], dejaEnregistree: false }), false);
    assert.equal(doitOuvrirCorrespondance({ osDuFichier: null, dejaEnregistree: false }), false);
    assert.equal(doitOuvrirCorrespondance({}), false);
  });

  test('RÉGRESSION : une correspondance déjà VALIDÉE n\'est pas redemandée', () => {
    // Même s'il reste des lignes « structure » : l'utilisateur les a vues, signalées, et a tranché.
    // Les lui remontrer à chaque import reviendrait à ne pas avoir enregistré (signalé à l'usage).
    assert.equal(doitOuvrirCorrespondance({ osDuFichier: os, dejaEnregistree: true }), false);
  });

  test('un squelette jamais vu ouvre l\'écran, MÊME si tout est reconnu', () => {
    // Décision de l'utilisateur, contre mon avis initial : un écran qui ne se montre jamais quand
    // tout va bien est un écran dont on ignore l'existence le jour où ça va mal.
    assert.equal(doitOuvrirCorrespondance({ osDuFichier: os, dejaEnregistree: false }), true);
  });
});

describe('Câblage de l\'écran de correspondance', () => {
  const EVENTS = _lire(_joindre(_RACINE, 'src/events.js'), 'utf8');
  const HTML = _lire(_joindre(_RACINE, 'index.html'), 'utf8');
  const IMPORT = _lire(_joindre(_RACINE, 'src/model-import.js'), 'utf8');

  test('la modale et ses commandes existent', () => {
    ['skeletonMapModal', 'skeletonMapList', 'skeletonMapSave', 'skeletonMapCancel', 'skeletonMapReset']
      .forEach(id => assert.match(HTML, new RegExp(`id="${id}"`), `absent : ${id}`));
  });

  test('RÉGRESSION : l\'entrée du clic droit vise le FICHIER, pas un Élément', () => {
    // Le seul point d'entrée atteignable pour un .glb importé comme Scène, qui n'a aucun Élément
    // dans une Case d'où on pourrait ouvrir l'écran.
    assert.match(HTML, /id="ctxSkeletonMap"/);
    const bloc = EVENTS.slice(EVENTS.indexOf("ctxSkeletonMap').onclick"));
    assert.match(bloc.slice(0, 300), /_modelCtxFichier/);
  });

  test('RÉGRESSION : l\'import demande l\'autorisation AVANT de créer', () => {
    // Il y avait DEUX fonctions : « comme Modèle » et « comme Scène », et ma première version de
    // ce test comptait les appels, ce qui était fragile. Elle vérifie maintenant que CHAQUE
    // fonction exportée porte le crochet, ce qui reste vrai depuis qu'il n'en reste qu'une.
    ['importModelIntoPanel'].forEach(fn => {
      const debut = IMPORT.indexOf(`export async function ${fn}`);
      assert.ok(debut > 0, `fonction introuvable : ${fn}`);
      const corps = IMPORT.slice(debut, IMPORT.indexOf('\n}', debut));
      assert.match(corps, /await _confirmerImport\(/, `${fn} ne demande pas l'autorisation`);
      // ET AVANT toute modification du Projet. Signalé à l'usage : l'Élément apparaissait dans la
      // Case pendant que la modale était encore ouverte. `snapshot` est le premier geste qui touche
      // au Projet, le point de contrôle doit le précéder, sinon il n'y aurait plus rien à annuler.
      assert.ok(corps.indexOf('_confirmerImport(') < corps.indexOf('_snapshot()'),
        `${fn} modifie le Projet AVANT de demander`);
    });
  });

  test('RÉGRESSION : un refus interrompt l\'import, il ne se contente pas de ne rien enregistrer', () => {
    // Choix de l'utilisateur : « Annuler » pendant un import annule l'import entier, pas seulement
    // la correspondance. Sans le `return`, la modale serait purement décorative.
    ['importModelIntoPanel'].forEach(fn => {
      const debut = IMPORT.indexOf(`export async function ${fn}`);
      const corps = IMPORT.slice(debut, IMPORT.indexOf('\n}', debut));
      assert.match(corps, /if \(!await _confirmerImport\([^)]*\)\) return null;/,
        `${fn} ignore le refus`);
    });
  });

  test('RÉGRESSION : sans crochet branché, l\'import continue', () => {
    // Le défaut par défaut doit être le comportement d'origine. Un `false` implicite bloquerait
    // TOUS les imports dès qu'un appelant oublie de câbler le crochet, y compris les tests.
    assert.match(IMPORT, /let _confirmerImport = async \(\) => true;/);
    assert.match(IMPORT, /_confirmerImport = confirmerImport \|\| \(async \(\) => true\);/);
  });

  test('RÉGRESSION : l\'attente de la réponse est bien AWAITÉE', () => {
    // Sans `await`, on compare une PROMESSE à false, toujours vrai, et l'import se poursuit quoi
    // que l'utilisateur réponde. Défaut que j'ai écrit puis corrigé dans le même commit.
    const EV = _lire(_joindre(_RACINE, 'src/events.js'), 'utf8');
    const debut = EV.indexOf('async function proposerCorrespondance');
    const corps = EV.slice(debut, EV.indexOf('\n}', debut));
    assert.match(corps, /return await openSkeletonMapModal\(/,
      'la promesse de la modale n\'est pas attendue');
  });

  test('RÉGRESSION : « Tout remettre en automatique » ne rouvre PAS l\'écran', () => {
    // Rouvrir créerait une seconde promesse et abandonnerait la première : pendant un import,
    // l'appelant attendrait indéfiniment une réponse que plus personne ne donnerait. Un blocage
    // silencieux, sans message ni erreur, la pire forme de panne dans ce dépôt.
    const EV = _lire(_joindre(_RACINE, 'src/events.js'), 'utf8');
    const debut = EV.indexOf("skeletonMapReset').onclick");
    const corps = EV.slice(debut, EV.indexOf('\n};', debut));
    assert.doesNotMatch(corps, /openSkeletonMapModal\(/, 'le bouton rouvre l\'écran');
    assert.match(corps, /renderSkeletonMapModal\(\)/, 'l\'écran ouvert n\'est pas rafraîchi');
  });

  test('le bouton Annuler dit qu\'il annule l\'IMPORT quand c\'en est un', () => {
    // Un bouton nommé « Annuler » qui fait disparaître un modèle serait un piège.
    const EV = _lire(_joindre(_RACINE, 'src/events.js'), 'utf8');
    assert.match(EV, /Annuler l\\'import/);
  });

  test('RÉGRESSION : supprimer un modèle oublie sa correspondance', () => {
    // Sans cela, une entrée orpheline resterait dans un fichier partagé par tous les Projets, et
    // ressusciterait au réimport d'un homonyme, avec les os de l'ANCIEN squelette.
    const bloc = EVENTS.slice(EVENTS.indexOf("ctxDeleteModel').onclick"));
    assert.match(bloc.slice(0, bloc.indexOf('\n};')), /oublierCorrespondance\(/);
  });

  test('un échec d\'enregistrement est rapporté', () => {
    const bloc = EVENTS.slice(EVENTS.indexOf("skeletonMapSave').onclick"));
    assert.match(bloc.slice(0, bloc.indexOf('\n};')), /alertAction/);
  });

  test('les classes d\'origine existent dans style.css', () => {
    const CSS = _lire(_joindre(_RACINE, 'style.css'), 'utf8');
    ['origine-nom', 'origine-structure', 'origine-manuel', 'origine-vide']
      .forEach(c => assert.match(CSS, new RegExp(`\\.${c}`), `classe absente : .${c}`));
  });
});

describe('Une correspondance VALIDÉE cesse d\'alerter, sans perdre sa provenance', () => {
  const EV2 = _lire(_joindre(_RACINE, 'src/events.js'), 'utf8');
  const CSS2 = _lire(_joindre(_RACINE, 'style.css'), 'utf8');
  const HTML2 = _lire(_joindre(_RACINE, 'index.html'), 'utf8');

  test('RÉGRESSION : l\'écran sait si la correspondance a été validée', () => {
    // Signalé à l'usage : après validation, les lignes « structure » restaient orangées et
    // donnaient l'impression qu'il restait à vérifier. L'état vient de l'entrée relue.
    const debut = EV2.indexOf('async function openSkeletonMapModal');
    const corps = EV2.slice(debut, EV2.indexOf('\n}', debut));
    assert.match(corps, /valide: !!\(enregistree && enregistree\.valide\)/);
  });

  test('RÉGRESSION : les étiquettes de provenance NE sont PAS remplacées par « validé »', () => {
    // C'était l'argument décisif contre l'autre option : sur worker_j, les deux cuisses sont en
    // « structure » parce que le fichier les nomme « Left leg », un mot qui, chez Mixamo, désigne
    // le tibia. Tout marquer « validé » effacerait la trace de la seule ligne sur laquelle il a
    // fallu réfléchir, noyée parmi dix-sept évidences.
    const debut = EV2.indexOf('function ligneCorrespondance');
    const corps = EV2.slice(debut, EV2.indexOf('\n}', debut));
    assert.match(corps, /origine-\$\{origine\}/, 'la classe ne porte plus la provenance');
    assert.doesNotMatch(corps, /origine-valide/, 'la provenance a été remplacée par un état');
  });

  test('c\'est le CSS qui calme les lignes, via une classe sur la liste', () => {
    assert.match(EV2, /skeleton-map-list' \+ \(valide \? ' validee' : ''\)/);
    assert.match(CSS2, /\.skeleton-map-list\.validee \.skeleton-map-row\.a-verifier/);
    assert.match(CSS2, /\.skeleton-map-list\.validee \.skeleton-map-origin\.origine-structure/);
  });

  test('RÉGRESSION : « Réinitialiser » fait repasser l\'écran en NON validé', () => {
    // Sans cela, le bouton effacerait bien les décisions mais l'écran resterait d'apparence
    // confirmée, les lignes que l'utilisateur vient justement de vouloir revoir resteraient
    // muettes. C'est tout l'objet du bouton.
    const debut = EV2.indexOf("skeletonMapReset').onclick");
    const corps = EV2.slice(debut, EV2.indexOf('\n};', debut));
    assert.match(corps, /_skelEcran\.valide = false/);
  });

  test('RÉGRESSION : modifier un emplacement DÉvalide l\'écran', () => {
    // Rien n'est écrit avant Enregistrer. Garder l'apparence « validée » pendant qu'on modifie
    // laisserait croire que le changement est déjà acquis.
    const debut = EV2.indexOf('sel.onchange');
    const corps = EV2.slice(debut, EV2.indexOf('\n  };', debut));
    assert.match(corps, /_skelEcran\.valide = false/);
  });

  test('RÉGRESSION : l\'ordre des boutons est Annuler, Réinitialiser, Enregistrer', () => {
    // Ordre demandé : les deux sorties neutres d'abord, l'action affirmative en dernier. Une
    // énumération dans du HTML, donc invisible pour tout le reste, d'où ce test.
    //
    // ⚠️ LA FENÊTRE VA JUSQU'À LA MODALE SUIVANTE, ET NON SUR 1400 CARACTÈRES. C'était le cas, et
    // ce test a cassé le jour où un commentaire a été ajouté DANS la modale : les trois boutons
    // sont sortis de la fenêtre, et l'échec accusait l'ordre alors que l'ordre n'avait pas bougé.
    // Un test qui se déclenche sur autre chose que ce qu'il prétend mesurer envoie sur une fausse
    // piste, ce qui est pire que de ne pas exister.
    const debut = HTML2.indexOf('id="skeletonMapModal"');
    const suivante = HTML2.indexOf('modal-overlay', debut + 20);
    const bloc = HTML2.slice(debut, suivante > 0 ? suivante : undefined);
    const ordre = [...bloc.matchAll(/id="(skeletonMap(?:Cancel|Reset|Save))"/g)].map(m => m[1]);
    assert.deepEqual(ordre, ['skeletonMapCancel', 'skeletonMapReset', 'skeletonMapSave']);
  });

  test('le bouton s\'appelle « Réinitialiser »', () => {
    // « Tout remettre en automatique » était trop long (retour utilisateur).
    assert.match(HTML2, /id="skeletonMapReset"[^>]*>Réinitialiser</);
  });

  test('validé, le sous-titre ne compte plus ce qu\'il « reste à vérifier »', () => {
    // Il ne reste rien : c'est fait. Le décompte n'a de sens que tant que la décision n'est pas
    // prise, l'afficher après coup reproduit l'alerte qu'on vient de retirer.
    //
    // ⚠️ CE TEST LISAIT 700 CARACTÈRES DE SOURCE après le mot `skeletonMapSubtitle`. Il cherchait
    // une ternaire sur `valide`, ce qui ne dit RIEN de ce qui s'affiche : la fenêtre s'est cassée
    // dès que le texte a été sorti dans une fonction pure. C'est ce texte qu'on compare désormais.
    const proposition = [{ roles: [
      { cle: 'tete', osNom: 'Head', origine: 'nom' },
      { cle: 'cou', osNom: 'Neck', origine: 'structure' },
    ] }];
    const arg = { fichier: 'x.glb', os: [{ id: 1, name: 'Head' }], proposition };
    const encours = sousTitreCorrespondance3D({ ...arg, valide: false }, tr);
    const fait = sousTitreCorrespondance3D({ ...arg, valide: true }, tr);
    assert.match(encours, /à vérifier/);
    assert.doesNotMatch(fait, /à vérifier/, 'le décompte d\'alerte survit à la validation');
    assert.match(fait, /✓/);
  });

  test('LA MÊME PHRASE des deux côtés, et elle compte des RÔLES (#378b)', () => {
    // Elle disait « 18 sur 18 trouvés, 12 à vérifier » pour un humanoïde et « 7 chaînes, 7
    // retenues » pour une créature : deux comptes, deux vocabulaires, pour la même question.
    // Signalé à l'usage comme faisant partie de ce qui rendait les deux écrans trop différents.
    const roles = (n, remplis, surs) => [{ roles: Array.from({ length: n }, (_, i) => ({
      cle: 'r' + i, osNom: i < remplis ? 'Os' + i : null, origine: i < surs ? 'nom' : 'structure',
    })) }];
    const creature = sousTitreCorrespondance3D(
      { fichier: 'araignee.glb', os: [{ id: 1 }], proposition: roles(13, 13, 3), valide: false }, tr);
    assert.match(creature, /13 sur 13 attribués, 10 à vérifier/);
    const humain = sousTitreCorrespondance3D(
      { fichier: 'worker.glb', os: [{ id: 1 }], proposition: roles(18, 18, 18), valide: false }, tr);
    assert.match(humain, /18 sur 18 attribués/);
    assert.doesNotMatch(humain, /à vérifier/, 'rien à vérifier ne doit rien annoncer');
  });
});

describe('La légende dit l\'état, pas le devenir', () => {
  // LES COMMENTAIRES SONT RETIRÉS AVANT TOUTE COMPARAISON, et ce n'est pas une précaution
  // théorique : ma première version de ce test a échoué sur son propre remède. Le commentaire que
  // je venais d'écrire CITE l'ancienne formule, « manuel disait votre choix, enregistré », et le
  // `doesNotMatch` la retrouvait là. Quatrième occurrence dans ce dépôt d'un test satisfait (ou ici
  // mis en échec) par la prose qui l'entoure.
  const sansCommentaires = (txt) => txt
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');
  const EV3 = sansCommentaires(_lire(_joindre(_RACINE, 'src/events.js'), 'utf8'));
  const CSS3 = _lire(_joindre(_RACINE, 'style.css'), 'utf8');
  const debut = EV3.indexOf("getElementById('skeletonMapLegend')");
  const bloc = EV3.slice(debut, debut + 1600);

  test('RÉGRESSION : « manuel » ne prétend plus être ENREGISTRÉ', () => {
    // Signalé à l'usage, et c'était faux : changer une liste déroulante passe la ligne en « manuel »
    // IMMÉDIATEMENT, alors que rien n'est écrit avant Enregistrer. Une légende décrit un état, pas
    // un devenir, annoncer un enregistrement qui n'a pas eu lieu est la même famille de faute que
    // « un succès annoncé pour un travail sans effet ».
    assert.doesNotMatch(bloc, /votre choix, enregistré/);
    assert.doesNotMatch(bloc, /your choice, saved/);
    assert.match(bloc, /vous avez choisi cet os/);
  });

  test('les trois libellés décrivent ce que l\'étiquette signifie au moment où on la lit', () => {
    // L'apostrophe est ÉCHAPPÉE dans la source (`l\\'os`) : chercher `l'os` ne trouve rien. Piège
    // banal quand on teste du texte français par lecture de source, et deuxième échec de ce test
    // avant qu'il ne serve à quelque chose.
    [/le nom de l\\?'os le confirme/, /déduit de la forme du squelette/, /vous avez choisi cet os/]
      .forEach(m => assert.match(bloc, m, `libellé absent : ${m}`));
  });

  test('RÉGRESSION : la distinction perdue est dite ailleurs, pas supprimée', () => {
    // Le mot « enregistré » portait une VRAIE information : seules les lignes « manuel » sont
    // conservées dans le fichier, les autres sont recalculées. La retirer sans la redire aurait
    // rendu incompréhensible pourquoi la reconnaissance peut changer d'un jour à l'autre.
    assert.match(bloc, /Seuls vos choix sont conservés/);
    assert.match(bloc, /recalculées à chaque ouverture/);
    assert.match(CSS3, /\.skeleton-map-legend-note/, 'la note n\'a pas de style propre');
  });

  test('la note occupe sa propre ligne, pour ne pas passer pour une quatrième catégorie', () => {
    const i = CSS3.indexOf('.skeleton-map-legend-note');
    assert.match(CSS3.slice(i, CSS3.indexOf('}', i)), /flex-basis:\s*100%/);
  });
});


describe('renommerCorrespondance : la carte d\'os suit le fichier renommé', () => {
  // ÉCRIT APRÈS UNE MUTATION ÉCHAPPÉE : transformer le DÉPLACEMENT en simple copie, garder
  // l'ancienne clé en plus de la nouvelle, ne faisait échouer aucun test. À l'usage, l'entrée
  // orpheline ressusciterait le jour où un homonyme est réimporté, avec les os de l'ANCIEN
  // squelette : exactement la panne contre laquelle `oublierCorrespondance` avait été écrite.
  beforeEach(() => {
    pontRepond = { ok: true, data: { version: 1, entrees: {
      'vieux.glb': { os: { bassin: 'Hips' }, valide: true },
      'autre.glb': { os: { tete: 'Head' }, valide: true },
    } } };
  });

  test('la nouvelle clé porte l\'entrée, et l\'ancienne DISPARAÎT', async () => {
    const r = await renommerCorrespondance('vieux.glb', 'neuf.glb');
    assert.equal(r.ok, true);
    assert.equal(ecrit.length, 1, 'une seule écriture, pas deux');
    const entrees = ecrit[0].entrees;
    assert.deepEqual(entrees['neuf.glb'], { os: { bassin: 'Hips' }, valide: true });
    assert.ok(!('vieux.glb' in entrees), 'l\'ancienne clé subsiste : entrée orpheline');
    assert.ok('autre.glb' in entrees, 'les autres correspondances ont été perdues');
  });

  test('le cache résident suit, sans relire le disque', async () => {
    await renommerCorrespondance('vieux.glb', 'neuf.glb');
    assert.deepEqual(correspondanceEnregistreeSync('neuf.glb'), { os: { bassin: 'Hips' }, valide: true });
    assert.equal(correspondanceEnregistreeSync('vieux.glb'), null);
  });

  test('un fichier SANS correspondance : rien à écrire, et ce n\'est pas un échec', async () => {
    // Le cas le plus courant : une chaise, un décor : aucun os, donc aucune correspondance.
    const r = await renommerCorrespondance('inconnu.glb', 'neuf.glb');
    assert.equal(r.ok, true);
    assert.deepEqual(ecrit, [], 'une écriture inutile a été faite');
  });

  test('une écriture refusée ne touche pas au cache', async () => {
    setSkeletonBridge({
      readSkeletonMaps: async () => pontRepond,
      writeSkeletonMaps: async () => ({ ok: false, error: 'disque plein' }),
    });
    const r = await renommerCorrespondance('vieux.glb', 'neuf.glb');
    assert.equal(r.ok, false);
    assert.equal(correspondanceEnregistreeSync('neuf.glb'), null, 'le cache annonce un renommage qui n\'a pas eu lieu');
    assert.ok(correspondanceEnregistreeSync('vieux.glb'), 'l\'ancienne entrée a été perdue malgré l\'échec');
  });

  test('les cas dégénérés ne cassent rien', async () => {
    assert.equal((await renommerCorrespondance('a.glb', 'a.glb')).ok, true);
    assert.equal((await renommerCorrespondance('', 'b.glb')).ok, false);
  });
});

describe('morphologie : un AJOUT au fichier, jamais un renommage (#369)', () => {
  // POURQUOI `SKELETON_MAP_FORMAT` NE BOUGE PAS. Une version antérieure de l'application ignore une
  // clé qu'elle ne connaît pas et continue de lire `os` et `valide`. Passer la version à 2 lui
  // ferait au contraire rejeter le fichier ENTIER, `normaliserFichier` refusant tout format futur.
  // Ajouter sans toucher à la version est ce qui garde la compatibilité dans les DEUX sens.

  test('une morphologie choisie est écrite, une morphologie proposée ne l\'est pas', () => {
    // MÊME RÈGLE QUE POUR LES EMPLACEMENTS, et pour la même raison : on n'enregistre que le choix
    // HUMAIN. Figer l'archétype proposé condamnerait toute amélioration du classement, qui
    // trouverait une morphologie « enregistrée » sur chaque fichier jamais touché.
    assert.deepEqual(entreePourFichier({}, { valide: true, morphologie: 'quadrupede' }),
      { os: {}, valide: true, morphologie: 'quadrupede' });
    assert.deepEqual(entreePourFichier({}, { valide: true }), { os: {}, valide: true });
    assert.deepEqual(entreePourFichier({}, { valide: true, morphologie: null }), { os: {}, valide: true });
  });

  test('une morphologie SEULE suffit à créer une entrée', () => {
    // Sans cette clause, choisir « quadrupède » sans rien corriger d'autre et sans valider
    // n'écrirait rien : le choix serait perdu à la fermeture, silencieusement.
    assert.deepEqual(entreePourFichier({}, { valide: false, morphologie: 'radial' }),
      { os: {}, valide: false, morphologie: 'radial' });
    assert.equal(entreePourFichier({}, { valide: false }), null, 'rien du tout reste rien');
  });

  test('une clé INCONNUE est écartée, à l\'écriture comme à la relecture', () => {
    // Un fichier écrit à la main, ou par une version future qui aurait ajouté un archétype, ne doit
    // pas imposer une valeur que l'interface ne saurait pas afficher : la liste déroulante ne la
    // contiendrait pas, et le sélecteur retomberait sur son premier élément sans rien dire.
    assert.deepEqual(entreePourFichier({}, { valide: true, morphologie: 'licorne' }),
      { os: {}, valide: true });
    const relu = normaliserFichier({
      version: 1,
      entrees: { 'a.glb': { os: {}, valide: true, morphologie: 'licorne' } },
    });
    assert.deepEqual(relu.entrees['a.glb'], { os: {}, valide: true });
  });

  test('la relecture conserve une morphologie connue', () => {
    const relu = normaliserFichier({
      version: 1,
      entrees: { 'a.glb': { os: {}, valide: false, morphologie: 'serpentin' } },
    });
    assert.deepEqual(relu.entrees['a.glb'], { os: {}, valide: false, morphologie: 'serpentin' });
    assert.equal(relu.version, 1, 'la version du format ne bouge pas');
  });

  test('un fichier d\'AVANT, sans morphologie, se relit sans rien perdre', () => {
    // La compatibilité descendante, épinglée : tous les Projets existants sont dans ce cas.
    const relu = normaliserFichier({
      version: 1,
      entrees: { 'a.glb': { os: { bassin: 'Hips' }, valide: true } },
    });
    assert.deepEqual(relu.entrees['a.glb'], { os: { bassin: 'Hips' }, valide: true });
    assert.ok(!('morphologie' in relu.entrees['a.glb']), 'aucune clé inventée');
  });
});

describe('membres : le second AJOUT au fichier (#373)', () => {
  // MÊME RÈGLE QUE `os` ET `morphologie`, pour la même raison : on n'écrit que le choix HUMAIN.
  // Figer les noms proposés condamnerait toute amélioration du vocabulaire de nommage, qui
  // trouverait un nom « enregistré » sur chaque chaîne que personne n'a jamais touchée.

  test('une ligne sans nom tapé ET non décochée n\'apprend rien, elle n\'est pas écrite', () => {
    assert.equal(entreePourFichier({}, { membres: [{ racine: 'Bone_L', retenu: true }] }), null);
    assert.equal(entreePourFichier({}, { membres: [{ racine: 'Bone_L' }] }), null);
  });

  test('un nom tapé est gardé, un décochage aussi, et séparément', () => {
    assert.deepEqual(entreePourFichier({}, { membres: [{ racine: 'Bone_L', nom: 'Patte avant G', retenu: true }] }),
      { os: {}, valide: false, membres: [{ racine: 'Bone_L', nom: 'Patte avant G', retenu: true }] });
    // Décochée sans nom : on garde le décochage SEUL, pas un nom qu'on aurait recopié de la
    // proposition. C'est ce qui laisse le vocabulaire libre de changer d'avis plus tard.
    assert.deepEqual(entreePourFichier({}, { membres: [{ racine: 'Bone_L', retenu: false }] }),
      { os: {}, valide: false, membres: [{ racine: 'Bone_L', retenu: false }] });
  });

  test('une ligne SANS racine est écartée, à l\'écriture comme à la relecture', () => {
    // Sans racine, la ligne ne désigne aucune chaîne : elle disparaîtrait de l'écran en silence,
    // en emportant le nom que l'utilisateur avait tapé.
    assert.equal(entreePourFichier({}, { membres: [{ nom: 'Sans racine', retenu: false }] }), null);
    const relu = normaliserFichier({
      version: 1,
      entrees: { 'a.glb': { os: {}, valide: true, membres: [{ nom: 'x', retenu: false }, 'pas un objet'] } },
    });
    assert.deepEqual(relu.entrees['a.glb'], { os: {}, valide: true });
  });

  test('la relecture conserve des membres bien formés, sans toucher à la version', () => {
    const relu = normaliserFichier({
      version: 1,
      entrees: { 'a.glb': { os: {}, valide: false, membres: [{ racine: 'B', nom: 'Aile G', retenu: true }] } },
    });
    assert.deepEqual(relu.entrees['a.glb'],
      { os: {}, valide: false, membres: [{ racine: 'B', nom: 'Aile G', retenu: true }] });
    assert.equal(relu.version, 1);
  });

  test('les trois ajouts cohabitent, et un fichier d\'AVANT se relit intact', () => {
    const complet = entreePourFichier({}, { valide: true, morphologie: 'quadrupede', membres: [{ racine: 'B', nom: 'Queue', retenu: true }] });
    assert.deepEqual(Object.keys(complet), ['os', 'valide', 'morphologie', 'membres']);
    const ancien = normaliserFichier({ version: 1, entrees: { 'a.glb': { os: { bassin: 'Hips' }, valide: true } } });
    assert.deepEqual(ancien.entrees['a.glb'], { os: { bassin: 'Hips' }, valide: true });
  });
});

describe('L\'écran montre les MEMBRES, pas seulement dix-huit emplacements (#373)', () => {
  const EV2 = _lire(_joindre(_RACINE, 'src/events.js'), 'utf8');
  const CSS2 = _lire(_joindre(_RACINE, 'style.css'), 'utf8');
  const HTML2 = _lire(_joindre(_RACINE, 'index.html'), 'utf8');

  // Signalé à l'usage : les têtes latérales d'un cerbère et les pattes surnuméraires d'une araignée
  // étaient invisibles. Ces tests lisent la SOURCE, comme le reste de ce fichier : le rendu touche
  // au DOM et n'est pas exécutable ici, mais les décisions qu'il porte doivent tenir.

  test('la section existe dans le HTML, et APRÈS les dix-huit emplacements', () => {
    // L'ordre comptait quand les deux étaient visibles ensemble. Depuis #374 ils s'excluent, mais
    // l'ordre reste : il décide de la place qu'occupe celle des deux qui est affichée.
    assert.match(HTML2, /id="skeletonMapMembres"/);
    assert.ok(HTML2.indexOf('id="skeletonMapList"') < HTML2.indexOf('id="skeletonMapMembres"'));
  });

  test('la section est effectivement RENDUE, pas seulement écrite', () => {
    // TROU TROUVÉ PAR MUTATION : retirer l'appel dans `renderSkeletonMapModal` ne faisait échouer
    // aucun test, tous portant sur le contenu de `renderMembres`. Une fonction jamais appelée passe
    // toutes les inspections de source du monde.
    const debut = EV2.indexOf('function renderSkeletonMapModal');
    assert.match(EV2.slice(debut, EV2.indexOf('\n}', debut)), /renderChainesSansRole\(/);
  });

  test('UN SEUL CHEMIN de rendu pour les deux morphologies (#378b)', () => {
    // ⚠️ CE TEST EXIGEAIT DEUX BRANCHES, celles de #374 : un `if (humanoide)` pour les dix-huit
    // emplacements, un `renderMembres` pour les chaînes. Signalé à l'usage : « j'aime beaucoup le
    // rendu pour les humanoïdes, pour les autres archétypes je trouve ça trop différent ». Les deux
    // branches ont disparu. Un humanoïde relit `inferSkeletonMap`, une créature ses chaînes, mais
    // l'ÉCRAN ne voit plus la différence : des membres, des rôles, des menus d'os.
    const debut = EV2.indexOf('function renderSkeletonMapModal');
    const corps = EV2.slice(debut, EV2.indexOf('\n}', debut));
    assert.match(corps, /propositionDeRoles3D\(/, 'le rendu ne passe plus par le modèle unique');
    assert.doesNotMatch(corps, /SLOT_GROUPS/, 'les dix-huit emplacements ont retrouvé un chemin à eux');
    assert.match(corps, /proposition\.forEach\(membre => skeletonMapList\.appendChild\(groupeDeMembre/);
  });

  test('le chemin d\'une chaîne se lit, et se tronque au-delà de quatre os', () => {
    // Le même texte sert à DEUX endroits, la ligne d'un membre et celle du tronc. Écrit en ligne aux
    // deux, il n'était vérifiable qu'en lisant le code, et une mutation qui vidait celui du tronc a
    // ÉCHAPPÉ : le test cherchait `lignes.tronc.segments`, qui apparaît aussi dans le compte affiché
    // juste au-dessus, et le trouvait donc toujours.
    const os = [1, 2, 3, 4, 5, 6].map(i => ({ id: i, name: `Os${i}` }));
    assert.equal(cheminDOs3D([1, 2, 3], os), 'Os1 › Os2 › Os3');
    assert.equal(cheminDOs3D([1, 2, 3, 4, 5, 6], os, 4), 'Os1 › Os2 › Os3 › Os4 › …');
    assert.equal(cheminDOs3D([1, 2, 3, 4], os, 4), 'Os1 › Os2 › Os3 › Os4', 'pile quatre ne se tronque pas');
    assert.equal(cheminDOs3D([1, 99], os), 'Os1', 'un identifiant inconnu est sauté, il ne lève pas');
    assert.equal(cheminDOs3D(null, null), '');
  });

  test('le TRONC figure dans la liste, sans case ni champ', () => {
    // Les deux écrans doivent lister la même chose : le tronc porte des curseurs, il doit donc se
    // voir ici. Sans case ni champ, parce qu'il n'y a rien à y choisir.
    const debut = EV2.indexOf('function renderChainesSansRole');
    const corps = EV2.slice(debut, EV2.indexOf('\n}', debut));
    assert.match(corps, /cheminDOs3D\(lignes\.tronc\.segments, os\)/, 'le tronc a perdu ses os');
    assert.match(corps, /lignes\.tronc\.nom/);
    // La ligne du tronc ne doit PAS passer par `ligneMembre`, qui pose une case et un champ : les
    // cocher ou le renommer n'aboutirait nulle part, `normaliserMembres` ne gardant que des racines
    // de chaînes.
    const bloc = corps.slice(corps.indexOf('troncBloc'), corps.indexOf('lignes.groupes.forEach'));
    assert.doesNotMatch(bloc, /ligneMembre|checkbox/, 'le tronc a gagné une case ou un champ');
  });

  test('changer la morphologie ÉCHANGE les deux sections tout de suite', () => {
    // Sans ce nouveau rendu, corriger « humanoïde » en « arachnide » laisserait l'écran affichant
    // les emplacements qu'il vient de rendre inertes, et la conséquence du choix serait invisible.
    const debut = EV2.indexOf('function renderMorphologie');
    assert.ok(debut > 0, 'renderMorphologie a disparu');
    const zone = EV2.slice(debut, debut + 3000);
    assert.match(zone, /_skelEcran\.morphologieManuelle = sel\.value/);
    assert.match(zone, /renderSkeletonMapModal\(\)/, 'le choix ne redessine plus l\'écran');
  });

  test('les MEMBRES RELUS repartent de l\'entrée enregistrée, pas d\'une liste vide', () => {
    // Sans cela, rouvrir l'écran perdrait chaque nom tapé et chaque décochage : ils seraient bien
    // sur le disque, mais l'écran repartirait des propositions, et « Enregistrer » les effacerait.
    const debut = EV2.indexOf('async function openSkeletonMapModal');
    const corps = EV2.slice(debut, EV2.indexOf('\n}', debut));
    assert.match(corps, /enregistree && enregistree\.membres/);
  });

  test('RÉGRESSION : le menu d\'os est indexé par NOM, pas par identifiant', () => {
    // Un rôle de créature ne connaît que le nom de son os, comme le fichier de correspondances, qui
    // mémorise des noms depuis toujours : « un indice de nœud glTF n'a de sens que pour un fichier
    // donné ». Faire coexister les deux clés redonnerait à cet écran les deux vocabulaires qu'il
    // vient d'unifier.
    const debut = EV2.indexOf('function ligneCorrespondance');
    const corps = EV2.slice(debut, EV2.indexOf('\n}', debut));
    assert.match(corps, /opt\.value = o\.name/, 'le menu est revenu aux identifiants');
    assert.match(corps, /role\.osNom === o\.name/, 'la sélection ne se retrouve plus par le nom');
    assert.match(corps, /os\.find\(o => o\.name === sel\.value\)/);
  });

  test('RÉGRESSION : les rôles enregistrés sont RELUS à l\'ouverture', () => {
    // Sans cela, rouvrir l'écran repartirait des propositions et « Enregistrer » effacerait chaque
    // correction. Même défaut que celui des membres, corrigé en #373 : ils seraient bien sur le
    // disque, mais l'écran ne les montrerait plus.
    const debut = EV2.indexOf('async function openSkeletonMapModal');
    const corps = EV2.slice(debut, EV2.indexOf('\n}', debut));
    assert.match(corps, /enregistree && enregistree\.roles/, 'les rôles relus sont ignorés');
  });

  test('le sous-titre ne compte comme ATTRIBUÉ que ce qui porte un os', () => {
    // « 13 sur 13 attribués » sur un modèle dont trois rôles sont vides annoncerait un travail
    // terminé qui ne l'est pas. C'est la famille de fautes que ce dépôt appelle « un succès annoncé
    // pour un travail sans effet ».
    const proposition = [{ roles: [
      { cle: 'a', osNom: 'Os1', origine: 'nom' },
      { cle: 'b', osNom: null, origine: 'vide' },
    ] }];
    const t = sousTitreCorrespondance3D({ fichier: 'x.glb', os: [{ id: 1 }], proposition, valide: false }, tr);
    assert.match(t, /1 sur 2 attribués/);
  });

  test('RÉGRESSION : `os` OU `roles`, jamais les deux, à l\'enregistrement', () => {
    // Un humanoïde écrit ses emplacements, une créature ses rôles, et la morphologie tranche. Deux
    // clés désignant le même bout de squelette finiraient par se contredire, et rien ne dirait
    // laquelle croire — cf. docs/en/persisted-data.md.
    const debut = EV2.indexOf("document.getElementById('skeletonMapSave')");
    const corps = EV2.slice(debut, EV2.indexOf('\n};', debut));
    assert.match(corps, /humanoide \? _skelEcran\.carte : \{\}/,
      'une créature enverrait sa carte d\'emplacements sur le disque');
    assert.match(corps, /roles: humanoide \? null : _skelEcran\.roles/,
      'un humanoïde enverrait des rôles à côté de ses emplacements');
    // Le drapeau dit QUEL vocabulaire cet enregistrement réécrit, et donc lequel des deux doit être
    // conservé tel quel (#382). Sans lui, `entreePourFichier` retombe sur son défaut « humanoïde »
    // et une créature efface les emplacements du fichier.
    assert.match(corps, /humanoide \}\)/, 'le drapeau de vocabulaire n\'est plus transmis');
  });

  test('RÉGRESSION : « Réinitialiser » efface AUSSI les rôles et les membres', () => {
    // Le bouton promet de retrouver l'écran tel qu'il se présente la première fois. En laisser une
    // moitié rendrait cette promesse fausse pour une créature, dont les corrections vivent
    // justement là et nulle part ailleurs.
    const debut = EV2.indexOf("document.getElementById('skeletonMapReset')");
    const corps = EV2.slice(debut, EV2.indexOf('\n};', debut));
    assert.match(corps, /_skelEcran\.roles = \{\}/, 'les rôles survivent à la réinitialisation');
    assert.match(corps, /_skelEcran\.membres = \[\]/, 'les membres survivent à la réinitialisation');
  });

  test('un membre se replie quand il est SÛR, et le nom d\'ancre a disparu (#378b)', () => {
    // ⚠️ CE TEST EXIGEAIT L'INVERSE. Il épinglait le regroupement par ANCRE décidé en #373, c'est
    // à dire un en-tête « Sur CERBERUS__Spine_03 » : un nom d'os BRUT là où l'écran humanoïde disait
    // « Bras gauche ». L'ancre est un détail de la décomposition qui avait fui jusqu'à l'affichage,
    // et c'était le plus voyant de l'écart entre les deux écrans.
    const debut = EV2.indexOf('function groupeDeMembre');
    const corps = EV2.slice(debut, EV2.indexOf('\n}', debut));
    assert.match(corps, /createElement\('details'\)/, 'un membre ne se replie plus');
    assert.match(corps, /bloc\.open = !membre\.sur/, 'le repli ne suit plus la certitude');
    assert.match(corps, /tete\.textContent = membre\.label/, 'l\'en-tête n\'est plus le libellé du membre');
    const rendu = EV2.slice(EV2.indexOf('function renderSkeletonMapModal'), EV2.indexOf('function ligneMembre'));
    assert.doesNotMatch(rendu, /ancreNom/, 'un nom d\'ancre brut est revenu dans l\'écran');
  });

  test('un nom se retient À CHAQUE FRAPPE, pas au `change`', () => {
    // Sans quoi taper un nom puis cliquer « Enregistrer » sans quitter le champ perdrait la saisie.
    // C'est le dernier champ qu'on touche avant de valider, donc le cas le plus fréquent.
    const debut = EV2.indexOf('function ligneMembre');
    const corps = EV2.slice(debut, EV2.indexOf('\n}', debut));
    assert.match(corps, /champ\.oninput/);
    assert.ok(!/champ\.onchange/.test(corps), 'onchange perdrait la dernière saisie');
  });

  test('un nom VIDÉ efface le choix au lieu d\'enregistrer une chaîne vide', () => {
    // L'utilisateur qui efface tout demande à revenir au nom proposé, pas à nommer son membre
    // « rien ». C'est la seule façon de revenir en arrière ; aucun bouton ne le ferait mieux.
    const debut = EV2.indexOf('function noterMembre');
    const corps = EV2.slice(debut, EV2.indexOf('\n}', debut));
    assert.match(corps, /delete e\.nom/);
    assert.match(corps, /liste\.splice/, 'une ligne redevenue muette sort de la liste');
  });

  test('RÉGRESSION : ouvrir l\'écran repart TOUJOURS de ce qui est enregistré (#385)', () => {
    // Signalé à l'usage : « je passe le cerbère en quadrupède, j'enregistre, je rouvre, et il est de
    // nouveau humanoïde ». Le fichier sur le disque portait bien `quadrupede` : c'est cette
    // vérification, faite par l'utilisateur, qui a permis de chercher du bon côté.
    //
    // LA CAUSE : le bouton de la fiche passait `ignorerEnregistree: true`, un drapeau écrit pour
    // « Réinitialiser », dont le rôle est justement de JETER ce qui a été enregistré. Ouvrir cet
    // écran depuis une fiche repartait donc de la reconnaissance automatique et perdait tout :
    // morphologie, emplacements corrigés, chaînes cochées, rôles. Enregistrer ensuite écrasait le
    // fichier avec la proposition automatique.
    //
    // ⚠️ LE DRAPEAU EST SUPPRIMÉ, PAS CORRIGÉ. Sa documentation désignait un appelant qui ne
    // l'utilisait pas, « Tout remettre en automatique » passant en réalité par
    // `oublierCorrespondance`. Un drapeau dont la doc invoque un faux appelant donne une raison de
    // le garder, et le prochain lecteur le rebranchera.
    // COMMENTAIRES RETIRÉS AVANT DE CHERCHER : sixième fois dans ce dépôt qu'un test est mis en
    // échec par la prose qui l'entoure. Les deux commentaires qui RACONTENT ce défaut citent
    // nommément le drapeau, et c'est légitime ; ce qu'on interdit, c'est qu'il soit APPELÉ.
    const sansCommentaires = EV2
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');
    assert.doesNotMatch(sansCommentaires, /ignorerEnregistree/,
      'le drapeau qui jette la correspondance enregistrée est revenu');
    const debut = sansCommentaires.indexOf('async function openSkeletonMapModal');
    const corps = sansCommentaires.slice(debut, sansCommentaires.indexOf('\n}', debut));
    assert.match(corps, /const enregistree = tout\.entrees\[nomFichier\];/,
      'l\'ouverture ne relit plus l\'entrée enregistrée sans condition');
  });

  test('« tout cocher » vise l\'état AFFICHÉ, pas celui de la case après clic (#384)', () => {
    // Une araignée porte trente chaînes sans rôle, un rig Unreal plus de deux cents : les décocher
    // une par une pour n'en garder que trois est un travail que personne ne fera deux fois.
    //
    // ⚠️ SUR UNE CASE INDÉTERMINÉE, le navigateur choisit lui-même ce que devient `checked`, et le
    // geste attendu est « tout cocher ». On vise donc l'inverse de ce qui est AFFICHÉ, jamais
    // `coche.checked`, qui dépend d'un comportement qu'on ne contrôle pas.
    const debut = EV2.indexOf('function renderChainesSansRole');
    const corps = EV2.slice(debut, EV2.indexOf('\n}', debut));
    assert.match(corps, /const vers = retenus < restantes\.length/,
      'le sens du geste dépend de la case plutôt que de l\'état affiché');
    assert.doesNotMatch(corps, /coche\.checked\s*\?/, 'la décision lit `checked` après le clic');
    // L'état de la case se DÉDUIT des lignes, il n'est pas retenu à part : une case maîtresse qui
    // garde sa propre mémoire finit par contredire ce qu'elle commande.
    assert.match(corps, /coche\.indeterminate = retenus > 0 && retenus < restantes\.length/);
    // Un seul rendu pour trente lignes : chaque rendu détruit les cases que la boucle parcourt.
    assert.match(corps, /noterMembre\(m\.racine, \{ retenu: vers \}, \{ rendre: false \}\)/);
  });

  test('toucher à un membre DÉVALIDE l\'écran, comme toucher à un emplacement', () => {
    // La ligne doit être DANS le corps de la fonction, pas seulement quelque part dans le fichier :
    // une mutation qui neutralisait la fonction entière passait, le motif étant trouvé ailleurs.
    const debut = EV2.indexOf('function noterMembre(racine, champs, ');
    const corps = EV2.slice(debut, EV2.indexOf('\n}', debut));
    // Le rendu est devenu CONDITIONNEL en #384 : « tout cocher » touche trente lignes d'un coup et
    // ne redessine qu'une fois. La dévalidation, elle, reste inconditionnelle.
    assert.match(corps, /_skelEcran\.valide = false;\n  \/\//);
    assert.match(corps, /if \(rendre\) renderSkeletonMapModal\(\);/);
  });

  test('« Enregistrer » emporte les membres, pas seulement les emplacements', () => {
    const debut = EV2.indexOf('enregistrerCorrespondance(_skelEcran.fichier');
    assert.match(EV2.slice(debut, debut + 220), /membres: _skelEcran\.membres/);
  });

  test('une chaîne écartée reste VISIBLE, seulement estompée', () => {
    // La faire disparaître empêcherait de la retrouver pour la recocher, ce qui est le geste le
    // plus probable après une erreur.
    assert.match(CSS2, /\.skeleton-map-membre\.ecarte\s*\{[^}]*opacity/);
    assert.ok(!/\.skeleton-map-membre\.ecarte\s*\{[^}]*display:\s*none/.test(CSS2));
  });
});
