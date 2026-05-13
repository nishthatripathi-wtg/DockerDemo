#!/bin/bash
# kibana-import.sh — Import the correlation dashboard NDJSON into Kibana
#
# Expects: KIBANA_URL, KIBANA_USER, KIBANA_PASS (env vars)
# Defaults work for the local Swarm setup.

set -euo pipefail

KIBANA_URL="${KIBANA_URL:-http://kibana.myapp.com}"
KIBANA_USER="${KIBANA_USER:-elastic}"
KIBANA_PASS="${KIBANA_PASS:-changeme}"
NDJSON="${1:-kibana-correlation-dashboard.ndjson}"

if [ ! -f "$NDJSON" ]; then
  echo "Error: $NDJSON not found" >&2
  exit 1
fi

echo "Importing $NDJSON → $KIBANA_URL ..."

RESPONSE=$(curl -s -w '\n%{http_code}' \
  -u "${KIBANA_USER}:${KIBANA_PASS}" \
  -X POST "${KIBANA_URL}/api/saved_objects/_import?overwrite=true" \
  -H 'kbn-xsrf: true' \
  -F "file=@${NDJSON}" 2>&1)

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | sed '$d')

if echo "$BODY" | python3 -c "
import sys, json
d = json.load(sys.stdin)
if d.get('success'):
    results = d.get('successResults', [])
    print(f'✅ Import successful — {d[\"successCount\"]} object(s)')
    for r in results:
        print(f'   {r[\"type\"]}: {r[\"meta\"][\"title\"]}  (id={r[\"id\"]})')
    dash_id = next((r['id'] for r in results if r['type'] == 'dashboard'), None)
    if dash_id:
        print(f'\n   Open: ${KIBANA_URL}/app/dashboards#/view/{dash_id}')
else:
    print(f'❌ Import failed (HTTP {\"$HTTP_CODE\"})')
    errors = d.get('errors', [])
    for e in errors:
        print(f'   {e.get(\"type\",\"?\")}/{e.get(\"id\",\"?\")}: {e.get(\"error\",{}).get(\"message\",\"?\")}')
" 2>/dev/null; then
  :
else
  echo "Raw response (HTTP $HTTP_CODE):"
  echo "$BODY"
fi
