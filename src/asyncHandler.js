// Express 4 n'attrape PAS automatiquement le rejet d'une promesse renvoyée
// par un handler async (contrairement à Express 5) : une erreur dedans (ex:
// requête Prisma qui échoue) part en unhandled rejection, qui dans les
// versions récentes de Node.js TUE LE PROCESS ENTIER par défaut - ce qui
// coupe au passage le canal WebSocket bot Conqueror (cf. incident du
// 2026-07-19). Ce wrapper capture l'erreur et la transmet à
// next(err), qui arrive dans le middleware d'erreur de server.js (500 propre
// au lieu d'un crash serveur complet).
function asyncHandler(fn) {
  return function (req, res, next) {
    // "return" ici (et pas juste l'appel) : Express l'ignore de toute façon,
    // mais ça évite un bug plus retors ailleurs (ex: code appelant qui
    // voudrait un jour await ce handler directement, comme les tests) - sans
    // ça, la fonction retournait undefined immédiatement pendant que la
    // vraie requête continuait en tâche de fond (race condition).
    return Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = { asyncHandler };
