import { test, expect } from '@playwright/test'

test.describe('Home page', () => {
  test('root redirects to /en/', async ({ page }) => {
    await page.goto('./')
    await page.waitForURL(/\/en\//)
    expect(page.url()).toContain('/en/')
  })

  test('/en/ displays Vela OS hero', async ({ page }) => {
    await page.goto('./en/')
    const hero = page.locator('.VPHero .name')
    await expect(hero).toContainText('Vela OS')
  })

  test('/ja/ displays Vela OS hero', async ({ page }) => {
    await page.goto('./ja/')
    const hero = page.locator('.VPHero .name')
    await expect(hero).toContainText('Vela OS')
  })
})
