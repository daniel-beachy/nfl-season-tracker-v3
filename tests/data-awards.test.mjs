import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { adaptAwards, fetchAwards } from '../scripts/awards.mjs';
import { TEAMS } from '../scripts/teams.mjs';
import { createMockSeason } from '../scripts/mock-data.mjs';
import { validateSeason } from '../scripts/data-core.mjs';
import { awardRows, formatAmericanOdds, isAwardSource, isAwards } from '../src/lib/awards.mjs';

const ref = (kind, id, year = 2026) =>
  `http://sports.core.api.espn.com/v2/sports/football/leagues/nfl/seasons/${year}/${kind}/${id}?lang=en&region=us`;
const names = ['Regular Season MVP', 'Offensive Player of the Year', 'Defensive Player of the Year',
  'Offensive Rookie of the Year', 'Defensive Rookie of the Year', 'Coach of the Year',
  'Comeback Player of the Year', 'Protector of the Year'];
const market = (name, id = 1, books = [
  { athlete: { $ref: ref('athletes', 1) }, value: '+300' },
  { athlete: { $ref: ref('athletes', 2) }, value: '-150' },
]) => ({ $ref: ref('futures', id), name, futures: [{ provider: { name: 'DraftKings' }, books }] });
const athlete = async url => {
  const id = url.match(/athletes\/(\d+)/)?.[1];
  assert.ok(id);
  return { id, $ref: ref('athletes', id), displayName: `Candidate ${id}`, team: { $ref: ref('teams', 2) }, active: true };
};

test('all eight award markets retain American odds and raw implied probability without normalization', async () => {
  const result = await adaptAwards({ items: names.map((name, index) => market(name, index + 1)) }, TEAMS, 2026, athlete);
  assert.equal(result.status, 'ok');
  assert.deepEqual(result.categories.map(c => c.id), ['mvp', 'opoy', 'dpoy', 'oroy', 'droy', 'coy', 'cpoy', 'protector']);
  const mvp = result.categories[0];
  assert.equal(mvp.probabilityBasis, 'raw-implied');
  assert.deepEqual(mvp.candidates.map(c => [c.id, c.americanOdds, c.impliedProbability]), [
    ['2', -150, 60], ['1', 300, 25],
  ]);
  assert.equal(mvp.candidates[0].teamId, '2');
  assert.equal(mvp.listedCount, 2);
  assert.equal(result.observedAt, undefined);
  assert.match(result.note, /not.*preseason|not backdated/i);
  assert.match(result.note, /margin/i);
  assert.ok(isAwardSource(result));
});

test('coach odds do not inherit a retired player team affiliation', async () => {
  const result = await adaptAwards({ items: [market('Coach of the Year')] }, TEAMS, 2026, athlete);
  assert.equal(result.categories[0].candidateType, 'coach');
  assert.ok(result.categories[0].candidates.every(c => c.teamId === null));
  assert.match(result.categories[0].note, /former|playing/i);
});

test('unresolved, duplicate, invalid, and wrong-season candidates never become fake entries', async () => {
  const books = [
    { athlete: { $ref: ref('athletes', 1) }, value: 'EVEN' },
    { athlete: { $ref: ref('athletes', 1) }, value: '+200' },
    { athlete: { $ref: ref('athletes', 2) }, value: 'SUSPENDED' },
    { athlete: { $ref: ref('athletes', 3, 2025) }, value: '+400' },
    { athlete: { $ref: ref('athletes', 4) }, value: '+500' },
    { athlete: { $ref: ref('athletes', 5) }, value: '+600' },
  ];
  const result = await adaptAwards({ items: [market('Regular Season MVP', 1, books)] }, TEAMS, 2026, async url => {
    if (url.includes('/4?')) throw new Error('HTTP 404');
    if (url.includes('/5?')) return { id: '5', displayName: 'Wrong season', $ref: ref('athletes', 5, 2025) };
    return athlete(url);
  });
  assert.equal(result.status, 'ok');
  assert.equal(result.categories[0].candidates.length, 1);
  assert.equal(result.categories[0].candidates[0].americanOdds, 100);
  assert.match(result.categories[0].note, /partial|omitted/i);
  assert.equal(result.categories[0].listedCount, 6);
});

test('awards reject old markets and isolate provider outages', async () => {
  const old = market('Regular Season MVP');
  old.$ref = ref('futures', 1, 2025);
  assert.equal((await adaptAwards({ items: [old] }, TEAMS, 2026, athlete)).status, 'unavailable');
  const result = await fetchAwards(2026, TEAMS, async () => { throw new Error('HTTP 503'); });
  assert.equal(result.status, 'unavailable');
  assert.deepEqual(result.categories, []);
  assert.match(result.note, /503/);
});

