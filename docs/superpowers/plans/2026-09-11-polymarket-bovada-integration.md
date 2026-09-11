# Polymarket and Bovada Multi-Book Integration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate Polymarket and Bovada as free, keyless market data providers alongside ESPN FPI and DraftKings, providing full market options including Bovada's 32-team playoff probabilities and regular-season win totals.

**Architecture:** Add dedicated modular adapters in `scripts/providers.mjs` for Polymarket (Gamma API) and Bovada (Public Sports Events API), allow their hostnames in `scripts/http.mjs`, wire them into the capture pipeline and source registry, attach live market values to the September 8 snapshot in `public/data/seasons/2026.json`, and expose them in the dashboard's Projection and Award source selectors.

**Tech Stack:** Node.js 22, TypeScript, React 19, Playwright, Node Test Runner.

## Global Constraints

- Must be completely free to host and execute with zero API keys or paid services.
- Never substitute mock data for missing live provider data; missing metrics remain null/absent.
- Source neutral architecture: data must conform to existing `SourceSnapshot` and `AwardSourceSnapshot` contracts in `src/types.ts`.
- Retain existing unit tests and Playwright test suites.

---

### Task 1: HTTP Allowlist and Bovada/Polymarket Provider Definitions

**Files:**
- Modify: `scripts/http.mjs`
- Modify: `scripts/providers.mjs`
- Test: `tests/data-providers.test.mjs`

**Interfaces:**
- Consumes: `HOSTS` set in `scripts/http.mjs`, `SOURCES` array in `scripts/providers.mjs`.
- Produces: Allowed hosts for `www.bovada.lv` and `bovada.lv`, and declared source entries for `bovada` and `polymarket`.

- [ ] **Step 1: Write the failing test for new source definitions and HTTP host allowlist**

In `tests/data-providers.test.mjs`, add tests verifying that `safeReference` accepts `https://www.bovada.lv/...` and that `SOURCES` contains `bovada` and `polymarket` with proper metric and award declarations.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --test-reporter=dot tests/data-providers.test.mjs`
Expected: FAIL on `bovada` host check or missing source definitions.

- [ ] **Step 3: Implement host allowlist and source declarations**

Update `scripts/http.mjs` to include `'www.bovada.lv'` and `'bovada.lv'`. Update `SOURCES` in `scripts/providers.mjs` with `bovada` (`metrics: ['superBowl', 'conference', 'division', 'playoffs', 'wins']`, `awards: true`) and `polymarket` (`metrics: ['superBowl', 'conference', 'division']`, `awards: true`).

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --test-reporter=dot tests/data-providers.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/http.mjs scripts/providers.mjs tests/data-providers.test.mjs
git commit -m "feat(data): register Bovada and Polymarket sources and HTTP hosts"
```

---

### Task 2: Implement and Test Polymarket Adapter (Projections & Awards)

**Files:**
- Modify: `scripts/providers.mjs`
- Test: `tests/data-providers.test.mjs`

**Interfaces:**
- Consumes: Polymarket Gamma API responses (`/events?tag_slug=nfl&closed=false&limit=100`), `TEAMS` from `scripts/teams.mjs`.
- Produces: `adaptPolymarket(events, teams, season)` and `adaptPolymarketAwards(events, teams, season)` returning standard `SourceSnapshot` and `AwardSourceSnapshot`.

- [ ] **Step 1: Write the failing test with realistic Polymarket fixture data**

In `tests/data-providers.test.mjs`, add tests for `adaptPolymarket` (verifying Super Bowl 32 teams, AFC 16 teams, NFC 16 teams, 8 divisions normalized to 100%) and `adaptPolymarketAwards` (verifying MVP and other award markets with candidate odds and implied probabilities).

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --test-reporter=dot tests/data-providers.test.mjs`
Expected: FAIL because `adaptPolymarket` and `adaptPolymarketAwards` are not yet implemented.

- [ ] **Step 3: Implement `adaptPolymarket` and `adaptPolymarketAwards`**

Implement the parsing logic in `scripts/providers.mjs`. Match `groupItemTitle` to team names for championship and conference/division markets. De-vig complete groups. Extract award candidates, converting decimal probability to American odds and raw percentage.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --test-reporter=dot tests/data-providers.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/providers.mjs tests/data-providers.test.mjs
git commit -m "feat(polymarket): implement Polymarket projections and awards adapter"
```

