#!/usr/bin/env node
/**
 * tools/check-hooks.mjs — rappelle, après `npm install`, que les hooks ne sont pas installés.
 *
 * POURQUOI RAPPELER PLUTÔT QU'INSTALLER. Il serait techniquement simple de lancer setup-hooks
 * depuis un script `prepare` : npm l'exécuterait tout seul après chaque installation, et personne
 * n'oublierait plus. C'est délibérément écarté.
 *
 * Le hook pre-commit de ce dépôt n'observe pas : il MODIFIE le commit en cours — il incrémente la
 * version dans quatre fichiers et les ajoute à l'index. L'installer en silence chez quelqu'un qui
 * voulait seulement lancer l'application une fois serait une surprise désagréable, et le genre de
 * chose qu'on découvre au pire moment. Un outil qui agit sans qu'on le lui demande doit être
 * exceptionnellement anodin ; celui-ci ne l'est pas.
 *
 * Ce script se contente donc de le DIRE, une fois, et rend toujours 0 : il ne doit jamais faire
 * échouer une installation.
 */
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');

// Silencieux hors d'un dépôt git (archive téléchargée) et en intégration continue, où les hooks
// n'ont aucun sens : la CI lance lint et tests explicitement.
if (!existsSync(join(RACINE, '.git')) || process.env.CI) process.exit(0);

if (!existsSync(join(RACINE, '.git', 'hooks', 'pre-commit'))) {
  console.log('');
  console.log('  Les hooks git ne sont pas installés — vos commits ne seront pas vérifiés.');
  console.log('    npm run setup-hooks');
  console.log('  (lint + tests avant chaque commit, et incrément automatique de la version)');
  console.log('  Détail : docs/en/versioning.md');
  console.log('');
}
