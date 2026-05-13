#!/bin/bash
# infra-up.sh — Bring up the full infrastructure stack in order.
# Saves current VM IP to /etc/hosts, re-joins swarm if the advertise address
# has changed, then deploys: traefik → [observability backend] → otel → gitea → registry → jenkins.
#
# The script prompts you to choose one or more observability backends:
#   1) Splunk   2) Grafana (LGTM)   3) ELK (Elasticsearch + Kibana)
#   Enter comma-separated values (e.g. 2,3) to deploy multiple.

set -e

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
DOCKER_DIR="$REPO_DIR/docker"

# ── Domains served by this node ──────────────────────────────────────────────
DOMAINS=(
  "myapp.local"
  "traefik.myapp.com"
  "splunk.myapp.com"
  "registry.myapp.com"
  "git.myapp.com"
  "jenkins.myapp.com"
  "grafana.myapp.com"
  "kibana.myapp.com"
  "influxdb.myapp.com"
)

# ── 1. Detect current VM IP ───────────────────────────────────────────────────
VM_IP=$(hostname -I | awk '{print $1}')
echo "[1/9] Current VM IP: $VM_IP"

# ── 2. Update /etc/hosts ─────────────────────────────────────────────────────
echo "[2/9] Updating /etc/hosts..."
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
echo "[3/9] Checking Swarm advertise address..."
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
echo "[4/9] Ensuring traefik_proxy network..."
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

echo "[5/9] Deploying infrastructure stacks..."
deploy traefik  "$DOCKER_DIR/docker-compose-traefik.yml"

# ── Choose observability backend(s) ───────────────────────────────────────────
DEPLOY_SPLUNK=false
DEPLOY_GRAFANA=false
DEPLOY_ELK=false

echo ""
echo "      Which observability backend(s) do you want to deploy?"
echo "        1) Splunk"
echo "        2) Grafana (LGTM: Prometheus + Tempo + Loki + Grafana)"
echo "        3) ELK (Elasticsearch + Kibana)"
echo ""
echo "      Enter one or more choices separated by commas (e.g. 1,3 or 2):"
read -r -p "      > " OBS_INPUT

# Parse comma-separated choices
IFS=',' read -ra OBS_CHOICES <<< "$OBS_INPUT"
for choice in "${OBS_CHOICES[@]}"; do
  choice=$(echo "$choice" | tr -d ' ')
  case "$choice" in
    1) DEPLOY_SPLUNK=true ;;
    2) DEPLOY_GRAFANA=true ;;
    3) DEPLOY_ELK=true ;;
    *) echo "      ⚠  Ignoring invalid choice '$choice'" ;;
  esac
done

# Default to Splunk if nothing valid was selected
if [ "$DEPLOY_SPLUNK" = false ] && [ "$DEPLOY_GRAFANA" = false ] && [ "$DEPLOY_ELK" = false ]; then
  echo "      ⚠  No valid choice — defaulting to Splunk"
  DEPLOY_SPLUNK=true
fi

[ "$DEPLOY_SPLUNK" = true ]  && deploy splunk "$DOCKER_DIR/docker-compose-splunk.yml"
[ "$DEPLOY_GRAFANA" = true ] && deploy monitoring "$DOCKER_DIR/docker-compose-grafana.yml"
[ "$DEPLOY_ELK" = true ]     && deploy elk "$DOCKER_DIR/docker-compose-elk.yml"

deploy otel     "$DOCKER_DIR/docker-compose-otel-dev.yml"
deploy git      "$DOCKER_DIR/docker-compose-git.yml"
deploy registry "$DOCKER_DIR/docker-compose-registry.yml"
deploy jenkins  "$DOCKER_DIR/docker-compose-jenkins.yml"

# ── 6. Clean Jenkins workspace after swarm rejoin ─────────────────────────────
if [ "$SWARM_REJOINED" = true ]; then
  echo "[6/9] Cleaning stale Jenkins workspace (swarm was re-initialised)..."
  JENKINS_CID=$(docker ps --filter "name=jenkins" --format '{{.ID}}' | head -1)
  if [ -n "$JENKINS_CID" ]; then
    docker exec "$JENKINS_CID" sh -c 'rm -rf /var/jenkins_home/workspace/*' 2>/dev/null \
      && echo "      Jenkins workspace cleaned" \
      || echo "      ⚠  Could not clean workspace (non-fatal)"
  else
    echo "      ⚠  Jenkins container not found — skipping workspace cleanup"
  fi
else
  echo "[6/9] Swarm unchanged — skipping Jenkins workspace cleanup"
fi

# ── 7. Validate registry endpoint before triggering pipeline ──────────────────
echo "[7/9] Validating registry endpoint..."
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

# ── 8. Validate observability backend(s) ───────────────────────────────────────
echo "[8/9] Validating observability backends..."

if [ "$DEPLOY_SPLUNK" = true ]; then
  SPLUNK_CODE=$(curl -sS -m 10 -o /dev/null -w '%{http_code}' \
    -k http://splunk_splunk:8088/services/collector/health || true)
  if [ "$SPLUNK_CODE" = "200" ]; then
    echo "      Splunk HEC is healthy (HTTP 200)"
  else
    echo "      ⚠  Splunk HEC returned '$SPLUNK_CODE' — may still be starting (non-fatal)"
  fi
fi

if [ "$DEPLOY_GRAFANA" = true ]; then
  GRAFANA_CODE=$(curl -sS -m 10 -o /dev/null -w '%{http_code}' \
    http://monitoring_grafana:3000/api/health || true)
  if [ "$GRAFANA_CODE" = "200" ]; then
    echo "      Grafana is healthy (HTTP 200)"
  else
    echo "      ⚠  Grafana returned '$GRAFANA_CODE' — may still be starting (non-fatal)"
  fi
fi

if [ "$DEPLOY_ELK" = true ]; then
  ES_CODE=$(curl -sS -m 10 -o /dev/null -w '%{http_code}' \
    -u elastic:changeme http://elk_elasticsearch:9200/_cluster/health || true)
  if [ "$ES_CODE" = "200" ]; then
    echo "      Elasticsearch is healthy (HTTP 200)"
  else
    echo "      ⚠  Elasticsearch returned '$ES_CODE' — may still be starting (non-fatal)"
  fi
fi

# ── 9. Push commit to trigger Jenkins pipeline ───────────────────────────────
echo "[9/9] Pushing trigger commit to Gitea..."
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
[ "$DEPLOY_SPLUNK" = true ]  && echo "    Splunk            : http://splunk.myapp.com"
[ "$DEPLOY_GRAFANA" = true ] && echo "    Grafana           : http://grafana.myapp.com"
[ "$DEPLOY_ELK" = true ]     && echo "    Kibana            : http://kibana.myapp.com"
echo "    Gitea             : http://git.myapp.com"
echo "    Jenkins           : http://jenkins.myapp.com"
echo "    Registry          : http://registry.myapp.com"
