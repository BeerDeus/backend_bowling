// Back-Office - statut système (bot Conqueror + BDD), cf. demande Beer
// (2026-07-19) : écran de monitoring dans app-admin, base de la surveillance
// prévue à la Roadmap Phase 5 ("statut des bornes et du bot"). Pas de suivi
// par borne individuelle pour l'instant (aucun mécanisme d'enregistrement
// côté app-borne, contrairement au bot qui s'enregistre déjà via
// botRelay/bot_register) - uniquement bot + BDD ici.
const express = require("express");
const { prisma } = require("../db");
const { asyncHandler } = require("../asyncHandler");
const { avecDelaiMax } = require("../avecDelaiMax");

module.exports = function adminStatutRouter(botRelay) {
  const router = express.Router();

  router.get(
    "/admin/statut",
    asyncHandler(async (req, res) => {
      const debut = Date.now();
      let bdd;
      try {
        await avecDelaiMax(prisma.$queryRaw`SELECT 1`, 5000, "timeout_bdd_apres_5s");
        bdd = { joignable: true, tempsMs: Date.now() - debut };
      } catch (exc) {
        bdd = { joignable: false, tempsMs: Date.now() - debut, erreur: String(exc.message || exc) };
      }

      const dernierHeartbeat = botRelay.dernierHeartbeat();
      res.json({
        bot: {
          connecte: botRelay.estConnecte(),
          dernierHeartbeat: dernierHeartbeat ? new Date(dernierHeartbeat).toISOString() : null,
        },
        bdd,
        serveurHeureISO: new Date().toISOString(),
      });
    })
  );

  return router;
};
