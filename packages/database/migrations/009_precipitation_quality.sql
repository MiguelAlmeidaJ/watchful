ALTER TABLE weather_readings ADD COLUMN precipitation_quality text;

ALTER TABLE weather_readings ADD CONSTRAINT weather_readings_precipitation_quality_check CHECK (
  precipitation_quality IS NULL
  OR (precipitation_quality = 'valid' AND precipitation_mm IS NOT NULL AND precipitation_mm BETWEEN 0 AND 500)
  OR precipitation_quality = 'suspect'
  OR (precipitation_quality = 'missing' AND precipitation_mm IS NULL)
);

CREATE FUNCTION effective_precipitation_quality(amount numeric, precipitation_state text, reading_state text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE
RETURN CASE
  WHEN precipitation_state IS NOT NULL THEN precipitation_state
  WHEN amount IS NULL THEN 'missing'
  WHEN amount NOT BETWEEN 0 AND 500 THEN 'suspect'
  ELSE reading_state
END;

CREATE VIEW hourly_precipitation AS
SELECT id, station_id, observed_at, precipitation_mm,
  effective_precipitation_quality(precipitation_mm, precipitation_quality, quality) AS precipitation_quality
FROM weather_readings
WHERE interval_minutes = 60 AND observed_at = date_trunc('hour', observed_at, 'UTC');
