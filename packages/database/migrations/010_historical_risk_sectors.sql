CREATE TABLE historical_risk_sectors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  municipality_id uuid NOT NULL REFERENCES municipalities(id),
  source text NOT NULL,
  source_url text NOT NULL,
  source_version text NOT NULL,
  external_id text NOT NULL,
  name text NOT NULL,
  source_hazard text NOT NULL,
  source_classification text NOT NULL,
  survey_date date NOT NULL,
  boundary geometry(MultiPolygon, 4326) NOT NULL,
  imported_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (municipality_id, source, source_version, external_id),
  CHECK (ST_IsValid(boundary) AND NOT ST_IsEmpty(boundary))
);

CREATE INDEX historical_risk_sectors_boundary_idx ON historical_risk_sectors USING gist (boundary);
