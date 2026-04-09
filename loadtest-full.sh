#!/bin/bash
# loadtest-full.sh — Generate realistic traffic across all backend endpoints
# Usage: ./loadtest-full.sh [duration_seconds] [concurrent_workers]

URL_BASE="http://127.0.0.1"
HOST="myapp.local"
DURATION=${1:-60}
WORKERS=${2:-20}
CURL="curl -sf -o /dev/null -H Host:${HOST}"

echo "=== Load Test ==="
echo "Target   : $URL_BASE (Host: $HOST)"
echo "Duration : ${DURATION}s"
echo "Workers  : $WORKERS"
echo "=================="

# ── Setup: register test users ───────────────────────────────────────────────
echo "[setup] Registering test users..."
for i in $(seq 1 $WORKERS); do
  curl -sf -o /dev/null -H "Host:${HOST}" \
    -X POST "${URL_BASE}/api/auth/register?username=loaduser${i}&password=pass123&displayName=User${i}&preferredLanguage=en&timezone=UTC&theme=dark"
done
echo "[setup] Done. Starting load..."

END=$((SECONDS + DURATION))

# ── Worker: cycles through realistic API calls ───────────────────────────────
worker() {
  local id=$1
  local user="loaduser${id}"
  local peer="loaduser$(( (id % WORKERS) + 1 ))"

  while [ $SECONDS -lt $END ]; do
    # Login
    $CURL -X POST "${URL_BASE}/api/auth/login?username=${user}&password=pass123"

    # Browse conversations
    $CURL "${URL_BASE}/api/messages/inbox?username=${user}"
    $CURL "${URL_BASE}/api/messages/conversations?username=${user}"

    # Send a message
    $CURL -X POST "${URL_BASE}/api/messages/send?sender=${user}&recipient=${peer}&content=hello+from+loadtest&language=en"

    # Check thread with peer
    $CURL "${URL_BASE}/api/messages/thread?username=${user}&counterpart=${peer}"

    # View profile
    $CURL "${URL_BASE}/api/profile?username=${user}"

    # Search users
    $CURL "${URL_BASE}/api/auth/users/search?query=load&exclude=${user}"

    # Get languages
    $CURL "${URL_BASE}/api/greeting/languages"

    # DB health check
    $CURL "${URL_BASE}/db"

    sleep 0.1
  done
}

# ── Launch workers ────────────────────────────────────────────────────────────
for i in $(seq 1 $WORKERS); do
  worker $i &
done

wait
echo "Load test complete"
