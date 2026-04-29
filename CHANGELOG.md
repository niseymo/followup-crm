# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [1.0.0] - 2026-04-28

### Added
- **Natural language furniture lookup** powered by Claude API (Haiku) via a Vercel serverless proxy — ask anything about styles, materials, care, dimensions
- **Backup reminder banner** — warns if no export in 7+ days; dismissible for 24h
- **Service worker update prompt** — blue banner appears when a new version is waiting; tap to apply and reload
- **Tap-to-call button** (📞) on every contact card alongside Text Now
- **Share Card generates a vCard (.vcf)** — opens the native Add Contact flow; falls back to text share or download
- **Light/dark/auto theme toggle** in Settings — tokens extracted to a THEMES object; persisted to localStorage
- **User-configurable interest categories** — add/remove categories in Settings; defaults migrate automatically for existing users
- **Playwright E2E test suite** (`tests/contacts.spec.js`, `tests/settings.spec.js`) covering contact CRUD, settings modal, template editing, export/import, backup banner, theme toggle, and categories

### Changed
- All test selectors migrated from positional (`nth()`, `first()`) to `data-testid` — no more fragile layout-dependent tests
- Service worker no longer auto-skips waiting on install; update is user-triggered
- `shareCard()` upgraded to prefer vCard file share over plain text

### Infrastructure
- GitHub Actions CI runs lint + build + Playwright on every push (iPhone 14 + Pixel 7 projects)
- Vercel deployment with `ANTHROPIC_API_KEY` stored as environment variable (never in client bundle)
- 10 GitHub issues filed and implemented in a single release cycle

[1.0.0]: https://github.com/niseymo/followup-crm/releases/tag/v1.0.0
