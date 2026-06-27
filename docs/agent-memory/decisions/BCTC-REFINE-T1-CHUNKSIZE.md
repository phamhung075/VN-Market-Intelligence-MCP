# Decision Journal — BCTC-REFINE-T1-CHUNKSIZE

**task-id:** BCTC-REFINE-T1-CHUNKSIZE
**date:** 2026-06-27
**agent:** agent-father
**sprint:** BCTC-REFINE-STALL-RETRIGGER
**commit:** 524a87cc

## Decision

Raise `REFINE_CHUNK_SIZE` from 7 to 12 in the `refine_bctc_md` flow and init files.

## Prerequisite

T0-RESET-GUARD (commit eb607956) is DONE_VERIFIED before this change. The reset-guard
(`has_done_units` check in Phase 0 / `is_first` gate in Phase 2) prevents any chunk-size
increase from causing DONE-unit overwrites. T1 is safe only because T0 is in place.

## Exact edits applied

| File | Line | Old | New |
|---|---|---|---|
| `docs/agents/refine_bctc_md/flow/main.md` | 8 | `REFINE_CHUNK_SIZE=7 un-pushed windows` | `REFINE_CHUNK_SIZE=12 un-pushed windows` |
| `docs/agents/refine_bctc_md/flow/main.md` | 54 | `.slice(0, 7)` (REFINE_CHUNK_SIZE=7) | `.slice(0, 12)` (REFINE_CHUNK_SIZE=12) |
| `docs/agents/refine_bctc_md/init.md` | 55 | `REFINE_CHUNK_SIZE=7 windows per fire` | `REFINE_CHUNK_SIZE=12 windows per fire` |
| `docs/agents/refine_bctc_md/init.md` | 61 | `ONE chunk (≤7 windows) per fire` | `ONE chunk (≤12 windows) per fire` |

4 sites changed. 0 unrelated 7s modified.

## Throughput math

- 2 schedule slots per day (09:00 UTC + 14:00 UTC via cowork-team dispatcher)
- Pre-T2 (single report per fire): 2 slots × 12 windows = 24 windows/day
- After T2 lands (multi-slot parallelism): throughput scales further per T2 spec

## Safety ceiling rationale (architect-specced, ceiling=12)

- Token budget: 12 × 8.9k avg tokens/window = 106.8k < Haiku 200k ctx at 75% budget
- Timeout budget: 12 × ~39s avg/window = 468s << 1800s lock TTL (task_claim)
- Do NOT exceed 12 without a new architect sizing review

## Files NOT touched

- `docs/data/orch/orch-state.json` — NOT touched (router flips T1→DONE after RAW-verify)
- `docs/data/orch/orch-state.json.head` — NOT touched
- T0 reset-guard logic (`has_done_units` / `is_first`) — NOT modified
