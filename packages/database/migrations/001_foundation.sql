CREATE EXTENSION IF NOT EXISTS postgis;
CREATE TABLE municipalities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ibge_code text NOT NULL UNIQUE CHECK (ibge_code ~ '^[0-9]{7}$'),
  name text NOT NULL,
  state char(2) NOT NULL,
  boundary geometry(MultiPolygon,4326)
);
CREATE INDEX municipalities_boundary_idx ON municipalities USING gist(boundary);
CREATE TABLE stations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  municipality_id uuid REFERENCES municipalities(id),
  provider text NOT NULL,
  external_id text NOT NULL,
  name text NOT NULL,
  location geometry(Point,4326) NOT NULL,
  UNIQUE(provider,external_id)
);
CREATE INDEX stations_location_idx ON stations USING gist(location);
CREATE TABLE weather_readings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id uuid NOT NULL REFERENCES stations(id),
  observed_at timestamptz NOT NULL,
  ingested_at timestamptz NOT NULL DEFAULT now(),
  precipitation_mm numeric CHECK (precipitation_mm >= 0),
  temperature_c numeric,
  quality text NOT NULL CHECK (quality IN ('valid','suspect','missing')),
  UNIQUE(station_id,observed_at)
);
CREATE TABLE risk_areas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  municipality_id uuid NOT NULL REFERENCES municipalities(id),
  name text NOT NULL,
  hazard text NOT NULL,
  boundary geometry(MultiPolygon,4326) NOT NULL,
  source text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX risk_areas_boundary_idx ON risk_areas USING gist(boundary);
