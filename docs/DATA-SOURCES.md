# NFL snapshot data: sources and operations

This app publishes static JSON, not a backend. Capture scripts use Node 22+ built-ins, public HTTPS endpoints, and no API keys. Provider access was tested on **September 8, 2026**. Public reachability is not a promise of continued availability, redistribution rights, an official supported API, or commercial licensing. Respect providers' terms, attribution requirements, and rate limits.

## What was actually captured

`public/data/seasons/2026.json` contains **one real snapshot**, captured **2026-09-08T16:56:42.327Z**, with 32 teams. No current-year history was invented.

| Source | Observed result | Persisted coverage |
| --- | --- | --- |
| ESPN FPI | HTTP 200; `requestedSeason.year`, `currentSeason.year`, and `currentValues.season` explicitly report **2026**. `lastUpdated` is **2026-08-31T14:44Z**. | All 32 teams, all five metrics. An **8-day delayed-provider warning** is retained. |
| DraftKings sportsbook, syndicated by ESPN | HTTP 200; 23 futures markets, including 11 supported team markets. Each accepted market and team reference includes `/seasons/2026/`. | All 32 teams: Super Bowl, conference, and division probabilities. No playoff probability or expected wins available. |
| ESPN team metadata | HTTP 200; all 32 teams. | Team names, abbreviations, primary/alternate colors and logo links; canonical conference/division membership is maintained locally. |
| ESPN 2026 regular-season leaders | HTTP 404: `No stats found.` | `leaders.status: "not-started"`, empty categories, explicit note. Not filled with 2025 or preseason statistics. |
| ESPN schedule/calendar | HTTP 200. Calendar calls September 6 the start of its regular-season week bucket; the first actual regular-season event begins **2026-09-10T00:20Z**. | Snapshot phase **preseason**, `week: null`, `startsAt: "2026-09-10T00:20:00.000Z"`. This is **Wednesday September 9 in U.S. time zones**, not Thursday locally. |
| Polymarket Gamma research probe | HTTP 200 and `[]` at `https://gamma-api.polymarket.com/events?slug=super-bowl-champion-2027`. | No usable market was discovered by that exact slug probe. No Polymarket source or values were invented. Empty results do **not** establish that Polymarket has no NFL markets. |

The second source is genuinely accessible **sportsbook data**, not another FPI rendering. Although both adapters access ESPN infrastructure, their economic origin and interpretation differ: ESPN simulation forecasts versus DraftKings prices. The application does not scrape DraftKings or bypass geographic restrictions.

A separate, non-persisting verification of ESPN's **2025** `types/2/leaders` endpoint resolved **16 categories with ten named players each**, including all six required yardage/touchdown categories. This tested reference resolution only. Those actual 2025 statistics were **not** used in the mocked archive.

## Provider endpoints and field mapping

### ESPN FPI — `espn-fpi`, `kind: "forecast"`

- JSON: <https://site.web.api.espn.com/apis/fitt/v3/sports/football/nfl/powerindex>
- Capture requests append `?season=2026` (or the active season).
- Attribution: <https://www.espn.com/nfl/fpi>
- Metadata: <https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams>

The adapter joins top-level `categories[].names` to each team's corresponding `categories[].values`; it does not hard-code array offsets.

| App metric | ESPN projection field | Meaning |
| --- | --- | --- |
| `superBowl` | `probwintitle` | Win the Super Bowl |
| `conference` | `probmaketitlegame` | Win AFC/NFC and reach the Super Bowl |
| `division` | `probwindiv` | Win the team's division |
| `playoffs` | `probmakeplayoffs` | Qualify for the playoffs |
| `wins` | `projectedw` | Expected regular-season wins |

`probmakeconfchamp` is **not** conference-winning probability. `probwinconf` is not substituted for the requested field. ESPN probabilities are already on a **0–100 percentage scale**; `projectedw` is on a 0–17 win scale. The raw captured FPI Super Bowl probabilities sum to **100.2%** because of upstream rounding. Those values are preserved; only complete division groups are normalized as required.

