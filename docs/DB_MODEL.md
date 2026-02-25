# Modelagem de Dados

## Tenant e identidade

- `Home` e o tenant principal.
- `User` pertence opcionalmente a uma `Home` (`homeId`).
- `User.isAdmin` controla privilegios administrativos dentro da casa.

## Autenticacao e seguranca

- `RefreshSession`: sessoes de refresh token (rotacao/revogacao).
- `PasswordResetToken`: token one-time para reset de senha.
- `AuditLog`: trilha de eventos de seguranca e negocio.
- `Notification`: notificacoes internas por usuario/casa.

## Dominio principal

### Despesas

- `Category` (por casa)
- `Expense` (despesa criada por pagador)
- `ExpenseShare` (divisao por usuario + status de pagamento)

Relacoes:

- `Home 1:N Category`
- `Home 1:N Expense`
- `Expense 1:N ExpenseShare`
- `User 1:N Expense` (paidBy)
- `User 1:N ExpenseShare`

### Compras

- `ShoppingList`
- `ShoppingItem`
- `ProductUrl`
- `PriceHistory`
- `ItemNote`

Relacoes:

- `Home 1:N ShoppingList`
- `ShoppingList 1:N ShoppingItem`
- `ShoppingItem 1:N ProductUrl`
- `ShoppingItem 1:N PriceHistory`
- `ShoppingItem 1:N ItemNote`

### Tarefas

- `Task` vinculada a `Home` e opcionalmente a `User` (`assignedToId`).

## Indices importantes

Indices principais cobrem:

- filtros por `homeId`;
- consultas de autenticacao e sessao;
- consultas temporais (`createdAt`, `date`, `expiresAt`);
- estados de fila/lista (`isRead`, `isPaid`, `isDone`).

## Observacoes de consistencia

- FKs com `onDelete` definidos para evitar dados orfaos em entidades criticas.
- Migrations Prisma versionadas garantem reproducibilidade de ambiente.
- Seed oficial prove dados minimos para validacao local e testes manuais.
