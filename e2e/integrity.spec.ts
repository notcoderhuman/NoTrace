import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const fixtureBytes = readFileSync(resolve(process.cwd(), 'public/placeholder.jpg'))

test.describe('NoTrace browser integrity and privacy guards', () => {
  let pageErrors: string[]
  let consoleErrors: string[]
  let suspiciousExternalRequests: Array<{ origin: string; method: string; resourceType: string; hasBody: boolean }>

  test.beforeEach(async ({ page, baseURL }) => {
    pageErrors = []
    consoleErrors = []
    suspiciousExternalRequests = []
    const appOrigin = new URL(baseURL || 'http://127.0.0.1:3000').origin
    page.on('pageerror', error => pageErrors.push(error.message))
    page.on('console', message => {
      if (message.type() === 'error') consoleErrors.push(message.text())
    })
    page.on('request', request => {
      const url = new URL(request.url())
      const hasBody = Boolean(request.postDataBuffer()?.byteLength)
      if (url.origin !== appOrigin && (request.method() !== 'GET' || hasBody)) {
        suspiciousExternalRequests.push({ origin: url.origin, method: request.method(), resourceType: request.resourceType(), hasBody })
      }
    })
  })

  test.afterEach(async () => {
    expect(pageErrors, `unexpected page errors: ${pageErrors.join(' | ')}`).toEqual([])
    expect(consoleErrors, `unexpected console errors: ${consoleErrors.join(' | ')}`).toEqual([])
    expect(suspiciousExternalRequests, `external data-bearing requests: ${JSON.stringify(suspiciousExternalRequests)}`).toEqual([])
  })

  async function admit(page: Page, name: string) {
    const chooser = page.waitForEvent('filechooser')
    await page.getByRole('button', { name: 'Browse Files' }).click()
    await (await chooser).setFiles({ name, mimeType: 'image/jpeg', buffer: fixtureBytes })
    await expect(page.getByRole('button', { name: `Select ${name}` })).toBeVisible({ timeout: 10_000 })
    await expect(page.getByRole('heading', { name: 'Under the surface' })).toBeVisible({ timeout: 15_000 })
  }

  test('detects no runtime errors and sends no data-bearing external request during browse inspection', async ({ page }) => {
    await page.goto('/inspect')
    await admit(page, 'integrity-browse.jpg')
    await expect(page.getByRole('img', { name: /privacy risk \d+ out of 100/i })).toBeVisible()
    await expect(page.locator('.inspect-risk').getByText('Methodology: notrace-metadata-exposure v1')).toBeVisible()
  })

  test('detects no runtime errors and sends no data-bearing external request during drag inspection', async ({ page }) => {
    await page.goto('/inspect')
    const transfer = await page.evaluateHandle(({ bytes }) => {
      const dataTransfer = new DataTransfer()
      dataTransfer.items.add(new File([new Uint8Array(bytes)], 'integrity-drop.jpg', { type: 'image/jpeg' }))
      return dataTransfer
    }, { bytes: [...fixtureBytes] })
    await page.locator('.drop-zone').first().dispatchEvent('drop', { dataTransfer: transfer })
    await transfer.dispose()
    await expect(page.getByRole('button', { name: 'Select integrity-drop.jpg' })).toBeVisible({ timeout: 10_000 })
    await expect(page.getByRole('img', { name: /privacy risk \d+ out of 100/i })).toBeVisible({ timeout: 15_000 })
  })

  test('reselects the same logical file through the reset native input', async ({ page }) => {
    await page.goto('/inspect')
    await admit(page, 'same-file.jpg')
    const picker = page.locator('input[aria-label="Add local JPEG files"]')
    await picker.setInputFiles({ name: 'same-file.jpg', mimeType: 'image/jpeg', buffer: fixtureBytes })
    await expect(page.getByRole('button', { name: 'Select same-file.jpg' })).toHaveCount(2, { timeout: 10_000 })
    await expect(page.getByRole('img', { name: /privacy risk \d+ out of 100/i })).toBeVisible()
  })

  test('switches active selection without stale identity or risk presentation', async ({ page }) => {
    await page.goto('/inspect')
    await admit(page, 'file-a.jpg')
    await page.getByRole('button', { name: 'Add more files' }).click()
    const picker = page.locator('input[aria-label="Add local JPEG files"]')
    await picker.setInputFiles({ name: 'file-b.jpg', mimeType: 'image/jpeg', buffer: fixtureBytes })
    await expect(page.getByRole('button', { name: 'Select file-b.jpg' })).toBeVisible({ timeout: 10_000 })
    await expect(page.getByRole('button', { name: 'Select file-b.jpg' })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('button', { name: 'Select file-a.jpg' })).toHaveAttribute('aria-pressed', 'false')
    await expect(page.locator('#inspect-source-title')).toHaveText('file-b.jpg')
    await expect(page.locator('.inspect-risk').getByText('Methodology: notrace-metadata-exposure v1')).toBeVisible({ timeout: 15_000 })
  })

  test('exposes a retryable failed state for malformed JPEG bytes', async ({ page }) => {
    await page.goto('/inspect')
    const malformed = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0, 20, 0x45])
    await page.locator('input[aria-label="Choose local JPEG files"]').setInputFiles({ name: 'malformed.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(malformed) })
    await expect(page.getByRole('button', { name: 'Select malformed.jpg' })).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(/inspection could not be completed/i)).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('button', { name: 'Retry inspection' })).toBeVisible()
    await page.getByRole('button', { name: 'Retry inspection' }).click()
    await expect(page.getByText(/inspection could not be completed/i)).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('button', { name: 'Retry inspection' })).toBeVisible()
    await expect(page.getByRole('img', { name: /privacy risk — out of 100/i })).toHaveCount(0)
  })
})
