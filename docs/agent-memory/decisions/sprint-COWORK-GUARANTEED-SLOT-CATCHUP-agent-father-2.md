# Decision Journal — Sprint COWORK-GUARANTEED-SLOT-CATCHUP · agent-father (continuation)

**Sprint goal:** (continuation of `sprint-COWORK-GUARANTEED-SLOT-CATCHUP-agent-father.md`, which
hit its 600L cap at STEP agent-father-S27 — see CAP-REACHED marker there.)
**Agent:** agent-father
**Started:** 2026-08-06T23:04:00Z

---

### STEP agent-father-S28 · agent-father · 2026-08-06T23:01:00Z
**task-id:** FIX-REFINE-SUBFLOW-OPTIONC-CONTRACT-DRIFT
**what-done:** Resumed own prior in-flight task (lock TTL had lapsed w/o release); RAW re-verified
report a3a41225 (VHM_2026_Q1) live — still refine_status=PENDING, 0 refined units; heartbeat-
extended the task lock via docker-exec+bun:sqlite direct UPDATE matching heartbeatTask()'s exact
SQL (no gateway MCP binding this session).
**what-considered:**
- Re-enable slots 1-3 now (KBC's clean 24-unit generic-fix evidence already exists) vs leave
  paused strictly pending a3a41225-specific confirmation — chose leave paused, same as S27.
- Treat "no new fire since 19:25Z" as inconclusive vs re-derive queue position independently —
  chose independent re-derive (replicated get_bctc_pending_refine's own Branch-3 SQL) rather than
  assume the prior snapshot still holds.
**why-decision:** AC-7's own text still ties re-enable to the a3a41225-specific push; KBC (24
units, all terminal window_status, refine_status still PENDING — more windows likely remain, 56
pages) and HSG (0 units) both still sit ahead of VHM in ORDER BY parsed_at ASC — VHM has not moved.
**why-change:** Zero code diff this cycle — verification+heartbeat only. No commit to
`docs/agents/`/`.claude/agents/`/`docs/data/cowork-schedule.json`. Notebook entry is the primary
record; this journal entry is secondary per DJ-GATE-1 (not strictly mandatory — no DONE/REVIEW
flip this cycle, but recorded for continuity with S23-S27's chain). Returning short RAW-verified
status to router: task stays IN_PROGRESS, lock heartbeat-extended, no board change.

### STEP agent-father-S29 · agent-father · 2026-08-07T00:52:00Z
**task-id:** FIX-CRON-REARM-CROSS-SESSION-DEDUP (Lane 1, brief §4 items 1-2)
**what-done:** Shipped §2 IDENTITY-then-VALUE classify + §1.2-1.4 `cron-registration:<family>`
marker in all 3 cron skills, standalone Job1/2 anchor→`description` fix, §1.4 heartbeats in the 3
named flow files, `cron-registration:*` added to both D4-R1b doc-sync files.
**what-considered:**
- Brief mixes `task_kind=`/`kind=` for `task_list_held` — live schema only has `kind`; used that.
- Brief's Step-0 "already claimed this session" fast path → realized as a blind `task_heartbeat`
  probe (ticks are fresh agent contexts, no memory) instead of an unimplementable memory check.
**why-decision:** Brief is SSOT; cross-checked every literal (ttl 691200, threshold min 120) vs
live `coordinationTools.ts` Zod schema — exact match, no design deviation, only schema-drift fixes.
**why-change:** AC-4 confirmed by reading live source (not re-derived): `gcExpiredLocks` +
`KNOWN_LEGIT_PREFIXES` both already exclude `cron-registration:*` (`951ddfdba`/`86b31eccd`). No
`Cron*` tool called; doc-authoring only.

### STEP agent-father-S30 · agent-father · 2026-08-07T01:52:00Z
**task-id:** FIX-REFINE-SUBFLOW-OPTIONC-CONTRACT-DRIFT
**what-done:** Per PO decision `po_decision_refine_cadence_20260807` (stamped 2026-08-07T01:11Z),
executed action item (1) only: set `enabled: true` on `refine-bctc-slot-1` (cron `0 9`, was
`false`) in `docs/data/cowork-schedule.json`. Slots `0 11` (slot-3) and `0 14` (slot-2) left
disabled; slot-4 (`30 16` canary) untouched.
**what-considered:**
- Full re-enable of all 3 paused slots (4x cadence) vs partial (2x) — PO chose partial: canary
  proved the Option-C contract fix generically but also exposed a degraded image plane (3/3 DONE
  units image_unavailable, confidence capped 0.55 correctly), so 4x would bulk-write image-blind
  units across HSG/VHM before that separate defect (FIX-BCTC-REFINE-PAGE-IMAGE-UNAVAILABLE-CAPS-
  CONFIDENCE) is fixed.
- Chasing the flat-confidence-0.55 value as a bug — refuted by PO: `bctcSanityValidator.ts` can
  only pass-through or clamp to 0.4/0.1, never 0.55; the value is correct behavior under the
  documented <=0.6 image-degradation cap. Out of scope here by explicit PO instruction.
**why-decision:** This dispatch was scoped narrowly to the single cadence action item already
decided by PO at source (RAW-verified against live cowork-schedule.json + market.db) — not a
re-litigation of the cadence tradeoff. Only field changed: `enabled` (+ its `_note` for audit
trail); no other slot, no confidence/cap value, no code under `apps/mcp-server` or
`docs/agents/refine_bctc_md/` touched.
**why-change:** No change from plan — single-field edit as specified. Broader AC-1..AC-7 contract-
drift fixes on this same row remain untouched (separate, larger piece of work per dispatch
instructions); row stays `IN_PROGRESS`, `.head` untouched, status not flipped.
