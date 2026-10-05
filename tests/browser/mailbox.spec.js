import { test, expect } from '@playwright/test';
const reply = 'Hi Alex, thank you for your application to Acme. Unfortunately we cannot proceed. Contact alex@example.com.';
test.beforeEach(async ({ request }) => { await request.get('/__test/reset'); });

test('paste → detection → actual preview → confirm → private receipt → review → public inclusion', async ({ page, request }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/'); await expect(page.getByText('nothing here yet.', { exact: false })).toBeVisible();
  await page.getByRole('link', { name: 'bring yours here' }).click(); await expect(page).toHaveURL(/submit.html$/);
  await page.getByRole('button', { name: 'preview what will be shared' }).click(); await expect(page.locator('#error')).toContainText('Paste');
  await page.locator('#response').fill(reply);
  await page.getByRole('button', { name: 'preview what will be shared' }).click();
  await expect(page.locator('#preview')).toBeVisible(); await expect(page.locator('#preview .redaction')).toHaveCount(3);
  const previewText = await page.locator('#preview-text').textContent();
  expect(previewText).not.toMatch(/Alex|Acme|alex@example/);
  await page.screenshot({ path: 'test-results/preview-desktop.png', fullPage: true });
  expect((await (await request.get('/__test/state')).json()).rows).toHaveLength(0);
  await page.getByRole('button', { name: 'submit this version' }).click(); await expect(page.locator('#success')).toBeVisible();
  const state = await (await request.get('/__test/state')).json();
  expect(state.rows).toHaveLength(1); expect(state.originals).toBe(0); expect(JSON.stringify(state.rows)).not.toMatch(/Alex|Acme|alex@example/);
  await page.getByRole('link', { name: 'hear one first' }).click();
  await expect(page.locator('#hear')).toBeHidden();
  expect(state.rows[0].approved_at).toBeNull();
  await request.get('/__test/approve'); await page.reload();
  await expect(page.locator('.particle').first()).toBeVisible(); await page.getByRole('button', { name: 'hear one first' }).click();
  await expect(page.locator('#reading-text')).toHaveText(previewText); await expect(page.locator('#reading .redaction')).toHaveCount(3);
  expect(errors).toEqual([]);
});

test('preview stays local and editing requires a new preview',async({page})=>{
  const api=[];page.on('request',r=>{if(r.url().includes('/rest/')||r.url().includes('/functions/')||r.url().includes('openai'))api.push(r.url());});
  await page.goto('/submit.html');await page.locator('#response').fill(reply);await page.locator('#preview-button').click();await expect(page.locator('#preview')).toBeVisible();expect(api).toEqual([]);
  await page.locator('#edit').click();await expect(page.locator('#preview')).toBeHidden();await page.locator('#response').fill('很遗憾，我们无法继续。');await page.locator('#preview-button').click();await expect(page.locator('#preview-text')).toHaveText('很遗憾，我们无法继续。');expect(api).toEqual([]);
  await page.locator('#confirm').click();await expect(page.locator('#success')).toBeVisible();expect(api).toHaveLength(1);
});

test('no-response mobile flow and retry after uncertain save preserve one row', async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/submit.html');
  await page.getByRole('button', { name: 'I heard nothing' }).click(); await page.locator('#days').fill('14');
  await page.locator('#preview-button').click(); await expect(page.locator('#preview-text')).toContainText('14 days');
  await request.get('/__test/scenario?value=save-uncertain');
  await page.locator('#confirm').click(); await expect(page.locator('#confirm-error')).toContainText('try again');
  await page.locator('#confirm').click(); await expect(page.locator('#success')).toBeVisible();
  const state = await (await request.get('/__test/state')).json(); expect(state.rows).toHaveLength(1);
  await page.screenshot({ path: 'test-results/success-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('failed submission preserves preview and never reports success',async({page,request})=>{
 await page.goto('/submit.html');await page.locator('#response').fill(reply);await page.locator('#preview-button').click();await expect(page.locator('#preview')).toBeVisible();await request.get('/__test/scenario?value=rate-limit');await page.locator('#confirm').click();await expect(page.locator('#confirm-error')).toBeVisible();await expect(page.locator('#success')).toBeHidden();await expect(page.locator('#preview')).toBeVisible();expect((await(await request.get('/__test/state')).json()).rows).toHaveLength(0);
});

test('collection typography, motion, mobile and public error state', async ({ page, request }) => {
  await request.get('/__test/seed'); await page.setViewportSize({ width: 1440, height: 1000 }); await page.goto('/');
  await expect(page.locator('.particle').first()).toBeVisible(); await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.fonts.check('12px "ABC Areal Mono"'))).toBe(true);
  expect(await page.locator('.particle').first().evaluate(el => getComputedStyle(el).fontSize)).toBe('12px');
  await page.screenshot({ path: 'test-results/collection-desktop.png', fullPage: true });
  await page.locator('#motion').click(); await expect(page.locator('#motion')).toHaveText('resume movement');
  const before = await page.locator('.particle').first().getAttribute('style'); await page.waitForTimeout(200); expect(await page.locator('.particle').first().getAttribute('style')).toBe(before);
  await page.setViewportSize({ width: 390, height: 844 }); await page.screenshot({ path: 'test-results/collection-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'privacy declaration', exact: true }).click(); await expect(page.locator('#privacy')).toBeVisible(); await page.keyboard.press('Escape'); await expect(page.locator('#privacy')).toBeHidden();
  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.reload(); await expect(page.locator('.particle').first()).toBeVisible();
  const still = await page.locator('.particle').first().getAttribute('style'); await page.waitForTimeout(200); expect(await page.locator('.particle').first().getAttribute('style')).toBe(still);
  await request.get('/__test/scenario?value=collection-offline'); await page.reload(); await expect(page.locator('#retry')).toBeVisible();
  await request.get('/__test/scenario?value=normal'); await page.locator('#retry').click(); await expect(page.locator('.particle').first()).toBeVisible();
});

test('expired preview returns to editing without discarding the original', async ({ page }) => {
  await page.clock.install(); await page.goto('/submit.html'); await page.locator('#response').fill(reply);
  await page.locator('#preview-button').click(); await expect(page.locator('#preview')).toBeVisible();
  await page.clock.setFixedTime(new Date(Date.now() + 31 * 60 * 1000));
  await page.locator('#confirm').click(); await expect(page.locator('#preview')).toBeHidden();
  await expect(page.locator('#response')).toHaveValue(reply); await expect(page.locator('#error')).toContainText('preview');
  await expect(page.locator('#preview-button')).toBeFocused();
});
