#!/usr/bin/env bash
# GPL-3.0-only — test the actual classifier against real Git trees.
set -euo pipefail
script="$(cd "$(dirname "$0")/.." && pwd)/.github/actions/validation-scope.sh"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
cd "$tmp"
git init -q
git config user.email tests@example.invalid
git config user.name 'Validation scope tests'
mkdir -p web/src/ui web/src/game/core web/tests/e2e docs bin
echo initial > web/src/styles.css
echo initial > web/src/ui/InventoryPanel.svelte
echo initial > web/src/ui/NpcDialogue.svelte
echo initial > web/src/game/core/GameSimulation.ts
git add web
git commit -qm base
base=$(git rev-parse HEAD)
export EVENT_NAME=pull_request PR_BASE_SHA=$base PR_HEAD_SHA='' BEFORE_SHA=''
export GITHUB_SHA=$base GITHUB_OUTPUT=$tmp/output GITHUB_REPOSITORY=example/repo
export DEPLOYED_SHA=$base HISTORY_MODE=success
cat > bin/gh <<'GH'
#!/usr/bin/env bash
set -eu
case "$*" in
  *'/deployments?environment=github-pages&per_page=1'*)
    case "$HISTORY_MODE" in
      error) exit 1 ;;
      missing) exit 0 ;;
      *) printf '7\t%s\n' "$DEPLOYED_SHA" ;;
    esac ;;
  *'/deployments/7/statuses?per_page=1'*)
    case "$HISTORY_MODE" in
      failed) echo failure ;;
      status-error) exit 1 ;;
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
  node - "$GITHUB_OUTPUT" "$expected" <<'NODE'
const fs = require('node:fs');
const assert = require('node:assert/strict');
const output = Object.fromEntries(fs.readFileSync(process.argv[2], 'utf8').trim().split('\n').map(line => {
  const i = line.indexOf('=');
  return [line.slice(0, i), line.slice(i+1)];
}));
const expected = process.argv[3];
assert.equal(output.profile, expected);
const lanes = Array.from({length: 6}, (_, i) => ({lane: 'quick-' + (i+1), shard: (i+1) + '/6'}));
if (expected === 'full') lanes.push({lane: 'act-i', shard: ''});
assert.deepEqual(JSON.parse(output.matrix), {include: lanes});
NODE
  echo "PASS: $label"
}
commit_change() {
  mkdir -p "$(dirname "$1")"
  printf '%s\n' "$RANDOM" >> "$1"
  git add -A -- "$1"
  git commit -qm "change $1"
}
make_pr() {
  git checkout -q --detach "$base"
  for path in "$@"; do commit_change "$path"; done
  export PR_HEAD_SHA=$(git rev-parse HEAD)
  git checkout -q --detach "$base"
  git merge -q --no-ff --no-edit "$PR_HEAD_SHA"
  export GITHUB_SHA=$(git rev-parse HEAD)
}
make_pr web/src/styles.css
check quick 'CSS only'
css_head=$PR_HEAD_SHA
make_pr web/src/ui/InventoryPanel.svelte web/tests/e2e/inventory-ux.spec.ts
check quick 'inventory UI plus relevant regression'
make_pr web/src/ui/NpcDialogue.svelte
check full 'quest dialog is gameplay-sensitive'
make_pr web/src/styles.css web/src/game/core/GameSimulation.ts
check full 'mixed CSS and simulation'
make_pr web/tests/e2e/issue125-natural-first-loop.spec.ts
check full 'natural Act I test changed'
make_pr web/tests/e2e/character-menu.ts
check full 'shared browser helper'
make_pr .github/workflows/quality.yml
check full 'CI change requires full validation'
make_pr web/package-lock.json
check full 'dependency change'
make_pr docs/example.md
check quick 'documentation'
make_pr web/src/styles.css
PR_HEAD_SHA=$base check full 'PR checkout does not match event head'
PR_BASE_SHA=invalid check full 'invalid PR base'
EVENT_NAME=workflow_dispatch check full 'manual dispatch'
EVENT_NAME=unknown check full 'unknown event'
EVENT_NAME=push BEFORE_SHA=$base GITHUB_SHA=$css_head check quick 'main CSS with successful deployment baseline'
EVENT_NAME=push BEFORE_SHA=$base GITHUB_SHA=$css_head HISTORY_MODE=failed check full 'failed deployment'
EVENT_NAME=push BEFORE_SHA=$base GITHUB_SHA=$css_head HISTORY_MODE=missing check full 'missing deployment'
EVENT_NAME=push BEFORE_SHA=$base GITHUB_SHA=$css_head HISTORY_MODE=error check full 'deployment API unavailable'
EVENT_NAME=push BEFORE_SHA=$base GITHUB_SHA=$css_head HISTORY_MODE=status-error check full 'deployment status unavailable'
EVENT_NAME=push BEFORE_SHA=invalid GITHUB_SHA=$css_head check full 'invalid push range'
git checkout -q --detach "$base"
commit_change web/src/game/core/GameSimulation.ts
gameplay=$(git rev-parse HEAD)
commit_change web/src/styles.css
export GITHUB_SHA=$(git rev-parse HEAD)
EVENT_NAME=push BEFORE_SHA=$gameplay DEPLOYED_SHA=$base check full 'CSS push recovers unpublished gameplay change'
EVENT_NAME=push BEFORE_SHA=$gameplay DEPLOYED_SHA=$gameplay check quick 'CSS after verified gameplay deployment'
echo 'PASS: all validation scope scenarios'
