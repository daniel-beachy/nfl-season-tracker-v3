import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { appendSnapshot, deriveSeasonMetadata, parseArgs, readJson, seasonForDate, shouldCapture, snapshotId, validateSeason, writeSeason } from './data-core.mjs';
import { TEAMS, adaptTeams } from './teams.mjs';
import { SOURCES, URLS, adaptFpi, fetchFutures, fetchLeaders, isolatedSource, loadFutures } from './providers.mjs';
import { fetchAwards } from './awards.mjs';
import { createHttpClient } from './http.mjs';

export { shouldCapture, seasonForDate, deriveSeasonMetadata } from './data-core.mjs';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'data');

export async function capture({ season, scheduled = false, now = new Date(), root = ROOT, get = createHttpClient() } = {}) {
  season ??= seasonForDate(now);
  if (season !== seasonForDate(now)) {
    throw new Error(`Live capture supports the current NFL season ${seasonForDate(now)} only; --season ${season} cannot create historical live data.`);
  }
  let schedule;
  let scheduleWarning = '';
  try { schedule = await get(URLS.scoreboard(season)); }
  catch (error) { scheduleWarning = ` ESPN schedule lookup failed: ${error.message}.`; }
  const metadata = deriveSeasonMetadata(season, now, schedule);
  console.log(JSON.stringify({ season, phase: metadata.phase, week: metadata.week, startsAt: metadata.startsAt, scheduled, schedule: metadata.note + scheduleWarning }));
  if (scheduled && !shouldCapture(now, metadata.phase)) {
    console.log('Capture skipped by cadence gate: Wednesdays weekly in regular/postseason, first Wednesday monthly otherwise.');
    return { skipped: true, reason: 'cadence', metadata };
  }
  const existing = await readJson(join(root, 'seasons', `${season}.json`));
  if (existing) {
    validateSeason(existing);
    if (existing.kind !== 'live') throw new Error(`Season ${season} is mocked; refusing to relabel it as live.`);
    if (existing.snapshots.some(s => s.id === snapshotId(season, now))) {
      await writeSeason(root, existing, seasonForDate(now), now);
      console.log(`Existing immutable snapshot ${snapshotId(season, now)} preserved; no provider data replaced.`);
      return { skipped: true, reason: 'existing', metadata, data: existing };
    }
  }
  let teams = existing?.teams ?? structuredClone(TEAMS);
  let teamWarning = '';
  try { teams = adaptTeams(await get(URLS.teams)); }
  catch (error) { teamWarning = ` Team metadata unavailable (${error.message}); ${existing ? 'previously captured' : 'bundled canonical'} identity/color metadata retained; probabilities are not substituted.`; }
  const futures = loadFutures(season, get);
  const [fpi, draftkings, leaders, awards] = await Promise.all([
    isolatedSource('ESPN FPI', async () => adaptFpi(await get(`${URLS.fpi}?season=${season}`), teams, season, now)),
    isolatedSource('DraftKings via ESPN', () => fetchFutures(season, teams, get, futures)),
    fetchLeaders(season, metadata, teams, get),
    fetchAwards(season, teams, get, futures),
  ]);
  for (const source of [fpi, draftkings]) source.note = `${source.note} ${metadata.note}${scheduleWarning}${teamWarning}`;
  const snapshot = {
    id: snapshotId(season, now), capturedAt: now.toISOString(), season,
    phase: metadata.phase, week: metadata.week,
    label: metadata.phase === 'regular' ? `Week ${metadata.week}` :
      metadata.phase === 'postseason' ? `Postseason week ${metadata.week}` : metadata.phase === 'preseason' ? 'Preseason' : 'Offseason',
    sources: { 'espn-fpi': fpi, draftkings }, leaders, awards: { draftkings: awards },
  };
  const data = existing ? { ...existing, teams, sources: structuredClone(SOURCES), startsAt: metadata.startsAt } : {
    schemaVersion: 1, season, kind: 'live', startsAt: metadata.startsAt,
    teams, sources: structuredClone(SOURCES), snapshots: [],
  };
  appendSnapshot(data, snapshot);
  const persisted = await writeSeason(root, data, seasonForDate(now), now);
  console.log(JSON.stringify({
    file: `public/data/seasons/${season}.json`, snapshots: persisted.snapshots.length, teams: teams.length,
    sources: Object.fromEntries(Object.entries(snapshot.sources).map(([id, source]) => [id, {
      status: source.status, teams: Object.keys(source.projections).length, observedAt: source.observedAt ?? null, note: source.note,
    }])),
    leaders: { status: leaders.status, categories: leaders.categories.length, note: leaders.note },
    awards: { status: awards.status, categories: awards.categories.length, note: awards.note },
  }, null, 2));
  return { skipped: false, data: persisted, metadata };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  capture(parseArgs(process.argv.slice(2))).catch(error => { console.error(`Capture failed: ${error.message}`); process.exitCode = 1; });
}
