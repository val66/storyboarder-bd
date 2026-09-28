/**
 * tests/bubble-library.test.mjs — la bibliothèque de styles de Bulle (#425j).
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * CE QUE CES TESTS TIENNENT, ET POURQUOI AUCUN N'ÉNUMÈRE LES AXES
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Un style retient l'apparence d'une Bulle et rien d'autre. La tentation, en le testant, est de
 * vérifier axe par axe — « la forme est retenue, la texture est retenue, la police est retenue » —
 * et ce serait la même énumération que le module refuse d'écrire, transportée dans le test. Elle se
 * périmerait exactement pareil : un axe ajouté demain ne serait vérifié nulle part.
 *
 * Les tests portent donc sur la RÈGLE : ce qui est exclu l'est, tout le reste passe, et le champ
 * inventé d'un axe futur est retenu sans que personne ait à y penser.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  CHAMPS_HORS_STYLE, styleDeLaBulle3D, appliquerStyle3D, bulleSuitLeStyle3D,
  styleCorrespondant3D, peutEnregistrerLeStyle3D, refusDuNomDeStyle3D, ajouterStyle3D,
  bibliothequeLue3D, NOM_STYLE_MAX, renommerStyle3D, supprimerStyle3D, indexDuStyleDeLaBulle3D,
  renommageSansEffet3D,
} from '../src/bubble-library.js';
import { CHAMPS_PROPRES_AU_LOBE } from '../src/bubble-merge.js';

/** Une Bulle complète : géométrie, texte, état de fusion, et plusieurs axes d'apparence. */
const BULLE = {
  id: 'b1', type: 'bulle', x: 10, y: 20, w: 180, h: 74, z: 3,
  description: 'BONJOUR',
  bulleGroupe: 'g1', bulleFusionnable: true, bulleAvantFusion: { bulleShape: 'ovale' },
  tailAngle: 1.85, tailLen: 0.45,
  bulleShape: 'etoile', tailShape: 'eclair', tailMirror: true,
  bulleBorderVisible: true, bulleBorderWidth: 3, bulleBorderColor: '#112233',
  bulleBorderDash: 'epine', bulleBorderRegularity: 'tremble',
  bulleTexture: 'papier', bulleColor: '#E8D9B0', bulleFillOpacity: 0.8,
  bullePadding: 0.2, bulleFont: 'Bangers', bulleTextColor: '#000000',
  bulleTextOutlineColor: '#ffffff', bulleTextOutlineSize: 0.1,
};

