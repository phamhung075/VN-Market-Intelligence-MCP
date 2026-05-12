# Architecture Brief — Container Restart Re-RCA v2 (Task ARCH-1896-RE-RCA-c58)
# size-justification: forensic event table + per-event verdict table + c59 fix spec = 3 mandatory
# sections that cannot be collapsed further. Cap: 120L per split policy.

**Authored:** 2026-05-13T00:00:00Z
**Author:** Architect
**Status:** Final
**Task:** ARCH-1896-RE-RCA-c58
**Verdict:** false-alarm-h4-batch (all post-1896c-impl events are intentional ops deploys)
**Supersedes:** `docs/architecture-briefs/2026-05-12-container-restart-rca.md` (1896a, c40+c41 only)

---

## TL;DR

Every container restart captured in the 1896c-impl docker-events log (since 17:31 UTC
2026-05-12) is an **intentional ops deploy action**, not a crash. Exit codes are 0 (clean
stop) or 137-via-SIGKILL (Docker stop-timeout, not OOM). TNB c43 CRITICAL escalation
("3rd restart in <24h") is a **third false alarm** of the same H4 pattern: TNB cannot
distinguish planned ops deploys from unattended crashes.

Sprint 1896c-impl (docker events logging) is working correctly — the log PROVES no crash.
The recurring-bug protocol fired on correct signal but incorrect diagnosis.

---

## 1. Evidence window

Log start: 2026-05-12 17:31:34 UTC (launchd plist loaded by ops, 50s before commit 16ff50e1).
Coverage: 17:31 UTC onwards. Pre-log events (c40 02:40, c41 14:35) remain as classified in 1896a.

---

## 2. Event table — post-1896c-impl window

| Time UTC | Container | Action | Exit | Classification |
|---|---|---|---|---|
| 17:31:58 | api-gateway | die | 137 | H4 — ops docker stop (1862c-DE deploy); SIGTERM hang → SIGKILL after 10s Docker timeout; no OOM action logged |
| 17:31:59 | api-gateway | restart | — | H4 — restart:unless-stopped policy fires after clean stop sequence |
| 19:58:19 | mcp-server | die | 0 | H4 — ops docker-compose restart for 1876a-A5 (migration exec-only, Task 1876a-A5) |
| 20:00:30 | mcp-server | die | 0 | H4 — ops second restart (idempotency verify per ops notebook) |
| 20:29:06 | mcp-server | die | 0 | H4 — ops docker-compose up --build for 1876a-A6 code deploy (388e6533) |

**OOM events:** 0. **Health-status: unhealthy events:** 0. **Unaccounted die events:** 0.

---

## 3. Cross-references

- **api-gateway exit=137**: SIGTERM (sig=15) sent at 17:31:48, container hung, SIGKILL (sig=9)
  at 17:31:58, exit=137. Standard Docker stop-timeout pattern. NOT kernel OOM (no `oom` action).
  Concurrent with 1862c-DE commit 01c30703 (17:33:36 UTC) and 1896c-impl commit 16ff50e1 (17:32:24 UTC).
- **mcp-server 19:58 + 20:00**: Both exit=0. PM assigned 1876a-A5 to ops at 18:22 UTC.
  Ops executed restart within cycle. Ops notebook confirms 31 rows at -7.0 post-migration.
- **mcp-server 20:29**: exit=0. 1876a-A6 commit 388e6533 at 19:47 UTC; ops ran up --build at
  20:29 UTC. TNB c43 at 22:47 UTC computed uptime=2h18m from this start → correct arithmetic,
  wrong diagnosis. Ops notebook pre-deploy note "Up 5 hours" is inaccurate (notebook prose,
  not authoritative — docker events log is authoritative).
- **Cron schedule**: no cron fires at :58 or :29. No cron-triggered restart mechanism exists.

---

## 4. c40 status (pre-log, carried from 1896a)

c40 (~02:40 UTC 2026-05-12): no docker-events coverage, no ops notebook entry in window.
Git commits nearest to 02:40 UTC = routine cowork notebooks (no deploy activity).
Closest prior clean uptime = unknown. 1896a verdict: INCONCLUSIVE.
**No new evidence available. Status unchanged.**

---

## 5. Verdict and recommendation

**VERDICT: false-alarm-h4-batch**
All TNB c40+c41+c43 signals are explained by H4 (intentional ops restarts) or are inconclusive
(c40, pre-log). No unattended crash has been observed in any window with evidence coverage.

**Sprint 1896 close status:**
- 1896a: correct (H4 c41 + inconclusive c40). No regression.
- 1896c-impl: CORRECT and WORKING. Log proves no crash. Logging infrastructure is sound.
- Recurring-bug protocol: correctly fired on repeat signals; false-positive on root cause.

**RECOMMENDATION: MONITOR — 2 more cycles (c59+c60), then close 1896 fully.**

Rationale: c40 remains without direct log evidence. If no unattended crash appears in
c59+c60 log coverage, close as false-alarm-complete. If a crash appears → immediate re-RCA.

---

## 6. TNB recalibration (SPRINT-S, low urgency)

TNB uptime-delta heuristic cannot distinguish planned deploys from crashes. Two mitigations:

**(a) TNB-PLANNED-RESTART tag** (already recommended in 1896a §4): ops notebook entries for
any docker lifecycle command (stop/restart/up) include `# TNB-PLANNED-RESTART` tag. TNB
checks ops notebook before flagging restart as anomaly. ≤5 LOC change in TNB flow.

**(b) Ops deploy tagging** (new): when ops runs deploy commands, emit a signal to
`docs/signals/` with type `PLANNED_RESTART` and container name + timestamp. TNB Step 0
consults signals/ before flagging. Zero code change; pure convention.

Either (a) or (b) — not both. Recommend (a) as simpler, matches existing notebook-first pattern.

---

## 7. c59 implementer spec

| Field | Value |
|---|---|
| Task | None required for crash fix — no crash confirmed |
| If c59 opens | TNB recalibration (a): add `# TNB-PLANNED-RESTART` convention to ops flow |
| ZONE | `.claude/flows/ops/` + `docs/protocols/` |
| Size | SPRINT-S ≤20 LOC |
| Baseline pass | TNB c44+ sees no false-alarm from planned deploys |
| H4 brief cross-link | `docs/architecture-briefs/2026-05-12-container-restart-rca.md` §4 + §5 |

**Alternative**: defer to c61 if PO judges TNB recalibration lower priority than current queue.
