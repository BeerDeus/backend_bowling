-- CreateTable
CREATE TABLE "plages_tarifaires_bowling" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "heureDebut" TEXT NOT NULL,
    "heureFin" TEXT NOT NULL,
    "jours" INTEGER[] DEFAULT ARRAY[0,1,2,3,4,5,6]::INTEGER[],
    "prixParPartieCentimes" INTEGER NOT NULL,
    "ordre" INTEGER NOT NULL DEFAULT 0,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "majLe" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plages_tarifaires_bowling_pkey" PRIMARY KEY ("id")
);
