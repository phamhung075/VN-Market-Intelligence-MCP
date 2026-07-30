/**
 * CCATO-MCP-T1-DOMAIN-ENGINE — unit + side-by-side fixture parity tests
 *
 * Covers:
 *   1. claimCandidateScanner (findTickers / splitParagraphs / splitSentences /
 *      scanClaimCandidates) — self-contained fixture, unit-level coverage of
 *      the dedup rule, requires_ticker fallback, and no-ticker drop.
 *   2. verdictClassifier (flattenText / classifyVerdict / summarizeVerdict).
 *   3. quarterResolver (resolveLatestElapsedYoyPeriods) — quarter-boundary
 *      cases incl. the Jan-Mar → prior year Q4 rollover.
 *   4. Architecture brief §5.1 hard AC — side-by-side fixture parity: runs
 *      BOTH the existing bash/python engine (scripts/narrative-truth-gate.sh,
 *      unmodified) and the new TS domain scanner against the SAME real
 *      fixture (docs/social/fb-post-2026-06-30.md) and the SAME real SSOT
 *      (docs/data/claim-tool-map.json), and requires an IDENTICAL candidate
 *      set (dimension/ticker_or_dim/claim_text triples). The bash engine's
 *      live re-probe network call is intercepted by a local Bun.serve stub
 *      (NTG_SKIP_SIGNAL_EMIT=1 — no orch-state.json write, no jq dependency)
 *      that always returns a fixed non-null string, forcing every candidate
 *      to FAIL classification so its claim_text is printed and can be
 *      parsed back out — this is the only way to recover claim_text from the
 *      bash engine's stdout contract (only [FAIL] lines carry it).
 *
 * Spec: docs/architecture-briefs/2026-07-17-ccato-truthgate-mcp-native.md §5.1
 */

import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  findTickers,
  splitParagraphs,
  splitSentences,
  scanClaimCandidates,
  type ClaimToolMap,
} from "../domain/services/narrativeTruthGate/claimCandidateScanner.js";
import {
  flattenText,
  classifyVerdict,
  summarizeVerdict,
} from "../domain/services/narrativeTruthGate/verdictClassifier.js";
import { resolveLatestElapsedYoyPeriods } from "../domain/services/narrativeTruthGate/quarterResolver.js";

// __dirname = apps/mcp-server/src/__tests__ → go up 4 levels to reach monorepo root
const REPO_ROOT = path.resolve(__dirname, "../../../..");

// ═══════════════════════════════════════════════════════════════════════════
// 1. claimCandidateScanner — unit coverage (self-contained fixture)
// ═══════════════════════════════════════════════════════════════════════════

