#!/usr/bin/env bash
# GPL-3.0-only — fail-closed acceptance gate regression.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
gate="$root/.github/actions/require-validation.sh"
# Every dependency must be successful. Unknown/absent results fail closed.
bash "$gate" success success success
for status in failure skipped cancelled '' unknown; do
  for lane in build checks browser; do
    b=success c=success e=success
    case "$lane" in
      build) b=$status ;;
      checks) c=$status ;;
      browser) e=$status ;;
    esac
    if bash "$gate" "$b" "$c" "$e"; then
      echo "ERROR: gate accepted $lane=$status" >&2
      exit 1
    fi
  done
done
if bash "$gate" success success; then
  echo 'ERROR: gate accepted missing result' >&2
  exit 1
fi
echo 'PASS: success, all 15 non-success dependency cases, missing argument'
