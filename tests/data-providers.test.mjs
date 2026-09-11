import test from 'node:test';
import assert from 'node:assert/strict';
import { TEAMS } from '../scripts/teams.mjs';
import { SOURCES, adaptFpi, adaptFutures, adaptPolymarket, adaptPolymarketAwards, americanToPercent, fetchLeaders, isolatedSource } from '../scripts/providers.mjs';
import { safeReference, createHttpClient, mapLimit } from '../scripts/http.mjs';

const ref = (kind, id, year = 2026) =>
  `http://sports.core.api.espn.com/v2/sports/football/leagues/nfl/seasons/${year}/${kind}/${id}?lang=en`;
const fpiFixture = (year = 2026) => ({
  requestedSeason: { year }, currentSeason: { year }, lastUpdated: '2026-08-31T14:44Z',
  categories: [{ name: 'projections', names: ['projectedw', 'probwindiv', 'probmakeplayoffs', 'probmaketitlegame', 'probwintitle'] }],
  teams: TEAMS.map(t => ({ team: { id: t.id }, categories: [
    { name: 'projections', values: [8.5, 25, 45, 6.25, 3.125] },
  ] })),
});

test('FPI values are already percentages and conference uses probmaketitlegame', () => {
  const source = adaptFpi(fpiFixture(), TEAMS, 2026, new Date('2026-09-08T16:00Z'));
  assert.equal(source.status, 'ok');
  assert.equal(source.projections[TEAMS[0].id].conference, 6.25);
  assert.equal(source.projections[TEAMS[0].id].wins, 8.5);
  assert.equal(source.projections[TEAMS[0].id].playoffs, 45);
  assert.equal(source.observedAt, '2026-08-31T14:44:00.000Z');
  assert.match(source.note, /2026/);
  assert.match(source.note, /delayed|days|older/i);
});

test('FPI rejects stale or unverified seasons and all-zero garbage', () => {
  assert.equal(adaptFpi(fpiFixture(2025), TEAMS, 2026).status, 'unavailable');
  const absent = fpiFixture();
  delete absent.requestedSeason;
  delete absent.currentSeason;
  assert.equal(adaptFpi(absent, TEAMS, 2026).status, 'unavailable');
  const contradictory = fpiFixture();
  contradictory.requestedSeason.year = 2025;
  assert.equal(adaptFpi(contradictory, TEAMS, 2026).status, 'unavailable');
  const zeros = fpiFixture();
  for (const row of zeros.teams) row.categories[0].values = [0, 0, 0, 0, 0];
  assert.equal(adaptFpi(zeros, TEAMS, 2026).status, 'unavailable');
});

test('FPI missing values remain null rather than number-coerced zero or 25 percent', () => {
  const fixture = fpiFixture();
  fixture.teams[0].categories[0].values = [null, null, 'garbage', -1, 999];
  const result = adaptFpi(fixture, TEAMS, 2026);
  assert.equal(result.status, 'ok');
  assert.deepEqual(result.projections[TEAMS[0].id], {
    wins: null, division: null, playoffs: null, conference: null, superBowl: null,
  });
  assert.match(result.note, /partial|missing/i);
});

test('FPI accepts genuine requested-year January updates before the old March rollover', () => {
  const fixture = fpiFixture(2027);
  fixture.lastUpdated = '2027-01-01T12:00Z';
  assert.equal(adaptFpi(fixture, TEAMS, 2027, new Date('2027-01-02T16:00Z')).status, 'ok');
});

test('FPI rejects a prior-season update timestamp even when upstream season headers have rolled over', () => {
  const fixture = fpiFixture();
  fixture.lastUpdated = '2025-12-20T12:00Z';
  const result = adaptFpi(fixture, TEAMS, 2026, new Date('2026-09-08T16:00Z'));
  assert.equal(result.status, 'unavailable');
  assert.match(result.note, /timestamp|updated|update/i);
});

test('American sportsbook odds convert to implied probability without confusing FPI', () => {
  assert.equal(americanToPercent('+300'), 25);
  assert.equal(americanToPercent('-150'), 60);
  assert.equal(americanToPercent('EVEN'), 50);
  assert.equal(americanToPercent('0'), null);
  assert.equal(americanToPercent('garbage'), null);
});

test('DraftKings complete markets are normalized and missing metrics never fabricated', () => {
  const data = { items: [{ $ref: ref('futures', 1561), name: 'NFL - Super Bowl Winner',
    futures: [{ provider: { name: 'DraftKings', id: '100' }, books: TEAMS.map(t => ({
      team: { $ref: ref('teams', t.id) }, value: '+2000',
    })) }] }] };
  const result = adaptFutures(data, TEAMS, 2026);
  assert.equal(result.status, 'ok');
  assert.equal(Math.round(Object.values(result.projections).reduce((s, p) => s + p.superBowl, 0) * 100), 10000);
  assert.equal(result.projections[TEAMS[0].id].wins, undefined);
  assert.equal(result.projections[TEAMS[0].id].playoffs, undefined);
  assert.match(result.note, /overround|implied sum/i);
  assert.match(result.note, /DraftKings/);
  data.items[0].futures[0].books.pop();
  const partial = adaptFutures(data, TEAMS, 2026);
  assert.equal(partial.status, 'ok');
  assert.equal(partial.projections[TEAMS.at(-1).id]?.superBowl, undefined);
  assert.match(partial.note, /partial|not normalized/i);
});

