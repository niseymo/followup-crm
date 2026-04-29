// tests/helpers.js
// Shared utilities for all test files

/**
 * Clear localStorage before each test to ensure a clean state.
 */
export async function clearStorage(page) {
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.waitForLoadState('networkidle')
}

/**
 * Set up myInfo in storage so tests that need a name/store skip the settings step.
 */
export async function seedMyInfo(page, info = {}) {
  const defaults = {
    name: 'Jamie',
    title: 'Sales Associate',
    store: 'Modern Furnishings',
    phone: '5551234567',
    email: 'jamie@modernfurnishings.com',
  }
  const merged = { ...defaults, ...info }
  await page.evaluate((data) => {
    const existing = JSON.parse(localStorage.getItem('furniture_crm_v1') || '{}')
    existing.myInfo = data
    localStorage.setItem('furniture_crm_v1', JSON.stringify(existing))
  }, merged)
  await page.reload()
  await page.waitForLoadState('networkidle')
}

/**
 * Add a contact directly via storage (faster than UI interaction).
 */
export async function seedContact(page, contact = {}) {
  const defaults = {
    id: `test-${Date.now()}`,
    name: 'Test Customer',
    phone: '5559876543',
    interest: 'Sofa / Sectional',
    notes: 'Looking for something modern',
    followUpDate: getFutureDate(3),
    addedDate: getTodayDate(),
    texted: false,
    done: false,
  }
  const merged = { ...defaults, ...contact }
  await page.evaluate((c) => {
    const existing = JSON.parse(localStorage.getItem('furniture_crm_v1') || '{}')
    existing.contacts = [c, ...(existing.contacts || [])]
    localStorage.setItem('furniture_crm_v1', JSON.stringify(existing))
  }, merged)
  await page.reload()
  await page.waitForLoadState('networkidle')
}

export function getTodayDate() {
  return new Date().toISOString().split('T')[0]
}

export function getFutureDate(days) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

export function getPastDate(days) {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().split('T')[0]
}
