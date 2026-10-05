/**
 * @file src/update-texts.js
 * Les TEXTES des mises à jour (#442), communs à la modale de l'application et à l'écran bloquant
 * (blocage.html). Fonctions pures : l'état arrive du processus principal (`maj:etat`, cf. main.js,
 * etatPourAffichage), la langue avec lui, et l'on rend des chaînes.
 *
 * ⚠️ DEUX ÉCRANS BLOQUANTS DIFFÉRENTS, ET L'UTILISATEUR DOIT SAVOIR LEQUEL. « Hors ligne depuis trop
 * longtemps » n'est PAS une mise à jour obligatoire : on y parle de connexion, jamais de version.
 * Le mélanger ferait chercher une mise à jour qui n'existe peut-être pas (demandé par l'utilisateur).
 */

/** Le bail hors ligne, en jours : le même nombre que update-policy.js (testé là-bas et ici). */
export const JOURS_HORS_LIGNE = 14;

const T = {
  fr: {
    bouton: 'Mise à jour',
    boutonTitre: (v) => `La version ${v} est disponible`,
    titreDispo: (v) => `Mise à jour ${v}`,
    titreObligatoire: 'Mise à jour obligatoire',
    titreConnexion: 'Connexion requise',
    titrePremiere: 'Première vérification nécessaire',
    titreHorloge: 'Date de l\'ordinateur incorrecte',
    dispo: (v, i) => `La version ${v} de Storyboard BD est disponible. Vous utilisez la version ${i}.`,
    obligatoire: (m, i) => `La version ${m} de Storyboard BD est obligatoire : l'application ne peut pas démarrer tant qu'elle n'est pas installée. Vous utilisez la version ${i}.`,
    obligatoireHorsLigne: 'Vous êtes hors ligne : connectez-vous à Internet pour la télécharger, puis cliquez sur Réessayer.',
    obligatoireIntrouvable: 'Le fichier de mise à jour est momentanément inaccessible. Réessayez dans quelques instants.',
    expire: (j) => `Storyboard BD n'a pas pu se connecter à Internet depuis ${j} jours. Elle fonctionne hors ligne jusqu'à ${JOURS_HORS_LIGNE} jours d'affilée ; au-delà, une connexion est nécessaire pour vérifier qu'aucune mise à jour obligatoire n'attend.`,
    premiere: `Storyboard BD doit se connecter à Internet une première fois pour vérifier qu'elle est à jour. Ensuite, elle fonctionnera hors ligne jusqu'à ${JOURS_HORS_LIGNE} jours d'affilée.`,
    horloge: 'La date de cet ordinateur est antérieure à la dernière vérification des mises à jour. Corrigez la date et l\'heure de Windows, ou connectez-vous à Internet.',
    connectezVous: 'Connectez-vous à Internet, puis cliquez sur Réessayer. Vos Projets ne sont pas touchés.',
    taille: (t) => `Téléchargement : ${t}.`,
    redemarrage: 'L\'application redémarrera une fois la mise à jour installée. Vos Projets sont conservés.',
    nonEnregistre: 'Votre Projet a des modifications non enregistrées : il sera enregistré avant le redémarrage.',
    nouveautes: 'Nouveautés',
    obligatoireBadge: 'obligatoire',
    installer: 'Télécharger et installer',
    reessayer: 'Réessayer',
    annuler: 'Plus tard',
    progression: (p) => `Téléchargement… ${p} %`,
    installation: 'Installation… l\'application va redémarrer.',
    toujoursBloque: 'Toujours pas de connexion. Vérifiez votre accès à Internet.',
    erreurs: {
      reseau: 'Le téléchargement a échoué. Vérifiez votre connexion et réessayez.',
      empreinte: 'Le fichier téléchargé est endommagé. Réessayez.',
      simulation: 'Simulation : rien n\'est installé en développement.',
      enCours: 'Un téléchargement est déjà en cours.',
      aucune: 'Aucune mise à jour à installer.',
      enregistrement: 'Le Projet n\'a pas pu être enregistré : la mise à jour est annulée.',
    },
  },
  en: {
    bouton: 'Update',
    boutonTitre: (v) => `Version ${v} is available`,
    titreDispo: (v) => `Update ${v}`,
    titreObligatoire: 'Required update',
    titreConnexion: 'Connection required',
    titrePremiere: 'First check required',
    titreHorloge: 'Incorrect computer date',
    dispo: (v, i) => `Storyboard BD version ${v} is available. You are using version ${i}.`,
    obligatoire: (m, i) => `Storyboard BD version ${m} is required: the application cannot start until it is installed. You are using version ${i}.`,
    obligatoireHorsLigne: 'You are offline: connect to the Internet to download it, then click Try again.',
    obligatoireIntrouvable: 'The update file cannot be reached right now. Try again in a moment.',
    expire: (j) => `Storyboard BD has not been able to connect to the Internet for ${j} days. It works offline for up to ${JOURS_HORS_LIGNE} days in a row; beyond that, a connection is needed to check that no required update is waiting.`,
    premiere: `Storyboard BD must connect to the Internet once to check that it is up to date. After that, it will work offline for up to ${JOURS_HORS_LIGNE} days in a row.`,
    horloge: 'This computer\'s date is earlier than the last update check. Correct the Windows date and time, or connect to the Internet.',
    connectezVous: 'Connect to the Internet, then click Try again. Your Projects are not affected.',
    taille: (t) => `Download: ${t.replace(' Mo', ' MB')}.`,
    redemarrage: 'The application will restart once the update is installed. Your Projects are kept.',
    nonEnregistre: 'Your Project has unsaved changes: it will be saved before restarting.',
    nouveautes: 'What\'s new',
    obligatoireBadge: 'required',
    installer: 'Download and install',
    reessayer: 'Try again',
    annuler: 'Later',
    progression: (p) => `Downloading… ${p} %`,
    installation: 'Installing… the application will restart.',
    toujoursBloque: 'Still no connection. Check your Internet access.',
    erreurs: {
      reseau: 'The download failed. Check your connection and try again.',
      empreinte: 'The downloaded file is damaged. Try again.',
      simulation: 'Simulation: nothing is installed in development.',
      enCours: 'A download is already in progress.',
      aucune: 'No update to install.',
      enregistrement: 'The Project could not be saved: the update is cancelled.',
    },
  },
};

