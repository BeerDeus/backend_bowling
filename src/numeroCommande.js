// Génère l'identifiant humain d'une commande (BO001, BA001, KA001...),
// unique par module - cf. demande explicite de Beer (2026-07-19) : "j'aimerais
// bien que chaque module ait son propre id".
//
// Atomique via une seule requête UPSERT SQL (INSERT ... ON CONFLICT DO
// UPDATE ... RETURNING) plutôt qu'un "lire le compteur, puis l'incrémenter"
// en deux requêtes séparées - sinon deux commandes créées au même instant
// sur deux bornes différentes pourraient lire la même valeur et obtenir le
// même numéro (race condition classique sur un compteur partagé).
const { prisma } = require("./db");

const PREFIXES = {
  BOWLING: "BO",
  BAR: "BA",
  KARAOKE: "KA",
  QUIZ: "QZ",
};

async function genererNumero(module) {
  const prefixe = PREFIXES[module];
  if (!prefixe) {
    throw new Error(`Module inconnu pour la génération de numéro : ${module}`);
  }

  const lignes = await prisma.$queryRaw`
    INSERT INTO compteurs_module (module, "dernierNumero")
    VALUES (${module}::"ModuleCommande", 1)
    ON CONFLICT (module) DO UPDATE
      SET "dernierNumero" = compteurs_module."dernierNumero" + 1
    RETURNING "dernierNumero"
  `;
  const dernierNumero = Number(lignes[0].dernierNumero);
  return `${prefixe}${String(dernierNumero).padStart(3, "0")}`;
}

module.exports = { genererNumero, PREFIXES };
