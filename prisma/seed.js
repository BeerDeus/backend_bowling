// Seed - articles bar TEMPORAIRES (cf. Roadmap Phase 2)
// Pas d'accès à l'API Trivec à ce jour : ces catégories/produits sont créés
// "en dur" pour pouvoir développer/tester le catalogue + panier. Marqués
// estArticleTest=true et sans codeTrivec - une fois l'intégration branchée,
// on les rapprochera du vrai catalogue (renseigner codeTrivec) plutôt que de
// les recréer.
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const CATEGORIES = [
  {
    nom: "Softs",
    ordre: 1,
    produits: [
      { nom: "Coca-Cola 33cl", prixCentimes: 350 },
      { nom: "Eau plate 50cl", prixCentimes: 250 },
      { nom: "Jus d'orange", prixCentimes: 350 },
    ],
  },
  {
    nom: "Bières",
    ordre: 2,
    produits: [
      { nom: "Bière pression 25cl", prixCentimes: 450 },
      { nom: "Bière pression 50cl", prixCentimes: 750 },
    ],
  },
  {
    nom: "Snacks",
    ordre: 3,
    produits: [
      { nom: "Frites", prixCentimes: 450 },
      { nom: "Nachos", prixCentimes: 600 },
      { nom: "Planche mixte", prixCentimes: 1200 },
    ],
  },
];

async function main() {
  for (const cat of CATEGORIES) {
    const categorie = await prisma.categorie.upsert({
      where: { nom: cat.nom },
      update: { ordre: cat.ordre },
      create: { nom: cat.nom, ordre: cat.ordre },
    });

    for (const produit of cat.produits) {
      const existant = await prisma.produit.findFirst({
        where: { nom: produit.nom, categorieId: categorie.id },
      });
      if (existant) {
        await prisma.produit.update({
          where: { id: existant.id },
          data: { prixCentimes: produit.prixCentimes },
        });
      } else {
        await prisma.produit.create({
          data: {
            nom: produit.nom,
            prixCentimes: produit.prixCentimes,
            categorieId: categorie.id,
            estArticleTest: true,
          },
        });
      }
    }
  }

  const admin = await prisma.utilisateur.upsert({
    where: { email: "admin@bowling.local" },
    update: {},
    create: {
      email: "admin@bowling.local",
      // Placeholder - à remplacer par un vrai hash (bcrypt/argon2) avant
      // toute mise en prod du Back-Office (Phase 5).
      motDePasseHash: "CHANGER_MOI",
      role: "ADMIN",
    },
  });

  console.log(`Seed terminé. Utilisateur admin : ${admin.email}`);
}

main()
  .catch((exc) => {
    console.error(exc);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
