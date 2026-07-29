# api-gateway /health Latency (CURL_ERR flap) — Remediation Design

**Task:** SPIKE-DASHBOARD-TIER-HEALTH-CURL-ERR-FLAP (`docs/data/orch/orch-state.json` → `task_board`, plan_only+supervised, dispatched straight to architect by router 2026-07-29 per `po_root_cause_20260729T0848`)
**Author:** architect | **Date:** 2026-07-29T09:07Z
**Scope:** Design only. No app code, no `docker-compose.yml`/container edit, no restart/rebuild/deploy (all user-gated / ops-executed per policy). Read-only source inspection this cycle.
**Children minted this cycle:** `FIX-AUDITOR-A12-PROBE-TIMEOUT-EXITCODE-DEBOUNCE` (detection, zone `cross-service/`, next_agent=developer), `FIX-APIGW-HEALTH-CAPABILITY-PROBE-GATE-PARALLEL-SINGLEFLIGHT` (product, zone `apps/api-gateway/`, next_agent=dev-api-gateway).

---

## 0. Disposition of po's root cause — CONFIRMED, one mechanism refined

`po_root_cause_20260729T0848` (this row) correctly identifies: a genuine, worsening (1.424s→3.483s, 2.4x/4d) latency cost in api-gateway's own `/health` response, colliding with the auditor's 3000ms client budget (`probe.sh:48`) and the gateway's own 3000ms per-probe timeout (`capability_prober.go:62`) — a true positive that mislabels its own cause as `CURL_ERR`/"unreachable". That diagnosis stands; do not re-litigate it. **Correction (see §6a addendum): this cost is SUSTAINED/continuous, not an occasional transient — router's 09:05-09:12Z re-measurement (23 samples, no recovery window, 26% over-budget) supersedes the earlier 4-sample reading and rules out any fix premised on rarity.**

**Refinement (this cycle, source-verified) to the mechanism, load-bearing for the fix design:**

Po's text describes `ProbeAll`'s sequential loop as fanning out over "nine downstreams" — the natural reading is "the 9 real proxied services, each paying a full serial round-trip." Reading the surrounding code shows this is not what happens, and the correction changes which fix is cheapest and safest:

- The **9-downstream deployed-service health fan-out** (`AggregateHealthService.Aggregate`, `apps/api-gateway/pkg/domain/services.go:76-87`) is **already parallel** — `sync.WaitGroup` + one goroutine per service, each bounded by `svc.TimeoutMs` (`defaultTimeoutMs=2000`, `registry.go:6`). This is NOT the sequential bottleneck po's prose implies, and does not need parallelizing.
- The genuinely **sequential** loop is a *separate* branch: `CapabilityProber.ProbeAll` (`capability_prober.go:108-110`), which runs **after** `wg.Wait()` (`services.go:113`) and iterates the **capability manifest** in `system-map.json` — 9 entries, 8 with `probe_type != "none"` (`mcp, macro, stock, kinh-dich, alert, news, ta, pdf`; `rag` is `probe_type:"none"`, static, free) — verified via `jq '.project.infrastructure.docker.host_runtime_set.capability_manifest'`. Worst case is **8 × 3000ms ≈ 24s**, not "nine downstreams", and it runs strictly after the parallel block, so **total /health latency = parallel-fanout-time + this-sequential-time**. This precisely explains the observed 2163-3483ms window (fast parallel block + 1-2 expired manifest entries paying their timeout serially) without needing to assume all 8-9 are slow simultaneously.
- **The critical finding po's note does not surface:** in the CURRENT deployment, `NOT_DEPLOYED_SERVICES=` is **empty** (`docker-compose.yml:306`, confirmed live). `CapabilityProber` is constructed with **no knowledge of the not-deployed set at all** — `main.go:54`: `infrastructure.NewCapabilityProber(mcpURL, systemMapPath)`, no `notDeployed` argument, even though `notDeployed` is already computed one line earlier at `main.go:45` and passed to the registry. `ProbeAll` therefore probes **all 8** manifest entries on every cache miss regardless of deployment status, and `AggregateHealthService.Aggregate` (`services.go:120`) then **discards** every result whose key is not in `notDeployedSet` — which today is *all of them*. **The entire sequential branch's output is unconditionally thrown away in production.** Several of those probes are live `POST /mcp` `tools/call` JSON-RPC requests to mcp-server (`capability_probe.go:68-130`, `probeMcpTool` — `get_macro_snapshot`, `get_market_snapshot`, `get_portfolio_conviction`, `get_alerts`, `get_agent_signals`, `get_technical_indicators`, `get_financial_summary`), not passive pings.
- This is not a missed optimization — it is a **documented-but-unimplemented contract**. `domain/ports.go:22-24`, the `CapabilityProberPort` interface the concrete prober is supposed to satisfy, literally says: *"probes the mcp-server for the live capability status of **not-deployed services** ... bounded to 7 (one per not_deployed short_key)."* The concrete adapter never reads the not-deployed set to enforce that. (Aside: the port comment and `TestCapabilityProber_SevenProbeCap` both say "7"; the live manifest currently has 8 probe-active entries — a second, smaller doc/test-vs-manifest drift, noted for Half B but not the primary fix.)