Season headers are explicitly checked. Absent, contradictory, or wrong-year headers produce `unavailable`, never relabeled older values. A provider update earlier than March 1 of the requested season is rejected to catch headers rolling forward before projections. Future-dated updates beyond a one-day tolerance are rejected. All-zero/uninitialized probability tables are rejected. Missing/invalid values remain `null`; valid partial results carry a warning. Provider updates seven or more days older than capture remain usable but are prominently marked delayed.

### DraftKings via ESPN — `draftkings`, `kind: "market"`

- JSON: <https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/seasons/2026/futures?limit=100>
- Attribution: <https://www.espn.com/nfl/futures>
- Only books whose `provider.name` is **DraftKings** are accepted.
- Only Super Bowl winner, conference winner, and division winner markets are mapped.
- “Team to win most games” is **not** an expected-wins forecast and is deliberately excluded.
- Award/player markets are excluded from team probabilities.

For American odds \(a\), raw percentage implied probability is:

- Positive odds: `10000 / (a + 100)`.
- Negative odds: `100 * (-a) / ((-a) + 100)`.
- `EVEN`: 50%.

Complete mutually exclusive groups are proportionally normalized: `100 * rawProbability / sum(rawProbabilities)`. Super Bowl has 32 outcomes; each conference has 16; each division has four. This removes the displayed overround **by a modeling assumption**, not by identifying objective fair probabilities. Markets can be stale, include liability adjustments, and disagree internally across independently priced outcomes.

Observed raw sums and overround at capture:

| Market | Raw implied sum | Overround, percentage points |
| --- | ---: | ---: |
| Super Bowl | 122.18% | 22.18 |
| AFC | 114.98% | 14.98 |
| NFC | 114.81% | 14.81 |
| AFC East / North / South / West | 109.51 / 108.32 / 107.92 / 108.54% | 9.51 / 8.32 / 7.92 / 8.54 |
| NFC East / North / South / West | 108.83 / 108.65 / 108.27 / 108.65% | 8.83 / 8.65 / 8.27 / 8.65 |

Exact values/notes live with each snapshot. If a group is incomplete, known values stay **raw implied percentages**, omitted teams stay missing, and the note says **not normalized**. Never compare an incomplete raw market to a complete de-vigged market without reading the note.

Future capture notes summarize raw implied sums by market class rather than listing all 11 complete markets; this keeps the normal sportsbook note below 650 characters before schedule provenance is appended. The first September 8 snapshot retains its original detailed note because snapshot history is immutable. A dashboard may put long historical notes in an expandable disclosure, but should keep delay/availability status visible.

The futures endpoint supplied **no verified odds observation timestamp**. `observedAt` is omitted, rather than falsely set to capture time. The season-specific URL/ref proves season scope, **not freshness**. Playoffs and wins are absent, not zero.

### ESPN regular-season leaders

- <https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/seasons/2026/types/2/leaders?limit=10>
- Season type **2** means regular season. No preseason or postseason totals are mixed in.
- Required categories: `passingYards`, `passingTouchdowns`, `rushingYards`, `rushingTouchdowns`, `receivingYards`, `receivingTouchdowns`.
- Other returned categories are retained, prioritizing the required six, up to a safety limit of 24 categories and ten players per category.
- Athlete refs resolve to provider player IDs and display names; season-specific team refs map to canonical ESPN team IDs.
- Failed individual athlete resolutions are omitted and counted in a partial-data note; they are not anonymous fabricated players.
- Before kickoff, status is `not-started`. After kickoff, failure/no valid statistics is `unavailable`. Valid partial data is `ok` with a note.
- After the regular season, only the `types/2` endpoint is queried. Totals therefore do not add postseason statistics, although ESPN may still make official corrections to regular-season totals.

### Schedule/calendar

<https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=2026&seasontype=2&week=1&limit=100>

The earliest validated season-type-2 opening-week event determines `startsAt`; calendar entries determine regular/postseason week numbers and postseason boundaries. Broad calendar week buckets do not override actual kickoff. When this lookup cannot provide a validated event, the explicit approximate fallback is the **first Thursday after Labor Day**, with 18 regular weeks and a five-week postseason if calendar boundaries are absent. Fallback status is written in snapshot source notes. This approximation is not an authoritative NFL schedule.

