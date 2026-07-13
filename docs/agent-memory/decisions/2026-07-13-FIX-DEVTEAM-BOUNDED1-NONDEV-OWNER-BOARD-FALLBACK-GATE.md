# Decision Journal — FIX-DEVTEAM-BOUNDED1-NONDEV-OWNER-BOARD-FALLBACK-GATE

**task-id:** FIX-DEVTEAM-BOUNDED1-NONDEV-OWNER-BOARD-FALLBACK-GATE
**date:** 2026-07-13
**dispatcher:** router → developer (zone `scripts/` = tooling, no dev-* specialist zone match — developer implements directly per zone_dispatch fallback)
**status:** REVIEW (flipped by this STEP, awaiting QA merge gate — not self-verified to DONE_VERIFIED)

## Context
`scripts/devteam-backlog-promote-bounded1.jq`'s `is_non_dev_owner_unrouted($detail_items)` (5th sibling of the
BOUNDED-1 idle-pickup gate family) read **only** `$detail_items[.id].owner` (detail-authoritative). When a backlog
row has NO `backlog-detail.json` entry at all, the detail owner lookup is silently absent, the gate evaluates
NOT-gated, and the row becomes auto-promotable even though its BOARD-level `.owner` already names a non-dev
deliberate-launch agent (po/ops/architect/agent-father/cowork-refactory-expert) with `next_agent:null` — the row
then falls through zone-detect's Tier-3 fallback to the generic `developer` placeholder (mis-route). Surfaced
2026-07-13 by the `FIX-DEVTEAM-STATUSFLIP-LANEMOVE-RULE` near-miss (board owner=`cowork-refactory-expert`, no
detail entry); router withheld auto-launch, PO groomed + minted this FIX. Grep-confirmed class size = 9-10 live
backlog rows (no-detail-entry + non-dev board owner + null next_agent).

## Decision
Add `effective_owner($detail_items)` mirroring the `effective_supervised`/`effective_children` precedence idiom
(keyed purely by `.id`, no `.detail_ref` precondition) but **detail-FIRST / board-FALLBACK** order (the reverse of
`effective_depends_on`'s inline-first order), because detail is the authoritative owner source when it exists.
Rewire `is_non_dev_owner_unrouted` to read `effective_owner()` instead of the raw detail lookup.

**Before:**
```jq
def is_non_dev_owner_unrouted($detail_items):
  if (.id == null) then false
  else
    ($detail_items[.id].owner) as $owner
    | ( ($owner != null) and (($owner | type) == "string") and ($owner != "") ) as $owner_present
    | if ($owner_present | not) then false
      else
        ($owner | test("^dev(-|$)|^developer$"; "i")) as $is_dev_owner
        | if $is_dev_owner then false
          else ((.next_agent // "") == "")
          end
      end
  end;
```

**After:**
```jq
def effective_owner($detail_items):
  (if (.id != null) then $detail_items[.id].owner else null end) as $detail_owner
  | if ($detail_owner != null) and (($detail_owner | type) == "string") and ($detail_owner != "") then
      $detail_owner
    else
      (.owner // "")
    end;

def is_non_dev_owner_unrouted($detail_items):
  (effective_owner($detail_items)) as $owner
  | ( (($owner | type) == "string") and ($owner != "") ) as $owner_present
  | if ($owner_present | not) then false
    else
      ($owner | test("^dev(-|$)|^developer$"; "i")) as $is_dev_owner
      | if $is_dev_owner then false
        else ((.next_agent // "") == "")
        end
    end;
```

Conservative defaults preserved exactly per spec: dev-role owner (either place) → NOT gated; empty owner in BOTH
places → NOT gated; non-empty board `.next_agent` → NOT gated; **detail owner present stays authoritative over
board owner** (regression guard — `effective_owner` only falls back to board when the detail owner is
absent/empty, never overrides a present detail value).

## Fixtures / verification (real PASS output, `scripts/audits/devteam-bounded1-detail-disposition-gate-verify.sh`
extended with AC-5/AC-6/AC-7a/AC-7b)
```
[PASS] AC-1: detail-DEFERRED row FU-CHEF-MARKER-INFLOW NOT promoted (picked='<none>')
[PASS] AC-2: non-dev-owner/null-next_agent row FIX-BLOAT-HOOK-JUSTIFY-SUPPRESS NOT promoted (picked='<none>')
[PASS] AC-3: plan_only row FIX-AUDITOR-SBVFX-SLA-POSTMARKET-TOLERANCE NOT promoted (picked='<none>')
[PASS] AC-4: non-dev-next_agent/null-board-next_agent row FIX-ERRAUDIT-W3-MCP-P2 NOT promoted (picked='<none>')
[PASS] AC-5: no-detail-entry non-dev-board-owner/null-next_agent row FIX-VERIFY-DEPLOY-SHA-BENIGN-DOC-DRIFT NOT promoted (picked='<none>')
[PASS] AC-6 (synthetic): no-detail-entry non-dev-owner + non-empty next_agent row IS still promoted (picked='ZZ-SYNTH-AC6-NONDEV-OWNER-ROUTED')
[PASS] AC-7a (synthetic): detail owner (non-dev) wins over dev-role board owner — NOT promoted (picked='<none>')
[PASS] AC-7b (synthetic): detail owner (dev-role) wins over non-dev board owner — still promoted (picked='ZZ-SYNTH-AC7B-DETAIL-WINS-REV')
[PASS] control: clean row TASK17-FOREIGN-FLOW still promoted (gates do not over-block)
EXIT: 0
```
- **(a)** AC-5 = the requested "no-detail + non-dev board owner + null next_agent → gated" case. Two clean live
  rows exist (`FIX-VERIFY-DEPLOY-SHA-BENIGN-DOC-DRIFT` owner=`ops`, `FIX-POSTCYCLE-STEP45-NB-WRITE-AC3`
  owner=`agent-father`) — both confirmed, against `git show HEAD:scripts/devteam-backlog-promote-bounded1.jq`
  (pre-fix), to be WRONGLY promoted pre-fix and correctly withheld post-fix (true regression-catching fixtures,
  not false-green).
