# Roadmap
1. Fundação: workspace, aplicações, infraestrutura e migração inicial (estrutura entregue; validação pendente).
2. Identidade e território: organizações, usuários, RBAC, municípios, importação IBGE, catálogo de estações.
3. Meteorologia: adapters INMET/Open-Meteo, coleta assíncrona, observações e previsões separadas, qualidade e histórico.
4. Geoprocessamento: áreas de risco, base MapLibre web, importação de polígonos, consultas PostGIS, abrigos e ocorrências (código publicado; validação pendente).
5. Alertas: motor versionado, aprovação, importação manual de avisos, outbox e notificações internas (código publicado; validação e sincronização oficial automática pendentes).
6. Web e mobile: interfaces iniciais integradas, cliente HTTP, mapas web/native, inscrição municipal e notificações internas (código publicado; push, offline persistente e validação pendentes).
7. Validação local integrada: lockfile, builds, testes unitários/e2e, migrações, falhas de fontes, segurança.
8. Piloto supervisionado: validação técnica dos critérios, dados oficiais e processos de emergência.

Um commit por etapa coesa; sem merge para main até revisão. Nenhum alerta público automatizado antes de validação operacional.
