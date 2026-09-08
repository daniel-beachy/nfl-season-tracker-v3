import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TEAMS } from '../scripts/teams.mjs';
import {
  chartRows, latestRankings, leaderRows, readableTeamColor,
  metricValue, seasonBanner, largestMover, observationSegments,
} from '../src/lib/presentation.mjs';

const teams = [
  { id: '1', name: 'Team One', conference: 'AFC', division: 'East', color: '001122', alternateColor: 'eeeeee' },
  { id: '2', name: 'Team Two', conference: 'NFC', division: 'East', color: 'abcdef', alternateColor: '123456' },
];
const snapshot = (id, projections, status = 'ok') => ({
  id, label: `Week ${id}`, capturedAt: `2026-09-${id.padStart(2, '0')}T14:15:00Z`,
  sources: { espn: { status, projections } },
  leaders: { status: 'ok', categories: [] },
});

test('chart gaps stay null and zero probabilities are retained', () => {
  const rows = chartRows([
    snapshot('1', { '1': { superBowl: 0 } }),
    snapshot('2', { '2': { superBowl: 42 } }),
    snapshot('3', {}, 'unavailable'),
  ], 'espn', 'superBowl', teams);
  assert.equal(rows[0]['1'], 0);
  assert.equal(rows[0]['2'], null);
  assert.equal(rows[1]['1'], null);
  assert.equal(rows[2]['2'], null);
});

test('rankings do not fall back to earlier snapshots when latest source is unavailable', () => {
  assert.deepEqual(latestRankings([snapshot('1', { '1': { superBowl: 20 } }), snapshot('2', {}, 'unavailable')], 'espn', 'superBowl', teams), []);
});

test('rankings use numeric descending order and reject non-finite values', () => {
  const ranked = latestRankings([snapshot('1', { '1': { wins: 9 }, '2': { wins: 12 } })], 'espn', 'wins', teams);
  assert.deepEqual(ranked.map(item => item.team.id), ['2', '1']);
  assert.equal(metricValue({ wins: Infinity }, 'wins'), null);
  assert.equal(metricValue({ wins: 0 }, 'wins'), 0);
});

test('leader chart aligns athletes by stable ID and leaves unavailable history blank', () => {
  const first = snapshot('1', {});
  first.leaders.categories = [{ id: 'passingYards', players: [{ id: 'player1', name: 'A', value: 100 }] }];
  const rows = leaderRows([first, snapshot('2', {})], 'passingYards', [{ id: 'player1' }, { id: 'player2' }]);
  assert.equal(rows[0].player1, 100);
  assert.equal(rows[0].player2, null);
  assert.equal(rows[1].player1, null);
});

test('team colors swap alternate when primary is unreadable on theme surface', () => {
  assert.equal(readableTeamColor(teams[0], 'dark'), '#eeeeee');
  assert.equal(readableTeamColor(teams[1], 'light'), '#123456');
});

test('all real team colors remain readable even when both brand colors are dark', () => {
  for (const theme of ['light', 'dark']) for (const team of TEAMS) {
    const color = readableTeamColor(team, theme);
    const channels = [1, 3, 5].map(index => parseInt(color.slice(index, index + 2), 16) / 255)
      .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    const foreground = channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
    const background = theme === 'dark' ? .0222 : 1;
    const contrast = (Math.max(foreground, background) + .05) / (Math.min(foreground, background) + .05);
    assert.ok(contrast >= 3, `${team.name} ${theme}: ${color} has contrast ${contrast}`);
  }
});

test('season messaging clearly labels mocks and unstarted seasons', () => {
  assert.match(seasonBanner({ kind: 'mock', startsAt: '2025-09-04' }, new Date('2026-09-08')), /mocked — not fully accurate/);
  assert.match(seasonBanner({ kind: 'live', startsAt: '2026-09-10' }, new Date('2026-09-08')), /preseason — season not started/);
  assert.equal(seasonBanner({ kind: 'live', startsAt: '2026-09-10' }, new Date('2026-09-11')), null);
});

test('largest mover requires two real observations and compares percentage points', () => {
  assert.equal(largestMover([snapshot('1', { '1': { superBowl: 10 } })], 'espn', teams), null);
  const moved = largestMover([
    snapshot('1', { '1': { superBowl: 10 }, '2': { superBowl: 20 } }),
    snapshot('2', { '1': { superBowl: 13 }, '2': { superBowl: 19 } }),
  ], 'espn', teams);
  assert.equal(moved.team.id, '1');
  assert.equal(moved.delta, 3);
});

test('sparklines preserve missing captures as separate segments and keep isolated points', () => {
  assert.deepEqual(observationSegments([10, null, 20]), [[{ index: 0, value: 10 }], [{ index: 2, value: 20 }]]);
  assert.deepEqual(observationSegments([null, 0, 20, null]), [[{ index: 1, value: 0 }, { index: 2, value: 20 }]]);
});
