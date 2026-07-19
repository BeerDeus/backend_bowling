// Catalogue Bar (lecture seule côté borne) - cf. Roadmap Phase 2
const express = require("express");
const { prisma } = require("../db");

const router = express.Router();

// GET /api/categories - liste des catégories actives, triées par ordre d'affichage
router.get("/categories", async (req, res) => {
  const categories = await prisma.categorie.findMany({
    orderBy: { ordre: "asc" },
  });
  res.json(categories);
});

// GET /api/produits - catalogue complet (option ?categorieId=... pour filtrer)
// Seuls les produits actifs sont renvoyés à la borne (un produit désactivé au
// Back-Office disparaît immédiatement du catalogue, sans purge en base).
router.get("/produits", async (req, res) => {
  const { categorieId } = req.query;
  const produits = await prisma.produit.findMany({
    where: {
      actif: true,
      ...(categorieId ? { categorieId } : {}),
    },
    orderBy: { nom: "asc" },
  });
  res.json(produits);
});

module.exports = router;
