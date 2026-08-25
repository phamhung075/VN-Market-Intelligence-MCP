/**
 * CCATO-MCP-T5-USECASE — unit tests
 *
 * Covers runNarrativeTruthGate's orchestration with every T2/T3/T4
 * dependency stubbed via the injectable deps bag (zero fs/network I/O):
 *   1. CONFIG_ERROR — empty agent_id, empty post_body, claim-map load
 *      failure (ClaimToolMapLoadError message surfaced verbatim, plus a
 *      generic-Error fallback path).
 *   2. No candidates -> PASS, empty findings, signal writer never called.
 *   3. Cache-hit short-circuit — non-null cache value skips probeFn.
 *   4. Cache miss / no cache -> live probeFn called with (candidate, now, adapters).
 *   5. NON_NULL probe -> FAIL finding; signal writer called ONCE with the
 *      full FAIL-finding array (fan-out, not per-finding).
 *   6. NULL probe (tool_null_markers match) -> PASS finding, no signal write.
 *   7. ERROR probe (probe throws / isError shape) -> WARN finding, no signal
 *      write, verdict stays PASS when no FAIL is present alongside it.
 *   8. Mixed candidates -> verdict FAIL iff >=1 FAIL finding; determinism
 *      across repeated calls with the same stubbed inputs.
 *
 * Spec: docs/architecture-briefs/2026-07-17-ccato-truthgate-mcp-native.md §3.1-3.2, §5.2
 */

import { describe, it, expect, mock } from "bun:test";
import {
  runNarrativeTruthGate,
  type RunNarrativeTruthGateDeps,
} from "../application/usecases/runNarrativeTruthGate.js";
import { ClaimToolMapLoadError } from "../infrastructure/fileStore/claimToolMapLoader.js";
import type { ClaimToolMap } from "../infrastructure/fileStore/claimToolMapLoader.js";
import type { ProbeResult } from "../infrastructure/probes/narrativeTruthProbeAdapters.js";

const CLAIM_MAP: ClaimToolMap = {
  negation_lexicon: ["không có dữ liệu"],
  non_ticker_tokens: ["USD"],
  tool_null_markers: ["not found in database"],
  dimensions: [
    {
      id: "technical_indicators",
      keywords: ["kỹ thuật"],
      tool: "get_technical_indicators",
      requires_ticker: true,
      arg_style: "ticker_code",
    },
    {
      id: "foreign_flow",
      keywords: ["khối ngoại"],
      tool: "get_foreign_flow",
      requires_ticker: false,
      arg_style: "ticker_code",
    },
  ],
};

const ONE_CANDIDATE_BODY = "VNM không có dữ liệu kỹ thuật phiên này.";
const TWO_CANDIDATE_BODY =
  "VNM không có dữ liệu kỹ thuật phiên này. Khối ngoại không có dữ liệu giao dịch hôm nay.";

/**
 * FIX-CCATO-NTG-ROWS-NOT-PRODUCED-BY-EITHER-SANCTIONED-ENGINE-FORGED-WRITER-ID:
 * `writeSignalsFn` MUST be stubbed by default here. Five cases below reach a
 * FAIL verdict without naming it (cache-hit rsi 60; null-cache rsi 61; no-cache
 * rsi 61; the 2-call determinism case at rsi 62.1; the missing-tool_null_markers
 * case) — and runNarrativeTruthGate falls back to the REAL
 * writeNarrativeContradictionSignals at the REAL DEFAULT_ORCH_STATE_PATH when
 * neither `writeSignalsFn` nor `orchStatePath` is supplied. With the frozen
 * `now` below, every `bun test` run therefore appended 6 rows to the LIVE
 * docs/data/orch/orch-state.json carrying ts 2026-08-24T00:00:00Z and no
 * dedup_key — the exact {60, 61, 61, 62.1, 62.1, "not found in database"}
 * multiset PO measured live at 12/24/24/12 across 12 batches. Cases that need
 * to inspect the call still override it explicitly; the spread keeps them
 * winning.
 */
