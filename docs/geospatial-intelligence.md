# Fase 04 — Inteligência geográfica
Código publicado; execução e validação pendentes.
## Dados
GeoJSON em WGS84 (EPSG:4326), coordenadas longitude/latitude. Polygon/MultiPolygon e LineString/MultiLineString. PostGIS valida topologia e cobertura municipal; geometrias inválidas ou fora do limite são rejeitadas, não corrigidas automaticamente. Áreas e linhas transmunicipais precisam ser recortadas na preparação dos dados. Limites, áreas e rios são importados de arquivos previamente obtidos e autorizados (IBGE, SGB, Defesa Civil etc.); não há download automático nem dados oficiais incluídos. Fonte e versão devem ser preenchidas conforme metadados reais.
## Permissões
Superadmin administra catálogos globais, importações, abrigos, limites e arquivamento. Usuários autenticados consultam apenas municípios vinculados; ocorrências exigem também vínculo com a organização responsável. Operadores/admins da organização vinculada registram ocorrências e mudam estado. Auditoria transacional; versões de áreas preservam geometrias anteriores. Não há publicação pública nesta fase.
## API /api/v1/geo
PUT municipalities/:id/boundary — {geometry,source,version}
POST risk-areas/import — {municipalityId,source,collection:{type:"FeatureCollection",features:[{type:"Feature",geometry,properties:{externalId,name,hazard,classification,sourceVersion?}}]}}
PATCH risk-areas/:id/archive
GET risk-areas/:id/versions
GET layers/:layer?municipalityId=uuid&bbox=west,south,east,north&limit=100 (7 camadas)
GET risk-areas/nearby, stations/nearby, shelters/nearby — municipalityId,latitude,longitude,radiusMeters,limit
POST shelters — municipalityId,name,coordinates,address?,capacity?,source
PATCH shelters/:id/status — status
POST incidents — municipalityId,organizationId,hazard,description,coordinates,occurredAt
PATCH incidents/:id/status — status
POST rivers — municipalityId,name,source,externalId,geometry
## Limites e segurança
Lotes de até 50 áreas; 30 mil vértices por geometria; JSON 2 MB; bbox até 10 graus, 200 feições por consulta; respostas indicam truncamento. Distâncias geodésicas em metros; não representam caminho seguro nem representatividade meteorológica. Classificação territorial não é alerta dinâmico. Abrigo começa unverified; disponibilidade precisa de confirmação. Não há cobertura certificada nem rotas de evacuação. Não armazenamos a localização enviada para consulta de proximidade na aplicação; revisar logs de proxy em homologação. O MapLibre web tem componente reutilizável com estilo vazio padrão, sem fornecedor de tiles escolhido; integração de tela e MapLibre mobile na fase 06 (build nativo necessário). Hidrografia aqui é apenas geometria, sem leituras de nível.
## Validação posterior
Testar topologia, limites, sobreposição, antimeridiano, concorrência, isolamento entre organizações, índices e carga de mapas. Planejar simplificação por zoom, paginação espacial/tiles vetoriais, histórico de limites e abrigos, retenção e importadores oficiais. Nenhuma emissão de alerta nesta fase.

## Setores históricos

A migração 010 adiciona uma camada de referência para levantamentos históricos. `POST /api/v1/geo/historical-risk-sectors/import` aceita JSON com `municipalityId`, `source`, `sourceUrl`, `sourceVersion` e uma `FeatureCollection`. Cada feição traz `externalId`, `name`, `sourceHazard`, `sourceClassification` e `surveyDate`. O servidor valida geometrias, interseção com o território, autorização e identificadores. Consultas seguem o escopo municipal em `GET /api/v1/geo/layers/historical-risk-sectors`.

A camada registra o grau publicado na fonte, preserva o desenho dos setores e tem estilo próprio no mapa. Seus dados ficam separados das áreas operacionais usadas para regras e alertas. A [importação do SGB em Além Paraíba](piloto/SOURCES.md#reproduzir-a-importação-histórica-de-além-paraíba) serve como caso reproduzível.
