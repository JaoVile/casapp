-- Query performance indexes for high-frequency filters and orderings
CREATE INDEX "users_homeId_idx" ON "users"("homeId");
CREATE INDEX "users_lastSeenAt_idx" ON "users"("lastSeenAt");
CREATE INDEX "users_lastInactivityReminderAt_idx" ON "users"("lastInactivityReminderAt");

CREATE INDEX "categories_homeId_idx" ON "categories"("homeId");

CREATE INDEX "expenses_homeId_date_idx" ON "expenses"("homeId", "date");
CREATE INDEX "expenses_paidById_idx" ON "expenses"("paidById");
CREATE INDEX "expenses_categoryId_idx" ON "expenses"("categoryId");

CREATE INDEX "expense_shares_userId_isPaid_idx" ON "expense_shares"("userId", "isPaid");
CREATE INDEX "expense_shares_expenseId_isPaid_idx" ON "expense_shares"("expenseId", "isPaid");

CREATE INDEX "shopping_lists_homeId_idx" ON "shopping_lists"("homeId");

CREATE INDEX "shopping_items_listId_createdAt_idx" ON "shopping_items"("listId", "createdAt");
CREATE INDEX "shopping_items_addedById_idx" ON "shopping_items"("addedById");
CREATE INDEX "shopping_items_purchasedById_idx" ON "shopping_items"("purchasedById");

CREATE INDEX "tasks_homeId_isDone_createdAt_idx" ON "tasks"("homeId", "isDone", "createdAt");
CREATE INDEX "tasks_assignedToId_idx" ON "tasks"("assignedToId");
