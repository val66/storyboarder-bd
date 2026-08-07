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
// Les README affichent aussi la version. Sans les inclure ici, ils dériveraient dès le commit
// suivant — un README qui annonce une version fausse est pire que pas de version du tout.
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
  const level = process.argv[2] || 'patch';
  const dryRun = process.argv.includes('--dry-run');
  const current = readPackageVersion();
  const next = bumpVersion(current, level);
  if (dryRun) {
    console.log(`${current} → ${next} (${level}, simulation)`);
    return;
  }
  // Rewritten with a targeted substitution rather than JSON.stringify: that would reformat the
  // whole file (indentation, key order) and drown the version change in noise at every commit.
  const pkg = readFileSync(PACKAGE_JSON, 'utf8');
  const RE = /("version"\s*:\s*")[^"]+(")/;
  // Teste la CORRESPONDANCE, pas l'égalité des chaînes : en mode sync la version est inchangée,
  // donc la substitution est un non-événement et comparer avant/après criait au faux positif.
  if (!RE.test(pkg)) throw new Error('Champ "version" introuvable dans package.json');
  const patched = pkg.replace(RE, `$1${next}$2`);
  writeFileSync(PACKAGE_JSON, patched);
  writeFileSync(VERSION_JS, renderVersionModule(next));
  for (const readme of READMES) {
    const txt = readFileSync(readme, 'utf8');
    if (!README_VERSION_RE.test(txt)) throw new Error(`Ligne de version introuvable dans ${readme}`);
    writeFileSync(readme, txt.replace(README_VERSION_RE, renderReadmeVersion(next)));
  }
  console.log(`${current} → ${next} (${level})`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) main();
