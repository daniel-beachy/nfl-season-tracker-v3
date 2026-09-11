import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { TEAMS } from '../../scripts/teams.mjs';

test('monthly preseason history can be hidden without losing completed weeks or changing tabs', async ({ page }) => {
  const snapshot = (label: string, capturedAt: string, phase: string, week: number | null) => ({
    id: `2027-${capturedAt.slice(0, 10)}`, season: 2027, label, capturedAt, phase, week,
    sources: { 'espn-fpi': { status: 'unavailable', projections: {} } },
    leaders: { status: 'unavailable', categories: [] },
  });
  const data = {
    schemaVersion: 1, season: 2027, kind: 'live', startsAt: '2027-09-10T00:20:00Z', teams: TEAMS,
    sources: [{ id: 'espn-fpi', name: 'ESPN FPI', kind: 'forecast', metrics: ['superBowl'], url: 'https://www.espn.com', description: 'Forecast' }],
    snapshots: [
      snapshot('March', '2027-03-01T16:00:00Z', 'offseason', null),
      snapshot('April', '2027-04-01T16:00:00Z', 'offseason', null),
      snapshot('September', '2027-09-01T16:00:00Z', 'preseason', null),
      snapshot('Week 1', '2027-09-15T16:00:00Z', 'regular', 1),
      snapshot('Week 2', '2027-09-22T16:00:00Z', 'regular', 2),
    ],
  };
  await page.route('**/data/manifest.json', route => route.fulfill({ json: {
    schemaVersion: 1, currentSeason: 2027, generatedAt: '2027-09-22T16:00:00Z',
    seasons: [{ year: 2027, label: '2027', file: 'seasons/2027.json' }],
  } }));
  await page.route('**/data/seasons/2027.json', route => route.fulfill({ json: data }));
  await page.goto('/');
  await expect(page.getByLabel('Show preseason history')).toBeChecked();
  await expect(page.getByTestId('snapshot-position')).toHaveText('5 / 5');
  await page.getByRole('slider', { name: 'Snapshot history' }).fill('0');
  await expect(page.locator('.explorer-label')).toContainText('March');
  await page.getByLabel('Show preseason history').uncheck();
  await expect(page.getByTestId('snapshot-position')).toHaveText('2 / 2');
  await page.getByRole('slider', { name: 'Snapshot history' }).fill('0');
  await expect(page.locator('.explorer-label')).toContainText('Week 1');
  await page.getByRole('tab', { name: 'Awards', exact: true }).click();
  await expect(page.getByTestId('snapshot-position')).toHaveText('1 / 2');
  await page.getByLabel('Show preseason history').check();
  await expect(page.getByTestId('snapshot-position')).toHaveText('5 / 5');
  await page.setViewportSize({ width: 360, height: 800 });
  await expect(page.getByLabel('Show preseason history')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.route('**/data/seasons/2027.json', route => route.fulfill({ json: { ...data, snapshots: data.snapshots.slice(0, 3) } }));
  await page.reload();
  await page.getByLabel('Show preseason history').uncheck();
  await expect(page.getByRole('heading', { name: 'No completed-week snapshots yet.' })).toBeVisible();
  await page.getByRole('tab', { name: 'Awards', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'No completed-week snapshots yet.' })).toBeVisible();
  await page.getByRole('button', { name: 'Show preseason', exact: true }).click();
  await expect(page.getByTestId('snapshot-position')).toHaveText('3 / 3');
});

test('the actual partial opening-week capture has a visible timing correction in every tab', async ({ page }) => {
  const data = JSON.parse(await readFile(new URL('../../public/data/seasons/2026.json', import.meta.url), 'utf8'));
  data.snapshots = data.snapshots.filter((snapshot: { capturedAt: string }) => snapshot.capturedAt <= '2026-09-11T01:15:27.503Z');
  await page.route('**/data/manifest.json', route => route.fulfill({ json: {
    schemaVersion: 1, currentSeason: 2026, generatedAt: '2026-09-11T01:15:27.503Z',
    seasons: [{ year: 2026, label: '2026', file: 'seasons/2026.json' }],
  } }));
  await page.route('**/data/seasons/2026.json', route => route.fulfill({ json: data }));
  await page.goto('/');
  await expect(page.getByRole('note')).toContainText('not preseason odds or a completed Week 1');
  await expect(page.locator('.explorer-label')).toContainText('Opening-week update');
  await page.getByRole('tab', { name: 'Awards', exact: true }).click();
  await expect(page.getByRole('note')).toContainText('not preseason odds');
  await expect(page.locator('.award-market')).toHaveCount(8);
});
