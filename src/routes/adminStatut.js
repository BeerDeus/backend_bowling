// Back-Office - statut système (bot Conqueror + BDD), cf. demande Beer
// (2026-07-19) : écran de monitoring dans app-admin, base de la surveillance
// prévue à la Roadmap Phase 5 ("statut des bornes et du bot"). Pas de suivi
// par borne individuelle pour l'instant (aucun mécanisme d'enregistrement
// côté app-borne, contrairement au bot qui s'enregistre déjà via
// botRelay/bot_register) - uniquement bot + BDD ici.
const express = require("express");
const { prisma, driverBdd, hostBdd } = require("../db");
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

      // Diagnostic complémentaire #2 (2026-07-21, suite) : reseauSortant OK
      // mais bdd toujours en timeout -> le blocage est bien spécifique à
      // Neon, mot de passe pas en cause (pas régénéré depuis que ça
      // fonctionnait en local, cf. échange avec Beer). Reste à savoir si
      // Hostinger n'arrive même pas à JOINDRE l'hôte Neon (DNS/réseau vers ce
      // domaine précis) ou s'il le joint mais que Neon ne répond pas à la
      // requête authentifiée (IP Allow, endpoint suspendu...). Un fetch brut
      // (sans auth, sans Prisma) vers le même host que DATABASE_URL isole ça :
      // n'importe quelle réponse HTTP (même 404/401) = l'hôte est joignable,
      // le souci est donc côté Neon (auth/IP Allow/état du projet) plutôt que
      // réseau.
      const debutHostNeon = Date.now();
      let hoteNeon = null;
      if (hostBdd) {
        try {
          await avecDelaiMax(
            fetch(`https://${hostBdd}`, { signal: AbortSignal.timeout(4000) }),
            4000,
            "timeout_hote_neon_apres_4s"
          );
          hoteNeon = { host: hostBdd, joignable: true, tempsMs: Date.now() - debutHostNeon };
        } catch (exc) {
          hoteNeon = {
            host: hostBdd,
            joignable: false,
            tempsMs: Date.now() - debutHostNeon,
            erreur: String(exc.message || exc),
          };
        }
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
        // hoteNeon.joignable === false -> Hostinger ne joint même pas l'hôte
        // Neon (DNS ou filtrage ciblé sur ce domaine) ; === true -> l'hôte
        // répond, donc le blocage est côté Neon (auth/IP Allow/projet), pas
        // réseau.
        hoteNeon,
        serveurHeureISO: new Date().toISOString(),
      });
    })
  );

  return router;
};
