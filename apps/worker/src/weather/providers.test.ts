import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fetchJson, numeric } from './http';
import { InmetProvider } from './inmet.provider';
import { OpenMeteoProvider } from './open-meteo.provider';

const target = { id: 'fixture', external_id: 'TEST01' };
const observed = new Date('2026-01-02T12:30:00Z');
const stationRow = { CD_ESTACAO: 'TEST01', DT_MEDICAO: '2026-01-02', HR_MEDICAO: '1200' };

test('INMET rejects a payload without usable values', async context => {
 context.mock.method(globalThis, 'fetch', async () => Response.json([stationRow]));
 await assert.rejects(new InmetProvider().collect(target, observed), /NO_OBSERVATIONS/);
});

test('INMET keeps valid zero when another metric is absent and flags invalid rain', async context => {
 context.mock.method(globalThis, 'fetch', async () => Response.json([
  { ...stationRow, CHUVA: '0' },
  { ...stationRow, HR_MEDICAO: '1100', CHUVA: '-10', TEM_INS: '22.5' },
  { ...stationRow, HR_MEDICAO: '1000', TEM_INS: 23 },
  { ...stationRow, HR_MEDICAO: '1300', CHUVA: '15' },
  { ...stationRow, DT_MEDICAO: '2025-12-30', CHUVA: '15' }
 ]));
 const rows = await new InmetProvider().collect(target, observed);
 assert.deepEqual(rows.map(row => [row.observedAt, row.precipitationMm, row.precipitationQuality, row.quality]), [
  ['2026-01-02T12:00:00.000Z', 0, 'valid', 'suspect'],
  ['2026-01-02T11:00:00.000Z', null, 'suspect', 'suspect'],
  ['2026-01-02T10:00:00.000Z', null, 'missing', 'suspect']
 ]);
});

test('INMET deduplicates equal measurements and rejects conflicting values at the same time', async context => {
 let rain = '2';
 context.mock.method(globalThis, 'fetch', async () => Response.json([
  { ...stationRow, CHUVA: 2 }, { ...stationRow, CHUVA: rain }
 ]));
 const provider = new InmetProvider();
 assert.equal((await provider.collect(target, observed)).length, 1);
 rain = '3';
 await assert.rejects(provider.collect(target, observed), /CONFLICTING_OBSERVATIONS/);
});

test('provider HTTP rejects malformed or oversized responses and normalizes decimal inputs', async context => {
 let body = 'not JSON';
 context.mock.method(globalThis, 'fetch', async () => new Response(body));
 const url = new URL('https://example.invalid');
 await assert.rejects(fetchJson(url), /INVALID_PROVIDER_JSON/);
 body = ' '.repeat(4_000_001);
 await assert.rejects(fetchJson(url), /PROVIDER_RESPONSE_TOO_LARGE/);
 assert.equal(numeric('0x10', 0, 100), null);
 assert.equal(numeric(' 2.5 ', 0, 100), 2.5);
});

const forecastUnits = {
 temperature_2m: '°C', relative_humidity_2m: '%', precipitation: 'mm', precipitation_probability: '%',
 wind_speed_10m: 'km/h', wind_gusts_10m: 'km/h'
};

test('Open-Meteo requires useful future data, UTC hourly timestamps and matching units', async context => {
 const hour = Math.floor(Date.now() / 3600000) * 3600000;
 const past = new Date(hour - 3600000).toISOString().slice(0, 16);
 const future = new Date(hour + 3600000).toISOString().slice(0, 16);
 const time = [past, future];
 const temperature = [25, null] as (number | null)[];
 const units = { ...forecastUnits };
 context.mock.method(globalThis, 'fetch', async () => Response.json({
  hourly_units: units,
  hourly: {
   time, temperature_2m: temperature, relative_humidity_2m: [null, null], precipitation: [null, null],
   precipitation_probability: [null, null], wind_speed_10m: [null, null], wind_gusts_10m: [null, null]
  }
 }));
 const provider = new OpenMeteoProvider();
 const point = { id: 'fixture', latitude: 0, longitude: 0 };
 await assert.rejects(provider.collect(point), /NO_FORECAST_DATA/);
 temperature[1] = 20;
 assert.equal((await provider.collect(point)).length, 2);
 time[0] = future;
 await assert.rejects(provider.collect(point), /INVALID_FORECAST_TIME/);
 units.precipitation = 'inch';
 await assert.rejects(provider.collect(point), /INVALID_FORECAST_UNITS/);
});
