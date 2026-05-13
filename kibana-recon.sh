#!/bin/bash
# kibana-recon.sh — Probe Kibana + ES for data views, data streams,
# metric fields, and log fields to inform dashboard generation.
#
# Expects: KIBANA_URL, KIBANA_USER, KIBANA_PASS (env vars)
# Defaults work for the local Swarm setup.

set -euo pipefail

KIBANA_URL="${KIBANA_URL:-http://kibana.myapp.com}"
KIBANA_USER="${KIBANA_USER:-elastic}"
KIBANA_PASS="${KIBANA_PASS:-changeme}"
AUTH="${KIBANA_USER}:${KIBANA_PASS}"

KB="curl -s -u ${AUTH} -H kbn-xsrf:true -H x-elastic-internal-origin:kibana"

hr() { echo; echo "════════════════════════════════════════════════════════════"; }

###############################################################################
# 1. Data views matching traces-apm*, logs-*, metrics-*
###############################################################################
hr
echo "1 ▸ DATA VIEWS (traces-apm*, logs-*, metrics-*)"
hr

$KB "${KIBANA_URL}/api/data_views" 2>/dev/null | python3 -c "
import sys, json, re
data = json.load(sys.stdin)
views = data.get('data_view', [])
pats = ['traces-apm', 'logs-', 'metrics-']
matched = [v for v in views if any(p in (v.get('title','') or '') for p in pats)]
if not matched:
    print('  (none found — dashboard will need data views created)')
else:
    for v in sorted(matched, key=lambda x: x.get('title','')):
        print(f\"  id={v['id']}  title={v.get('title','?')}  type={v.get('type','?')}\")
print(f'  Total data views: {len(views)}, matched: {len(matched)}')
"

###############################################################################
# 2. Data streams matching logs-* and metrics-*
###############################################################################
hr
echo "2 ▸ DATA STREAMS"
hr

for PAT in "logs-*" "metrics-*"; do
  echo "  ── ${PAT} ──"
  ENCODED_PAT=$(python3 -c "import urllib.parse; print(urllib.parse.quote('${PAT}'))")
  $KB "${KIBANA_URL}/api/console/proxy?path=_data_stream/${ENCODED_PAT}&method=GET" \
    -H 'Content-Type: application/json' 2>/dev/null | python3 -c "
import sys, json
data = json.load(sys.stdin)
streams = data.get('data_streams', [])
if not streams:
    print('    (none)')
else:
    for ds in sorted(streams, key=lambda x: x.get('name','')):
        indices = ds.get('indices', [])
        store_kb = ds.get('store_size_bytes', 0) / 1024
        print(f\"    {ds['name']}  backing_indices={len(indices)}  store={store_kb:.0f}KB\")
print(f'    Total: {len(streams)}')
"
done

###############################################################################
# 3. Field-presence probe on metrics-* (last 1 hour)
###############################################################################
hr
echo "3 ▸ METRIC FIELD PRESENCE (metrics-*, last 1 hour)"
hr

METRIC_FIELDS=(
  "docker.cpu.total.pct"
  "container.cpu.usage.total.pct"
  "docker.memory.usage.pct"
  "container.memory.usage.total"
  "system.load.1"
  "system.cpu.total.norm.pct"
  "host.cpu.usage"
  "process.cpu.pct"
  "jvm.memory.heap.used"
  "jvm.gc.time"
)

AGGS=""
for f in "${METRIC_FIELDS[@]}"; do
  SAFE=$(echo "$f" | tr '.' '_')
  AGGS="${AGGS}\"${SAFE}\":{\"filter\":{\"exists\":{\"field\":\"${f}\"}}},"
done
AGGS="${AGGS%,}"  # strip trailing comma

QUERY="{\"size\":0,\"query\":{\"range\":{\"@timestamp\":{\"gte\":\"now-1h\"}}},\"aggs\":{${AGGS}}}"

$KB "${KIBANA_URL}/api/console/proxy?path=metrics-*/_search&method=POST" \
  -H 'Content-Type: application/json' \
  -d "${QUERY}" 2>/dev/null | python3 -c "
import sys, json
data = json.load(sys.stdin)
total = data.get('hits',{}).get('total',{}).get('value',0)
print(f'  Total docs in last 1h: {total}')
aggs = data.get('aggregations', {})
for key in sorted(aggs.keys()):
    count = aggs[key].get('doc_count', 0)
    field = key.replace('_', '.')
    status = '✅' if count > 0 else '❌'
    print(f'  {status} {field:45s} count={count}')
"

###############################################################################
# 4. Sample log doc from logs-* (one hit, check ECS fields)
###############################################################################
hr
echo "4 ▸ SAMPLE LOG DOC (logs-*, 1 hit)"
hr

LOG_QUERY='{"size":1,"sort":[{"@timestamp":"desc"}],"_source":["@timestamp","service.name","trace.id","transaction.id","log.level","message","host.name","container.id","severity_text","Body"]}'

$KB "${KIBANA_URL}/api/console/proxy?path=logs-*/_search&method=POST" \
  -H 'Content-Type: application/json' \
  -d "${LOG_QUERY}" 2>/dev/null | python3 -c "
import sys, json

def get_nested(d, path):
    parts = path.split('.')
    for p in parts:
        if isinstance(d, dict):
            d = d.get(p)
        else:
            return None
    return d

data = json.load(sys.stdin)
total = data.get('hits',{}).get('total',{}).get('value',0)
print(f'  Total log docs: {total}')

hits = data.get('hits',{}).get('hits',[])
if not hits:
    print('  (no log documents found)')
else:
    doc = hits[0].get('_source', {})
    fields = ['@timestamp','service.name','trace.id','transaction.id',
              'log.level','message','host.name','container.id',
              'severity_text','Body']
    print('  Field presence:')
    for f in fields:
        val = get_nested(doc, f)
        status = '✅' if val is not None else '❌'
        preview = str(val)[:80] if val is not None else ''
        print(f'    {status} {f:25s} {preview}')
"

hr
echo "Recon complete."
