/**
 * @file src/store-ui.js
 * La fenêtre du store de ressources (#444b) : recherche, filtres, grille de vignettes, page
 * suivante, fiche d'un modèle avec son aperçu 3D, et la mention de la source.
 *
 * L'interface ne connaît que le format commun (store-sources.js) : elle ne sait pas d'où viennent
 * les résultats. Le processus principal fait les requêtes (store.js) ; ici on construit le DOM.
 * Tout texte venu du réseau (noms, auteurs) passe par textContent, jamais par innerHTML.
 *
 * Le téléchargement (#445) : Poly Haven, sans compte. Sketchfab attend la connexion (#444c) : son
 * bouton reste désactivé, et la fiche dit pourquoi. Un modèle téléchargé est rangé par le chemin de
 * l'import (model-store.js, rangerModele), puis son attribution est notée.
 *
 * Un modèle DÉJÀ TÉLÉCHARGÉ (et encore présent) porte un badge sur sa carte, et sa fiche désactive
 * « Télécharger » en donnant le nom du fichier : pas de doublon par inadvertance. La liste vient du
 * fichier des attributions (store.js, telecharges), relue à chaque ouverture du store.
 */
import { S } from './state.js';
import { rangerModele, remplacerModele, readModel } from './model-store.js';
import { entreesLocales, filtrerEntrees, NON_CLASSE, USAGES, TRIS_LOCAUX } from './local-library.js';
import { preparerVignettes, vignetteLocale, metasLocales } from './model-thumbnails.js';
import { usageLabel } from './model-usages.js';
import { groupeReplie, memoriserGroupe } from './section-memory.js';
import { ouvrirApercu3D } from './store-apercu-3d.js';
import { textesStore, PLAFONDS_FACES, nombreCourt, poidsLisible, estLourd, phrasesLicence, lignesDetails } from './store-texts.js';

/**
 * Les onglets, dans l'ordre (demandé : un onglet par source). « local » est la bibliothèque « Mes
 * modèles », le contenu du dossier Modeles, en premier : c'est par elle qu'on entre. Les catégories
 * sont communes à tous (store-categories.js).
 */
export const SOURCES_STORE = ['local', 'sketchfab', 'polyhaven'];
const LOCAL = 'local';
let source = LOCAL;
/** Ce que chaque source a dit d'elle-même (store:infos), lu une fois par source. */
const infosPar = {};
const $ = (id) => document.getElementById(id);
const langue = () => (S.appLang === 'en' ? 'en' : 'fr');

let infos = null;   // celles de la source affichée
let derniereRecherche = null;
let suivant = null;
let enCours = false;
let positionListe = 0;
/** Les modèles déjà téléchargés : `source:id` → { fichier, resolution }. */
let possedes = new Map();
/** Les résultats affichés, pour refaire les cartes sans nouvelle requête. */
let affiches = [];
/** La pause de saisie avant de lancer la recherche. */
export const PAUSE_SAISIE_MS = 450;

function el(tag, { texte, classe, attrs } = {}, enfants = []){
  const e = document.createElement(tag);
  if (texte != null) e.textContent = texte;
  if (classe) e.className = classe;
  if (attrs) for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  enfants.forEach(c => c && e.appendChild(c));
  return e;
}

/** Un lien qui s'ouvre dans le navigateur (main.js, setWindowOpenHandler). */
function lien(texte, url, classe){
  return url ? el('a', { texte, classe, attrs: { href: url, target: '_blank', rel: 'noopener' } }) : el('span', { texte, classe });
}

function message(texte, erreur = false){
  const m = $('storeMessage');
  m.textContent = texte || '';
  m.classList.toggle('erreur', erreur);
}

function options(select, liste){
  select.replaceChildren(...liste.map(([valeur, texte]) => el('option', { texte, attrs: { value: valeur } })));
}

/** Les libellés et les listes, dans la langue courante. */
export function rafraichirTextesStore(){
  const t = textesStore(langue());
  const btn = $('storeOuvrirBtn');
  if (btn) btn.textContent = '🔎 ' + t.ouvrir;
  if (!infos) return;
  $('storeTitre').textContent = t.titre;
  rendreOnglets();
  const local = source === LOCAL;
  $('storeTexte').placeholder = local ? t.placeholderLocal : t.placeholder;
  $('storeCommercialLibelle').textContent = t.commercial;
  $('storePlusBtn').textContent = t.plus;
  const garder = (id, f) => { const v = $(id).value; f(); if ([...$(id).options].some(o => o.value === v)) $(id).value = v; };
  garder('storeCategorie', () => options($('storeCategorie'), [['', t.toutesCategories], ...infos.categories.map(c => [c.slug, c[langue()]]),
    ...(local ? [[NON_CLASSE, t.nonClasse]] : [])]));
  garder('storeUsage', () => options($('storeUsage'), USAGES.map(u => [u, t.usages[u]])));
  // Ce qui n'a de sens que d'un côté : l'usage pour ses modèles, la taille pour une source en ligne
  // (un modèle local n'a pas son nombre de faces sans être décodé).
  $('storeUsage').hidden = !local;
  $('storeFaces').hidden = local;
  garder('storeLicence', () => options($('storeLicence'), [['', t.toutesLicences], ...infos.licences.map(l => [l.code, l.libelle])]));
  garder('storeFaces', () => options($('storeFaces'), PLAFONDS_FACES.map(n => [n ? String(n) : '', n ? t.facesMax(nombreCourt(n, langue())) : t.facesToutes])));
  garder('storeTri', () => options($('storeTri'), infos.tris.map(c => [c, t.tris[c]])));
  // Une seule licence (Poly Haven : tout en CC0) : ni filtre de licence, ni case « usage
  // commercial ». Un choix qui ne change rien n'a pas sa place dans la barre.
  $('storeLicence').hidden = infos.licences.length <= 1;
  $('storeCommercialCase').hidden = infos.licences.every(l => l.commercial);
  $('storeCredit').replaceChildren(...(infos.source.credit ? [lien(infos.source.credit[langue()], infos.source.site)] : []));
  $('storeSimulation').hidden = !infos.simulation;
  $('storeSimulation').textContent = infos.simulation ? t.simulation : '';
}

