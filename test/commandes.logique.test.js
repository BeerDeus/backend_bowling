// Test logique métier des routes commandes Bar, SANS base de données réelle.
// Remplace "../db" (routes/*.js) ET "./db" (numeroCommande.js) par un mock en
// mémoire (cf. test/_mockPrisma.js) via Module._load - un vrai test
// d'intégration (Postgres réelle) reste à ajouter séparément.
//
// Lancer : node test/commandes.logique.test.js (depuis backend/)
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
    } catch (_e) { /* laisse passer, résolution normale */ }
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

async function run() {
  const commandesRouterFactory = require("../src/routes/commandes");
  const events = [];
  const fakeIo = { emit: (name, payload) => events.push([name, payload]) };
  const router = commandesRouterFactory(fakeIo);

  const findHandler = (method, path) => {
    const layer = router.stack.find((l) => l.route && l.route.path === path && l.route.methods[method]);
    if (!layer) throw new Error(`handler introuvable: ${method.toUpperCase()} ${path}`);
    return layer.route.stack[0].handle;
  };

  const postCommandes = findHandler("post", "/commandes");
  const patchStatut = findHandler("patch", "/commandes/:id/statut");
  const getCommande = findHandler("get", "/commandes/:id");

  {
    const res = fakeRes();
    await postCommandes({ body: { lignes: [] } }, res);
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body.erreur, "panier_vide");
    console.log("OK: panier vide -> 400 panier_vide");
  }

  {
    const res = fakeRes();
    await postCommandes({ body: { lignes: [{ produitId: "p3", quantite: 1 }] } }, res);
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body.erreur, "produit_invalide");
    console.log("OK: produit inactif -> 400 produit_invalide");
  }

  let commandeId;
  {
    const res = fakeRes();
    await postCommandes({ body: { borneId: "borne-1", lignes: [
      { produitId: "p1", quantite: 2 },
      { produitId: "p2", quantite: 1 },
    ] } }, res);
    assert.strictEqual(res.statusCode, 201);
    assert.strictEqual(res.body.totalCentimes, 1150);
    assert.strictEqual(res.body.statut, "ENVOYEE_BAR");
    assert.ok(res.body.ticketTrivecId);
    assert.strictEqual(res.body.module, "BAR");
    assert.match(res.body.numero, /^BA\d{3}$/);
    assert.ok(events.some(([n]) => n === "commande_maj"));
    console.log(`OK: commande nominale -> total=1150, statut=ENVOYEE_BAR, numero=${res.body.numero}`);
    commandeId = res.body.id;
  }

  {
    const res = fakeRes();
    await postCommandes({ body: { lignes: [{ produitId: "p1", quantite: 1 }] } }, res);
    assert.match(res.body.numero, /^BA\d{3}$/);
    assert.notStrictEqual(res.body.numero, commandeId);
    console.log(`OK: 2e commande -> numero différent et incrémenté (${res.body.numero})`);
  }

  {
    const res = fakeRes();
    await patchStatut({ params: { id: commandeId }, body: { statut: "PAYEE" } }, res);
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body.erreur, "transaction_tpe_id_requis_pour_payee");
    console.log("OK: PATCH PAYEE sans transactionTpeId -> 400 (contrainte respectée)");
  }

  {
    const res = fakeRes();
    await patchStatut({ params: { id: commandeId }, body: { statut: "PAYEE", transactionTpeId: "TPE-123", moyenPaiement: "carte" } }, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.statut, "PAYEE");
    console.log("OK: PATCH PAYEE avec transactionTpeId -> 200");
  }

  {
    const res = fakeRes();
    await getCommande({ params: { id: commandeId } }, res);
    assert.strictEqual(res.body.id, commandeId);
    console.log("OK: GET commande/:id");
  }

  {
    process.env.TRIVEC_MOCK_ECHEC = "true";
    delete require.cache[require.resolve("../src/trivec/client")];
    delete require.cache[require.resolve("../src/routes/commandes")];
    const factory2 = require("../src/routes/commandes");
    const router2 = factory2(fakeIo);
    const postCommandes2 = router2.stack.find((l) => l.route && l.route.path === "/commandes" && l.route.methods.post).route.stack[0].handle;

    const res = fakeRes();
    await postCommandes2({ body: { lignes: [{ produitId: "p1", quantite: 1 }] } }, res);
    assert.strictEqual(res.statusCode, 502);
    assert.strictEqual(res.body.statut, "ECHOUEE");
    assert.strictEqual(res.body.erreur, "echec_impression_simule");
    console.log("OK: échec Trivec simulé -> statut ECHOUEE");
    delete process.env.TRIVEC_MOCK_ECHEC;
  }

  console.log("\nTous les tests logique métier commandes Bar (mock Prisma) sont passés.");
}

run().catch((exc) => {
  console.error("ÉCHEC TEST:", exc);
  process.exit(1);
});
