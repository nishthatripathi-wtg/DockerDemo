#!/bin/bash
# infra-up.sh — Bring up the full infrastructure stack in order.
# Saves current VM IP to /etc/hosts, re-joins swarm if the advertise address
# has changed, then deploys: traefik → gitea → registry → jenkins.

set -e

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
DOCKER_DIR="$REPO_DIR/docker"

# ── Domains served by this node ──────────────────────────────────────────────
DOMAINS=(
  "myapp.local"
  "traefik.myapp.com"
  "registry.myapp.com"
  "git.myapp.com"
  "jenkins.myapp.com"
)

# ── 1. Detect current VM IP ───────────────────────────────────────────────────
VM_IP=$(hostname -I | awk '{print $1}')
echo "[1/6] Current VM IP: $VM_IP"

# ── 2. Update /etc/hosts ─────────────────────────────────────────────────────
echo "[2/6] Updating /etc/hosts..."
for domain in "${DOMAINS[@]}"; do
  # Remove any existing entry for this domain
  sudo sed -i "/ $domain$/d" /etc/hosts
  echo "$VM_IP $domain" | sudo tee -a /etc/hosts > /dev/null
  echo "      $VM_IP → $domain"
done

# Keep host mappings persistent on reboot for cloud-init managed hosts files.
if [ -f /etc/cloud/templates/hosts.debian.tmpl ]; then
  for domain in "${DOMAINS[@]}"; do
    sudo sed -i "/ $domain$/d" /etc/cloud/templates/hosts.debian.tmpl
    echo "$VM_IP $domain" | sudo tee -a /etc/cloud/templates/hosts.debian.tmpl > /dev/null
  done
fi

# ── 3. Fix Swarm if advertise address has changed ─────────────────────────────
echo "[3/6] Checking Swarm advertise address..."
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
echo "[4/6] Ensuring traefik_proxy network..."
docker network inspect traefik_proxy > /dev/null 2>&1 \
  || docker network create --driver overlay --attachable traefik_proxy
echo "      traefik_proxy ready"

# ── 5. Deploy stacks in order ─────────────────────────────────────────────────
deploy() {
  local name=$1
  local file=$2
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

echo "[5/6] Deploying infrastructure stacks..."
deploy traefik  "$DOCKER_DIR/docker-compose-traefik.yml"
deploy git      "$DOCKER_DIR/docker-compose-git.yml"
deploy registry "$DOCKER_DIR/docker-compose-registry.yml"
deploy jenkins  "$DOCKER_DIR/docker-compose-jenkins.yml"

# ── 6. Validate registry endpoint before triggering pipeline ──────────────────
echo "[6/7] Validating registry endpoint..."
RESOLVED_IP=$(getent hosts registry.myapp.com | awk 'NR==1{print $1}')
if [ -z "$RESOLVED_IP" ]; then
  echo "❌  registry.myapp.com does not resolve on this host."
  exit 1
fi
echo "      registry.myapp.com resolves to: $RESOLVED_IP"
if [ "$RESOLVED_IP" != "$VM_IP" ]; then
  echo "❌  registry.myapp.com points to $RESOLVED_IP but VM IP is $VM_IP."
  echo "    Update hosts mapping and re-run infra-up.sh."
  exit 1
fi
REG_CODE=$(curl -sS -m 8 -o /dev/null -w '%{http_code}' http://registry.myapp.com/v2/ || true)
if [ "$REG_CODE" != "200" ]; then
  echo "❌  Registry health check failed: http://registry.myapp.com/v2/ returned '$REG_CODE'."
  exit 1
fi
echo "      Registry is reachable (HTTP 200)."

# ── 7. Push commit to trigger Jenkins pipeline ───────────────────────────────
echo "[7/7] Pushing trigger commit to Gitea..."
cd "$REPO_DIR"
git add -A
if git diff --cached --quiet; then
  # Nothing staged — make a no-op commit
  git commit --allow-empty -m "ci: trigger pipeline [$(date '+%Y-%m-%d %H:%M')]

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
else
  git commit -m "feat: trigger pipeline — $(git diff --cached --name-only | tr '\n' ' ')

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
fi
git push origin main

echo ""
echo "✅  Infrastructure is up. Jenkins pipeline triggered."
echo "    Traefik dashboard : http://traefik.myapp.com/dashboard/"
echo "    Gitea             : http://git.myapp.com"
echo "    Jenkins           : http://jenkins.myapp.com"
echo "    Registry          : http://registry.myapp.com"
