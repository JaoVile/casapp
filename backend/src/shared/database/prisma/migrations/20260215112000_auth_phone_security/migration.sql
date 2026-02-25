-- User auth hardening and activity tracking
ALTER TABLE "users"
  ADD COLUMN "phone" TEXT,
  ADD COLUMN "phoneVerifiedAt" TIMESTAMP(3),
  ADD COLUMN "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "lastInactivityReminderAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- Debt evidence and split metadata
ALTER TABLE "expense_shares"
  ADD COLUMN "splitPercent" DOUBLE PRECISION,
  ADD COLUMN "proofUrl" TEXT,
  ADD COLUMN "proofDescription" TEXT;
