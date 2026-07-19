# Backend (Phase 1 + Phase 2)

## Installation

```
cd backend
npm install
cp .env.example .env   # remplir DATABASE_URL (voir ci-dessous)
npx prisma generate
npx prisma migrate dev --name init   # crée les tables
node prisma/seed.js                  # articles bar de test + utilisateur admin
npm start
```

## Base de données PostgreSQL - option d'hébergement

Hostinger mutualisé (là où tourne actuellement `site-hostinger/`) ne fait **pas**
tourner Postgres nativement. Deux options pour la Phase 2 :

- **VPS Hostinger + Docker** (`docker run -e POSTGRES_PASSWORD=... -p 5432:5432 postgres:16`) -
  garde tout chez le même hébergeur, mais nécessite de passer sur une offre VPS.
- **Postgres managé externe** (Neon, Supabase, Railway... offres gratuites suffisantes
  pour du dev/test) - le backend Node s'y connecte via `DATABASE_URL`, où qu'il tourne.

Pour du dev local sur ta machine : `docker run -e POSTGRES_PASSWORD=dev -p 5432:5432 postgres:16`
puis `DATABASE_URL="postgresql://postgres:dev@localhost:5432/postgres"`.

## Contrainte financière (commande PAYEE ⇒ transactionTpeId)

Le schéma Prisma ne peut pas exprimer nativement une contrainte CHECK conditionnelle
(cf. CDC - "une commande ne peut passer en statut Payée que si l'identifiant de
transaction TPE est valide"). Elle est appliquée :
- **côté application** dans `src/routes/commandes.js` (PATCH `/commandes/:id/statut` refuse
  `PAYEE` sans `transactionTpeId`, testé dans `test/commandes.logique.test.js`) ;
- **côté BDD** via la migration `prisma/migrations/20260719140000_add_check_payee_transaction/`
  (déjà écrite - `npx prisma migrate deploy` l'applique en plus de `init`).

## Diagnostic BDD (`/api/sante`)

Ajouté suite à un incident (2026-07-19) : `/api/categories` chargeait indéfiniment sur
Hostinger (sans erreur) alors que tout marchait en local avec la même `DATABASE_URL`.
Hypothèse la plus probable : Hostinger (hébergement mutualisé) filtre/bloque les
connexions TCP sortantes vers un port de BDD externe comme 5432, ce qui fait rester la
requête bloquée indéfiniment (pas d'erreur, pas de timeout par défaut côté Postgres/Prisma).

`GET /api/sante` fait un `SELECT 1` borné à 5s (au lieu de dépendre uniquement du
`connect_timeout` de l'URL) et renvoie soit `{ok:true}`, soit une erreur claire en 503 -
sert à distinguer rapidement "la BDD ne répond pas" d'un autre problème. Toujours garder
`connect_timeout=10` dans `DATABASE_URL` (voir `.env.example`) pour que les vraies routes
échouent proprement plutôt que de pendre indéfiniment.

Si `/api/sante` confirme que la BDD est injoignable depuis Hostinger, la solution standard
est de passer par le driver HTTP de Neon (`@neondatabase/serverless` + `@prisma/adapter-neon`,
qui interroge la BDD via HTTPS au lieu d'une connexion TCP brute sur 5432 - contourne ce
genre de restriction réseau). Pas encore implémenté : à faire si le diagnostic le confirme.

## Trivec (mock)

Pas d'accès à l'API/sandbox Trivec à ce jour. `src/trivec/client.js` expose une
interface stable (`TrivecClient.envoyerCommande`) avec une implémentation mock qui
logge le payload et simule une réponse. Bascule via `TRIVEC_MODE=reel` une fois l'accès
obtenu (implémenter alors `TrivecClientReel`, rien d'autre à changer). `TRIVEC_MOCK_ECHEC=true`
force un échec simulé, utile pour tester le cas d'erreur.

## Tests

```
node test/commandes.logique.test.js
```
Test logique métier (calcul du total serveur, validations, contrainte PAYEE, échec
Trivec) via un mock Prisma en mémoire - pas besoin d'une vraie Postgres pour ce test.
Un vrai test d'intégration (Postgres réelle) reste à écrire une fois une instance dispo.

## Incidents résolus (2026-07-19)

- **Prisma 7 incompatible** : `^7.8.0` (résolu automatiquement par npm) a cassé `migrate`
  (`url` dans `datasource` plus supporté sans `prisma.config.ts` + adaptateur). Figé sur
  `5.22.0` (exact, pas de `^`) dans `package.json` - stable, compatible avec le schéma tel
  quel.
- **DATABASE_URL non chargé au runtime** : la CLI Prisma (`generate`/`migrate`) lit `.env`
  automatiquement, mais `node server.js` non - sans `dotenv`, le process crashait dès le
  `require` (avant même `app.listen()`), d'où "Failed to fetch" en local et 503 en boucle
  sur Hostinger. Fix : `require("dotenv").config()` en toute première ligne de
  `server.js`. Si l'hébergeur injecte déjà `DATABASE_URL` comme vraie variable d'env de la
  plateforme, `dotenv` ne l'écrase pas (sans risque).
- **Crash total sur une erreur de route** : les handlers async d'Express 4 ne remontent pas
  automatiquement une erreur (contrairement à Express 5) - une requête Prisma qui échoue
  partait en unhandled rejection, qui tue tout le process Node par défaut (coupant au passage
  le canal WebSocket bot Conqueror). Fix : `src/asyncHandler.js` (wrapper appliqué à toutes
  les routes) + middleware d'erreur global dans `server.js` (500 propre au lieu d'un crash).

`prisma validate`/`generate` n'ont pas pu être exécutés dans le sandbox utilisé pour écrire
ce code (le domaine `binaries.prisma.sh` y était bloqué - 403 Forbidden) ; la logique métier
est testée via mock (`test/`). Confirmé fonctionnel côté Beer : `migrate dev --name init` a
créé les tables sur la vraie instance Neon.
