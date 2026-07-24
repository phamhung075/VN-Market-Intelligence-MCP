/**
 * orchestration-narrative.test.tsx — FACTORY-FRONTEND-split-orchestration.
 * Render smoke test for Narrative (exports NarrativePanel), written BEFORE
 * the component was split out of dashboard.orchestration.tsx (TDD RED->GREEN
 * — test-first extraction).
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { NarrativePanel } from "~/components/orchestration/Narrative";
import type { Narrative } from "~/domain/orchestration/types";

describe("NarrativePanel", () => {
  it("empty state when narrative is undefined", () => {
    render(<NarrativePanel narrative={undefined} />);
    expect(screen.getByText("No narrative available.")).toBeTruthy();
  });

  it("renders current_sprint, watch_items, open_sprints, last_closed when all present", () => {
    const narrative: Narrative = {
      current_sprint: "Splitting the orchestration route",
      watch_items: ["render-verify deferred"],
      open_sprints: ["FACTORY-FRONTEND-split-orchestration"],
      last_closed: "FACTORY-FRONTEND-split-market-summaries",
    };
    render(<NarrativePanel narrative={narrative} />);
    expect(screen.getByText("Splitting the orchestration route")).toBeTruthy();
    expect(screen.getByText("render-verify deferred")).toBeTruthy();
    expect(screen.getByText("FACTORY-FRONTEND-split-orchestration")).toBeTruthy();
    expect(screen.getByText("FACTORY-FRONTEND-split-market-summaries")).toBeTruthy();
  });

  it("omits each sub-section when its field is absent", () => {
    render(<NarrativePanel narrative={{}} />);
    expect(screen.queryByText("Current Sprint")).toBeNull();
    expect(screen.queryByText("Watch Items")).toBeNull();
    expect(screen.queryByText("Open Sprints")).toBeNull();
    expect(screen.queryByText("Last Closed")).toBeNull();
  });
});
