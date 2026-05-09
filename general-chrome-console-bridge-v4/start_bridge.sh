#!/bin/bash
# chrome-console-bridge startup script
# Run this at the beginning of every browser automation session.
# Agnostic — works for any target URL.

set -e

BRIDGE_DIR="$(cd "$(dirname "$0")" && pwd)"
BROWSER_APP="${BROWSER_APP:-Google Chrome Canary}"
BRIDGE_HOST="${BRIDGE_HOST:-127.0.0.1}"
BRIDGE_PORT="${BRIDGE_PORT:-4471}"
EXTENSION_ID="${EXTENSION_ID:-ocoippkfgdejcjjaglllggbfcpkikfag}"
BRIDGE_URL="http://${BRIDGE_HOST}:${BRIDGE_PORT}"

echo "=== Chrome Console Bridge Startup ==="

# 1. Start bridge server if not already running
if curl -s "$BRIDGE_URL/health" > /dev/null 2>&1; then
  echo "[1/4] Bridge server already running — skipping."
else
  echo "[1/4] Starting bridge server..."
  cd "$BRIDGE_DIR"
  BRIDGE_PORT="$BRIDGE_PORT" node bridge/server.mjs &
  sleep 2
  if curl -s "$BRIDGE_URL/health" > /dev/null 2>&1; then
    echo "      Bridge server started OK."
  else
    echo "      ERROR: Bridge server failed to start. Check bridge/server.mjs."
    exit 1
  fi
fi

# 2. Open bridge.html poller tab in Chrome (keeps extension connected)
echo "[2/4] Opening bridge.html poller tab in $BROWSER_APP..."
PREV_TAB_INFO=$(osascript -e "tell application \"$BROWSER_APP\" to get {id of active tab of window 1, URL of active tab of window 1}")
PREV_TAB_ID=$(echo "$PREV_TAB_INFO" | grep -oE '^[0-9]+')
PREV_TAB_URL=$(echo "$PREV_TAB_INFO" | sed -E 's/^[0-9]+, //')
osascript -e "tell application \"$BROWSER_APP\" to tell window 1 to make new tab at end of tabs with properties {URL:\"chrome-extension://${EXTENSION_ID}/bridge.html\"}"
sleep 1
echo "      bridge.html tab open."

# 3. Keep using the previously active browser tab as the smoke-test target
echo "[3/4] Using previous active tab as target..."
echo "      Previous tab: $PREV_TAB_INFO"
TAB_ID="$PREV_TAB_ID"
echo "      Target tab ID: $TAB_ID"

# 4. Smoke test
echo "[4/4] Running smoke test..."
cat > /tmp/ccb_smoke.json << EOF
{
  "type": "RUN_SNIPPET",
  "targetTabId": $TAB_ID,
  "payload": {
    "code": "return document.title",
    "world": "MAIN"
  }
}
EOF

RESULT=$(curl -s -X POST "$BRIDGE_URL/commands" \
  -H "Content-Type: application/json" \
  -d @/tmp/ccb_smoke.json)

CMD_ID=$(echo "$RESULT" | grep -oE '"id":"[^"]+"' | cut -d'"' -f4)

if [ -z "$CMD_ID" ]; then
  echo "      ERROR: No command ID returned. Is bridge.html tab open and active?"
  exit 1
fi

sleep 1
POLL=$(curl -s "$BRIDGE_URL/commands/$CMD_ID")
echo "      Smoke test result: $POLL"

echo ""
echo "=== Bridge ready ==="
echo "  Server:      $BRIDGE_URL"
echo "  Extension:   $EXTENSION_ID"
echo "  Target tab:  $TAB_ID"
echo "  Target URL:  $PREV_TAB_URL"
echo ""
echo "Next agent: use targetTabId=$TAB_ID in all POST /commands calls."
