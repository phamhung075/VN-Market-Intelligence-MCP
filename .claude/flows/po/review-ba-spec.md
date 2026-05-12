# PO — Review BA Spec

**Entry from:** `po/main.md` § Dispatch when BA returns a spec for review (caller passes `req_file=docs/REQ_NNN.md`).

**Not for:** triage (stay in main.md), kickoff (`po/sprint-kickoff.md`), QA signoff (`po/sprint-signoff.md`).

---

## When BA Returns Spec

Read `docs/REQ_NNN.md` — matches vision? AC clear? blockers answerable?

- **Approve** → set `status: APPROVED` in the spec file → return:
  ```
  ## RETURN
  DONE: REQ_NNN approved
  NEXT: architect | run brownfield analysis
  HANDOFF: docs/REQ_NNN.md
  PIPELINE: continue
  ```

- **Reject** → write feedback inline in `docs/REQ_NNN.md` → return:
  ```
  ## RETURN
  DONE: REQ_NNN feedback written
  NEXT: ba | revise spec per feedback
  HANDOFF: docs/REQ_NNN.md
  PIPELINE: continue
  ```

---

## After RETURN

Commit notebook + run doc self-heal — see `po/main.md` § Notebook + ACK timestamp guard and § Doc self-heal pointer.
