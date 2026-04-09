# Frontend Instrumentation — Implementation Plan

## Based on `instrumentation-design-decisions.md §2.2`

---

## 1. SDK Decision: Grafana Faro Web SDK

### Why Faro (not OTel Web SDK)

| Criteria | Grafana Faro | OTel Web SDK |
|----------|-------------|--------------|
| RUM-first (Web Vitals, sessions, JS errors) | ✅ Native, first-class | ⚠️ Not RUM-first, limited |
| Packages needed | 2 (`faro-web-sdk` + `faro-web-tracing`) | 7+ (tracer, exporter, context, zone, instrumentations...) |
| Official Angular tutorial | ✅ [Grafana Angular Tutorial](https://github.com/grafana/faro-web-sdk/blob/main/docs/sources/tutorials/use-angular.md) | ⚠️ No official Angular tutorial |
| OTel Collector compatible | ✅ Via `faro` receiver in Contrib | ✅ Via `otlp` receiver |
| W3C trace propagation | ✅ Uses OTel JS under the hood | ✅ Native |
| Production failure mode | ✅ Drops telemetry silently, never breaks UI | ⚠️ Varies by configuration |
| Browser SDK stability | ✅ Stable | ⚠️ Parts still marked experimental |

**Conclusion:** Faro provides richer browser signals with fewer packages, has an official Angular integration pattern, and uses OTel internally for trace propagation — so there is no vendor lock-in at the pipeline level. The OTel Collector's `faro` receiver (included in the Contrib distribution we already use) translates Faro wire format into standard OTel traces and logs.

### Sources

- [Grafana Faro Official Angular Tutorial](https://github.com/grafana/faro-web-sdk/blob/main/docs/sources/tutorials/use-angular.md)
- [Grafana Faro Docs](https://grafana.com/docs/grafana-cloud/monitor-applications/frontend-observability/instrument/faro/)
- [Grafana Faro OSS](https://grafana.com/oss/faro/)
- [DeepWiki: Faro OTel Integration](https://deepwiki.com/grafana/faro/3-opentelemetry-integration)
- [DeepWiki: Faro Configuration & Initialization](https://deepwiki.com/grafana/faro-web-sdk/7-configuration-and-initialization)
- [Codeworm: Faro in Production (2026)](https://www.codeworm.dev/2026/02/grafana-faro-production-frontend.html)
- [OTel Stability Announcement](https://opentelemetry.io/blog/2025/stability-proposal-announcement/)
- [OTel auto-instrumentations-web npm](https://www.npmjs.com/package/@opentelemetry/auto-instrumentations-web)

---

## 2. Architecture

```
Browser (Angular 16)
  │  Faro SDK (npm, initialized via APP_INITIALIZER):
  │    - Page load + route-change traces
  │    - HTTP fetch/XHR spans  ──── W3C traceparent propagated to backend
  │    - Web Vitals (LCP, FID, CLS)
  │    - JS errors (via custom Angular ErrorHandler → Faro)
  │    - Console logs
  │    - User sessions
  │
  │  POST http://myapp.local/faro  (Faro wire format)
  ▼
Traefik  (PathPrefix /faro, priority 20)
  │
  ▼
OTel Agent :8027 (faro receiver)
  │  translates Faro → OTel traces + logs
  ▼
splunk_hec exporter → Splunk (index=main)
```

**Trace continuity:** Faro uses OTel JS internally → `traceparent` header on all fetch/XHR. Traefik v3 and OTel Java Agent both default to W3C Trace Context. Browser → Traefik → Backend trace continuity is automatic with zero extra configuration.

---

## 3. Implementation Details

### 3.1 Angular Source Code (Grafana Official Pattern)

**Pattern source:** [Grafana Official Angular Tutorial](https://github.com/grafana/faro-web-sdk/blob/main/docs/sources/tutorials/use-angular.md)

#### 3.1.1 `frontend/package.json` — Add Faro packages

```json
"@grafana/faro-web-sdk": "^2.3.1",
"@grafana/faro-web-tracing": "^2.3.1"
```

#### 3.1.2 `frontend/src/app/faro-initializer.ts` — NEW

Faro initialization function registered as an Angular `APP_INITIALIZER`. This ensures Faro is fully initialized before the Angular application bootstraps, capturing all telemetry from the very first moment.

```typescript
import { initializeFaro, getWebInstrumentations } from '@grafana/faro-web-sdk';
import { TracingInstrumentation } from '@grafana/faro-web-tracing';

export function faroInitializer(): Function {
  return async () => {
    const faroUrl = (window as any).__APP_CONFIG?.faroUrl;
    if (!faroUrl) return;

    initializeFaro({
      url: faroUrl,
      app: { name: 'demo-frontend', namespace: 'myapp' },
      instrumentations: [
        ...getWebInstrumentations({ captureConsole: true }),
        new TracingInstrumentation(),
      ],
    });
  };
}
```

**Why `APP_INITIALIZER`:** Angular's `APP_INITIALIZER` token runs factory functions before the application is fully bootstrapped. Faro must be initialized here (not in a component `ngOnInit`) to capture page-load traces and errors that occur during Angular's own bootstrap sequence.

**Why `getWebInstrumentations()`:** This is the Faro SDK's convenience function that includes all standard web instrumentations: `FetchInstrumentation`, `XHRInstrumentation`, `DocumentLoadInstrumentation`, `ErrorsInstrumentation`, `WebVitalsInstrumentation`, `ConsoleInstrumentation`, and `SessionInstrumentation`. Using the helper avoids manually listing each one and automatically picks up new instrumentations in future SDK versions.

#### 3.1.3 `frontend/src/app/global-error-handler.ts` — NEW

Angular's default `ErrorHandler` catches all unhandled errors and prints them to the console. Faro's `ErrorsInstrumentation` captures `window.onerror` and `unhandledrejection` events — but Angular intercepts errors before they reach `window.onerror`. Without a custom `ErrorHandler`, Angular-specific errors (template errors, DI errors, lifecycle hook errors) are invisible to Faro.

```typescript
import { ErrorHandler, Injectable } from '@angular/core';
import { faro } from '@grafana/faro-web-sdk';

@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  handleError(error: any) {
    if (error instanceof Error) {
      faro.api.pushError(error);
    }
    console.error(error);
  }
}
```

#### 3.1.4 `frontend/src/app/app.module.ts` — Register providers

```typescript
import { APP_INITIALIZER, NgModule, ErrorHandler } from '@angular/core';
import { faroInitializer } from './faro-initializer';
import { GlobalErrorHandler } from './global-error-handler';

@NgModule({
  // ... existing declarations, imports
  providers: [
    {
      provide: APP_INITIALIZER,
      useFactory: faroInitializer,
      deps: [],
      multi: true,
    },
    {
      provide: ErrorHandler,
      useClass: GlobalErrorHandler,
    },
  ],
})
export class AppModule { }
```

#### 3.1.5 `frontend/src/index.html` — Add runtime config script

Add before `</head>`:
```html
<script src="assets/config.js"></script>
```

This loads the runtime configuration (the `FARO_URL`) synchronously before Angular bootstraps, so `faro-initializer.ts` can read it from `window.__APP_CONFIG`.

---

### 3.2 Runtime Configuration (12-Factor Pattern)

**Pattern source:** [Dynamic Environment Variables in Angular: A Docker-Ready Solution](https://robododd.com/dynamic-environment-variables-in-angular-a-docker-ready-solution/), [Telerik: Docker Angular Env Vars](https://www.telerik.com/blogs/docker-angular-part-2-environment-variables-share-docker-images), [12factor.net/config](https://12factor.net/config)

**Why runtime config (not build-time `environment.ts`):** Angular's `environment.ts` files are compiled into the bundle at build time. Using them for the Faro URL would require rebuilding the Docker image for every environment (dev, staging, production). The 12-Factor App methodology specifies that configuration should come from the environment, not from code. The standard Docker solution is `envsubst` at container startup.

#### 3.2.1 `frontend/src/assets/config.js.template` — NEW

```js
window.__APP_CONFIG = {
  faroUrl: "${FARO_URL}"
};
```

This file is copied into the Docker image during build. At container startup, `envsubst` replaces `${FARO_URL}` with the actual environment variable value and writes the result to `config.js`.

#### 3.2.2 `frontend/docker-entrypoint.sh` — NEW

```sh
#!/bin/sh
set -e
envsubst '${FARO_URL}' \
  < /usr/share/nginx/html/assets/config.js.template \
  > /usr/share/nginx/html/assets/config.js
exec "$@"
```

**Why `exec "$@"`:** This replaces the shell process with the CMD argument (`nginx`), ensuring nginx receives signals (SIGTERM, etc.) directly — required for graceful shutdown in Docker/Swarm.

**Why explicit variable list (`'${FARO_URL}'`):** Without it, `envsubst` would replace ALL `$VAR` patterns in the file, including any that are meant to be literal. Specifying the exact variables is a best practice.

#### 3.2.3 `frontend/Dockerfile` — Update Stage 2

```dockerfile
# ---- Stage 1: Build ----
FROM node:20-alpine AS build
WORKDIR /app
COPY . .
RUN npm install
RUN npm install -g @angular/cli
RUN ng build --output-path=dist

# ---- Stage 2: Serve with nginx ----
FROM nginx:alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY docker-entrypoint.sh /docker-entrypoint.sh

RUN apk add --no-cache gettext \
    && chmod +x /docker-entrypoint.sh \
    && chown -R nginx:nginx /usr/share/nginx/html /var/cache/nginx /run

EXPOSE 80
ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
```

**Changes from current Dockerfile:**
- Added `nginx.conf` COPY (structured JSON access logs + SPA routing)
- Added `docker-entrypoint.sh` COPY (envsubst runtime config)
- Added `gettext` package (provides `envsubst`)
- Removed `USER nginx` — entrypoint must write `config.js` as root; nginx workers still run as `nginx` per `/etc/nginx/nginx.conf` default
- Changed `CMD` to `ENTRYPOINT` + `CMD` pattern

---

### 3.3 Nginx Structured JSON Access Logs

**Pattern source:** [Dash0: Mastering Nginx Logs with JSON and OpenTelemetry](https://www.dash0.com/guides/nginx-logs), [Edge Delta: Nginx Logging Guide](https://edgedelta.com/company/knowledge-center/nginx-logging-guide), [OneUptime: Nginx Logging & Monitoring](https://oneuptime.com/blog/post/2026-02-20-nginx-logging-monitoring/view)

**Why JSON access logs:** The design document (§2.2) specifies "Structured JSON access logs" as the server-side log signal. JSON logs are machine-parseable, eliminating regex-based parsing. They integrate directly with Loki, Splunk, and other log aggregation systems.

#### 3.3.1 `frontend/nginx.conf` — NEW

```nginx
log_format json_log escape=json
  '{"time":"$time_iso8601","method":"$request_method","uri":"$request_uri",'
  '"status":"$status","bytes":"$bytes_sent","duration":"$request_time",'
  '"user_agent":"$http_user_agent","referer":"$http_referer"}';

server {
    listen 80;
    server_name localhost;
    access_log /var/log/nginx/access.log json_log;

    location / {
        root /usr/share/nginx/html;
        index index.html;
        try_files $uri $uri/ /index.html;
    }

    error_page 500 502 503 504 /50x.html;
    location = /50x.html { root /usr/share/nginx/html; }
}
```

**Why `try_files $uri $uri/ /index.html`:** The Angular app uses HTML5 routing (no `useHash` in `RouterModule.forRoot(routes)`). Without `try_files`, Nginx returns 404 for deep links like `/app/messages`. This directive falls back to `index.html` and lets Angular's router handle the path.

---

### 3.4 OTel Collector — Faro Receiver

**Source:** [OTel Collector faroreceiver](https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/receiver/faroreceiver)

#### 3.4.1 `docker/otel/backend-only-config.yaml` — Add faro receiver

```yaml
receivers:
  faro:
    endpoint: 0.0.0.0:8027
```

Add `faro` to `traces` and `logs` pipelines:
```yaml
service:
  pipelines:
    traces:
      receivers: [otlp, faro]
    logs:
      receivers: [otlp, faro]
```

**Why not metrics pipeline:** The Faro receiver produces traces and logs only. Web Vitals (LCP, FID, CLS) are emitted as log records with structured attributes, not as OTel metrics. The metrics pipeline does not need the `faro` receiver.

#### 3.4.2 `docker/docker-compose-otel-dev.yml` — Config rename + Traefik route

**Swarm config rename:** Docker Swarm configs are immutable — they cannot be updated in place. To deploy a new OTel config, the config name must change from `otel_dev_config` to `otel_dev_config_v2`. The compose file references the new name. After deployment, the old config can be removed with `docker config rm`. ([Docker Swarm configs](https://docs.docker.com/engine/swarm/configs/))

**Traefik routing:** Browser Faro data is sent to `http://myapp.local/faro`. Traefik routes this to the OTel agent's faro receiver on port 8027. Priority 20 ensures the `/faro` route takes precedence over the frontend catch-all (priority 1).

```yaml
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.faro.rule=Host(`myapp.local`) && PathPrefix(`/faro`)"
  - "traefik.http.routers.faro.entrypoints=web"
  - "traefik.http.routers.faro.priority=20"
  - "traefik.http.services.faro.loadbalancer.server.port=8027"
```

#### 3.4.3 `docker/docker-compose-app.yml` — FARO_URL env var

```yaml
frontend:
  environment:
    FARO_URL: "http://myapp.local/faro"
```

---

## 4. Deployment Order

```
1. docker stack deploy -c docker/docker-compose-otel-dev.yml otel-agent
   (faro receiver must be up before browser sends data)

2. cd frontend && docker build -t registry.myapp.com/dockerdemoweb:latest .
   docker push registry.myapp.com/dockerdemoweb:latest

3. docker stack deploy -c docker/docker-compose-app.yml myapp --with-registry-auth
```

---

## 5. Verification

| Check | Command / Action | Expected |
|-------|-----------------|----------|
| Faro receiver started | `docker service logs otel-agent_otel-agent --tail 30 \| grep -i faro` | Log line showing faro receiver on :8027 |
| config.js substituted | `docker exec $(docker ps -q -f name=myapp_frontend) cat /usr/share/nginx/html/assets/config.js` | `faroUrl: "http://myapp.local/faro"` |
| HTML loads config.js | `curl -s http://myapp.local \| grep config.js` | `<script src="assets/config.js">` |
| Faro endpoint reachable | `curl -s -o /dev/null -w "%{http_code}" -X POST http://myapp.local/faro` | 200 or 204 |
| Frontend data in Splunk | `index=main sourcetype="otel" \| where 'resource.service.name'="demo-frontend"` | Trace spans, log records |
| Angular errors captured | Trigger a deliberate error in the app | Error appears in Splunk logs with Faro metadata |
| Nginx JSON logs | `docker service logs myapp_frontend --tail 10` | JSON-formatted access log entries |

---

## 6. Files Changed Summary

| # | File | Type | Change |
|---|------|------|--------|
| 1 | `frontend/package.json` | Modified | Add 2 Faro npm dependencies |
| 2 | `frontend/src/app/faro-initializer.ts` | **New** | Faro APP_INITIALIZER factory |
| 3 | `frontend/src/app/global-error-handler.ts` | **New** | Angular ErrorHandler → Faro |
| 4 | `frontend/src/app/app.module.ts` | Modified | Register 2 providers |
| 5 | `frontend/src/assets/config.js.template` | **New** | envsubst runtime config |
| 6 | `frontend/src/index.html` | Modified | Add config.js script tag |
| 7 | `frontend/nginx.conf` | **New** | JSON access logs + SPA routing |
| 8 | `frontend/docker-entrypoint.sh` | **New** | envsubst + exec nginx |
| 9 | `frontend/Dockerfile` | Modified | gettext, entrypoint, nginx.conf |
| 10 | `docker/otel/backend-only-config.yaml` | Modified | faro receiver + pipelines |
| 11 | `docker/docker-compose-otel-dev.yml` | Modified | Config v2 + Traefik /faro route |
| 12 | `docker/docker-compose-app.yml` | Modified | FARO_URL env var |

---

## 7. References

| # | Source | Used for |
|---|--------|----------|
| 1 | [Grafana Faro Official Angular Tutorial](https://github.com/grafana/faro-web-sdk/blob/main/docs/sources/tutorials/use-angular.md) | faro-initializer.ts, global-error-handler.ts, app.module.ts |
| 2 | [Grafana Faro Docs](https://grafana.com/docs/grafana-cloud/monitor-applications/frontend-observability/instrument/faro/) | SDK capabilities, config options |
| 3 | [Grafana Faro OSS](https://grafana.com/oss/faro/) | Project overview |
| 4 | [DeepWiki: Faro OTel Integration](https://deepwiki.com/grafana/faro/3-opentelemetry-integration) | Faro ↔ OTel relationship |
| 5 | [DeepWiki: Faro Configuration & Initialization](https://deepwiki.com/grafana/faro-web-sdk/7-configuration-and-initialization) | Init patterns and best practices |
| 6 | [Codeworm: Faro in Production (2026)](https://www.codeworm.dev/2026/02/grafana-faro-production-frontend.html) | Production deployment patterns |
| 7 | [OTel Stability Announcement](https://opentelemetry.io/blog/2025/stability-proposal-announcement/) | Browser SDK experimental status |
| 8 | [OTel auto-instrumentations-web npm](https://www.npmjs.com/package/@opentelemetry/auto-instrumentations-web) | OTel Web SDK comparison |
| 9 | [Runtime Angular Config Pattern (robododd)](https://robododd.com/dynamic-environment-variables-in-angular-a-docker-ready-solution/) | envsubst + window.__APP_CONFIG |
| 10 | [Telerik: Docker Angular Env Vars](https://www.telerik.com/blogs/docker-angular-part-2-environment-variables-share-docker-images) | Docker envsubst pattern |
| 11 | [GitHub: angular-docker-env-setup](https://github.com/warl0ck1111/angular-docker-env-setup) | Reference implementation |
| 12 | [12factor.net/config](https://12factor.net/config) | Config from environment principle |
| 13 | [Dash0: Mastering Nginx Logs with JSON and OTel](https://www.dash0.com/guides/nginx-logs) | Structured JSON access logs |
| 14 | [Edge Delta: Nginx Logging Guide](https://edgedelta.com/company/knowledge-center/nginx-logging-guide) | Nginx logging best practices |
| 15 | [OneUptime: Nginx Logging & Monitoring](https://oneuptime.com/blog/post/2026-02-20-nginx-logging-monitoring/view) | JSON log format |
| 16 | [OTel faroreceiver](https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/receiver/faroreceiver) | Collector faro receiver docs |
| 17 | [Docker Swarm configs](https://docs.docker.com/engine/swarm/configs/) | Swarm config immutability |
