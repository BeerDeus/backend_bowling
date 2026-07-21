// Auth interne (JWT + bcrypt) - cf. demande Beer 2026-07-21 : sécuriser
// /api/admin/* (jusqu'ici en accès public, sans authentification, y compris
// les mutations sur les tarifs bowling). Pas de service externe (pas de
// Firebase Auth) : le modèle Utilisateur existe déjà en base
// (email/motDePasseHash/role, cf. schema.prisma) et une vérification JWT ne
// nécessite aucun appel réseau sortant - un point non négligeable vu la
// fiabilité déjà discutable du sortant Hostinger (cf. incident BDD Neon du
// même jour).
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

// Pas de valeur par défaut in-dur : un secret par défaut connu de tous
// (donc dans le code source public du repo) réduirait le JWT à une simple
// formalité. On préfère planter au démarrage plutôt que de servir une auth
// cassée en silence.
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error(
    "JWT_SECRET manquant dans l'environnement - défini requis dans .env (backend) et dans les variables d'environnement Hostinger, cf. .env.example"
  );
}

const DUREE_TOKEN = "12h"; // durée d'une session Back-Office - à ajuster si besoin (CDC ne précise rien ici)

function hacherMotDePasse(motDePasseClair) {
  return bcrypt.hash(motDePasseClair, 10);
}

function verifierMotDePasse(motDePasseClair, hash) {
  return bcrypt.compare(motDePasseClair, hash);
}

function genererToken(utilisateur) {
  return jwt.sign({ sub: utilisateur.id, email: utilisateur.email, role: utilisateur.role }, JWT_SECRET, {
    expiresIn: DUREE_TOKEN,
  });
}

// Renvoie le payload décodé ou lève une erreur (signature invalide, expiré...)
// - laissé volontairement synchrone (jwt.verify est synchrone), à appeler
// dans un try/catch côté appelant.
function verifierToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

module.exports = { hacherMotDePasse, verifierMotDePasse, genererToken, verifierToken };
