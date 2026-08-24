# Decision Journal — po — 2026-08-24T13:21:23Z
task_id: FIX-AUDITOR-TIER1-FOLD-VERDICT-NOT-DURABLE-RESPAWNS-AUDITOR-EVERY-TICK

## D1 — umbrella row: split, supersede, or neither
what-considered: (a) split debounce-half vs heartbeat-half as dispatched; (b) supersede with a scoped successor; (c) neither.
why-change: chose (c). Both (a) and (b) were already performed by architect at 07:41:35Z — the row carries children[], depends[] and an explicit DO-NOT-IMPLEMENT note. (a)/(b) would have duplicated live work. The real blocker was that child 2 sat in backlog[] behind a dependency whose purpose (field must exist) was already satisfied in fact.

## D2 — releasing child 2's dependency while child 1 is only in review[]
what-considered: (a) wait for QA on child 1; (b) release deps on live evidence.
why-change: chose (b). The dep existed to guarantee the field EXISTS before prose reads it; QA certifies CORRECTNESS, not existence. Field verified live (committed 820b52759; ledger holds a real entry). Cost of waiting is not neutral: the debounce is computed then discarded every tick, so the respawn loop keeps running. AC-2 fail-open makes either order safe by construction.

## D3 — blocking ready[20] on a row that cannot grow by one byte
what-considered: (a) BLOCKED + blocked_reason/blocked_at; (b) run orch-backlog-stub.sh; (c) condense its 6842B evidence field; (d) structural-only gating.
why-change: chose (d). (a) trips the prose ceiling (row is 15216B). (b) would strip all 110 ready[] rows of owner/next_agent — unacceptable blast radius mid-tick. (c) destroys month-old measurement evidence. (d) achieves three independent gates — lane, depends[], supervised:true — using only STRUCTURAL_FIELDS, which the ceiling check excludes by design. Rationale lives on the depends[] target, which is where a reader is pointed anyway.

## D4 — the fleet-push ack entry
what-considered: (a) remove now; (b) retarget to an open row; (c) sequence removal behind the debounce consumer; (d) fix the probe.
why-change: chose (c)+(d). (b) is forbidden by the ledger and the rag-service entry records that exact mistake. (a) is correct in principle but the churn-bounding debounce is only half wired, so it would cost ~48 respawns/day on a state the user chose. (c) is verbatim the ledger's own documented protocol. (d) is the durable fix: a Disabled=1 plist is a policy fact, not a degradation, so no ack should ever have been needed.

## D5 — closing po-decision-bug5468 despite an unverifiable mitigation trigger
what-considered: (a) keep NEW indefinitely; (b) flip READ; (c) rehouse then close.
why-change: chose (c). (b) would cold-evict a standing instruction. (a) leaves it undeliverable forever. Rehousing the mitigation onto a task row with a real owner makes the instruction durable, which is precisely what a signal payload cannot be. Recorded honestly that PO could not read reconcile_attempts — no SQL tool exists in the registry — so verifying it is the receiving row's first task.
