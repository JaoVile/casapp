# Observabilidade e Metricas

## Endpoints operacionais

- `GET /api/health`
- `GET /api/ready`
- `GET /api/metrics`

## `/health`

Objetivo: liveness.

Retorna status da aplicacao (processo ativo), timestamp e uptime.
Uso: probes simples de balanceador/orquestrador.

## `/ready`

Objetivo: readiness.

Verifica dependencias:

- Postgres (`SELECT 1` + latencia)
- Redis (`PING` + latencia)
- Scheduler (cron jobs registrados)

Resposta inclui status por dependencia (`up/down`) e status agregado (`ready/degraded`).

## `/metrics`

Objetivo: metricas operacionais e sinais de capacidade.

Inclui:

- processo (`pid`, versao Node, uptime)
- memoria (`rss`, `heapTotal`, `heapUsed`, `external`)
- cpu (`userMicros`, `systemMicros`)
- contadores de dominio (usuarios, casas, despesas, tarefas, itens de compra)
- latencia da coleta de contadores

## Logs estruturados

Cada request gera log JSON com:

- `requestId`
- `userId`
- `method`
- `route`
- `statusCode`
- `latencyMs`
- erro (quando existir)

## Correlation ID

Middleware de request-id:

- aceita `x-request-id` recebido;
- se ausente, gera UUID;
- ecoa no response header.

## Alertas recomendados (quando houver monitor externo)

- `ready.status != ready` por janela de 3-5 minutos.
- taxa de erro 5xx acima de baseline.
- latencia p95 de API acima de SLO definido.
- falha recorrente do reminder job.
