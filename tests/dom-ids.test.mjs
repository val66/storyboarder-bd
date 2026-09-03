/**
 * tests/dom-ids.test.mjs, le code et le document parlent-ils des mêmes éléments ?
 *
 * Cette classe de défaut a déjà interrompu l'application DEUX fois, entièrement :
 *
 *   — Renommage Case/Tome/Pièce/Bâtiment → Panel/Volume/Room/Building : six ids d'index.html
 *     n'ont pas suivi le code qui les cherchait. `getElementById(...).onclick` a levé sur `null`,
 *     ce qui a interrompu le chargement d'events.js EN ENTIER : plus aucun bouton ne répondait,
 *     plus aucun projet ne se chargeait. Rien dans le message d'erreur ne pointait la cause.
 *   — Fix 89/90 : un `</div>` orphelin a sorti le panneau droit de l'éditeur de son conteneur.
 *     Les 822 tests d'alors sont restés verts.
 *
 * Le point commun : aucune de ces liaisons n'est vérifiée par quoi que ce soit. Le HTML n'est pas
 * compilé, `getElementById` ne se plaint pas d'un id absent, il renvoie `null`, et l'exception
 * n'arrive que plus tard, ailleurs, sous une forme qui ne désigne pas le coupable.
 *
 * Ce que ces tests couvrent : les ids littéraux. Un id CALCULÉ (`getElementById(btnId)`,
 * `'ctxAdd' + label`) leur échappe par construction, et c'est assumé, vérifier une chaîne
 * construite à l'exécution demanderait d'exécuter le code, pas de le lire.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(RACINE, 'index.html'), 'utf8');

const idsDuDocument = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
const IDS = new Set(idsDuDocument);

const modules = readdirSync(join(RACINE, 'src'))
  .filter(f => f.endsWith('.js'))
  .map(f => ({ nom: f, texte: readFileSync(join(RACINE, 'src', f), 'utf8') }));

// Chaque référence à un id ÉCRIT EN CLAIR, quelle que soit la forme d'accès.
function referencesLitterales() {
  const trouvees = [];
  const motifs = [
    /getElementById\('([^']+)'\)/g,
    /getElementById\("([^"]+)"\)/g,
    /querySelector\('#([A-Za-z0-9_-]+)'\)/g,
    /querySelectorAll\('#([A-Za-z0-9_-]+)'\)/g,
  ];
  modules.forEach(({ nom, texte }) => {
    motifs.forEach(re => {
      for (const m of texte.matchAll(re)) {
        const ligne = texte.slice(0, m.index).split('\n').length;
        trouvees.push({ id: m[1], nom, ligne });
      }
    });
  });
  return trouvees;
}

describe('index.html ↔ src/ : les ids cherchés existent', () => {
  const refs = referencesLitterales();

  test('le balayage trouve bien quelque chose à vérifier', () => {
    // Sans ce garde-fou, une expression cassée rendrait tous les tests suivants verts et vides,
    // le pire état possible, constaté ailleurs dans ce dépôt (cf. tests/i18n.test.mjs, Fix 92).
    assert.ok(refs.length > 400, `seulement ${refs.length} références trouvées`);
    assert.ok(IDS.size > 300, `seulement ${IDS.size} ids dans index.html`);
  });

  test('RÉGRESSION : aucun id cherché par le code n\'est absent du document', () => {
    // Le test qui aurait attrapé le renommage Panel/Volume/Room/Building au moment où il est
    // arrivé, au lieu de laisser l'application muette au démarrage suivant.
    const absents = refs.filter(r => !IDS.has(r.id));
    assert.deepEqual(absents.map(r => `${r.id} (${r.nom}:${r.ligne})`), [],
      `${absents.length} id(s) cherché(s) mais absent(s) d'index.html`);
  });

  test('RÉGRESSION : les sélecteurs de i18n.js désignent tous un élément réel', () => {
    // Une entrée i18n sans cible ne lève rien : la traduction ne s'applique simplement jamais, et
    // le libellé reste figé dans la langue d'origine. Silencieux, donc durable.
    const i18n = modules.find(m => m.nom === 'i18n.js').texte;
    const sels = [...i18n.matchAll(/\['#([A-Za-z0-9_-]+)['\s,]/g)].map(m => m[1]);
    assert.ok(sels.length > 50, `seulement ${sels.length} sélecteurs #id relevés`);
    assert.deepEqual(sels.filter(s => !IDS.has(s)), []);
  });

  test('RÉGRESSION : aucun id dupliqué dans index.html', () => {
    // Un id en double ne provoque aucune erreur : getElementById renvoie le PREMIER, et l'autre
    // élément devient inatteignable. Deux boutons identiques dont un seul répond.
    const vus = new Set(), doubles = new Set();
    idsDuDocument.forEach(id => (vus.has(id) ? doubles.add(id) : vus.add(id)));
    assert.deepEqual([...doubles], []);
  });
});

describe('index.html ↔ src/ : les liaisons vivantes ne sont pas cassées', () => {
  test('RÉGRESSION : setProjectModalStatus a bien une cible', () => {
    // Défaut trouvé en écrivant ce fichier : la fonction est appelée depuis quatorze endroits,
    // « Enregistré à 14:32 », « Échec de l'enregistrement du Projet », et l'élément n'existait
    // pas. Sa garde `if (el)` absorbait l'absence, si bien que TOUS ces retours, y compris les
    // échecs d'enregistrement, n'arrivaient nulle part. Un test générique l'aurait signalé ; il
    // n'en existait aucun. Celui-ci nomme le cas pour qu'il ne se reperde pas dans la masse.
    assert.ok(IDS.has('projectModalStatus'));
    const io = modules.find(m => m.nom === 'io.js').texte;
    const appels = (io.match(/setProjectModalStatus\(/g) || []).length - 1;  // -1 : la définition
    assert.ok(appels >= 10, `${appels} appels seulement — la fonction a-t-elle été retirée ?`);
  });

  test('les messages de la modale Projet sont bilingues', () => {
    // Corollaire direct : les rendre visibles a exposé qu'ils étaient écrits en français en dur.
    // Invisibles, personne ne pouvait s'en apercevoir.
    const io = modules.find(m => m.nom === 'io.js').texte;
    [...io.matchAll(/setProjectModalStatus\(([^;]*)\);/g)].forEach(m => {
      const arg = m[1].trim();
      // `text)` : c'est la DÉFINITION que l'expression vient d'attraper, pas un appel, son
      // paramètre s'appelle `text`. `''` : l'effacement du message, rien à traduire.
      if (arg === "''" || /^text\)/.test(arg)) return;
      assert.match(arg, /^tr\(/, `message non traduit : ${arg.slice(0, 60)}`);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Les menus déroulants du panneau de gauche
// ─────────────────────────────────────────────────────────────────────────────

describe('Menus déroulants : un panneau déclaré est un panneau ouvrable', () => {
  test('RÉGRESSION : chaque .dropdown-panel a son setupDropdown', () => {
    // Trouvé en vrai, à l'usage, sur la section Modèles : le panneau existait dans index.html et
    // n'avait aucun gestionnaire, le titre ne réagissait pas au clic, et la section restait
    // fermée. Rien ne levait. Les tests d'ids ne pouvaient pas le voir : les ids ÉTAIENT là.
    //
    // `setupDropdown` est appelé une fois par menu, à la main. C'est exactement le genre
    // d'énumération que l'on complète à moitié, la deuxième classe de bug récurrente du dépôt.
    const panneaux = [...html.matchAll(/class="dropdown-panel[^"]*"\s+id="([^"]+)"/g)].map(m => m[1]);
    assert.ok(panneaux.length >= 3, `trop peu de panneaux trouvés : ${panneaux.length}`);
    const EVENTS_TXT = readFileSync(join(RACINE, 'src/events.js'), 'utf8');
    const sansCablage = panneaux.filter(id => !new RegExp(`setupDropdown\\([^)]*'${id}'`).test(EVENTS_TXT));
    assert.deepEqual(sansCablage, [],
      `panneau(x) sans setupDropdown : ${sansCablage.join(', ')} — le titre ne réagira pas au clic`);
  });

  test('… et chaque setupDropdown vise un panneau et un titre qui existent', () => {
    // Le sens inverse : un câblage vers un id disparu échouerait au chargement du module, donc
    // interromprait events.js en entier, la panne la plus brutale de ce dépôt (cf. § 3 de
    // docs/en/persisted-data.md).
    const EVENTS_TXT = readFileSync(join(RACINE, 'src/events.js'), 'utf8');
    [...EVENTS_TXT.matchAll(/setupDropdown\('([^']+)',\s*'([^']+)'\)/g)].forEach(([, trigger, panel]) => {
      assert.match(html, new RegExp(`id="${trigger}"`), `titre introuvable : ${trigger}`);
      assert.match(html, new RegExp(`id="${panel}"`), `panneau introuvable : ${panel}`);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Les menus flottants (clic droit)
// ─────────────────────────────────────────────────────────────────────────────

describe('Menus contextuels : un menu qui s\'ouvre doit pouvoir se refermer', () => {
  const EVENTS_TXT = readFileSync(join(RACINE, 'src/events.js'), 'utf8');

  test('RÉGRESSION : la liste des menus est DÉDUITE du DOM, pas énumérée à la main', () => {
    // Trouvé en vrai, à l'usage : « supprimer du disque » restait affiché après un clic ailleurs.
    // `allContextMenus` sert à deux choses qui doivent rester d'accord, fermer tous les menus, et
    // reconnaître un clic tombé DANS l'un d'eux. Énumérée à la main sur vingt-six menus, il en
    // manquait deux. Troisième occurrence de cette famille (le manuel désaligné, les ids DOM
    // oubliés, les panneaux sans setupDropdown) : la seule réparation durable est de supprimer
    // l'énumération, pas de la compléter une fois de plus.
    const m = EVENTS_TXT.match(/const allContextMenus = ([^;]+);/);
    assert.ok(m, 'allContextMenus a disparu');
    assert.match(m[1], /document\.querySelectorAll\(/,
      'allContextMenus est redevenue une liste écrite à la main : elle sera incomplète');
  });

  test('RÉGRESSION : le sélecteur vise la classe que portent RÉELLEMENT les menus', () => {
    // Le revers de la déduction, et il est pire que le mal : si la classe change dans index.html
    // sans changer ici, la liste devient VIDE en silence et plus AUCUN menu ne se ferme.
    const m = EVENTS_TXT.match(/const allContextMenus = \[\.\.\.document\.querySelectorAll\('\.([^']+)'\)\]/);
    assert.ok(m, 'le sélecteur des menus flottants n\'est plus lisible');
    const classe = m[1];
    const menus = [...html.matchAll(new RegExp(`class="[^"]*\\b${classe}\\b[^"]*"\\s+id="([^"]+)"`, 'g'))];
    assert.ok(menus.length >= 20,
      `seulement ${menus.length} élément(s) portent .${classe} dans index.html — le sélecteur ne vise rien`);
  });

  test('RÉGRESSION : le menu signalé est bien un .context-menu', () => {
    // Nommément, parce qu'il a été signalé : le menu de la bibliothèque de modèles. Le sous-menu
    // d'import figurait ici pour la même raison, il a depuis été supprimé avec l'option « comme
    // Scène », et le retirer d'ici plutôt que de garder un identifiant mort est ce qui garde ce
    // test capable d'échouer.
    ['modelContextMenu'].forEach(id => {
      const m = html.match(new RegExp(`class="([^"]*)"\\s+id="${id}"`));
      assert.ok(m, `menu introuvable dans index.html : ${id}`);
      assert.match(m[1], /\bcontext-menu\b/,
        `${id} ne porte pas .context-menu : il ne se fermera pas au clic extérieur`);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// #399 — SUPPRIMER UN PROJET : LE CÂBLAGE DE LA CÉRÉMONIE
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// La règle de saisie est pure et mesurée dans utils.test.mjs. Ce qui se vérifie ici est ce qu'AUCUN
// test de fonction ne peut dire : que le bouton existe, qu'il est inerte au départ, que la garde
// est relue à l'exécution, et que la suppression ne touche à rien d'autre.
describe('#399 : supprimer un Projet', () => {
  const io = readFileSync(new URL('../src/io.js', import.meta.url), 'utf8');
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

  test('le bouton de confirmation naît DÉSACTIVÉ', () => {
    // Sans cela, la modale s'ouvrirait avec un bouton actif : le mot ne serait plus une garde mais
    // une formalité qu'on peut sauter en cliquant tout de suite.
    const m = html.match(/<button[^>]*id="deleteProjectConfirm"[^>]*>/);
    assert.ok(m, 'le bouton de confirmation a disparu');
    assert.match(m[0], /\bdisabled\b/, 'le bouton s\'ouvre déjà cliquable');
    assert.match(m[0], /delete-btn/, 'il ne porte pas la couleur des suppressions');
  });

  test('⚠️ la garde est RELUE dans le gestionnaire, pas seulement affichée', () => {
    // Un bouton désactivé reste cliquable par un raccourci ou un test, et la conséquence serait ici
    // la perte d'un fichier sans que le mot ait jamais été écrit. Même principe que partout dans ce
    // dépôt : l'affichage n'est pas une garde.
    const i = io.indexOf('export async function confirmDeleteProject');
    assert.ok(i > 0, 'la suppression n\'est plus câblée');
    const corps = io.slice(i, io.indexOf('\n}\n', i));
    assert.match(corps, /if \(!suppressionProjetConfirmee3D\(/,
      'la suppression s\'exécute sans revérifier le mot');
    assert.match(corps, /deleteProjectFile\(/, 'le fichier n\'est plus supprimé');
  });

  test('⚠️ on repart d\'un Projet VIERGE, sinon le fichier revient tout seul', () => {
    // Garder à l'écran un Projet dont le fichier n'existe plus laisserait la sauvegarde automatique
    // le RECRÉER à la première modification : l'utilisateur aurait supprimé un fichier qui
    // réapparaît, ce qui est pire que de ne pas avoir supprimé.
    const i = io.indexOf('export async function confirmDeleteProject');
    const corps = io.slice(i, io.indexOf('\n}\n', i));
    assert.match(corps, /_demarrerProjetVierge\(\)/, 'l\'écran garde un Projet sans fichier');
    const ev = readFileSync(new URL('../src/events.js', import.meta.url), 'utf8');
    const j = ev.indexOf('setDemarrageProjetVierge(');
    assert.ok(j > 0, 'le retour au Projet vierge n\'est plus injecté');
    const bloc = ev.slice(j, ev.indexOf('\n});', j));
    assert.match(bloc, /stopAutosave\(\)/,
      'la sauvegarde automatique continue de tourner sur un Projet supprimé');
    assert.match(bloc, /S\.projectFilePath = null/, 'le chemin du fichier supprimé survit');
  });

  test('le bouton n\'apparaît que s\'il y a un fichier à supprimer', () => {
    // Un Projet jamais enregistré n'existe que dans la fenêtre : proposer de le « supprimer »
    // laisserait croire à une opération sur le disque là où il n'y a rien.
    const i = io.indexOf('export function openProjectModal');
    const corps = io.slice(i, io.indexOf('\n}\n', i));
    assert.match(corps, /S\.projectFilePath \? '' : 'none'/,
      'le bouton s\'affiche pour un Projet qui n\'a pas de fichier');
    assert.match(html, /id="projectModalDelete"[^>]*style="display:none;"/,
      'masqué par défaut, sans quoi il clignote à chaque ouverture');
  });

  test('⚠️ les MODÈLES et les CORRESPONDANCES ne sont pas emportés', () => {
    // Ils vivent À CÔTÉ du dossier de Projets, partagés par TOUS les Projets : les supprimer avec
    // celui-ci amputerait les autres, en silence. Le passe-plat n'efface qu'un fichier nommé.
    const principal = readFileSync(new URL('../main.js', import.meta.url), 'utf8');
    const i = principal.indexOf("ipcMain.handle('project:delete'");
    assert.ok(i > 0, 'le canal de suppression a disparu');
    const corps = principal.slice(i, principal.indexOf('\n});', i));
    assert.ok(!/Modeles|rmdir|rm\(/.test(corps),
      'la suppression touche autre chose que le fichier du Projet');
    assert.match(corps, /setLastProjectPath\(''\)/,
      'le prochain démarrage rouvrirait le fichier supprimé');
  });
});
