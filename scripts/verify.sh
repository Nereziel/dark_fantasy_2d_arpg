#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo 'Usage: bash scripts/verify.sh targeted tests/unit/NAME.test.ts | agent | full' >&2
  exit 2
}

[[ $# -ge 1 ]] || usage
mode=$1
repo_root=$(git rev-parse --show-toplevel)
cd "$repo_root/web"

case "$mode" in
  targeted)
    [[ $# -eq 2 ]] || usage
    test_file=$2
    [[ "$test_file" == tests/unit/*.test.ts && -f "$test_file" ]] || usage
    npm run test -- "$test_file"
    ;;
  agent)
    [[ $# -eq 1 ]] || usage
    npm run check
    npm run test
    npm run build
    ;;
  full)
    [[ $# -eq 1 ]] || usage
    npm run check
    npm run test
    npm run build
    npm run test:e2e
    cd "$repo_root"
    node tests/site.test.mjs
    ;;
  *) usage ;;
esac
