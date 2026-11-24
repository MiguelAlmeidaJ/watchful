CREATE TABLE inmet_catalog_cache (
 id boolean PRIMARY KEY DEFAULT true CHECK(id),
 source text NOT NULL CHECK(source IN ('api','official_csv_upload')),
 fetched_at timestamptz NOT NULL DEFAULT now(),
 data jsonb NOT NULL CHECK(jsonb_typeof(data)='array')
);
CREATE TABLE weather_sync_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 target_kind text NOT NULL CHECK(target_kind IN ('station','forecast_location')),
 target_id uuid NOT NULL,
 requested_by uuid NOT NULL REFERENCES users(id),
 requested_at timestamptz NOT NULL DEFAULT now(),
 dispatched_at timestamptz
);
CREATE INDEX weather_sync_pending_idx ON weather_sync_requests(requested_at) WHERE dispatched_at IS NULL;
CREATE INDEX weather_sync_target_idx ON weather_sync_requests(target_kind,target_id,requested_at DESC);
