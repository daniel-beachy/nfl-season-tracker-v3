import { METRICS, normalizeDivisions, normalizePercentages } from './data-core.mjs';
import { mapLimit, safeReference } from './http.mjs';

export const URLS = {
  fpi: 'https://site.web.api.espn.com/apis/fitt/v3/sports/football/nfl/powerindex',
  teams: 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams',
  scoreboard: year => `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${year}&seasontype=2&week=1&limit=100`,
  leaders: year => `https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/seasons/${year}/types/2/leaders?limit=10`,
  futures: year => `https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/seasons/${year}/futures?limit=100`,
};

export const SOURCES = [
  {
    id: 'espn-fpi', name: 'ESPN FPI', kind: 'forecast',
    description: 'ESPN Football Power Index simulation forecasts, not betting odds. Values are percent probabilities; complete division groups normalized to 100%. Provider update time may precede capture.',
    url: 'https://www.espn.com/nfl/fpi', metrics: [...METRICS],
  },
  {
    id: 'draftkings', name: 'DraftKings via ESPN', kind: 'market',
    description: 'DraftKings sportsbook American futures odds syndicated by ESPN, independent of FPI. Complete Super Bowl, conference and division markets are proportionally de-vigged to 100%; incomplete markets retain raw implied probabilities. No playoff or win-total estimates are invented.',
    url: 'https://www.espn.com/nfl/futures', metrics: ['superBowl', 'conference', 'division'], awards: true,
  },
];

const unavailable = note => ({ status: 'unavailable', note, projections: {} });
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
  if (observedAt && Date.parse(observedAt) < Date.UTC(season, 2, 1)) {
    return unavailable(`ESPN FPI ${season}: provider update timestamp ${observedAt} predates this season's March rollover; season headers may have advanced before forecasts were refreshed.`);
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
