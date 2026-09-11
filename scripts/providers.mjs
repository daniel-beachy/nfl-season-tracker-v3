import { METRICS, normalizeDivisions, normalizePercentages } from './data-core.mjs';
import { mapLimit, safeReference } from './http.mjs';

export const URLS = {
  fpi: 'https://site.web.api.espn.com/apis/fitt/v3/sports/football/nfl/powerindex',
  teams: 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams',
  scoreboard: (year, type = 2, week = 1) => `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${year}&seasontype=${type}&week=${week}&limit=100`,
  leaders: year => `https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/seasons/${year}/types/2/leaders?limit=10`,
  futures: year => `https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/seasons/${year}/futures?limit=100`,
  bovada: 'https://www.bovada.lv/services/sports/event/v2/events/A/description/football',
  polymarket: 'https://gamma-api.polymarket.com/events?tag_slug=nfl&closed=false&limit=100',
};

export const SOURCES = [
  {
    id: 'espn-fpi', name: 'ESPN FPI', kind: 'forecast',
    description: 'ESPN Football Power Index simulation forecasts, not betting odds. Values are percent probabilities; complete division groups normalized to 100%. Provider update time may precede capture.',
    url: 'https://www.espn.com/nfl/fpi', metrics: [...METRICS],
  },
  {
    id: 'draftkings', name: 'DraftKings', kind: 'market',
    description: 'DraftKings sportsbook American futures odds syndicated by ESPN, independent of FPI. Complete Super Bowl, conference and division markets are proportionally de-vigged to 100%; incomplete markets retain raw implied probabilities. No playoff or win-total estimates are invented.',
    url: 'https://www.espn.com/nfl/futures', metrics: ['superBowl', 'conference', 'division'], awards: true,
  },
  {
    id: 'bovada', name: 'Bovada', kind: 'market',
    description: 'Bovada sportsbook American futures and season props. Complete Super Bowl, conference and division markets are de-vigged to 100%. Playoff chances use two-way Yes/No implied probabilities; win totals reflect regular-season over/under lines.',
    url: 'https://www.bovada.lv/sports/football/nfl', metrics: ['superBowl', 'conference', 'division', 'playoffs', 'wins'], awards: true,
  },
  {
    id: 'polymarket', name: 'Polymarket', kind: 'market',
    description: 'Polymarket decentralized prediction market contracts. Real-time probabilities derived from on-chain trading prices on Polygon for championship, conference, division, and individual player awards.',
    url: 'https://polymarket.com/sports/nfl', metrics: ['superBowl', 'conference', 'division'], awards: true,
  },
];

const unavailable = note => ({ status: 'unavailable', note, projections: {} });
const unavailableAwards = note => ({ status: 'unavailable', note, categories: [] });
const validNumber = value => typeof value === 'number' && Number.isFinite(value);
const metricNumber = (value, metric) => validNumber(value) && value >= 0 && value <= (metric === 'wins' ? 17 : 100) ? value : null;
const isoDate = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : undefined;

export async function isolatedSource(name, task) {
  try { return await task(); }
  catch (error) { return unavailable(`${name} unavailable: ${error.message}. No simulated or previous-season values substituted.`); }
}

