#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REL_DIR="$ROOT_DIR/release"
mkdir -p "$REL_DIR"

# Fallback version extraction if jq is missing
if command -v jq >/dev/null 2>&1; then
  VERSION=$(jq -r .version "$ROOT_DIR/manifest.json")
else
  VERSION=$(grep -oE '"version"\s*:\s*"[^"]+"' "$ROOT_DIR/manifest.json" | head -1 | sed 's/.*"version"\s*:\s*"\([^"]*\)".*/\1/')
fi

NAME=$(grep -oE '"name"\s*:\s*"[^"]+"' "$ROOT_DIR/manifest.json" | head -1 | sed 's/.*"name"\s*:\s*"\([^"]*\)".*/\1/' | tr '[:upper:]' '[:lower:]' | tr ' ' '-')
ZIP="$REL_DIR/${NAME}-${VERSION}.zip"

echo "Packaging $NAME v$VERSION → $ZIP"
tmpdir=$(mktemp -d)
rsync -a --exclude node_modules --exclude .git --exclude release "$ROOT_DIR/" "$tmpdir/"
(
  cd "$tmpdir"
  zip -qr "$ZIP" .
)
mv "$tmpdir/$ZIP" "$ZIP"
rm -rf "$tmpdir"
echo "Done."
