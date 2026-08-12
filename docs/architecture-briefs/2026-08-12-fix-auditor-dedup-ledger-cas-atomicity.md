# Auditor Dedup-Ledger — No CAS/Merge Guarantee Across Concurrent Writers

**Date:** 2026-08-12T13:19:43Z · **Author:** agents-architect · **Type:** FIX-DESIGN (recurring-bug root-cause, 2-instance escalation threshold met), size S, zone `scripts/emit-audit-signal.sh`
**Task:** router-dispatched (`intent:agents-architect:dedup-ledger-atomicity`) — `feedback_auditor_dedup_ledger_key_dropped_and_format_reverted.md`'s own "How to apply" 2-instance rule
**File touched by this brief's recommendation:** `scripts/emit-audit-signal.sh` (INFRASTRUCTURE section: `_ledger_read`/`_ledger_write`/`_ledger_prune_and_lookup`/`_ledger_upsert`) + `scripts/emit-audit-signal.test.sh` (new coverage). No new file needed — see §2.3 for why this is NOT a generalized `ledger-apply.sh`.
**Evidence file (untouched):** `docs/data/auditor-dedup-ledger.json` — left exactly as found; not hand-patched (per dispatch instruction — it is the live reproduction of the bug, not something to repair by hand).

---

## 1. Root cause — confirmed by reading the actual write path, not taken on the report's word

`scripts/emit-audit-signal.sh` is the sole writer of `docs/data/auditor-dedup-ledger.json`, called from 6 system-auditor sites (Tier-1 general A-xx, Tier-1 A-20, Tier-2, Tier-3, D-IMPROVE, D-BCTC-EVAL). Its own header already documents the ledger as deliberately outside `orch-apply.sh`'s CAS-guarded write path ("LEDGER ... separate sidecar, NOT part of orch-state.json, NOT routed through orch-apply.sh"). I read `_ledger_read()`/`_ledger_write()`/`_ledger_prune_and_lookup()`/`_ledger_upsert()` (lines ~698-758) directly:

- `_ledger_write()` (line 710) is a bare `mktemp` + `mv` in the same directory — atomic as a *rename*, but with **zero CAS-guard, zero mtime check, zero merge**. It blindly persists whatever full in-memory map the caller built from its OWN earlier read.
- **One invocation performs TWO independent read-modify-write cycles, not one:** `_check_dedup_and_maybe_send()` (line 489) always calls `_ledger_prune_and_lookup()` first — this reads the file, prunes stale (>7d) entries, and **writes the pruned map back unconditionally, every single invocation, even a pure no-op SKIP-dedup cycle** (comment at line 718 confirms this is deliberate: "writes the pruned ledger back unconditionally"). Then, *only if* the dedup decision says "send," it separately calls `_ledger_upsert()` (line 752), which **re-reads the file a second time** and writes again.
- Neither write checks whether the file changed between its own read and its own write. Two concurrent `emit-audit-signal.sh` invocations (confirmed-live pattern in this repo: system-auditor already runs a "peer session" fire-election at `docs/agents/system-auditor/flow/main.md:262`, i.e. more than one system-auditor session is routinely live at once, and the 6 call sites above are NOT mutually exclusive within one session either) can each read the file in the same window, each compute a full in-memory map from THAT stale snapshot, and then race to `mv` last — whichever `mv` lands last wins outright and **silently drops every key the losing writer's snapshot didn't have**. This is a textbook lost-update race, not a merge.

