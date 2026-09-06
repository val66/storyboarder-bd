/**
 * @file tools/fetch-fonts.mjs
 * Récupérer une fois pour toutes les polices que l'application affiche, et leurs licences.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * POURQUOI CET OUTIL EXISTE
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * `style.css` commençait par deux `@import` vers fonts.googleapis.com : Inter pour l'interface,
 * dix familles de lettrage pour le texte des Bulles. Trois conséquences, d'importance très
 * inégale.
 *
 * ⚠️ LA PLUS SÉRIEUSE N'EST PAS LA PERFORMANCE, C'EST LA REPRODUCTIBILITÉ. `display=swap` dit au
 * navigateur de ne pas attendre la police. Hors ligne, ou avec un cache vidé, les Bulles retombent
 * donc en `sans-serif` SANS LE DIRE, et une Planche exportée en PNG ne ressemble pas à la même
 * Planche exportée la veille. Le rendu dépendait d'un cache HTTP que personne ne contrôle.
 *
 * Ensuite la vie privée : chaque lancement signalait le démarrage à un tiers, pour un logiciel de
 * bureau qui n'a aucune autre raison d'aller sur le réseau. Enfin le démarrage, où un `@import`
 * CSS bloque le rendu. Ce dernier point est le seul qui n'a pas été chiffré, et il n'a pas décidé.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * POURQUOI UN SCRIPT, ET PAS UN TÉLÉCHARGEMENT AU LANCEMENT
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * L'autre voie envisagée était de télécharger les polices au premier démarrage et de les garder.
 * Elle a été écartée pour trois raisons, la dernière étant décisive.
 *
 * Elle ne règle pas le PREMIER lancement : hors ligne ce jour-là, on retrouve exactement le défaut
 * qu'on corrige, en plus sournois puisqu'il ne se produit plus qu'une fois sur beaucoup.
 *
 * Elle nous fait hériter de ce que Chromium gère déjà : écriture partielle, fichier corrompu,
 * échec d'une famille sur onze, invalidation.
 *
 * Et surtout elle bute sur la règle n°1 (cf. docs/en/architecture.md). Écrire des `.woff2` sur le
 * disque demanderait un canal `fonts:*`, or le deuxième critère d'ouverture d'un canal exige que
 * le remède habituel, faire descendre l'information sous forme de fichier généré, soit
 * INAPPLICABLE. Pour des polices il s'applique parfaitement : les octets sont connus d'avance et
 * identiques pour tout le monde. Le critère refuse le canal, et il a raison.
 *
 * Noter que le même critère ACCORDERAIT un canal `fonts:*` pour une police apportée par
 * l'utilisateur : octets choisis à l'exécution, que rien ne peut générer à la construction. C'est
 * le cas de `models:*` et `images:*`. Les deux situations n'ont de commun que le mot « police ».
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * CE QUE LE SCRIPT FAIT, ET CE QU'IL REFUSE DE FAIRE
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Il interroge l'API css2 de Google en se présentant comme un Chrome récent, ce qui est la SEULE
 * façon d'obtenir du woff2 : à un navigateur ancien, la même URL répond du TTF, trois à cinq fois
 * plus lourd. Il ne garde que les sous-ensembles `latin` et `latin-ext`, télécharge les fichiers,
 * écrit une feuille locale et un récapitulatif de licences tiré du dépôt officiel `google/fonts`.
 *
 * ⚠️ IL S'ARRÊTE SANS RIEN ÉCRIRE AU MOINDRE MANQUE. Une famille absente de la réponse, un
 * sous-ensemble introuvable, un fichier de licence qui ne vient pas : il refuse. Une feuille
 * locale à laquelle il manquerait une famille est PIRE que pas de feuille du tout, parce que la
 * famille manquante retomberait silencieusement en `sans-serif`, c'est-à-dire exactement le défaut
 * qu'on est en train de corriger, mais définitif cette fois.
 *
 * Usage :  node tools/fetch-fonts.mjs
 *          node tools/fetch-fonts.mjs --dry-run    (n'écrit rien, dit ce qu'il ferait)
 */
import { writeFileSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const DOSSIER = join(RACINE, 'assets', 'fonts');

/**
 * ⚠️ CETTE LISTE EST LA SOURCE UNIQUE, et elle doit rester d'accord avec deux autres endroits :
 * les graisses réellement employées par `style.css`, et `BUBBLE_FONT_PRELOAD_LIST` de
 * `src/help-content.js`, qui nomme les dix familles proposées pour les Bulles. Un test tient cet
 * accord (cf. tests/fetch-fonts.test.mjs) : sans lui, ajouter une famille à la liste déroulante
 * sans la télécharger produirait une police fantôme, choisissable et jamais dessinée.
 *
 * `repertoire` est le dossier du dépôt google/fonts, et il ENCODE la licence : `ofl/` pour la SIL
 * Open Font License 1.1, `apache/` pour Apache 2.0. Vérifié famille par famille sur le listing du
 * dépôt ; seules Permanent Marker et Luckiest Guy sont sous Apache.
 */
export const FAMILLES = [
  { nom: 'Inter', graisses: [400, 500, 600, 700], slug: 'inter', repertoire: 'ofl' },
  { nom: 'Bangers', graisses: [400], slug: 'bangers', repertoire: 'ofl' },
  { nom: 'Comic Neue', graisses: [400, 700], slug: 'comicneue', repertoire: 'ofl' },
  { nom: 'Permanent Marker', graisses: [400], slug: 'permanentmarker', repertoire: 'apache' },
  { nom: 'Luckiest Guy', graisses: [400], slug: 'luckiestguy', repertoire: 'apache' },
  { nom: 'Anton', graisses: [400], slug: 'anton', repertoire: 'ofl' },
  { nom: 'Patrick Hand', graisses: [400], slug: 'patrickhand', repertoire: 'ofl' },
  { nom: 'Caveat', graisses: [400, 700], slug: 'caveat', repertoire: 'ofl' },
  { nom: 'Fredoka', graisses: [400, 600], slug: 'fredoka', repertoire: 'ofl' },
  { nom: 'Bubblegum Sans', graisses: [400], slug: 'bubblegumsans', repertoire: 'ofl' },
  { nom: 'Kalam', graisses: [400, 700], slug: 'kalam', repertoire: 'ofl' },
];

/**
 * Les seuls sous-ensembles Unicode qu'on embarque. L'application est bilingue français/anglais, et
 * `latin-ext` couvre largement au-delà. Prendre tous les sous-ensembles servis par Google
 * (cyrillique, grec, vietnamien) multiplierait le poids par trois pour des glyphes que personne
 * n'affichera jamais ici.
 *
 * ⚠️ Si un jour l'application accueille une langue qui sort de ces deux jeux, c'est ICI qu'il faut
 * revenir, et le manque se verra sous forme de carrés vides, pas sous forme d'erreur.
 */
export const SOUS_ENSEMBLES = ['latin', 'latin-ext'];

/**
 * Le User-Agent décide du FORMAT servi. Google renvoie du woff2 à un navigateur récent et du TTF à
 * tout ce qu'il ne reconnaît pas, y compris à Node. Constaté en interrogeant l'API sans en-tête :
 * la réponse contenait `format('truetype')` et un seul bloc, sans plage Unicode.
 */
const UA_CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
  + '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export function urlCss3D(familles) {
  const params = familles.map(f =>
    `family=${f.nom.replace(/ /g, '+')}:wght@${f.graisses.join(';')}`);
  return `https://fonts.googleapis.com/css2?${params.join('&')}&display=swap`;
}

/**
 * Découpe la réponse de Google en blocs, un par `@font-face`, en conservant le commentaire de
 * sous-ensemble qui le PRÉCÈDE. Google écrit `/* latin *\/` juste avant chaque bloc : c'est la
 * seule indication du sous-ensemble, elle ne figure pas dans le bloc lui-même.
 *
 * ⚠️ UN BLOC SANS COMMENTAIRE N'EST PAS IGNORÉ, il est rendu avec `sousEnsemble: null`. Le laisser
 * de côté en silence ferait disparaître une police pour une raison qu'on ne verrait jamais ; c'est
 * à l'appelant de décider, et il refuse.
 */