**CONTRACT-CONTRADICTION (narrow, on this one claim):** "ProbeAll fans out over nine downstreams and needs parallelizing as necessary work" is contradicted by the source — the 9-way fan-out is already parallel and unrelated; the sequential branch is bounded to ≤8 manifest entries and, under the live `NOT_DEPLOYED_SERVICES=` config, is 100% wasted computation, not necessary work. Everything else in `po_root_cause_20260729T0848` (the two 3000ms constants colliding, the TTL-boundary stampede signature, the severity trend, the "unreachable" mislabel across 8/14 rows) is confirmed as stated and is the basis for Half A below.

---

## 1. Q1 — product, detection, or both?

**Both — asymmetric, and neither alone closes the loop.**

- **Product-side (Half B) is the dominant lever and, on the current deployment, eliminates nearly all of the measured latency**: gating `ProbeAll` on the actual not-deployed set (honoring the port's own documented contract) drops the sequential branch from ≤8×3000ms to 0×3000ms *today*, because `NOT_DEPLOYED_SERVICES` is empty. This is the single highest-leverage, lowest-risk change available — it makes zero observable output change (the anti-false-green filter already discarded these results) while removing essentially all of the wasted work, including live `tools/call` POSTs to mcp-server that serve no purpose today.
- **Detection-side (Half A) is independently necessary, not a fallback**: (a) it fixes a defect that exists regardless of api-gateway's health — a bare 3000ms whole-request budget with `|| http_code="CURL_ERR"` collapses timeout, connection-refused, and DNS failure into one token, on **four services**, not just api-gateway; (b) the "unreachable" gloss appears in 8/14 historical A-12-labeled rows — a standing template phrase, not a measured claim, per po's own finding; (c) Half B still leaves a nonzero floor cost for the day `NOT_DEPLOYED_SERVICES` is genuinely populated (the intended use case the port was built for) — the detector must not regress to conflating that legitimate, bounded cost with an outage either; (d) a product fix requires a Go change + test + rebuild + deploy (ops-executed, not autonomous per policy) — until it ships, the detector should at minimum stop mislabeling the transient it is already correctly detecting.
- **Product-only is insufficient** because it does nothing about the mislabeling defect on the other 3 services sharing this template, and does nothing about debounce/churn if a *different* transient (unrelated to capability-probing) ever brushes the 3000ms line again.
- **Detection-only is insufficient** and would be the wrong closure for this row — per `feedback_router_blames_detector_when_actuator_or_policy_is_at_fault` and the row's own text, this is exactly the shape where the detector is not the whole defect: raising the budget or improving the label does not stop api-gateway from doing pointless serial network I/O (including live tool-invocations) on every cold `/health` request.

## 2. Q2 — should `/health` perform capability probing at all?

**No.** Liveness and capability/readiness are different concerns with different consumers, different acceptable latency, and different cache discipline; they should not share one route or one deadline.

The seam for this **already exists and is half-built**: `router.go:21` registers `GET /healthz` with the comment `// AC-11: k8s liveness alias` — i.e. the codebase already names the K8s liveness/readiness distinction — but wires it to the exact same handler as `/health` (`router.go:20-21`, both → `HandleHealth` → `aggregateUC.Execute` → the full parallel-fanout-plus-capability-probe path). It is an alias in name only.

**Design (Half B):**
- `GET /healthz` becomes a genuine liveness check: process-up, no downstream fan-out, no capability probing, sub-100ms, independent of every other service's state. New handler (`HandleLiveness`), reusing the existing route registration — no new route needs to be minted (architect constraint: never propose a duplicate interface when an existing one covers the need — `/healthz` already is that interface, just misimplemented).
- `GET /health` (and `/health-dashboard`, which already calls the same use case at `handlers.go:76`) keeps the current full aggregate — unaffected in shape, faster once Half B item B1 lands, for consumers that want the rich payload (the dashboard).
- **Consumer repoint (sequenced, not immediate):** once `/healthz` is truly decoupled, docker's own `HEALTHCHECK` (`docker-compose.yml:293-301`, `wget ... http://localhost:4000/health`) and the auditor's A-12 probe (`probe.sh:48`, `api-gateway:4000:/health`) should both repoint to `/healthz`. Do this only *after* `/healthz` stops being a pure alias — repointing today would be a no-op. `docker-compose.yml` is an infra/ops-owned file (container definition, requires rebuild+deploy); flag this sub-item to ops in Half B's own row rather than editing it here.

## 3. Q3 — what must the emitted summary carry instead of `CURL_ERR`?

Capture curl's own exit code before the `||` fallback erases it, and classify it — never collapse to one token:

```bash
curl_exit=0
http_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 3 "$url" 2>/dev/null) || curl_exit=$?
if [ "$curl_exit" -ne 0 ]; then
  case "$curl_exit" in
    28) reason="CLIENT_TIMEOUT" ;;   # exceeded --max-time — a latency fact, not an outage
    7)  reason="CONN_REFUSED"  ;;    # nothing listening / port closed
    6)  reason="DNS_FAIL"      ;;
    52) reason="EMPTY_REPLY"   ;;
    *)  reason="CURL_ERR_${curl_exit}" ;;
  esac
  echo "[health] ${svc}:${port}${path} FAIL (${reason}, curl_exit=${curl_exit}, budget=3000ms)"
fi
```

The downstream signal summary (`emit-audit-signal.sh` call site) must render the observed fact, e.g. `"A-12 FAIL: api-gateway:4000/health client timeout after 3000ms (curl exit 28)"`, never `"unreachable"` for a timeout — `"unreachable"` is only correct for `CONN_REFUSED`/`DNS_FAIL`. This is po's Half A item A4, made concrete. Applies wherever this pattern is duplicated (`probe.sh` A-12; A-04/A-13's own emitting script — **provenance unresolved**, see §5 below).

