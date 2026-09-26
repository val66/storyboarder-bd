/**
 * tests/bubble-drag.test.mjs — LE GESTE : un lobe fusionné bouge, mais ne quitte pas son groupe.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * POURQUOI CE FICHIER EXISTE, ALORS QUE LA DÉCISION EST DÉJÀ TENUE AILLEURS
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * `positionAuContactDuGroupe3D` est pure et couverte dans tests/bubble-merge.test.mjs. Rien n'y
 * garantit qu'elle soit APPELÉE. C'est exactement le défaut de #420c (mutation M19) : une couche
 * pure parfaite pendant que le réglage reste inerte, et la suite verte des deux côtés.
 *
 * Ce fichier déclenche donc le VRAI écouteur `mousemove` d'events.js — celui que l'application
 * installe au chargement — et regarde où la Bulle a atterri. Il ne lit aucune ligne de source.
 *
 * ⚠️ POURQUOI LES COORDONNÉES SONT CELLES DE LA SOURIS, SANS CONVERSION. `getCoords` divise par
 * l'échelle mesurée du canevas ; le stub rend un rectangle de taille nulle, donc l'échelle retombe
 * sur `S.zoomLevel`, posé ici à 1. Les pixels d'écran valent alors les unités de Planche.
 */
import './helpers/dom-stub.mjs';
import '../src/events.js';
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { S, currentPage } from '../src/state.js';
import { lobeAuContactDuGroupe3D } from '../src/bubble-merge.js';

const nouvelleBulle = () => {
  S.pendingCreatePos = { x: 200, y: 200 };
  document.getElementById('ctxCreateBubble').onclick();
  const page = currentPage();
  return page.objects[page.objects.length - 1];
};

/** Rejoue un mouvement de souris tel que l'application le reçoit. */
const bouger = (versX, versY) => {
  for (const fn of window._ecouteurs.mousemove || []) fn({ clientX: versX, clientY: versY });
};

describe('#426f — un lobe fusionné ne sort pas du contour de son groupe', () => {
  let ancre, mobile;

  beforeEach(() => {
    S.zoomLevel = 1;
    S.isPanning = false;
    ancre = nouvelleBulle();
    mobile = nouvelleBulle();
    ancre.x = 100; ancre.y = 100;
    mobile.x = 250; mobile.y = 100;            // largeur 170 : les deux se chevauchent
    ancre.bulleGroupe = 'gGeste'; mobile.bulleGroupe = 'gGeste';
    S.selectedId = mobile.id;
    S.dragMode = 'move';
    S.dragStart = { x: 0, y: 0 };
    S.dragOrig = { x: mobile.x, y: mobile.y };
  });

  /**
   * ⚠️ LA DÉCISION PURE PEUT ÊTRE PARFAITE ET N'ÊTRE JAMAIS APPELÉE. Les deux moitiés de
   * l'assertion comptent : le lobe doit avoir BOUGÉ — sinon un glissement entièrement bloqué
   * passerait pour une butée — et il doit être RESTÉ au contact.
   */
  test('⚠️ IL SUIT LA SOURIS PUIS S’ARRÊTE AU CONTACT', () => {
    bouger(900, 100);                          // très loin vers la droite
    assert.ok(mobile.x > 250, 'le lobe n’a pas bougé du tout : ce n’est pas une butée');
    assert.ok(mobile.x < 900, 'le lobe a suivi la souris jusqu’au bout : rien ne l’a retenu');
    assert.equal(lobeAuContactDuGroupe3D(mobile, [ancre]), true,
      'le lobe s’est détaché de son groupe pendant le glissement');
  });

  /**
   * ⚠️ ET LA BUTÉE NE SE DÉPLACE PAS D'UN MOUVEMENT À L'AUTRE. Si le calcul repartait de la
   * position COURANTE plutôt que de celle du début du glissement, chaque mouvement gagnerait sa
   * petite butée sur le précédent : une marche à cliquet, où maintenir la souris au loin éloigne le
   * lobe indéfiniment, un pixel à la fois. Le tort ne se voit qu'au DEUXIÈME mouvement, jamais au
   * premier — c'est pourquoi le test en fait trois.
   */
  test('⚠️ ET ELLE NE SE DÉCALE PAS À CHAQUE MOUVEMENT (pas de marche à cliquet)', () => {
    bouger(900, 100);
    const premiere = mobile.x;
    bouger(900, 100);
    bouger(900, 100);
    assert.equal(mobile.x, premiere,
      `la butée a avancé de ${mobile.x - premiere} : maintenir la souris éloignerait le lobe sans fin`);
  });

  test('une Bulle SANS groupe reste libre d’aller où elle veut', () => {
    delete mobile.bulleGroupe; delete ancre.bulleGroupe;
    bouger(900, 100);
    // Le bord de la Planche reste la seule limite, celle qui existait avant ce chantier.
    const page = currentPage();
    assert.equal(mobile.x, page.w - mobile.w,
      'une Bulle seule a été bridée par une contrainte de groupe');
  });
});
