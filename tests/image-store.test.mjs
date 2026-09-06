/**
 * tests/image-store.test.mjs, le nommage et le rangement d'une image de Case.
 *
 * Jumeau de tests/model-store.test.mjs, et pour cause : les deux magasins font le même métier. Ce
 * fichier n'existe donc que pour ce qui DIFFÈRE, et la différence est réelle — un modèle a une
 * extension qu'on peut réimposer, une image en a quatre et `photo.png` ne doit jamais devenir
 * `photo.jpg`.
 *
 * Hors de portée, comme partout : le disque. Le pont est substitué, ce qui laisse vérifier ce qui
 * se décide, et pas ce que le système de fichiers fait.
 */
import './helpers/dom-stub.mjs';
import { sourceSansCommentaires } from './helpers/source.mjs';
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  EXTENSIONS_IMAGE_3D, sanitizeImageName, resolveImageName,
  CHAMP_IMAGE_CASE, imageDeLaCase3D, casePorteUneImage3D,
  setImageBridge, listImages, importImage, readImage, renameImage, deleteImage,
  caseAccepteUneImage3D, entreesImageDuMenu3D,
  CHAMP_ANCRAGE_X_IMAGE, CHAMP_ANCRAGE_Y_IMAGE, ANCRAGE_CENTRE_IMAGE,
  ancrageValide3D, ancrageDeLImage3D,
  CHAMP_ZOOM_IMAGE, ZOOM_IMAGE_MIN, ZOOM_IMAGE_MAX, zoomValide3D, zoomDeLImage3D,
  cadrageParDefaut3D, reinitialiserCadrage3D,
} from '../src/image-store.js';
import {
  imageState, getLoadedImage, collectImageFiles, preloadImages, _setImageCacheEntry,
} from '../src/image-cache.js';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const octets = (...v) => new Uint8Array(v);

beforeEach(() => setImageBridge(null));

describe('sanitizeImageName : un nom de fichier, et l\'extension d\'origine', () => {
  test('un nom ordinaire passe intact', () => {
    assert.equal(sanitizeImageName('croquis.png'), 'croquis.png');
    assert.equal(sanitizeImageName('  planche 12.webp  '), 'planche 12.webp');
  });

  test('⚠️ L\'EXTENSION EST PRÉSERVÉE, jamais réimposée', () => {
    // C'EST LA DIFFÉRENCE AVEC LES MODÈLES, et elle inverse la règle centrale du jumeau.
    // `sanitizeModelName` force `.glb` parce qu'il n'y a qu'un format ; ici, forcer une extension
    // renommerait un JPEG en PNG, et le fichier mentirait sur son contenu.
    EXTENSIONS_IMAGE_3D.forEach(ext => {
      assert.equal(sanitizeImageName('image' + ext), 'image' + ext, ext);
    });
    // ⚠️ MAIS L'EXTENSION EST RAMENÉE EN MINUSCULES, et mon premier test attendait le contraire.
    // Le fichier écrit est une COPIE dont nous choisissons le nom : laisser `.JPG` vivre à côté de
    // `.jpg` remplirait le dossier de jumeaux que Windows tient pour identiques et que la liste
    // montre séparément. Le fichier d'origine de l'utilisateur n'est jamais touché.
    assert.equal(sanitizeImageName('photo.JPG'), 'photo.jpg');
    assert.equal(sanitizeImageName('vue:2.WEBP'), 'vue_2.webp');
  });

  test('une extension étrangère est REFUSÉE, pas corrigée', () => {
    // Rendre « dessin.png » à partir de « dessin.bmp » produirait un fichier dont le nom ment : le
    // décodage échouerait plus tard, loin d'ici, sur une image que l'utilisateur croirait convertie.
    ['dessin.bmp', 'anime.gif', 'schema.svg', 'notes.txt', 'sans-extension'].forEach(n => {
      assert.equal(sanitizeImageName(n), null, n);
    });
  });

  test('un chemin ne sort pas du dossier', () => {
    // La garde qui compte. Le process principal refuse de son côté, mais un nom composé ici doit
    // déjà être propre : deux défenses, pas une seule qu'on croit suffisante.
    assert.equal(sanitizeImageName('../../../Bureau/vol.png'), 'vol.png');
    assert.equal(sanitizeImageName('C:\\Users\\moi\\image.png'), 'image.png');
    // ⚠️ ET CELUI-CI M'A CORRIGÉ : les points de tête sont retirés AVANT que l'extension soit lue,
    // donc « ..png » devient « png », un nom SANS extension, donc un refus. J'attendais « png.png ».
    // Le refus est la bonne réponse, et c'est aussi lui qui rend un nom de base vide impossible.
    assert.equal(sanitizeImageName('..png'), null);
  });

  test('les caractères interdits sous Windows sont remplacés', () => {
    assert.equal(sanitizeImageName('a:b*c?.png'), 'a_b_c_.png');
  });

  test('un fichier CACHÉ est refusé, il ne devient pas une image nommée', () => {
    // « .png » n'est pas une image qui s'appellerait « png » : c'est un fichier caché. Une première
    // version prévoyait un repli « image.png » pour ce cas ; il n'était pas atteignable, et une
    // branche qu'on ne sait pas atteindre est une branche qu'on ne sait pas vérifier.
    assert.equal(sanitizeImageName('.png'), null);
    assert.equal(sanitizeImageName('   .webp'), null);
  });

  test('un point au milieu du nom ne gêne pas', () => {
    assert.equal(sanitizeImageName('planche.12.png'), 'planche.12.png');
  });
});