---

### Task 3: Implement and Test Bovada Adapter (Projections with Playoffs/Wins & Awards)

**Files:**
- Modify: `scripts/providers.mjs`
- Test: `tests/data-providers.test.mjs`

**Interfaces:**
- Consumes: Bovada NFL events payload (`https://www.bovada.lv/services/sports/event/v2/events/A/description/football`), `TEAMS`.
- Produces: `adaptBovada(events, teams, season)` and `adaptBovadaAwards(events, teams, season)` returning standard `SourceSnapshot` with playoffs and win totals, and `AwardSourceSnapshot`.

- [ ] **Step 1: Write the failing test with realistic Bovada fixture data**

In `tests/data-providers.test.mjs`, add test cases for Bovada parsing:
1. "To Make the Playoffs" mapping all 32 teams to `playoffs` metric (American odds converted to implied probability).
2. "NFL Regular Season Wins" over/under line extracted to `wins` metric (e.g. 7.5 wins for Steelers).
3. Super Bowl, Conferences, and Divisions de-vigged appropriately.
4. Bovada award markets (MVP, etc.) with American odds.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --test-reporter=dot tests/data-providers.test.mjs`
Expected: FAIL because `adaptBovada` is not yet implemented.

- [ ] **Step 3: Implement `adaptBovada` and `adaptBovadaAwards`**

Implement Bovada parsing in `scripts/providers.mjs`. Filter paths by description. Map team names to canonical IDs. Extract playoff probabilities and win total lines.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --test-reporter=dot tests/data-providers.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/providers.mjs tests/data-providers.test.mjs
git commit -m "feat(bovada): implement Bovada projections (playoffs/wins) and awards adapter"
```

---

### Task 4: Integrate Bovada and Polymarket into Capture Pipeline and Backfill September 8 Snapshot

**Files:**
- Modify: `scripts/capture.mjs`
- Modify: `public/data/seasons/2026.json`
- Modify: `public/data/seasons/2025.json`
- Create: `scripts/backfill-new-sources.mjs` (transient capture tool)

- [ ] **Step 1: Update `scripts/capture.mjs`**

Fetch Bovada and Polymarket along with ESPN FPI and DraftKings in parallel on live capture runs.

- [ ] **Step 2: Run capture script to fetch live Bovada and Polymarket data**

Create a helper script to fetch current live Bovada and Polymarket data from their live endpoints, adapt them, and attach them to the September 8 snapshot in `2026.json` as requested. Also update the `sources` list in `2026.json` and `2025.json`.

- [ ] **Step 3: Validate schema and data integrity**

Run: `node --test tests/data-core.test.mjs tests/data-capture.test.mjs`
Verify `validateSeason` passes on `2026.json` and `2025.json`.

- [ ] **Step 4: Commit**

```bash
git add scripts/capture.mjs public/data/seasons/*.json
git commit -m "feat(data): integrate Bovada and Polymarket into capture pipeline and attach to 2026 season"
```

---

### Task 5: UI Verification, Documentation, and Public Deployment

**Files:**
- Modify: `docs/DATA-SOURCES.md`
- Modify: `src/components/AboutDialog.tsx`
- Test: `tests/browser/dashboard.spec.ts`
- Test: `tests/browser/awards.spec.ts`

- [ ] **Step 1: Update documentation and About dialog**

Document Bovada and Polymarket in `docs/DATA-SOURCES.md` and mention them in `AboutDialog.tsx`.

- [ ] **Step 2: Add browser tests for multi-book selection and playoffs/win totals**

Verify in Playwright tests that selecting Bovada displays playoff odds and win totals, and selecting Polymarket displays prediction market probabilities.

- [ ] **Step 3: Run full verification suite**

Run: `npm run build && npm test && npx playwright test`
Expected: All tests PASS.

- [ ] **Step 4: Deploy and verify live site**

Commit, push to `main`, wait for GitHub Actions Pages deployment, and verify live URL.
