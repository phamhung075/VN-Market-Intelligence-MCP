# PO Notebook

_Last: 2026-08-05T11:00Z (dev-team Step 1 triage, cron tick 10:37Z — live rag-service incident). Prior 2026-08-05T09:11Z (dev-team cron triage tick 08:37Z)._

## This cycle

- **DISPATCHED `FIX-RAG-SERVICE-CLEAN-EXIT-RESTART-LOOP`, escalated P2→P1 — the row's own trigger fired.** `priority_rationale` said "escalate to P1 if RestartCount/day climbs back above ~5". Measured `RestartCount=58` vs the `22` recorded 2026-07-29T11:42Z = **36 restarts / 6.97d = 5.17/day** (lifetime 2.79/day; 3.2× the last recorded 1.6/day). Not a judgement call — a stated threshold, crossed.
- **Escalated on the RATE, not the 97.51% the signal led with.** The row warns its own future reader that the percentage has sat in the 94-98% band since 2026-07-15 and that escalating on it is "escalating on a constant". That warning held: the constant didn't move, the rate did.
- **Corroborated on the second plane before acting.** Corpus 19965 rows (`/embed/health`, host port, no exec) vs 11243 on 07-29 — 1.78× corpus, 3.2× restart rate. Compaction is O(corpus), so the row's mechanism predicts exactly this pairing; it predicted the climb in writing.
- **No WIP-cap bypass was needed — the cap wasn't the constraint, a squatter was.** `FIX-DEPTHTHIN-B-GATEWAY-TA-PATH-REWRITE` (P3) held a slot since 2026-08-01T13:18Z with **zero commits in 3.9 days** (verified by `git log`, not by row status — `feedback_commit_zone_excluded_agent_ships_board_stays_stale`). Evicted to `ready[]`, priority/zone/detail_ref intact. WIP=2, at cap, invariant untouched.
- **Ratified at source before stamping `po_goahead`.** Re-read `repositories.py`: reset still at :251 **inside** the `try` after `optimize()` at :250, `except` at :257 still returns without resetting, **no `finally` and no `asyncio.Lock` in the file**. Defect live and unfixed. `should_hold` → false, so dev-team resumes with no hold.
- **Retired the row's "USER-GATED" deploy language.** Superseded by the permanent 2026-08-01 directive; the identical belief on `PDF-AVAIL-02-FIX` cost 7 days of non-deploy + 7 days of signal spam. Kept every real guardrail: single-service rebuild only, and **never `docker exec` into rag-service** — an exec shares the cgroup and SIGKILLed it on 07-29.
- **Refuted the cascade hypothesis instead of inheriting it.** system-auditor guessed mcp-server's 6-crashes-in-4h cascaded from rag-service memory. Measured: mcp-server at **8.58% of a 3GiB cap**; host **~4.8GiB free of 7.75GiB**. No pressure on either plane, so the "shared budget" premise is false. Shared clean-exit *signature* (`ExitCode=0`/`OOMKilled=false`), not a shared cause — and that signature is why both evade OOM-keyed triage.
- **Routed mcp-server to the row that already owns it**, `OPS-MCP-RESTART-CHURN-UNCLEAN-SHUTDOWN` (P1, backlog→ready) — recurrence #3, bursts densifying 5 → 11-in-55min → 6-in-4h. No `po_goahead`: its next deliverable is a diagnosis that doesn't exist yet, and ratifying a nonexistent deliverable is worse than a live hold.
- **The notebook overage was a blocker, not hygiene — checking is what revealed it.** I assumed it would self-heal via OVERWRITE; `notebook-write/SKILL.md:174` shows OVERWRITE is po/market-watcher/orch-sentinel only — **developers APPEND**. Dispatching dev-rag-service into a 13912B/12000B notebook would have breached the 200L cap mid-incident. Split 5 pre-06-08 entries → `archive/dev-rag-service-archive-20260805.md`; live 185L→55L, 7 entries preserved, zero loss.

Pre-checks: signal_queue 0 NEW · TNB ACK'd 08-01, nothing new · supervised-hold `should_hold=false` (UC-CRITIC already stamped 09:06Z) · janitor dup — no action, already disposed by router.

### Carry-over
- **Do not let anyone claim the restart loop is closed when the fix lands.** AC6 forbids it — a ~700MiB fixed model baseline inside a 768MiB cap keeps the container killable. Residual belongs to `FU-RAG-DEPLOY-MEMORY`, which is also the memory-ACK `tracked_by`; it is the natural next pickup.
- **`OPS-MCP-RESTART-CHURN-UNCLEAN-SHUTDOWN` sits in `ready[]` needing a slot.** Its re-route condition (death originating outside the process → ops lane) is now measured-negative on the host-OOM branch, so it stays in-service with dev-mcp-server.
- `RAG-FTS-BUILD-MEMORY-BOUND` stays time-gated; next meaningful re-check **~2026-08-12, not next tick**. Three PO ticks have already re-derived it for zero decision change.
- `FIX-RAG-COMPACTION-DISK-AMPLIFICATION` is sequenced *after* the counter fix by its own dep note (retuning on top of the defect would measure the defect). Re-size once the fix lands.
- Carried from prior cycle: BCTC P0s (`FIX-BCTC-FALLBACK-SHELL-REPORTS-STRUCTURALLY-UNEXTRACTABLE`, `FIX-BCTC-SSC-DOC-SELECTION-QUARTER-BLIND-ALWAYS-LATEST`) still open and unstarted.