describe('resolveImageName : ne jamais écraser une image existante', () => {
  test('libre : le nom demandé', () => {
    assert.equal(resolveImageName('croquis.png', ['autre.png']), 'croquis.png');
  });

  test('pris : le suffixe s\'insère AVANT l\'extension', () => {
    // Le piège du jumeau, à l'identique : « croquis.png (2) » ne serait plus une image pour le
    // système de fichiers, ni pour notre propre garde d'extension.
    assert.equal(resolveImageName('croquis.png', ['croquis.png']), 'croquis (2).png');
    assert.equal(resolveImageName('croquis.png', ['croquis.png', 'croquis (2).png']),
      'croquis (3).png');
  });

  test('la casse ne libère pas un nom', () => {
    // Windows ne distingue pas `Croquis.png` de `croquis.png` : rendre l'un « libre » écraserait
    // l'autre.
    assert.equal(resolveImageName('croquis.png', ['CROQUIS.PNG']), 'croquis (2).png');
  });

  test('une extension étrangère ne donne aucun nom', () => {
    assert.equal(resolveImageName('anime.gif', []), null);
  });
});

describe('Le champ d\'une Case', () => {
  test('il est AJOUTÉ, il ne remplace rien', () => {
    // La règle des données persistées : ajouter est permis, renommer ne l'est pas. Un Projet d'avant
    // s'ouvre inchangé, et une version antérieure de l'application ignore simplement ce champ.
    assert.equal(CHAMP_IMAGE_CASE, 'imageFile');
    const source = readFileSync(join(RACINE, 'src', 'image-store.js'), 'utf8');
    assert.ok(!/panel\.type\s*=/.test(source), 'le type d\'une Case ne change pas');
  });

  test('les deux champs de cadrage sont AJOUTÉS eux aussi (#403e)', () => {
    assert.equal(CHAMP_ANCRAGE_X_IMAGE, 'imageAnchorX');
    assert.equal(CHAMP_ANCRAGE_Y_IMAGE, 'imageAnchorY');
    // Le centre est la valeur d'avant #403e : une Case jamais recadrée doit se dessiner exactement
    // comme elle se dessinait, sans quoi tous les Projets existants changeraient d'aspect.
    assert.equal(ANCRAGE_CENTRE_IMAGE, 0.5);
  });

  test('ancrageDeLImage3D rend TOUJOURS un couple utilisable', () => {
    // Elle est appelée à chaque dessin d'image : rendre null obligerait le chemin de dessin à s'en
    // garder, et l'oublier ferait disparaître l'image au lieu de la centrer.
    assert.deepEqual(ancrageDeLImage3D({ imageAnchorX: 0.25, imageAnchorY: 0.75 }), { x: 0.25, y: 0.75 });
    assert.deepEqual(ancrageDeLImage3D({}), { x: 0.5, y: 0.5 });
    assert.deepEqual(ancrageDeLImage3D(null), { x: 0.5, y: 0.5 });
  });

  test('RÉGRESSION : `null` vaut CENTRÉ, et surtout pas « collé à gauche »', () => {
    // ⚠️ ATTRAPÉ PAR MON PROPRE TEST, ET LA FAUTE ÉTAIT DANS LE CODE. `Number(null)` vaut 0, tout
    // comme `Number('')` : une garde bâtie sur le seul `Number.isFinite` prend donc `null` pour un
    // ancrage valide à l'extrême gauche. Un champ écrit `null` par un export, une fusion ou une
    // édition à la main aurait fait sauter l'image dans un coin à la réouverture, sans que le
    // fichier paraisse fautif. `undefined`, lui, passait déjà.
    [null, '', undefined, NaN, 'gauche', {}].forEach(v =>
      assert.equal(ancrageValide3D(v), 0.5, `${JSON.stringify(v)} devrait valoir centré`));
  });

  test('ancrageValide3D borne, et c\'est LA garantie « pas de bande blanche »', () => {
    assert.equal(ancrageValide3D(-3), 0);
    assert.equal(ancrageValide3D(7), 1);
    assert.equal(ancrageValide3D(0.42), 0.42);
    // Une chaîne numérique est acceptée : un JSON relu peut la porter, et la refuser recentrerait
    // une image que l'utilisateur avait bel et bien cadrée.
    assert.equal(ancrageValide3D('0.25'), 0.25);
  });

  test('le zoom est un champ AJOUTÉ, et son plancher est le cadrage couvrant (#403f)', () => {
    assert.equal(CHAMP_ZOOM_IMAGE, 'imageZoom');
    // ⚠️ 1 EST LE PLANCHER, ET C'EST LA GARANTIE « PAS DE BANDE BLANCHE » côté zoom. Descendre en
    // dessous ferait que l'image ne couvre plus la Case : c'est un autre besoin, pas du recadrage.
    assert.equal(ZOOM_IMAGE_MIN, 1);
    // Le plafond, lui, N'EST PAS MESURÉ, et le code le dit franchement. Ce test épingle la valeur
    // pour qu'elle ne bouge pas par accident, pas pour prétendre qu'elle est démontrée.
    assert.equal(ZOOM_IMAGE_MAX, 4);
  });

  test('zoomValide3D borne, et rend 1 pour tout ce qui n\'est pas lisible', () => {
    assert.equal(zoomValide3D(0.2), 1, 'sous le plancher : l\'image ne couvrirait plus la Case');
    assert.equal(zoomValide3D(99), 4);
    assert.equal(zoomValide3D(2.5), 2.5);
    assert.equal(zoomValide3D('1.5'), 1.5, 'un JSON relu peut porter une chaîne');
    [null, '', undefined, NaN, 'gros', {}].forEach(v =>
      assert.equal(zoomValide3D(v), 1, `${JSON.stringify(v)} devrait valoir le cadrage couvrant`));
    assert.equal(zoomDeLImage3D({}), 1);
    assert.equal(zoomDeLImage3D(null), 1);
  });

  test('cadrageParDefaut3D : ce qui décide de MONTRER « Recentrer »', () => {
    // Le bouton n'apparaît que s'il a quelque chose à défaire. Les trois champs comptent, et un
    // seul suffit à faire sortir du défaut.
    assert.equal(cadrageParDefaut3D({}), true);
    assert.equal(cadrageParDefaut3D({ imageAnchorX: 0.5, imageAnchorY: 0.5, imageZoom: 1 }), true,
      'écrire explicitement les valeurs par défaut ne doit pas compter comme un cadrage');
    assert.equal(cadrageParDefaut3D({ imageAnchorX: 0.2 }), false);
    assert.equal(cadrageParDefaut3D({ imageAnchorY: 0.9 }), false);
    assert.equal(cadrageParDefaut3D({ imageZoom: 2 }), false);
  });

  test('reinitialiserCadrage3D SUPPRIME les champs au lieu d\'y écrire le défaut', () => {
    // ⚠️ LA DIFFÉRENCE COMPTE POUR LE FICHIER. Un Projet recentré redevient identique, octet pour
    // octet, à un Projet jamais recadré : rien ne distingue « remis au centre » de « jamais
    // touché », ce qui est exactement la vérité.
    const o = { type: 'panel', imageFile: 'a.png', imageAnchorX: 0.2, imageAnchorY: 0.8, imageZoom: 3 };
    assert.equal(reinitialiserCadrage3D(o), true);
    assert.deepEqual(o, { type: 'panel', imageFile: 'a.png' });
    assert.equal(cadrageParDefaut3D(o), true);
    // Et l'image N'EST PAS détachée au passage : recentrer recadre, il ne retire rien.
    assert.equal(o.imageFile, 'a.png');
  });

  test('reinitialiserCadrage3D rend false quand il n\'y avait rien à défaire', () => {
    // C'est ce qui évite de marquer le Projet modifié pour un geste sans effet.
    assert.equal(reinitialiserCadrage3D({ type: 'panel', imageFile: 'a.png' }), false);
    assert.equal(reinitialiserCadrage3D(null), false);
  });

  test('imageDeLaCase3D ne répond que pour une Case', () => {
    assert.equal(imageDeLaCase3D({ type: 'panel', imageFile: 'a.png' }), 'a.png');
    assert.equal(imageDeLaCase3D({ type: 'objet3d', imageFile: 'a.png' }), null,
      'un Élément qui porterait ce champ par accident ne devient pas une Case à image');
    assert.equal(imageDeLaCase3D({ type: 'panel' }), null);
    assert.equal(imageDeLaCase3D(null), null);
  });

  test('une chaîne vide n\'est pas une image', () => {
    // Elle arrive après un détachement mal écrit. La traiter comme une image afficherait une Case
    // sans 3D et sans dessin : ni l'un ni l'autre, et rien pour l'expliquer.
    assert.equal(casePorteUneImage3D({ type: 'panel', imageFile: '' }), false);
    assert.equal(casePorteUneImage3D({ type: 'panel', imageFile: 'a.png' }), true);
  });
});

