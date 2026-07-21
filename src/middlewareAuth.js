// Middlewares d'autorisation pour /api/admin/* (cf. src/auth.js).
const { verifierToken } = require("./auth");

// Vérifie le JWT (header "Authorization: Bearer <token>") et attache
// req.utilisateur ({ id, email, role }) si valide. 401 sinon (token absent,
// invalide ou expiré) - pas de distinction plus fine côté client, inutile
// pour ce cas d'usage (Back-Office interne, pas une API publique tierce).
function exigerAuth(req, res, next) {
  const entete = req.headers.authorization || "";
  const [type, token] = entete.split(" ");
  if (type !== "Bearer" || !token) {
    return res.status(401).json({ erreur: "authentification_requise" });
  }

  try {
    const payload = verifierToken(token);
    req.utilisateur = { id: payload.sub, email: payload.email, role: payload.role };
    next();
  } catch (_exc) {
    res.status(401).json({ erreur: "token_invalide" });
  }
}

// À chaîner APRÈS exigerAuth (utilise req.utilisateur). Restreint une route
// à une liste de rôles (cf. enum RoleUtilisateur - ADMIN/ACCUEIL/BAR).
function exigerRole(...rolesAutorises) {
  return function (req, res, next) {
    if (!req.utilisateur) {
      // Ordre des middlewares mal branché quelque part - fail fast plutôt
      // que de laisser passer par erreur.
      return res.status(401).json({ erreur: "authentification_requise" });
    }
    if (!rolesAutorises.includes(req.utilisateur.role)) {
      return res.status(403).json({ erreur: "role_insuffisant" });
    }
    next();
  };
}

module.exports = { exigerAuth, exigerRole };
