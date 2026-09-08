import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createMockSeason } from './mock-data.mjs';
import { parseArgs, readJson, seasonForDate, writeSeason } from './data-core.mjs';

export async function seedMock({ season = 2025, root = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'data'), now = new Date() } = {}) {
  const live = await readJson(join(root, 'seasons', `${seasonForDate(now)}.json`));
  const data = createMockSeason(season, live?.teams);
  const saved = await writeSeason(root, data, seasonForDate(now), now);
  console.log(`Persisted ${saved.snapshots.length} deterministic mock snapshots for ${season}, ${saved.teams.length} teams, ${saved.snapshots.at(-1).leaders.categories.length} top-ten categories. NOT actual historical data.`);
  return saved;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = parseArgs(process.argv.slice(2));
  if (args.scheduled) throw new Error('--scheduled applies to live capture, not the deterministic mock seed.');
  seedMock(args).catch(error => { console.error(`Mock seed failed: ${error.message}`); process.exitCode = 1; });
}
