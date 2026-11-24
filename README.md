# Watchful

Plataforma de monitoramento climático, inteligência territorial e alertas. O [acompanhamento do piloto](docs/piloto/PROGRESS.md) registra o estado verificado e as pendências.

## Fundação
- apps/web: Next.js, Tailwind, Lucide
- apps/api: NestJS, API versionada e Swagger
- apps/mobile: Expo / React Native
- apps/worker: base de filas BullMQ
- packages/database: PostgreSQL/PostGIS e migrações
- packages/contracts: contratos TypeScript

## Ambiente local
Requisitos: Node 22, pnpm 10.11.0, Docker Compose.
Copie .env.example para .env, configure portas e credenciais locais.
1. `pnpm install --frozen-lockfile`
2. pnpm infra:up
3. pnpm db:migrate
4. Configure as variáveis temporárias de bootstrap e execute `pnpm --filter @watchful/api admin:bootstrap`. Remova as credenciais de bootstrap do arquivo após o uso.
5. pnpm dev
6. pnpm typecheck e pnpm build

Web: http://localhost:3000
API: http://localhost:4000/api/v1/health/live
Swagger: http://localhost:4000/docs
Mobile: ajuste EXPO_PUBLIC_API_URL para o IP LAN ou endereço do emulador; configure o arquivo .env no diretório do app se necessário.

O ambiente ainda está em validação para piloto. Avaliação automática e publicação interna estão desabilitadas no `.env.example`. Consulte a [arquitetura](docs/architecture.md), o [plano do piloto](docs/piloto/EXECUTION_PLAN.md) e as [evidências](docs/piloto/VALIDATION.md).

## Validação local com PM2 (builds de produção)
Com Docker saudável, migrações aplicadas e administrador criado, instalar PM2 se necessário (`npm install -g pm2`). Na raiz:

```bash
pnpm build:pm2
pm2 start ecosystem.config.cjs
pm2 status
```

O web escuta em `http://localhost:3005` e a API em `http://localhost:4005`. PM2 inicia também o worker. O arquivo de ambiente define as permissões operacionais de coleta, avaliação e publicação. O Next.js recebe `NEXT_PUBLIC_API_URL` no build PM2. Web e API escutam apenas em loopback e o Swagger fica desativado nesse perfil.

Para atualizar, use `pnpm build:pm2` e `pm2 restart ecosystem.config.cjs --update-env`. Para parar os processos, use `pm2 stop watchful-api watchful-web watchful-worker`.

## Testes de meteorologia

Execute `pnpm --filter @watchful/worker test` para testes unitários. Para exercitar a migração e a ingestão contra PostgreSQL/PostGIS isolado no PowerShell:

```powershell
docker compose -p watchful-test -f compose.test.yaml up -d --wait
$env:WATCHFUL_TEST_DATABASE_URL = 'postgresql://watchful_test:watchful_test_local@127.0.0.1:45432/watchful_test'
pnpm test:weather:integration
docker compose -p watchful-test -f compose.test.yaml down
```

O banco de teste usa armazenamento temporário e o teste substitui os fornecedores por respostas sintéticas.
