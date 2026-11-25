# Evidências de validação

| Data | Verificação | Resultado |
| --- | --- | --- |
| 24/11/2026 | `docker compose exec -T postgres psql -U watchful -d watchful` com consultas ao esquema e ao município `3101508` | Oito migrações e malha presente. Fonte, versão e representatividade ainda precisam de auditoria |
| Antes da fase 1 | Validação local anterior com fixtures sintéticas | Login, renovação, escopo por organização, consultas PostGIS, rascunho calculado e notificações internas exercitados. O roteiro temporário anterior não constitui suíte de regressão versionada |
| Antes da fase 1 | Bundle servido pelo Metro na porta `8081` | Android JavaScript empacotado. Build e execução nativa ainda pendentes |
| 24/11/2026 | `pnpm --filter @watchful/worker test` | Nove testes aprovados. Inclui chuva zero, série vazia, anomalias, duplicidade, limites de resposta, datas e unidades |
| 24/11/2026 | `pnpm test:weather:integration` com `compose.test.yaml` | Migrações aplicadas em PostGIS isolado, inclusive a evolução de uma leitura legada. Confirmados cobertura e avaliação consistentes, retentativa idempotente, preservação da chuva, diagnóstico de falha e exclusão mútua |
| 24/11/2026 | `pnpm -r --if-present run typecheck`, builds de API e worker e `/health/ready` local | Oito pacotes sem erro de tipos, builds concluídos, migração 009 aplicada e retorno `200` após reiniciar a API |
| 24/11/2026 | API IBGE v3 para `3101508` e comparação com `boundary_version` e `ST_IsValid` | HTTP 200, município e SHA-256 coincidentes. O PostgreSQL confirmou geometria válida com 96 vértices |
| 24/11/2026 | Cadastro administrativo do ponto municipal, ingestão real e GET `/api/v1/weather/forecast` | 168 previsões armazenadas em UTC. API retornou `available` e 149 horas futuras na verificação inicial |
| 24/11/2026 | Inicialização do worker local e inspeção de `bull:weather.ingestion:repeat` e `ingestion_runs` | `manual-v1` e `forecasts-v1` presentes, sem `observations-v1`. A coleta de inicialização terminou às 15h08 no horário de São Paulo, com 168 registros e estado `success` |
| 24/11/2026 | Sondagem ANA legada pelo código `58653500` | Ambos os endpoints responderam HTTP 200. O parser aceitou 33 registros de vazão aprovada, o último às 14h no horário de São Paulo. Isso comprova uma leitura pontual, com continuidade e representatividade pendentes |
| 24/11/2026 | Migração 010, conversão SGB e API administrativa | PostGIS validou e situou integralmente os 39 polígonos na malha. O primeiro `POST` registrou 39, a repetição registrou zero alterações e a camada autenticada devolveu 39. A camada de risco operacional permaneceu vazia e a requisição anônima foi recusada com HTTP 401 |
| 24/11/2026 | Regressão PostGIS com migração 010 e duas verificações de integração | Além da chuva, verificou autorização administrativa, recusa de leitura fora do escopo, idempotência e separação entre setores históricos e áreas operacionais |
| 24/11/2026 | Instalação nova com `pnpm install --offline --frozen-lockfile` e `pnpm build` em cópia isolada | Builds de contratos, API, worker e web passaram. O workflow GitHub ainda não foi executado remotamente |
| 24/11/2026 | Verificação local após a migração 010 | Painel e API responderam HTTP 200, 10 migrações registradas, 39 setores cobertos pela malha e bundle Android atualizado servido pelo Metro com HTTP 200. Instalação e execução nativas continuam pendentes |

Testes de regressão novos devem registrar comando, escopo e resultado. Dados sintéticos ficam em ambiente de teste.
