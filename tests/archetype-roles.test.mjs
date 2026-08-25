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
  estEchafaudage3D, chaineEchafaudage3D, rolesDuTronc3D,
} from '../src/archetype-roles.js';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inferSkeletonMap, lignesDeCorrespondance3D } from '../src/skeleton-map.js';
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

  test('le centaure a DEUX bras, QUATRE pattes et une queue', () => {
    // Décision de l'utilisateur, et elle découle de sa règle générale : l'archétype définit sa
    // liste, un modèle qui n'y entre pas n'en est pas un. Deux des quatre centaures du corpus n'ont
    // que deux pattes ; le classement les propose `humanoide`, et c'est JUSTE.
    //
    // DÉRIVÉE PAR COMPOSITION : le haut vient du singe, les quatre pattes du loup. Un centaure est
    // exactement cela. Une liste recopiée à la main n'aurait pas suivi l'ajout d'une articulation
    // à l'un des deux animaux.
    const cles = clesDeLArchetype3D('centaure');
    assert.equal(cles.filter(c => /^shoulder|^elbow/.test(c)).length, 4, 'deux bras');
    assert.equal(cles.filter(c => /^hip/.test(c)).length, 4, 'quatre pattes');
    assert.ok(cles.includes('tail0') && cles.includes('head') && cles.includes('neck'));
    assert.equal(cles.filter(c => /^wing/.test(c)).length, 0, 'un centaure n\'a pas d\'aile');
    const membres = [...new Set(rolesDeLArchetype3D('centaure', {}, fr).map(r => r.membre))];
    assert.equal(membres.length, 8, 'tête, deux bras, quatre pattes, queue');
  });

  test('trois archétypes rendent une liste VIDE, et c\'est mesuré', () => {
    // Un serpent n'a aucun membre, mesuré : son tronc fait 86 os sur 91 et il a UNE chaîne.
    // `complexe` porte des poses attachées au FICHIER, décision de l'utilisateur, et le classement
    // ne le propose jamais : c'est une porte de sortie qu'on ouvre à la main.
    //
    // Le centaure était le troisième, il ne l'est plus : l'utilisateur a tranché sa forme.
    ['serpentin', 'complexe'].forEach(cle => {
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
    // ⚠️ CE TEST UTILISAIT LE CHIEN, dont le cou n'était pas trouvé. Il l'est depuis #381, qui va
    // chercher la tête et le cou sur le TRONC : le cas réel a disparu, ce qui est un progrès et non
    // une régression. centaure3 le remplace, dont le tronc nomme `Cabeza_052` mais aucun cou.
    const tete = proposer('centaure3', 'centaure').find(m => m.label === 'Tête');
    assert.equal(tete.roles[0].osNom, 'Cabeza_052', 'la tête est trouvée sur le tronc, en espagnol');
    assert.equal(tete.roles[0].origine, 'nom');
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

describe('Les échafaudages de rig ne concourent pas pour un rôle (#379)', () => {
  const RACINE2 = join(dirname(fileURLToPath(import.meta.url)), '..');
  const charger2 = (nom) => JSON.parse(
    readFileSync(join(RACINE2, 'tests', 'fixtures', `squelette-${nom}.json`), 'utf8'),
  ).os.map(o => ({ id: o.i, name: o.name, children: o.children, t: o.t }));

  test('RÉGRESSION : `IK` se lit sur un BORD de mot, jamais au milieu', () => {
    // Le motif a été repris trois fois. Le deuxième essai, « IK non suivi d'une minuscule »,
    // attrapait les treize os du corpus avec zéro contre-exemple, et je l'ai rejeté quand même :
    // il lit `SPIKE_01` comme un échafaudage, et « aucun contre-exemple dans le corpus » est
    // exactement le raisonnement qui a fait accepter un motif de côté trop large en #363.
    ['IKBackLegL_45', 'HeadIK_67_85', 'Wing_IKL_142_156', 'Leg_IK', 'IK']
      .forEach(n => assert.ok(estEchafaudage3D(n), `${n} devrait être un échafaudage`));
    ['SPIKE_01', 'STRIKE_L', 'VIKING_hair', 'Mikael', 'Spike']
      .forEach(n => assert.equal(estEchafaudage3D(n), false, `${n} n'est PAS un échafaudage`));
  });

  test('RÉGRESSION : `HeadIK` ne passe plus, et c\'est ce qui a fait reprendre le motif', () => {
    // Premier essai : `IK` précédé ET suivi d'un non-lettre. Le `d` de `HeadIK` est une lettre, donc
    // il passait. Le dragon gardait `HeadIK` comme tête, étiqueté « nom », donc REPLIÉ : un membre
    // faux présenté comme sûr, ce que la règle de repli rend invisible.
    assert.ok(estEchafaudage3D('HeadIK_67_85'));
  });

  test('trois mots évidents sont REJETÉS, parce que la mesure les dit trop larges', () => {
    // `root` vit dans 166 os de 15 fichiers, dont de vrais os de bras chez centaure1 ;
    // `bind` et `jnt` sont des conventions de nommage Maya, 226 et 130 os ; un os de `twist` est un
    // vrai morceau de bras. Les écarter supprimerait le squelette entier de centaure1.
    ['_rootJoint', 'root_bind_jnt_rootJoint', 'L_lwr_arm_twist_01_bind_jnt', 'spine_00_bind_jnt']
      .forEach(n => assert.equal(estEchafaudage3D(n), false, `${n} ne doit pas être écarté`));
  });

  test('une chaîne est jugée sur sa RACINE, et la mesure dit que c\'est équivalent', () => {
    // La règle « au moins un os suspect » écarte exactement les MÊMES chaînes que la racine :
    // aucun échafaudage ne se cache au milieu d'une vraie chaîne. La racine n'est donc pas un
    // critère arbitrairement étroit, c'est le même critère écrit plus simplement.
    assert.ok(chaineEchafaudage3D(['IKBackLegL_45', 'FFBL_44']));
    assert.equal(chaineEchafaudage3D(['BackShoulderL_27', 'BackLegL_26']), false);
    assert.equal(chaineEchafaudage3D([]), false);
    assert.equal(chaineEchafaudage3D(null), false);
  });

  test('le chien retrouve ses VRAIES pattes', () => {
    // Le défaut qui a motivé la tâche : ses quatre membres de patte recevaient `IKBackLegL` et
    // `IKFrontLegL`, des chaînes de deux os, plutôt que `BackShoulderL` et `FrontShoulderL`.
    const os = charger2('chien');
    const p = propositionDeRoles3D({ os, archetype: 'quadrupede', carte: inferSkeletonMap(os), enregistre: {} }, fr);
    const pattes = p.filter(m => /Patte/.test(m.label)).map(m => m.roles[0].osNom);
    pattes.forEach(n => assert.ok(!/^IK/.test(n), `une patte du chien reçoit encore ${n}`));
    assert.ok(pattes.some(n => /BackShoulder/.test(n)) && pattes.some(n => /FrontShoulder/.test(n)));
  });

  test('un échafaudage garde sa CHAÎNE, il ne perd que sa candidature', () => {
    // Il reste un os que l'utilisateur peut vouloir tourner, et le retirer de l'écran des membres
    // serait décider à sa place. C'est le contrat de tout ce chantier : on propose, il tranche.
    const chaines = chainesAttribuables3D(charger2('chien'), [], fr);
    const ik = chaines.filter(c => c.echafaudage);
    assert.ok(ik.length >= 4, `attendu au moins 4 chaînes d'échafaudage, trouvé ${ik.length}`);
    ik.forEach(c => assert.ok(c.osNoms.length > 0, 'la chaîne a été supprimée au lieu d\'être marquée'));
  });

  test('le corpus perd 64 chaînes sur 488, et aucune n\'est anatomique', () => {
    // La mesure dans les DEUX sens, promise avant de construire : combien d'écartées, et combien
    // d'anatomiques perdues à tort. Les chaînes écartées et typées anatomiques sont toutes des
    // échafaudages nommés d'après le membre qu'ils pilotent, `Wing_IKL`, `Leg_IKL`, `FX_Head01`,
    // `head_Socket`, ce qui est exactement leur rôle et pas une perte.
    const noms = ['araignee', 'centaure', 'centaure1', 'centaure2', 'centaure3', 'cerbere', 'chien',
      'dragon', 'kraken', 'maison', 'mixamo', 'oiseau', 'raptor', 'serpent', 'unreal', 'vrm', 'vroid-alt'];
    let total = 0, ecartees = 0;
    noms.forEach(n => {
      chainesAttribuables3D(charger2(n), [], fr).forEach(c => { total++; if (c.echafaudage) ecartees++; });
    });
    assert.equal(total, 488, `le corpus a changé de taille : ${total} chaînes`);
    // 64 et non 63 : le troisième motif d'`IK` attrape `HeadIK` du dragon, que les deux premiers
    // laissaient passer. C'est la chaîne qui a fait reprendre le motif.
    assert.equal(ecartees, 64, `${ecartees} chaînes écartées, 64 mesurées`);
  });
});

describe('La tête et le cou se cherchent sur le TRONC (#381)', () => {
  const RACINE3 = join(dirname(fileURLToPath(import.meta.url)), '..');
  const charger3 = (nom) => JSON.parse(
    readFileSync(join(RACINE3, 'tests', 'fixtures', `squelette-${nom}.json`), 'utf8'),
  ).os.map(o => ({ id: o.i, name: o.name, children: o.children, t: o.t }));
  const proposer3 = (nom, archetype, enregistre) => {
    const os = charger3(nom);
    return propositionDeRoles3D({ os, archetype, carte: inferSkeletonMap(os), enregistre: enregistre || {} }, fr);
  };
  const troncDe = (nom) => {
    const os = charger3(nom);
    const nomDe = new Map(os.map(o => [o.id, o.name]));
    return lignesDeCorrespondance3D(os, [], fr).tronc.segments.map(id => nomDe.get(id));
  };

  test('la tête n\'est pas une chaîne, c\'est l\'extrémité du tronc', () => {
    // Mesuré avant correction sur les sept fixtures non humanoïdes : trois têtes sur sept sont sur
    // le tronc, hors d'atteinte d'une recherche par chaînes. Le cerbère donnait `head` à une de ses
    // TÊTES LATÉRALES.
    assert.deepEqual(rolesDuTronc3D(troncDe('dragon'), ['head', 'neck']), {
      head: { nom: 'Head_65_72', origine: 'nom' },
      neck: { nom: 'Neck_66_71', origine: 'nom' },
    });
    const tete = proposer3('cerbere', 'quadrupede').find(m => m.label === 'Tête');
    assert.equal(tete.roles[0].osNom, 'CERBERUS__Head_09', 'le cerbère reprend SA tête');
  });

  test('RÉGRESSION : par le NOM, jamais par la position', () => {
    // Deux règles positionnelles essayées, deux démenties par la mesure :
    //   « les k derniers os du tronc » : celui du cerbère finit par un os de QUEUE DE CHEVAL ;
    //   « les k derniers, pris de la fin » : sur Mixamo le tronc finit par `Head` puis
    //   `HeadTop_End`, ce qui donnerait `neck` = la tête et `head` = le bout du crâne.
    const cerbere = troncDe('cerbere');
    assert.ok(/Queue_de_cheval/.test(cerbere[cerbere.length - 1]), 'la fixture a changé');
    assert.equal(rolesDuTronc3D(cerbere, ['head']).head.nom, 'CERBERUS__Head_09');
    const mixamo = troncDe('mixamo');
    assert.ok(/HeadTop_End/.test(mixamo[mixamo.length - 1]), 'la fixture a changé');
    assert.equal(rolesDuTronc3D(mixamo, ['head']).head.nom, 'mixamorigHead');
  });

  test('le vocabulaire est celui des chaînes, `Cabeza` compris', () => {
    // Pas une seconde liste de mots : `typeDeChaine3D`, déjà mesurée. centaure3 nomme sa tête en
    // espagnol et elle est trouvée.
    assert.equal(rolesDuTronc3D(troncDe('centaure3'), ['head']).head.nom, 'Cabeza_052');
  });

  test('PLUSIEURS candidats valent « structure », donc déplié', () => {
    // Le chien porte CINQ os de cou sur son tronc, et rien ne dit lequel est LE cou. Même règle que
    // pour les chaînes : on propose le premier, on ne prétend pas que c'est sûr.
    const r = rolesDuTronc3D(troncDe('chien'), ['neck']);
    assert.equal(r.neck.origine, 'structure');
    assert.equal(rolesDuTronc3D(troncDe('dragon'), ['neck']).neck.origine, 'nom', 'un seul cou');
  });

  test('RÉGRESSION : les sources se composent RÔLE PAR RÔLE, pas membre par membre', () => {
    // Une première version choisissait une source pour tout le membre, et le chien y perdait sa
    // tête : son tronc nomme cinq os de cou mais aucune tête, alors que son `Head_1` EST une chaîne.
    const tete = proposer3('chien', 'quadrupede').find(m => m.label === 'Tête');
    assert.equal(tete.roles[0].osNom, 'Head_1', 'la tête vient de la CHAÎNE');
    assert.equal(tete.roles[1].osNom, 'Neck1_14', 'le cou vient du TRONC');
  });

  test('l\'ordre est choix humain, puis tronc, puis chaîne', () => {
    const tete = proposer3('cerbere', 'quadrupede', { os: { head: 'CERBERUS_R_HEAD_028' } })
      .find(m => m.label === 'Tête');
    assert.equal(tete.roles[0].osNom, 'CERBERUS_R_HEAD_028', 'le choix humain passe avant le tronc');
    assert.equal(tete.roles[0].origine, 'manuel');
  });

  test('RÉGRESSION : un membre rempli par le tronc ne RÉSERVE pas de chaîne', () => {
    // Trouvé en préparant une maquette. Le membre « Tête » du cerbère prenait la chaîne `Tête G`
    // tout en affichant les os de son TRONC : l'écran montrait une chaîne qui ne correspondait à
    // aucune de ses lignes, et la vraie tête latérale gauche disparaissait des chaînes restantes.
    // Une réservation sans emploi est pire qu'une absence, elle retire la chaîne à qui pourrait
    // s'en servir.
    //
    // ⚠️ IL A FALLU DEUX GARDES. La première relâchait la chaîne dans la passe par NOM, et le repli
    // par CÔTÉ la reprenait aussitôt par une autre porte.
    const p = proposer3('cerbere', 'quadrupede');
    const tete = p.find(m => m.label === 'Tête');
    assert.equal(tete.chaine, null, 'la tête réserve encore une chaîne qu\'elle n\'utilise pas');
    assert.equal(tete.roles[0].osNom, 'CERBERUS__Head_09');
    const prises = new Set(p.map(m => m.chaine && m.chaine.racine).filter(Boolean));
    const restantes = chainesAttribuables3D(charger3('cerbere'), [], fr)
      .filter(c => !prises.has(c.racine) && !c.echafaudage).map(c => c.nom);
    assert.deepEqual(restantes, ['Tête G', 'Tête D'], 'les deux têtes latérales doivent rester libres');
  });

  test('un tronc sans tête ni cou ne rend rien, et ne lève pas', () => {
    assert.deepEqual(rolesDuTronc3D(troncDe('araignee'), ['head', 'neck']), {});
    assert.deepEqual(rolesDuTronc3D([], ['head']), {});
    assert.deepEqual(rolesDuTronc3D(null, null), {});
    assert.deepEqual(rolesDuTronc3D(troncDe('cerbere'), ['hipFL']), {}, 'une patte n\'est pas sur le tronc');
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
 * JOURNAL DE MUTATION : les échafaudages de rig (tâche #379).
 *
 *   R1 le motif `IK` redevient la sous-chaîne minuscule                         ROUGE
 *   R2 le motif `IK` exige un non-lettre des DEUX côtés, `HeadIK` repasse       ROUGE
 *   R3 `root` redevient un mot d'échafaudage                                    ROUGE
 *   R4 la chaîne est jugée sur TOUS ses os au lieu de sa racine                 ROUGE
 *   R5 les échafaudages redeviennent candidats à un rôle                        ROUGE
 *   R6 un échafaudage est SUPPRIMÉ au lieu d'être marqué                        ROUGE
 *
 * JOURNAL DE MUTATION : la tête sur le tronc (tâche #381).
 *
 *   S1 le tronc n'est plus consulté                                             ROUGE
 *   S2 le DERNIER candidat du tronc au lieu du premier                          ROUGE
 *   S3 plusieurs candidats se déclarent sûrs                                    ROUGE
 *   S4 le tronc passe AVANT le choix humain                                     ROUGE
 *   S5 la chaîne passe AVANT le tronc                                           ROUGE
 *   S6 le cou réclame le même type que la tête                                  ROUGE
 *
 * R2 mérite un mot : c'est la version que j'ai écrite en premier, et elle laissait `HeadIK` prendre
 * le rôle de tête du dragon avec l'étiquette « nom », donc REPLIÉ. La règle de repli transforme
 * une attribution fausse en attribution invisible, ce qui rend ce genre de mutation plus grave ici
 * qu'ailleurs.
 *
 * ⚠️ Q8 A ÉCHAPPÉ D'ABORD, et le trou était réel : rien ne vérifiait l'ÉTIQUETTE affichée. Le repli
 * se calcule par `estSur3D`, qui n'appelle pas `pireOrigine3D` ; déclarer « vide » aussi sûr que
 * « votre choix » passait donc tous les tests. Le chien est le cas réel, son groupe de tête trouvant
 * `Head_1` par le nom et rien pour le cou.
 */
