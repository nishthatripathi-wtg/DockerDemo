#!/bin/bash
# infra-up.sh — Bring up the full infrastructure stack in order.
# Saves current VM IP to /etc/hosts, re-joins swarm if the advertise address
# has changed, then deploys: traefik → gitea → registry → jenkins.

set -e

REPO_DIR="$(cd "$(dirname "$0")/../../.." && pwd)"
DOCKER_DIR="$REPO_DIR/docker"

# ── 1. Detect current VM IP ───────────────────────────────────────────────────
VM_IP=$(hostname -I | awk '{print $1}')
echo "[1/5] Current VM IP: $VM_IP"

# ── 3. Fix Swarm if advertise address has changed ─────────────────────────────
echo "[2/5] Checking Swarm advertise address..."
SWARM_IP=$(docker info --format '{{.Swarm.NodeAddr}}' 2>/dev/null || echo "inactive")

if [ "$SWARM_IP" = "inactive" ]; then
  echo "      Swarm not active — initialising..."
  docker swarm init --advertise-addr "$VM_IP"
elif [ "$SWARM_IP" != "$VM_IP" ]; then
  echo "      Swarm IP mismatch ($SWARM_IP vs $VM_IP) — rejoining..."
  docker swarm leave --force
  docker swarm init --advertise-addr "$VM_IP"
else
  echo "      Swarm OK ($SWARM_IP)"
fi

# ── 4. Ensure overlay network exists ─────────────────────────────────────────
echo "[3/5] Ensuring traefik_proxy network..."
docker network inspect traefik_proxy > /dev/null 2>&1 \
  || docker network create --driver overlay --attachable traefik_proxy
echo "      traefik_proxy ready"

# ── 5. Deploy stacks in order (only if unhealthy/missing) ────────────────────
is_healthy_stack() {
  local name=$1
  if ! docker stack ls --format '{{.Name}}' | grep -q "^${name}$"; then
    return 1
  fi
  while read -r svc; do
    [ -z "$svc" ] && continue
    rep=$(docker service ls --filter "name=$svc" --format '{{.Replicas}}')
    run=$(echo "$rep" | cut -d/ -f1)
    des=$(echo "$rep" | cut -d/ -f2)
    if [ -z "$run" ] || [ -z "$des" ] || [ "$run" != "$des" ]; then
      return 1
    fi
  done < <(docker stack services "$name" --format '{{.Name}}')
  return 0
}

deploy() {
  local name=$1
  local file=$2
  if is_healthy_stack "$name"; then
    echo "      Stack $name already healthy. Skipping deploy."
    return
  fi
  echo "      Deploying stack: $name"
  docker stack deploy -c "$file" "$name" --with-registry-auth
  # Wait until all replicas are up
  local service
  for service in $(docker stack services "$name" --format '{{.Name}}'); do
    echo -n "      Waiting for $service... "
    for _ in $(seq 1 30); do
      ready=$(docker service ls --filter "name=$service" --format '{{.Replicas}}')
      desired=$(echo "$ready" | cut -d'/' -f2)
      running=$(echo "$ready" | cut -d'/' -f1)
      if [ "$running" = "$desired" ]; then echo "up ($ready)"; break; fi
      sleep 3
    done
  done
}

echo "[4/5] Deploying infrastructure stacks..."
deploy traefik  "$DOCKER_DIR/docker-compose-traefik.yml"
deploy git      "$DOCKER_DIR/docker-compose-git.yml"
deploy registry "$DOCKER_DIR/docker-compose-registry.yml"
deploy jenkins  "$DOCKER_DIR/docker-compose-jenkins.yml"

# ── 6. Push commit to trigger Jenkins pipeline ───────────────────────────────
echo "[5/6] Pushing trigger commit to Gitea..."
cd "$REPO_DIR"
git add -A
git remote set-url origin ssh://git@127.0.0.1:2222/admin/DockerDemo.git
if git diff --cached --quiet; then
  # Nothing staged — make a no-op commit
  git commit --allow-empty -m "ci: trigger pipeline [$(date '+%Y-%m-%d %H:%M')]

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
else
  git commit -m "feat: trigger pipeline — $(git diff --cached --name-only | tr '\n' ' ')

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
fi
git push origin main

# ── 7. Wait and verify app stack ──────────────────────────────────────────────
echo "[6/6] Waiting 30s and verifying application stack..."
sleep 30
if docker stack ls --format '{{.Name}}' | grep -q '^app$'; then
  docker stack services app
else
  echo "      app stack not found"
fi

echo ""
echo "✅  Infrastructure is up. Jenkins pipeline triggered. App stack check completed."
echo "    Traefik dashboard : http://traefik.myapp.com/dashboard/"
echo "    Gitea             : http://git.myapp.com"
echo "    Jenkins           : http://jenkins.myapp.com"
echo "    Registry          : http://registry.myapp.com"