export function blocsDeLaCss3D(css) {
  const blocs = [];
  const motif = /(?:\/\*\s*([a-z0-9-]+)\s*\*\/\s*)?@font-face\s*\{([^}]*)\}/gi;
  let m;
  while ((m = motif.exec(css)) !== null) {
    const corps = m[2];
    const champ = (nom) => {
      const t = new RegExp(`${nom}\\s*:\\s*([^;]+);`, 'i').exec(corps);
      return t ? t[1].trim().replace(/^'|'$/g, '') : null;
    };
    const url = /url\(([^)]+)\)/.exec(corps);
    blocs.push({
      sousEnsemble: m[1] || null,
      famille: champ('font-family'),
      graisse: champ('font-weight'),
      style: champ('font-style'),
      plage: champ('unicode-range'),
      url: url ? url[1].replace(/^['"]|['"]$/g, '') : null,
      corps,
    });
  }
  return blocs;
}

/**
 * Nom de fichier local, stable et lisible. On n'utilise PAS le nom servi par Google
 * (`UcCO3FwrK3iLTeHu...woff2`) : il change à chaque révision de la police, ce qui ferait
 * réapparaître dans le diff onze fichiers renommés à chaque exécution du script, sans qu'on puisse
 * dire si le dessin a bougé.
 *
 * ⚠️ DEUX FONCTIONS ET NON UN PARAMÈTRE OPTIONNEL, et c'est le test qui l'a imposé. La première
 * version prenait une graisse en second argument, avec une valeur par défaut. Écrite ainsi, elle
 * passait dans un `blocs.map(nomDeFichier3D)` où `map` remplit le second argument avec l'INDICE :
 * le premier fichier héritait de la graisse 0, le second de 1. Un paramètre positionnel optionnel
 * est un piège dès qu'une fonction peut être passée en référence.
 */
function slugFamille(famille) {
  return famille.replace(/[^A-Za-z0-9]/g, '');
}

export function nomDeFichier3D(bloc) {
  return `${slugFamille(bloc.famille)}-${bloc.graisse}-${bloc.sousEnsemble}.woff2`;
}

/** Le nom d'un fichier de police VARIABLE : sans graisse, puisqu'il les sert toutes. */
export function nomDeFichierVariable3D(bloc) {
  return `${slugFamille(bloc.famille)}-${bloc.sousEnsemble}.woff2`;
}

/**
 * ⚠️ TROIS DES ONZE FAMILLES SONT VARIABLES, ET ÇA NE SE VOIT NULLE PART DANS LA CSS.
 *
 * Découvert en vérifiant l'intégrité du premier téléchargement : sur 33 fichiers, seuls 23 avaient
 * un contenu distinct. Inter servait le MÊME octet pour ses quatre graisses, Caveat et Fredoka pour
 * leurs deux. Ce sont des polices variables : Google renvoie un fichier par sous-ensemble, et c'est
 * le navigateur qui en instancie la graisse. 526 des 1096 ko téléchargés étaient donc des copies,
 * soit 47 %.
 *
 * Deux raisons de dédoublonner, et la seconde pèse plus que la première. Le poids, d'abord, mais il
 * est marginal dans un installeur Electron. Surtout : quatre fichiers identiques nommés
 * `Inter-400`, `Inter-500`, `Inter-600` et `Inter-700` AFFIRMENT quelque chose de faux, à savoir
 * qu'Inter est livrée en quatre dessins. Et git garde les binaires pour toujours.
 *
 * On regroupe par URL SOURCE et non par empreinte du contenu : deux URL identiques sont le même
 * fichier par construction, là où deux contenus identiques pourraient un jour être une coïncidence
 * qu'on aurait fusionnée à tort.
 */
export function fichiersParUrl3D(blocs) {
  const parUrl = new Map();
  for (const b of blocs) {
    if (!parUrl.has(b.url)) parUrl.set(b.url, []);
    parUrl.get(b.url).push(b);
  }
  const noms = new Map();
  for (const [url, groupe] of parUrl) {
    noms.set(url, groupe.length > 1 ? nomDeFichierVariable3D(groupe[0]) : nomDeFichier3D(groupe[0]));
  }
  return noms;
}

/**
 * ⚠️ `font-display: block` ET NON `swap`, et c'est un changement de comportement assumé.
 *
 * `swap` dessine tout de suite en police de repli puis rebascule : c'est le bon choix pour une
 * page web, où attendre coûte plus cher qu'un clignotement. Ici les fichiers sont sur le disque,
 * l'attente se compte en millisecondes, et un rebasculement au milieu du premier dessin d'une
 * Planche donnerait un instant de Bulles en mauvaise police. `block` attend, brièvement, et
 * garantit qu'on ne voit jamais le repli.
 *
 * Nommée plutôt qu'écrite dans la chaîne, pour que le test épingle la décision et non le texte.
 */
