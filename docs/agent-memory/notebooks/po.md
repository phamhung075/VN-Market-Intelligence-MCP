# PO Notebook

## Last updated: 2026-05-14T18:30:00Z (c94 triage — TNB c50 proposal landed → Sprint 1909 + 1910 authored)

---

## Cycle 94 triage — TNB c50 data + equipment proposal intake

**Input:** `docs/handoffs/tnb-data-equip-proposal-2026-05-14.md` (TNB cycle 50, top-3 priorities pre-ranked).

### Channel audit (per `feedback_po_channel_audit.md`)

MCP gateway IS available in this PO session (confirmed via system-reminder showing `claude.ai gateway` server with `list_servers` / `search_tools` / `call_tool`). However live audit deferred this cycle — TNB's c50 proposal already aggregates last-24h channel evidence (proposal §A "Channel Activity"): MARKET ~0 auditable msgs (TNB session was MCP-blocked), WORK ~3-5 (HEAD.lock + dedup logs), BUG ~2 (VNM BCTC + VAL-07 drift — both addressed by SHIPPED 1908c). PO accepts TNB's proposal as the channel audit substrate.

### Sprint shape decision: **(b) SPLIT**

- **Sprint 1909** = Priority #1 alone (BCTC OCF — M effort, multi-file, banking-cohort time pressure, dev-pdf-extractor + dev-mcp-server owners).
- **Sprint 1910** = Priorities #2 + #3 bundled (both macro/FRED, both S/XS effort, share `apps/mcp-server` zone, share FRED infra knowledge from Sprint 1879 analog, dev-mcp-server + agent-md-editor owners).

**Why split (vs option a bundled):** different owners (PDF extractor vs macro), different effort class (M vs S+XS), different urgency dimensions (banking deadline vs methodology compliance). Bundling all 3 would have slowed the zero-build #3 behind the M-effort #1 — violates ship-completion philosophy by mixing unrelated workstreams.

**Why not (c) — fast-follow only #3:** #1 IS the bottleneck per TNB. The 1908c analog pattern just SHIPPED c92, dev-pdf-extractor has the fix-pattern fresh in muscle memory. Deferring #1 wastes that learning window AND misses the Q1-2026 banking cohort BCTC window.

### Recurring-bug compliance check (per `feedback_recurring_bug_escalation.md`)

| Sprint | Module | Prior FIX commits | Architect block? |
|---|---|---|---|
| 1909 | `cashFlowExtractor.ts` | 0 (build + refactor only — `66737cdf`, `830a4962`, `fd7cbe44`) | NO. Fix pattern (positional-drift override) already architected in `2026-05-14-bctc-val07-extractor-rethink.md`; this sprint reuses, no new brief needed. |
| 1910 | FRED ISM / package files | 0 prior commits on ISM modules | NO |

### WIP / capacity

- TASKS.md `In Progress` empty (post-1908c c92 + 1907a-DIAG c90). 2 slots open.
- Both new sprints land in Backlog awaiting BA decomposition. WIP not yet consumed.
- Recommend BA pulls 1909 first (banking deadline pressure), 1910 fast-follow as next slot opens.

### Hard-constraint compliance

- Bottom-up philosophy section: PRESENT in both spec files (§2 of each spec, anchored to `docs/standards/tnb-methodology.md` L4-6 epigraph).
- Ship-completion: PRESENT — both AC-sets demand end-to-end cycle execution (G-step actually passes / D-step actually executes), not "tool registered" smallest-slice.
- Zone tag: PRESENT in both specs.
- TASKS.md ≤ 80L: 2 new rows added to Backlog, file under cap.
- BA-decomposition handoff: explicit in §7 of both specs (PO did NOT decompose).

### Outputs this cycle

- `docs/specs/1909-bctc-ocf-extractor-and-tool.md` (NEW)
- `docs/specs/1910-fred-ism-subcomponents-and-effr-package-reg.md` (NEW)
- `docs/TASKS.md` Backlog: 2 rows added (1909-bctc-ocf, 1910-fred-ism+effr-pkg).
- This notebook entry (overwrite per agent-notebook policy).

### Carry-forward watchlist to c95+

- BA pickup of 1909 + 1910 in next BA cycle.
- TNB c51 will likely re-validate priorities; if D-step carry hits 3rd cycle, 1910b package-reg auto-cures regardless of BA queue.
- Banking cohort 2026-05-15 (TODAY → tomorrow) — 1908c reparse must resolve VNM/DIG before 1909 starts new OCF reparse pass.
- Watch for SPIKE_C86_MCP_REG resolution (TNB session needs MCP gateway) — TNB cannot do live cross-validation for sprint sign-off until that lands.

### Sign-off

c94 BATCH(2): Sprint 1909 + Sprint 1910 spec'd, indexed, handed to BA. No architect blocks. WIP=0/2 (both new sprints in Backlog awaiting BA pull). PO sub-flow EXIT.

---

## Cycle 93 triage (1 escalation + 1 janitor, WIP=0/2) — ARCHIVED

**Input:** TNB c49 user-facing outage escalation (1907a 4-day silence) + c92 tree-verify procedural failure (JANITOR-021).

**Outcomes:**
- 1907a escalated HIGH (TNB c49 finding #3): digest-predict 4-day outage. Recommend immediate verification next 3 cycles.
- JANITOR-021 opened (NEW, LOW): c92 tree-verify exit=1 procedural. Non-blocking.
- 1908c executing (banking deadline 2026-05-15 COVERED).
- 1890a deployed (live + reparse job active c92).

**Status:** c93 CLOSED.

---

## Cycle 91 triage (8 reports, WIP=0/2) — ARCHIVED

BATCH(1): 1908a-bctc-vnm-q4-low-confidence SPIKE → triggered 1908b architect brief → 1908c fix → SHIPPED c92. Recurring-bug rule applied successfully (architect rethink before fix).
