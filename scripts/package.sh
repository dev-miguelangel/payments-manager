#!/bin/sh
# Builds dist/pagos-<version>.zip for the Chrome Web Store: only the files the extension
# loads, with manifest.json at the root of the zip.
set -eu

cd "$(dirname "$0")/.."

version=$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' manifest.json)
out="dist/pagos-$version.zip"

# Every file the extension uses must be listed here.
files="manifest.json background.js border.js sidepanel.html sidepanel.js sidepanel.css
summary.html summary.js summary.css lock.css lib icons"

for f in $files; do
  [ -e "$f" ] || { echo "Falta $f" >&2; exit 1; }
done

mkdir -p dist
rm -f "$out"
# shellcheck disable=SC2086
zip -rq "$out" $files -x '*.DS_Store'

echo "Listo: $out"
unzip -l "$out" | tail -n 1
