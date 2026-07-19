// Adaptateur Trivec (CDC 2.3 / Roadmap Phase 2)
// ---------------------------------------------------------------------------
// Pas d'accès à l'API/sandbox Trivec à ce jour (2026-07-19). Plutôt que de
// bloquer tout le flux commande -> BDD -> caisse, on isole l'appel réel
// derrière une interface stable (envoyerCommande). Le reste du backend ne
// connaît que cette interface, jamais l'implémentation concrète : brancher
// la vraie API Trivec plus tard consistera à écrire TrivecClientReel
// ci-dessous et à changer TRIVEC_MODE, sans toucher aux routes ni au schéma.
//
// Le mock "envoie dans le vent" : il logge le payload exact qui serait
// transmis (format encore à ajuster une fois la doc Trivec réelle connue) et
// renvoie une réponse simulée, comme si le ticket avait été imprimé au bar.

const MODE = process.env.TRIVEC_MODE || "mock";

class TrivecClient {
  // eslint-disable-next-line no-unused-vars
  async envoyerCommande(_commande) {
    throw new Error("TrivecClient.envoyerCommande() non implémentée");
  }
}

class TrivecClientMock extends TrivecClient {
  async envoyerCommande(commande) {
    const payload = {
      referenceCommande: commande.id,
      articles: commande.lignes.map((ligne) => ({
        // codeTrivec peut être null tant que l'article n'a pas été rapproché
        // du vrai catalogue Trivec (article "test", cf. Produit.estArticleTest)
        codeArticle: ligne.produit.codeTrivec || `TEST-${ligne.produit.id}`,
        libelle: ligne.produit.nom,
        quantite: ligne.quantite,
        prixUnitaireCentimes: ligne.prixUnitaireCentimes,
      })),
      totalCentimes: commande.totalCentimes,
    };

    console.log("[trivec][mock] Envoi (dans le vent) :", JSON.stringify(payload));

    // Permet de tester le cas d'échec (cf. Roadmap Phase 2 - "tests
    // d'intégration ... cas d'échec d'impression") sans dépendre de la
    // vraie API : TRIVEC_MOCK_ECHEC=true force une réponse en échec.
    if (process.env.TRIVEC_MOCK_ECHEC === "true") {
      console.warn("[trivec][mock] Échec simulé (TRIVEC_MOCK_ECHEC=true)");
      return { succes: false, erreur: "echec_impression_simule" };
    }

    // Petit délai simulé, pour se rapprocher d'un vrai appel réseau.
    await new Promise((resolve) => setTimeout(resolve, 150));

    return {
      succes: true,
      ticketTrivecId: `MOCK-${Date.now()}`,
    };
  }
}

class TrivecClientReel extends TrivecClient {
  async envoyerCommande() {
    // TODO : implémenter dès que l'accès API/sandbox Trivec est disponible
    // (cf. CDC 2.3 - REST ou XML/JSON selon ce que Trivec expose réellement).
    throw new Error(
      "TrivecClientReel non implémentée : API Trivec pas encore accessible (cf. Roadmap Phase 2)"
    );
  }
}

let instance = null;

function getTrivecClient() {
  if (!instance) {
    instance = MODE === "reel" ? new TrivecClientReel() : new TrivecClientMock();
    console.log(`[trivec] Adaptateur initialisé en mode "${MODE}"`);
  }
  return instance;
}

module.exports = { getTrivecClient, TrivecClient, TrivecClientMock, TrivecClientReel };
