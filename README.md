# Watchful

Plataforma de monitoramento climático, inteligência territorial e alertas. Implementação independente, em desenvolvimento na branch create.

## Fundação
- apps/web: Next.js, Tailwind, Lucide
- apps/api: NestJS, API versionada e Swagger
- apps/mobile: Expo / React Native
- apps/worker: base de filas BullMQ
- packages/database: PostgreSQL/PostGIS e migrações
- packages/contracts: contratos TypeScript

## Ambiente local (executar somente na etapa de validação)
Requisitos: Node 22, pnpm 10.11.0, Docker Compose.
Copie .env.example para .env, configure portas e credenciais locais.
1. pnpm install (gerar e versionar pnpm-lock.yaml após validação)
2. pnpm infra:up
3. pnpm db:migrate
4. pnpm dev
5. pnpm typecheck e pnpm build

Web: http://localhost:3000
API: http://localhost:4000/api/v1/health/live
Swagger: http://localhost:4000/docs
Mobile: ajuste EXPO_PUBLIC_API_URL para o IP LAN ou endereço do emulador; configure o arquivo .env no diretório do app se necessário.

A base ainda não foi executada nem testada. Nenhuma emissão de alerta real está habilitada. Não usar como sistema de emergência.
Veja docs/roadmap.md e docs/architecture.md.

## Validação local com PM2 (builds de produção)
Com Docker saudável, migrações aplicadas e administrador criado, instalar PM2 se necessário (`npm install -g pm2`). Na raiz:

```bash
pnpm build:pm2
pm2 start ecosystem.config.cjs
pm2 status
```

Web: http://localhost:3005 — API: http://localhost:4005/api/v1/health/live e /health/ready. A API usa as credenciais do .env da raiz; PM2 sobrescreve portas, origem CORS e flags operacionais para este perfil local. Next.js recebe NEXT_PUBLIC_API_URL durante o build, não apenas na execução. Ambos escutam em loopback; não são acessíveis a dispositivos externos. Swagger está desativado em NODE_ENV=production. O worker não é iniciado. Para atualizar: `pnpm build:pm2` e `pm2 restart ecosystem.config.cjs --update-env`. Para parar: `pm2 stop watchful-api watchful-web`. Não usar este perfil como implantação pública. Node 22 continua sendo a versão suportada.
