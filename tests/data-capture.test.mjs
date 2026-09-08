import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { capture } from '../scripts/capture.mjs';
import { createMockSeason } from '../scripts/mock-data.mjs';
import { validateSeason, writeSeason } from '../scripts/data-core.mjs';

const withRoot = async fn => {
  const root = await mkdtemp(join(process.cwd(), 'scripts', '.capture-test-'));
  try { await fn(root); } finally { await rm(root, { recursive: true, force: true }); }
};

test('complete network outage still persists valid, explicitly unavailable live source snapshots', async () => {
  await withRoot(async root => {
    const result = await capture({
      root, season: 2026, now: new Date('2026-09-08T17:00Z'),
      get: async () => { throw new Error('offline fixture'); },
    });
    assert.equal(result.data.kind, 'live');
    assert.equal(result.data.snapshots.length, 1);
    for (const source of Object.values(result.data.snapshots[0].sources)) {
      assert.equal(source.status, 'unavailable');
      assert.deepEqual(source.projections, {});
      assert.match(source.note, /offline fixture/);
      assert.match(source.note, /fallback/i);
    }
    assert.equal(result.data.snapshots[0].leaders.status, 'not-started');
    assert.doesNotThrow(() => validateSeason(result.data));
    const manifest = JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8'));
    assert.equal(manifest.seasons[0].kind, 'live');
  });
});

test('scheduled offseason capture is gated before creating files or fetching prediction providers', async () => {
  await withRoot(async root => {
    const urls = [];
    const result = await capture({
      root, scheduled: true, season: 2026, now: new Date('2026-07-08T14:15Z'),
      get: async url => { urls.push(url); throw new Error('offline schedule fixture'); },
    });
    assert.equal(result.reason, 'cadence');
    assert.equal(urls.length, 1);
    assert.match(urls[0], /scoreboard/);
    await assert.rejects(readFile(join(root, 'manifest.json')), { code: 'ENOENT' });
  });
});

test('same-date captures do not retry and overwrite even an unavailable stored snapshot', async () => {
  await withRoot(async root => {
    const first = await capture({
      root, season: 2026, now: new Date('2026-09-08T17:00Z'),
      get: async () => { throw new Error('first outage'); },
    });
    const bytes = await readFile(join(root, 'seasons', '2026.json'), 'utf8');
    const retry = await capture({
      root, season: 2026, now: new Date('2026-09-08T18:00Z'),
      get: async () => { throw new Error('second outage'); },
    });
    assert.equal(retry.reason, 'existing');
    assert.deepEqual(retry.data.snapshots, first.data.snapshots);
    assert.equal(await readFile(join(root, 'seasons', '2026.json'), 'utf8'), bytes);
  });
});

test('persistence retains successful historical values against changed retry input and rejects corruption', async () => {
  await withRoot(async root => {
    const season = createMockSeason(2025);
    const now = new Date('2026-09-08T16:00Z');
    await writeSeason(root, season, 2026, now);
    const before = await readFile(join(root, 'seasons', '2025.json'), 'utf8');
    const changed = structuredClone(season);
    changed.snapshots[0].sources['espn-fpi'].projections['2'].wins = 0;
    await writeSeason(root, changed, 2026, now);
    assert.equal(await readFile(join(root, 'seasons', '2025.json'), 'utf8'), before);
    changed.snapshots[0].sources['espn-fpi'].projections['2'].wins = NaN;
    await assert.rejects(writeSeason(root, changed, 2026, now), /wins/);
    assert.equal(await readFile(join(root, 'seasons', '2025.json'), 'utf8'), before);
  });
});

test('manual season argument cannot mislabel current upstream data as a historical capture', async () => {
  await assert.rejects(capture({
    season: 2025, now: new Date('2026-09-08T16:00Z'),
    get: async () => { throw new Error('must not fetch'); },
  }), /current NFL season/);
});
