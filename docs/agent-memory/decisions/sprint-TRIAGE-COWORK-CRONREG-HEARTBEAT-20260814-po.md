# Decision Journal — TRIAGE-COWORK-CRONREG-HEARTBEAT-20260814 · po

**Trigger:** router request — triage a 6h cowork master-dispatcher silence (already hand-fixed) and mint only if the underlying gap is genuinely un-owned.
**Agent:** po
**Started:** 2026-08-14T12:54:44Z

---

### STEP po-T1 · po · 2026-08-14T13:00:17Z
**task-id:** FIX-COWORK-CRONREG-MARKER-RENEWAL-HEARTBEAT-STRANDED-ON-ERROR-ONLY-BRANCH
**what-done:** Re-derived the incident's root cause from source rather than accepting the router's framing, then minted ONE P1 FIX for the half that is genuinely un-owned.
**what-considered:**
- (a) Mint the router's proposed gap as filed — "no mechanism detects cowork dispatcher silence" + "8-day marker TTL blocks re-registration" → **rejected as a duplicate**: `ARCH-SESSION-CRON-PLANE-LIVENESS-WATCHDOG` (backlog, 2026-07-22, `next_agent:ba`) already owns verbatim "build the launchd-hosted liveness watchdog that turns 'a session died and its whole loop vanished' from silent into a BUG-channel alert", and its own `po-S3` journal entry scopes it to "launchd hosts re-arm + liveness only". `UC-CDC-P5` (P1) owns the session-start self-arm half.
- (b) Mint nothing and report "already tracked" → **rejected**: a distinct, un-owned, bounded defect exists underneath, and it is a *precondition* of (a) working at all.
- (c) Fold the new finding into the ARCH row as extra scope → **rejected**: that row has sat at BACKLOG for 23 days; a 3-line shell fix inheriting an epic's queue position is the mechanism by which this outage recurs.
- (d) Mint the narrow fix + enrich the ARCH row with the constraints + a `depends_on` edge → **chosen**.
**why-decision:** The router's own headline number falsified its framing. `heartbeat_age=158976s` (44.2h) was reported on a marker whose owning session was firing `*/15` ticks until 06:45Z — only ~6h before the read. That is arithmetically impossible unless `heartbeat_at` never moves off `claimed_at`. Grep-verified: the FIX-CRON-REARM-CROSS-SESSION-DEDUP §1.4 renewal call for `cron-registration:cowork-team` has exactly ONE executable call site, `cowork-team/flow/preflight-error-fallback.md:57-63`, whose header states it is "reached only on Step 0 preflight verdict=ERROR"; `scripts/agents-flow/cowork-tick-preflight.sh` (the only per-tick executor) contains zero occurrences of `cron-registration`. The brief targeted `main.md` Step 0a on the premise it "already fires every */15 tick" — already false when written, because WU-2 (2026-07-13) had moved that responsibility into the preflight script three weeks earlier.
**why-change:** Scope narrowed from the router's 3-part gap to 1 mint + 1 enrichment. Detection half already owned; runbook half folded into the owner rather than minted separately.

### STEP po-T2 · po · 2026-08-14T13:00:17Z
**task-id:** FIX-COWORK-CRONREG-MARKER-RENEWAL-HEARTBEAT-STRANDED-ON-ERROR-ONLY-BRANCH
**what-done:** Bounded the blast radius by measuring the two sibling markers and both firing planes, instead of generalising from the one broken case.
**what-considered:**
- Claim all three `cron-registration:*` markers are stranded (the shape suggests it) → **rejected on live measurement**.
- Claim guaranteed slots were lost during the outage (the router implied fleet-wide damage) → **rejected on log evidence**.
**why-decision:** One `task_list_held(kind="sprint-task")` read settles both. `detect-loop`: `claimed_at=1786601070`, `heartbeat_at=1786711724` → renewing, last beat ~6 min old. `standalone-team`: `claimed_at == heartbeat_at` → never renews, but that is explicitly by design (brief §1.4 states it has no natural per-tick hook and compensates with `orphan_threshold_seconds=120`). Only cowork-team was specced to renew and does not. Separately, `docs/agent-memory/sessions/cowork-guaranteed-slot-firer.log` shows `chef-eod` invoked 08:59:14Z exit 0 and `fb-daily` invoked 09:18:34Z exit 0, both with real published output, on the same day their `last_fired` fields still read 2026-08-13 — the launchd plane covered every guaranteed slot and does not write `last_fired` back. Damage is confined to the non-guaranteed slots the firer filters out: ~13 missed dispatches, ~8 of them `alert-commander-market` on a −2.07% VN-Index day.
**why-change:** Priority set to P1 rather than P0 *because* of this measurement — no market-facing deliverable was lost. Also converted the router's proposed `last_fired`-staleness detector into an explicit anti-requirement (constraint C1 on the ARCH row): it would have fired false on every guaranteed slot daily and still missed today's real outage.

### STEP po-T3 · po · 2026-08-14T13:02:26Z
**task-id:** ARCH-SESSION-CRON-PLANE-LIVENESS-WATCHDOG
**what-done:** Enriched (did not re-scope) the existing owner with three constraints + `depends_on` the new row; normalised `priority` from the non-canonical `"high"` to `P1`.
**what-considered:**
- Leave the row untouched and let the implementer rediscover the oracle traps → **rejected**: both traps cost real investigation time today and neither is inferable from the row's one-line title.
- Re-route it off `next_agent:ba` → **rejected**: routing is not this triage's call, and the design question (which host, which signal) is genuinely BA/architect work.
**why-decision:** C1 (`last_fired` is not an oracle — two planes, one writer) and C2 (the marker's `heartbeat_at` is not an oracle either, until po-T1's fix lands) are both *design inputs* to this watchdog, and getting either wrong produces a detector that is worse than none. C3 records that the runbook's §4 recovery path is already adequate for this shape — `/cron-cowork-team` does reach Step 1b.1 and does self-heal — so the missing piece is a §2 *detection* signature, which belongs in this row's deliverable, not a separate doc row. The `depends_on` edge is the sequencing control: built before po-T1 lands, this watchdog would key on a permanently-frozen field.
**why-change:** No scope change to the row's goal. Added constraints, evidence, and one dependency edge.

---

**Write path:** all board mutations landed through `jq | bash scripts/orch-apply.sh` in a single pipe. Validator Stage 0+1 PASS; conservation `task_total live=740 candidate=741`, `signal_total 27=27`, `signal_row_identity=clean`, `inbox_row_identity=clean`. Stage 1g dangling-dep REPORT (16 rows) is pre-existing and non-fatal; the new `depends_on` edge resolves and is not among them.
