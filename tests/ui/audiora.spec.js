import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { once } from 'node:events';
import { randomBytes } from 'node:crypto';
import { mkdtemp, mkdir, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from '../../backend/server.js';

const project = fileURLToPath(new URL('../../', import.meta.url));
let root, server, url;
const token = randomBytes(32).toString('hex');

test.beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'audiora-browser-'));
  await mkdir(path.join(root, 'media'));
  await copyFile(
    path.join(project, 'media/audiora-preview.mp3'),
    path.join(root, 'media/audiora-preview.mp3'),
  );
  server = createApp({
    dataDir: path.join(root, 'data'),
    mediaDir: path.join(root, 'media'),
    adminToken: token,
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  url = `http://127.0.0.1:${server.address().port}`;
});

test.afterAll(async () => {
  if (server) {
    const closing = new Promise((resolve) => server.close(resolve));
    server.closeAllConnections();
    await closing;
  }
  if (root) await rm(root, { recursive: true, force: true });
});

test.beforeEach(async ({ page }) => {
  await page.goto(url);
  await expect(page.locator('#episode-grid')).toHaveAttribute('aria-busy', 'false');
});

test('desktop loads local assets without console or runtime errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.reload();
  await expect(page.locator('.episode-card')).toHaveCount(8);
  await expect(page.locator('#hero-heading')).toHaveText('Find yourfrequency.');
  await expect
    .poll(() => page.locator('#audio').evaluate((audio) => audio.readyState))
    .toBeGreaterThan(0);
  expect(
    await page
      .locator('img')
      .evaluateAll((images) => images.every((image) => image.complete && image.naturalWidth > 0)),
  ).toBeTruthy();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBeTruthy();
  await page.screenshot({ path: path.join(project, 'docs/preview-desktop.png'), fullPage: true });
  expect(errors).toEqual([]);
});

test('three languages, native-script search, categories and reset work', async ({ page }) => {
  for (const language of ['kn', 'hi', 'en']) {
    await page.locator(`[data-language="${language}"]`).click();
    await expect(page.locator('.episode-card')).toHaveCount(4);
    await expect(page.locator('.episode-title').first()).toHaveAttribute('lang', language);
  }
  await page.locator('#reset-filters').click();
  await page.locator('#search-input').fill('ನಿಧಾನವಾಗಿ');
  await expect(page.locator('.episode-card')).toHaveCount(1);
  await page.locator('#search-input').fill('this cannot possibly match');
  await expect(page.locator('.episode-card')).toHaveCount(0);
  await expect(page.locator('#empty-reset')).toBeVisible();
  await page.locator('#empty-reset').click();
  await page.locator('[data-category="Technology"]').click();
  await expect(page.locator('.episode-card')).toHaveCount(2);
  await page.locator('#reset-filters').click();
  await page.locator('.nav-moods [data-mood="Unwind"]').click();
  await expect(page.locator('#active-mood')).toContainText('Unwind');
  await expect(page.locator('.episode-card')).toHaveCount(3);
});

test('saved library survives refresh and has a useful empty state', async ({ page }) => {
  await page.locator('.cover-save').first().click();
  await page.reload();
  await expect(page.locator('#saved-count')).toHaveText('1');
  await page.locator('.nav-link[data-view="library"]').click();
  await expect(page.locator('.episode-card')).toHaveCount(1);
  await page.locator('.cover-save').click();
  await expect(page.locator('.episode-card')).toHaveCount(0);
  await expect(page.getByText('Keep a little inspiration close.')).toBeVisible();
});

test('real MP3 decodes, plays, seeks, changes speed and restores position', async ({ page }) => {
  await page.locator('#play-toggle').click();
  await expect
    .poll(() => page.locator('#audio').evaluate((audio) => audio.currentTime))
    .toBeGreaterThan(0.2);
  const duration = await page.locator('#audio').evaluate((audio) => audio.duration);
  expect(duration).toBeGreaterThan(29);
  expect(duration).toBeLessThan(31);
  await page.locator('#play-toggle').click();
  await page.locator('#player-seek').fill('10');
  await page.locator('#speed-button').click();
  await page.locator('#player-volume').fill('0.3');
  await expect
    .poll(() => page.locator('#audio').evaluate((audio) => audio.playbackRate))
    .toBe(1.25);
  await page.reload();
  await expect
    .poll(() => page.locator('#audio').evaluate((audio) => audio.currentTime))
    .toBeGreaterThan(9);
  expect(await page.locator('#audio').evaluate((audio) => audio.paused)).toBeTruthy();
  await expect(page.locator('#player-volume')).toHaveValue('0.3');
  await expect(page.locator('#speed-button')).toHaveText('1.25×');
});

test('queue supports removal and automatic playback of the next episode', async ({ page }) => {
  const secondTitle = await page.locator('.episode-title').nth(1).textContent();
  await page.locator('.queue-add').nth(1).click();
  await page.locator('.queue-add').nth(2).click();
  await page.locator('#queue-open').click();
  await expect(page.locator('.queue-item')).toHaveCount(2);
  await page.locator('[data-queue-remove]').last().click();
  await expect(page.locator('.queue-item')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await page.locator('#play-toggle').click();
  await page.locator('#player-seek').fill('29.9');
  await expect(page.locator('#player-title')).toHaveText(secondTitle);
  await expect(page.locator('#queue-count')).toHaveText('0');
});

test('focus dialog and sleep-at-end work without auto-advancing queue', async ({ page }) => {
  await page.locator('.queue-add').nth(1).click();
  await page.locator('#sleep-open').click();
  await page.locator('[data-sleep="end"]').click();
  await expect(page.locator('#sleep-status')).toContainText('end of this episode');
  await page.keyboard.press('Escape');
  await page.locator('#focus-open').click();
  await expect(page.locator('#focus-dialog')).toBeVisible();
  await page.locator('.focus-play').click();
  await page.locator('#focus-seek').fill('29.9');
  await expect.poll(() => page.locator('#audio').evaluate((audio) => audio.ended)).toBeTruthy();
  await expect(page.locator('#focus-heading')).toHaveText('The art of slowing down');
  await page.keyboard.press('Escape');
  await expect(page.locator('#focus-dialog')).not.toBeVisible();
  await expect(page.locator('#queue-count')).toHaveText('1');
});

test('API failure provides a working retry action', async ({ page }) => {
  await page.route('**/api/episodes', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Temporarily unavailable.' }),
    }),
  );
  await page.reload();
  await expect(page.locator('#catalogue-status')).toContainText('Temporarily unavailable.');
  await page.unroute('**/api/episodes');
  await page.locator('#retry-catalogue').click();
  await expect(page.locator('.episode-card')).toHaveCount(8);
});

