/**
 * @file tools/apercu-sol.mjs
 * Une planche de contact des matières du Sol, rendue par le CODE DE L'APPLICATION.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * POURQUOI CET OUTIL NE RESSEMBLE PAS À `tools/apercu-bulle.mjs`
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * La planche des Bulles est un rasteriseur écrit en Node : `bubble-shape.js` rend des POINTS, et
 * les transformer en pixels est un travail d'outil. Le Sol ne pose pas la même question. Sa
 * matière n'est pas un contour, c'est une image de 512 px que `buildGroundTexture` PEINT au
 * canevas, touffe par touffe. Il n'y a rien à rasteriser : il y a un canevas à regarder.
 *
 * ⚠️ ET CE CANEVAS NE SE RÉÉCRIT PAS. La leçon de #425y a coûté deux réglages de densité écartés à
 * tort : mon rasteriseur maison différait de celui du navigateur, et j'ai jugé des images qui
 * n'étaient pas celles de l'application. Porter les quatorze recettes de `buildGroundTexture` sous
 * Node referait exactement cela, en pire — il y aurait alors DEUX herbes, et rien pour garantir
 * qu'elles restent la même.
 *
 * D'où Electron, comme `tools/bake-textures.mjs` : une fenêtre cachée donne un vrai canevas, la
 * page importe `src/rig3d.js` tel quel, et ce qui est écrit sur la planche est, au pixel près, ce
 * que l'application dessine. Le seul code d'outil qui reste est la MISE EN PAGE, qui est pure et
 * qui est testée dans tests/apercu-sol.test.mjs.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * CE QUE LA PLANCHE MONTRE, ET POURQUOI DEUX VUES PAR MATIÈRE
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * À GAUCHE, la tuile seule, à sa taille native. C'est la matière telle qu'elle est peinte.
 *
 * À DROITE, la même tuile RÉPÉTÉE. C'est la seule vue qui répond à la question qui compte, parce
 * que le Sol n'affiche jamais une tuile : `GROUND_TYPE_DEFS` déclare des `repeat` de 1200 à 9600
 * sur un plan de 12000 unités, donc l'herbe est carrelée des milliers de fois dans une Case. Une
 * matière convaincante isolée peut se révéler être un damier une fois répétée, et c'est un défaut
 * qu'aucune vue de tuile ne laisse voir.
 *
 * Usage :  npm run apercu-sol            (toutes les matières)
 *          npm run apercu-sol -- herbe terre    (une sélection)
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ICI = dirname(fileURLToPath(import.meta.url));
const RACINE = join(ICI, '..');

/** Côté d'une vignette, en pixels de la planche. */
export const VIGNETTE = 256;
/** Hauteur de la bande de titre sous chaque paire. */
export const BANDEAU = 22;
/** Combien de fois la tuile est répétée dans la vue de droite, par côté. */
export const REPETITIONS = 4;
/** Marge autour et entre les cellules. */
export const MARGE = 10;

/**
 * La mise en page de la planche : où va chaque matière, et quelle taille fait l'image.
 *
 * Pure, sans canevas ni Electron, parce que c'est le seul endroit de cet outil où un calcul peut
 * être faux en silence. Une cellule posée hors champ ne lève rien : elle se dessine dans le vide,
 * et la planche sort simplement incomplète — le genre de défaut qu'on attribue à la matière plutôt
 * qu'à l'instrument.
 *
 * @param {number} nombre   combien de matières
 * @param {number} colonnes combien de cellules par ligne
 */
export function dispositionDeLaPlanche3D(nombre, colonnes = 2){
  // ⚠️ `Math.max(0, Math.floor(NaN))` VAUT NaN, ce que le test a trouvé. La planche sortait alors
  // avec une largeur non finie, et `canvas.width = NaN` se rabat silencieusement sur 300 px : une
  // planche tronquée, sans message. On force donc la finitude avant de borner.
  const fini = (v, defaut) => (Number.isFinite(Number(v)) ? Number(v) : defaut);
  const n = Math.max(0, Math.floor(fini(nombre, 0)));
  const col = Math.max(1, Math.floor(fini(colonnes, 1)));
  // Une cellule tient DEUX vignettes côte à côte, la tuile et sa répétition.
  const largeurCellule = VIGNETTE * 2 + MARGE;
  const hauteurCellule = VIGNETTE + BANDEAU;
  const lignes = Math.ceil(n / col);
  const cellules = [];
  for (let i = 0; i < n; i++) {
    const c = i % col, l = Math.floor(i / col);
    const x = MARGE + c * (largeurCellule + MARGE);
    const y = MARGE + l * (hauteurCellule + MARGE);
    cellules.push({
      index: i,
      titre: { x, y, largeur: largeurCellule, hauteur: BANDEAU },
      tuile: { x, y: y + BANDEAU, taille: VIGNETTE },
      repetee: { x: x + VIGNETTE + MARGE, y: y + BANDEAU, taille: VIGNETTE },
    });
  }
  return {
    cellules,
    largeur: col * (largeurCellule + MARGE) + MARGE,
    hauteur: lignes * (hauteurCellule + MARGE) + MARGE,
  };
}