describe('#425j — ce qu’un style retient', () => {
  /**
   * ⚠️ LA LISTE DES EXCLUSIONS EST CELLE DE LA FUSION, AUGMENTÉE, ET NON UNE SECONDE LISTE. Deux
   * énumérations décrivant « ce qui n'est pas de l'apparence » divergeraient au premier champ
   * ajouté — le défaut que ce chantier a rencontré quatre fois. Ce test refuse qu'on les sépare.
   */
  test('⚠️ LES EXCLUSIONS D’UN STYLE CONTIENNENT CELLES DE LA FUSION, SANS LES RECOPIER', () => {
    for (const cle of CHAMPS_PROPRES_AU_LOBE) {
      assert.ok(CHAMPS_HORS_STYLE.includes(cle),
        `« ${cle} » est propre au lobe mais entrerait dans un style`);
    }
    // ⚠️ ET LE PLACEMENT DE LA POINTE EN PLUS, arbitré avec l'utilisateur : une pointe désigne qui
    // parle, son angle dépend de la Case. Appliquer un style ne doit pas la faire tourner.
    assert.ok(CHAMPS_HORS_STYLE.includes('tailAngle'), 'l’angle de la pointe entrerait dans un style');
    assert.ok(CHAMPS_HORS_STYLE.includes('tailLen'), 'la longueur de la pointe entrerait dans un style');
  });

  test('⚠️ UN STYLE RETIENT TOUT CE QUI N’EST PAS EXCLU, Y COMPRIS UN AXE QUI N’EXISTE PAS ENCORE', () => {
    /*
     * ⚠️ LE CHAMP INVENTÉ EST LE CŒUR DE CE TEST. Il tient la seule chose qui compte vraiment : la
     * règle est une EXCLUSION, donc un axe ajouté demain sera retenu sans que personne y pense.
     * Une assertion axe par axe passerait aujourd'hui et manquerait précisément ce cas.
     */
    const style = styleDeLaBulle3D({ ...BULLE, bulleAxeDeDemain: 'quelque chose' });
    assert.equal(style.bulleAxeDeDemain, 'quelque chose',
      'un axe d’apparence inconnu n’a pas été retenu : la règle n’est plus une exclusion');
    for (const cle of CHAMPS_HORS_STYLE) {
      assert.ok(!(cle in style), `« ${cle} » a été retenu alors qu’il est exclu`);
    }
    // Le témoin : le style n'est pas vide, et il porte bien de l'apparence.
    assert.ok(Object.keys(style).length > 8, `${Object.keys(style).length} champs retenus seulement`);
  });

  test('⚠️ LE TEXTE SORT, SES RÉGLAGES RESTENT', () => {
    // Demandé mot pour mot à l'usage : « hormis niveau d'avancement et le texte (il garde par
    // contre les attributs du texte) ». Le niveau d'avancement est le champ `z`.
    const style = styleDeLaBulle3D(BULLE);
    assert.ok(!('description' in style), 'le texte lui-même ne doit pas voyager');
    assert.ok(!('z' in style), 'le niveau d’avancement ne doit pas voyager');
    for (const cle of ['bulleFont', 'bulleTextColor', 'bulleTextOutlineColor', 'bulleTextOutlineSize']) {
      assert.ok(cle in style, `« ${cle} » est un réglage du texte et doit être retenu`);
    }
  });

  test('⚠️ UNE CLÉ ABSENTE RESTE ABSENTE : « pas de réglage » n’est pas « réglage par défaut »', () => {
    // Une Bulle sans forme est ovale par défaut. Enregistrer `bulleShape: undefined` puis
    // l'appliquer imposerait l'ovale à une Bulle rectangulaire, alors que le style n'en dit rien.
    const style = styleDeLaBulle3D({ id: 'b', type: 'bulle', bulleColor: '#fff' });
    assert.deepEqual(Object.keys(style), ['bulleColor']);
  });
});

describe('#425j — appliquer un style', () => {
  /**
   * ⚠️ CE TEST VISE LA FAUTE M14 DE #426a, RENCONTRÉE DES DEUX CÔTÉS DE LA FUSION. `Object.assign`
   * écrit ce qu'on lui donne et laisse le reste intact : une Bulle texturée à qui l'on applique un
   * style SANS texture garderait sa texture. Le même style rendrait alors deux résultats différents
   * selon la Bulle de départ, ce qu'un style existe précisément pour éviter.
   */
  test('⚠️ UN CHAMP D’APPARENCE QUE LE STYLE NE NOMME PAS EST RETIRÉ, PAS CONSERVÉ', () => {
    const texturee = { ...BULLE, bulleTexture: 'lave' };
    const nu = styleDeLaBulle3D({ bulleShape: 'rect', bulleColor: '#ffffff' });
    const apres = appliquerStyle3D(texturee, nu);
    assert.ok(!('bulleTexture' in apres),
      'la texture a survécu à un style qui n’en déclare pas : l’absence n’est pas un réglage');
    assert.equal(apres.bulleShape, 'rect');
  });

  test('⚠️ ET LA GÉOMÉTRIE, LE TEXTE ET L’ÉTAT DE FUSION SURVIVENT INTACTS', () => {
    const apres = appliquerStyle3D(BULLE, { bulleShape: 'rect' });
    for (const cle of CHAMPS_HORS_STYLE) {
      if (!(cle in BULLE)) continue;
      assert.deepEqual(apres[cle], BULLE[cle], `« ${cle} » a été touché par un style`);
    }
  });

  test('appliquer deux fois le même style ne change rien la seconde fois', () => {
    const style = styleDeLaBulle3D({ ...BULLE, bulleShape: 'rect' });
    const une = appliquerStyle3D(BULLE, style);
    assert.deepEqual(appliquerStyle3D(une, style), une);
  });

  test('la Bulle d’origine n’est pas modifiée', () => {
    const avant = JSON.stringify(BULLE);
    appliquerStyle3D(BULLE, { bulleShape: 'rect' });
    assert.equal(JSON.stringify(BULLE), avant, 'la fonction n’est pas pure');
  });
});

