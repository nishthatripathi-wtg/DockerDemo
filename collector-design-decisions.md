# OTel Collector Design Decisions — Docker Swarm

## 1. Scope & Goals

### Purpose
Deploy an OpenTelemetry Collector pipeline to receive, process, and export telemetry (metrics, traces, logs) from all instrumented Swarm services to observability backends.

### Backends
- **Grafana stack** (Tempo, Loki, Mimir/Prometheus) — details deferred to a later phase
- **Splunk** (via HEC exporter) — details deferred to a later phase

During initial deployment, a `debug` exporter logs all received telemetry to stdout for pipeline verification.

---

## 2. Distribution

| Attribute | Decision |
|---|---|
| **Distribution** | OTel Collector Contrib (`otel/opentelemetry-collector-contrib`) |
| **Version pinning** | Pinned to a specific release tag (not `:latest`) |

**Why Contrib (not Core, not Custom OCB, not a vendor distro):**
The collector requires 7 contrib-only components: `faroreceiver` (frontend Grafana Faro), `prometheusreceiver` (Gitea, Registry, Traefik metrics), `postgresqlreceiver` (PostgreSQL stats), `hostmetricsreceiver` (node-level metrics), `dockerstatsreceiver` (container metrics), `resourcedetectionprocessor` (auto host/OS metadata), and `splunk_hec` exporter (future Splunk backend). None of these exist in Core.

