ALTER TABLE hydro_features ADD COLUMN source_attributes jsonb NOT NULL DEFAULT '{}'::jsonb;
CREATE TABLE hydro_import_runs (
 municipality_id uuid PRIMARY KEY REFERENCES municipalities(id),
 source_url text NOT NULL,
 boundary_version text,
 received integer NOT NULL CHECK(received>=0),
 imported integer NOT NULL CHECK(imported>=0),
 imported_at timestamptz NOT NULL DEFAULT now()
);
