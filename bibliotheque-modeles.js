/**
 * bibliotheque-modeles.js, ce que l'utilisateur dit de SES modèles : la catégorie qu'il choisit, et
 * des TAGS libres (demandé).
 *
 * Une seule CATÉGORIE par modèle, prise dans la liste commune (store-categories.js) : elle remplace
 * celle de la source ou celle devinée d'après le nom. Les TAGS, eux, sont créés par l'utilisateur,
 * plusieurs par modèle, renommables et supprimables : c'est là que vivent les classements personnels
 * (« Médiéval », « Décor de la scène 3 »…), pas dans de nouvelles catégories.
 *
 * Gardé dans `bibliotheque-modeles.json`, À CÔTÉ du dossier Modeles (partagé par tous les Projets,
 * comme les modèles eux-mêmes). Forme :
 *   { version: 1,
 *     categories: { "chaise.glb": "mobilier" },
 *     tags: [{ id: "t1", nom: "Médiéval" }],
 *     tagsParModele: { "chaise.glb": ["t1"] } }
 *
 * Fonctions PURES : chacune rend un NOUVEL état. Le processus principal les applique (une opération
 * demandée par l'interface, ou le suivi d'un renommage et d'une suppression de modèle) puis écrit.
 */
'use strict';

const FICHIER = 'bibliotheque-modeles.json';
const LONGUEUR_MAX_TAG = 40;

const vide = () => ({ version: 1, categories: {}, tags: [], tagsParModele: {} });
const estObjet = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const nomPropre = (n) => String(n == null ? '' : n).replace(/\s+/g, ' ').trim().slice(0, LONGUEUR_MAX_TAG);
/** Deux noms de tag sont les mêmes à la casse et aux accents près. */
const cleNom = (n) => nomPropre(n).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Un état propre, quoi que contienne le fichier : ce qui est mal formé est écarté. */
function normaliser(b){
  const s = vide();
  if (!estObjet(b)) return s;
  if (estObjet(b.categories)) {
    for (const [f, c] of Object.entries(b.categories)) if (typeof c === 'string' && /^[a-z-]+$/.test(c)) s.categories[f] = c;
  }
  const vus = new Set();
  for (const t of Array.isArray(b.tags) ? b.tags : []) {
    if (!t || typeof t.id !== 'string' || !/^t\d+$/.test(t.id) || vus.has(t.id)) continue;
    const nom = nomPropre(t.nom);
    if (!nom) continue;
    vus.add(t.id);
    s.tags.push({ id: t.id, nom });
  }
  if (estObjet(b.tagsParModele)) {
    for (const [f, ids] of Object.entries(b.tagsParModele)) {
      const gardes = [...new Set((Array.isArray(ids) ? ids : []).filter(id => vus.has(id)))];
      if (gardes.length) s.tagsParModele[f] = gardes;
    }
  }
  return s;
}

/** La catégorie CHOISIE d'un modèle (null : on retombe sur la source ou la devinette). */
function choisirCategorie(b, fichier, slug){
  const s = normaliser(b);
  if (slug && /^[a-z-]+$/.test(slug)) s.categories[fichier] = slug;
  else delete s.categories[fichier];
  return s;
}

/** Le tag de ce nom, s'il existe (à la casse et aux accents près). */
function tagNomme(b, nom){
  const c = cleNom(nom);
  return normaliser(b).tags.find(t => cleNom(t.nom) === c) || null;
}

/**
 * Crée un tag. Rend `{ bibliotheque, id }`. Un nom déjà pris rend le tag EXISTANT plutôt qu'un
 * doublon : taper « médiéval » quand « Médiéval » existe veut dire celui-là. Un nom vide : `id` null.
 */
