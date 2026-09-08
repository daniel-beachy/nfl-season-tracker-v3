import { test, expect } from '@playwright/test';

test('current season is default, theme persists, and mock history is explicit', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'The season, in perspective.' })).toBeVisible();
  const year = await page.getByLabel('Season', { exact: true }).inputValue();
  const response = await page.request.get('./data/manifest.json');
  const manifest = await response.json();
  expect(Number(year)).toBe(manifest.currentSeason);
  await page.getByRole('button', { name: /switch to .* mode/i }).click();
  const theme = await page.locator('html').getAttribute('data-theme');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme!);
  const mock = manifest.seasons.find((season: { kind: string }) => season.kind === 'mock');
  await page.getByLabel('Season', { exact: true }).selectOption(String(mock.year));
  await expect(page.getByTestId('season-banner')).toContainText('mocked — not fully accurate');
  await expect(page.getByRole('heading', { name: 'Road to the Lombardi' })).toBeVisible();
  await expect(page.locator('.recharts-line-curve').first()).toBeVisible();
});

test('every projection view and cumulative stat category is reachable', async ({ page }) => {
  await page.goto('/');
  const manifest = await (await page.request.get('./data/manifest.json')).json();
  const mock = manifest.seasons.find((season: { kind: string }) => season.kind === 'mock');
  await page.getByLabel('Season', { exact: true }).selectOption(String(mock.year));
  await page.getByRole('button', { name: 'Divisions', exact: true }).click();
  await expect(page.locator('.chart-card')).toHaveCount(8);
  await page.getByRole('button', { name: 'Conference', exact: true }).click();
  await expect(page.locator('.chart-card')).toHaveCount(2);
  await page.getByRole('button', { name: 'Playoffs', exact: true }).click();
  await expect(page.locator('.chart-card')).toHaveCount(2);
  await page.getByRole('button', { name: 'Win totals', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Wins on the horizon' })).toBeVisible();
  await page.getByRole('tab', { name: 'Stat Leaders' }).click();
  await expect(page.getByRole('heading', { name: 'The numbers behind the names.' })).toBeVisible();
  await expect(page.locator('.leader-card')).toHaveCount(10);
  await page.getByLabel('Stat category').selectOption({ label: 'Rushing touchdowns' });
  await expect(page.locator('.leader-card')).toHaveCount(10);
});

test('phone layout has no horizontal overflow and methodology dialog is accessible', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByLabel('Season', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'About the data', exact: true }).last().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
});

test('snapshot explorer rewinds totals without inventing new observations', async ({ page }) => {
  await page.goto('/');
  const manifest = await (await page.request.get('./data/manifest.json')).json();
  const mock = manifest.seasons.find((season: { kind: string }) => season.kind === 'mock');
  await page.getByLabel('Season', { exact: true }).selectOption(String(mock.year));
  const slider = page.getByRole('slider', { name: 'Snapshot history' });
  await expect(slider).toBeVisible();
  await slider.fill('5');
  await expect(page.getByTestId('snapshot-position')).toContainText('6 /');
  await page.getByRole('button', { name: 'Return to latest snapshot' }).click();
  await expect(page.getByTestId('snapshot-position')).toContainText(`${mock.snapshotCount} / ${mock.snapshotCount}`);
});

test('failed JSON requests surface an error instead of silently loading mock data', async ({ page }) => {
  await page.route('**/data/manifest.json', route => route.fulfill({ status: 503, body: 'Unavailable' }));
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('No substitute data has been shown');
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
});

test('portfolio navigation is available in the desktop rail and mobile footer', async ({ page }) => {
  await page.goto('/');
  const railLink = page.getByRole('complementary').getByRole('link', { name: 'Portfolio', exact: true });
  await expect(railLink).toBeVisible();
  await expect(railLink).toHaveAttribute('href', 'https://daniel-beachy.github.io/');
  await page.setViewportSize({ width: 390, height: 844 });
  const footerLink = page.getByRole('contentinfo').getByRole('link', { name: 'Portfolio', exact: true });
  await footerLink.scrollIntoViewIfNeeded();
  await expect(footerLink).toBeVisible();
  await expect(footerLink).toHaveAttribute('href', 'https://daniel-beachy.github.io/');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
