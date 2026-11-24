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
