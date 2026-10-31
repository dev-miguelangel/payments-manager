#!/bin/sh
# Renders the Chrome Web Store images into store/images/ from the real panel and summary
# pages, fed with the sample data in mock.js. Needs Google Chrome and Python 3 with Pillow.
set -eu

cd "$(dirname "$0")/../.."
root=$(pwd)
chrome="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
out="$root/store/images"
build=$(mktemp -d)
# A free port, so a server left over from another run can't answer instead.
port=$(python3 -c 'import socket; s = socket.socket(); s.bind(("", 0)); print(s.getsockname()[1])')

# Copy of the extension with the fake chrome.* APIs injected before the page scripts.
cp -R manifest.json ./*.js ./*.html ./*.css lib icons "$build/"
cp -R store/marketing "$build/marketing"
for page in sidepanel.html summary.html; do
  sed -i '' 's#<script type="module"#<script src="marketing/mock.js"></script><script type="module"#' "$build/$page"
done
# The real panel always asks for the password; the images show it unlocked (except the lock one).
sed -i '' 's/{ always: true }/{ always: false }/' "$build/sidepanel.js"

(cd "$build" && exec python3 -m http.server "$port" >/dev/null 2>&1) &
server=$!
trap 'kill $server 2>/dev/null; wait $server 2>/dev/null || :; rm -rf "$build"' EXIT
sleep 1

mkdir -p "$out"
shot() { # name width height
  "$chrome" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
    --blink-settings=preferredColorScheme=1 \
    --user-data-dir="$build/profile-$1" --window-size="$2,$3" --virtual-time-budget=6000 \
    --screenshot="$build/$1.png" "http://localhost:$port/marketing/$1.html" 2>/dev/null
  # The store wants 24-bit images without alpha.
  python3 -c "from PIL import Image; import sys; Image.open(sys.argv[1]).convert('RGB').save(sys.argv[2])" \
    "$build/$1.png" "$out/$1.png"
  echo "$out/$1.png"
}

for n in 1 2 3 4 5; do shot "shot-$n" 1280 800; done
shot promo-small 440 280
shot marquee 1400 560
