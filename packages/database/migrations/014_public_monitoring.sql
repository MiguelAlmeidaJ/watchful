ALTER TABLE municipalities ADD COLUMN public_flow_composition_id uuid REFERENCES hydro_compositions(id);
UPDATE municipalities m SET public_flow_composition_id=c.id FROM hydro_compositions c
WHERE m.ibge_code='3101508' AND c.municipality_id=m.id AND c.name='Anta + Simplício' AND c.archived_at IS NULL;
