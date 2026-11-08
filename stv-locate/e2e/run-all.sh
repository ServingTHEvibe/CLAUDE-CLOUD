#!/bin/bash
# Phone-sized browser checks against a local dev server with a fresh local D1/R2.
# Requires: dependencies installed, `npm run build` run once (for dist/server/wrangler.json),
# and Playwright with Chromium available to Node (`require('playwright')`).
# External map/address/outline providers are simulated in lib.cjs (mockProviders).
set -u
E2E="$(cd "$(dirname "$0")" && pwd)"; APP="$(dirname "$E2E")"; OUT="$E2E/out"
mkdir -p "$OUT"
cd "$APP"
pkill -f "run-framework.mjs dev" 2>/dev/null; pkill -f "vinext/dist/cli.js" 2>/dev/null; sleep 2
rm -rf .wrangler/state .vinext
(npm run dev > "$OUT/dev.log" 2>&1 &)
for i in $(seq 1 60); do grep -q "Local:" "$OUT/dev.log" && break; sleep 2; done
for f in drizzle/*.sql; do
  node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local \
    --config dist/server/wrangler.json --persist-to .wrangler/state --file "$f" > /dev/null 2>&1
done
cd "$OUT"
node "$E2E/fixtures.cjs" > /dev/null
node "$E2E/warm.cjs" > /dev/null 2>&1
fail=0
for f in flow1 flow2 flow3; do node "$E2E/$f.cjs" 2>&1 | grep -E "^(PASS|FAIL)|done, failures|Error" ; [ "${PIPESTATUS[0]}" = 0 ] || fail=1; done
pkill -f "run-framework.mjs dev" 2>/dev/null
exit $fail