export function adaptFpi(payload, teams, season, now = new Date()) {
  const years = [payload?.requestedSeason?.year, payload?.currentSeason?.year, payload?.currentValues?.season]
    .filter(year => year !== undefined && year !== null).map(Number);
  if (!years.length || years.some(year => year !== season)) {
    return unavailable(`ESPN FPI season validation failed: requested ${season}, provider reports ${years.join(', ') || 'no verifiable season'}. Older-season data is not relabeled.`);
  }
  const headers = payload.categories?.find(c => c.name === 'projections')?.names;
  if (!Array.isArray(headers)) return unavailable(`ESPN FPI ${season}: projection field names are missing.`);
  const mapping = { conference: 'probmaketitlegame', division: 'probwindiv', playoffs: 'probmakeplayoffs', wins: 'projectedw', superBowl: 'probwintitle' };
  const rows = new Map((payload.teams ?? []).map(row => [String(row.team?.id), row]));
  const projections = {};
  let missing = 0;
  for (const team of teams) {
    const values = rows.get(team.id)?.categories?.find(c => c.name === 'projections')?.values ?? [];
    projections[team.id] = {};
    for (const [metric, field] of Object.entries(mapping)) {
      const value = metricNumber(values[headers.indexOf(field)], metric);
      projections[team.id][metric] = value;
      if (value === null) missing++;
    }
  }
  if (!Object.values(projections).some(p => ['superBowl', 'conference', 'division', 'playoffs'].some(m => p[m] > 0))) {
    return unavailable(`ESPN FPI ${season}: all probability projections are zero or missing; rejected as uninitialized/garbage rather than displayed as forecasts.`);
  }
  normalizeDivisions(projections, teams);
  const observedAt = isoDate(payload.lastUpdated);
  if (observedAt && Date.parse(observedAt) < Date.UTC(season, 0, 1)) {
    return unavailable(`ESPN FPI ${season}: provider update timestamp ${observedAt} predates this season's January rollover; season headers may have advanced before forecasts were refreshed.`);
  }
  const notes = [
    `ESPN reports season ${season}. Probabilities are supplied in percent, not fractions.`,
    'Conference = make Super Bowl (probmaketitlegame), not make conference championship. Complete nonzero division groups normalized to exactly 100%.',
    observedAt ? `Provider lastUpdated ${observedAt}; captured ${now.toISOString()}.` : `Provider update time is unknown; captured ${now.toISOString()}.`,
  ];
  if (observedAt) {
    const age = Math.floor((+now - Date.parse(observedAt)) / 86_400_000);
    if (age >= 7) notes.push(`Delayed data warning: provider update is ${age} days older than capture.`);
    if (Date.parse(observedAt) > +now + 86_400_000) return unavailable(`ESPN FPI ${season}: provider update timestamp is unexpectedly in the future.`);
  }
  const nullCount = Object.values(projections).reduce((count, p) => count + Object.values(p).filter(v => v === null).length, 0);
  if (missing || nullCount) notes.push(`Partial data: ${nullCount} missing/invalid metric values remain null; incomplete groups are not filled or normalized.`);
  return { status: 'ok', ...(observedAt ? { observedAt } : {}), note: notes.join(' '), projections };
}

export function americanToPercent(value) {
  if (typeof value === 'string' && /^(EVEN|EVENS)$/i.test(value.trim())) return 50;
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  if (!/^[+-]?\d+(?:\.\d+)?$/.test(String(value).trim())) return null;
  const odds = Number(value);
  if (!Number.isFinite(odds) || Math.abs(odds) < 100) return null;
  return odds > 0 ? 10000 / (odds + 100) : -odds / (-odds + 100) * 100;
}

export function referenceId(reference, kind, season) {
  if (!reference) return null;
  let url;
  try { url = new URL(safeReference(reference)); } catch { return null; }
  if (url.hostname !== 'sports.core.api.espn.com') return null;
  const match = url.pathname.match(new RegExp(`/leagues/nfl/seasons/(\\d{4})/${kind}/(\\d+)$`));
  return match && Number(match[1]) === season ? match[2] : null;
}

function expectedMarketTeams(name, metric, teams) {
  if (metric === 'superBowl') return teams;
  const conference = /\(A\)|\bAFC\b/i.test(name) ? 'AFC' : /\(N\)|\bNFC\b/i.test(name) ? 'NFC' : null;
  if (!conference) return [];
  const division = name.match(/\b(East|North|South|West)\b/i)?.[1];
  return teams.filter(t => t.conference === conference && (metric !== 'division' || t.division.toLowerCase() === division?.toLowerCase()));
}