describe('importImage : ce qui est écrit, et ce qui ne l\'est pas', () => {
  test('sans pont : un refus explicite, jamais un silence', async () => {
    const r = await importImage();
    assert.equal(r.ok, false);
    assert.ok(r.error, 'un échec sans motif est un échec qu\'on ne peut pas corriger');
  });

  test('l\'utilisateur renonce : rien n\'est écrit', async () => {
    let écrits = 0;
    setImageBridge({
      pickImageFile: async () => ({ canceled: true }),
      writeImageFile: async () => { écrits++; return { ok: true }; },
    });
    assert.deepEqual(await importImage(), { canceled: true });
    assert.equal(écrits, 0);
  });

  test('un nom en collision reçoit un suffixe', async () => {
    const écrits = [];
    setImageBridge({
      pickImageFile: async () => ({ canceled: false, name: 'croquis.png', data: octets(9) }),
      listImageFiles: async () => ['croquis.png'],
      readImageFile: async () => ({ ok: true, data: octets(1, 2, 3) }),  // contenu DIFFÉRENT
      writeImageFile: async (nom, data) => { écrits.push([nom, data]); return { ok: true, name: nom }; },
    });
    const r = await importImage();
    assert.equal(r.ok, true);
    assert.equal(r.name, 'croquis (2).png');
    assert.equal(écrits.length, 1);
  });

  test('le MÊME fichier réimporté n\'est pas recopié', async () => {
    // On compare le CONTENU, pas le nom : c'est le seul critère qui ne se trompe pas. Sans lui,
    // rouvrir deux fois le même croquis remplirait le dossier de jumeaux.
    let écrits = 0;
    setImageBridge({
      pickImageFile: async () => ({ canceled: false, name: 'croquis.png', data: octets(1, 2, 3) }),
      listImageFiles: async () => ['croquis.png'],
      readImageFile: async () => ({ ok: true, data: octets(1, 2, 3) }),
      writeImageFile: async () => { écrits++; return { ok: true }; },
    });
    const r = await importImage();
    assert.deepEqual({ ok: r.ok, name: r.name, déjà: r.déjàPrésent },
      { ok: true, name: 'croquis.png', déjà: true });
    assert.equal(écrits, 0, 'un fichier identique a été recopié sous un second nom');
  });

  test('un format étranger est refusé AVANT toute écriture', async () => {
    // Le sélecteur filtre déjà sur l'extension ; cette garde couvre ce qu'un filtre de dialogue ne
    // couvre pas, un nom saisi à la main dans le champ du sélecteur.
    let écrits = 0;
    setImageBridge({
      pickImageFile: async () => ({ canceled: false, name: 'anime.gif', data: octets(1) }),
      listImageFiles: async () => [],
      writeImageFile: async () => { écrits++; return { ok: true }; },
    });
    const r = await importImage();
    assert.equal(r.ok, false);
    assert.equal(écrits, 0);
  });

  test('un fichier vide est refusé', async () => {
    setImageBridge({ pickImageFile: async () => ({ canceled: false, name: 'a.png', data: octets() }) });
    assert.equal((await importImage()).ok, false);
  });

  test('une écriture refusée par le process principal remonte telle quelle', async () => {
    setImageBridge({
      pickImageFile: async () => ({ canceled: false, name: 'a.png', data: octets(1) }),
      listImageFiles: async () => [],
      writeImageFile: async () => ({ ok: false, error: 'disque plein' }),
    });
    assert.deepEqual(await importImage(), { ok: false, error: 'disque plein' });
  });
});

