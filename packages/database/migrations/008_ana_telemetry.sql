CREATE TABLE ana_targets (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 municipality_id uuid NOT NULL REFERENCES municipalities(id),
 station_code text NOT NULL CHECK(station_code ~ '^[0-9]{8}$'),
 station_name text NOT NULL,
 enabled boolean NOT NULL DEFAULT true,
 next_due timestamptz NOT NULL DEFAULT now(),
 last_attempt_at timestamptz,
 last_success_at timestamptz,
 last_error text,
 records_count integer,
 UNIQUE(municipality_id,station_code)
);
CREATE TABLE ana_telemetry (
 target_id uuid NOT NULL REFERENCES ana_targets(id),
 observed_at timestamptz NOT NULL,
 discharge_m3_s double precision CHECK(discharge_m3_s>=0),
 discharge_quality text,
 level_raw double precision,
 level_quality text,
 fetched_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(target_id,observed_at)
);
CREATE INDEX ana_due_idx ON ana_targets(next_due) WHERE enabled;
