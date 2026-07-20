#!/bin/sh
set -eu

project_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
installer=$(mktemp)

trap 'rm -f "$installer"' EXIT
export HOME="$project_root/.render-home"

curl -fsSL https://raw.githubusercontent.com/okx/onchainos-skills/main/install.sh -o "$installer"
sh "$installer"
test -x "$HOME/.local/bin/onchainos"
