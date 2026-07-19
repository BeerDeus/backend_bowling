// Test logique de la résolution de tarif Bowling (cf. src/tarificationBowling.js)
// - pure fonction, pas de BDD à mocker. Couvre spécifiquement la question de
// Beer (2026-07-19) : "13h-16h59 et 17h-2h ou 13h-17h et 17h-2h ?" (réponse :
// 13h-17h, cf. convention heureFin exclusive documentée dans le fichier
// testé) + le cas "on ferme après minuit" (plage à cheval sur minuit).
//
// Lancer : node test/tarificationBowling.logique.test.js (depuis backend/)
const assert = require("assert");
const { trouverTarifActif } = require("../src/tarificationBowling");

// Construit une date sur le PROCHAIN jour correspondant à `jourCible`
// (convention JS Date.getDay(), 0=dimanche...6=samedi) à partir d'une
// ancre fixe, plutôt que de calculer la date à la main (source d'erreur) -
// le résultat est garanti correct quel que soit le jour de la semaine réel
// de l'ancre.
function dateAvecJour(jourCible, heure, minute) {
  const ancre = new Date(2024, 0, 1);
  for (let i = 0; i < 7; i++) {
    const d = new Date(ancre);
    d.setDate(ancre.getDate() + i);
    if (d.getDay() === jourCible) {
      d.setHours(heure, minute, 0, 0);
      return d;
    }
  }
  throw new Error("jour introuvable");
}

const MERCREDI = 3;
const JEUDI = 4;
const VENDREDI = 5;
const SAMEDI = 6;

function run() {
  const apresMidi = { id: "apresmidi", label: "Après-midi", heureDebut: "13:00", heureFin: "17:00", jours: [MERCREDI], prixParPartieCentimes: 500, ordre: 0, actif: true };
  const soiree = { id: "soiree", label: "Soirée", heureDebut: "17:00", heureFin: "02:00", jours: [MERCREDI], prixParPartieCentimes: 700, ordre: 0, actif: true };
  const tarifs = [apresMidi, soiree];

  // --- Enchaînement 13h-17h / 17h-2h (LA question de Beer) ---
  {
    const t = trouverTarifActif(tarifs, dateAvecJour(MERCREDI, 16, 59));
    assert.strictEqual(t.id, "apresmidi");
    console.log("OK: mercredi 16:59 -> Après-midi");
  }
  {
    const t = trouverTarifActif(tarifs, dateAvecJour(MERCREDI, 17, 0));
    assert.strictEqual(t.id, "soiree");
    console.log("OK: mercredi 17:00 pile -> Soirée (pas de trou ni de chevauchement avec Après-midi)");
  }
  {
    const t = trouverTarifActif(tarifs, dateAvecJour(MERCREDI, 13, 0));
    assert.strictEqual(t.id, "apresmidi");
    console.log("OK: mercredi 13:00 pile -> Après-midi (borne de début incluse)");
  }

  // --- Plage à cheval sur minuit ("on ferme après minuit") ---
  {
    const t = trouverTarifActif(tarifs, dateAvecJour(JEUDI, 1, 59));
    assert.strictEqual(t.id, "soiree");
    console.log("OK: jeudi 01:59 -> Soirée (portion après minuit de la plage 'mercredi')");
  }
  {
    const t = trouverTarifActif(tarifs, dateAvecJour(JEUDI, 2, 0));
    assert.strictEqual(t, null);
    console.log("OK: jeudi 02:00 pile -> aucune plage (borne de fin exclue)");
  }
  {
    // La plage "Soirée" est configurée jours=[mercredi] uniquement - ne doit
    // PAS s'appliquer jeudi soir (elle appartiendrait à une éventuelle plage
    // "jeudi 17h-2h" distincte, pas testée ici).
    const t = trouverTarifActif(tarifs, dateAvecJour(JEUDI, 23, 30));
    assert.strictEqual(t, null);
    console.log("OK: jeudi 23:30 -> aucune plage (Soirée est rattachée au mercredi, pas au jeudi)");
  }

  // --- Aucune plage configurée pour ce jour ---
  {
    const t = trouverTarifActif(tarifs, dateAvecJour(SAMEDI, 15, 0));
    assert.strictEqual(t, null);
    console.log("OK: samedi (aucune plage configurée) -> null");
  }

  // --- Priorité via `ordre` en cas de chevauchement volontaire ---
  {
    const promoPrioritaire = { id: "promo", label: "Promo étudiants", heureDebut: "13:00", heureFin: "17:00", jours: [MERCREDI], prixParPartieCentimes: 300, ordre: -1, actif: true };
    const t = trouverTarifActif([apresMidi, promoPrioritaire], dateAvecJour(MERCREDI, 14, 0));
    assert.strictEqual(t.id, "promo");
    console.log("OK: deux plages actives en même temps -> ordre le plus petit gagne");
  }

  // --- Plage inactive ignorée ---
  {
    const inactive = { ...apresMidi, id: "inactif", actif: false };
    const t = trouverTarifActif([inactive], dateAvecJour(MERCREDI, 14, 0));
    assert.strictEqual(t, null);
    console.log("OK: plage inactive -> ignorée");
  }

  console.log("\nTous les tests logique métier tarification Bowling sont passés.");
}

run();