describe('#425j — reconnaître qu’une Bulle porte déjà un style', () => {
  test('⚠️ UNE BULLE À QUI L’ON VIENT D’APPLIQUER UN STYLE LE PORTE', () => {
    const style = styleDeLaBulle3D({ ...BULLE, bulleShape: 'rect' });
    assert.equal(bulleSuitLeStyle3D(appliquerStyle3D(BULLE, style), style), true);
  });

  /**
   * ⚠️ L'ÉGALITÉ VA DANS LES DEUX SENS, ET CE N'EST PAS UN RAFFINEMENT. Ne vérifier que « le style
   * est inclus dans la Bulle » dirait « conforme » d'une Bulle qui porte en PLUS une texture : le
   * bouton « Enregistrer » s'éteindrait alors qu'enregistrer aurait produit un style différent.
   */
  test('⚠️ UNE BULLE QUI PORTE UN AXE DE PLUS NE SUIT PAS LE STYLE', () => {
    const style = styleDeLaBulle3D({ bulleShape: 'rect' });
    assert.equal(bulleSuitLeStyle3D({ bulleShape: 'rect' }, style), true, 'le repère');
    assert.equal(bulleSuitLeStyle3D({ bulleShape: 'rect', bulleTexture: 'lave' }, style), false,
      'une Bulle texturée passe pour conforme à un style qui n’a pas de texture');
  });

  test('la géométrie et le texte ne comptent pas dans la comparaison', () => {
    const style = styleDeLaBulle3D(BULLE);
    const ailleurs = { ...BULLE, x: 999, y: 999, w: 12, h: 12, description: 'AUTRE CHOSE', z: 9 };
    assert.equal(bulleSuitLeStyle3D(ailleurs, style), true,
      'déplacer une Bulle ou changer son texte la ferait sortir de son style');
  });

  test('⚠️ LE BOUTON S’ÉTEINT DÈS QU’UN STYLE DE LA BIBLIOTHÈQUE CORRESPOND', () => {
    const biblio = [
      { nom: 'Cri', style: styleDeLaBulle3D({ bulleShape: 'etoile' }) },
      { nom: 'Pensée', style: styleDeLaBulle3D(BULLE) },
    ];
    assert.equal(peutEnregistrerLeStyle3D(BULLE, biblio), false, 'le style existe déjà');
    assert.equal(styleCorrespondant3D(BULLE, biblio).nom, 'Pensée');
    assert.equal(peutEnregistrerLeStyle3D({ ...BULLE, bulleColor: '#123456' }, biblio), true,
      'une Bulle qui ne correspond à rien doit pouvoir être enregistrée');
    // Bibliothèque vide, et absence de Bulle : deux cas que la fiche rencontrera.
    assert.equal(peutEnregistrerLeStyle3D(BULLE, []), true);
    assert.equal(peutEnregistrerLeStyle3D(null, biblio), false);
  });
});