### Polymarket research

- Public API documentation: <https://docs.polymarket.com/>
- Gamma endpoint attempted: <https://gamma-api.polymarket.com/events?slug=super-bowl-champion-2027>
- Result on September 8, 2026: successful HTTP request, empty JSON array.

There was no need to assume another slug, use private keys, purchase data, bypass access controls, or present unsupported Gamma values after the ESPN-syndicated sportsbook endpoint succeeded. No Gamma call is made on routine capture runs.

## JSON contract and UI integration

The exact interfaces are defined in `src/types.ts`, unchanged by the pipeline.

- `public/data/manifest.json`: `schemaVersion: 1`, numeric `currentSeason`, actual `generatedAt`, and newest-year-first `seasons`.
- `SeasonEntry.file` is relative to the data directory: **`seasons/2026.json`**, not `/public/data/...`.
- Each season file contains `schemaVersion`, `season`, `kind`, `startsAt`, `teams`, `sources`, and chronological `snapshots`.
- Team IDs are ESPN string IDs, not abbreviations. Player `teamId` uses the same IDs.
- Source definitions contain descriptions/links and supported metric lists. `espn-fpi` supports five metrics; `draftkings` supports three.
- Every snapshot contains a `leaders` object, even when it has no categories.
- Snapshot `id` is **`<season>-<UTC date>`**, e.g. `2026-2026-09-08`. A January snapshot for the preceding season uses that season plus the January calendar date.
- `capturedAt` is actual collection time for live data; optional source `observedAt` is provider-reported time only.
- Missing metrics may be **absent or null**. Treat both as missing; do not coerce to zero.
- `unavailable` sources have an empty `projections` object and an explanation. The source remains selectable so outages are visible.
- `status: "ok"` does not guarantee completeness or freshness: always surface `note`.
- `startsAt` is regular-season kickoff, not the start of preseason.
- Phases are `preseason`, `regular`, `postseason`, and `offseason`; regular weeks are 1–18; postseason weeks follow ESPN's 1–5 calendar convention, including its Pro Bowl/bye bucket.

Complete, valid nonzero division groups normalize to 100% using largest-remainder allocation in hundredths. Missing groups are not filled. A complete all-zero division becomes all-null, not 25% each. A tiny binary floating-point residual is assigned to the last nonzero member; consumers should display sensible precision and compare sums using a small epsilon rather than assuming all possible summation orders are bit-identical.

## Capture commands and cadence

Run from the repository root with Node 22 or newer. No dependency installation is needed.

```powershell
node scripts\capture.mjs
node scripts\capture.mjs --season=2026
node scripts\capture.mjs --season 2026
node scripts\capture.mjs --scheduled
node scripts\seed-mock.mjs
node --test tests/*.test.mjs
```

`package.json` aliases can call `node scripts/capture.mjs` and `node scripts/seed-mock.mjs`. JSON/URL paths use forward slashes; the PowerShell examples above use Windows filesystem separators.

