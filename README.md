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
- **à ajouter côté BDD** après la première vraie migration : éditer le fichier SQL généré
  dans `prisma/migrations/.../migration.sql` pour y ajouter :
  ```sql
  ALTER TABLE "commandes" ADD CONSTRAINT statut_payee_transaction_check
    CHECK (statut <> 'PAYEE' OR "transactionTpeId" IS NOT NULL);
  ```

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

## Vérifié dans cette session (2026-07-19)

`prisma validate`/`generate` n'ont pas pu être exécutés dans l'environnement de
développement utilisé pour écrire ce code (le domaine `binaries.prisma.sh`, qui sert les
binaires d'engine Prisma, y était bloqué par la sandbox réseau - 403 Forbidden). Le schéma
a été relu manuellement et la logique métier des routes est testée (`test/`), mais lance
`npx prisma generate` sur ta machine (réseau normal) avant de considérer la Phase 2 comme
définitivement validée.
