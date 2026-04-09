#!/bin/bash
# run.sh — Bring up the full infrastructure stack in order.
# Updates /etc/hosts, re-joins swarm if IP changed, deploys:
# traefik → splunk → otel → gitea → registry → jenkins.

set -e

REPO_DIR="$(cd "$(dirname "$0")/../../.." && pwd)"
DOCKER_DIR="$REPO_DIR/docker"

# ── Domains served by this node ──────────────────────────────────────────────
DOMAINS=(
  "myapp.local"
  "traefik.myapp.com"
  "splunk.myapp.com"
  "registry.myapp.com"
  "git.myapp.com"
  "jenkins.myapp.com"
)

# ── 1. Detect current VM IP ───────────────────────────────────────────────────
VM_IP=$(hostname -I | awk '{print $1}')
echo "[1/8] Current VM IP: $VM_IP"

# ── 2. Update /etc/hosts ─────────────────────────────────────────────────────
echo "[2/8] Updating /etc/hosts..."
for domain in "${DOMAINS[@]}"; do
  sudo sed -i "/ $domain$/d" /etc/hosts
  echo "$VM_IP $domain" | sudo tee -a /etc/hosts > /dev/null
  echo "      $VM_IP → $domain"
done

# Persist for cloud-init managed hosts
if [ -f /etc/cloud/templates/hosts.debian.tmpl ]; then
  for domain in "${DOMAINS[@]}"; do
    sudo sed -i "/ $domain$/d" /etc/cloud/templates/hosts.debian.tmpl
    echo "$VM_IP $domain" | sudo tee -a /etc/cloud/templates/hosts.debian.tmpl > /dev/null
  done
fi

# ── 3. Fix Swarm if advertise address has changed ─────────────────────────────
echo "[3/8] Checking Swarm advertise address..."
SWARM_IP=$(docker info --format '{{.Swarm.NodeAddr}}' 2>/dev/null || echo "inactive")
SWARM_REJOINED=false

if [ "$SWARM_IP" = "inactive" ]; then
  echo "      Swarm not active — initialising..."
  docker swarm init --advertise-addr "$VM_IP"
  SWARM_REJOINED=true
elif [ "$SWARM_IP" != "$VM_IP" ]; then
  echo "      Swarm IP mismatch ($SWARM_IP vs $VM_IP) — rejoining..."
  docker swarm leave --force
  docker swarm init --advertise-addr "$VM_IP"
  SWARM_REJOINED=true
else
  echo "      Swarm OK ($SWARM_IP)"
fi

# ── 4. Ensure overlay network exists ─────────────────────────────────────────
echo "[4/8] Ensuring traefik_proxy network..."
docker network inspect traefik_proxy > /dev/null 2>&1 \
  || docker network create --driver overlay --attachable traefik_proxy
echo "      traefik_proxy ready"

# ── 5. Deploy stacks in order (skip healthy ones) ────────────────────────────
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
    echo "      Stack $name already healthy — skipping"
    return
  fi
  echo "      Deploying stack: $name"
  docker stack deploy -c "$file" "$name" --with-registry-auth
  local service
  for service in $(docker stack services "$name" --format '{{.Name}}'); do
    echo -n "      Waiting for $service... "
    for _ in $(seq 1 40); do
      ready=$(docker service ls --filter "name=$service" --format '{{.Replicas}}')
      desired=$(echo "$ready" | cut -d'/' -f2)
      running=$(echo "$ready" | cut -d'/' -f1)
      if [ "$running" = "$desired" ] && [ "$running" != "0" ]; then echo "up ($ready)"; break; fi
      sleep 3
    done
  done
}

echo "[5/8] Deploying infrastructure stacks..."
deploy traefik  "$DOCKER_DIR/docker-compose-traefik.yml"
deploy splunk   "$DOCKER_DIR/docker-compose-splunk.yml"
deploy otel     "$DOCKER_DIR/docker-compose-otel-dev.yml"
deploy git      "$DOCKER_DIR/docker-compose-git.yml"
deploy registry "$DOCKER_DIR/docker-compose-registry.yml"

