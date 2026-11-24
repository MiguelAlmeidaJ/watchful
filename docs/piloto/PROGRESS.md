# Progresso do piloto

## 24/11/2026

- Diagnóstico inicial revalidado contra o checkout, o esquema e o ambiente local.
- Fase 1 avançou com a migração 009, validação de qualidade por variável, critérios comuns de precipitação na API e no motor e tratamento de respostas vazias, inválidas ou duplicadas. Nove testes unitários e uma regressão com PostgreSQL/PostGIS passaram. Os oito pacotes passaram na verificação de tipos.
- Foi criado o workflow de CI para instalação congelada, tipos, testes e builds. Ainda falta execução no GitHub. O PM2 lê a configuração operacional do ambiente e a agenda de previsões ficou independente da de observações.
- Fase 2 começou pelo território real. Foi verificada a origem da malha cadastrada, configurado o ponto municipal do Open-Meteo pela API administrativa e comprovada a coleta automática de 168 previsões horárias no banco local.
- Os 39 setores do SGB/CPRM de 2012 foram importados pela API administrativa, com tipologia, grau original e data. Todos são válidos e inteiramente cobertos pela malha municipal. A camada histórica é independente de `risk_areas`. A reimportação do mesmo lote retornou zero alterações.
- O INMET falhou na consulta de catálogo. Os endpoints legados da ANA responderam com dados aprovados em uma sondagem, mas a coleta automática requer confirmação de continuidade e enquadramento da estação. A próxima integração territorial é vincular dados de drenagem e estações regionais, com procedência e validação espacial.

Próximas entregas e dependências estão no [plano](EXECUTION_PLAN.md). Resultados observáveis ficam em [validação](VALIDATION.md).
