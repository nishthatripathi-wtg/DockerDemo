#!/bin/bash
# monitor-splunk.sh — Continuously monitor Splunk health, memory, and OOM status.
# Checks every 30s. Outputs only on state changes or warnings.

INTERVAL=30
LAST_STATE="unknown"
MEM_WARN_PCT=80

while true; do
  CID=$(docker ps -q --filter name=splunk_splunk | head -1)
  
  if [ -z "$CID" ]; then
    if [ "$LAST_STATE" != "down" ]; then
      echo "[$(date '+%H:%M:%S')] ❌ SPLUNK IS DOWN — container not found"
      LAST_STATE="down"
    fi
    sleep "$INTERVAL"
    continue
  fi

  # Check OOM
  OOM=$(docker inspect --format '{{.State.OOMKilled}}' "$CID" 2>/dev/null)
  if [ "$OOM" = "true" ]; then
    echo "[$(date '+%H:%M:%S')] ❌ SPLUNK OOM-KILLED"
    LAST_STATE="oom"
    sleep "$INTERVAL"
    continue
  fi

  # Check running state
  STATE=$(docker inspect --format '{{.State.Status}}' "$CID" 2>/dev/null)
  if [ "$STATE" != "running" ]; then
    if [ "$LAST_STATE" != "$STATE" ]; then
      echo "[$(date '+%H:%M:%S')] ⚠  Splunk state: $STATE"
      LAST_STATE="$STATE"
    fi
    sleep "$INTERVAL"
    continue
  fi

  # Check memory
  MEM_LINE=$(docker stats --no-stream --format '{{.MemUsage}} {{.MemPerc}}' "$CID" 2>/dev/null)
  MEM_PCT=$(echo "$MEM_LINE" | awk '{gsub(/%/,"",$NF); print $NF}')
  MEM_USAGE=$(echo "$MEM_LINE" | awk '{print $1}')

  # Report state changes or high memory
  if [ "$LAST_STATE" != "healthy" ]; then
    echo "[$(date '+%H:%M:%S')] ✅ Splunk healthy — mem: $MEM_USAGE ($MEM_PCT%)"
    LAST_STATE="healthy"
  fi

  # Warn if memory > threshold
  MEM_INT=$(echo "$MEM_PCT" | cut -d. -f1)
  if [ -n "$MEM_INT" ] && [ "$MEM_INT" -ge "$MEM_WARN_PCT" ] 2>/dev/null; then
    echo "[$(date '+%H:%M:%S')] ⚠  HIGH MEMORY: $MEM_USAGE ($MEM_PCT%)"
  fi

  sleep "$INTERVAL"
done
