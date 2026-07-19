-- Contrainte financière (CDC 2.2) : une commande ne peut être en statut
-- PAYEE que si transactionTpeId est renseigné. Prisma ne peut pas exprimer
-- une CHECK conditionnelle dans schema.prisma - ajoutée ici à la main
-- (cf. backend/README.md). Déjà appliquée côté application dans
-- src/routes/commandes.js (PATCH /commandes/:id/statut) ; ceci est le
-- filet de sécurité au niveau BDD, en cas d'écriture directe hors API.
ALTER TABLE "commandes" ADD CONSTRAINT statut_payee_transaction_check
  CHECK (statut <> 'PAYEE' OR "transactionTpeId" IS NOT NULL);
