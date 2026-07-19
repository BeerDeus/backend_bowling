// Client Prisma unique (singleton) - évite d'ouvrir une nouvelle pool de
// connexions à chaque import, notamment avec le rechargement à chaud.
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

module.exports = { prisma };
