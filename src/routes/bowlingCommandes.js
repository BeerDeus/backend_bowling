// Commandes Bowling (cf. Roadmap Phase 4 / demande Beer 2026-07-19) : wizard
// borne -> nb joueurs -> nb parties -> prénoms+bumpers -> récap (code
// avantage + CGV) -> paiement -> exécution bot Conqueror -> récap final.
//
// Paiement SIMULÉ pour l'instant (Phase 3 - TPE/Cashdro - pas encore faite,
// pas de matériel/accès dispo) : toujours un succès, cf. demande explicite.
// Le code avantage (QR/Pass CE) est stocké tel quel, SANS validation -
// l'anti-fraude (unicité, verrou anti-scan-simultané) reste à faire en
// Phase 4 (cf. CDC section 3) une fois le module Pass CE développé.
const express = require("express");
const { prisma } = require("../db");
const { asyncHandler } = require("../asyncHandler");
const { genererNumero } = require("../numeroCommande");

const INCLUDE = { joueurs: true };

module.exports = function bowlingCommandesRouter(botRelay) {
  const router = express.Router();

  router.post(
    "/commandes-bowling",
    asyncHandler(async (req, res) => {
      const { nbParties, joueurs, codeAvantage, cgvAcceptees } = req.body || {};

      const nbPartiesValide = Number(nbParties);
      if (!Number.isInteger(nbPartiesValide) || nbPartiesValide < 1) {
        return res.status(400).json({ erreur: "nb_parties_invalide" });
      }
      if (!Array.isArray(joueurs) || joueurs.length === 0) {
        return res.status(400).json({ erreur: "aucun_joueur" });
      }
      for (const j of joueurs) {
        if (!j || typeof j.prenom !== "string" || !j.prenom.trim()) {
          return res.status(400).json({ erreur: "prenom_manquant" });
        }
      }
      if (!cgvAcceptees) {
        return res.status(400).json({ erreur: "cgv_non_acceptees" });
      }

      const numero = await genererNumero("BOWLING");

      let commande = await prisma.commande.create({
        data: {
          numero,
          module: "BOWLING",
          totalCentimes: 0,
          codeAvantageSaisi: codeAvantage ? String(codeAvantage).trim() || null : null,
          cgvAccepteesLe: new Date(),
          joueurs: {
            create: joueurs.map((j) => ({
              prenom: j.prenom.trim(),
              bumpers: !!j.bumpers,
              parties: nbPartiesValide,
            })),
          },
        },
        include: INCLUDE,
      });

      // Paiement simulé (cf. en-tête du fichier) : toujours un succès pour
      // l'instant. transactionTpeId "SIMULE-..." bien distinct d'un vrai ID
      // TPE, pour ne jamais confondre une vraie transaction avec un test
      // une fois la Phase 3 branchée.
      commande = await prisma.commande.update({
        where: { id: commande.id },
        data: {
          statut: "PAYEE",
          transactionTpeId: `SIMULE-${Date.now()}`,
          moyenPaiement: "simule",
        },
        include: INCLUDE,
      });

      // Exécution bot Conqueror (Phase 1, via botRelay - cf. src/botRelay.js)
      try {
        const resultatBot = await botRelay.executerNouvellePartie({
          nom: commande.numero,
          joueurs: commande.joueurs.map((j) => ({
            nom: j.prenom,
            bumpers: j.bumpers,
            tarif: "1",
            parties: j.parties,
          })),
        });
        commande = await prisma.commande.update({
          where: { id: commande.id },
          data: {
            botSucces: !!resultatBot.succes,
            botErreur: resultatBot.succes ? null : resultatBot.erreur || "echec_bot_inconnu",
            botPiste: resultatBot.piste ?? null,
          },
          include: INCLUDE,
        });
      } catch (exc) {
        commande = await prisma.commande.update({
          where: { id: commande.id },
          data: { botSucces: false, botErreur: String(exc.message || exc) },
          include: INCLUDE,
        });
      }

      res.status(201).json(commande);
    })
  );

  router.get(
    "/commandes-bowling/:id",
    asyncHandler(async (req, res) => {
      const commande = await prisma.commande.findUnique({
        where: { id: req.params.id },
        include: INCLUDE,
      });
      if (!commande) return res.status(404).json({ erreur: "commande_introuvable" });
      res.json(commande);
    })
  );

  return router;
};
