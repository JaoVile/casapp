# CasApp

README de referencia do estado atual do projeto (24/02/2026).

## Visao Geral

CasApp e uma aplicacao para gestao de casa compartilhada com foco em:

- autenticacao de usuarios;
- gerenciamento da casa e membros;
- despesas e divisao de contas;
- lista de compras;
- tarefas com pontuacao;
- lembretes de inatividade/dividas via job.

Repositorio em monorepo:

- `backend/`: API NestJS + Prisma + PostgreSQL
- `frontend/`: Next.js (UI cliente com React Router)
- `shared/`: espaco para tipos compartilhados (atualmente vazio)

## Stack Tecnica

### Backend

- NestJS 10
- Prisma 5
- PostgreSQL 16
- JWT (Passport)
- Class Validator / Class Transformer
- Swagger (em ambiente nao-producao)
- Scheduler (cron jobs)

### Frontend

- Next.js 16
- React 19
- React Router DOM 7
- Axios
- Tailwind CSS
- Cache local custom (sem React Query)

### Infra

- Docker Compose
- Postgres + Redis

## Estrutura Principal

```text
casapp/
  backend/
  frontend/
  shared/
  docker-compose.dev.yml
  docker-compose.yml
  Makefile
  README.md
```

## Backend - Estado Atual

### Bootstrap

Arquivo: `backend/src/main.ts`

- prefixo global: `/api`
- CORS configurado por `FRONTEND_URL`
- ValidationPipe global (whitelist/transform/forbidNonWhitelisted)
- SanitizationPipe global (trim + normalize em payloads)
- respostas de sucesso no formato `{ data: ... }`
- filtro global de erro padronizado
- middleware `x-request-id` para correlation id
- logging estruturado em JSON (requestId, userId, rota, status, latencia, erro)
- captura de excecoes no Sentry (quando configurado)
- Swagger em `/docs` quando `NODE_ENV != production`

### Modulos ativos

Arquivo: `backend/src/app.module.ts`

- `AuthModule`
- `UserModule`
- `HomeModule`
- `ExpenseModule`
- `ShoppingModule`
- `TaskModule`
- `JobsModule`
- `HealthModule`
- `AuditModule`
- `NotificationModule`

### Endpoints principais

Prefixo real: `http://localhost:3333/api`

#### Auth

- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/forgot-password`
- `POST /auth/reset-password`
- `GET /auth/me`
- `POST /auth/refresh`
- `POST /auth/activity`
- `POST /auth/logout`
- `GET /auth/sessions`
- `DELETE /auth/sessions/:sessionId`
- `POST /auth/logout-all`

#### Users

- `GET /users`
- `GET /users/:id`
- `PUT /users/me`
- `DELETE /users/me`
- `DELETE /users/:id`

#### Homes

- `POST /homes`
- `POST /homes/join`
- `GET /homes/:id`
- `POST /homes/leave`

#### Expenses

- `GET /expenses`
- `POST /expenses`
- `GET /expenses/balances`
- `GET /expenses/categories`
- `GET /expenses/debts/me`
- `PATCH /expenses/shares/:shareId/settle`

#### Shopping

- `GET /shopping`
- `POST /shopping/:listId/items`
- `PATCH /shopping/items/:itemId/toggle`
- `DELETE /shopping/items/:itemId`

#### Tasks

- `GET /tasks`
- `GET /tasks/leaderboard`
- `POST /tasks`
- `PATCH /tasks/:id/toggle`

#### Health

- `GET /health`
- `GET /ready`
- `GET /metrics`

#### Notifications

- `GET /notifications`
- `GET /notifications/unread-count`
- `PATCH /notifications/:id/read`
- `PATCH /notifications/read-all`

#### Audit

- `GET /audit-logs`

### Regras importantes implementadas

- Registro cria usuario + casa inicial automaticamente.
- Registro usa e-mail + senha no fluxo principal.
- Login usa e-mail + senha no fluxo principal.
- Recuperacao de senha via token one-time (expiracao + invalidacao de tokens antigos).
- Recuperacao de senha com entrega por e-mail via SMTP (quando configurado).
- Sessao com refresh token persistido e rotacao (refresh antigo e revogado a cada renovacao).
- Logout revoga sessao ativa (ou todas as sessoes quando necessario).
- Sessao multi-dispositivo com listagem e revogacao de sessoes por usuario.
- Reuso suspeito de refresh token revoga sessoes ativas do usuario (defesa contra token leak).
- Rate limit de auth por IP + identificador, com suporte a Redis e fallback em memoria.
- Despesa suporta split `EQUAL`, `CUSTOM` e `INDIVIDUAL`.
- Despesa permite `date`, `dueDate` e `reminderEnabled` para fluxo de contas com vencimento.
- Compras criam lista padrao `Geral` se a casa nao tiver lista.
- Tarefas geram ranking por pontos concluidos.
- Auditoria de eventos em `AuditLog` (ex.: login, profile update, expense create/settle, shopping, tasks, home).
- Endpoint de consulta de auditoria com filtros/paginacao para admin da casa.
- Notificacoes internas persistidas com leitura/unread count e eventos de dominio (home/expense/task/shopping).
- Hardening multi-tenant em servicos sensiveis (shopping/task/home/users) para evitar acesso cross-home.
- Caching Redis para endpoints read-heavy:
  - `GET /expenses/balances`
  - `GET /expenses/categories`
  - `GET /tasks/leaderboard`
- Job de lembrete roda a cada 6h (webhook N8N, se configurado).
- Reminder job usa lock distribuido em Redis para evitar duplicacao em escala horizontal.
- Endpoint de metricas operacionais em `/metrics` (process + contadores de dominio).

## Banco de Dados

Schema: `backend/src/shared/database/prisma/schema.prisma`

Modelos principais:

- `User`
- `Home`
- `PasswordResetToken`
- `RefreshSession`
- `AuditLog`
- `Notification`
- `Category`
- `Expense`
- `ExpenseShare`
- `ShoppingList`
- `ShoppingItem`
- `ProductUrl`
- `PriceHistory`
- `ItemNote`
- `Task`

Migrations detectadas:

- `20260208135406_init_full_schema`
- `20260215112000_auth_phone_security`
- `20260219220000_performance_indexes`
- `20260220183000_audit_password_reset`
- `20260220204000_refresh_sessions`
- `20260220214000_notifications`

## Seed

Arquivo: `backend/src/shared/database/prisma/seed.ts`

Cria:

- 1 casa (`Nosso Ape`)
- 2 usuarios
- categorias iniciais
- 2 listas de compra

Credenciais de desenvolvimento:

- `voce@email.com` / `+5511999990001` / senha `123456`
- `amigo@email.com` / `+5511999990002` / senha `123456`

## Frontend - Estado Atual

Rotas da interface (React Router):

- `/` (login)
- `/register`
- `/forgot-password`
- `/reset-password`
- `/dashboard`
- `/expenses`
- `/expenses/add`
- `/shopping`
- `/tasks`
- `/notifications`
- `/settings`

Observacoes:

- token em `@casapp:token` no `localStorage`
- refresh token em `@casapp:refresh-token`
- usuario em `@casapp:user`
- ping de atividade para `/auth/activity` a cada 15 minutos
- refresh token automatico no interceptor Axios (com logout limpo em falha)
- captura de erros de UI/rede no Sentry (quando configurado)
- rota dedicada `/notifications` com listagem e acoes de leitura
- tela de configuracoes para atualizar perfil, logout e excluir conta
- tela de configuracoes com feed de auditoria recente (somente admin da casa)
- tela de configuracoes com centro de notificacoes e gerenciamento de sessoes ativas
- PWA basico com manifest + service worker + cache shell offline

## Como Rodar

### Bootstrap padrao (evita erro de migration faltando)

Use um comando unico para subir ambiente + aplicar migrations + seed:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\bootstrap-local.ps1 -Mode local
```

