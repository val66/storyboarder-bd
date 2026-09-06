/**
 * tests/fetch-fonts.test.mjs, la fabrique des polices embarquées.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * CE QUI EST TENU ICI, ET CE QUI NE PEUT PAS L'ÊTRE
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * `tools/fetch-fonts.mjs` fait deux choses de nature différente. Il PARLE au réseau, ce qu'aucun
 * test de ce dépôt ne fait, et il DÉCIDE : quel sous-ensemble garder, comment nommer un fichier,
 * quelle feuille écrire, quand refuser. La seconde moitié est pure, et c'est elle qu'on tient.
 *
 * Le script est écrit pour que l'import ne déclenche rien : son `main()` n'est appelé que lorsque
 * le fichier est le point d'entrée (`import.meta.url === argv[1]`), comme tools/bump-version.mjs.
 * Sans cette garde, importer le module ici partirait télécharger onze familles à chaque `npm test`.
 *
 * ⚠️ LA FIXTURE CSS EST UN EXTRAIT RÉEL, réduit. La forme exacte de la réponse de Google, un
 * commentaire de sous-ensemble AVANT chaque bloc et nulle part ailleurs, est la seule chose sur
 * laquelle repose tout le découpage. Si Google la change, ces tests continueront de passer et le
 * script échouera en vrai : c'est pourquoi le script REFUSE d'écrire quand un bloc arrive sans
 * commentaire, plutôt que de l'ignorer.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  FAMILLES, SOUS_ENSEMBLES, AFFICHAGE_POLICE,
  urlCss3D, blocsDeLaCss3D, nomDeFichier3D, feuilleLocale3D, recapitulatifLicences3D,
} from '../tools/fetch-fonts.mjs';
import { BUBBLE_FONT_PRELOAD_LIST } from '../src/help-content.js';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');

const CSS = `/* cyrillic */
@font-face {
  font-family: 'Inter';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url(https://fonts.gstatic.com/s/inter/v20/CYR.woff2) format('woff2');
  unicode-range: U+0301, U+0400-045F;
}
/* latin-ext */
@font-face {
  font-family: 'Inter';
  font-style: normal;
  font-weight: 700;
  font-display: swap;
  src: url(https://fonts.gstatic.com/s/inter/v20/EXT.woff2) format('woff2');
  unicode-range: U+0100-02BA, U+02BD-02C5;
}
/* latin */
@font-face {
  font-family: 'Comic Neue';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url(https://fonts.gstatic.com/s/comicneue/v8/LAT.woff2) format('woff2');
  unicode-range: U+0000-00FF, U+0131;
}`;

describe('Découpage de la réponse de Google', () => {
  test('le garde-fou : l\'extraction trouve bien trois blocs', () => {
    // Tout ce qui suit filtre ou compte. Sur un tableau vide, la moitié des assertions passeraient
    // en ne regardant rien : c'est l'erreur qu'on ne verrait jamais.
    assert.equal(blocsDeLaCss3D(CSS).length, 3);
  });

  test('chaque bloc emporte le sous-ensemble écrit AVANT lui', () => {
    // Le sous-ensemble ne figure PAS dans le bloc, seulement dans le commentaire qui le précède.
    // C'est la seule façon de savoir ce qu'on télécharge, et donc ce qu'on peut écarter.
    assert.deepEqual(blocsDeLaCss3D(CSS).map(b => b.sousEnsemble),
      ['cyrillic', 'latin-ext', 'latin']);
  });

  test('famille, graisse, plage et URL sont lues', () => {
    const b = blocsDeLaCss3D(CSS)[2];
    assert.equal(b.famille, 'Comic Neue');
    assert.equal(b.graisse, '400');
    assert.equal(b.style, 'normal');
    assert.equal(b.plage, 'U+0000-00FF, U+0131');
    assert.equal(b.url, 'https://fonts.gstatic.com/s/comicneue/v8/LAT.woff2');
  });

  test('RÉGRESSION : un bloc sans commentaire n\'est PAS ignoré en silence', () => {
    // Le laisser de côté ferait disparaître une police pour une raison invisible. Il ressort avec
    // un sous-ensemble nul, et c'est le script qui refuse d'écrire, bruyamment.
    const sansCommentaire = CSS.replace('/* latin */\n', '');
    const blocs = blocsDeLaCss3D(sansCommentaire);
    assert.equal(blocs.length, 3, 'le bloc a été avalé');
    assert.equal(blocs[2].sousEnsemble, null);
    assert.equal(blocs[2].famille, 'Comic Neue', 'le bloc reste lisible malgré tout');
  });

  test('le filtrage des sous-ensembles ne garde que le latin', () => {
    const gardes = blocsDeLaCss3D(CSS).filter(b => SOUS_ENSEMBLES.includes(b.sousEnsemble));
    assert.deepEqual(gardes.map(b => b.sousEnsemble), ['latin-ext', 'latin']);
    assert.ok(!SOUS_ENSEMBLES.includes('cyrillic'),
      'embarquer le cyrillique triplerait le poids pour des glyphes jamais affichés ici');
  });
});

describe('Nommage des fichiers locaux', () => {
  test('un nom lisible, sans l\'empreinte de Google', () => {
    // Le nom servi (`UcCO3FwrK3iLTeHu…woff2`) change à chaque révision de la police : le reprendre
    // ferait apparaître onze fichiers renommés à chaque exécution, sans qu'on puisse dire si le
    // dessin a bougé.
    const noms = blocsDeLaCss3D(CSS).map(nomDeFichier3D);
    assert.deepEqual(noms, ['Inter-400-cyrillic.woff2', 'Inter-700-latin-ext.woff2',
      'ComicNeue-400-latin.woff2']);
  });

  test('les noms sont uniques famille par famille, graisse et sous-ensemble compris', () => {
    // Deux blocs qui produiraient le même nom se recouvriraient : la seconde graisse écraserait la
    // première, et le texte gras s'afficherait en maigre sans erreur.
    const blocs = blocsDeLaCss3D(CSS);
    assert.equal(new Set(blocs.map(nomDeFichier3D)).size, blocs.length);
  });

  test('l\'espace et la ponctuation d\'un nom de famille disparaissent', () => {
    assert.equal(nomDeFichier3D({ famille: 'Comic Neue', graisse: '700', sousEnsemble: 'latin' }),
      'ComicNeue-700-latin.woff2');
  });
});

describe('La feuille locale écrite', () => {
  const blocs = blocsDeLaCss3D(CSS).filter(b => SOUS_ENSEMBLES.includes(b.sousEnsemble));
  const feuille = feuilleLocale3D(blocs);

  test('RÉGRESSION : plus AUCUNE URL distante', () => {
    // C'est tout l'objet du chantier. Une seule `https://` restante et le rendu redevient
    // dépendant du réseau, sans que rien ne le signale.
    assert.ok(!/https?:\/\//.test(feuille), 'une URL distante subsiste dans la feuille générée');
    assert.match(feuille, /url\(\.\/Inter-700-latin-ext\.woff2\)/);
  });

  test('la plage Unicode est reprise TELLE QUELLE', () => {
    // C'est elle qui permet de ne charger latin-ext que si un caractère l'exige. La réécrire à la
    // main serait la seule façon de la casser.
    assert.match(feuille, /unicode-range: U\+0100-02BA, U\+02BD-02C5;/);
    assert.match(feuille, /unicode-range: U\+0000-00FF, U\+0131;/);
  });

  test('RÉGRESSION : font-display passe de swap à block', () => {
    // `swap` dessine en police de repli puis rebascule. Sur disque l'attente est de quelques
    // millisecondes, et le rebasculement donnerait un instant de Bulles en mauvaise police.
    assert.equal(AFFICHAGE_POLICE, 'block');
    assert.ok(!/font-display:\s*swap/.test(feuille), 'la feuille locale a gardé swap');
    assert.equal((feuille.match(/font-display: block;/g) || []).length, blocs.length,
      'chaque bloc doit porter la décision, pas seulement le premier');
  });

  test('elle se déclare générée', () => {
    // Sans cette phrase, la première correction utile sera faite à la main et perdue à la
    // prochaine exécution du script.
    assert.match(feuille, /NE PAS MODIFIER À LA MAIN/);
    assert.match(feuille, /tools\/fetch-fonts\.mjs/);
  });

  test('le garde-fou : la feuille n\'est pas vide', () => {
    assert.equal((feuille.match(/@font-face/g) || []).length, blocs.length);
    assert.ok(blocs.length >= 2, 'la fixture ne fournit plus assez de blocs pour mesurer');
  });
});

