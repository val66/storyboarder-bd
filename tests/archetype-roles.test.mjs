/**
 * tests/archetype-roles.test.mjs, ce qu'une pose peut viser.
 *
 * Tout ce fichier est PUR : aucun DOM, aucun Three, aucun disque. C'est délibéré, et c'est ce qui
 * rend la tâche #378a testable avant qu'une seule ligne d'interface n'existe. La leçon vient des
 * mutations de #374 et #377, où deux décisions vivaient dans des fonctions qui manipulaient des
 * clones et le DOM : elles n'étaient vérifiables qu'en lisant du code source, et deux mutations sont
 * passées à travers.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  decomposerRole3D, libelleDeRole3D, libelleCourtDeRole3D, membreDuRole3D, rolesDeLArchetype3D,
  clesDeLArchetype3D, propositionDeRoles3D, chainesAttribuables3D, estSur3D,
} from '../src/archetype-roles.js';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inferSkeletonMap } from '../src/skeleton-map.js';
import { ANIMAL_JOINT_DEFS, ANIMAL_ARCHETYPES_3D, ARCHETYPES_3D } from '../src/constants.js';
import { SLOTS } from '../src/skeleton-map.js';

const fr = (en, f) => f;
const en = (a) => a;

describe('Un identifiant d\'articulation se décompose (#378a)', () => {
  test('les vingt-et-une clés du dépôt suivent toutes la forme attendue', () => {
    // C'est l'hypothèse sur laquelle repose la dérivation des libellés. Si une clé d'une forme
    // nouvelle apparaît, ce test le dit AVANT qu'elle ne s'affiche telle quelle à l'écran.
    const ids = new Set();
    Object.values(ANIMAL_JOINT_DEFS).forEach(defs =>
      defs.forEach(g => g.joints.forEach(j => ids.add(j.id))));
    assert.ok(ids.size >= 20, `attendu au moins 20 identifiants, trouvé ${ids.size}`);
    ids.forEach(id => assert.ok(decomposerRole3D(id), `« ${id} » ne se décompose pas`));
  });

  test('le segment, le côté, l\'avant et le rang sont lus séparément', () => {
    assert.deepEqual(decomposerRole3D('hipFL'), { segment: 'hip', avant: 'F', cote: 'L', rang: null });
    assert.deepEqual(decomposerRole3D('tail2'), { segment: 'tail', avant: null, cote: null, rang: 2 });
    assert.deepEqual(decomposerRole3D('head'), { segment: 'head', avant: null, cote: null, rang: null });
    assert.deepEqual(decomposerRole3D('hipL3'), { segment: 'hip', avant: null, cote: 'L', rang: 3 });
  });

  test('RÉGRESSION : `wingTip` est lu avant `wing`', () => {
    // L'ordre de la table de segments porte cette décision. Interverti, `wingTipL` se lirait « aile »
    // suivie d'un reste que la garde rejette, et le rôle sortirait sans libellé. Même piège que la
    // table des mots de région de skeleton-map.js, où « bras » doit précéder « doigt ».
    assert.equal(decomposerRole3D('wingTipL').segment, 'wingTip');
    assert.equal(decomposerRole3D('wingL').segment, 'wing');
  });

  test('une forme inconnue rend null, elle ne lève pas et n\'invente pas', () => {
    assert.equal(decomposerRole3D('inventé'), null);
    assert.equal(decomposerRole3D('hipXY'), null, 'un côté inconnu doit être refusé');
    assert.equal(decomposerRole3D(''), null);
    assert.equal(decomposerRole3D(null), null);
  });
});

describe('Le libellé d\'un rôle se dérive de sa clé, dans les deux langues (#378a)', () => {
  test('l\'ordre des mots suit la LANGUE, pas la table', () => {
    // Le français place l'épithète après le nom, l'anglais avant. Un seul ordre pour les deux donne
    // « Shoulder left », qui se comprend et sonne faux.
    assert.equal(libelleDeRole3D('hipFL', en), 'Front left hip');
    assert.equal(libelleDeRole3D('hipFL', fr), 'Hanche avant gauche');
  });

  test('RÉGRESSION : le français ACCORDE « droit » au genre du mot', () => {
    // « Bras droite » est ce que produit une table qui ignore le genre, et c'est la première chose
    // qu'un lecteur francophone voit. L'anglais, lui, aurait été juste sans qu'on y pense.
    assert.equal(libelleDeRole3D('elbowR', fr), 'Coude droit');
    assert.equal(libelleDeRole3D('kneeR', fr), 'Genou droit');
    assert.equal(libelleDeRole3D('hipR', fr), 'Hanche droite');
    assert.equal(libelleDeRole3D('wingR', fr), 'Aile droite');
    assert.equal(libelleDeRole3D('shoulderR', fr), 'Épaule droite');
    // « gauche » est invariable : les deux genres doivent donner le même mot.
    assert.equal(libelleDeRole3D('elbowL', fr), 'Coude gauche');
    assert.equal(libelleDeRole3D('hipL', fr), 'Hanche gauche');
  });

  test('RÉGRESSION : en anglais, le nom perd sa majuscule quand il ne commence plus la phrase', () => {
    // « left Arm » se lit comme une faute de frappe. Le nom est capitalisé dans la table parce qu'il
    // s'affiche seul la moitié du temps.
    assert.equal(libelleDeRole3D('head', en), 'Head');
    assert.equal(libelleDeRole3D('wingTipL', en), 'Left wing tip');
    assert.equal(libelleDeRole3D('shoulderR', en), 'Right shoulder');
  });

  test('le rang s\'affiche à partir de UN, l\'identifiant compte à partir de zéro', () => {
    // `tail0` est un indice, « Queue 1 » est ce qu'on montre à quelqu'un. Un « Queue 0 » à l'écran
    // ferait chercher une queue numéro 1 qui n'existe pas.
    assert.equal(libelleDeRole3D('tail0', fr), 'Queue 1');
    assert.equal(libelleDeRole3D('tail2', fr), 'Queue 3');
    assert.equal(libelleDeRole3D('tentacle0', en), 'Tentacle 1');
  });

  test('une clé inconnue s\'affiche TELLE QUELLE, jamais « undefined »', () => {
    assert.equal(libelleDeRole3D('inventé', fr), 'inventé');
    assert.equal(libelleDeRole3D(null, fr), '');
  });
});

describe('Le membre d\'un rôle, pour replier l\'écran (#378a)', () => {
  test('deux segments du même membre partagent son groupe', () => {
    assert.equal(membreDuRole3D('hipFL', fr).cle, membreDuRole3D('kneeFL', fr).cle);
    assert.equal(membreDuRole3D('shoulderR', fr).cle, membreDuRole3D('elbowR', fr).cle);
    assert.equal(membreDuRole3D('wingL', fr).cle, membreDuRole3D('wingTipL', fr).cle);
    assert.equal(membreDuRole3D('hipFL', fr).label, 'Patte avant gauche');
    assert.equal(membreDuRole3D('elbowL', fr).label, 'Bras gauche');
  });

  test('deux membres DIFFÉRENTS ne partagent jamais un groupe', () => {
    const cles = ['hipFL', 'hipFR', 'hipBL', 'hipBR', 'wingL', 'wingR', 'shoulderL', 'shoulderR']
      .map(c => membreDuRole3D(c, fr).cle);
    assert.equal(new Set(cles).size, cles.length, 'deux membres se replient ensemble');
  });

  test('RÉGRESSION : le même chiffre ne dit pas la même chose selon la clé', () => {
    // `tail0..2` sont TROIS OS D'UNE MÊME queue, le rang y compte les vertèbres : un seul groupe.
    // `hipL0` et `hipL3` sont deux PATTES d'araignée, le rang y compte les membres : deux groupes.
    // Sans cette distinction, les huit pattes se replieraient dans un seul bloc, et la queue d'un
    // loup en occuperait trois.
    const queue = ['tail0', 'tail1', 'tail2'].map(c => membreDuRole3D(c, fr).cle);
    assert.equal(new Set(queue).size, 1, 'la queue s\'est éparpillée en plusieurs groupes');
    const pattes = ['hipL0', 'hipL1', 'hipL2', 'hipL3'].map(c => membreDuRole3D(c, fr).cle);
    assert.equal(new Set(pattes).size, 4, 'les pattes d\'araignée se replient ensemble');
  });

  test('le groupe garde l\'avant même quand le LIBELLÉ le tait', () => {
    // Sur un bipède, « avant » ne veut rien dire et n'est pas affiché. La clé de groupe, elle, le
    // garde : taire un mot inutile est une chose, fusionner deux membres en est une autre.
    const roles = rolesDeLArchetype3D('bipede_queue', {}, fr);
    const patte = roles.find(r => r.cle === 'hipFL');
    assert.equal(patte.membreLabel, 'Patte gauche', 'un bipède n\'a pas de patte « avant »');
    assert.ok(patte.membre.includes('F'), 'la clé de groupe a perdu son avant');
  });
});

describe('Les listes de rôles sont DÉRIVÉES des animaux intégrés (#378a)', () => {
  test('chaque archétype qui a un animal reprend EXACTEMENT ses articulations', () => {
    // La garantie qui compte : aucune liste écrite à la main à côté de celle de #367. Une seconde
    // table aurait divergé, c'est le travers le plus fréquent de ce dépôt.
    const parArchetype = new Map();
    Object.entries(ANIMAL_ARCHETYPES_3D).forEach(([animal, cle]) => {
      (ANIMAL_JOINT_DEFS[animal] || []).forEach(g => g.joints.forEach(j => {
        if (!parArchetype.has(cle)) parArchetype.set(cle, new Set());
        parArchetype.get(cle).add(j.id);
      }));
    });
    parArchetype.forEach((attendu, cle) => {
      const obtenu = new Set(clesDeLArchetype3D(cle));
      assert.deepEqual([...obtenu].sort(), [...attendu].sort(), `${cle} a dérivé de sa source`);
    });
  });

  test('RÉGRESSION : l\'UNION, pas l\'intersection', () => {
    // Le loup a `neck`, le lézard non, et les deux sont des quadrupèdes. L'intersection aurait retiré
    // le cou à tous les quadrupèdes, alors qu'un chien importé en a un : elle aurait fait payer à
    // chaque modèle la pauvreté du rig le plus pauvre.
    const cles = clesDeLArchetype3D('quadrupede');
    assert.ok(cles.includes('neck'), 'le cou du loup a disparu');
    assert.ok(cles.includes('head'));
    assert.equal(cles.filter(c => c.startsWith('hip')).length, 4, 'quatre hanches');
  });

  test('l\'ordre est ANATOMIQUE, du tronc vers les extrémités', () => {
    // Il ne peut pas se dériver de la table des animaux, dont l'ordre est celui de son écriture :
    // sur `quadrupede`, l'union prise dans cet ordre met `neck` APRÈS la queue, parce que seul le
    // loup le porte et qu'il vient en second.
    const cles = clesDeLArchetype3D('quadrupede');
    assert.ok(cles.indexOf('neck') < cles.indexOf('hipFL'), 'le cou passe après les pattes');
    assert.ok(cles.indexOf('hipFL') < cles.indexOf('hipBL'), 'l\'arrière passe avant l\'avant');
    assert.ok(cles.indexOf('hipBL') < cles.indexOf('tail0'), 'la queue passe avant les pattes');
    assert.ok(cles.indexOf('hipFL') < cles.indexOf('kneeFL'), 'le genou passe avant la hanche');
  });

  test('l\'humanoïde EST la liste des dix-huit emplacements', () => {
    // C'est le sens de l'unification décidée avec l'utilisateur : les emplacements ne sont pas un
    // mécanisme parallèle, ce sont les rôles de l'archétype `humanoide`.
    assert.deepEqual(clesDeLArchetype3D('humanoide'), [...SLOTS]);
    const roles = rolesDeLArchetype3D('humanoide', {}, fr);
    assert.equal(roles.find(r => r.cle === 'avantbras_g').label, 'Avant-bras');
    assert.equal(roles.find(r => r.cle === 'avantbras_g').membreLabel, 'Bras gauche');
  });

  test('la ligne ne répète pas ce que son groupe dit déjà', () => {
    // « Hanche avant gauche » sous « Patte avant gauche » dit trois fois la même chose. C'est déjà
    // la règle des emplacements humanoïdes, où `slotLabel` rend « Avant-bras » sans côté : deux
    // mises en page pour un seul écran, c'est exactement ce que l'unification doit supprimer.
    const r = rolesDeLArchetype3D('quadrupede', {}, fr);
    const hanche = r.find(x => x.cle === 'hipFL');
    assert.equal(hanche.label, 'Hanche');
    assert.equal(hanche.membreLabel, 'Patte avant gauche');
    assert.equal(hanche.labelComplet, 'Hanche avant gauche', 'le libellé complet reste disponible');
    // Le rang RESTE quand il numérote le segment : trois lignes d'une même queue doivent se
    // distinguer. Il part quand il numérote le membre, le groupe le portant alors.
    assert.equal(r.find(x => x.cle === 'tail1').label, 'Queue 2');
    assert.equal(libelleCourtDeRole3D('hipL2', fr), 'Hanche');
  });
});

describe('Les archétypes déclarés, numérotés, et vides (#378a)', () => {
  test('l\'arachnide a quatre paires de pattes, ordonnées de l\'avant vers l\'arrière', () => {
    // Décision de l'utilisateur. ⚠️ Ce chiffre ne repose que sur UN exemple, l'araignée du corpus,
    // et le corpus ne contient aucun scorpion : la queue est là par anticipation.
    const cles = clesDeLArchetype3D('arachnide');
    assert.equal(cles.filter(c => c.startsWith('hip')).length, 8, 'huit pattes');
    assert.ok(cles.includes('tail0'), 'la queue du scorpion');
    const membres = [...new Set(rolesDeLArchetype3D('arachnide', {}, fr).map(r => r.membre))];
    assert.equal(membres.length, 9, 'huit pattes plus une queue');
  });

  test('le radial est NUMÉROTÉ, et le nombre vient du fichier', () => {
    // Le critère n'est pas le nombre de membres, c'est leur permutabilité : la troisième tentacule
    // d'un kraken vaut la quatrième, alors que les pattes avant d'une araignée ne font pas le geste
    // de ses pattes arrière.
    assert.deepEqual(clesDeLArchetype3D('radial', { chaines: 3 }), ['tentacle0', 'tentacle1', 'tentacle2']);
    assert.deepEqual(clesDeLArchetype3D('radial', { chaines: 0 }), []);
    assert.deepEqual(clesDeLArchetype3D('radial'), [], 'sans fichier, aucun rôle inventé');
    assert.equal(clesDeLArchetype3D('radial', { chaines: 8 }).length, 8);
  });

  test('RÉGRESSION : une tentacule n\'est pas une queue', () => {
    // Première version : les tentacules réutilisaient `tail0..N`, la clé de la QUEUE. Deux membres
    // sans rapport auraient partagé un identifiant persisté, et une pose de queue de loup aurait
    // bougé la première tentacule d'un kraken.
    const radial = clesDeLArchetype3D('radial', { chaines: 3 });
    radial.forEach(c => assert.ok(!c.startsWith('tail'), `${c} réutilise la clé de la queue`));
  });

  test('trois archétypes rendent une liste VIDE, et c\'est mesuré', () => {
    // Un serpent n'a aucun membre. `complexe` porte des poses attachées au FICHIER, décision de
    // l'utilisateur. Le centaure est un trou RECONNU : rien ne dit lequel de ses six membres est un
    // bras et lequel est une patte avant, alors que trois centaures sont dans le corpus.
    ['serpentin', 'centaure', 'complexe'].forEach(cle => {
      assert.deepEqual(clesDeLArchetype3D(cle), [], `${cle} a gagné des rôles inventés`);
      assert.deepEqual(rolesDeLArchetype3D(cle, {}, fr), []);
    });
  });

  test('tout archétype déclaré répond, aucun ne lève', () => {
    // La liste des archétypes est la source, elle vit dans constants.js : un archétype ajouté
    // là-bas et oublié ici doit rendre une liste vide, pas casser l'écran de correspondance.
    ARCHETYPES_3D.forEach(a => {
      assert.ok(Array.isArray(clesDeLArchetype3D(a.cle, { chaines: 2 })), `${a.cle} ne répond pas`);
      assert.ok(Array.isArray(rolesDeLArchetype3D(a.cle, { chaines: 2 }, fr)));
    });
    assert.deepEqual(clesDeLArchetype3D('archetype_inconnu'), []);
  });

  test('aucun rôle en double, dans aucun archétype', () => {
    // Un doublon ferait deux lignes pour un seul rôle dans l'écran de #378b, et la seconde
    // annulerait la première en silence.
    ARCHETYPES_3D.forEach(a => {
      const cles = clesDeLArchetype3D(a.cle, { chaines: 8 });
      assert.equal(new Set(cles).size, cles.length, `${a.cle} porte un rôle en double`);
      // LE COUPLE (groupe, libellé) doit être unique, pas le libellé seul : « Avant-bras » se lit
      // deux fois sur un humanoïde, une fois sous « Bras gauche » et une fois sous « Bras droit »,
      // et c'est justement ce que le groupe sert à distinguer. Ma première version comparait les
      // libellés nus et déclarait onze rôles sur dix-huit en double.
      const roles = rolesDeLArchetype3D(a.cle, { chaines: 8 }, fr);
      const paires = roles.map(r => `${r.membre}\u0000${r.label}`);
      assert.equal(new Set(paires).size, paires.length, `${a.cle} porte deux rôles au même libellé`);
    });
  });

  test('chaque rôle a un libellé NON VIDE dans les deux langues', () => {
    ARCHETYPES_3D.forEach(a => {
      [fr, en].forEach(t => {
        rolesDeLArchetype3D(a.cle, { chaines: 3 }, t).forEach(r => {
          assert.ok(r.label && r.label.trim(), `${a.cle}/${r.cle} sans libellé`);
          assert.ok(r.membreLabel && r.membreLabel.trim(), `${a.cle}/${r.cle} sans groupe`);
          assert.ok(!/undefined|\[object/.test(r.label + r.membreLabel), `${a.cle}/${r.cle} : ${r.label}`);
        });
      });
    });
  });
});

describe('Un membre par ligne, et la chaîne qui le tient (#378b)', () => {
  const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
  const charger = (nom) => JSON.parse(
    readFileSync(join(RACINE, 'tests', 'fixtures', `squelette-${nom}.json`), 'utf8'),
  ).os.map(o => ({ id: o.i, name: o.name, children: o.children, t: o.t }));
  const proposer = (nom, archetype, enregistre) => {
    const os = charger(nom);
    return propositionDeRoles3D({ os, archetype, carte: inferSkeletonMap(os), enregistre: enregistre || {} }, fr);
  };

  test('un MEMBRE par ligne, pas un rôle : six lignes pour un quadrupède, pas treize', () => {
    // Ma première conception donnait une ligne par rôle avec un menu de tous les os du fichier :
    // treize lignes et des menus de quarante-neuf entrées sur un cerbère. `hipFL` veut dire « le
    // premier os de la patte avant gauche », et cette patte est une chaîne déjà connue.
    const p = proposer('cerbere', 'quadrupede');
    assert.equal(p.length, 6);
    assert.deepEqual(p.map(m => m.label), ['Tête', 'Patte avant gauche', 'Patte avant droite',
      'Patte arrière gauche', 'Patte arrière droite', 'Queue']);
    assert.equal(p.find(m => m.label === 'Queue').roles.length, 3, 'la queue porte ses trois rôles');
  });

  test('les segments prennent les rôles DANS L\'ORDRE, de la racine vers l\'extrémité', () => {
    const queue = proposer('cerbere', 'quadrupede').find(m => m.label === 'Queue');
    assert.deepEqual(queue.roles.map(r => r.osNom),
      ['CERBERUS__Tail_040', 'CERBERUS__Tail1_041', 'CERBERUS__Tail2_042']);
  });

  test('une chaîne plus longue que ses rôles laisse ses derniers os SANS rôle', () => {
    // Une patte de cerbère a cinq os, l'archétype quadrupède n'en nomme que deux. Les trois autres
    // restent pilotables par curseurs et n'entrent dans aucune pose : c'est la décision n°12.
    //
    // ⚠️ LE CHIEN NE SERT PAS À CE TEST, et l'apprendre a été instructif : ses premières chaînes de
    // patte sont des ÉCHAFAUDAGES `IKBackLegL`, longues de deux os exactement. Le filtre nommé de
    // l'étape 3 n'a jamais été écrit en code, la modale devant s'en charger ; ces chaînes sont donc
    // encore candidates. Elles sortent « structure », donc dépliées, donc visibles.
    const patte = proposer('cerbere', 'quadrupede').find(m => m.label === 'Patte avant gauche');
    assert.equal(patte.roles.length, 2, 'deux rôles seulement, hanche et genou');
    assert.ok(patte.chaine.osNoms.length > 2, 'la chaîne du fichier est plus longue');
    assert.equal(patte.roles.filter(r => r.osNom).length, 2, 'seuls les deux premiers os ont un rôle');
  });

  test('RÉGRESSION : une attribution AMBIGUË n\'est jamais « sûre »', () => {
    // C'est ce qui rend la règle de repli utilisable. Sur le cerbère, `head` est réclamé par ses DEUX
    // têtes latérales, la vraie étant sur le tronc. Une première version prenait la première venue
    // et l'étiquetait « nom » : elle repliait donc un membre faux, c'est-à-dire le défaut des
    // dix-huit emplacements réintroduit à l'échelle des rôles.
    const tete = proposer('cerbere', 'quadrupede').find(m => m.label === 'Tête');
    assert.equal(tete.origine, 'structure');
    assert.equal(tete.sur, false, 'un membre ambigu doit rester déplié');
  });

  test('RÉGRESSION : avant et arrière ne se distinguent PAS, donc les pattes se déplient', () => {
    // `typeDeChaine3D` rend « patte » sans dire laquelle. L'ordre des ancres le long du tronc
    // pourrait le dire, mais ce n'est pas mesuré : plutôt que de deviner, on déplie.
    ['cerbere', 'chien'].forEach(nom => {
      proposer(nom, 'quadrupede').filter(m => /Patte/.test(m.label)).forEach(m => {
        assert.equal(m.sur, false, `${nom} : ${m.label} est repliée alors que rien ne dit son côté`);
      });
    });
  });

  test('sur un quadrupède, une chaîne nommée « bras » est une patte avant', () => {
    // Mesuré sur le cerbère, dont les pattes avant s'appellent `Clavicle`, `UpperArm`, `Forearm`.
    // Sans cette équivalence, ces chaînes ne trouvent aucun membre et restent orphelines.
    const p = proposer('cerbere', 'quadrupede');
    const prises = p.map(m => m.chaine && m.chaine.nom).filter(Boolean);
    assert.ok(prises.includes('Bras G') && prises.includes('Bras D'),
      `les chaînes « bras » du cerbère ne sont attribuées à aucune patte : ${prises.join(', ')}`);
  });

  test('une chaîne n\'est JAMAIS attribuée à deux membres', () => {
    // Deux membres sur une même chaîne donneraient deux fois les mêmes os, et une pose en
    // annulerait une autre. Même garantie que « un os sous une seule clé » de #374.
    [['cerbere', 'quadrupede'], ['chien', 'quadrupede'], ['araignee', 'arachnide'],
      ['dragon', 'bipede_aile']].forEach(([nom, arch]) => {
      const prises = proposer(nom, arch).map(m => m.chaine && m.chaine.racine).filter(Boolean);
      assert.equal(new Set(prises).size, prises.length, `${nom} : une chaîne sert deux fois`);
    });
  });

  test('l\'humanoïde RELIT la reconnaissance existante, il ne la refait pas', () => {
    // `inferSkeletonMap` est mesurée et éprouvée sur les six fichiers réels. La refaire ici pour
    // l'uniformité aurait été une seconde reconnaissance à côté de la première.
    const p = proposer('mixamo', 'humanoide');
    assert.equal(p.length, 5);
    const bras = p.find(m => m.label === 'Bras gauche');
    assert.deepEqual(bras.roles.map(r => r.osNom), ['mixamorigLeftShoulder', 'mixamorigLeftArm',
      'mixamorigLeftForeArm', 'mixamorigLeftHand']);
    assert.equal(bras.sur, true, 'un bras Mixamo est reconnu par le nom, il doit rester replié');
  });

  test('le REPLI suit la certitude, pas la morphologie', () => {
    // Règle redressée par l'utilisateur : on déplie ce qui demande une DÉCISION. Une araignée dont
    // les pattes seraient nommées à la main se replierait comme un humanoïde bien rangé.
    // Mesuré sur les humanoïdes du corpus, membres dépliés sur cinq.
    const attendu = { vrm: 0, unreal: 1, mixamo: 2, maison: 2, 'vroid-alt': 2, oiseau: 3, raptor: 5 };
    Object.entries(attendu).forEach(([nom, n]) => {
      const deplies = proposer(nom, 'humanoide').filter(m => !m.sur).length;
      assert.equal(deplies, n, `${nom} : ${deplies} membres dépliés, ${n} attendus`);
    });
  });

  test('« votre choix » compte comme SÛR, et gagne sur la proposition', () => {
    // Un os choisi à la main est une décision prise ; la redemander à chaque ouverture reviendrait à
    // ne pas l'avoir enregistrée.
    const avant = proposer('cerbere', 'quadrupede').find(m => m.label === 'Tête');
    assert.equal(avant.sur, false);
    const apres = proposer('cerbere', 'quadrupede', {
      os: { head: 'CERBERUS_R_HEAD_028', neck: 'CERBERUS_R_NECK_2_027' },
    }).find(m => m.label === 'Tête');
    assert.equal(apres.roles[0].osNom, 'CERBERUS_R_HEAD_028');
    assert.equal(apres.roles[0].origine, 'manuel');
    assert.equal(apres.sur, true, 'un membre entièrement choisi à la main doit se replier');
  });

  test('l\'étiquette d\'un membre montre son rôle le MOINS sûr', () => {
    // TROU TROUVÉ PAR MUTATION : rien ne vérifiait l'étiquette affichée. Déclarer « vide » aussi sûr
    // que « votre choix » passait tous les tests, parce que le REPLI se calcule ailleurs. Un membre
    // à moitié rempli aurait donc porté l'étiquette de sa moitié réussie.
    //
    // Le chien est le cas réel : son groupe de tête trouve `Head_1` par le nom, et ne trouve rien
    // pour le cou. L'étiquette doit dire « vide », pas « nom ».
    const tete = proposer('chien', 'quadrupede').find(m => m.label === 'Tête');
    assert.equal(tete.roles[0].origine, 'nom', 'la tête du chien est bien trouvée par son nom');
    assert.equal(tete.roles[1].osNom, null, 'son cou, lui, n\'est pas trouvé');
    assert.equal(tete.origine, 'vide', 'l\'étiquette du membre a pris celle de sa moitié réussie');
    assert.equal(tete.sur, false);
  });

  test('un archétype sans rôle ne propose rien, il ne lève pas', () => {
    assert.deepEqual(proposer('serpent', 'serpentin'), []);
    assert.deepEqual(proposer('cerbere', 'complexe'), []);
    assert.deepEqual(propositionDeRoles3D({}, fr), []);
  });

  test('estSur3D : « nom » et « manuel » seuls sont sûrs', () => {
    assert.equal(estSur3D([{ origine: 'nom' }, { origine: 'manuel' }]), true);
    assert.equal(estSur3D([{ origine: 'nom' }, { origine: 'structure' }]), false);
    assert.equal(estSur3D([{ origine: 'vide' }]), false);
    assert.equal(estSur3D([]), true, 'un membre sans rôle n\'a rien à confirmer');
  });

  test('les chaînes attribuables portent leur famille, ou null quand le nom ne dit rien', () => {
    // Mesuré : 235 chaînes sur 488 n'ont aucun type lisible dans le corpus.
    const araignee = chainesAttribuables3D(charger('araignee'), [], fr);
    assert.ok(araignee.length > 20);
    assert.ok(araignee.every(c => c.famille === null), 'l\'araignée ne nomme rien de lisible');
    const cerbere = chainesAttribuables3D(charger('cerbere'), [], fr);
    assert.deepEqual([...new Set(cerbere.map(c => c.famille))].sort(), ['arm', 'head', 'leg', 'tail']);
  });
});

/**
 * JOURNAL DE MUTATION : la table des rôles (tâche #378a).
 *
 *   P1  l'intersection au lieu de l'union                                       ROUGE
 *   P2  l'ordre des animaux au lieu de l'ordre anatomique                       ROUGE
 *   P3  `wing` lu avant `wingTip`                                               ROUGE
 *   P4  le rang affiché sans le +1                                              ROUGE
 *   P5  « droit » ne s'accorde plus au genre                                    ROUGE
 *   P6  le rang désigne toujours le segment, jamais le membre                   ROUGE
 *   P7  « avant » affiché même sans arrière                                     ROUGE
 *   P8  les tentacules réutilisent la clé de la queue                           ROUGE
 *   P9  le radial invente huit tentacules sans lire le fichier                  ROUGE
 *   P10 l'anglais garde la majuscule du nom au milieu de la phrase              ROUGE
 *
 * JOURNAL DE MUTATION : l'attribution (tâche #378b, modèle).
 *
 *   Q1  une attribution ambiguë redevient « sûre »                              ROUGE
 *   Q2  les pattes avant/arrière se déclarent sûres                             ROUGE
 *   Q3  une chaîne peut servir deux membres                                     ROUGE
 *   Q4  « bras » n'est plus une patte avant sur un quadrupède                    ROUGE
 *   Q5  le choix manuel ne compte plus comme sûr                                ROUGE
 *   Q6  les segments prennent les rôles à l'envers                              ROUGE
 *   Q7  l'humanoïde refait sa propre reconnaissance                             ROUGE
 *   Q8  un membre à moitié vide porte l'étiquette de sa moitié réussie          ROUGE
 *
 * ⚠️ Q8 A ÉCHAPPÉ D'ABORD, et le trou était réel : rien ne vérifiait l'ÉTIQUETTE affichée. Le repli
 * se calcule par `estSur3D`, qui n'appelle pas `pireOrigine3D` ; déclarer « vide » aussi sûr que
 * « votre choix » passait donc tous les tests. Le chien est le cas réel, son groupe de tête trouvant
 * `Head_1` par le nom et rien pour le cou.
 */
