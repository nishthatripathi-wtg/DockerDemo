---
name: Load Test Full
description: Runs a full-endpoint load test against the backend (auth, messaging, profiles, languages, DB health) with configurable workers and duration, then checks Splunk ingestion.
---

# Load Test Full

Run a realistic full-endpoint load test and verify Splunk is receiving telemetry.

## Usage

```bash
bash .github/skills/load-test-full/run.sh [duration_seconds] [workers]
```

### Defaults

| Parameter | Default | Description |
|-----------|---------|-------------|
| `duration_seconds` | `60` | How long the test runs |
| `workers` | `1000` | Number of concurrent workers |

### What it does

1. **Register test users** — creates `loaduser1`…`loaduserN` via `/api/auth/register`
2. **Launch workers** — each worker continuously cycles through all backend endpoints:
   - Login, inbox, conversations, send message, view thread
   - View profile, search users, get languages, DB health check
3. **Wait for completion** — waits for all workers to finish
4. **Check Splunk** — queries Splunk for OTel event counts to verify telemetry ingestion

### Endpoints exercised

| Method | Endpoint |
|--------|----------|
| `POST` | `/api/auth/login` |
| `GET` | `/api/messages/inbox` |
| `GET` | `/api/messages/conversations` |
| `POST` | `/api/messages/send` |
| `GET` | `/api/messages/thread` |
| `GET` | `/api/profile` |
| `GET` | `/api/auth/users/search` |
| `GET` | `/api/greeting/languages` |
| `GET` | `/db` |

### Examples

```bash
# Default: 1000 workers for 60 seconds
bash .github/skills/load-test-full/run.sh

# Quick smoke test
bash .github/skills/load-test-full/run.sh 30 100

# Heavy stress test
bash .github/skills/load-test-full/run.sh 120 1000

# Maximum stress
bash .github/skills/load-test-full/run.sh 300 2000
```

### What to check in Splunk after

```
index=main source=otel | stats count
index=main source=otel "metric_name:jvm.memory.used"=*
index=main source=otel | head 1000 | fieldsummary | where match(field, "metric_name:")
```