export const AFFICHAGE_POLICE = 'block';

/**
 * La feuille locale. On reprend le bloc de Google TEL QUEL, plage Unicode comprise, en ne
 * remplaçant que l'URL : la plage est ce qui permet au navigateur de ne charger `latin-ext` que
 * s'il rencontre un caractère qui en relève. La réécrire à la main serait la seule façon de la
 * casser.
 */
export function feuilleLocale3D(blocs, noms = fichiersParUrl3D(blocs)) {
  const entete = [
    '/* assets/fonts/fonts.css',
    ' *',
    ' * FICHIER GÉNÉRÉ PAR tools/fetch-fonts.mjs, NE PAS MODIFIER À LA MAIN.',
    ' *',
    ' * Les polices sont embarquées dans l\'application : aucune requête réseau, rendu identique',
    ' * hors ligne, et un export PNG qui ne dépend plus d\'un cache HTTP.',
    ' * Licences et attributions : voir LICENSES.md dans ce dossier.',
    ' */',
    '',
  ].join('\n');
  const corps = blocs.map(b => [
    `/* ${b.sousEnsemble} */`,
    '@font-face {',
    `  font-family: '${b.famille}';`,
    `  font-style: ${b.style};`,
    `  font-weight: ${b.graisse};`,
    `  font-display: ${AFFICHAGE_POLICE};`,
    `  src: url(./${noms.get(b.url)}) format('woff2');`,
    `  unicode-range: ${b.plage};`,
    '}',
  ].join('\n')).join('\n\n');
  return `${entete}\n${corps}\n`;
}

/**
 * Les `.woff2` présents sur le disque que la nouvelle feuille ne cite plus.
 *
 * ⚠️ DÉFAUT RÉEL, TROUVÉ APRÈS COUP. La première version écrivait sans jamais supprimer. Le
 * dédoublonnage ayant renommé onze fichiers, la seconde exécution a laissé 16 orphelins dans le
 * dossier : invisibles, jamais chargés, et prêts à partir dans l'installeur et dans l'historique
 * git, qui ne les rendrait plus jamais.
 *
 * C'est la même faute de forme que celle qui revient dans les tests de ce dépôt : agir sur ce qui
 * doit être là sans jamais regarder ce qui ne doit PLUS y être.
 *
 * On ne balaie QUE les `.woff2`, et seulement à la racine du dossier. Les sous-dossiers portent les
 * licences, et un `rm` un peu large sur un dossier généré est la meilleure façon d'effacer un jour
 * quelque chose qui ne se régénère pas.
 */
export function fichiersPerimes3D(surLeDisque, attendus) {
  const garder = new Set(attendus);
  return surLeDisque.filter(f => f.endsWith('.woff2') && !garder.has(f));
}

/**
 * Le récapitulatif de licences. Ce n'est pas de la décoration : l'OFL comme Apache 2.0 exigent que
 * la mention de copyright et le texte de licence voyagent AVEC les fichiers. Le fichier est écrit
 * à partir des métadonnées officielles, pas à partir de ce qu'on croit savoir.
 */
export function recapitulatifLicences3D(fiches) {
  const lignes = [
    '# Fonts bundled with Storyboard BD',
    '',
    'GENERATED BY `tools/fetch-fonts.mjs`, DO NOT EDIT BY HAND.',
    '',
    'Every family below is redistributable inside an application. Neither the SIL Open Font',
    'License 1.1 nor Apache 2.0 places any condition on the rest of this project: they apply to',
    'the font files only. What they do require is that the copyright notice and the licence text',
    'travel with the files, which is why the full licence of each family sits next to it in its',
    'own folder.',
    '',
    '| Family | Designer | Licence | Copyright |',
    '| --- | --- | --- | --- |',
  ];
  for (const f of fiches) {
    lignes.push(`| ${f.nom} | ${f.designer || '?'} | ${f.licence} | ${f.copyright || '?'} |`);
  }
  lignes.push('', 'Full licence texts: `<family>/LICENSE.txt` in this folder.', '');
  return lignes.join('\n');
}

// ── À partir d'ici, l'entrée-sortie. Rien de testable sans réseau, rien de décisif non plus. ────

