import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test('should sign in with valid credentials', async ({ page }) => {
    await page.goto('/');
    
    await page.fill('[name="username"]', 'CEO');
    await page.fill('[name="password"]', 'Life@2025');
    await page.click('button[type="submit"]');
    
    // Wait for navigation
    await page.waitForURL('**/main-plan', { timeout: 5000 });
    expect(page.url()).toContain('/main-plan');
  });

  test('should show error with invalid credentials', async ({ page }) => {
    await page.goto('/');
    
    await page.fill('[name="username"]', 'invalid');
    await page.fill('[name="password"]', 'wrong');
    await page.click('button[type="submit"]');
    
    // Wait for error message
    await expect(page.locator('text=Sign in failed')).toBeVisible();
  });

  test('should redirect to sign in when not authenticated', async ({ page }) => {
    await page.goto('/dashboard');
    
    // Should redirect to sign in
    await page.waitForURL('**/', { timeout: 5000 });
    expect(page.url()).toContain('/');
  });
});

