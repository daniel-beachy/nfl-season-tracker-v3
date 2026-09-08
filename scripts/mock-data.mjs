import { TEAMS } from './teams.mjs';
import { normalizePercentages, snapshotId, validateSeason } from './data-core.mjs';
import { SOURCES } from './providers.mjs';

const FINAL_WINS = {
  BUF: 13, MIA: 7, NE: 7, NYJ: 5, BAL: 12, CIN: 10, CLE: 4, PIT: 8,
  HOU: 11, IND: 8, JAX: 6, TEN: 4, DEN: 10, KC: 12, LV: 5, LAC: 10,
  DAL: 8, NYG: 4, PHI: 13, WSH: 10, CHI: 7, DET: 12, GB: 10, MIN: 8,
  ATL: 8, CAR: 6, NO: 5, TB: 10, ARI: 7, LAR: 11, SF: 12, SEA: 9,
};
const DIVISION_WINNERS = new Set(['BUF', 'BAL', 'HOU', 'KC', 'PHI', 'DET', 'TB', 'SF']);
const PLAYOFF_TEAMS = new Set(['BUF', 'BAL', 'HOU', 'KC', 'CIN', 'DEN', 'LAC', 'PHI', 'DET', 'TB', 'SF', 'LAR', 'GB', 'WSH']);
const REMAINING = [
  PLAYOFF_TEAMS,
  new Set(['BUF', 'BAL', 'HOU', 'KC', 'PHI', 'DET', 'SF', 'LAR']),
  new Set(['BUF', 'BAL', 'PHI', 'DET']),
  new Set(['BUF', 'PHI']),
  new Set(['BUF', 'PHI']),
  new Set(['BUF', 'PHI']),
];
const PASSERS = [
  ['Josh Allen', 'BUF'], ['Lamar Jackson', 'BAL'], ['Joe Burrow', 'CIN'], ['Patrick Mahomes', 'KC'],
  ['Jared Goff', 'DET'], ['Baker Mayfield', 'TB'], ['Justin Herbert', 'LAC'], ['Dak Prescott', 'DAL'],
  ['Jalen Hurts', 'PHI'], ['Matthew Stafford', 'LAR'], ['C.J. Stroud', 'HOU'], ['Jordan Love', 'GB'],
];
const RUSHERS = [
  ['Saquon Barkley', 'PHI'], ['Derrick Henry', 'BAL'], ['Bijan Robinson', 'ATL'], ['Jahmyr Gibbs', 'DET'],
  ['Jonathan Taylor', 'IND'], ['Josh Jacobs', 'GB'], ['Christian McCaffrey', 'SF'], ['De’Von Achane', 'MIA'],
  ['James Cook', 'BUF'], ['Kyren Williams', 'LAR'], ['Breece Hall', 'NYJ'], ['Kenneth Walker III', 'SEA'],
];
const RECEIVERS = [
  ['Ja’Marr Chase', 'CIN'], ['Justin Jefferson', 'MIN'], ['CeeDee Lamb', 'DAL'], ['Amon-Ra St. Brown', 'DET'],
  ['Puka Nacua', 'LAR'], ['Nico Collins', 'HOU'], ['A.J. Brown', 'PHI'], ['Brian Thomas Jr.', 'JAX'],
  ['Malik Nabers', 'NYG'], ['Drake London', 'ATL'], ['Garrett Wilson', 'NYJ'], ['Trey McBride', 'ARI'],
];
const DEFENDERS = [
  ['Myles Garrett', 'CLE'], ['T.J. Watt', 'PIT'], ['Micah Parsons', 'GB'], ['Trey Hendrickson', 'CIN'],
  ['Aidan Hutchinson', 'DET'], ['Nick Bosa', 'SF'], ['Maxx Crosby', 'LV'], ['Will Anderson Jr.', 'HOU'],
  ['Danielle Hunter', 'HOU'], ['Brian Burns', 'NYG'], ['Roquan Smith', 'BAL'], ['Fred Warner', 'SF'],
];
const SECONDARY = [
  ['Derek Stingley Jr.', 'HOU'], ['Patrick Surtain II', 'DEN'], ['Xavier McKinney', 'GB'], ['Kerby Joseph', 'DET'],
  ['Kyle Hamilton', 'BAL'], ['Jessie Bates III', 'ATL'], ['Antoine Winfield Jr.', 'TB'], ['Christian Gonzalez', 'NE'],
  ['Trent McDuffie', 'KC'], ['Sauce Gardner', 'NYJ'], ['Devon Witherspoon', 'SEA'], ['Denzel Ward', 'CLE'],
];
const CATEGORIES = [
  ['passingYards', 'Passing yards', 'YDS', PASSERS, 4820, 128],
  ['passingTouchdowns', 'Passing touchdowns', 'TD', PASSERS, 42, 1.65],
  ['rushingYards', 'Rushing yards', 'YDS', RUSHERS, 1890, 71],
  ['rushingTouchdowns', 'Rushing touchdowns', 'TD', RUSHERS, 19, 0.85],
  ['receivingYards', 'Receiving yards', 'YDS', RECEIVERS, 1755, 55],
  ['receivingTouchdowns', 'Receiving touchdowns', 'TD', RECEIVERS, 17, 0.8],
  ['receptions', 'Receptions', 'REC', RECEIVERS, 129, 3.8],
  ['sacks', 'Sacks', 'SACK', DEFENDERS, 21.5, 1.1],
  ['totalTackles', 'Total tackles', 'TOT', [...DEFENDERS].reverse(), 167, 6],
  ['interceptions', 'Defensive interceptions', 'INT', SECONDARY, 8, 0.35],
];