describe('readImage : une image introuvable n\'est pas une raison de vider la Case', () => {
  test('l\'échec est rendu, pas lancé', async () => {
    setImageBridge({ readImageFile: async () => ({ ok: false, error: 'ENOENT' }) });
    const r = await readImage('parti.png');
    assert.equal(r.ok, false);
    assert.ok(r.error);
  });

  test('même une exception du pont devient un résultat', async () => {
    // Une exception traversant l'appelant interromprait le dessin de la Planche ENTIÈRE, pour une
    // image manquante dans une seule Case.
    setImageBridge({ readImageFile: async () => { throw new Error('IPC coupé'); } });
    assert.equal((await readImage('a.png')).ok, false);
  });

  test('un nom refusé ne va même pas jusqu\'au pont', async () => {
    let lectures = 0;
    setImageBridge({ readImageFile: async () => { lectures++; return { ok: true }; } });
    assert.equal((await readImage('../secret.png')).ok !== undefined, true);
    assert.equal((await readImage('anime.gif')).ok, false);
    assert.equal(lectures, 1, 'seul le nom acceptable a atteint le pont');
  });
});

describe('renameImage : « appelle-le comme ça », et pas autre chose', () => {
  test('AUCUNE résolution de collision, contrairement à l\'import', async () => {
    // À l'import l'utilisateur demande « range ce fichier » ; au renommage il demande « appelle-le
    // comme ça ». Lui rendre « croquis (2).png » répondrait à une question qu'il n'a pas posée.
    let demandé = null;
    setImageBridge({
      renameImageFile: async (a, n) => { demandé = n; return { ok: false, error: 'une image porte déjà ce nom' }; },
    });
    const r = await renameImage('a.png', 'croquis.png');
    assert.equal(demandé, 'croquis.png');
    assert.equal(r.ok, false);
  });

  test('le nom demandé est assaini, l\'extension reste la sienne', async () => {
    let demandé = null;
    setImageBridge({ renameImageFile: async (a, n) => { demandé = n; return { ok: true, name: n }; } });
    await renameImage('a.png', '../ailleurs/vue:2.webp');
    assert.equal(demandé, 'vue_2.webp');
  });

  test('une extension étrangère est refusée sans appeler le pont', async () => {
    let appels = 0;
    setImageBridge({ renameImageFile: async () => { appels++; return { ok: true }; } });
    assert.equal((await renameImage('a.png', 'a.gif')).ok, false);
    assert.equal(appels, 0);
  });
});

describe('deleteImage : le geste qui efface VRAIMENT', () => {
  test('il passe par le pont, une fois le nom vérifié', async () => {
    const effacés = [];
    setImageBridge({ deleteImageFile: async (n) => { effacés.push(n); return { ok: true }; } });
    assert.equal((await deleteImage('a.png')).ok, true);
    assert.equal((await deleteImage('anime.gif')).ok, false);
    assert.deepEqual(effacés, ['a.png']);
  });

  test('⚠️ CE N\'EST PAS LE DÉTACHEMENT, et le code le dit', () => {
    // La décision 4 de docs/en/panel-images.md : la section Image d'une Case détache, elle n'efface
    // rien, parce que deux Cases peuvent porter la même image. Confondre les deux gestes ferait
    // disparaître une image sous les yeux d'une autre Case, sans un mot.
    const source = readFileSync(join(RACINE, 'src', 'image-store.js'), 'utf8');
    const i = source.indexOf('export async function deleteImage');
    const entete = source.slice(source.lastIndexOf('/**', i), i);
    assert.match(entete, /DÉTACHE|détache/,
      'l\'en-tête ne distingue plus effacer de détacher : les deux gestes vont se confondre');
  });
});

