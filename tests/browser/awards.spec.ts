import { test, expect } from '@playwright/test';
import { TEAMS } from '../../scripts/teams.mjs';

const categories = ['MVP', 'OPOY', 'DPOY', 'OROY', 'DROY', 'COY', 'CPOY', 'Protector'].map((abbreviation, index) => ({
  id: abbreviation.toLowerCase(), name: index === 0 ? 'Most Valuable Player' : `${abbreviation} award`,
  abbreviation, candidateType: index === 5 ? 'coach' : 'player', probabilityBasis: 'raw-implied',
  listedCount: 12, note: '12 captured outcomes. Raw implied percentages include bookmaker margin.',
  candidates: Array.from({ length: 12 }, (_, candidate) => ({
    id: String(candidate + 1), name: `${index === 5 ? 'Coach' : 'Player'} ${candidate + 1}`,
    teamId: index === 5 ? null : TEAMS[candidate].id,
    americanOdds: 300 + candidate * 100, impliedProbability: 10000 / (400 + candidate * 100),
  })),
}));
const source = { status: 'ok', note: 'No provider timestamp. Current quotes are not backdated as preseason.', categories };
const snapshot = (label: string, capturedAt: string) => ({
  id: `2026-${capturedAt.slice(0, 10)}`, season: 2026, label, capturedAt, phase: 'regular', week: 1,
  sources: { 'espn-fpi': { status: 'unavailable', projections: {} }, draftkings: { status: 'unavailable', projections: {} } },
  leaders: { status: 'unavailable', categories: [] },
});
const data = {
  schemaVersion: 1, season: 2026, kind: 'live', startsAt: '2026-09-10T00:20:00Z', teams: TEAMS,
  sources: [
    { id: 'espn-fpi', name: 'ESPN FPI', kind: 'forecast', metrics: ['superBowl'], url: 'https://www.espn.com', description: 'Forecast' },
    { id: 'draftkings', name: 'DraftKings via ESPN', kind: 'market', metrics: ['superBowl'], awards: true, url: 'https://www.espn.com', description: 'Sportsbook' },
  ],
  snapshots: [snapshot('Preseason', '2026-09-08T14:15:00Z'), { ...snapshot('Week 1', '2026-09-11T01:00:00Z'), awards: { draftkings: source } }],
};

test.beforeEach(async ({ page }) => {
  await page.route('**/data/manifest.json', route => route.fulfill({ json: {
    schemaVersion: 1, currentSeason: 2026, generatedAt: '2026-09-11T01:00:00Z',
    seasons: [{ year: 2026, label: '2026', kind: 'live', phase: 'regular', startsAt: data.startsAt, snapshotCount: 2, file: 'seasons/2026.json' }],
  } }));
  await page.route('**/data/seasons/2026.json', route => route.fulfill({ json: data }));
});

test('Awards displays eight markets, true odds, charts, and the captured field', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('tab', { name: 'Awards', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'The race for recognition.' })).toBeVisible();
  await expect(page.getByLabel('Awards source')).toHaveValue('draftkings');
  await expect(page.locator('.award-market')).toHaveCount(8);
  await expect(page.locator('.award-candidate')).toHaveCount(10);
  await expect(page.locator('.award-candidate').first()).toContainText('+300');
  await expect(page.locator('.award-candidate').first()).toContainText('25.0%');
  await expect(page.getByText('First award observation')).toBeVisible();
  await expect(page.locator('.observation-dot')).toHaveCount(10);
  await page.getByRole('button', { name: 'Show all 12 candidates' }).click();
  await expect(page.locator('.award-candidate')).toHaveCount(12);
  await page.getByLabel('Award category').selectOption('coy');
  await expect(page.locator('.award-candidate').first()).toContainText('Coach 1');
  await expect(page.locator('.award-candidate').first()).toContainText('Coach');
  await page.getByRole('tab', { name: 'Projections', exact: true }).click();
  await expect(page.getByLabel('Projection source')).toHaveValue('espn-fpi');
});

test('rewinding to an old snapshot does not backfill award odds', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('tab', { name: 'Awards', exact: true }).click();
  await page.getByRole('slider', { name: 'Snapshot history' }).fill('0');
  await expect(page.getByRole('heading', { name: 'Awards weren’t captured in this snapshot.' })).toBeVisible();
  await expect(page.locator('.award-candidate')).toHaveCount(0);
  await page.getByRole('button', { name: 'Return to latest snapshot' }).click();
  await expect(page.locator('.award-candidate')).toHaveCount(10);
});

test('unavailable awards are explicit and do not reuse earlier odds', async ({ page }) => {
  await page.route('**/data/seasons/2026.json', route => route.fulfill({ json: {
    ...data, snapshots: [...data.snapshots, {
      ...snapshot('Week 2', '2026-09-16T14:15:00Z'),
      awards: { draftkings: { status: 'unavailable', categories: [], note: 'HTTP 503; no values substituted.' } },
    }],
  } }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Open awards' }).click();
  await expect(page.getByText('HTTP 503; no values substituted.')).toBeVisible();
  await expect(page.locator('.award-candidate')).toHaveCount(0);
});

test('Awards navigation and odds remain usable on small screens in both themes', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/');
  await page.getByRole('tab', { name: 'Awards', exact: true }).click();
  await expect(page.getByLabel('Award category')).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Stat Leaders' })).toBeVisible();
  await page.getByRole('button', { name: /switch to .* mode/i }).click();
  await expect(page.locator('.award-candidate').first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
