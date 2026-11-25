# Arquitetura
Monólito modular NestJS com processo worker independente, API REST v1, Next.js e Expo. PostgreSQL é fonte de verdade; PostGIS para geometria; Redis cache descartável separado do Redis de filas persistentes.
Contratos compartilhados não dependem de frameworks. Módulos futuros: auth, organizations, municipalities, stations, weather, forecasts, hydrology, risk-areas, risk-rules, assessments, alerts, incidents, subscriptions, notifications, audit.
Observação medida, previsão e aviso oficial são entidades distintas. Dados ausentes ou vencidos devem resultar em estado indeterminado, nunca em normalidade presumida. Regras regionais serão revisadas e versionadas. Notificações não garantem entrega. Não substituir canais oficiais.
Decisões pendentes: ORM Drizzle com SQL espacial, autenticação, licenças de dados, MapLibre e tiles, NativeWind, push, retenção e LGPD, observabilidade, CI e lockfile.
