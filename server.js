// Phase 1 - Serveur Node.js + WebSocket (Socket.io)
// Rôle : relayer les commandes des bornes (tablettes) vers le bot Conqueror,
// et renvoyer le statut du bot aux bornes. Aucune logique métier lourde ici :
// c'est un PoC pour valider le canal temps réel (cf. Roadmap Phase 1).

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }, // à restreindre en prod
});

const PORT = process.env.PORT || 3000;

// État en mémoire (suffisant pour le PoC ; en Phase 2 ça part en PostgreSQL)
let botSocket = null;
let botLastHeartbeat = null;
const HEARTBEAT_TIMEOUT_MS = 10_000;

app.get("/", (req, res) => {
  res.json({
    status: "ok",
    botConnecte: botSocket !== null,
    dernierHeartbeat: botLastHeartbeat,
  });
});

io.on("connection", (socket) => {
  console.log(`[connexion] client ${socket.id}`);

  // Ping/pong de base (test de connectivité brut)
  socket.on("ping_test", (payload, ack) => {
    const reponse = { pong: true, recu: payload, serveurTime: Date.now() };
    if (typeof ack === "function") ack(reponse);
    else socket.emit("pong_test", reponse);
  });

  // Le bot Conqueror s'identifie au serveur
  socket.on("bot_register", () => {
    botSocket = socket;
    botLastHeartbeat = Date.now();
    console.log(`[bot] enregistré (${socket.id})`);
    io.emit("bot_status", { connecte: true });
  });

  // Heartbeat périodique envoyé par le bot (cf. CDC section 2.4 - healthcheck actif)
  socket.on("bot_heartbeat", () => {
    if (botSocket && botSocket.id === socket.id) {
      botLastHeartbeat = Date.now();
    }
  });

  // Une borne demande la création d'une nouvelle partie
  socket.on("nouvelle_partie", (data) => {
    console.log(`[commande] nouvelle_partie reçue de ${socket.id} :`, data);

    if (!botSocket) {
      socket.emit("nouvelle_partie_resultat", {
        succes: false,
        erreur: "bot_indisponible",
      });
      return;
    }

    // On relaie au bot et on attend son acquittement (avec timeout)
    botSocket.timeout(8000).emit(
      "executer_nouvelle_partie",
      data,
      (err, reponseBot) => {
        if (err) {
          socket.emit("nouvelle_partie_resultat", {
            succes: false,
            erreur: "timeout_bot",
          });
          return;
        }
        socket.emit("nouvelle_partie_resultat", reponseBot);
      }
    );
  });

  socket.on("disconnect", () => {
    console.log(`[déconnexion] client ${socket.id}`);
    if (botSocket && botSocket.id === socket.id) {
      botSocket = null;
      io.emit("bot_status", { connecte: false });
      console.log("[bot] déconnecté");
    }
  });
});

// Surveillance du heartbeat du bot -> alerte si silence trop long
setInterval(() => {
  if (botSocket && Date.now() - botLastHeartbeat > HEARTBEAT_TIMEOUT_MS) {
    console.warn("[ALERTE] Bot Conqueror silencieux depuis > 10s");
    io.emit("bot_status", { connecte: false, raison: "heartbeat_perdu" });
    botSocket = null;
  }
}, 5000);

server.listen(PORT, () => {
  console.log(`Serveur backend démarré sur http://localhost:${PORT}`);
});