describe('#425j — nommer un style', () => {
  test('⚠️ UN NOM VIDE, TROP LONG OU DÉJÀ PRIS EST REFUSÉ, ET LE MOTIF EST UNE CLÉ', () => {
    const biblio = [{ nom: 'Cri', style: {} }];
    assert.equal(refusDuNomDeStyle3D('Pensée', biblio), null);
    assert.equal(refusDuNomDeStyle3D('', biblio), 'vide');
    assert.equal(refusDuNomDeStyle3D('   ', biblio), 'vide', 'des espaces ne sont pas un nom');
    assert.equal(refusDuNomDeStyle3D(null, biblio), 'vide');
    assert.equal(refusDuNomDeStyle3D('x'.repeat(NOM_STYLE_MAX + 1), biblio), 'trop-long');
    assert.equal(refusDuNomDeStyle3D('x'.repeat(NOM_STYLE_MAX), biblio), null, 'la borne est incluse');
    assert.equal(refusDuNomDeStyle3D('Cri', biblio), 'doublon');
    // ⚠️ ET LE DOUBLON IGNORE LA CASSE ET LES ESPACES DE BORD : « cri » et « Cri  » sont le même
    // style pour qui lit la liste, et deux entrées indiscernables font du menu un piège.
    assert.equal(refusDuNomDeStyle3D('  cri ', biblio), 'doublon');
  });

  test('⚠️ LE NOM EST NETTOYÉ À L’ENREGISTREMENT, PAS PAR L’APPELANT', () => {
    // Sinon le contrôle des doublons et l'écriture appliqueraient deux nettoyages différents, et un
    // nom accepté ne serait pas celui qu'on enregistre.
    const biblio = ajouterStyle3D([], '  Pensée  ', { bulleShape: 'ovale' });
    assert.equal(biblio[0].nom, 'Pensée');
    assert.equal(refusDuNomDeStyle3D('pensée', biblio), 'doublon');
  });

  test('ajouter rend un NOUVEAU tableau, et copie le style', () => {
    const avant = [];
    const style = { bulleShape: 'ovale' };
    const apres = ajouterStyle3D(avant, 'A', style);
    assert.equal(avant.length, 0, 'la bibliothèque d’origine a été modifiée');
    style.bulleShape = 'rect';
    assert.equal(apres[0].style.bulleShape, 'ovale', 'le style n’a pas été copié');
  });
});

describe('#425j — relire une bibliothèque écrite sur disque', () => {
  /**
   * ⚠️ UNE BIBLIOTHÈQUE ILLISIBLE VAUT UNE BIBLIOTHÈQUE VIDE, ELLE NE LÈVE PAS. `settings.json` est
   * un fichier que l'utilisateur peut éditer et qu'un disque plein a pu tronquer. Refuser de
   * démarrer pour un réglage d'agrément mettrait l'Application à genoux — même politique que la
   * géométrie de fenêtre de #407b.
   */
  test('⚠️ CE QUI N’EST PAS UNE BIBLIOTHÈQUE REND UNE BIBLIOTHÈQUE VIDE', () => {
    for (const brut of [undefined, null, 0, 'texte', {}, { nom: 'A' }]) {
      assert.deepEqual(bibliothequeLue3D(brut), [], `« ${JSON.stringify(brut)} » aurait dû rendre []`);
    }
  });

  test('⚠️ UNE ENTRÉE ABÎMÉE EST ÉCARTÉE SEULE, ELLE N’EMPORTE PAS LES AUTRES', () => {
    const lu = bibliothequeLue3D([
      { nom: 'Bon', style: { bulleShape: 'rect' } },
      null,
      { nom: '', style: {} },
      { nom: 'Sans style' },
      { nom: 'Style pas un objet', style: 'rect' },
      { nom: 'Style en tableau', style: ['rect'] },
      { nom: '  Espaces  ', style: { bulleColor: '#fff' } },
    ]);
    assert.deepEqual(lu.map(e => e.nom), ['Bon', 'Espaces'],
      'une seule ligne abîmée a emporté les autres, ou une mauvaise a été gardée');
  });

  test('⚠️ ET UN STYLE RELU EST RENETTOYÉ : un fichier trafiqué ne fait pas voyager la géométrie', () => {
    // Quelqu'un — ou une version antérieure — peut avoir écrit une Bulle entière dans le fichier.
    // L'appliquer déplacerait la Bulle à laquelle on l'applique, ce qu'aucun style ne doit faire.
    const lu = bibliothequeLue3D([{ nom: 'Trafiqué', style: { ...BULLE } }]);
    for (const cle of CHAMPS_HORS_STYLE) {
      assert.ok(!(cle in lu[0].style), `« ${cle} » a survécu à la relecture`);
    }
    assert.equal(lu[0].style.bulleShape, 'etoile', 'le témoin : l’apparence, elle, est bien relue');
  });
});

