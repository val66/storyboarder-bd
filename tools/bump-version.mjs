// tools/bump-version.mjs — application version bump (major.minor.patch).
//
// Version policy agreed with the user:
//   • patch — every commit, including docs and tests. Automatic, via the pre-commit hook.
//   • minor — when the user validates a feature after functional testing. Never automatic:
//             it is asked for explicitly once all of a feature's commits are in.
//   • major — on the user's explicit request only.
// Bumping minor resets patch; bumping major resets both.
//
// TWO files carry the version and MUST NOT drift apart:
//   • package.json  — the source of truth, and what electron-builder stamps the installer with.
//   • src/version.js — generated, so the renderer can display the version WITHOUT going through
//     an IPC call. Reading package.json from the renderer would mean touching main.js/preload.js,
//     which is off-limits for application features. tests/version.test.mjs asserts the two match.
//
// Usage: node tools/bump-version.mjs [patch|minor|major] [--dry-run]

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const PACKAGE_JSON = join(ROOT, 'package.json');
export const VERSION_JS = join(ROOT, 'src', 'version.js');
// Les README affichent la version en tête (la seule chose qui y reste : la politique de version est
// dans docs/en/versioning.md, c'est de la doc de contributeur). Sans les inclure ici, ils dériveraient
// dès le commit suivant — un README qui annonce une version fausse est pire que pas de version.
export const READMES = [join(ROOT, 'README.md'), join(ROOT, 'README.fr.md')];
// Ligne réécrite dans les README. Motif volontairement strict et sur sa propre ligne, pour ne
// pouvoir toucher qu'elle.
export const README_VERSION_RE = /^\*\*Version \d+\.\d+\.\d+\*\*$/m;
export function renderReadmeVersion(version){ return `**Version ${version}**`; }
export function readReadmeVersion(file){
  const m = /^\*\*Version (\d+\.\d+\.\d+)\*\*$/m.exec(readFileSync(file, 'utf8'));
  return m ? m[1] : null;
}

export function parseVersion(str){
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(str || '').trim());
  if (!m) throw new Error(`Version illisible : « ${str} » (attendu major.minor.patch)`);
  return { major: +m[1], minor: +m[2], patch: +m[3] };
}

export function formatVersion(v){
  return `${v.major}.${v.minor}.${v.patch}`;
}

// The whole policy, in one pure function — the only place the reset rules live.
export function bumpVersion(current, level){
  const v = parseVersion(current);
  if (level === 'patch') return formatVersion({ ...v, patch: v.patch + 1 });
  if (level === 'minor') return formatVersion({ major: v.major, minor: v.minor + 1, patch: 0 });
  if (level === 'major') return formatVersion({ major: v.major + 1, minor: 0, patch: 0 });
  // 'sync' : ne change rien, sert à régénérer src/version.js depuis package.json (première mise en
  // place, ou fichier généré perdu). Utile parce que ces deux-là ne doivent jamais diverger.
  if (level === 'sync') return formatVersion(v);
  throw new Error(`Niveau inconnu : « ${level} » (attendu patch, minor, major ou sync)`);
}

// Fix 40 — faut-il incrémenter automatiquement au commit ?
//
// NON si la version de l'arbre de travail diffère déjà de celle du dernier commit : c'est qu'elle
// a été passée à la main (`npm run bump minor|major`) et pas encore commitée. Incrémenter par-dessus
// ferait de 1.1.0 un 1.1.1, et la mineure que tu viens de valider n'existerait dans AUCUN commit —
// elle serait juste sautée. Un seul incrément par commit, quel qu'en soit l'auteur.
export function shouldAutoBump(headVersion, workingVersion){
  if (!headVersion) return true; // dépôt sans commit : rien à comparer
  return headVersion === workingVersion;
}

// Fix 40 — nom du tag à poser, ou null. Seules les mineures et majeures sont marquées : un tag par
// correctif noierait les versions qui comptent sous des centaines d'autres.
export function tagForBump(prev, next){
  if (!prev || !next) return null;
  const a = parseVersion(prev), b = parseVersion(next);
  if (a.major === b.major && a.minor === b.minor) return null;
  return `v${formatVersion(b)}`;
}

export function renderVersionModule(version){
  return `// GÉNÉRÉ par tools/bump-version.mjs — ne pas modifier à la main.
// Reflète le champ "version" de package.json. Existe pour que le renderer puisse afficher la
// version sans passer par un IPC (lire package.json depuis le renderer imposerait de toucher
// main.js/preload.js, interdit pour une fonctionnalité applicative).
// tests/version.test.mjs vérifie que les deux ne peuvent pas diverger.
export const APP_VERSION = '${version}';
`;
}

export function readPackageVersion(file = PACKAGE_JSON){
  return JSON.parse(readFileSync(file, 'utf8')).version;
}

export function readModuleVersion(file = VERSION_JS){
  const m = /APP_VERSION\s*=\s*'([^']+)'/.exec(readFileSync(file, 'utf8'));
  return m ? m[1] : null;
}

function main(){
  // Sous-commandes interrogées par les hooks git. Elles n'écrivent rien : elles répondent à une
  // question et sortent, pour que la DÉCISION reste ici, testée, plutôt que dans un script shell.
  if (process.argv[2] === 'tag-for') {
    const tag = tagForBump(process.argv[3], process.argv[4]);
    if (tag) console.log(tag);
    return;
  }
  if (process.argv[2] === 'should-auto-bump') {
    process.exitCode = shouldAutoBump(process.argv[3], process.argv[4]) ? 0 : 1;
    return;
  }
  const level = process.argv[2] || 'patch';
  const dryRun = process.argv.includes('--dry-run');
  const current = readPackageVersion();
  const next = bumpVersion(current, level);
  if (dryRun) {
    console.log(`${current} → ${next} (${level}, simulation)`);
    return;
  }
  // TOUT vérifier avant d'écrire QUOI QUE CE SOIT. La 1re version écrivait package.json puis
  // vérifiait les README : une ligne de version absente d'un README laissait package.json déjà
  // incrémenté et les README en arrière — soit exactement l'incohérence que ce script existe pour
  // empêcher. Constaté en testant le cas d'échec, pas deviné.
  //
  // Substitution ciblée plutôt que JSON.stringify : ce dernier reformaterait tout le fichier
  // (indentation, ordre des clés) et noierait le changement de version dans le bruit à chaque commit.
  const PKG_RE = /("version"\s*:\s*")[^"]+(")/;
  const pkg = readFileSync(PACKAGE_JSON, 'utf8');
  // Teste la CORRESPONDANCE, pas l'égalité des chaînes : en mode sync la version est inchangée,
  // donc la substitution est un non-événement et comparer avant/après criait au faux positif.
  if (!PKG_RE.test(pkg)) throw new Error('Champ "version" introuvable dans package.json');
  const readmes = READMES.map(file => {
    const txt = readFileSync(file, 'utf8');
    if (!README_VERSION_RE.test(txt)) throw new Error(`Ligne de version introuvable dans ${file}`);
    return { file, txt };
  });
  // À partir d'ici, plus aucune vérification ne peut échouer : les écritures s'enchaînent.
  writeFileSync(PACKAGE_JSON, pkg.replace(PKG_RE, `$1${next}$2`));
  writeFileSync(VERSION_JS, renderVersionModule(next));
  for (const { file, txt } of readmes) {
    writeFileSync(file, txt.replace(README_VERSION_RE, renderReadmeVersion(next)));
  }
  console.log(`${current} → ${next} (${level})`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) main();
