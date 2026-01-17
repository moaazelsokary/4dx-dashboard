import { test, expect } from '@playwright/test';

test.describe('Department Objectives', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to sign-in page
    await page.goto('/');
    
    // Wait for sign-in form
    await page.waitForSelector('input[type="text"], input[name="username"]', { timeout: 10000 });
    
    // Sign in with test credentials (adjust based on your test user)
    const usernameInput = page.locator('input[type="text"], input[name="username"]').first();
    const passwordInput = page.locator('input[type="password"], input[name="password"]').first();
    
    await usernameInput.fill('hr'); // Use a department user
    await passwordInput.fill('Life@0000'); // Adjust password as needed
    
    // Click sign in button
    const signInButton = page.locator('button:has-text("Sign In"), button[type="submit"]').first();
    await signInButton.click();
    
    // Wait for navigation to department objectives page
    await page.waitForURL('**/department-objectives', { timeout: 15000 });
    
    // Wait for the page to load
    await page.waitForLoadState('networkidle');
  });

  test('should display objectives table', async ({ page }) => {
    // Check if table exists
    const table = page.locator('table').first();
    await expect(table).toBeVisible({ timeout: 10000 });
    
    // Check if table headers are visible
    await expect(page.locator('th:has-text("KPI")')).toBeVisible();
    await expect(page.locator('th:has-text("Activity")')).toBeVisible();
  });

  test('should add new objective and see it in table', async ({ page }) => {
    // Wait for table to load
    await page.waitForSelector('table', { timeout: 10000 });
    
    // Count initial objectives
    const initialRows = await page.locator('tbody tr').count();
    console.log(`Initial objectives count: ${initialRows}`);
    
    // Click "Add Objective" button
    const addButton = page.locator('button:has-text("Add Objective"), button:has-text("Add")').first();
    await addButton.click();
    
    // Wait for form to appear (either modal or inline form)
    await page.waitForTimeout(500);
    
    // Fill in the form fields
    // Look for KPI input/select
    const kpiInput = page.locator('input[placeholder*="KPI"], select, [role="combobox"]').first();
    if (await kpiInput.isVisible()) {
      await kpiInput.click();
      await page.waitForTimeout(300);
      // Select first available KPI option
      const firstKPI = page.locator('[role="option"], select option').first();
      if (await firstKPI.isVisible()) {
        await firstKPI.click();
      }
    }
    
    // Fill activity
    const activityInput = page.locator('input[placeholder*="Activity"], input[name="activity"]').first();
    await activityInput.fill('Test Activity from E2E Test');
    
    // Fill activity target
    const targetInput = page.locator('input[placeholder*="Target"], input[name="activity_target"], input[type="number"]').first();
    await targetInput.fill('100');
    
    // Fill responsible person
    const responsibleInput = page.locator('input[placeholder*="Responsible"], input[name="responsible_person"]').first();
    await responsibleInput.fill('Test Person');
    
    // Fill MOV
    const movInput = page.locator('input[placeholder*="MOV"], textarea[name="mov"]').first();
    await movInput.fill('Test MOV');
    
    // Select type if there's a select dropdown
    const typeSelect = page.locator('select[name="type"], [role="combobox"]:has-text("Type")').first();
    if (await typeSelect.isVisible()) {
      await typeSelect.click();
      await page.waitForTimeout(200);
      const directOption = page.locator('[role="option"]:has-text("Direct"), option:has-text("Direct")').first();
      if (await directOption.isVisible()) {
        await directOption.click();
      }
    }
    
    // Click save button
    const saveButton = page.locator('button:has-text("Save"), button:has-text("Create"), button[type="submit"]').first();
    await saveButton.click();
    
    // Wait for success toast
    await page.waitForSelector('[role="alert"], .toast, [data-testid="toast"]', { timeout: 10000 });
    
    // Wait a bit for the optimistic update
    await page.waitForTimeout(1000);
    
    // Check if new row appears in table
    const newRows = await page.locator('tbody tr').count();
    console.log(`New objectives count: ${newRows}`);
    
    // The new objective should be visible
    await expect(page.locator('tbody tr:has-text("Test Activity from E2E Test")')).toBeVisible({ timeout: 10000 });
    
    // Verify the objective data is displayed
    const newRow = page.locator('tbody tr:has-text("Test Activity from E2E Test")').first();
    await expect(newRow.locator('td:has-text("Test Activity from E2E Test")')).toBeVisible();
    await expect(newRow.locator('td:has-text("Test Person")')).toBeVisible();
  });

  test('should show error if required fields are missing', async ({ page }) => {
    // Click "Add Objective" button
    const addButton = page.locator('button:has-text("Add Objective"), button:has-text("Add")').first();
    await addButton.click();
    
    await page.waitForTimeout(500);
    
    // Try to save without filling required fields
    const saveButton = page.locator('button:has-text("Save"), button:has-text("Create"), button[type="submit"]').first();
    await saveButton.click();
    
    // Should show error message
    await expect(page.locator('text=/required|fill|missing/i')).toBeVisible({ timeout: 5000 });
  });
});
