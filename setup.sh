#!/usr/bin/env bash
# setup.sh — one-shot bootstrap for the followup-crm repo
# Run after cloning / unzipping locally.
set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

step() { echo -e "${GREEN}▶${NC} $1"; }
warn() { echo -e "${YELLOW}⚠${NC} $1"; }
fail() { echo -e "${RED}✗${NC} $1"; }

# Check Node version
if ! command -v node >/dev/null 2>&1; then
  fail "Node.js not found. Install Node 18 or higher: https://nodejs.org/"
  exit 1
fi
NODE_MAJOR=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_MAJOR" -lt 18 ]; then
  fail "Node $NODE_MAJOR detected. Need Node 18 or higher."
  exit 1
fi
step "Node $(node -v) ✓"

# Install deps
step "Installing npm dependencies..."
npm install

# Install Playwright browsers (only what we need)
step "Installing Playwright browsers..."
npx playwright install --with-deps chromium webkit

# Lint (warning only — don't block)
step "Running lint..."
if npm run lint; then
  echo "  Lint passed ✓"
else
  warn "Lint reported warnings — review before pushing"
fi

# Build
step "Building production bundle..."
npm run build

# Tests (warning only — first run may need selector tightening, see Issue #1)
step "Running mobile E2E tests..."
if npm test; then
  echo "  All tests passed ✓"
else
  warn "Some tests failed. See playwright-report/ for details."
  warn "Issue #1 in ISSUES_TO_FILE.md addresses initial test stability."
fi

echo ""
echo -e "${GREEN}═══════════════════════════════════════════${NC}"
echo -e "${GREEN}  Setup complete!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════${NC}"
echo ""
echo "Next steps:"
echo "  1. ${YELLOW}npm run dev${NC}             # local dev at http://localhost:3000"
echo "  2. Read HANDOFF.md for full workflow"
echo "  3. File issues from ISSUES_TO_FILE.md"
echo ""
echo "To push to GitHub (requires gh CLI):"
echo "  ${YELLOW}git init && git add -A && git commit -m 'chore: initial commit'${NC}"
echo "  ${YELLOW}gh repo create followup-crm --private --source=. --push${NC}"
echo ""
