// Relai bot Conqueror (Phase 1) - extrait de server.js pour être réutilisable
// à la fois par le canal socket direct (tests manuels, cf. app-borne
// Bowling.jsx "debug") et par les routes REST qui orchestrent un flux complet
// côté serveur (ex: POST /api/commandes-bowling, cf. Roadmap Phase 4).
function creerBotRelay(io) {
  let botSocket = null;
  let botLastHeartbeat = null;
  const HEARTBEAT_TIMEOUT_MS = 10_000;

  // Incident du 2026-07-19 : timeout fixe à 8s hérité du PoC Phase 1 (calibré
  // sur "créer une piste sans configurer personne"), beaucoup trop court une
  // fois le bot capable de renommer chaque joueur + choisir son tarif/parties
  // (cf. bot/conqueror_bot.py - plusieurs secondes par joueur, dialogues +
  // fenêtres PDV successives). Résultat observé : le bot finit réellement le
  // travail dans Conqueror, mais l'acquittement socket arrive après le
  // timeout -> le serveur enregistre "timeout_bot" alors que la partie a bien
  // été créée. Le budget est donc maintenant calculé selon le nombre de
  // joueurs plutôt qu'une constante unique.
  const TIMEOUT_BASE_MS = 15_000; // "Sple Partie" + "Nbre joueurs"
  const TIMEOUT_PAR_JOUEUR_MS = 15_000; // renommage + choix du tarif/parties

  function executerNouvellePartie(data) {
    const nbJoueurs = Array.isArray(data && data.joueurs) ? data.joueurs.length : 1;
    const timeoutMs = TIMEOUT_BASE_MS + nbJoueurs * TIMEOUT_PAR_JOUEUR_MS;

    return new Promise((resolve, reject) => {
      if (!botSocket) {
        reject(new Error("bot_indisponible"));
        return;
      }
      botSocket.timeout(timeoutMs).emit("executer_nouvelle_partie", data, (err, reponseBot) => {
        if (err) {
          reject(new Error("timeout_bot"));
          return;
        }
        resolve(reponseBot);
      });
    });
  }

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

    // Heartbeat périodique envoyé par le bot (cf. CDC 2.4 - healthcheck actif)
    socket.on("bot_heartbeat", () => {
      if (botSocket && botSocket.id === socket.id) {
        botLastHeartbeat = Date.now();
      }
    });

    // Canal direct historique (Phase 1, tests manuels depuis app-borne/test-client)
    // - passe maintenant par executerNouvellePartie() comme la route REST,
    // pour ne pas dupliquer la logique de relai.
    socket.on("nouvelle_partie", (data) => {
      console.log(`[commande] nouvelle_partie reçue de ${socket.id} :`, data);
      executerNouvellePartie(data)
        .then((resultat) => socket.emit("nouvelle_partie_resultat", resultat))
        .catch((exc) =>
          socket.emit("nouvelle_partie_resultat", { succes: false, erreur: exc.message })
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

  return {
    estConnecte: () => botSocket !== null,
    dernierHeartbeat: () => botLastHeartbeat,
    executerNouvellePartie,
  };
}

module.exports = { creerBotRelay };