A custom OCB build would produce a smaller binary (~50MB vs ~120MB) but adds a Go toolchain build step to CI and a version manifest to maintain — overhead not justified at this stage. 80%+ of real-world deployments use Contrib (per Datadog's 2025 analysis). Migration to a custom build is straightforward later — the YAML config is identical.


**References:**
- [OTel Distributions docs](https://opentelemetry.io/docs/collector/distributions/)
- [OTel Collector Builder (OCB)](https://opentelemetry.io/docs/collector/extend/ocb/)
- [Datadog: Choosing the right OTel Collector distribution](https://www.datadoghq.com/blog/otel-collector-distributions/)
- [SigNoz: OTel Collector Contrib guide](https://signoz.io/blog/opentelemetry-collector-contrib/)

---

## 3. Deployment Pattern

| Attribute | Decision |
|---|---|
| **Pattern** | Agent + Gateway (two-tier) |
| **Agent deployment** | Swarm `mode: global` (one per node) |
| **Gateway deployment** | Swarm `mode: replicated`, `replicas: 1` |
| **Network** | Both on `traefik_proxy` overlay network |

### Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│ Swarm Node                                                          │
│                                                                     │
│  Backend ──(OTLP gRPC)──►┐                                         │
│  Traefik ──(OTLP gRPC)──►│                                         │
│  Jenkins ──(OTLP gRPC)──►├──► Agent ──(OTLP gRPC)──►┐              │
│  Browser ──(Faro HTTP)───►│   (per-node)             │              │
│  /proc, /sys ────────────►│   hostmetrics            │              │
│  docker.sock ────────────►┘   docker_stats           │              │
│                                                      │              │
└──────────────────────────────────────────────────────┼──────────────┘
                                                       │
                                                       ▼
                                              ┌─────────────────┐
                                              │    Gateway       │
                                              │  (1 replica)     │
                                              │                  │
                                              │  ◄── PostgreSQL  │
                                              │  ◄── Gitea prom  │
                                              │  ◄── Registry    │
                                              │       prom       │
                                              │                  │
                                              │  ──► debug       │
                                              │  ──► (Grafana)   │
                                              │  ──► (Splunk)    │
                                              └─────────────────┘
```

**Why Agent + Gateway (not gateway-only, not agent-only):**

- **Agent per node** is required because `hostmetrics` reads from local `/proc` and `/sys`, and `docker_stats` reads from the local `/var/run/docker.sock`. These cannot work remotely.
- **Gateway as central aggregation** avoids fan-out: agents forward to one place, which then exports to N backends. Without a gateway, every node's agent needs credentials for every backend (Grafana + Splunk), and sampling/filtering is duplicated.
- **Gateway hosts pull-based scrapers** (PostgreSQL, Prometheus for Gitea/Registry) because these are single-instance services. Running scrapers on every agent node would create N duplicate metric streams for the same target.

**References:**
- [OTel Collector deployment patterns](https://opentelemetry.io/docs/collector/deployment/)
- [SigNoz Docker Swarm agent guide](https://signoz.io/docs/opentelemetry-collection-agents/docker-swarm/install/)

---

## 4. Compose File

| Attribute | Decision |
|---|---|
| **File** | `docker/docker-compose-otel.yml` (new file) |
| **Deploy order** | Collector stack deployed first (or simultaneously with app stack) |

The collector is a separate stack rather than embedded in `docker-compose-app.yml` because:
- It has a different lifecycle (can be restarted/upgraded independently)
- Clean separation of concerns (infra vs application)
- Config changes to the collector don't require redeploying application services

---

## 5. Configuration Delivery

| Attribute | Decision |
|---|---|
| **Method** | Docker Swarm configs |
| **Config files** | `docker/otel/agent-config.yaml`, `docker/otel/gateway-config.yaml` |
| **Mount target** | `/etc/otelcol-contrib/config.yaml` |

**Why Docker configs (not bind mounts, not environment variables):**
In a multi-node Swarm, bind mounts require the config file to exist on every node's filesystem — this breaks silently if a node doesn't have the file. Docker Swarm configs are distributed automatically to all nodes via the Raft consensus protocol. They are immutable per deploy, preventing in-place tampering.

Bind mounts are appropriate for single-node dev (and are used elsewhere in this project, e.g., PostgreSQL init SQL). But the collector agent runs `mode: global` across all nodes, making Swarm configs the correct choice.

**References:**
- [Docker Swarm configs](https://docs.docker.com/engine/swarm/configs/)
- [SigNoz Docker Swarm collector config delivery](https://signoz.io/docs/opentelemetry-collection-agents/docker-swarm/install/)

---

## 6. Receivers

### 6.1 Agent Receivers (per-node)

| Receiver | Port/Source | What it collects | Why on agent |
|---|---|---|---|
| **`otlp`** | gRPC :4317, HTTP :4318 | Traces, metrics, logs from backend, Traefik, Jenkins | Services emit to local agent — minimal network hop |
| **`faro`** | HTTP :8027 | Browser traces, errors, Web Vitals, sessions | Routed through Traefik from browser; must be reachable externally |
| **`hostmetrics`** | Local `/proc`, `/sys` | Node CPU, memory, disk, network, load, filesystem | Reads local kernel interfaces — cannot work remotely |
| **`docker_stats`** | Local `/var/run/docker.sock` | Per-container CPU, memory, network, block I/O | Docker socket is node-local — cannot be accessed remotely |

### 6.2 Gateway Receivers (central)

| Receiver | Port/Source | What it collects | Why on gateway |
|---|---|---|---|
| **`otlp`** | gRPC :4317 | Aggregated telemetry forwarded from all agents | Central aggregation point before export to backends |
| **`postgresql`** | SQL connection to `db:5432` | pg_stat_activity, pg_stat_user_tables, pg_stat_statements | Single DB instance — running on N agents would create N duplicate connections and metric streams |
| **`prometheus`** | HTTP scrape of Gitea :3000/metrics, Registry :5001/metrics | Gitea and Registry application metrics | Single-instance services — same deduplication rationale as PostgreSQL |

---

## 7. Processors

| Processor | Pipeline position | Purpose | Configuration |
|---|---|---|---|
| **`memory_limiter`** | First (always) | Prevents OOM by applying backpressure when memory threshold is reached | Agent: `limit_mib: 200`, `spike_limit_mib: 50`. Gateway: `limit_mib: 400`, `spike_limit_mib: 100` |
| **`resourcedetection`** | Second | Auto-enriches all telemetry with host/OS/container resource attributes | Detectors: `system` (hostname, OS), `docker` (container ID), `env` (OTEL_RESOURCE_ATTRIBUTES) |
| **`batch`** | Last (before exporters) | Groups telemetry items into batches for efficient export | `timeout: 200ms`, `send_batch_size: 8192` |

**Pipeline order**: `memory_limiter → resourcedetection → batch`

This order is prescribed by the OTel documentation: memory_limiter must be first to guard all downstream processing, batch must be last to optimize export efficiency.

**References:**
- [OTel Collector processor README](https://github.com/open-telemetry/opentelemetry-collector/blob/main/processor/README.md)
- [Datadog batch/memory processor guide](https://docs.datadoghq.com/opentelemetry/config/collector_batch_memory/)
- [Dash0: memory_limiter best practices](https://www.dash0.com/guides/opentelemetry-memory-limiter-processor)

---

## 8. Exporters

### Initial Phase (no backends yet)

| Exporter | Purpose |
|---|---|
| **`debug`** | Logs all received telemetry to stdout — verifies the pipeline end-to-end |

### Future Phase

| Exporter | Backend | Notes |
|---|---|---|
| **`otlphttp`** | Grafana Tempo (traces), Loki (logs), Mimir (metrics) | Configured when Grafana stack is deployed |
| **`splunk_hec`** | Splunk Enterprise or Splunk Cloud | Configured when Splunk integration is set up |

The `debug` exporter will be replaced (or supplemented) with real exporters once backends are deployed. All pipeline YAML remains the same — only the `exporters` section and `service.pipelines` references change.

---

## 9. Resource Limits

| Component | Memory Limit | CPU Limit | memory_limiter setting |
|---|---|---|---|
| **Agent** | 256 MB | 0.25 cores | `limit_mib: 200`, `spike_limit_mib: 50` |
| **Gateway** | 512 MB | 0.50 cores | `limit_mib: 400`, `spike_limit_mib: 100` |

The `memory_limiter` processor is set to ~80% of the container memory limit, leaving 20% headroom for the Go runtime and garbage collection.

**References:**
- [OTel Collector performance benchmarks](https://opentelemetry.io/docs/collector/benchmarks/)

---

## 10. Collector-Absent Behavior

| Attribute | Decision |
|---|---|
| **Strategy** | Deploy collector stack first (or simultaneously with instrumented services) |

The OTel Collector stack must be running before (or at the same time as) instrumented services. The OTel Java Agent and other OTLP exporters retry on connection failure but log warnings every few seconds and eventually drop telemetry. Deploying the collector first eliminates this noise window.

---

## 11. Open Questions (Deferred)

1. **Grafana stack details**: Which specific exporters, endpoints, and auth for Tempo/Loki/Mimir — deferred to Grafana deployment phase
2. **Splunk details**: Which Splunk product (Enterprise vs Observability Cloud), HEC token, index names — deferred to Splunk integration phase
3. **Sampling strategy**: Currently 100% on all signals. May add `probabilistic_sampler` processor at gateway when traffic volumes are understood
4. **Faro routing through Traefik**: Browser → Traefik → Agent's faro receiver. Exact Traefik routing rule (PathPrefix, host) to be defined during implementation
5. **Log collection**: Whether to add `filelog` receiver for container stdout/stderr logs from Docker, or rely on application-level log forwarding only

---

## 12. References

- [OTel Collector documentation](https://opentelemetry.io/docs/collector/)
- [OTel Collector Contrib](https://github.com/open-telemetry/opentelemetry-collector-contrib)
- [OTel Collector deployment patterns](https://opentelemetry.io/docs/collector/deployment/)
- [OTel Collector distributions](https://opentelemetry.io/docs/collector/distributions/)
- [OTel Collector Builder (OCB)](https://opentelemetry.io/docs/collector/extend/ocb/)
- [Install Collector with Docker](https://opentelemetry.io/docs/collector/install/docker/)
- [Datadog: Choosing the right distribution](https://www.datadoghq.com/blog/otel-collector-distributions/)
- [Datadog: Batch and memory settings](https://docs.datadoghq.com/opentelemetry/config/collector_batch_memory/)
- [SigNoz: Docker Swarm agent guide](https://signoz.io/docs/opentelemetry-collection-agents/docker-swarm/install/)
- [SigNoz: OTel Collector Contrib guide](https://signoz.io/blog/opentelemetry-collector-contrib/)
- [Dash0: memory_limiter processor](https://www.dash0.com/guides/opentelemetry-memory-limiter-processor)
- [Docker Swarm configs](https://docs.docker.com/engine/swarm/configs/)
