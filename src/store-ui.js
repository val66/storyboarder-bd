/**
 * @file src/store-ui.js
 * La fenêtre du store de ressources (#444b) : recherche, filtres, grille de vignettes, page
 * suivante, fiche d'un modèle avec son aperçu 3D, et la mention de la source.
 *
 * L'interface ne connaît que le format commun (store-sources.js) : elle ne sait pas d'où viennent
 * les résultats. Le processus principal fait les requêtes (store.js) ; ici on construit le DOM.
 * Tout texte venu du réseau (noms, auteurs) passe par textContent, jamais par innerHTML.
 *
 * Le téléchargement n'est pas encore là (#444c, #444d) : le bouton existe, désactivé, et dit
 * pourquoi.
 */
import { S } from './state.js';
import { textesStore, PLAFONDS_FACES, nombreCourt, poidsLisible, estLourd, phrasesLicence, lignesDetails } from './store-texts.js';

const SOURCE = 'sketchfab';
const $ = (id) => document.getElementById(id);
const langue = () => (S.appLang === 'en' ? 'en' : 'fr');

let infos = null;
let derniereRecherche = null;
let suivant = null;
let enCours = false;
let positionListe = 0;

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
  $('storeTexte').placeholder = t.placeholder;
  $('storeChercherBtn').textContent = t.rechercher;
  $('storeCommercialLibelle').textContent = t.commercial;
  $('storePlusBtn').textContent = t.plus;
  const garder = (id, f) => { const v = $(id).value; f(); if ([...$(id).options].some(o => o.value === v)) $(id).value = v; };
  garder('storeCategorie', () => options($('storeCategorie'), [['', t.toutesCategories], ...infos.categories.map(c => [c.slug, c[langue()]])]));
  garder('storeLicence', () => options($('storeLicence'), [['', t.toutesLicences], ...infos.licences.map(l => [l.code, l.libelle])]));
  garder('storeFaces', () => options($('storeFaces'), PLAFONDS_FACES.map(n => [n ? String(n) : '', n ? t.facesMax(nombreCourt(n, langue())) : t.facesToutes])));
  garder('storeTri', () => options($('storeTri'), infos.tris.map(c => [c, t.tris[c]])));
  $('storeCredit').replaceChildren(lien(infos.source.credit[langue()], infos.source.site));
  $('storeSimulation').hidden = !infos.simulation;
  $('storeSimulation').textContent = infos.simulation ? t.simulation : '';
}

function parametres(curseur){
  return {
    texte: $('storeTexte').value,
    categorie: $('storeCategorie').value || null,
    licence: $('storeLicence').value || null,
    commercialSeulement: $('storeCommercial').checked,
    facesMax: Number($('storeFaces').value) || null,
    tri: $('storeTri').value || undefined,
    curseur: curseur || null,
  };
}

