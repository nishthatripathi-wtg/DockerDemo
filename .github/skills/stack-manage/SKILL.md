---
name: Stack Manage
description: Start, stop, restart, or check status of individual Docker Swarm stacks (traefik, splunk, otel, git, registry, jenkins, myapp).
---

# Stack Manage

Manage individual Docker Swarm stacks with granular control.

## Usage

```bash
bash .github/skills/stack-manage/run.sh <action> <stack>
```

### Actions

| Action | Description |
|--------|-------------|
| `start` | Deploy a stack (skip if already healthy) |
| `stop` | Remove a stack |
| `restart` | Remove + redeploy a stack (handles immutable Swarm configs) |
| `status` | Show replica status and container health for a stack |
| `logs` | Tail recent logs for all services in a stack |

### Stacks

| Stack | Compose File | Notes |
|-------|-------------|-------|
| `traefik` | `docker/docker-compose-traefik.yml` | Deploy first — creates overlay network |
| `splunk` | `docker/docker-compose-splunk.yml` | HEC on :8088, slow to start (~90s) |
| `otel` | `docker/docker-compose-otel-dev.yml` | Requires splunk running for HEC export |
| `git` | `docker/docker-compose-git.yml` | Gitea on :2222 SSH |
| `registry` | `docker/docker-compose-registry.yml` | Docker registry |
| `jenkins` | `docker/docker-compose-jenkins.yml` | CI/CD pipeline |
| `myapp` | `docker/docker-compose-app.yml` | App stack (frontend + backend + db + autoscaler) |

### Examples

```bash
# Restart OTel after config changes (handles immutable Swarm configs)
bash .github/skills/stack-manage/run.sh restart otel

# Check status of all stacks
bash .github/skills/stack-manage/run.sh status all

# Stop and start splunk
bash .github/skills/stack-manage/run.sh stop splunk
bash .github/skills/stack-manage/run.sh start splunk

# View recent logs for myapp
bash .github/skills/stack-manage/run.sh logs myapp
```

### Important Notes
- `restart otel` is the correct way to update OTel config (Swarm configs are immutable — must rm + redeploy)
- `restart myapp` preserves the database volume
- `start` is idempotent — skips stacks already healthy
- `stop` waits for graceful shutdown before returning
