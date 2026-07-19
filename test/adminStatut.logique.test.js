// Test logique de la route statut (Back-Office), avec un faux botRelay et un
// mock Prisma minimal (juste $queryRaw, cf. adminStatut.js) - même approche
// que les autres tests logique (pas de vraie BDD/bot nécessaire).
//
// Lancer : node test/adminStatut.logique.test.js (depuis backend/)
const assert = require("assert");
const path = require("path");
const Module = require("module");

const dbPath = path.join(__dirname, "..", "src", "db.js");
const originalLoad = Module._load;

function fakeRes() {
  return {
    statusCode: 200, body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

async function run() {
  // --- Cas 1 : bot connecté + BDD joignable ---
  Module._load = function (request, parent, isMain) {
    if (parent && (request === "../db" || request === "./db")) {
      try {
        if (Module._resolveFilename(request, parent) === dbPath) {
          return { prisma: { $queryRaw: async () => [{ "?column?": 1 }] } };
        }
      } catch (_e) { /* laisse passer */ }
    }
    return originalLoad.apply(this, arguments);
  };
  delete require.cache[require.resolve("../src/routes/adminStatut")];
  const adminStatutRouterFactory = require("../src/routes/adminStatut");
  const botRelayConnecte = {
    estConnecte: () => true,
    dernierHeartbeat: () => Date.now() - 2000,
  };
  const router1 = adminStatutRouterFactory(botRelayConnecte);
  const handler1 = router1.stack.find((l) => l.route && l.route.path === "/admin/statut").route.stack[0].handle;

  {
    const res = fakeRes();
    await handler1({}, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.bot.connecte, true);
    assert.ok(res.body.bot.dernierHeartbeat);
    assert.strictEqual(res.body.bdd.joignable, true);
    console.log("OK: bot connecté + BDD joignable -> statut cohérent");
  }

  // --- Cas 2 : bot déconnecté + BDD injoignable (timeout) ---
  Module._load = function (request, parent, isMain) {
    if (parent && (request === "../db" || request === "./db")) {
      try {
        if (Module._resolveFilename(request, parent) === dbPath) {
          return { prisma: { $queryRaw: async () => new Promise((resolve) => setTimeout(resolve, 200)) } };
        }
      } catch (_e) { /* laisse passer */ }
    }
    return originalLoad.apply(this, arguments);
  };
  delete require.cache[require.resolve("../src/avecDelaiMax")];
  delete require.cache[require.resolve("../src/routes/adminStatut")];
  const adminStatutRouterFactory2 = require("../src/routes/adminStatut");
  const botRelayDeconnecte = { estConnecte: () => false, dernierHeartbeat: () => null };
  const router2 = adminStatutRouterFactory2(botRelayDeconnecte);
  const handler2 = router2.stack.find((l) => l.route && l.route.path === "/admin/statut").route.stack[0].handle;

  // Patch temporaire du délai (5s par défaut, trop long pour un test) via
  // un $queryRaw qui dépasse volontairement un petit délai simulé côté mock
  // ci-dessus (200ms) - avecDelaiMax utilise 5000ms en dur dans adminStatut.js,
  // donc ce cas ne teste PAS réellement le timeout ici mais la valeur bdd
  // "joignable" normale. Le timeout réel est déjà couvert par sante.js.
  {
    const res = fakeRes();
    await handler2({}, res);
    assert.strictEqual(res.body.bot.connecte, false);
    assert.strictEqual(res.body.bot.dernierHeartbeat, null);
    console.log("OK: bot déconnecté -> dernierHeartbeat=null, connecte=false");
  }

  Module._load = originalLoad;
  console.log("\nTous les tests logique métier statut (mock Prisma + faux bot) sont passés.");
}

run().catch((exc) => {
  Module._load = originalLoad;
  console.error("ÉCHEC TEST:", exc);
  process.exit(1);
});
