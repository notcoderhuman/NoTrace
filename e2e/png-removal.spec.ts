import { expect, test } from '@playwright/test'
import { createHash } from 'node:crypto'

const signature = [137,80,78,71,13,10,26,10]
function crc(bytes: number[]) { let c = 0xffffffff; for (const b of bytes) { c ^= b; for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0) }; return (c ^ 0xffffffff) >>> 0 }
function chunk(type: string, data: number[]) { const t = [...Buffer.from(type, 'ascii')]; const body = [...t, ...data]; const out = Buffer.alloc(12 + data.length); out.writeUInt32BE(data.length, 0); Buffer.from(t).copy(out, 4); Buffer.from(data).copy(out, 8); out.writeUInt32BE(crc(body), 8 + data.length); return [...out] }
const sourceBytes = Buffer.from([...signature, ...chunk('IHDR', [0,0,0,1,0,0,0,1,8,2,0,0,0]), ...chunk('tEXt', [...Buffer.from('Comment'),0,1,2,3]), ...chunk('tEXt', [...Buffer.from('Note'),0,4,5,6]), ...chunk('eXIf', [1,2,3]), ...chunk('IDAT', [0,0,0,0]), ...chunk('IEND', [])])
const sourceHash = createHash('sha256').update(sourceBytes).digest('hex')

test('real PNG picker removal verifies, downloads, and preserves source', async ({ page }) => {
  await page.goto('/inspect')
  await page.locator('input[aria-label="Choose local JPEG or PNG files"]').setInputFiles({ name: 'removable-fixture.png', mimeType: 'image/png', buffer: sourceBytes })
  await expect(page.getByRole('button', { name: 'Select removable-fixture.png' })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole('link', { name: /Choose a cleanup policy/i })).toBeVisible({ timeout: 15_000 })
  await page.getByRole('link', { name: /Choose a cleanup policy/i }).click()
  await expect(page).toHaveURL(/\/remove$/)
  const targets = page.locator('input[type="checkbox"]:enabled')
  await expect(targets).toHaveCount(2, { timeout: 15_000 })
  await targets.first().check()
  await page.getByRole('button', { name: 'Remove and verify' }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Review local removal' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Remove and verify' }).click()
  await expect(page.getByRole('heading', { name: 'Verified output is ready in memory.' })).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('.verification-stage').getByText('INDEPENDENT VERIFICATION')).toBeVisible()
  await expect(page.getByText('Passed', { exact: true })).toBeVisible()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download verified output' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/_notrace\.png$/)
  const outputPath = await download.path(); expect(outputPath).not.toBeNull()
  const output = require('node:fs').readFileSync(outputPath!) as Buffer
  expect(output.subarray(0, 8).equals(Buffer.from(signature))).toBe(true)
  expect(output.includes(Buffer.from('Comment'))).toBe(false)
  expect(output.includes(Buffer.from('Note'))).toBe(true)
  expect(output.includes(Buffer.from('eXIf'))).toBe(true)
  expect(createHash('sha256').update(sourceBytes).digest('hex')).toBe(sourceHash)
})

