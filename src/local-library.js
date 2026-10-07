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

/*
 * PLUS DE CATÉGORIE DEVINÉE (retour de Valentin). Un modèle importé à la main sans catégorie de
 * source arrive en « Non classé », et l'utilisateur choisit la bonne dans la fiche. La devinette par
 * mots-clés se trompait assez pour qu'on doive la signaler (« devinée ») : mieux vaut un « Non
 * classé » honnête qu'une catégorie fausse présentée comme vraie.
 */

/**
 * Les entrées de la bibliothèque.
 *   fichiers      [{ nom, taille, modifie }] du dossier Modeles
 *   attributions  [{ source, id, fichier, nom, auteur, licence, url, categorie, resolution, dimensions }] présentes
 *   projet        { tomes, scenes } ouvert
 *   metas         { [fichier]: { dimensions, noms } } relevés au rendu des vignettes
 */
export function entreesLocales({ fichiers = [], attributions = [], projet = {}, metas = {}, bibliotheque = null } = {}){
  // Ce que l'utilisateur a dit de ses modèles (bibliotheque-modeles.js) : catégorie choisie, tags.
  const choisies = (bibliotheque && bibliotheque.categories) || {};
  const tagsParModele = (bibliotheque && bibliotheque.tagsParModele) || {};
  const nomsTags = new Map(((bibliotheque && bibliotheque.tags) || []).map(t => [t.id, t.nom]));
  const choisieDe = (nom) => { const k = Object.keys(choisies).find(f => f.toLowerCase() === nom.toLowerCase()); return k ? choisies[k] : null; };
  const tagsDe = (nom) => { const k = Object.keys(tagsParModele).find(f => f.toLowerCase() === nom.toLowerCase()); return k ? tagsParModele[k] : []; };
  const parFichier = new Map((attributions || []).filter(a => a && a.fichier).map(a => [String(a.fichier).toLowerCase(), a]));
  const surDisque = new Map((fichiers || []).filter(f => f && f.nom).map(f => [f.nom, f]));
  const noms = new Set(surDisque.keys());
  // Les fichiers cités mais absents : relevés dans les usages du Projet.
  modelesCites(projet).forEach(n => noms.add(n));
  return [...noms].map(nom => {
    const f = surDisque.get(nom);
    const a = parFichier.get(nom.toLowerCase()) || null;
    const endroits = modelUsageLocations(nom, projet);
    const m = (metas && metas[nom]) || {};
    // La catégorie CHOISIE par l'utilisateur l'emporte ; sinon celle de la source ; sinon Non classé.
    const choisie = choisieDe(nom);
    const tags = tagsDe(nom).filter(id => nomsTags.has(id));
    return {
      fichier: nom,
      titre: a && a.nom ? a.nom : nom.replace(/\.glb$/i, ''),
      categorie: choisie || (a && a.categorie) || NON_CLASSE,
      categorieChoisie: !!choisie,
      // Les tags, par identifiant, et leurs noms (triés) pour l'affichage et la recherche.
      tags,
      nomsTags: tags.map(id => nomsTags.get(id)).sort((x, y) => x.localeCompare(y, 'fr')),
      // Largeur × profondeur × hauteur, en mètres : la source s'il la donne, sinon la mesure du rendu.
      dimensions: (a && Array.isArray(a.dimensions) ? a.dimensions : null) || (Array.isArray(m.dimensions) ? m.dimensions : null),
      // Le nombre d'os, relevé au rendu ; null tant qu'on ne sait pas. Zéro : pas de « Squelette ».
      os: Number.isInteger(m.os) ? m.os : null,
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
export function filtrerEntrees(entrees, { texte = '', categorie = null, usage = 'tous', tri = 'nom', tags = [] } = {}){
  const mots = texteComparable(texte).split(' ').filter(Boolean);
  const voulus = Array.isArray(tags) ? tags : [];
  let liste = (entrees || []).filter(e => {
    if (categorie && e.categorie !== categorie) return false;
    // Plusieurs tags : le modèle doit les porter TOUS (choix de Valentin, chaque tag resserre).
    if (voulus.length && !voulus.every(id => (e.tags || []).includes(id))) return false;
    if (usage === 'scenes' && !e.scenes.length) return false;
    if (usage === 'cases' && !e.cases.length) return false;
    if (usage === 'inutilises' && (e.scenes.length || e.cases.length)) return false;
    if (!mots.length) return true;
    const tout = texteComparable([e.titre, e.fichier, e.attribution && e.attribution.auteur && e.attribution.auteur.nom,
      ...e.scenes.map(s => s.sceneName), ...(e.nomsTags || [])].filter(Boolean).join(' '));
    return mots.every(m => tout.includes(m));
  });
  liste = liste.slice().sort((a, b) => (tri === 'recents'
    ? (b.modifie || 0) - (a.modifie || 0) || a.titre.localeCompare(b.titre, 'fr')
    : a.titre.localeCompare(b.titre, 'fr', { sensitivity: 'base' })));
  return liste;
}
