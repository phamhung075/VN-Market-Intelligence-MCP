# PO — Notebook

## 2026-08-08T16:00Z · A-30 memory triage: one FP, one TP, same probe, same tick

### What actually happened
- 3 signals + 1 that landed mid-triage + a **24-envelope unconsumed durable inbox** nobody reads.
- Minted 1 (`FIX-AUDITOR-A30-SUSTAINED-WINDOW-SHORTER-THAN-TARGET-RECLAMATION-PERIOD`, P1, developer). Folded 6. Zero duplicate rows.
- BATCH=3. Journal: `docs/agent-memory/decisions/triage-20260808T1600Z-po.md`.

### Decisions worth keeping
- **★ THE BRIEF'S TWO LOAD-BEARING FACTS WERE BOTH FALSE — and checking took two commands.** Brief said rag-service "VmHWM pinned at cap (1.5GiB/1.5GiB)". `docker inspect ... {{.HostConfig.Memory}}` = **1073741824 = 1.0GiB**; 1.5GiB is VmHWM's *own* value (1568064kB). The cap slot was filled with VmHWM, so "pinned at cap" is **VmHWM == VmHWM** — true by construction. Brief said "zero reclamation dips"; `docker stats` 19 min later = **82.00% (839.7MiB/1GiB)**, i.e. ~130MiB reclaimed *inside* the window declared reclamation-free. **Standing rule: when a signal hands me a percentage, read the denominator off the live cgroup before I reason about the numerator.** (`feedback_auditor_memory_pct_denominator_falsespike`)
- **★ ONE PROBE, ONE TICK, ONE FP + ONE TP — the pair is the finding, not either half.** mcp-server-1 is a *genuine* positive: 96.37% live (above its whole sampled band), VmRSS 3015024kB ≈ VmHWM 3034944kB, cap 3.0GiB **correct**. So the `MINP>93` predicate is fine and the 93/97 constants must NOT move. The defect is that the window (`PROBES=12 × INTERVAL=25s` = 5 min, `verify-a30-*.sh:124-125`) is **3× shorter** than rag-service's only reclaimer (embedder idle-unload, **15 min**, `app_factory.py:87`). A window shorter than the event period makes the predicate unfalsifiable *for that container only*. Fix must be per-container calibration; the TP arm is now the regression fixture (AC-4 forbids threshold changes).
- **★ A SHIPPED PRODUCER WITH NO CONSUMER LOOKS EXACTLY LIKE HEALTH.** P2A (durable-drain producer) + P1A both went DONE_VERIFIED 20 min before I ran. Their consumer `FIX-DEVTEAM-IDLE-CHAIN-MAIN-COMPLETION` (P0) is still BACKLOG — so `.dev_team_idle_chain.pending_triage_inbox` is **write-only**: 24 envelopes, oldest 13:08:59Z, 0 consumed, holding 2 unrouted `ci_red` (sat 2.5h), 2 CRITICAL `microservice_degraded`, a 101h VPS staleness. Nothing was red. I found it only by reading the array by hand. **Inverse of the "documented consumer, no producer" family — same net effect.** Refused to stamp `consumed_at` myself: inventing a consume contract ahead of §3.2 forks the schema that row exists to define. Dispatched the consumer instead.
- **Skipped the top-ranked P0 in the manual-dispatch sweep on prior art.** `TASK-COWORK-MUTEX-001`'s deliverable already appears live (`CLAUDE.md:14`, `CARD.md:35`, `SKILL.md:194/:288/:563`; SKILL.md written 2026-08-07 vs the row's 2026-07-30 mint). Did **not** close it either — the match is behavioural, the row carries no ACs, and 2 siblings are unexamined. Closing a P0 on a partial match mirrors the mistake being avoided. Flagged for AC-level verify; selected #6 instead (highest-ranked candidate that is unflagged AND dev-routed AND single-zone AND not deploy-gated).
- **sweep-guard occ 28-31 folded, ruling held — but the n=30 fire broke the converge-on-retry pattern.** Occ 24-27 were 4/4 scoped retries in 3-15s. The 13:37:32Z **n=30** attempt (6 agents' notebooks + 6 briefs + 4 ledgers + orch-state.json) was blocked correctly and **nobody retried it** — those 30 paths are still uncommitted with an empty index. Block is right; the gap is that a multi-agent artifact set has no scoped committer.
- **2 ci_red → 1 file → 0 new rows.** Both `gh run view --log-failed` to the same `coordinationStore.ts baseline=1241 actual=1388 upper=1365`. File-scoped dedup hit; check_id/head_sha would have minted 2 duplicates.

### NEXT
- Watch `FIX-DEVTEAM-IDLE-CHAIN-MAIN-COMPLETION` — until it lands I must hand-read `pending_triage_inbox` every tick or signals silently rot in it.
- `FIX-CI-SIZELINT-COORDINATIONSTORE-BASELINE-1388L`: READY/P0 since 11:35Z, re-fired CI RED twice since; 23-line overage keeps main red.
- mcp-server at 96.37% with RSS at its own peak — if it OOMs before the SSE reaper lands, that is evidence for the row, **not** a reason to restart it.

### Carry-over
- Standing rule from 15:13Z (applied this cycle, held): after every `orch-apply.sh`, re-read the specific row/field on disk — `jq |=` over a zero-match `select()` is a legal identity transform that prints `OK` and stamps 0 rows. `FIX-ORCHAPPLY-SELECTOR-MISS-SILENT-NOOP` is `ready[]`/developer.
- review[]=210 vs qa[]=3. `FIX-SWEEPGUARD-ESCALATION-...` has been REVIEW/qa for 8 days; the signals it regenerates every tick are a review-drain problem, not an unowned defect.