- **(b)** AC-6 = "no-detail + non-dev board owner + non-empty next_agent → NOT gated". No clean live example exists
  (the 3 live rows matching this owner/next_agent shape all also carry `supervised:true` from an unrelated gate,
  grep-confirmed) — synthetic `ZZ-SYNTH-*` fixture used instead, confirmed identical pre-fix/post-fix (promoted
  both times — proves the new gate does not over-block).
- **(c)** AC-7a/AC-7b = "detail owner present stays authoritative over board owner", both directions. No live row
  has a detail owner that actually conflicts with its board owner (`OPS-BCTC-REFINE-REPASS-NONBANK-5T` is the only
  owner mismatch in live data and both sides are non-dev, so it can't distinguish precedence direction) — synthetic
  fixtures used. AC-7a (detail=`po` non-dev vs board=`developer` dev-role) confirmed identical pre-fix/post-fix
  (NOT promoted both times — detail already won pre-fix since the old code never read board at all). AC-7b
  (reverse) confirmed identical pre-fix/post-fix (promoted both times).
- Dry-run against LIVE `docs/data/orch/orch-state.json` + `docs/data/orch/archive/backlog-detail.json`: full-doc
  diff after running the updated jq is empty (`IDENTITY` no-op) — this task's own row is `in_progress`, WIP≥1,
  so the BOUNDED-1 gate self-no-ops as expected; no live mutation risked.

## Follow-up
- PO's standing consolidation directive (`SPIKE-BOUNDED1-ELIGIBILITY-CONTRACT-REVIEW`, supervised/parked) still
  recommends folding all 5 sibling `select()` gates into one `is_detail_non_autodispatchable` predicate — this fix
  does not attempt that refactor (scoped fix only, per dispatch spec); the SPIKE remains the right place to decide
  refactor-vs-status-quo for the next (6th) field.
- No deploy required — local jq tooling script + bash test harness only, nothing to rebuild.
