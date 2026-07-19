// Test logique métier de la route commandes-bowling (wizard borne), SANS
// vraie BDD ni vrai bot Conqueror - mock Prisma (cf. _mockPrisma.js) + faux
// botRelay simulant executerNouvellePartie().
//
// Lancer : node test/bowlingCommandes.logique.test.js (depuis backend/)
const assert = require("assert");
const path = require("path");
const Module = require("module");
const { creerPrismaMock } = require("./_mockPrisma");

const { prisma: prismaMock } = creerPrismaMock();

const dbPath = path.join(__dirname, "..", "src", "db.js");
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (parent && (request === "../db" || request === "./db")) {
    try {
      if (Module._resolveFilename(request, parent) === dbPath) return { prisma: prismaMock };
    } catch (_e) { /* laisse passer */ }
  }
  return originalLoad.apply(this, arguments);
};

function fakeRes() {
  return {
    statusCode: 200, body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

function creerFauxBotRelay({ succes = true, piste = 3, erreur } = {}) {
  const appels = [];
  return {
    appels,
    executerNouvellePartie: async (data) => {
      appels.push(data);
      if (!succes) throw new Error(erreur || "bot_indisponible");
      return { succes: true, piste, nomJoueur: data.nom, joueurs: data.joueurs.map((j) => j.nom) };
    },
  };
}

async function run() {
  const bowlingRouterFactory = require("../src/routes/bowlingCommandes");

  // --- Cas nominal : bot répond avec succès ---
  {
    const botRelay = creerFauxBotRelay({ succes: true, piste: 5 });
    const router = bowlingRouterFactory(botRelay);
    const post = router.stack.find((l) => l.route.path === "/commandes-bowling" && l.route.methods.post).route.stack[0].handle;

    const req = {
      body: {
        nbParties: 2,
        joueurs: [
          { prenom: "Alice", bumpers: false },
          { prenom: "Bob", bumpers: true },
        ],
        codeAvantage: "",
        cgvAcceptees: true,
      },
    };
    const res = fakeRes();
    await post(req, res);
    assert.strictEqual(res.statusCode, 201, JSON.stringify(res.body));
    assert.match(res.body.numero, /^BO\d{3}$/);
    assert.strictEqual(res.body.module, "BOWLING");
    assert.strictEqual(res.body.statut, "PAYEE");
    assert.ok(res.body.transactionTpeId.startsWith("SIMULE-"));
    assert.strictEqual(res.body.moyenPaiement, "simule");
    assert.strictEqual(res.body.joueurs.length, 2);
    assert.strictEqual(res.body.joueurs[0].parties, 2);
    assert.strictEqual(res.body.joueurs[1].bumpers, true);
    assert.strictEqual(res.body.botSucces, true);
    assert.strictEqual(res.body.botPiste, 5);
    console.log(`OK: commande bowling nominale -> numero=${res.body.numero}, statut=PAYEE, botSucces=true, piste=5`);

    assert.strictEqual(botRelay.appels.length, 1);
    assert.strictEqual(botRelay.appels[0].joueurs[0].tarif, "1");
    assert.strictEqual(botRelay.appels[0].joueurs[0].parties, 2);
    console.log("OK: payload envoyé au bot conforme (tarif=1, parties=nbParties)");
  }

  // --- Validation : aucun joueur ---
  {
    const botRelay = creerFauxBotRelay();
    const router = bowlingRouterFactory(botRelay);
    const post = router.stack.find((l) => l.route.path === "/commandes-bowling" && l.route.methods.post).route.stack[0].handle;
    const res = fakeRes();
    await post({ body: { nbParties: 1, joueurs: [], cgvAcceptees: true } }, res);
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body.erreur, "aucun_joueur");
    console.log("OK: aucun joueur -> 400 aucun_joueur");
  }

  // --- Validation : prénom manquant ---
  {
    const botRelay = creerFauxBotRelay();
    const router = bowlingRouterFactory(botRelay);
    const post = router.stack.find((l) => l.route.path === "/commandes-bowling" && l.route.methods.post).route.stack[0].handle;
    const res = fakeRes();
    await post({ body: { nbParties: 1, joueurs: [{ prenom: "  " }], cgvAcceptees: true } }, res);
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body.erreur, "prenom_manquant");
    console.log("OK: prénom vide -> 400 prenom_manquant");
  }

  // --- Validation : CGV non acceptées ---
  {
    const botRelay = creerFauxBotRelay();
    const router = bowlingRouterFactory(botRelay);
    const post = router.stack.find((l) => l.route.path === "/commandes-bowling" && l.route.methods.post).route.stack[0].handle;
    const res = fakeRes();
    await post({ body: { nbParties: 1, joueurs: [{ prenom: "Alice" }], cgvAcceptees: false } }, res);
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body.erreur, "cgv_non_acceptees");
    console.log("OK: CGV non cochées -> 400 cgv_non_acceptees");
  }

  // --- Bot indisponible : la commande reste PAYEE (paiement simulé déjà fait) mais botSucces=false ---
  {
    const botRelay = creerFauxBotRelay({ succes: false, erreur: "bot_indisponible" });
    const router = bowlingRouterFactory(botRelay);
    const post = router.stack.find((l) => l.route.path === "/commandes-bowling" && l.route.methods.post).route.stack[0].handle;
    const res = fakeRes();
    await post({ body: { nbParties: 1, joueurs: [{ prenom: "Alice" }], cgvAcceptees: true } }, res);
    assert.strictEqual(res.statusCode, 201);
    assert.strictEqual(res.body.statut, "PAYEE");
    assert.strictEqual(res.body.botSucces, false);
    assert.strictEqual(res.body.botErreur, "bot_indisponible");
    console.log("OK: bot indisponible -> commande quand même PAYEE (paiement déjà simulé), botSucces=false capturé");
  }

  console.log("\nTous les tests logique métier commandes-bowling (mock Prisma + faux bot) sont passés.");
}

run().catch((exc) => {
  console.error("ÉCHEC TEST:", exc);
  process.exit(1);
});
