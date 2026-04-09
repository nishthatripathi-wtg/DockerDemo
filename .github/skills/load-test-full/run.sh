#!/bin/bash
# run.sh — Full-endpoint load test with Splunk telemetry verification
# Usage: bash .github/skills/load-test-full/run.sh [duration_seconds] [workers]

set -e

REPO_DIR="$(cd "$(dirname "$0")/../../.." && pwd)"
DURATION=${1:-60}
WORKERS=${2:-1000}

echo "╔══════════════════════════════════════════╗"
echo "║        Full Endpoint Load Test           ║"
echo "╠══════════════════════════════════════════╣"
echo "║  Duration : ${DURATION}s"
echo "║  Workers  : ${WORKERS}"
echo "╚══════════════════════════════════════════╝"
echo ""

# ── 1. Pre-flight checks ─────────────────────────────────────────────────────
echo "[1/4] Pre-flight checks..."
BACKEND_CODE=$(curl -sf -o /dev/null -w '%{http_code}' -H "Host:myapp.local" http://127.0.0.1/api/greeting 2>/dev/null || echo "000")
if [ "$BACKEND_CODE" = "000" ]; then
  echo "      ❌ Backend is not reachable at http://127.0.0.1/api/greeting (Host: myapp.local)"
  echo "      Make sure the app stack is deployed: docker stack deploy -c docker/docker-compose-app.yml myapp --with-registry-auth"
  exit 1
fi
echo "      ✅ Backend reachable (HTTP $BACKEND_CODE)"

SPLUNK_CODE=$(curl -sf -o /dev/null -w '%{http_code}' -k http://splunk_splunk:8088/services/collector/health 2>/dev/null || echo "000")
if [ "$SPLUNK_CODE" = "200" ]; then
  echo "      ✅ Splunk HEC healthy"
else
  echo "      ⚠  Splunk HEC returned '$SPLUNK_CODE' — telemetry may not be ingested"
fi

# ── 2. Get Splunk event count before test ─────────────────────────────────────
echo ""
echo "[2/4] Capturing Splunk baseline..."
BEFORE_COUNT=$(curl -sf -k -u admin:changeme123 \
  "http://splunk.myapp.com:8000/services/search/jobs/export" \
  -d search="search index=main source=otel | stats count" \
  -d output_mode=csv \
  -d earliest_time="-15m" 2>/dev/null | tail -1 || echo "unknown")
echo "      Events in last 15 min (before): ${BEFORE_COUNT}"

# ── 3. Run the load test ─────────────────────────────────────────────────────
echo ""
echo "[3/4] Running load test..."
echo ""
bash "$REPO_DIR/loadtest-full.sh" "$DURATION" "$WORKERS"

# ── 4. Check Splunk after test ────────────────────────────────────────────────
echo ""
echo "[4/4] Checking Splunk ingestion (waiting 15s for pipeline flush)..."
sleep 15

AFTER_COUNT=$(curl -sf -k -u admin:changeme123 \
  "http://splunk.myapp.com:8000/services/search/jobs/export" \
  -d search="search index=main source=otel | stats count" \
  -d output_mode=csv \
  -d earliest_time="-15m" 2>/dev/null | tail -1 || echo "unknown")
echo "      Events in last 15 min (after): ${AFTER_COUNT}"

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║           Load Test Complete             ║"
echo "╠══════════════════════════════════════════╣"
echo "║  Splunk events before: ${BEFORE_COUNT}"
echo "║  Splunk events after : ${AFTER_COUNT}"
echo "║                                          "
echo "║  Check Splunk: http://splunk.myapp.com   ║"
echo "╚══════════════════════════════════════════╝"
