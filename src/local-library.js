/**
 * @file src/local-library.js
 * La bibliothèque « Mes modèles » : ce que contient le dossier Modeles, décrit comme un résultat du
 * store, filtré et trié. Fonctions PURES : le DOM est l'affaire de store-ui.js.
 *
 * Chaque modèle local devient une ENTRÉE : son fichier, un titre (celui de la source s'il vient du
 * store, sinon le nom du fichier), sa catégorie COMMUNE (store-categories.js, notée au
 * téléchargement ; « Non classé » pour un modèle importé à la main), sa source et sa licence s'il en
 * a une, et surtout OÙ IL SERT dans le Projet ouvert, c'est la raison d'être de l'ancienne liste du
 * menu de gauche, et elle reste : par des Scènes, dans des Cases, ou nulle part.
 *
 * Un fichier cité par le Projet mais ABSENT du disque apparaît aussi, marqué : c'est précisément
 * celui qu'on cherche quand une boîte orangée est apparue dans une Case.
 */
import { modelUsageLocations } from './model-usages.js';
import { texteComparable } from './model-library.js';
import { isImportedModel } from './model-store.js';

/** La catégorie des modèles qu'aucune source n'a classés. */
export const NON_CLASSE = 'non-classe';
/** Les filtres d'usage, dans l'ordre du menu. */
export const USAGES = ['tous', 'scenes', 'cases', 'inutilises'];
/** Les tris proposés. */
export const TRIS_LOCAUX = ['nom', 'recents'];

/**
 * Les entrées de la bibliothèque.
 *   fichiers      [{ nom, taille, modifie }] du dossier Modeles
 *   attributions  [{ source, id, fichier, nom, auteur, licence, url, categorie, resolution }] présentes
 *   projet        { tomes, scenes } ouvert
 */
export function entreesLocales({ fichiers = [], attributions = [], projet = {} } = {}){
  const parFichier = new Map((attributions || []).filter(a => a && a.fichier).map(a => [String(a.fichier).toLowerCase(), a]));
  const surDisque = new Map((fichiers || []).filter(f => f && f.nom).map(f => [f.nom, f]));
  const noms = new Set(surDisque.keys());
  // Les fichiers cités mais absents : relevés dans les usages du Projet.
  modelesCites(projet).forEach(n => noms.add(n));
  return [...noms].map(nom => {
    const f = surDisque.get(nom);
    const a = parFichier.get(nom.toLowerCase()) || null;
    const endroits = modelUsageLocations(nom, projet);
    return {
      fichier: nom,
      titre: a && a.nom ? a.nom : nom.replace(/\.glb$/i, ''),
      categorie: (a && a.categorie) || NON_CLASSE,
      attribution: a,
      taille: f ? f.taille : null,
      modifie: f ? f.modifie : null,
      introuvable: !f,
      scenes: endroits.filter(e => e.kind === 'scene'),
      cases: endroits.filter(e => e.kind === 'panel'),
    };
  });
}

function modelesCites({ tomes = [], scenes = [] } = {}){
  const cites = new Set();
  [...(tomes || []), ...(scenes || [])].forEach(v => (v && v.pages || []).forEach(p => (p && p.objects || []).forEach(o => {
    if (isImportedModel(o) && o.modelFile) cites.add(o.modelFile);
  })));
  return cites;
}

/**
 * Filtre et trie les entrées. `filtre` : { texte, categorie, usage, tri }.
 *   - le texte cherche dans le titre, le nom de fichier, l'auteur, et les noms des Scènes qui l'utilisent ;
 *     chaque mot doit se trouver, sans accents ni majuscules (comme l'ancien filtre du menu de gauche) ;
 *   - « Non classé » est une catégorie comme une autre ;
 *   - le tri « récents » met en tête les fichiers modifiés le plus récemment, les absents à la fin.
 */
export function filtrerEntrees(entrees, { texte = '', categorie = null, usage = 'tous', tri = 'nom' } = {}){
  const mots = texteComparable(texte).split(' ').filter(Boolean);
  let liste = (entrees || []).filter(e => {
    if (categorie && e.categorie !== categorie) return false;
    if (usage === 'scenes' && !e.scenes.length) return false;
    if (usage === 'cases' && !e.cases.length) return false;
    if (usage === 'inutilises' && (e.scenes.length || e.cases.length)) return false;
    if (!mots.length) return true;
    const tout = texteComparable([e.titre, e.fichier, e.attribution && e.attribution.auteur && e.attribution.auteur.nom,
      ...e.scenes.map(s => s.sceneName)].filter(Boolean).join(' '));
    return mots.every(m => tout.includes(m));
  });
  liste = liste.slice().sort((a, b) => (tri === 'recents'
    ? (b.modifie || 0) - (a.modifie || 0) || a.titre.localeCompare(b.titre, 'fr')
    : a.titre.localeCompare(b.titre, 'fr', { sensitivity: 'base' })));
  return liste;
}
