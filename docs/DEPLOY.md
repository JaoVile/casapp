# Deploy em Producao

Este guia cobre um baseline de deploy para o CasApp com backend + frontend.

## 1) Pre-requisitos

- Banco Postgres gerenciado
- Redis gerenciado
- Secrets configurados no provedor

## 2) Backend

Comandos de referencia:

```bash
npm ci
npm run db:generate
npm run build
npm run db:migrate:deploy
npm run start:prod
```

Variaveis obrigatorias:

- `DATABASE_URL`
- `REDIS_URL`
- `JWT_SECRET`
- `FRONTEND_URL`
- `NODE_ENV=production`
- `PORT`

Variaveis recomendadas para jobs em Cloud Run:

- `JOB_REMINDER_INTERNAL_CRON_ENABLED=false`
- `JOB_REMINDER_TRIGGER_TOKEN=<token-forte>`

## 3) Frontend

Comandos de referencia:

```bash
npm ci
npm run build
npm run start
```

Variaveis obrigatorias:

- `NEXT_PUBLIC_API_URL` (apontando para `https://<backend>/api`)
- `NODE_ENV=production`

## 4) Render (opcional)

Existe um blueprint pronto em `render.yaml`.

Fluxo:

1. Criar novo Blueprint no Render apontando para o repositorio.
2. Validar os nomes gerados para os servicos.
3. Ajustar `FRONTEND_URL` e `NEXT_PUBLIC_API_URL` com os dominios reais.
4. Executar primeiro deploy.

## 5) Railway + Vercel (alternativa)

- Backend no Railway/Render/Fly:
  - rodar `npm run db:migrate:deploy` antes do `start:prod`
- Frontend na Vercel:
  - definir `NEXT_PUBLIC_API_URL`

## 6) Cloud Run + Cloud Scheduler (recomendado para reminders)

Em ambientes serverless com scale-to-zero (ex.: Cloud Run), prefira disparar reminders por scheduler externo.

1. Defina no backend:
   - `JOB_REMINDER_INTERNAL_CRON_ENABLED=false`
   - `JOB_REMINDER_TRIGGER_TOKEN=<token-forte>`
2. Configure um Cloud Scheduler HTTP para chamar:
   - `POST https://<backend>/api/jobs/reminders/inactive-users/run`
3. Envie autenticacao por header:
   - `x-job-token: <JOB_REMINDER_TRIGGER_TOKEN>`
   - ou `Authorization: Bearer <JOB_REMINDER_TRIGGER_TOKEN>`

## 7) Uptime

O workflow `.github/workflows/uptime.yml` faz check periodico do endpoint de health.

Configure o secret:

- `UPTIME_HEALTH_URL` (exemplo: `https://api.seudominio.com/api/health`)

## 8) Rollback simples

1. Re-deploy da revisao anterior no provedor.
2. Se necessario, aplicar migration de rollback manual (quando existir).
3. Validar `GET /api/health`, `GET /api/ready` e `GET /api/metrics`.
