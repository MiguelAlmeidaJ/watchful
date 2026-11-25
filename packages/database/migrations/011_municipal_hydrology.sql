-- Fail without deleting existing associations if legacy data is ambiguous.
ALTER TABLE organization_municipalities ADD CONSTRAINT one_municipality_per_organization UNIQUE(organization_id);
ALTER TABLE organization_municipalities ADD CONSTRAINT one_organization_per_municipality UNIQUE(municipality_id);
-- Municipal accounts may have one organization; platform administrators retain global access.
CREATE UNIQUE INDEX memberships_one_organization_per_user ON memberships(user_id);
ALTER TABLE municipalities ADD COLUMN main_river text, ADD COLUMN main_river_source text;
ALTER TABLE hydro_features ADD COLUMN source_version text, ADD COLUMN downstream_external_id text, ADD COLUMN watercourse_type text;
CREATE TABLE hydro_compositions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 municipality_id uuid NOT NULL REFERENCES municipalities(id),
 name text NOT NULL,
 source text NOT NULL,
 station_codes text[] NOT NULL CHECK(cardinality(station_codes) BETWEEN 2 AND 20),
 UNIQUE(municipality_id,name)
);
INSERT INTO ana_targets(municipality_id,station_code,station_name,enabled)
SELECT m.id,s.code,s.name,false FROM municipalities m CROSS JOIN (VALUES
 ('58440000','UHE Simplício Moura Brasil'),('58385100','UHE Simplício Montante'),('58612000','UHE Simplício Rio Paraibuna')
) s(code,name) WHERE m.ibge_code='3101508' ON CONFLICT(municipality_id,station_code) DO NOTHING;
INSERT INTO hydro_compositions(municipality_id,name,source,station_codes)
SELECT id,'Anta + Simplício','Composição informada pelo responsável do projeto; validação hidrológica pendente',ARRAY['58440000','58385100','58612000'] FROM municipalities WHERE ibge_code='3101508' ON CONFLICT DO NOTHING;
UPDATE municipalities SET main_river='Rio Paraíba do Sul',main_river_source='Informado pelo responsável do projeto; revisão técnica pendente' WHERE ibge_code='3101508' AND main_river IS NULL;
