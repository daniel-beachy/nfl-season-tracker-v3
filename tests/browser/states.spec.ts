import { test, expect } from '@playwright/test';

const teams = Array.from({ length: 32 }, (_, index) => ({
  id: String(index + 1), name: `Fixture Team ${index + 1}`, shortName: `Team ${index + 1}`,
  abbreviation: `T${index + 1}`, conference: index < 16 ? 'AFC' : 'NFC',
  division: ['East', 'North', 'South', 'West'][Math.floor(index % 16 / 4)],
  color: '001122', alternateColor: 'eeeeee',
}));
const sources = [
  { id: 'forecast', name: 'Fixture forecast', kind: 'forecast', metrics: ['superBowl', 'conference', 'division', 'playoffs', 'wins'], url: 'https://example.com', description: 'Test data only' },
  { id: 'market', name: 'Fixture market', kind: 'market', metrics: ['superBowl'], url: 'https://example.com', description: 'Test data only' },
];
const season = {
  schemaVersion: 1, season: 2099, kind: 'live', startsAt: '2099-09-10T00:00:00Z', teams, sources,
  snapshots: [{
    id: '2099-08-05', capturedAt: '2099-08-05T14:15:00Z', season: 2099, phase: 'preseason', week: null, label: 'August',
    sources: {
      forecast: { status: 'ok', projections: Object.fromEntries(teams.map(team => [team.id, { superBowl: 3.125, conference: 6.25, division: 25, playoffs: 43.75, wins: 8.5 }])) },
      market: { status: 'unavailable', note: 'Provider returned HTTP 503; no values substituted.', projections: {} },
    },
    leaders: { status: 'not-started', note: 'Regular-season statistics have not started.', categories: [] },
  }],
};
const manifest = {
  schemaVersion: 1, currentSeason: 2099, generatedAt: '2099-08-05T14:15:00Z',
  seasons: [{ year: 2099, label: '2099 season', kind: 'live', phase: 'preseason', startsAt: season.startsAt, snapshotCount: 1, lastCapturedAt: season.snapshots[0].capturedAt, file: 'seasons/2099.json' }],
};

test.beforeEach(async ({ page }) => {
  await page.route('**/data/manifest.json', route => route.fulfill({ json: manifest }));
  await page.route('**/data/seasons/2099.json', route => route.fulfill({ json: season }));
});

test('preseason exposes one real point and keeps stat totals empty', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('season-banner')).toContainText('preseason — season not started');
  await expect(page.getByText('The first point is in.')).toBeVisible();
  await expect(page.locator('.team-legend button')).toHaveCount(32);
  await page.getByRole('tab', { name: 'Stat Leaders' }).click();
  await expect(page.getByRole('heading', { name: 'The stat sheet is still a blank slate.' })).toBeVisible();
  await expect(page.locator('.leader-card')).toHaveCount(0);
});

test('unavailable and unsupported provider markets never inherit forecast values', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Projection source').selectOption('market');
  await expect(page.getByText('Provider returned HTTP 503; no values substituted.')).toBeVisible();
  await expect(page.getByText('No observations to plot yet')).toBeVisible();
  await page.getByRole('button', { name: 'Divisions', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'This source doesn’t publish this market.' })).toBeVisible();
  await expect(page.locator('.chart-card')).toHaveCount(0);
});

test('team selection and latest-value table work without a mouse', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Top 8', exact: true }).click();
  await expect(page.locator('.team-legend button[aria-pressed="true"]')).toHaveCount(8);
  await page.getByRole('button', { name: 'Show all', exact: true }).click();
  await expect(page.locator('.team-legend button[aria-pressed="true"]')).toHaveCount(32);
  const team = page.locator('.team-legend button').first();
  await team.focus();
  await page.keyboard.press('Enter');
  await expect(team).toHaveAttribute('aria-pressed', 'false');
  await page.getByText('Latest snapshot data', { exact: true }).click();
  await expect(page.getByRole('table')).toBeVisible();
  await expect(page.getByRole('row')).toHaveCount(33);
});

test('isolated observations stay visible after three captures', async ({ page }) => {
  const observations = {
    ...season,
    snapshots: [0, 1, 2].map(index => ({
      ...season.snapshots[0], id: `capture-${index}`, label: `Capture ${index}`,
      capturedAt: `2099-08-0${index + 1}T14:15:00Z`,
      sources: index === 1 ? season.snapshots[0].sources : {
        forecast: { status: 'unavailable', projections: {} },
        market: { status: 'unavailable', projections: {} },
      },
    })),
  };
  await page.route('**/data/seasons/2099.json', route => route.fulfill({ json: observations }));
  await page.goto('/');
  await expect(page.locator('.observation-dot')).toHaveCount(32);
});

test('32-team tooltip can be scrolled with pointer and keyboard', async ({ page }) => {
  await page.route('**/data/seasons/2099.json', route => route.fulfill({
    json: { ...season, snapshots: [season.snapshots[0], { ...season.snapshots[0], id: '2099-08-12', label: 'Second capture', capturedAt: '2099-08-12T14:15:00Z' }] },
  }));
  await page.goto('/');
  const chart = page.locator('.plot');
  await expect(chart).toBeVisible();
  await chart.scrollIntoViewIfNeeded();
  const bounds = (await chart.boundingBox())!;
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + 80);
  const values = page.getByRole('region', { name: 'Snapshot values' });
  await expect(values).toBeVisible();
  await values.hover();
  await page.mouse.wheel(0, 240);
  await expect.poll(() => values.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
  await values.focus();
  await page.keyboard.press('End');
  await expect(values).toBeVisible();
  await expect(page.locator('.recharts-line-curve').last()).toHaveAttribute('stroke-opacity', '1');
});
