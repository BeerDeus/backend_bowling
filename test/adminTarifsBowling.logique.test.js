// Test logique métier de la route tarifs Bowling (Back-Office), SANS base de
// données réelle - même mécanisme que les autres tests logique (cf.
// commandes.logique.test.js pour le détail du mock via Module._load).
//
// Lancer : node test/adminTarifsBowling.logique.test.js (depuis backend/)
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
    end() { this.body = this.body ?? null; return this; },
  };
}

async function run() {
  const router = require("../src/routes/adminTarifsBowling");
  const findHandler = (method, p) => {
    const layer = router.stack.find((l) => l.route && l.route.path === p && l.route.methods[method]);
    if (!layer) throw new Error(`handler introuvable: ${method.toUpperCase()} ${p}`);
    return layer.route.stack[0].handle;
  };
  const lister = findHandler("get", "/admin/bowling/tarifs");
  const creer = findHandler("post", "/admin/bowling/tarifs");
  const modifier = findHandler("patch", "/admin/bowling/tarifs/:id");
  const supprimer = findHandler("delete", "/admin/bowling/tarifs/:id");

  {
    const res = fakeRes();
    await creer({ body: { label: "Journée", heureDebut: "10:00", heureFin: "18:00", jours: [1, 2, 3, 4, 5], prixParPartieCentimes: 500 } }, res);
    assert.strictEqual(res.statusCode, 201);
    assert.strictEqual(res.body.label, "Journée");
    assert.strictEqual(res.body.prixParPartieCentimes, 500);
    console.log("OK: création plage nominale -> 201");
  }
  let idSoiree;
  {
    const res = fakeRes();
    await creer({ body: { label: "Soirée", heureDebut: "18:00", heureFin: "23:00", jours: [5, 6], prixParPartieCentimes: 700 } }, res);
    assert.strictEqual(res.statusCode, 201);
    idSoiree = res.body.id;
    console.log("OK: 2e plage créée");
  }

  {
    const res = fakeRes();
    await creer({ body: { label: "", heureDebut: "10:00", heureFin: "18:00", jours: [1], prixParPartieCentimes: 500 } }, res);
    assert.strictEqual(res.statusCode, 400);
    assert.ok(res.body.details.includes("label_requis"));
    console.log("OK: label vide -> 400 label_requis");
  }

  {
    const res = fakeRes();
    await creer({ body: { label: "X", heureDebut: "25:00", heureFin: "18:00", jours: [1], prixParPartieCentimes: 500 } }, res);
    assert.strictEqual(res.statusCode, 400);
    assert.ok(res.body.details.includes("heure_debut_invalide"));
    console.log("OK: heure invalide -> 400 heure_debut_invalide");
  }

  {
    const res = fakeRes();
    await creer({ body: { label: "X", heureDebut: "18:00", heureFin: "10:00", jours: [1], prixParPartieCentimes: 500 } }, res);
    assert.strictEqual(res.statusCode, 400);
    assert.ok(res.body.details.includes("heure_fin_doit_suivre_heure_debut"));
    console.log("OK: heureFin avant heureDebut -> 400");
  }

  {
    const res = fakeRes();
    await creer({ body: { label: "X", heureDebut: "10:00", heureFin: "18:00", jours: [], prixParPartieCentimes: 500 } }, res);
    assert.strictEqual(res.statusCode, 400);
    assert.ok(res.body.details.includes("jours_invalides"));
    console.log("OK: jours vides -> 400 jours_invalides");
  }

  {
    const res = fakeRes();
    await creer({ body: { label: "X", heureDebut: "10:00", heureFin: "18:00", jours: [1], prixParPartieCentimes: -10 } }, res);
    assert.strictEqual(res.statusCode, 400);
    assert.ok(res.body.details.includes("prix_invalide"));
    console.log("OK: prix négatif -> 400 prix_invalide");
  }

  {
    const res = fakeRes();
    await lister({}, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.length, 2);
    console.log("OK: liste -> 2 plages");
  }

  {
    const res = fakeRes();
    await modifier({ params: { id: idSoiree }, body: { prixParPartieCentimes: 800 } }, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.prixParPartieCentimes, 800);
    assert.strictEqual(res.body.label, "Soirée");
    console.log("OK: modification partielle -> prix mis à jour, reste inchangé");
  }

  {
    const res = fakeRes();
    await modifier({ params: { id: "inconnu" }, body: { prixParPartieCentimes: 100 } }, res);
    assert.strictEqual(res.statusCode, 404);
    console.log("OK: modification id inconnu -> 404");
  }

  {
    const res = fakeRes();
    await supprimer({ params: { id: idSoiree } }, res);
    assert.strictEqual(res.statusCode, 204);
    console.log("OK: suppression -> 204");
  }

  {
    const res = fakeRes();
    await lister({}, res);
    assert.strictEqual(res.body.length, 1);
    console.log("OK: liste après suppression -> 1 plage restante");
  }

  {
    const res = fakeRes();
    await supprimer({ params: { id: "inconnu" } }, res);
    assert.strictEqual(res.statusCode, 404);
    console.log("OK: suppression id inconnu -> 404");
  }

  console.log("\nTous les tests logique métier tarifs Bowling (mock Prisma) sont passés.");
}

run().catch((exc) => {
  console.error("ÉCHEC TEST:", exc);
  process.exit(1);
});
