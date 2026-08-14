#!/usr/bin/env python3
# =============================================================================
# scripts/po-opsrag-archive-detach-20260814.py
# =============================================================================
# Task:   UNBLOCK-OPS-RAG-REBUILD-DONEVERIFIED-FALSIFIED-BY-KERNEL (po, 2026-08-14)
# Pair:   scripts/po-restore-opsrag-cold-to-hot-20260814.py — that one runs FIRST
#         (hot insert), this one SECOND (cold detach). Hot-first ordering is
#         crash-safe: the worst intermediate state is a transient duplicate,
#         never a lost row.
#
# WHY A COLD-SIDE SCRIPT AT ALL:
#   orch-apply.sh gates the HOT file only; the monthly cold archive has no
#   wrapper. This script therefore does the same three things by hand — parse,
#   validate, atomic same-directory rename — and refuses to write on any
#   precondition miss. It NEVER touches docs/data/orch/orch-state.json.
#
# WHAT IT DOES:
#   1. Removes OPS-RAG-SERVICE-REBUILD-DEPLOY-LANCEDB-FIX from .done_tasks[]
#      (it now lives on the hot board at BLOCKED — a second copy asserting
#      DONE_VERIFIED is exactly the misdirection this task exists to remove).
#   2. Appends a move record to a NEW top-level .restored_to_hot[] array.
#      NOT a same-id tombstone inside .done_tasks[]: orch-cold-evict.sh:873
#      content-dedupes newly-evicted rows against [.done_tasks[].id], so a
#      tombstone there would silently swallow this row's eventual REAL closure
#      record the next time it goes terminal. A separate top-level key is
#      invisible to that dedup and leaves the archive's own 4-key existence
#      check (orch-cold-evict.sh:871/980 — .month/.done_tasks/.closed_sprints/
#      .signal_rows) satisfied.
# =============================================================================
import json
import os
import sys
import tempfile
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
COLD = os.path.join(ROOT, "docs/data/orch/archive/2026-08.json")
HOT = os.path.join(ROOT, "docs/data/orch/orch-state.json")

RID = "OPS-RAG-SERVICE-REBUILD-DEPLOY-LANCEDB-FIX"
LANCE = "FIX-RAG-LANCECORE-OOM-PERSISTS-AFTER-THREADPIN-DEPLOYED"
UNB = "UNBLOCK-OPS-RAG-REBUILD-DONEVERIFIED-FALSIFIED-BY-KERNEL"

NOW = os.environ.get("PO_NOW") or datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

MOVE_NOTE = (
    f"Row LIFTED OUT of .done_tasks[] and restored to the hot board "
    f"(docs/data/orch/orch-state.json .task_board.review[]) at status BLOCKED by po at {NOW}, "
    f"task {UNB}. It is NOT in this archive any more — follow the hot board, which is authoritative. "
    f"REASON: the row was cold-archived because orch-cold-evict.sh evicts on TERMINAL_TASK_STATUSES and its "
    f"status was DONE_VERIFIED (updated_by=qa, 2026-08-12T12:46:40Z). That certification is FALSIFIED: kernel "
    f"memcg OOM evidence read from dmesg inside the Docker Desktop VM shows the certified container was "
    f"OOM-killed 3x AFTER closure — 2026-08-12T13:46:51Z (+1h00m), 2026-08-12T14:00:57Z (+1h14m, invoker "
    f"lancedb-tokio-w, the exact thread the row's own fix ca6d86869 pinned), 2026-08-13T09:20:09Z (+20h34m). "
    f"The row's own desc instructed future actors that the bug 'MUST NOT BE RE-DIAGNOSED'; that instruction is "
    f"falsified and must not be honoured. While cold it was also invisible to every lane-scoped dedup scan on "
    f"the hot board. Live tracking row for this crash loop is now {LANCE}."
)


def die(msg: str) -> None:
    print(f"[po-opsrag-archive-detach] FAIL: {msg}", file=sys.stderr)
    sys.exit(1)


def main() -> None:
    with open(COLD, encoding="utf-8") as fh:
        cold = json.load(fh)

    # Precondition 1 — the row must ALREADY be live on the hot board (hot-first ordering).
    with open(HOT, encoding="utf-8") as fh:
        hot = json.load(fh)
    hot_hit = [
        r
        for lane, rows in hot["task_board"].items()
        if isinstance(rows, list)
        for r in rows
        if isinstance(r, dict) and r.get("id") == RID
    ]
    if len(hot_hit) != 1:
        die(f"expected exactly 1 hot row {RID} before detaching cold copy, found {len(hot_hit)}")
    if hot_hit[0].get("status") != "BLOCKED":
        die(f"hot row status is {hot_hit[0].get('status')!r}, expected BLOCKED — aborting detach")

    # Precondition 2 — exactly one cold copy to detach.
    matches = [r for r in cold.get("done_tasks", []) if r.get("id") == RID]
    if len(matches) != 1:
        die(f"expected exactly 1 cold row {RID}, found {len(matches)}")
    orig = matches[0]

    cold["done_tasks"] = [r for r in cold["done_tasks"] if r.get("id") != RID]
    cold.setdefault("restored_to_hot", []).append(
        {
            "id": RID,
            "restored_at": NOW,
            "restored_by": f"po ({UNB})",
            "from": "docs/data/orch/archive/2026-08.json .done_tasks[]",
            "to": "docs/data/orch/orch-state.json .task_board.review[]",
            "status_before": orig.get("status"),
            "status_after": "BLOCKED",
            "certified_by_before": orig.get("updated_by"),
            "certified_at_before": orig.get("updated_at"),
            "superseded_by": LANCE,
            "note": MOVE_NOTE,
        }
    )

    # Archive's own structural contract (orch-cold-evict.sh:871/980).
    for key in ("month", "done_tasks", "closed_sprints", "signal_rows"):
        if key not in cold:
            die(f"post-transform archive is missing required key .{key} — refusing to write")

    dest_dir = os.path.dirname(COLD)
    fd, tmp = tempfile.mkstemp(prefix=".po-opsrag-detach-", suffix=".json", dir=dest_dir)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            json.dump(cold, fh, ensure_ascii=False, indent=2)
            fh.write("\n")
        with open(tmp, encoding="utf-8") as fh:  # re-parse the bytes actually written
            json.load(fh)
        os.replace(tmp, COLD)  # atomic, same filesystem
    except BaseException:
        if os.path.exists(tmp):
            os.unlink(tmp)
        raise

    print(f"[po-opsrag-archive-detach] OK — {RID} detached from .done_tasks[]; .restored_to_hot[] len={len(cold['restored_to_hot'])}")


if __name__ == "__main__":
    main()
