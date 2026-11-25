#!/usr/bin/env bash
# GPL-3.0-only — require positive results from build, checks and browser matrix.
set -euo pipefail
if [[ $# -ne 3 ]]; then
  echo 'Expected build, checks, browser results.' >&2
  exit 1
fi
names=(build checks browser)
for result in "$@"; do
  if [[ "$result" != success ]]; then
    echo "Required validation ${names[0]} did not succeed: $result" >&2
    exit 1
  fi
  names=("${names[@]:1}")
done
echo 'All required validation dependencies succeeded.'
