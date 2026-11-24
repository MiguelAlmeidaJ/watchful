# Fase 03 — Inteligência meteorológica
Código inicial publicado; sem execução, instalação ou validação de endpoints externos.
## Fontes
INMET: observações horárias por código de estação, janela de 48h para recuperar atrasos. Contrato de campos e disponibilidade devem ser verificados em homologação. Horários UTC; vento m/s convertido para km/h; sentinelas e valores fora das faixas de sanidade são nulos. Faixas de sanidade não são limiares de desastre.
Open-Meteo: previsão horária de 7 dias por local de previsão, separada de estações físicas. fetched_at é hora de consulta, não emissão do modelo. Verificar licença, plano comercial, quotas, unidades e disponibilidade antes de ativar. Não usar API gratuita comercialmente sem autorização.
## Operação
Cadastrar município e estação com provider=inmet, externalId=código real; criar local de previsão com coordenadas. Aplicar migração 003. WEATHER_INGESTION_ENABLED=true habilita os agendadores de 15 min e 60 min. Por padrão desativados. Jobs previamente enfileirados podem continuar; parar worker para suspensão imediata. BullMQ limita a execução a 10 jobs/min, concorrência 3, 3 tentativas com backoff exponencial. Locks PostgreSQL por alvo e upserts evitam duplicidade concorrente; falhas registradas em ingestion_runs. Não há retenção automática, reconciliação de runs interrompidos ou backfill superior a 48h nesta etapa.
## API /api/v1/weather
GET current?stationId=uuid; GET history?stationId=uuid&from=ISO&to=ISO&limit=500; GET rainfall?stationId=uuid; GET forecast-locations; POST forecast-locations (superadmin); GET forecast?locationId=uuid; GET stations/:id/status; GET ingestion-runs?kind=station&targetId=uuid.
Consultas autenticadas e escopadas por vínculo territorial; autorização ocorre antes do cache. Redis cache é opcional, TTL 30s/60s, fallback PostgreSQL. Status de dados: available, degraded, stale (>180 min), unknown, disabled; limite provisório não indica segurança. Histórico limitado a 31 dias e 1000 registros.
Acumulados de 1/6/24/72h usam observações horárias encerradas, com cobertura explícita. totalMm é nulo se faltar qualquer medida; partialMm não equivale ao total. Qualidade suspect pode indicar outra variável ausente; revisar qualidade por variável e regras regionais antes do motor de risco. Não preencher ausências com zero.
## Próxima fase
Importar polígonos oficiais, validar geometrias, consultas espaciais, mapas. Antes de produção: validar contratos dos provedores, testar cargas, quotas e cron, retenção e backfill, métricas, alertas operacionais, isolamento de tenants, lockfile e compilação.
