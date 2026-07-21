// Seed - articles bar TEMPORAIRES (cf. Roadmap Phase 2)
// Pas d'accès à l'API Trivec à ce jour : ces catégories/produits sont créés
// "en dur" pour pouvoir développer/tester le catalogue + panier. Marqués
// estArticleTest=true et sans codeTrivec - une fois l'intégration branchée,
// on les rapprochera du vrai catalogue (renseigner codeTrivec) plutôt que de
// les recréer.
const { PrismaClient } = require("@prisma/client");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");

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

  // Compte ADMIN par défaut - cf. demande Beer 2026-07-21 (sécuriser
  // /api/admin/*, cf. src/routes/auth.js). Un vrai hash bcrypt cette fois
  // (l'ancien placeholder "CHANGER_MOI" n'était PAS un hash valide -
  // n'importe quel mot de passe aurait échoué à bcrypt.compare() contre
  // lui, donc le login aurait été cassé pour tout le monde, pas juste
  // "en attente d'être changé"). Ne régénère le mot de passe QUE si le
  // compte n'existe pas encore ou porte encore ce placeholder - pas à
  // chaque exécution du seed, sinon un mot de passe déjà choisi par Beer
  // sauterait au prochain déploiement.
  const existant = await prisma.utilisateur.findUnique({ where: { email: "admin@bowling.local" } });

  if (!existant || existant.motDePasseHash === "CHANGER_MOI") {
    const motDePasseGenere = crypto.randomBytes(9).toString("base64url"); // 12 caractères, lisible
    const motDePasseHash = await bcrypt.hash(motDePasseGenere, 10);

    const admin = await prisma.utilisateur.upsert({
      where: { email: "admin@bowling.local" },
      update: { motDePasseHash },
      create: { email: "admin@bowling.local", motDePasseHash, role: "ADMIN" },
    });

    console.log(`Seed terminé. Utilisateur admin : ${admin.email}`);
    console.log(`Mot de passe généré (affiché une seule fois, à changer/noter maintenant) : ${motDePasseGenere}`);
  } else {
    console.log(`Seed terminé. Utilisateur admin déjà configuré (${existant.email}) - mot de passe inchangé.`);
  }
}

main()
  .catch((exc) => {
    console.error(exc);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
