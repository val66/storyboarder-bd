/**
 * @file deselection.js
 * Un clic ailleurs désélectionne-t-il ? La règle, écrite une fois.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * POURQUOI CE FICHIER EXISTE
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Cliquer en dehors de ce qu'on a sélectionné le désélectionne. La règle est simple, mais elle
 * était écrite TROIS FOIS dans events.js — une par nature de sélection, Scène, Bulle, Case — avec
 * chaque fois la même liste de zones légitimes recopiée à la main. Trois copies d'une même règle
 * sont trois occasions de diverger, et elles avaient divergé.
 *
 * ⚠️ LE DÉFAUT SIGNALÉ (#419). Avec une Case sélectionnée, cliquer sur Annuler, Enregistrer ou
 * Configuration la désélectionnait. Ces trois boutons AGISSENT sur le document, ils ne le quittent
 * pas : appuyer sur Annuler n'est pas « aller voir ailleurs ». L'entête est une barre d'outils, pas
 * une zone de dessin, et elle ne figurait dans aucune des trois listes.
 *
 * ⚠️ ET L'INCOHÉRENCE ÉTAIT VISIBLE À L'ŒIL NU, sans que personne la voie : avec un ÉLÉMENT
 * sélectionné, les mêmes boutons ne désélectionnaient rien. Non par décision, mais parce que le
 * gestionnaire des Cases sort d'emblée quand la sélection n'est pas une Case, et qu'aucun
 * gestionnaire ne couvrait les Éléments. Deux comportements opposés pour le même geste, l'un voulu
 * et l'autre accidentel, et rien pour dire lequel était lequel.
 *
 * ⚠️ LE BOUTON DU MANUEL N'A PAS BESOIN DE CETTE RÈGLE, et c'est ce qui permet de l'exempter sans
 * rien casser : `afficherManuelLateral` (sidebar.js) remet `S.selectedId` à null lui-même, parce
 * qu'afficher le Manuel demande de libérer tous les niveaux qui passent devant lui. Il continue
 * donc de désélectionner, par sa propre volonté et non par effet de bord.
 */

/**
 * Les zones où un clic n'a jamais valeur de « je pars ». Elles agissent SUR la sélection.
 *
 * `canevas`          on clique dans le dessin : c'est le gestionnaire du canevas qui décide.
 * `panneau-droit`    la fiche de ce qui est sélectionné : y cliquer, c'est le régler.
 * `menu-contextuel`  ouvert SUR la sélection, il agit sur elle.
 * `modale-ouverte`   `mousedown` précède `click` : effacer la sélection ici la retirerait sous les
 *                    pieds du gestionnaire de la modale, avant qu'il ait pu s'exécuter.
 * `entete`           la barre d'outils. Annuler, Enregistrer, Configuration agissent sur le
 *                    document ; le Manuel se désélectionne tout seul (cf. plus haut).
 */
export const ZONES_SANS_DESELECTION = [
  'canevas', 'panneau-droit', 'menu-contextuel', 'modale-ouverte', 'entete',
];

/**
 * ⚠️ UNE EXCEPTION QUI RESTE, ET ELLE EST DÉCLARÉE PLUTÔT QU'ENFOUIE. Pour une Bulle, le
 * commentaire d'origine invoque une demande explicite : « cliquer en dehors la désélectionne, même
 * si le clic tombe hors du canevas (menu de gauche, entête, etc.) ». L'entête y est nommée. Je ne
 * défais pas une demande passée sans qu'elle soit reposée, donc la Bulle garde son comportement, et
 * la divergence est ÉCRITE ici au lieu d'être dispersée dans trois gestionnaires.
 *
 * Si la réponse est d'aligner la Bulle sur le reste, il suffit de vider cette table.
 */
export const ZONES_QUI_DESELECTIONNENT_MALGRE_TOUT = {
  bulle: ['entete'],
};

/**
 * Un clic dans `zone`, avec une sélection de nature `typeSelection`, doit-il désélectionner ?
 * Fonction PURE.
 *
 * `zone` est le nom de la zone la plus spécifique atteinte, ou `'ailleurs'` pour tout le reste :
 * le menu de gauche, la zone vide autour de la Planche, la barre d'état.
 *
 * ⚠️ UNE ZONE INCONNUE DÉSÉLECTIONNE. C'est le comportement historique de tout ce qui n'était pas
 * nommé, et c'est le bon défaut : une zone qu'on oublie d'exempter fait perdre une sélection, ce
 * qui se voit et se signale ; une zone exemptée par erreur donne une sélection qui refuse de
 * partir, ce qui ressemble à une panne.
 */
export function clicDeselectionne3D(zone, typeSelection){
  const exceptions = ZONES_QUI_DESELECTIONNENT_MALGRE_TOUT[typeSelection] || [];
  if (exceptions.includes(zone)) return true;
  return !ZONES_SANS_DESELECTION.includes(zone);
}