describe('#425j bis — renommer et supprimer un style', () => {
  const biblio = () => [
    { nom: 'Cri', style: { bulleShape: 'etoile' } },
    { nom: 'Pensée', style: { bulleShape: 'ovale', tailShape: 'ronds' } },
  ];

  /**
   * ⚠️ RENOMMER UN STYLE EN LUI-MÊME N'EST PAS UN DOUBLON, ET SANS CE `sauf` RENOMMER SERAIT
   * IMPOSSIBLE. Ouvrir la modale sur « Cri », corriger une virgule et valider referait tomber sur
   * « Cri » : le style serait déclaré doublon de LUI-MÊME. Le refus paraît absurde à l'usage et
   * aucune relecture du contrôle seul ne le voit, puisqu'il est juste pour l'ajout.
   */
  test('⚠️ LE CONTRÔLE DU NOM IGNORE L’ENTRÉE QU’ON RENOMME', () => {
    const b = biblio();
    assert.equal(refusDuNomDeStyle3D('Cri', b), 'doublon', 'le repère : à l’ajout, c’est un doublon');
    assert.equal(refusDuNomDeStyle3D('Cri', b, 0), null, 'renommer « Cri » en « Cri » est refusé');
    assert.equal(refusDuNomDeStyle3D('  cri  ', b, 0), null, 'la casse et les espaces aussi');
    // Mais prendre le nom d'un AUTRE style reste un doublon, `sauf` ne désarme pas le contrôle.
    assert.equal(refusDuNomDeStyle3D('Pensée', b, 0), 'doublon');
  });

  test('⚠️ RENOMMER NE TOUCHE QUE LE NOM, ET NETTOIE COMME L’AJOUT', () => {
    const apres = renommerStyle3D(biblio(), 0, '  Hurlement ');
    assert.equal(apres[0].nom, 'Hurlement');
    assert.deepEqual(apres[0].style, { bulleShape: 'etoile' }, 'le style a été touché');
    assert.equal(apres[1].nom, 'Pensée', 'une autre entrée a été touchée');
  });

  test('⚠️ SUPPRIMER RETIRE LA BONNE ENTRÉE, ET UNE SEULE', () => {
    const apres = supprimerStyle3D(biblio(), 0);
    assert.deepEqual(apres.map(e => e.nom), ['Pensée']);
  });

  /**
   * ⚠️ UN INDEX HORS LISTE NE FAIT RIEN ET NE LÈVE PAS. La fiche appelle ces fonctions avec l'index
   * lu dans son menu, et ce menu peut avoir été reconstruit entre-temps — bibliothèque relue, autre
   * Projet ouvert. Lever mettrait l'Application à genoux pour un décalage d'affichage.
   */
  test('⚠️ UN INDEX HORS LISTE LAISSE LA BIBLIOTHÈQUE INTACTE', () => {
    for (const i of [-1, 2, 99, undefined, null]) {
      assert.deepEqual(renommerStyle3D(biblio(), i, 'X').map(e => e.nom), ['Cri', 'Pensée']);
      assert.deepEqual(supprimerStyle3D(biblio(), i).map(e => e.nom), ['Cri', 'Pensée']);
    }
    assert.deepEqual(renommerStyle3D(null, 0, 'X'), []);
    assert.deepEqual(supprimerStyle3D(null, 0), []);
  });

  test('les deux rendent un NOUVEAU tableau', () => {
    const avant = biblio();
    renommerStyle3D(avant, 0, 'X');
    supprimerStyle3D(avant, 0);
    assert.deepEqual(avant.map(e => e.nom), ['Cri', 'Pensée'], 'la bibliothèque a été modifiée');
  });

  /**
   * ⚠️ « LEQUEL » ET « À QUELLE PLACE » SONT LA MÊME QUESTION, ET NE SE POSENT QU'UNE FOIS. La
   * fiche a besoin de l'index pour renommer et supprimer ; refaire un `indexOf` sur l'entrée
   * rendue serait une seconde recherche, qui répondrait différemment le jour où deux styles
   * deviennent identiques.
   */
  test('⚠️ L’INDEX ET L’ENTRÉE DÉSIGNENT TOUJOURS LE MÊME STYLE', () => {
    const b = biblio();
    const o = { id: 'x', type: 'bulle', bulleShape: 'ovale', tailShape: 'ronds' };
    assert.equal(indexDuStyleDeLaBulle3D(o, b), 1);
    assert.equal(styleCorrespondant3D(o, b), b[1]);
    assert.equal(indexDuStyleDeLaBulle3D({ bulleShape: 'rect' }, b), -1);
    assert.equal(styleCorrespondant3D({ bulleShape: 'rect' }, b), null);
    // Deux styles identiques : les deux lectures doivent désigner le PREMIER, pas chacun le sien.
    const jumeaux = [...b, { nom: 'Copie', style: { bulleShape: 'etoile' } }];
    const cri = { bulleShape: 'etoile' };
    assert.equal(indexDuStyleDeLaBulle3D(cri, jumeaux), 0);
    assert.equal(styleCorrespondant3D(cri, jumeaux), jumeaux[0]);
  });
});