export function adaptFutures(payload, teams, season) {
  const projections = {};
  const notes = [];
  const completeSums = { superBowl: [], conference: [], division: [] };
  const knownIds = new Set(teams.map(t => t.id));
  let accepted = 0;
  let rejected = 0;
  for (const item of payload?.items ?? []) {
    const name = item.name ?? '';
    const metric = /super bowl.*winner/i.test(name) ? 'superBowl' :
      /division/i.test(name) ? 'division' : /conference.*winner/i.test(name) ? 'conference' : null;
    if (!metric) continue;
    if (!referenceId(item.$ref, 'futures', season)) { rejected++; continue; }
    const book = item.futures?.find(f => f.provider?.name?.toLowerCase() === 'draftkings');
    if (!book?.books) continue;
    const expected = expectedMarketTeams(name, metric, teams);
    if (!expected.length) { rejected++; continue; }
    const values = new Map();
    for (const entry of book.books) {
      const id = referenceId(entry.team?.$ref, 'teams', season);
      const value = americanToPercent(entry.value);
      if (id && knownIds.has(id) && expected.some(t => t.id === id) && value !== null) values.set(id, value);
    }
    if (!values.size) continue;
    const total = [...values.values()].reduce((a, b) => a + b, 0);
    const complete = expected.length === values.size && expected.every(t => values.has(t.id));
    if (complete) {
      const normalized = normalizePercentages(expected.map(t => values.get(t.id)));
      expected.forEach((team, i) => {
        projections[team.id] ??= {};
        projections[team.id][metric] = normalized[i];
      });
      completeSums[metric].push(total);
    } else {
      for (const [id, value] of values) {
        projections[id] ??= {};
        projections[id][metric] = value;
      }
      notes.push(`${name}: partial ${values.size}/${expected.length} outcomes, raw implied sum ${total.toFixed(2)}%; not normalized and missing teams left absent.`);
    }
    accepted++;
  }
  if (!accepted) return unavailable(`DraftKings sportsbook via ESPN: no valid season ${season} team futures. ${rejected} markets rejected for unverifiable season/scope. No FPI or mock fallback.`);
  const ranges = Object.entries(completeSums).filter(([, sums]) => sums.length).map(([metric, sums]) => {
    const minimum = Math.min(...sums).toFixed(2);
    const maximum = Math.max(...sums).toFixed(2);
    const label = { superBowl: 'Super Bowl', conference: 'conference', division: 'division' }[metric];
    return `${label} ${minimum === maximum ? minimum : `${minimum}–${maximum}`}%`;
  });
  return {
    status: 'ok',
    note: `DraftKings sportsbook via ESPN, verified season ${season}. Update time not supplied; capture is not observation. American-odds implied percentages; complete markets proportionally normalized to 100% (estimated de-vig, not guaranteed fair odds).${ranges.length ? ` Raw implied sums: ${ranges.join('; ')}. Overround = raw sum minus 100 percentage points.` : ''} Playoff probability and expected wins unavailable.${notes.length ? ` ${notes.join(' ')}` : ''}${rejected ? ` ${rejected} invalid markets omitted.` : ''}`,
    projections,
  };
}

export async function loadFutures(season, get) {
  const payload = await get(URLS.futures(season));
  let resolutionFailures = 0;
  const items = await mapLimit((payload.items ?? []).slice(0, 100), 6, async item => {
    if (item.futures) return item;
    try { return await get(item.$ref); } catch { resolutionFailures++; return item; }
  });
  return { ...payload, items, resolutionFailures };
}

export async function fetchFutures(season, teams, get, payloadPromise = loadFutures(season, get)) {
  const payload = await payloadPromise;
  const result = adaptFutures(payload, teams, season);
  if (Number(payload.pageCount) > 1 || Number(payload.count) > 100) result.note += ' Only the first 100 markets were inspected; additional markets may be missing.';
  if (payload.resolutionFailures) result.note += ` Partial data: ${payload.resolutionFailures} market references could not be resolved.`;
  return result;
}

export const REQUIRED_LEADERS = [
  'passingYards', 'passingTouchdowns', 'rushingYards', 'rushingTouchdowns', 'receivingYards', 'receivingTouchdowns',
];

