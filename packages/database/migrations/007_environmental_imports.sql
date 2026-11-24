CREATE TABLE environmental_imports (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 municipality_id uuid NOT NULL REFERENCES municipalities(id),
 provider text NOT NULL CHECK(provider IN ('ana','cemaden')),
 station_code text NOT NULL,
 station_name text NOT NULL,
 source_reference text NOT NULL,
 imported_by uuid NOT NULL REFERENCES users(id),
 imported_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE environmental_observations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 import_id uuid NOT NULL REFERENCES environmental_imports(id),
 observed_at timestamptz NOT NULL,
 metric text NOT NULL CHECK(metric IN ('river_level_m','discharge_m3_s','rainfall_mm')),
 value double precision NOT NULL,
 interval_minutes integer,
 CHECK(metric='river_level_m' OR value>=0),
 CHECK((metric='rainfall_mm' AND interval_minutes IS NOT NULL AND interval_minutes BETWEEN 1 AND 1440) OR (metric<>'rainfall_mm' AND interval_minutes IS NULL)),
 UNIQUE(import_id,observed_at,metric)
);
CREATE INDEX environmental_imports_municipality_idx ON environmental_imports(municipality_id,provider,imported_at DESC);
CREATE INDEX environmental_observations_import_idx ON environmental_observations(import_id,observed_at DESC);
