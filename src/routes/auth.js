// Login Back-Office (cf. demande Beer 2026-07-21 - sécuriser /api/admin/*,
// jusqu'ici public sans authentification). Pas d'inscription en self-service
// pour l'instant : les comptes (ADMIN/ACCUEIL/BAR) sont créés à la main
// (cf. prisma/seed.js) - cohérent avec une petite équipe interne, pas un
// produit grand public.
const express = require("express");
const { prisma } = require("../db");
const { asyncHandler } = require("../asyncHandler");
const { verifierMotDePasse, genererToken } = require("../auth");
const { exigerAuth } = require("../middlewareAuth");

const router = express.Router();

// POST /api/auth/login { email, motDePasse }
router.post(
  "/auth/login",
  asyncHandler(async (req, res) => {
    const { email, motDePasse } = req.body || {};
    if (typeof email !== "string" || typeof motDePasse !== "string" || !email || !motDePasse) {
      return res.status(400).json({ erreur: "identifiants_requis" });
    }

    const utilisateur = await prisma.utilisateur.findUnique({ where: { email: email.trim().toLowerCase() } });

    // Même message d'erreur que l'utilisateur existe ou non / que le mot de
    // passe soit faux - évite de laisser deviner les emails valides
    // (énumération de comptes) depuis les messages d'erreur.
    if (!utilisateur || !utilisateur.actif) {
      return res.status(401).json({ erreur: "identifiants_invalides" });
    }

    const motDePasseValide = await verifierMotDePasse(motDePasse, utilisateur.motDePasseHash);
    if (!motDePasseValide) {
      return res.status(401).json({ erreur: "identifiants_invalides" });
    }

    const token = genererToken(utilisateur);
    res.json({
      token,
      utilisateur: { id: utilisateur.id, email: utilisateur.email, role: utilisateur.role },
    });
  })
);

// GET /api/auth/moi - vérifie qu'un token est toujours valide et renvoie
// l'utilisateur courant (utilisé par app-admin au chargement pour savoir si
// la session en localStorage tient toujours, sans attendre le premier appel
// /api/admin/* qui échouerait sinon avec un message moins clair).
router.get(
  "/auth/moi",
  exigerAuth,
  asyncHandler(async (req, res) => {
    res.json({ utilisateur: req.utilisateur });
  })
);

module.exports = router;