- Default season: calendar year **March–December**, previous year **January–February**, using UTC.
- Live `--season` must equal that active season. This flag makes the intended year explicit; it does not request historical backfill.
- No `--date` option: fetching today's values and assigning a past capture date would fabricate history. The exported function's injected clock/client are for tests, not a historical-data API.
- Normal capture is manual/forced with respect to cadence; it **cannot overwrite** an existing daily snapshot.
- Scheduler configuration should run **Wednesdays at 14:15 UTC**, cron `15 14 * * 3`, and invoke `--scheduled`.
- `shouldCapture(date, phase)` is exported from both `scripts/data-core.mjs` and `scripts/capture.mjs`: Wednesdays weekly during `regular`/`postseason`; first Wednesday of each month during `preseason`/`offseason`. The scheduler owns the 14:15 time; the function gates the day.
- On September 9, 2026 at 14:15 UTC the kickoff is still ahead, so the scheduled preseason gate skips that run (not the month's first Wednesday). The next regular-season scheduled point is September 16. The already-persisted September 8 manual point is the honest pre-kickoff baseline.
- `deriveSeasonMetadata()` returns `startsAt`, `phase`, `week`, and a schedule-provenance `note`; capture prints this JSON before running the gate.

Use a single workflow concurrency group for captures/publishing. Provider outages are represented in valid data and do not fail the process by themselves. Structural validation, filesystem errors, conflicting live/mock seasons, invalid arguments, and concurrent writer locks fail with a nonzero exit status.

## Persistence, safety, and retries

1. Fetch only allowlisted provider hosts. Upgrade ESPN `http` refs to HTTPS; reject credentials, unusual ports, other protocols, unknown hosts, and redirects.
2. Bound each fetch at **15 seconds** and **8 MiB**. Resolve refs with **six workers**; share a per-capture promise cache. Inspect at most 100 futures and 24 leader categories. If ESPN adds futures pages beyond the inspected page, a note discloses it.
3. Isolate FPI, sportsbook, and leaders errors. Team/color metadata can retain prior or bundled canonical metadata with a warning; live projections never fall back to mocks.
4. Validate schema, team/source identities, dates, sorted unique snapshot days, value ranges, leader rankings, and complete division sums before writing.
5. Use a `.capture.lock` exclusive writer lock in the data directory. Write each JSON to a sibling uniquely named `.pending` file, flush it, then atomically rename. No system temporary directory is used.
6. Preserve existing snapshot objects when merging. A rerun for the same season and UTC day performs no provider retry and changes no snapshot, even if that day's first attempt was unavailable. This strict policy also prevents an unsuccessful retry from replacing successful data.
7. Publish season JSON before its manifest. Each file is atomic, not a two-file transaction. After an interrupted write, a rerun repairs/rebuilds the manifest from validated season files. Existing season JSON corruption fails loudly rather than discarding history.

The manifest's `generatedAt` may advance during an idempotent run; the season history remains byte-identical. A hard process termination can leave the lock or a `.pending` sibling; investigate the specific stored PID/active workflow before removing only that abandoned lock/pending file. Do not blindly delete locks while another writer runs. Regular exceptions clean up their lock and pending file automatically.

## Explicitly mocked 2025 archive

`public/data/seasons/2025.json` has:

- **`kind: "mock"`** and manifest label **`2025 — mocked — not fully accurate`**.
- 24 deterministic checkpoints: one preseason, regular weeks 1–18, and five postseason checkpoints through the Super Bowl.
- All 32 teams and all five simulated metrics at every checkpoint.
- Division sums of 100%, each conference sum of 100%, and Super Bowl sum of 100%.
- Illustrative playoff progression: 14 qualifiers, eight division winners, successive eliminations, two conference champions, and a **fictional Philadelphia Super Bowl champion**. This is not a claim about actual 2025 results.
- Final regular wins total 272 across teams, representing a plausible 17-game no-tie schedule. Expected wins fluctuate toward these invented outcomes.
- Ten top-ten cumulative statistical categories, with diverse known player names: the required six plus receptions, sacks, tackles, and interceptions.
- Deterministic, nondecreasing individual cumulative totals across the regular season; identical week-18 statistical categories in every postseason checkpoint.
- Source/leader/snapshot notes identifying simulation. Mock checkpoint timestamps describe simulated dates, not historical collection events.

Only an ESPN-style simulated source is seeded, not fabricated historical sportsbook odds. Running the seed repeatedly preserves existing history; the pipeline refuses to replace a live season with a mock season or vice versa.

## Validation

The data tests were written before implementation and first failed because the new modules did not exist. A subsequent stale-provider-timestamp regression was observed failing before its guard was added.

Coverage includes adapters and missing values, stale season/timestamps, all-zero projections, exact division allocation, American odds and overround, malformed references, bounded concurrency/response size/timeout/cache, real leader-shaped reference fixtures, calendar and season rollover, scheduled/manual capture behavior, outage isolation, schema sanity, immutable retries, atomic persistence, deterministic mock coverage, playoff resolution, and cumulative regular-season statistics.

Run all project tests with `node --test tests/*.test.mjs`. Provider probing is not part of those deterministic tests; the persisted live values and this observation record are the evidence of the real capture.
