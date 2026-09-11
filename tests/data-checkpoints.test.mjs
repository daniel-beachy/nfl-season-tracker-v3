import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { capture } from '../scripts/capture.mjs';
import * as collector from '../scripts/capture.mjs';
import { shouldCapture } from '../scripts/data-core.mjs';
import * as checkpoints from '../scripts/checkpoints.mjs';

const period = (week, startDate, endDate) => ({ value: String(week), startDate, endDate });
const calendar = [
  { value: '1', startDate: '2026-08-06T07:00Z' },
  { value: '2', startDate: '2026-09-06T07:00Z', endDate: '2027-01-13T07:59Z', entries: [
    period(1, '2026-09-06T07:00Z', '2026-09-16T06:59Z'),
    period(2, '2026-09-16T07:00Z', '2026-09-23T06:59Z'),
    period(11, '2026-11-18T08:00Z', '2026-11-25T07:59Z'),
    period(12, '2026-11-25T08:00Z', '2026-12-02T07:59Z'),
    period(18, '2027-01-06T08:00Z', '2027-01-13T07:59Z'),
  ] },
  { value: '3', startDate: '2027-01-13T08:00Z', endDate: '2027-02-16T07:59Z', entries: [
    period(1, '2027-01-13T08:00Z', '2027-01-20T07:59Z'),
    period(3, '2027-01-27T08:00Z', '2027-02-03T07:59Z'),
    { ...period(4, '2027-02-03T08:00Z', '2027-02-10T07:59Z'), label: 'Pro Bowl' },
    period(5, '2027-02-10T08:00Z', '2027-02-16T07:59Z'),
  ] },
];
const dates = {
  '2-1': ['2026-09-10T00:20Z', '2026-09-15T00:15Z'],
  '2-2': ['2026-09-18T00:15Z', '2026-09-22T00:15Z'],
  '2-11': ['2026-11-20T01:15Z', '2026-11-24T01:15Z'],
  '2-12': ['2026-11-26T01:00Z', '2026-12-01T01:15Z'],
  '2-18': ['2027-01-09T18:00Z', '2027-01-11T01:15Z'],
  '3-1': ['2027-01-16T18:00Z', '2027-01-19T01:15Z'],
  '3-3': ['2027-01-31T20:00Z', '2027-02-01T00:00Z'],
  '3-5': ['2027-02-14T23:30Z'],
};

export function scheduleFixture(now, customize = data => data) {
  return url => {
    const params = new URL(url).searchParams;
    const type = Number(params.get('seasontype'));
    const week = Number(params.get('week'));
    const events = (dates[`${type}-${week}`] ?? []).map((date, index) => {
      const completed = +now > Date.parse(date) + 4 * 3600000;
      return {
        id: `${type}-${week}-${index}`, date, week: { number: week }, season: { year: 2026, type },
        status: { type: { completed, state: completed ? 'post' : +now >= Date.parse(date) ? 'in' : 'pre' } },
      };
    });
    return customize({ leagues: [{ season: { year: 2026 }, calendar }], events }, type, week);
  };
}

const run = async (date, options = {}, customize) => {
  const root = await mkdtemp(join(process.cwd(), 'scripts', '.checkpoint-test-'));
  const now = new Date(date);
  const urls = [];
  try {
    const schedule = scheduleFixture(now, customize);
    const result = await capture({
      root, now, season: 2026, ...options,
      get: async url => {
        urls.push(url);
        if (url.includes('/scoreboard')) return schedule(url);
        throw new Error('fixture provider unavailable');
      },
    });
    return { ...result, urls };
  } finally { await rm(root, { recursive: true, force: true }); }
};

test('the pre-kickoff Wednesday is captured even when it is not the first Wednesday of September', async () => {
  const result = await run('2026-09-09T16:00Z', { scheduled: true });
  assert.equal(result.skipped, false);
  assert.equal(result.data.snapshots[0].label, 'Preseason');
  assert.equal(result.data.snapshots[0].week, null);
});

test('Wednesday after the full opening week is Week 1, not the upcoming Week 2', async () => {
  const result = await run('2026-09-16T16:00Z', { scheduled: true });
  const snapshot = result.data.snapshots[0];
  assert.equal(snapshot.week, 1);
  assert.equal(snapshot.label, 'Week 1');
  assert.equal(snapshot.phase, 'regular');
});

