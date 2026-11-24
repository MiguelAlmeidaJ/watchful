const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { readdir, readFile } = require('node:fs/promises');
const { createRequire } = require('node:module');
const { resolve } = require('node:path');
const { test } = require('node:test');
const { WeatherController } = require('../apps/api/dist/modules/weather/weather.controller');
const { GeoController } = require('../apps/api/dist/modules/geo/geo.controller');
const { GeoService } = require('../apps/api/dist/modules/geo/geo.service');
const { AlertProcessor } = require('../apps/worker/dist/alerts/processor');
const { Ingestion } = require('../apps/worker/dist/weather/ingestion');
const { Pool } = createRequire(resolve(__dirname, '../apps/api/package.json'))('pg');

test('API and risk use the same reliable precipitation, including after migration and retries', async context => {
  assert.ok(process.env.WATCHFUL_TEST_DATABASE_URL, 'Set WATCHFUL_TEST_DATABASE_URL to the isolated PostgreSQL test instance');
  const url = new URL(process.env.WATCHFUL_TEST_DATABASE_URL);
  const schema = 'weather_test_' + randomUUID().replaceAll('-', '');
  const admin = new Pool({ connectionString: url.href });
  context.after(() => admin.end());
  await admin.query('CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA public');
  await admin.query(`CREATE SCHEMA ${schema}`);
  url.searchParams.set('options', `-csearch_path=${schema},public`);
  const db = new Pool({ connectionString: url.href });
  context.after(async () => {
    await db.end();
    const cleanup = new Pool({ connectionString: process.env.WATCHFUL_TEST_DATABASE_URL });
    try { await cleanup.query(`DROP SCHEMA ${schema} CASCADE`); }
    finally { await cleanup.end(); }
  });

  const migrations = resolve(__dirname, '../packages/database/migrations');
  const names = (await readdir(migrations)).filter(name => name.endsWith('.sql')).sort();
  const upgrade = '009_precipitation_quality.sql';
  for (const name of names.filter(name => name < upgrade)) await db.query(await readFile(resolve(migrations, name), 'utf8'));

  const fixture = await seedRule(db);
  const observedAt = (await db.query("SELECT date_trunc('hour', now(), 'UTC') AS timestamp")).rows[0].timestamp;
  await db.query(`INSERT INTO weather_readings(station_id, observed_at, precipitation_mm, quality)
    VALUES ($1, $2, 25, 'suspect')`, [fixture.station, observedAt]);
  for (const name of names.filter(name => name >= upgrade)) await db.query(await readFile(resolve(migrations, name), 'utf8'));

  const cache = { get: (_key, load) => load() };
  const api = new WeatherController(db, cache);
  const request = { actor: { id: fixture.reviewer, platformAdmin: true } };
  const processor = new AlertProcessor(db);
  const ingestion = new Ingestion(db);
  const hourWindow = async () => (await api.rainfall(request, fixture.station)).windows.find(row => row.hours === 1);

  const suspect = await hourWindow();
  assert.equal(suspect.suspectHours, 1);
  assert.equal(suspect.coverage, 0);
  assert.equal(suspect.complete, false);
  assert.equal(suspect.totalMm, null);
  assert.equal(suspect.partialMm, null);
  assert.equal((await api.current(request, fixture.station)).reading.precipitation_quality, 'suspect');
  await processor.assess(fixture.rule);
  assert.deepEqual(await levels(db, fixture.rule), ['unknown']);

  const iso = observedAt.toISOString();
  const base = { CD_ESTACAO: 'TEST01', DT_MEDICAO: iso.slice(0, 10), HR_MEDICAO: iso.slice(11, 13) + '00' };
  let row = { ...base, CHUVA: '0' };
  context.mock.method(globalThis, 'fetch', async () => Response.json([row]));
  await ingestion.run('station', fixture.station);
  const readStored = async () => (await db.query(`SELECT precipitation_mm, precipitation_quality, quality, ingested_at
    FROM weather_readings WHERE station_id = $1 AND observed_at = $2`, [fixture.station, observedAt])).rows[0];
  const first = await readStored();
  assert.equal(first.precipitation_quality, 'valid');
  assert.equal(first.quality, 'suspect');
  assert.equal((await hourWindow()).totalMm, 0);
  assert.equal((await hourWindow()).complete, true);
  await processor.assess(fixture.rule);
  assert.deepEqual(await levels(db, fixture.rule), ['normal', 'unknown']);

  await ingestion.run('station', fixture.station);
  assert.deepEqual(await readStored(), first);

  row = { ...base, TEM_INS: 20 };
  await ingestion.run('station', fixture.station);
  assert.deepEqual(await readStored(), first);

  row = base;
  await assert.rejects(ingestion.run('station', fixture.station), /NO_OBSERVATIONS/);
  const status = (await db.query("SELECT consecutive_failures FROM stations WHERE id=$1", [fixture.station])).rows[0];
  assert.equal(status.consecutive_failures, 1);
  const runs = (await db.query(`SELECT status, records_count, error_code FROM ingestion_runs
    WHERE target_id=$1 ORDER BY started_at`, [fixture.station])).rows;
  assert.deepEqual(runs.map(run => [run.status, run.records_count, run.error_code]), [
    ['success', 1, null], ['success', 1, null], ['success', 1, null], ['failed', 0, 'NO_OBSERVATIONS']
  ]);

  const lock = await db.connect();
  try {
    const key = 'station:' + fixture.station;
    await lock.query('SELECT pg_advisory_lock(hashtextextended($1,0))', [key]);
    await ingestion.run('station', fixture.station);
    assert.equal((await db.query('SELECT count(*)::int AS count FROM ingestion_runs')).rows[0].count, runs.length);
    await lock.query('SELECT pg_advisory_unlock(hashtextextended($1,0))', [key]);
  } finally { lock.release(true); }

  await context.test('historical sectors require platform access and never enter the operational risk layer', async () => {
    const database = {
      query: (...args) => db.query(...args),
      transaction: async fn => {
        const client = await db.connect();
        try {
          await client.query('BEGIN');
          const result = await fn(client);
          await client.query('COMMIT');
          return result;
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally { client.release(); }
      }
    };
    const geo = new GeoController(new GeoService(database));
    const geometry = { type: 'Polygon', coordinates: [[[-43,-22],[-42,-22],[-42,-21],[-43,-21],[-43,-22]]] };
    const sector = { type: 'Feature', geometry, properties: {
      externalId: 'historical-fixture', name: 'Setor de teste', sourceHazard: 'Inundação',
      sourceClassification: 'Alto/ Muito Alto', surveyDate: '2012-01-24'
    } };
    const payload = {
      municipalityId: fixture.city, source: 'Test source', sourceUrl: 'https://example.invalid', sourceVersion: '2012-test',
      collection: { type: 'FeatureCollection', features: [sector] }
    };
    const outsider = { actor: { id: randomUUID(), platformAdmin: false } };
    assert.throws(() => geo.importHistoricalSectors(outsider, payload), error => error.getStatus() === 403);
    assert.deepEqual(await geo.importHistoricalSectors(request, payload), { received: 1, changed: 1 });
    assert.deepEqual(await geo.importHistoricalSectors(request, payload), { received: 1, changed: 0 });
    const query = { municipalityId: fixture.city, bbox: '-43.5,-22.5,-41.5,-20.5' };
    await assert.rejects(geo.layers(outsider, 'historical-risk-sectors', query), error => error.getStatus() === 404);
    const historical = await geo.layers(request, 'historical-risk-sectors', query);
    const operational = await geo.layers(request, 'risk-areas', query);
    assert.equal(historical.features.length, 1);
    assert.equal(historical.features[0].properties.sourceClassification, 'Alto/ Muito Alto');
    assert.equal(historical.features[0].properties.historical, true);
    assert.equal(operational.features.length, 1);
    assert.notEqual(operational.features[0].id, historical.features[0].id);
  });
});

async function levels(db, rule) {
  const result = await db.query('SELECT level FROM risk_assessments WHERE rule_id=$1 ORDER BY level', [rule]);
  return result.rows.map(row => row.level);
}

async function seedRule(db) {
  const polygon = 'MULTIPOLYGON(((-43 -22,-42 -22,-42 -21,-43 -21,-43 -22)))';
  const { rows: [city] } = await db.query(`INSERT INTO municipalities(ibge_code, name, state, boundary)
    VALUES ('0000001', 'Synthetic municipality', 'MG', ST_GeomFromText($1,4326)) RETURNING id`, [polygon]);
  const { rows: [organization] } = await db.query("INSERT INTO organizations(name) VALUES ('Test organization') RETURNING id");
  const { rows: [author, reviewer] } = await db.query(`INSERT INTO users(email,password_hash) VALUES
    ('author@example.invalid','fixture'),('reviewer@example.invalid','fixture') RETURNING id`);
  await db.query('INSERT INTO organization_municipalities VALUES ($1, $2)', [organization.id, city.id]);
  const { rows: [station] } = await db.query(`INSERT INTO stations(municipality_id, provider, external_id, name, location, last_success_at)
    VALUES ($1, 'inmet', 'TEST01', 'Synthetic station', ST_SetSRID(ST_MakePoint(-42.5,-21.5),4326), now()) RETURNING id`, [city.id]);
  const { rows: [area] } = await db.query(`INSERT INTO risk_areas(municipality_id, name, hazard, source, boundary, classification)
    VALUES ($1, 'Synthetic area', 'flood', 'test', ST_GeomFromText($2,4326), 'medium') RETURNING id`, [city.id, polygon]);
  const { rows: [rule] } = await db.query(`INSERT INTO risk_rules
    (organization_id, area_id, station_id, version, window_hours, attention_mm, warning_mm, severe_mm,
      rationale, active, approved_by, approved_at, created_by)
    VALUES ($1, $2, $3, 1, 1, 10, 20, 30, 'Synthetic rule', true, $4, now(), $5) RETURNING id`,
    [organization.id, area.id, station.id, reviewer.id, author.id]);
  return { city: city.id, station: station.id, rule: rule.id, reviewer: reviewer.id };
}