describe('listImages : une liste, ou rien, jamais une exception', () => {
  test('sans pont : liste vide', async () => {
    assert.deepEqual(await listImages(), []);
  });

  test('un pont qui lève ne casse pas l\'appelant', async () => {
    setImageBridge({ listImageFiles: async () => { throw new Error('IPC coupé'); } });
    assert.deepEqual(await listImages(), []);
  });
});

describe('Le pont : main.js se défend, il ne fait pas confiance', () => {
  const MAIN = readFileSync(join(RACINE, 'main.js'), 'utf8');

  test('les six canaux existent', () => {
    ['pick', 'write', 'read', 'list', 'delete', 'rename'].forEach(c => {
      assert.ok(MAIN.includes(`ipcMain.handle('images:${c}'`), `images:${c} manquant`);
    });
  });

  test('la garde de nom refuse un chemin, un fichier caché et une extension étrangère', () => {
    // Le process principal ne fait jamais confiance à son renderer, même quand c'est le nôtre : un
    // nom comme « ../../../Bureau/quelque-chose » écrirait hors du dossier des images.
    const i = MAIN.indexOf('function nomDImageAcceptable');
    assert.ok(i > 0, 'la garde a disparu');
    const corps = MAIN.slice(i, MAIN.indexOf('\n}', i));
    assert.match(corps, /path\.basename\(name\)/, 'plus de refus des séparateurs de chemin');
    assert.match(corps, /startsWith\('\.'\)/, 'plus de refus des fichiers cachés');
    assert.match(corps, /png\|jpe\?g\|webp/, 'la liste des extensions a changé sans le dire');
  });

  test('les quatre écritures passent TOUTES par la garde', () => {
    // La mutation évidente : en oublier une. C'est celle qui écrit qui compte le plus, mais un
    // renommage ou une suppression mal gardés sortent du dossier aussi bien.
    ['images:write', 'images:read', 'images:delete', 'images:rename'].forEach(canal => {
      const i = MAIN.indexOf(`ipcMain.handle('${canal}'`);
      const corps = MAIN.slice(i, MAIN.indexOf('\n});', i));
      assert.match(corps, /nomDImageAcceptable/, `${canal} n'est plus gardé`);
    });
  });

  test('le dossier des images est SÉPARÉ de celui des modèles', () => {
    // `models:list` filtre déjà sur l'extension et refuse tout le reste : y ranger des images
    // obligerait à percer cette garde pour un cas particulier.
    const i = MAIN.indexOf('function getImagesDir');
    const corps = MAIN.slice(i, MAIN.indexOf('\n}', i));
    assert.match(corps, /'Images'/);
    assert.ok(!/Modeles/.test(corps), 'les images se rangent dans le dossier des modèles');
  });

  test('le renommage refuse d\'écraser, côté processus principal', () => {
    // `fs.rename` écrase silencieusement, sur toutes les plateformes visées : renommer « a.png » en
    // « b.png » détruirait b.png sans un mot, et avec lui toutes les Cases qui le citent.
    const i = MAIN.indexOf("ipcMain.handle('images:rename'");
    const corps = MAIN.slice(i, MAIN.indexOf('\n});', i));
    assert.match(corps, /fs\.existsSync\(dst\)/, 'le refus d\'écraser a disparu');
    assert.match(corps, /toLowerCase\(\)/, 'un simple changement de casse redevient impossible');
  });
});

