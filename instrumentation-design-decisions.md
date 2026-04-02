# Instrumentation Design Decisions — Docker Swarm Services

## 1. Scope & Goals

### In Scope
All Docker Swarm services: **Backend, Frontend, PostgreSQL, Traefik, Jenkins, Gitea, Registry**

### Out of Scope
- **Autoscaler** — does not need instrumentation; it is an infra-level scaling agent, not an application service

### Signals
All three pillars of observability: **Metrics, Traces, Logs**

---

## 2. Per-Service Design Decisions

### 2.1 Backend (Spring Boot 3.2)

| Attribute | Decision |
|---|---|
| **Approach** | OpenTelemetry Java Agent (bytecode instrumentation at runtime) |
| **Signals emitted** | Traces (HTTP requests, DB queries, JPA operations), Metrics (JVM, HTTP server), Logs (Logback capture via agent) |
| **Transport** | gRPC OTLP to collector on port 4317 |
| **Status** | ⚠️ Provisional — may migrate to Spring Boot OTel Starter after initial evaluation |

**Why the Java Agent:**
The primary goal is zero code and Maven changes for the initial rollout. The OTel Java Agent provides the broadest auto-instrumentation coverage (150+ libraries including Spring Web, JDBC, JPA) by attaching as a `-javaagent` at runtime. This enables rapid onboarding without touching the application codebase or build pipeline.

