/**
 * @file app.js
 * Point d'entrée historique, conservé pour qu'index.html (`<script type="module" src="src/app.js">`)
 * n'ait pas à changer. Toute la logique applicative a été déplacée dans src/events.js. Étape B.14
 * de la refactorisation, la dernière de l'Étape B (i18n → draw → sidebar → modals → events).
 *
 * Aucun autre module n'importe depuis app.js (vérifié) : ce fichier peut donc se contenter de
 * réexécuter events.js comme point d'entrée réel de l'application.
 */
import './events.js';