function hash(text) {
  let value = 2166136261;
  for (const char of text) value = Math.imul(value ^ char.charCodeAt(0), 16777619);
  return value >>> 0;
}

function noise(seed) { return hash(seed) / 4294967295; }
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const round = value => Math.round(value * 100) / 100;

function mockLeaders(season, week, phase, teams) {
  if (week === 0) return {
    status: 'not-started', note: 'Mock preseason checkpoint; regular-season totals have not started.', categories: [],
  };
  const byAbbreviation = new Map(teams.map(t => [t.abbreviation, t.id]));
  return {
    status: 'ok',
    note: `SIMULATED ${season} player statistics, not actual historical results. Regular-season cumulative totals only.${phase === 'postseason' ? ' Frozen at week 18; postseason statistics are not added.' : ''}`,
    categories: CATEGORIES.map(([id, name, unit, roster, best, drop]) => ({
      id, name, unit,
      players: roster.map(([player, abbreviation], index) => {
        const final = Math.max(1, best - drop * index + (noise(`${id}:${player}`) - 0.5) * drop * 1.2);
        const increments = Array.from({ length: 18 }, (_, w) => 0.8 + noise(`${season}:${id}:${player}:${w}`) * 0.4);
        const share = increments.slice(0, Math.min(week, 18)).reduce((a, b) => a + b, 0) / increments.reduce((a, b) => a + b, 0);
        const precision = id === 'sacks' ? 2 : 1;
        return {
          id: `mock-${hash(player)}`, name: player, teamId: byAbbreviation.get(abbreviation),
          value: Math.floor(final * share * precision) / precision,
        };
      }).sort((a, b) => b.value - a.value || a.name.localeCompare(b.name)).slice(0, 10),
    })),
  };
}

