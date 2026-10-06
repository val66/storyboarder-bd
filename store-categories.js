/**
 * store-categories.js, les CATÉGORIES COMMUNES de la bibliothèque (demandé : homogénéiser celles de
 * Sketchfab et Poly Haven, pour qu'un même filtre serve partout, y compris aux modèles locaux).
 *
 * Chaque catégorie commune correspond à UNE catégorie Sketchfab (son API n'en accepte qu'une par
 * recherche) et à zéro, une ou plusieurs de Poly Haven (filtrées chez nous, cf. pageLocale). Ainsi
 * aucune catégorie ne fait doublon, et aucune ne renvoie vide sur une source par construction :
 * celles qu'une source n'a pas (Poly Haven n'a pas d'animaux) y renvoient simplement zéro modèle.
 *
 * Écartée : « News & Politics » de Sketchfab, sans équivalent ni sens pour un décor de BD. Ses modèles
 * restent trouvables par mots-clés.
 *
 * Racine et CommonJS, comme les autres modules du store : utilisé par le processus principal (les
 * sources) ET par l'interface (le filtre local), via store:infos.
 */
'use strict';

const CATEGORIES = [
  // slug commun, FR, EN, Sketchfab, [Poly Haven]
  ['animaux', 'Animaux', 'Animals', 'animals-pets', []],
  ['architecture', 'Architecture & bâtiments', 'Architecture & buildings', 'architecture', ['architecture']],
  ['art-decoration', 'Art & décoration', 'Art & decor', 'art-abstract', ['decor-art']],
  ['vehicules', 'Véhicules & transport', 'Vehicles & transport', 'cars-vehicles', ['vehicles-transport']],
  ['personnages', 'Personnages & créatures', 'Characters & creatures', 'characters-creatures', []],
  ['personnes', 'Personnes', 'People', 'people', []],
  ['patrimoine', 'Patrimoine & histoire', 'Heritage & history', 'cultural-heritage-history', []],
  ['electronique', 'Électronique & appareils', 'Electronics & appliances', 'electronics-gadgets', ['electronics-appliances']],
  ['mode', 'Mode & objets personnels', 'Fashion & personal items', 'fashion-style', ['apparel-personal-items']],
  ['nourriture', 'Nourriture & cuisine', 'Food & kitchen', 'food-drink', ['food-kitchen']],
  ['mobilier', 'Mobilier & maison', 'Furniture & home', 'furniture-home', ['furniture', 'containers-storage', 'lighting', 'office-stationery']],
  ['musique', 'Musique', 'Music', 'music', []],
  ['nature', 'Nature & plantes', 'Nature & plants', 'nature-plants', ['nature']],
  ['lieux', 'Lieux & décors', 'Places & sets', 'places-travel', []],
  ['techniques', 'Industrie, outils & techniques', 'Industry, tools & technology', 'science-technology', ['industrial-infrastructure', 'tools-equipment']],
  ['loisirs', 'Sport & loisirs', 'Sports & leisure', 'sports-fitness', ['leisure']],
  ['armes', 'Armes & militaire', 'Weapons & military', 'weapons-military', ['weapons']],
].map(([slug, fr, en, sketchfab, polyhaven]) => ({ slug, fr, en, sketchfab, polyhaven }));

const parSlug = new Map(CATEGORIES.map(c => [c.slug, c]));

/** La catégorie commune, ou null. */
function categorie(slug){
  return parSlug.get(slug) || null;
}

/** La catégorie Sketchfab d'une catégorie commune (une seule), ou null. */
function versSketchfab(slug){
  const c = parSlug.get(slug);
  return c ? c.sketchfab : null;
}

/** Les catégories Poly Haven d'une catégorie commune (zéro, une ou plusieurs). */
function versPolyhaven(slug){
  const c = parSlug.get(slug);
  return c ? c.polyhaven.slice() : [];
}

/** La catégorie commune d'une catégorie Sketchfab, ou null (News & Politics). */
function depuisSketchfab(nom){
  const c = CATEGORIES.find(x => x.sketchfab === nom);
  return c ? c.slug : null;
}

/** La catégorie commune d'une catégorie Poly Haven de premier niveau, ou null. */
function depuisPolyhaven(nom){
  const c = CATEGORIES.find(x => x.polyhaven.includes(nom));
  return c ? c.slug : null;
}

/** Ce que l'interface affiche dans le filtre : `[{ slug, fr, en }]`, dans l'ordre. */
function pourInterface(){
  return CATEGORIES.map(({ slug, fr, en }) => ({ slug, fr, en }));
}

module.exports = { CATEGORIES, categorie, versSketchfab, versPolyhaven, depuisSketchfab, depuisPolyhaven, pourInterface };
