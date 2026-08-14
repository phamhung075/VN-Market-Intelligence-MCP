#!/usr/bin/env python3
# =============================================================================
# scripts/po-restore-opsrag-cold-to-hot-20260814.py
# =============================================================================
# Task:   UNBLOCK-OPS-RAG-REBUILD-DONEVERIFIED-FALSIFIED-BY-KERNEL (po, 2026-08-14)
# Policy: CANONICAL:SSOT-W1-ORCH-APPLY-WRAPPER — this script is a CANDIDATE
#         PRODUCER ONLY. It reads the live hot file + the cold archive and emits
#         the full candidate document on stdout. It NEVER writes any file.
#         Call site (the ONLY sanctioned one):
#           python3 scripts/po-restore-opsrag-cold-to-hot-20260814.py \
#             | bash scripts/orch-apply.sh
#         Python (not jq) purely because the banner/blocked_reason payloads are
#         multi-paragraph prose; escaping them inside a .jq literal is the
#         error-prone path, and the gate that matters (orch-apply.sh validation +
#         conservation + CAS + atomic rename) is identical either way.
#
# WHAT IT DOES (single write, 3 mutations):
#   1. Lifts OPS-RAG-SERVICE-REBUILD-DEPLOY-LANCEDB-FIX out of the cold archive
#      (docs/data/orch/archive/2026-08.json .done_tasks[]) into hot review[] at
#      status BLOCKED — lane-coherent per LANE_ALLOWED_STATUSES.review, and
#      non-terminal so orch-cold-evict.sh's TERMINAL_TASK_STATUSES predicate can
#      never silently re-evict it back into the blind spot.
#   2. De-falsifies that row in place: banner on desc + status_note,
#      qa_verified_at/_by renamed to *_RETRACTED, .verification.retracted=true,
#      blocked_by/superseded_by pointed at the live tracking row
#      FIX-RAG-LANCECORE-OOM-PERSISTS-AFTER-THREADPIN-DEPLOYED.
#   3. Moves this task's own row (UNBLOCK-...-FALSIFIED-BY-KERNEL) from
#      in_progress[] to review[] at REVIEW/next_agent=qa.
#   .head is deliberately NOT touched — it is pinned to the LANCECORE row, which
#   is genuinely in flight with dev-rag-service (feedback_router_lane_move_must_
#   reset_head_same_write applies only when the moved row IS the head).
#
# COLD-SIDE COMPANION (must run AFTER this one — hot-first ordering is
# crash-safe: worst case a transient duplicate, never a lost row):
#   scripts/po-opsrag-archive-detach-20260814.py
# =============================================================================
import json
import os
import sys
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HOT = os.path.join(ROOT, "docs/data/orch/orch-state.json")
COLD = os.path.join(ROOT, "docs/data/orch/archive/2026-08.json")

RID = "OPS-RAG-SERVICE-REBUILD-DEPLOY-LANCEDB-FIX"
LANCE = "FIX-RAG-LANCECORE-OOM-PERSISTS-AFTER-THREADPIN-DEPLOYED"
UNB = "UNBLOCK-OPS-RAG-REBUILD-DONEVERIFIED-FALSIFIED-BY-KERNEL"

NOW = os.environ.get("PO_NOW") or datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

