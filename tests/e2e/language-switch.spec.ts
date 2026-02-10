import { test, expect } from '@playwright/test'

test.describe('Language switching', () => {
  test('EN to JA switch', async ({ page }) => {
    await page.goto('./en/introduction/what-is-vela')
    await expect(page.locator('h1')).toBeVisible()

    // Navigate to JA equivalent page
    await page.goto('./ja/introduction/what-is-vela')
    await expect(page.locator('h1')).toBeVisible()
    expect(page.url()).toContain('/ja/')
  })

  test('JA to EN switch', async ({ page }) => {
    await page.goto('./ja/introduction/what-is-vela')
    await expect(page.locator('h1')).toBeVisible()

    await page.goto('./en/introduction/what-is-vela')
    await expect(page.locator('h1')).toBeVisible()
    expect(page.url()).toContain('/en/')
  })
})
