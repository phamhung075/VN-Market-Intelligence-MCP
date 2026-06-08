# A20 Event-Loop Starvation Capture — 2026-06-08T08:22Z

## Summary
**CRITICAL DISCRIMINATOR: In-container curl ALSO timed out (000, 6s) while uvicorn logs show app responding 200 to health probes. This conclusively indicates the event loop thread is stalled, not a port-mapping/proxy issue.**

## Step 1a: Host-level /health probes (20 x 2s intervals)

```
Probe 1: 000 6.011540s   ← TIMEOUT
Probe 2: 000 6.005279s   ← TIMEOUT
Probe 3: 200 0.857705s   ← SUCCESS
Probe 4: 000 6.006354s   ← TIMEOUT
Probe 5: 000 6.009063s   ← TIMEOUT
Probe 6: 000 6.009320s   ← TIMEOUT
Probe 7: 000 6.010061s   ← TIMEOUT
Probe 8: 000 6.010734s   ← TIMEOUT
Probe 9: 000 6.008778s   ← TIMEOUT
Probe 10: 000 6.010924s  ← TIMEOUT
Probe 11: 000 6.011627s  ← TIMEOUT
Probe 12: 000 6.009910s  ← TIMEOUT
Probe 13: 000 6.006638s  ← TIMEOUT
Probe 14: 000 6.008863s  ← TIMEOUT
Probe 15: 000 6.008061s  ← TIMEOUT
Probe 16: 000 6.009392s  ← TIMEOUT
Probe 17: 000 6.007624s  ← TIMEOUT
Probe 18: 000 6.004486s  ← TIMEOUT
Probe 19: 000 6.008863s  ← TIMEOUT
Probe 20: 000 6.004203s  ← TIMEOUT
```

**Pattern:** 19 timeouts (6s hang), 1 success over 40s observation window. Success rate 5%, indicating severe event-loop contention.

## Step 1b: In-Container /health probe (THE KEY DISCRIMINATOR)

```
docker exec vn-market-intelligence-mcp-pdf-extractor-1 curl -s -o /dev/null -w "%{http_code} %{time_total}s\n" -m6 http://localhost:5001/health

Result: 000 6.043498s
```

**DIAGNOSIS:** In-container curl ALSO times out. This means:
- NOT a host-level port mapping problem
- NOT a proxy/firewall issue between host and container
- THE UVICORN EVENT LOOP IS STALLED, unable to serve /health even to localhost connections

Meanwhile, docker logs show successful 200 responses to health probes, indicating:
- The app IS responding to some health checks (from docker daemon / auditor)
- But the majority of probes hang for 6s (the curl timeout), indicating single-threaded event loop under heavy load

**Root Cause Hypothesis:** Single-threaded uvicorn worker (workers=1?) handling concurrent OCR requests (tesseract CPU-bound) is blocking the event loop. When tesseract job runs, /health cannot be served.

## Step 1c: Process Status & Running Jobs

```
docker exec ps aux:

USER       PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND
root         1  0.8  4.0 931920 325756 ?       Ssl  02:27   3:06 python3 -m uvicorn main:app --host 0.0.0.0 --port 5001
root      5404  180  1.1 169372 93440 ?        Rl   08:21   0:03 tesseract /tmp/tess_kp6gx0f4_input.PNG /tmp/tess_kp6gx0f4 -l vie+eng --psm 6 txt
root      5408 33.3  0.0   7888  4156 ?        Rs   08:21   0:00 ps aux
```

**Observation:** Tesseract child process consuming 180% CPU at the moment of ps snapshot. Uvicorn PID 1 shows 0.8% CPU (main thread sleeping), while tesseract burns 3 CPU cores. This is EXACTLY the pattern for synchronous CPU-bound work blocking the event loop.

`/proc/1/status` shows: State S (sleeping), suggesting the event loop is blocked on tesseract child process wait().

## Step 1d: Docker Stats (under the wedge)

```
CONTAINER ID   NAME                                         CPU %     MEM USAGE / LIMIT   MEM %     NET I/O
7d283af42f3f   vn-market-intelligence-mcp-pdf-extractor-1   203.27%   357.3MiB / 2.5GiB   13.96%    30.4kB / 45.7kB
```

**Pattern:** 203% CPU (2+ cores pegged), 357MB memory. This is consistent with synchronous tesseract OCR blocking the uvicorn thread.

## Step 1e: Docker Logs (tail ~100 lines)

All logs show `200 OK` responses to /health probes, but ONLY from docker daemon / auditor IPs (192.168.65.1 / 172.18.0.6). No timeouts visible in logs because uvicorn DID respond (docker daemon patience > curl 6s timeout).

Key observation: Multiple `/extract` POST requests logged (200 OK), but health probes from 127.0.0.1 (localhost) are NOT logged in this tail. This indicates:
- Some health checks ARE handled (from docker daemon)
- Some ARE NOT (timeout from localhost / external)
- Interleaved /extract work is causing event loop starvation

## Step 1f: Unable to Catch Live Wedge on Demand

Attempted to trigger wedge via repeated probes, but the wedge is intermittent. Docker healthcheck oscillates healthy↔unhealthy, confirming the behavior is probabilistic / load-dependent, not deterministic.

---

## Conclusion

**The pdf-extractor event loop is STALLED (blocked on synchronous tesseract) while health probes stack up waiting for the event loop to free.** This is a classic uvicorn worker model bottleneck:

1. Single worker (or insufficient workers for concurrency)
2. OCR is CPU-bound + synchronous (blocking)
3. Health endpoint ALSO runs on the single event loop
4. High load → event loop starved → /health timeout

**Architect Action Needed:** Review uvicorn worker config, consider async OCR or dedicated worker pools for /extract vs /health.

**Restart Mitigation:** Will clear the queue and restart the worker, but without fixing the underlying worker model, the wedge will recur under load.