test('market adapter refuses references for a different season', () => {
  const result = adaptFutures({ items: [{ $ref: ref('futures', 1561, 2025), name: 'NFL - Super Bowl Winner',
    futures: [{ provider: { name: 'DraftKings' }, books: [{ team: { $ref: ref('teams', 2, 2025) }, value: '+500' }] }] }] }, TEAMS, 2026);
  assert.equal(result.status, 'unavailable');
});

test('full sportsbook source notes summarize markets concisely without hiding normalization or missing metrics', () => {
  let marketId = 1;
  const market = (name, teams) => ({
    $ref: ref('futures', marketId++), name,
    futures: [{ provider: { name: 'DraftKings' }, books: teams.map(team => ({
      team: { $ref: ref('teams', team.id) }, value: '+500',
    })) }],
  });
  const items = [market('NFL - Super Bowl Winner', TEAMS)];
  for (const conference of ['AFC', 'NFC']) {
    const teams = TEAMS.filter(team => team.conference === conference);
    items.push(market(`${conference} Conference Winner`, teams));
    for (const division of ['East', 'North', 'South', 'West']) {
      items.push(market(`${conference} ${division} Division Winner`, teams.filter(team => team.division === division)));
    }
  }
  const result = adaptFutures({ items }, TEAMS, 2026);
  assert.equal(result.status, 'ok');
  assert.ok(result.note.length < 650, `Note is too verbose: ${result.note.length} characters`);
  assert.match(result.note, /2026/);
  assert.match(result.note, /overround/i);
  assert.match(result.note, /not supplied|unknown/i);
  assert.match(result.note, /playoff/i);
  assert.match(result.note, /wins/i);
});

test('safe references upgrade HTTP and block non-provider hosts, credentials and nonstandard ports', () => {
  assert.match(safeReference(ref('athletes', 3918298)), /^https:/);
  for (const url of ['https://evil.example/x', 'file:///etc/passwd', 'https://sports.core.api.espn.com:8443/x',
    'https://user:password@sports.core.api.espn.com/x', 'http://127.0.0.1/x']) {
    assert.throws(() => safeReference(url), /reference|host|port|URL/i);
  }
});

test('bounded worker pool preserves order without exceeding requested concurrency', async () => {
  let active = 0;
  let maximum = 0;
  const values = await mapLimit([1, 2, 3, 4, 5, 6], 2, async value => {
    maximum = Math.max(maximum, ++active);
    await new Promise(resolve => setTimeout(resolve, 2));
    active--;
    return value * 2;
  });
  assert.deepEqual(values, [2, 4, 6, 8, 10, 12]);
  assert.equal(maximum, 2);
});

test('HTTP client rejects redirects, caps responses and shares reference cache', async () => {
  let calls = 0;
  const get = createHttpClient({ fetchImpl: async () => {
    calls++;
    return new Response(JSON.stringify({ id: 1 }));
  } });
  await Promise.all([get(ref('athletes', 1)), get(ref('athletes', 1))]);
  assert.equal(calls, 1);
  await assert.rejects(createHttpClient({ fetchImpl: async () => new Response('', { status: 302 }) })(ref('athletes', 2)), /302/);
  await assert.rejects(createHttpClient({ maxBytes: 5, fetchImpl: async () => new Response('123456') })(ref('athletes', 3)), /large|size/i);
});

test('HTTP requests receive an enforced abort deadline', async () => {
  const get = createHttpClient({ timeoutMs: 5, fetchImpl: async (_url, { signal }) =>
    new Promise((_resolve, reject) => {
      const keepAlive = setTimeout(() => reject(new Error('deadline was not enforced')), 100);
      signal.addEventListener('abort', () => { clearTimeout(keepAlive); reject(signal.reason); });
    }) });
  await assert.rejects(get(ref('athletes', 4)), error => error.name === 'TimeoutError');
});

test('leaders safely resolve athlete refs, sort top ten and preserve category names', async () => {
  const fixture = { $ref: ref('types/2/leaders', '').replace(/\/\?/, '?'), categories: [
    { name: 'passingYards', displayName: 'Passing Yards', abbreviation: 'YDS',
      leaders: Array.from({ length: 12 }, (_, i) => ({
        value: 1000 + i, athlete: { $ref: ref('athletes', i + 1) }, team: { $ref: ref('teams', 2) },
      })) },
  ] };
  const get = async url => url.includes('/leaders') ? fixture : { id: url.match(/athletes\/(\d+)/)[1], displayName: `Player ${url.match(/athletes\/(\d+)/)[1]}` };
  const leaders = await fetchLeaders(2026, { phase: 'regular', startsAt: '2026-09-10T00:20Z' }, TEAMS, get);
  assert.equal(leaders.status, 'ok');
  assert.equal(leaders.categories[0].players.length, 10);
  assert.equal(leaders.categories[0].players[0].value, 1011);
  assert.equal(leaders.categories[0].players[0].teamId, '2');
  assert.match(leaders.note, /partial|missing/i);
});

