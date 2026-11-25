#!/usr/bin/env bash
# GPL-3.0-only. Exercise the real scope script in an isolated git repository.
set -euo pipefail
script="$(cd "$(dirname "$0")/.." && pwd)/.github/actions/publish-scope.sh"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
cd "$tmp"
git init -q
git config user.email tests@example.invalid
git config user.name 'Scope tests'
mkdir -p web/src web/tests bin
echo old > web/src/game.ts
git add web
git commit -qm deployed
export DEPLOYED_SHA=$(git rev-parse HEAD)
echo new > web/src/game.ts
git add web
git commit -qm 'application change not deployed'
app=$(git rev-parse HEAD)
echo test > web/tests/game.test.ts
git add web
git commit -qm 'test-only recovery'
export GITHUB_SHA=$(git rev-parse HEAD)
export GITHUB_REPOSITORY=example/test
export HISTORY_MODE=success
export EVENT_NAME=push
export BEFORE_SHA=$app
export GITHUB_OUTPUT=$tmp/output
cat > bin/gh <<'GH'
#!/usr/bin/env bash
set -eu
case "$*" in
  *'/deployments?environment=github-pages&per_page=1'*)
    case "$HISTORY_MODE" in
      error) exit 1 ;;
      empty) exit 0 ;;
      malformed) printf '7\tinvalid\n' ;;
      *) printf '7\t%s\n' "$DEPLOYED_SHA" ;;
    esac ;;
  *'/deployments/7/statuses?per_page=1'*)
    case "$HISTORY_MODE" in
      status-error) exit 1 ;;
      failed) echo failure ;;
      *) echo success ;;
    esac ;;
  *) exit 1 ;;
esac
GH
chmod +x bin/gh
export PATH="$tmp/bin:$PATH"
check() {
  local expected=$1 label=$2
  : > "$GITHUB_OUTPUT"
  bash "$script"
  if [[ "$(cat "$GITHUB_OUTPUT")" != "publish=$expected" ]]; then
    echo "FAIL: $label: expected publish=$expected, got $(cat "$GITHUB_OUTPUT")" >&2
    exit 1
  fi
  echo "PASS: $label"
}
check true 'test-only recovery of an unpublished app change'
DEPLOYED_SHA=$app check false 'test-only push after successful deployment'
HISTORY_MODE=empty check true 'no deployment history'
HISTORY_MODE=error check true 'deployment API unavailable'
HISTORY_MODE=status-error check true 'status API unavailable'
HISTORY_MODE=failed check true 'latest deployment failed'
HISTORY_MODE=malformed check true 'invalid deployment SHA'
# Compare the actual application-changing push, not the later test-only
# commit (which has identical app files to $app).
GITHUB_SHA=$app BEFORE_SHA=$DEPLOYED_SHA check true 'ordinary app change'
EVENT_NAME=pull_request HISTORY_MODE=error check false 'PR never publishes'
EVENT_NAME=workflow_dispatch HISTORY_MODE=error check true 'manual dispatch always publishes'
