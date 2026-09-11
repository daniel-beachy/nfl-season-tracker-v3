# NFL snapshot data: sources and operations

This app publishes static JSON, not a backend. Capture scripts use Node 22+ built-ins, public HTTPS endpoints, and no API keys. Provider access was tested on **September 8, 2026**. Public reachability is not a promise of continued availability, redistribution rights, an official supported API, or commercial licensing. Respect providers' terms, attribution requirements, and rate limits.

## What was actually captured

The 2026 starting point is **September Preseason**: the original team forecasts captured **2026-09-08T16:56:42.327Z**, with article-backed pre-opener award odds attached retrospectively. The September 11 partial capture was explicitly removed, not relabeled or copied into this baseline. The table below describes the original September 8 API capture.

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

Season headers are explicitly checked. Absent, contradictory, or wrong-year headers produce `unavailable`, never relabeled older values. A provider update earlier than January 1 of the requested season is rejected to catch headers rolling forward before projections; genuine January/February new-year updates are allowed. Future-dated updates beyond a one-day tolerance are rejected. All-zero/uninitialized probability tables are rejected. Missing/invalid values remain `null`; valid partial results carry a warning. Provider updates seven or more days older than capture remain usable but are prominently marked delayed.

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

### Award futures — added September 10, 2026 (U.S. time)

Awards share the keyless season-specific ESPN futures endpoint with the DraftKings team adapter. A single fetched/resolved futures payload is reused in each capture. Only DraftKings markets with a verified requested-season futures reference are accepted.

The displayed **September Preseason** baseline contains **45 verified candidate quotes across eight markets** reconstructed from September 8 publications. The original September 11 API observation was after kickoff and has been removed at the user's request; none of its prices were reused as preseason prices. The original September 8 team forecasts, leader status and capture timestamp remain unchanged, and the addition is explicitly disclosed at snapshot and Awards level.

| Award | Stable ID | Verified / published selections in baseline |
| --- | --- | --- |
| Most Valuable Player | `mvp` | 10 / 10 |
| Offensive Player of the Year | `opoy` | 5 / 5 |
| Defensive Player of the Year | `dpoy` | 5 / 5 |
| Offensive Rookie of the Year | `oroy` | 5 / 5 |
| Defensive Rookie of the Year | `droy` | 5 / 5 |
| Coach of the Year | `coy` | 2 / 5 |
| Comeback Player of the Year | `cpoy` | 6 / 6 |
| Protector of the Year | `protector` | 7 / 7 |

