#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo 'Usage: bash scripts/agent-bootstrap.sh agent/NN-task <40-char-base-sha> <worktree-directory>' >&2
  exit 2
}

[[ $# -eq 3 ]] || usage
branch=$1
base_sha=$2
worktree_dir=$3
# Resolve relative paths from the caller's directory, independent of git -C.
case "$worktree_dir" in
  /*) ;;
  *) worktree_dir="$(pwd)/$worktree_dir" ;;
esac
[[ "$branch" == agent/* ]] || usage
[[ "$base_sha" =~ ^[0-9a-f]{40}$ ]] || usage

repo_root=$(git rev-parse --show-toplevel)
if ! git -C "$repo_root" cat-file -e "${base_sha}^{commit}" 2>/dev/null; then
  echo 'The supplied BASE_SHA is not present locally. Fetch it before bootstrapping.' >&2
  exit 1
fi

# Each agent has a distinct checkout; npm's content-addressed download cache is
# shared through the user's standard ~/.npm directory, not through node_modules.
mkdir -p "$(dirname "$worktree_dir")"
git -C "$repo_root" worktree add -b "$branch" "$worktree_dir" "$base_sha"
(
  cd "$worktree_dir/web"
  npm ci --prefer-offline --no-audit --no-fund
)
printf 'Created %s at %s, pinned to %s\n' "$branch" "$worktree_dir" "$base_sha"