Depois:

```bash
cd backend
npm run dev
```

```bash
cd frontend
npm run dev
```

## Opcao A: Full Docker (recomendado para dev)

```bash
powershell -ExecutionPolicy Bypass -File .\scripts\bootstrap-local.ps1 -Mode full-docker
```

Servicos:

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:3333/api`
- Swagger: `http://localhost:3333/docs`
- Postgres: `localhost:5432`
- Redis: `localhost:6379`

Se subir manualmente sem o script, execute migration e seed no backend:

```bash
docker compose -f docker-compose.dev.yml exec backend npm run db:migrate:deploy
docker compose -f docker-compose.dev.yml exec backend npm run db:seed
```

## Opcao B: rodar app local

1. Subir infra:

```bash
docker compose up -d
```

2. Backend:

```bash
cd backend
npm install
npm run db:generate
npm run db:migrate:deploy
npm run db:seed
npm run dev
```

3. Frontend:

```bash
cd frontend
npm install
npm run dev
```

## Variaveis de Ambiente

### Backend (`backend/.env`)

```env
DATABASE_URL=postgresql://user:password@localhost:5432/dbname?schema=public
JWT_SECRET=change-this-secret
JWT_EXPIRES_IN=7d
JWT_REFRESH_EXPIRES_IN=30d
JWT_REFRESH_SECRET=
PORT=3333
NODE_ENV=development
FRONTEND_URL=http://localhost:5173
```

Extras opcionais:

```env
AUTH_WINDOW_MS=900000
AUTH_MAX_ATTEMPTS=7
AUTH_BLOCK_MS=900000
AUTH_REDIS_PREFIX=auth:rate-limit
AUTH_RESET_URL_BASE=http://localhost:5173
AUTH_INVITE_URL_BASE=http://localhost:5173

SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM=CasApp <no-reply@casapp.local>
SMTP_TLS_REJECT_UNAUTHORIZED=true

REDIS_URL=redis://localhost:6379
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0

CACHE_TTL_SECONDS=120
JOB_REMINDER_LOCK_TTL_MS=300000
JOB_REMINDER_INTERNAL_CRON_ENABLED=true
JOB_REMINDER_TRIGGER_TOKEN=

SENTRY_DSN=
SENTRY_ENVIRONMENT=development
SENTRY_RELEASE=
SENTRY_TRACES_SAMPLE_RATE=0

LOG_FILE_PATH=
HTTP_JSON_LIMIT=1mb
HTTP_URLENCODED_LIMIT=1mb

INACTIVITY_REMINDER_DAYS=3
N8N_REMINDER_WEBHOOK_URL=
N8N_REMINDER_WEBHOOK_TOKEN=
N8N_EXPENSE_ALERT_WEBHOOK_URL=
N8N_EXPENSE_ALERT_WEBHOOK_TOKEN=
N8N_REMINDER_BATCH_SIZE=100
N8N_REMINDER_CONCURRENCY=5
```

### Frontend (`frontend/.env`)

```env
NEXT_PUBLIC_API_URL=http://localhost:3333/api
NEXT_PUBLIC_SENTRY_DSN=
NEXT_PUBLIC_SENTRY_ENVIRONMENT=development
NEXT_PUBLIC_SENTRY_RELEASE=
NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE=0
```

## Scripts Principais

### Raiz (Makefile)

- `make up`
- `make down`
- `make logs`
- `make install`
- `make backend`
- `make frontend`
- `make migrate`
- `make seed`
- `make lint`
- `make test`
- `make test-integration`
- `make typecheck`
- `make build`
- `make bootstrap-local`
- `make bootstrap-full`

### Script de bootstrap (PowerShell)

- `scripts/bootstrap-local.ps1 -Mode local`
- `scripts/bootstrap-local.ps1 -Mode full-docker`

### Backend

