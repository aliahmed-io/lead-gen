#!/bin/bash
# Capture full-page screenshots of every dashboard route at phone + tablet widths.
OUT="/tmp/mobile_audit"
mkdir -p "$OUT"
PAGES="/" "/inbox" "/sequences" "/leadgen" "/leads" "/unsubscribes" "/templates" "/accounts" "/health" "/deliverability" "/logs" "/settings"
for p in / /inbox /sequences /leadgen /leads /unsubscribes /templates /accounts /health /deliverability /logs /settings; do
  name="${p#/}"
  name="${name:-home}"
  for w in 390 768; do
    chromium --headless --disable-gpu --no-sandbox --hide-scrollbars \
      --window-size=$w,900 \
      --virtual-time-budget=8000 \
      --screenshot="$OUT/${name}_${w}.png" \
      "http://localhost:3999$p" 2>/dev/null
  done
done
ls -la "$OUT"