## 4. Q4 — does 60s `probeTTL` vs `*/30 min` auditor cadence guarantee a cold cache?

**Yes, structurally, by construction — confirmed from source, not inferred.**

- Tier-1 auditor cron: `*/30 * * * *` (`docs/agents/system-auditor/flow/main.md` Step 0d, `AUDIT_TIER==1` branch: "boundary minutes: :00, :30") = 1800s between ticks.
- `probeTTL`: 60s (`capability_prober.go:61`).
- 1800s / 60s = 30x. Every manifest entry's cache is guaranteed expired between any two consecutive Tier-1 ticks — the auditor can **never** observe a warm capability-probe cache. Every Tier-1 tick pays the branch's full cold cost (today: ≤8×3000ms of wasted work per §0; post-Half-B: bounded by however many keys are actually in `notDeployedSet`, parallel + single-flight).
- Contrast: docker's own `HEALTHCHECK interval: 30s` (`docker-compose.yml:298`) is close to the 60s TTL — on average only ~1 entry is expired per docker poll, keeping added latency small and under its `timeout: 10s`, which is why docker health has never flapped (`FailingStreak=0`, confirmed) while the 30-minutely auditor and any similarly-infrequent poller (e.g. the dashboard) reliably hit the worst case.
- This is why the row accumulated 13 occurrences specifically on the auditor's cadence and never on docker's: it is not bad luck, it is a scheduled certainty. Half B's fixes (gate + parallelize + single-flight) remove the *cost* of a cold hit; they do not and should not try to change the cadence/TTL relationship itself — that ratio is fine once the branch's cost floor is near-zero.

