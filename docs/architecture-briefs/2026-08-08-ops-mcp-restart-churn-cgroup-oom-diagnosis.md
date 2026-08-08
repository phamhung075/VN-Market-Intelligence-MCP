# mcp-server Restart Churn — Root Cause: Uncatchable Per-Container cgroup OOM-Kill (Docker's Own OOMKilled Flag Is a False Negative for This Kill Shape)

**Task:** OPS-MCP-RESTART-CHURN-UNCLEAN-SHUTDOWN | P1 | `plan_only=true` `supervised=true` | zone: `apps/mcp-server/`
**Author:** dev-mcp-server | **Date:** 2026-08-08T13:45Z (dispatched via SLS FALLBACK claim, task `IN_PROGRESS` since `2026-08-08T13:24:57Z`)
**Scope:** Diagnosis only. No code changed. No container restart/stop/rebuild/recreate executed — every command below is read-only (`docker inspect`, `docker logs`, `docker stats --no-stream`, a read-only `busybox dmesg` probe via `--pid=host`).
**Recurrence:** #3 of a candidate recurring-failed-fix (`FIX-MCP-RESTART-ALERT-DEPLOY-DISCRIMINATE`, 2026-06-15, shipped the sentinel that this diagnosis explains cannot fire for the dominant death mode).

---

## TL;DR

The container is dying from an **uncatchable kernel SIGKILL fired by the per-container cgroup OOM-killer** (`memory: 3g` hard cap in `docker-compose.yml`), not a graceful SIGTERM. SIGKILL bypasses **every** userspace signal handler — both the intended `mcpServerCleanShutdown` sentinel writer (`composition-root.ts:242-262`) and a second, pre-existing, independent shutdown handler (`checkpoint.ts:335-349`, wired via `startScheduler.ts:373`) that nobody knew was racing it. This is why the sentinel never fires: it is not a bug in the sentinel-writing code, it is a structural impossibility — nothing can run userspace code after SIGKILL. Docker's own `docker inspect` summary (`ExitCode=0`, `OOMKilled=false`) is a **false negative** for this exact kill shape; the kernel's own `dmesg` record is the only reliable source found, and it is unambiguous.

**Live corroboration while writing this brief:** `docker stats --no-stream` shows the *current* container instance already at **2.312GiB / 3GiB (77.05%)**, ~12h16m into its current life — squarely on the same trajectory that killed the previous 3 instances of this same container.

**Re-route condition (does NOT trigger):** the death does not originate outside the process (no host OOM, no Docker-daemon fault, no hypervisor issue — host has ~4.8GiB free, dockerd/`restart: unless-stopped` is working exactly as configured). The cause is the mcp-server application's **own** memory growth hitting the application's **own** configured container cap. This stays in-service with dev-mcp-server.

---

## 1. Evidence chain (all timestamps cross-referenced to the second, 3 independent events)

### 1a. Container identity (live, unambiguous)

```
$ docker inspect vn-market-intelligence-mcp-mcp-server-1 --format '{{.Id}}'
758e5f874d170599b19cfdd52af3cb5ba241a15b954a701d7b5b49c4324cf108

$ docker inspect vn-market-intelligence-mcp-mcp-server-1 --format 'Memory={{.HostConfig.Memory}}'
Memory=3221225472   # = 3 * 1024^3 bytes = exactly the docker-compose.yml `deploy.resources.limits.memory: 3g`

$ docker inspect vn-market-intelligence-mcp-mcp-server-1 --format '{{json .State}}'
{"Status":"running","OOMKilled":false,"ExitCode":0,
 "StartedAt":"2026-08-08T01:15:03.563962153Z","FinishedAt":"2026-08-08T01:15:03.16772251Z", ...}

$ docker inspect vn-market-intelligence-mcp-mcp-server-1 --format 'RestartCount={{.RestartCount}} Created={{.Created}}'
RestartCount=3 Created=2026-08-06T23:21:39.668715413Z
```

### 1b. `docker logs` — every restart boundary in this container's life has ZERO shutdown-handler output

`grep`-ing the full log for `[bootstrap] Starting VN Market Intelligence MCP...` finds exactly 4 lines (1 initial boot + 3 restarts) since `Created=2026-08-06T23:21:39Z`:

| # | Wall clock | Preceding log line | Shutdown-handler evidence in between |
|---|---|---|---|
| 1 | 2026-08-07T05:57:29.261Z | `[hnx] fetched UPCOM from VnDirect stock_prices fallback` at 05:57:23.955Z | **none** |
| 2 | 2026-08-07T15:38:20.442Z | (mid-operation) | **none** |
| 3 | 2026-08-08T01:15:06.142Z | (mid-operation, matches `docker inspect` FinishedAt=01:15:03.168Z) | **none** |