function mockProjections(season, regularWeek, postWeek, teams) {
  const progress = regularWeek / 18;
  const projections = {};
  const strength = team => Math.exp((FINAL_WINS[team.abbreviation] - 8.5) / 2.6);
  for (const team of teams) {
    const final = FINAL_WINS[team.abbreviation];
    const initial = final + (noise(`${season}:${team.id}:wins`) - 0.5) * 2.5;
    projections[team.id] = {
      wins: round(clamp(initial * (1 - progress) + final * progress + Math.sin(regularWeek / 3 + Number(team.id)) * 0.5 * (1 - progress), 0, 17)),
    };
  }
  for (const conference of ['AFC', 'NFC']) {
    const group = teams.filter(t => t.conference === conference);
    const weights = group.map(team => {
      if (postWeek > 0 && !REMAINING[postWeek].has(team.abbreviation)) return 0;
      if (regularWeek === 18 && !PLAYOFF_TEAMS.has(team.abbreviation)) return 0;
      const drift = 1 + Math.sin(Number(team.id) * 0.7 + regularWeek * 0.6) * 0.22 * (1 - progress);
      return strength(team) * drift * (PLAYOFF_TEAMS.has(team.abbreviation) ? 1 : (1 - progress) ** 2);
    });
    const chances = normalizePercentages(weights);
    group.forEach((team, i) => { projections[team.id].conference = chances[i]; });
    for (const division of ['East', 'North', 'South', 'West']) {
      const members = group.filter(t => t.division === division);
      const divisionChances = normalizePercentages(members.map(team =>
        strength(team) * (1 - progress) ** 2 + (DIVISION_WINNERS.has(team.abbreviation) ? 10 * progress ** 2 : 0)));
      members.forEach((team, i) => { projections[team.id].division = divisionChances[i]; });
    }
  }
  const title = normalizePercentages(teams.map(team => postWeek === 5
    ? Number(team.abbreviation === 'PHI')
    : projections[team.id].conference * (team.conference === 'NFC' ? 0.54 : 0.46)));
  teams.forEach((team, i) => {
    const initial = clamp(8 + (FINAL_WINS[team.abbreviation] - 4) * 8.3, 3, 93);
    const final = PLAYOFF_TEAMS.has(team.abbreviation) ? 100 : 0;
    const playoffs = round(clamp(initial * (1 - progress) + final * progress +
      Math.sin(regularWeek * 0.5 + Number(team.id)) * 4 * (1 - progress), 0, 100));
    projections[team.id].playoffs = Math.max(playoffs, projections[team.id].division, projections[team.id].conference);
    projections[team.id].superBowl = title[i];
  });
  return projections;
}

export function createMockSeason(season = 2025, teams = TEAMS) {
  if (season !== 2025) throw new Error('This explicitly authored mocked history is only for season 2025');
  const startsAt = '2025-09-05T00:20:00.000Z';
  const data = {
    schemaVersion: 1, season, kind: 'mock', startsAt,
    teams: structuredClone(teams),
    sources: [{ ...SOURCES[0], description: 'SIMULATED ESPN-style forecast trajectories for 2025. Entire season and all player statistics are mocked, deterministic, and not fully accurate. Not actual ESPN historical forecasts, standings, results or betting odds.' }],
    snapshots: [],
  };
  const makeSnapshot = (date, phase, week, regularWeek, postWeek, label) => {
    const capturedAt = new Date(date).toISOString();
    data.snapshots.push({
      id: snapshotId(season, capturedAt), capturedAt, season, phase, week,
      label: `${label} · mocked`,
      sources: {
        'espn-fpi': {
          status: 'ok',
          note: `MOCKED, NOT FULLY ACCURATE: deterministic illustrative ${season} projections. Dates describe simulated checkpoints, not actual provider captures. Philadelphia is the fictional champion in this scenario.`,
          projections: mockProjections(season, regularWeek, postWeek, teams),
        },
      },
      leaders: mockLeaders(season, regularWeek, phase, teams),
    });
  };
  makeSnapshot('2025-08-27T14:15Z', 'preseason', null, 0, 0, 'Preseason');
  const first = Date.parse('2025-09-10T14:15Z');
  for (let week = 1; week <= 18; week++) {
    makeSnapshot(first + (week - 1) * 7 * 86_400_000, 'regular', week, week, 0, `Week ${week}`);
  }
  const names = ['Wild Card complete', 'Divisional round complete', 'Conference championships complete', 'Super Bowl bye week', 'Super Bowl complete'];
  for (let week = 1; week <= 5; week++) {
    makeSnapshot(first + (17 + week) * 7 * 86_400_000, 'postseason', week, 18, week, names[week - 1]);
  }
  return validateSeason(data);
}