**Pre-opener evidence:** [DraftKings Network's preseason column](https://dknetwork.draftkings.com/2026/09/08/nfl-awards-odds/) was published `2026-09-08T17:10:00Z`, modified `2026-09-09T01:15:52Z`. [CBS Sports' editorial picks](https://www.cbssports.com/nfl/news/2026-nfl-mvp-odds-award-best-bets-joe-burrow-mvp/) were published `2026-09-08T21:30:00Z`, modified `2026-09-08T21:30:23Z`. Both independently quote **Drake Maye MVP +1000**, and both revision timestamps precede Seattle-New England kickoff at `2026-09-10T00:20:00Z`. These are publisher-dated pages verified retrospectively, not independent archival captures or exact closing prices.

DraftKings supplies the MVP/OPOY/DPOY/OROY/DROY/CPOY baseline; CBS supplies selected Coach and Protector prices. Jesse Minter, Joe Brady and Liam Coen were omitted because compatible NFL candidate IDs could not be verified; their omission is disclosed. Counts describe published selections, **not the complete sportsbook board**. Candidate IDs are aligned with verified ESPN season records so subsequent automatic captures join the same time series. No exact March-September first-of-month 2026 evidence was established, so those historical months are not invented.

- Categories preserve American odds as numeric `americanOdds`, with `EVEN` represented by `+100`. `impliedProbability` uses the American-odds formulas above **without normalization**. All award categories declare `probabilityBasis: "raw-implied"`. Even a fully resolved listed field need not represent every possible candidate.
- Up to the strongest **50 valid quotes per award** are resolved, with a single **six-worker** pool across all categories and a shared candidate-reference cache. Capture notes disclose truncation, invalid/duplicate quotes, unresolved candidates, and missing markets. The dashboard plots the latest top ten and can show all captured candidates.
- Candidate IDs and names resolve from season-specific athlete references. Wrong-season refs, mismatched IDs, invalid odds, and failed resolutions are omitted, not replaced by placeholders or stale names.
- ESPN models Coach of the Year entries as athlete refs, sometimes to the coach's former playing record. Those records can carry a **wrong current coaching team**. Coach team IDs are therefore null and displayed as unverified; former team colors are not used. Missing/inactive player team metadata also remains null.
- There is no verified odds-update timestamp. Capture time is always the actual collection time, not a claim about the bookmaker's last update.
- Optional `Snapshot.awards` maps source IDs to `{status, note, categories}`. Source metadata declares `awards: true`; `Source.metrics` remains exclusively for team projections. Old snapshots without the optional property still validate and show an explicit not-captured state. Unavailable captures have empty categories and explanatory notes, never forward-filled values.
- Optional `awards[sourceId].provenance` records `kind: "published-preseason"`, a label, actual `addedAt`, and reference titles/HTTPS links/publication/revision timestamps. This distinguishes retrospective publication-backed prices from an API capture at `capturedAt`; `observedAt` is not fabricated from article dates. Validation requires valid ordered dates and revisions before season kickoff. The UI labels published subsets and links the evidence rather than claiming complete market favorites.
- Runtime and persistence validation enforce unique market/candidate IDs, valid named candidates, known-or-null teams, sorted rankings, consistent American/implied values, and explicit unavailable states. Another source can implement this same award contract without modifying chart logic.

### Schedule/calendar

<https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=2026&seasontype=2&week=1&limit=100>

The earliest validated season-type-2 opening-week event determines `startsAt`; calendar entries identify candidate regular/postseason periods. `resolveCheckpoint()` then fetches the relevant weeks with `seasontype` and `week`, verifies season/type/week on every event, and requires every game in the captured week to be completed. The next competitive week must be untouched, with its first kickoff still ahead. **Tuesday morning after the final Week 1 game is the completed Week 1 checkpoint**, even if ESPN's calendar has not advanced. A manual Wednesday capture in ESPN's Week 2 bucket also describes completed Week 1. Manual midweek captures and delayed runs after a Wednesday night kickoff are skipped. A capture that crosses kickoff while providers load is rejected before persistence. Unverified in-season schedules fail explicitly.

The last Tuesday before kickoff is a **Preseason** baseline, even if it is not the first Tuesday of September. January-September day-one snapshots use month labels; their absence is not backfilled with current values. January-August snapshots for the new calendar year can precede schedule publication: only in that pre-September window is an explicitly approximate **first Thursday after Labor Day** kickoff used. That fallback never establishes completion of a regular-season week. The Pro Bowl bucket is excluded, and the first Tuesday after the Super Bowl still captures the completed final even if ESPN has moved into offseason.

### Bovada — `bovada`, `kind: "market"`

- JSON endpoint: `https://www.bovada.lv/services/sports/event/v2/events/A/description/football`
- Attribution: `https://www.bovada.lv/sports/football/nfl`
- Capabilities: `superBowl`, `conference`, `division`, `playoffs`, `wins`; plus `awards: true`.
- Keyless, open public JSON feed requiring no API keys, accounts, or private tokens.
- **Playoff odds**: Two-way "To Make the Playoffs" (Yes / No) American moneyline markets for all 32 teams. Probabilities are de-vigged between Yes and No: `yesProb / (yesProb + noProb)`.
- **Regular season win totals**: Over/under win total lines extracted from team season prop markets (e.g. `Over 9.5`). Teams with games in progress or completed may have lines pulled by the book; missing teams remain `null` per the data contract.
- **Futures & divisions**: All 32 teams for Super Bowl winner, 16 AFC teams, 16 NFC teams, and all 4 teams in each of the 8 divisions. Complete groups are de-vigged to 100%.
- **Award futures**: 7 major award markets (`mvp`, `opoy`, `dpoy`, `oroy`, `droy`, `coy`, `cpoy`). Candidate American odds and raw implied probabilities are preserved without artificial normalization.

### Polymarket — `polymarket`, `kind: "market"`

- JSON endpoint: `https://gamma-api.polymarket.com/events?tag_slug=nfl&closed=false&limit=100`
- Attribution: `https://polymarket.com/sports/nfl`
- Capabilities: `superBowl`, `conference`, `division`; plus `awards: true`.
- Decentralized prediction market running on Polygon. Probabilities are derived directly from on-chain order book token prices (`outcomePrices`), representing raw crowd-implied probability without traditional bookmaker vig/margin.
- **Futures & divisions**: All 32 teams for Super Bowl champion, AFC champion, NFC champion, and all 8 divisions. Complete markets are normalized to 100%.
- **Playoffs & win totals**: Polymarket does not offer full 32-team season playoff props or win total over/unders. In accordance with design principles, these markets remain unsupported and left blank.
- **Award futures**: 7 major award markets (`mvp`, `opoy`, `dpoy`, `oroy`, `droy`, `coy`, `cpoy`). Raw contract prices are mapped to candidate probabilities and American odds equivalents.

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
- Phases are `preseason`, `regular`, `postseason`, and `offseason`; regular weeks are completed weeks 1–18; postseason checkpoints follow ESPN's numbers 1, 2, 3, and 5, excluding the noncompetitive Pro Bowl bucket. Monthly and pre-kickoff baselines have `week: null`.
- The preseason-history toggle filters pre-kickoff observations for all tabs and resets the history slider to the newest visible snapshot. It does not alter JSON, connect across missing provider observations, or remove completed weeks.

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

- The CLI automatically targets the **current calendar year**. During January-February it also targets the previous NFL season, each with its own cadence gate, so next-year preseason collection does not replace ongoing playoffs.
- The manifest defaults to the active NFL season (previous year in January-February) when its file exists, otherwise an available captured season. March advances the active default to the calendar year. Every saved year remains selectable.
- Live `--season` can explicitly choose the current calendar year or the still-active previous NFL season. Other years are rejected; this is not a historical backfill API.
- No `--date` option: fetching today's values and assigning a past capture date would fabricate history. The exported function's injected clock/client are for tests, not a historical-data API.
- Manual capture bypasses only the cadence gate, **not** week-completion/kickoff checks, and **cannot overwrite** an existing daily snapshot.
- Scheduler configuration runs **Tuesdays at 14:00 UTC**, cron `0 14 * * 2`, and the **1st of January-September**, cron `0 14 1 1-9 *`, invoking `--scheduled`. That is 10 a.m. EDT / 9 a.m. EST, after Monday night games and before Wednesday night games. January 1 creates the new year's season file and manifest entry without annual edits.
- `shouldCapture(date, phase, startsAt, endsAt)` is exported from both `scripts/data-core.mjs` and `scripts/capture.mjs`. It admits Tuesdays during play, the last pre-kickoff Tuesday, the first post-Super-Bowl Tuesday, and January-September day one outside play. It does not admit other preseason Tuesdays.
- The gate admits September 8, 2026 as a final pre-kickoff baseline. September 15 is the first completed **Week 1** checkpoint. Changing the gate cannot reconstruct prices that were not saved.
- `deriveSeasonMetadata()` describes calendar phase/period and kickoff/end boundaries. `resolveCheckpoint()` determines the completed snapshot phase/week/label from actual event states; these can differ from the calendar's upcoming week.

Use a single workflow concurrency group for captures/publishing. Price/stat provider outages are represented in valid data and do not fail the process by themselves. Unsafe/unverifiable capture windows, structural validation, filesystem errors, conflicting live/mock seasons, invalid arguments, and concurrent writer locks fail with a nonzero exit status.

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