test('award collection caps at the strongest fifty per market and discloses truncated fields', async () => {
  const books = Array.from({ length: 65 }, (_, i) => ({ athlete: { $ref: ref('athletes', i + 1) }, value: `+${100 + i * 100}` })).reverse();
  const result = await adaptAwards({ items: [market('Regular Season MVP', 1, books)] }, TEAMS, 2026, athlete);
  const category = result.categories[0];
  assert.equal(category.candidates.length, 50);
  assert.equal(category.candidates[0].id, '1');
  assert.equal(category.candidates.at(-1).id, '50');
  assert.match(category.note, /50.*65/);
  assert.equal(category.listedCount, 65);
});

test('optional awards preserve old snapshots and reject corrupt probabilities and references', async () => {
  const source = await adaptAwards({ items: [market('Regular Season MVP')] }, TEAMS, 2026, athlete);
  const season = createMockSeason(2025);
  assert.doesNotThrow(() => validateSeason(season));
  season.sources.push({ id: 'draftkings', name: 'DraftKings', kind: 'market', description: 'Fixture', url: 'https://example.com', metrics: [], awards: true });
  season.snapshots[1].awards = { draftkings: source };
  assert.doesNotThrow(() => validateSeason(season));
  source.categories[0].candidates[0].impliedProbability = 101;
  assert.equal(isAwardSource(source), false);
  assert.throws(() => validateSeason(season), /award/i);
  source.categories[0].candidates[0].impliedProbability = 60;
  source.categories[0].candidates[0].teamId = 'not-a-team';
  assert.throws(() => validateSeason(season), /award/i);
});

test('award time series joins stable candidate IDs without copying odds into historical gaps', async () => {
  const source = await adaptAwards({ items: [market('Regular Season MVP')] }, TEAMS, 2026, athlete);
  const snapshots = [
    { label: 'Preseason', capturedAt: '2026-09-08T12:00Z' },
    { label: 'Week 1', capturedAt: '2026-09-11T01:00Z', awards: { draftkings: source } },
    { label: 'Week 2', capturedAt: '2026-09-16T12:00Z', awards: { draftkings: { status: 'unavailable', categories: [] } } },
  ];
  const rows = awardRows(snapshots, 'draftkings', 'mvp', source.categories[0].candidates);
  assert.equal(rows[0]['1'], null);
  assert.equal(rows[1]['1'], 25);
  assert.equal(rows[2]['1'], null);
  assert.equal(formatAmericanOdds(300), '+300');
  assert.equal(formatAmericanOdds(-150), '-150');
});

test('published preseason provenance rejects unsafe links, invalid dates and post-kickoff revisions', async () => {
  const source = await adaptAwards({ items: [market('Regular Season MVP')] }, TEAMS, 2026, athlete);
  source.provenance = {
    kind: 'published-preseason', label: 'September 8 preseason publications', addedAt: '2026-09-11T05:00:00Z',
    references: [{ title: 'Published odds', url: 'https://example.com/odds', publishedAt: '2026-09-08T17:10:00Z', modifiedAt: '2026-09-09T01:15:52Z' }],
  };
  assert.ok(isAwardSource(source));
  const references = source.provenance.references;
  references[0].url = 'javascript:alert(1)';
  assert.equal(isAwardSource(source), false);
  references[0].url = 'https://example.com/odds';
  references[0].modifiedAt = 'not a date';
  assert.equal(isAwardSource(source), false);
  references[0].modifiedAt = '2026-09-11T01:00:00Z';
  assert.equal(isAwards({ draftkings: source }, ['draftkings'], TEAMS.map(t => t.id), '2026-09-10T00:20Z'), false);
});

test('article-backed preseason Maye +1000 has pre-kickoff evidence and no post-opener snapshot', async () => {
  const season = JSON.parse(await readFile(new URL('../public/data/seasons/2026.json', import.meta.url), 'utf8'));
  const baseline = season.snapshots.find(s => s.capturedAt === '2026-09-08T16:56:42.327Z');
  assert.equal(season.snapshots.some(s => s.id === '2026-2026-09-11'), false);
  const historical = baseline.awards?.draftkings;
  assert.ok(historical, 'published preseason awards must be attached to the baseline');
  assert.equal(historical.provenance.kind, 'published-preseason');
  assert.equal(historical.provenance.references.length, 2);
  assert.equal(historical.categories.length, 8);
  const before = historical.categories.find(c => c.id === 'mvp').candidates.find(c => c.name === 'Drake Maye');
  assert.equal(before.id, '4431452');
  assert.equal(before.americanOdds, 1000);
  assert.ok(historical.provenance.references.every(reference => Date.parse(reference.modifiedAt) < Date.parse(season.startsAt)));
  assert.doesNotThrow(() => validateSeason(season));
});
