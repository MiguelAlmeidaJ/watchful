CREATE TABLE organizations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE users (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text NOT NULL UNIQUE,
 password_hash text NOT NULL, active boolean NOT NULL DEFAULT true,
 platform_admin boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(email=lower(email))
);
CREATE TABLE memberships (
 user_id uuid NOT NULL REFERENCES users(id), organization_id uuid NOT NULL REFERENCES organizations(id),
 role text NOT NULL CHECK(role IN ('admin','operator','viewer')),
 PRIMARY KEY(user_id,organization_id)
);
CREATE TABLE organization_municipalities (
 organization_id uuid NOT NULL REFERENCES organizations(id), municipality_id uuid NOT NULL REFERENCES municipalities(id),
 PRIMARY KEY(organization_id,municipality_id)
);
CREATE TABLE refresh_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id),
 family_id uuid NOT NULL, token_hash text NOT NULL UNIQUE, expires_at timestamptz NOT NULL,
 used_at timestamptz, revoked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX refresh_family_idx ON refresh_sessions(family_id);
CREATE TABLE audit_logs (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, actor_id uuid REFERENCES users(id),
 organization_id uuid REFERENCES organizations(id), action text NOT NULL, target text NOT NULL,
 details jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_org_time_idx ON audit_logs(organization_id,created_at DESC);
