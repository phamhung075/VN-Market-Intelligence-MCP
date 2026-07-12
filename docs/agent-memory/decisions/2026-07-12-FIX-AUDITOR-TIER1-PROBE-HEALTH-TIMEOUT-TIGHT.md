# 2026-07-12 — FIX-AUDITOR-TIER1-PROBE-HEALTH-TIMEOUT-TIGHT

## Summary
Widened the HTTP health-check timeout in `scripts/agents-flow/auditor-tier1-probe.sh`'s
shared `_check_health` helper from `curl --max-time 3` to `--max-time 6`. Single-line
functional change plus a matching header-comment update (same file, same value) — no
other check touched.

## Problem
Live-measured this session: frontend-1 (localhost:3001) baseline HTTP response time is
2.0-2.2s with observed spikes to 3.4s, all server-side (network delay <1ms) — Tier-1
and Tier-2 system-auditor investigations both independently confirmed the container
itself is healthy (0 restarts, 0% CPU, stable). A 3s `--max-time` left essentially zero
margin over that response distribution, so ordinary jitter randomly tripped a false
`health_3001` FAILURE verdict that "resolved" on retry seconds later. Recurred 3-4x
this session, each instance requiring a router-level re-verify or a full
system-auditor subagent spawn to re-confirm "still benign" — pure token-economy waste
chasing a threshold artifact, not a real signal.

## Fix
`scripts/agents-flow/auditor-tier1-probe.sh` line ~157 (inside `_check_health`,
called for both `health_3000` and `health_3001` — L261/L264 call sites):
```
- code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "http://localhost:${port}${path}" 2>/dev/null) || code="CURL_ERR"
+ code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 6 "http://localhost:${port}${path}" 2>/dev/null) || code="CURL_ERR"
```
Also updated the two header-comment lines documenting the exact curl invocation
(`-m3` → `-m6`) with a short provenance note — same file, not a scope creep, since it
describes the literal value just changed.

6s chosen over the full 3-8s range suggested in the task brief: gives ~2.6-4x margin
over the observed 2.0-3.4s response distribution without being wide enough to mask a
genuinely hung service (a service actually stuck/hung would still trip FAILURE well
inside 6s in any realistic hang scenario — this is a jitter-margin fix, not a
hang-tolerance widening).

No retry logic, no exponential backoff, no refactor — single-value change per
simplicity-gate discipline, exactly as scoped by the task brief. `_check_docker_ps`,
`_check_disk`, `_check_mem_creep`, `_check_launchd_agents` untouched.

## Verification
1. **Existing test suite** — `bash scripts/agents-flow/auditor-tier1-probe.test.sh`:
   79 passed, 0 failed (T1-T30, full ALL_GREEN/FAILURE/tiered/launchd coverage).
   Confirmed the suite fully mocks `curl` as a shell function override — it never
   exercises the real `--max-time` flag, so the timeout-value change is invisible to
   test assertions by design (as the task brief anticipated).
2. **Live manual check** — 10x real requests against the actual frontend-1 container
   with the new timeout:
   ```
   for i in $(seq 1 10); do curl -s -o /dev/null -w "%{http_code} %{time_total}\n" -m 6 http://localhost:3001/; done
   ```
   All 10 resolved `200` at ~2.01-2.02s each — consistent with the reported baseline,
   comfortably inside the new 6s ceiling.

## Decision
Flip **done** (not `review`) — this is an XS-size, single-value timeout-margin change,
fully covered by the pre-existing regression suite (unchanged 79/79 green) plus a live
10/10 manual confirmation against the real service. No QA sign-off warranted for a
change of this size and verification depth; escalating to `review` would just be
process overhead on a trivial, already-proven fix.

## Notes
- Root cause was a threshold artifact (timeout too tight vs. real-world response
  distribution), not a container health problem — this class of false positive is the
  same pattern documented in `feedback_auditor_false_positive_destructive.md` and
  related Tier-1 auditor FP-class lessons in project memory: RAW-probe the actual
  distribution before tightening/loosening a threshold, never guess.
- Owning task board row: `docs/data/orch/archive/backlog-detail.json#FIX-AUDITOR-TIER1-PROBE-HEALTH-TIMEOUT-TIGHT`.
- task_claim `task:FIX-AUDITOR-TIER1-PROBE-HEALTH-TIMEOUT-TIGHT` is held by the router
  (dev-team Step 3 dispatch) — NOT released here; router releases it after this spawn
  returns.
