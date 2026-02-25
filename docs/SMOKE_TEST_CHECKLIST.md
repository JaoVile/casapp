# Smoke Test Checklist (MVP)

Objetivo: validar rapidamente os fluxos criticos antes de mexer em funcionalidades avancadas.

## Escopo desta rodada

- Incluido: auth, casa, despesas, compras, tarefas, notificacoes.
- Fora de escopo por enquanto: realtime de notificacoes e offline avancado (fila/sync).

## Pre-requisitos

1. Rodar bootstrap padrao:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\bootstrap-local.ps1 -Mode local
```

2. Subir backend e frontend:

```powershell
cd backend
npm run dev
```

```powershell
cd frontend
npm run dev
```

3. Credenciais seed:
- `voce@email.com` / senha `123456`
- `amigo@email.com` / senha `123456`

## 1) Auth

- [ ] Cadastro com e-mail + senha (sem telefone) funciona.
- [ ] Login com e-mail funciona.
- [ ] Em Configuracoes, botao `Mudar e-mail` atualiza o e-mail com sucesso.
- [ ] Em Configuracoes, botao `Mudar senha` altera a senha e permite novo login.
- [ ] `Esqueci minha senha` gera token e `Reset` altera a senha.
- [ ] Logout encerra sessao atual.
- [ ] Lista de sessoes exibe sessao atual e permite revogar outra sessao.

## 2) Casa

- [ ] Usuario sem casa consegue criar casa.
- [ ] Convite por codigo/link entra na casa correta.
- [ ] Troca de casa ativa funciona (quando houver mais de uma).
- [ ] Sair da casa atual funciona sem quebrar sessao.

## 3) Despesas

- [ ] Criar despesa com split `EQUAL`.
- [ ] Criar despesa com split `CUSTOM`.
- [ ] Listagem de despesas retorna itens criados.
- [ ] Balancos e dividas (`/expenses/balances` e `/expenses/debts/me`) atualizam apos nova despesa.
- [ ] Marcar `settle` em uma share atualiza status de pagamento.

## 4) Compras

- [ ] Abrir lista de compras sem erro.
- [ ] Adicionar item.
- [ ] Marcar/desmarcar item como comprado.
- [ ] Editar item.
- [ ] Excluir item.

## 5) Tarefas

- [ ] Criar tarefa.
- [ ] Concluir/reabrir tarefa.
- [ ] Editar tarefa.
- [ ] Excluir tarefa.
- [ ] Leaderboard atualiza pontuacao apos conclusao.

## 6) Notificacoes

- [ ] Listagem abre sem erro.
- [ ] Contador de nao lidas muda ao criar eventos (despesa/tarefa/compras).
- [ ] Marcar uma notificacao como lida funciona.
- [ ] `Marcar todas como lidas` zera contador.

## Criterio de saida

- Todos os itens acima validados, ou
- Bugs encontrados registrados com passo a passo + evidencia (rota/tela, payload, erro).