describe('L\'URL demandée à Google', () => {
  test('les espaces deviennent des +, les graisses se joignent par ;', () => {
    const url = urlCss3D([{ nom: 'Comic Neue', graisses: [400, 700] }]);
    assert.equal(url,
      'https://fonts.googleapis.com/css2?family=Comic+Neue:wght@400;700&display=swap');
  });

  test('toutes les familles voyagent dans une SEULE requête', () => {
    const url = urlCss3D(FAMILLES);
    assert.equal((url.match(/family=/g) || []).length, FAMILLES.length);
    FAMILLES.forEach(f => assert.ok(url.includes(f.nom.replace(/ /g, '+')),
      `${f.nom} absente de l'URL`));
  });
});

describe('La liste des familles, et ses accords', () => {
  test('RÉGRESSION : les polices de Bulles proposées sont TOUTES téléchargées', () => {
    // L'accord qui compte. `BUBBLE_FONT_PRELOAD_LIST` alimente la liste déroulante du texte des
    // Bulles. Une famille proposée mais absente d'ici serait une police fantôme : choisissable,
    // jamais dessinée, et retombant en sans-serif sans le moindre message.
    const telechargees = new Set(FAMILLES.map(f => f.nom));
    const fantomes = BUBBLE_FONT_PRELOAD_LIST.filter(n => !telechargees.has(n));
    assert.deepEqual(fantomes, [], `proposées aux Bulles mais jamais embarquées : ${fantomes}`);
    assert.ok(BUBBLE_FONT_PRELOAD_LIST.length >= 5, 'la liste des Bulles est devenue trop courte pour mesurer');
  });

  test('RÉGRESSION : la police de l\'interface est embarquée elle aussi', () => {
    // Inter n'est dans aucune liste de Bulles : rien ne la rattraperait si elle sortait d'ici, et
    // c'est toute l'interface qui changerait d'aspect.
    assert.ok(FAMILLES.some(f => f.nom === 'Inter'));
    const css = readFileSync(join(RACINE, 'style.css'), 'utf8');
    assert.ok(css.includes("font-family:'Inter'") || css.includes("font-family: 'Inter'"),
      'style.css n\'utilise plus Inter : la liste des familles est périmée');
  });

  test('chaque famille dit son dossier d\'origine, et donc sa licence', () => {
    // `ofl/` et `apache/` sont les deux dossiers du dépôt google/fonts, et le dossier ENCODE la
    // licence. Vérifié famille par famille sur le listing du dépôt.
    FAMILLES.forEach(f => {
      assert.ok(['ofl', 'apache'].includes(f.repertoire), `${f.nom} : dossier « ${f.repertoire} »`);
      assert.match(f.slug, /^[a-z0-9]+$/, `${f.nom} : le slug doit être le nom du dossier`);
      assert.ok(f.graisses.length >= 1, `${f.nom} : aucune graisse demandée`);
    });
  });

  test('les deux familles sous Apache sont NOMMÉMENT celles-là', () => {
    // Épinglé, parce que c'est une affirmation de licence et qu'elle doit se relire. Toutes les
    // autres sont sous OFL 1.1.
    const apache = FAMILLES.filter(f => f.repertoire === 'apache').map(f => f.nom).sort();
    assert.deepEqual(apache, ['Luckiest Guy', 'Permanent Marker']);
  });
});