---

## 5. Half A — detection (`docs/agents/system-auditor/`, zone `cross-service/`)

Row: `FIX-AUDITOR-A12-PROBE-TIMEOUT-EXITCODE-DEBOUNCE` (minted this cycle, backlog, next_agent=developer).

- **A1** `probe.sh:48` — raise `--max-time` above the realistic cold-fan-out cost *or* repoint at the new `/healthz` liveness route once Half B ships (see §2) — prefer the repoint (cheap, addresses root cause) over just raising the number (masks it). Land both: raise the timeout modestly now (cheap, immediate) as a floor; switch the target once `/healthz` exists.
- **A2** Capture curl's real exit code per §3 — stop collapsing every failure mode to `CURL_ERR`.
- **A3** Wire the N-consecutive debounce from the DONE wrapper's scope item 2 (`FIX-AUDITOR-A12A20A30-FP-REEMIT-CONVERGE`, deferred explicitly) — but only alongside A1/A2, never alone (a debounce alone would silence a real, worsening latency regression, per the DONE wrapper's own brief already warning against exactly this).
- **A4** Fix the emitted summary wording (§3) everywhere the "unreachable" gloss is templated — audit all 8/14 historical A-12 rows' phrasing source, not just the current cycle's string.
- **A5 (documentation-hygiene gap, unresolved — hand to whoever picks this up):** the SPIKE's own title cites "api-gateway:4000 (A-04/A-13)" but no live file under `docs/agents/system-auditor/` or `scripts/` defines a check-id `"A-04"` (repo-wide grep, live tree only, returned zero hits outside one archived handoff doc). The one *confirmed* live signal (`sys-20260729T083834-4dd9`) is explicitly labeled `"A-12 FAIL: api-gateway health check unreachable"` — i.e. A-12, not A-04/A-13, is the confirmed api-gateway check-id in the current numbering. Before applying A1/A2/A4 anywhere but `probe.sh`, confirm whether A-04/A-13 are a live Tier-2/3 check against the same route (needing the identical fix) or a stale label from earlier SPIKE drafting — do not assume either without grepping the current tier-2/3 flow docs first.

**Cross-row interaction:** A1's repoint sub-item is soft-blocked on Half B's `/healthz` decoupling landing first — everything else in Half A (A2-A4) is independent and can land immediately.

## 6. Half B — product (`apps/api-gateway/`, zone `apps/api-gateway/`, specialist `dev-api-gateway`)

