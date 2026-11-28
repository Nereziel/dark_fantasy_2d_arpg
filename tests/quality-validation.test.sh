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

# Strict ready-PR/full manual verification, bounded fanout, main build-only.
workflow="$root/.github/workflows/quality.yml"
build=$(sed -n '/^  build:/,/^  checks:/p' "$workflow")
checks=$(sed -n '/^  checks:/,/^  browser:/p' "$workflow")
browser=$(sed -n '/^  browser:/,/^  verify:/p' "$workflow")
verify=$(sed -n '/^  verify:/,/^  deploy:/p' "$workflow")
deploy=$(sed -n '/^  deploy:/,$p' "$workflow")
grep -Fq 'ready_for_review' "$workflow"
grep -Fq 'converted_to_draft' "$workflow"
grep -Fq 'cancel-in-progress: true' "$workflow"
for job in "$build" "$checks" "$verify"; do
  grep -Fq 'github.event.pull_request.draft == false' <<< "$job"
  grep -Fq "inputs.mode == 'full'" <<< "$job"
done
grep -Fq "inputs.mode == 'publish'" <<< "$build"
grep -Fq "github.event_name == 'push'" <<< "$build"
grep -Fq 'npm run build' <<< "$build"
grep -Fq 'npm run check' <<< "$checks"
grep -Fq 'npm run test' <<< "$checks"
grep -Fq 'needs: build' <<< "$browser"
grep -Fq "needs.build.outputs.validate == 'true'" <<< "$browser"
grep -Fq 'max-parallel: 5' <<< "$browser"
grep -Fq 'lane: [quick-1, quick-2, quick-3, quick-4, act-i]' <<< "$browser"
grep -Fq -- '--grep-invert '\''natural first Act I loop:'\'' --shard="$SHARD/4" --workers=1 --fully-parallel --retries=0' <<< "$browser"
grep -Fq -- "--grep 'natural first Act I loop:' --workers=1 --retries=0" <<< "$browser"
grep -Fq 'bash .github/actions/require-validation.sh' <<< "$verify"
grep -Fq 'needs: [build, checks, browser]' <<< "$verify"
if grep -Eq 'continue-on-error:|--passWithNoTests' "$workflow"; then
  echo 'ERROR: masked test failure' >&2; exit 1
fi
if grep -Eq 'npm run (check|test)|playwright install' <<< "$build"; then
  echo 'ERROR: build repeats validation' >&2; exit 1
fi
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
  echo 'ERROR: playtest deployment depends on verify' >&2; exit 1
fi
echo 'PASS: bounded full ready-PR regression and independent main publication'

sweep="$root/.github/workflows/act1-seed-sweep.yml"
grep -Fq 'workflow_dispatch:' "$sweep"
grep -Fq "SEED_SWEEP_COUNT: '250'" "$sweep"
grep -Fq "SEED_SWEEP_REQUIRE_VILLAGES: '1'" "$sweep"
grep -Fq 'start: [0, 1979750, 3959500, 5939250]' "$sweep"
grep -Fq 'max-parallel: 4' "$sweep"
grep -Fq 'set -o pipefail' "$sweep"
if grep -Eq 'pull_request:|continue-on-error:' "$sweep"; then
  echo 'ERROR: extended sweep must be manual and strict' >&2; exit 1
fi
echo 'PASS: 1000 seeds in four manual batches'
