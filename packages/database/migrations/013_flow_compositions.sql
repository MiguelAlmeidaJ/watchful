ALTER TABLE ana_targets ADD COLUMN archived_at timestamptz;
ALTER TABLE ana_targets ADD CONSTRAINT ana_archived_disabled CHECK(archived_at IS NULL OR NOT enabled);
ALTER TABLE hydro_compositions ADD COLUMN margin_m3_s double precision NOT NULL DEFAULT 0 CHECK(margin_m3_s BETWEEN 0 AND 1000000),
 ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now(), ADD COLUMN archived_at timestamptz;
UPDATE hydro_compositions c SET margin_m3_s=100,updated_at=now() FROM municipalities m
WHERE c.municipality_id=m.id AND m.ibge_code='3101508' AND c.name='Anta + Simplício'
AND c.station_codes @> ARRAY['58440000','58385100','58612000'] AND cardinality(c.station_codes)=3;