describe('Le récapitulatif de licences', () => {
  const fiches = [
    { nom: 'Inter', designer: 'Rasmus Andersson', licence: 'SIL OFL 1.1', copyright: 'Copyright x' },
    { nom: 'Luckiest Guy', designer: 'Astigmatic', licence: 'Apache 2.0', copyright: 'Copyright y' },
  ];
  const md = recapitulatifLicences3D(fiches);

  test('une ligne par famille, avec créateur et copyright', () => {
    // L'OFL comme Apache 2.0 exigent que la mention de copyright voyage avec les fichiers. Une
    // colonne vide vaudrait absence.
    fiches.forEach(f => {
      assert.ok(md.includes(f.nom), `${f.nom} absente du récapitulatif`);
      assert.ok(md.includes(f.copyright), `copyright de ${f.nom} absent`);
      assert.ok(md.includes(f.designer), `créateur de ${f.nom} absent`);
    });
  });

  test('il dit ce que les licences N\'IMPOSENT PAS au projet', () => {
    // La question a été posée explicitement, et la réponse mérite d'être écrite là où quelqu'un la
    // relira, plutôt que laissée à la mémoire d'une conversation.
    assert.match(md, /places any condition on the rest of this project/);
    assert.match(md, /SIL Open Font\nLicense 1\.1 nor Apache 2\.0/,
      'les deux licences doivent être nommées, pas seulement évoquées');
    assert.match(md, /LICENSE\.txt/, 'le récapitulatif doit dire où sont les textes complets');
  });

  test('il se déclare généré', () => {
    assert.match(md, /DO NOT EDIT BY HAND/);
  });
});

