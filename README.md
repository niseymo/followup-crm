# Follow-Up CRM

Mobile-first PWA for sales associates to track customer follow-ups, send pre-templated SMS, and stay TCPA-compliant. All data lives client-side in `localStorage` — **no backend, no PII leaving the device**. Installs to your home screen on iPhone & Android and works offline.

> 📘 **New here?** Read [`HANDOFF.md`](./HANDOFF.md) first.
> 📋 **Picking up work?** See [`ISSUES_TO_FILE.md`](./ISSUES_TO_FILE.md) for the prioritized backlog.

## Quick start

```bash
./setup.sh      # installs deps + Playwright browsers, runs lint+build+tests
npm run dev     # local dev server at http://localhost:3000
npm test        # mobile E2E (iPhone 14 + Pixel 7)
npm run test:ui # interactive Playwright UI
```

## Install on iPhone

1. Deploy (Vercel auto-deploys this repo — see HANDOFF.md)
2. Open the URL **in Safari** on iPhone (must be Safari, not Chrome)
3. Tap **Share → Add to Home Screen**
4. App launches full-screen, works offline, data persists locally

## Project layout

```
src/         App.jsx (single-file component) + main.jsx
tests/       Playwright E2E tests + helpers
public/      PWA manifest, service worker, icons
.github/     CI workflow, Copilot instructions, issue + PR templates
```

## Privacy & compliance

- Customer data is stored only in browser `localStorage` on the device
- `navigator.storage.persist()` requests durable storage so iOS won't auto-evict
- SMS sent through native phone app (user must confirm each send) — TCPA compliant
- Consent timestamp logged automatically per contact
- No analytics, no telemetry, no third-party services

Full ground rules in [`.github/copilot-instructions.md`](./.github/copilot-instructions.md).