function creerTag(b, nom){
  const s = normaliser(b);
  const propre = nomPropre(nom);
  if (!propre) return { bibliotheque: s, id: null };
  const existant = tagNomme(s, propre);
  if (existant) return { bibliotheque: s, id: existant.id };
  const n = s.tags.reduce((m, t) => Math.max(m, Number(t.id.slice(1)) || 0), 0) + 1;
  const id = `t${n}`;
  s.tags.push({ id, nom: propre });
  return { bibliotheque: s, id };
}

/** Renomme un tag. Refusé (`erreur`) si le nom est vide ou porté par un AUTRE tag. */
function renommerTag(b, id, nom){
  const s = normaliser(b);
  const t = s.tags.find(x => x.id === id);
  const propre = nomPropre(nom);
  if (!t) return { bibliotheque: s, erreur: 'inconnu' };
  if (!propre) return { bibliotheque: s, erreur: 'vide' };
  const autre = tagNomme(s, propre);
  if (autre && autre.id !== id) return { bibliotheque: s, erreur: 'pris' };
  t.nom = propre;
  return { bibliotheque: s };
}

/** Supprime un tag, et le retire de tous les modèles qui le portaient. */
function supprimerTag(b, id){
  const s = normaliser(b);
  s.tags = s.tags.filter(t => t.id !== id);
  for (const f of Object.keys(s.tagsParModele)) {
    s.tagsParModele[f] = s.tagsParModele[f].filter(x => x !== id);
    if (!s.tagsParModele[f].length) delete s.tagsParModele[f];
  }
  return s;
}

/** Pose (`actif`) ou retire un tag d'un modèle. */
function tagModele(b, fichier, id, actif){
  const s = normaliser(b);
  if (!s.tags.some(t => t.id === id)) return s;
  const actuels = new Set(s.tagsParModele[fichier] || []);
  if (actif) actuels.add(id); else actuels.delete(id);
  if (actuels.size) s.tagsParModele[fichier] = [...actuels];
  else delete s.tagsParModele[fichier];
  return s;
}

/** Combien de modèles portent ce tag (dit avant de le supprimer). */
function modelesAvecTag(b, id){
  return Object.values(normaliser(b).tagsParModele).filter(ids => ids.includes(id)).length;
}

/** Un modèle renommé : sa catégorie et ses tags le suivent (à la casse près, comme sous Windows). */
function renommerModele(b, ancien, nouveau){
  const s = normaliser(b);
  const a = String(ancien).toLowerCase();
  for (const table of [s.categories, s.tagsParModele]) {
    for (const f of Object.keys(table)) {
      if (f.toLowerCase() === a) { const v = table[f]; delete table[f]; table[nouveau] = v; }
    }
  }
  return s;
}

/** Un modèle supprimé : on oublie sa catégorie et ses tags (les tags eux-mêmes restent). */
function oublierModele(b, fichier){
  const s = normaliser(b);
  const a = String(fichier).toLowerCase();
  for (const table of [s.categories, s.tagsParModele]) {
    for (const f of Object.keys(table)) if (f.toLowerCase() === a) delete table[f];
  }
  return s;
}

/**
 * Applique une OPÉRATION demandée par l'interface. Rend `{ bibliotheque, id?, erreur? }`. Une
 * opération inconnue ne change rien : l'interface ne décide pas de ce qu'elle a le droit de faire.
 */
function appliquer(b, op, args = {}){
  switch (op) {
    case 'categorie': return { bibliotheque: choisirCategorie(b, args.fichier, args.categorie) };
    case 'creerTag': return creerTag(b, args.nom);
    case 'renommerTag': return renommerTag(b, args.id, args.nom);
    case 'supprimerTag': return { bibliotheque: supprimerTag(b, args.id) };
    case 'tagModele': return { bibliotheque: tagModele(b, args.fichier, args.id, !!args.actif) };
    default: return { bibliotheque: normaliser(b), erreur: 'operation' };
  }
}

module.exports = {
  FICHIER, LONGUEUR_MAX_TAG, normaliser, appliquer,
  choisirCategorie, creerTag, renommerTag, supprimerTag, tagModele, modelesAvecTag, renommerModele, oublierModele,
};
