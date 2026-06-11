/**
 * TASK17-PAGE13 — GET /api/corporate-events
 *
 * "Sự kiện doanh nghiệp gần đây" — Recent Corporate Actions Monitor.
 * Backward-looking activity monitor from the vnstock_events table.
 *
 * AC-1:  classifyEvent — known types map to correct category + categoryLabel
 * AC-2:  classifyEvent — unknown type → {category:"other", categoryLabel: <raw type>}
 * AC-3:  pickDetail — non-null non-empty description → trimmed description
 * AC-4:  pickDetail — null description → eventName
 * AC-5:  pickDetail — empty/whitespace description → eventName
 * AC-6:  computeSinceDate — correct YYYY-MM-DD floor
 * AC-7:  mapRowToEvent — all fields populated correctly
 * AC-8:  buildByType — ordered desc by count
 * AC-9:  buildSummary — category counts correct, topActiveCodes desc ≤8
 * AC-10: ?days clamps [7, 365], default 90
 * AC-11: ?type filter applied when known, ignored when unknown/absent
 * AC-12: 200-on-empty — returns 200 + empty arrays + zeroed summary
 * AC-13: sort order — events[0].eventDate >= events[1].eventDate (DESC),
 *         same date → code ASC
 * AC-14: 500 JSON on DB error (closed DB)
 * AC-15: asOf = max eventDate in window; "" when empty
 * AC-16: typeFilter in response = applied type or null
 *
 * PRODUCTION SHAPE seeds:
 *   - Real event_type taxonomy (DIV, ISS, AIS, DDIND, DDINS, DDRP, AGME, AGMR,
 *     EGME, SUSP, NLIS, OTHE) all exercised
 *   - Rows inserted spanning different dates to verify sort + since filtering
 *
 * DDD layer: interface + infrastructure tested together at the handler seam.
 * Isolation: in-memory SQLite, reset per test via initDatabase().
 */

// Must be set before importing schema module
Bun.env["DB_PATH"] = ":memory:";
if (Bun.env["DB_PATH"] !== ":memory:") {
  throw new Error(`[TASK17-PAGE13] DB_PATH must be ':memory:', got: ${Bun.env["DB_PATH"]}`);
}

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { initDatabase, getDb, closeDb } from "../infrastructure/db/schema.js";
import {
  classifyEvent,
  pickDetail,
  computeSinceDate,
  mapRowToEvent,
  buildByType,
  buildSummary,
  handleGetCorporateEvents,
  CATEGORY_MAP,
  KNOWN_EVENT_TYPES,
  type CorporateEventsResponse,
  type EventItem,
} from "../interface/mcp/routes/corporateEventsHandler.js";

// ─────────────────────────────────────────────────────────────────────────────
// Lifecycle
// ─────────────────────────────────────────────────────────────────────────────

beforeEach(async () => {
  closeDb();
  await initDatabase();
});
afterEach(() => {
  closeDb();
});

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeMockRes() {
  const mock = {
    statusCode: 0,
    headers: {} as Record<string, string>,
    body: "",
    writeHead(status: number, headers?: Record<string, string>) {
      this.statusCode = status;
      if (headers) Object.assign(this.headers, headers);
    },
    end(data: string) {
      this.body = data;
    },
  };
  return mock;
}

function makeFakeReq(url: string = "/api/corporate-events"): import("node:http").IncomingMessage {
  return { url } as import("node:http").IncomingMessage;
}

/**
 * Insert a vnstock_events row directly via raw SQL.
 */
