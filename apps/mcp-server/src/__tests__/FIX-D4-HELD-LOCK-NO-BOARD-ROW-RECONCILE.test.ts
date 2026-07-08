/**
 * FIX-D4-HELD-LOCK-NO-BOARD-ROW-RECONCILE
 *
 * Bug (6th+ recurrence): D4's held-lock/board-row check (tasksMdJanitorJob.ts,
 * Steps R-2/R-3) has no exclusion whitelist and no debounce — persistent/guard
 * locks (esc-datacov:*, *-singleton, cron:*) and single-cycle transient snapshots
 * flood orch-state.json .signal_queue with false-positive rows every daily
 * 03:00Z pass.
 *
 * Doc-spec precedent: agent-father commit 5436ead58 — Step R-1b (exclusion
 * whitelist + live-concurrent-session guard) and Step R-4b (2-consecutive-cycle
 * debounce) in docs/agents/system-auditor/{handlers,audit-dimensions}.md.
 *
 * This suite ports that spec into apps/mcp-server code and RAW-verifies it
 * against the EXACT real production false-positive batch confirmed live via
 * docker-exec against coordination.db on 2026-07-08 (7 held locks: 5x
 * esc-datacov:{ACB,HPG,GVR,HVN,MBB}:Q1-2026:ESC-3, dev-team-cron-singleton,
 * cron:dev-team:<ts>) plus agent-father's negative control (genuine task ids
 * that must NOT be excluded).
 *
 * Also covers the second pre-existing gap: listHeld()/listSessionPresence()
 * production wiring must pass expired:false (missing expired:false reads
 * TTL-expired tombstone locks as held — handlers.md §Step R-1).
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { readFileSync, writeFileSync, existsSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  runTasksMdJanitor,
  bareTaskId,
  isKnownLegitPattern,
  isLiveConcurrentSession,
  applyR1bFilter,
  parsePriorD4Candidates,
  formatD4LedgerSection,
  insertD4LedgerSection,
  applyR4bDebounce,
  _resetDedupStore,
  type JanitorDeps,
  type D4Candidate,
} from "../scheduler/system/tasksMdJanitorJob.js";
import type { LockRow } from "../infrastructure/db/coordinationStore.js";

const NOW_ISO = "2026-07-08T03:00:00.000Z";

function makeTmpProjectRoot(label: string): string {
  const root = join(
    tmpdir(),
    "fix-d4-held-lock-no-board-row",
    `${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(join(root, "docs", "data", "orch"), { recursive: true });
  mkdirSync(join(root, "docs", "agent-memory", "notebooks"), { recursive: true });
  return root;
}

function baseOrchState(tasks: Array<{ id: string; status: string; owner: string }> = []) {
  return {
    _meta: { schema: "v4", ssot: true, updated_at: NOW_ISO, updated_by: "test" },
    head: { status: "IDLE", active_task_id: null as string | null },
    task_board: {
      backlog: [],
      active_sprints: [
        {
          id: "sprint-fix-d4",
          status: "ACTIVE",
          tasks,
        },
      ],
      _updated_at: NOW_ISO,
      _updated_by: "test",
    },
    signal_queue: {
      _updated_at: NOW_ISO,
      _updated_by: "test",
      rows: [],
      archive: [],
    },
  };
}

function makeLock(taskId: string, overrides: Partial<LockRow> = {}): LockRow {
  return {
    task_id: taskId,
    task_kind: "sprint-task",
    owner_session: "session-x",
    owner_agent: "agent-a",
    owner_client_session: null,
    claimed_at: Math.floor(Date.parse(NOW_ISO) / 1000) - 1000,
    expires_at: Math.floor(Date.parse(NOW_ISO) / 1000) + 600_000,
    heartbeat_at: Math.floor(Date.parse(NOW_ISO) / 1000),
    ttl_seconds: 691_200,
    payload: null,
    redispatch_count: 0,
    ...overrides,
  };
}

// ─── Real production batch (2026-07-08T03:00Z, docker-exec coordination.db) ──

const REAL_FALSE_POSITIVE_BATCH = [
  "esc-datacov:ACB:Q1-2026:ESC-3",
  "esc-datacov:HPG:Q1-2026:ESC-3",
  "esc-datacov:GVR:Q1-2026:ESC-3",
  "esc-datacov:HVN:Q1-2026:ESC-3",
  "esc-datacov:MBB:Q1-2026:ESC-3",
  "dev-team-cron-singleton",
  "cron:dev-team:2026-07-08T02:37Z",
];

const NEGATIVE_CONTROL_TASK_IDS = [
  "FACTORY-INTERFACE-sequential-confidence-05-mask",
  "TASK_1996",
  "IND-P1-ROC-MOMENTUM",
];

describe("FIX-D4-HELD-LOCK-NO-BOARD-ROW-RECONCILE", () => {
  describe("Step R-1b — isKnownLegitPattern (exclusion whitelist)", () => {
    it("excludes all 7 real 2026-07-08T03:00Z false-positive batch task ids", () => {
      for (const taskId of REAL_FALSE_POSITIVE_BATCH) {
        expect(isKnownLegitPattern(bareTaskId(taskId))).toBe(true);
      }
    });

    it("does NOT exclude negative-control genuine task ids (not over-broad)", () => {
      for (const taskId of NEGATIVE_CONTROL_TASK_IDS) {
        expect(isKnownLegitPattern(bareTaskId(taskId))).toBe(false);
      }
    });

    it("covers each documented pattern class individually", () => {
      expect(isKnownLegitPattern("cron:auditor-t1")).toBe(true);
      expect(isKnownLegitPattern("cron:auditor-t2")).toBe(true);
      expect(isKnownLegitPattern("cron:auditor-t3")).toBe(true);
      expect(isKnownLegitPattern("dev-team-cron-singleton")).toBe(true);
      expect(isKnownLegitPattern("po-triage-2026-07-08")).toBe(true);
      expect(isKnownLegitPattern("esc-datacov:VCB:Q1-2026:ESC-3")).toBe(true);
      expect(isKnownLegitPattern("esc-deepdive:GVR:ESC-4")).toBe(true);
      expect(isKnownLegitPattern("session-presence:abc123")).toBe(true);
      expect(isKnownLegitPattern("commit-mutex:orch-state")).toBe(true);
      expect(isKnownLegitPattern("intent:dev-mcp-server:fix-d4")).toBe(true);
    });

    it("bareTaskId strips the task: prefix before pattern matching", () => {
      expect(isKnownLegitPattern(bareTaskId("task:esc-datacov:ACB:Q1-2026:ESC-3"))).toBe(true);
      expect(bareTaskId("task:TASK_1996")).toBe("TASK_1996");
      expect(bareTaskId("TASK_1996")).toBe("TASK_1996"); // no prefix — unchanged
    });
  });

  describe("Step R-1b — isLiveConcurrentSession (live-concurrent-session guard)", () => {
    const nowEpoch = 2000;

    it("true: owner_client_session in live roster AND lock unexpired", () => {
      const lock = makeLock("IND-P1-ROC-MOMENTUM", {
        owner_client_session: "d3292ca4-a9ab-471a-8d8c-d0c723546258",
        expires_at: nowEpoch + 500,
      });
      expect(
        isLiveConcurrentSession(lock, new Set(["d3292ca4-a9ab-471a-8d8c-d0c723546258"]), nowEpoch),
      ).toBe(true);
    });

    it("false: owner_client_session is null", () => {
      const lock = makeLock("x", { owner_client_session: null, expires_at: nowEpoch + 500 });
      expect(isLiveConcurrentSession(lock, new Set(["s1"]), nowEpoch)).toBe(false);
    });

    it("false: owner_client_session not in live roster", () => {
      const lock = makeLock("x", { owner_client_session: "dead-session", expires_at: nowEpoch + 500 });
      expect(isLiveConcurrentSession(lock, new Set(["s1"]), nowEpoch)).toBe(false);
    });

    it("false: lock itself is expired even if session is live", () => {
      const lock = makeLock("x", { owner_client_session: "s1", expires_at: nowEpoch - 5 });
      expect(isLiveConcurrentSession(lock, new Set(["s1"]), nowEpoch)).toBe(false);
    });
  });

  describe("Step R-1b — applyR1bFilter (combined, real batch + negative control)", () => {
    it("filters out the real 7-lock batch, survives negative-control task ids", () => {
      const locks: LockRow[] = [
        ...REAL_FALSE_POSITIVE_BATCH.map(id => makeLock(id)),
        ...NEGATIVE_CONTROL_TASK_IDS.map(id => makeLock(id)),
      ];
      const { surviving, skipped } = applyR1bFilter(locks, new Set(), 0);

      expect(skipped.length).toBe(REAL_FALSE_POSITIVE_BATCH.length);
      expect(surviving.length).toBe(NEGATIVE_CONTROL_TASK_IDS.length);
      expect(surviving.map(l => l.task_id).sort()).toEqual([...NEGATIVE_CONTROL_TASK_IDS].sort());
    });

    it("live-concurrent-session lock is excluded even without a whitelist pattern match", () => {
      const liveLock = makeLock("MARKET-INDICATOR-DEPTH-P0-P1", {
        owner_client_session: "peer-session-1",
        expires_at: 5000,
      });
      const { surviving, skipped } = applyR1bFilter([liveLock], new Set(["peer-session-1"]), 1000);
      expect(surviving.length).toBe(0);
      expect(skipped[0]!.reason).toContain("live-concurrent-session:peer-session-1");
    });
  });

  describe("Step R-4b — parsePriorD4Candidates ledger parsing", () => {
    it("cold start: no '## ' sections at all → null", () => {
      expect(parsePriorD4Candidates("")).toBeNull();
      expect(parsePriorD4Candidates("# System Auditor — Notebook\n\npreamble only\n")).toBeNull();
    });

    it("cold start: sections exist but none carry a 'D4 candidates:' line → null", () => {
      const content = "# Notebook\n\n## c396 · 2026-07-04T05:15:40Z\nTier-1 pass, all healthy.\n";
      expect(parsePriorD4Candidates(content)).toBeNull();
    });

    it("finds the topmost (most recent) section's 'D4 candidates:' line, ignoring older ones", () => {
      const content = [
        "# Notebook",
        "",
        "## c400 · 2026-07-08T03:00:10Z",
        "D4 candidates: R3-owner-diverge:foo,R3-status-diverge:foo",
        "",
        "## c399 · 2026-07-07T03:00:05Z",
        "D4 candidates: none",
        "",
      ].join("\n");
      const result = parsePriorD4Candidates(content);
      expect(result).toEqual(new Set(["R3-owner-diverge:foo", "R3-status-diverge:foo"]));
    });

    it("skips intervening non-D4 sections (Tier-1/Tier-2) to find the last real D4 line", () => {
      const content = [
        "# Notebook",
        "",
        "## c401 · 2026-07-08T05:00:00Z",
        "Tier-1 pass, all healthy — no D4 line here.",
        "",
        "## c400 · 2026-07-08T03:00:10Z",
        "D4 candidates: R2-mismatch:bar",
        "",
      ].join("\n");
      expect(parsePriorD4Candidates(content)).toEqual(new Set(["R2-mismatch:bar"]));
    });

    it("'D4 candidates: none' parses as an empty (non-null) Set", () => {
      const content = "## c1 · 2026-07-01T00:00:00Z\nD4 candidates: none\n";
      const result = parsePriorD4Candidates(content);
      expect(result).not.toBeNull();
      expect(result!.size).toBe(0);
    });
  });

  describe("Step R-4b — formatD4LedgerSection / insertD4LedgerSection", () => {
    it("formats a section with comma-joined keys, or 'none' when empty", () => {
      expect(formatD4LedgerSection(NOW_ISO, ["a", "b"])).toBe(
        `## d4-auto · ${NOW_ISO}\nD4 candidates: a,b\n`,
      );
      expect(formatD4LedgerSection(NOW_ISO, [])).toBe(`## d4-auto · ${NOW_ISO}\nD4 candidates: none\n`);
    });

    it("inserts the new section BEFORE the topmost existing section (newest-first convention)", () => {
      const existing = "# Notebook\n\n## c1 · old\nold body\n";
      const section = "## d4-auto · new\nD4 candidates: none\n";
      const result = insertD4LedgerSection(existing, section);
      expect(result.indexOf("## d4-auto")).toBeLessThan(result.indexOf("## c1"));
    });

    it("appends to end when the notebook has no sections yet (blank-state fallback)", () => {
      const result = insertD4LedgerSection("", "## d4-auto · new\nD4 candidates: none\n");
      expect(result).toBe("## d4-auto · new\nD4 candidates: none\n");
    });
  });

  describe("Step R-4b — applyR4bDebounce (2-cycle persistence gate)", () => {
    let projectRoot: string;
    let notebookPath: string;

    beforeEach(() => {
      projectRoot = makeTmpProjectRoot("debounce-unit");
      notebookPath = join(projectRoot, "docs", "agent-memory", "notebooks", "system-auditor.md");
    });

    afterEach(() => {
      rmSync(projectRoot, { recursive: true, force: true });
    });

    const readFile = (p: string) => readFileSync(p, "utf8");
    const writeFile = (p: string, s: string) => writeFileSync(p, s, "utf8");
    const fileExists = (p: string) => existsSync(p);

    it("first occurrence (cold start): zero emissions, ledger seeded", () => {
      const candidates: D4Candidate[] = [
        { key: "R3-no-board-row:foo", div: { kind: "not_found", taskId: "foo", summary: "s" } },
      ];
      const emitted = applyR4bDebounce(candidates, notebookPath, readFile, writeFile, fileExists, NOW_ISO);
      expect(emitted).toEqual([]);
      expect(existsSync(notebookPath)).toBe(true);
      expect(readFileSync(notebookPath, "utf8")).toContain("D4 candidates: R3-no-board-row:foo");
    });

    it("persisted across 2 consecutive cycles → emits on the 2nd pass", () => {
      const candidates: D4Candidate[] = [
        { key: "R3-no-board-row:foo", div: { kind: "not_found", taskId: "foo", summary: "s" } },
      ];
      const pass1 = applyR4bDebounce(candidates, notebookPath, readFile, writeFile, fileExists, NOW_ISO);
      expect(pass1).toEqual([]);

      const pass2 = applyR4bDebounce(candidates, notebookPath, readFile, writeFile, fileExists, NOW_ISO);
      expect(pass2).toEqual(candidates.map(c => c.div));
    });

    it("a candidate that self-resolves (absent next cycle) never emits", () => {
      const cycle1: D4Candidate[] = [
        { key: "R3-status-diverge:foo", div: { kind: "status", taskId: "foo", summary: "s" } },
      ];
      applyR4bDebounce(cycle1, notebookPath, readFile, writeFile, fileExists, NOW_ISO);

      // Cycle 2: candidate no longer reproduced (self-resolved) — nothing to check
      const cycle2: D4Candidate[] = [];
      const emitted2 = applyR4bDebounce(cycle2, notebookPath, readFile, writeFile, fileExists, NOW_ISO);
      expect(emitted2).toEqual([]);

      // Cycle 3: even if it reappears, it's first-occurrence again (ledger only had "none")
      const emitted3 = applyR4bDebounce(cycle1, notebookPath, readFile, writeFile, fileExists, NOW_ISO);
      expect(emitted3).toEqual([]);
    });

    it("ledger write failure is best-effort — does not throw, still returns emitted result", () => {
      const throwingWrite = () => {
        throw new Error("disk full");
      };
      expect(() =>
        applyR4bDebounce([], notebookPath, readFile, throwingWrite, fileExists, NOW_ISO),
      ).not.toThrow();
    });
  });

  describe("Integration — runTasksMdJanitor RAW-verify against the real 2026-07-08T03:00Z batch", () => {
    let projectRoot: string;
    let orchStatePath: string;

    beforeEach(() => {
      _resetDedupStore();
      projectRoot = makeTmpProjectRoot("integration-real-batch");
      orchStatePath = join(projectRoot, "docs", "data", "orch", "orch-state.json");
    });

    afterEach(() => {
      rmSync(projectRoot, { recursive: true, force: true });
    });

    function makeDeps(locks: LockRow[], sessionPresence: LockRow[] = []): JanitorDeps {
      return {
        listHeld: () => locks,
        listSessionPresence: () => sessionPresence,
        readFile: (p) => readFileSync(p, "utf8"),
        writeFile: (p, s) => writeFileSync(p, s, "utf8"),
        fileExists: (p) => existsSync(p),
        runShell: () => "",
        sendBug: async () => {},
        nowIso: () => NOW_ISO,
        projectRoot,
      };
    }

    it("suppresses ALL 7 real false-positive locks across 2 consecutive cycles (zero signal_queue rows)", async () => {
      writeFileSync(orchStatePath, JSON.stringify(baseOrchState([]), null, 2), "utf8");
      const locks = REAL_FALSE_POSITIVE_BATCH.map(id => makeLock(id));
      const deps = makeDeps(locks);

      const pass1 = await runTasksMdJanitor(deps);
      expect(pass1.errors).toEqual([]);
      expect(pass1.divergences.length).toBe(0);

      const pass2 = await runTasksMdJanitor(deps);
      expect(pass2.errors).toEqual([]);
      expect(pass2.divergences.length).toBe(0);

      const finalDoc = JSON.parse(readFileSync(orchStatePath, "utf8"));
      expect(finalDoc.signal_queue.rows.length).toBe(0);
    });

    it("negative control: genuine mismatched task ids are NOT excluded and DO emit after persisting 2 cycles", async () => {
      // No task_board rows at all for these ids → R3-no-board-row candidates.
      writeFileSync(orchStatePath, JSON.stringify(baseOrchState([]), null, 2), "utf8");
      const locks = NEGATIVE_CONTROL_TASK_IDS.map(id => makeLock(id));
      const deps = makeDeps(locks);

      const pass1 = await runTasksMdJanitor(deps);
      expect(pass1.divergences.length).toBe(0); // first occurrence — debounced

      const pass2 = await runTasksMdJanitor(deps);
      expect(pass2.divergences.length).toBe(NEGATIVE_CONTROL_TASK_IDS.length);
      const flaggedIds = pass2.divergences.map(d => d.taskId).sort();
      expect(flaggedIds).toEqual([...NEGATIVE_CONTROL_TASK_IDS].sort());

      const finalDoc = JSON.parse(readFileSync(orchStatePath, "utf8"));
      expect(finalDoc.signal_queue.rows.length).toBe(NEGATIVE_CONTROL_TASK_IDS.length);
    });

    it("live-concurrent-session lock (peer sprint, not head-tracked) is excluded from active!=held mismatch", async () => {
      const orchState = baseOrchState([]);
      orchState.head.active_task_id = "BA-DEFERRED-SCHEDULER";
      writeFileSync(orchStatePath, JSON.stringify(orchState, null, 2), "utf8");

      const nowEpoch = Math.floor(Date.parse(NOW_ISO) / 1000);
      const peerLock = makeLock("IND-P1-ROC-MOMENTUM", {
        owner_client_session: "peer-session-live",
        expires_at: nowEpoch + 500,
      });
      const sessionPresence = [
        makeLock("session-presence:peer-session-live", {
          owner_client_session: "peer-session-live",
          task_kind: "session-presence",
        }),
      ];
      const deps = makeDeps([peerLock], sessionPresence);

      const pass1 = await runTasksMdJanitor(deps);
      const pass2 = await runTasksMdJanitor(deps);
      expect(pass1.divergences.length).toBe(0);
      expect(pass2.divergences.length).toBe(0); // still excluded — live concurrent session, not orphaned
    });
  });

  describe("Regression guard — expired:false wiring (2nd pre-existing gap)", () => {
    it("production listHeld/listSessionPresence closures pass expired:false to listHeldTasks", () => {
      const src = readFileSync(
        join(import.meta.dir, "..", "scheduler", "system", "tasksMdJanitorJob.ts"),
        "utf8",
      );
      expect(src).toContain('listHeldTasks({ kind: "sprint-task", expired: false })');
      expect(src).toContain('listHeldTasks({ kind: "session-presence", expired: false })');
      // The pre-fix buggy call shape (no expired filter) must be gone.
      expect(src).not.toContain('listHeldTasks({ kind: "sprint-task" })');
    });
  });
});
