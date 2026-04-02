---
name: Infra Bringup and Trigger
description: Conditionally deploys Traefik→Gitea→Registry→Jenkins stacks, triggers CI, and verifies app stack.
---

# Infra Bringup and Trigger

Run from repository root:

```bash
bash .github/skills/infra-bringup/run.sh
```

This script performs:
1. Detect current VM IP
2. Ensure swarm/network are ready
3. Check infra stack health and deploy only if missing/unhealthy, in order:
   - `traefik`
   - `git`
   - `registry`
   - `jenkins`
4. Create and push an empty commit to trigger Jenkins pipeline
5. Wait 30 seconds and verify `app` stack services (if present)

If your remote hostname is stale after IP changes, the script uses local Gitea SSH route (`127.0.0.1:2222`) for push.