test('leaders report not-started before kickoff and unavailable after kickoff without mock fallback', async () => {
  const get = async () => { throw new Error('HTTP 404 No stats found'); };
  assert.equal((await fetchLeaders(2026, { phase: 'preseason' }, TEAMS, get)).status, 'not-started');
  assert.equal((await fetchLeaders(2026, { phase: 'regular' }, TEAMS, get)).status, 'unavailable');
});

test('provider errors remain source-local and visible', async () => {
  const result = await isolatedSource('Example', async () => { throw new Error('HTTP 503'); });
  assert.deepEqual(result.projections, {});
  assert.equal(result.status, 'unavailable');
  assert.match(result.note, /Example.*503/);
});

test('registered sources include Bovada and Polymarket and HTTP client allows their hosts', () => {
  assert.equal(safeReference('https://www.bovada.lv/services/sports/event/v2/events/A/description/football'), 'https://www.bovada.lv/services/sports/event/v2/events/A/description/football');
  assert.equal(safeReference('https://gamma-api.polymarket.com/events?tag_slug=nfl'), 'https://gamma-api.polymarket.com/events?tag_slug=nfl');
  const bovada = SOURCES.find(s => s.id === 'bovada');
  assert.ok(bovada, 'Bovada source must be registered');
  assert.equal(bovada.kind, 'market');
  assert.deepEqual(bovada.metrics, ['superBowl', 'conference', 'division', 'playoffs', 'wins']);
  assert.equal(bovada.awards, true);

  const polymarket = SOURCES.find(s => s.id === 'polymarket');
  assert.ok(polymarket, 'Polymarket source must be registered');
  assert.equal(polymarket.kind, 'market');
  assert.deepEqual(polymarket.metrics, ['superBowl', 'conference', 'division']);
  assert.equal(polymarket.awards, true);
});

test('adaptPolymarket parses championship, conference, and division markets correctly', () => {
  const events = [
    {
      title: 'Pro Football: 2027 Champion',
      slug: 'pro-football-2027-champion-2026',
      markets: TEAMS.map((team, i) => ({
        groupItemTitle: team.name,
        outcomePrices: JSON.stringify([(1 / 32).toFixed(4), (31 / 32).toFixed(4)]),
        active: true,
      })),
    },
    {
      title: 'Pro Football: 2027 AFC Champion ',
      slug: 'pro-football-2027-afc-champion',
      markets: TEAMS.filter(t => t.conference === 'AFC').map(team => ({
        groupItemTitle: team.name,
        outcomePrices: JSON.stringify([(1 / 16).toFixed(4), (15 / 16).toFixed(4)]),
        active: true,
      })),
    },
    {
      title: 'Pro Football: 2027 NFC Champion ',
      slug: 'pro-football-2027-nfc-champion',
      markets: TEAMS.filter(t => t.conference === 'NFC').map(team => ({
        groupItemTitle: team.name,
        outcomePrices: JSON.stringify([(1 / 16).toFixed(4), (15 / 16).toFixed(4)]),
        active: true,
      })),
    },
    {
      title: 'Pro Football: AFC East Champion',
      slug: 'pro-football-afc-east-champion',
      markets: TEAMS.filter(t => t.conference === 'AFC' && t.division === 'East').map(team => ({
        groupItemTitle: team.name,
        outcomePrices: JSON.stringify([(0.25).toFixed(4), (0.75).toFixed(4)]),
        active: true,
      })),
    },
  ];

  const result = adaptPolymarket(events, TEAMS, 2026);
  assert.equal(result.status, 'ok');
  assert.equal(typeof result.projections[TEAMS[0].id].superBowl, 'number');
  assert.equal(typeof result.projections[TEAMS[0].id].conference, 'number');
  // AFC East team has division
  const bills = TEAMS.find(t => t.name === 'Buffalo Bills');
  assert.equal(typeof result.projections[bills.id].division, 'number');
});

test('adaptPolymarketAwards parses award markets and calculates american odds', () => {
  const events = [
    {
      title: 'Pro Football: 2026 MVP Winner',
      markets: [
        { groupItemTitle: 'Josh Allen', outcomePrices: JSON.stringify(['0.15', '0.85']) },
        { groupItemTitle: 'Drake Maye', outcomePrices: JSON.stringify(['0.10', '0.90']) },
      ],
    },
  ];

  const result = adaptPolymarketAwards(events, TEAMS, 2026);
  assert.equal(result.status, 'ok');
  assert.equal(result.categories.length, 1);
  const mvp = result.categories[0];
  assert.equal(mvp.id, 'mvp');
  assert.equal(mvp.candidates.length, 2);
  const maye = mvp.candidates.find(c => c.name === 'Drake Maye');
  assert.ok(maye);
  assert.equal(maye.impliedProbability, 10);
  assert.equal(maye.americanOdds, 900);
});