test('manual opening-game updates cannot masquerade as preseason or a completed Week 1', async () => {
  const result = await run('2026-09-11T01:15Z');
  assert.equal(result.skipped, true);
  assert.equal(result.reason, 'in-progress');
  assert.ok(result.urls.every(url => url.includes('/scoreboard')));
});

test('a manual Tuesday capture after all games finish also describes the completed week', async () => {
  const result = await run('2026-09-15T16:00Z');
  assert.equal(result.data.snapshots[0].label, 'Week 1');
});

test('Thanksgiving-eve capture labels the preceding completed week before Wednesday kickoff', async () => {
  const result = await run('2026-11-25T16:00Z', { scheduled: true });
  assert.equal(result.data.snapshots[0].label, 'Week 11');
});

test('a delayed Thanksgiving-eve run after kickoff is skipped instead of mixing weeks', async () => {
  const result = await run('2026-11-26T01:30Z');
  assert.equal(result.reason, 'in-progress');
  assert.equal(result.skipped, true);
});

test('postponed or unfinished previous-week games prevent a completed-week capture', async () => {
  const result = await run('2026-09-16T16:00Z', {}, (data, type, week) => {
    if (type === 2 && week === 1) data.events.at(-1).status.type = { state: 'pre', completed: false };
    return data;
  });
  assert.equal(result.reason, 'in-progress');
});

test('missing or wrong-period schedule rows fail explicitly instead of inventing a completed week', async () => {
  await assert.rejects(run('2026-09-16T16:00Z', {}, (data, type, week) => {
    if (week === 2) data.events[0].season.year = 2025;
    return data;
  }), /schedule|season|period/i);
  await assert.rejects(run('2026-09-16T16:00Z', {}, (data, type, week) => {
    if (week === 2) data.events = [];
    return data;
  }), /schedule|events/i);
});

test('the first playoff capture is the completed regular-season Week 18', async () => {
  const result = await run('2027-01-13T16:00Z', { scheduled: true });
  assert.equal(result.data.snapshots[0].phase, 'regular');
  assert.equal(result.data.snapshots[0].week, 18);
});

test('the Pro Bowl does not become an NFL championship checkpoint', async () => {
  const result = await run('2027-02-10T16:00Z', { scheduled: true });
  assert.equal(result.data.snapshots[0].label, 'Postseason week 3');
  assert.ok(result.urls.every(url => !url.includes('seasontype=3&week=4')));
});

test('the first Wednesday after the Super Bowl is captured despite the offseason boundary', async () => {
  const result = await run('2027-02-17T16:00Z', { scheduled: true });
  assert.equal(result.skipped, false);
  assert.equal(result.data.snapshots[0].label, 'Postseason week 5');
});

test('Wednesday cadence includes the final pre-kickoff baseline without enabling all preseason weeks', () => {
  assert.equal(shouldCapture(new Date('2026-09-09T16:00Z'), 'preseason', '2026-09-10T00:20Z'), true);
  assert.equal(shouldCapture(new Date('2026-08-12T16:00Z'), 'preseason', '2026-09-10T00:20Z'), false);
});

test('workflow starts before Wednesday night games at the documented UTC time', async () => {
  const workflow = await readFile(new URL('../.github/workflows/site.yml', import.meta.url), 'utf8');
  assert.match(workflow, /cron: '0 16 \* \* 3'/);
});

test('a collection crossing the next kickoff is rejected even if it began before the game', () => {
  assert.throws(() => checkpoints.assertBeforeNextKickoff(Date.parse('2026-11-26T01:00Z'), Date.parse('2026-11-26T01:00Z')), /kickoff/);
  assert.doesNotThrow(() => checkpoints.assertBeforeNextKickoff(Date.parse('2026-11-25T16:00Z'), Date.parse('2026-11-26T01:00Z')));
});

