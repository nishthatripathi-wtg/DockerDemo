# Copilot Instructions

## Project Overview

This is a Docker demonstration project showcasing a full microservices architecture: an Angular 16 frontend, a Spring Boot 3.2 backend, PostgreSQL, Traefik reverse proxy, a custom Python autoscaler, a Jenkins CI/CD pipeline, and a full OpenTelemetry observability stack — all orchestrated with Docker Swarm.

## Architecture

```
Browser → Traefik (:80, Host: myapp.local)
            ├── PathPrefix(/api) → Backend Spring Boot (:8080) → PostgreSQL (:5432)
            └── /                → Frontend Nginx (:80)

Autoscaler (Python) → polls Traefik Prometheus metrics (:8082) → scales Swarm services
Jenkins → builds Docker images → pushes to registry → deploys Swarm stack

OTel Collector (otel stack) ← OTLP push from Backend + Traefik
                             ← Prometheus scrape from Traefik :8082
                             ← PostgreSQL pg_stat_* queries
                             → Splunk HEC (http://splunk_splunk:8088)
```

The frontend uses **relative URLs** (`/api/greeting`) — Traefik handles routing to the backend by `PathPrefix(/api)`. There are no hardcoded backend URLs in frontend code.

## Commands

### Backend (Java/Maven) — run from `backend/`
```bash
mvn clean package -DskipTests   # Build JAR (used in Dockerfile)
mvn clean package                # Build + run tests
mvn test                         # Tests only
mvn test -Dtest=GreetingControllerTest  # Single test class
mvn spring-boot:run              # Run locally (needs PostgreSQL on localhost:5432)
```

### Frontend (Angular/npm) — run from `frontend/`
```bash
npm install
npm start                        # Dev server on :4200
npm run build                    # Production build → dist/frontend/
npm run watch                    # Watch mode (development config)
```

### Docker — local dev stack
```bash
docker-compose up                # Starts backend + frontend + db (ports: 8080, 4200)
docker-compose down
docker build -t dockerdemo ./backend
docker build -t dockerdemoweb ./frontend
```

### Docker Swarm — production deployment
```bash
# Deploy full app stack (Traefik + backend + frontend + db + autoscaler)
docker stack deploy -c docker/docker-compose-app.yml myapp --with-registry-auth

# Deploy just Traefik
docker stack deploy -c docker/docker-compose-traefik.yml myapp_traefik

# Deploy with bundled Traefik (no separate traefik stack)
docker stack deploy -c docker-compose-swarm.yml myapp
```

### Autoscaler (Python) — run from `autoscaler/`
```bash
pip install -r requirements.txt
DRY_RUN=true python app.py       # Dry-run mode (logs but doesn't scale)
DRY_RUN=false python app.py      # Live scaling
```

### Load testing
```bash
./loadtest.sh         # 50 concurrent curl workers against http://127.0.0.1/api/greeting for 60s
./loadtest-full.sh    # Full endpoint coverage: auth, messaging, profiles, languages, DB health
```

### OTel Collector (dev) — run from repo root
```bash
# Deploy single-tier collector (receives OTLP + scrapes Traefik + queries PostgreSQL)
docker stack deploy -c docker/docker-compose-otel-dev.yml otel

# Redeploy after config changes (Swarm configs are immutable — must rm + redeploy)
docker stack rm otel && sleep 5 && docker stack deploy -c docker/docker-compose-otel-dev.yml otel
```

### Infrastructure stacks — deploy order matters
```bash
docker stack deploy -c docker/docker-compose-traefik.yml traefik     # 1st — creates traefik_proxy network
docker stack deploy -c docker/docker-compose-splunk.yml splunk       # Splunk for log/metric storage
docker stack deploy -c docker/docker-compose-otel-dev.yml otel       # OTel Collector
docker stack deploy -c docker/docker-compose-app.yml myapp --with-registry-auth  # App stack
```

## Key Conventions