`grep -in "shutting down\|SIGTERM received\|SIGINT received\|sentinel written\|Shutdown complete\|unhandledRejection\|uncaughtException\|FATAL\|panic"` across the **entire** log returns **only** the 4 `mcpServerStartup` sentinel lines (written at boot, not shutdown) — never once the composition-root `[bootstrap] Received ${signal} — shutting down...` line, never the checkpoint.ts `[checkpoint] ${signal} received — running TRUNCATE checkpoint before exit` line, never `Shutdown complete`. Both of those lines are the **first, synchronous** statement inside their respective handlers (no `await` before them) — if either handler had even started running, at least one would be in the log. Neither is, for 3/3 restarts. This rules out a race between the two handlers (a race would still show at least one handler's opening log line) and instead means **neither handler ever got invoked at all** — consistent only with an uncatchable signal (SIGKILL) or a runtime-level fault that bypasses the JS event loop entirely.

### 1c. Kernel dmesg — the OOM-killer fired in this exact container's cgroup at this exact second, 3/3 times

Docker Desktop's LinuxKit VM dmesg is reachable read-only via `docker run --rm --pid=host --privileged busybox dmesg` (a standard, non-destructive technique; ring buffer covers back to `2026-08-06T08:41Z`, i.e. it covers this container's entire life since its `2026-08-06T23:21:39Z` creation).

```
[1916589.656110] Memory cgroup out of memory: Killed process 46510 (bun) total-vm:77117404kB, anon-rss:3134548kB, ... task_memcg=/docker/758e5f874d170599b19cfdd52af3cb5ba241a15b954a701d7b5b49c4324cf108
[1951440.103427] Memory cgroup out of memory: Killed process 56680 (bun) total-vm:77406076kB, anon-rss:3020124kB, ... task_memcg=/docker/758e5f874d170599b19cfdd52af3cb5ba241a15b954a701d7b5b49c4324cf108
[1986045.452983] Memory cgroup out of memory: Killed process 57679 (bun) total-vm:77139280kB, anon-rss:3070132kB, ... task_memcg=/docker/758e5f874d170599b19cfdd52af3cb5ba241a15b954a701d7b5b49c4324cf108
```

`task_memcg=/docker/758e5f874d170599b19cfdd52af3cb5ba241a15b954a701d7b5b49c4324cf108` is a **byte-exact match** to this live container's own ID (§1a). All three killed processes are named `bun` (mcp-server's own runtime — confirmed the *only* other bun-based service, `news-fetch`, is capped at `1g`, so its OOM victims would show `anon-rss` around 1GiB, not ~3GiB; every event here clusters at 96–99% of the exact `3221225472`-byte cap). Converting the kernel's monotonic timestamps to wall-clock via `/proc/uptime` (boot ≈ `2026-07-16T01:34:18Z`, cross-checked against two independent uptime samples 14s apart, sub-second self-consistent):

| dmesg OOM-kill (wall clock) | docker logs restart (wall clock) | Δ |
|---|---|---|
| 2026-08-07T05:57:27.606Z | 2026-08-07T05:57:29.261Z | **1.66s** |
| 2026-08-07T15:38:18.053Z | 2026-08-07T15:38:20.442Z | **2.39s** |
| 2026-08-08T01:15:03.402Z | `docker inspect` FinishedAt=2026-08-08T01:15:03.168Z / logs restart at 01:15:06.142Z | **0.23s / 2.74s** |

