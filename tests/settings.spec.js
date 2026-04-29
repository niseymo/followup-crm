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

// ─── Backup reminder banner ──────────────────────────────────────────────────

test.describe('Backup reminder banner', () => {
  test('shows banner when no export has ever been done', async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => {
      localStorage.clear()
      localStorage.setItem('furniture_crm_v1', JSON.stringify({ contacts: [], myInfo: {}, msgTemplate: '' }))
    })
    await page.reload()
    await page.waitForLoadState('networkidle')
    await expect(page.getByTestId('backup-banner')).toBeVisible()
  })

  test('does not show banner when export is recent (within 7 days)', async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => {
      localStorage.clear()
      localStorage.setItem('furniture_crm_v1', JSON.stringify({
        contacts: [], myInfo: {}, msgTemplate: '',
        lastExportedAt: new Date().toISOString(),
      }))
    })
    await page.reload()
    await page.waitForLoadState('networkidle')
    await expect(page.getByTestId('backup-banner')).not.toBeVisible()
  })

  test('dismiss button hides banner for 24h', async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => {
      localStorage.clear()
      localStorage.setItem('furniture_crm_v1', JSON.stringify({ contacts: [], myInfo: {}, msgTemplate: '' }))
    })
    await page.reload()
    await page.waitForLoadState('networkidle')
    await expect(page.getByTestId('backup-banner')).toBeVisible()

    await page.getByTestId('backup-banner-dismiss').tap()
    await expect(page.getByTestId('backup-banner')).not.toBeVisible()

    // Reload should still suppress banner (dismiss is in effect)
    await page.reload()
    await page.waitForLoadState('networkidle')
    await expect(page.getByTestId('backup-banner')).not.toBeVisible()
  })

  test('Backup now button opens settings modal', async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => {
      localStorage.clear()
      localStorage.setItem('furniture_crm_v1', JSON.stringify({ contacts: [], myInfo: {}, msgTemplate: '' }))
    })
    await page.reload()
    await page.waitForLoadState('networkidle')
    await page.getByTestId('backup-banner-now').tap()
    await expect(page.getByText('Settings')).toBeVisible()
  })
})

// ─── Theme toggle ───────────────────────────────────────────────────────────

test.describe('Theme toggle', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await clearStorage(page)
  })

  test('switching to light theme changes data-theme attribute', async ({ page }) => {
    await page.getByTestId('settings-btn').tap()
    await page.getByTestId('theme-light').tap()
    await page.getByRole('button', { name: 'Done' }).tap()
    await expect(page.getByTestId('app-root')).toHaveAttribute('data-theme', 'light')
  })

  test('switching to dark theme changes data-theme attribute', async ({ page }) => {
    await page.getByTestId('settings-btn').tap()
    await page.getByTestId('theme-dark').tap()
    await page.getByRole('button', { name: 'Done' }).tap()
    await expect(page.getByTestId('app-root')).toHaveAttribute('data-theme', 'dark')
  })

  test('theme preference persists across reload', async ({ page }) => {
    await page.getByTestId('settings-btn').tap()
    await page.getByTestId('theme-light').tap()
    await page.getByRole('button', { name: 'Done' }).tap()

    await page.reload()
    await page.waitForLoadState('networkidle')
    await expect(page.getByTestId('app-root')).toHaveAttribute('data-theme', 'light')
  })
})

// ─── Share Card / vCard ──────────────────────────────────────────────────────

test.describe('Share Card vCard generation', () => {
  test('Share Card downloads a .vcf file on non-share-capable browser', async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => {
      localStorage.clear()
      localStorage.setItem('furniture_crm_v1', JSON.stringify({
        contacts: [],
        myInfo: { name: 'Alex Nguyen', title: 'Sales Consultant', store: 'Luxe Furnishings', phone: '5551239876', email: 'alex@luxe.com' },
        msgTemplate: '',
      }))
      // Remove navigator.share so the fallback download path runs
      Object.defineProperty(navigator, 'share', { value: undefined, configurable: true })
    })
    await page.reload()
    await page.waitForLoadState('networkidle')

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Share Card' }).tap(),
    ])

    expect(download.suggestedFilename()).toMatch(/\.vcf$/)
    const path = await download.path()
    const { readFileSync } = await import('fs')
    const content = readFileSync(path, 'utf8')
    expect(content).toContain('BEGIN:VCARD')
    expect(content).toContain('FN:Alex Nguyen')
    expect(content).toContain('ORG:Luxe Furnishings')
    expect(content).toContain('TEL;TYPE=CELL:5551239876')
    expect(content).toContain('EMAIL:alex@luxe.com')
    expect(content).toContain('END:VCARD')
  })
})