### API design
- All backend REST endpoints use the `/api/` prefix (e.g., `GET /api/greeting?name=X`)
- Responses are plain `Map<String, String>` JSON objects: `{"message": "Hello, X!"}`
- The `/db` endpoint is a DB health check (returns connection URL or 500)
- Auth endpoints: `POST /api/auth/register`, `POST /api/auth/login`
- Messaging endpoints: `POST /api/messages/send`, `GET /api/messages/inbox`
- Profile endpoints: `GET /api/profiles/{username}`, `PUT /api/profiles/{username}`

### CORS
`@CrossOrigin` on `GreetingController` lists specific allowed frontend IPs. When adding new deployment hosts, add their IPs to this annotation.

### Docker image naming
| Image | Tag |
|-------|-----|
| Backend | `dockerdemo` / `registry.myapp.com/dockerdemo` |
| Frontend | `dockerdemoweb` / `registry.myapp.com/dockerdemoweb` |
| Autoscaler | `registry.myapp.com/autoscaler` |

### Multi-stage Dockerfiles
Both backend and frontend use two-stage builds:
- **Backend:** `maven:3.9.6-eclipse-temurin-17` (build) → `azul/zulu-openjdk-alpine:17-jre` (runtime), runs as `spring` user
- **Frontend:** `node:20-alpine` (build, outputs to `dist/`) → `nginx:alpine` (serve), runs as `nginx` user

### Autoscaler configuration
Services opt into autoscaling via Docker Swarm deploy labels:
```yaml
labels:
  - "autoscaler.enabled=true"
  - "autoscaler.metric_service=backend@swarm"   # Traefik service name
  - "autoscaler.target_rps_per_replica=5"
  - "autoscaler.min_replicas=3"
  - "autoscaler.max_replicas=10"
```
The autoscaler polls `traefik_service_requests_total` from Traefik's Prometheus metrics endpoint, computes RPS delta between polls, and calls `service.scale()` via the Docker SDK.

### Traefik routing labels (Swarm)
Backend and frontend are differentiated by priority — backend router uses `priority=10`, frontend uses `priority=1` to ensure `/api` prefix is matched first.

### Environment variable overrides
`application.yml` defaults are overridden at runtime via environment variables in docker-compose:
- `SPRING_DATASOURCE_URL` → `jdbc:postgresql://db:5432/myuser`
- `SPRING_DATASOURCE_USERNAME` / `SPRING_DATASOURCE_PASSWORD`

### CI/CD pipeline (Jenkinsfile)
Five stages: **Checkout → Preflight Registry Check → Build Images → Push to Registry → Deploy to Swarm**. The registry is configured via the `REGISTRY` environment variable (`registry.myapp.com`). The deploy target is `docker/docker-compose-app.yml`.

## Docker Swarm DNS

Service DNS in Swarm follows the pattern `<stack>_<service>`. Always use this when referencing services across stacks:

| Service | DNS name |
|---------|----------|
| Traefik | `traefik_traefik` |
| OTel Collector | `otel_otel-agent` |
| Splunk HEC | `splunk_splunk:8088` |
| PostgreSQL | `myapp_db:5432` |
| Backend | `myapp_backend` |

Bind mounts don't work across Swarm nodes — use **Swarm configs** (`configs:` block) to deliver files like OTel YAML configs and PostgreSQL init SQL. Swarm configs are immutable once created; to update them you must `docker stack rm` and redeploy.

## OTel Observability Stack

### Current dev configuration (`docker/otel/backend-only-config.yaml`)
Single-tier collector receiving from three sources:
1. **OTLP** (gRPC :4317, HTTP :4318) — backend Java Agent + Traefik native push
2. **Prometheus scrape** — Traefik `:8082/metrics` every 30s
3. **PostgreSQL receiver** — `myapp_db:5432` as `monitor` user every 30s

All signals export to **Splunk HEC** (`http://splunk_splunk:8088`, token: `otel-hec-token`, index: `main`).

