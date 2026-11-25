#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo 'Usage: bash scripts/verify.sh targeted tests/unit/NAME.test.ts [...] | act-i-diagnostic evidence|crypt|story|all | act-i-browser | agent | full' >&2
  exit 2
}

[[ $# -ge 1 ]] || usage
mode=$1
repo_root=$(git rev-parse --show-toplevel)
cd "$repo_root/web"

case "$mode" in
  targeted)
    shift
    [[ $# -ge 1 ]] || usage
    for test_file in "$@"; do
      [[ "$test_file" == tests/unit/*.test.ts && -f "$test_file" ]] || usage
    done
    npm run test -- "$@"
    ;;
  act-i-diagnostic)
    [[ $# -eq 2 ]] || usage
    # Explicit diagnostic selection, never a substitute for full validation.
    evidence=(tests/unit/Issue125SealEvidenceInteraction.test.ts
      tests/unit/Issue125AutoNavigationPath.test.ts
      tests/unit/Issue125MorrowToCryptContinuity.test.ts)
    crypt=(tests/unit/Issue125CryptBossVesnaEnding.test.ts
      tests/unit/WaveGHollowKingCombat.test.ts
      tests/unit/Agent33HollowKingPhases.test.ts
      tests/unit/WaveGHollowKingArena.test.ts)
    story=(tests/unit/Issue125ActIStoryGuidance.test.ts
      tests/unit/WaveEActIProgression.test.ts
      tests/unit/WaveEActIRuntime.test.ts)
    case "$2" in
      evidence) files=("${evidence[@]}") ;;
      crypt) files=("${crypt[@]}") ;;
      story) files=("${story[@]}") ;;
      all) files=("${evidence[@]}" "${crypt[@]}" "${story[@]}") ;;
      *) usage ;;
    esac
    for test_file in "${files[@]}"; do
      [[ -f "$test_file" ]] || { echo "Missing diagnostic: $test_file" >&2; exit 1; }
    done
    npm run test -- "${files[@]}"
    ;;
  act-i-browser)
    [[ $# -eq 1 ]] || usage
    npm run build
    npm run test:e2e -- --grep 'natural first Act I loop:' --workers=1 --retries=0
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
