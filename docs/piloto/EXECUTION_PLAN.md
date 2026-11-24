# Plano de execução do piloto

| Fase | Dependências | Critério de aceitação |
| --- | --- | --- |
| 1. Diagnóstico e estabilização | Checkout, Node/pnpm, Compose e banco local | Auditar a linha de base. Corrigir ingestão vazia e divergência de qualidade, cobrir regressões no PostgreSQL real, validar tipos e impedir ativação implícita por perfil |
| 2. Integração territorial | Proveniência das fontes e contratos aceitos na fase 1 | Verificar malha e identidade municipal; importar séries e catálogos verificáveis; configurar fontes por interface; demonstrar regiões, redes e estações úteis a montante. Registrar fontes indisponíveis e procedimentos de inclusão |
| 3. Inteligência e risco | Séries, cobertura e metadados validados | Indicadores com janelas, evidências e unidades; regras versionadas multiameaça, com qualidade, representatividade, explicação, reprocessamento e isolamento experimental. Limiares operacionais aprovados por responsáveis |
| 4. Comunicação e interfaces | Contratos de dados e ciclo de risco estáveis | Origem e severidade claras, revisão humana, publicação interna testada, entrega com recibos, preferências, push em ambiente isolado. Mapas e experiência web/mobile validados com dados reais e offline datado |
| 5. Segurança e infraestrutura | Escopo de organização e interfaces identificados | Proteções de autenticação e isolamento testadas, serviços observáveis, imagens e perfis por ambiente, CI/CD, migrações e recuperação com restore verificado |
| 6. Validação e homologação | Evidências das fases 1 a 5 | Regressão, carga, falhas, dados reais e builds validados. Manuais, matriz, procedimentos e dependências institucionais revisados com os responsáveis |

Pesquisa de fontes, testes e segurança seguem em paralelo às mudanças que não dependem delas. A matriz final está em [prontidão operacional](PRODUCTION_READINESS.md).