export async function fetchLeaders(season, metadata, teams, get) {
  const notStarted = metadata.phase === 'preseason' ||
    metadata.phase === 'offseason' && metadata.startsAt && Date.parse(metadata.startsAt) > Date.now();
  try {
    const payload = await get(URLS.leaders(season));
    if (payload.$ref) {
      const path = new URL(safeReference(payload.$ref)).pathname;
      if (!path.includes(`/seasons/${season}/types/2/leaders`)) throw new Error('Leader response season/type mismatch');
    }
    if (notStarted) return {
      status: 'not-started', note: `The ${season} regular season has not started; preseason totals are not substituted. Endpoint was checked.`, categories: [],
    };
    const categoryRows = [...(payload.categories ?? [])].sort((a, b) =>
      Number(REQUIRED_LEADERS.includes(b.name)) - Number(REQUIRED_LEADERS.includes(a.name))).slice(0, 24);
    const ids = new Set(teams.map(t => t.id));
    let unresolved = 0;
    const jobs = categoryRows.flatMap((category, index) =>
      (category.leaders ?? []).filter(row => validNumber(row.value) && row.value >= 0)
        .sort((a, b) => b.value - a.value).slice(0, 10).map(row => ({ category: index, row })));
    const resolved = await mapLimit(jobs, 6, async ({ category, row }) => {
      try {
        const athleteId = referenceId(row.athlete?.$ref, 'athletes', season);
        const teamId = referenceId(row.team?.$ref, 'teams', season);
        if (!athleteId || !teamId || !ids.has(teamId)) throw new Error('Invalid athlete/team reference');
        const athlete = await get(row.athlete.$ref);
        if (String(athlete.id) !== athleteId || !athlete.displayName) throw new Error('Unresolved athlete identity');
        return { category, player: { id: athleteId, name: athlete.displayName, teamId, value: row.value } };
      } catch { unresolved++; return null; }
    });
    const categories = categoryRows.map((category, index) => {
      const players = resolved.filter(row => row?.category === index).map(row => row.player);
      const unique = [...new Map(players.map(player => [player.id, player])).values()];
      return {
        id: category.name, name: category.displayName || category.name,
        unit: category.abbreviation || (/yards/i.test(category.name) ? 'YDS' : /touchdowns/i.test(category.name) ? 'TD' : 'Total'),
        players: unique.sort((a, b) => b.value - a.value).slice(0, 10),
      };
    }).filter(category => category.players.length);
    if (!categories.length) throw new Error('No resolvable regular-season leaders returned');
    const missing = REQUIRED_LEADERS.filter(id => !categories.some(c => c.id === id));
    const short = categories.filter(c => c.players.length < 10);
    return {
      status: 'ok',
      note: `ESPN season ${season}, regular season only (types/2); cumulative totals freeze during the postseason. Provider observation timestamp is not supplied.${missing.length || short.length || unresolved ? ` Partial data: missing categories ${missing.join(', ') || 'none'}; ${short.length} categories have fewer than ten players; ${unresolved} athlete references could not be resolved.` : ''}${(payload.categories?.length ?? 0) > 24 ? ' First 24 categories retained with required categories prioritized.' : ''}`,
      categories,
    };
  } catch (error) {
    return {
      status: notStarted ? 'not-started' : 'unavailable',
      note: `${season} regular-season leaders ${notStarted ? 'not started' : 'unavailable'}: ${error.message}. Preseason/postseason statistics and previous-season totals are never substituted.`,
      categories: [],
    };
  }
}