- `npm run dev`
- `npm run build`
- `npm run start:prod`
- `npm run db:generate`
- `npm run db:migrate`
- `npm run db:migrate:deploy`
- `npm run db:push`
- `npm run db:seed`
- `npm run db:studio`
- `npm run test`
- `npm run test:e2e`
- `npm run test:integration` (usa DB/Redis reais quando `RUN_INTEGRATION_TESTS=true`)

### Frontend

- `npm run dev`
- `npm run build`
- `npm run start`
- `npm run lint`
- `npm run typecheck`

## Observacoes para a proxima fase

- Notification gateway ainda esta reservado para evolucao realtime (WebSocket/SSE).
- Redis agora ja e usado para rate limit, cache e lock distribuido de job.
- Fluxo de sessao frontend ja cobre revalidacao inicial, refresh automatico, estados de loading/auth e remember me.

## Roadmap de Evolucao (Prioridades)

Este roadmap transforma o CasApp em uma aplicacao de nivel producao, com foco em monitoramento, confiabilidade, seguranca, escala e deploy profissional.

## Prioridade 1: Producao de verdade (maior impacto)

1. Health check + readiness/liveness

- `GET /health`: app ativo.
- `GET /ready`: valida Postgres, Redis e scheduler/jobs.
- Retorno com status por dependencia para monitoramento real.

2. Error tracking (Sentry) backend + frontend

- Backend NestJS: captura excecoes com contexto (userId, rota, requestId/correlationId).
- Frontend Next/React: captura erros de UI e falhas de rede.
- Ganho direto de observabilidade e resposta a incidentes.

3. Logging estruturado + correlation ID

- Middleware para gerar/propagar `x-request-id`.
- Logs em JSON: `requestId`, `userId`, `route`, `status`, `latency`, `error.stack`.
- Saida pronta para console/cloud (e opcionalmente arquivo).

4. Rate limiting real com Redis

- Rate limit por IP + por usuario no login.
- Bloqueio temporario quando exceder limite.
- Redis como store central (evita limite local por instancia).

## Prioridade 2: Qualidade e confianca

5. Testes de integracao das regras criticas

- Auth (`login`, `refresh`, lock/rate-limit).
- Homes (`create`, `join`, `leave`).
- Expenses split (`EQUAL`, `CUSTOM`, `INDIVIDUAL`).
- `settle share`.
- Job de reminder.

6. Contract/API testing com OpenAPI

- Gerar OpenAPI e validar snapshot/contrato.
- Garantir que mudancas nao quebrem clientes.

7. Validacao e sanitizacao reforcada

- Query params/paginacao com limites consistentes.
- Limites por payload (ex.: max itens por lista).
- Sanitizacao de strings (`trim`, normalize).
- Protecao basica XSS no frontend.

## Prioridade 3: Escalabilidade e performance

8. Caching real com Redis (read-heavy endpoints)

- `/expenses/balances`
- `/tasks/leaderboard`
- `/expenses/categories`
- Cache com TTL + invalidacao em mutacoes.

9. Jobs confiaveis (fila ou lock distribuido)

- Opcao A: BullMQ + Redis (retry, backoff, dead-letter).
- Opcao B: manter cron com lock distribuido para evitar duplicacao em escala horizontal.

10. Paginacao/filtros/ordenacao padrao

- `?page=1&limit=20`
- `?from=2026-01-01&to=2026-01-31`
- `?categoryId=...`
- padrao consistente em listas principais.

## Prioridade 4: Produto vendavel

11. Fluxo de sessao completo no frontend

- Refresh token automatico em interceptor Axios.
- Expiracao limpa + logout.
- Guard de rotas com loading/fallback.
- Opcional: `remember me`.

12. Auditoria de eventos (mini)

- Tabela `AuditLog`: `userId`, `action`, `createdAt`, metadata opcional.
- Eventos como: `EXPENSE_CREATED`, `ITEM_TOGGLED`, `TASK_COMPLETED`.

13. Multi-tenant explicito (Home como tenant)

