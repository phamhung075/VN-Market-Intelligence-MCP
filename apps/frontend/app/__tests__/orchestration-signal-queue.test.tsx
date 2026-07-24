/**
 * orchestration-signal-queue.test.tsx — FACTORY-FRONTEND-split-orchestration.
 * Render smoke test for SignalQueue (exports SignalQueuePanel), written
 * BEFORE the component was split out of dashboard.orchestration.tsx (TDD
 * RED->GREEN — test-first extraction).
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SignalQueuePanel } from "~/components/orchestration/SignalQueue";
import type { SignalQueue } from "~/domain/orchestration/types";

describe("SignalQueuePanel", () => {
  it("empty state when queue is undefined", () => {
    render(<SignalQueuePanel queue={undefined} />);
    expect(screen.getByText("No signals in queue.")).toBeTruthy();
  });

  it("empty state when rows is empty", () => {
    render(<SignalQueuePanel queue={{ rows: [] }} />);
    expect(screen.getByText("No signals in queue.")).toBeTruthy();
  });

  it("renders a row with from/to/severity/status/summary", () => {
    const queue: SignalQueue = {
      rows: [
        {
          id: "s1",
          ts: "2026-07-24T10:00:00Z",
          from: "dev-frontend",
          to: "qa",
          type: "handoff",
          summary: "route split complete",
          severity: "INFO",
          status: "NEW",
          payload_ref: null,
        },
      ],
    };
    render(<SignalQueuePanel queue={queue} />);
    expect(screen.getByText("dev-frontend")).toBeTruthy();
    expect(screen.getByText("qa")).toBeTruthy();
    expect(screen.getByText("INFO")).toBeTruthy();
    expect(screen.getByText("NEW")).toBeTruthy();
    expect(screen.getByText("route split complete")).toBeTruthy();
  });

  it("CRITICAL severity gets the red badge classes", () => {
    const queue: SignalQueue = {
      rows: [
        { id: "s1", ts: "t", from: "a", to: "b", type: "x", summary: "s", severity: "CRITICAL", status: "NEW", payload_ref: null },
      ],
    };
    render(<SignalQueuePanel queue={queue} />);
    const badge = screen.getByText("CRITICAL");
    expect(badge.className).toContain("bg-red-900");
  });

  it("unrecognized severity falls back to the default slate badge classes", () => {
    const queue: SignalQueue = {
      rows: [
        { id: "s1", ts: "t", from: "a", to: "b", type: "x", summary: "s", severity: "WEIRD", status: "NEW", payload_ref: null },
      ],
    };
    render(<SignalQueuePanel queue={queue} />);
    const badge = screen.getByText("WEIRD");
    expect(badge.className).toContain("bg-slate-700");
    expect(badge.className).toContain("text-slate-400");
  });
});
