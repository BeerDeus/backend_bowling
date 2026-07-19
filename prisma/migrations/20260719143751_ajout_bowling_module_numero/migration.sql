/*
  Warnings:

  - A unique constraint covering the columns `[numero]` on the table `commandes` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "ModuleCommande" AS ENUM ('BOWLING', 'BAR', 'KARAOKE', 'QUIZ');

-- AlterTable
ALTER TABLE "commandes" ADD COLUMN     "botErreur" TEXT,
ADD COLUMN     "botPiste" INTEGER,
ADD COLUMN     "botSucces" BOOLEAN,
ADD COLUMN     "cgvAccepteesLe" TIMESTAMP(3),
ADD COLUMN     "codeAvantageSaisi" TEXT,
ADD COLUMN     "module" "ModuleCommande" NOT NULL DEFAULT 'BAR',
ADD COLUMN     "numero" TEXT,
ALTER COLUMN "totalCentimes" SET DEFAULT 0;

-- CreateTable
CREATE TABLE "compteurs_module" (
    "module" "ModuleCommande" NOT NULL,
    "dernierNumero" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "compteurs_module_pkey" PRIMARY KEY ("module")
);

-- CreateTable
CREATE TABLE "commande_joueurs_bowling" (
    "id" TEXT NOT NULL,
    "commandeId" TEXT NOT NULL,
    "prenom" TEXT NOT NULL,
    "bumpers" BOOLEAN NOT NULL DEFAULT false,
    "parties" INTEGER NOT NULL DEFAULT 1,
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commande_joueurs_bowling_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "commandes_numero_key" ON "commandes"("numero");

-- AddForeignKey
ALTER TABLE "commande_joueurs_bowling" ADD CONSTRAINT "commande_joueurs_bowling_commandeId_fkey" FOREIGN KEY ("commandeId") REFERENCES "commandes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
