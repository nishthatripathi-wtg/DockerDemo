import math
import time
import os
import docker
import requests

METRICS_URL  = os.getenv("TRAEFIK_METRICS_URL", "http://127.0.0.1:8082/metrics")
POLL_SECONDS = int(os.getenv("POLL_SECONDS", "15"))
DRY_RUN      = os.getenv("DRY_RUN", "true").lower() == "true"

docker_client = docker.from_env()

last_count = {}
last_time  = {}

def log(message):
    print(f"[{time.strftime('%H:%M:%S')}] {message}")

def get_request_counts():
    """Fetch metrics from Traefik and return total requests per service."""
    response = requests.get(METRICS_URL, timeout=5)
    request_count_per_service = {}

    for line in response.text.splitlines():
        if not line or line.startswith("#"):
            continue
        if "traefik_service_requests_total" not in line:
            continue
        if "@swarm" not in line:
            continue

        service = None
        for part in line.split(","):
            if 'service="' in part:
                service = part.split('"')[1]
                break

        if not service:
            continue

        value = float(line.split()[-1])
        request_count_per_service[service] = request_count_per_service.get(service, 0.0) + value

    return request_count_per_service

def get_replicas(service_name):
    service = docker_client.services.get(service_name)
    return service.attrs["Spec"]["Mode"]["Replicated"]["Replicas"]

def scale_service(service_name, desired):
    service = docker_client.services.get(service_name)
    service.scale(desired)
    log(f"Scaled {service_name} → {desired} replicas")

def find_autoscaler_services():
    enabled = []
    for service in docker_client.services.list():
        labels = service.attrs["Spec"].get("Labels", {});
        if labels.get("autoscaler.enabled", "false") == "true":
            enabled.append(service.attrs["Spec"]["Name"])
    return enabled

def get_service_labels(service_name):
    try:
        service = docker_client.services.get(service_name)
        return service.attrs["Spec"].get("Labels", {})
    except Exception:
        return {}

def main():
    log("Autoscaler starting")
    log(f"Metrics  : {METRICS_URL}")
    log(f"Dry run  : {DRY_RUN}")
    log(f"Poll     : {POLL_SECONDS}s")
    log("─────────────────────────────────────────")

    while True:
        try:
            # fetch current request request_counts_per_service from Traefik
            request_counts_per_service = get_request_counts()

            #find services that have autoscaling enables
            services = find_autoscaler_services()

            if not services:
                log("No autoscaler-enabled services found")


            for service_name in services:
                labels = get_service_labels(service_name)

                metric_service = labels.get("autoscaler.metric_service")
                target_rps     = float(labels.get("autoscaler.target_rps_per_replica", "30"))
                max_replicas   = int(labels.get("autoscaler.max_replicas", "10"))
                max_step_up    = int(labels.get("autoscaler.max_step_up", "2"))

                if not metric_service:
                    log(f" {service_name}: missing autoscaler.metric_service label")
                    continue

                if metric_service not in request_counts_per_service:
                    log(f"{service_name}: no metrics found for {metric_service}")
                    continue

                current_time  = time.time()
                curr_request_count = request_counts_per_service[metric_service]

                if metric_service not in last_count:
                    last_count[metric_service] = curr_request_count
                    last_time[metric_service]  = current_time
                    log(f"{service_name}: baseline saved, waiting for next poll")
                    continue

                elapsed = current_time - last_time[metric_service]
                delta   = curr_request_count - last_count[metric_service]
                rps     = max(0.0, delta / elapsed if elapsed > 0 else 0.0)

                last_count[metric_service] = curr_request_count
                last_time[metric_service]  = current_time


                current = get_replicas(service_name)
                desired = math.ceil(rps / target_rps) if rps > 0 else 3
                desired = min(desired, max_replicas)
                desired = min(desired, current + max_step_up)

                log(f"{service_name}: {rps:.2f} req/s | current={current} desired={desired}")


                if desired == current:
                    log(f"↔{service_name}: no scaling needed")
                    continue

                if desired > current:
                    log(f"{service_name}: upscaling required {current} → {desired}")
                else:
                    log(f"{service_name}: downscaling required {current} → {desired}")

                if not DRY_RUN:
                    scale_service(service_name, desired)
                else:
                    log(f"DRY RUN: set as true to scale {service_name} to {desired}")

        except Exception as e:
            log(f" Error: {e}")

        time.sleep(POLL_SECONDS)

if __name__ == "__main__":
    main()