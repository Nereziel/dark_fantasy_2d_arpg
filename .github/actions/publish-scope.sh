#!/usr/bin/env bash
# GPL-3.0-only. A skipped/failed Pages deployment must not be lost when the
# next main push contains only tests. Uncertain history favors a full publish
# of the successfully built artifact. The independent verify gate remains strict.
set -euo pipefail
publish() { echo "publish=$1" >> "$GITHUB_OUTPUT"; }
if [[ "$EVENT_NAME" == workflow_dispatch ]]; then
  publish true
  exit 0
fi
if [[ "$EVENT_NAME" != push ]]; then
  publish false
  exit 0
fi
valid_commit() {
  [[ "$1" =~ ^[0-9a-f]{40}$ ]] && git cat-file -e "$1^{commit}" 2>/dev/null
}
app_unchanged() {
  git diff --quiet --no-renames "$1" "$GITHUB_SHA" -- \
    web/index.html web/src web/public web/package.json web/package-lock.json \
    web/npm-shrinkwrap.json 'web/vite.config.*' 'web/svelte.config.*' \
    'web/tsconfig*.json' 'web/postcss.config.*' 'web/tailwind.config.*' \
    web/scripts .github/actions .github/workflows/quality.yml
}
# Normal app pushes do not need a history request. Invalid or unavailable
# comparisons are intentionally treated as a change.
if ! valid_commit "$BEFORE_SHA" || ! app_unchanged "$BEFORE_SHA"; then
  publish true
  exit 0
fi
# For test-only pushes, consult the newest deployment of the same environment
# used by the deploy job. A failed/inactive/missing status is not proof that the
# current app is live. Do not assume the preceding commit was published.
if ! deployment=$(gh api "repos/$GITHUB_REPOSITORY/deployments?environment=github-pages&per_page=1" \
  --jq '.[0] | select(.id != null and .sha != null) | [.id,.sha] | @tsv'); then
  echo 'Deployment history unavailable; validate and publish.' >&2
  publish true
  exit 0
fi
IFS=$'\t' read -r deployment_id deployed_sha <<< "$deployment"
if [[ ! "$deployment_id" =~ ^[0-9]+$ ]] || ! valid_commit "$deployed_sha"; then
  publish true
  exit 0
fi
if ! status=$(gh api "repos/$GITHUB_REPOSITORY/deployments/$deployment_id/statuses?per_page=1" \
  --jq '.[0].state // ""'); then
  echo 'Deployment status unavailable; validate and publish.' >&2
  publish true
  exit 0
fi
if [[ "$status" == success ]] && app_unchanged "$deployed_sha"; then
  publish false
else
  publish true
fi