test('disabled studio clearly explains server configuration', async ({ page }) => {
  await page.route('**/api/config', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ uploadsEnabled: false, maxUploadBytes: 104857600 }),
    }),
  );
  await page.reload();
  await page.locator('.top-studio').click();
  await expect(page.locator('#studio-config')).toContainText('AUDIORA_ADMIN_TOKEN');
  await expect(page.locator('#studio-fields')).toHaveAttribute('disabled', '');
  await expect(page.locator('#studio-file')).toBeDisabled();
});

test('mobile at 390 and 320 pixels fits and keeps listening controls usable', async ({ page }) => {
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(page.locator('.mobile-nav')).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBeTruthy();
    await page.locator('.mobile-nav [data-view="library"]').click();
    await expect(page.getByText('Keep a little inspiration close.')).toBeVisible();
    await page.locator('.mobile-nav [data-view="discover"]').click();
    await page.locator('#player-art-button').click();
    await expect(page.locator('#focus-dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await page.locator('.mobile-nav .creator-open').click();
    await expect(page.locator('#studio-dialog')).toBeVisible();
    expect(
      await page
        .locator('#studio-dialog')
        .evaluate((dialog) => dialog.scrollWidth <= dialog.clientWidth),
    ).toBeTruthy();
    await page.keyboard.press('Escape');
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(project, 'docs/preview-mobile.png'), fullPage: true });
});

test('discovery passes automated WCAG A/AA checks', async ({ page }) => {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(
    results.violations.map((item) => ({
      id: item.id,
      impact: item.impact,
      nodes: item.nodes.map((node) => node.target),
    })),
  ).toEqual([]);
});

test('mobile and focus dialog pass automated accessibility checks', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const mobile = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(
    mobile.violations.map((item) => ({
      id: item.id,
      nodes: item.nodes.map((node) => node.target),
    })),
  ).toEqual([]);
  await page.locator('#player-art-button').click();
  const focus = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(
    focus.violations.map((item) => ({ id: item.id, nodes: item.nodes.map((node) => node.target) })),
  ).toEqual([]);
});

test('invalid saved progress is ignored and seeking back to zero persists', async ({ page }) => {
  await page.evaluate(() =>
    localStorage.setItem(
      'audiora-listening-v1',
      JSON.stringify({ progress: { 'quiet-hours-01': { position: 'bad' } } }),
    ),
  );
  await page.reload();
  await expect(page.locator('.episode-card')).toHaveCount(8);
  await expect
    .poll(() => page.locator('#audio').evaluate((audio) => audio.readyState))
    .toBeGreaterThan(0);
  await page.locator('#player-seek').fill('10');
  await page.locator('#player-seek').fill('0');
  await page.reload();
  await expect
    .poll(() => page.locator('#audio').evaluate((audio) => audio.readyState))
    .toBeGreaterThan(0);
  expect(await page.locator('#audio').evaluate((audio) => audio.currentTime)).toBe(0);
});

test('creator publishes a real MP3 then finds and plays it after reload', async ({ page }) => {
  await page.locator('.top-studio').click();
  await expect(page.locator('#studio-fields')).toBeEnabled();
  await page.locator('#studio-file').setInputFiles(path.join(project, 'media/audiora-preview.mp3'));
  await expect(page.locator('#file-status')).toContainText('ready to publish');
  const title = 'ಪರೀಕ್ಷೆ · An original test recording';
  await page.locator('[name="title"]').fill(title);
  await page.locator('[name="show"]').fill('Audiora browser verification');
  await page.locator('[name="host"]').fill('Test creator');
  await page
    .locator('textarea[name="description"]')
    .fill('Original test audio. Literal text stays safe: <img src=x onerror=alert(1)>');
  await page.locator('[name="language"]').selectOption('kn');
  await page.locator('#studio-token').fill(token);
  await page.locator('#studio-submit').click();
  await expect(page.locator('#studio-status')).toContainText('published and ready to listen');
  await expect(page.locator('#studio-token')).toHaveValue('');
  await page.keyboard.press('Escape');
  await page.reload();
  await page.locator('#search-input').fill(title);
  await expect(page.locator('.episode-card')).toHaveCount(1);
  await page.locator('.episode-title').click();
  await expect(page.locator('.detail-description')).toContainText('<img src=x onerror=alert(1)>');
  await expect(page.locator('.detail-description img')).toHaveCount(0);
  await page.locator('#episode-dialog [data-play]').click();
  await expect(page.locator('#player-title')).toHaveText(title);
  await expect
    .poll(() => page.locator('#audio').evaluate((audio) => audio.currentTime))
    .toBeGreaterThan(0.1);
  expect(
    await page.evaluate(() => Object.values(localStorage).join(' ').includes('Bearer')),
  ).toBeFalsy();
});