DESC_BANNER = f"""[FALSIFIED {NOW} — po — READ THIS BEFORE THE ORIGINAL TEXT BELOW]
The paragraph below headed "WHY THIS IS NOT A NEW BUG AND MUST NOT BE RE-DIAGNOSED" is FALSIFIED and MUST NOT be honoured by any actor.
Kernel memcg OOM evidence, read from dmesg INSIDE the Docker Desktop VM (the source this row's own fix commit ca6d86869 designates as authoritative, because `docker inspect .State.OOMKilled` is a known false-negative in this environment), shows the container this row certified was OOM-KILLED THREE TIMES AFTER its QA certification closed at 2026-08-12T12:46:40Z:
  - 2026-08-12T13:46:51Z (+1h00m, invoker python3)
  - 2026-08-12T14:00:57Z (+1h14m, invoker "lancedb-tokio-w" — the exact thread this row's own fix pinned via TOKIO_WORKER_THREADS/LANCE_CPU_THREADS)
  - 2026-08-13T09:20:09Z (+20h34m, invoker python3, matches container StartedAt exactly)
All three carry oom_memcg=/docker/92e6017318e4... = the certified container. The stale-image hypothesis is REFUTED, not revived: the running container's /app/infrastructure/repositories.py md5 == git HEAD ca6d86869 exactly, verified live 2026-08-14T06:27Z. The deploy landed; the fix did not achieve its goal.
RE-DIAGNOSIS IS NOW MANDATORY, NOT FORBIDDEN — at the lance-core layer, exactly as THIS ROW'S OWN AC-4 provides for ("if AC-3 FAILS after a confirmed-new image, the leak hypothesis becomes live for the first time — hand to dev-rag-service with the post-fix samples attached. Only then."). AC-4 is DISCHARGED: {LANCE} (in_progress, P0, owner+next_agent dev-rag-service, dispatched 2026-08-14T06:50:41Z) is the LIVE TRACKING ROW for this crash loop and SUPERSEDES this one. Do not open a third row — attach evidence there.
TWO CAUTIONS IN THE ORIGINAL TEXT BELOW WERE CORRECT AND WERE WRONGLY DROPPED AT CLOSURE. Honour these, not the do-not-re-diagnose instruction: (a) RestartCount is a RECREATE-reset counter — never read a low value as a low crash count; (b) `docker inspect .State.OOMKilled` is unreliable here — it read false/ExitCode=0 across all three confirmed kernel kills — always cross-check dmesg inside the VM.

--- ORIGINAL desc (2026-08-12, retained verbatim for the postmortem; partially falsified per the banner above) ---

"""

STATUS_BANNER = f"""[QA CERTIFICATION RETRACTED {NOW} — po — task {UNB}]
The "ROOT CAUSE FOUND + FIXED + LIVE-VERIFIED" claim and the "[QA] Review Record ... APPROVED, DONE_VERIFIED" verdict below are RETRACTED. Status reverted DONE_VERIFIED -> BLOCKED; row restored from cold archive to hot review[].
NOT disputed and still standing: AC-1 (image ID genuinely changed, Created 2026-08-12T10:40:10Z) and AC-2 (mcp-server + pdf-extractor peers genuinely survived the rebuild). The rebuild-and-deploy work this row was raised to do WAS done.
FALSIFIED: AC-3 (durability). Its certifying observation window ran ~11:07Z-12:46:40Z and closed 1h00m BEFORE the first of three kernel memcg OOM-kills of the very container it certified (2026-08-12T13:46:51Z, 2026-08-12T14:00:57Z invoker lancedb-tokio-w, 2026-08-13T09:20:09Z — dmesg inside the Docker Desktop VM, oom_memcg = this container). This is textbook feedback_ac3_durability_certified_on_window_that_ended_before_metric_settled: the window closed before the failure metric settled. The QA record's own honest correction (true ceiling ~89-93%, not the row's ~78%) was the right signal and was read as "still below the crash band" when it was in fact the climb that ended in the 13:46:51Z kill.
DE-FALSIFICATION APPLIED SO NO READER OR PREDICATE CAN KEY A GREEN CERTIFICATION OFF THIS ROW: status -> BLOCKED; qa_verified_at/qa_verified_by renamed to qa_verified_at_RETRACTED/qa_verified_by_RETRACTED; .verification.retracted = true and .verification.raw_probe.live_value_observed prefixed RETRACTED; blocked_by + superseded_by -> {LANCE}.

--- ORIGINAL status_note (2026-08-12, retained verbatim) ---

"""

BLOCKED_REASON = (
    f"AC-3 durability certification falsified by kernel OOM evidence — 3 memcg kills of the certified "
    f"container AFTER closure (2026-08-12T13:46:51Z, 2026-08-12T14:00:57Z invoker lancedb-tokio-w, "
    f"2026-08-13T09:20:09Z). Superseded as the live tracking row by {LANCE} (in_progress, P0, dev-rag-service). "
    f"HOLD DISCIPLINE: do NOT re-close this row, do NOT mint a third row for the same crash loop, and do NOT "
    f"re-run its AC-3 independently of the LANCECORE row — a parallel measurement is what produced 5 consecutive "
    f"no-op folds on the sibling REVIEW row. PO re-adjudicates this row in the same pass that adjudicates "
    f"{LANCE}."
)

