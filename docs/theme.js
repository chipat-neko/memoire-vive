// Applique le thème mémorisé avant le premier rendu (évite le flash clair/sombre).
// Fichier séparé et non différé : la politique de sécurité interdit le script en ligne.
(function () {
  try {
    var theme = localStorage.getItem('memoire-vive:theme');
    if (theme === 'light' || theme === 'dark') {
      document.documentElement.setAttribute('data-theme', theme);
    }
  } catch (e) { /* stockage indisponible : thème du système */ }
})();
