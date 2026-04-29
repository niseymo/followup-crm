// tests/settings.spec.js
import { test, expect } from '@playwright/test'
import { clearStorage, seedMyInfo } from './helpers.js'

const DEFAULT_TEMPLATE = `Hi {name}! This is {myName} from {store}. Great meeting you today — feel free to reach out if you have any questions about what you saw. 😊`

test.describe('Settings Modal', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await clearStorage(page)
  })

  // ─── Open / close ───────────────────────────────────────────────────────────

  test('opens settings modal when gear button is tapped', async ({ page }) => {
    await page.getByTestId('settings-btn').tap()
    await expect(page.getByText('Settings')).toBeVisible()
  })

  test('closes settings modal when Done is tapped', async ({ page }) => {
    await page.getByTestId('settings-btn').tap()
    await expect(page.getByText('Settings')).toBeVisible()
    await page.getByRole('button', { name: 'Done' }).tap()
    await expect(page.getByText('Settings')).not.toBeVisible()
  })

  // ─── My Info persistence ────────────────────────────────────────────────────

  test('myInfo fields persist across page reload', async ({ page }) => {
    await page.getByTestId('settings-btn').tap()
    await page.getByTestId('myinfo-name').fill('Jordan Lee')
    await page.getByTestId('myinfo-store').fill('Premier Furniture')
    await page.getByRole('button', { name: 'Done' }).tap()

    await page.reload()
    await page.waitForLoadState('networkidle')
    await page.getByTestId('settings-btn').tap()

    await expect(page.getByTestId('myinfo-name')).toHaveValue('Jordan Lee')
    await expect(page.getByTestId('myinfo-store')).toHaveValue('Premier Furniture')
  })

  test('name in myInfo appears in dashboard header', async ({ page }) => {
    await page.getByTestId('settings-btn').tap()
    await page.getByTestId('myinfo-name').fill('Casey Rivera')
    await page.getByRole('button', { name: 'Done' }).tap()
    await expect(page.getByText(/Casey Rivera/)).toBeVisible()
  })

  // ─── Template editing ───────────────────────────────────────────────────────

  test('can type a custom SMS template', async ({ page }) => {
    await page.getByTestId('settings-btn').tap()
    await page.getByTestId('template-textarea').fill('Hey {name}, great meeting you!')
    await expect(page.getByTestId('template-textarea')).toHaveValue('Hey {name}, great meeting you!')
  })

  test('inserting a variable chip appends it to the template', async ({ page }) => {
    await page.getByTestId('settings-btn').tap()
    await page.getByTestId('template-textarea').fill('')
    await page.getByRole('button', { name: '{name}' }).tap()
    const val = await page.getByTestId('template-textarea').inputValue()
    expect(val).toContain('{name}')
  })

  test('template preview reflects edited template text', async ({ page }) => {
    await page.getByTestId('settings-btn').tap()
    await page.getByTestId('template-textarea').fill('Hello {name}, welcome to the store!')
    await expect(page.getByText('Hello Sarah, welcome to the store!')).toBeVisible()
  })

  test('reset to default restores original template', async ({ page }) => {
    await page.getByTestId('settings-btn').tap()
    await page.getByTestId('template-textarea').fill('Something completely different')
    await page.getByRole('button', { name: 'Reset to default' }).tap()

    await expect(page.getByTestId('template-textarea')).toHaveValue(DEFAULT_TEMPLATE)
    await expect(page.getByText('Template reset')).toBeVisible()
  })

  // ─── Export backup ──────────────────────────────────────────────────────────

  test('Export Backup triggers a .json file download', async ({ page }) => {
    await seedMyInfo(page)
    await page.getByTestId('settings-btn').tap()

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /Export Backup/ }).tap(),
    ])

    expect(download.suggestedFilename()).toMatch(/^followup-backup-\d{4}-\d{2}-\d{2}\.json$/)
  })

  // ─── Restore from backup ────────────────────────────────────────────────────

  test('Restore from backup file loads contacts onto the dashboard', async ({ page }) => {
    const backup = {
      contacts: [{
        id: 'backup-1',
        name: 'Restored Customer',
        phone: '5550000001',
        interest: 'Mattress',
        notes: '',
        followUpDate: new Date().toISOString().split('T')[0],
        addedDate: new Date().toISOString().split('T')[0],
        texted: false,
        done: false,
      }],
      myInfo: { name: 'Jamie', title: 'Sales Associate', store: 'Test Store', phone: '', email: '' },
      msgTemplate: DEFAULT_TEMPLATE,
      exportedAt: new Date().toISOString(),
    }

    await page.getByTestId('settings-btn').tap()
    await page.locator('input[type="file"]').setInputFiles({
      name: 'backup.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(backup)),
    })

    await expect(page.getByText(/Restored 1 contact/)).toBeVisible()
    await page.getByRole('button', { name: 'Done' }).tap()
    await expect(page.getByText('Restored Customer')).toBeVisible()
  })
})