/** Les onglets des sources. Celui de la source affichée est marqué, les autres la changent. */
function rendreOnglets(){
  const zone = $('storeOnglets');
  if (!zone) return;
  zone.replaceChildren(...SOURCES_STORE.map(id => {
    const nom = id === LOCAL ? textesStore(langue()).mesModeles : ((infosPar[id] && infosPar[id].source.nom) || id);
    const b = el('button', { texte: nom, classe: 'store-onglet' + (id === source ? ' actif' : ''),
      attrs: { type: 'button', role: 'tab', 'aria-selected': String(id === source) } });
    b.onclick = () => choisirSource(id);
    return b;
  }));
}

/**
 * Passer à une autre source. Le texte, le tri, la taille maximale ET LA CATÉGORIE sont gardés : les
 * catégories sont communes à toutes les sources (store-categories.js). La licence repart de
 * « toutes », car chaque source a les siennes.
 */
export async function choisirSource(id){
  if (!SOURCES_STORE.includes(id) || id === source) return;
  const pont = window.storyboarderAPI;
  if (!infosPar[id]) infosPar[id] = id === LOCAL ? infosLocales() : await pont.storeInfos(id);
  source = id;
  infos = infosPar[id];
  $('storeLicence').value = '';
  rafraichirTextesStore();
  await chercher();
}

function parametres(curseur){
  return {
    texte: $('storeTexte').value,
    categorie: $('storeCategorie').value || null,
    licence: $('storeLicence').value || null,
    commercialSeulement: $('storeCommercial').checked,
    facesMax: Number($('storeFaces').value) || null,
    usage: $('storeUsage').value || 'tous',
    tri: $('storeTri').value || undefined,
    curseur: curseur || null,
  };
}

/** Le fichier local d'un résultat déjà téléchargé, ou null. */
export function fichierPossede(r){
  const e = possedes.get(`${r.source}:${r.id}`);
  return e ? e.fichier : null;
}

/** Recharge la liste des modèles déjà téléchargés. Exportée pour les tests. */
export async function rafraichirPossedes(){
  const pont = window.storyboarderAPI;
  const liste = pont && pont.storeTelecharges ? await pont.storeTelecharges() : [];
  possedes = new Map((Array.isArray(liste) ? liste : []).map(e => [`${e.source}:${e.id}`, { fichier: e.fichier, resolution: e.resolution || null }]));
}

/**
 * La pastille « déjà téléchargé » : une coche dans un rond, en haut à droite de la vignette (demandé :
 * une icône plutôt qu'un libellé ; la fiche dit le reste). Construite en SVG par le DOM, pas en
 * innerHTML. Le libellé reste en infobulle et pour les lecteurs d'écran.
 */
function pastillePossede(t, fichier){
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('aria-hidden', 'true');
  const trait = document.createElementNS(NS, 'path');
  trait.setAttribute('d', 'M3.5 8.5l3 3 6-7');
  trait.setAttribute('fill', 'none');
  trait.setAttribute('stroke', 'currentColor');
  trait.setAttribute('stroke-width', '2.2');
  trait.setAttribute('stroke-linecap', 'round');
  trait.setAttribute('stroke-linejoin', 'round');
  svg.appendChild(trait);
  return el('span', { classe: 'store-possede', attrs: { title: `${t.possede} : ${fichier}`, role: 'img', 'aria-label': t.possede } }, [svg]);
}

