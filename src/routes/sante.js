// Diagnostic - cf. incident du 2026-07-19 (chargement infini de /api/categories
// sur Hostinger). Sépare clairement "la BDD ne répond pas" d'une autre panne,
// avec un délai borné (contrairement aux routes catalogue/commandes qui
// dépendent du connect_timeout de DATABASE_URL - ceinture + bretelles ici).
const express = require("express");
const { prisma } = require("../db");

const router = express.Router();

function avecDelaiMax(promesse, delaiMs, messageTimeout) {
  return Promise.race([
    promesse,
    new Promise((_, reject) => setTimeout(() => reject(new Error(messageTimeout)), delaiMs)),
  ]);
}

// GET /api/sante - ping BDD borné à 5s, pour diagnostiquer un problème réseau
// (ex: connexion sortante vers la BDD bloquée par l'hébergeur) sans laisser
// la requête pendre indéfiniment.
router.get("/sante", async (req, res) => {
  const debut = Date.now();
  try {
    await avecDelaiMax(prisma.$queryRaw`SELECT 1`, 5000, "timeout_bdd_apres_5s");
    res.json({ ok: true, bddJoignable: true, tempsMs: Date.now() - debut });
  } catch (exc) {
    res.status(503).json({
      ok: false,
      bddJoignable: false,
      erreur: String(exc.message || exc),
      tempsMs: Date.now() - debut,
    });
  }
});

module.exports = router;
