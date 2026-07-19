// Back-Office - paramètres de tarification Bowling par plage horaire (cf.
// demande Beer 2026-07-19). CRUD simple, pensé pour l'écran Paramètres du
// module Bowling dans app-admin.
//
// IMPORTANT (cf. commentaire sur PlageTarifaireBowling dans schema.prisma) :
// ce routeur gère uniquement la CONFIGURATION. Il n'est PAS encore branché
// sur la création de commande Bowling (totalCentimes reste à 0, paiement
// simulé, cf. routes/bowlingCommandes.js) ni sur le choix du tarif Conqueror
// (bot/conqueror_bot.py utilise toujours "1" en dur) - câblage prévu une
// fois la Phase 3 (paiement réel) démarrée.
const express = require("express");
const { prisma } = require("../db");
const { asyncHandler } = require("../asyncHandler");

const router = express.Router();

const REGEX_HEURE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const JOURS_VALIDES = [0, 1, 2, 3, 4, 5, 6]; // convention JS Date.getDay() : 0=dimanche

function validerPayload(body, { partiel } = { partiel: false }) {
  const erreurs = [];
  const donnees = {};

  if (!partiel || body.label !== undefined) {
    if (typeof body.label !== "string" || !body.label.trim()) {
      erreurs.push("label_requis");
    } else {
      donnees.label = body.label.trim();
    }
  }

  if (!partiel || body.heureDebut !== undefined) {
    if (typeof body.heureDebut !== "string" || !REGEX_HEURE.test(body.heureDebut)) {
      erreurs.push("heure_debut_invalide");
    } else {
      donnees.heureDebut = body.heureDebut;
    }
  }

  if (!partiel || body.heureFin !== undefined) {
    if (typeof body.heureFin !== "string" || !REGEX_HEURE.test(body.heureFin)) {
      erreurs.push("heure_fin_invalide");
    } else {
      donnees.heureFin = body.heureFin;
    }
  }

  // heureFin PEUT être < heureDebut : ça signifie que la plage traverse
  // minuit (ex: 17:00 -> 02:00, cf. Beer 2026-07-19 "on ferme après minuit")
  // - cf. tarificationBowling.js pour la logique de résolution qui gère ce
  // cas. Seule l'égalité stricte est rejetée (plage de durée nulle, ou
  // ambiguë - "toute la journée" doit être exprimé explicitement en
  // 00:00 -> 23:59, pas en 00:00 -> 00:00). Limite connue en PATCH partiel :
  // si un seul des deux horaires est modifié, on ne compare qu'aux valeurs
  // DU MÊME payload (pas à la valeur existante en base) - app-admin envoie
  // toujours les deux horaires ensemble (cf. ParametresBowlingTarifs.jsx),
  // donc pas un problème en pratique pour l'instant.
  if (donnees.heureDebut && donnees.heureFin && donnees.heureDebut === donnees.heureFin) {
    erreurs.push("heure_fin_doit_differer_heure_debut");
  }

  if (!partiel || body.jours !== undefined) {
    const jours = body.jours;
    if (
      !Array.isArray(jours) ||
      jours.length === 0 ||
      jours.some((j) => !JOURS_VALIDES.includes(j)) ||
      new Set(jours).size !== jours.length
    ) {
      erreurs.push("jours_invalides");
    } else {
      donnees.jours = jours;
    }
  }

  if (!partiel || body.prixParPartieCentimes !== undefined) {
    const prix = Number(body.prixParPartieCentimes);
    if (!Number.isInteger(prix) || prix < 0) {
      erreurs.push("prix_invalide");
    } else {
      donnees.prixParPartieCentimes = prix;
    }
  }

  if (body.ordre !== undefined) {
    const ordre = Number(body.ordre);
    if (!Number.isInteger(ordre)) erreurs.push("ordre_invalide");
    else donnees.ordre = ordre;
  }

  if (body.actif !== undefined) {
    if (typeof body.actif !== "boolean") erreurs.push("actif_invalide");
    else donnees.actif = body.actif;
  }

  return { erreurs, donnees };
}

// GET /api/admin/bowling/tarifs - toutes les plages (actives ou non : c'est
// un écran d'administration, pas le catalogue consommé par la borne).
router.get(
  "/admin/bowling/tarifs",
  asyncHandler(async (req, res) => {
    const tarifs = await prisma.plageTarifaireBowling.findMany({
      orderBy: [{ ordre: "asc" }, { heureDebut: "asc" }],
    });
    res.json(tarifs);
  })
);

router.post(
  "/admin/bowling/tarifs",
  asyncHandler(async (req, res) => {
    const { erreurs, donnees } = validerPayload(req.body || {});
    if (erreurs.length > 0) return res.status(400).json({ erreur: "payload_invalide", details: erreurs });

    const tarif = await prisma.plageTarifaireBowling.create({ data: donnees });
    res.status(201).json(tarif);
  })
);

router.patch(
  "/admin/bowling/tarifs/:id",
  asyncHandler(async (req, res) => {
    const { erreurs, donnees } = validerPayload(req.body || {}, { partiel: true });
    if (erreurs.length > 0) return res.status(400).json({ erreur: "payload_invalide", details: erreurs });
    if (Object.keys(donnees).length === 0) return res.status(400).json({ erreur: "aucun_champ_a_modifier" });

    try {
      const tarif = await prisma.plageTarifaireBowling.update({
        where: { id: req.params.id },
        data: donnees,
      });
      res.json(tarif);
    } catch (_exc) {
      res.status(404).json({ erreur: "tarif_introuvable" });
    }
  })
);

router.delete(
  "/admin/bowling/tarifs/:id",
  asyncHandler(async (req, res) => {
    try {
      await prisma.plageTarifaireBowling.delete({ where: { id: req.params.id } });
      res.status(204).end();
    } catch (_exc) {
      res.status(404).json({ erreur: "tarif_introuvable" });
    }
  })
);

module.exports = router;
