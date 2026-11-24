# Auditoria inicial do Watchful

## Linha de base em 24/11/2026

O checkout local está em `master`, sem commits, com trabalho existente a preservar. O monorepo usa Next.js, Expo, NestJS, PostgreSQL/PostGIS, Redis e BullMQ. O lockfile e o ponto de entrada do Expo já haviam sido sincronizados. O ambiente foi consultado em modo de leitura: oito migrações registradas e Além Paraíba (`3101508`) com limite presente. Essa presença não verifica por si só a origem ou a integridade da malha. Os demais dados reais exigem inventário e validação por fonte.

## Evidências iniciais e lacunas

| Área | Implementação existente | Lacunas ou riscos |
| --- | --- | --- |
| Banco e identidade | Migrações SQL, RBAC, sessões rotativas, auditoria, PostGIS e escopo na API | Poucos testes persistidos, sem MFA, recuperação, rate limit, RLS ou política de retenção |
| Meteorologia | Adaptadores, agenda, tentativas, histórico e estados de estação | INMET pode indicar sucesso sem métricas. Cobertura diverge entre API e motor. Há risco de perder precipitação em atualizações parciais. Falta rastreabilidade de reprocessamento e cobertura por variável |
| Hidrologia | Importação histórica e adaptador ANA legado | Precisão temporal, contrato, unidade e datum precisam de verificação. Falta relacionamento com bacias e estações a montante |
| Território | Importação IBGE/GeoJSON, validação espacial, sete camadas, abrigos e ocorrências | Falta verificação de proveniência no banco local, hidrografia regional, camadas de bacias, filtros, atualização e desempenho de grandes volumes |
| Risco e alertas | Regra versionada de chuva, revisão independente, outbox e notificação interna | Regras univariadas, critérios regionais sem homologação, ausência de recepção automática de avisos, escalonamento, push e recibos |
| Interfaces | Web e mobile integrados, mapas e estados vazios. Bundle Android comprovado anteriormente | Fluxos operacionais, acessibilidade e dispositivos reais requerem validação. Sessões móveis sem persistência segura ou offline |
| Infra e QA | Compose de infra, PM2, health checks e quatro testes de risco | PM2 ativa coletas por configuração própria. Não há pipeline CI, imagens de aplicações, procedimento validado de restore, observabilidade de ponta a ponta ou suíte integrada persistida |

O código, a documentação, o banco e os testes têm estágios distintos de evidência. O [registro de validação](VALIDATION.md) indica o que foi efetivamente verificado.
