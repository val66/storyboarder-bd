/**
 * projects-dir.js, OÙ VIVENT LES PROJETS de l'application installée, et le déménagement de
 * l'ancien emplacement (#447).
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * LE DÉFAUT CORRIGÉ
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Jusqu'à la v1.9.1, le dossier des Projets par défaut de l'application installée était `Projets`
 * À CÔTÉ DU PROGRAMME. Or le désinstalleur d'electron-builder, que CHAQUE MISE À JOUR exécute,
 * vide le dossier d'installation en entier (`RMDir /r $INSTDIR`, templates/nsis/uninstaller.nsh).
 * Projets, Modeles et Images rangés là disparaissaient à la première mise à jour. Avant #442 il
 * fallait réinstaller à la main pour le déclencher ; avec les mises à jour intégrées, c'était à
 * chaque version. Trouvé en préparant #444, avant qu'aucun utilisateur ne soit touché.
 *
 * Trois défenses, parce qu'une seule ne couvre pas tout :
 *   1. le dossier par défaut est désormais dans Documents (`Documents/<application>/Projets`),
 *      où aucun installeur ne touche ;
 *   2. l'INSTALLEUR d'une nouvelle version déplace `<installation>/Projets` vers Documents AVANT
 *      de désinstaller l'ancienne (build/installer.nsh, macro customInit) : c'est le seul moment
 *      où l'on peut encore agir, puisque le désinstalleur qui efface est celui de l'ANCIENNE
 *      version, que nous ne pouvons plus modifier ;
 *   3. l'APPLICATION, au démarrage, fait le même déménagement si l'ancien dossier existe encore,
 *      et réécrit les réglages qui pointaient dedans (dossier choisi, dernier Projet ouvert).
 *
 * Ce fichier DÉCIDE ; main.js fait les entrées-sorties. CommonJS, testé sous Node nu.
 */
'use strict';
const path = require('path');

/** Le nom du dossier qui reçoit un ancien contenu quand la cible est déjà occupée. ASCII : l'installeur NSIS écrit le même. */
const DOSSIER_RECUPERE = 'Projets (anciens)';

/** Le dossier des Projets par défaut. En développement, celui du dépôt, comme avant. */
function dossierParDefaut({ packaged, documents, nomApp, appDir }){
  return packaged ? sys(documents).join(documents, nomApp, 'Projets') : sys(appDir).join(appDir, 'Projets');
}

/** L'ancien dossier par défaut, celui que les mises à jour effaçaient. Rien en développement. */
function ancienDossierParDefaut({ packaged, exeDir }){
  return packaged ? sys(exeDir).join(exeDir, 'Projets') : null;
}

/**
 * Les fonctions de chemin du système qui a ÉCRIT ce chemin : Windows s'il porte une barre
 * oblique inverse. Sans cela, les tests (sous Linux) joindraient un chemin Windows avec « / ».
 */
function sys(chemin){
  return String(chemin || '').includes('\\') ? path.win32 : path.posix;
}

/** Forme comparable d'un chemin Windows : séparateurs unifiés, sans séparateur final, sans casse. */
function norme(c){
  return String(c || '').replace(/[\\/]+/g, '/').replace(/\/$/, '').toLowerCase();
}

/** `chemin` est-il `dossier` lui-même, ou à l'intérieur ? */
function dansLeDossier(chemin, dossier){
  if (!chemin || !dossier) return false;
  const c = norme(chemin);
  const d = norme(dossier);
  return c === d || c.startsWith(d + '/');
}

/** Le même chemin, déplacé de `ancien` vers `nouveau`. Inchangé s'il n'est pas dans `ancien`. */
function relocaliser(chemin, ancien, nouveau){
  if (!dansLeDossier(chemin, ancien)) return chemin;
  const reste = String(chemin).replace(/[\\/]+/g, '/').slice(norme(ancien).length).replace(/^\//, '');
  return reste ? sys(nouveau).join(nouveau, ...reste.split('/')) : nouveau;
}

/**
 * Le plan du démarrage. Rend :
 *   - `deplacer` : faut-il déplacer l'ancien dossier, et `cible` : vers où ;
 *   - `reglages` : les réglages à réécrire (`projectsDir`, `lastFilePath`), seulement ceux qui
 *     changent ;
 *   - `annonce` : `{ de, vers }` à montrer à l'utilisateur, ou null.
 *
 * `ancienContenu` / `nouveauContenu` : les dossiers existent-ils ET contiennent-ils quelque chose.
 * Un ancien dossier vide ne vaut pas un déménagement, ni une annonce.
 */
function planMigration({ ancien, nouveau, ancienContenu, nouveauContenu, reglages = {} }){
  const plan = { deplacer: false, cible: null, reglages: {}, annonce: null };
  if (!ancien) return plan;
  const cible = ancienContenu
    ? (nouveauContenu ? sys(nouveau).join(sys(nouveau).dirname(nouveau), DOSSIER_RECUPERE) : nouveau)
    : nouveau;
  if (ancienContenu) {
    plan.deplacer = true;
    plan.cible = cible;
    plan.annonce = { de: ancien, vers: cible };
  }
  // Les réglages qui pointent dans l'ancien dossier suivent le contenu là où il va. Un dossier
  // choisi qui ÉTAIT l'ancien défaut redevient le défaut : on efface le réglage.
  for (const cle of ['projectsDir', 'lastFilePath']) {
    const v = reglages[cle];
    if (!dansLeDossier(v, ancien)) continue;
    if (cle === 'projectsDir' && norme(v) === norme(ancien) && cible === nouveau) plan.reglages[cle] = null;
    else plan.reglages[cle] = relocaliser(v, ancien, cible);
  }
  return plan;
}

module.exports = {
  DOSSIER_RECUPERE, dossierParDefaut, ancienDossierParDefaut, dansLeDossier, relocaliser, planMigration,
};