function carte(r){
  const t = textesStore(langue());
  const img = r.vignettes.petite
    ? el('img', { attrs: { src: r.vignettes.petite, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' } })
    : el('div', { classe: 'store-sans-vignette' });
  const c = el('button', { classe: 'store-carte', attrs: { type: 'button', title: r.nom } }, [
    img,
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
  const t = textesStore(langue());
  const fiche = $('storeFiche');
  const visuel = el('div', { classe: 'store-fiche-visuel' }, [
    r.vignettes.grande ? el('img', { attrs: { src: r.vignettes.grande, alt: '', referrerpolicy: 'no-referrer' } }) : null,
  ]);
  const boutons = el('div', { classe: 'store-fiche-boutons' });
  if (r.apercu3D) {
    const voir = el('button', { texte: t.voir3D, classe: 'nav-btn', attrs: { type: 'button' } });
    // L'aperçu 3D ne se charge qu'à la demande : un lecteur WebGL par fiche ouverte pèserait lourd.
    voir.onclick = () => {
      const src = r.apercu3D + (r.apercu3D.includes('?') ? '&' : '?') + 'autostart=1&ui_infos=0&ui_watermark_link=0';
      visuel.replaceChildren(el('iframe', { attrs: { src, title: r.nom, allow: 'autoplay; fullscreen; xr-spatial-tracking', allowfullscreen: '' } }));
      voir.remove();
    };
    boutons.appendChild(voir);
  }
  boutons.appendChild(lien(t.voirSur(infos.source.nom), r.url, 'nav-btn store-lien-bouton'));
  const telecharger = el('button', { texte: t.telecharger, classe: 'full-btn', attrs: { type: 'button', disabled: '' } });
  const retour = el('button', { texte: '← ' + t.fermerFiche, classe: 'nav-btn store-retour', attrs: { type: 'button' } });
  retour.onclick = fermerFiche;
  fiche.replaceChildren(
    retour,
    visuel,
    boutons,
    el('h4', { texte: r.nom }),
    el('p', {}, [el('span', { texte: t.par + ' ' }), lien(r.auteur.nom, r.auteur.url)]),
    el('p', { classe: 'store-fiche-licence' }, [el('strong', { texte: t.licence + ' : ' }), lien(r.licence.libelle, r.licence.url)]),
    el('ul', {}, phrasesLicence(r.licence, langue()).map(p => el('li', { texte: p }))),
    el('ul', { classe: 'store-fiche-details' }, lignesDetails(r, langue()).map(p => el('li', { texte: p }))),
    estLourd(r) ? el('p', { texte: t.lourd, classe: 'store-avertissement' }) : null,
    telecharger,
    el('p', { texte: t.bientot, classe: 'store-note' }),
  );
  // La fiche REMPLACE la liste (demandé) ; on garde la position dans la liste pour le retour.
  positionListe = $('storeDefilement').scrollTop;
  $('storeGrille').hidden = true;
  $('storePlusBtn').hidden = true;
  fiche.hidden = false;
  $('storeDefilement').scrollTop = 0;
}

function fermerFiche(){
  const ouverte = !$('storeFiche').hidden;
  $('storeFiche').hidden = true;
  $('storeFiche').replaceChildren();   // arrête un aperçu 3D en cours
  $('storeGrille').hidden = false;
  $('storePlusBtn').hidden = !suivant;
  if (ouverte) $('storeDefilement').scrollTop = positionListe;   // on retrouve la liste où on l'avait laissée
}

async function chercher(suite = false){
  if (enCours) return;
  const t = textesStore(langue());
  enCours = true;
  if (!suite) { fermerFiche(); $('storeGrille').replaceChildren(); suivant = null; derniereRecherche = parametres(); }
  message(t.chargement);
  $('storePlusBtn').hidden = true;
  const page = await window.storyboarderAPI.storeChercher(SOURCE, suite ? { ...derniereRecherche, curseur: suivant } : derniereRecherche);
  enCours = false;
  if (!page || page.erreur) { message(t.erreurs[page && page.erreur] || t.erreurs.reponse, true); return; }
  page.resultats.forEach(r => $('storeGrille').appendChild(carte(r)));
  suivant = page.suivant;
  $('storePlusBtn').hidden = !suivant;
  message($('storeGrille').children.length ? '' : t.aucun);
}

export async function ouvrirStore(){
  const pont = window.storyboarderAPI;
  if (!pont || !pont.storeChercher) return;
  if (!infos) {
    infos = await pont.storeInfos(SOURCE);
    rafraichirTextesStore();
  }
  $('storeModal').classList.remove('hidden');
  $('storeTexte').focus();
  // Une première page dès l'ouverture : une fenêtre vide n'apprend rien sur ce qu'on peut y trouver.
  if (!$('storeGrille').children.length) chercher();
}

export function fermerStore(){
  fermerFiche();
  $('storeModal').classList.add('hidden');
}

/** Le câblage, une fois. */
export function cablerStore(){
  const storeModal = document.getElementById('storeModal');
  if (!storeModal) return;
  $('storeOuvrirBtn').onclick = ouvrirStore;
  $('storeFormulaire').addEventListener('submit', (e) => { e.preventDefault(); chercher(); });
  for (const id of ['storeCategorie', 'storeLicence', 'storeFaces', 'storeTri', 'storeCommercial']) {
    $(id).addEventListener('change', () => chercher());
  }
  $('storePlusBtn').onclick = () => chercher(true);
  storeModal.addEventListener('mousedown', (e) => { if (e.target === storeModal) fermerStore(); });
  rafraichirTextesStore();
}