function insertEvent(opts: {
  code: string;
  event_name: string;
  event_date: string;
  event_type: string;
  description?: string | null;
  fetched_at?: string;
}): void {
  const db = getDb();
  const {
    code,
    event_name,
    event_date,
    event_type,
    description = null,
    fetched_at = "2026-06-11T00:00:00.000Z",
  } = opts;
  db.prepare(
    `INSERT OR IGNORE INTO vnstock_events (code, event_name, event_date, event_type, description, fetched_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(code, event_name, event_date, event_type, description, fetched_at);
}

/** Seed a realistic production-shape corpus (6 rows). */
function seedProductionCorpus(): void {
  // Cash dividend — ACB
  insertEvent({
    code: "ACB", event_name: "Cash Dividend - Year 2025 - 700 VND",
    event_date: "2026-06-05", event_type: "DIV",
    description: "ACB - Trả cổ tức tiền mặt năm 2025 - 700 đồng/CP",
  });
  // Share issue — VJC
  insertEvent({
    code: "VJC", event_name: "Share Issue - Stock dividend ratio 30.0%",
    event_date: "2026-06-08", event_type: "ISS",
    description: "VJC - Phát hành cổ phiếu thưởng tỷ lệ 30%",
  });
  // Insider dealing — SSI
  insertEvent({
    code: "SSI", event_name: "Nguyen Duy Hung - Subscribe to Buy 1,000,000 SSI shares",
    event_date: "2026-06-03", event_type: "DDIND",
    description: null,
  });
  // AGM — FRT (with Vietnamese description)
  insertEvent({
    code: "FRT", event_name: "FRT - Holds 2026 AGM",
    event_date: "2026-06-01", event_type: "AGME",
    description: "FRT - Tổ chức ĐHĐCĐ thường niên 2026",
  });
  // Additional issue — MBB
  insertEvent({
    code: "MBB", event_name: "MBB - Additional share issuance",
    event_date: "2026-05-20", event_type: "AIS",
    description: "MBB - Phát hành thêm cổ phiếu",
  });
  // Suspension — VIC (old, outside 90d window if windowDays=30)
  insertEvent({
    code: "VIC", event_name: "VIC - Trading suspension",
    event_date: "2025-01-15", event_type: "SUSP",
    description: null,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// classifyEvent unit tests
// ─────────────────────────────────────────────────────────────────────────────

describe("classifyEvent", () => {
  it("AC-1: DIV → dividend / 'Cổ tức tiền mặt'", () => {
    const info = classifyEvent("DIV");
    expect(info.category).toBe("dividend");
    expect(info.categoryLabel).toBe("Cổ tức tiền mặt");
  });

  it("AC-1: ISS → issuance / 'Phát hành cổ phiếu'", () => {
    const info = classifyEvent("ISS");
    expect(info.category).toBe("issuance");
    expect(info.categoryLabel).toBe("Phát hành cổ phiếu");
  });

  it("AC-1: AIS → issuance / 'Phát hành thêm'", () => {
    const info = classifyEvent("AIS");
    expect(info.category).toBe("issuance");
    expect(info.categoryLabel).toBe("Phát hành thêm");
  });

  it("AC-1: NLIS → issuance / 'Niêm yết mới'", () => {
    const info = classifyEvent("NLIS");
    expect(info.category).toBe("issuance");
    expect(info.categoryLabel).toBe("Niêm yết mới");
  });

  it("AC-1: DDIND → insider / 'Giao dịch cổ đông nội bộ'", () => {
    const info = classifyEvent("DDIND");
    expect(info.category).toBe("insider");
    expect(info.categoryLabel).toBe("Giao dịch cổ đông nội bộ");
  });

  it("AC-1: DDINS → insider / 'Giao dịch tổ chức liên quan'", () => {
    const info = classifyEvent("DDINS");
    expect(info.category).toBe("insider");
    expect(info.categoryLabel).toBe("Giao dịch tổ chức liên quan");
  });

  it("AC-1: DDRP → insider / 'Giao dịch người liên quan'", () => {
    const info = classifyEvent("DDRP");
    expect(info.category).toBe("insider");
    expect(info.categoryLabel).toBe("Giao dịch người liên quan");
  });

  it("AC-1: AGME → meeting / 'ĐHĐCĐ thường niên'", () => {
    const info = classifyEvent("AGME");
    expect(info.category).toBe("meeting");
    expect(info.categoryLabel).toBe("ĐHĐCĐ thường niên");
  });

  it("AC-1: AGMR → meeting / 'Chốt quyền ĐHĐCĐ'", () => {
    const info = classifyEvent("AGMR");
    expect(info.category).toBe("meeting");
    expect(info.categoryLabel).toBe("Chốt quyền ĐHĐCĐ");
  });

  it("AC-1: EGME → meeting / 'ĐHĐCĐ bất thường'", () => {
    const info = classifyEvent("EGME");
    expect(info.category).toBe("meeting");
    expect(info.categoryLabel).toBe("ĐHĐCĐ bất thường");
  });

  it("AC-1: SUSP → other / 'Tạm ngừng giao dịch'", () => {
    const info = classifyEvent("SUSP");
    expect(info.category).toBe("other");
    expect(info.categoryLabel).toBe("Tạm ngừng giao dịch");
  });

  it("AC-1: OTHE → other / 'Khác'", () => {
    const info = classifyEvent("OTHE");
    expect(info.category).toBe("other");
    expect(info.categoryLabel).toBe("Khác");
  });

  it("AC-2: unknown type → {category:'other', categoryLabel: raw type}", () => {
    const info = classifyEvent("XYZUNKNOWN");
    expect(info.category).toBe("other");
    expect(info.categoryLabel).toBe("XYZUNKNOWN");
  });

  it("AC-2: empty string type → {category:'other', categoryLabel: ''}", () => {
    const info = classifyEvent("");
    expect(info.category).toBe("other");
    expect(info.categoryLabel).toBe("");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// pickDetail unit tests
// ─────────────────────────────────────────────────────────────────────────────

describe("pickDetail", () => {
  it("AC-3: non-null non-empty description → trimmed description", () => {
    expect(pickDetail("FRT - Tổ chức ĐHĐCĐ", "FRT - Holds AGM")).toBe("FRT - Tổ chức ĐHĐCĐ");
  });

  it("AC-3: description with surrounding whitespace → trimmed", () => {
    expect(pickDetail("  VJC - Phát hành  ", "VJC name")).toBe("VJC - Phát hành");
  });

  it("AC-4: null description → eventName", () => {
    expect(pickDetail(null, "Nguyen Duy Hung - Buy SSI")).toBe("Nguyen Duy Hung - Buy SSI");
  });

  it("AC-4: undefined description → eventName", () => {
    expect(pickDetail(undefined, "Event Name")).toBe("Event Name");
  });

  it("AC-5: empty string description → eventName", () => {
    expect(pickDetail("", "Event Name")).toBe("Event Name");
  });

  it("AC-5: whitespace-only description → eventName", () => {
    expect(pickDetail("   ", "Event Name")).toBe("Event Name");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// computeSinceDate unit tests
// ─────────────────────────────────────────────────────────────────────────────

describe("computeSinceDate", () => {
  it("AC-6: 90 days before 2026-06-11 → 2026-03-13", () => {
    // 2026-06-11 minus 90 days = 2026-03-13
    const result = computeSinceDate("2026-06-11T00:00:00.000Z", 90);
    expect(result).toBe("2026-03-13");
  });

  it("AC-6: 30 days before 2026-06-11 → 2026-05-12", () => {
    const result = computeSinceDate("2026-06-11T00:00:00.000Z", 30);
    expect(result).toBe("2026-05-12");
  });

  it("AC-6: 7 days before 2026-06-11 → 2026-06-04", () => {
    const result = computeSinceDate("2026-06-11T00:00:00.000Z", 7);
    expect(result).toBe("2026-06-04");
  });

  it("AC-6: 365 days before 2026-06-11 → 2025-06-11", () => {
    const result = computeSinceDate("2026-06-11T00:00:00.000Z", 365);
    expect(result).toBe("2025-06-11");
  });

  it("AC-6: result is always YYYY-MM-DD format (length 10)", () => {
    const result = computeSinceDate("2026-06-11T14:30:00.000Z", 90);
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(result.length).toBe(10);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// mapRowToEvent unit tests
// ─────────────────────────────────────────────────────────────────────────────

describe("mapRowToEvent", () => {
  it("AC-7: maps all fields correctly — with description", () => {
    const row = {
      code: "ACB",
      event_name: "Cash Dividend - Year 2025 - 700 VND",
      event_date: "2026-06-05",
      event_type: "DIV",
      description: "ACB - Trả cổ tức tiền mặt năm 2025",
    };
    const item = mapRowToEvent(row);
    expect(item.code).toBe("ACB");
    expect(item.eventType).toBe("DIV");
    expect(item.category).toBe("dividend");
    expect(item.categoryLabel).toBe("Cổ tức tiền mặt");
    expect(item.title).toBe("Cash Dividend - Year 2025 - 700 VND");
    expect(item.detail).toBe("ACB - Trả cổ tức tiền mặt năm 2025");
    expect(item.eventDate).toBe("2026-06-05");
  });

  it("AC-7: maps all fields correctly — null description falls back to eventName", () => {
    const row = {
      code: "SSI",
      event_name: "Nguyen Duy Hung - Buy SSI",
      event_date: "2026-06-03",
      event_type: "DDIND",
      description: null,
    };
    const item = mapRowToEvent(row);
    expect(item.detail).toBe("Nguyen Duy Hung - Buy SSI");
    expect(item.category).toBe("insider");
  });

  it("AC-7: unknown event_type → category='other', categoryLabel=raw type", () => {
    const row = {
      code: "HPG",
      event_name: "Some New Event",
      event_date: "2026-06-01",
      event_type: "NEWTYPE",
      description: null,
    };
    const item = mapRowToEvent(row);
    expect(item.category).toBe("other");
    expect(item.categoryLabel).toBe("NEWTYPE");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildByType unit tests
// ─────────────────────────────────────────────────────────────────────────────

describe("buildByType", () => {
  it("AC-8: returns [] for empty input", () => {
    expect(buildByType([])).toHaveLength(0);
  });

  it("AC-8: single type → single entry with correct count", () => {
    const events: EventItem[] = [
      { code: "ACB", eventType: "DIV", category: "dividend", categoryLabel: "Cổ tức tiền mặt", title: "t", detail: "d", eventDate: "2026-06-05" },
      { code: "VCB", eventType: "DIV", category: "dividend", categoryLabel: "Cổ tức tiền mặt", title: "t", detail: "d", eventDate: "2026-06-04" },
    ];
    const result = buildByType(events);
    expect(result).toHaveLength(1);
    expect(result[0]!.eventType).toBe("DIV");
    expect(result[0]!.count).toBe(2);
  });

  it("AC-8: multiple types ordered desc by count", () => {
    const events: EventItem[] = [
      { code: "A", eventType: "DDIND", category: "insider", categoryLabel: "Giao dịch cổ đông nội bộ", title: "t", detail: "d", eventDate: "2026-06-01" },
      { code: "B", eventType: "DDIND", category: "insider", categoryLabel: "Giao dịch cổ đông nội bộ", title: "t", detail: "d", eventDate: "2026-06-01" },
      { code: "C", eventType: "DDIND", category: "insider", categoryLabel: "Giao dịch cổ đông nội bộ", title: "t", detail: "d", eventDate: "2026-06-01" },
      { code: "D", eventType: "DIV",   category: "dividend", categoryLabel: "Cổ tức tiền mặt", title: "t", detail: "d", eventDate: "2026-06-01" },
      { code: "E", eventType: "AGME",  category: "meeting",  categoryLabel: "ĐHĐCĐ thường niên", title: "t", detail: "d", eventDate: "2026-06-01" },
      { code: "F", eventType: "AGME",  category: "meeting",  categoryLabel: "ĐHĐCĐ thường niên", title: "t", detail: "d", eventDate: "2026-06-01" },
    ];
    const result = buildByType(events);
    // DDIND=3, AGME=2, DIV=1
    expect(result[0]!.eventType).toBe("DDIND");
    expect(result[0]!.count).toBe(3);
    expect(result[1]!.eventType).toBe("AGME");
    expect(result[1]!.count).toBe(2);
    expect(result[2]!.eventType).toBe("DIV");
    expect(result[2]!.count).toBe(1);
  });

  it("AC-8: categoryLabel is preserved from events", () => {
    const events: EventItem[] = [
      { code: "A", eventType: "ISS", category: "issuance", categoryLabel: "Phát hành cổ phiếu", title: "t", detail: "d", eventDate: "2026-06-01" },
    ];
    const result = buildByType(events);
    expect(result[0]!.categoryLabel).toBe("Phát hành cổ phiếu");
  });

  it("AC-8 TIE-BREAK: equal-count types ordered by eventType ASC", () => {
    // ZZTYPE and AATYPE both count=2; AATYPE must come first (code-ASC tie-break)
    const events: EventItem[] = [
      { code: "A", eventType: "ZZTYPE", category: "other", categoryLabel: "ZZ", title: "t", detail: "d", eventDate: "2026-06-01" },
      { code: "B", eventType: "ZZTYPE", category: "other", categoryLabel: "ZZ", title: "t", detail: "d", eventDate: "2026-06-01" },
      { code: "C", eventType: "AATYPE", category: "other", categoryLabel: "AA", title: "t", detail: "d", eventDate: "2026-06-01" },
      { code: "D", eventType: "AATYPE", category: "other", categoryLabel: "AA", title: "t", detail: "d", eventDate: "2026-06-01" },
    ];
    const result = buildByType(events);
    // Both have count=2; tie-break by eventType ASC → AATYPE before ZZTYPE
    expect(result[0]!.eventType).toBe("AATYPE");
    expect(result[0]!.count).toBe(2);
    expect(result[1]!.eventType).toBe("ZZTYPE");
    expect(result[1]!.count).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildSummary unit tests
// ─────────────────────────────────────────────────────────────────────────────

describe("buildSummary", () => {
  it("AC-9: empty input → all zeroes, empty topActiveCodes", () => {
    const summary = buildSummary([]);
    expect(summary.totalEvents).toBe(0);
    expect(summary.distinctCodes).toBe(0);
    expect(summary.dividend).toBe(0);
    expect(summary.issuance).toBe(0);
    expect(summary.insider).toBe(0);
    expect(summary.meeting).toBe(0);
    expect(summary.other).toBe(0);
    expect(summary.topActiveCodes).toHaveLength(0);
  });

  it("AC-9: category counts are correct", () => {
    const events: EventItem[] = [
      // 2 dividends
      { code: "ACB", eventType: "DIV",  category: "dividend", categoryLabel: "", title: "", detail: "", eventDate: "2026-06-05" },
      { code: "VCB", eventType: "DIV",  category: "dividend", categoryLabel: "", title: "", detail: "", eventDate: "2026-06-04" },
      // 1 issuance
      { code: "VJC", eventType: "ISS",  category: "issuance", categoryLabel: "", title: "", detail: "", eventDate: "2026-06-03" },
      // 3 insider
      { code: "SSI", eventType: "DDIND", category: "insider", categoryLabel: "", title: "", detail: "", eventDate: "2026-06-02" },
      { code: "SSI", eventType: "DDIND", category: "insider", categoryLabel: "", title: "", detail: "", eventDate: "2026-06-01" },
      { code: "FPT", eventType: "DDINS", category: "insider", categoryLabel: "", title: "", detail: "", eventDate: "2026-06-01" },
      // 1 meeting
      { code: "FRT", eventType: "AGME", category: "meeting", categoryLabel: "", title: "", detail: "", eventDate: "2026-05-30" },
      // 1 other
      { code: "VIC", eventType: "SUSP", category: "other",   categoryLabel: "", title: "", detail: "", eventDate: "2026-05-28" },
    ];
    const summary = buildSummary(events);
    expect(summary.totalEvents).toBe(8);
    // ACB, VCB, VJC, SSI (×2), FPT, FRT, VIC = 7 distinct codes
    expect(summary.distinctCodes).toBe(7);
    expect(summary.dividend).toBe(2);
    expect(summary.issuance).toBe(1);
    expect(summary.insider).toBe(3);
    expect(summary.meeting).toBe(1);
    expect(summary.other).toBe(1);
  });

  it("AC-9: topActiveCodes ordered desc by count, capped at 8", () => {
    // SSI has 3 events, ACB has 2, rest have 1
    const events: EventItem[] = [
      { code: "SSI", eventType: "DDIND", category: "insider", categoryLabel: "", title: "", detail: "", eventDate: "2026-06-05" },
      { code: "SSI", eventType: "DDIND", category: "insider", categoryLabel: "", title: "", detail: "", eventDate: "2026-06-04" },
      { code: "SSI", eventType: "AGME",  category: "meeting", categoryLabel: "", title: "", detail: "", eventDate: "2026-06-03" },
      { code: "ACB", eventType: "DIV",   category: "dividend", categoryLabel: "", title: "", detail: "", eventDate: "2026-06-02" },
      { code: "ACB", eventType: "ISS",   category: "issuance", categoryLabel: "", title: "", detail: "", eventDate: "2026-06-01" },
      { code: "FPT", eventType: "AGME",  category: "meeting", categoryLabel: "", title: "", detail: "", eventDate: "2026-05-30" },
    ];
    const summary = buildSummary(events);
    expect(summary.topActiveCodes[0]!.code).toBe("SSI");
    expect(summary.topActiveCodes[0]!.count).toBe(3);
    expect(summary.topActiveCodes[1]!.code).toBe("ACB");
    expect(summary.topActiveCodes[1]!.count).toBe(2);
    expect(summary.topActiveCodes[2]!.code).toBe("FPT");
    expect(summary.topActiveCodes[2]!.count).toBe(1);
  });

  it("AC-9: topActiveCodes capped at 8 entries", () => {
    // Create 10 distinct codes
    const events: EventItem[] = Array.from({ length: 10 }, (_, i) => ({
      code: `CODE${i}`,
      eventType: "DIV",
      category: "dividend" as const,
      categoryLabel: "",
      title: "",
      detail: "",
      eventDate: "2026-06-01",
    }));
    const summary = buildSummary(events);
    expect(summary.topActiveCodes.length).toBeLessThanOrEqual(8);
  });

  it("AC-9 TIE-BREAK: topActiveCodes equal-count entries ordered by code ASC", () => {
    // ZZZ and AAA both have count=2; AAA must appear before ZZZ (code-ASC tie-break)
    const events: EventItem[] = [
      { code: "ZZZ", eventType: "DIV", category: "dividend", categoryLabel: "", title: "", detail: "", eventDate: "2026-06-05" },
      { code: "ZZZ", eventType: "DIV", category: "dividend", categoryLabel: "", title: "", detail: "", eventDate: "2026-06-04" },
      { code: "AAA", eventType: "DIV", category: "dividend", categoryLabel: "", title: "", detail: "", eventDate: "2026-06-03" },
      { code: "AAA", eventType: "DIV", category: "dividend", categoryLabel: "", title: "", detail: "", eventDate: "2026-06-02" },
      { code: "MMM", eventType: "ISS", category: "issuance", categoryLabel: "", title: "", detail: "", eventDate: "2026-06-01" },
    ];
    const summary = buildSummary(events);
    // ZZZ and AAA both count=2 — AAA comes first (ASC); MMM count=1 is last
    expect(summary.topActiveCodes[0]!.code).toBe("AAA");
    expect(summary.topActiveCodes[0]!.count).toBe(2);
    expect(summary.topActiveCodes[1]!.code).toBe("ZZZ");
    expect(summary.topActiveCodes[1]!.count).toBe(2);
    expect(summary.topActiveCodes[2]!.code).toBe("MMM");
    expect(summary.topActiveCodes[2]!.count).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// handleGetCorporateEvents HTTP handler tests (DB integration)
// ─────────────────────────────────────────────────────────────────────────────

describe("TASK17-PAGE13 — handleGetCorporateEvents HTTP handler", () => {
  it("AC-1 response envelope: returns 200 JSON with all required fields", () => {
    seedProductionCorpus();

    const res = makeMockRes();
    handleGetCorporateEvents(
      makeFakeReq("/api/corporate-events"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );

    expect(res.statusCode).toBe(200);
    expect(res.headers["Content-Type"]).toBe("application/json");

    const body = JSON.parse(res.body) as CorporateEventsResponse;
    expect(typeof body.generatedAt).toBe("string");
    expect(typeof body.windowDays).toBe("number");
    expect(typeof body.since).toBe("string");
    expect(typeof body.asOf).toBe("string");
    // typeFilter is null when no ?type= param
    expect(body.typeFilter).toBeNull();
    expect(Array.isArray(body.events)).toBe(true);
    expect(Array.isArray(body.byType)).toBe(true);
    expect(typeof body.summary).toBe("object");
    expect(typeof body.count).toBe("number");
  });

  it("AC-10: default days = 90", () => {
    seedProductionCorpus();

    const res = makeMockRes();
    handleGetCorporateEvents(
      makeFakeReq("/api/corporate-events"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );

    const body = JSON.parse(res.body) as CorporateEventsResponse;
    expect(body.windowDays).toBe(90);
  });

  it("AC-10: ?days=30 applied correctly", () => {
    seedProductionCorpus();

    const res = makeMockRes();
    handleGetCorporateEvents(
      makeFakeReq("/api/corporate-events?days=30"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );

    const body = JSON.parse(res.body) as CorporateEventsResponse;
    expect(body.windowDays).toBe(30);
    // VIC event date 2025-01-15 is outside 30d window — should not be in results
    const vicEvents = body.events.filter((e) => e.code === "VIC");
    expect(vicEvents).toHaveLength(0);
  });

  it("AC-10: ?days=5 clamps to 7 (min)", () => {
    seedProductionCorpus();

    const res = makeMockRes();
    handleGetCorporateEvents(
      makeFakeReq("/api/corporate-events?days=5"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );

    const body = JSON.parse(res.body) as CorporateEventsResponse;
    expect(body.windowDays).toBe(7);
  });

  it("AC-10: ?days=400 clamps to 365 (max)", () => {
    seedProductionCorpus();

    const res = makeMockRes();
    handleGetCorporateEvents(
      makeFakeReq("/api/corporate-events?days=400"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );

    const body = JSON.parse(res.body) as CorporateEventsResponse;
    expect(body.windowDays).toBe(365);
  });

  it("AC-10: ?days=0 clamps to 7 (min)", () => {
    seedProductionCorpus();

    const res = makeMockRes();
    handleGetCorporateEvents(
      makeFakeReq("/api/corporate-events?days=0"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );

    const body = JSON.parse(res.body) as CorporateEventsResponse;
    expect(body.windowDays).toBe(7);
  });

  it("AC-10: non-numeric ?days → falls back to default 90", () => {
    seedProductionCorpus();

    const res = makeMockRes();
    handleGetCorporateEvents(
      makeFakeReq("/api/corporate-events?days=abc"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );

    const body = JSON.parse(res.body) as CorporateEventsResponse;
    expect(body.windowDays).toBe(90);
  });

  it("AC-11: ?type=DIV filter applied — only DIV events returned", () => {
    seedProductionCorpus();

    const res = makeMockRes();
    handleGetCorporateEvents(
      makeFakeReq("/api/corporate-events?days=365&type=DIV"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );

    const body = JSON.parse(res.body) as CorporateEventsResponse;
    expect(body.typeFilter).toBe("DIV");
    // All returned events must be DIV
    for (const ev of body.events) {
      expect(ev.eventType).toBe("DIV");
    }
  });

  it("AC-11: ?type=DDIND filter applied — only DDIND events returned", () => {
    seedProductionCorpus();

    const res = makeMockRes();
    handleGetCorporateEvents(
      makeFakeReq("/api/corporate-events?days=365&type=DDIND"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );

    const body = JSON.parse(res.body) as CorporateEventsResponse;
    expect(body.typeFilter).toBe("DDIND");
    for (const ev of body.events) {
      expect(ev.eventType).toBe("DDIND");
    }
  });

  it("AC-11: unknown ?type= ignored — typeFilter=null, all events returned", () => {
    seedProductionCorpus();

    const res = makeMockRes();
    handleGetCorporateEvents(
      makeFakeReq("/api/corporate-events?days=365&type=XYZUNKNOWN"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );

    const body = JSON.parse(res.body) as CorporateEventsResponse;
    expect(body.typeFilter).toBeNull();
    // Should return all events (not filtered)
    expect(body.events.length).toBeGreaterThan(0);
  });

  it("AC-12: 200-on-empty — returns 200 + empty arrays + zeroed summary", () => {
    // No rows inserted — table is empty

    const res = makeMockRes();
    handleGetCorporateEvents(
      makeFakeReq("/api/corporate-events"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as CorporateEventsResponse;
    expect(body.events).toHaveLength(0);
    expect(body.byType).toHaveLength(0);
    expect(body.count).toBe(0);
    expect(body.asOf).toBe("");
    expect(body.summary.totalEvents).toBe(0);
    expect(body.summary.distinctCodes).toBe(0);
    expect(body.summary.dividend).toBe(0);
    expect(body.summary.issuance).toBe(0);
    expect(body.summary.insider).toBe(0);
    expect(body.summary.meeting).toBe(0);
    expect(body.summary.other).toBe(0);
    expect(body.summary.topActiveCodes).toHaveLength(0);
  });

  it("AC-13: events sorted event_date DESC (most recent first)", () => {
    seedProductionCorpus();

    const res = makeMockRes();
    handleGetCorporateEvents(
      makeFakeReq("/api/corporate-events?days=365"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );

    const body = JSON.parse(res.body) as CorporateEventsResponse;
    const dates = body.events.map((e) => e.eventDate);
    for (let i = 1; i < dates.length; i++) {
      // Sorted DESC: each date should be <= the previous one
      expect(dates[i]! <= dates[i - 1]!).toBe(true);
    }
  });

  it("AC-13: same date → code ASC (secondary sort)", () => {
    // Insert two events with same date, different codes
    insertEvent({
      code: "ZZZ", event_name: "Event Z", event_date: "2026-06-10",
      event_type: "AGME", description: null,
    });
    insertEvent({
      code: "AAA", event_name: "Event A", event_date: "2026-06-10",
      event_type: "DIV", description: null,
    });

    const res = makeMockRes();
    handleGetCorporateEvents(
      makeFakeReq("/api/corporate-events?days=7"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );

    const body = JSON.parse(res.body) as CorporateEventsResponse;
    const sameDateEvents = body.events.filter((e) => e.eventDate === "2026-06-10");
    // AAA should come before ZZZ (ASC code on same date)
    const idx_aaa = sameDateEvents.findIndex((e) => e.code === "AAA");
    const idx_zzz = sameDateEvents.findIndex((e) => e.code === "ZZZ");
    expect(idx_aaa).toBeLessThan(idx_zzz);
  });

  it("AC-14: returns 500 JSON on DB error (closed DB)", () => {
    const db = getDb();
    closeDb();

    const res = makeMockRes();
    handleGetCorporateEvents(
      makeFakeReq("/api/corporate-events"),
      res as unknown as import("node:http").ServerResponse,
      db,
    );

    expect(res.statusCode).toBe(500);
    const body = JSON.parse(res.body) as { error: string };
    expect(body.error).toBe("db_error");
  });

  it("AC-15: asOf = max eventDate in window", () => {
    seedProductionCorpus();

    const res = makeMockRes();
    handleGetCorporateEvents(
      makeFakeReq("/api/corporate-events?days=365"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );

    const body = JSON.parse(res.body) as CorporateEventsResponse;
    // Seed has VJC at 2026-06-08 as most recent
    expect(body.asOf).toBe("2026-06-08");
    expect(body.asOf).toBe(body.events[0]?.eventDate ?? "");
  });

  it("AC-15: asOf is empty string when no events in window", () => {
    const res = makeMockRes();
    handleGetCorporateEvents(
      makeFakeReq("/api/corporate-events"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );

    const body = JSON.parse(res.body) as CorporateEventsResponse;
    expect(body.asOf).toBe("");
  });

  it("AC-16: typeFilter in response reflects applied filter", () => {
    seedProductionCorpus();

    const res = makeMockRes();
    handleGetCorporateEvents(
      makeFakeReq("/api/corporate-events?type=AGME"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );

    const body = JSON.parse(res.body) as CorporateEventsResponse;
    expect(body.typeFilter).toBe("AGME");
  });

  it("AC-16: typeFilter=null when no ?type= param supplied", () => {
    seedProductionCorpus();

    const res = makeMockRes();
    handleGetCorporateEvents(
      makeFakeReq("/api/corporate-events"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );

    const body = JSON.parse(res.body) as CorporateEventsResponse;
    expect(body.typeFilter).toBeNull();
  });

  it("count matches events.length", () => {
    seedProductionCorpus();

    const res = makeMockRes();
    handleGetCorporateEvents(
      makeFakeReq("/api/corporate-events?days=365"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );

    const body = JSON.parse(res.body) as CorporateEventsResponse;
    expect(body.count).toBe(body.events.length);
  });

  it("byType total count equals events.length", () => {
    seedProductionCorpus();

    const res = makeMockRes();
    handleGetCorporateEvents(
      makeFakeReq("/api/corporate-events?days=365"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );

    const body = JSON.parse(res.body) as CorporateEventsResponse;
    const totalByType = body.byType.reduce((sum, bt) => sum + bt.count, 0);
    expect(totalByType).toBe(body.events.length);
  });

  it("summary.totalEvents matches events.length", () => {
    seedProductionCorpus();

    const res = makeMockRes();
    handleGetCorporateEvents(
      makeFakeReq("/api/corporate-events?days=365"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );

    const body = JSON.parse(res.body) as CorporateEventsResponse;
    expect(body.summary.totalEvents).toBe(body.events.length);
  });

  it("since field has YYYY-MM-DD format", () => {
    seedProductionCorpus();

    const res = makeMockRes();
    handleGetCorporateEvents(
      makeFakeReq("/api/corporate-events"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );

    const body = JSON.parse(res.body) as CorporateEventsResponse;
    expect(body.since).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
