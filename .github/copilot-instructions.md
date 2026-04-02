# Copilot Instructions

## Project Overview

This is a Docker demonstration project showcasing a full microservices architecture: an Angular 16 frontend, a Spring Boot 3.2 backend, PostgreSQL, Traefik reverse proxy, a custom Python autoscaler, and a Jenkins CI/CD pipeline — all orchestrated with Docker Swarm.

## Architecture

```
Browser → Traefik (:80, Host: myapp.local)
            ├── PathPrefix(/api) → Backend Spring Boot (:8080) → PostgreSQL (:5432)
            └── /                → Frontend Nginx (:80)

Autoscaler (Python) → polls Traefik metrics (:8082) → scales Swarm services
Jenkins → builds Docker images → pushes to registry → deploys Swarm stack
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
./loadtest.sh   # 50 concurrent curl workers against http://127.0.0.1/api/greeting for 60s
```

## Key Conventions

### API design
- All backend REST endpoints use the `/api/` prefix (e.g., `GET /api/greeting?name=X`)
- Responses are plain `Map<String, String>` JSON objects: `{"message": "Hello, X!"}`
- The `/db` endpoint is a DB health check (returns connection URL or 500)

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
Four stages: **Checkout → Build Images → Push to Registry → Deploy to Swarm**. The registry is configured via the `REGISTRY` environment variable (`registry.myapp.com`). The deploy target is `docker/docker-compose-app.yml`.

## Infrastructure Compose Files

| File | Purpose |
|------|---------|
| `docker-compose.yml` | Simple local dev (3 services, direct port mapping) |
| `docker-compose-swarm.yml` | Swarm stack with Traefik (no autoscaler) |
| `docker/docker-compose-app.yml` | Full production stack (Traefik + autoscaler) |
| `docker/docker-compose-traefik.yml` | Traefik-only stack |
| `docker-compose.jenkins.yml` | Jenkins + Gitea + Registry infrastructure |
| `docker/docker-compose-registry.yml` | Standalone Docker registry |
| `docker/docker-compose-git.yml` | Standalone Gitea |

## Java Package Structure

```
com.example.demo
├── DemoApplication.java          # @SpringBootApplication entry point
└── controller/
    └── GreetingController.java   # REST endpoints
```