**This fully explains both escalation instances without needing extra hypotheses:**
- I RAW-diffed the current working tree against the last commit that touched the file (`71dc2af9c`, Tier-1 c29, 2026-08-11T16:12:54Z) myself: `db_integrity_breach:daily_ohlcv:OHLCV_H_L_ZERO`, `mem_pressure:mcp-server:A-30`, `microservice_degraded:mcp-server:A-21` are present in the commit and absent from the working tree — exactly the 3 keys the dispatch reported. 15 legitimate new keys (not 10 — count has grown since the dispatch was written; `auditor-a29-fire-gap:*` ×8, `microservice_degraded:rag-service:A-30:*` ×2, others) are correctly present, consistent with "the writer(s) add new findings correctly, they just also clobber whatever their own in-memory snapshot didn't have."
- **The format flip needs NO second-writer hypothesis at all — it is a same-script internal inconsistency, and I can point at the exact two lines that cause it:** `_ledger_prune_and_lookup()`'s write uses `jq -c '.pruned'` (line 745, **compact**), while `_ledger_upsert()`'s write uses plain `jq --arg k ... '.[$k] = {ts:$ts, sev:$sev}'` (line 755, **no `-c` flag → jq's pretty-printed default**). Since the prune-write ALWAYS runs first and the upsert-write runs SECOND only when the dedup decision fires, the file's on-disk format at any given moment is simply "whichever of these two call sites happened to run last" — confirmed against the live evidence: committed HEAD is compact (a cycle that only pruned, no upsert, or an upsert-then-a-later-prune-only cycle ran last) and the working tree is pretty (an upsert ran last there). The direction flipping between the two escalation instances is exactly what you'd expect from "whichever of 2 code paths in the SAME script ran last," not "two different serializers migrating one way."

## 2. Fix design

### 2.1 Collapse the two per-invocation write windows into one CAS-guarded write

Add a single write primitive, mirroring the mtime-CAS-retry shape **already proven in this exact file** for the orch-state E-3 path (`_e3_write_row()` / `_orch_apply_invoke()`, lines 625-791) — right-sized down to what this flat sidecar actually needs (no Zod schema, no conservation-check; those are `orch-apply.sh`-specific and don't apply to a `{dedup_key: {ts, sev}}` map):

```bash
_ledger_apply() {
  # $1 = jq filter (string). Remaining args = jq --arg/--argjson bindings.
  # Re-reads the live ledger FRESH on every attempt (same idiom as
  # _e3_read_candidate() re-reading $ORCH_STATE_FILE fresh per CAS attempt).
  local filter="$1"; shift
  local dir attempt mtime_before mtime_after raw candidate tmp
  dir="$(dirname "$LEDGER_FILE")"
  for attempt in 1 2 3; do
    mtime_before=$(get_mtime "$LEDGER_FILE" 2>/dev/null || echo "")
    raw=$(_ledger_read)
    candidate=$(printf '%s' "$raw" | jq -c "$@" "$filter" 2>/dev/null)
    [ -z "$candidate" ] && continue   # self-heal, never write empty/malformed — retry
    tmp=$(mktemp "$dir/.auditor-dedup-ledger-XXXXXXXX.json")
    printf '%s\n' "$candidate" > "$tmp"
    mtime_after=$(get_mtime "$LEDGER_FILE" 2>/dev/null || echo "")
    if [ "$mtime_before" = "$mtime_after" ]; then
      mv "$tmp" "$LEDGER_FILE"
      return 0
    fi
    rm -f "$tmp"   # peer wrote in our window — retry against a fresh read
  done
  return 1   # CAS-exhausted (rare — tiny file, fast writes)
}
```

(`get_mtime()` is the same portable macOS/Linux `stat -f/-c` helper already defined in `scripts/orch-apply.sh:78` — copy it in, do not source that script, since the two files must stay independently invocable per the header's existing "NOT routed through orch-apply.sh" contract.)

Refactor `_ledger_prune_and_lookup()` to become **read-only** (compute prune + lookup in memory, set `LEDGER_ENTRY_TS`/`LEDGER_ENTRY_SEV` globals, no write). Then the ONE persisted write per invocation happens at the point the dedup decision is already known — folding "prune" and "upsert-if-applicable" into a single `_ledger_apply()` call with a filter parameterized by a `$do_upsert` boolean:

```jq
def to_epoch: ...;  # unchanged from current _ledger_prune_and_lookup
(with_entries(select((.value.ts // "1970-01-01T00:00:00Z" | to_epoch) >= $cutoff))) as $pruned
| if $do_upsert then $pruned + {($key): {ts:$ts, sev:$sev}} else $pruned end
```

This halves write frequency (today: 1-2 writes/invocation; after: exactly 1) and — combined with `-c` used uniformly at this single remaining write site — **kills the format flip as a side effect**, not a separate patch.

**Note on retry semantics (consistency with existing precedent, not a new gap):** the dedup decision itself (fresh-key / escalation / no-op, and the `$ts`/`$sev` values) is computed once, from one point-in-time read, and re-applied verbatim on each CAS retry — the retry only re-reads the *base* map fresh, exactly mirroring `_e3_write_row()`'s own `_e3_read_candidate()` behavior in this same file (candidate row fixed, base document re-read fresh per attempt). No new design pattern is introduced.

### 2.2 CAS-exhaustion degrades gracefully — do not turn a best-effort cache into a new fail-loud path

If all 3 attempts collide (rare — the file is small, writes are sub-millisecond), log a new marker `[emit-signal] WARN ledger-cas-exhausted dedup_key=<k>` and **still proceed** with the Telegram-send decision computed from the pre-write read; do not abort the invocation. This preserves the script's own explicit Hard Constraint 4/5 design invariant: the 7-day ledger gates E-2/Telegram only and is deliberately self-healing/best-effort ("Missing/malformed on read -> treated as empty (self-heal, never fail loud)" — header line 121); E-1/post_agent_signal and E-3/signal_queue are the ONLY fail-loud contracts in this script. A dropped ledger-write on exhaustion means, worst case, one duplicate Telegram alert next cycle — not a lost finding (E-1/E-3 already fire unconditionally regardless of ledger state, per FR-4, header lines 103-115). This is a strictly smaller blast radius than today's silent full-key-loss.

### 2.3 Why not reuse `orch-apply.sh` wholesale, and why not a new generalized `ledger-apply.sh`

- `orch-apply.sh` is `orch-state.json`-specific: Zod schema validation, lane-coherence checks, conservation circuit-breaker, diff-based `updated_at` stamping — none of which have a meaning for a flat `{dedup_key: {ts, sev}}` map. Routing this ledger through it would require either bypassing most of its stages (pointless coupling) or inventing a parallel schema for a 2-field value shape — not worth the machinery.
- A brand-new generalized `scripts/ledger-apply.sh` was considered (there ARE other flat-JSON sidecars with the identical bare-tmp+mv pattern — `auditor-tier1/tier2-last-healthy.json` via `_write_heartbeat()` in `scripts/agents-flow/auditor-tier1-probe.sh:678`). I did NOT recommend generalizing now: those heartbeat files are explicitly documented as **single-authorized-writer** by their own header comment ("`_write_heartbeat()` below is the ONLY authorized writer of ..."), so they are not currently exposed to the multi-writer race this brief fixes. Generalizing speculatively for files with no confirmed exposure is scope creep beyond this ticket. **Flagging for future review, not fixing here:** if any of those heartbeat sidecars ever gain a second legitimate writer, re-open this question — at that point extracting the `_ledger_apply()` primitive above into a shared script becomes worth the coupling cost.
- Commit-per-cycle (the dispatch's option (b)) was considered and rejected as the primary mechanism: it gives forensic recovery *after* a clobber already happened (which is in fact how both instances were even detected — this file already rides along in system-auditor's periodic notebook commits) but does not prevent the silent loss itself, and adding an explicit extra commit step per emit invocation is heavier than a CAS-retry and contradicts this script's own stated design choice to keep the ledger a lightweight non-git-routed sidecar (header line 118: "NOT part of orch-state.json, NOT routed through orch-apply.sh"). The CAS-retry fix in §2.1 eliminates the failure mode at the source; the existing incidental notebook-commit ride-along remains as an unchanged, orthogonal safety net.

## 3. Test coverage to add (`scripts/emit-audit-signal.test.sh`)

1. **T-LEDGER-CAS-RETRY**: stub `get_mtime`/`_ledger_apply`'s internal read to simulate one collision then success (mirrors existing T9 CAS-retry shape for the E-3/orch-state path, lines 268-289) — asserts exactly 2 attempts, final content correct.
2. **T-LEDGER-CAS-EXHAUSTED**: 3x forced collision — asserts the `ledger-cas-exhausted` marker fires AND the invocation still returns success (E-1/E-3 unaffected) — proves §2.2's graceful-degrade contract, not a silent pass.
3. **T-LEDGER-CONCURRENT-WRITERS** (the positive control this whole fix exists for — none of the current 26+ tests exercise this): spawn 2 real background `emit_signal` invocations (not stubbed) against a **shared** scratch `EMIT_SIGNAL_LEDGER_FILE` fixture with 2 *different* dedup keys, `wait` for both, then assert **both** keys are present in the final file. This is the direct regression test for the exact clobber this brief fixes — today's suite has CAS-retry coverage only for the orch-state E-3 path (T9/T10/T15), none for the ledger.
4. **T-LEDGER-FORMAT-CONSISTENT**: after any invocation that upserts, assert the on-disk file is compact single-line (`jq -c` output, no embedded newlines) — regression guard for §2.1's format-flip fix.

## 4. Explicitly not in scope

- Retrofitting `auditor-tier1/tier2-last-healthy.json`'s heartbeat writer with the same CAS primitive — no confirmed multi-writer exposure today (§2.3).
- Re-auditing the other 5 emit-audit-signal.sh call sites' dedup_key naming/collision semantics — out of this bug's blast radius (concurrency-safety of the *write*, not correctness of the *key*).
- The already-tracked, separate `FIX-COWORK-DELIVERY-PROOF-GATE-ONLY-CATCHES-ROUTERLATCH-NARRATION` exogenous-detection work — unrelated mechanism, different failure class.

## 5. DoD / verification (for the fanout owner to confirm before closing)

1. `_ledger_prune_and_lookup()` no longer writes to disk (read-only, in-memory prune+lookup).
2. Exactly one `_ledger_apply()` call per `emit-audit-signal.sh` invocation persists the ledger (down from up to 2 today).
3. `_ledger_apply()`'s write path uses `jq -c` uniformly — no code path left using bare `jq` (pretty-print default) against this file.
4. All 4 new tests in §3 pass; full existing suite (26+ cases, including T9/T10/T15/T25/T26/T32 CAS-retry coverage for the unrelated E-3 path) stays green — this is an additive change to the ledger functions only, `_e3_write_row()`/orch-state path untouched.
5. `docs/data/auditor-dedup-ledger.json` itself is left untouched by this fix's implementation — the fix changes the writer, not the artifact; the current working-tree drift (3 dropped keys) is evidence, not something to hand-repair (per dispatch instruction — any hand-merge of the current file is a separate, optional cleanup the fanout owner may do AFTER the fix lands, not part of this brief's DoD).

## 6. RETURN

DONE: Brief authored — root cause is a bare tmp+mv ledger writer with no CAS-guard performing 2 independent read-modify-write cycles per invocation (confirmed live: 3 specific keys dropped between commit `71dc2af9c` and the current working tree, matching the dispatch's report exactly), plus a second, independent same-script bug (inconsistent `jq -c` usage between the two write sites) that explains the format flip without needing a second-writer hypothesis. Fix: collapse to one CAS-guarded write per invocation (mirrors this file's own existing E-3/orch-state CAS-retry idiom, right-sized — no Zod/conservation machinery needed), uniform `-c`, graceful (not fail-loud) degrade on CAS-exhaustion, plus a concurrent-writer regression test the current suite is missing.
NEXT: agent-father — implement §2.1-§2.2 in `scripts/emit-audit-signal.sh` + §3 tests in `scripts/emit-audit-signal.test.sh`. Route to developer if it exceeds agent-father's own direct-edit comfort zone (script logic, not just docs/flow) — either is fine, this is a single-file, self-contained change.
HANDOFF: `docs/architecture-briefs/2026-08-12-fix-auditor-dedup-ledger-cas-atomicity.md`
PIPELINE: continue