describe('#425j ter — un renommage qui ne change rien', () => {
  /**
   * ⚠️ LA COMPARAISON NETTOIE LES BORDS MAIS RESPECTE LA CASSE, ET LES DEUX MOITIÉS COMPTENT.
   * `renommerStyle3D` retire les espaces de bord : «  Cri  » n'écrirait donc rien, et le bouton
   * doit le dire. Changer la CASSE, en revanche, est un vrai renommage — « cri » vers « Cri » se
   * voit dans la liste, et refuser ce geste ferait du contrôle une gêne plutôt qu'une aide.
   */
  test('⚠️ LES ESPACES DE BORD NE COMPTENT PAS, LA CASSE SI', () => {
    assert.equal(renommageSansEffet3D('Cri', 'Cri'), true);
    assert.equal(renommageSansEffet3D('  Cri  ', 'Cri'), true, 'les espaces de bord sont retirés');
    assert.equal(renommageSansEffet3D('cri', 'Cri'), false,
      'corriger la casse d’un style serait refusé');
    assert.equal(renommageSansEffet3D('Hurlement', 'Cri'), false);
  });

  test('un nom vide face à un ancien nom EST un changement', () => {
    // Il sera refusé par le contrôle du nom, avec son motif sous le champ — mais le bouton doit
    // rester cliquable pour que ce motif puisse s'afficher.
    assert.equal(renommageSansEffet3D('', 'Cri'), false);
    assert.equal(renommageSansEffet3D('   ', 'Cri'), false);
    // Et deux absences ne sont pas un changement.
    assert.equal(renommageSansEffet3D('', ''), true);
    assert.equal(renommageSansEffet3D(null, undefined), true);
  });

  /**
   * ⚠️ CE N'EST PAS LE CONTRÔLE DES DOUBLONS, ET LES CONFONDRE CASSERAIT LE RENOMMAGE. Celui-ci
   * ignore l'entrée qu'on renomme, donc il ACCEPTE le nom inchangé ; c'est ce test-ci qui dit qu'il
   * n'y a rien à faire. Les fusionner rendrait impossible de corriger la casse d'un style.
   */
  test('⚠️ « SANS EFFET » ET « DOUBLON » SONT DEUX QUESTIONS DISTINCTES', () => {
    const biblio = [{ nom: 'Cri', style: {} }];
    assert.equal(refusDuNomDeStyle3D('Cri', biblio, 0), null, 'le doublon accepte le nom inchangé');
    assert.equal(renommageSansEffet3D('Cri', 'Cri'), true, 'mais il n’y a rien à renommer');
    assert.equal(refusDuNomDeStyle3D('cri', biblio, 0), null, 'changer la casse reste accepté');
    assert.equal(renommageSansEffet3D('cri', 'Cri'), false, 'et c’est un vrai renommage');
  });
});