/**
 * Le script exécuté DANS la page, là où `document` existe et où `src/rig3d.js` se charge.
 *
 * Rendu en texte parce qu'il traverse `executeJavaScript` : c'est une frontière de processus, pas
 * un appel de fonction. Tout ce qu'il rend est une URL de données, que le processus principal
 * décode et écrit.
 */
function scriptDeLaPage(ids, disposition){
  return `(async () => {
    const { buildGroundTexture } = await import('../src/rig3d.js');
    const { GROUND_TYPE_DEFS } = await import('../src/constants.js');
    const d = ${JSON.stringify(disposition)};
    const ids = ${JSON.stringify(ids)};

    const planche = document.createElement('canvas');
    planche.width = d.largeur; planche.height = d.hauteur;
    const g = planche.getContext('2d');
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, d.largeur, d.hauteur);

    for (let i = 0; i < ids.length; i++) {
      const id = ids[i], cell = d.cellules[i];
      const def = GROUND_TYPE_DEFS.find(t => t.id === id);
      const tuile = buildGroundTexture(id).map.image;

      g.fillStyle = '#111'; g.font = '13px sans-serif'; g.textBaseline = 'middle';
      g.fillText(def.label + '   repeat ' + def.repeat + '   disp ' + def.dispScale,
                 cell.titre.x + 2, cell.titre.y + cell.titre.hauteur / 2);

      g.drawImage(tuile, cell.tuile.x, cell.tuile.y, cell.tuile.taille, cell.tuile.taille);

      // La vue répétée. On carrelle À LA MAIN plutôt que par un motif CSS : un motif rééchantillonne
      // la tuile une seule fois, alors que le raccord se juge sur les BORDS, qu'il faut voir se
      // toucher ${REPETITIONS} fois par côté.
      const pas = cell.repetee.taille / ${REPETITIONS};
      for (let r = 0; r < ${REPETITIONS}; r++) {
        for (let c = 0; c < ${REPETITIONS}; c++) {
          g.drawImage(tuile, cell.repetee.x + c * pas, cell.repetee.y + r * pas, pas, pas);
        }
      }
      g.strokeStyle = '#999'; g.lineWidth = 1;
      g.strokeRect(cell.tuile.x + .5, cell.tuile.y + .5, cell.tuile.taille, cell.tuile.taille);
      g.strokeRect(cell.repetee.x + .5, cell.repetee.y + .5, cell.repetee.taille, cell.repetee.taille);
    }
    return planche.toDataURL('image/png');
  })()`;
}

async function main(){
  const { app, BrowserWindow } = await import('electron');
  const { GROUND_TYPE_DEFS } = await import(pathToFileURL(join(RACINE, 'src/constants.js')).href);

  const demandés = process.argv.slice(2).filter(a => !a.startsWith('-'));
  const connus = GROUND_TYPE_DEFS.map(d => d.id);
  const inconnus = demandés.filter(id => !connus.includes(id));
  if (inconnus.length) {
    // Échec bruyant, la politique des registres de ce dépôt : une faute de frappe qui rendrait une
    // planche silencieusement incomplète coûte plus qu'un message.
    throw new Error(`matière inconnue : ${inconnus.join(', ')}\nconnues : ${connus.join(', ')}`);
  }
  const ids = demandés.length ? demandés : connus;

  await app.whenReady();
  const fenetre = new BrowserWindow({ show: false, width: 100, height: 100 });
  await fenetre.loadFile(join(ICI, 'apercu-sol.html'));

  const disposition = dispositionDeLaPlanche3D(ids.length, 2);
  const url = await fenetre.webContents.executeJavaScript(scriptDeLaPage(ids, disposition));

  const sortie = join(RACINE, 'apercus', 'sol.png');
  mkdirSync(dirname(sortie), { recursive: true });
  const png = Buffer.from(url.split(',')[1], 'base64');
  writeFileSync(sortie, png);
  console.log(`${ids.length} matière(s), ${disposition.largeur}×${disposition.hauteur} px`);
  console.log(`écrit : ${sortie}  (${(png.length / 1024).toFixed(0)} Ko)`);
}

/** Rendre la main, cf. la note longue de tools/bake-textures.mjs : Electron ne s'arrête pas seul. */
async function rendreLaMain(code){
  await new Promise(r => process.stdout.write('', r));
  try {
    const { app } = await import('electron');
    if (app && typeof app.exit === 'function') { app.exit(code); return; }
  } catch { /* hors Electron */ }
  process.exit(code);
}

// `pathToFileURL` et non une concaténation : sous Windows, `file://C:\...` ne vaudrait jamais
// `import.meta.url`, et l'outil ne se lancerait pas sans dire pourquoi.
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().then(() => rendreLaMain(0), (e) => { console.error(e.message); return rendreLaMain(1); });
}
