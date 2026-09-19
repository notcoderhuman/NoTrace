import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const fixturePath = resolve(process.cwd(), 'public/placeholder.jpg')
const fixtureBytes = readFileSync(fixturePath)

async function expectLocalInspection(page: Page) {
  await expect(page.getByRole('heading', { name: 'Under the surface' })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole('img', { name: /privacy risk \d+ out of 100/i })).toBeVisible()
  await expect(page.locator('.inspect-risk').getByText('Methodology: notrace-metadata-exposure v1')).toBeVisible()
}

test.describe('NoTrace local file flows', () => {
  test('loads /inspect and admits a JPEG through Browse Files', async ({ page }) => {
    await page.goto('/inspect')
    await expect(page.getByRole('heading', { name: /Under the surface/i })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Browse Files' })).toBeVisible()
    await expect(page.getByText('JPEG / JPG / PNG inspection')).toBeVisible()

    const chooser = page.waitForEvent('filechooser')
    await page.getByRole('button', { name: 'Browse Files' }).click()
    await (await chooser).setFiles({ name: 'browser-fixture.jpg', mimeType: 'image/jpeg', buffer: fixtureBytes })

    await expect(page.getByRole('button', { name: 'Select browser-fixture.jpg' })).toBeVisible({ timeout: 10_000 })
    await expectLocalInspection(page)
  })

  test('admits the same JPEG through drag and drop', async ({ page }) => {
    await page.goto('/inspect')
    const dropZone = page.locator('.drop-zone').first()
    await expect(dropZone).toBeVisible()

    const dataTransfer = await page.evaluateHandle(({ name, type, bytes }) => {
      const transfer = new DataTransfer()
      transfer.items.add(new File([new Uint8Array(bytes)], name, { type }))
      return transfer
    }, { name: 'dropped-fixture.jpg', type: 'image/jpeg', bytes: [...fixtureBytes] })
    await dropZone.dispatchEvent('drop', { dataTransfer })
    await dataTransfer.dispose()

    await expect(page.getByRole('button', { name: 'Select dropped-fixture.jpg' })).toBeVisible({ timeout: 10_000 })
    await expectLocalInspection(page)
  })

  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1280, height: 800 },
    { width: 1024, height: 768 },
    { width: 768, height: 1024 },
    { width: 430, height: 932 },
    { width: 390, height: 844 },
    { width: 360, height: 800 },
  ]) {
    test(`has no page overflow at ${viewport.width}x${viewport.height}`, async ({ page }) => {
      await page.setViewportSize(viewport)
      await page.goto('/inspect')
      await expect(page.getByRole('button', { name: 'Browse Files' })).toBeVisible()
      const dimensions = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }))
      expect(dimensions.scrollWidth, `page overflow at ${viewport.width}x${viewport.height}`).toBe(dimensions.clientWidth)
    })
  }
})
