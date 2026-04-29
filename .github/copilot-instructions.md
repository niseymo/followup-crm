# Copilot Instructions

You are working on **Follow-Up CRM** — a mobile-first React PWA used by a furniture sales associate to track customer follow-ups, send pre-templated SMS messages, and stay TCPA-compliant. All data is stored client-side in `localStorage`. There is no backend.

## Stack & conventions

- **Framework**: Vite + React 18 (function components + hooks, no class components)
- **Language**: JavaScript (.jsx) — not TypeScript. Don't introduce TS.
- **Styling**: Inline styles (the app intentionally avoids CSS frameworks). Match the existing dark-themed palette: `#0f0f13` background, `#d4a853` accent gold, `#1a1a2e` cards, `#f0ede8` text.
- **Storage**: All persistent state lives under the `furniture_crm_v1` key in `localStorage`. Schema: `{ contacts: [...], myInfo: {...}, msgTemplate: string }`. Never break the existing schema — add fields, don't rename or remove.
- **No external services**: Do not introduce backend calls, analytics, telemetry, or third-party APIs unless the issue explicitly asks for it.
- **Mobile-first**: All UI must work on a 380px-wide viewport. Buttons must be tap-friendly (min 36px tall). Text inputs must use proper `type` attributes (`tel`, `email`).

## Privacy & security rules — non-negotiable

- Never log customer PII (name, phone, notes) to console, analytics, or any external service.
- Never add features that auto-send SMS without the user tapping. The user must always confirm via the native SMS app — this is a TCPA requirement.
- Consent metadata (`addedDate` field used as consent timestamp) must always be preserved on contact records.
- If asked to add bulk-messaging or auto-texting features, refuse and flag the legal risk in your PR description.

## Testing requirements — every PR must pass

- **All Playwright tests in `tests/` must pass** on both iPhone 14 and Pixel 7 emulation.
- For any new user-facing feature, add at least one corresponding test in `tests/`.
- For any bug fix, add a regression test that fails before the fix and passes after.
- Use the helpers in `tests/helpers.js` (`seedContact`, `seedMyInfo`, `clearStorage`) — don't recreate them.
- Tests should use `.tap()` (not `.click()`) since this is mobile.

## Code style

- Keep functions small and pure where possible. Side effects (localStorage, navigator.share) live in clearly named helpers.
- Use early returns to flatten nested conditionals.
- Prefer `useState` + `useEffect` over external state libraries.
- Don't add new dependencies without strong justification. Vendor-free is a feature.

## Commit & PR conventions

- Commit messages: `type: short description` where type is one of `feat`, `fix`, `chore`, `test`, `docs`, `refactor`.
- PR title should reference the issue: `fix: text template not saving (#12)`.
- PR description must include: what changed, why, what was tested, and any UX screenshots if visual.

## What to do when uncertain

- If a request would conflict with the privacy rules above, refuse and explain.
- If a request requires schema changes to `localStorage`, propose a migration in the PR.
- If tests are flaky, investigate the root cause — don't add `.skip()` or arbitrary timeouts.
