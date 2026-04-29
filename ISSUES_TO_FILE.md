# First Batch of Issues to File

These are the highest-value next steps. File them as GitHub issues in this order. Each is sized for a single PR. The first few are blocking; the rest are quality / portability improvements.

To file each one quickly with the GitHub CLI:

```bash
gh issue create --title "<title>" --body-file - <<'EOF'
<paste the body below>
EOF
```

Or use the web UI with the bug/feature templates already configured.

---

## 🔴 Issue 1 — Tighten test selectors (foundational)

**Title:** `test: stabilize selectors in contacts.spec.js`

**Type:** bug / chore

**Body:**
The initial test suite uses positional selectors in a few places (e.g., `page.locator('input').nth(1)`) which are fragile when the form layout changes. Replace them with `data-testid` attributes added to inputs and buttons in `App.jsx`, then update tests to use `page.getByTestId(...)`.

**Acceptance criteria:**
- All inputs and primary action buttons in `App.jsx` have `data-testid` attributes
- All tests in `tests/contacts.spec.js` use `getByTestId` or `getByRole` — no positional `nth()` selectors
- All tests pass on both iPhone 14 and Pixel 7 projects

---

## 🔴 Issue 2 — Add tests for settings & template editing

**Title:** `test: cover settings modal, template editing, export/import`

**Type:** test

**Body:**
Current tests only cover contact CRUD. We need coverage for:
- Opening / closing the settings modal
- Filling out myInfo and verifying it persists across reload
- Editing the SMS message template, inserting variable chips, verifying preview
- Resetting template to default
- Exporting backup file
- Restoring from a backup file

**Acceptance criteria:**
- New file: `tests/settings.spec.js` with at least 6 test cases covering the above
- All tests use the `helpers.js` fixtures
- Both mobile projects pass

---

## 🟡 Issue 3 — Make interest categories user-configurable

**Title:** `feat: let users edit their own interest categories`

**Type:** enhancement (portability)

**Body:**
Currently `FURNITURE_INTERESTS` is hardcoded in `App.jsx`. For users in other industries (real estate, car sales, retail) this is wrong. Move the list into `localStorage` (under a new `categories` key in the schema) and add a Settings panel section to edit it.

**Acceptance criteria:**
- New `categories` array in localStorage schema, defaults to current furniture list for backward compat
- Settings panel has a "Categories" section: list with delete buttons + an "add" input
- Schema migration: if `categories` is missing on load, seed it with the current default
- Add Playwright test for editing categories
- Update `.github/copilot-instructions.md` schema doc

---

## 🟡 Issue 4 — Backup reminder banner

**Title:** `feat: nag user to export backup if 7+ days since last export`

**Type:** enhancement (data safety)

**Body:**
`localStorage` can be wiped (Safari clears it, user clears history, app uninstall on iOS, etc.). Users should export a backup at least weekly. Add a non-intrusive banner at the top of the dashboard if `lastExportedAt` is missing or >7 days old.

**Acceptance criteria:**
- New `lastExportedAt` field saved when user taps Export Backup
- Yellow info banner shows on dashboard if >7 days since last export (or never)
- Banner has a "Backup now" button that opens settings + scrolls to Backup section
- Banner is dismissible for 24h (don't be annoying)
- Test coverage for the banner show/hide logic

---

## 🟡 Issue 5 — Service worker update prompt

**Title:** `feat: prompt user to reload when a new version is available`

**Type:** enhancement (UX)

**Body:**
When we ship a new version, the service worker downloads it in the background but the user doesn't see it until they hard-reload. Add a small "New version available — tap to update" banner that appears when `serviceWorker.waiting` is detected.

**Acceptance criteria:**
- New banner appears when SW update is waiting
- Tapping it sends `skipWaiting` to the SW and reloads the page
- Doesn't appear on first install (only updates)

---

## 🟢 Issue 6 — Add a "Tap to call" shortcut on contacts

**Title:** `feat: add tap-to-call button alongside Text Now`

**Type:** enhancement

**Body:**
Some customers prefer phone calls. Add a phone-icon button next to "Text Now" that uses `tel:` URI to launch the native dialer. This is one tap and respects user preference (it doesn't auto-call, just opens the dialer with the number filled in).

**Acceptance criteria:**
- New button on each contact card alongside Text Now
- Uses `tel:{phone}` URI
- Has appropriate icon
- Test added for the link's `href` attribute

---

## 🟢 Issue 7 — Light theme support

**Title:** `feat: add light/dark theme toggle in settings`

**Type:** enhancement (UX)

**Body:**
Some users prefer light mode, especially in bright stores. Add a light theme that respects `prefers-color-scheme` by default and has a manual toggle in settings.

**Acceptance criteria:**
- Theme tokens extracted to a small `theme.js` or top-level CSS variables
- Toggle in settings: `auto` / `light` / `dark`
- Stored in localStorage
- Maintains accessibility contrast in both themes
- Test that toggle persists across reload

---

## 🟢 Issue 8 — Generate a vCard for contact sharing

**Title:** `feat: Share Card button generates a vCard (.vcf) file`

**Type:** enhancement

**Body:**
Currently "Share Card" sends plain text. Many customers will want to save your contact info directly to their phone's address book. Generate a vCard file that opens the native "Add Contact" flow when shared.

**Acceptance criteria:**
- Share Card generates a valid vCard 3.0 file
- Falls back to text share if `navigator.share` doesn't support files
- Includes name, title, store (as organization), phone, email
- Test for vCard format generation

---

## 🟢 Issue 9 — Multi-store / multi-shift support

**Title:** `feat: support multiple "myInfo" profiles for users with multiple jobs`

**Type:** enhancement (portability)

**Body:**
Some sales associates work at multiple stores or have multiple roles. Let them save multiple `myInfo` profiles and switch between them. The active profile is used when generating SMS messages.

**Acceptance criteria:**
- `myInfo` becomes `profiles: [{ id, ...info }]` + `activeProfileId`
- Schema migration on load
- Settings panel lets user add / edit / delete / switch profiles
- Active profile shown in header
- Tests for profile CRUD + switching

---

## 🟢 Issue 10 — CHANGELOG + release tagging

**Title:** `chore: add CHANGELOG.md and tag v1.0.0`

**Type:** chore

**Body:**
Establish a release rhythm. Add `CHANGELOG.md` following the [Keep a Changelog](https://keepachangelog.com) format. Tag the current state as `v1.0.0`. Update CI to also run on tags.

**Acceptance criteria:**
- `CHANGELOG.md` created with v1.0.0 entry
- Git tag `v1.0.0` pushed
- README links to CHANGELOG

---

# Suggested order

Do them in this order — each builds on the previous:

1. Issue 1 (test selectors) — foundational, makes future PRs less flaky
2. Issue 2 (more test coverage) — locks in current behavior before changing it
3. Issue 4 (backup reminder) — pure data-safety, low risk
4. Issue 5 (SW update prompt) — quick win for UX
5. Issue 3 (configurable categories) — portability unlock
6. Issue 6 (tap-to-call) — small feature, high impact
7. Issue 8 (vCard share) — nice to have
8. Issue 7 (theme toggle) — polish
9. Issue 9 (multi-profile) — bigger refactor, do after schema is well-tested
10. Issue 10 (changelog + tag) — once you have a few releases under your belt

Once you've worked through these, file your own follow-ups based on real usage feedback.