function carte(r){
  if (r.local) return carteLocale(r);
  const t = textesStore(langue());
  const fichier = fichierPossede(r);
  const img = r.vignettes.petite
    ? el('img', { attrs: { src: r.vignettes.petite, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' } })
    : el('div', { classe: 'store-sans-vignette' });
  // Une vignette qui ne charge pas montrait l'icône d'image cassée du navigateur : on la remplace
  // par le fond neutre des modèles sans vignette.
  if (r.vignettes.petite) img.addEventListener('error', () => img.replaceWith(el('div', { classe: 'store-sans-vignette' })), { once: true });
  const c = el('button', { classe: 'store-carte' + (fichier ? ' store-carte-possedee' : ''), attrs: { type: 'button', title: r.nom } }, [
    img,
    fichier ? pastillePossede(t, fichier) : null,
    el('span', { texte: r.nom, classe: 'store-carte-nom' }),
    el('span', { texte: `${t.par} ${r.auteur.nom}`, classe: 'store-carte-auteur' }),
    el('span', { classe: 'store-carte-infos' }, [
      el('span', { texte: r.licence.libelle, classe: 'store-badge' + (r.licence.commercial ? '' : ' store-badge-nc'), attrs: { title: r.licence.libelle } }),
      r.poids ? el('span', { texte: poidsLisible(r.poids, langue()) }) : null,
    ]),
  ]);
  c.onclick = () => ouvrirFiche(r);
  return c;
}

function ouvrirFiche(r){
  if (r.local) { ficheLocale(r); ficheCourante = r; return; }
  const t = textesStore(langue());
  const fiche = $('storeFiche');
  const image = () => (r.vignettes.grande ? [el('img', { attrs: { src: r.vignettes.grande, alt: '', referrerpolicy: 'no-referrer' } })] : []);
  const visuel = el('div', { classe: 'store-fiche-visuel' }, image());
  const boutons = el('div', { classe: 'store-fiche-boutons' });
  if (r.apercu3D) {
    // Un BASCULEMENT image / 3D, et non un aller simple : on revient à l'image d'un clic (demandé).
    // L'aperçu 3D ne se charge qu'à la demande : un lecteur WebGL par fiche ouverte pèserait lourd,
    // et revenir à l'image le décharge.
    const bascule = el('button', { texte: t.voir3D, classe: 'nav-btn', attrs: { type: 'button' } });
    let en3D = false;
    bascule.onclick = () => {
      en3D = !en3D;
      if (en3D) {
        const src = r.apercu3D + (r.apercu3D.includes('?') ? '&' : '?') + 'autostart=1&ui_infos=0&ui_watermark_link=0';
        visuel.replaceChildren(el('iframe', { attrs: { src, title: r.nom, allow: 'autoplay; fullscreen; xr-spatial-tracking', allowfullscreen: '' } }));
      } else {
        visuel.replaceChildren(...image());
      }
      bascule.textContent = en3D ? t.voirImage : t.voir3D;
    };
    boutons.appendChild(bascule);
  } else if (apercuLocalPossible(r)) {
    // Pas de visionneuse chez la source (Poly Haven) : la nôtre, sur le modèle chargé en mémoire.
    boutons.appendChild(boutonApercuLocal(r, visuel, image));
  }
  boutons.appendChild(lien(t.voirSur(infos.source.nom), r.url, 'nav-btn store-lien-bouton'));

  const retour = el('button', { texte: t.fermerFiche, classe: 'nav-btn', attrs: { type: 'button' } });
  retour.onclick = fermerFiche;
  const fichier = fichierPossede(r);
  const telecharger = el('button', { texte: fichier ? '✓ ' + t.possede : t.telecharger, classe: 'full-btn', attrs: { type: 'button' } });
  const note = el('p', { texte: fichier ? t.possedeFiche(fichier) : t.noteTelechargement(r.source), classe: 'store-note' });
  // BOUTON SCINDÉ (demandé) : « Télécharger (2,9 Mo · 1k) » à gauche, et à droite une flèche qui
  // ouvre le choix de la qualité des textures. La flèche reste cachée tant que la source n'en propose
  // pas plusieurs.
  const fleche = el('button', { texte: '▾', classe: 'full-btn store-bouton-fleche', attrs: { type: 'button', 'aria-label': t.texturesLibelle, 'aria-haspopup': 'menu' } });
  fleche.hidden = true;
  const menu = el('div', { classe: 'store-menu-resolutions', attrs: { role: 'menu' } });
  menu.hidden = true;
  const scinde = el('div', { classe: 'store-bouton-scinde' }, [telecharger, fleche, menu]);
  brancherTelechargement(r, { bouton: telecharger, note, fleche, menu, choisie: null });
  const section = (titre, lignes, avant = []) => el('section', { classe: 'store-fiche-section' }, [
    el('h5', { texte: titre }), ...avant, el('ul', {}, lignes.map(p => el('li', { texte: p }))),
  ]);
  const details = lignesDetails(r, langue());
  // DEUX COLONNES (demandé) : l'aperçu et ses boutons à gauche, la description à droite. Pleine
  // largeur, l'aperçu poussait les boutons du bas hors de la fenêtre.
  const droite = [
    el('h4', { texte: r.nom }),
    el('p', {}, [el('span', { texte: t.par + ' ' }), lien(r.auteur.nom, r.auteur.url)]),
    section(t.licence, phrasesLicence(r.licence, langue()), [el('p', {}, [lien(r.licence.libelle, r.licence.url)])]),
    details.length ? section(t.caracteristiques, details) : null,
    estLourd(r) ? el('p', { texte: t.lourd, classe: 'store-avertissement' }) : null,
  ];
  // ⚠️ replaceChildren(null) écrit « null » : un enfant conditionnel absent doit être RETIRÉ.
  fiche.replaceChildren(
    el('div', { classe: 'store-fiche-corps' }, [
      el('div', { classe: 'store-fiche-gauche' }, [visuel, boutons]),
      el('div', { classe: 'store-fiche-droite' }, droite.filter(Boolean)),
    ]),
    // Retour et Télécharger TOUJOURS visibles (demandé) : un pied collé au bas de la zone qui défile.
    el('div', { classe: 'store-fiche-pied' }, [
      el('div', { classe: 'store-fiche-actions' }, [retour, scinde]),
      note,
    ]),
  );
  // La fiche REMPLACE la liste (demandé) ; on garde la position dans la liste pour le retour.
  positionListe = $('storeDefilement').scrollTop;
  $('storeGrille').hidden = true;
  $('storePlusBtn').hidden = true;
  // Ni recherche ni filtres sur une fiche (demandé) : ils ne s'appliquent pas à un seul modèle.
  $('storeFormulaire').hidden = true;
  message('');
  fiche.hidden = false;
  $('storeDefilement').scrollTop = 0;
  ficheCourante = r;
}

/**
 * Le bouton « Télécharger » d'une fiche (#445), et le choix de la résolution des textures.
 *
 *   - indisponible : source qui demande une connexion qu'on n'a pas encore (Sketchfab) ;
 *   - déjà là, dans la résolution choisie : « ✓ Déjà téléchargé », désactivé ;
 *   - déjà là, dans une AUTRE résolution : « Remplacer par 2k (2,8 Mo) ». Le fichier garde son nom,
 *     et toutes les Cases qui l'utilisent suivent ;
 *   - absent : « Télécharger (0,8 Mo) » ;
 *   - en cours : « Téléchargement… 45 % ».
 *
 * La résolution choisie est retenue d'une fiche à l'autre (localStorage), 1k par défaut. Le
 * téléchargement continue si l'on ferme la fiche ou le store. Un seul à la fois.
 */
let enTelechargement = null;   // { cle, bouton, note } du téléchargement en cours
const cleDe = (r) => `${r.source}:${r.id}`;
const RESOLUTION_DEFAUT = '1k';
const CLE_RESOLUTION = 'store:resolution';
function resolutionPreferee(){
  try { return globalThis.localStorage.getItem(CLE_RESOLUTION) || RESOLUTION_DEFAUT; } catch (e) { return RESOLUTION_DEFAUT; }
}
function memoriserResolution(res){
  try { globalThis.localStorage.setItem(CLE_RESOLUTION, res); } catch (e) { /* une préférence perdue, rien de plus */ }
}

/**
 * Ce que dit le bouton, d'après l'état : fonction PURE de ses entrées, exportée pour les tests.
 * `possede` : { fichier, resolution } ou null ; `options` : [{ resolution, octets }] ; `choisie` :
 * la résolution sélectionnée. Rend `{ texte, actif, note, remplace }`.
 */
export function etatBoutonTelechargement({ source, possible, possede, options, choisie, lang = 'fr' }){
  const t = textesStore(lang);
  const opt = (options || []).find(o => o.resolution === choisie);
  const poids = opt ? poidsLisible(opt.octets, lang) : null;
  if (!possible) {
    return { texte: possede ? '✓ ' + t.possede : t.telecharger, actif: false,
      note: possede ? t.possedeFiche(possede.fichier) : t.noteTelechargement(source), remplace: false };
  }
  // Un modèle téléchargé avant le choix de résolution l'a été en 1k.
  if (possede && (possede.resolution || RESOLUTION_DEFAUT) === choisie) {
    return { texte: `✓ ${t.possede} · ${choisie}`, actif: false, note: t.possedeFiche(possede.fichier), remplace: false };
  }
  if (possede) {
    return { texte: t.remplacer(choisie, poids || '…'), actif: true,
      note: t.remplacerNote(possede.fichier, possede.resolution || RESOLUTION_DEFAUT), remplace: true };
  }
  return { texte: poids ? t.telechargerPoids(poids, choisie) : t.telecharger, actif: true, note: t.noteTelechargement(source), remplace: false };
}

function brancherTelechargement(r, ui){
  const t = textesStore(langue());
  const pont = window.storyboarderAPI;
  const possible = !!(infos && infos.source.connexion && infos.source.connexion.telechargement === false
    && pont && pont.storeTelecharger);
  let options = [];
  ui.choisie = resolutionPreferee();
  const enCoursIci = () => !!(enTelechargement && enTelechargement.cle === cleDe(r));
  const appliquer = () => {
    if (enCoursIci()) {
      // On rouvre la fiche d'un modèle en cours de téléchargement : elle reprend la progression.
      enTelechargement.bouton = ui.bouton;
      enTelechargement.note = ui.note;
      ui.bouton.disabled = true;
      ui.fleche.disabled = true;
      return;
    }
    const e = etatBoutonTelechargement({
      source: r.source, possible, possede: possedes.get(cleDe(r)) || null, options, choisie: ui.choisie, lang: langue(),
    });
    ui.bouton.textContent = e.texte;
    ui.bouton.disabled = !e.actif || !!enTelechargement;
    ui.fleche.disabled = !!enTelechargement;
    ui.note.textContent = e.note;
    ui.note.classList.remove('erreur');
  };
  /** Le menu des qualités : une ligne par résolution, la choisie cochée, celle déjà là signalée. */
  const remplirMenu = () => {
    const p = possedes.get(cleDe(r));
    const deja = p ? (p.resolution || RESOLUTION_DEFAUT) : null;
    ui.menu.replaceChildren(...options.map(o => {
      const ligne = el('button', {
        texte: (o.resolution === ui.choisie ? '✓ ' : '') + t.optionResolution(o.resolution, poidsLisible(o.octets, langue()))
          + (o.resolution === deja ? ` · ${t.possede.toLowerCase()}` : ''),
        classe: 'store-menu-resolution' + (o.resolution === ui.choisie ? ' actif' : ''),
        attrs: { type: 'button', role: 'menuitemradio', 'aria-checked': String(o.resolution === ui.choisie) },
      });
      ligne.onclick = () => { ui.choisie = o.resolution; memoriserResolution(o.resolution); fermerMenu(); appliquer(); };
      return ligne;
    }));
  };
  // Le menu se ferme au choix, par Échap, ou d'un clic ailleurs : jamais laissé ouvert derrière soi.
  const ailleurs = (e) => { if (!ui.menu.contains(e.target) && e.target !== ui.fleche) fermerMenu(); };
  const echap = (e) => { if (e.key === 'Escape') { e.stopPropagation(); fermerMenu(); } };
  function fermerMenu(){
    ui.menu.hidden = true;
    ui.fleche.setAttribute('aria-expanded', 'false');
    document.removeEventListener('mousedown', ailleurs, true);
    document.removeEventListener('keydown', echap, true);
  }
  ui.fleche.onclick = () => {
    if (!ui.menu.hidden) { fermerMenu(); return; }
    remplirMenu();
    ui.menu.hidden = false;
    ui.fleche.setAttribute('aria-expanded', 'true');
    document.addEventListener('mousedown', ailleurs, true);
    document.addEventListener('keydown', echap, true);
  };
  appliquer();
  if (enCoursIci()) ui.bouton.textContent = t.telechargement(0);
  if (!possible) return;
  ui.bouton.onclick = () => telechargerModele(r, ui, ui.choisie);
  if (!pont.storePoids) return;
  pont.storePoids(r.source, r.id).then(p => {
    if (!p || !Array.isArray(p.options) || !p.options.length) return;
    options = p.options;
    if (!options.some(o => o.resolution === ui.choisie)) ui.choisie = options[0].resolution;
    ui.fleche.hidden = options.length < 2;
    if (ui.fleche.parentElement) ui.fleche.parentElement.classList.toggle('avec-fleche', options.length >= 2);
    appliquer();
  }).catch(() => {});
}

/**
 * Télécharge dans la résolution demandée, puis RANGE (nouveau modèle, par le chemin de l'import) ou
 * REMPLACE (même modèle, autre résolution : même nom de fichier), et note l'attribution.
 * Exportée pour les tests.
 */
export async function telechargerModele(r, ui, resolution = RESOLUTION_DEFAUT){
  if (enTelechargement) return { ok: false };
  const t = textesStore(langue());
  const pont = window.storyboarderAPI;
  const deja = possedes.get(cleDe(r)) || null;
  enTelechargement = { cle: cleDe(r), bouton: ui.bouton, note: ui.note };
  const dire = (texteBouton, texteNote, erreur = false) => {
    const e = enTelechargement || ui;
    if (texteBouton != null && e.bouton) e.bouton.textContent = texteBouton;
    if (texteNote != null && e.note) { e.note.textContent = texteNote; e.note.classList.toggle('erreur', erreur); }
  };
  ui.bouton.disabled = true;
  if (ui.fleche) ui.fleche.disabled = true;
  dire(t.telechargement(0), '');
  let issue;
  try {
    const rep = await pont.storeTelecharger(r.source, r.id, resolution);
    if (!rep || rep.erreur || !rep.data) {
      issue = { ok: false, erreur: (rep && rep.erreur) || 'reponse' };
    } else {
      dire(t.rangement, null);
      const range = deja ? await remplacerModele(deja.fichier, rep.data) : await rangerModele(r.nom + '.glb', rep.data);
      issue = range.ok ? { ok: true, fichier: range.name, remplace: !!deja, resolution: rep.resolution || resolution } : { ok: false, erreur: 'ecriture' };
    }
  } catch (e) {
    issue = { ok: false, erreur: 'reseau' };
  }
  const courant = enTelechargement;
  enTelechargement = null;
  if (ui.fleche) ui.fleche.disabled = false;
  if (issue.ok) {
    if (pont.storeAttribuer) await pont.storeAttribuer(r, issue.fichier, issue.resolution);
    await rafraichirPossedes();
    if (courant && courant.bouton) { courant.bouton.textContent = '✓ ' + t.possede; courant.bouton.disabled = true; }
    if (courant && courant.note) { courant.note.textContent = t.telechargeOk(issue.fichier); courant.note.classList.remove('erreur'); }
    // La coche sur la carte, et la section Modèles du menu de gauche (et les Cases, si remplacé).
    $('storeGrille').replaceChildren(...affiches.map(carte));
    if (_rappels.apresTelechargement) _rappels.apresTelechargement(issue.fichier, issue.remplace);
  } else {
    if (courant && courant.bouton) { courant.bouton.textContent = t.telecharger; courant.bouton.disabled = false; }
    if (courant && courant.note) { courant.note.textContent = t.erreurs[issue.erreur] || t.erreurs.reponse; courant.note.classList.add('erreur'); }
  }
  return issue;
}

/** La progression envoyée par le processus principal (store:progression). */
function progression(recus, total){
  if (!enTelechargement || !enTelechargement.bouton || !(total > 0)) return;
  enTelechargement.bouton.textContent = textesStore(langue()).telechargement(Math.floor((recus / total) * 100));
}

// ─────────────────────────────────────────────────────────────────────────────
// L'aperçu 3D local (#445) : pour une source sans visionneuse intégrable (Poly Haven)
// ─────────────────────────────────────────────────────────────────────────────
//
// Le .glb arrive EN MÉMOIRE (store:apercu) et n'est jamais rangé. Le processus principal le garde le
// temps de la session (store.js, `recents`) : rouvrir la fiche, changer d'onglet ou fermer le store
// ne le perd pas, et « Télécharger » en 1k juste après le reprend sans réseau. Côté fenêtre, la
// visionneuse est libérée dès qu'on revient à l'image ou qu'on quitte la fiche.

let apercuCourant = null;    // { fermer } de la visionneuse ouverte
let apercuGeneration = 0;    // chaque ouverture ou fermeture l'incrémente : une réponse en retard s'ignore
let apercuAttendu = null;    // { cle, etiquette } de l'aperçu en cours de chargement

function apercuLocalPossible(r){
  const pont = window.storyboarderAPI;
  return !r.apercu3D && !!(infos && infos.source.connexion && infos.source.connexion.telechargement === false)
    && !!(pont && pont.storeApercu);
}

function fermerApercuLocal(){
  apercuGeneration++;
  apercuAttendu = null;
  if (apercuCourant) { apercuCourant.fermer(); apercuCourant = null; }
}

function boutonApercuLocal(r, visuel, image, charger = () => window.storyboarderAPI.storeApercu(r.source, r.id)){
  const t = textesStore(langue());
  const b = el('button', { texte: t.voir3D, classe: 'nav-btn', attrs: { type: 'button' } });
  let en3D = false;
  b.onclick = async () => {
    en3D = !en3D;
    b.textContent = en3D ? t.voirImage : t.voir3D;
    fermerApercuLocal();
    if (!en3D) { visuel.replaceChildren(...image()); return; }
    const moi = apercuGeneration;
    const etiquette = el('p', { texte: t.chargementApercu(0), classe: 'store-apercu-chargement' });
    visuel.replaceChildren(etiquette);
    apercuAttendu = { cle: cleDe(r), etiquette };
    const dire = (texte) => { etiquette.textContent = texte; etiquette.classList.add('erreur'); visuel.replaceChildren(etiquette); };
    let rep;
    try { rep = await charger(); } catch (e) { rep = { erreur: 'reseau' }; }
    if (moi !== apercuGeneration) return;   // revenu à l'image, ou fiche fermée, entre-temps
    apercuAttendu = null;
    if (!rep || rep.erreur || !rep.data) { dire(t.erreurs[rep && rep.erreur] || t.erreurs.reponse); return; }
    visuel.replaceChildren();
    let v = null;
    try { v = await ouvrirApercu3D(visuel, rep.data); } catch (e) { dire(t.apercuIllisible); return; }
    if (moi !== apercuGeneration) { v.fermer(); return; }   // fermé pendant le décodage
    apercuCourant = v;
  };
  return b;
}

/** La progression de l'aperçu en cours de chargement (store:apercuProgression). */
function progressionApercu(source, id, recus, total){
  if (!apercuAttendu || apercuAttendu.cle !== `${source}:${id}` || !(total > 0)) return;
  apercuAttendu.etiquette.textContent = textesStore(langue()).chargementApercu(Math.floor((recus / total) * 100));
}

function fermerFiche(){
  ficheCourante = null;
  fermerApercuLocal();
  const ouverte = !$('storeFiche').hidden;
  $('storeFiche').hidden = true;
  $('storeFiche').replaceChildren();   // arrête un aperçu 3D en cours
  $('storeGrille').hidden = false;
  $('storePlusBtn').hidden = !suivant;
  $('storeFormulaire').hidden = false;
  if (ouverte) $('storeDefilement').scrollTop = positionListe;   // on retrouve la liste où on l'avait laissée
}

/**
 * Une recherche, ou la page suivante (`suite`).
 *
 * ⚠️ UNE NOUVELLE RECHERCHE PASSE TOUJOURS, même si une autre est en cours : changer d'onglet ou de
 * filtre pendant un chargement doit montrer le NOUVEAU choix. La réponse de l'ancienne est alors
 * ignorée à son arrivée (`generation`), sans quoi les modèles d'une source s'afficheraient sous
 * l'onglet de l'autre. Seul « Charger plus » attend : deux suites ensemble doubleraient la page.
 */
let generation = 0;
async function chercher(suite = false){
  if (suite && enCours) return;
  const t = textesStore(langue());
  const moi = ++generation;
  enCours = true;
  if (!suite) { fermerFiche(); $('storeGrille').replaceChildren(); affiches = []; suivant = null; derniereRecherche = parametres(); memoriserEtat(); }
  if (source === LOCAL) { await chercherLocal(moi); return; }
  message(t.chargement);
  $('storePlusBtn').hidden = true;
  const page = await window.storyboarderAPI.storeChercher(source, suite ? { ...derniereRecherche, curseur: suivant } : derniereRecherche);
  if (moi !== generation) return;   // une recherche plus récente a pris la main
  enCours = false;
  if (!page || page.erreur) { message(t.erreurs[page && page.erreur] || t.erreurs.reponse, true); return; }
  page.resultats.forEach(r => { affiches.push(r); $('storeGrille').appendChild(carte(r)); });
  suivant = page.suivant;
  $('storePlusBtn').hidden = !suivant;
  message($('storeGrille').children.length ? '' : t.aucun);
}

// ─────────────────────────────────────────────────────────────────────────────
// L'onglet « Mes modèles » : la bibliothèque locale (le dossier Modeles)
// ─────────────────────────────────────────────────────────────────────────────
//
// Même fenêtre, même grille, même fiche que le store : on passe de ses modèles à ceux d'une source
// sans changer d'outil. Ce qui DÉCIDE (entrées, filtres, tri) est dans local-library.js ; les
// vignettes dans model-thumbnails.js. Les actions (renommer, supprimer, squelette, aller à un
// endroit) sont celles du reste de l'application, injectées par events.js (`_rappels`).

/** Ce que l'onglet local dit de lui-même, comme store:infos pour une source. */
function infosLocales(){
  const enLigne = SOURCES_STORE.map(id => infosPar[id]).find(i => i && i.categories);
  return {
    source: { id: LOCAL, nom: textesStore(langue()).mesModeles, site: null, credit: null, connexion: {} },
    categories: enLigne ? enLigne.categories : [],
    licences: [],
    tris: TRIS_LOCAUX,
  };
}

let entreesAffichees = [];
/** Les cartes par fichier, pour poser une vignette dès qu'elle est prête. */
const cartesLocales = new Map();

async function chercherLocal(moi){
  const t = textesStore(langue());
  const pont = window.storyboarderAPI || {};
  const [fichiers, attributions] = await Promise.all([
    pont.modelesInfos ? pont.modelesInfos() : [],
    pont.storeTelecharges ? pont.storeTelecharges() : [],
  ]);
  if (moi !== generation) return;
  enCours = false;
  const afficher = () => {
    const toutes = entreesLocales({ fichiers, attributions, projet: { tomes: S.tomes, scenes: S.scenes }, metas: metasLocales() });
    const p = derniereRecherche || {};
    entreesAffichees = filtrerEntrees(toutes, { texte: p.texte, categorie: p.categorie, usage: p.usage, tri: TRIS_LOCAUX.includes(p.tri) ? p.tri : 'nom' });
    cartesLocales.clear();
    affiches = entreesAffichees.map(e => ({ ...e, local: true }));
    $('storeGrille').replaceChildren(...affiches.map(carte));
    $('storePlusBtn').hidden = true;
    message(toutes.length ? (affiches.length ? '' : t.aucunLocal) : t.videLocal);
  };
  afficher();
  // Les vignettes manquantes se rendent en arrière-plan ; chaque carte se met à jour à son tour.
  // Le rendu MESURE aussi chaque modèle (dimensions, noms des nœuds, d'où une catégorie mieux
  // devinée) : la grille est refaite une fois à la fin, si l'on est toujours sur la liste.
  preparerVignettes((fait, total, nom) => {
    if (source !== LOCAL) return;
    if (nom && cartesLocales.has(nom)) poserVignette(cartesLocales.get(nom), nom);
    if (total) message(fait < total ? t.preparationVignettes(fait, total) : (affiches.length ? '' : t.aucunLocal));
  }).then(() => {
    if (source !== LOCAL || moi !== generation || !$('storeFiche').hidden) return;
    afficher();
  });
}

function poserVignette(carteEl, nom){
  const url = vignetteLocale(nom);
  const cadre = carteEl && carteEl.children && carteEl.children[0];
  if (!url || !cadre) return;
  if (cadre.tagName === 'IMG') { if (cadre.getAttribute('src') !== url) cadre.setAttribute('src', url); return; }
  carteEl.replaceChild(el('img', { attrs: { src: url, alt: '' } }), cadre);
}

/** Recharge l'onglet local s'il est affiché (après un renommage, une suppression, un import). */
export function rafraichirBibliothequeLocale(){
  if (source !== LOCAL || $('storeModal').classList.contains('hidden')) return;
  chercher();
}

function nomCategorie(slug){
  const t = textesStore(langue());
  if (slug === NON_CLASSE) return t.nonClasse;
  const c = (infos && infos.categories || []).find(x => x.slug === slug);
  return c ? c[langue()] : slug;
}

function carteLocale(e){
  const t = textesStore(langue());
  const url = vignetteLocale(e.fichier);
  const c = el('button', { classe: 'store-carte store-carte-locale' + (e.introuvable ? ' store-carte-introuvable' : ''), attrs: { type: 'button', title: e.fichier } }, [
    url ? el('img', { attrs: { src: url, alt: '' } }) : el('div', { classe: 'store-sans-vignette' }),
    el('span', { texte: e.titre, classe: 'store-carte-nom' }),
    el('span', { texte: e.introuvable ? '⚠ ' + t.introuvableFiche.split(' :')[0] : t.resumeUsages(e.scenes.length, e.cases.length), classe: 'store-carte-auteur' }),
    el('span', { classe: 'store-carte-infos' }, [
      el('span', { texte: nomCategorie(e.categorie), classe: 'store-badge' + (e.categorie === NON_CLASSE ? ' store-badge-nc' : '') }),
      e.taille ? el('span', { texte: poidsLisible(e.taille, langue()) }) : null,
    ]),
  ]);
  c.onclick = () => ouvrirFiche(e);
  // Le clic droit garde le menu du reste de l'application (demandé).
  c.addEventListener('contextmenu', (ev) => {
    ev.preventDefault();
    if (_rappels.menuModele) _rappels.menuModele(ev, e.fichier);
  });
  cartesLocales.set(e.fichier, c);
  return c;
}

function ficheLocale(e){
  const t = textesStore(langue());
  const fiche = $('storeFiche');
  const a = e.attribution;
  const image = () => {
    const url = vignetteLocale(e.fichier);
    return url ? [el('img', { attrs: { src: url, alt: '' } })] : [];
  };
  const visuel = el('div', { classe: 'store-fiche-visuel' }, image());
  const boutons = el('div', { classe: 'store-fiche-boutons' });
  let bascule3D = null;
  if (!e.introuvable) {
    bascule3D = boutonApercuLocal({ source: LOCAL, id: e.fichier }, visuel, image, async () => {
      const data = await readModel(e.fichier);
      return data ? { data } : { erreur: 'reponse' };
    });
    boutons.appendChild(bascule3D);
  }
  const nomSource = a && (infosPar[a.source] ? infosPar[a.source].source.nom : a.source);
  if (a && a.url) boutons.appendChild(lien(t.voirSur(nomSource), a.url, 'nav-btn store-lien-bouton'));

  const section = (titre, enfants) => el('section', { classe: 'store-fiche-section' }, [el('h5', { texte: titre }), ...enfants]);
  const liste = (lignes) => el('ul', {}, lignes.filter(Boolean).map(p => el('li', { texte: p })));
  // OÙ IL SERT : un bouton par endroit, comme dans l'ancienne liste du menu de gauche. Y aller ferme
  // la fenêtre.
  const endroit = (g) => {
    const n = g.elements.length;
    const b = el('button', { texte: usageLabel(g, (en, fr) => (langue() === 'en' ? en : fr)) + (n > 1 ? ` ×${n}` : ''), classe: 'image-row-where', attrs: { type: 'button' } });
    b.onclick = () => { fermerStore(); if (_rappels.ouvrirEndroitModele) _rappels.ouvrirEndroitModele(e.fichier, g); };
    return b;
  };
  // Deux sous-sections REPLIABLES (demandé), Scènes et Cases, avec leur nombre ; l'état est retenu
  // comme les groupes du menu de gauche (clé `fiche-modele:…`). Le tout défile dans sa propre zone
  // quand la liste est longue (demandé), plutôt que d'allonger la fiche entière.
  const sousSection = (id, titre, endroits) => {
    if (!endroits.length) return null;
    const cle = 'fiche-modele:' + id;
    const replie = groupeReplie(globalThis.localStorage, cle);
    const fleche = el('span', { texte: replie ? '▸' : '▾', classe: 'model-group-caret' });
    const tete = el('button', { classe: 'store-fiche-sous-titre', attrs: { type: 'button', 'aria-expanded': String(!replie) } },
      [fleche, el('span', { texte: titre, classe: 'model-group-nom' }), el('span', { texte: String(endroits.length), classe: 'model-group-nombre' })]);
    const contenu = el('div', { classe: 'store-usages-liste' }, endroits.map(endroit));
    contenu.hidden = replie;
    tete.onclick = () => {
      const r = !groupeReplie(globalThis.localStorage, cle);
      memoriserGroupe(globalThis.localStorage, cle, r);
      contenu.hidden = r;
      fleche.textContent = r ? '▸' : '▾';
      tete.setAttribute('aria-expanded', String(!r));
    };
    return el('div', { classe: 'store-usages-groupe' }, [tete, contenu]);
  };
  const usages = (e.scenes.length || e.cases.length)
    ? [el('div', { classe: 'store-usages' }, [
      sousSection('scenes', t.scenesLibelle, e.scenes),
      sousSection('cases', t.casesLibelle, e.cases),
    ].filter(Boolean))]
    : [el('p', { texte: t.nullePart, classe: 'store-fiche-texte' })];

  const droite = [
    el('h4', { texte: e.titre }),
    a ? el('p', {}, [el('span', { texte: t.par + ' ' }), lien(a.auteur && a.auteur.nom, a.auteur && a.auteur.url)]) : el('p', { texte: t.importeLocal }),
    e.introuvable ? el('p', { texte: t.introuvableFiche, classe: 'store-avertissement' }) : null,
    section(t.utilisation, usages),
    a && a.licence ? section(t.licence, [el('p', {}, [lien(a.licence.libelle, a.licence.url)]),
      liste([a.licence.attribution ? t.attributionRequise : t.attributionLibre])]) : null,
    section(t.caracteristiques, [liste([
      t.ligneFichier(e.fichier),
      t.ligneCategorie(nomCategorie(e.categorie) + (e.categorieDevinee ? ` ${t.devinee}` : '')),
      e.dimensions ? t.dimensions(e.dimensions) : null,
      e.taille ? t.ligneTaille(poidsLisible(e.taille, langue())) : null,
      a && a.resolution ? t.ligneResolution(a.resolution) : null,
      a ? t.depuisSource(nomSource) : null,
    ])]),
  ];
  const retour = el('button', { texte: t.fermerFiche, classe: 'nav-btn', attrs: { type: 'button' } });
  retour.onclick = fermerFiche;
  // Les actions du menu contextuel, en boutons (demandé). Elles ouvrent les mêmes fenêtres que le clic
  // droit ; la bibliothèque se recharge ensuite (rafraichirBibliothequeLocale).
  const action = (texte, rappel, classe = 'nav-btn') => {
    const b = el('button', { texte, classe, attrs: { type: 'button' } });
    b.onclick = () => { if (_rappels[rappel]) _rappels[rappel](e.fichier); };
    return b;
  };
  const actions = e.introuvable
    ? [retour]
    // Couleurs demandées : Renommer en jaune, Supprimer en rouge, texte blanc sur les deux.
    // « Squelette » seulement pour un modèle qui en a un (ou dont on ne sait pas encore).
    : [retour, e.os === 0 ? null : action(t.squelette, 'squeletteModele'), action(t.renommer, 'renommerModele', 'full-btn edit-btn store-action-blanc'),
      action(t.supprimer, 'supprimerModele', 'full-btn delete-btn store-action-blanc')];
  fiche.replaceChildren(
    el('div', { classe: 'store-fiche-corps' }, [
      el('div', { classe: 'store-fiche-gauche' }, [visuel, boutons]),
      el('div', { classe: 'store-fiche-droite' }, droite.filter(Boolean)),
    ]),
    el('div', { classe: 'store-fiche-pied' }, [el('div', { classe: 'store-fiche-actions store-fiche-actions-locales' }, actions.filter(Boolean))]),
  );
  positionListe = $('storeDefilement').scrollTop;
  $('storeGrille').hidden = true;
  $('storePlusBtn').hidden = true;
  $('storeFormulaire').hidden = true;
  message('');
  fiche.hidden = false;
  $('storeDefilement').scrollTop = 0;
  // ⚠️ LA FICHE LOCALE S'OUVRE EN 3D (signalé : sa vignette, au format des cartes, flottait petite dans
  // le grand cadre de la fiche, alors que l'aperçu 3D, cadré sur le cadre lui-même, était juste). Le
  // fichier est sur le disque : rien à télécharger. « Voir l'image » ramène la vignette.
  if (bascule3D) bascule3D.onclick();
}

// ─────────────────────────────────────────────────────────────────────────────
// La fenêtre RETIENT où l'on en était (demandé)
// ─────────────────────────────────────────────────────────────────────────────
//
// Pendant la session : l'onglet, les filtres, la position dans la liste, et la fiche ouverte, qui se
// rouvre telle quelle (reconstruite, pour qu'un aperçu 3D ne tourne pas fenêtre fermée). D'une
// session à l'autre : l'onglet et les filtres (localStorage), pas la fiche.

let ficheCourante = null;      // le résultat dont la fiche est ouverte
let aRouvrir = null;           // { fiche, position } à la fermeture
const CLE_ETAT = 'store:etat';
const CHAMPS_ETAT = { texte: 'storeTexte', categorie: 'storeCategorie', licence: 'storeLicence', faces: 'storeFaces', tri: 'storeTri', usage: 'storeUsage' };

function memoriserEtat(){
  const etat = { source, commercial: !!$('storeCommercial').checked };
  for (const [cle, id] of Object.entries(CHAMPS_ETAT)) etat[cle] = $(id).value || '';
  try { globalThis.localStorage.setItem(CLE_ETAT, JSON.stringify(etat)); } catch (e) { /* une préférence perdue, rien de plus */ }
}
function etatMemorise(){
  try { return JSON.parse(globalThis.localStorage.getItem(CLE_ETAT) || 'null'); } catch (e) { return null; }
}
/** Remet les filtres retenus, une fois les listes construites (une valeur inconnue est ignorée). */
function restaurerFiltres(etat){
  if (!etat) return;
  for (const [cle, id] of Object.entries(CHAMPS_ETAT)) {
    const v = etat[cle];
    if (typeof v !== 'string') continue;
    const champ = $(id);
    if (champ.tagName === 'SELECT' && ![...(champ.options || [])].some(o => o.value === v)) continue;
    champ.value = v;
  }
  $('storeCommercial').checked = !!etat.commercial;
}

/** Ouvre la fenêtre si elle est fermée, la ferme sinon (raccourci B). */
export function basculerStore(){
  if ($('storeModal').classList.contains('hidden')) ouvrirStore();
  else fermerStore();
}

export async function ouvrirStore({ onglet } = {}){
  const pont = window.storyboarderAPI;
  if (!pont || !pont.storeChercher) return;
  let restaure = null;
  if (!infos) {
    // Première ouverture de la session : on reprend l'onglet et les filtres de la dernière fois.
    restaure = etatMemorise();
    if (restaure && SOURCES_STORE.includes(restaure.source)) source = restaure.source;
  }
  if (onglet && SOURCES_STORE.includes(onglet) && onglet !== source) {
    source = onglet;
    infos = infosPar[onglet] || null;   // relu plus bas s'il n'a jamais été lu
    if (infos) rafraichirTextesStore();
  }
  if (!infos) {
    // Les sources en ligne d'abord : la bibliothèque locale reprend leurs catégories communes.
    await Promise.all(SOURCES_STORE.filter(id => id !== LOCAL && !infosPar[id]).map(async id => { infosPar[id] = await pont.storeInfos(id); }));
    infosPar[LOCAL] = infosLocales();
    infos = infosPar[source];
    rafraichirTextesStore();
    restaurerFiltres(restaure);
  }
  // Relu à chaque ouverture : un modèle a pu être téléchargé, supprimé ou renommé entre-temps. Les
  // cartes déjà affichées sont refaites, sans nouvelle requête, pour que leur badge suive.
  await rafraichirPossedes();
  $('storeModal').classList.remove('hidden');
  const reprise = aRouvrir;
  aRouvrir = null;
  // Une première page dès l'ouverture : une fenêtre vide n'apprend rien sur ce qu'on peut y trouver.
  // La bibliothèque locale est TOUJOURS relue : un modèle a pu être placé, renommé ou importé.
  if (source === LOCAL || !$('storeGrille').children.length) await chercher();
  else $('storeGrille').replaceChildren(...affiches.map(carte));
  if (reprise && reprise.fiche) {
    // La fiche qu'on avait laissée, à jour (ses usages ont pu changer), puis la liste à sa place.
    const r = reprise.fiche.local ? (affiches.find(a => a.fichier === reprise.fiche.fichier) || null) : reprise.fiche;
    if (r) { ouvrirFiche(r); positionListe = reprise.position; return; }
  }
  if (reprise) $('storeDefilement').scrollTop = reprise.position;
  $('storeTexte').focus();
}

export function fermerStore(){
  memoriserEtat();
  const ouverte = !$('storeFiche').hidden && ficheCourante;
  aRouvrir = { fiche: ouverte ? ficheCourante : null, position: ouverte ? positionListe : $('storeDefilement').scrollTop };
  fermerFiche();
  $('storeModal').classList.add('hidden');
}

/** Ce que le reste de l'application veut savoir (injecté par events.js, cf. architecture). */
let _rappels = {};

/** Le câblage, une fois. `rappels.apresTelechargement(fichier)` : un modèle vient d'être rangé. */
export function cablerStore(rappels = {}){
  _rappels = rappels || {};
  const storeModal = document.getElementById('storeModal');
  if (!storeModal) return;
  const pont = window.storyboarderAPI;
  if (pont && pont.onStoreProgression) pont.onStoreProgression(progression);
  if (pont && pont.onStoreApercuProgression) pont.onStoreApercuProgression(progressionApercu);
  // Le bouton rouvre la fenêtre LÀ OÙ ON L'AVAIT LAISSÉE (demandé) : onglet, filtres, fiche.
  $('storeOuvrirBtn').onclick = () => ouvrirStore();
  // Pas de bouton « Rechercher » (demandé) : la saisie relance la recherche après une courte pause,
  // pour ne pas lancer une requête par lettre tapée ; Entrée la lance tout de suite.
  let minuterie = null;
  $('storeTexte').addEventListener('input', () => {
    clearTimeout(minuterie);
    minuterie = setTimeout(() => chercher(), PAUSE_SAISIE_MS);
  });
  $('storeFormulaire').addEventListener('submit', (e) => { e.preventDefault(); clearTimeout(minuterie); chercher(); });
  for (const id of ['storeCategorie', 'storeLicence', 'storeFaces', 'storeTri', 'storeCommercial', 'storeUsage']) {
    $(id).addEventListener('change', () => chercher());
  }
  $('storePlusBtn').onclick = () => chercher(true);
  storeModal.addEventListener('mousedown', (e) => { if (e.target === storeModal) fermerStore(); });
  rafraichirTextesStore();
}
