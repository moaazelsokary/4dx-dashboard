import { test, expect } from '@playwright/test';

test.describe('Basic E2E Tests', () => {
  test('should load the sign-in page', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Strategic Plan/i);
  });

  test('should display navigation after login', async ({ page }) => {
    // This test would require authentication setup
    // For now, it's a placeholder
    await page.goto('/');
    // Add authentication steps here
  });

  test('should be responsive on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    // Check that layout is responsive
    const header = page.locator('header');
    await expect(header).toBeVisible();
  });
});

