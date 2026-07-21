// Client Prisma unique (singleton) - évite d'ouvrir une nouvelle pool de
// connexions à chaque import, notamment avec le rechargement à chaud.
//
// Driver Neon (HTTP) au lieu d'une connexion TCP brute sur le port 5432 :
// confirmé le 2026-07-21 via /api/admin/statut ("bdd":{"joignable":false,
// "erreur":"timeout_bdd_apres_5s"}) que l'hébergement mutualisé Hostinger
// bloque/filtre les connexions TCP sortantes vers ce port - déjà pressenti
// lors de l'incident du 2026-07-19 (cf. backend/README.md, section
// "Diagnostic BDD"). Résultat concret : toutes les routes qui touchent la
// BDD (dont /api/admin/commandes, l'historique des commandes côté
// Back-Office) échouent en prod ("Failed to fetch" côté navigateur), alors
// que ça fonctionne en local avec la même DATABASE_URL. Le driver
// @neondatabase/serverless interroge Neon via HTTPS (port 443, comme
// n'importe quelle requête web) au lieu du protocole Postgres brut, ce qui
// contourne ce filtrage réseau. Aucun rapport avec le bot Conqueror (canal
// WebSocket totalement séparé, cf. botRelay.js) : le bot n'a jamais eu
// besoin d'être en route pour consulter l'historique des commandes.
//
// Ne s'applique qu'aux URLs Neon (host en *.neon.tech) : en local avec une
// Postgres classique (Docker, cf. backend/README.md), on garde le driver
// pg standard de Prisma, que le proxy HTTP de Neon ne sait pas servir.
const { PrismaClient } = require("@prisma/client");

const databaseUrl = process.env.DATABASE_URL || "";
const estNeon = /neon\.tech/i.test(databaseUrl);

let prisma;

if (estNeon) {
  const { Pool, neonConfig } = require("@neondatabase/serverless");
  const { PrismaNeon } = require("@prisma/adapter-neon");

  // Force le mode "fetch" (une requête HTTP simple par appel) plutôt que le
  // pooling par WebSocket : c'est le mode le plus compatible avec un
  // réseau/proxy restrictif comme celui d'un hébergement mutualisé.
  neonConfig.poolQueryViaFetch = true;

  const pool = new Pool({ connectionString: databaseUrl });
  const adapter = new PrismaNeon(pool);
  prisma = new PrismaClient({ adapter });
} else {
  prisma = new PrismaClient();
}

// Exposé pour diagnostic (cf. /api/admin/statut) : permet de vérifier depuis
// l'extérieur, sans accès aux logs Hostinger, si le driver Neon HTTP est
// bien celui réellement chargé en prod après un déploiement - au lieu de
// deviner d'après le comportement (un timeout identique avant/après un push
// peut aussi bien vouloir dire "le nouveau driver est actif mais bloqué
// autrement" que "le nouveau code n'a jamais été déployé").
const driverBdd = estNeon ? "neon-http" : "pg-standard";

// Idem, hostname extrait de DATABASE_URL - utilisé par /api/admin/statut
// pour un fetch brut (sans Prisma/auth) vers l'hôte Neon, histoire
// d'isoler "Hostinger ne joint pas cet hôte du tout" de "Hostinger le
// joint mais Neon ne répond pas à la requête authentifiée".
let hostBdd = null;
try {
  hostBdd = new URL(databaseUrl.replace(/^postgres(ql)?:/, "https:")).hostname || null;
} catch (_exc) {
  hostBdd = null;
}

module.exports = { prisma, driverBdd, hostBdd };