export function adaptPolymarket(events, teams, season) {
  if (!Array.isArray(events) || !events.length) {
    return unavailable(`Polymarket ${season}: no events returned.`);
  }
  const projections = {};
  for (const team of teams) {
    projections[team.id] = { superBowl: null, conference: null, division: null };
  }
  const byName = new Map(teams.map(t => [t.name.toLowerCase(), t]));

  const parseMarketGroup = event => {
    const map = new Map();
    for (const m of event?.markets ?? []) {
      const team = byName.get((m.groupItemTitle || '').trim().toLowerCase());
      if (!team) continue;
      try {
        const prices = JSON.parse(m.outcomePrices);
        const p = parseFloat(prices[0]);
        if (Number.isFinite(p) && p >= 0 && p <= 1) {
          map.set(team.id, p * 100);
        }
      } catch {}
    }
    return map;
  };

  const sbEvent = events.find(e => /champion/i.test(e.title) && !/afc|nfc|east|north|south|west/i.test(e.title));
  if (sbEvent) {
    const map = parseMarketGroup(sbEvent);
    if (map.size === teams.length) {
      const normalized = normalizePercentages(teams.map(t => map.get(t.id) ?? 0));
      teams.forEach((t, i) => { projections[t.id].superBowl = normalized[i]; });
    } else {
      for (const [id, val] of map) projections[id].superBowl = val;
    }
  }

  for (const conf of ['AFC', 'NFC']) {
    const confEvent = events.find(e => new RegExp(`${conf} Champion`, 'i').test(e.title) && !/east|north|south|west/i.test(e.title));
    if (confEvent) {
      const map = parseMarketGroup(confEvent);
      const confTeams = teams.filter(t => t.conference === conf);
      if (confTeams.every(t => map.has(t.id))) {
        const normalized = normalizePercentages(confTeams.map(t => map.get(t.id) ?? 0));
        confTeams.forEach((t, i) => { projections[t.id].conference = normalized[i]; });
      } else {
        for (const [id, val] of map) projections[id].conference = val;
      }
    }
  }

  for (const conf of ['AFC', 'NFC']) {
    for (const div of ['East', 'North', 'South', 'West']) {
      const divEvent = events.find(e => new RegExp(`${conf} ${div} Champion`, 'i').test(e.title));
      if (divEvent) {
        const map = parseMarketGroup(divEvent);
        const divTeams = teams.filter(t => t.conference === conf && t.division === div);
        if (divTeams.every(t => map.has(t.id))) {
          const normalized = normalizePercentages(divTeams.map(t => map.get(t.id) ?? 0));
          divTeams.forEach((t, i) => { projections[t.id].division = normalized[i]; });
        } else {
          for (const [id, val] of map) projections[id].division = val;
        }
      }
    }
  }

  const hasAny = Object.values(projections).some(p => ['superBowl', 'conference', 'division'].some(m => p[m] !== null));
  if (!hasAny) {
    return unavailable(`Polymarket ${season}: no matching championship markets found.`);
  }

  return {
    status: 'ok',
    note: `Polymarket prediction market contracts for season ${season}. Real-time probabilities derived from on-chain trading prices. Complete markets normalized to 100%. Playoff chances and win totals unavailable.`,
    projections,
  };
}

const POLYMARKET_AWARDS = [
  { id: 'mvp', name: 'Most Valuable Player', abbreviation: 'MVP', candidateType: 'player', match: /MVP Winner/i },
  { id: 'opoy', name: 'Offensive Player of the Year', abbreviation: 'OPOY', candidateType: 'player', match: /Offensive Player of the Year/i },
  { id: 'dpoy', name: 'Defensive Player of the Year', abbreviation: 'DPOY', candidateType: 'player', match: /Defensive Player of the Year/i },
  { id: 'oroy', name: 'Offensive Rookie of the Year', abbreviation: 'OROY', candidateType: 'player', match: /Offensive Rookie of the Year/i },
  { id: 'droy', name: 'Defensive Rookie of the Year', abbreviation: 'DROY', candidateType: 'player', match: /Defensive Rookie of the Year/i },
  { id: 'coy', name: 'Coach of the Year', abbreviation: 'COY', candidateType: 'coach', match: /Coach of the Year/i },
  { id: 'cpoy', name: 'Comeback Player of the Year', abbreviation: 'CPOY', candidateType: 'player', match: /Comeback Player of the Year/i },
];

export function adaptPolymarketAwards(events, teams, season) {
  if (!Array.isArray(events) || !events.length) {
    return unavailableAwards(`Polymarket ${season}: no events returned.`);
  }
  const categories = [];
  for (const def of POLYMARKET_AWARDS) {
    const event = events.find(e => def.match.test(e.title));
    if (!event || !Array.isArray(event.markets) || !event.markets.length) continue;
    const candidates = [];
    const seen = new Set();
    for (const m of event.markets) {
      const name = (m.groupItemTitle || '').trim();
      if (!name) continue;
      let p = 0;
      try {
        const prices = JSON.parse(m.outcomePrices);
        p = parseFloat(prices[0]);
      } catch { continue; }
      if (!Number.isFinite(p) || p <= 0 || p >= 1) continue;
      const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      if (seen.has(id)) continue;
      seen.add(id);

      const rawOdds = p < 0.5 ? (1 - p) / p * 100 : -p / (1 - p) * 100;
      let americanOdds = Math.round(rawOdds);
      if (Math.abs(americanOdds) < 100) americanOdds = americanOdds >= 0 ? 100 : -100;
      const impliedProbability = americanOdds > 0 ? 10000 / (americanOdds + 100) : -americanOdds / (-americanOdds + 100) * 100;

      candidates.push({
        id,
        name,
        teamId: null,
        americanOdds,
        impliedProbability,
      });
    }
    candidates.sort((a, b) => b.impliedProbability - a.impliedProbability);
    if (candidates.length) {
      categories.push({
        id: def.id,
        name: def.name,
        abbreviation: def.abbreviation,
        candidateType: def.candidateType,
        probabilityBasis: 'raw-implied',
        listedCount: candidates.length,
        note: `Polymarket real-time market prices for ${def.name}.`,
        candidates: candidates.slice(0, 50),
      });
    }
  }
  if (!categories.length) {
    return unavailableAwards(`Polymarket ${season}: no award categories found.`);
  }
  return {
    status: 'ok',
    note: `Polymarket prediction market contracts for season ${season}. Raw implied probabilities from contract prices; bookmaker margin/overround not applicable.`,
    categories,
  };
}