/** Les textes d'une langue ; le français par défaut. */
export function textesMaj(lang){
  return T[lang === 'en' ? 'en' : 'fr'];
}

/**
 * Ce que montre l'ÉCRAN BLOQUANT pour un état. Rend `{ titre, paragraphes, action, notes }`, où
 * `action` vaut 'installer' ou 'reessayer', et `notes` dit s'il faut afficher les nouveautés.
 */
export function contenuDuBlocage(etat){
  const t = textesMaj(etat.lang);
  if (etat.etat === 'obligatoire') {
    const paragraphes = [t.obligatoire(etat.versionMinimale, etat.installee)];
    const telechargeable = etat.enLigne && etat.disponible;
    if (!etat.enLigne) paragraphes.push(t.obligatoireHorsLigne);
    else if (!etat.disponible) paragraphes.push(t.obligatoireIntrouvable);
    if (etat.taille) paragraphes.push(t.taille(etat.taille));
    if (telechargeable) paragraphes.push(t.redemarrage);
    return { titre: t.titreObligatoire, paragraphes, action: telechargeable ? 'installer' : 'reessayer', notes: true };
  }
  if (etat.raison === 'expire') {
    return { titre: t.titreConnexion, paragraphes: [t.expire(etat.jours), t.connectezVous], action: 'reessayer', notes: false };
  }
  if (etat.raison === 'horloge') {
    return { titre: t.titreHorloge, paragraphes: [t.horloge, t.connectezVous], action: 'reessayer', notes: false };
  }
  return { titre: t.titrePremiere, paragraphes: [t.premiere, t.connectezVous], action: 'reessayer', notes: false };
}

/** Le pourcentage affiché, borné : un `content-length` faux ne doit pas afficher 140 %. */
export function pourcentage(recus, total){
  if (!(total > 0)) return 0;
  return Math.max(0, Math.min(100, Math.floor(100 * recus / total)));
}

function echapper(s){
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function enLigne(s){
  return echapper(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/`([^`]+)`/g, '<code>$1</code>');
}

/**
 * Les notes de CHANGELOG.md en HTML, pour l'affichage. Sous-ensemble volontairement minuscule du
 * Markdown : paragraphes, listes à tirets, gras, code et titres `###`. TOUT est échappé d'abord :
 * ce texte vient du réseau, il ne doit jamais pouvoir injecter de balise.
 */
export function notesEnHtml(md){
  const blocs = String(md || '').replace(/\r/g, '').split(/\n{2,}/).map(b => b.trim()).filter(Boolean);
  return blocs.map(b => {
    const lignes = b.split('\n');
    if (/^\s*[-*]\s+/.test(lignes[0])) {
      // Une ligne qui ne commence pas par un tiret continue l'élément précédent (CHANGELOG.md
      // coupe ses lignes à cent caractères).
      const elements = [];
      lignes.forEach(l => {
        if (/^\s*[-*]\s+/.test(l)) elements.push(l.replace(/^\s*[-*]\s+/, ''));
        else elements[elements.length - 1] += ' ' + l.trim();
      });
      return '<ul>' + elements.map(e => `<li>${enLigne(e)}</li>`).join('') + '</ul>';
    }
    const titre = b.match(/^#{1,6}\s+(.*)$/);
    if (titre && lignes.length === 1) return `<h4>${enLigne(titre[1])}</h4>`;
    return `<p>${enLigne(lignes.join(' '))}</p>`;
  }).join('');
}

/** Le bloc des nouveautés : une section par version, la plus récente en tête. */
export function nouveautesEnHtml(notes, lang){
  const t = textesMaj(lang);
  return notes.map(n => `<section class="maj-version"><h4>${echapper(n.version)}`
    + (n.obligatoire ? ` <span class="maj-badge">${t.obligatoireBadge}</span>` : '')
    + `</h4>${notesEnHtml(n.notes)}</section>`).join('');
}
