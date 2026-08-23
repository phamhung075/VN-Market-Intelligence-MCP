# Signal Inbox Non-Drainable Floor — Age-Bounded Loud Escalation, Not Reader-Widening

**Task ID:** FIX-SIGNAL-INBOX-NON-DRAINABLE-ENVELOPE-50-OF-51-FILES-SILENTLY-CLASSED-LITTER (P1)
**Agent:** architect · **Date:** 2026-08-23
**Trigger:** PO triage `docs/agent-memory/decisions/triage-20260823T0947Z-po.md` D6 — process review of a 24-day-stuck signal surfaced a systemic drain-coverage gap, not a one-file lapse.

---

## 0. TL;DR

PO's number (drainable_count=1 of 51, i.e. "50 of 51 undrained") is a real, reproduced measurement of `isDrainableShape()`'s skip rate — but it is not one population. Re-run live, twice, this session: **drainable_count=2 of 51** (2 fresh files landed between PO's measurement and mine — the inbox is live, treat the exact integer as time-varying). Of the **49 currently non-drainable, the majority (21) are the sanctioned `price_anomaly_*` by-path family working exactly as designed** — PO's own hard constraint already forbids touching them, and folding them into "litter" would be the fifth misdiagnosis of this exact family. The genuinely-orphaned population is **28**, and it splits again: **26 are well-formed bare-finding objects with no envelope** (mostly historical `cowork-team-*` telemetry pre-dating a since-resolved writer path), and **2 are not shape-skipped at all — they fail `JSON.parse()` outright**, from a live, still-present bug in `notebook-auto-prune.sh` (`grep -c ... || echo 0` double-emits `"0\n0,"` whenever a count is zero, corrupting the JSON every time it fires).

**Design: do not widen the reader. Add an age-bounded, one-shot, loud escalation for anything that is neither drainable nor a declared by-path exemption**, with mtime-based dedup so the fix fires once per stuck file, not once per tick forever. Two separate floors, both derived from existing fleet constants, not new hardcodes: 30 min (2x the fastest cowork cron cadence) for malformed JSON, which cannot self-heal and has no legitimate in-flight-write story past that window; 7 days (the drain's own existing DB/processed-file prune cutoff) for well-formed-but-unenveloped files, to give a slow downstream consumer room before being declared stuck.

---

## 1. Verified premise

**Reproduced PO's count, then re-ran it — the inbox moved under us:**
```
$ ls docs/signals/*.json | wc -l          # 51
$ node scripts/agents-flow/drain-signals.js --count-drainable   # drainable_count=2 (run twice, stable)
```
Two files postdate PO's 09:45Z measurement: `ci-red-9c6ef1b7-20260823095251.json` (`from=ci-health-probe`, `type=ci_red`) and `commit-sweep-guard-2026-08-23T095245Z-78710.json` (`from=commit-sweep-guard`, `type=bug-escalation`) — both correctly enveloped, both will drain on the next tick. **The structural claim — the overwhelming majority of the inbox is permanently unreadable — holds** (49/51 = 96%). The exact integer does not, and should never be cited as a fixed constant in the fix or its tests.

**The 49 do not form one population.** Classified every non-drainable file against `isByPathConsumerFile()` + `isDrainableShape()` directly, then diffed against `JSON.parse()` success:

| Class | n | Disposition |
|---|---|---|
| `price_anomaly_*` (by-path, `BY_PATH_CONSUMER_FAMILIES`) | 21 | **Correctly excluded, not litter** — glob-read by Chef EOD (`chef.md:130,153`), `docs/standards/mcp-tools.md` § price_anomaly DUAL-PLANE CONTRACT names this family explicitly and records **4 prior misdiagnoses**. Checked *before* shape logic in `drain-signals.js:212`, so it never even reaches the bug PO's row is about. |
| Well-formed, no envelope (`from`/`source`/`type`/`signal_type` all null) | 26 | Genuinely undrainable litter — `cowork-team-*` (22, dated 2026-07-28→08-08), `cowork-signal-*` (2), `dev-team-bounded1-*`/`dev-team-orphan-adoption-*` (2), `stranded-state-sweep-*` (3, one date overlap not double-counted) |
| Malformed JSON (`JSON.parse()` throws) | 2 | `notebook-prune-dropped-newest-*-2026-08-22T232534Z.json` / `...232535Z.json` — **not a shape-skip at all**, a distinct third failure mode PO's row did not name |

21 + 26 + 2 = 49, plus the 2 drainable = 51. Matches.

**The by-path family's own hazard, distinct from PO's ask:** `price_anomaly_*` has **no age ceiling or prune anywhere in the codebase** (`grep -rln price_anomaly scripts/ docs/policies/ docs/standards/` finds only the drain guard, the drain test, two `.jq` scratch scripts, and the mcp-tools.md contract doc itself — nothing that ever deletes or archives a file after Chef consumes it). Oldest currently on disk is 2026-07-02 (52 days). This is unbounded, silent growth of a *correctly-working* population — a real gap under the row's own `verification_gate` wording, but a different, lower-urgency gap than PO's ask, and touching it means touching the exact family the DO-NOT-RELOCATE marker in `market-watcher/flow/eod.md:31-45` warns against editing casually. **Flagged as a candidate follow-up row, not fixed here** (see §4).

**The 26 orphan-shape files are mostly an already-closed writer defect, not an active leak.** `docs/agents/cowork-team/flow/telemetry.md` has required the enveloped `{from,to,type,payload,priority,createdAt}` shape since commit `d6738df34` (2026-06-05) — nearly 8 weeks before the earliest stuck file. The stuck `cowork-team-*.json` files (07-28→08-08) are flat, pre-envelope shape (`{tick, matched_slots, ..., createdAt}`, no `from`/`type`), meaning a second, non-compliant write path co-existed with the documented one for that ~11-day window and appears to have stopped (no flat-shape file postdates 08-08; the two newest inbox files today are both correctly enveloped). **Root cause of the 26 is closed or dormant; the fix these files need is disposal/escalation, not a writer patch.**

**The 2 malformed files are an active, undetected, ongoing bug — worse than the 26.** Root-caused to `scripts/agents-flow/notebook-auto-prune.sh:574-575`:
```bash
SENTINEL_SECTION_COUNT="$(echo "$SECTIONS_WITH_TS" | cut -d: -f2 | grep -c "^${NSO_SENTINEL_KEY}\$" 2>/dev/null || echo 0)"
```
`grep -c` prints `0` **and exits 1** when the count is zero — the classic `grep -c ... || echo 0` trap — so the `||` fires too, and the substitution captures `"0\n0"` (two lines). That value is spliced unquoted into the heredoc at line 380 (`"sentinel_section_count": $SENTINEL_SECTION_COUNT,`), producing a syntactically invalid JSON body — confirmed at both stuck files (`jq` / `JSON.parse` both fail at the exact stray `0,` line). This writer path has **zero test coverage of the emitted JSON's validity** (`grep -n "sig_file\|jq empty" notebook-auto-prune.test.sh` — no hits) and will keep firing every time a notebook-prune drop has zero sentinel sections, unboundedly. **Out of this row's file scope (not in PO's `files[]` list) — flagged for PO/PM to route as its own fix, not touched here.**

---

## 2. Decision: age-bounded escalation on the discriminator, not a reader-widening. Reject blanket envelope-synthesis.

**Why not PO's option (ii) (widen the reader to synthesize an envelope from filename+mtime):** this is the exact move `docs/standards/mcp-tools.md`'s DUAL-PLANE CONTRACT section says has already produced 4 false "fix" attempts on the `price_anomaly_*` family — any predicate that infers drainability from filename shape risks matching a currently-protected by-path family the moment its naming pattern happens to look signal-like, or missing a future one. `isDrainableShape()`/`isByPathConsumerFamilies()` stay byte-for-byte unchanged.

**Why not "just fix the writers" (part of PO's option (i)) as the whole fix:** proven insufficient by the evidence itself — the 26-file backlog shows a writer defect can close (telemetry.md, 06-05) and its wreckage still sits unrecovered 11 weeks later with zero mechanism to notice; the 2-file backlog shows a *second, currently undetected* writer defect (notebook-auto-prune.sh) is producing the identical kind of stuck file right now. Any fix that only patches known writers will be blind to the next one. The inbox itself needs a self-defending floor.

**Decision — PO's option (iii), made concrete and measured against live data:** add one age-bounded, one-shot, dedup'd escalation path inside `drain-signals.js`'s existing per-file classification loop, checked immediately after the two existing guards (by-path exemption, then shape/parse), so a file resolves to exactly one of four dispositions every tick:

1. **DRAINED** — passes `isDrainableShape()` → unchanged.
2. **BY-PATH-EXEMPT** — matches `BY_PATH_CONSUMER_FAMILIES` → unchanged, never escalates (this is the discriminator PO's row demands — by-path files are excluded from the *entire* escalation mechanism, not merely delayed).
3. **MALFORMED** — `JSON.parse()` throws — **NEW**: escalate once, after a 30-minute mtime-age floor.
4. **ORPHAN (no envelope, non-by-path)** — well-formed, fails `isDrainableShape()` — **NEW**: escalate once, after a 7-day mtime-age floor.

Both floors are read from existing fleet constants, never a fresh hardcode: 30 min = 2x the fastest live cowork cron cadence (`*/15 2-8 * * 1-5` in `docs/data/cowork-schedule.json`), matching the "2x-cadence freshness assertion" pattern PO's own D4 ruling this session already established as the fleet's convention for "long enough that no legitimate in-flight write is still open"; 7 days = the identical constant `drain-signals.js:337` already uses for its own DB/processed-file prune (`7 * 864e5`) — no second cutoff invented for the same directory.

---

## 3. Design

**3.1 — Escalation-dedup ledger, new table in the same `signals.db` the script already opens** (no new file, no new dependency):
```sql
CREATE TABLE IF NOT EXISTS signal_inbox_orphans (
  basename       TEXT PRIMARY KEY,
  category       TEXT NOT NULL CHECK (category IN ('malformed','orphan-no-envelope')),
  first_seen     TEXT NOT NULL,
  escalated_at   TEXT
);
```
Per tick, per non-drainable non-by-path file: `INSERT OR IGNORE` a row with `first_seen=NOW` if absent. If a row exists, `escalated_at IS NULL`, and `NOW - first_seen >= floor(category)` → emit the escalation signal (below), then `UPDATE ... SET escalated_at = NOW`. Already-escalated rows are skipped silently — one escalation per stuck file, ever, not one per tick. On each run, `DELETE FROM signal_inbox_orphans WHERE basename NOT IN (<current dir listing>)` — the file left the top-level inbox (drained, manually removed, or finally fixed upstream), its ledger row is stale, prevents unbounded ledger growth. Same table-per-directory scoping discipline as `signals_processed`; `signals.db` is already gitignored (UC-GCP-P2), so this adds zero commit-surface.

**3.2 — Escalation is itself a normal, self-consistent drainable signal** (no new transport, no MCP-tool call from a bare `node` process — scripts in this repo have no `call_tool` access, confirmed by every existing diagnostic in this file going to `console.error`/stdout, never `send_telegram`):
```json
{
  "from": "drain-signals",
  "to": "po",
  "type": "signal-inbox-orphan-escalation",
  "priority": "medium",
  "payload": {
    "basename": "<stuck file>",
    "category": "malformed" | "orphan-no-envelope",
    "age_minutes_or_days": <n>,
    "first_seen": "<iso>",
    "detail": "<JSON.parse error message, or 'no from/source/type/signal_type after Nd'>"
  },
  "createdAt": "<now>"
}
```
Written to `docs/signals/signal-inbox-orphan-<basename-safe>-<ISO>.json` in the SAME pass 2 write loop (`fs.writeFileSync`) already used for `.dest` — it is a plain envelope, so it will be picked up and routed to PO on the *next* drain tick like any other signal, closing the loop without a second delivery mechanism. Add one `ROUTING_TABLE` row (`{ type: 'signal-inbox-orphan-escalation', from: 'drain-signals', route: 'PO Step 0-SIG' }`) per the file's own "edit the spec, then the mirror, same commit" rule — it would fall through to the existing "any other" default correctly either way, but the table's own convention wants every known type listed explicitly.

**3.3 — Writer-side asymmetry (PO's stated root cause) gets one doc line, not a new gate.** `docs/agents/cowork-team/flow/spawn-fanout.md` and every other signal-emitting flow doc currently have no single place that states "emit an envelope OR be on the by-path allowlist, or your file becomes permanent unescalated litter until this fix." Add that one sentence, pointing at `docs/standards/mcp-tools.md` § price_anomaly DUAL-PLANE CONTRACT (extend that section — it is already the canonical "read this before you touch the undrained floor" doc, do not create a second one) and cross-reference the new escalation mechanism, so a future writer bug produces one escalation signal, not a sixth misdiagnosis cycle.

**3.4 — Stale citation fix, same files PO already scoped.** `docs/agents/cowork-team/flow/spawn-fanout.md:55,464` cites `docs/signals/cowork-team-2026-07-30T001827Z-alertcmd-session-id-gap.json` by its pre-drain path — PO's own D3 this session already moved that file to `processed/` (fingerprint basis: raw-bytes, non-standard per D3's own note). Update both citations to the `processed/` path (or annotate "already drained, see PO decision journal D3") while this row is in the same file.

**Explicitly not designed here (deferred, named for a follow-up row):**
- `price_anomaly_*` unbounded growth (§1) — needs an archival/cleanup step for market-watcher's EOD write, not an escalation (the family is *correctly* consumed, just never cleaned up). Touching `eod.md`'s DO-NOT-RELOCATE contract inside a P1 "fix the drain floor" row risks exactly the blanket-widening PO forbade.
- `notebook-auto-prune.sh:574-575`'s `grep -c ... || echo 0` bug (§1) — a live, currently-undetected writer defect, but not in this row's `files[]` scope. The escalation mechanism in §3.2 will surface every future instance of it (as `category=malformed`) the first time it fires after this ships, which is itself the loud signal PO's `verification_gate` demands — but the root-cause one-line fix (`grep -c ... ; [ "$?" = 1 ] && v=0 || v=$(...)`, or simpler: drop the trailing `|| echo 0` and pre-seed the variable) belongs to whoever owns that script.

---

## 4. Migration cost

- `scripts/agents-flow/drain-signals.js` — extend the existing pass-1 classification loop (`candidates` build, `drain-signals.js:208-265`) with the malformed/orphan branches + ledger read/write; net addition, no restructuring of the existing durable-append-before-destructive ordering (§0a-1 stays untouched — this is a *new*, independent classification outcome, not a change to the drain/prune/dedup path).
- `docs/agents/dev-team/flow/drain-signals.md` — new §0a-1a subsection documenting the two floors, the ledger table, and the escalation payload shape; spec-first per the file's own "edit the spec, then the script" rule.
- `docs/standards/mcp-tools.md` — extend the existing price_anomaly DUAL-PLANE CONTRACT section with one paragraph on the corrected 21/26/2 split and a pointer to the new escalation mechanism (keeps the single "read this first" doc single).
- `docs/agents/cowork-team/flow/spawn-fanout.md` — 2-line stale-citation fix + 1-line writer-contract pointer.
- No `orchStateSchema.ts` change, no schema migration, no new dependency (sqlite already in the toolchain via `sqlite3` CLI the script already shells out to).
- Classification: bug-fix, in-zone (`scripts/agents-flow/` + existing flow/standards docs, no new primitive) → **BUILD-STANDARD: not-applicable** per the Standard Detection matrix. Scale: SPRINT-S.

---

## 5. Files

- `scripts/agents-flow/drain-signals.js` — ledger table + malformed/orphan escalation branches + `ROUTING_TABLE` row.
- `docs/agents/dev-team/flow/drain-signals.md` — §0a-1a spec addition (spec-first, per file convention).
- `docs/standards/mcp-tools.md` — extend § price_anomaly DUAL-PLANE CONTRACT with the corrected population split + escalation pointer.
- `docs/agents/cowork-team/flow/spawn-fanout.md` — stale citation fix (lines 55, 464) + writer-contract pointer.
- **Unchanged, deliberately out of scope:** `isDrainableShape()`, `isByPathConsumerFamilies()`, `BY_PATH_CONSUMER_FAMILIES` (the discriminator itself, per PO's hard constraint); `market-watcher/flow/eod.md` (DO-NOT-RELOCATE contract); `scripts/agents-flow/notebook-auto-prune.sh` (separate live bug, flagged §3.4/§1, not in `files[]`).

## 6. DDD / zone

Zone: `cross-service/` (matches the row's own zone field) — `scripts/agents-flow/` is fleet-shared tooling, not a single `apps/<service>`; the touched flow/standards docs are likewise cross-cutting (dev-team + cowork-team flow, mcp-tools standard). Per zone-detect Tier 2 ("files span >1 zone or root/scripts/ → route to `developer` generic"), and consistent with `drain-signals.js`'s own prior fix history (every `FIX-DRAIN-*` commit on this file was a generic `developer`/`dev-team` fix, never a `dev-<service>` one) — route to `developer`.

## 7. Acceptance criteria

1. Live re-run of `--count-drainable` immediately before/after this ships stays unchanged (0 behavior change to the existing drain/prune/dedup path) — proves the fix is additive only.
2. Fixture: an 8-day-old well-formed file with `from`/`source`/`type`/`signal_type` all null → one drain run emits exactly one `signal-inbox-orphan-escalation` signal (`category="orphan-no-envelope"`) and writes one `signal_inbox_orphans` ledger row with `escalated_at` set; a second drain run with no further passage of time emits zero additional escalations for that file.
3. Fixture: a malformed-JSON file with mtime 45 min old → escalates (`category="malformed"`) on the run that observes it past the 30-min floor; the SAME file at mtime 10 min old does not escalate yet (proves the floor, not "escalate on first sight").
4. Fixture: a `price_anomaly_`-prefixed file aged 90 days, well-formed, no envelope → zero ledger row, zero escalation, ever (proves the by-path exemption is checked before, and takes priority over, the new age logic — the discriminator PO demanded).
5. Applied to the LIVE inbox on first real run: the existing 26 orphan-shape + 2 malformed files (all already past both floors) produce exactly 28 escalation signals in one tick, each routed to PO's Step 0-SIG queue, and zero of the 21 `price_anomaly_*` files escalate.
6. `orchStateSchema.ts` diff is empty for this task (no schema touched, mirrors §2's own constraint).
