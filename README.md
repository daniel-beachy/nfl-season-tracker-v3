# Sunday Signal

A free NFL season tracker: the long view on championship forecasts, playoff chances, and statistical leaders.

**[Open the dashboard](https://daniel-beachy.github.io/nfl-season-tracker-v3/)** · [Data sources and adapter details](docs/DATA-SOURCES.md)

## What is included

- All 32 teams: Super Bowl winner, AFC/NFC champion, all eight division races, playoff chances, and projected regular-season wins.
- Team-colored time-series charts with hover/focus tooltips, team filters, a top-eight shortcut, and accessible latest-value tables.
- Top-10 statistical leaders, cumulative charts, and leaderboard cards. Regular-season totals stay separate from postseason statistics.
- An **Awards** tab for MVP, OPOY, DPOY, OROY, DROY, Coach of the Year, Comeback Player of the Year, and Protector of the Year. Includes market favorites, American odds, implied-percentage trends for the latest top ten, and an expandable captured-candidate field.
- A season selector that defaults to the current season, independent projection-source selection, and persistent light/dark mode.
- A snapshot-history slider to rewind the charts and leaderboards to any captured week.
- January-September preseason checkpoints on the **1st of each month**, automatically creating the next season on January 1, plus a final pre-kickoff baseline. A **Show preseason history** toggle hides those points across all three tabs without deleting data.
- Explicit **mocked — not fully accurate** labels on the illustrative previous season. Actual current-season captures are never supplemented with invented history.
- Honest single-point, missing-source, unsupported-market, refresh-overdue, and **preseason — season not started** states.

## Run locally

Node.js 22 or later:

```sh
npm ci
npm run dev
```

Open the URL printed by Vite. The browser reads committed JSON under `public/data`; local use requires no API credentials. Do not open `index.html` directly from disk.

```sh
npm test                 # Data and presentation contracts
npm run build            # Type-check and production bundle
npm run preview          # Serve the production bundle
npx playwright install chromium
npm run test:e2e         # Browser interaction and responsive-layout checks
```

## Data and architecture

```text
scripts/               Provider adapters, capture cadence, mock generator
public/data/
  manifest.json        Current season and accumulated season index
  seasons/{year}.json  Team/source metadata and immutable dated snapshots
src/
  types.ts             Source-neutral snapshot contract
  lib/                 Data loading and pure presentation transformations
  components/          Charts, projections, leaderboards, methodology dialog
.github/workflows/     Scheduled capture, Pages deployment, PR checks
```

React, TypeScript, Vite, and Recharts compile to a fully static site. All dependencies are bundled locally. There are no paid services, analytics, API keys, application servers, databases, runtime sportsbook requests, or external font dependencies. The only browser data requests are same-origin static files. Team colors are loaded from captured ESPN metadata, not live requests.

Charts prefer the primary team color, switch to the official alternate when needed, and adjust brightness if both colors are unreadable on the selected theme. Every default team line maintains at least 3:1 contrast against the chart surface.

Live sources are **ESPN FPI** and **DraftKings futures syndicated by ESPN**. The sportsbook adapter captures Super Bowl, conference, and division prices and normalizes complete markets to remove the displayed overround proportionally. It does not invent playoff probabilities or projected win totals. Although accessed through ESPN infrastructure, DraftKings is a separate odds provider, not another FPI forecast. Initial 2026 FPI observations are dated August 31 and visibly marked delayed; sportsbook update timestamps are not supplied.

Award markets use **raw implied percentages**, not the normalized team-market method. They include bookmaker margin, may omit candidates, and must not be treated as fair chances or added to 100%. Automatic captures retain the strongest 50 valid quotes per award.

The 2026 baseline is **September Preseason**, using September 8 team projections and 45 retrospectively sourced award quotes across all eight categories. [DraftKings Network](https://dknetwork.draftkings.com/2026/09/08/nfl-awards-odds/) and [CBS Sports](https://www.cbssports.com/nfl/news/2026-nfl-mvp-odds-award-best-bets-joe-burrow-mvp/) independently support **Drake Maye MVP +1000** before the Seattle-New England opener. Publication/revision timestamps, source links and the later addition date are retained and visible. These are partial published selections, not verified closing prices. The September 11 post-opener snapshot was removed rather than relabeled as preseason. No exact earlier first-of-month 2026 data was verified, so those months have not been fabricated.

Adapters publish the same five optional metrics: `superBowl`, `conference`, `division`, `playoffs`, and `wins`. A provider declares which metrics it supports. Unavailable inputs remain absent/null, never zero. Missing snapshots break lines instead of interpolating across failures. Model forecasts and market-implied probabilities are never blended. All values are percentages, except projected wins.

Award-capable sources additionally declare `awards: true`. Their optional `snapshot.awards[sourceId]` records contain category and candidate IDs, named candidates, nullable team IDs, American odds, and raw implied percentages. This is an additive schema-version-1 extension: old JSON remains valid and is not rewritten. The Awards selector is independent of the Projections selector. Future providers can populate the same contract.

See [`src/types.ts`](src/types.ts) for the contract and [the source guide](docs/DATA-SOURCES.md) for provider-specific limitations, normalization, and how to add an adapter.

## Automated capture and hosting

The **Capture and publish** workflow runs every Wednesday at **16:00 UTC** (noon EDT / 11:00 EST), plus the **1st of every month January through September** at the same UTC time. The collector gates weekly runs to the regular season/playoffs, the final Wednesday before kickoff, and the first Wednesday after the Super Bowl. Other preseason Wednesdays are skipped. If the two schedules coincide, the daily snapshot key prevents duplication.

**Week 1 means after the entire first week**, not the week about to start. The collector verifies ESPN event completion for the relevant week and verifies that the next week's games have not begun, including Wednesday openers and Thanksgiving-eve games. Delayed runs or manual midweek captures are skipped rather than saving mixed-week odds/statistics; a collection that crosses the next kickoff fails explicitly. The Pro Bowl is not a competitive NFL checkpoint. GitHub Actions cron is best-effort, not a guaranteed execution time.

**No annual code edits are required.** January 1 initializes the new calendar-year season automatically; January/February runs also keep collecting the prior NFL season's remaining games. The selector retains every saved year. The default remains the active NFL season through February when available, then advances in March; it never points to a missing file.

January-August captures can run before ESPN publishes the fall schedule: the kickoff estimate is explicitly disclosed, requested-season provider validation still applies, and unavailable odds remain unavailable. The API must publish data for the requested year; old-year prices are never relabeled. From September onward, unverified schedules fail instead of inventing a completed-week label. Existing snapshots remain immutable on ordinary captures; the documented September 2026 consolidation was an explicit one-time correction.

1. Push to a **public GitHub repository**.
2. Under **Settings → Pages → Build and deployment**, select **GitHub Actions**.
3. Under **Actions**, enable workflows. The repository's Actions policy must allow `GITHUB_TOKEN` to write contents.
4. The workflow builds and deploys on pushes to `main`. **Run workflow** also performs a live capture.

The scheduled job commits only data JSON and then builds/deploys in the **same run**. This is intentional: pushes made with `GITHUB_TOKEN` do not trigger another workflow. Concurrency serializes capture/deploy jobs. Previous seasons remain in the manifest year after year.

GitHub can disable scheduled workflows in public repositories after 60 days without repository activity. Successful monthly data commits ordinarily keep the repository active; monitor the Actions page and re-enable the schedule if needed. External API outages are recorded visibly where possible; a fatal collector/build error is visible as a failed workflow. The dashboard flags old captures.

To capture manually:

```sh
npm run capture
npm run capture -- --season=2026
npm run capture -- --scheduled
npm run seed:mock
```

Do not seed over live history. The mock generator is for the explicitly labeled previous-season demonstration, not an alternative when live providers fail.

## Interpretation

Forecasts are uncertain, not guarantees or betting advice. A capture time is not necessarily the provider's model-update time; inspect source notes for stale upstream seasons and market timestamps. Stat lines track the *latest* top ten athletes by ID, so an athlete missing from an earlier captured top ten has a gap rather than an invented total. The data dropdown downloads the full season JSON for independent inspection.

This is an independent, unofficial project, not affiliated with the NFL, ESPN, sportsbooks, or teams. Team names, marks, and colors remain the property of their respective owners. Public undocumented APIs can change without notice. Code is MIT-licensed; upstream data remains subject to its providers' terms.
