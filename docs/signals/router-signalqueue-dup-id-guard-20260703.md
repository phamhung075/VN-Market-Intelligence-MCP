# Repair: `.signal_queue.rows[]` allows duplicate `.id` — orch-apply guard misses array-element dups

- **Filed:** 2026-07-03 by dev-team/drain (during 09:37Z tick signal drain)
- **Type:** repair_task_request → PO → backlog
- **Suggested task id:** `FIX-SIGNALQUEUE-DUP-ID-GUARD`
- **Severity:** MEDIUM (trash-data generator + integrity gap; no active harm this instance — all dup rows were `status=READ`, already consumed)
- **Scope:** small — 1 validator addition in `scripts/orch-apply.sh` + 1 producer ts-format fix. Good `fixer` candidate.

## Incident

During the 09:37Z dev-team signal drain, `.signal_queue.rows[]` held **20 rows but only 10
distinct `.id`s**. One id — `sau-d4-202607030300` (system-auditor Tier-3 deep-DB-integrity signal,
`type=system_issue`, `to=po`, `ts=2026-07-03T03:00Z`, `status=READ`) — appeared **11 times**, all
byte-identical. The other 9 ids were unique. dev-team collapsed the 11 copies to 1
(order-preserving `reduce`, keep-first) via `orch-apply.sh` — SSOT now 10/10. Class:
`feedback_ssot_duplicate_key`.

## Root cause (two independent gaps)

1. **Validate-side gap (definitive fix target):** `scripts/orch-apply.sh` dup-key detection guards
   duplicate **JSON object keys**, NOT duplicate **array-element `.id` values**. So a producer that
   appends the same row N times passes validation cleanly. This is the belt-and-suspenders layer
   that should catch **every** producer regardless of their own idempotency.
2. **Producer-side gap:** whatever wrote `sau-d4-202607030300` (system-auditor Tier-3 signal-write
   path, or an orch-apply merge retry loop) appended the same logical signal 11× without
   dedup-by-id. Secondary: the `ts` is written as `2026-07-03T03:00Z` — **missing seconds**, so it
   is NOT valid ISO8601 (`fromdateiso8601` rejects it), which silently breaks any age-based prune
   query (`.ts | fromdateiso8601? // 0` → treats it as epoch 0 → false "very old" match).

## Proposed fix

1. **(a) orch-apply id-uniqueness guard (primary):** in `scripts/orch-apply.sh` validation stage,
   reject (or auto-collapse keep-first with a WARNING) when
   `(.signal_queue.rows | length) != (.signal_queue.rows | map(.id) | unique | length)`.
   Same guard for `.signal_queue.archive[]`. Fail-loud on reject so the offending producer is caught
   at write time, not discovered 11 copies later.
2. **(b) Normalize auditor signal `ts` to full ISO8601** (`YYYY-MM-DDTHH:MM:SSZ`) in the
   system-auditor signal-write path so prune age-math works. Audit the signal-write for a
   retry/loop that can append the same id repeatedly; make it upsert-by-id.
3. **(c) prune query hardening (optional):** replace `fromdateiso8601? // 0` with a tolerant parser
   that also accepts seconds-less ISO, so a malformed `ts` never silently reads as epoch 0.

## Evidence

```
# before: jq '.signal_queue.rows | "total=\(length) distinct=\([.[].id]|unique|length)"'
total_rows=20  distinct_ids=10
# 11× copies of sau-d4-202607030300 {status:READ, type:system_issue, to:po, from:system-auditor}
# after dev-team keep-first collapse via orch-apply.sh:
total_rows=10  distinct_ids=10
```
