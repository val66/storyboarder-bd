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
 * DEVINER LA CATÉGORIE d'un modèle importé à la main (demandé), d'après les mots de son nom de
 * fichier, puis, à défaut, ceux des nœuds du fichier (relevés au rendu de la vignette).
 *
 * Des mots-clés français et anglais par catégorie commune. Un mot du texte « compte » s'il est le
 * mot-clé, ou s'il COMMENCE par lui quand le mot-clé a au moins quatre lettres (« centaur1 »,
 * « dragons ») : les mots-clés courts (« car », « bug », « tv ») exigent le mot exact, sans quoi
 * « carpet » serait une voiture. La catégorie qui a le plus de mots l'emporte ; à égalité, l'ordre de
 * la table décide.
 *
 * Écartés exprès, parce qu'ils sont aussi des noms de nœuds par défaut de Blender ou des exports :
 * « plane », « camera », « armature » (« arme »), « skeleton », et « char » (début de « character »).
 *
 * Une catégorie DEVINÉE se dit comme telle dans la fiche : elle peut se tromper, et l'utilisateur
 * pourra la corriger quand les catégories personnelles existeront.
 */
const MOTS_CLES = [
  ['personnages', ['dragon', 'centaur', 'centaure', 'cerberus', 'cerbere', 'kraken', 'hulk', 'monster', 'monstre', 'creature', 'demon', 'zombie', 'robot', 'alien', 'troll', 'orc', 'goblin', 'gobelin', 'elf', 'elfe', 'knight', 'chevalier', 'warrior', 'guerrier', 'anime', 'character', 'personnage', 'hero', 'heros', 'witch', 'sorciere', 'wizard', 'ghost', 'fantome',
    // Les humains aussi (retour de Valentin : worker_j est un personnage) : dans un storyboard, une
    // figure humaine est un personnage. « Personnes » reste la catégorie que Sketchfab donne.
    'man', 'woman', 'girl', 'boy', 'homme', 'femme', 'fille', 'garcon', 'person', 'personne', 'worker', 'ouvrier', 'human', 'humain', 'people', 'child', 'enfant', 'kid', 'soldier', 'soldat', 'police', 'doctor', 'docteur']],
  ['animaux', ['dog', 'chien', 'cat', 'chat', 'bird', 'oiseau', 'bison', 'horse', 'cheval', 'gecko', 'lizard', 'lezard', 'spider', 'araignee', 'bug', 'insect', 'insecte', 'snake', 'serpent', 'fish', 'poisson', 'labrador', 'cow', 'vache', 'wolf', 'loup', 'bear', 'ours', 'rabbit', 'lapin', 'deer', 'cerf', 'lion', 'tiger', 'tigre', 'raptor', 'dinosaur', 'dinosaure', 'shark', 'requin', 'whale', 'baleine', 'monkey', 'singe', 'pig', 'cochon', 'sheep', 'mouton', 'chicken', 'poule', 'frog', 'grenouille', 'animal']],
  ['vehicules', ['car', 'porsche', 'voiture', 'truck', 'camion', 'bus', 'bike', 'velo', 'moto', 'motorcycle', 'vehicle', 'vehicule', 'airplane', 'aircraft', 'avion', 'boat', 'bateau', 'ship', 'navire', 'train', 'tank', 'helicopter', 'helicoptere', 'ferrari', 'bmw', 'audi', 'jeep', 'taxi', 'van']],
  ['armes', ['sword', 'epee', 'gun', 'pistol', 'pistolet', 'rifle', 'fusil', 'weapon', 'knife', 'couteau', 'axe', 'hache', 'bow', 'shield', 'bouclier', 'spear', 'lance', 'katana']],
  ['mobilier', ['chair', 'chaise', 'table', 'sofa', 'canape', 'bed', 'lit', 'desk', 'lamp', 'lampe', 'shelf', 'etagere', 'cabinet', 'armoire', 'couch', 'bench', 'banc', 'stool', 'tabouret', 'furniture', 'meuble', 'drawer', 'commode', 'wardrobe']],
  ['lieux', ['office', 'room', 'piece', 'street', 'rue', 'city', 'ville', 'interior', 'interieur', 'kitchen', 'cuisine', 'bathroom', 'garage', 'warehouse', 'entrepot', 'alley', 'ruelle', 'forest', 'foret', 'abandoned', 'abandonne']],
  ['architecture', ['house', 'maison', 'building', 'batiment', 'tower', 'castle', 'chateau', 'church', 'eglise', 'bridge', 'pont', 'wall', 'mur', 'door', 'porte', 'window', 'fenetre', 'stairs', 'escalier', 'roof', 'toit']],
  ['nature', ['tree', 'arbre', 'plant', 'plante', 'rock', 'rocher', 'stone', 'pierre', 'flower', 'fleur', 'grass', 'herbe', 'bush', 'buisson', 'mushroom', 'champignon', 'log', 'tronc']],
  ['nourriture', ['food', 'apple', 'pomme', 'bread', 'pain', 'cake', 'gateau', 'fruit', 'burger', 'pizza', 'bottle', 'bouteille', 'cup', 'tasse', 'mug', 'plate', 'assiette']],
  ['electronique', ['phone', 'telephone', 'computer', 'ordinateur', 'laptop', 'tv', 'television', 'screen', 'ecran', 'radio', 'speaker', 'keyboard', 'clavier']],
  ['musique', ['guitar', 'guitare', 'piano', 'drum', 'batterie', 'violin', 'violon', 'trumpet', 'trompette']],
  ['loisirs', ['toy', 'jouet', 'ball', 'ballon', 'game', 'jeu', 'skate', 'surf']],
  ['techniques', ['tool', 'outil', 'machine', 'engine', 'moteur', 'pipe', 'tuyau', 'barrel', 'tonneau', 'crate', 'caisse', 'generator', 'generateur', 'hammer', 'marteau', 'wrench']],
].map(([slug, mots]) => ({ slug, mots }));

/** Les mots d'un texte : minuscules, sans accents, coupés aux séparateurs et aux majuscules internes. */
function motsDe(texte){
  return texteComparable(String(texte || '').replace(/([a-z])([A-Z])/g, '$1 $2')).split(/[^a-z0-9]+/).filter(Boolean);
}

/** La catégorie devinée d'un ensemble de textes, ou null. */
export function devinerCategorie(textes){
  const mots = (textes || []).flatMap(motsDe);
  let meilleure = null;
  let score = 0;
  for (const c of MOTS_CLES) {
    const n = mots.filter(m => c.mots.some(k => m === k || (k.length >= 4 && m.startsWith(k)))).length;
    if (n > score) { meilleure = c.slug; score = n; }
  }
  return meilleure;
}

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
    // La catégorie CHOISIE par l'utilisateur l'emporte ; sinon celle de la source ; sinon DEVINÉE,
    // d'après le nom du fichier d'abord, puis ses nœuds.
    const choisie = choisieDe(nom);
    const devinee = choisie || (a && a.categorie) ? null : (devinerCategorie([nom.replace(/\.glb$/i, '')]) || devinerCategorie(m.noms || []));
    const tags = tagsDe(nom).filter(id => nomsTags.has(id));
    return {
      fichier: nom,
      titre: a && a.nom ? a.nom : nom.replace(/\.glb$/i, ''),
      categorie: choisie || (a && a.categorie) || devinee || NON_CLASSE,
      categorieDevinee: !!devinee,
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
