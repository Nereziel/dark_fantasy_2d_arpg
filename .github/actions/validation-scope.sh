#!/usr/bin/env bash
# GPL-3.0-only — conservative classification of exact checked-out Git trees.
# All six quick browser shards, typecheck, build and unit tests remain mandatory.
set -euo pipefail
quick='{"include":[{"lane":"quick-1","shard":"1/6"},{"lane":"quick-2","shard":"2/6"},{"lane":"quick-3","shard":"3/6"},{"lane":"quick-4","shard":"4/6"},{"lane":"quick-5","shard":"5/6"},{"lane":"quick-6","shard":"6/6"}]}'
# Keep the matrices explicit; a missing/invalid output fails the browser gate.
full='{"include":[{"lane":"quick-1","shard":"1/6"},{"lane":"quick-2","shard":"2/6"},{"lane":"quick-3","shard":"3/6"},{"lane":"quick-4","shard":"4/6"},{"lane":"quick-5","shard":"5/6"},{"lane":"quick-6","shard":"6/6"},{"lane":"act-i","shard":""}]}'
emit() {
  local profile=$1 reason=$2 matrix=$full
  if [[ "$profile" == quick ]]; then matrix=$quick; fi
  printf 'profile=%s\nmatrix=%s\n' "$profile" "$matrix" >> "$GITHUB_OUTPUT"
  printf 'Validation profile: %s (%s)\n' "$profile" "$reason"
  if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
    printf '### Validation profile: %s\n\n%s. All six quick browser shards, build, typecheck and unit tests are required.\n' "$profile" "$reason" >> "$GITHUB_STEP_SUMMARY"
  fi
  exit 0
}
valid_commit() {
  [[ "$1" =~ ^[0-9a-f]{40}$ ]] && git cat-file -e "$1^{commit}" 2>/dev/null
}
# An explicit allowlist, not a broad "all UI" path exemption. Quest dialogs,
# App.svelte, renderer/picking, bridge, simulation, save, inputs, shared helpers,
# natural E2E, configs and CI changes always require full validation.
quick_path() {
  case "$1" in
    web/tests/e2e/issue125-natural-first-loop.spec.ts) return 1 ;;
    web/src/styles.css|web/src/ui/InventoryPanel.svelte|web/src/ui/StashPanel.svelte|web/src/ui/TradePanel.svelte|web/src/ui/ItemArt.svelte|web/src/ui/GemArt.svelte|web/src/game/items/itemPresentation.ts|web/src/i18n/locales/cs.json|web/src/i18n/locales/en.json)
      return 0 ;;
    web/tests/unit/*.test.ts|web/tests/e2e/*.spec.ts|docs/*.md|README.md)
      return 0 ;;
    web/public/*.png|web/public/*.webp|web/public/*.jpg|web/public/*.svg|web/public/*.ogg|web/public/*.mp3|web/src/assets/*.png|web/src/assets/*.webp|web/src/assets/*.jpg|web/src/assets/*.svg|web/src/assets/*.ogg|web/src/assets/*.mp3)
      return 0 ;;
    *) return 1 ;;
  esac
}
changes_are_quick() {
  local before=$1 after=$2 path
  valid_commit "$before" && valid_commit "$after" || return 1
  git merge-base --is-ancestor "$before" "$after" || return 1
  local paths
  paths=$(mktemp) || return 1
  # No renames: both the source deletion and destination addition are classified.
  if ! git diff --name-only -z --no-renames "$before" "$after" -- > "$paths"; then
    rm -f "$paths"; return 1
  fi
  while IFS= read -r -d '' path; do
    if ! quick_path "$path"; then
      rm -f "$paths"; return 1
    fi
  done < "$paths"
  rm -f "$paths"
}
after=${GITHUB_SHA:-}
case "${EVENT_NAME:-}" in
  pull_request)
    base=${PR_BASE_SHA:-}
    head=${PR_HEAD_SHA:-}
    # GitHub runs on the synthetic merge commit. Verify both event parents
    # before narrowing scope; do not rely on a possibly stale head-only diff.
    if ! valid_commit "$base" || ! valid_commit "$head" || ! valid_commit "$after" ||
      [[ "$(git rev-parse "$after^1" 2>/dev/null || true)" != "$base" ||
         "$(git rev-parse "$after^2" 2>/dev/null || true)" != "$head" ]]; then
      emit full 'PR merge tree or event range unavailable'
    fi
    if changes_are_quick "$base" "$after"; then
      emit quick 'Only allowlisted presentation, isolated tests or documentation changed'
    fi
    emit full 'Gameplay-sensitive, shared or unknown paths changed'
    ;;
  push)
    if ! changes_are_quick "${BEFORE_SHA:-}" "$after"; then
      emit full 'Main push has gameplay-sensitive changes or an uncertain range'
    fi
    # A test-only/visual push can recover an earlier failed gameplay publish.
    # Require the latest Pages deployment to have succeeded and compare its
    # actual tree as well as the immediate push range.
    if ! deployment=$(gh api "repos/$GITHUB_REPOSITORY/deployments?environment=github-pages&per_page=1" \
      --jq '.[0] | select(.id != null and .sha != null) | [.id,.sha] | @tsv'); then
      emit full 'Deployment history unavailable'
    fi
    IFS=$'\t' read -r deployment_id deployed_sha <<< "$deployment"
    if [[ ! "$deployment_id" =~ ^[0-9]+$ ]] || ! valid_commit "${deployed_sha:-}"; then
      emit full 'No verified deployment baseline'
    fi
    if ! status=$(gh api "repos/$GITHUB_REPOSITORY/deployments/$deployment_id/statuses?per_page=1" \
      --jq '.[0].state // ""'); then
      emit full 'Deployment status unavailable'
    fi
    if [[ "$status" != success ]] || ! changes_are_quick "$deployed_sha" "$after"; then
      emit full 'Deployment recovery or gameplay changes since last publish'
    fi
    emit quick 'Presentation or isolated tests only since last successful deployment and push'
    ;;
  *)
    emit full 'Manual or unknown event requires full validation'
    ;;
esac