const FIXTURE_MAP: ClaimToolMap = {
  negation_lexicon: ["không có dữ liệu", "chưa trả được"],
  non_ticker_tokens: ["RSI", "USD", "GDP"],
  dimensions: [
    {
      id: "technical_indicators",
      keywords: ["kỹ thuật", "RSI"],
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

describe("CCATO-MCP-T1 — findTickers", () => {
  it("extracts VN-ticker candidates in first-seen order, deduped", () => {
    const nonTicker = new Set(["USD", "GDP"]);
    expect(findTickers("VNM tăng, sau đó VIC và VNM giảm.", nonTicker)).toEqual(["VNM", "VIC"]);
  });

  it("excludes non_ticker_tokens", () => {
    const nonTicker = new Set(["RSI", "USD"]);
    expect(findTickers("RSI của VNM tăng, USD ổn định.", nonTicker)).toEqual(["VNM"]);
  });

  it("returns empty array when no ticker present", () => {
    const nonTicker = new Set<string>();
    expect(findTickers("không có mã nào ở đây cả", nonTicker)).toEqual([]);
  });
});

describe("CCATO-MCP-T1 — splitParagraphs / splitSentences", () => {
  it("splits on blank-line boundaries and drops blank paragraphs", () => {
    const body = "Đoạn một.\n\n\nĐoạn hai.\n\n   \n\nĐoạn ba.";
    expect(splitParagraphs(body)).toEqual(["Đoạn một.", "Đoạn hai.", "Đoạn ba."]);
  });

  it("splits sentences on [.!?] followed by whitespace", () => {
    expect(splitSentences("Câu một. Câu hai! Câu ba?")).toEqual(["Câu một.", "Câu hai!", "Câu ba?"]);
  });

  it("drops blank sentences", () => {
    expect(splitSentences("  Chỉ một câu duy nhất.  ")).toEqual(["Chỉ một câu duy nhất."]);
  });
});

describe("CCATO-MCP-T1 — scanClaimCandidates", () => {
  it("returns [] when no negation-lexicon phrase matches anywhere", () => {
    const body = "VNM tăng giá hôm nay. Thị trường ổn định.";
    expect(scanClaimCandidates(body, FIXTURE_MAP)).toEqual([]);
  });

  it("returns [] when negation matches but no dimension keyword co-occurs in the same sentence", () => {
    const body = "VNM không có dữ liệu về giá đóng cửa hôm nay.";
    expect(scanClaimCandidates(body, FIXTURE_MAP)).toEqual([]);
  });

  it("emits one candidate with requires_ticker=true resolved from the paragraph", () => {
    const body = "VNM không có dữ liệu kỹ thuật phiên này. Giá đóng cửa ổn định.";
    const candidates = scanClaimCandidates(body, FIXTURE_MAP);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      ticker: "VNM",
      ticker_or_dim: "VNM",
      matched_negation: "không có dữ liệu",
    });
    expect(candidates[0]?.dimension.id).toBe("technical_indicators");
  });

  it("requires_ticker=false resolves the claim-side id to the dimension id, probe ticker from the whole post", () => {
    const body = "Tin tức: VNM giảm phiên nay.\n\nKhối ngoại không có dữ liệu chi tiết hôm nay.";
    const candidates = scanClaimCandidates(body, FIXTURE_MAP);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      dimension: { id: "foreign_flow" },
      ticker: "VNM", // resolved from whole-post tickers, not the (ticker-less) paragraph
      ticker_or_dim: "foreign_flow",
    });
  });

  it("drops the candidate when no ticker is resolvable anywhere in the post", () => {
    const body = "Khối ngoại không có dữ liệu chi tiết hôm nay.";
    expect(scanClaimCandidates(body, FIXTURE_MAP)).toEqual([]);
  });

  it("dedup rule: at most one candidate per (paragraph, dimension) — first matching sentence wins, second is dropped", () => {
    const body =
      "VNM không có dữ liệu kỹ thuật phiên này. VNM không có dữ liệu kỹ thuật phiên này nữa, xin lỗi.";
    const candidates = scanClaimCandidates(body, FIXTURE_MAP);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.claim_text).toBe("VNM không có dữ liệu kỹ thuật phiên này.");
  });

  it("dedup rule: a second sentence in the SAME paragraph for a DIFFERENT dimension can still fire", () => {
    const body =
      "VNM không có dữ liệu kỹ thuật phiên này. Khối ngoại không có dữ liệu chi tiết hôm nay cũng vậy.";
    const candidates = scanClaimCandidates(body, FIXTURE_MAP);
    const dims = candidates.map((c) => c.dimension.id).sort();
    expect(dims).toEqual(["foreign_flow", "technical_indicators"]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. verdictClassifier
// ═══════════════════════════════════════════════════════════════════════════

const NULL_MARKERS = ["không có dữ liệu", "not found in database", "period(s) not found"];

describe("CCATO-MCP-T1 — flattenText", () => {
  it("joins a plain object's values with ' | ', stringifying non-string values", () => {
    expect(flattenText({ rsi: 20.3, note: "ổn định" })).toBe("20.3 | ổn định");
  });

  it("JSON.stringifies arrays (never treated as a dict)", () => {
    expect(flattenText([1, "a", { x: 2 }])).toBe(JSON.stringify([1, "a", { x: 2 }]));
  });

  it("JSON.stringifies primitives and null", () => {
    expect(flattenText("plain string")).toBe(JSON.stringify("plain string"));
    expect(flattenText(42)).toBe("42");
    expect(flattenText(null)).toBe("null");
  });
});

describe("CCATO-MCP-T1 — classifyVerdict", () => {
  it("classifies null/undefined as ERROR (probe never ran)", () => {
    expect(classifyVerdict(null, NULL_MARKERS)).toBe("ERROR");
    expect(classifyVerdict(undefined, NULL_MARKERS)).toBe("ERROR");
  });

  it("classifies the {_probe_error} wrapper as ERROR", () => {
    expect(classifyVerdict({ _probe_error: "timeout" }, NULL_MARKERS)).toBe("ERROR");
  });

  it("classifies empty/blank flattened text as NULL", () => {
    expect(classifyVerdict({}, NULL_MARKERS)).toBe("NULL");
    // A string-valued dict entry flattens to its raw string content (see
    // flattenText tests above) — an empty string VALUE flattens to "".
    // (A bare "" resp_obj itself would flatten to the JSON literal `""`,
    // which is non-blank — that never occurs on the real pipeline, where
    // resp_obj is always a dict/null/error-wrapper, never a bare string.)
    expect(classifyVerdict({ text: "" }, NULL_MARKERS)).toBe("NULL");
    expect(classifyVerdict({ text: "   " }, NULL_MARKERS)).toBe("NULL");
  });

  it("classifies a tool_null_markers substring match as NULL, case-insensitively", () => {
    expect(classifyVerdict({ text: "Period(s) NOT FOUND in database for VNM" }, NULL_MARKERS)).toBe(
      "NULL",
    );
    expect(classifyVerdict({ text: "Không Có Dữ Liệu cho mã này" }, NULL_MARKERS)).toBe("NULL");
  });

  it("classifies real populated data as NON_NULL (the CCATO contradiction)", () => {
    expect(classifyVerdict({ rsi: 20.3, macd: "bullish" }, NULL_MARKERS)).toBe("NON_NULL");
  });
});

describe("CCATO-MCP-T1 — summarizeVerdict", () => {
  it("collapses whitespace and truncates to maxLen", () => {
    // { text: <string> } flattens to the raw string value itself (no JSON
    // quoting — flattenText only JSON.stringifies NON-string values).
    const raw = { text: "a".repeat(300) };
    const summary = summarizeVerdict(raw, 10);
    expect(summary).toBe("a".repeat(10));
  });

  it("collapses internal multi-space/newline runs to single spaces", () => {
    expect(summarizeVerdict({ text: "line one\n\n  line   two" })).toBe("line one line two");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. quarterResolver
// ═══════════════════════════════════════════════════════════════════════════

describe("CCATO-MCP-T1 — resolveLatestElapsedYoyPeriods", () => {
  it("Jan-Mar (q=0) rolls back to the PRIOR year's Q4", () => {
    for (const iso of ["2026-01-15T00:00:00Z", "2026-02-01T00:00:00Z", "2026-03-31T23:59:59Z"]) {
      const result = resolveLatestElapsedYoyPeriods(new Date(iso));
      expect(result).toEqual({
        period1: { year: 2025, quarter: "Q4" },
        period2: { year: 2024, quarter: "Q4" },
      });
    }
  });

  it("Apr-Jun (q=1) resolves to the SAME year's Q1", () => {
    const result = resolveLatestElapsedYoyPeriods(new Date("2026-04-01T00:00:00Z"));
    expect(result).toEqual({
      period1: { year: 2026, quarter: "Q1" },
      period2: { year: 2025, quarter: "Q1" },
    });
  });

  it("Jul-Sep (q=2) resolves to the SAME year's Q2", () => {
    const result = resolveLatestElapsedYoyPeriods(new Date("2026-07-28T00:00:00Z"));
    expect(result).toEqual({
      period1: { year: 2026, quarter: "Q2" },
      period2: { year: 2025, quarter: "Q2" },
    });
  });

  it("Oct-Dec (q=3) resolves to the SAME year's Q3", () => {
    const result = resolveLatestElapsedYoyPeriods(new Date("2026-12-31T23:59:59Z"));
    expect(result).toEqual({
      period1: { year: 2026, quarter: "Q3" },
      period2: { year: 2025, quarter: "Q3" },
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. §5.1 hard AC — side-by-side fixture parity vs. the existing bash engine
// ═══════════════════════════════════════════════════════════════════════════

interface ParsedFailLine {
  dimension: string;
  ticker_or_dim: string;
  claim_text: string;
}

const FAIL_LINE_PATTERN =
  /^\[FAIL\] dimension=(\S+) tool=\S+ ticker=(\S+) claim="(.*?)" returned="(?:.*)"$/;

function parseFailLines(stdout: string): ParsedFailLine[] {
  const out: ParsedFailLine[] = [];
  for (const line of stdout.split("\n")) {
    const m = FAIL_LINE_PATTERN.exec(line);
    if (!m) continue;
    const [, dimension, ticker_or_dim, claim_text] = m;
    if (dimension === undefined || ticker_or_dim === undefined || claim_text === undefined) continue;
    out.push({ dimension, ticker_or_dim, claim_text });
  }
  return out;
}

/**
 * Minimal MCP streamable-HTTP JSON-RPC stub that always answers a
 * `tools/call` request with a fixed non-null, non-marker-matching string —
 * forcing every candidate the bash engine scans to classify NON_NULL/FAIL,
 * so its claim_text is recoverable from stdout (see file header).
 */
function startFixedResponseGateway(fixedText: string) {
  return Bun.serve({
    port: 0,
    async fetch(req) {
      if (req.method !== "POST") return new Response("not found", { status: 404 });
      let payload: { id?: unknown; method?: string } = {};
      try {
        payload = JSON.parse(await req.text());
      } catch {
        // malformed body — fall through to the generic empty-result response below
      }
      const { id, method } = payload;

      if (method === "initialize") {
        return new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id,
            result: { protocolVersion: "2024-11-05", capabilities: {}, serverInfo: { name: "stub-gateway", version: "1" } },
          }),
          { status: 200, headers: { "content-type": "application/json", "Mcp-Session-Id": "stub-session-1" } },
        );
      }
      if (method === "notifications/initialized") {
        return new Response(null, { status: 202 });
      }
      if (method === "tools/call") {
        return new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id,
            result: { isError: false, content: [{ type: "text", text: fixedText }] },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ jsonrpc: "2.0", id, result: {} }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });
}

describe("CCATO-MCP-T1 — §5.1 side-by-side fixture parity (bash engine vs. TS scanner)", () => {
  it(
    "produces an IDENTICAL candidate set (dimension/ticker_or_dim/claim_text) on docs/social/fb-post-2026-06-30.md",
    async () => {
      const fixturePath = path.resolve(REPO_ROOT, "docs/social/fb-post-2026-06-30.md");
      const claimMapPath = path.resolve(REPO_ROOT, "docs/data/claim-tool-map.json");
      const scriptPath = path.resolve(REPO_ROOT, "scripts/narrative-truth-gate.sh");

      const fixedText = "STUB_NON_NULL_PROBE_RESPONSE_FOR_PARITY_TEST";
      const stub = startFixedResponseGateway(fixedText);

      let stdout: string;
      let exitCode: number;
      try {
        const proc = Bun.spawn(["bash", scriptPath, fixturePath, "ccato-parity-test-agent"], {
          cwd: REPO_ROOT,
          env: {
            ...process.env,
            MCP_GATEWAY_URL: stub.url.toString(),
            NTG_SKIP_SIGNAL_EMIT: "1", // no orch-state.json write, no jq dependency
          },
          stdout: "pipe",
          stderr: "pipe",
        });
        [stdout, exitCode] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
      } finally {
        stub.stop();
      }

      // Every candidate was forced to FAIL by the fixed non-null stub response
      // → script exits 1 (fail_count > 0). Exit 2 would mean a genuine
      // usage/config error (e.g. claim-tool-map.json unreadable) — fail loud.
      expect(exitCode).toBe(1);

      const bashCandidates = parseFailLines(stdout)
        .map((c) => `${c.dimension}::${c.ticker_or_dim}::${c.claim_text}`)
        .sort();

      const claimMap = JSON.parse(readFileSync(claimMapPath, "utf8")) as ClaimToolMap;
      const postBody = readFileSync(fixturePath, "utf8");
      const tsCandidates = scanClaimCandidates(postBody, claimMap)
        .map((c) => `${c.dimension.id}::${c.ticker_or_dim}::${c.claim_text}`)
        .sort();

      expect(bashCandidates.length).toBeGreaterThan(0); // sanity: fixture must actually exercise the engine
      expect(tsCandidates).toEqual(bashCandidates);
    },
    20000,
  );
});