### Backend instrumentation (zero-code)
The OTel Java Agent (v2.20.1) is baked into `backend/Dockerfile`. Configuration is purely via env vars in `docker/docker-compose-app.yml`:
- `OTEL_EXPORTER_OTLP_ENDPOINT: http://otel-agent:4317` — resolves via Swarm VIP to `otel_otel-agent`
- `OTEL_SERVICE_NAME: demo-backend`
- All three exporters (traces, metrics, logs) set to `otlp`

When upgrading the agent version, update both `ARG OTEL_JAVA_AGENT_VERSION` and `ARG OTEL_JAVA_AGENT_SHA256` in `backend/Dockerfile`. SHA-256 is available from Maven Central.

### Traefik dual-emit
Traefik emits metrics via both Prometheus (`:8082/metrics`, kept for autoscaler) and OTLP push to the collector. Both run simultaneously — **do not remove the Prometheus endpoint** or autoscaling breaks.

### PostgreSQL monitoring
- Monitor user `monitor` (password: `monitor`) with `pg_monitor` role — created by `docker/postgres-init.sql`
- `pg_stat_statements` enabled via `shared_preload_libraries` in `docker/docker-compose-app.yml` command flags
- Slow query logging: `log_min_duration_statement=200` (queries ≥200ms logged to stdout)
- The init SQL runs only on fresh databases; apply manually to existing: `docker exec <db_container> psql -U myuser -d myuser -f /path/to/init.sql`

### Splunk searches
Metrics arrive as HEC events with `metric_name:` prefixed fields. Example searches:
```
index=main source=otel "metric_name:jvm.memory.used"=*
index=main source=otel "metric_name:postgresql.backends"=*
index=main source=otel "metric_name:traefik_service_requests_total"=*
index=main source=otel | head 1000 | fieldsummary | where match(field, "metric_name:")
```

### Production two-tier config (not currently deployed)
`docker/otel/agent-config.yaml` + `docker/docker-compose-otel.yml` — global agent per node forwarding to a single gateway. PostgreSQL and Prometheus scrapes live in the gateway, not the agent.

## Service URLs (dev/staging)

| Service | URL | Credentials |
|---------|-----|-------------|
| App | `http://myapp.local` | — |
| Traefik dashboard | `http://traefik.myapp.com/dashboard/` | — |
| Splunk | `http://splunk.myapp.com` | admin / changeme123 |
| Jenkins | `http://jenkins.myapp.com` | admin / admin |
| Gitea | `http://git.myapp.com` | admin / adminadmin |
| Registry | `http://registry.myapp.com` | — |

## Infrastructure Compose Files

| File | Purpose |
|------|---------|
| `docker-compose.yml` | Simple local dev (3 services, direct port mapping) |
| `docker-compose-swarm.yml` | Swarm stack with Traefik (no autoscaler, no OTel) |
| `docker/docker-compose-app.yml` | Full production app stack (backend + frontend + db + autoscaler) |
| `docker/docker-compose-traefik.yml` | Traefik stack with OTLP + Prometheus dual-emit |
| `docker/docker-compose-otel-dev.yml` | Dev OTel Collector (single-tier, deploys `backend-only-config.yaml`) |
| `docker/docker-compose-otel.yml` | Production OTel (agent+gateway two-tier) |
| `docker/docker-compose-splunk.yml` | Splunk Enterprise 9.4 |
| `docker-compose.jenkins.yml` | Jenkins + Gitea + Registry infrastructure |
| `docker/docker-compose-registry.yml` | Standalone Docker registry |
| `docker/docker-compose-git.yml` | Standalone Gitea |

## Java Package Structure

```
com.example.demo
├── DemoApplication.java
├── controller/
│   ├── AuthController.java         # POST /api/auth/register, /api/auth/login
│   ├── GreetingController.java     # GET /api/greeting, GET /api/db
│   └── MessageBoardController.java # GET/POST /api/messages/*
├── model/                          # JPA entities
├── repository/                     # Spring Data JPA repositories
└── service/                        # Business logic layer
```
