.PHONY: up down logs install backend frontend migrate seed lint test test-integration build typecheck bootstrap-local bootstrap-full

up:
	docker compose -f docker-compose.dev.yml up -d

bootstrap-local:
	docker compose up -d --remove-orphans
	cd backend && npm run db:generate
	cd backend && npm run db:migrate:deploy
	cd backend && npm run db:seed

bootstrap-full:
	docker compose -f docker-compose.dev.yml up -d --remove-orphans
	docker compose -f docker-compose.dev.yml exec backend npm run db:migrate:deploy
	docker compose -f docker-compose.dev.yml exec backend npm run db:seed

down:
	docker compose -f docker-compose.dev.yml down

logs:
	docker compose -f docker-compose.dev.yml logs -f

install:
	cd backend && npm install
	cd frontend && npm install

backend:
	cd backend && npm run dev

frontend:
	cd frontend && npm run dev

migrate:
	cd backend && npm run db:migrate

seed:
	cd backend && npm run db:seed

lint:
	cd backend && npm run lint
	cd frontend && npm run lint

test:
	cd backend && npm run test
	cd backend && npm run test:e2e

test-integration:
	cd backend && npm run test:integration

typecheck:
	cd backend && npm run lint
	cd frontend && npm run typecheck

build:
	cd backend && npm run build
	cd frontend && npm run build