# Build and push Jenkins image if not already in registry
JENKINS_IMAGE="registry.myapp.com/jenkins-docker:latest"
echo "      Checking Jenkins image in registry..."
if curl -sf "http://registry.myapp.com/v2/jenkins-docker/manifests/latest" \
     -H "Accept: application/vnd.docker.distribution.manifest.v2+json" \
     -o /dev/null 2>/dev/null; then
  echo "      Jenkins image already in registry — skipping build"
else
  echo "      Jenkins image not found — building..."
  docker build -t "$JENKINS_IMAGE" -f "$REPO_DIR/Dockerfile.jenkins" "$REPO_DIR"
  echo "      Pushing Jenkins image to registry..."
  docker push "$JENKINS_IMAGE"
  echo "      Jenkins image pushed"
fi

deploy jenkins  "$DOCKER_DIR/docker-compose-jenkins.yml"

# ── 6. Clean Jenkins workspace after swarm rejoin ─────────────────────────────
if [ "$SWARM_REJOINED" = true ]; then
  echo "[6/8] Cleaning stale Jenkins workspace (swarm was re-initialised)..."
  JENKINS_CID=$(docker ps --filter "name=jenkins" --format '{{.ID}}' | head -1)
  if [ -n "$JENKINS_CID" ]; then
    docker exec "$JENKINS_CID" sh -c 'rm -rf /var/jenkins_home/workspace/*' 2>/dev/null \
      && echo "      Jenkins workspace cleaned" \
      || echo "      ⚠  Could not clean workspace (non-fatal)"
  else
    echo "      ⚠  Jenkins container not found — skipping workspace cleanup"
  fi
else
  echo "[6/8] Swarm unchanged — skipping Jenkins workspace cleanup"
fi

# ── 7. Validate endpoints ────────────────────────────────────────────────────
echo "[7/8] Validating endpoints..."

# Registry
RESOLVED_IP=$(getent hosts registry.myapp.com | awk 'NR==1{print $1}')
if [ -z "$RESOLVED_IP" ]; then
  echo "      ❌ registry.myapp.com does not resolve"
  exit 1
fi
echo "      registry.myapp.com → $RESOLVED_IP"
REG_CODE=$(curl -sS -m 8 -o /dev/null -w '%{http_code}' http://registry.myapp.com/v2/ || true)
if [ "$REG_CODE" = "200" ]; then
  echo "      Registry is reachable (HTTP 200)"
else
  echo "      ❌ Registry health check failed (HTTP $REG_CODE)"
  exit 1
fi

# Splunk HEC
SPLUNK_CODE=$(curl -sS -m 10 -o /dev/null -w '%{http_code}' \
  -k http://splunk_splunk:8088/services/collector/health 2>/dev/null || true)
if [ "$SPLUNK_CODE" = "200" ]; then
  echo "      Splunk HEC is healthy (HTTP 200)"
else
  echo "      ⚠  Splunk HEC returned '$SPLUNK_CODE' — may still be starting (non-fatal)"
fi

# ── 8. Push commit to trigger Jenkins pipeline ───────────────────────────────
echo "[8/8] Pushing trigger commit to Gitea..."
cd "$REPO_DIR"
git add -A
git remote set-url origin ssh://git@127.0.0.1:2222/admin/DockerDemo.git
if git diff --cached --quiet; then
  git commit --allow-empty -m "ci: trigger pipeline [$(date '+%Y-%m-%d %H:%M')]

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
else
  git commit -m "feat: trigger pipeline — $(git diff --cached --name-only | tr '\n' ' ')

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
fi
git push origin main

# ── Verify app stack (if present) ─────────────────────────────────────────────
echo ""
echo "Waiting 30s for Jenkins pipeline to start..."
sleep 30
if docker stack ls --format '{{.Name}}' | grep -q '^myapp$'; then
  echo "App stack services:"
  docker stack services myapp --format 'table {{.Name}}\t{{.Replicas}}\t{{.Image}}'
else
  echo "myapp stack not yet deployed — Jenkins pipeline will handle it"
fi

echo ""
echo "✅  Infrastructure is up. Jenkins pipeline triggered."
echo "    Traefik dashboard : http://traefik.myapp.com/dashboard/"
echo "    Splunk            : http://splunk.myapp.com"
echo "    Gitea             : http://git.myapp.com"
echo "    Jenkins           : http://jenkins.myapp.com"
echo "    Registry          : http://registry.myapp.com"
