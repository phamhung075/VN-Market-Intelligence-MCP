# PO Notebook

## 2026-08-24T20:53Z — 16-envelope Step 0-SIG: 3 mints, 8 folds, 1 dedup-close, inbox 16→0

Prior 18:33Z section dropped whole (OVERWRITE class, preamble+1 section, ≤50L). Full reasoning: `docs/agent-memory/decisions/triage-20260824T2030Z-po.md`.

### The caller's inbox inventory was wrong, and the missing envelope was the useful one
Spawn prompt said 2x sweep-guard / 2x cowork-fire and never mentioned an `architecture_brief`. Live read: **4** sweep-guard, **3** cowork-fire, and one `agents-architect` brief that closed `review[24]` — a row whose `next_agent` was **`po`**, i.e. work already waiting on me. Acting on the handed list would have dropped it. **The self-read is not ceremony; it is the only reason that row moved.**

### Two caller premises refused, both falsified at source
1. **"The incident lane runs FIRST each tick; the fast lane is idle."** It has no caller. `grep -o "devteam-backlog-claim-[a-z0-9-]*\.jq" docs/agents/dev-team/flow/main.md | sort -u` → 4 of 5 scripts on disk; incident-lane-consumer is absent, and `grep INCIDENT_CAP|po_expedited` on main.md returns nothing. RLC refuses the field by design. So the lane is idle for lack of a **caller**, not marked rows — and the real unblock is `ready[53]` `FIX-DEVTEAM-INCIDENT-LANE-CONSUMER-MAINFLOW` (P0, deps satisfied, RLC position **2 of 76**, unmoved 10 days).
2. **"T3 shares the CCATO P0's `files[]`."** It does not — neither `narrativeTruthProbeAdapters.ts` nor `verdictClassifier.ts` is listed. And that P0's AC-4 rejects rows whose value **matches** a null marker; T3 is a value matching **none**. Opposite directions, not two halves. Minted separately.

### Measure the queue with the consumer's own predicate, not the array index
Caller: "positions 99 and 100 of 111". Replaying RLC's actual eligibility chain: **67 and 68 of 76 eligible** (35 of the 111 fail eligibility). Same conclusion, wrong number — and the wrong number is the kind that gets quoted back later as fact.

### `orch-apply` returned OK and threw my note away
Fold note via zsh single-quoted var → `jq --arg`: exit 0, conservation clean, `occurrence_count` landed **2**, note field landed **empty** (`LEN=0`). Every green signal was green. Only a **content** readback caught it. Same root cause as the CLEAR block, which also failed verbatim today (`control characters U+0000–U+001F`, inbox untouched at 16, and the block ends `|| true` so exit status was 0). Switched all prose writes to `jq --rawfile` from a file. **Generalisable: for any write carrying agent-authored prose, the exit code, the lane counts and the conservation check are all blind — read back the field.**

### Re-measured a breach before minting for it, and there was nothing left to mint
`context_bloat_breach` said `unified-agent.md` = 106L/17956B over a 12000B cap. Live: **31L/6876B, under both caps.** The routing table's happy path would have produced a CHORE for a condition that no longer exists. But it resolved by DESTROYING content: git shows 86L/11936B@`69afa5d12` → 31L/6876B@`4fbd578cb`, **55L/5060B gone in one pass**. New finding for the AC-6 row — **overshoot**: overage was 5956B, the pruner shed 11080B by eating three sections in sequence instead of stopping at the first drop that cleared the cap. Fix must re-check the cap after EACH drop. Recoverable via `git show 69afa5d12:…`.

### The prose ceiling blocked triage actuation three times, for two different reasons
(a) manual-dispatch-sweep's Step-2 stamp on its own #1 candidate — already tracked, folded as occurrence 2, and the wedge is now **confirmed deterministic across sessions** (two runs, same pick, same abort, no state change; starvation set 106→127 in 9h with zero rows stamped). (b) A genuine 3295B fold on an 11321B row. Applied that row's own AC-4 by hand — fell through to the next stampable candidate rather than ending with nothing actuated.

### Carry-over
- **3 mints all in `backlog[]` at 540/541/542** — `dev-mcp-server`, `developer`, `qa`. None is dispatchable by being minted; state real queue positions, never "unblocked".
- **`ready[53]` is the highest-leverage row on the board right now.** It is 1 file (`docs/agents/dev-team/flow/main.md`), P0, deps satisfied, RLC position 2 — and until it lands, every `po_expedited_at` I write is inert.
- The 2 Tier-1 expedite stamps are **pre-loading**, not dispatching. Do not report them as an unblock.
- `VERIFY-CCATO-MCP-TRUTHGATE-REALDATA` AC-2 forbids running DoD (e) against the live board — 108 `ntg-*` rows are open-P0 evidence and an extra append contaminates the count.
- Did NOT push, did NOT re-arm `com.vn-market.fleet-push` (not-loaded is intended), did NOT dispatch the existing BATCH of 6 individually, did NOT touch `.head` (idle, left idle).
