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
import { lobeAuContactDuGroupe3D, largeurDeSoudure3D, soudureExigee3D } from '../src/bubble-merge.js';

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
  // ⚠️ UN GROUPE NEUF À CHAQUE TEST. Les Bulles d'un test survivent dans la Planche : réutiliser le
  // même identifiant les ferait toutes rejoindre le groupe courant, et un lobe abandonné par le
  // test précédent tiendrait lieu de voisin. Le contact serait alors vrai pour une raison qui n'a
  // rien à voir avec ce qu'on mesure — et il l'a été, une fois, avant cette ligne.
  let numero = 0;

  beforeEach(() => {
    S.zoomLevel = 1;
    S.isPanning = false;
    ancre = nouvelleBulle();
    mobile = nouvelleBulle();
    ancre.x = 100; ancre.y = 100;
    mobile.x = 250; mobile.y = 100;            // largeur 170 : les deux se chevauchent
    const groupe = `gGeste${++numero}`;
    ancre.bulleGroupe = groupe; mobile.bulleGroupe = groupe;
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

  /**
   * ⚠️ LE REDIMENSIONNEMENT EST L'AUTRE CHEMIN QUI ÉCRIT LA GÉOMÉTRIE, ET IL ÉTAIT LIBRE. Rapporté
   * à l'usage, capture à l'appui, alors que la contrainte paraissait posée : le déplacement était
   * bridé, la poignée de redimensionnement ne l'était pas. Un test qui ne regarde qu'un seul geste
   * déclare tenue une règle qui ne l'est qu'à moitié — et c'est ce que le précédent faisait.
   */
  test('⚠️ LA POIGNÉE DE REDIMENSIONNEMENT EST BRIDÉE ELLE AUSSI', () => {
    S.dragMode = 'resize';
    S.dragHandle = 'l';                        // le bord GAUCHE, celui qui éloigne du voisin
    S.dragOrig = { x: mobile.x, y: mobile.y, w: mobile.w, h: mobile.h, type: 'bulle' };
    bouger(600, 0);                            // on tire le bord gauche très loin vers la droite

    assert.ok(mobile.w < 170, 'le lobe n’a pas rétréci du tout : ce n’est pas une butée');
    assert.ok(mobile.x > 250, 'le bord gauche n’a pas avancé');
    assert.equal(lobeAuContactDuGroupe3D(mobile, [ancre]), true,
      'le lobe s’est décollé de son groupe en rétrécissant');
  });

  /**
   * ⚠️ LE DÉPART EST CELUI DU GLISSEMENT, ET LE TORT NE SE VOIT QU'EN CHANGEANT DE DIRECTION. Un
   * aller-retour dans le même axe revient au même point quelle que soit l'origine de l'interpolation
   * — c'est pourquoi le test de la marche à cliquet, plus haut, laissait passer la faute. Il faut un
   * SECOND mouvement dans une AUTRE direction : interpoler depuis la butée du premier n'explore alors
   * plus le même segment, et le lobe atterrit ailleurs.
   */
  test('⚠️ UN CHANGEMENT DE DIRECTION REPART DU DÉBUT DU GLISSEMENT', () => {
    bouger(600, 0);                            // vers la droite, jusqu'à la butée
    bouger(0, 600);                            // puis franchement vers le bas
    const depuisLeDebut = { x: mobile.x, y: mobile.y };

    // Le même geste, rejoué d'un seul coup depuis la position de départ : si l'interpolation partait
    // vraiment du début du glissement, les deux doivent coïncider.
    mobile.x = 250; mobile.y = 100;
    S.dragOrig = { x: 250, y: 100 };
    bouger(0, 600);
    assert.equal(mobile.x.toFixed(3), depuisLeDebut.x.toFixed(3),
      'le second mouvement est reparti de la butée du premier, pas du début du glissement');
    assert.equal(mobile.y.toFixed(3), depuisLeDebut.y.toFixed(3),
      'le second mouvement est reparti de la butée du premier, pas du début du glissement');
  });

  /**
   * ⚠️ CHANGER LA FORME EST UN TROISIÈME CHEMIN, ET IL NE PASSE PAS PAR LA SOURIS. Passer d'un
   * rectangle à une étoile rétrécit la silhouette d'un tiers : les deux Bulles se décollent sans
   * que personne ne les ait bougées. Pire, l'écart rouvrait la porte de sortie de la décision pure
   * — « hors contact au départ, alors aucune contrainte » — et la Bulle redevenait libre à jamais.
   * Rapporté à l'usage : « si je change la forme de la bulle c'est pire ».
   */
  test('⚠️ CHANGER LA FORME RECOLLE LE LOBE AU LIEU DE LE LIBÉRER', () => {
    mobile.bulleShape = 'rect'; ancre.bulleShape = 'rect';
    mobile.x = 250; mobile.y = 100;            // 20 px de recouvrement : vraiment soudées
    assert.equal(lobeAuContactDuGroupe3D(mobile, [ancre]), true, 'la fixture doit partir au contact');

    S.sideDescTarget = mobile;
    const menu = document.getElementById('sideBubbleShapeSelect');
    menu.value = 'etoile';
    (menu._ecouteurs.change || []).forEach(fn => fn({ target: menu }));

    assert.equal(mobile.bulleShape, 'etoile', 'la forme n’a pas été appliquée');
    assert.equal(lobeAuContactDuGroupe3D(mobile, [ancre]), true,
      'le changement de forme a laissé un écart, et rouvert la porte de sortie');
  });

  /**
   * ⚠️ LA BUTÉE S'ARRÊTE SUR UNE SOUDURE, PAS SUR UN BAISER. Deux ovales tangents se touchent en un
   * point : c'est là que la butée s'arrêtait, et le résultat se lisait comme un écart. La pointe
   * d'une des Bulles franchissait ce point et masquait le défaut — l'utilisateur l'a vu en la
   * retirant, ce qui explique pourquoi le rapport parlait de la pointe alors qu'elle n'y est pour
   * rien : elle ne touche NI au contour NI au contact, elle les cachait seulement.
   */
  test('⚠️ LA BUTÉE LAISSE UNE VRAIE SOUDURE, PAS DEUX CONTOURS ACCOLÉS', () => {
    mobile.tailShape = 'aucune';               // la pointe ne masque plus rien
    bouger(900, 100);
    const taille = largeurDeSoudure3D(mobile, ancre);
    assert.ok(taille >= soudureExigee3D(mobile, ancre),
      `les deux lobes ne se étranglement de ${taille.toFixed(1)} px : accolés, pas soudés`);
  });

  /**
   * ⚠️ LA FUSION SE PROPOSE AU CONTACT, MAIS ELLE SE CONCLUT EN SOUDANT. Deux contours qui se
   * frôlent sont le bon moment pour poser la question ; ils ne font pas une Bulle pour autant.
   * Sans ce rapprochement final, l'utilisateur accepte une fusion et récolte deux contours accolés
   * qu'il devra corriger à la main — exactement ce qu'il a rapporté.
   *
   * ⚠️ ET CE TEST TRAVERSE LA CONFIRMATION, que #426d n'avait jamais éprouvée. La modale rend une
   * promesse dont le résolveur vit dans `S.confirmActionResolve` : on répond « oui » comme
   * l'utilisateur le ferait, au lieu de contourner le seul endroit où le geste peut être annulé.
   */
  test('⚠️ ACCEPTER LA FUSION SOUDE LES DEUX LOBES', async () => {
    delete ancre.bulleGroupe; delete mobile.bulleGroupe;
    ancre.bulleFusionnable = true; mobile.bulleFusionnable = true;
    ancre.x = 100; ancre.y = 100;
    mobile.x = 269; mobile.y = 100;            // tangentes : elles se frôlent, sans plus
    assert.ok(largeurDeSoudure3D(mobile, ancre) < soudureExigee3D(mobile, ancre),
      'la fixture doit partir d’un simple frôlement');

    S.selectedId = mobile.id;
    S.apercuFusion = [mobile, ancre];
    for (const fn of window._ecouteurs.mouseup || []) fn({ clientX: 0, clientY: 0, button: 0 });
    assert.equal(typeof S.confirmActionResolve, 'function', 'aucune confirmation n’a été demandée');
    S.confirmActionResolve(true);
    await new Promise((r) => setTimeout(r, 0));

    assert.ok(mobile.bulleGroupe, 'la fusion n’a pas eu lieu');
    const taille = largeurDeSoudure3D(mobile, ancre);
    assert.ok(taille >= soudureExigee3D(mobile, ancre),
      `fusionnées mais étranglement de ${taille.toFixed(1)} px : deux contours accolés, pas une Bulle`);
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
