# Decision Journal — FIX-RAG-SERVICE-CLEAN-EXIT-RESTART-LOOP (po)

## STEP po-1 — Escalate P2→P1 and dispatch, 2026-08-05T10:58Z

**task_id:** FIX-RAG-SERVICE-CLEAN-EXIT-RESTART-LOOP

**what-considered:**
1. Dispatch now by bumping the WIP cap 2→3 (what the router offered).
2. Dispatch now by evicting one of the two in-flight rows. ← CHOSEN
3. Leave it in `ready[]` and wait for a slot to free naturally.

**why-change:** Option 1 was unnecessary, and bumping a cap to dodge a cap is the kind of
precedent that quietly becomes permanent. On inspection the cap was not the real constraint —
one of the two WIP slots was being squatted. `FIX-DEPTHTHIN-B-GATEWAY-TA-PATH-REWRITE` was
claimed by BOUNDED-1 at 2026-08-01T13:18:38Z and had produced **zero commits in 3.9 days**
(`git log --since=2026-08-01T13:18:00Z -- apps/api-gateway/` empty; `git log --all --grep=DEPTHTHIN`
shows nothing for the -B row). It is P3 (dashboard TA indicators missing) against a P1 container
restart loop. Evicting it back to `ready[]` — priority, zone and detail_ref all intact, first in
line for the next free slot — freed a slot without touching the invariant. Final WIP = 2, at cap,
not over. Option 3 was not viable: nothing was going to free that slot, which is precisely why it
had been stuck for four days.

**The escalation was not a judgement call — the row's own trigger fired.** Its
`priority_rationale` reads verbatim: *"Escalate to P1 if RestartCount/day climbs back above ~5 as
the corpus grows."* Measured: `RestartCount=58` now vs `22` recorded at 2026-07-29T11:42Z =
**36 restarts / 6.966 days = 5.17/day**. Bar met. Lifetime rate is 2.79/day and the row's own
07-29 reading was 1.6/day, so the recent window is 3.2× the last recorded rate — accelerating,
not merely high.

**I escalated on the RATE, not the percentage — deliberately.** The row's
`po_index_provenance_correction_20260729T1135` warns: *"Re-check the RATE, not the percentage,
before escalating — the percentage has been in the 94-98% band since 2026-07-15 and escalating on
it would be escalating on a constant."* Today's signal led with 97.51%, and that number is the
constant, not the news. It is not the basis for this decision.

**Corroborated on a second plane** (`feedback_internal_consistency_is_not_corroboration_check_the_other_plane`):
corpus is 19965 rows (`GET localhost:5002/embed/health`, host port, no exec) vs 11243 on 07-29.
Corpus grew 1.78×, restart rate grew 3.2×. Compaction cost is O(corpus), so the row's stated
mechanism predicts exactly this pairing. The row predicted it in writing: *"the restart rate is
expected to CLIMB BACK as the corpus grows."*

**Ratified at source, not on the relay** (supervised → `po_goahead` required). I re-read
`apps/rag-service/infrastructure/repositories.py` rather than trusting the row's own prose: the
reset `self._insert_count = 0` is still at :251 **inside** the `try`, **after**
`await table.optimize(...)` at :250; the `except` at :257 still returns without resetting; there is
**no `finally` and no `asyncio.Lock` anywhere in the file**. Defect confirmed live and unfixed.

**Retired a stale gate.** The row's `deploy_gate` still said the rebuild "is USER-GATED". That
language is retired by a permanent user directive of 2026-08-01 ("full autonome and permission for
PO"), which itself post-dates two earlier overrides saying the same thing. The identical belief on
`PDF-AVAIL-02-FIX` left a committed fix undeployed for 7 days and produced 7 days of signal spam.
Rewrote the field; kept every real guardrail (single-service `up -d --no-deps` only, never
`down`/`--force-recreate`; **never `docker exec` into rag-service** — an exec shares the cgroup and
SIGKILLed this container on 2026-07-29T10:12:00Z).

**Scope held.** AC6 stands: this fix does **not** close the restart loop. It removes the
self-amplifying burst multiplier. The residual ~700MiB model baseline inside a 768MiB cap belongs
to `FU-RAG-DEPLOY-MEMORY` and must not be folded in.

## STEP po-2 — mcp-server cascade hypothesis REFUTED

**what-considered:** fold the mcp-server crashes into the rag row as a cascade (system-auditor's
hypothesis in `sys-20260805T103434-24be`), or keep them separate.

**why-change:** Refuted on measurement, so kept separate. mcp-server is at **263.7MiB of a 3GiB
cap (8.58%)** with ~2.75GiB unused, and the host has **~4.8GiB free of its 7.75GiB** Docker VM
budget (~2.9GiB total across all containers). Neither the container cap nor a shared VM budget is
under pressure, so the signal's "shared memory budget" premise is false as stated. The two
containers share a clean-exit *signature* (`ExitCode=0`/`OOMKilled=false`) but not a cause — and
that shared signature is itself why both evade OOM-keyed triage. Routed instead to the row that
already owns it, `OPS-MCP-RESTART-CHURN-UNCLEAN-SHUTDOWN` (P1, promoted backlog→ready). This is
recurrence #3 on that row and the bursts are getting denser: 5 consecutive (07-22..07-29) → 11 in
55 minutes (07-31) → 6 in 4 hours (today). No `po_goahead` stamped there: its next deliverable is a
diagnosis that does not exist yet, and ratifying a deliverable that does not exist is worse than a
live hold.

## STEP po-3 — dev-rag-service notebook split (unblocks the dispatch above)

**what-considered:** treat the `notebook_single_section_overage_breach` as routine hygiene and
defer it, or fix it before dispatching.

**why-change:** Fixed it, because checking turned it from hygiene into a blocker. My first
assumption was that the notebook would self-heal — the notebook-write skill is OVERWRITE at ≤50L.
Reading `.claude/skills/notebook-write/SKILL.md:174` shows OVERWRITE applies only to
po/market-watcher/orch-sentinel; **developer agents APPEND**. So dispatching dev-rag-service into a
notebook already at 13912B/12000B would have grown it past the 200L cap too. Split the five entries
dated 2026-06-08 and older to
`docs/agent-memory/notebooks/archive/dev-rag-service-archive-20260805.md`; live file 185L/13912B →
55L/4750B. Entry count 7 = 2 live + 5 archived, zero data loss.
