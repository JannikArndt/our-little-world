#!/bin/bash
# A web session starts from a fresh clone, so node_modules is not there and the
# very first `npm run check` falls over on "Cannot find package 'globals'".
# That is the inner loop, and it ought to just work. Nothing installed here
# ever reaches a player: they are all devDependencies — see the tooling table
# in CLAUDE.md.
set -euo pipefail

# On a machine of your own, npm is yours to run when you feel like it.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}"

# install rather than ci, so a container that already has them keeps them
npm install --no-audit --no-fund

# The browser passes want Chromium. This environment ships one and says where
# in PLAYWRIGHT_BROWSERS_PATH, so fetching a second is a download nobody needs.
if [ -z "${PLAYWRIGHT_BROWSERS_PATH:-}" ]; then
  npx playwright install chromium
fi
