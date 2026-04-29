# Claude Code Handoff

This document is for the next person (or AI agent) picking up this repo. Read it top-to-bottom before making changes.

## Context

**Follow-Up CRM** is a privacy-first, mobile-installable PWA used by sales associates to track customer follow-ups and send pre-templated SMS messages. It was built initially for furniture sales but is intentionally generic enough to work for any in-person sales role (real estate, car sales, retail, etc.).

**Hard requirements that drive every design decision:**
1. **All customer data lives only on the user's device** (`localStorage` + persistent storage API). No backend. No telemetry. No analytics.
2. **Works installed-as-app on iPhone & Android** (PWA — Add to Home Screen).
3. **Works offline** (service worker caches app shell).
4. **TCPA-compliant by design**: SMS goes through the native phone app — the user must tap "send" themselves; the app never auto-sends.
5. **Mobile-first**: 380px viewport is the design target. Tap targets ≥36px.

## Current state (what's done)

- ✅ Vite + React 18 app (`src/App.jsx`, single-file by design)
- ✅ PWA manifest + service worker (`public/sw.js`) for offline + install
- ✅ Persistent storage request via `navigator.storage.persist()` (in `src/main.jsx`)
- ✅ iOS PWA meta tags + Apple touch icons
- ✅ Playwright tests for contact CRUD + filters + search (`tests/contacts.spec.js`)
- ✅ GitHub Actions CI: lint + build + mobile E2E (iPhone 14 + Pixel 7)
- ✅ Copilot agent instructions (`.github/copilot-instructions.md`)
- ✅ Bug + feature issue templates, PR template with privacy checklist

## Bootstrap (run once after cloning)

```bash
./setup.sh
```

This installs deps, Playwright browsers, runs lint + build + tests. Takes 2–3 min.

If `setup.sh` fails on the test step, that's expected on a fresh checkout — some tests reference DOM selectors that may need tightening on first run. Address in the first PR (see Issue #1 in `ISSUES_TO_FILE.md`).

## Pushing to GitHub

```bash
git init
git add -A
git commit -m "chore: initial commit"
gh repo create followup-crm --private --source=. --push
```

If you don't have `gh`: `brew install gh && gh auth login` first.

## After pushing — enable the Copilot agent

1. Go to your repo on github.com → **Settings** → **Copilot** → enable **"Copilot coding agent"**.
2. From now on, when you create an issue, set the assignee to `@copilot` and it will open a draft PR with a fix.
3. CI runs automatically on every PR. Don't merge if CI is red.

## Connecting Vercel for preview deploys (recommended)

1. vercel.com → New Project → import this repo.
2. Vercel auto-detects Vite. Default settings work.
3. Every PR now gets a preview URL automatically — paste this into your phone to live-test mobile UX.

## Installing on iPhone (the part that matters most)

Once deployed:

**iOS Safari:**
1. Open the production or preview URL in Safari (not Chrome — only Safari can install PWAs on iOS).
2. Tap the **Share** button (square with arrow).
3. Scroll down, tap **"Add to Home Screen"**.
4. The app icon appears on the home screen and launches full-screen with no browser chrome.

**Android Chrome:**
1. Open the URL in Chrome.
2. Tap the **⋮ menu** → **"Install app"** or **"Add to Home Screen"**.

After install, the app works offline and looks/feels like a native app. Data persists across launches because:
- `localStorage` is the storage layer
- We call `navigator.storage.persist()` on launch — this asks the OS to mark our data as durable so it won't be auto-evicted under storage pressure
- Service worker caches the app shell so launching offline still works

## Data durability — what users need to know

`localStorage` is **per-device, per-browser, per-origin**. Things that delete the data:
- Manually clearing browser data
- Uninstalling the PWA on iOS (this currently wipes localStorage; iOS limitation)
- "Clear History and Website Data" in Safari settings
- A factory reset

Things that DO **not** delete data:
- Phone restart
- App not opened for a long time (with persistent storage granted)
- iOS updates (in most cases)

The app has built-in **Export / Restore** in Settings. Tell users to export weekly. We may also want to add an automated reminder — see Issue #4 in `ISSUES_TO_FILE.md`.

## File map

```
.
├── .github/
│   ├── ISSUE_TEMPLATE/        # bug + feature templates
│   ├── workflows/ci.yml       # GH Actions: lint + build + mobile E2E
│   ├── copilot-instructions.md # rules the Copilot agent must follow
│   └── pull_request_template.md
├── public/
│   ├── manifest.json          # PWA manifest
│   ├── sw.js                  # service worker
│   ├── icon-*.png             # PWA icons (192, 512, 512-maskable)
│   ├── apple-touch-icon.png   # iOS home screen icon
│   └── favicon.png
├── src/
│   ├── App.jsx                # main component (single file, intentional)
│   └── main.jsx               # entry + SW registration + persistent storage
├── tests/
│   ├── contacts.spec.js       # E2E test suite
│   └── helpers.js             # test fixtures (seedContact, seedMyInfo, …)
├── index.html
├── package.json
├── playwright.config.js
├── vite.config.js
├── .eslintrc.json
├── setup.sh
├── README.md
├── HANDOFF.md                 # this file
└── ISSUES_TO_FILE.md          # backlog to file as GitHub issues
```

## Privacy & security ground rules

These are also in `.github/copilot-instructions.md` for the Copilot agent. Repeating here for human reference:

- Never log customer PII (name, phone, notes) to console, analytics, or any external service.
- Never auto-send SMS. The user must tap-to-confirm in the native SMS app every time.
- Never break the localStorage schema. Add fields, never remove or rename.
- Never introduce backend calls without an explicit issue approving it.
- Consent metadata (`addedDate`) on each contact is the TCPA paper trail. Don't remove it.

## When something goes wrong

- **Tests fail in CI**: download the `playwright-report` artifact from the failed run; it has full trace + screenshots.
- **PWA doesn't install on iPhone**: must be served over HTTPS (Vercel does this automatically); manifest + apple-touch-icon must be reachable.
- **Data disappeared after iOS update**: persistent-storage grant should prevent this, but if it happens, restore from the user's exported backup.
- **Service worker showing stale content**: bump `CACHE_NAME` in `public/sw.js` to force a refresh on next visit.

## Backlog

See `ISSUES_TO_FILE.md` — file these as GitHub issues in order. The Copilot agent (or you, locally with Claude Code) can knock them out one at a time.
