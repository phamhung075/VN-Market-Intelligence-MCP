// src/__tests__/ALPHA-S2-RAG-FTS-REBUILD-CRON.test.ts
// ALPHA-S2-RAG-FTS-REBUILD-CRON — unit tests for runRagFtsRebuildCron
// (Sprint FLOW-PRICE-ALPHA-LOOP). Covers the single-branch HARD-fail contract (brief §2.3):
//   1. Success (rebuildFn resolves) → mocked notifyBug NOT called, rebuilt:true.
//   2. HARD fail (rebuildFn rejects/throws — non-2xx/network/timeout) → mocked notifyBug
//      CALLED with a message naming the endpoint, rebuilt:false.
//   3. Source-inspection proof (no mock.module() needed — avoids leaking an incomplete
//      Database stub into sibling test files via Bun's ESM mock cache, see
//      mock-module-afterall-guard.test.ts) that the job never imports the DB/schema layer
//      at all — confirms the side-effect-free design, not just "test passes".
//
// DI-injectable deps.rebuildFn/deps.notifyBug mirrors runSbvOmoLiquidityCron's test seam
// (deps.baseUrl/deps.notifyBug) — mocking rebuildFn directly rather than globalThis.fetch,
// since ragRebuildFts() throws (Error-based contract) instead of returning macroFetch's
// discriminated envelope.
//
// Design SSOT: docs/architecture-briefs/2026-07-15-alpha-s2-rag-fts-rebuild-cron.md

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runRagFtsRebuildCron } from "../scheduler/rag/ragFtsRebuildCronJob.js";

describe("runRagFtsRebuildCron — single-branch HARD-fail contract", () => {
  it("Success (rebuildFn resolves) → notifyBug NOT called, rebuilt:true", async () => {
    let notifyCallCount = 0;
    const notifyBug = async (_msg: string) => {
      notifyCallCount++;
      return 0;
    };
    const rebuildFn = async () => ({ status: "ok", message: "FTS indexes rebuilt: title, summary" });

    const result = await runRagFtsRebuildCron({ notifyBug, rebuildFn });

    expect(result.rebuilt).toBe(true);
    expect(result.reason).toBe("ok");
    expect(notifyCallCount).toBe(0);
  });

  it("HARD fail (rebuildFn rejects — e.g. non-2xx/network/timeout) → notifyBug CALLED with endpoint detail, rebuilt:false", async () => {
    let notifyCallCount = 0;
    let capturedMsg = "";
    const notifyBug = async (msg: string) => {
      notifyCallCount++;
      capturedMsg = msg;
      return 12345;
    };
    const rebuildFn = async () => {
      throw new Error("[ragHttpClient] rebuild-fts failed: 500 internal server error");
    };

    const result = await runRagFtsRebuildCron({ notifyBug, rebuildFn });

    expect(result.rebuilt).toBe(false);
    expect(result.reason).toBe("http-error");
    expect(notifyCallCount).toBe(1);
    expect(capturedMsg).toContain("/admin/rebuild-fts");
    expect(capturedMsg).toContain("rebuild-fts failed: 500 internal server error");
    expect(capturedMsg).toContain("FTS index NOT");
  });

  it("HARD fail (rebuildFn rejects — 90s AbortSignal.timeout) → notifyBug CALLED, rebuilt:false", async () => {
    let notifyCallCount = 0;
    const notifyBug = async (_msg: string) => {
      notifyCallCount++;
      return 0;
    };
    const rebuildFn = async () => {
      throw new Error("The operation timed out.");
    };

    const result = await runRagFtsRebuildCron({ notifyBug, rebuildFn });

    expect(result.rebuilt).toBe(false);
    expect(result.reason).toBe("http-error");
    expect(notifyCallCount).toBe(1);
  });

  it("side-effect-free proof: job source never imports/touches the DB layer (zero local write surface)", () => {
    // Structural proof (not a runtime mock.module() trap — see file header note): this job
    // triggers a remote persist on rag-service and writes NOTHING itself (architecture brief
    // §2.3, "No local DB write anywhere in this job"). Reading the compiled source and
    // asserting it never references the DB/schema layer is a stronger, leak-free guarantee
    // than a mocked DB handle — it fails loudly if a future change ever wires in a
    // getDb()/db.prepare() call, without risking an incomplete Database stub bleeding into
    // sibling test files via Bun's ESM mock cache.
    const src = readFileSync(
      join(process.cwd(), "src/scheduler/rag/ragFtsRebuildCronJob.ts"),
      "utf-8",
    );
    expect(src).not.toContain("getDb");
    expect(src).not.toContain("schema.js");
    expect(src).not.toContain(".prepare(");
    expect(src).not.toContain("bun:sqlite");
  });
});