export async function fetchPolymarket(season, teams, get, eventsPromise = null) {
  try {
    const events = eventsPromise ? await eventsPromise : await get(URLS.polymarket);
    return adaptPolymarket(events, teams, season);
  } catch (error) {
    return unavailable(`Polymarket unavailable: ${error.message}.`);
  }
}

export async function fetchPolymarketAwards(season, teams, get, eventsPromise = null) {
  try {
    const events = eventsPromise ? await eventsPromise : await get(URLS.polymarket);
    return adaptPolymarketAwards(events, teams, season);
  } catch (error) {
    return unavailableAwards(`Polymarket awards unavailable: ${error.message}.`);
  }
}

export function adaptBovada(groups, teams, season) {
  if (!Array.isArray(groups) || !groups.length) {
    return unavailable(`Bovada ${season}: no events returned.`);
  }
  const projections = {};
  for (const team of teams) {
    projections[team.id] = { superBowl: null, conference: null, division: null, playoffs: null, wins: null };
  }
  const byName = new Map(teams.map(t => [t.name.toLowerCase(), t]));

  const findPathGroup = (name, parentName = null) => {
    return groups.find(g => {
      const descriptions = (g.path ?? []).map(p => (p.description || '').toLowerCase());
      const hasName = descriptions.some(d => d.includes(name.toLowerCase()));
      const hasParent = !parentName || descriptions.some(d => d.includes(parentName.toLowerCase()));
      return hasName && hasParent;
    });
  };

  const getOutcomes = group => {
    for (const event of group?.events ?? []) {
      for (const dg of event?.displayGroups ?? []) {
        for (const m of dg?.markets ?? []) {
          const matchCount = (m.outcomes ?? []).filter(o => byName.has((o.description || '').trim().toLowerCase())).length;
          if (matchCount >= 4) return m.outcomes;
        }
      }
    }
    return group?.events?.[0]?.displayGroups?.[0]?.markets?.[0]?.outcomes ?? [];
  };

  // 1. Super Bowl Winner
  const sbGroup = findPathGroup('Super Bowl Winner', 'NFL Futures');
  if (sbGroup) {
    const outcomes = getOutcomes(sbGroup);
    const map = new Map();
    for (const o of outcomes) {
      const team = byName.get((o.description || '').trim().toLowerCase());
      const value = americanToPercent(o.price?.american);
      if (team && value !== null) map.set(team.id, value);
    }
    if (map.size === teams.length) {
      const normalized = normalizePercentages(teams.map(t => map.get(t.id) ?? 0));
      teams.forEach((t, i) => { projections[t.id].superBowl = normalized[i]; });
    } else {
      for (const [id, val] of map) projections[id].superBowl = val;
    }
  }

  // 2. Conferences
  for (const conf of ['AFC', 'NFC']) {
    const confGroup = findPathGroup(`${conf} Championship`, 'NFL Futures');
    if (confGroup) {
      const outcomes = getOutcomes(confGroup);
      const map = new Map();
      for (const o of outcomes) {
        const team = byName.get((o.description || '').trim().toLowerCase());
        const value = americanToPercent(o.price?.american);
        if (team && value !== null) map.set(team.id, value);
      }
      const confTeams = teams.filter(t => t.conference === conf);
      if (confTeams.every(t => map.has(t.id))) {
        const normalized = normalizePercentages(confTeams.map(t => map.get(t.id) ?? 0));
        confTeams.forEach((t, i) => { projections[t.id].conference = normalized[i]; });
      } else {
        for (const [id, val] of map) projections[id].conference = val;
      }
    }
  }

  // 3. Divisions
  for (const conf of ['AFC', 'NFC']) {
    for (const div of ['East', 'North', 'South', 'West']) {
      const divGroup = findPathGroup(`${conf} ${div}`, 'NFL Futures');
      if (divGroup) {
        const outcomes = getOutcomes(divGroup);
        const map = new Map();
        for (const o of outcomes) {
          const team = byName.get((o.description || '').trim().toLowerCase());
          const value = americanToPercent(o.price?.american);
          if (team && value !== null) map.set(team.id, value);
        }
        const divTeams = teams.filter(t => t.conference === conf && t.division === div);
        if (divTeams.every(t => map.has(t.id))) {
          const normalized = normalizePercentages(divTeams.map(t => map.get(t.id) ?? 0));
          divTeams.forEach((t, i) => { projections[t.id].division = normalized[i]; });
        } else {
          for (const [id, val] of map) projections[id].division = val;
        }
      }
    }
  }

  // 4. To Make the Playoffs (Yes/No)
  const playoffGroup = findPathGroup('To Make the Playoffs', 'NFL Season Props');
  if (playoffGroup) {
    const markets = playoffGroup?.events?.[0]?.displayGroups?.[0]?.markets ?? [];
    for (const m of markets) {
      const teamName = (m.description || '').replace(/\s+to make the playoffs/i, '').trim().toLowerCase();
      const team = byName.get(teamName);
      if (!team) continue;
      const yesOutcome = m.outcomes?.find(o => /^yes$/i.test((o.description || '').trim()));
      const noOutcome = m.outcomes?.find(o => /^no$/i.test((o.description || '').trim()));
      const yesOdds = americanToPercent(yesOutcome?.price?.american);
      const noOdds = americanToPercent(noOutcome?.price?.american);
      if (yesOdds !== null) {
        if (noOdds !== null && yesOdds + noOdds > 0) {
          projections[team.id].playoffs = Math.round((yesOdds / (yesOdds + noOdds)) * 10000) / 100;
        } else {
          projections[team.id].playoffs = Math.round(yesOdds * 100) / 100;
        }
      }
    }
  }

  // 5. NFL Regular Season Wins (Over/Under)
  const winGroups = groups.filter(g => (g.path ?? []).some(p => /NFL Regular Season Wins/i.test(p.description)));
  for (const g of winGroups) {
    const teamDesc = (g.path?.[0]?.description || '').trim().toLowerCase();
    const team = byName.get(teamDesc);
    if (!team) continue;
    const market = g.events?.[0]?.displayGroups?.[0]?.markets?.[0];
    const match = (market?.description || '').match(/\((\d+(?:\.\d+)?)\)/);
    if (match) {
      const line = parseFloat(match[1]);
      if (Number.isFinite(line) && line >= 0 && line <= 17) {
        projections[team.id].wins = line;
      }
    } else {
      const over = market?.outcomes?.find(o => /over\s+(\d+(?:\.\d+)?)/i.test(o.description));
      const lineMatch = over?.description?.match(/over\s+(\d+(?:\.\d+)?)/i);
      if (lineMatch) {
        const line = parseFloat(lineMatch[1]);
        if (Number.isFinite(line) && line >= 0 && line <= 17) {
          projections[team.id].wins = line;
        }
      }
    }
  }

  const hasAny = Object.values(projections).some(p => ['superBowl', 'conference', 'division', 'playoffs', 'wins'].some(m => p[m] !== null));
  if (!hasAny) {
    return unavailable(`Bovada ${season}: no matching markets found.`);
  }

  return {
    status: 'ok',
    note: `Bovada sportsbook futures and season props for season ${season}. Championship, conference, and division markets de-vigged to 100%. Playoff chances use two-way Yes/No de-vigged implied probabilities; win totals reflect regular-season over/under lines.`,
    projections,
  };
}

