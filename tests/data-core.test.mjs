import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import {
  normalizePercentages, normalizeDivisions, seasonForDate, shouldCapture,
  deriveSeasonMetadata, appendSnapshot, validateSeason, writeSeason, parseArgs,
} from '../scripts/data-core.mjs';
import { TEAMS } from '../scripts/teams.mjs';
import { createMockSeason } from '../scripts/mock-data.mjs';

test('all 32 teams have canonical unique IDs and four-team divisions', () => {
  assert.equal(TEAMS.length, 32);
  assert.equal(new Set(TEAMS.map(t => t.id)).size, 32);
  for (const conference of ['AFC', 'NFC']) {
    for (const division of ['East', 'North', 'South', 'West']) {
      assert.equal(TEAMS.filter(t => t.conference === conference && t.division === division).length, 4);
    }
  }
});

test('normalization uses exact total, preserves zeros and rejects missing or all-zero groups', () => {
  assert.deepEqual(normalizePercentages([1, 1, 1]), [33.34, 33.33, 33.33]);
  assert.equal(normalizePercentages([27.3, 27.8, 33.1, 11.9]).reduce((a, b) => a + b, 0), 100);
  assert.deepEqual(normalizePercentages([0, 1, 0, 3]), [0, 25, 0, 75]);
  for (const invalid of [[0, 0, 0, 0], [1, null], [1, undefined], [1, NaN], [-1, 2]]) {
    assert.equal(normalizePercentages(invalid), null);
  }
});

test('division normalization does not invent absent teams or substitute equal probability', () => {
  const teams = TEAMS.filter(t => t.conference === 'AFC' && t.division === 'East');
  const data = Object.fromEntries(teams.map((t, i) => [t.id, { division: i + 1, wins: 8 }]));
  normalizeDivisions(data, TEAMS);
  assert.equal(teams.reduce((sum, t) => sum + data[t.id].division, 0), 100);
  delete data[teams[0].id].division;
  const before = structuredClone(data);
  normalizeDivisions(data, TEAMS);
  assert.deepEqual(data, before);
  for (const team of teams) data[team.id].division = 0;
  normalizeDivisions(data, TEAMS);
  assert.ok(teams.every(t => data[t.id].division === null));
});

test('season rollover uses previous year in January and February', () => {
  assert.equal(seasonForDate(new Date('2027-01-05T12:00Z')), 2026);
  assert.equal(seasonForDate(new Date('2027-02-28T23:59Z')), 2026);
  assert.equal(seasonForDate(new Date('2027-03-01T00:00Z')), 2027);
});

test('cadence is Wednesdays during play and March-September day one outside play, in UTC', () => {
  assert.equal(shouldCapture(new Date('2026-09-09T14:15Z'), 'regular'), true);
  assert.equal(shouldCapture(new Date('2026-09-09T14:15Z'), 'preseason'), false);
  assert.equal(shouldCapture(new Date('2026-07-01T14:15Z'), 'offseason'), true);
  assert.equal(shouldCapture(new Date('2027-01-20T14:15Z'), 'postseason'), true);
  assert.equal(shouldCapture(new Date('2026-09-10T14:15Z'), 'regular'), false);
});

test('actual ESPN kickoff overrides broad calendar period and handles Wednesday local kickoff', () => {
  const calendar = { leagues: [{ season: { year: 2026 }, calendar: [
    { value: '1', startDate: '2026-08-06T07:00Z', endDate: '2026-09-06T06:59Z' },
    { value: '2', startDate: '2026-09-06T07:00Z', endDate: '2027-01-13T07:59Z',
      entries: [{ value: '1', startDate: '2026-09-06T07:00Z', endDate: '2026-09-16T06:59Z' }] },
    { value: '3', startDate: '2027-01-13T08:00Z', endDate: '2027-02-16T07:59Z' },
  ] }], events: [{ date: '2026-09-10T00:20Z', season: { year: 2026, type: 2 } }] };
  const before = deriveSeasonMetadata(2026, new Date('2026-09-08T16:00Z'), calendar);
  assert.equal(before.phase, 'preseason');
  assert.equal(before.startsAt, '2026-09-10T00:20:00.000Z');
  assert.equal(before.week, null);
  assert.equal(deriveSeasonMetadata(2026, new Date('2026-09-10T01:00Z'), calendar).phase, 'regular');
  assert.equal(deriveSeasonMetadata(2026, new Date('2027-01-25T00:00Z'), calendar).phase, 'postseason');
  assert.equal(deriveSeasonMetadata(2026, new Date('2027-02-20T00:00Z'), calendar).phase, 'offseason');
});