- Guardas consistentes de pertencimento em todas as rotas.
- Scoping Prisma por `homeId` em todas as queries sensiveis.

## Prioridade 5: Deploy e CI/CD

14. Pipeline CI (GitHub Actions)

- lint
- typecheck
- testes (unit + integracao)
- build
- opcional: docker build

15. Deploy de producao real

- Backend em Railway/Fly/Render.
- Postgres gerenciado.
- Frontend em Vercel.
- Secrets por ambiente.
- Bonus: migration automatica no deploy + estrategia simples de rollback.

16. Uptime monitor + status

- Monitor de disponibilidade em `/health`.
- Badge de build/uptime no README.

## Pack recomendado para executar agora (sem se perder)

Se for priorizar curto prazo com maximo impacto:

1. `/health` e `/ready`.
2. Sentry no backend e frontend.
3. Logging estruturado com `x-request-id`.
4. Rate limit de login com Redis.
5. 6-10 testes de integracao das regras criticas.
6. CI (`lint` + `test` + `build`) e deploy publico.

## CI/CD implementado

Pipeline adicionado em `.github/workflows/ci.yml` com:

- Backend: `npm ci`, `npm run lint`, `npm run test`, `npm run test:e2e`, `npm run build`
- Backend integration: Postgres + Redis em service containers, `npm run db:migrate:deploy`, `npm run test:integration` com `RUN_INTEGRATION_TESTS=true`
- Frontend: `npm ci`, `npm run lint`, `npm run typecheck`, `npm run build`
- Docker build em CI para `backend/Dockerfile` e `frontend/Dockerfile`

Uptime workflow adicionado em `.github/workflows/uptime.yml`:

- check agendado do endpoint de health via secret `UPTIME_HEALTH_URL`

## Artefatos de Deploy

- Blueprint Render: `render.yaml`
- Guia de deploy e rollback: `docs/DEPLOY.md`

## Documentacao Tecnica Complementar

- Arquitetura geral: `docs/ARCHITECTURE.md`
- Fluxo de autenticacao e sessoes: `docs/AUTH_FLOW.md`
- Modelagem de dados: `docs/DB_MODEL.md`
- Health/readiness/metrics e observabilidade: `docs/METRICS.md`
- Checklist de smoke test MVP: `docs/SMOKE_TEST_CHECKLIST.md`

## Status de Finalizacao (sem deploy)

### Feito

- Sessao robusta: refresh rotativo, reuso detectado, revogacao por sessao e logout-all.
- Recuperacao de senha com token one-time + entrega por e-mail (SMTP quando configurado).
- Health/readiness/metrics (`/health`, `/ready`, `/metrics`).
- Logging estruturado + correlation id + captura Sentry.
- Rate limiting auth por IP + identificador com Redis.
- Cache Redis em endpoints read-heavy e lock distribuido para jobs.
- Auditoria (`AuditLog`) e notificacoes internas (`Notification`) com API.
- Contract test OpenAPI + testes de integracao com Postgres/Redis reais no CI.
- Fluxo frontend com rotas protegidas, skeleton de sessao, redirect inteligente e remember me.
- PWA basico (manifest + service worker + cache shell offline).

### Parcial

- Realtime de notificacoes (gateway reservado, ainda sem entrega realtime ativa).
- Offline avancado (sync de acoes em fila ainda nao implementado).
- Jobs avancados com fila dedicada (BullMQ) ainda nao adotados.
- Realtime e offline avancado estao fora do baseline desta rodada e nao bloqueiam validacao do MVP.

### Pendente (fora deploy)

- Funcionalidades de produto avancadas planejadas e nao obrigatorias para baseline:
  - recorrencia completa de despesas/tarefas com geracao automatica;
  - historico detalhado de acertos parciais e compartilhamento pronto para WhatsApp;
  - centro de notificacoes realtime (WebSocket/SSE);
  - internacionalizacao (PT/EN) e analytics de uso.
