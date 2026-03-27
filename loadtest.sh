#!/bin/bash

URL="http://127.0.0.1/api/greeting"
HOST="myapp.local"
NUM_REQUESTS=50
DURATION=60

echo "Starting load test"
echo "URL          : $URL"
echo "Duration     : ${DURATION}s"
echo "Num Requests : $NUM_REQUESTS"
echo "----------------------------"

END=$((SECONDS + DURATION))

worker() {
    while [ $SECONDS -lt $END ]; do
	 curl -s -o /dev/null -H "Host: $HOST" "$URL"
    done
}

for i in $(seq 1 $NUM_REQUESTS); do
    worker &
done

wait

echo "Load test complete"
