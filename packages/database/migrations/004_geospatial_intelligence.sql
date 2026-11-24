ALTER TABLE municipalities ADD COLUMN boundary_source text, ADD COLUMN boundary_version text, ADD COLUMN boundary_updated_at timestamptz;
ALTER TABLE risk_areas ADD COLUMN external_id text, ADD COLUMN source_version text, ADD COLUMN classification text NOT NULL DEFAULT 'unknown' CHECK(classification IN ('low','medium','high','very_high','unknown')), ADD COLUMN active boolean NOT NULL DEFAULT true;
CREATE UNIQUE INDEX risk_areas_source_identity ON risk_areas(municipality_id,source,external_id) WHERE external_id IS NOT NULL;
CREATE INDEX risk_areas_geography_idx ON risk_areas USING gist((boundary::geography));
CREATE INDEX stations_geography_idx ON stations USING gist((location::geography));
CREATE INDEX risk_areas_municipality_idx ON risk_areas(municipality_id);
CREATE TABLE risk_area_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), area_id uuid NOT NULL REFERENCES risk_areas(id),
 version integer NOT NULL CHECK(version>0), snapshot jsonb NOT NULL, actor_id uuid REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(area_id,version)
);
CREATE TABLE shelters (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), municipality_id uuid NOT NULL REFERENCES municipalities(id),
 name text NOT NULL, location geometry(Point,4326) NOT NULL, address text,
 capacity integer CHECK(capacity>=0), status text NOT NULL DEFAULT 'unverified' CHECK(status IN ('unverified','available','unavailable','full')),
 source text NOT NULL, verified_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX shelters_location_idx ON shelters USING gist(location);
CREATE INDEX shelters_geography_idx ON shelters USING gist((location::geography));
CREATE INDEX shelters_municipality_idx ON shelters(municipality_id);
CREATE TABLE incidents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), municipality_id uuid NOT NULL REFERENCES municipalities(id),
 organization_id uuid NOT NULL REFERENCES organizations(id), reported_by uuid NOT NULL REFERENCES users(id),
 hazard text NOT NULL, description text NOT NULL, location geometry(Point,4326) NOT NULL,
 occurred_at timestamptz NOT NULL, status text NOT NULL DEFAULT 'reported' CHECK(status IN ('reported','verified','resolved','dismissed')),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX incidents_location_idx ON incidents USING gist(location);
CREATE INDEX incidents_org_time_idx ON incidents(organization_id,occurred_at DESC);
CREATE TABLE hydro_features (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), municipality_id uuid NOT NULL REFERENCES municipalities(id),
 name text NOT NULL, source text NOT NULL, external_id text NOT NULL,
 geometry geometry(MultiLineString,4326) NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(municipality_id,source,external_id)
);
CREATE INDEX hydro_features_geo_idx ON hydro_features USING gist(geometry);
CREATE INDEX hydro_features_municipality_idx ON hydro_features(municipality_id);
