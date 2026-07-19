// Extrait de routes/sante.js (2026-07-19) pour être réutilisé aussi par
// routes/adminStatut.js - borne n'importe quelle promesse à un délai maximum
// (ex: ping BDD) au lieu de laisser une requête pendre indéfiniment, cf.
// incident du 2026-07-19 (chargement infini de /api/categories sur Hostinger).
function avecDelaiMax(promesse, delaiMs, messageTimeout) {
  return Promise.race([
    promesse,
    new Promise((_, reject) => setTimeout(() => reject(new Error(messageTimeout)), delaiMs)),
  ]);
}

module.exports = { avecDelaiMax };
