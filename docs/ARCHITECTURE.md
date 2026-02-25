# Arquitetura do CasApp

## Visao Geral

O CasApp e um monorepo com frontend e backend separados, comunicando por API HTTP.

- `frontend/`: Next.js + React Router + Axios.
- `backend/`: NestJS modular + Prisma + PostgreSQL + Redis.
- `shared/`: tipos compartilhados entre camadas.

## Componentes

### Frontend

- Camada de autenticacao com refresh automatico via interceptor.
- Data fetching via cache local (`useCachedQuery`) com stale-time, dedupe, retry/backoff e cancelamento.
- PWA basico (manifest + service worker + cache shell).
- Observabilidade de erros de UI/rede com Sentry.

### Backend

- API NestJS com `controller -> service -> prisma`.
- Guardas globais e por contexto (`JwtAuthGuard`, `HomeMemberGuard`).
- Filtro global de excecao com padronizacao de resposta.
- Logging estruturado em JSON + `x-request-id`.
- Rate limiting de auth com Redis (fallback em memoria).
- Health/readiness/metrics para monitoramento.

### Dados e Infra

- PostgreSQL com migrations versionadas (Prisma).
- Redis para cache, rate limit e lock distribuido de job.
- Scheduler para jobs periodicos com protecao contra duplicacao.

## Modulos de Dominio

- `AuthModule`: login, refresh rotativo, reset de senha, sessoes.
- `UserModule`: perfil e ciclo de vida de usuario.
- `HomeModule`: criacao, entrada e saida de casa.
- `ExpenseModule`: despesas, shares, saldos, categorias.
- `ShoppingModule`: listas e itens de compra.
- `TaskModule`: tarefas e leaderboard.
- `NotificationModule`: notificacoes internas e unread count.
- `AuditModule`: trilha de eventos por tenant.
- `JobsModule`: lembretes agendados.
- `HealthModule`: `/health`, `/ready`, `/metrics`.

## Fluxo Padrao de Request

1. Cliente envia request para `/api/*`.
2. Middleware de request-id gera/propaga `x-request-id`.
3. Guardas validam autenticacao/permissao.
4. Pipes sanitizam e validam payload.
5. Controller delega regra para service.
6. Service aplica regra de negocio e persiste no Prisma.
7. Interceptors/filtros padronizam resposta e log.
8. Em erro 5xx, excecao e enviada ao Sentry.

## Multi-tenant

Tenant principal: `Home`.

- Todas as consultas sensiveis filtram por `homeId`.
- Guardas bloqueiam acesso cross-home.
- Auditoria e notificacoes carregam contexto de `homeId`.
