-- CreateEnum
CREATE TYPE "HomeRole" AS ENUM ('ADMIN', 'MEMBER');

-- CreateTable
CREATE TABLE "home_members" (
    "id" TEXT NOT NULL,
    "role" "HomeRole" NOT NULL DEFAULT 'MEMBER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "homeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "home_members_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "home_members_homeId_userId_key" ON "home_members"("homeId", "userId");

-- CreateIndex
CREATE INDEX "home_members_userId_idx" ON "home_members"("userId");

-- CreateIndex
CREATE INDEX "home_members_homeId_idx" ON "home_members"("homeId");

-- AddForeignKey
ALTER TABLE "home_members" ADD CONSTRAINT "home_members_homeId_fkey" FOREIGN KEY ("homeId") REFERENCES "homes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "home_members" ADD CONSTRAINT "home_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill current house memberships from users.homeId
INSERT INTO "home_members" ("id", "role", "createdAt", "updatedAt", "homeId", "userId")
SELECT
  md5(concat("users"."id", ':', "users"."homeId")),
  CASE WHEN "users"."isAdmin" THEN 'ADMIN'::"HomeRole" ELSE 'MEMBER'::"HomeRole" END,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  "users"."homeId",
  "users"."id"
FROM "users"
WHERE "users"."homeId" IS NOT NULL
ON CONFLICT ("homeId", "userId") DO NOTHING;
