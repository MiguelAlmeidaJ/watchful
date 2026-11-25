CREATE TABLE risk_rules (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id),
 area_id uuid NOT NULL REFERENCES risk_areas(id), station_id uuid NOT NULL REFERENCES stations(id),
 version integer NOT NULL CHECK(version>0), window_hours integer NOT NULL CHECK(window_hours IN (1,6,24,72)),
 attention_mm numeric NOT NULL, warning_mm numeric NOT NULL, severe_mm numeric NOT NULL,
 rationale text NOT NULL, active boolean NOT NULL DEFAULT false, approved_by uuid REFERENCES users(id),
 approved_at timestamptz, created_by uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(0<attention_mm AND attention_mm<warning_mm AND warning_mm<severe_mm),
 CHECK(NOT active OR (approved_by IS NOT NULL AND approved_at IS NOT NULL AND approved_by<>created_by)),
 UNIQUE(organization_id,area_id,version)
);
CREATE UNIQUE INDEX risk_rule_active_idx ON risk_rules(organization_id,area_id) WHERE active;
CREATE TABLE risk_assessments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), rule_id uuid NOT NULL REFERENCES risk_rules(id),
 evaluated_at timestamptz NOT NULL DEFAULT now(), window_end timestamptz NOT NULL,
 level text NOT NULL CHECK(level IN ('unknown','normal','attention','warning','severe')),
 evidence jsonb NOT NULL, fingerprint text NOT NULL, UNIQUE(rule_id,fingerprint)
);
CREATE INDEX assessments_rule_time_idx ON risk_assessments(rule_id,evaluated_at DESC);
CREATE TABLE alerts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id),
 municipality_id uuid NOT NULL REFERENCES municipalities(id), area_id uuid REFERENCES risk_areas(id),
 assessment_id uuid REFERENCES risk_assessments(id), origin text NOT NULL CHECK(origin IN ('calculated','manual','official')),
 severity text NOT NULL CHECK(severity IN ('attention','warning','severe')),
 title text NOT NULL, message text NOT NULL, source text NOT NULL, external_id text,
 geometry geometry(MultiPolygon,4326) NOT NULL,
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','approved','published','cancelled','expired')),
 starts_at timestamptz NOT NULL, expires_at timestamptz NOT NULL CHECK(expires_at>starts_at),
 created_by uuid REFERENCES users(id), approved_by uuid REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(origin<>'official' OR external_id IS NOT NULL)
);
CREATE UNIQUE INDEX alerts_official_identity ON alerts(organization_id,source,external_id) WHERE origin='official';
CREATE UNIQUE INDEX alerts_assessment_identity ON alerts(assessment_id) WHERE assessment_id IS NOT NULL;
CREATE UNIQUE INDEX alerts_open_calculated ON alerts(organization_id,area_id) WHERE origin='calculated' AND status IN ('draft','approved','published');
CREATE INDEX alerts_geometry_idx ON alerts USING gist(geometry);
CREATE INDEX alerts_org_status_idx ON alerts(organization_id,status,expires_at);
CREATE TABLE alert_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), alert_id uuid NOT NULL REFERENCES alerts(id),
 event_type text NOT NULL, actor_id uuid REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(), details jsonb NOT NULL DEFAULT '{}'
);
CREATE TABLE subscriptions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id),
 organization_id uuid NOT NULL REFERENCES organizations(id), municipality_id uuid NOT NULL REFERENCES municipalities(id),
 location geometry(Point,4326), enabled boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(user_id,organization_id,municipality_id)
);
CREATE INDEX subscriptions_scope_idx ON subscriptions(organization_id,municipality_id) WHERE enabled;
CREATE TABLE event_outbox (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), alert_event_id uuid NOT NULL UNIQUE REFERENCES alert_events(id),
 created_at timestamptz NOT NULL DEFAULT now(), processed_at timestamptz, attempts integer NOT NULL DEFAULT 0
);
CREATE INDEX outbox_pending_idx ON event_outbox(created_at) WHERE processed_at IS NULL;
CREATE TABLE notifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), alert_event_id uuid NOT NULL REFERENCES alert_events(id),
 user_id uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(), read_at timestamptz,
 UNIQUE(alert_event_id,user_id)
);
CREATE INDEX notifications_user_idx ON notifications(user_id,created_at DESC);