Row: `FIX-APIGW-HEALTH-CAPABILITY-PROBE-GATE-PARALLEL-SINGLEFLIGHT` (minted this cycle, backlog, next_agent=dev-api-gateway, supervised — this changes the code path that defines container health for docker's own `HEALTHCHECK`).

**DDD layer:** all of B1-B3 are infrastructure-layer changes to the existing `CapabilityProber` adapter (`apps/api-gateway/pkg/infrastructure/capability_prober.go` + `capability_manifest.go`) implementing the existing `domain.CapabilityProberPort` — no domain or port signature change required (see B1 note). B4 is an interface-layer addition (`pkg/interface/http/`).

- **B1 — gate `ProbeAll` on the actual not-deployed set (do this first; single highest-leverage item).** Thread the `notDeployed []string` already computed at `main.go:45` into `NewCapabilityProber` (extra constructor arg, stored as a field — do **not** change the `CapabilityProberPort.ProbeAll(ctx) map[string]*ServiceCapability` signature; this stays a pure infrastructure-internal change, so `AggregateHealthService`, its tests, and every existing mock/call site are untouched). Inside `capabilityFor`, if `shortKey` is not in the not-deployed set, return the manifest baseline immediately — same shape as the existing `entry.ProbeType == "none"` branch — without touching the cache or calling `runProbe`. This makes the adapter actually satisfy `domain/ports.go:22-24`'s documented contract instead of silently ignoring it. Net effect on the live deployment (`NOT_DEPLOYED_SERVICES=` empty): the sequential branch's cost goes from ≤8×3000ms to 0.
- **B2 — parallelize the (now much smaller) remaining fan-out.** For whatever subset is actually in `notDeployedSet` at any given time, probe them concurrently under **one** overall deadline (mirror the existing goroutine+`WaitGroup` pattern already proven in `services.go:76-87`, do not re-derive a new concurrency primitive) rather than the current one-at-a-time loop. Defense-in-depth for the day `NOT_DEPLOYED_SERVICES` is genuinely populated with more than one entry.
- **B3 — single-flight `capabilityFor` on cache miss.** Three independent pollers (docker `HEALTHCHECK`, the auditor, the frontend dashboard) can race the same 60s TTL boundary; without single-flight each concurrent miss pays its own full probe cost (the exact stampede signature in the two corroboration timestamps — `1.424s then 5×~0.006s`, `2382→2163→2713→3483ms` in tightening pairs). Use a per-key in-flight guard (e.g. `golang.org/x/sync/singleflight`, or a manual `map[string]*sync.Once`-style guard under the existing `p.mu`) so concurrent misses for the same `shortKey` share one upstream probe.
- **B4 — decouple liveness (§2).** New `HandleLiveness` in `pkg/interface/http/handlers.go`, rewire `router.go:21`'s `/healthz` registration to it. No fan-out, no capability probing, sub-100ms, independent of downstream state.
- **B5 (minor, doc-hygiene, bundle with B1):** `domain/ports.go:23-24` and `TestCapabilityProber_SevenProbeCap`'s name/assertion say "7"; the live manifest currently has 8 probe-active entries (`mcp` was likely added after that comment/test was written). Once B1 makes the not-deployed-set the real bound, update the comment to describe the *actual* invariant ("bounded to `len(notDeployedSet)`, not a fixed manifest count") instead of a stale literal number.

**Test strategy (bun/Go test, mirrors existing `capability_prober_test.go` style):**
- New: `ProbeAll` fires **zero** probes when `notDeployedSet` is empty, regardless of manifest size (directly encodes the root cause — the single highest-value regression test here).
- New: `ProbeAll` fires exactly `len(notDeployedSet)` probes when non-empty, not `len(manifest)`.
- New: concurrent `capabilityFor` calls for the same expired key trigger exactly 1 upstream probe (single-flight), mirroring the existing `TestCapabilityProber_CacheTTL`/`CacheExpiry` fixtures.
- New: `HandleLiveness` returns fast (<100ms, asserted via test deadline) even when the capability-probe branch is deliberately made slow/blocked in the test double.
- Unchanged, must still pass: `TestAggregateHealthService_DeployedDownNotRescuedByCapability` (anti-false-green invariant — B1-B3 must not touch it) and all existing `capability_prober_test.go` cases.

**BUILD-STANDARD:** BUG-FIX/REFACTOR, in-zone, no new primitives → not-applicable (both halves).

---

## 6a. ADDENDUM 2026-07-29T09:15Z — router re-measurement: sustained, not transient

Router supplied a fresh, denser raw sample from api-gateway's own access log (23 `/health` requests, 2026-07-29T09:05:00Z-09:12:00Z, all HTTP 200): latencies ranged 4ms-3780ms with **no recovery window** — roughly every ~30s poll pair pays hundreds of ms to multiple seconds, and **6 of 23 samples (26%) exceed the auditor's 3000ms budget** (3731/3004/3005/3400/3780/3548ms). Worst sample climbed 3483ms (08:35Z) → 3780ms (09:10Z) **same day, 35 minutes apart** — the degrading trend from §0/po's note is continuing in real time, not a one-off.

**Correction to this brief's own wording:** §1 and §0 above describe the observed cost as a "latency transient" (echoing po's framing). The fresh sample shows this is **wrong on the word "transient"** — it is a **sustained, continuous condition**, not an occasional blip. This does not change any design decision already made (Half A + Half B, the notDeployedSet gate, the liveness/readiness split) — it removes the option, if anyone were tempted, to treat this as rare-enough-to-retry-around. A retry, a widened client budget alone, or an alert dedupe would leave a permanently degraded endpoint in place and just stop anyone from being told about it.

