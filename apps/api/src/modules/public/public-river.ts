import type { Database } from '../../common/database';

const alemParaiba = '3101508';
const thresholds = [
 { level: 'attention', label: 'Atenção', minimumM3s: 1300 },
 { level: 'alert', label: 'Alerta', minimumM3s: 1900 },
 { level: 'flood', label: 'Inundação', minimumM3s: 2200 },
] as const;

const pilotNames: Record<string, string> = {
 '58385100': 'Anta + Simplício',
 '58612000': 'Rio Paraibuna',
 '58440000': 'Rio Piabanha',
};

export function classifyMunicipalFlow(ibge: string, total: number | null, recent: boolean) {
 if (ibge !== alemParaiba) return null;
 const current = recent && total !== null
  ? thresholds.filter(band => total >= band.minimumM3s).at(-1) ?? { level: 'below_attention', label: 'Abaixo da faixa de atenção' }
  : null;
 return { current, thresholds };
}

type Contribution = { stationCode: string; stationName: string | null; observedAt: string | null; dischargeM3s: number | null; lastAttemptAt: string | null; lastSuccessAt: string | null; collectionFailed: boolean; enabled: boolean };

export async function getPublicRiver(db: Database, municipalityId: string, ibge: string) {
 const isPilot = ibge === alemParaiba;
 const row = (await db.query<{
  total: number | null;
  observed_at: Date | null;
  recent: boolean;
  contributions: Contribution[];
 }>(`WITH composition AS (
  SELECT c.station_codes, c.margin_m3_s FROM municipalities m JOIN hydro_compositions c
   ON c.id=m.public_flow_composition_id AND c.municipality_id=m.id AND c.archived_at IS NULL WHERE m.id=$1
 ), members AS (
  SELECT code, position, t.id, t.station_name, t.enabled, t.last_error, t.last_attempt_at, t.last_success_at
  FROM composition c CROSS JOIN LATERAL unnest(c.station_codes) WITH ORDINALITY AS stations(code, position)
  LEFT JOIN ana_targets t ON t.municipality_id=$1 AND t.station_code=code AND t.archived_at IS NULL
 ), complete AS (
  SELECT a.observed_at, sum(a.discharge_m3_s::numeric) AS measured_sum,
   bool_and(t.enabled AND t.last_error IS NULL) AND a.observed_at>=now()-interval '2 hours' AS recent
  FROM members t JOIN ana_telemetry a ON a.target_id=t.id
  WHERE a.discharge_quality='Dado aprovado' AND a.discharge_m3_s IS NOT NULL
   AND a.observed_at BETWEEN now()-interval '7 days' AND now()
  GROUP BY a.observed_at
  HAVING count(DISTINCT t.code)=(SELECT cardinality(station_codes) FROM composition)
   AND (NOT $2::boolean OR count(DISTINCT t.code)=3)
  ORDER BY a.observed_at DESC LIMIT 1
 )
 SELECT (complete.measured_sum + CASE WHEN $2::boolean THEN 0 ELSE c.margin_m3_s::numeric END)::float8 AS total,
  complete.observed_at, coalesce(complete.recent,false) AS recent,
  (SELECT jsonb_agg(jsonb_build_object('stationCode',t.code,'stationName',t.station_name,
   'observedAt',reading.observed_at,'dischargeM3s',reading.discharge_m3_s, 'lastAttemptAt',t.last_attempt_at, 'lastSuccessAt',t.last_success_at, 'collectionFailed',t.last_error IS NOT NULL, 'enabled',coalesce(t.enabled,false)) ORDER BY t.position)
   FROM members t LEFT JOIN LATERAL (
    SELECT observed_at,discharge_m3_s FROM ana_telemetry
    WHERE target_id=t.id AND discharge_quality='Dado aprovado' AND discharge_m3_s IS NOT NULL
     AND observed_at BETWEEN now()-interval '7 days' AND now()
    ORDER BY observed_at DESC LIMIT 1
   ) reading ON true) AS contributions
 FROM composition c LEFT JOIN complete ON true`, [municipalityId, isPilot])).rows[0];

 if (!row) return isPilot ? {
  estimatedM3s: null, observedAt: null, status: 'unavailable', contributions: [],
  localStage: classifyMunicipalFlow(ibge, null, false),
 } : null;
 return {
  estimatedM3s: row.total,
  observedAt: row.observed_at,
  status: row.recent ? 'available' : row.observed_at ? 'historical' : 'unavailable',
  contributions: row.contributions.map(({stationCode, ...reading}) => ({
   ...reading, stationCode, name: (isPilot ? pilotNames[stationCode] : undefined) ?? reading.stationName ?? stationCode,
  })),
  localStage: classifyMunicipalFlow(ibge, row.total, row.recent),
 };
}
