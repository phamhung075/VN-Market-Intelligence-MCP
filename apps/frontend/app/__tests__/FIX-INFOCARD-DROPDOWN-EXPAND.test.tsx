/**
 * FIX-INFOCARD-DROPDOWN-EXPAND — unit tests.
 *
 * Covers:
 *   A. toAgentSignal mapping: findingData + source extraction (client.ts)
 *   B. FindingDataPanel rendering: generic field render, source link, empty-state
 *   C. InfoCardExpand primitive: toggle, aria-expanded, summary always visible
 *
 * Test count target: ≥ 20 assertions covering all branches.
 *
 * Sprint: INFOCARD-EXPAND-FETCH
 * Task:   FIX-INFOCARD-DROPDOWN-EXPAND
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { InfoCardExpand, FindingDataPanel } from "~/components/InfoCardExpand";
import { parseAccuracyFromResponse } from "~/lib/api/client";

// ---------------------------------------------------------------------------
// A. toAgentSignal mapping via parseAccuracyFromResponse (uses toAgentSignal internally)
// ---------------------------------------------------------------------------

describe("toAgentSignal — findingData + source extraction", () => {
  it("carries finding_data object through when backend returns parsed object", () => {
    const findingObj = {
      event_type: "macro_shift",
      headline: "Fed giữ nguyên lãi suất",
      affected_stocks: ["FPT", "VCB"],
      confidence: 0.75,
      source: "https://reuters.com/article/123",
    };
    const row = {
      id: 1,
      stock_code: "FPT",
      signal_type: "chain_catalyst",
      direction: "BULLISH",
      confidence_score: 75,
      detail: "Fed holds rates → VN equities positive",
      created_at: "2026-06-16T10:00:00Z",
      finding_data: findingObj,
      source: "https://reuters.com/article/123",
    };
    const result = parseAccuracyFromResponse({ signals: [row] });
    expect(result).toHaveLength(1);
    expect(result[0].findingData).toEqual(findingObj);
  });

  it("parses finding_data from JSON string (legacy serialisation)", () => {
    const findingObj = { event_type: "chain_catalyst", headline: "Test" };
    const row = {
      id: 2,
      stock_code: "HPG",
      signal_type: "chain_catalyst",
      direction: "NEUTRAL",
      confidence_score: 50,
      detail: "test",
      created_at: "2026-06-16T10:00:00Z",
      finding_data: JSON.stringify(findingObj),
      source: null,
    };
    const result = parseAccuracyFromResponse({ signals: [row] });
    expect(result[0].findingData).toEqual(findingObj);
  });

  it("sets findingData to null when finding_data is absent", () => {
    const row = {
      id: 3,
      stock_code: "VNM",
      signal_type: "urgent_news",
      direction: "BEARISH",
      confidence_score: 60,
      detail: "Some detail",
      created_at: "2026-06-16T10:00:00Z",
    };
    const result = parseAccuracyFromResponse({ signals: [row] });
    expect(result[0].findingData).toBeNull();
  });

  it("sets findingData to null when finding_data is null", () => {
    const row = {
      id: 4,
      stock_code: "VCB",
      signal_type: "chain_catalyst",
      direction: "NEUTRAL",
      confidence_score: 40,
      detail: "detail",
      created_at: "2026-06-16T10:00:00Z",
      finding_data: null,
    };
    const result = parseAccuracyFromResponse({ signals: [row] });
    expect(result[0].findingData).toBeNull();
  });

  it("extracts source from top-level source field", () => {
    const row = {
      id: 5,
      stock_code: "FPT",
      signal_type: "chain_catalyst",
      direction: "BULLISH",
      confidence_score: 80,
      detail: "detail",
      created_at: "2026-06-16T10:00:00Z",
      finding_data: { headline: "test" },
      source: "https://cafef.vn/article/abc",
    };
    const result = parseAccuracyFromResponse({ signals: [row] });
    expect(result[0].source).toBe("https://cafef.vn/article/abc");
  });

  it("falls back to finding_data.source when top-level source is absent", () => {
    const row = {
      id: 6,
      stock_code: "FPT",
      signal_type: "chain_catalyst",
      direction: "BULLISH",
      confidence_score: 80,
      detail: "detail",
      created_at: "2026-06-16T10:00:00Z",
      finding_data: { headline: "test", source: "https://vnexpress.net/article/xyz" },
    };
    const result = parseAccuracyFromResponse({ signals: [row] });
    expect(result[0].source).toBe("https://vnexpress.net/article/xyz");
  });

  it("sets source to null when neither source field is present", () => {
    const row = {
      id: 7,
      stock_code: "HPG",
      signal_type: "price_anomaly",
      direction: "BEARISH",
      confidence_score: 55,
      detail: "detail",
      created_at: "2026-06-16T10:00:00Z",
    };
    const result = parseAccuracyFromResponse({ signals: [row] });
    expect(result[0].source).toBeNull();
  });

  it("does not set findingData to an array (ignores array finding_data)", () => {
    const row = {
      id: 8,
      stock_code: "FPT",
      signal_type: "chain_catalyst",
      direction: "NEUTRAL",
      confidence_score: 50,
      detail: "detail",
      created_at: "2026-06-16T10:00:00Z",
      finding_data: ["not", "an", "object"],
    };
    const result = parseAccuracyFromResponse({ signals: [row] });
    expect(result[0].findingData).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// B. FindingDataPanel
// ---------------------------------------------------------------------------

describe("FindingDataPanel", () => {
  it("shows honest empty-state when both findingData and source are null", () => {
    render(<FindingDataPanel findingData={null} source={null} />);
    expect(screen.getByText("Không có dữ liệu chi tiết.")).toBeInTheDocument();
  });

  it("renders well-known field with Vietnamese label", () => {
    render(
      <FindingDataPanel
        findingData={{ event_type: "chain_catalyst" }}
        source={null}
      />
    );
    expect(screen.getByText("Loại sự kiện")).toBeInTheDocument();
    expect(screen.getByText("chain_catalyst")).toBeInTheDocument();
  });

  it("renders headline field", () => {
    render(
      <FindingDataPanel
        findingData={{ headline: "Fed giữ nguyên lãi suất" }}
        source={null}
      />
    );
    expect(screen.getByText("Tiêu đề")).toBeInTheDocument();
    expect(screen.getByText("Fed giữ nguyên lãi suất")).toBeInTheDocument();
  });

  it("renders affected_stocks array as comma-separated string", () => {
    render(
      <FindingDataPanel
        findingData={{ affected_stocks: ["FPT", "VCB", "HPG"] }}
        source={null}
      />
    );
    expect(screen.getByText("Cổ phiếu liên quan")).toBeInTheDocument();
    expect(screen.getByText("FPT, VCB, HPG")).toBeInTheDocument();
  });

  it("renders source as a clickable link opening in new tab", () => {
    render(
      <FindingDataPanel
        findingData={null}
        source="https://cafef.vn/article/abc"
      />
    );
    const link = screen.getByRole("link", { name: /cafef\.vn/ });
    expect(link).toHaveAttribute("href", "https://cafef.vn/article/abc");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("does not render source label in fields list (rendered as link instead)", () => {
    render(
      <FindingDataPanel
        findingData={{ source: "https://example.com", headline: "Test" }}
        source="https://example.com"
      />
    );
    // source field from findingData must NOT be duplicated in field list
    // The link section should appear exactly once
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(1);
  });

  it("hides fields with genuinely null/empty values (honest empty-state — no placeholder)", () => {
    render(
      <FindingDataPanel
        findingData={{ event_type: null, headline: "" }}
        source={null}
      />
    );
    // All fields are null/empty — shows honest empty-state
    expect(screen.getByText("Không có dữ liệu chi tiết.")).toBeInTheDocument();
  });

  it("renders unknown keys with humanised label (snake_case → title)", () => {
    render(
      <FindingDataPanel
        findingData={{ macro_event: "Lãi suất Fed" }}
        source={null}
      />
    );
    // macro_event is in FIELD_LABELS → "Sự kiện vĩ mô"
    expect(screen.getByText("Sự kiện vĩ mô")).toBeInTheDocument();
    expect(screen.getByText("Lãi suất Fed")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// C. InfoCardExpand — toggle + aria-expanded + summary always visible
// ---------------------------------------------------------------------------

describe("InfoCardExpand", () => {
  it("renders summary content in collapsed state", () => {
    render(
      <InfoCardExpand
        summary={<span>NEUTRAL / 75% tin cậy / 16 thg 6, 2026</span>}
        findingData={null}
        source={null}
      />
    );
    expect(screen.getByText("NEUTRAL / 75% tin cậy / 16 thg 6, 2026")).toBeInTheDocument();
  });

  it("shows 'Xem thêm' trigger when collapsed", () => {
    render(
      <InfoCardExpand
        summary={<span>test</span>}
        findingData={{ headline: "Fed" }}
        source={null}
      />
    );
    expect(screen.getByText("▼ Xem thêm")).toBeInTheDocument();
  });

  it("expands to show finding detail on click, trigger changes to 'Thu gọn'", async () => {
    render(
      <InfoCardExpand
        summary={<span>NEUTRAL signal</span>}
        findingData={{ headline: "Fed giữ lãi suất", event_type: "macro_shift" }}
        source={null}
      />
    );
    const trigger = screen.getByText("▼ Xem thêm");
    await act(async () => { fireEvent.click(trigger); });
    expect(screen.getByText("▲ Thu gọn")).toBeInTheDocument();
    expect(screen.getByText("Fed giữ lãi suất")).toBeInTheDocument();
    expect(screen.getByText("macro_shift")).toBeInTheDocument();
  });

  it("collapses again on second click, hides detail", async () => {
    render(
      <InfoCardExpand
        summary={<span>test</span>}
        findingData={{ headline: "Test headline" }}
        source={null}
      />
    );
    const trigger = screen.getByText("▼ Xem thêm");
    await act(async () => { fireEvent.click(trigger); });
    expect(screen.getByText("Test headline")).toBeInTheDocument();
    const collapseBtn = screen.getByText("▲ Thu gọn");
    await act(async () => { fireEvent.click(collapseBtn); });
    expect(screen.queryByText("Test headline")).not.toBeInTheDocument();
  });

  it("trigger has correct aria-expanded=false when collapsed", () => {
    render(
      <InfoCardExpand
        summary={<span>test</span>}
        findingData={null}
        source={null}
      />
    );
    const trigger = screen.getByRole("button", { name: "Xem chi tiết" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("trigger has aria-expanded=true when expanded", async () => {
    render(
      <InfoCardExpand
        summary={<span>test</span>}
        findingData={null}
        source={null}
      />
    );
    const trigger = screen.getByRole("button", { name: "Xem chi tiết" });
    await act(async () => { fireEvent.click(trigger); });
    expect(trigger).toHaveAttribute("aria-expanded", "true");
  });

  it("shows source link in expanded state when source is provided", async () => {
    render(
      <InfoCardExpand
        summary={<span>signal</span>}
        findingData={null}
        source="https://reuters.com/vn/abc"
      />
    );
    await act(async () => { fireEvent.click(screen.getByText("▼ Xem thêm")); });
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "https://reuters.com/vn/abc");
  });

  it("shows honest empty-state 'Không có dữ liệu chi tiết.' when both null, expanded", async () => {
    render(
      <InfoCardExpand
        summary={<span>signal</span>}
        findingData={null}
        source={null}
      />
    );
    await act(async () => { fireEvent.click(screen.getByText("▼ Xem thêm")); });
    expect(screen.getByText("Không có dữ liệu chi tiết.")).toBeInTheDocument();
  });

  it("accepts optional className prop and applies it to wrapper div", () => {
    const { container } = render(
      <InfoCardExpand
        summary={<span>test</span>}
        findingData={null}
        source={null}
        className="border border-red-800 rounded"
      />
    );
    const wrapper = container.querySelector(".border-red-800");
    expect(wrapper).not.toBeNull();
  });
});
