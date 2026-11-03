#!/usr/bin/env bash
# Run every headless test (Chrome + SwiftShader via puppeteer-core). Usage: tools/run-tests.sh
# Env: CHROME=/path/to/chrome  PPTR=/path/to/puppeteer-core  KM=<drive length>
set -u; cd "$(dirname "$0")/.."; fail=0
for t in test-road test-drive test-rebase test-biomes test-perf; do
  echo "=== $t"; if node "tools/$t.cjs"; then :; else fail=$((fail+1)); echo "!!! $t FAILED"; fi
done
echo; [ $fail -eq 0 ] && echo "ALL TEST FILES PASSED" || echo "$fail TEST FILE(S) FAILED"; exit $fail
