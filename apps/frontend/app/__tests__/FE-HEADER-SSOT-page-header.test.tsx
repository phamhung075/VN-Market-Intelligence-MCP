/**
 * FE-HEADER-SSOT — PageHeader component unit tests.
 *
 * Validates:
 *  - title rendered as <h1>
 *  - subtitle rendered when provided, absent when not
 *  - actions slot rendered when provided, absent when not
 *  - correct CSS classes for dark-theme consistency
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PageHeader } from "~/components/PageHeader";

describe("PageHeader", () => {
  it("renders title as <h1>", () => {
    render(<PageHeader title="Market Analysis" />);
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1).toBeTruthy();
    expect(h1.textContent).toBe("Market Analysis");
  });

  it("applies correct h1 classes for dark-theme consistency", () => {
    render(<PageHeader title="Service Health" />);
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1.className).toContain("text-2xl");
    expect(h1.className).toContain("font-bold");
    expect(h1.className).toContain("text-slate-100");
  });

  it("renders subtitle when provided", () => {
    render(<PageHeader title="Database Report" subtitle="VNINDEX price history" />);
    expect(screen.getByText("VNINDEX price history")).toBeTruthy();
  });

  it("does not render subtitle element when omitted", () => {
    render(<PageHeader title="No Subtitle Page" />);
    // Only the h1 should be present, no <p> with muted text
    const paragraphs = document.querySelectorAll("p");
    expect(paragraphs.length).toBe(0);
  });

  it("renders actions slot when provided", () => {
    render(
      <PageHeader
        title="Fetch Operations"
        actions={<button>Refresh</button>}
      />
    );
    expect(screen.getByRole("button", { name: "Refresh" })).toBeTruthy();
  });

  it("does not render actions container when omitted", () => {
    render(<PageHeader title="VPS Proxy Health" />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("renders both subtitle and actions together", () => {
    render(
      <PageHeader
        title="Orchestration State"
        subtitle="Live polling every 5s"
        actions={<span data-testid="live-badge">LIVE</span>}
      />
    );
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Orchestration State");
    expect(screen.getByText("Live polling every 5s")).toBeTruthy();
    expect(screen.getByTestId("live-badge").textContent).toBe("LIVE");
  });
});
