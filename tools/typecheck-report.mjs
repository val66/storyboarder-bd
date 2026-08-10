#!/usr/bin/env node
/**
 * tools/typecheck-report.mjs — lance la vérification de types et RÉSUME.
 *
 * Pourquoi un résumé plutôt que la sortie brute de `tsc`. Sur 22 000 lignes jamais typées, la
 * sortie brute fait des centaines de lignes et ne dit pas ce qu'il faut savoir pour décider :
 * quels CODES d'erreur dominent, et dans quels fichiers. C'est cette répartition qui permet de
 * choisir ce qu'on active — la même démarche que la calibration d'ESLint, et que la campagne de
 * mesure de performance : on regarde avant de corriger.
 *
 * Usage :
 *     npm run typecheck          # la sortie brute de tsc, pour travailler
 *     npm run typecheck:report   # ce résumé, pour décider
 *
 * Sortie : trois tableaux — par code d'erreur, par fichier, et les dix messages les plus fréquents.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const TSC = join(RACINE, 'node_modules', 'typescript', 'bin', 'tsc');

if (!existsSync(TSC)) {
  // Message d'installation plutôt qu'un plantage : l'outil est OPTIONNEL, comme ESLint. Un clone
  // frais doit pouvoir tourner sans lui.
  console.log('TypeScript n\'est pas installé — la vérification de types est un confort, pas une');
  console.log('condition d\'existence du dépôt.\n');
  console.log('  npm i -D typescript\n');
  process.exit(0);
}

const res = spawnSync(process.execPath, [TSC, '-p', join(RACINE, 'jsconfig.json'), '--noEmit',
  '--pretty', 'false'], { cwd: RACINE, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

const lignes = `${res.stdout || ''}${res.stderr || ''}`.split('\n')
  .filter(l => /error TS\d+:/.test(l));

if (!lignes.length) {
  console.log('Aucun diagnostic. La configuration est peut-être trop permissive — resserrer');
  console.log('strictNullChecks ou noImplicitAny dans jsconfig.json pour voir ce qui apparaît.');
  process.exit(0);
}

const parCode = new Map();
const parFichier = new Map();
const parMessage = new Map();

lignes.forEach(l => {
  const m = l.match(/^(.*?)\((\d+),(\d+)\): error (TS\d+): (.*)$/);
  if (!m) return;
  const [, fichier, , , code, message] = m;
  const court = fichier.replace(/\\/g, '/').replace(/^.*\/src\//, 'src/');
  // Le message est normalisé : les identifiants entre guillemets varient d'une occurrence à
  // l'autre, le PATRON est ce qui se répète et ce qu'on veut compter.
  const patron = message.replace(/'[^']*'/g, "'…'").slice(0, 90);
  parCode.set(code, (parCode.get(code) || 0) + 1);
  parFichier.set(court, (parFichier.get(court) || 0) + 1);
  parMessage.set(`${code} ${patron}`, (parMessage.get(`${code} ${patron}`) || 0) + 1);
});

const tableau = (titre, map, n) => {
  console.log(`\n=== ${titre} ===`);
  [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n)
    .forEach(([k, v]) => console.log(String(v).padStart(6), ' ', k));
};

console.log(`${lignes.length} diagnostic(s) au total, sur ${parFichier.size} fichier(s).`);
tableau('par code d\'erreur', parCode, 20);
tableau('par fichier', parFichier, 20);
tableau('patrons de message les plus fréquents', parMessage, 10);
console.log('\nÀ décider : quels codes valent la peine d\'être corrigés, et lesquels ignorer.');
