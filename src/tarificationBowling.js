// Résolution du tarif Bowling actif à un instant donné, à partir des plages
// configurées en Back-Office (cf. routes/adminTarifsBowling.js,
// PlageTarifaireBowling dans schema.prisma).
//
// PAS ENCORE APPELÉ par la création de commande (routes/bowlingCommandes.js
// force toujours totalCentimes=0, paiement simulé) ni par le bot Conqueror
// (tarif "1" en dur, cf. bot/conqueror_bot.py) - utilitaire isolé ici pour
// être testable indépendamment (cf. test/tarificationBowling.logique.test.js)
// et prêt pour le câblage une fois la Phase 3 (paiement réel) démarrée.
//
// Convention horaires (question Beer 2026-07-19, "13h-16h59 et 17h-2h ou
// 13h-17h et 17h-2h ?") : heureDebut INCLUSIVE, heureFin EXCLUSIVE - comme la
// plupart des systèmes de créneaux (ex: réservation). Deux plages adjacentes
// s'enchaînent donc SANS trou ni chevauchement en utilisant directement
// l'heure ronde des deux côtés : 13:00-17:00 puis 17:00-02:00 (pas besoin de
// "16:59"). À 17:00 pile, c'est la 2e plage qui s'applique.
//
// Plages à cheval sur minuit supportées (ex: 17:00 -> 02:00, "on ferme après
// minuit") : détectées dès que heureFin <= heureDebut (comparaison
// lexicographique sur le format "HH:MM"). `jours` désigne le(s) jour(s) de
// DÉBUT de la plage (ex: jours=[5] + 23:00->02:00 = actif vendredi 23h
// jusqu'à samedi 2h, PAS samedi 23h -> dimanche 2h).
function estPlageActive(tarif, heureCourante, jourCourant) {
  const chevaucheMinuit = tarif.heureFin <= tarif.heureDebut;

  if (!chevaucheMinuit) {
    return tarif.jours.includes(jourCourant) && heureCourante >= tarif.heureDebut && heureCourante < tarif.heureFin;
  }

  // Portion "avant minuit" : jour de `jours`, de heureDebut à 24:00.
  const avantMinuit = tarif.jours.includes(jourCourant) && heureCourante >= tarif.heureDebut;
  // Portion "après minuit" : jour SUIVANT un jour de `jours`, de 00:00 à heureFin.
  const jourPrecedent = (jourCourant + 6) % 7; // équivalent de "jourCourant - 1", modulo 7
  const apresMinuit = tarif.jours.includes(jourPrecedent) && heureCourante < tarif.heureFin;

  return avantMinuit || apresMinuit;
}

// Retourne la plage active à `date` (défaut: maintenant) parmi `tarifs`, ou
// null si aucune ne s'applique. En cas de plusieurs plages actives en même
// temps (chevauchement volontaire, cf. champ `ordre` dans le schéma), la
// plus petite valeur d'`ordre` gagne.
function trouverTarifActif(tarifs, date = new Date()) {
  const heureCourante = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  const jourCourant = date.getDay();

  const candidats = (tarifs || [])
    .filter((t) => t.actif && estPlageActive(t, heureCourante, jourCourant))
    .slice()
    .sort((a, b) => a.ordre - b.ordre);

  return candidats[0] || null;
}

module.exports = { trouverTarifActif, estPlageActive };
