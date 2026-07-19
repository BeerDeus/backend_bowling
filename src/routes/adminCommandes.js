// Back-Office (admin) - lecture des commandes tous modules confondus, cf.
// demande Beer (2026-07-19) : "un backend à la WordPress avec les modules de
// côté" -> chaque module (Bowling/Bar/Karaoké/Quiz) a une liste de commandes
// + une page de détail dédiée. Distinct de src/routes/commandes.js (API
// borne, écriture) : ce routeur est LECTURE SEULE, pensé pour le Back-Office
// (app-admin/), pas pour la borne.
//
// Pas d'authentification pour l'instant (le modèle Utilisateur/rôles existe
// en base - cf. schema.prisma - mais aucune route de login n'a encore été
// développée, hors périmètre de cette itération). À ajouter avant toute
// exposition publique de ce routeur (cf. Roadmap Phase 5 - Back-Office).
const express = require("express");
const { prisma } = require("../db");
const { asyncHandler } = require("../asyncHandler");

const router = express.Router();

const MODULES_VALIDES = ["BOWLING", "BAR", "KARAOKE", "QUIZ"];
const STATUTS_VALIDES = ["EN_COURS", "ENVOYEE_BAR", "PAYEE", "ECHOUEE", "ANNULEE"];

// Détail complet : on inclut les DEUX relations (lignes Bar + joueurs
// Bowling) plutôt que de brancher selon le module - une commande n'a de
// toute façon jamais les deux en même temps, et ça évite un routeur
// spécifique par module côté Back-Office.
const INCLUDE_DETAIL = {
  lignes: { include: { produit: true } },
  joueurs: true,
};

// GET /api/admin/commandes?module=BOWLING&statut=PAYEE&page=1&pageSize=20
// Liste allégée (pas de lignes/joueurs détaillés, juste un compte) - pensée
// pour l'affichage tableau du Back-Office, cf. app-admin/src/pages/CommandesListe.jsx.
router.get(
  "/admin/commandes",
  asyncHandler(async (req, res) => {
    const { module, statut } = req.query;

    if (module && !MODULES_VALIDES.includes(module)) {
      return res.status(400).json({ erreur: "module_invalide" });
    }
    if (statut && !STATUTS_VALIDES.includes(statut)) {
      return res.status(400).json({ erreur: "statut_invalide" });
    }

    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));

    const where = {
      ...(module ? { module } : {}),
      ...(statut ? { statut } : {}),
    };

    const [commandes, total] = await Promise.all([
      prisma.commande.findMany({
        where,
        orderBy: { creeLe: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { _count: { select: { lignes: true, joueurs: true } } },
      }),
      prisma.commande.count({ where }),
    ]);

    res.json({ commandes, total, page, pageSize });
  })
);

// GET /api/admin/commandes/:id - détail complet pour la page dédiée.
router.get(
  "/admin/commandes/:id",
  asyncHandler(async (req, res) => {
    const commande = await prisma.commande.findUnique({
      where: { id: req.params.id },
      include: INCLUDE_DETAIL,
    });
    if (!commande) return res.status(404).json({ erreur: "commande_introuvable" });
    res.json(commande);
  })
);

module.exports = router;
