# Decision Journal — PO ruling · FACTORY-STOCK-vndirect-mapper-tests

**Context:** dev-team Review-Lane SECONDARY-Drain handed this stale `review[]` row (status=REVIEW, `branch:null`, direct-commit, no `next_agent` resolving to qa) to PO for sign-off/triage. Row had sat since 2026-07-24 — 13 days.
**Agent:** po
**Timestamp:** 2026-08-06T20:59Z

---

### RULING po-R1 · po · 2026-08-06T20:59Z
**task-id:** FACTORY-STOCK-vndirect-mapper-tests

**what-done:** Verdict = **DONE_VERIFIED**, moved `review[]` → `done_verified[]`. Every implementer + dispatcher claim re-derived RAW, not banked. Additionally **disproved** the open equivalence question the `review_note` left dangling, and the answer inverts part of the caveat.

**what-considered:**
- **Rework / send back to dev.** Rejected. The scoped DoD is met and the tests are *correct*: `go test ./pkg/primitive/vndirect-quote-mapper/... -count=1` → `ok` (re-run by me, not trusted from the note), 13/13 subtests, and each DoD case-class is present by name — `STOCK_on_{HOSE,HNX,UPCOM}_applies_1000x_scale`, `INDEX_on_{HOSE,HNX}_does_NOT_apply_scale`, `STOCK_on_non-VN_floor_does_NOT_apply_scale`, `empty_data_array_returns_nil_quote_not_error`, `malformed_JSON_{syntax_error,wrong_type}_returns_error`, `null_change_and_pctChange_maps_to_nil_pointers`, `partial_null`, `omitted_change_fields`, `zero_change_is_NOT_nil_genuine_flat_day`. Commit `49bc309a3` is ancestor-confirmed on HEAD; tree clean under `apps/stock-price/`.
- **Hold BLOCKED until the served path is rewired.** Rejected, and this is the decisive call. `orchStateSchema.ts` §13 records that `deps_satisfied()` requires ALL deps **DONE_VERIFIED, fail-CLOSED**. `FACTORY-STOCK-extract-vndirect-mapper` (P1) carries `depends_on:["FACTORY-STOCK-vndirect-mapper-tests"]`. Leaving this row in `review[]` keeps that P1 structurally un-dispatchable — i.e. holding it BLOCKED is precisely what prevents the fix for the duplication the `review_note` complains about. 13 days of Review-Lane sweeps found nothing resolvable for exactly this reason.
- **Rubber-stamp the green tests.** Rejected — `feedback_factory_testfirst_primitive_tests_copy_not_served_path` was written *about this exact row* on 2026-07-24 and mandates checking the primitive is on the SERVED path first. I re-ran that check: `grep -rn "MapPayload|MapItem" apps/stock-price --include="*.go"` returns hits **only inside the primitive package itself** — zero consumers. `fetchers.go` still carries the inline `*1000` twice (Tier1 `:106`, Tier2 `:210`). Caveat confirmed: duplication is real, served path is uncovered.
- **Leave the equivalence question open, as the `review_note` did.** Rejected — and this is where the ruling adds new information. The note says `mapper.go==fetchers.go` equivalence is "dev-ASSERTED, not test-proven". I tested it (one-off scratchpad harness, stdlib-only, both struct shapes copied verbatim). It is **not asserted-unproven — it is DISPROVEN**:

  | input | SERVED (`fetchers.go`) | PRIMITIVE (`mapper.go`) | |
  |---|---|---|---|
  | `"change":null` | `&0` | `nil` | **DIVERGE** |
  | field omitted | `&0` | `nil` | **DIVERGE** |
  | `"change":0` | `&0` | `&0` | agree |

  Mechanism: `fetchers.go`'s inline payload struct declares `Change float64` / `PctChange float64` — **non-pointer** (`:78-79` Tier1, `:182-183` Tier2). JSON `null` into a non-pointer float is a documented no-op in `encoding/json`, so the field keeps its zero value; the code then does `change := item.Change; ... Change: &change`, taking the address of a local, which is **structurally never nil**. `mapper.go` (`:30-31`) declares them `*float64` and copies only when non-nil.

**why-decision:** Two things follow, and they pull in opposite directions from what the `review_note` assumed. (1) The tests do **not** "enshrine whatever the copy does" — the lesson's stated fear. They encode the **documented** contract: `pkg/domain/models.go:22-23`, `Change *float64 // nil = unavailable, 0 = genuine flat day`, named invariant DSI-INV-1. The primitive is *right*; the served path is *wrong*. That is a better outcome than the note credited, and it is why the row earns DONE_VERIFIED rather than rework. (2) The paired task's `dispatch_precondition` instruction — "GOLDEN-DIFF verify mapper.go output == fetchers.go inline mapping EXACTLY before touching anything" — is now **actively misleading**: that diff *will* fail, and a dev following it literally is most likely to "restore equivalence" by reverting the primitive to the buggy non-pointer shape, which would enshrine the DSI-INV-1 violation and break 3 of the 13 green tests. Precondition rewritten on the row accordingly.

**why-change:** Deviates from the incoming brief only in scope of finding, not in disposition — the brief offered four dispositions and DONE_VERIFIED was one; the golden-diff result is new and was not available to the 2026-07-24 dispatcher who wrote the caveat.

---

### RULING po-R2 · po · 2026-08-06T20:59Z
**task-id:** FIX-STOCK-PRICE-VNDIRECT-DSI-INV-1-NULL-CHANGE-SERVED-AS-ZERO

**what-done:** Minted one new P1 FIX row (`backlog[]`, `next_agent=developer`, `zone=apps/stock-price/`) for the served-path DSI-INV-1 violation proven above.

**what-considered:**
- **Fold it into the paired FACTORY task's precondition only.** Rejected. The FACTORY row is a *refactor* ("collapse Tier1/Tier2 duplication"); this is a *data-correctness* defect that exists in production today, independent of whether that refactor ever runs. Folding it in means the bug dies with the refactor if the refactor is ever deprioritised or cancelled — `feedback_epic_wrapper_closeout_gap_no_auto_revisit`.
- **Mint nothing — the rewire closes it implicitly.** Rejected for the same reason, and because an implicit close is not a tracked close.
- **Mint at P0.** Rejected as unproven severity. I proved the code path *cannot* emit nil; I did **not** prove VnDirect ever actually sends `null`/omits the field. Reachability is therefore AC-1 of the new row, to be established empirically before severity is assumed — `feedback_single_observation_degenerate_case_read_as_broken_mechanism`.

**why-decision:** Prior-art check first (`feedback_file_prior_art_check_before_minting_row`): grepped all 9 task-bearing lanes plus `backlog-detail.json` for DSI-INV-1 / change-nil rows — the only hit is `FU-MACRO-SNAPSHOT-TIER-WORSTOF`, a different plane. No duplicate. The defect is genuinely unreported despite DSI-INV-1 being an org-wide named invariant with its own architecture brief. Both rows carry `related` cross-links and both say explicitly that one rewire closes both, so the next picker cannot bill the work twice.

**why-change:** no change from plan — the brief invited normal PO judgment and this is a mint, not a disposition change on the handed row.

---

**Deploy gate:** none. `mapper.go` has zero importers, so it is not linked into any binary; `rebuild_required:false` on this row is correct as written. The *new* FIX row does touch the shipped `fetchers.go` and is stamped `rebuild_required:true`.

**Lock:** PO holds no `mcp__gateway__call_tool` binding in this sub-session (INV-GATEWAY-1). The calling dev-team dispatcher must release `task:FACTORY-STOCK-vndirect-mapper-tests` itself.
