# Fluxo de Autenticacao

## 1) Login

1. Usuario envia `identifier` + `password` em `POST /api/auth/login`.
2. Backend valida credenciais e limite por IP + identificador.
3. Backend gera:
   - access token (curto prazo)
   - refresh token (longo prazo)
4. Sessao de refresh e persistida em `RefreshSession` com `tokenHash`, `expiresAt`, ip e user-agent.
5. Frontend salva sessao em storage local ou de sessao conforme `remember me`.

## 2) Uso normal

- Requests autenticados usam `Authorization: Bearer <accessToken>`.
- Em `401`, interceptor tenta `POST /api/auth/refresh` automaticamente.

## 3) Refresh com rotacao

1. Frontend envia refresh token no `Authorization` para `/api/auth/refresh`.
2. Backend valida JWT, `sid`, hash e estado da sessao.
3. Sessao antiga e revogada e uma nova sessao e criada.
4. Novos access/refresh tokens sao devolvidos.
5. Frontend atualiza tokens sem interromper UX.

## 4) Reuso suspeito de refresh token

Se um refresh token revogado reaparece:

- backend trata como possivel vazamento;
- revoga sessoes ativas do usuario;
- registra auditoria `AUTH_REFRESH_REUSE_DETECTED`.

## 5) Logout

- `POST /api/auth/logout`: revoga sessao atual.
- `POST /api/auth/logout-all`: revoga todas, opcionalmente mantendo a atual.
- `DELETE /api/auth/sessions/:id`: revoga sessao especifica.

## 6) Recuperacao de senha

1. `POST /api/auth/forgot-password` cria token one-time com expiracao.
2. Token e enviado por SMTP (quando configurado).
3. `POST /api/auth/reset-password` redefine senha e invalida tokens/sessoes ativas.

## 7) Revalidacao de sessao no frontend

Ao abrir app:

1. Router verifica se ha token.
2. Executa `GET /api/auth/me`.
3. Estados de UX:
   - `loading`: skeleton de sessao.
   - `authenticated`: libera rotas privadas.
   - `unauthenticated`: redireciona para login (com retorno para rota original).
