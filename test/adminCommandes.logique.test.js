// Test logique métier de la route admin (Back-Office), SANS base de données
// réelle - même approche que commandes.logique.test.js (cf. ce fichier pour
// le détail du mécanisme de mock via Module._load).
//
// Lancer : node test/adminCommandes.logique.test.js (depuis backend/)
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
  const fakeIo = { emit: () => {} };
  const commandesRouter = commandesRouterFactory(fakeIo);
  const postCommandes = commandesRouter.stack.find(
    (l) => l.route && l.route.path === "/commandes" && l.route.methods.post
  ).route.stack[0].handle;

  const adminRouter = require("../src/routes/adminCommandes");
  const findHandler = (method, p) => {
    const layer = adminRouter.stack.find((l) => l.route && l.route.path === p && l.route.methods[method]);
    if (!layer) throw new Error(`handler introuvable: ${method.toUpperCase()} ${p}`);
    return layer.route.stack[0].handle;
  };
  const listeCommandes = findHandler("get", "/admin/commandes");
  const detailCommande = findHandler("get", "/admin/commandes/:id");

  // Deux commandes BAR créées via la vraie route borne, pour peupler le mock.
  let idA, idB;
  {
    const res = fakeRes();
    await postCommandes({ body: { lignes: [{ produitId: "p1", quantite: 1 }] } }, res);
    idA = res.body.id;
  }
  {
    const res = fakeRes();
    await postCommandes({ body: { lignes: [{ produitId: "p2", quantite: 2 }] } }, res);
    idB = res.body.id;
  }

  {
    const res = fakeRes();
    await listeCommandes({ query: {} }, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.total, 2);
    assert.strictEqual(res.body.commandes.length, 2);
    console.log("OK: liste sans filtre -> 2 commandes");
  }

  {
    const res = fakeRes();
    await listeCommandes({ query: { module: "BOWLING" } }, res);
    assert.strictEqual(res.body.total, 0);
    console.log("OK: filtre module=BOWLING -> 0 commande (aucune créée)");
  }

  {
    const res = fakeRes();
    await listeCommandes({ query: { module: "INEXISTANT" } }, res);
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body.erreur, "module_invalide");
    console.log("OK: module invalide -> 400");
  }

  {
    const res = fakeRes();
    await listeCommandes({ query: { page: "1", pageSize: "1" } }, res);
    assert.strictEqual(res.body.total, 2);
    assert.strictEqual(res.body.commandes.length, 1);
    assert.strictEqual(res.body.pageSize, 1);
    console.log("OK: pagination pageSize=1 -> 1 résultat sur 2");
  }

  {
    const res = fakeRes();
    await detailCommande({ params: { id: idA } }, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.id, idA);
    assert.ok(Array.isArray(res.body.lignes));
    console.log("OK: détail commande -> lignes incluses");
  }

  {
    const res = fakeRes();
    await detailCommande({ params: { id: "inconnu" } }, res);
    assert.strictEqual(res.statusCode, 404);
    console.log("OK: détail commande inconnue -> 404");
  }

  console.log(`\nTous les tests logique métier admin (mock Prisma) sont passés. (idB=${idB} utilisé implicitement dans le total)`);
}

run().catch((exc) => {
  console.error("ÉCHEC TEST:", exc);
  process.exit(1);
});
