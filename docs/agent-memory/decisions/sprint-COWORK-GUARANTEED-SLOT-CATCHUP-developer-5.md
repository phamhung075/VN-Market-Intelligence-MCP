# Decision Journal — Sprint COWORK-GUARANTEED-SLOT-CATCHUP · developer (continuation 5)

**Sprint goal:** cowork guaranteed-slot catch-up (see -4.md / -3.md / -2.md / base for prior entries)
**Agent:** developer
**Started:** 2026-08-08T02:15:00Z
**Continuation of:** sprint-COWORK-GUARANTEED-SLOT-CATCHUP-developer-4.md (rolled — that file hit
34716/36000 bytes with this entry appended, over the 36000 byte cap; writing here instead per
decision-journal SKILL § Cap Check).

---

### STEP developer-S80 · developer · 2026-08-08T02:15:00Z
**task-id:** FIX-ORCHSTATE-SIGNALQUEUE-UNCOMMITTED-ROWS-LOST-TO-PEER-FULLDOC-WRITE
**what-done:** Investigated the named incident first (AC-1): the 2 `sys-*` sbv_fx rows are verified PRESENT TODAY in `docs/data/orch/archive/2026-07.json` (status READ) — not lost. Commit `3e257beba`'s write path was `scripts/orch-cold-evict.sh` (via `drain-signals.md` §0a-D-PRUNE), correctly routed through `orch-apply.sh`; the actual mechanism was the (at-the-time) no-age-gate immediate-eviction defect, already closed 2026-08-01 by `SIGNAL_MAX_AGE_HOURS`. PO's "absent from archive[]" check targeted the deprecated always-empty inline `.signal_queue.archive[]` lane, not the real cold file. Still shipped the row's own AC-2 scope as legitimate defense-in-depth: `orch-conservation-check.mjs` gains a row-identity dimension (any live `.signal_queue.rows[]` id absent from candidate must be in candidate `.archive[]` or `ORCH_APPLY_DECLARED_SIGNAL_EVICTIONS`), never bypassable by `ORCH_APPLY_ALLOW_SHRINK`; wired the declaration into `orch-cold-evict.sh`'s own `rm_sig_rows` map (mechanically in lockstep, not hand-maintained).
**what-considered:**
- Literal task wording ("present in candidate archive[]") alone vs archive[]-OR-declared-set — chose OR: `.signal_queue.archive[]` is unconditionally emptied by cold-evict every run (RC-1/HSC-7), so archive[]-only would make the guard permanently unsatisfiable for the real writer; task text itself offered the declared-set as an explicit alternative.
- Bypassable via ORCH_APPLY_ALLOW_SHRINK vs always-hard-reject — chose always-hard-reject: magnitude-shrink permission and row-identity accounting are orthogonal claims (task scope item 2 says "distinct from the magnitude ratio").
**why-decision:** verified evidence over inherited premise (checked the actual cold-storage file, not just the row's own narrative) before writing any code — matches this project's repeated "verify raw, not badges" / "check the other plane" standing lessons.
**why-change:** did not resurrect/reconstruct the 2 rows (explicitly out of scope, constraint section) and did not treat the incident as an active loss in the disposition — factually corrected instead.
**verify:** `bash scripts/test/orch-apply-wrapper-tests.sh` 75/75 (60 pre-existing + 15 new ROW-DROP-*/ROW-APPEND-HAPPY cases). `bash scripts/test/orch-cold-evict-tests.sh` 53/53 unaffected (T9/T10 exercise the new declaration end-to-end through the real script). Live-reproducible AC-2/AC-3/AC-4 demos run standalone against scratch fixtures (not just inside the harness) — all match expected exit codes.

### STEP developer-S81 · developer · 2026-08-08T08:10:00Z
**task-id:** FIX-AUDITOR-VPS-ROUTE-COUNT-HARDCODE-UNSATISFIABLE
**what-done:** Landed the plan-only spec (`docs/handoffs/FIX-AUDITOR-VPS-ROUTE-COUNT-HARDCODE-UNSATISFIABLE-spec.md`, commit `220c5158a`) live: main.md:407's "all 7 routes" replaced with a jq-derived route set + route↔tool-plane coverage table + per-route verdict + cross-plane PASS gate; bundled all 4 sites per PO's `po_goahead_20260808T075740` correction (main.md:407, audit-dimensions.md:26, init.md:17 — the 3rd site PO's regex found that the spec missed — and OH-3.2 redesign in dim-oh3-auditor-blindspot.md).
**what-considered:**
- Trust spec's own 2-file OH-3.2 Leg-2 sweep list vs widen to 3 files (incl. init.md) — chose widen: PO's correction exists specifically because init.md was missed; a regression guard that doesn't cover it would reproduce the same gap the bundle exists to prevent.
- Header delta notes quoting the literal old text verbatim vs de-fanged phrasing — chose de-fanged (`all [7] routes`): live-ran the new OH-3.2 Leg-2 regex against my own header prose and it self-matched, which would have made the new guard permanently MED-flag its own changelog.
**why-decision:** live-verified every load-bearing number before writing (route count=8, source_id list, PO's fleet regex 0-hit) rather than trusting the spec's citations as-is, though PO had already independently re-derived them at source.
**why-change:** none from the ratified plan; only addition was the OH-3.2 target-file widen + header note re-wording, both required to keep the landed regression guard from false-flagging itself.
**verify:** `grep -rnoE 'all [0-9]+ routes|([0-9]+ geo-blocked routes)' docs/agents/` → 0 hits fleet-wide post-landing. Line counts unchanged on the 3 header-only-delta files (main.md 1299L, audit-dimensions.md 200L, init.md 169L).
