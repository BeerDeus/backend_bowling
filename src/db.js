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

module.exports = { prisma };
