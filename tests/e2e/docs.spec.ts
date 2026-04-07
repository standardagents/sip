import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const largeJpegPath = path.join(repoRoot, 'tests', 'fixtures', 'large.jpg');

test('docs demo uploads and resizes a large image', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Try it' })).toBeVisible();

  await page.getByTestId('demo-file-input').setInputFiles(largeJpegPath);
  await expect(page.getByTestId('demo-input-info')).toContainText('JPEG');

  await page.getByTestId('demo-width-input').fill('1024');
  await page.getByTestId('demo-height-input').fill('1024');
  await page.getByTestId('demo-quality-input').fill('82');
  await page.getByTestId('demo-process-button').click();

  await page.waitForFunction(() => {
    const error = document.querySelector('[data-testid="demo-error"]')?.textContent?.trim();
    const output = document.querySelector('[data-testid="demo-output-info"]')?.textContent?.trim();
    return Boolean(error) || Boolean(output?.startsWith('Output:'));
  }, undefined, { timeout: 120_000 });

  const errorText = (await page.getByTestId('demo-error').textContent())?.trim() ?? '';
  expect(errorText).toBe('');

  const outputInfo = page.getByTestId('demo-output-info');
  await expect(outputInfo).toContainText('Output: JPEG');
  await expect(outputInfo).toContainText('peak SIP memory');

  await page.waitForFunction(() => {
    const image = document.querySelector('[data-testid="demo-output-image"]');
    return image instanceof HTMLImageElement && image.naturalWidth > 0 && image.naturalHeight > 0;
  }, undefined, { timeout: 120_000 });

  const dimensions = await page.getByTestId('demo-output-image').evaluate((node) => {
    const image = node as HTMLImageElement;
    return {
      naturalWidth: image.naturalWidth,
      naturalHeight: image.naturalHeight,
    };
  });

  expect(dimensions.naturalWidth).toBeGreaterThan(0);
  expect(dimensions.naturalHeight).toBeGreaterThan(0);
  expect(dimensions.naturalWidth).toBeLessThanOrEqual(1024);
  expect(dimensions.naturalHeight).toBeLessThanOrEqual(1024);
});
