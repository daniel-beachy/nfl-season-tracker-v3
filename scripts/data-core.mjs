import { mkdir, open, readFile, readdir, rename, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { isAwards } from '../src/lib/awards.mjs';

export const METRICS = ['superBowl', 'conference', 'division', 'playoffs', 'wins'];
const PHASES = ['preseason', 'regular', 'postseason', 'offseason'];
const DAY = 86_400_000;

export function normalizePercentages(values) {
  if (!values.length || values.some(v => typeof v !== 'number' || !Number.isFinite(v) || v < 0)) return null;
  const total = values.reduce((a, b) => a + b, 0);
  if (!(total > 0)) return null;
  const exact = values.map(v => v / total * 10000);
  const units = exact.map(Math.floor);
  const remaining = 10000 - units.reduce((a, b) => a + b, 0);
  const priority = exact.map((value, i) => ({ i, fraction: value - units[i] }))
    .sort((a, b) => b.fraction - a.fraction || a.i - b.i);
  for (let i = 0; i < remaining; i++) units[priority[i].i]++;
  const result = units.map(v => v / 100);
  // A final binary floating-point residual keeps JavaScript group sums exactly 100.
  const last = result.findLastIndex(v => v > 0);
  result[last] = 100 - result.slice(0, last).reduce((a, b) => a + b, 0);
  return result;
}

export function normalizeDivisions(projections, teams) {
  for (const conference of ['AFC', 'NFC']) {
    for (const division of ['East', 'North', 'South', 'West']) {
      const group = teams.filter(t => t.conference === conference && t.division === division);
      if (group.length !== 4) continue;
      const values = group.map(t => projections[t.id]?.division);
      if (values.some(v => typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 100)) continue;
      const normalized = normalizePercentages(values);
      group.forEach((team, i) => { projections[team.id].division = normalized?.[i] ?? null; });
    }
  }
  return projections;
}

export function seasonForDate(date = new Date()) {
  return date.getUTCFullYear() - (date.getUTCMonth() < 2 ? 1 : 0);
}

export function shouldCapture(date, phase, startsAt, endsAt) {
  if (!Number.isFinite(date.getTime()) || !PHASES.includes(phase)) return false;
  const untilKickoff = Date.parse(startsAt) - +date;
  const afterSeason = +date - Date.parse(endsAt);
  if ((phase === 'preseason' || phase === 'offseason') && date.getUTCMonth() <= 8 && date.getUTCDate() === 1) return true;
  return date.getUTCDay() === 2 &&
    (phase === 'regular' || phase === 'postseason' ||
      untilKickoff > 0 && untilKickoff <= 7 * DAY || afterSeason >= 0 && afterSeason < 7 * DAY);
}

export function fallbackKickoff(season) {
  const first = new Date(Date.UTC(season, 8, 1));
  const laborDay = 1 + (8 - first.getUTCDay()) % 7;
  return new Date(Date.UTC(season, 8, laborDay + 3));
}

function dateValue(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? Date.parse(value) : null;
}

export function deriveSeasonMetadata(season, now = new Date(), scoreboard = null) {
  const league = scoreboard?.leagues?.find(l => Number(l.season?.year) === season);
  const calendar = league?.calendar ?? [];
  const regular = calendar.find(c => String(c.value) === '2');
  const postseason = calendar.find(c => String(c.value) === '3');
  const preseason = calendar.find(c => String(c.value) === '1');
  const kickoffEvents = (scoreboard?.events ?? []).filter(e =>
    Number(e.season?.year) === season && Number(e.season?.type) === 2 && dateValue(e.date) !== null);
  const kickoff = kickoffEvents.length ? Math.min(...kickoffEvents.map(e => Date.parse(e.date))) : +fallbackKickoff(season);
  const postStart = dateValue(postseason?.startDate) ?? kickoff + 18 * 7 * DAY;
  const postEnd = dateValue(postseason?.endDate) ?? postStart + 35 * DAY;
  const preStart = dateValue(preseason?.startDate) ?? Date.UTC(season, 7, 1);
  const time = +now;
  const phase = time >= postEnd ? 'offseason' : time >= postStart ? 'postseason' :
    time >= kickoff ? 'regular' : time >= preStart ? 'preseason' : 'offseason';
  const period = phase === 'regular' ? regular : phase === 'postseason' ? postseason : null;
  const entry = period?.entries?.find(e => time >= Date.parse(e.startDate) && time <= Date.parse(e.endDate));
  const approximateWeek = phase === 'regular' ? Math.min(18, Math.floor((time - kickoff) / (7 * DAY)) + 1) :
    phase === 'postseason' ? Math.min(5, Math.floor((time - postStart) / (7 * DAY)) + 1) : null;
  return {
    startsAt: new Date(kickoff).toISOString(),
    endsAt: new Date(postEnd).toISOString(),
    phase,
    week: entry ? Number(entry.value) : approximateWeek,
    note: kickoffEvents.length
      ? `Season ${season} kickoff from ESPN's first regular-season event; week boundaries from ESPN calendar where available.`
      : `Approximate schedule fallback: first Thursday after Labor Day ${season}; real kickoff may differ. Calendar unavailable or no validated opening event.`,
  };
}

export function snapshotId(season, date) {
  return `${season}-${new Date(date).toISOString().slice(0, 10)}`;
}

export function appendSnapshot(season, snapshot) {
  if (season.season !== snapshot.season) throw new Error('Snapshot season mismatch');
  const key = snapshotId(snapshot.season, snapshot.capturedAt);
  if (season.snapshots.some(s => snapshotId(s.season, s.capturedAt) === key)) return { appended: false, season };
  season.snapshots.push({ ...snapshot, id: key });
  season.snapshots.sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
  return { appended: true, season };
}

const requireValid = (condition, message) => { if (!condition) throw new Error(`Invalid data: ${message}`); };
const isDate = value => dateValue(value) !== null;
const isText = value => typeof value === 'string' && value.length > 0;

export function validateSeason(data) {
  requireValid(data?.schemaVersion === 1, 'schemaVersion');
  requireValid(Number.isInteger(data.season) && data.season >= 2002 && data.season <= 2100, 'season');
  requireValid(['live', 'mock'].includes(data.kind) && isDate(data.startsAt), 'kind or startsAt');
  requireValid(Array.isArray(data.teams) && data.teams.length === 32, '32 teams required');
  const teamIds = new Set(data.teams.map(t => t.id));
  requireValid(teamIds.size === 32, 'duplicate team IDs');
  for (const team of data.teams) {
    requireValid(isText(team.id) && isText(team.name) && isText(team.shortName) && isText(team.abbreviation), 'team identity');
    requireValid(['AFC', 'NFC'].includes(team.conference) && ['East', 'North', 'South', 'West'].includes(team.division), 'team alignment');
    requireValid(/^#[0-9a-f]{6}$/i.test(team.color) && /^#[0-9a-f]{6}$/i.test(team.alternateColor), 'team colors');
  }
  for (const conference of ['AFC', 'NFC']) for (const division of ['East', 'North', 'South', 'West']) {
    requireValid(data.teams.filter(t => t.conference === conference && t.division === division).length === 4, 'division alignment');
  }
  requireValid(Array.isArray(data.sources) && data.sources.length > 0, 'sources');
  const sourceIds = new Set(data.sources.map(s => s.id));
  requireValid(sourceIds.size === data.sources.length, 'duplicate source');
  for (const source of data.sources) {
    requireValid(isText(source.id) && isText(source.name) && isText(source.description) && /^https:\/\//.test(source.url), 'source metadata');
    requireValid(['forecast', 'market'].includes(source.kind) && Array.isArray(source.metrics) && source.metrics.every(m => METRICS.includes(m)), 'source metrics');
    requireValid(source.awards === undefined || typeof source.awards === 'boolean', 'source awards capability');
  }
  requireValid(Array.isArray(data.snapshots), 'snapshots');
  const ids = new Set();
  let prior = '';
  for (const snapshot of data.snapshots) {
    requireValid(snapshot.season === data.season && isDate(snapshot.capturedAt), 'snapshot season or date');
    const id = snapshotId(data.season, snapshot.capturedAt);
    requireValid(!ids.has(id), 'duplicate snapshot UTC date');
    ids.add(id);
    requireValid(snapshot.id === id && snapshot.capturedAt >= prior, 'snapshot ID or chronological order');
    prior = snapshot.capturedAt;
    if (snapshot.awards !== undefined) requireValid(isAwards(snapshot.awards, [...sourceIds], [...teamIds], data.startsAt), 'awards snapshot');
    requireValid(PHASES.includes(snapshot.phase) && isText(snapshot.label), 'snapshot phase or label');
    requireValid(snapshot.note === undefined || isText(snapshot.note), 'snapshot note');
    requireValid(snapshot.week === null || Number.isInteger(snapshot.week) && snapshot.week >= 1 && snapshot.week <= 18, 'snapshot week');
    requireValid(snapshot.sources && Object.keys(snapshot.sources).length > 0, 'snapshot sources');
    for (const [sourceId, source] of Object.entries(snapshot.sources)) {
      requireValid(sourceIds.has(sourceId) && ['ok', 'unavailable'].includes(source.status), 'source status or ID');
      requireValid(source.observedAt === undefined || isDate(source.observedAt), 'provider observedAt');
      requireValid(source.projections && typeof source.projections === 'object' && !Array.isArray(source.projections), 'projections');
      let values = 0;
      for (const [teamId, projection] of Object.entries(source.projections)) {
        requireValid(teamIds.has(teamId) && projection && typeof projection === 'object', 'projection team ID');
        for (const [metric, value] of Object.entries(projection)) {
          requireValid(METRICS.includes(metric), 'metric');
          if (value === null) continue;
          requireValid(typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= (metric === 'wins' ? 17 : 100), `${metric} probability or wins range`);
          values++;
        }
      }
      requireValid(source.status !== 'ok' || values > 0, 'ok source without values');
      requireValid(source.status !== 'unavailable' || Object.keys(source.projections).length === 0, 'unavailable source must not contain projections');
      for (const conference of ['AFC', 'NFC']) for (const division of ['East', 'North', 'South', 'West']) {
        const group = data.teams.filter(t => t.conference === conference && t.division === division).map(t => source.projections[t.id]?.division);
        if (group.every(v => typeof v === 'number')) requireValid(Math.abs(group.reduce((a, b) => a + b, 0) - 100) < 1e-8, 'complete division probabilities must sum to 100');
      }
    }
    const leaders = snapshot.leaders;
    requireValid(leaders && ['ok', 'unavailable', 'not-started'].includes(leaders.status) && Array.isArray(leaders.categories), 'leaders');
    requireValid(leaders.status === 'ok' ? leaders.categories.length > 0 : leaders.categories.length === 0, 'leaders status/categories');
    const categoryIds = new Set();
    for (const category of leaders.categories) {
      requireValid(isText(category.id) && !categoryIds.has(category.id) && isText(category.name) && isText(category.unit), 'leader category');
      categoryIds.add(category.id);
      requireValid(Array.isArray(category.players) && category.players.length > 0 && category.players.length <= 10, 'leader top ten');
      const playerIds = new Set();
      let previous = Infinity;
      for (const player of category.players) {
        requireValid(isText(player.id) && isText(player.name) && teamIds.has(player.teamId) && !playerIds.has(player.id), 'leader player identity');
        requireValid(Number.isFinite(player.value) && player.value >= 0 && player.value <= previous, 'leader values or ranking');
        previous = player.value;
        playerIds.add(player.id);
      }
    }
  }
  return data;
}

export function parseArgs(argv) {
  const args = { scheduled: false };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === '--scheduled') args.scheduled = true;
    else if (flag === '--season' || flag.startsWith('--season=')) {
      const value = flag === '--season' ? argv[++i] : flag.slice(9);
      if (!/^\d{4}$/.test(value ?? '') || Number(value) < 2002 || Number(value) > 2100) throw new Error('Invalid --season; expected a year from 2002 to 2100');
      args.season = Number(value);
    } else throw new Error(`Unknown option ${flag}; supported: --season YEAR, --scheduled. --date is deliberately unsupported: capture time is real.`);
  }
  return args;
}

export async function readJson(file) {
  try { return JSON.parse(await readFile(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

async function atomicJson(file, value) {
  const text = `${JSON.stringify(value, null, 2)}\n`;
  try { if (await readFile(file, 'utf8') === text) return; } catch (error) { if (error.code !== 'ENOENT') throw error; }
  await mkdir(dirname(file), { recursive: true });
  const pending = `${file}.${process.pid}.${randomUUID()}.pending`;
  try {
    const handle = await open(pending, 'wx');
    try { await handle.writeFile(text); await handle.sync(); } finally { await handle.close(); }
    await rename(pending, file);
  } finally { await rm(pending, { force: true }); }
}

export async function writeSeason(root, incoming, currentSeason, now = new Date()) {
  validateSeason(incoming);
  await mkdir(root, { recursive: true });
  const lockFile = join(root, '.capture.lock');
  let lock;
  try { lock = await open(lockFile, 'wx'); }
  catch (error) { if (error.code === 'EEXIST') throw new Error('Another capture holds public/data/.capture.lock; do not run captures concurrently.'); throw error; }
  try {
    await lock.writeFile(JSON.stringify({ pid: process.pid, startedAt: now.toISOString() }));
    const file = join(root, 'seasons', `${incoming.season}.json`);
    const existing = await readJson(file);
    let data = structuredClone(incoming);
    if (existing) {
      validateSeason(existing);
      if (existing.kind !== incoming.kind) throw new Error('Cannot replace live season with mock data or vice versa');
      data.snapshots = structuredClone(existing.snapshots);
      for (const snapshot of incoming.snapshots) appendSnapshot(data, snapshot);
    }
    validateSeason(data);
    await atomicJson(file, data);
    const entries = [];
    for (const name of await readdir(join(root, 'seasons'))) {
      if (!/^\d{4}\.json$/.test(name)) continue;
      const season = validateSeason(await readJson(join(root, 'seasons', name)));
      const latest = season.snapshots.at(-1);
      entries.push({
        year: season.season,
        label: season.kind === 'mock' ? `${season.season} — mocked — not fully accurate` : `${season.season} — live`,
        kind: season.kind,
        phase: latest?.phase ?? deriveSeasonMetadata(season.season, now).phase,
        startsAt: season.startsAt,
        snapshotCount: season.snapshots.length,
        lastCapturedAt: latest?.capturedAt ?? null,
        file: `seasons/${name}`,
      });
    }
    entries.sort((a, b) => b.year - a.year);
    const selectedSeason = entries.some(entry => entry.year === currentSeason) ? currentSeason : incoming.season;
    if (selectedSeason !== currentSeason) console.warn(`NFL season ${currentSeason} has no saved file; the manifest selects available season ${selectedSeason} instead.`);
    await atomicJson(join(root, 'manifest.json'), {
      schemaVersion: 1, currentSeason: selectedSeason, generatedAt: now.toISOString(), seasons: entries,
    });
    return data;
  } finally {
    await lock.close();
    await rm(lockFile, { force: true });
  }
}
