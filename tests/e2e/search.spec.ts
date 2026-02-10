import { test, expect } from '@playwright/test'

test.describe('Search functionality', () => {
  test('search box is displayed', async ({ page }) => {
    await page.goto('./en/')
    // VitePress local search button
    const searchButton = page.locator('#navbar button[aria-label*="Search"], .VPNavBarSearch button, button.DocSearch-Button, .VPNavBarSearchButton')
    await expect(searchButton.first()).toBeVisible()
  })

  test('search for "Vela" returns results', async ({ page }) => {
    await page.goto('./en/')
    // Click the search button to open the search modal
    const searchButton = page.locator('#navbar button[aria-label*="Search"], .VPNavBarSearch button, button.DocSearch-Button, .VPNavBarSearchButton')
    await searchButton.first().click()

    // Type in the search input
    const searchInput = page.locator('#localsearch-input, .search-input, input[type="search"], input[aria-label*="Search"]')
    await expect(searchInput.first()).toBeVisible({ timeout: 5000 })
    await searchInput.first().fill('Vela')

    // Wait for results to appear
    const results = page.locator('#localsearch-list .result, .search-result, [class*="result"]')
    await expect(results.first()).toBeVisible({ timeout: 10000 })
  })
})
