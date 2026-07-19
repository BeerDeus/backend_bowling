// Phase 1+2+4 - Serveur Node.js + WebSocket (Socket.io) + PostgreSQL (Prisma)
// Rôle : relayer les commandes bowling des bornes vers le bot Conqueror
// (Phase 1), exposer l'API REST catalogue/commandes bar (Phase 2) et
// commandes bowling (Phase 4 - wizard borne, cf. Roadmap).

// IMPORTANT : doit être la toute première ligne exécutée. Contrairement à la
// CLI Prisma (generate/migrate), qui lit .env automatiquement, `node
// server.js` ne charge PAS .env tout seul - sans ça, DATABASE_URL est
// indéfini au runtime même si .env existe et contient la bonne valeur (ça a
// cassé le déploiement du 2026-07-19 : PrismaClient() plantait dès le
// require, donc AVANT même app.listen() -> tout le serveur crashait,
// "Failed to fetch" en local / 503 en boucle sur Hostinger). Si Hostinger (ou
// un autre hébergeur) injecte DATABASE_URL comme vraie variable d'env de la
// plateforme, dotenv ne l'écrase pas (il ne complète que ce qui manque) :
// cette ligne est donc sans risque dans tous les cas.
require("dotenv").config();

const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");

const { creerBotRelay } = require("./src/botRelay");
const santeRouter = require("./src/routes/sante");
const catalogueRouter = require("./src/routes/catalogue");
const commandesRouter = require("./src/routes/commandes");
const bowlingCommandesRouter = require("./src/routes/bowlingCommandes");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }, // à restreindre en prod
});

const PORT = process.env.PORT || 3000;

// IMPORTANT : le `cors: { origin: "*" }` passé au constructeur Socket.io
// ci-dessous ne couvre QUE le canal WebSocket/polling de Socket.io lui-même
// - il ne s'applique PAS aux routes Express classiques (/api/*). Sans ce
// middleware, l'app-borne en dev (http://localhost:5173) ne peut appeler
// AUCUNE route /api/* du backend en prod (bloqué par le préflight CORS du
// navigateur, cf. incident du 2026-07-19). À restreindre à des origines
// précises une fois l'app finalisée (Capacitor, domaine de prod...).
app.use(cors());
app.use(express.json());

// Relai bot Conqueror (connexion socket, heartbeat, exécution des commandes)
// - cf. src/botRelay.js. Réutilisé par le canal socket direct (tests
// manuels) ET par la route REST /api/commandes-bowling.
const botRelay = creerBotRelay(io);

app.get("/", (req, res) => {
  res.json({
    status: "ok",
    botConnecte: botRelay.estConnecte(),
    dernierHeartbeat: botRelay.dernierHeartbeat(),
  });
});

// --- API REST ---
app.use("/api", santeRouter);
app.use("/api", catalogueRouter);
app.use("/api", commandesRouter(io));
app.use("/api", bowlingCommandesRouter(botRelay));

// Filet de sécurité : une erreur dans une route async (ex: BDD injoignable)
// ne doit JAMAIS faire planter tout le process (ce qui coupe aussi le canal
// bot Conqueror) - juste renvoyer un 500 propre pour CETTE requête. Les
// routes appellent next(err) via asyncHandler (cf. src/asyncHandler.js) pour
// arriver ici.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error("[erreur]", err);
  res.status(500).json({ erreur: "erreur_serveur", message: err.message });
});

// Filet de sécurité de dernier recours (ex: erreur dans un handler socket.io,
// pas couvert par le middleware d'erreur Express ci-dessus) : on logue au
// lieu de laisser Node tuer tout le process par défaut (cf. incident du
// 2026-07-19 - DATABASE_URL manquant crashait tout le serveur, coupant du
// même coup le canal bot Conqueror). Ne remplace pas un vrai try/catch
// localisé, mais évite qu'une erreur isolée mette toute la borne hors
// service.
process.on("unhandledRejection", (raison) => {
  console.error("[ALERTE][unhandledRejection]", raison);
});
process.on("uncaughtException", (erreur) => {
  console.error("[ALERTE][uncaughtException]", erreur);
});

server.listen(PORT, () => {
  console.log(`Serveur backend démarré sur http://localhost:${PORT}`);
});
