ALTER TABLE stations ADD COLUMN enabled boolean NOT NULL DEFAULT true;
ALTER TABLE stations ADD COLUMN last_success_at timestamptz;
ALTER TABLE stations ADD COLUMN last_attempt_at timestamptz;
ALTER TABLE stations ADD COLUMN last_error_at timestamptz;
ALTER TABLE stations ADD COLUMN consecutive_failures integer NOT NULL DEFAULT 0;
ALTER TABLE weather_readings ADD COLUMN humidity_pct numeric CHECK(humidity_pct BETWEEN 0 AND 100);
ALTER TABLE weather_readings ADD COLUMN wind_kmh numeric CHECK(wind_kmh >= 0);
ALTER TABLE weather_readings ADD COLUMN gust_kmh numeric CHECK(gust_kmh >= 0);
ALTER TABLE weather_readings ADD COLUMN pressure_hpa numeric;
ALTER TABLE weather_readings ADD COLUMN interval_minutes integer NOT NULL DEFAULT 60 CHECK(interval_minutes > 0);
ALTER TABLE weather_readings ADD COLUMN source_payload jsonb;
CREATE INDEX weather_readings_time_idx ON weather_readings(station_id,observed_at DESC);
CREATE TABLE forecast_locations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 municipality_id uuid NOT NULL REFERENCES municipalities(id),
 name text NOT NULL, location geometry(Point,4326) NOT NULL,
 enabled boolean NOT NULL DEFAULT true,
 last_success_at timestamptz, last_attempt_at timestamptz, last_error_at timestamptz,
 consecutive_failures integer NOT NULL DEFAULT 0
);
CREATE INDEX forecast_locations_geo_idx ON forecast_locations USING gist(location);
CREATE TABLE weather_forecasts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 location_id uuid NOT NULL REFERENCES forecast_locations(id),
 provider text NOT NULL, fetched_at timestamptz NOT NULL,
 valid_at timestamptz NOT NULL,
 precipitation_mm numeric CHECK(precipitation_mm >= 0),
 precipitation_probability_pct numeric CHECK(precipitation_probability_pct BETWEEN 0 AND 100),
 temperature_c numeric, humidity_pct numeric CHECK(humidity_pct BETWEEN 0 AND 100),
 wind_kmh numeric CHECK(wind_kmh >= 0), gust_kmh numeric CHECK(gust_kmh >= 0),
 UNIQUE(location_id,provider,fetched_at,valid_at)
);
CREATE INDEX weather_forecasts_lookup_idx ON weather_forecasts(location_id,provider,fetched_at DESC,valid_at);
CREATE TABLE ingestion_runs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 provider text NOT NULL, target_kind text NOT NULL CHECK(target_kind IN ('station','forecast_location')),
 target_id uuid NOT NULL, started_at timestamptz NOT NULL DEFAULT now(),
 finished_at timestamptz, status text NOT NULL CHECK(status IN ('running','success','failed')),
 records_count integer NOT NULL DEFAULT 0, error_code text
);
CREATE INDEX ingestion_runs_target_idx ON ingestion_runs(target_kind,target_id,started_at DESC);
