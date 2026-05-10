// tests/helpers.js
// Shared utilities for all test files

const DB_NAME = "followup_crm";

// Open the IndexedDB and clear all stores, then reload.
export async function clearStorage(page) {
  await page.evaluate((dbName) => {
    return new Promise((resolve) => {
      const req = indexedDB.open(dbName);
      req.onsuccess = (e) => {
        const db = e.target.result;
        const names = [...db.objectStoreNames];
        if (!names.length) { db.close(); return resolve(); }
        const tx = db.transaction(names, "readwrite");
        names.forEach(name => tx.objectStore(name).clear());
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror    = () => { db.close(); resolve(); };
      };
      req.onerror = () => resolve();
    });
  }, DB_NAME);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForLoadState("networkidle");
}

// Write profile info directly into the Dexie settings store.
export async function seedMyInfo(page, info = {}) {
  const defaults = {
    name:  "Jamie",
    title: "Sales Associate",
    store: "Modern Furnishings",
    phone: "5551234567",
    email: "jamie@modernfurnishings.com",
  };
  const merged = { ...defaults, ...info };
  await page.evaluate(({ dbName, data }) => {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(dbName);
      req.onsuccess = (e) => {
        const db = e.target.result;
        const tx = db.transaction("settings", "readwrite");
        const store = tx.objectStore("settings");
        store.put({ key: "profiles",        value: [{ id: "default", ...data }] });
        store.put({ key: "activeProfileId", value: "default" });
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror    = (err) => { db.close(); reject(err); };
      };
      req.onerror = reject;
    });
  }, { dbName: DB_NAME, data: merged });
  await page.reload();
  await page.waitForLoadState("networkidle");
}

// Write a contact directly into the Dexie contacts store.
export async function seedContact(page, contact = {}) {
  const defaults = {
    id:           `test-${Date.now()}`,
    name:         "Test Customer",
    phone:        "5559876543",
    interest:     "Sofa / Sectional",
    notes:        "Looking for something modern",
    followUpDate: getFutureDate(3),
    addedDate:    getTodayDate(),
    texted:       false,
    done:         false,
  };
  const merged = { ...defaults, ...contact };
  await page.evaluate(({ dbName, c }) => {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(dbName);
      req.onsuccess = (e) => {
        const db = e.target.result;
        const tx = db.transaction("contacts", "readwrite");
        tx.objectStore("contacts").put(c);
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror    = (err) => { db.close(); reject(err); };
      };
      req.onerror = reject;
    });
  }, { dbName: DB_NAME, c: merged });
  await page.reload();
  await page.waitForLoadState("networkidle");
}

export function getTodayDate() {
  return new Date().toISOString().split("T")[0];
}

export function getFutureDate(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

export function getPastDate(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split("T")[0];
}