describe('#403b : le cache des images, et ce que le dessin y lit', () => {
  // Le décodage réel est hors de portée sous Node : `createImageBitmap` n'existe pas. Ce qui se
  // vérifie ici est l'ÉTAT, c'est-à-dire ce que le chemin de dessin interroge à chaque image.
  test('quatre états, et « introuvable » n\'est pas « pas encore là »', async () => {
    _setImageCacheEntry('a.png', { bitmap: {}, w: 10, h: 10 });
    _setImageCacheEntry('b.png', 'chargement');
    _setImageCacheEntry('c.png', 'introuvable');
    assert.equal(imageState('a.png'), 'prête');
    assert.equal(imageState('b.png'), 'chargement');
    assert.equal(imageState('c.png'), 'introuvable');
    assert.equal(imageState('jamais-demandée.png'), 'absent');
  });

  test('getLoadedImage ne rend une image QUE lorsqu\'elle est prête', () => {
    // Le piège : rendre la chaîne 'chargement' comme si c'était une image. `drawImage` recevrait une
    // chaîne et lèverait au milieu du dessin d'une Planche.
    _setImageCacheEntry('b.png', 'chargement');
    _setImageCacheEntry('c.png', 'introuvable');
    assert.equal(getLoadedImage('b.png'), null);
    assert.equal(getLoadedImage('c.png'), null);
    assert.equal(getLoadedImage('absente.png'), null);
    _setImageCacheEntry('a.png', { bitmap: {}, w: 4, h: 2 });
    assert.deepEqual(getLoadedImage('a.png'), { bitmap: {}, w: 4, h: 2 });
  });

  test('collectImageFiles ne compte chaque fichier qu\'UNE fois', async () => {
    // Dix Cases qui partagent la même image ne doivent la décoder qu'une fois : c'est aussi ce qui
    // fait qu'elles partagent un seul bitmap en mémoire.
    const objets = [
      { type: 'panel', imageFile: 'a.png' },
      { type: 'panel', imageFile: 'a.png' },
      { type: 'panel', imageFile: 'b.png' },
      { type: 'panel' },
      { type: 'objet3d', imageFile: 'pas-une-case.png' },
    ];
    assert.deepEqual(collectImageFiles(objets).sort(), ['a.png', 'b.png']);
  });

  test('un fichier illisible devient « introuvable », pas une exception', async () => {
    // ⚠️ CE QUI COMPTE ICI N'EST PAS L'ÉTAT, C'EST QU'AUCUNE EXCEPTION NE SORTE. `preloadImages` est
    // lancé sans être attendu à l'ouverture d'un Projet : une exception y deviendrait un rejet non
    // capturé, et le Projet s'ouvrirait à moitié sans que rien ne le dise.
    setImageBridge({ readImageFile: async () => { throw new Error('disque déconnecté'); } });
    await preloadImages(['casse.png']);
    assert.equal(imageState('casse.png'), 'introuvable');
    setImageBridge(null);
  });

  test('une image déjà demandée n\'est pas redécodée', async () => {
    // Sans l'état « chargement », deux appels rapprochés décoderaient deux fois le même fichier ;
    // sans « introuvable », chaque redessin relancerait une lecture disque vouée à échouer.
    let lectures = 0;
    setImageBridge({ readImageFile: async () => { lectures++; return { ok: false }; } });
    await preloadImages(['x.png']);
    await preloadImages(['x.png']);
    assert.equal(lectures, 1, 'le même fichier a été relu');
    setImageBridge(null);
  });
});