function baseDeps(overrides: Partial<RunNarrativeTruthGateDeps> = {}): RunNarrativeTruthGateDeps {
  return {
    loadClaimToolMapFn: () => CLAIM_MAP,
    now: new Date("2026-08-24T00:00:00Z"),
    writeSignalsFn: () => {},
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. CONFIG_ERROR
// ═══════════════════════════════════════════════════════════════════════════

describe("CCATO-MCP-T5 — CONFIG_ERROR", () => {
  it("empty agent_id -> CONFIG_ERROR, claim map never loaded", async () => {
    const loadFn = mock(() => CLAIM_MAP);
    const result = await runNarrativeTruthGate(
      { post_body: "x", agent_id: "  " },
      baseDeps({ loadClaimToolMapFn: loadFn }),
    );
    expect(result).toEqual({ verdict: "CONFIG_ERROR", findings: [], config_error_reason: "agent_id is empty" });
    expect(loadFn).not.toHaveBeenCalled();
  });

  it("empty post_body -> CONFIG_ERROR", async () => {
    const result = await runNarrativeTruthGate({ post_body: "   ", agent_id: "chef" }, baseDeps());
    expect(result).toEqual({ verdict: "CONFIG_ERROR", findings: [], config_error_reason: "post_body is empty" });
  });

  it("ClaimToolMapLoadError -> message surfaced verbatim as config_error_reason", async () => {
    const result = await runNarrativeTruthGate(
      { post_body: "x", agent_id: "chef" },
      baseDeps({
        loadClaimToolMapFn: () => {
          throw new ClaimToolMapLoadError("claim-tool-map.json not found at /nope");
        },
      }),
    );
    expect(result.verdict).toBe("CONFIG_ERROR");
    expect(result.config_error_reason).toBe("claim-tool-map.json not found at /nope");
    expect(result.findings).toEqual([]);
  });

  it("non-ClaimToolMapLoadError thrown by loader -> String(err) fallback", async () => {
    const result = await runNarrativeTruthGate(
      { post_body: "x", agent_id: "chef" },
      baseDeps({
        loadClaimToolMapFn: () => {
          throw new Error("disk exploded");
        },
      }),
    );
    expect(result.verdict).toBe("CONFIG_ERROR");
    expect(result.config_error_reason).toBe("Error: disk exploded");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. No candidates
// ═══════════════════════════════════════════════════════════════════════════

describe("CCATO-MCP-T5 — no candidates", () => {
  it("post body with zero negation matches -> PASS, empty findings, no signal write", async () => {
    const writeSignalsFn = mock(() => {});
    const result = await runNarrativeTruthGate(
      { post_body: "Giá đóng cửa ổn định hôm nay.", agent_id: "chef" },
      baseDeps({ writeSignalsFn }),
    );
    expect(result).toEqual({ verdict: "PASS", findings: [] });
    expect(writeSignalsFn).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3-4. Cache short-circuit vs live probe
// ═══════════════════════════════════════════════════════════════════════════

describe("CCATO-MCP-T5 — cache vs live probe dispatch", () => {
  it("non-null cache hit short-circuits: probeFn never called, source='cache'", async () => {
    const probeFn = mock(async (): Promise<ProbeResult> => ({ raw: { text: "should not be used" }, isError: false }));
    const result = await runNarrativeTruthGate(
      { post_body: ONE_CANDIDATE_BODY, agent_id: "chef", cache: { VNM: { technical_indicators: { rsi: 60 } } } },
      baseDeps({ probeFn }),
    );
    expect(probeFn).not.toHaveBeenCalled();
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.source).toBe("cache");
  });

  it("null cache value does NOT short-circuit (script L339-341 parity) -> live probe still called", async () => {
    const probeFn = mock(async (): Promise<ProbeResult> => ({ raw: { rsi: 61 }, isError: false }));
    const result = await runNarrativeTruthGate(
      { post_body: ONE_CANDIDATE_BODY, agent_id: "chef", cache: { VNM: { technical_indicators: null } } },
      baseDeps({ probeFn }),
    );
    expect(probeFn).toHaveBeenCalledTimes(1);
    expect(result.findings[0]?.source).toBe("live");
  });

  it("no cache supplied -> live probe called with (candidate, now, adapters)", async () => {
    const now = new Date("2026-08-24T00:00:00Z");
    const adapters = {} as never;
    const probeFn = mock(async (_candidate: unknown, _now: unknown, _adapters: unknown): Promise<ProbeResult> => ({
      raw: { rsi: 61 },
      isError: false,
    }));
    await runNarrativeTruthGate(
      { post_body: ONE_CANDIDATE_BODY, agent_id: "chef" },
      baseDeps({ probeFn, now, adapters }),
    );
    expect(probeFn).toHaveBeenCalledTimes(1);
    const [candidateArg, nowArg, adaptersArg] = probeFn.mock.calls[0] ?? [];
    expect((candidateArg as { ticker: string }).ticker).toBe("VNM");
    expect(nowArg).toBe(now);
    expect(adaptersArg).toBe(adapters);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5-7. Classification -> result -> signal-write fan-out
// ═══════════════════════════════════════════════════════════════════════════

describe("CCATO-MCP-T5 — classification drives result + signal emit", () => {
  it("NON_NULL probe -> FAIL finding; signal writer called ONCE with the full FAIL array", async () => {
    const writeSignalsFn = mock((_findings: readonly unknown[], _agentId: string, _orchStatePath?: string, _now?: Date) => {});
    const orchStatePath = "/fixture/orch-state.json";
    const result = await runNarrativeTruthGate(
      { post_body: TWO_CANDIDATE_BODY, agent_id: "chef" },
      baseDeps({
        probeFn: async () => ({ raw: { rsi: 62.1 }, isError: false }),
        writeSignalsFn,
        orchStatePath,
      }),
    );
    expect(result.verdict).toBe("FAIL");
    expect(result.findings.every((f) => f.result === "FAIL")).toBe(true);
    expect(writeSignalsFn).toHaveBeenCalledTimes(1);
    const [findingsArg, agentIdArg, pathArg] = writeSignalsFn.mock.calls[0] ?? [];
    expect((findingsArg as unknown[]).length).toBe(2);
    expect(agentIdArg).toBe("chef");
    expect(pathArg).toBe(orchStatePath);
  });

  it("NON_NULL FAIL finding maps 1:1 onto T4's NarrativeContradictionFinding shape", async () => {
    const writeSignalsFn = mock((_findings: readonly unknown[], _agentId: string, _orchStatePath?: string, _now?: Date) => {});
    await runNarrativeTruthGate(
      { post_body: ONE_CANDIDATE_BODY, agent_id: "chef" },
      baseDeps({ probeFn: async () => ({ raw: { rsi: 62.1 }, isError: false }), writeSignalsFn }),
    );
    const [findingsArg] = writeSignalsFn.mock.calls[0] ?? [];
    expect(findingsArg).toEqual([
      {
        dimension: "technical_indicators",
        tool: "get_technical_indicators",
        ticker_or_dim: "VNM",
        probe_ticker: "VNM",
        claim_text: "VNM không có dữ liệu kỹ thuật phiên này.",
        returned_value: "62.1",
      },
    ]);
  });

  it("NULL probe (tool_null_markers substring match) -> PASS finding, no signal write", async () => {
    const writeSignalsFn = mock(() => {});
    const result = await runNarrativeTruthGate(
      { post_body: ONE_CANDIDATE_BODY, agent_id: "chef" },
      baseDeps({
        probeFn: async () => ({ raw: { note: "not found in database for VNM" }, isError: false }),
        writeSignalsFn,
      }),
    );
    expect(result.verdict).toBe("PASS");
    expect(result.findings[0]?.result).toBe("PASS");
    expect(writeSignalsFn).not.toHaveBeenCalled();
  });

  it("probe error ({_probe_error}) -> WARN finding, no signal write, verdict PASS when it's the only candidate", async () => {
    const writeSignalsFn = mock(() => {});
    const result = await runNarrativeTruthGate(
      { post_body: ONE_CANDIDATE_BODY, agent_id: "chef" },
      baseDeps({
        probeFn: async () => ({ raw: { _probe_error: "TA service down" }, isError: true }),
        writeSignalsFn,
      }),
    );
    expect(result.verdict).toBe("PASS");
    expect(result.findings[0]?.result).toBe("WARN");
    expect(writeSignalsFn).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 8. Mixed candidates + determinism
// ═══════════════════════════════════════════════════════════════════════════

describe("CCATO-MCP-T5 — mixed candidates + determinism", () => {
  it("verdict is FAIL when at least one finding is FAIL, even alongside PASS/WARN candidates", async () => {
    let call = 0;
    const probeFn = mock(async (): Promise<ProbeResult> => {
      call += 1;
      if (call === 1) return { raw: { rsi: 62.1 }, isError: false }; // technical_indicators -> FAIL
      return { raw: { note: "not found in database" }, isError: false }; // foreign_flow -> PASS
    });
    const result = await runNarrativeTruthGate(
      { post_body: TWO_CANDIDATE_BODY, agent_id: "chef" },
      baseDeps({ probeFn, writeSignalsFn: mock(() => {}) }),
    );
    expect(result.verdict).toBe("FAIL");
    expect(result.findings.map((f) => f.result).sort()).toEqual(["FAIL", "PASS"]);
  });

  it("identical inputs + deterministic stubs -> identical verdict across repeated calls", async () => {
    const deps = baseDeps({ probeFn: async () => ({ raw: { rsi: 62.1 }, isError: false }) });
    const r1 = await runNarrativeTruthGate({ post_body: ONE_CANDIDATE_BODY, agent_id: "chef" }, deps);
    const r2 = await runNarrativeTruthGate({ post_body: ONE_CANDIDATE_BODY, agent_id: "chef" }, deps);
    expect(r1).toEqual(r2);
  });

  it("claim map missing tool_null_markers -> defaults to [] (no crash, NON_NULL for any non-empty text)", async () => {
    const { tool_null_markers, ...mapWithoutMarkers } = CLAIM_MAP;
    const result = await runNarrativeTruthGate(
      { post_body: ONE_CANDIDATE_BODY, agent_id: "chef" },
      baseDeps({
        loadClaimToolMapFn: () => mapWithoutMarkers,
        probeFn: async () => ({ raw: { note: "not found in database" }, isError: false }),
      }),
    );
    // "not found in database" would normally match tool_null_markers -> PASS;
    // with the field absent, classifyVerdict has zero markers to match -> NON_NULL -> FAIL.
    expect(result.findings[0]?.classification).toBe("NON_NULL");
    expect(result.findings[0]?.result).toBe("FAIL");
  });
});
