// Back-Office - statut système (bot Conqueror + BDD), cf. demande Beer
// (2026-07-19) : écran de monitoring dans app-admin, base de la surveillance
// prévue à la Roadmap Phase 5 ("statut des bornes et du bot"). Pas de suivi
// par borne individuelle pour l'instant (aucun mécanisme d'enregistrement
// côté app-borne, contrairement au bot qui s'enregistre déjà via
// botRelay/bot_register) - uniquement bot + BDD ici.
const express = require("express");
const { prisma, driverBdd } = require("../db");
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

      // Diagnostic complémentaire (2026-07-21) : le passage au driver Neon
      // HTTP (cf. src/db.js) n'a pas résolu le timeout - même symptôme
      // (~5000ms) qu'avec le driver TCP direct. Deux hypothèses restent
      // possibles : (a) Hostinger bloque TOUT sortant, pas seulement le port
      // 5432 - un problème d'hébergement, rien à voir avec Neon ; (b) Neon
      // bloque spécifiquement cet hôte (ex: IP Allow list activée), auquel
      // cas un appel HTTPS quelconque vers un autre service externe
      // passerait sans problème. Ce check isole les deux : un fetch HTTPS
      // vers un service tiers n'ayant aucun lien avec Neon/la BDD.
      const debutReseau = Date.now();
      let reseauSortant;
      try {
        await avecDelaiMax(
          fetch("https://api.github.com/zen", { signal: AbortSignal.timeout(4000) }),
          4000,
          "timeout_reseau_apres_4s"
        );
        reseauSortant = { joignable: true, tempsMs: Date.now() - debutReseau };
      } catch (exc) {
        reseauSortant = { joignable: false, tempsMs: Date.now() - debutReseau, erreur: String(exc.message || exc) };
      }

      const dernierHeartbeat = botRelay.dernierHeartbeat();
      res.json({
        bot: {
          connecte: botRelay.estConnecte(),
          dernierHeartbeat: dernierHeartbeat ? new Date(dernierHeartbeat).toISOString() : null,
        },
        bdd: { ...bdd, driver: driverBdd },
        // reseauSortant.joignable === false -> Hostinger bloque le sortant en
        // général (à traiter côté hébergement, cf. commentaire ci-dessus) ;
        // reseauSortant.joignable === true alors que bdd.joignable === false
        // -> le blocage est spécifique à Neon (côté Neon à vérifier : IP
        // Allow, projet suspendu...).
        reseauSortant,
        serveurHeureISO: new Date().toISOString(),
      });
    })
  );

  return router;
};
