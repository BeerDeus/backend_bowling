// Mock Prisma partagé pour les tests de logique métier (pas de vraie BDD
// nécessaire ici) - cf. commandes.logique.test.js et
// bowlingCommandes.logique.test.js. Couvre juste ce dont ces tests ont besoin
// (pas un mock Prisma générique).
function creerPrismaMock() {
  const categories = [{ id: "cat1", nom: "Softs", ordre: 1 }];
  const produits = [
    { id: "p1", nom: "Coca", prixCentimes: 350, categorieId: "cat1", actif: true, codeTrivec: null },
    { id: "p2", nom: "Bière", prixCentimes: 450, categorieId: "cat1", actif: true, codeTrivec: null },
    { id: "p3", nom: "Inactif", prixCentimes: 999, categorieId: "cat1", actif: false, codeTrivec: null },
  ];
  const commandes = new Map();
  const tarifsBowling = new Map();
  let autoId = 1;
  let autoIdTarif = 1;
  const compteurs = {};

  const prisma = {
    categorie: { findMany: async () => categories },
    produit: {
      findMany: async ({ where }) => produits.filter((p) => {
        if (where.actif !== undefined && p.actif !== where.actif) return false;
        if (where.id && !where.id.in.includes(p.id)) return false;
        if (where.categorieId && p.categorieId !== where.categorieId) return false;
        return true;
      }),
    },
    commande: {
      create: async ({ data }) => {
        const id = "c" + autoId++;
        const lignes = ((data.lignes && data.lignes.create) || []).map((l, i) => ({
          id: `l${i}`, commandeId: id, ...l,
          produit: produits.find((p) => p.id === l.produitId),
        }));
        const joueurs = ((data.joueurs && data.joueurs.create) || []).map((j, i) => ({
          id: `j${i}`, commandeId: id, ...j,
        }));
        const commande = {
          id,
          numero: data.numero ?? null,
          module: data.module ?? "BAR",
          statut: "EN_COURS",
          borneId: data.borneId ?? null,
          totalCentimes: data.totalCentimes ?? 0,
          transactionTpeId: null,
          moyenPaiement: null,
          ticketTrivecId: null,
          erreur: null,
          cgvAccepteesLe: data.cgvAccepteesLe ?? null,
          codeAvantageSaisi: data.codeAvantageSaisi ?? null,
          botSucces: null,
          botErreur: null,
          botPiste: null,
          lignes,
          joueurs,
        };
        commandes.set(id, commande);
        return commande;
      },
      update: async ({ where, data }) => {
        const commande = commandes.get(where.id);
        if (!commande) throw new Error("introuvable");
        Object.assign(commande, data);
        return commande;
      },
      findUnique: async ({ where }) => commandes.get(where.id) || null,
      // Ajoutés pour test/adminCommandes.logique.test.js (liste Back-Office) -
      // implémentation minimale (pas de vrai skip/take paginé sur un vrai
      // moteur, juste ce qu'il faut pour valider le filtrage + la pagination
      // en mémoire).
      findMany: async ({ where, orderBy, skip = 0, take } = {}) => {
        let liste = Array.from(commandes.values()).filter((c) => {
          if (where?.module && c.module !== where.module) return false;
          if (where?.statut && c.statut !== where.statut) return false;
          return true;
        });
        if (orderBy?.creeLe === "desc") {
          liste = liste.slice().reverse();
        }
        return liste.slice(skip, take ? skip + take : undefined);
      },
      count: async ({ where } = {}) => {
        return Array.from(commandes.values()).filter((c) => {
          if (where?.module && c.module !== where.module) return false;
          if (where?.statut && c.statut !== where.statut) return false;
          return true;
        }).length;
      },
    },
    // Ajouté pour test/adminTarifsBowling.logique.test.js - implémentation
    // minimale (pas de vrai tri multi-clés, juste ce dont ce test a besoin).
    plageTarifaireBowling: {
      create: async ({ data }) => {
        const id = "t" + autoIdTarif++;
        const tarif = { id, ordre: 0, actif: true, creeLe: new Date(), majLe: new Date(), ...data };
        tarifsBowling.set(id, tarif);
        return tarif;
      },
      update: async ({ where, data }) => {
        const tarif = tarifsBowling.get(where.id);
        if (!tarif) throw new Error("introuvable");
        Object.assign(tarif, data, { majLe: new Date() });
        return tarif;
      },
      delete: async ({ where }) => {
        const tarif = tarifsBowling.get(where.id);
        if (!tarif) throw new Error("introuvable");
        tarifsBowling.delete(where.id);
        return tarif;
      },
      findMany: async ({ orderBy } = {}) => {
        let liste = Array.from(tarifsBowling.values());
        const cles = Array.isArray(orderBy) ? orderBy : orderBy ? [orderBy] : [];
        for (const cle of cles.slice().reverse()) {
          const [champ] = Object.keys(cle);
          const sens = cle[champ];
          liste = liste.slice().sort((a, b) => {
            if (a[champ] < b[champ]) return sens === "asc" ? -1 : 1;
            if (a[champ] > b[champ]) return sens === "asc" ? 1 : -1;
            return 0;
          });
        }
        return liste;
      },
    },
    // Simule uniquement le pattern utilisé par numeroCommande.js (tagged
    // template : le premier paramètre interpolé est le module).
    $queryRaw(_strings, ...values) {
      const module = values[0];
      compteurs[module] = (compteurs[module] || 0) + 1;
      return Promise.resolve([{ dernierNumero: compteurs[module] }]);
    },
  };

  return { prisma, _interne: { commandes, produits, categories, compteurs } };
}

module.exports = { creerPrismaMock };
