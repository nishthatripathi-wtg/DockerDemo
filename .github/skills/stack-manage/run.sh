#!/bin/bash
# run.sh — Start, stop, restart, or inspect individual Docker Swarm stacks.
# Usage: bash run.sh <action> <stack|all>
#   action: start | stop | restart | status | logs
#   stack:  traefik | splunk | otel | git | registry | jenkins | myapp | all

set -e

REPO_DIR="$(cd "$(dirname "$0")/../../.." && pwd)"
DOCKER_DIR="$REPO_DIR/docker"

ACTION="${1:-status}"
STACK="${2:-all}"

# ── Stack → compose file mapping ─────────────────────────────────────────────
declare -A COMPOSE_MAP=(
  [traefik]="$DOCKER_DIR/docker-compose-traefik.yml"
  [splunk]="$DOCKER_DIR/docker-compose-splunk.yml"
  [otel]="$DOCKER_DIR/docker-compose-otel-dev.yml"
  [git]="$DOCKER_DIR/docker-compose-git.yml"
  [registry]="$DOCKER_DIR/docker-compose-registry.yml"
  [jenkins]="$DOCKER_DIR/docker-compose-jenkins.yml"
  [myapp]="$DOCKER_DIR/docker-compose-app.yml"
)

# Ordered deploy sequence (dependency order)
DEPLOY_ORDER=(traefik splunk otel git registry jenkins myapp)

# ── Helper functions ──────────────────────────────────────────────────────────
is_healthy_stack() {
  local name=$1
  if ! docker stack ls --format '{{.Name}}' | grep -q "^${name}$"; then
    return 1
  fi
  local has_services=false
  while read -r svc; do
    [ -z "$svc" ] && continue
    has_services=true
    rep=$(docker service ls --filter "name=$svc" --format '{{.Replicas}}')
    run=$(echo "$rep" | cut -d/ -f1)
    des=$(echo "$rep" | cut -d/ -f2)
    if [ -z "$run" ] || [ -z "$des" ] || [ "$run" != "$des" ]; then
      return 1
    fi
  done < <(docker stack services "$name" --format '{{.Name}}' 2>/dev/null)
  $has_services
}

wait_for_stack() {
  local name=$1
  for service in $(docker stack services "$name" --format '{{.Name}}' 2>/dev/null); do
    echo -n "  Waiting for $service... "
    for _ in $(seq 1 40); do
      ready=$(docker service ls --filter "name=$service" --format '{{.Replicas}}')
      desired=$(echo "$ready" | cut -d'/' -f2)
      running=$(echo "$ready" | cut -d'/' -f1)
      if [ "$running" = "$desired" ] && [ "$running" != "0" ]; then
        echo "up ($ready)"
        break
      fi
      sleep 3
    done
  done
}

wait_for_removal() {
  local name=$1
  echo -n "  Waiting for $name to stop... "
  for _ in $(seq 1 20); do
    if ! docker stack ls --format '{{.Name}}' | grep -q "^${name}$"; then
      echo "done"
      return
    fi
    sleep 2
  done
  echo "timeout (may still be draining)"
}

do_start() {
  local name=$1
  local file="${COMPOSE_MAP[$name]}"
  if [ -z "$file" ]; then
    echo "❌ Unknown stack: $name"
    echo "   Valid stacks: ${!COMPOSE_MAP[*]}"
    exit 1
  fi
  if [ ! -f "$file" ]; then
    echo "❌ Compose file not found: $file"
    exit 1
  fi
  if is_healthy_stack "$name"; then
    echo "✅ $name — already healthy, skipping"
    return
  fi
  echo "🚀 Starting $name..."
  docker stack deploy -c "$file" "$name" --with-registry-auth
  wait_for_stack "$name"
  echo "✅ $name is up"
}

do_stop() {
  local name=$1
  if ! docker stack ls --format '{{.Name}}' | grep -q "^${name}$"; then
    echo "⏹  $name — not running, nothing to stop"
    return
  fi
  echo "⏹  Stopping $name..."
  docker stack rm "$name"
  wait_for_removal "$name"
}

do_restart() {
  local name=$1
  echo "🔄 Restarting $name..."
  do_stop "$name"
  sleep 3
  do_start "$name"
}

do_status() {
  local name=$1
  if ! docker stack ls --format '{{.Name}}' | grep -q "^${name}$"; then
    echo "⏹  $name — not deployed"
    return
  fi
  if is_healthy_stack "$name"; then
    echo "✅ $name — healthy"
  else
    echo "⚠  $name — degraded"
  fi
  docker stack services "$name" --format '   {{.Name}}\t{{.Replicas}}\t{{.Image}}'
}

do_logs() {
  local name=$1
  if ! docker stack ls --format '{{.Name}}' | grep -q "^${name}$"; then
    echo "⏹  $name — not deployed, no logs"
    return
  fi
  for service in $(docker stack services "$name" --format '{{.Name}}'); do
    echo "── $service ──────────────────────────────────"
    docker service logs "$service" --tail 30 --no-trunc 2>&1 | tail -30
    echo ""
  done
}

# ── Resolve stack list ────────────────────────────────────────────────────────
if [ "$STACK" = "all" ]; then
  STACKS=("${DEPLOY_ORDER[@]}")
else
  STACKS=("$STACK")
fi

# ── Execute action ────────────────────────────────────────────────────────────
case "$ACTION" in
  start)
    for s in "${STACKS[@]}"; do do_start "$s"; done
    ;;
  stop)
    # Stop in reverse order
    if [ "$STACK" = "all" ]; then
      for (( i=${#DEPLOY_ORDER[@]}-1; i>=0; i-- )); do
        do_stop "${DEPLOY_ORDER[$i]}"
      done
    else
      for s in "${STACKS[@]}"; do do_stop "$s"; done
    fi
    ;;
  restart)
    for s in "${STACKS[@]}"; do do_restart "$s"; done
    ;;
  status)
    echo "━━━ Stack Status ━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    for s in "${STACKS[@]}"; do do_status "$s"; done
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    ;;
  logs)
    for s in "${STACKS[@]}"; do do_logs "$s"; done
    ;;
  *)
    echo "Usage: $0 <start|stop|restart|status|logs> <stack|all>"
    echo "Stacks: traefik splunk otel git registry jenkins myapp"
    exit 1
    ;;
esac