VERIFY_NOTE = (
    f"UN-BLOCK CONDITION (PO-owned, not qa-owned): {LANCE} reaches DONE_VERIFIED with a durability window that "
    f"(a) spans >= 24h wall-clock on the certified image — the 3 observed kills fell at +1h00m, +1h14m and "
    f"+20h34m past the last certification, so any window shorter than 24h is structurally incapable of "
    f"excluding this failure mode — and (b) is evidenced by dmesg read INSIDE the Docker Desktop VM showing "
    f"zero new oom_memcg events for the rag-service cgroup across that window. NEVER certify on "
    f"`docker inspect .State.OOMKilled` or RestartCount: both read clean (false / ExitCode=0 / RestartCount=3) "
    f"through all three confirmed kernel kills here."
)

RESTORE_NOTE = (
    f"Restored from cold archive docs/data/orch/archive/2026-08.json .done_tasks[] to hot task_board.review[] "
    f"by po at {NOW}, task {UNB}. Reason the row was invisible: orch-cold-evict.sh evicts on "
    f"TERMINAL_TASK_STATUSES, and DONE_VERIFIED is terminal, so a falsified closure removes the row from every "
    f"lane-scoped dedup scan on the hot board — po reproduced that exact blind spot on its own evidence note "
    f"this same day and self-corrected in commit c8c360f21. The cold copy was DETACHED in the same cycle "
    f"(scripts/po-opsrag-archive-detach-20260814.py) rather than left in place: two copies with contradictory "
    f"statuses is the misdirection being removed, and a same-id tombstone in .done_tasks[] would be swallowed "
    f"by orch-cold-evict.sh's own content-dedup against .done_tasks[].id, silently discarding this row's "
    f"eventual real closure record. Archive move is audit-trailed in that file's new .restored_to_hot[] array."
)

UNB_STATUS_APPEND = f"""

[po {NOW}] DONE — board hygiene executed, moved IN_PROGRESS -> REVIEW for qa.
WRITES LANDED (all in one orch-apply.sh-gated write on the hot file, plus one atomic write on the cold file):
  1. {RID} restored from docs/data/orch/archive/2026-08.json .done_tasks[] into task_board.review[] at status BLOCKED (lane-coherent: LANE_ALLOWED_STATUSES.review = REVIEW|BLOCKED|DEGRADED; non-terminal so orch-cold-evict.sh cannot re-evict it).
  2. That row de-falsified in place: FALSIFIED banner prepended to .desc (naming the "MUST NOT BE RE-DIAGNOSED" paragraph as falsified and re-instating the two cautions that were correct and were dropped at closure); RETRACTED banner prepended to .status_note; qa_verified_at/_by renamed to *_RETRACTED; .verification.retracted=true and .verification.raw_probe.live_value_observed prefixed RETRACTED; .blocked_reason + .verify_note written (D2.5 requires them for BLOCKED); .blocked_by + .superseded_by = {LANCE}; .related extended with the same id; .next_agent = po.
  3. Cold row DETACHED from archive/2026-08.json .done_tasks[] and audit-trailed in a new .restored_to_hot[] array in that same file — chosen over leaving a same-id tombstone, which orch-cold-evict.sh:873 would content-dedup against, silently swallowing the row's eventual real closure record.
BLOCKED chosen over REVIEW deliberately: a REVIEW/next_agent=qa row invites a second independent re-review of a crash loop already owned by {LANCE}, and parallel measurement of this exact metric is what produced 5 consecutive no-op folds on the sibling row. .head untouched — it is pinned to {LANCE}, which is genuinely in flight.
QA VERIFY (cheap, all git-visible): (a) jq '.task_board.review[] | select(.id=="{RID}") | .status' == "BLOCKED"; (b) jq '[.done_tasks[].id] | index("{RID}")' on archive/2026-08.json == null AND '.restored_to_hot[0].id' == the same id; (c) the row carries no un-prefixed qa_verified_at; (d) both files present in the commit's git show --stat.
"""


