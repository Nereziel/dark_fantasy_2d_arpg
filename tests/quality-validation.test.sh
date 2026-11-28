#!/usr/bin/env bash
# GPL-3.0-only — budget and acceptance policy regression.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
workflow="$root/.github/workflows/quality.yml"
verify=$(sed -n '/^  verify:/,/^  build:/p' "$workflow")
build=$(sed -n '/^  build:/,/^  deploy:/p' "$workflow")
deploy=$(sed -n '/^  deploy:/,$p' "$workflow")
# Only the ready PR gate runs automatically; manual full is explicitly chosen.
grep -Fq 'ready_for_review' "$workflow"
grep -Fq 'converted_to_draft' "$workflow"
grep -Fq 'cancel-in-progress: true' "$workflow"
grep -Fq 'github.event.pull_request.draft == false' <<< "$verify"
grep -Fq "inputs.mode == 'full'" <<< "$verify"
grep -Fq 'npm run check' <<< "$verify"
grep -Fq 'npm run test' <<< "$verify"
grep -Fq 'npm run build' <<< "$verify"
grep -Fq 'tests/e2e/ci-smoke.spec.ts --workers=1 --retries=0' <<< "$verify"
grep -Fq -- "--grep-invert 'natural first Act I loop:' --workers=1 --retries=0" <<< "$verify"
grep -Fq -- "--grep 'natural first Act I loop:' --workers=1 --retries=0" <<< "$verify"
grep -Fq "github.event_name == 'workflow_dispatch'" <<< "$verify"
if grep -Eq 'matrix:|continue-on-error:|--passWithNoTests' "$workflow"; then
  echo 'ERROR: automatic runner matrix or masked test failure' >&2; exit 1
fi
# Deploy remains a build-only main operation; no full test duplication.
grep -Fq "github.event_name == 'push'" <<< "$build"
grep -Fq "inputs.mode == 'publish'" <<< "$build"
grep -Fq 'npm run build' <<< "$build"
if grep -Eq 'npm run (check|test)|playwright install' <<< "$build"; then
  echo 'ERROR: main repeats PR validation' >&2; exit 1
fi
grep -Fxq '    needs: build' <<< "$deploy"
grep -Fq "github.ref == 'refs/heads/main'" <<< "$deploy"
grep -Fq "needs.build.result == 'success'" <<< "$deploy"
grep -Fq "needs.build.outputs.publish == 'true'" <<< "$deploy"
grep -Fq 'name: ${{ needs.build.outputs.bundle }}' <<< "$deploy"
grep -Fq 'test -s web/dist/index.html' <<< "$deploy"
grep -Fq 'actions/upload-pages-artifact@v3' <<< "$deploy"
grep -Fq 'artifact_name: pages-${{ github.sha }}-${{ github.run_attempt }}' <<< "$deploy"
if grep -Fq 'needs.verify' <<< "$deploy"; then
  echo 'ERROR: playtest deployment depends on verify' >&2; exit 1
fi
echo 'PASS: one ready-PR runner, manual full, no duplicated main tests, exact main bundle'