**Two further points the denser sample makes directly observable rather than inferred:**
- `09:08:13.778→2657ms` immediately followed by `09:08:13.779→39ms` (~1ms apart, ~68x spread), and separately `09:08:48.017→4ms` — the cache-cold/cache-warm boundary is visible in situ, not just reconstructed from two samples 30 minutes apart.
- `09:05:30.963→1082ms` and `09:05:31.223→2047ms` — **260ms apart, both slow** — two concurrent callers each paying the full serial-fanout cost independently. This is direct evidence (not inference) that no single-flight exists on the miss path, strengthening B3's priority — treat B3 as co-equal with B1, not a lesser defense-in-depth item.

**Q4 re-confirmed, now with corroborating (not just structural) evidence:** the 26%-of-samples-over-budget figure in a normal ~7-minute window is consistent with, and does not contradict, the source-level finding in §4 (30x TTL/cadence mismatch structurally guarantees a cold Tier-1 tick). The router's request to "verify" §4 is satisfied by the code-level argument (unchanged); this sample adds field corroboration on top of it.

**One line to add to the brief's framing (router's own phrase, worth keeping verbatim):** three consumers — docker `HEALTHCHECK`, the auditor, and the dashboard — poll the same `/health` route with three different, uncoordinated timeout budgets (docker 10s, auditor 3s, dashboard unspecified/likely generous), so one of the three truthfully reports failure while the other two truthfully report health. This is itself an argument for §2's route split: a single endpoint cannot simultaneously satisfy three different consumers' latency contracts when its own cost is variable and occasionally unbounded-feeling; giving liveness its own near-zero-variance route removes the need to coordinate three budgets against one shared, spiky cost center.

No CONTRACT-CONTRADICTION against router's MEASURED section or po's root cause — all mechanism claims in §0-§4 stand; only the "transient" characterization is corrected to "sustained".

## 7. Risk flags

- **DDD:** none introduced — B1-B3 stay inside the existing infrastructure adapter; B4 is a normal interface-layer handler addition reusing an already-declared route.
- **Security/production footgun (pre-existing, not introduced by this design, flagged for awareness):** `capability_probe.go:68-130`'s `probeMcpTool` issues real `POST /mcp` `tools/call` requests to mcp-server today, for 7 of the 8 manifest entries, unconditionally, every 60s-per-key window, for zero observable benefit under the live `NOT_DEPLOYED_SERVICES=` config. B1 eliminates this as a side effect. Not itself in scope for this SPIKE to fix beyond B1 — noted so QA/dev-api-gateway does not treat B1 as "just a latency optimization."
- **Rollout:** any Half B change to `apps/api-gateway/` requires the standard single-service rebuild+deploy (`docker compose build api-gateway && docker compose up -d --no-deps api-gateway`) per OVERRIDE 2026-07-03 — ops-executed, not autonomous, and NOT authorized by this brief. `docker-compose.yml`'s `HEALTHCHECK`/A-12 URL repoint (§2, §5-A1) is a separate, later, ops-owned edit — sequence it after B4 ships and is verified, not bundled into the same PR.
- **Memory-precedent parallel:** structurally the same shape as `feedback_reader_writes_its_own_trigger_field_check_is_vacuous` / `feedback_internal_consistency_is_not_corroboration_check_the_other_plane` — the fast host-side/cache-hit readings (0-2ms, 5ms) were never proof of health; only a cold-cache read exercises the defective path. Keep this framing in the fix's own verification: post-fix, the RAW verify must force a cache-cold read (e.g. restart the container to clear in-memory cache, or wait >60s past a probed key) and time it, not just read the warm-cache fast path.
