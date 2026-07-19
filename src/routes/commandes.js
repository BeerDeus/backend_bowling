// Commandes Bar - cf. Roadmap Phase 2 (gestion des commandes SANS paiement ;
// le paiement TPE/Cashdro arrive en Phase 3, cf. CDC 2.3).
const express = require("express");
const { prisma } = require("../db");
const { getTrivecClient } = require("../trivec/client");

const INCLUDE_LIGNES = { lignes: { include: { produit: true } } };

// Factory : reçoit l'instance Socket.io pour diffuser les mises à jour de
// commande en temps réel (ex: futur écran bar), cf. CDC 2.2 - fini le
// polling, tout passe par WebSocket.
module.exports = function commandesRouter(io) {
  const router = express.Router();

  // POST /api/commandes - crée une commande à partir du panier de la borne,
  // puis la transmet à Trivec (mock pour l'instant, cf. src/trivec/client.js).
  // Body attendu : { borneId?, lignes: [{ produitId, quantite }] }
  router.post("/commandes", async (req, res) => {
    const { borneId, lignes } = req.body || {};

    if (!Array.isArray(lignes) || lignes.length === 0) {
      return res.status(400).json({ erreur: "panier_vide" });
    }

    const produitIds = lignes.map((l) => l.produitId);
    const produits = await prisma.produit.findMany({
      where: { id: { in: produitIds }, actif: true },
    });
    const produitParId = new Map(produits.map((p) => [p.id, p]));

    // Le prix n'est JAMAIS pris depuis la requête client (cf. CDC - intégrité
    // des transactions financières) : uniquement depuis la BDD, au moment de
    // la commande.
    const lignesACreer = [];
    for (const ligne of lignes) {
      const produit = produitParId.get(ligne.produitId);
      const quantite = Number(ligne.quantite) || 0;
      if (!produit || quantite <= 0) {
        return res.status(400).json({ erreur: "produit_invalide", produitId: ligne.produitId });
      }
      lignesACreer.push({
        produitId: produit.id,
        quantite,
        prixUnitaireCentimes: produit.prixCentimes,
      });
    }

    const totalCentimes = lignesACreer.reduce(
      (somme, l) => somme + l.prixUnitaireCentimes * l.quantite,
      0
    );

    let commande = await prisma.commande.create({
      data: {
        borneId: borneId || null,
        totalCentimes,
        lignes: { create: lignesACreer },
      },
      include: INCLUDE_LIGNES,
    });

    io.emit("commande_maj", commande);

    // Transmission Trivec (impression ticket bar) - cf. Roadmap Phase 2.
    const trivec = getTrivecClient();
    try {
      const resultatTrivec = await trivec.envoyerCommande(commande);
      commande = await prisma.commande.update({
        where: { id: commande.id },
        data: resultatTrivec.succes
          ? { statut: "ENVOYEE_BAR", ticketTrivecId: resultatTrivec.ticketTrivecId, erreur: null }
          : { statut: "ECHOUEE", erreur: resultatTrivec.erreur || "echec_trivec_inconnu" },
        include: INCLUDE_LIGNES,
      });
    } catch (exc) {
      commande = await prisma.commande.update({
        where: { id: commande.id },
        data: { statut: "ECHOUEE", erreur: String(exc.message || exc) },
        include: INCLUDE_LIGNES,
      });
    }

    io.emit("commande_maj", commande);
    res.status(commande.statut === "ECHOUEE" ? 502 : 201).json(commande);
  });

  // GET /api/commandes/:id
  router.get("/commandes/:id", async (req, res) => {
    const commande = await prisma.commande.findUnique({
      where: { id: req.params.id },
      include: INCLUDE_LIGNES,
    });
    if (!commande) return res.status(404).json({ erreur: "commande_introuvable" });
    res.json(commande);
  });

  // PATCH /api/commandes/:id/statut - changement manuel de statut (staff /
  // futur module paiement Phase 3). Miroir applicatif de la contrainte DB
  // (cf. migration) : impossible de passer en PAYEE sans transactionTpeId.
  router.patch("/commandes/:id/statut", async (req, res) => {
    const { statut, transactionTpeId, moyenPaiement } = req.body || {};
    const statutsValides = ["EN_COURS", "ENVOYEE_BAR", "PAYEE", "ECHOUEE", "ANNULEE"];
    if (!statutsValides.includes(statut)) {
      return res.status(400).json({ erreur: "statut_invalide" });
    }
    if (statut === "PAYEE" && !transactionTpeId) {
      return res.status(400).json({ erreur: "transaction_tpe_id_requis_pour_payee" });
    }

    try {
      const commande = await prisma.commande.update({
        where: { id: req.params.id },
        data: { statut, transactionTpeId, moyenPaiement },
        include: INCLUDE_LIGNES,
      });
      io.emit("commande_maj", commande);
      res.json(commande);
    } catch (exc) {
      res.status(404).json({ erreur: "commande_introuvable" });
    }
  });

  return router;
};