const BOVADA_AWARDS = [
  { id: 'mvp', name: 'Most Valuable Player', abbreviation: 'MVP', candidateType: 'player', match: /Regular Season MVP/i },
  { id: 'opoy', name: 'Offensive Player of the Year', abbreviation: 'OPOY', candidateType: 'player', match: /Offensive Player of the Year/i },
  { id: 'dpoy', name: 'Defensive Player of the Year', abbreviation: 'DPOY', candidateType: 'player', match: /Defensive Player of the Year/i },
  { id: 'oroy', name: 'Offensive Rookie of the Year', abbreviation: 'OROY', candidateType: 'player', match: /Offensive Rookie of the Year/i },
  { id: 'droy', name: 'Defensive Rookie of the Year', abbreviation: 'DROY', candidateType: 'player', match: /Defensive Rookie of the Year/i },
  { id: 'coy', name: 'Coach of the Year', abbreviation: 'COY', candidateType: 'coach', match: /Coach of the Year/i },
  { id: 'cpoy', name: 'Comeback Player of the Year', abbreviation: 'CPOY', candidateType: 'player', match: /Comeback Player of the Year/i },
];

export function adaptBovadaAwards(groups, teams, season) {
  if (!Array.isArray(groups) || !groups.length) {
    return unavailableAwards(`Bovada ${season}: no events returned.`);
  }
  const byAbbr = new Map(teams.map(t => [t.abbreviation.toLowerCase(), t]));
  const categories = [];

  for (const def of BOVADA_AWARDS) {
    const group = groups.find(g => (g.path ?? []).some(p => def.match.test(p.description)));
    if (!group) continue;
    const outcomes = group.events?.[0]?.displayGroups?.[0]?.markets?.[0]?.outcomes ?? [];
    if (!outcomes.length) continue;

    const candidates = [];
    const seen = new Set();
    for (const o of outcomes) {
      const rawDesc = (o.description || '').trim();
      if (!rawDesc) continue;
      const match = rawDesc.match(/^(.*?)(?:\s*\(([A-Z]{2,3})\))?$/);
      const name = (match?.[1] || rawDesc).trim();
      const teamAbbr = (match?.[2] || '').toLowerCase();
      const team = byAbbr.get(teamAbbr);
      const teamId = def.candidateType === 'coach' ? null : (team?.id ?? null);

      const american = o.price?.american;
      const implied = americanToPercent(american);
      if (implied === null) continue;
      const americanNum = /^(EVEN|EVENS)$/i.test(String(american).trim()) ? 100 : Number(american);
      const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      if (seen.has(id)) continue;
      seen.add(id);

      candidates.push({
        id,
        name,
        teamId,
        americanOdds: americanNum,
        impliedProbability: implied,
      });
    }

    candidates.sort((a, b) => b.impliedProbability - a.impliedProbability);
    if (candidates.length) {
      categories.push({
        id: def.id,
        name: def.name,
        abbreviation: def.abbreviation,
        candidateType: def.candidateType,
        probabilityBasis: 'raw-implied',
        listedCount: candidates.length,
        note: `Bovada American odds for ${def.name}.`,
        candidates: candidates.slice(0, 50),
      });
    }
  }

  if (!categories.length) {
    return unavailableAwards(`Bovada ${season}: no award categories found.`);
  }

  return {
    status: 'ok',
    note: `Bovada sportsbook award futures for season ${season}. Raw American odds and implied probabilities.`,
    categories,
  };
}

export async function fetchBovada(season, teams, get, payloadPromise = null) {
  try {
    const payload = payloadPromise ? await payloadPromise : await get(URLS.bovada);
    return adaptBovada(payload, teams, season);
  } catch (error) {
    return unavailable(`Bovada unavailable: ${error.message}.`);
  }
}

export async function fetchBovadaAwards(season, teams, get, payloadPromise = null) {
  try {
    const payload = payloadPromise ? await payloadPromise : await get(URLS.bovada);
    return adaptBovadaAwards(payload, teams, season);
  } catch (error) {
    return unavailableAwards(`Bovada awards unavailable: ${error.message}.`);
  }
}