describe('#403b : le câblage, épinglé sur la source faute de pouvoir l\'exécuter', () => {
  /**
   * ⚠️ DEUX MUTATIONS ONT ÉCHAPPÉ À TOUT LE RESTE, et ce bloc existe pour elles. Les deux portent
   * sur des APPELS, dans des chemins que la suite ne peut pas parcourir : `disposeAllRigs3D` touche
   * des caches Three.js, et l'ouverture d'un Projet passe par Electron. Retirer l'un ou l'autre ne
   * faisait rougir aucun test, alors que les deux se voient à l'usage — l'un tout de suite, l'autre
   * seulement après quelques Projets.
   */
  const lire = (f) => sourceSansCommentaires(readFileSync(join(RACINE, f), 'utf8'));

  test('changer de Projet LIBÈRE les images décodées', () => {
    // Un `ImageBitmap` tient une image décodée HORS du tas JavaScript : le ramasse-miettes ne la
    // voit pas comme un poids. Sans cet appel, la mémoire d'un Projet fermé reste occupée, et rien
    // à l'écran ne le dit — on ne s'en aperçoit qu'après avoir ouvert plusieurs gros Projets.
    const scene3d = lire('src/scene3d.js');
    const i = scene3d.indexOf('export function disposeAllRigs3D');
    assert.ok(i > 0, 'disposeAllRigs3D a disparu');
    const corps = scene3d.slice(i, scene3d.indexOf('\n}', i));
    assert.match(corps, /clearImageCache\(\)/,
      'les images décodées ne sont plus libérées au changement de Projet');
  });

  test('ouvrir un Projet lance le décodage de ses images', () => {
    // Sans cet appel, aucune image n'est jamais demandée : chaque Case reste sur « Chargement… »
    // pour toujours, et le cache ne se remplit qu'au prochain geste qui y touche. Le défaut est
    // immédiat, visible, et pourtant invisible aux tests : l'ouverture d'un Projet passe par
    // Electron.
    // ⚠️ MA PREMIÈRE VERSION CHERCHAIT LE NOM DANS LE FICHIER, et la mutation lui a échappé : io.js
    // précharge à DEUX endroits — l'ouverture d'un Projet, et le repointage après un renommage de
    // modèle. Retirer l'appel de l'ouverture laissait l'autre, donc le nom présent, donc le test
    // vert, pour un défaut immédiat à l'écran.
    //
    // LA RÈGLE JUSTE EST L'APPARIEMENT : partout où les modèles sont préchargés, les images le sont
    // aussi. Elle attrape le retrait de n'importe lequel des deux, et elle dit pourquoi les deux
    // vont ensemble — ce sont les mêmes fichiers, absents pour les mêmes raisons.
    const io = lire('src/io.js');
    const modeles = [...io.matchAll(/preloadModelsFor\(/g)];
    const images = [...io.matchAll(/preloadImagesFor\(/g)];
    assert.ok(modeles.length >= 2, `${modeles.length} préchargement(s) de modèles : le test ne regarde plus rien`);
    assert.equal(images.length, modeles.length,
      `${modeles.length} préchargement(s) de modèles pour ${images.length} d'images : un chemin ouvre un Projet sans décoder ses images`);
    modeles.forEach(m => {
      const suite = io.slice(m.index, m.index + 500);
      assert.match(suite, /preloadImagesFor\(/,
        'un préchargement de modèles n\'est pas accompagné de celui des images');
    });
  });

  test('l\'arrivée d\'une image redéclenche un rendu', () => {
    // C'est ce qui remplace le signalement par le dessin sans que l'utilisateur ait à cliquer.
    // Sans ce rappel, une image décodée n'apparaîtrait qu'au prochain redessin fortuit.
    const events = lire('src/events.js');
    assert.match(events, /setImageCacheCallbacks\(\{\s*onChange/,
      'plus personne ne redessine quand une image finit d\'arriver');
  });
});

describe('#403c : ce qu\'une Case accepte, et ce que son menu montre', () => {
  // Fonctions PURES, donc entièrement vérifiables : c'est tout l'intérêt d'avoir sorti la décision
  // des trois écrans qui la posent.

  test('le canevas d\'édition d\'une Scène refuse l\'image', () => {
    // Une Scène est un décor 3D réutilisable. Décision de l'utilisateur, et la seule interdiction
    // de la fonctionnalité.
    assert.equal(caseAccepteUneImage3D({ type: 'panel' }, false), true);
    assert.equal(caseAccepteUneImage3D({ type: 'panel' }, true), false);
  });

  test('⚠️ une Case qui AFFICHE une Scène chargée, elle, accepte', () => {
    // Et ce n'est pas un oubli : rien ne la marque dans les données. Elle contient les Éléments
    // qu'on y a recopiés, et c'est la règle générale qui joue — on demande confirmation avant de les
    // supprimer. `isLockedScenePanel` ne désigne QUE le canevas d'édition.
    assert.equal(caseAccepteUneImage3D({ type: 'panel', id: 'p1' }, false), true);
  });

  test('seule une Case accepte une image', () => {
    assert.equal(caseAccepteUneImage3D({ type: 'bulle' }, false), false);
    assert.equal(caseAccepteUneImage3D({ type: 'objet3d' }, false), false);
    assert.equal(caseAccepteUneImage3D(null, false), false);
  });

  test('une Case SANS image : on peut ajouter de la 3D, ou insérer une image', () => {
    const m = entreesImageDuMenu3D({ type: 'panel' }, false);
    assert.deepEqual(m, { ajouter3D: true, insererImage: true, deplacerImage: false, retirerImage: false });
  });

  test('une Case AVEC image : les trois entrées 3D disparaissent', () => {
    // RETIRÉES, pas grisées : décision de l'utilisateur. `ajouter3D` couvre « Ajouter », « Charger
    // une Scène » et « Importer un Modèle » d'un seul tenant — elles ont la même condition, et les
    // séparer ferait diverger ce qui doit disparaître ensemble.
    const m = entreesImageDuMenu3D({ type: 'panel', imageFile: 'a.png' }, false);
    assert.deepEqual(m, { ajouter3D: false, insererImage: false, deplacerImage: true, retirerImage: true });
  });

  test('sur le canevas d\'une Scène : la 3D reste, l\'image n\'apparaît jamais', () => {
    const m = entreesImageDuMenu3D({ type: 'panel' }, true);
    assert.deepEqual(m, { ajouter3D: true, insererImage: false, deplacerImage: false, retirerImage: false });
  });

  test('RÉGRESSION : insérer et retirer ne sont JAMAIS proposées ensemble', () => {
    // Les deux entrées vivent côte à côte dans le menu : si les conditions dérivaient, on
    // proposerait d'insérer une image à une Case qui en porte déjà une, et de retirer celle d'une
    // Case qui n'en a pas.
    [[{ type: 'panel' }, false], [{ type: 'panel' }, true],
      [{ type: 'panel', imageFile: 'a.png' }, false], [{ type: 'panel', imageFile: 'a.png' }, true],
      [{ type: 'bulle' }, false]].forEach(([o, scene]) => {
      const m = entreesImageDuMenu3D(o, scene);
      assert.ok(!(m.insererImage && m.retirerImage), JSON.stringify({ o, scene }));
    });
  });
});

describe('#403c : le câblage des trois écrans, épinglé sur la source', () => {
  const EVENTS = sourceSansCommentaires(readFileSync(join(RACINE, 'src/events.js'), 'utf8'));
  const SIDEBAR = sourceSansCommentaires(readFileSync(join(RACINE, 'src/sidebar.js'), 'utf8'));

  test('le menu contextuel lit la décision, il ne la refait pas', () => {
    // ⚠️ C'EST LA LEÇON DU CHANTIER DES POSES, appliquée avant le défaut plutôt qu'après : trois
    // écrans posaient la même question, et chacun a fini par y répondre différemment.
    assert.match(EVENTS, /entreesImageDuMenu3D\(hit, isSceneCanvas\)/,
      'le menu recalcule ce qu\'une Case accepte au lieu de le demander');

    // ⚠️ MA PREMIÈRE VERSION CHERCHAIT LES NOMS DANS LE FICHIER, et deux mutations lui ont échappé :
    // retirer la ligne qui masque « Ajouter », et rendre « Importer un Modèle » à sa condition
    // d'avant. Les identifiants restaient présents ailleurs — déclaration, écouteurs — donc le test
    // restait vert pendant qu'une Case à image proposait d'y ajouter de la 3D.
    //
    // CE QUI SE VÉRIFIE EST QUE LA DÉCISION GOUVERNE L'AFFICHAGE, ligne par ligne.
    const affichage = (id) => {
      const i = EVENTS.indexOf(`${id}.style.display =`);
      assert.ok(i > 0, `${id} ne pilote plus son affichage`);
      return EVENTS.slice(i, EVENTS.indexOf(';', i));
    };
    assert.match(affichage('ctxAddTrigger'), /_img\.ajouter3D/,
      '« Ajouter » reste proposé sur une Case qui porte une image');
    assert.match(affichage("getElementById('ctxImportModel')"), /_img\.ajouter3D/,
      '« Importer un Modèle » reste proposé sur une Case qui porte une image');
    assert.match(affichage('ctxLoadSceneTrigger'), /_img\.ajouter3D/,
      '« Charger une Scène » reste proposé sur une Case qui porte une image');
    assert.match(affichage("getElementById('ctxInsertImage')"), /_img\.insererImage/);
    assert.match(affichage("getElementById('ctxRemoveImage')"), /_img\.retirerImage/);
  });

  test('insérer une image DEMANDE avant de supprimer, et demande AVANT le sélecteur', () => {
    // L'ordre est la décision : choisir une image puis apprendre qu'elle supprimera huit Éléments
    // serait une question posée trop tard.
    const i = EVENTS.indexOf('async function _poserImageSurCase');
    assert.ok(i > 0, 'le geste d\'insertion a disparu');
    const corps = EVENTS.slice(i, EVENTS.indexOf('\n}', i));
    assert.ok(corps.indexOf('confirmAction') < corps.indexOf('importImage()'),
      'le sélecteur de fichier s\'ouvre avant la confirmation');
    // ⚠️ ET LA CONFIRMATION DOIT GOUVERNER, pas seulement précéder : une mutation qui remplaçait sa
    // condition par `false` laissait l'ordre intact et supprimait les Éléments sans rien demander.
    // C'est la garde elle-même qui est épinglée, parce que c'est elle qui protège du travail perdu.
    assert.match(corps, /aSupprimer\.length && !await confirmAction/,
      'les Éléments sont supprimés sans confirmation');
    assert.match(corps, /homePanelId === panel\.id \|\| \(o\.type === 'tracé' && o\.panelId === panel\.id\)/,
      'les tracés et les pièces échappent au balayage : les routes et les murs resteraient');
  });

  test('retirer l\'image DÉTACHE, et ne touche à aucun fichier', () => {
    // Deux Cases peuvent porter la même image : effacer pour l'une casserait l'autre. Supprimer du
    // disque est un geste distinct, dans la section Images (#403d).
    const i = EVENTS.indexOf('async function _retirerImageDeLaCase');
    const corps = EVENTS.slice(i, EVENTS.indexOf('\n}', i));
    assert.match(corps, /delete panel\[CHAMP_IMAGE_CASE\]/, 'le détachement a disparu');
    assert.ok(!/deleteImage|deleteImageFile/.test(corps),
      'le détachement efface le fichier : une autre Case qui le porte se retrouverait vide');
  });

  test('les deux chemins vers un même geste sont le MÊME code', () => {
    // Le menu contextuel et le bouton du panneau de droite font la même chose. Deux écritures
    // finiraient par ne plus faire la même — la panne la plus fréquente de ce dépôt.
    ['_poserImageSurCase', '_retirerImageDeLaCase'].forEach(fn => {
      const appels = (EVENTS.match(new RegExp(fn + '\\(', 'g')) || []).length;
      assert.ok(appels >= 3, `${fn} : ${appels} occurrence(s), la définition plus deux appels attendus`);
    });
  });

  test('« Vider la Case » détache l\'image, et le dit', () => {
    const i = EVENTS.indexOf("getElementById('ctxClearPanel')");
    const corps = EVENTS.slice(i, EVENTS.indexOf('\n};', i));
    assert.match(corps, /imageDeLaCase3D\(panel\)/, 'l\'image n\'est plus comptée comme un contenu');
    assert.match(corps, /delete panel\[CHAMP_IMAGE_CASE\]/, 'l\'image n\'est plus détachée');
  });

  test('le panneau de droite REMPLACE Sol et Éléments par Image', () => {
    // Ces deux sections règlent un décor 3D que cette Case n'a pas : les laisser proposerait des
    // réglages sans effet, ce qui est pire que de ne rien proposer.
    const i = SIDEBAR.indexOf('casePorteUneImage3D(sel)');
    assert.ok(i > 0, 'le panneau de droite ne distingue plus une Case à image');
    // La fenêtre s'arrête au `return` de cette branche plutôt qu'à un nombre de caractères : la
    // longueur choisie au jugé avait cessé de couvrir la branche dès que #403f y a ajouté le
    // rafraîchissement du zoom, et le test échouait pour une raison sans rapport avec ce qu'il
    // protège.
    const corps = SIDEBAR.slice(i, i + SIDEBAR.slice(i).indexOf('return;'));
    assert.match(corps, /sideImageSection\.style\.display = 'block'/);
    assert.match(corps, /sideGroundSection\.style\.display = 'none'/, 'la section Sol reste affichée');
    assert.match(corps, /sidePersonasSection\.style\.display = 'none'/, 'la section Éléments reste affichée');
  });
});
