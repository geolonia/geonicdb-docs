import { test, expect } from '@playwright/test'

test.describe('Navigation', () => {
  test('sidebar is displayed on content page', async ({ page }) => {
    await page.goto('./en/introduction/what-is-vela')
    const sidebar = page.locator('.VPSidebar')
    await expect(sidebar).toBeVisible()
  })

  test('sidebar link navigates to target page', async ({ page }) => {
    await page.goto('./en/introduction/what-is-vela')
    const link = page.locator('.VPSidebar a', { hasText: 'Why Vela?' })
    await link.click()
    await page.waitForURL(/\/en\/introduction\/why-vela/)
    await expect(page.locator('h1')).toContainText('Why Vela')
  })
})
