/**
 * @file export-credits.js
 * #444f : les crédits des modèles 3D dans les exports. Fonctions PURES.
 *
 * Les licences des modèles téléchargés depuis le store (CC BY et ses variantes, et les conditions
 * de Sketchfab) demandent que l'attribution SUIVE le modèle jusque dans ce que l'utilisateur
 * distribue. Ce que l'application distribue, c'est une Planche exportée, en PNG ou en PDF, une page
 * à la fois. Les crédits sont donc écrits DANS l'image, sous la Planche : ils voyagent avec le
 * fichier, ce qu'un `.txt` posé à côté ne garantit pas (il se perd au premier envoi).
 *
 * Tous les modèles venus d'une source sont crédités, CC0 compris : rien ne l'interdit, c'est
 * courtois, et une règle sans exception ne se trompe pas de licence. Un modèle importé à la main
 * n'a pas d'attribution connue, il n'apparaît pas.
 *
 * Le contenu d'une Scène est COPIÉ dans la Case qui la reçoit (cf. scenes.js) : les objets de la
 * Page suffisent, il n'y a pas de Scène à suivre.
 */

import { isImportedModel } from './model-store.js';

/** Les noms d'affichage des sources ; à défaut, l'identifiant. */
const NOMS_SOURCES = { sketchfab: 'Sketchfab', polyhaven: 'Poly Haven' };

/**
 * Les fichiers de modèles importés posés sur une Page ET VISIBLES, sans doublon (casse comprise),
 * triés.
 *
 * VISIBLES (retour de Valentin) : une Case qui a reçu une grande Scène n'en montre souvent qu'une
 * fraction, et créditer ce qui reste hors du cadre ou caché n'a pas de sens. `visible(o)` est fourni par
 * l'appelant, qui a la caméra de la Case (draw.js, `elementNonVisible3D`, #449) ; ici on reste pur. Par
 * défaut, tout compte.
 */
export function modelesDeLaPage(page, visible = () => true){
  const vus = new Map();
  ((page && page.objects) || []).forEach(o => {
    if (!isImportedModel(o) || !o.modelFile || !visible(o)) return;
    const cle = String(o.modelFile).toLowerCase();
    if (!vus.has(cle)) vus.set(cle, String(o.modelFile));
  });
  return [...vus.values()].sort((a, b) => a.localeCompare(b, 'fr'));
}

/**
 * Les attributions des modèles d'une Page, une par modèle, triées par titre. Le rapprochement se
 * fait sans la casse : Windows ne la distingue pas, un fichier renommé en changeant une majuscule
 * reste le même.
 */
export function creditsDeLaPage(page, attributions, visible){
  const parFichier = new Map();
  (attributions || []).forEach(a => {
    if (a && typeof a.fichier === 'string') parFichier.set(a.fichier.toLowerCase(), a);
  });
  return modelesDeLaPage(page, visible)
    .map(f => parFichier.get(f.toLowerCase()))
    .filter(Boolean)
    .sort((a, b) => String(a.nom || '').localeCompare(String(b.nom || ''), 'fr'));
}

/** Le titre de la section des crédits. */
export function titreCredits(lang){
  return lang === 'en' ? '3D model credits' : 'Crédits des modèles 3D';
}

/**
 * Un crédit en lignes : d'abord titre, auteur, licence et source ; puis l'adresse du modèle et celle
 * de la licence, chacune sur sa ligne (CC BY demande un lien vers la licence, pas seulement son nom).
 */
export function lignesCredit(a, lang){
  const en = lang === 'en';
  const titre = en ? `"${a.nom || a.fichier}"` : `« ${a.nom || a.fichier} »`;
  const auteur = a.auteur && a.auteur.nom ? a.auteur.nom : (en ? 'unknown author' : 'auteur inconnu');
  const licence = a.licence && a.licence.libelle ? a.licence.libelle : (en ? 'licence unknown' : 'licence inconnue');
  const source = NOMS_SOURCES[a.source] || a.source || '';
  const tete = `${titre}, ${en ? 'by' : 'par'} ${auteur}, ${licence}${source ? `, via ${source}` : ''}`;
  return [tete, a.url, a.licence && a.licence.url].filter(Boolean);
}

/**
 * Replie une ligne à une largeur donnée. `mesurer(texte)` rend une largeur (measureText). Un mot
 * plus large que la ligne entière, une adresse le plus souvent, est coupé entre ses caractères :
 * sinon il déborderait de l'image et l'adresse serait illisible.
 */
export function replierLigne(mesurer, texte, largeur){
  const lignes = [];
  let ligne = '';
  const couperMot = (mot) => {
    let morceau = '';
    for (const c of mot) {
      if (morceau && mesurer(morceau + c) > largeur) { lignes.push(morceau); morceau = c; } else morceau += c;
    }
    return morceau;
  };
  for (const mot of String(texte).split(' ')) {
    const essai = ligne ? ligne + ' ' + mot : mot;
    if (mesurer(essai) <= largeur) { ligne = essai; continue; }
    if (ligne) lignes.push(ligne);
    ligne = mesurer(mot) > largeur ? couperMot(mot) : mot;
  }
  if (ligne) lignes.push(ligne);
  return lignes;
}
