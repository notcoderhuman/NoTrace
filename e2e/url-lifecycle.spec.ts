import { expect, test } from '@playwright/test'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = readFileSync(resolve(process.cwd(), 'e2e/fixtures/removable.jpg'))

test('verified removal download accounts for object URL cleanup', async ({ page }) => {
  await page.addInitScript(() => {
    const created: string[] = []
    const revoked: string[] = []
    const originalCreate = URL.createObjectURL.bind(URL)
    const originalRevoke = URL.revokeObjectURL.bind(URL)
    URL.createObjectURL = value => { const url = originalCreate(value); created.push(url); return url }
    URL.revokeObjectURL = url => { revoked.push(url); originalRevoke(url) }
    Object.defineProperty(window, '__urlLifecycle', { value: { created, revoked }, configurable: true })
  })
  await page.goto('/inspect')
  await page.locator('input[aria-label="Choose local JPEG files"]').setInputFiles({ name: 'url-fixture.jpg', mimeType: 'image/jpeg', buffer: source })
  await expect(page.getByRole('link', { name: /Choose a cleanup policy/i })).toBeVisible({ timeout: 15_000 })
  await page.getByRole('link', { name: /Choose a cleanup policy/i }).click()
  await expect(page.getByRole('checkbox', { name: /JPEG comment/i }).first()).toBeVisible({ timeout: 15_000 })
  await page.getByRole('checkbox', { name: /JPEG comment/i }).first().check()
  await page.getByRole('button', { name: 'Remove and verify' }).first().click()
  await page.getByRole('dialog', { name: 'Review local removal' }).getByRole('button', { name: 'Remove and verify' }).click()
  await expect(page.getByRole('heading', { name: 'Verified output is ready in memory.' })).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('.verification-stage').getByText('INDEPENDENT VERIFICATION')).toBeVisible()
  await expect(page.getByText('Passed', { exact: true })).toBeVisible()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download verified JPEG' }).click()
  const download = await downloadPromise
  expect(await download.path()).not.toBeNull()
  const lifecycle = await page.evaluate(() => (window as any).__urlLifecycle)
  expect(lifecycle.created.length).toBeGreaterThanOrEqual(2)
  const downloadUrl = lifecycle.created.at(-1)
  expect(downloadUrl).toBeDefined()
  expect(lifecycle.revoked).toContain(downloadUrl)
  expect(new Set(lifecycle.revoked).size).toBe(lifecycle.revoked.length)
  expect(lifecycle.revoked.filter((url: string) => url === downloadUrl)).toHaveLength(1)
})

test('two rapid verified downloads each complete', async ({ page }) => {
  await page.goto('/inspect')
  await page.locator('input[aria-label="Choose local JPEG files"]').setInputFiles({ name: 'rapid-fixture.jpg', mimeType: 'image/jpeg', buffer: source })
  await expect(page.getByRole('link', { name: /Choose a cleanup policy/i })).toBeVisible({ timeout: 15_000 })
  await page.getByRole('link', { name: /Choose a cleanup policy/i }).click()
  await expect(page.getByRole('checkbox', { name: /JPEG comment/i }).first()).toBeVisible({ timeout: 15_000 })
  await page.getByRole('checkbox', { name: /JPEG comment/i }).first().check()
  await page.getByRole('button', { name: 'Remove and verify' }).first().click()
  await page.getByRole('dialog', { name: 'Review local removal' }).getByRole('button', { name: 'Remove and verify' }).click()
  await expect(page.getByRole('heading', { name: 'Verified output is ready in memory.' })).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('.verification-stage').getByText('INDEPENDENT VERIFICATION')).toBeVisible()
  await expect(page.getByText('Passed', { exact: true })).toBeVisible()
  const first = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download verified JPEG' }).click()
  const firstDownload = await first
  const second = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download verified JPEG' }).click()
  const secondDownload = await second
  expect(await firstDownload.path()).not.toBeNull()
  expect(await secondDownload.path()).not.toBeNull()
})
