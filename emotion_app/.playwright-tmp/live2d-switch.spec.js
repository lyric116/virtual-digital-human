const { test, expect } = require('/home/lyricx/.nvm/versions/node/v22.21.1/lib/node_modules/playwright/test');

test('captures avatar switch states', async ({ page }) => {
  await page.goto('http://127.0.0.1:4174', { waitUntil: 'networkidle' });
  await expect(page.getByText('和光心苑')).toBeVisible();
  await page.addStyleTag({ content: `*, *::before, *::after { animation: none !important; transition: none !important; }` });

  const avatarSurface = page.locator('[data-testid="assistant-avatar-surface"]');
  await expect(avatarSurface).toBeVisible();
  await expect(avatarSurface.getByText('莉莉').first()).toBeVisible();
  const lilyLive2D = avatarSurface.locator('[data-live2d-state]');
  await expect(lilyLive2D).toHaveCount(1);
  await expect(lilyLive2D).toHaveAttribute('data-live2d-state', /ready|fallback|error/);
  await page.screenshot({ path: '.playwright-tmp/avatar-lily.png', fullPage: true });

  await page.getByRole('button', { name: '引导角色 B' }).click();
  await expect(avatarSurface.getByText('引导角色 B').first()).toBeVisible();
  const chitoseLive2D = avatarSurface.locator('[data-live2d-state]');
  await expect(chitoseLive2D).toHaveCount(1);
  await expect(chitoseLive2D).toHaveAttribute('data-live2d-state', /ready|fallback|error/);
  await page.screenshot({ path: '.playwright-tmp/avatar-chitose.png', fullPage: true });
});