/**
 * JOURNAL DE MUTATION : cinq fautes, cinq rouges.
 *
 *   F1 le commentaire de sous-ensemble rendu OBLIGATOIRE par le motif           ROUGE
 *      (un bloc nu disparaît alors du découpage, en silence)
 *   F2 la feuille locale garde les URL de Google                                ROUGE
 *   F3 `font-display` remis à `swap`                                            ROUGE
 *   F4 Kalam retirée de FAMILLES, mais toujours proposée aux Bulles             ROUGE
 *   F5 la graisse retirée du nom de fichier                                     ROUGE (3 tests)
 *
 * F1 est la plus instructive. C'est la mutation qu'un relecteur pressé appellerait un nettoyage :
 * le commentaire est toujours là dans la réponse de Google, alors pourquoi le rendre facultatif ?
 * Parce que le jour où il ne l'est plus, la version optionnelle REFUSE d'écrire tandis que la
 * version obligatoire perd la police sans un mot. Les deux comportements sont défendables ; un
 * seul se remarque.
 *
 * F5 est celle qui coûterait le plus cher à l'usage : deux graisses d'une même famille
 * s'écriraient dans le même fichier, la seconde écrasant la première. Le gras s'afficherait en
 * maigre, sans la moindre erreur, et personne ne penserait à regarder du côté du nommage.
 *
 * CE QUI N'EST PAS TENU ICI, et il faut le dire : que l'API de Google réponde ce qu'on attend, que
 * le User-Agent obtienne bien du woff2, et que les fichiers téléchargés soient des polices
 * valides. Les trois demandent le réseau, qu'aucun test de ce dépôt n'utilise. C'est pour cela que
 * le script lui-même vérifie la présence de `format('woff2')` et refuse d'écrire quand une famille
 * manque : les gardes vivent là où la donnée arrive, pas ici.
 */