test('January through August snapshots run on the first, regardless of weekday or unpublished schedule', async () => {
  const months = [
    ['2027-01-01', 'January'], ['2027-02-01', 'February'],
    ['2027-03-01', 'March'], ['2027-04-01', 'April'], ['2027-05-01', 'May'],
    ['2027-06-01', 'June'], ['2027-07-01', 'July'], ['2027-08-01', 'August'],
  ];
  for (const [date, label] of months) {
    const root = await mkdtemp(join(process.cwd(), 'scripts', '.checkpoint-test-'));
    try {
      const result = await capture({
        root, now: new Date(`${date}T16:00Z`), season: 2027, scheduled: true,
        get: async () => { throw new Error('next-season schedule not published'); },
      });
      assert.equal(result.skipped, false, label);
      assert.equal(result.data.snapshots[0].label, label);
      assert.equal(result.data.snapshots[0].week, null);
      assert.equal(result.data.snapshots[0].leaders.status, 'not-started');
    } finally { await rm(root, { recursive: true, force: true }); }
  }
});

test('September gets a monthly preseason point plus a final pre-kickoff baseline when dates differ', async () => {
  const result = await run('2026-09-01T16:00Z', { scheduled: true });
  assert.equal(result.data.snapshots[0].label, 'September');
  assert.equal((await run('2026-09-09T16:00Z', { scheduled: true })).data.snapshots[0].label, 'Preseason');
});

test('monthly cron is January through September on day one, not the first Wednesday', async () => {
  assert.equal(shouldCapture(new Date('2027-04-01T16:00Z'), 'offseason', '2027-09-10T00:20Z'), true);
  assert.equal(shouldCapture(new Date('2027-04-07T16:00Z'), 'offseason', '2027-09-10T00:20Z'), false);
  const workflow = await readFile(new URL('../.github/workflows/site.yml', import.meta.url), 'utf8');
  assert.match(workflow, /cron: '0 16 1 1-9 \*'/);
});

test('the September 11 partial capture is removed and the September 8 baseline is named explicitly', async () => {
  const season = JSON.parse(await readFile(new URL('../public/data/seasons/2026.json', import.meta.url), 'utf8'));
  assert.equal(season.snapshots.some(snapshot => snapshot.id === '2026-2026-09-11'), false);
  assert.equal(season.snapshots.find(snapshot => snapshot.id === '2026-2026-09-08').label, 'September Preseason');
});

test('automatic capture initializes the calendar year in January while preserving the prior NFL season', async () => {
  assert.equal(typeof collector.captureAll, 'function');
  const root = await mkdtemp(join(process.cwd(), 'scripts', '.checkpoint-test-'));
  try {
    const results = await collector.captureAll({
      root, now: new Date('2027-01-01T16:00Z'), scheduled: true,
      get: async () => { throw new Error('schedule not yet available'); },
    });
    assert.deepEqual(results.map(result => result.season), [2027, 2026]);
    assert.equal(results[0].data.season, 2027);
    assert.equal(results[0].data.snapshots[0].label, 'January');
    assert.equal(results[1].reason, 'cadence');
    const manifest = JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8'));
    assert.ok(manifest.seasons.some(season => season.year === manifest.currentSeason));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('January weekly runs preserve playoffs and advance capture time between season requests', async t => {
  const root = await mkdtemp(join(process.cwd(), 'scripts', '.checkpoint-test-'));
  const now = new Date('2027-01-20T16:00Z');
  let elapsed = 0;
  t.mock.method(performance, 'now', () => elapsed += 1000);
  const schedule = scheduleFixture(now);
  try {
    const results = await collector.captureAll({
      root, now, scheduled: true,
      get: async url => {
        if (url.includes('/scoreboard')) return schedule(url);
        throw new Error('fixture provider unavailable');
      },
    });
    assert.equal(results[0].season, 2027);
    assert.equal(results[0].reason, 'cadence');
    assert.equal(results[1].season, 2026);
    assert.equal(results[1].data.snapshots[0].label, 'Postseason week 1');
    assert.ok(Date.parse(results[1].data.snapshots[0].capturedAt) > +now);
    assert.deepEqual(collector.captureYears(new Date('2031-01-01T16:00Z')), [2031, 2030]);
    assert.deepEqual(collector.captureYears(new Date('2031-03-01T16:00Z')), [2031]);
  } finally { await rm(root, { recursive: true, force: true }); }
});
