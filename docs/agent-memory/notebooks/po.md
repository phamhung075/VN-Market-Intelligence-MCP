# PO — Notebook

## 2026-08-06T20:59Z · triage: FACTORY-STOCK-vndirect-mapper-tests → DONE_VERIFIED (+1 P1 mint)

### What actually happened
- **Fourth stale `review[]` row in four ticks.** Direct-commit, `branch:null`, sat since 2026-07-24. Signed `DONE_VERIFIED` — the scoped DoD was met and, unlike yesterday's api-gateway row, there is no deploy gate: `mapper.go` has **zero importers**, so it is linked into no binary. `rebuild_required:false` is correct as written.
- **Re-derived every claim RAW rather than banking the note.** Commit `49bc309a3` ancestor-confirmed on HEAD; tree clean under `apps/stock-price/`; re-ran `go test ./pkg/primitive/vndirect-quote-mapper/... -count=1` myself → `ok`, 13/13, and each DoD case-class present **by name** (not just a green total).
- **The closeout caveat was real and I confirmed it.** `grep` for `MapPayload|MapItem` across `apps/stock-price` hits **only inside the primitive package** — no consumers. `fetchers.go` still carries the inline `*1000` twice (`:106`, `:210`). Served path uncovered, duplication increased.
- **Then the caveat's open question turned out to be answerable, and the answer inverts it.**

### Decisions worth keeping
- **"Dev-asserted, not test-proven" was worth ten minutes of actually proving.** The 07-24 note left `mapper.go==fetchers.go` equivalence open and every sweep since inherited that phrasing unexamined. I measured it: `"change":null` → served `&0` vs primitive `nil`; omitted → `&0` vs `nil`; `"change":0` → both `&0`. **Not unproven — DISPROVEN.** `fetchers.go` declares `Change/PctChange` as *non-pointer* `float64` (`:78-79`, `:182-183`); JSON null into a non-pointer float is an `encoding/json` no-op, then `change := item.Change; ... Change: &change` takes the address of a local → **structurally never nil**.
- **Which side is wrong flipped the whole verdict.** `feedback_factory_testfirst_primitive_tests_copy_not_served_path` — written *about this row* — warns that such tests "enshrine whatever the copy does". Here they don't: they encode the **documented** contract (`domain/models.go:22-23`, `nil = unavailable, 0 = genuine flat day`, DSI-INV-1). The primitive is right; **production is wrong**. A lesson written about a row is still a hypothesis on re-read — the same discriminator habit that saved the api-gateway call.
- **The comment above the bug asserts the invariant it breaks.** `fetchers.go:88` and `:192` read `// DSI-INV-1: use pointers so 0 is distinguishable from nil`. The pointer exists and can never be nil. A reviewer who reads the comment concludes the invariant holds — this is why `comment≠code` needs a *measurement*, not a reading.
- **Holding the row BLOCKED was the one option that guaranteed the defect survived.** `orchStateSchema.ts` §14/§13: `deps_satisfied()` requires all deps `DONE_VERIFIED`, **fail-CLOSED**. `FACTORY-STOCK-extract-vndirect-mapper` (P1) `depends_on` this row — so 13 days of sweeps found "nothing resolvable" precisely because the fix for the duplication was gated behind the row complaining about it. **Signing off *was* the unblock.**
- **Minted the served-path bug as its own P1 rather than folding it into the refactor's precondition.** The FACTORY row is a refactor; this is a data-correctness defect live in production. Folding means the bug dies if the refactor is ever dropped. Prior-art grep across all 9 lanes + `backlog-detail.json` first — only hit was a different plane. Both rows cross-linked and both state **one rewire closes both**, so it can't be billed twice.
- **Refused to size it at P0.** I proved the code *cannot* emit nil; I did **not** prove VnDirect ever *sends* null. Reachability is AC-1 of the new row, to be established empirically before severity is assumed.
- **Rewrote the paired task's `dispatch_precondition` because it had become a trap.** v1 ordered "golden-diff verify mapper.go == fetchers.go EXACTLY before touching anything". That diff now fails, and the cheapest way to "fix" it is reverting the primitive to the buggy shape — enshrining the violation and breaking 3 green tests. v2 states the divergence, names which side is correct, and keeps the old text flagged as superseded rather than silently deleted.

### Evidence (raw, re-runnable)
- 1 `orch-apply.sh` pipe, Stage 0+1 PASS, conservation `task_total 771→772` (+1 mint), `signal_total 202=202`, head untouched. Lane diff verified as exactly one id removed from `review[]`.
- `backlog-detail.json` written temp→atomic `mv` in-dir, `items` count guarded 442=442 before rename.
- Divergence harness was stdlib-only, in scratchpad, **not** persisted to `scripts/` — a one-off discriminator, not a reusable script; the exact repro is written into both rows so any dev can re-derive it.
- Live board is under concurrent peer mutation — `review[]` read 229 at 20:54Z and 223 at 21:01Z. Regenerated the candidate from the current file and piped in one shot rather than reusing the earlier read.

### Carry-over
- **`FIX-STOCK-PRICE-VNDIRECT-DSI-INV-1-NULL-CHANGE-SERVED-AS-ZERO`** (P1, backlog, `next_agent=developer`) and **`FACTORY-STOCK-extract-vndirect-mapper`** (P1, now dependency-eligible) — one rewire closes both. AC-3 there is the risky part: an unavailable change flips `0`→`null` on the wire, so every consumer of `FetchPriceResponse.Change/.ChangePercent` needs a nil-safety audit across the Go plane **and** any TS/frontend JSON consumer.
- **Zone-wide deploy drift still unminted** (from 20:48Z) — nothing detects "committed but never rebuilt" per-zone.
- **Flow-level pass owed on two confirmed classes** — implementer ships code + journal but leaves the board row noteless; and `rebuild_required` is *asserted* by template, never *derived* from the Dockerfile build target.
- **`scripts/audits/po-mint-orchapply-actuator-verify.sh` still unauthored** (main.md:173) — `scripts/` outside agent-father's commit zone, no owner.
- **Two P1 telegram-ack rows still undispatched** (`FIX-TELEGRAM-REPORT-ACK-STATUS-STOP-RESURFACE`, `FIX-PO-MAINFLOW-ORPHANS-TELEGRAM-REPORTS-RESOLVER-SUBFLOW`).
- **AC-3 self-verification still known-broken** (`FIX-PO-AC3-SELFVERIFY-FALSE-FAILLOUD-WHEN-PEER-SWEEPS-ORCHSTATE`) — greps own commit stat, not HEAD tree; asserted against HEAD tree again this cycle.
- **Single-row triage, not a full PO tick** — no channel audit, TNB read, signal-dashboard drain, or manual-dispatch/supervised-goahead sweep. Next full tick owes all of those.
- **No `mcp__gateway__call_tool` binding this sub-session** (INV-GATEWAY-1) — calling dev-team dispatcher must release `task:FACTORY-STOCK-vndirect-mapper-tests`.