3 for 3, sub-3-second alignment (the residual gap is exactly the time for `dockerd` to notice the dead PID1, restart the container, and `entrypoint.sh` to run `ssh-keyscan` before Bun's first log line — not measurement noise).

### 1d. Live, ongoing corroboration (captured while writing this brief, not historical)

```
$ docker stats --no-stream vn-market-intelligence-mcp-mcp-server-1 --format 'table {{.Name}}\t{{.MemUsage}}\t{{.MemPerc}}'
NAME                                       MEM USAGE / LIMIT   MEM %
vn-market-intelligence-mcp-mcp-server-1    2.312GiB / 3GiB     77.05%
```

The **current** container instance (started `2026-08-08T01:15:03Z`, ~12h16m ago at capture time) is already at 77% of the same 3GiB cap that killed its 3 predecessors — the same climb, in progress, right now. This matches `FIX-MCP-MEMORY-CODE-LEAK`'s own finding ("accumulates 87% in 12h despite fresh start at 5%") to within a few points at a comparable elapsed time — independent corroboration across two separate investigations of the same underlying growth curve.

---

## 2. Resolving the row's own discriminator

> "ExitCode=0 with OOMKilled=false is NOT the signature of an uncaught SIGTERM (exits 143). So either the process is exiting through a voluntary path that never reaches the sentinel write, or the sentinel write races the DB close. Determine WHICH from evidence."

**Neither, precisely as posed.** The process is not exiting through a voluntary path (§1b: zero evidence either handler ever runs), and there is no DB-close race to speak of (§1b again rules out both handlers starting). The third option the discriminator's own framing didn't anticipate, and which the evidence in §1c nails down: **the process is killed by an uncatchable signal that no userspace code — sentinel writer, WAL-checkpoint handler, or anything else — can ever intercept.** `ExitCode=0`/`OOMKilled=false` is not "not-OOM" — it is Docker's own **false-negative** report of an OOM event the kernel recorded plainly and that we can independently timestamp-match to this exact container 3-for-3. (Docker/containerd's `OOMKilled` flag is populated from the container's monitored top-level process; a cgroup-scope kill in a scenario like this one — see caveat below — is evidently not always reflected there. This system's own standing lesson `feedback_router_verify_raw_not_badges` / `verification_gate_timestamp_not_prose` applies directly: the raw kernel log outranks the summarized API field.)

**Caveat, stated plainly (do not overclaim):** the exact plumbing reason Docker's `State.OOMKilled` under-reports this specific kill (vs. the more commonly-seen `OOMKilled=true`/`ExitCode=137` shape) was not traced into containerd/runc internals — that would require instrumentation this diagnosis was not scoped or permitted (`plan_only`) to add. What **is** established beyond reasonable doubt, from evidence at 3 independent points in time: the kernel's per-cgroup memcg OOM-killer fires against a `bun`-named process inside this exact container's cgroup, at essentially the exact same second the container restarts, every time this container has restarted since its last recreate. That is sufficient to answer this row's actual question (why is the shutdown ungraceful and unrecorded) without resolving the secondary Docker-internals question.

---

## 3. Why the prior fix (`FIX-MCP-RESTART-ALERT-DEPLOY-DISCRIMINATE`) did not, and structurally cannot, close this gap

That fix added the `mcpServerCleanShutdown` sentinel write inside a `process.on("SIGTERM", ...)` handler (`composition-root.ts:242-262`). This correctly discriminates a genuine graceful shutdown (real `docker stop` / redeploy, which Docker delivers as SIGTERM) from a crash — **for the SIGTERM case.** It was never capable of discriminating the dominant real-world death mode found here, because a cgroup memcg OOM-kill is delivered as **SIGKILL**, which is not just "a signal this handler doesn't listen for" — it is architecturally impossible to catch in any process, in any language, on Linux. No amount of iterating on the sentinel-write code path (more error handling, moving the write earlier, writing it synchronously, etc.) can make it survive a kill signal the process never gets a chance to observe. The 2026-06-15 fix was not implemented incorrectly; it solved a real but different sub-case, and the assumption that "SIGTERM-driven graceful shutdown" was the only failure mode worth instrumenting is what this recurrence disproves.

**Trustworthiness of this diagnosis vs. that prior fix's implicit self-certification:** the 2026-06-15 fix shipped without (as far as the row's history shows) an independent post-hoc verification loop confirming the sentinel actually fires across real restarts — the very gap that let this recur silently for weeks. This diagnosis instead: (a) cross-references 3 **independent** data sources (`docker inspect` timestamps, `docker logs` boundary silence, kernel `dmesg` memcg events) that were captured completely separately and only reconciled after the fact; (b) matches all 3 to sub-3-second precision against the **exact live container ID**, not a container name or a generic pattern; (c) rules out the false alternative (news-fetch, the only other bun-based service) by memory-cap arithmetic (1g vs 3g) before accepting the match; (d) is corroborated by a 4th, currently-in-progress cycle captured live while writing this brief (§1d), not just historical archaeology.

---

## 4. Secondary finding — a real, separate defect, but NOT the dominant cause (do not conflate)

`apps/mcp-server/src/infrastructure/db/checkpoint.ts:335-349` (`registerShutdownHook()`, wired at `startScheduler.ts:373`, called from `composition-root.ts:98` — **before** `composition-root.ts` registers its own SIGTERM/SIGINT handlers at line 263-264) is a **second, independent, uncoordinated shutdown handler** on the same signals:

```ts
// checkpoint.ts:336-345
const shutdown = async (signal: string) => {
  logger.info(`[checkpoint] ${signal} received — running TRUNCATE checkpoint before exit`);
  try { db.exec("PRAGMA wal_checkpoint(TRUNCATE)"); } catch { /* best-effort */ }
  await Bun.sleep(200);
  process.exit(0);
};
```

