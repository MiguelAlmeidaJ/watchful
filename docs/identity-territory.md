# Fase 02 — Identidade e território
Implementação inicial. Não executada nem homologada.
## Autenticação
Access JWT HS256 15 min, refresh opaco armazenado como SHA-256, rotação a cada uso, revogação de família em caso de reutilização. Senhas scrypt com salt. Logout revoga refresh; access pode continuar válido por até 15 min. Não existe cadastro público. Configure JWT_SECRET aleatório (mínimo 32 bytes), execute migrações e depois pnpm --filter @watchful/api admin:bootstrap com credenciais temporárias no .env; remova-as após uso.
## Permissões
Administrador da plataforma provisiona organizações, contas, vínculos e catálogos globais. Administrador de organização lê seus usuários e auditoria. Operador e viewer podem consultar catálogos vinculados à organização; ações operacionais virão com os módulos seguintes. Escopo territorial por vínculo organization_municipalities. Usuários sem vínculo não veem catálogos. Ainda não há MFA, recuperação de senha, rate limiting, revogação imediata de access token ou gestão completa de desativação.
## Endpoints /api/v1
POST auth/login, auth/refresh, auth/logout; GET auth/me.
GET/POST organizations; GET/POST organizations/:id/users; POST organizations/:id/memberships; POST organizations/:id/municipalities; GET organizations/:id/audit.
GET/POST municipalities; POST municipalities/import (UF); GET/POST stations; GET health/live e health/ready.
Importação IBGE por UF apenas nomes/códigos, não polígonos; fonte externa ainda não testada.
## Persistência
Migração 002; consultas parametrizadas via pg, transações para alterações auditadas. Drizzle adiado para evitar duplicação de migrations SQL espaciais. Auditoria não inclui senha ou tokens. Não há RLS; escopo implementado na API, revisar antes de produção.
## Próximos passos
Rate limit distribuído, MFA, lifecycle de usuários, testes de isolamento, concorrência e revogação; validar IBGE. Fase 03: providers meteorológicos, ingestão assíncrona, qualidade e distinção observação/previsão.