test('missing or wrong-season calendar uses explicitly approximate Labor Day fallback', () => {
  const metadata = deriveSeasonMetadata(2026, new Date('2026-09-08T12:00Z'), {
    leagues: [{ season: { year: 2025 }, calendar: [] }],
    events: [{ date: '2025-09-05T00:20Z', season: { year: 2025, type: 2 } }],
  });
  assert.equal(metadata.startsAt.slice(0, 10), '2026-09-10');
  assert.match(metadata.note, /fallback|approximate/i);
  assert.equal(metadata.phase, 'preseason');
});

test('snapshot append is keyed by season and UTC day, immutable and chronologically sorted', () => {
  const seed = createMockSeason(2025);
  const original = structuredClone(seed.snapshots[0]);
  const base = { ...seed, snapshots: [original] };
  const retry = { ...original, id: 'changed', capturedAt: original.capturedAt.slice(0, 10) + 'T23:59:00.000Z',
    sources: { 'espn-fpi': { status: 'unavailable', note: 'retry failed', projections: {} } } };
  assert.equal(appendSnapshot(base, retry).appended, false);
  assert.deepEqual(base.snapshots, [original]);
  assert.equal(appendSnapshot(base, seed.snapshots[1]).appended, true);
  assert.equal(base.snapshots.length, 2);
  assert.throws(() => appendSnapshot(base, { ...original, season: 2026 }), /season/i);
});

test('schema validation rejects out-of-range probabilities, invalid IDs and missing leaders', () => {
  const original = createMockSeason(2025);
  assert.doesNotThrow(() => validateSeason(original));
  const bad = structuredClone(original);
  bad.snapshots[1].sources['espn-fpi'].projections[TEAMS[0].id].division = 101;
  assert.throws(() => validateSeason(bad), /probability|division/i);
  const noLeaders = structuredClone(original);
  delete noLeaders.snapshots[0].leaders;
  assert.throws(() => validateSeason(noLeaders), /leaders/i);
  const duplicate = structuredClone(original);
  duplicate.snapshots.push(structuredClone(duplicate.snapshots[0]));
  assert.throws(() => validateSeason(duplicate), /duplicate/i);
});

test('atomic persistence produces valid season JSON and source-neutral manifest', async () => {
  const root = await mkdtemp(join(process.cwd(), 'scripts', '.data-test-'));
  try {
    const season = createMockSeason(2025);
    await writeSeason(root, season, 2026, new Date('2026-09-08T16:00Z'));
    const saved = JSON.parse(await readFile(join(root, 'seasons', '2025.json'), 'utf8'));
    const manifest = JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8'));
    assert.deepEqual(saved, season);
    assert.equal(manifest.seasons[0].file, 'seasons/2025.json');
    assert.equal(manifest.seasons[0].label, '2025 — mocked — not fully accurate');
    assert.equal(manifest.currentSeason, 2026);
    await writeSeason(root, season, 2026, new Date('2026-09-08T16:00Z'));
    assert.deepEqual(JSON.parse(await readFile(join(root, 'seasons', '2025.json'), 'utf8')), season);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('CLI supports both season forms, rejects unknown flags and does not permit historical fake capture dates', () => {
  assert.equal(parseArgs(['--season=2026', '--scheduled']).season, 2026);
  assert.equal(parseArgs(['--season', '2026']).season, 2026);
  assert.throws(() => parseArgs(['--season=wat']), /season/i);
  assert.throws(() => parseArgs(['--date', '2025-09-01']), /date|unknown/i);
});