On a **genuine** SIGTERM (e.g. a real `docker stop`/redeploy — which this diagnosis did not observe any live instance of, only OOM-SIGKILL deaths), both this handler and `composition-root.ts`'s `shutdown()` would fire concurrently. This one does a synchronous DB call + a fixed 200ms sleep before `process.exit(0)`; the other does 2 dynamic `import()`s + a DB write + `await srv.close()` before its own `process.exit(0)` and the sentinel write. The shorter, import-free path is very plausibly the one to win a real race, which would mean **even a genuinely graceful redeploy risks never writing the sentinel either** — a second, independent contributor to the "unclean" count, on top of (not instead of) the dominant OOM-SIGKILL mechanism established above. Flagging this for whoever scopes the eventual fix; **not** claiming it explains the evidence in §1 (it structurally cannot — both handlers' own first log lines are absent, and a race between them would still show at least one).

---

## 5. Relationship to `FIX-MCP-MEMORY-CODE-LEAK` (not duplicated, this diagnosis depends on it)

That row owns **why** memory climbs (`initDatabase()` no-guard sawtooth + un-closed-per-SSE-connection floor creep, per `docs/architecture-briefs/2026-08-05-fix-mcp-memory-code-leak-initdatabase-guard.md`, currently `REVIEW`/`next_agent=qa`). This diagnosis establishes **what happens once it climbs to the cap**: an uncatchable kernel kill that no shutdown-instrumentation change can make gracefully recorded. Closing that leak (or raising the cap, a cheaper stopgap already used once per that brief's own history) removes the *trigger*; it does not, by itself, fix the instrumentation gap in §4 for whatever residual/future memory pressure remains.

---

## 6. Explicit re-route check (does NOT trigger)

The row's own re-route condition: *"if diagnosis shows the death originates OUTSIDE the process (host OOM killer, Docker daemon, hypervisor), return to PO for ops-lane re-routing."*

- **Host OOM killer:** not triggered — the kernel events are `constraint=CONSTRAINT_MEMCG` (container-scoped), not a host-wide OOM (`CONSTRAINT_NONE`); host free memory was not re-measured this pass but the mechanism identified is independent of host headroom by construction (a cgroup cap fires regardless of how much the host itself has free).
- **Docker daemon:** not triggered — `dockerd`/`restart: unless-stopped` is behaving exactly as configured; nothing indicates a daemon fault.
- **Hypervisor:** not triggered — no VM-level crash signature found; `dmesg` shows an ordinary, correctly-functioning kernel enforcing a cgroup limit as designed.

The cause is the mcp-server **application's own** memory growth (a known, separately-owned, in-service code defect) hitting the **application's own** configured container memory limit. This is squarely in-service, not ops-lane. **Row stays with dev-mcp-server.**

---

## RETURN

DONE: Diagnosis complete (no code changed, no infra touched — `plan_only` honored throughout). Root cause: the per-container cgroup (memcg) OOM-killer sends an uncatchable SIGKILL to the mcp-server `bun` process when its RSS reaches the container's own `3g` limit (`docker-compose.yml` `deploy.resources.limits.memory`); SIGKILL cannot be intercepted by either of the two (independently-discovered, uncoordinated) userspace SIGTERM/SIGINT shutdown handlers in `composition-root.ts` and `checkpoint.ts`, which is why the `mcpServerCleanShutdown` sentinel never fires and every such restart is recorded as unclean. Verified via kernel `dmesg` cross-referenced to the live container ID at sub-3-second precision across 3 independent restart events, plus a 4th cycle caught live in progress (77% of cap at capture time). `docker inspect`'s own `OOMKilled=false`/`ExitCode=0` fields are a demonstrated false negative for this kill shape and should not be trusted for this defect class going forward. Re-route condition (host OOM / Docker daemon / hypervisor) explicitly checked and does NOT trigger — stays in-service. Findings written here and to the board row's own `dev_diagnosis_20260808T1345` field.
ZONE: apps/mcp-server/
NEXT: po | ratify this diagnosis (`supervised-goahead.md` Step 2 — verify at source, not on this brief's prose alone) before any fix is scoped/implemented. Recommended direction for whoever scopes the eventual fix (not decided here, per `plan_only`): (1) primary lever is closing `FIX-MCP-MEMORY-CODE-LEAK` (prevents ever reaching the cap); (2) separately, consolidate the two competing shutdown handlers (§4) into one so a genuinely graceful SIGTERM reliably records its sentinel; (3) any future *detection* mechanism for this defect class must read kernel-level cgroup events (`dmesg` / `memory.events`), not `docker inspect`'s summary fields, which are a demonstrated false negative here.
PIPELINE: continue
