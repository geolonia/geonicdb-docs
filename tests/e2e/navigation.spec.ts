import { test, expect } from '@playwright/test'

test.describe('Navigation', () => {
  test('sidebar is displayed on content page', async ({ page }) => {
    await page.goto('./en/introduction/what-is-geonicdb')
    const sidebar = page.locator('.VPSidebar')
    await expect(sidebar).toBeVisible()
  })

  test('sidebar link navigates to target page', async ({ page }) => {
    await page.goto('./en/introduction/what-is-geonicdb')
    const link = page.locator('.VPSidebar a', { hasText: 'Why GeonicDB?' })
    await link.click()
    await page.waitForURL(/\/en\/introduction\/why-geonicdb/)
    await expect(page.locator('h1')).toContainText('Why GeonicDB')
  })
})
