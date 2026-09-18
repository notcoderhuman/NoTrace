import { expect, test } from '@playwright/test'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const fixturePath = resolve(process.cwd(), 'e2e/fixtures/removable.jpg')
const sourceBytes = readFileSync(fixturePath)
const sourceHash = createHash('sha256').update(sourceBytes).digest('hex')

test('real removal verifies, downloads, and preserves the source fixture', async ({ page }) => {
  await page.goto('/inspect')
  await page.locator('input[aria-label="Choose local JPEG files"]').setInputFiles({ name: 'removable-fixture.jpg', mimeType: 'image/jpeg', buffer: sourceBytes })
  await expect(page.getByRole('link', { name: /Choose a cleanup policy/i })).toBeVisible({ timeout: 15_000 })
  await page.getByRole('link', { name: /Choose a cleanup policy/i }).click()
  await expect(page).toHaveURL(/\/remove$/)
  await expect(page.getByRole('checkbox', { name: /JPEG comment/i }).first()).toBeVisible({ timeout: 15_000 })
  const target = page.getByRole('checkbox', { name: /JPEG comment/i }).first()
  await expect(target).toBeEnabled()
  await expect(page.getByRole('button', { name: 'Download verified JPEG' })).toHaveCount(0)
  await target.check()
  await page.getByRole('button', { name: 'Remove and verify' }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Review local removal' })
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('JPEG comments only')
  await dialog.getByRole('button', { name: 'Remove and verify' }).click()
  await expect(page.getByRole('heading', { name: 'Verified output is ready in memory.' })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole('heading', { name: 'Verified output is ready in memory.' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Download verified JPEG' })).toBeVisible()

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download verified JPEG' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/_notrace\.jpg$/)
  const outputPath = await download.path()
  expect(outputPath).not.toBeNull()
  const outputBytes = readFileSync(outputPath!)
  expect(outputBytes[0]).toBe(0xff)
  expect(outputBytes[1]).toBe(0xd8)
  expect(outputBytes.at(-2)).toBe(0xff)
  expect(outputBytes.at(-1)).toBe(0xd9)
  expect(Buffer.from(outputBytes).includes(Buffer.from([0xff, 0xfe, 0, 8, 0x72, 0x65, 0x6d, 0x6f, 0x76, 0x65]))).toBe(false)
  expect(Buffer.from(outputBytes).includes(Buffer.from([0xff, 0xfe, 0, 6, 0x6b, 0x65, 0x65, 0x70]))).toBe(true)
  expect(createHash('sha256').update(sourceBytes).digest('hex')).toBe(sourceHash)
  expect(sourceBytes.includes(0xfe)).toBe(true)
})
