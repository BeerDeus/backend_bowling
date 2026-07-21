# Backend (Phase 1 + Phase 2 + Phase 4 Bowling)

## Installation

```
cd backend
npm install
cp .env.example .env   # remplir DATABASE_URL (voir ci-dessous) + JWT_SECRET (voir "Auth Back-Office")
npx prisma generate
npx prisma migrate dev --name init   # crée les tables
node prisma/seed.js                  # articles bar de test + utilisateur admin (affiche le mot de passe généré une fois)
npm start
```

## Auth Back-Office (`/api/admin/*`)

Ajouté le 2026-07-21 (demande Beer) : `/api/admin/*` était jusque-là accessible sans
authentification, y compris les mutations sur les tarifs bowling, alors que le backend
est public sur `bowling.m2s-photo.fr`. Auth interne JWT + bcrypt (pas de service externe
type Firebase - le modèle `Utilisateur` existe déjà en base, et une vérification JWT ne
nécessite aucun appel réseau sortant, un vrai plus vu la fiabilité déjà discutable du
sortant Hostinger, cf. section "Diagnostic BDD").

- `POST /api/auth/login { email, motDePasse }` -> `{ token, utilisateur }`. `GET
  /api/auth/moi` (avec `Authorization: Bearer <token>`) permet à app-admin de vérifier
  qu'une session stockée est toujours valide.
- `exigerAuth` (cf. `src/middlewareAuth.js`) est monté globalement sur `/api/admin/*`
  dans `server.js` : tout utilisateur actif connecté peut lire (commandes, statut),
  quel que soit son rôle. `exigerRole("ADMIN")` restreint en plus les mutations de
  `adminTarifsBowling.js` (création/modif/suppression de tarifs) au rôle ADMIN.
- `JWT_SECRET` est **obligatoire** (`src/auth.js` fait planter le serveur au démarrage
  s'il est absent, volontairement - pas de valeur par défaut en dur dans le code source
  public). À définir en local (`.env`) ET dans les variables d'environnement Hostinger
  (pas automatique via `git push`). Génère une valeur avec
  `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`.
- Comptes créés à la main via `prisma/seed.js` (pas d'inscription en self-service) - le
  seed régénère un mot de passe ADMIN (affiché une seule fois en console) uniquement si
  le compte `admin@bowling.local` n'existe pas encore ou porte encore l'ancien
  placeholder `"CHANGER_MOI"` (qui n'était PAS un hash valide - le login aurait échoué
  pour tout le monde avec l'ancien seed).
- Pas encore fait : self-service (reset mot de passe, création de compte depuis
  app-admin) - comptes ACCUEIL/BAR à créer à la main en base pour l'instant.

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
genre de restriction réseau).

**Implémenté le 2026-07-21** (cf. `src/db.js`) suite à une nouvelle confirmation du
diagnostic (`/api/admin/statut` renvoyait `bdd.joignable:false`,
`timeout_bdd_apres_5s`, en plein incident au moment où Beer a re-cloné le projet sur
un nouveau PC - à l'origine du "Failed to fetch" sur l'historique des commandes côté
app-admin). Le driver n'est activé que si `DATABASE_URL` pointe vers un host
`*.neon.tech` (sinon Prisma garde le driver `pg` standard, pour ne pas casser le dev
local avec une Postgres Docker classique). Après ce changement :
`npm install` puis `npx prisma generate` (nécessaire suite à l'ajout de
`previewFeatures = ["driverAdapters"]` dans `schema.prisma`).

**Important - secret exposé** : un fichier `.env` contenant une vraie `DATABASE_URL`
(avec mot de passe Neon en clair) a été commit puis supprimé (commit "Pc Perso",
2026-07-21) - il reste donc lisible dans l'historique git. À faire : régénérer le mot
de passe de la BDD Neon (dashboard Neon > Reset password) et mettre à jour
`DATABASE_URL` partout (Hostinger + `.env` local), `.env` ne devant jamais être commit
(déjà dans `.gitignore`, mais git ne rétro-ignore pas un fichier déjà suivi).

## Mise à jour de schéma (2026-07-19) - modules commande + numérotation

Ajout du parcours client Bowling complet (wizard) + identifiant humain par module
(BO001, BA001...). Après avoir tiré ces fichiers :

```
cd backend
npm install
npx prisma generate
npx prisma migrate dev --name ajout_bowling_module_numero
```

Nouveautés côté schéma : `Commande.numero`/`module` (généré via `CompteurModule`, cf.
`src/numeroCommande.js`), `Commande.cgvAccepteesLe`/`codeAvantageSaisi`/`botSucces`/
`botErreur`/`botPiste`, nouveau modèle `CommandeJoueurBowling`. Les commandes de test déjà
en base gardent `numero = null` (pas de backfill, sans conséquence).

Nouvelle route : `POST /api/commandes-bowling` (crée la commande, simule le paiement -
toujours un succès tant que la Phase 3/TPE n'est pas branchée - puis relaie au bot
Conqueror via `src/botRelay.js`, réutilisé aussi par le canal socket direct historique).
Testé via mock : `node test/bowlingCommandes.logique.test.js`.

## Trivec (mock)

Pas d'accès à l'API/sandbox Trivec à ce jour. `src/trivec/client.js` expose une
interface stable (`TrivecClient.envoyerCommande`) avec une implémentation mock qui
logge le payload et simule une réponse. Bascule via `TRIVEC_MODE=reel` une fois l'accès
obtenu (implémenter alors `TrivecClientReel`, rien d'autre à changer). `TRIVEC_MOCK_ECHEC=true`
force un échec simulé, utile pour tester le cas d'erreur.

## Tests

```
node test/commandes.logique.test.js
node test/bowlingCommandes.logique.test.js
```
Tests logique métier (calcul du total serveur, validations, contrainte PAYEE, échec
Trivec, numérotation par module, paiement simulé, échec bot) via un mock Prisma en
mémoire (cf. `test/_mockPrisma.js`) - pas besoin d'une vraie Postgres pour ces tests.
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
