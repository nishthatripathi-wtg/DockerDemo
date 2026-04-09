---
name: Infra Bringup and Trigger
description: Deploys full infrastructure — Traefik→Splunk→OTel→Gitea→Registry→Jenkins, cleans stale workspaces, validates endpoints, triggers CI.
---

# Infra Bringup and Trigger

Run from repository root:

```bash
bash .github/skills/infra-bringup/run.sh
```

This script performs:
1. Detect current VM IP and update `/etc/hosts` for all project domains
2. Ensure Swarm and overlay network are ready (re-init if IP changed)
3. Deploy stacks in dependency order (skip healthy ones):
   - `traefik` — reverse proxy + dashboard
   - `splunk` — log/metric/trace storage (HEC on :8088)
   - `otel` — OpenTelemetry Collector (dev single-tier)
   - `git` — Gitea source control
   - `registry` — Docker image registry
   - `jenkins` — CI/CD pipeline
4. Clean Jenkins workspace if Swarm was re-initialised (prevents stale `.git` errors)
5. Validate registry and Splunk HEC endpoints
6. Push commit to Gitea to trigger Jenkins pipeline
7. Wait and verify app stack services

### Domains configured
- `myapp.local`, `traefik.myapp.com`, `splunk.myapp.com`
- `registry.myapp.com`, `git.myapp.com`, `jenkins.myapp.com`

### Notes
- Uses local Gitea SSH route (`127.0.0.1:2222`) for push — works even if hostname is stale
- Stacks already healthy are skipped (idempotent)
- Jenkins image is built and pushed to registry if not already present
