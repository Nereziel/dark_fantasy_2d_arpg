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

# Temporary playtest publication policy: strict acceptance stays separate from
# publishing. Protect the main-only, successful-build, exact-artifact contract.
workflow="$root/.github/workflows/quality.yml"
verify=$(sed -n '/^  verify:/,/^  deploy:/p' "$workflow")
deploy=$(sed -n '/^  deploy:/,$p' "$workflow")
grep -Fq 'bash .github/actions/require-validation.sh' <<< "$verify"
grep -Fq 'needs: [build, checks, browser]' <<< "$verify"
grep -Fxq '    needs: build' <<< "$deploy"
grep -Fq "github.ref == 'refs/heads/main'" <<< "$deploy"
grep -Fq "github.event_name != 'pull_request'" <<< "$deploy"
grep -Fq "needs.build.result == 'success'" <<< "$deploy"
grep -Fq "needs.build.outputs.publish == 'true'" <<< "$deploy"
grep -Fq 'name: ${{ needs.build.outputs.bundle }}' <<< "$deploy"
grep -Fq 'test -s web/dist/index.html' <<< "$deploy"
grep -Fq 'actions/upload-pages-artifact@v3' <<< "$deploy"
grep -Fq 'artifact_name: pages-${{ github.sha }}-${{ github.run_attempt }}' <<< "$deploy"
if grep -Fq 'needs.verify' <<< "$deploy"; then
  echo 'ERROR: temporary playtest deployment still depends on verify' >&2
  exit 1
fi
echo 'PASS: strict verify and independent main-only successful-build publication'
