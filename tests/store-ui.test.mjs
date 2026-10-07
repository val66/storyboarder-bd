/**
 * tests/store-ui.test.mjs, la fenêtre du store (#444b) : ses textes et mises en forme (exécutés),
 * et son câblage (inspecté, le DOM et Electron étant hors de portée sous Node).
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { textesStore, PLAFONDS_FACES, SEUIL_LOURD, nombreCourt, poidsLisible, estLourd, phrasesLicence, lignesDetails } from '../src/store-texts.js';
import sources from '../store-sources.js';
import sketchfab from '../store-sketchfab.js';

const lire = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const sans = (s) => s.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
const PAGE = JSON.parse(lire('tests/fixtures/sketchfab-recherche.json'));
const BANC = sketchfab.modeleNormalise(PAGE.results[0]);

describe('les textes', () => {
  test('mêmes clés dans les deux langues, erreurs et tris compris', () => {
    const fr = textesStore('fr'); const en = textesStore('en');
    assert.deepEqual(Object.keys(fr).sort(), Object.keys(en).sort());
    assert.deepEqual(Object.keys(fr.erreurs).sort(), Object.keys(en.erreurs).sort());
    assert.deepEqual(Object.keys(fr.tris).sort(), [...sources.TRIS, 'nom'].sort());   // « nom » : Mes modèles
    assert.equal(textesStore('de'), fr);
  });
  test('chaque erreur que store.js peut rendre a son texte', () => {
    // Tous les codes entre apostrophes des lignes qui posent une erreur, ternaires compris.
    const lignes = lire('store.js').split('\n').filter(l => /erreur: /.test(l) && !/^\s*(\/\/|\*)/.test(l));
    const codes = new Set(lignes.flatMap(l => [...l.slice(l.indexOf('erreur: ')).matchAll(/'(\w+)'/g)].map(m => m[1])));
    assert.deepEqual([...codes].sort(), ['corrompu', 'quota', 'reponse', 'reseau', 'simulation', 'source', 'tropLourd']);
    for (const c of codes) { assert.ok(textesStore('fr').erreurs[c], c); assert.ok(textesStore('en').erreurs[c], c); }
  });
  test('la simulation dit comment en sortir', () => {
    assert.match(textesStore('fr').simulation, /Remove-Item Env:STORYBOARD_SIMULER_STORE/);
    assert.match(textesStore('en').simulation, /Remove-Item Env:STORYBOARD_SIMULER_STORE/);
  });
});

describe('les mises en forme', () => {
  test('nombres courts', () => {
    assert.equal(nombreCourt(49980), '50 k');
    assert.equal(nombreCourt(999), '999');
    assert.equal(nombreCourt(1250000), '1,3 M');
    assert.equal(nombreCourt(1250000, 'en'), '1.3 M');
    assert.equal(nombreCourt(-1), '');
    assert.equal(nombreCourt(undefined), '');
  });
  test('poids lisibles, unités traduites', () => {
    assert.equal(poidsLisible(23795824), '23 Mo');
    assert.equal(poidsLisible(612148), '598 Ko');
    assert.equal(poidsLisible(5 * 1024 * 1024 + 300000), '5,3 Mo');
    assert.equal(poidsLisible(5 * 1024 * 1024 + 300000, 'en'), '5.3 MB');
    assert.equal(poidsLisible(100), '1 Ko');
    assert.equal(poidsLisible(0), '');
  });
  test('un modèle lourd se signale : faces, poids ou textures', () => {
    assert.equal(estLourd(BANC), true, 'textures 8k');
    const leger = { poids: 600000, details: { faces: 10000, textureMax: 128 } };
    assert.equal(estLourd(leger), false);
    assert.equal(estLourd({ ...leger, details: { faces: SEUIL_LOURD.faces + 1 } }), true);
    assert.equal(estLourd({ ...leger, poids: SEUIL_LOURD.octets + 1 }), true);
    assert.equal(estLourd({ poids: null, details: null }), false);
  });
  test('ce que dit la licence, en clair', () => {
    assert.deepEqual(phrasesLicence(sources.licence('by')), ['Créditer l\'auteur est obligatoire.', 'Usage commercial autorisé.']);
    assert.deepEqual(phrasesLicence(sources.licence('cc0'), 'en'), ['No credit required.', 'Commercial use allowed.']);
    assert.equal(phrasesLicence(sources.licence('by-nc-nd')).length, 3);
  });
  test('les lignes de la fiche', () => {
    assert.deepEqual(lignesDetails(BANC), ['50 k faces', '1 texture(s), jusqu\'à 8192 px', 'Téléchargement : 23 Mo']);
    assert.deepEqual(lignesDetails({ ...BANC, details: { anime: true }, poids: null }, 'en'), ['Animated']);
    // Poly Haven donne la taille réelle : largeur × profondeur × hauteur, en mètres.
    assert.deepEqual(lignesDetails({ details: { dimensions: [0.848, 0.766, 1.065] } }), ['Taille : 0,85 × 0,77 × 1,07 m']);
  });
  test('les plafonds de faces commencent par « sans limite »', () => {
    assert.equal(PLAFONDS_FACES[0], null);
    assert.ok(PLAFONDS_FACES.slice(1).every((n, i, a) => n > 0 && (i === 0 || n > a[i - 1])));
  });
});

describe('le câblage', () => {
  const UI = sans(lire('src/store-ui.js'));
  const MAIN = sans(lire('main.js'));
  test('⚠️ rien de ce qui vient du réseau ne passe par innerHTML', () => {
    assert.ok(!/innerHTML/.test(UI));
  });
  test('le téléchargement est désactivé tant que la connexion n\'existe pas, et la fiche dit pourquoi', () => {
    assert.match(UI, /texte: fichier \? '✓ ' \+ t\.possede : t\.telecharger, classe: 'full-btn'/);
    assert.match(UI, /texte: fichier \? t\.possedeFiche\(fichier\) : t\.noteTelechargement\(r\.source\)/);
    // Seule une source SANS connexion requise peut télécharger aujourd'hui (Sketchfab attend #444c).
    assert.match(UI, /infos\.source\.connexion\.telechargement === false/);
  });
  test('l\'aperçu 3D ne se charge qu\'à la demande, et seulement depuis l\'adresse validée par la source', () => {
    const f = UI.slice(UI.indexOf('function ouvrirFiche'));
    assert.ok(f.indexOf('voir.onclick') < f.indexOf("el('iframe'"));
    assert.match(f, /const src = r\.apercu3D \+/);
  });
  test('main.js : les liens partent dans le navigateur, https seulement', () => {
    assert.match(MAIN, /win\.webContents\.setWindowOpenHandler\(\(\{ url \}\) => \{\n\s+if \(\/\^https:\\\/\\\/\/\.test\(url\)\) shell\.openExternal\(url\);\n\s+return \{ action: 'deny' \};/);
  });
  test('main.js : la simulation n\'existe qu\'en développement', () => {
    assert.match(MAIN, /const SIMULATION_STORE = !app\.isPackaged && !!process\.env\.STORYBOARD_SIMULER_STORE;/);
    assert.match(MAIN, /store\.chercher\(sourceId, params, SIMULATION_STORE \? __dirname : null\)/);
  });
  test('le pont n\'expose que les sept appels du store (et deux écoutes)', () => {
    const pre = lire('preload.js');
    assert.equal((pre.match(/ipcRenderer\.invoke\('store:/g) || []).length, 7);
    assert.match(pre, /storeTelecharges: \(\) => ipcRenderer\.invoke\('store:telecharges'\)/);
    assert.match(MAIN, /store\.telecharges\(getProjectsDir\(\), SIMULATION_STORE \? __dirname : null\)/);
    assert.match(pre, /storeInfos: \(sourceId\) => ipcRenderer\.invoke\('store:infos', sourceId\)/);
    assert.match(pre, /storeChercher: \(sourceId, params\) => ipcRenderer\.invoke\('store:chercher', sourceId, params\)/);
  });
  test('store.js : les paramètres sont nettoyés AVANT de construire l\'adresse', () => {
    const s = sans(lire('store.js'));
    const c = s.slice(s.indexOf('async function chercher'));
    assert.ok(c.indexOf('sources.rechercheNormalisee(params)') < c.indexOf('module.urlRecherche(recherche)'));
    assert.match(c, /return sources\.pageAffichable\(module\.pageNormalisee\(json\), recherche\);/);
  });
  test('retours de Valentin (6 octobre 2026) : une seule zone défile, la fiche remplace la liste, une ligne par licence', () => {
    const css = lire('style.css');
    const html = lire('index.html');
    assert.match(css, /\.store-grille\[hidden\], \.store-fiche\[hidden\], \.store-plus\[hidden\]/);
    assert.match(css, /display:flex; flex-direction:column; overflow:hidden;/);
    assert.match(css, /\.store-box > \.store-defilement\{ flex:1 1 auto; min-height:0; overflow-y:auto;/);
    const zone = html.slice(html.indexOf('id="storeDefilement"'), html.indexOf('id="storeCredit"'));
    for (const id of ['storeGrille', 'storePlusBtn', 'storeFiche']) assert.ok(zone.includes(`id="${id}"`), id);
    assert.match(css, /\.store-badge\{ min-width:0;[^}]*white-space:nowrap;/);
    assert.match(css, /\.modal-box \.store-filtres select\{ flex:1 1 180px; max-width:260px; width:auto; margin:0; \}/);
    assert.equal(textesStore('fr').ouvrir, 'Bibliothèque de modèles');
  });
  test('retours de Valentin (6 octobre 2026, 2e passe)', () => {
    const f = UI.slice(UI.indexOf('function ouvrirFiche'));
    // « null » écrit dans la fiche : les enfants conditionnels absents sont retirés.
    // L'aperçu 3D se BASCULE, et revenir à l'image le décharge.
    assert.match(f, /en3D = !en3D;/);
    assert.match(f, /visuel\.replaceChildren\(\.\.\.image\(\)\)/);
    assert.match(f, /bascule\.textContent = en3D \? t\.voirImage : t\.voir3D;/);
    // Deux sections titrées : licence, caractéristiques.
    assert.match(f, /section\(t\.licence,/);
    assert.match(f, /section\(t\.caracteristiques, details\)/);
    // Plus de bouton Rechercher : la saisie relance après une pause, Entrée tout de suite.
    assert.ok(!lire('index.html').includes('storeChercherBtn'));
    assert.match(UI, /minuterie = setTimeout\(\(\) => chercher\(\), PAUSE_SAISIE_MS\);/);
  });
  test('retours de Valentin (3e passe) : le bouton Télécharger ne sort plus de la fiche', () => {
    const css = lire('style.css');
    // `.nav-btn` porte width:100% : sans width:auto, « Retour » prenait toute la ligne et poussait
    // « Télécharger » hors de la fiche (barre de défilement horizontale sur la capture).
    assert.match(css, /\.store-fiche-actions > \*\{ flex:1 1 0; width:auto; margin:0; \}/);
    assert.match(css, /\.store-lien-bouton\{[^}]*justify-content:center;/);
    assert.ok(!UI.includes("'← ' + t.fermerFiche"));
  });
  test('retours de Valentin (4e passe) : la fiche cache la recherche et les filtres, et les rend au retour', () => {
    const f = UI.slice(UI.indexOf('function ouvrirFiche'), UI.indexOf('function fermerFiche'));
    const r = UI.slice(UI.indexOf('function fermerFiche'));
    assert.match(f, /\$\('storeFormulaire'\)\.hidden = true;/);
    assert.match(r, /\$\('storeFormulaire'\)\.hidden = false;/);
    assert.match(lire('style.css'), /\.store-filtres\[hidden\]\{ display:none; \}/);
  });
  test('retours de Valentin (5e passe) : deux colonnes, boutons du bas toujours visibles', () => {
    const f = UI.slice(UI.indexOf('function ouvrirFiche'), UI.indexOf('function fermerFiche'));
    assert.match(f, /el\('div', \{ classe: 'store-fiche-gauche' \}, \[visuel, boutons\]\)/);
    assert.match(f, /el\('div', \{ classe: 'store-fiche-droite' \}, droite\.filter\(Boolean\)\)/);
    // #445 : « Télécharger » est un bouton SCINDÉ, sa flèche ouvre le choix de la qualité (demandé).
    assert.match(f, /el\('div', \{ classe: 'store-fiche-pied' \}, \[\n\s+el\('div', \{ classe: 'store-fiche-actions' \}, \[retour, scinde\]\)/);
    assert.match(f, /const scinde = el\('div', \{ classe: 'store-bouton-scinde' \}, \[telecharger, fleche, menu\]\);/);
    assert.match(lire('style.css'), /\.store-menu-resolutions\{\n\s+position:absolute; right:0; bottom:calc\(100% \+ 6px\);/);
    const css = lire('style.css');
    assert.match(css, /\.store-fiche-pied\{ position:sticky; bottom:0;/);
    assert.match(css, /\.store-fiche-corps\{ flex:1 1 auto; display:grid; grid-template-columns:minmax\(0, 3fr\) minmax\(0, 2fr\);/);
    assert.match(css, /\.store-fiche:not\(\[hidden\]\)\{ display:flex; flex-direction:column; min-height:100%; \}/);
    assert.match(css, /\.store-fiche-gauche \.store-fiche-visuel\{ flex:1 1 auto; aspect-ratio:auto;/);
    // Signalé à l'usage : une vignette haute (un buste) poussait « Voir en 3D » sous le pied. L'image,
    // l'iframe et l'aperçu 3D remplissent le cadre EN ABSOLU : ils ne lui imposent plus leur hauteur.
    assert.match(css, /\.store-fiche-visuel img, \.store-fiche-visuel iframe\{ position:absolute; inset:0;/);
    assert.match(css, /\.store-fiche-visuel \.store-apercu-3d\{ position:absolute; inset:0;/);
    assert.match(css, /\.store-fiche-visuel\{ position:relative; \}/);
    assert.match(css, /\.store-box \.maj-message:empty\{ display:none; \}/);
  });
  test('store.js : chaque fichier téléchargé est vérifié, la simulation ne range rien, le poids est borné', () => {
    const s = sans(lire('store.js'));
    const f = s.slice(s.indexOf('async function telecharger('));
    assert.match(f, /if \(f\.md5 && md5\(r\.octets\) !== f\.md5\) return \{ erreur: 'corrompu' \};/);
    assert.ok(f.indexOf("if (simulation) return { erreur: 'simulation' };") < f.indexOf('lireJson(url)'));
    assert.match(f, /if \(plan\.total > POIDS_MAX\) return \{ erreur: 'tropLourd' \};/);
    // Le renommage d'un modèle fait suivre son attribution.
    assert.match(sans(lire('main.js')), /await fs\.promises\.rename\(src, dst\);\n\s+await store\.renommerAttribution\(getProjectsDir\(\), ancien, nouveau\);/);
  });
  test('« Mes modèles » : la bibliothèque passe SOUS les fenêtres qu\'elle ouvre, et le clic droit devant elle', () => {
    const html = lire('index.html');
    const store = html.indexOf('id="storeModal"');
    for (const id of ['renameEntityModal', 'confirmActionModal', 'skeletonMapModal', 'modelUsagesModal']) {
      assert.ok(store < html.indexOf(`id="${id}"`), `${id} s'ouvrirait DERRIÈRE la bibliothèque`);
    }
    assert.match(lire('style.css'), /#modelContextMenu\{ z-index:1100; \}/);
  });
  test('« Mes modèles » : les actions de la fiche sont celles de l\'application, injectées', () => {
    const ev = sans(lire('src/events.js'));
    for (const r of ['menuModele', 'ouvrirEndroitModele', 'renommerModele', 'supprimerModele', 'squeletteModele']) {
      assert.match(ev, new RegExp(`${r}: \\(`), `rappel absent : ${r}`);
    }
    const f = UI.slice(UI.indexOf('function ficheLocale'));
    assert.match(f, /b\.onclick = \(\) => \{ fermerStore\(\); if \(_rappels\.ouvrirEndroitModele\)/, 'aller à un endroit doit fermer la fenêtre');
  });
  test('« Squelette » décode le modèle AVANT de lire ses os (il ne s\'ouvrait jamais depuis « Mes modèles »)', () => {
    const ev = sans(lire('src/events.js'));
    const f = ev.slice(ev.indexOf('async function openSkeletonMapModal('));
    assert.ok(f.indexOf('await preloadModels([nomFichier]);') >= 0 && f.indexOf('await preloadModels([nomFichier]);') < f.indexOf('osDuModele(nomFichier)'));
  });
  test('la fiche locale : sous-sections repliables, zone des endroits qui défile seule', () => {
    const f = UI.slice(UI.indexOf('function ficheLocale'));
    assert.match(f, /const cle = 'fiche-modele:' \+ id;/);
    assert.match(lire('style.css'), /\.store-usages\{ max-height:38vh; overflow-y:auto;/);
    assert.match(lire('style.css'), /\.store-usages-groupe \+ \.store-usages-groupe\{ margin-top:4px; \}/);
    assert.match(lire('style.css'), /\.store-fiche-droite > p\{ margin:4px 0 0; \}/);
  });
  test('fermer garde la fiche ouverte pour la réouverture ; la fiche locale s\'ouvre en 3D', () => {
    const f = UI.slice(UI.indexOf('export function fermerStore('));
    assert.match(f, /aRouvrir = \{ fiche: ouverte \? ficheCourante : null,/);
    assert.match(UI, /if \(r\) \{ ouvrirFiche\(r\); positionListe = reprise\.position; return; \}/);
    // La fiche locale s'ouvre sur l'IMAGE (demandé), rendue au format de son cadre.
    const fl = UI.slice(UI.indexOf('function ficheLocale'));
    assert.doesNotMatch(fl.slice(0, fl.indexOf('\n}\n')), /bascule3D\.onclick\(\)/);
    assert.match(fl, /imageDeFiche\(e\.fichier, visuel\.clientWidth \* ratio, visuel\.clientHeight \* ratio\)/);
    assert.match(lire('style.css'), /justify-content:flex-start; text-align:left;/);
  });
  test('la fiche locale : catégorie et tags sous la source, plus dans les caractéristiques', () => {
    const f = UI.slice(UI.indexOf('function ficheLocale'));
    assert.match(f, /e\.introuvable \? null : blocClassement\(e\.fichier\),/);
    assert.doesNotMatch(f.slice(0, f.indexOf('const retour')), /t\.ligneCategorie\(/);
    // Le menu des tags rouvre après un changement, mais pas après une fermeture par l'utilisateur.
    assert.match(UI, /\(\) => \{ if \(!reconstruction\) menuTags = false; \}/);
  });
  test('retours sur les tags : filtre à côté des catégories, menu qui s\'ouvre vers la droite, corbeille visible', () => {
    const html = lire('index.html');
    assert.ok(html.indexOf('id="storeTagsZone"') > html.indexOf('id="storeCategorie"') && html.indexOf('id="storeTagsZone"') < html.indexOf('id="storeTri"'));
    assert.match(lire('style.css'), /\.store-tags-zone \.store-menu-flottant\{ left:0; right:auto; \}/);
    assert.match(lire('style.css'), /\.store-tag-corbeille\{ color:var\(--ink\);/);
    // La même liste de tags (créer, renommer, supprimer) dans la fiche ET dans le filtre.
    assert.equal((UI.match(/remplirListeTags\(menu, \{/g) || []).length, 3);   // la définition, la fiche, le filtre
    assert.doesNotMatch(UI, /texte: '🗑'/);
  });
  test('retours sur les tags (2) : bouton à l\'allure des listes, une seule ligne, tags en jaune', () => {
    const css = lire('style.css');
    const bouton = css.slice(css.indexOf('.store-tags-btn{'), css.indexOf('.store-tags-btn.actif'));
    assert.match(bouton, /border:1px solid var\(--bord-actif\); border-radius:7px; padding:8px 28px 8px 8px;/);
    assert.match(bouton, /background-position:right 8px center/);
    assert.doesNotMatch(UI, /t\.tousLesTags\) \+ ' ▾'/);
    assert.match(UI, /classList\.toggle\('store-filtres-ligne', source === LOCAL\)/);
    assert.match(css, /\.store-filtres\.store-filtres-ligne\{ flex-wrap:nowrap; \}/);
    const chip = css.slice(css.indexOf('.store-chip-tag{'), css.indexOf('}', css.indexOf('.store-chip-tag{')));
    assert.match(chip, /var\(--warn\)/);
    assert.doesNotMatch(chip, /var\(--accent\)/);
  });
  test('fiche : chaque section dans sa carte, comme les fiches d\'Éléments', () => {
    const css = lire('style.css');
    const corps = (sel) => css.slice(css.indexOf(sel + '{'), css.indexOf('}', css.indexOf(sel + '{')));
    const carte = corps('.store-fiche-section'), reference = corps('.modal-section');
    for (const decl of ['background:var(--creux)', 'border:1px solid var(--line)', 'border-radius:8px', 'padding:4px 14px 12px']) {
      assert.ok(reference.includes(decl), 'référence : ' + decl);
      assert.ok(carte.includes(decl), 'fiche du store : ' + decl);
    }
    assert.match(css, /\.store-fiche-section h5\{[^}]*font-weight:700; font-size:15px; color:var\(--ink\);/);
    // Peu d'écart entre le titre et la première sous-section (demandé).
    assert.match(css, /\.store-fiche-section h5\{ margin:10px 0 2px; padding:4px 0;/);
  });
  test('la catégorie de la fiche : plus de « devinée », un chevron dessiné et centré', () => {
    assert.doesNotMatch(UI, /devineeCourt|categorieDevinee/);
    assert.match(UI, /if \(e\.categorieChoisie && e\.attribution && e\.attribution\.categorie\) menu\.appendChild/);
    const css = lire('style.css');
    const apres = css.slice(css.indexOf('.store-chip-categorie::after{'), css.indexOf('}', css.indexOf('.store-chip-categorie::after{')));
    assert.match(apres, /content:''/);
    assert.match(apres, /margin-left:8px/);
    assert.match(apres, /background:currentColor/);
  });
  test('recliquer sur le bouton d\'un menu ouvert le referme (catégorie, tags, filtre)', () => {
    const f = UI.slice(UI.indexOf('function menuFlottant'), UI.indexOf('async function operer'));
    assert.match(f, /const memeBouton = declencheur && menuOuvert\.declencheur === declencheur;\n    menuOuvert\.fermer\(\);\n    if \(memeBouton\) return null;/);
    assert.match(f, /menuOuvert = \{ menu, fermer, declencheur \};/);
    assert.match(UI, /'store-menu-categories', null, chipCat\); \};/);
    assert.match(UI, /\(\) => \{ if \(!reconstruction\) menuTags = false; \}, ajouter\);/);
    assert.match(UI, /menuFlottant\(zone, remplir, 'store-menu-tags', null, bouton\)/);
  });
  test('articulé ou statique dans « Mes modèles » : icône, ligne de la fiche, filtre, tri étroit', () => {
    assert.match(UI, /e\.os > 0 \? pastilleArticule\(t\) : null,/);
    assert.match(UI, /attrs: \{ title: t\.articule, role: 'img', 'aria-label': t\.articule \}/);
    assert.doesNotMatch(UI, /texte: t\.articule/, 'une icône, plus un libellé');
    assert.match(lire('style.css'), /select#storeTri\{ flex:0 0 110px; \}/);
    assert.match(UI, /Number\.isInteger\(e\.os\) \? t\.ligneSquelette\(e\.os\) : null,/);
    assert.match(UI, /\$\('storeSquelette'\)\.hidden = !local;/);
    assert.match(UI, /squelette: \$\('storeSquelette'\)\.value \|\| 'tous',/);
    assert.match(UI, /squelette: p\.squelette,/);
    assert.match(UI, /squelette: 'storeSquelette' \};/);
    assert.match(lire('index.html'), /<select id="storeSquelette"><\/select>/);
  });
  test('les modules du store voyagent avec l\'application', () => {
    const pkg = JSON.parse(lire('package.json'));
    for (const f of ['store.js', 'store-sources.js', 'store-sketchfab.js', 'store-polyhaven.js', 'gltf-glb.js', 'store-categories.js']) assert.ok(pkg.build.files.includes(f), f);
  });
});