**Known trade-offs:**
- +5–30s startup time overhead from bytecode transformation
- +20–100MB memory overhead
- +5–10% CPU overhead
- The Spring team recommends the Micrometer bridge or Spring Boot OTel Starter over the agent ([GitHub #41227](https://github.com/spring-projects/spring-boot/issues/41227)), citing better integration with Spring's own AOP/proxying
- The agent version must be pinned to avoid compatibility breaks with Spring Boot 3.2

**Why not the Spring Boot OTel Starter or Micrometer Bridge:**
Both require Maven dependency changes and application configuration updates. The Spring Boot OTel Starter (`opentelemetry-spring-boot-starter`) is a strong contender for the long term — it has lower overhead, better Spring integration, and supports GraalVM native images. The Micrometer Observation API + OTel Bridge is the Spring team's blessed path but has narrower auto-instrumentation coverage than the agent. Either may replace the Java Agent after the initial phase proves out the observability pipeline.

**References:** [OTel Java Agent performance docs](https://opentelemetry.io/docs/zero-code/java/agent/performance/), [spring.io OTel blog](https://spring.io/blog/2025/11/18/opentelemetry-with-spring-boot), [Last9 production guide](https://last9.io/blog/opentelemetry-agents/), [Uptrace Spring Boot guide](https://uptrace.dev/blog/opentelemetry-java-agent-spring-boot)

---

### 2.2 Frontend (Angular 16 / Nginx)

| Attribute | Decision |
|---|---|
| **Approach** | Grafana Faro Web SDK (`@grafana/faro-web-sdk` + `@grafana/faro-web-tracing`) |
| **Signals emitted** | Traces (page loads, HTTP fetch/XHR, route changes), Metrics (Web Vitals: LCP, FID, CLS), Logs (JS errors, console logs), Sessions (user session tracking) |
| **Transport** | HTTP to OTel Collector's `faro` receiver (Faro-native format, translated to OTel traces+logs by the collector) |
| **Collector requirement** | OTel Collector **contrib** distribution (includes `faro` receiver) |
| **Nginx** | Structured JSON access logs (server-side logs signal) |

**Why Grafana Faro over the OTel Web SDK:**
The observability backend is a Grafana stack (Tempo, Loki, Mimir/Prometheus). Faro is purpose-built for this stack and provides a richer signal set than the raw OTel Web SDK — including automatic JS error tracking, Web Vitals (LCP, FID, CLS), user session tracking, and console log capture — with fewer packages (2 vs 7+). Under the hood, Faro uses the OTel JS SDK for trace context propagation, so browser→backend trace continuity works identically.

The OTel Web SDK (`@opentelemetry/auto-instrumentations-web`) was considered but provides fewer signals, requires more packages, and parts of the browser SDK are still marked experimental ([OTel stability blog](https://opentelemetry.io/blog/2025/stability-proposal-announcement/)). Since Faro data flows through the OTel Collector (via the `faro` receiver in the contrib distribution), there is no vendor lock-in at the pipeline level — only a soft coupling at the SDK level.

**Why not Nginx metrics only (skip browser SDK):**
Server-side Nginx metrics capture request rates and error codes but cannot provide browser→backend trace continuity, client-side performance data, or JavaScript error visibility.

**Runtime configuration constraint:** Angular `environment.ts` files are compiled at build time. The Faro collector URL must be injected at **runtime** via a Docker entrypoint script using `envsubst` + `window.__APP_CONFIG` pattern. This enables a single Docker image to be deployed across environments without rebuilding.

**References:** [Grafana Faro docs](https://grafana.com/docs/grafana-cloud/monitor-applications/frontend-observability/), [Faro + OTel Collector guide](https://grafana.com/docs/grafana-cloud/monitor-applications/frontend-observability/configure/process-faro-telemetry/), [DeepWiki: Faro OTel Integration](https://deepwiki.com/grafana/faro/3-opentelemetry-integration), [Runtime Angular config pattern](https://robododd.com/dynamic-environment-variables-in-angular-a-docker-ready-solution/)

---

### 2.3 Traefik (v3.6)

| Attribute | Decision |
|---|---|
| **Approach** | Dual-emit: keep existing Prometheus metrics + add OTLP metrics + add OTLP tracing + structured JSON access logs |
| **Signals emitted** | Traces (per-request spans through entrypoints, routers, middleware), Metrics (request rates, latencies, status codes — dual Prometheus + OTLP), Logs (JSON-formatted access logs) |
| **Transport** | gRPC OTLP to collector on port 4317 (for traces + metrics). Prometheus scrape on `:8082/metrics` (unchanged, for autoscaler). |
| **Context propagation** | W3C Trace Context (`traceparent`/`tracestate`) — Traefik v3 default |

**Why dual-emit instead of migrating fully to OTLP:**
The autoscaler reads `traefik_service_requests_total` from `:8082/metrics`. Removing the Prometheus endpoint breaks autoscaling. Traefik v3 natively supports emitting Prometheus AND OTLP metrics simultaneously, so dual-emit preserves backward compatibility while also sending metrics to the OTel Collector for the Grafana stack.

**Why W3C Trace Context works end-to-end without additional configuration:**
Traefik v3 defaults to W3C Trace Context propagation ([GitHub #10446](https://github.com/traefik/traefik/issues/10446)). The OTel Java Agent on the backend also defaults to W3C Trace Context. Grafana Faro uses OTel under the hood, which does the same. This means Browser → Traefik → Backend trace continuity is automatic — no propagator configuration needed.

**References:** [Traefik blog: Monitor Your Production with Traefik 3.0 and OpenTelemetry](https://traefik.io/blog/monitor-your-production-at-a-glance-with-traefik-3-0-and-opentelemetry), [Traefik metrics docs](https://doc.traefik.io/traefik/reference/install-configuration/observability/metrics/), [Traefik tracing docs](https://doc.traefik.io/traefik/reference/install-configuration/observability/tracing/)


### 2.4 PostgreSQL 17

| Attribute | Decision |
|---|---|
| **Approach** | Create monitoring user + enable `pg_stat_statements` extension + configure slow query logging |
| **Signals emitted** | Metrics (via OTel Collector's `postgresqlreceiver`: connections, transactions, cache hits, replication, locks), Logs (slow queries > 200ms, connection events — via Docker log driver) |
| **Traces** | Not applicable at the database layer — DB-level trace spans are generated by the backend's OTel Java Agent instrumenting JDBC calls |
| **Monitoring user** | `monitor` role with `pg_monitor` grant (read-only access to system stats views) |
| **Init SQL delivery** | Bind mount (consistent with existing `../jenkins_home`, `../gitea_data` patterns in compose files) |

**Why this approach:**
PostgreSQL has no native OTel agent or built-in telemetry export. Instrumentation means making it scrape-ready for the OTel Collector's `postgresqlreceiver`, which queries `pg_stat_*` views via a monitoring user. This is the standard approach recommended by the OTel community.

**Why not `postgres_exporter` or `pg_exporter`:**
The OTel Collector's `postgresqlreceiver` provides the same metrics natively — adding a separate exporter sidecar adds operational overhead without additional value. `pg_exporter` (Pigsty) is designed for large multi-instance clusters and is overkill for a single-instance deployment.

**References:** [Uptrace: OTel PostgreSQL Monitoring](https://uptrace.dev/guides/opentelemetry-postgresql), [OTel postgresqlreceiver README](https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/main/receiver/postgresqlreceiver/README.md), [Last9: OTel with Postgres](https://last9.io/blog/how-to-use-opentelemetry-with-postgres/)

---

### 2.5 Jenkins

| Attribute | Decision |
|---|---|
| **Approach** | Pre-install the official OpenTelemetry Jenkins Plugin (`opentelemetry`) in the Docker image |
| **Signals emitted** | Traces (root span per build, child spans per stage/step), Metrics (build durations, success/failure rates, agent utilization) |
| **Transport** | gRPC OTLP to collector on port 4317 |
| **Configuration** | `OTEL_*` environment variables only. The plugin reads these directly at startup — no `-Dotel.*` JVM system properties needed. |
| **JVM env var** | `JENKINS_JAVA_OPTS` (the `jenkins/jenkins:lts` Docker image ignores `JAVA_OPTS`) |

**Why the OTel plugin over the Prometheus metrics plugin:**
The OTel plugin provides traces, metrics, and logs — including per-stage pipeline tracing and build-step latency — while the Prometheus plugin only provides metrics. Since the collector and Grafana stack will handle visualization, the OTel plugin is the better fit for unified observability.

**Why pre-install in Dockerfile rather than install via UI:**
Baking the plugin into the Docker image ensures reproducible deployments. UI-installed plugins are persisted in `jenkins_home` and can drift between environments. Pre-installing via `jenkins-plugin-cli` in the Dockerfile makes the plugin part of the immutable image.

**References:** [Jenkins OTel Plugin](https://plugins.jenkins.io/opentelemetry/), [Plugin setup guide](https://github.com/jenkinsci/opentelemetry-plugin/blob/master/docs/setup-and-configuration.md), [CloudBees: Java arguments](https://docs.cloudbees.com/docs/cloudbees-ci-kb/latest/client-and-managed-controllers/how-to-add-java-arguments-to-jenkins)

---

### 2.6 Gitea

| Attribute | Decision |
|---|---|
| **Approach** | Enable built-in Prometheus metrics endpoint via env vars |
| **Signals emitted** | Metrics (repo counts, user activity, HTTP request rates, SSH sessions, DB query latencies), Logs (console output to Docker log driver) |
| **Traces** | Not available — Gitea has no native OTel tracing support ([open feature request: GitHub #32866](https://github.com/go-gitea/gitea/issues/32866)) |
| **Auth** | Metrics token left empty (no auth) — acceptable on internal overlay network |

**Why Prometheus metrics is the only option:**
Gitea does not support OpenTelemetry natively. The built-in Prometheus endpoint at `/metrics` is the sole instrumentation mechanism available. The OTel Collector will scrape it via `prometheusreceiver`.

**References:** [Gitea forum: Telemetry Support](https://forum.gitea.com/t/gitea-telemetry-support/8805), [GitHub #32866: OTel support request](https://github.com/go-gitea/gitea/issues/32866)

---

### 2.7 Docker Registry (registry:2)

| Attribute | Decision |
|---|---|
| **Approach** | Enable native Prometheus metrics via the debug HTTP server |
| **Env vars** | `REGISTRY_HTTP_DEBUG_ADDR=:5001`, `REGISTRY_HTTP_DEBUG_PROMETHEUS_ENABLED=true` |
| **Signals emitted** | Metrics (request counts, durations, storage backend stats — Prometheus format at `:5001/metrics`), Logs (JSON-formatted access logs via `REGISTRY_LOG_FORMATTER=json`) |
| **Traces** | Not available natively |

**Why `REGISTRY_HTTP_DEBUG_PROMETHEUS_ENABLED` instead of `REGISTRY_DEBUG_ADDR`:**
The debug address alone (`REGISTRY_DEBUG_ADDR`) only exposes Go `expvar` data at `/debug/vars`, which is not Prometheus-compatible and cannot be scraped by the OTel Collector. Setting `REGISTRY_HTTP_DEBUG_PROMETHEUS_ENABLED=true` enables a proper Prometheus-format `/metrics` endpoint on the debug port.

**References:** [CNCF Distribution config docs](https://distribution.github.io/distribution/about/configuration/), [Docker Registry Helm chart monitoring](https://deepwiki.com/twuni/docker-registry.helm/3.4-monitoring-resources)

---

## 3. Cross-Cutting Design Decisions

### 3.1 Transport Protocol

| Context | Protocol | Port |
|---|---|---|
| Server-side services (Backend, Traefik, Jenkins) | gRPC OTLP | 4317 |
| Browser (Faro SDK) | HTTP (Faro format) | Routed via Traefik to collector |
| Prometheus scrape targets (Gitea, Registry, Traefik) | Prometheus exposition format | Various (3000, 5001, 8082) |

gRPC is chosen over HTTP for server-side OTLP because it offers better performance and multiplexing for high-throughput telemetry streams on internal networks. Browser telemetry uses HTTP because browsers cannot speak gRPC.

### 3.2 Trace Context Propagation

All services use **W3C Trace Context** (`traceparent` / `tracestate` headers). This is the default for Traefik v3 ([Traefik docs](https://doc.traefik.io/traefik/reference/install-configuration/observability/tracing/)), the OTel Java Agent, and Grafana Faro. No custom propagator configuration is needed.

**End-to-end trace flow:** Browser (Faro) → Traefik (creates/updates `traceparent`) → Backend (Java Agent reads `traceparent`, creates child spans for controller + DB calls)

### 3.3 Sampling

100% sampling (`always_on`) for initial deployment. This will be revisited when configuring the collector — tail-based sampling or probabilistic sampling at the collector level is the preferred long-term approach.

### 3.4 OTel Collector Distribution

The **OTel Collector Contrib** distribution (not core) is required. The core distribution lacks the following receivers that this design depends on:
- `faro` receiver — for Grafana Faro browser telemetry
- `postgresqlreceiver` — for PostgreSQL metrics
- `prometheusreceiver` — for Gitea, Registry, and Traefik Prometheus endpoints

### 3.5 Service Resource Attributes

All services are identified with consistent OTel resource attributes:
- `service.name` — unique per service (e.g., `demo-backend`, `traefik`, `jenkins`)
- `service.namespace` — `myapp` (groups all services under one namespace)
- `deployment.environment` — `production` (overridable per environment)

### 3.6 Version Pinning

All instrumentation versions are **pinned** to specific releases:
- OTel Java Agent: pinned via Dockerfile `ARG` (e.g., `ARG OTEL_JAVA_AGENT_VERSION=2.12.0`)
- Grafana Faro: pinned in `package.json`
- Jenkins OTel Plugin: pinned in `jenkins-plugin-cli` command

Unpinned versions break reproducible builds. The OTel Java Agent has known compatibility issues with specific Spring Boot versions ([SO: Spring Boot 3.2 + OTel](https://stackoverflow.com/questions/77747165/springboot-upgrade-to-3-2-and-open-telemtry-1-26-0-has-issues-with-compliation)).

---

## 4. Open Questions

### 4.1 Collector-absent behavior
The collector does not exist yet. Services configured to export to `otel-collector:4317` will fail DNS resolution and log errors on every export cycle (~5s for the Java Agent). Options under consideration:
- A) Default all `OTEL_*_EXPORTER` to `none`, flip to `otlp` when collector is deployed
- B) Deploy the collector simultaneously with instrumentation
- C) Accept noisy error logs temporarily

### 4.2 Backend approach long-term
The OTel Java Agent is provisional for rapid initial rollout. After the observability pipeline is validated end-to-end, evaluate migrating to the Spring Boot OTel Starter or Micrometer Bridge for lower overhead and better Spring integration.

### 4.3 Frontend collector URL routing
The Faro SDK needs a publicly reachable collector URL (browser traffic cannot use internal Docker DNS). The Traefik routing rule to proxy browser Faro traffic to the collector's `faro` receiver will be designed during the collector deployment phase.

---

## 5. Architecture Summary

```
┌─────────────────────────────────────────────────────────────┐
│                        BROWSER                              │
│  Angular 16 + Grafana Faro SDK                              │
│  → Faro format over HTTP                                    │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────────────────────┐
│                     TRAEFIK v3.6                             │
│  Traces: OTLP gRPC ────────────────────────┐                │
│  Metrics: Prometheus (:8082) + OTLP gRPC ──┤                │
│  Logs: JSON access logs ───────────────────┐│                │
│  Propagation: W3C traceparent ──────────┐  ││                │
└──────────────────┬──────────────────────┼──┼┼────────────────┘
                   │                      │  ││
                   ▼                      │  ││
┌──────────────────────────────────┐      │  ││
│       BACKEND (Spring Boot 3.2)  │      │  ││
│  OTel Java Agent                 │      │  ││
│  Traces + Metrics + Logs: ───────┼──────┤  ││
│    OTLP gRPC                     │      │  ││
│  → JDBC spans to PostgreSQL      │      │  ││
└──────────────────┬───────────────┘      │  ││
                   │                      │  ││
                   ▼                      │  ││
┌──────────────────────────────────┐      │  ││
│       POSTGRESQL 17              │      │  ││
│  pg_stat_statements enabled      │      │  ││
│  monitor user (pg_monitor role)  │      │  ││
│  Slow query logs (>200ms)        │      │  ││
│  → Scraped by collector ─────────┼──────┤  ││
└──────────────────────────────────┘      │  ││
                                          │  ││
┌──────────────────────────────────┐      │  ││
│       JENKINS                    │      │  ││
│  OTel Plugin (auto-instruments   │      │  ││
│  pipelines, stages, steps)       │      │  ││
│  Traces + Metrics: OTLP gRPC ───┼──────┤  ││
└──────────────────────────────────┘      │  ││
                                          │  ││
┌──────────────────────────────────┐      │  ││
│       GITEA                      │      │  ││
│  Prometheus metrics (:3000)  ────┼──────┤  ││
│  Console logs                    │      │  ││
└──────────────────────────────────┘      │  ││
                                          │  ││
┌──────────────────────────────────┐      │  ││
│       DOCKER REGISTRY            │      │  ││
│  Prometheus metrics (:5001)  ────┼──────┤  ││
│  JSON access logs                │      │  ││
└──────────────────────────────────┘      │  ││
                                          ▼  ▼▼
                                   ┌──────────────┐
                                   │  OTel        │
                                   │  Collector   │
                                   │  (contrib)   │
                                   │              │
                                   │  Receivers:  │
                                   │  - otlp      │
                                   │  - faro      │
                                   │  - prometheus │
                                   │  - postgresql │
                                   │              │
                                   │  [Phase 2]   │
                                   └──────────────┘
```

---

*Document version: 1.0 | Created: 2026-04-01 | Phase: Instrumentation (emit-side only)*
