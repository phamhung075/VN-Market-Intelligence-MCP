Bun.env["DB_PATH"] = ":memory:";

/**
 * FIX-MACRO-CALENDAR-WIRE-STATIC-SOURCE — regression test
 *
 * Root cause (verified at source): the `get_macro_calendar` MCP tool
 * (carryTools.ts) did an HTTP GET to the macro-indicators Go
 * `/macro-calendar` endpoint (handlers_calendar.go), which is the FDA-4
 * honest-unavailable STUB — it ALWAYS returns
 * `{events:[],status:"unavailable",is_estimate:true,source_tier:4}`
 * (no live source was ever wired there; by-design honest-degraded, not a
 * regression). Meanwhile a COMPLETE, usable calendar already existed
 * UNWIRED in the same mcp-server:
 * domain/services/macro/macroCalendar.ts#getMacroCalendar() — a PURE
 * function (no external fetch) returning ~36 FOMC/GSO-CPI/GSO-GDP/
 * Vietnam-PMI/SBV 2026 events with isPivotWindow annotations.
 *
 * Fix: repoint get_macro_calendar at the local getMacroCalendar() domain
 * service directly — drop the HTTP hop entirely (data is in-repo already,
 * no upstream fetch needed). Wholly inside apps/mcp-server/.
 *
 * This file drives the REAL registered tool handler end-to-end (precedent
 * harness: FIX-AGENTSIGNALS-FROMAGENT-SCHEMA.test.ts /
 * 1194-agent08-tools.test.ts McpServer `_registeredTools[name].handler(args)`
 * pattern — no HTTP mocking, no fixture duplication) and asserts:
 *   - events.length > 0 with the 2026 FOMC/GSO/PMI/SBV schedule
 *   - status !== "unavailable"
 *   - source_tier === 3 ("derived static schedule" — NOT tier-4 stub)
 *   - isPivotWindow flags present on events
 *   - days=N is honored as a GENERIC window filter (not a single-month
 *     special case — no hardcoded fixture)
 *   - pivotWindowWarning (the pivot_window / pivot_window_active signal
 *     that alert-commander/digest-predict derive
 *     `pivot_window_active = (pivotWindowWarning != null)` from) is a
 *     real, non-crashing field on the payload
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerCarryTools } from "../interface/mcp/tools/macro/carryTools.js";

// ── McpServer handler-call harness (precedent: 1194-agent08-tools.test.ts,
//    FIX-AGENTSIGNALS-FROMAGENT-SCHEMA.test.ts) ──────────────────────────────

type ToolResponse = { content: Array<{ type: string; text: string }> };

async function callTool(
  server: McpServer,
  toolName: string,
  args: Record<string, unknown>,
): Promise<ToolResponse> {
  const tools = (
    server as unknown as {
      _registeredTools: Record<
        string,
        { handler?: (args: unknown) => Promise<unknown>; callback?: (args: unknown) => Promise<unknown> }
      >;
    }
  )._registeredTools;

  const tool = tools[toolName];
  if (!tool) throw new Error(`Tool not registered: ${toolName}`);
  const fn = tool.handler ?? tool.callback;
  if (!fn) throw new Error(`No callable for: ${toolName}`);
  return fn(args) as Promise<ToolResponse>;
}

// Fail the whole suite loudly (not a silent pass) if fetch is ever reached —
// proves the HTTP hop to the macro-indicators FDA-4 stub is truly dropped.
let fetchCalled = false;
let restoreFetch: (() => void) | undefined;

describe("FIX-MACRO-CALENDAR-WIRE-STATIC-SOURCE — get_macro_calendar repointed at local domain service", () => {
  let server: McpServer;

  beforeEach(() => {
    fetchCalled = false;
    const originalFetch = globalThis.fetch;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).fetch = async (...fetchArgs: unknown[]) => {
      fetchCalled = true;
      // If the fix is undone, this simulates the FDA-4 stub so the test
      // fails on shape (source_tier=4/status=unavailable), not a crash.
      return new Response(
        JSON.stringify({ events: [], daysRequested: 60, status: "unavailable", is_estimate: true, source_tier: 4 }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };
    restoreFetch = () => {
      globalThis.fetch = originalFetch;
    };

    server = new McpServer(
      { name: "test-fix-macro-calendar-wire-static-source", version: "1.0.0" },
      { capabilities: { tools: {} } },
    );
    registerCarryTools(server);
  });

  afterEach(() => {
    restoreFetch?.();
  });

  it("AC-1: no HTTP fetch is made — data is served in-repo (drops the HTTP hop entirely)", async () => {
    await callTool(server, "get_macro_calendar", {});
    expect(fetchCalled).toBe(false);
  });

  it("AC-2: events.length > 0 with the 2026 FOMC/GSO/PMI/SBV schedule, status !== 'unavailable'", async () => {
    const result = await callTool(server, "get_macro_calendar", { days: 90 });
    const parsed = JSON.parse(result.content[0]!.text) as {
      events: Array<{ date: string; name: string; type: string; source: string; isPivotWindow: boolean }>;
      status: string;
    };

    expect(parsed.status).not.toBe("unavailable");
    expect(Array.isArray(parsed.events)).toBe(true);
    expect(parsed.events.length).toBeGreaterThan(0);

    const types = new Set(parsed.events.map((e) => e.type));
    // Within a 90-day window from "now" we expect at least FOMC + one of
    // CPI/GDP/PMI/SBV to be present given the dense 2026 static schedule.
    expect(types.has("FOMC") || types.has("CPI") || types.has("PMI") || types.has("SBV")).toBe(true);
  });

  it("AC-3: source_tier === 3 (derived static schedule — NOT the tier-4 FDA-4 stub)", async () => {
    const result = await callTool(server, "get_macro_calendar", {});
    const parsed = JSON.parse(result.content[0]!.text) as { source_tier: number };
    expect(parsed.source_tier).toBe(3);
  });

  it("AC-4: isPivotWindow flags are present (boolean) on every event", async () => {
    const result = await callTool(server, "get_macro_calendar", { days: 180 });
    const parsed = JSON.parse(result.content[0]!.text) as {
      events: Array<{ isPivotWindow: boolean }>;
    };
    expect(parsed.events.length).toBeGreaterThan(0);
    for (const event of parsed.events) {
      expect(typeof event.isPivotWindow).toBe("boolean");
    }
  });

  it("AC-5: pivotWindowWarning field is present (non-crashing) — the pivot_window signal alert-commander/digest-predict derive pivot_window_active from", async () => {
    const result = await callTool(server, "get_macro_calendar", {});
    const parsed = JSON.parse(result.content[0]!.text) as Record<string, unknown>;
    expect(parsed).toHaveProperty("pivotWindowWarning");
    expect(parsed).toHaveProperty("currentMonthIsPivotWindow");
    expect(parsed).toHaveProperty("nextPivotWindow");
    // Must not crash/omit — either null or a string, never undefined.
    expect(parsed.pivotWindowWarning === null || typeof parsed.pivotWindowWarning === "string").toBe(true);
  });

  it("AC-6 GENERIC: days=N is honored as a real window filter for ANY window — not a single-month special case", async () => {
    const short = await callTool(server, "get_macro_calendar", { days: 20 });
    const long = await callTool(server, "get_macro_calendar", { days: 365 });
    const shortParsed = JSON.parse(short.content[0]!.text) as { events: Array<{ date: string }> };
    const longParsed = JSON.parse(long.content[0]!.text) as { events: Array<{ date: string }> };

    expect(longParsed.events.length).toBeGreaterThan(shortParsed.events.length);

    // The days=N window is genuinely being applied on top of "now" — not
    // pre-baked to a hardcoded single month. days=1 must return either
    // zero events or only events dated today.
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const oneDay = await callTool(server, "get_macro_calendar", { days: 1 });
    const oneDayParsed = JSON.parse(oneDay.content[0]!.text) as { events: Array<{ date: string }> };
    for (const event of oneDayParsed.events) {
      expect(event.date).toBe(todayStr);
    }
  });

  it("AC-7: default days (no arg) behaves as the documented 60-day window, not empty/unavailable", async () => {
    const result = await callTool(server, "get_macro_calendar", {});
    const parsed = JSON.parse(result.content[0]!.text) as { events: unknown[]; status: string };
    expect(parsed.status).not.toBe("unavailable");
    expect(parsed.events.length).toBeGreaterThan(0);
  });
});