def die(msg: str) -> None:
    print(f"[po-restore-opsrag] FAIL: {msg}", file=sys.stderr)
    sys.exit(1)


def main() -> None:
    with open(HOT, encoding="utf-8") as fh:
        hot = json.load(fh)
    with open(COLD, encoding="utf-8") as fh:
        cold = json.load(fh)

    tb = hot["task_board"]

    # Guard: never create a duplicate id on the hot board.
    for lane, rows in tb.items():
        if isinstance(rows, list):
            for row in rows:
                if isinstance(row, dict) and row.get("id") == RID:
                    die(f"{RID} already present in hot lane {lane} — refusing to duplicate")

    orig = [r for r in cold.get("done_tasks", []) if r.get("id") == RID]
    if len(orig) != 1:
        die(f"expected exactly 1 cold row {RID}, found {len(orig)}")
    row = json.loads(json.dumps(orig[0]))  # deep copy

    if row.get("status") != "DONE_VERIFIED":
        die(f"cold row status is {row.get('status')!r}, expected DONE_VERIFIED — premise changed, aborting")

    # ── 1+2. de-falsify and restore ──────────────────────────────────────────
    row["status"] = "BLOCKED"
    row["next_agent"] = "po"
    row["desc"] = DESC_BANNER + row.get("desc", "")
    row["status_note"] = STATUS_BANNER + row.get("status_note", "")
    row["blocked_reason"] = BLOCKED_REASON
    row["verify_note"] = VERIFY_NOTE
    row["blocked_by"] = LANCE
    row["blocked_at"] = NOW
    row["superseded_by"] = LANCE
    row["restored_from_cold_archive_at"] = NOW
    row["restored_from_cold_archive_by"] = f"po ({UNB})"
    row["restored_from_cold_archive_note"] = RESTORE_NOTE
    row["related"] = [r for r in (row.get("related") or []) if r != LANCE] + [LANCE]
    row["updated_at"] = NOW
    row["updated_by"] = "po"

    # Retract every independent green-certification signal, not just .status.
    if "qa_verified_at" in row:
        row["qa_verified_at_RETRACTED"] = row.pop("qa_verified_at")
    if "qa_verified_by" in row:
        row["qa_verified_by_RETRACTED"] = row.pop("qa_verified_by")
    row["qa_certification_retracted_at"] = NOW
    row["qa_certification_retracted_by"] = f"po ({UNB})"
    ver = row.get("verification")
    if isinstance(ver, dict):
        ver["retracted"] = True
        ver["retraction_note"] = (
            f"AC-3 leg RETRACTED {NOW} by po: this probe's window closed 2026-08-12T12:46:39Z, "
            f"1h00m before the first of 3 kernel memcg OOM-kills of the same container. AC-1/AC-2 legs "
            f"stand. See .status_note banner and {LANCE}."
        )
        rp = ver.get("raw_probe")
        if isinstance(rp, dict) and isinstance(rp.get("live_value_observed"), str):
            rp["live_value_observed"] = (
                "RETRACTED (AC-3 leg only; AC-1/AC-2 stand) — container OOM-killed by the kernel 3x after "
                "this probe: " + rp["live_value_observed"]
            )

    tb.setdefault("review", []).append(row)

    # ── 3. this task's own row: in_progress -> review ────────────────────────
    unb = [r for r in tb.get("in_progress", []) if r.get("id") == UNB]
    if len(unb) != 1:
        die(f"expected exactly 1 in_progress row {UNB}, found {len(unb)}")
    unb_row = unb[0]
    tb["in_progress"] = [r for r in tb["in_progress"] if r.get("id") != UNB]
    unb_row["status"] = "REVIEW"
    unb_row["next_agent"] = "qa"
    unb_row["status_note"] = unb_row.get("status_note", "") + UNB_STATUS_APPEND
    unb_row["updated_at"] = NOW
    unb_row["updated_by"] = "po"
    unb_row["completed_at"] = NOW
    unb_row["completed_by"] = "po"
    tb["review"].append(unb_row)

    hot["task_board"] = tb
    json.dump(hot, sys.stdout, ensure_ascii=False, indent=2)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
