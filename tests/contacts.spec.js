// tests/contacts.spec.js
import { test, expect } from '@playwright/test'
import { clearStorage, seedMyInfo, seedContact, getFutureDate, getPastDate } from './helpers.js'

test.describe('Contact Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await clearStorage(page)
    await seedMyInfo(page)
  })

  // ─── Dashboard empty state ──────────────────────────────────────────────────

  test('shows empty state when no contacts', async ({ page }) => {
    await expect(page.getByText('No contacts yet')).toBeVisible()
    await expect(page.getByText('Add your first customer below')).toBeVisible()
  })

  // ─── Adding a contact ───────────────────────────────────────────────────────

  test('can add a new contact via the + button', async ({ page }) => {
    await page.getByRole('button', { name: '+' }).tap()
    await expect(page.getByText('New Customer')).toBeVisible()

    await page.getByTestId('input-name').fill('Maria Gonzalez')
    await page.getByTestId('input-phone').fill('5551112222')
    await page.getByTestId('select-interest').selectOption('Sofa / Sectional')
    await page.getByTestId('textarea-notes').fill('Budget around $2k, wants grey fabric')
    await page.getByRole('button', { name: '3 Days' }).tap()
    await page.getByRole('button', { name: 'Add Customer' }).tap()

    await expect(page.getByText('Maria Gonzalez')).toBeVisible()
    await expect(page.getByText('Sofa / Sectional')).toBeVisible()
  })

  test('shows validation error when name is missing', async ({ page }) => {
    await page.getByRole('button', { name: '+' }).tap()
    await page.getByTestId('input-phone').fill('5551112222')
    await page.getByRole('button', { name: 'Add Customer' }).tap()
    await expect(page.getByText('Name and phone required')).toBeVisible()
  })

  test('shows validation error when phone is missing', async ({ page }) => {
    await page.getByRole('button', { name: '+' }).tap()
    await page.getByTestId('input-name').fill('Test Person')
    await page.getByRole('button', { name: 'Add Customer' }).tap()
    await expect(page.getByText('Name and phone required')).toBeVisible()
  })

  // ─── Editing a contact ──────────────────────────────────────────────────────

  test('can edit an existing contact', async ({ page }) => {
    await seedContact(page, { name: 'Edit Me', phone: '5550001111' })
    await expect(page.getByText('Edit Me')).toBeVisible()

    await page.getByRole('button', { name: 'Edit' }).first().tap()
    await expect(page.getByText('Edit Contact')).toBeVisible()

    await page.getByTestId('input-name').clear()
    await page.getByTestId('input-name').fill('Edited Name')
    await page.getByRole('button', { name: 'Save Changes' }).tap()

    await expect(page.getByText('Edited Name')).toBeVisible()
    await expect(page.getByText('Edit Me')).not.toBeVisible()
  })

  // ─── Deleting a contact ─────────────────────────────────────────────────────

  test('can delete a contact', async ({ page }) => {
    await seedContact(page, { name: 'Delete Me' })
    await expect(page.getByText('Delete Me')).toBeVisible()

    await page.getByRole('button', { name: '🗑' }).first().tap()

    await expect(page.getByText('Delete Me')).not.toBeVisible()
    await expect(page.getByText('Deleted')).toBeVisible()
  })

  // ─── Marking done ───────────────────────────────────────────────────────────

  test('marking a contact done removes it from active list', async ({ page }) => {
    await seedContact(page, { name: 'Done Contact' })
    await page.getByRole('button', { name: 'Done ✓' }).first().tap()
    await expect(page.getByText('Done Contact')).not.toBeVisible()
    await expect(page.getByText('1 completed')).toBeVisible()
  })

  // ─── Urgency indicators ─────────────────────────────────────────────────────

  test('overdue contact shows red urgency badge', async ({ page }) => {
    await seedContact(page, { name: 'Overdue Person', followUpDate: getPastDate(2) })
    await expect(page.getByText('2d overdue')).toBeVisible()
  })

  test('follow-up due today shows Today badge', async ({ page }) => {
    const today = new Date().toISOString().split('T')[0]
    await seedContact(page, { name: 'Today Person', followUpDate: today })
    await expect(page.getByText('Today')).toBeVisible()
  })

  // ─── Stat counters ──────────────────────────────────────────────────────────

  test('overdue counter updates correctly', async ({ page }) => {
    await seedContact(page, { name: 'Past Due', followUpDate: getPastDate(1) })
    const chip = page.locator('button').filter({ hasText: 'Overdue' })
    await expect(chip.locator('div').first()).toHaveText('1')
  })

  test('not-texted counter decrements when contact is texted', async ({ page }) => {
    await seedContact(page, { name: 'Not Texted Yet', texted: false, followUpDate: getFutureDate(3) })
    const before = page.locator('button').filter({ hasText: 'Not Texted' })
    await expect(before.locator('div').first()).toHaveText('1')

    await page.route('sms:**', route => route.abort())
    await page.locator('a').filter({ hasText: 'Text Now' }).first().tap()

    const after = page.locator('button').filter({ hasText: 'Not Texted' })
    await expect(after.locator('div').first()).toHaveText('0')
  })

  // ─── Search ─────────────────────────────────────────────────────────────────

  test('search filters contacts by name', async ({ page }) => {
    await seedContact(page, { name: 'Alice Smith' })
    await seedContact(page, { name: 'Bob Jones', id: 'test-2' })

    await page.getByPlaceholder('Search by name or phone...').fill('Alice')
    await expect(page.getByText('Alice Smith')).toBeVisible()
    await expect(page.getByText('Bob Jones')).not.toBeVisible()
  })

  test('search filters contacts by phone', async ({ page }) => {
    await seedContact(page, { name: 'Phone Search', phone: '5554447777' })
    await page.getByPlaceholder('Search by name or phone...').fill('444')
    await expect(page.getByText('Phone Search')).toBeVisible()
  })

  // ─── Consent logging ────────────────────────────────────────────────────────

  test('each contact shows consent timestamp', async ({ page }) => {
    await seedContact(page, { name: 'Consent Check' })
    await expect(page.getByText(/Consent: in-person/)).toBeVisible()
  })

  // ─── Tap to call ────────────────────────────────────────────────────────────

  test('call button has correct tel: href for the contact phone', async ({ page }) => {
    await seedContact(page, { name: 'Call Test', phone: '5556667777', id: 'call-test-id' })
    const callLink = page.getByTestId('call-call-test-id')
    await expect(callLink).toBeVisible()
    await expect(callLink).toHaveAttribute('href', 'tel:5556667777')
  })
})
