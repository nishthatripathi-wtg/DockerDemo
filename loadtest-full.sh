#!/bin/bash
# loadtest-full.sh — Generate realistic traffic across all backend endpoints
# Uses k6 to run all virtual users (workers) in parallel.
#
# Usage: ./loadtest-full.sh [duration_seconds] [concurrent_workers]
#
# Environment variables (override defaults):
#   URL_BASE — Base URL of the target service (default: http://127.0.0.1)
#   HOST     — HTTP Host header (default: myapp.local)

URL_BASE="${URL_BASE:-http://127.0.0.1}"
HOST="${HOST:-myapp.local}"
DURATION=${1:-60}
WORKERS=${2:-20}

echo "=== Load Test (k6) ==="
echo "Target   : $URL_BASE (Host: $HOST)"
echo "Duration : ${DURATION}s"
echo "Workers  : $WORKERS (parallel VUs)"
echo "======================"

# ── Setup: register test users ───────────────────────────────────────────────
echo "[setup] Registering test users..."
for i in $(seq 1 $WORKERS); do
  curl -sf -o /dev/null -H "Host:${HOST}" \
    -X POST "${URL_BASE}/api/auth/register?username=loaduser${i}&password=pass123&displayName=User${i}&preferredLanguage=en&timezone=UTC&theme=dark"
done
echo "[setup] Done. Starting k6 load test..."

# ── Run k6 — each VU maps to one worker, all run in parallel ─────────────────
# __VU is the 1-based virtual user index, equivalent to the old worker id.
# URL_BASE, HOST, and WORKERS are passed in via -e so the JS is env-agnostic.
k6 run \
  --vus "$WORKERS" \
  --duration "${DURATION}s" \
  -e URL_BASE="$URL_BASE" \
  -e HOST="$HOST" \
  -e WORKERS="$WORKERS" \
  - <<'K6SCRIPT'

import http from 'k6/http';
import { sleep } from 'k6';

const BASE   = __ENV.URL_BASE;
const HOST   = __ENV.HOST;
const WORKERS = parseInt(__ENV.WORKERS, 10);
const HEADERS = { Host: HOST };

export default function () {
  const id   = __VU;
  const user = `loaduser${id}`;
  const peer = `loaduser${(id % WORKERS) + 1}`;

  http.post(`${BASE}/api/auth/login?username=${user}&password=pass123`,              null, { headers: HEADERS });
  http.get(`${BASE}/api/messages/inbox?username=${user}`,                            { headers: HEADERS });
  http.get(`${BASE}/api/messages/conversations?username=${user}`,                    { headers: HEADERS });
  http.post(`${BASE}/api/messages/send?sender=${user}&recipient=${peer}&content=hello+from+loadtest&language=en`,
                                                                                     null, { headers: HEADERS });
  http.get(`${BASE}/api/messages/thread?username=${user}&counterpart=${peer}`,       { headers: HEADERS });
  http.get(`${BASE}/api/profile?username=${user}`,                                   { headers: HEADERS });
  http.get(`${BASE}/api/auth/users/search?query=load&exclude=${user}`,               { headers: HEADERS });
  http.get(`${BASE}/api/greeting/languages`,                                         { headers: HEADERS });
  http.get(`${BASE}/db`,                                                             { headers: HEADERS });

  sleep(0.1);
}

K6SCRIPT

echo "Load test complete"