async function texte(url, entetes = {}) {
  const r = await fetch(url, { headers: entetes });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText} sur ${url}`);
  return r.text();
}

function champMetadonnee(pb, nom) {
  const m = new RegExp(`^${nom}:\\s*"([^"]*)"`, 'm').exec(pb);
  return m ? m[1] : null;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const brut = 'https://raw.githubusercontent.com/google/fonts/main';

  console.log(`Interrogation de l'API css2 pour ${FAMILLES.length} familles…`);
  const css = await texte(urlCss3D(FAMILLES), { 'User-Agent': UA_CHROME });

  if (!/format\('woff2'\)/.test(css)) {
    throw new Error('la réponse ne contient pas de woff2 : le User-Agent n\'a pas été pris');
  }

  const tous = blocsDeLaCss3D(css);
  const sansPlage = tous.filter(b => !b.sousEnsemble);
  if (sansPlage.length) {
    throw new Error(`${sansPlage.length} bloc(s) sans commentaire de sous-ensemble : format inattendu`);
  }
  const gardes = tous.filter(b => SOUS_ENSEMBLES.includes(b.sousEnsemble));

  // Le refus qui compte : une famille absente retomberait en sans-serif, définitivement.
  const trouvees = new Set(gardes.map(b => b.famille));
  const manquantes = FAMILLES.filter(f => !trouvees.has(f.nom)).map(f => f.nom);
  if (manquantes.length) {
    throw new Error(`familles absentes de la réponse : ${manquantes.join(', ')} — rien n'est écrit`);
  }

  const noms = fichiersParUrl3D(gardes);
  console.log(`${gardes.length} blocs @font-face, ${noms.size} fichiers distincts `
    + `(${SOUS_ENSEMBLES.join(', ')}). ${gardes.length - noms.size} doublon(s) écarté(s).`);
  if (dryRun) {
    for (const [url, nom] of noms) console.log(`  ${nom}  ←  ${url}`);
    return;
  }

  mkdirSync(DOSSIER, { recursive: true });
  let octets = 0;
  for (const [url, nom] of noms) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`${r.status} sur ${url}`);
    const buf = Buffer.from(await r.arrayBuffer());
    octets += buf.length;
    writeFileSync(join(DOSSIER, nom), buf);
  }

  const fiches = [];
  for (const f of FAMILLES) {
    const base = `${brut}/${f.repertoire}/${f.slug}`;
    const pb = await texte(`${base}/METADATA.pb`);
    const nomLicence = f.repertoire === 'apache' ? 'LICENSE.txt' : 'OFL.txt';
    const licence = await texte(`${base}/${nomLicence}`);
    const dossierFamille = join(DOSSIER, f.slug);
    mkdirSync(dossierFamille, { recursive: true });
    writeFileSync(join(dossierFamille, 'LICENSE.txt'), licence, 'utf8');
    fiches.push({
      nom: f.nom,
      designer: champMetadonnee(pb, 'designer'),
      licence: f.repertoire === 'apache' ? 'Apache 2.0' : 'SIL OFL 1.1',
      copyright: (/copyright:\s*"([^"]*)"/.exec(pb) || [])[1],
    });
  }

  // Le ménage APRÈS l'écriture, jamais avant : si le téléchargement échoue en route, on préfère un
  // dossier qui contient trop plutôt qu'un dossier vidé et pas rempli.
  const perimes = fichiersPerimes3D(readdirSync(DOSSIER), [...noms.values()]);
  perimes.forEach(f => unlinkSync(join(DOSSIER, f)));
  if (perimes.length) console.log(`${perimes.length} fichier(s) périmé(s) supprimé(s).`);

  writeFileSync(join(DOSSIER, 'fonts.css'), feuilleLocale3D(gardes, noms), 'utf8');
  writeFileSync(join(DOSSIER, 'LICENSES.md'), recapitulatifLicences3D(fiches), 'utf8');

  console.log(`\nÉcrit dans assets/fonts/ : ${noms.size} woff2 (${Math.round(octets / 1024)} ko),`
    + ` ${FAMILLES.length} licences, fonts.css, LICENSES.md.`);
  console.log('Étape suivante : remplacer les deux @import de style.css par');
  console.log("  @import url('./assets/fonts/fonts.css');");
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((e) => { console.error(`\nÉCHEC : ${e.message}`); process.exitCode = 1; });
}
