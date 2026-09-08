import test from 'node:test';
import assert from 'node:assert/strict';
import { createMockSeason } from '../scripts/mock-data.mjs';
import { validateSeason } from '../scripts/data-core.mjs';

const sum = values => Math.round(values.reduce((s, n) => s + n, 0) * 100);

test('mock history is deterministic, explicit, and covers all regular and postseason weeks', () => {
  const season = createMockSeason(2025);
  assert.deepEqual(season, createMockSeason(2025));
  assert.equal(season.kind, 'mock');
  assert.equal(season.snapshots.filter(s => s.phase === 'regular').length, 18);
  assert.ok(season.snapshots.filter(s => s.phase === 'postseason').length >= 4);
  assert.ok(season.sources.every(source => /mock|simulat/i.test(source.description)));
  assert.doesNotThrow(() => validateSeason(season));
});

test('all mock snapshot probabilities conserve complete division, conference and Super Bowl totals', () => {
  const season = createMockSeason(2025);
  for (const snapshot of season.snapshots) {
    const data = snapshot.sources['espn-fpi'].projections;
    assert.equal(Object.keys(data).length, 32);
    assert.equal(sum(season.teams.map(t => data[t.id].superBowl)), 10000);
    for (const conference of ['AFC', 'NFC']) {
      const teams = season.teams.filter(t => t.conference === conference);
      assert.equal(sum(teams.map(t => data[t.id].conference)), 10000);
      for (const division of ['East', 'North', 'South', 'West']) {
        assert.equal(sum(teams.filter(t => t.division === division).map(t => data[t.id].division)), 10000);
      }
    }
    assert.ok(Object.values(data).every(p => p.superBowl <= p.conference && p.conference <= p.playoffs && p.division <= p.playoffs));
  }
});

test('mock playoff eliminations resolve to one champion and preserve regular season wins', () => {
  const season = createMockSeason(2025);
  const last = season.snapshots.at(-1).sources['espn-fpi'].projections;
  const week18 = season.snapshots.find(s => s.phase === 'regular' && s.week === 18).sources['espn-fpi'].projections;
  assert.equal(Object.values(last).filter(p => p.superBowl === 100).length, 1);
  assert.equal(Object.values(last).filter(p => p.conference === 100).length, 2);
  assert.equal(Object.values(last).filter(p => p.playoffs === 100).length, 14);
  assert.equal(Object.values(last).filter(p => p.division === 100).length, 8);
  for (const team of season.teams) assert.equal(last[team.id].wins, week18[team.id].wins);
});

test('mock regular leaders have top ten in six requested categories and useful extras', () => {
  const season = createMockSeason(2025);
  const final = season.snapshots.find(s => s.phase === 'regular' && s.week === 18);
  const names = final.leaders.categories.map(c => c.id);
  for (const required of ['passingYards', 'passingTouchdowns', 'rushingYards', 'rushingTouchdowns', 'receivingYards', 'receivingTouchdowns']) {
    assert.ok(names.includes(required));
  }
  assert.ok(names.length >= 8);
  for (const category of final.leaders.categories) {
    assert.equal(category.players.length, 10);
    assert.equal(new Set(category.players.map(p => p.id)).size, 10);
    assert.ok(category.players.every((p, i, list) => i === 0 || p.value <= list[i - 1].value));
  }
  assert.ok(new Set(final.leaders.categories.flatMap(c => c.players.map(p => p.name))).size >= 30);
});

test('mock cumulative player totals never decrease and never add postseason stats', () => {
  const season = createMockSeason(2025);
  const totals = new Map();
  let finalRegular;
  for (const snapshot of season.snapshots) {
    if (snapshot.phase === 'regular' && snapshot.week === 18) finalRegular = snapshot.leaders;
    for (const category of snapshot.leaders.categories) {
      for (const player of category.players) {
        const key = `${category.id}:${player.id}`;
        assert.ok(player.value >= (totals.get(key) ?? 0), key);
        totals.set(key, player.value);
      }
    }
    if (snapshot.phase === 'postseason') assert.deepEqual(snapshot.leaders.categories, finalRegular.categories);
  }
});
