// Test logique de l'auth Back-Office (cf. src/auth.js, src/middlewareAuth.js,
// src/routes/auth.js - demande Beer 2026-07-21, sécuriser /api/admin/*) -
// même mécanisme que les autres tests logique (mock Prisma via Module._load,
// pas de vraie BDD). jwt/bcrypt eux-mêmes ne sont PAS mockés (logique pure,
// rapide, pas d'intérêt à les simuler).
//
// Lancer : node test/adminAuth.logique.test.js (depuis backend/)
process.env.JWT_SECRET = "secret-de-test-uniquement"; // requis avant le premier require de ../src/auth

const assert = require("assert");
const path = require("path");
const Module = require("module");
const { creerPrismaMock } = require("./_mockPrisma");

const { prisma: prismaMock, _interne } = creerPrismaMock();

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
  const { hacherMotDePasse, verifierMotDePasse, genererToken, verifierToken } = require("../src/auth");
  const { exigerAuth, exigerRole } = require("../src/middlewareAuth");

  // --- hachage / vérification mot de passe ---
  {
    const hash = await hacherMotDePasse("motdepasse123");
    assert.notStrictEqual(hash, "motdepasse123");
    assert.strictEqual(await verifierMotDePasse("motdepasse123", hash), true);
    assert.strictEqual(await verifierMotDePasse("mauvais", hash), false);
    console.log("OK: hachage/vérification mot de passe (bcrypt)");
  }

  // --- génération / vérification token ---
  {
    const token = genererToken({ id: "u1", email: "admin@bowling.local", role: "ADMIN" });
    const payload = verifierToken(token);
    assert.strictEqual(payload.sub, "u1");
    assert.strictEqual(payload.email, "admin@bowling.local");
    assert.strictEqual(payload.role, "ADMIN");
    console.log("OK: genererToken/verifierToken round-trip");
  }
  {
    assert.throws(() => verifierToken("token.invalide.tamponne"));
    console.log("OK: token invalide -> verifierToken lève une erreur");
  }

  // --- middleware exigerAuth ---
  {
    const res = fakeRes();
    let appelSuivant = false;
    exigerAuth({ headers: {} }, res, () => { appelSuivant = true; });
    assert.strictEqual(res.statusCode, 401);
    assert.strictEqual(appelSuivant, false);
    console.log("OK: exigerAuth sans header Authorization -> 401");
  }
  {
    const res = fakeRes();
    let appelSuivant = false;
    exigerAuth({ headers: { authorization: "Bearer token-invalide" } }, res, () => { appelSuivant = true; });
    assert.strictEqual(res.statusCode, 401);
    assert.strictEqual(appelSuivant, false);
    console.log("OK: exigerAuth avec token invalide -> 401");
  }
  {
    const token = genererToken({ id: "u1", email: "admin@bowling.local", role: "ADMIN" });
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = fakeRes();
    let appelSuivant = false;
    exigerAuth(req, res, () => { appelSuivant = true; });
    assert.strictEqual(appelSuivant, true);
    assert.strictEqual(req.utilisateur.role, "ADMIN");
    console.log("OK: exigerAuth avec token valide -> next() + req.utilisateur peuplé");
  }

  // --- middleware exigerRole ---
  {
    const exigerAdmin = exigerRole("ADMIN");
    const res = fakeRes();
    let appelSuivant = false;
    exigerAdmin({ utilisateur: { role: "BAR" } }, res, () => { appelSuivant = true; });
    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(appelSuivant, false);
    console.log("OK: exigerRole('ADMIN') avec rôle BAR -> 403");
  }
  {
    const exigerAdmin = exigerRole("ADMIN");
    const res = fakeRes();
    let appelSuivant = false;
    exigerAdmin({ utilisateur: { role: "ADMIN" } }, res, () => { appelSuivant = true; });
    assert.strictEqual(appelSuivant, true);
    console.log("OK: exigerRole('ADMIN') avec rôle ADMIN -> next()");
  }

  // --- route POST /auth/login ---
  const hashValide = await hacherMotDePasse("bonMotDePasse");
  _interne.utilisateurs.set("u1", {
    id: "u1", email: "admin@bowling.local", motDePasseHash: hashValide, role: "ADMIN", actif: true,
  });
  _interne.utilisateurs.set("u2", {
    id: "u2", email: "inactif@bowling.local", motDePasseHash: hashValide, role: "BAR", actif: false,
  });

  delete require.cache[require.resolve("../src/routes/auth")];
  const authRouter = require("../src/routes/auth");
  const loginHandler = authRouter.stack.find((l) => l.route && l.route.path === "/auth/login").route.stack[0].handle;

  {
    const res = fakeRes();
    await loginHandler({ body: { email: "inconnu@bowling.local", motDePasse: "x" } }, res);
    assert.strictEqual(res.statusCode, 401);
    assert.strictEqual(res.body.erreur, "identifiants_invalides");
    console.log("OK: login email inconnu -> 401 identifiants_invalides");
  }
  {
    const res = fakeRes();
    await loginHandler({ body: { email: "admin@bowling.local", motDePasse: "mauvais" } }, res);
    assert.strictEqual(res.statusCode, 401);
    console.log("OK: login mauvais mot de passe -> 401");
  }
  {
    const res = fakeRes();
    await loginHandler({ body: { email: "inactif@bowling.local", motDePasse: "bonMotDePasse" } }, res);
    assert.strictEqual(res.statusCode, 401);
    console.log("OK: login compte inactif -> 401 (mot de passe pourtant correct)");
  }
  {
    const res = fakeRes();
    await loginHandler({ body: { email: "ADMIN@bowling.local ", motDePasse: "bonMotDePasse" } }, res);
    assert.strictEqual(res.statusCode, 200);
    assert.ok(res.body.token);
    assert.strictEqual(res.body.utilisateur.email, "admin@bowling.local");
    assert.strictEqual(res.body.utilisateur.motDePasseHash, undefined);
    const payload = verifierToken(res.body.token);
    assert.strictEqual(payload.role, "ADMIN");
    console.log("OK: login nominal (email avec casse/espaces différents) -> 200, token exploitable, hash non exposé");
  }
  {
    const res = fakeRes();
    await loginHandler({ body: { email: "admin@bowling.local" } }, res);
    assert.strictEqual(res.statusCode, 400);
    console.log("OK: login sans motDePasse -> 400");
  }

  Module._load = originalLoad;
  console.log("\nTous les tests logique métier auth (mock Prisma) sont passés.");
}

run().catch((exc) => {
  Module._load = originalLoad;
  console.error("ÉCHEC TEST:", exc);
  process.exit(1);
});
