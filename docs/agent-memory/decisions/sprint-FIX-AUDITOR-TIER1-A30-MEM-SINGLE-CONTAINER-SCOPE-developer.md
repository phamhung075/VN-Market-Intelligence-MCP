# Decision Journal — Sprint FIX-AUDITOR-TIER1-A30-MEM-SINGLE-CONTAINER-SCOPE · developer

**Sprint goal:** Tier-1 A-30 memory check inspected 1 of 13 containers (hardcoded mcp-server) — widen to every capped container, resolve rag-service's legitimate 93-98% steady-state via the existing ack ledger, not thresholds.
**Agent:** developer
**Started:** 2026-07-25T15:44Z

---

### STEP developer-S1 · developer · 2026-07-25T15:48Z
**task-id:** FIX-AUDITOR-TIER1-A30-MEM-SINGLE-CONTAINER-SCOPE
**what-done:** Zone check: `scripts/` → developer (no dev-* specialist). Re-verified live root cause: `docker inspect -f '{{.Name}} {{.HostConfig.Memory}}' $(docker ps -q)` on the real fleet — 13 containers, 12 capped, mcp-gateway=0; rag-service live at 93.67-93.70% (docker stats), confirming the described false-pass shape still live.
**what-considered:**
- only path: root cause + PO decision were fully specified inline on the board row; no design ambiguity to re-litigate (2 explicit rejections already ruled out threshold-based fixes).
**why-decision:** proceed straight to implementation per the binding PO decision.
**why-change:** no change from plan.

### STEP developer-S2 · developer · 2026-07-25T15:52Z
**task-id:** FIX-AUDITOR-TIER1-A30-MEM-SINGLE-CONTAINER-SCOPE
**what-done:** Rewrote `_check_mem_creep()`: loop over `docker ps -q` -> `docker inspect` (name+cap), skip Memory==0 (uncapped), apply WARN_PCT=85 per container via `docker stats`, name ALL breaching containers in one detail line (never the old "mcp-server mem" literal).
**what-considered:**
- ack ledger location: new sibling `docs/data/auditor-mem-ack.json` (note's parenthetical option) vs extending the existing `docs/data/auditor-launchd-ack.json` with a new `acked_memory[]` array.
- rejected the sibling-file option: the task's own `FILES` field lists only `auditor-launchd-ack.json`, not a new path — one ledger, two arrays keeps the FILES contract exact and reuses the already-proven `$LAUNCHD_ACK` read/mixed-case/staleness machinery verbatim.
**why-decision:** extended the existing file; matching-key = case-insensitive substring of container full name against `.acked_memory[].container` (mirrors `_check_docker_ps`'s existing service-substring-match style; verified no cross-service substring collisions on the live fleet, e.g. "rag-service" not a substring of "kinh-dich-service").
**why-change:** no change from plan.

### STEP developer-S3 · developer · 2026-07-25T15:53Z
**task-id:** FIX-AUDITOR-TIER1-A30-MEM-SINGLE-CONTAINER-SCOPE
**what-done:** Seeded `docs/data/auditor-launchd-ack.json` `.acked_memory[]` with `{container:"rag-service", tracked_by:"RAG-FTS-BUILD-MEMORY-BOUND", acked_at:"2026-07-25T15:48:56Z"}` — verified RAG-FTS-BUILD-MEMORY-BOUND is OPEN (lane=review, status=REVIEW, not DONE_VERIFIED) before seeding, per the staleness rule.
**what-considered:**
- only path: PO decision named this exact tracked_by row explicitly.
**why-decision:** seed is what makes the widened flat-85 loop safe on day one without a threshold carve-out.
**why-change:** no change from plan.

### STEP developer-S4 · developer · 2026-07-25T15:58Z
**task-id:** FIX-AUDITOR-TIER1-A30-MEM-SINGLE-CONTAINER-SCOPE
**what-done:** Rewrote the `docker()` test stub (`ps -q`/`inspect`/multi-name `stats`) + repurposed T9-T11 (rag-service breach unacked / docker-unreachable / unparseable) + CLI subprocess stub binary (T22/T23/T30 depend on it) + added T40-T43 (acked-ALL_GREEN-transparent, MIXED acked+unacked-FAILURE, uncapped-gateway-skip, ledger-present-no-false-note). Full suite 141/141 PASS, re-run twice (no flakiness).
**what-considered:**
- one dedicated new mem-ack test file vs extending the existing `auditor-tier1-probe.test.sh` in place.
- rejected a new file: the launchd ack coverage (T36-T39) already lives inline in the same file against the same `run_probe()`; splitting would duplicate the entire docker/curl/df/launchctl stub harness for no isolation benefit.
**why-decision:** extended in place, same harness, same `LAUNCHD_ACK` fixture-swap pattern already proven for the launchd arm.
**why-change:** no change from plan.

### STEP developer-S5 · developer · 2026-07-25T16:00Z
**task-id:** FIX-AUDITOR-TIER1-A30-MEM-SINGLE-CONTAINER-SCOPE
**what-done:** Fences: `bash -n` clean; `shellcheck -x` clean on my own diff (fixed my own SC1125 directive-placement bug; the 2 remaining warnings are pre-existing, outside my edited region, left untouched). RAW live-fleet evidence captured for all 4 script-behavior acceptance gates (see close-out) — real `docker inspect`/`docker stats`, real probe invocation, `date -u` timestamped, both with and without the mem ack seed live.
**what-considered:**
- gate 3 (MIXED, forced second-container breach) cannot be reproduced on the real fleet without violating the read-only/no-container-mutation hard constraint — used the T41 stubbed-unit-test evidence instead, structurally identical code path to the gate-1/gate-2 real-fleet runs.
**why-decision:** real fleet where forcing state is possible (gates 1/2/4/5), stubbed unit test where forcing a real OOM would violate constraints (gate 3) — matches how the codebase's own precedent (T33/T34 launchd exit-status forcing) already handles unforceable-on-live-fleet cases.
**why-change:** no change from plan.
