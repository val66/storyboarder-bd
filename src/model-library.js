import { tr } from './state.js';
/**
 * @file model-library.js
 * La bibliothèque de modèles : ce qui est sur le disque, et ce qui s'en sert.
 *
 * POURQUOI GROUPER PAR USAGE PLUTÔT QUE PAR NATURE. On a envisagé de marquer chaque fichier
 * « décor » ou « objet » à l'import — un manifeste, ou deux sous-dossiers. Écarté, et la raison
 * tient en un cas banal : le même `salon.glb` peut servir de décor dans une Scène aujourd'hui et
 * d'objet posé dans une Case demain. Un fichier ne PEUT PAS porter cette distinction ; c'est son
 * usage qui la porte, et un fichier peut avoir les deux.
 *
 * Avec des sous-dossiers, réimporter ce salon comme objet obligerait soit à dupliquer ses vingt
 * méga-octets, soit à mentir sur le classement. Avec un manifeste, un `.glb` déposé à la main
 * n'y figurerait pas — une désynchronisation silencieuse de plus.
 *
 * Le groupement ci-dessous est DÉDUIT du Projet ouvert, à chaque affichage. Il ne peut donc pas
 * mentir, et il répond à la question qu'on se pose vraiment en ouvrant ce menu : « puis-je
 * supprimer ce fichier sans rien casser ? » — à quoi « non utilisé » répond, et à quoi « Décors »
 * n'aurait pas répondu.
 *
 * CE QU'ON NE PEUT PAS SAVOIR, et qu'il faut donc dire à l'utilisateur : les AUTRES Projets. On ne
 * connaît que celui qui est ouvert. Un fichier « non utilisé » ici peut être indispensable ailleurs.
 */

import { isImportedModel } from './model-store.js';

/**
 * Recense l'usage de chaque fichier dans un Projet. Fonction PURE.
 *
 * @param {string[]} fichiers  les .glb présents sur le disque
 * @param {object} projet      { tomes, scenes } — les deux racines d'un Projet
 * @returns {{parScenes: Array, dansCases: Array, nonUtilises: string[]}}
 *
 * Un fichier utilisé des deux façons apparaît dans les DEUX groupes. C'est la vérité, et la cacher
 * ferait croire qu'il n'a qu'un usage — donc qu'on peut le supprimer après avoir traité l'autre.
 */
export function groupModelsByUsage(fichiers, { tomes = [], scenes = [] } = {}){
  const parScene = new Map();      // fichier → noms de Scènes
  const parCase = new Map();       // fichier → nombre d'Éléments

  const recenser = (volumes, ajouter) => {
    (volumes || []).forEach(vol => {
      (vol.pages || []).forEach(page => {
        (page.objects || []).forEach(o => {
          if (isImportedModel(o) && o.modelFile) ajouter(o.modelFile, vol);
        });
      });
    });
  };

  recenser(scenes, (f, sc) => {
    if (!parScene.has(f)) parScene.set(f, []);
    const noms = parScene.get(f);
    const nom = sc.name || tr('(unnamed)', '(sans nom)');
    if (!noms.includes(nom)) noms.push(nom);
  });
  recenser(tomes, (f) => parCase.set(f, (parCase.get(f) || 0) + 1));

  const connus = new Set(fichiers || []);
  // Un fichier référencé par le Projet mais ABSENT du disque doit quand même apparaître : c'est
  // précisément celui dont l'utilisateur cherche la trace quand il voit une boîte orangée.
  [...parScene.keys(), ...parCase.keys()].forEach(f => connus.add(f));

  const tous = [...connus].sort((a, b) => a.localeCompare(b, 'fr'));
  return {
    parScenes: tous.filter(f => parScene.has(f)).map(f => ({ nom: f, scenes: parScene.get(f) })),
    dansCases: tous.filter(f => parCase.has(f)).map(f => ({ nom: f, count: parCase.get(f) })),
    nonUtilises: tous.filter(f => !parScene.has(f) && !parCase.has(f)),
  };
}

/**
 * Combien d'Éléments du Projet ouvert utilisent ce fichier — Scènes ET Cases confondues.
 *
 * C'est le chiffre annoncé avant une suppression. Il porte sur les ÉLÉMENTS, pas sur les Scènes :
 * « 3 Éléments » dit combien de choses vont se transformer en boîte de remplacement, ce qui est la
 * conséquence réelle.
 */
export function countModelUsages(fichier, { tomes = [], scenes = [] } = {}){
  let n = 0;
  [...(tomes || []), ...(scenes || [])].forEach(vol => {
    (vol.pages || []).forEach(page => {
      (page.objects || []).forEach(o => {
        if (isImportedModel(o) && o.modelFile === fichier) n++;
      });
    });
  });
  return n;
}

/**
 * Le message de confirmation d'une suppression. Fonction PURE — c'est ce qui la rend vérifiable.
 *
 * Il dit TROIS choses, et les trois comptent : que c'est irréversible, ce que ça casse ici, et
 * qu'on ne peut rien affirmer des autres Projets. Taire la troisième serait laisser croire à une
 * garantie qu'on n'a pas.
 */
export function messageSuppressionModele(fichier, usages, traduire){
  const t = traduire || ((en) => en);
  const conséquence = usages > 0
    ? t(`${usages} Element(s) in this project use it — they will show as placeholder boxes.`,
      `${usages} Élément(s) de ce Projet l'utilisent — ils deviendront des boîtes de remplacement.`)
    : t('No Element in this project uses it.', tr('No Element of this project uses it.', 'Aucun Élément de ce Projet ne l\'utilise.'));
  return t(
    `Delete "${fichier}" from disk? ${conséquence} Other projects cannot be checked from here, and this cannot be undone.`,
    `Supprimer « ${fichier} » du disque ? ${conséquence} Les autres Projets ne peuvent pas être vérifiés d'ici, et cette suppression est définitive.`,
  );
}
