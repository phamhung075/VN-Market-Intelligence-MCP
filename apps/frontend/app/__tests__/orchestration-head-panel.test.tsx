/**
 * orchestration-head-panel.test.tsx — FACTORY-FRONTEND-split-orchestration.
 *
 * Render smoke test for HeadPanel, written BEFORE the component was split out
 * of dashboard.orchestration.tsx (TDD RED->GREEN — test-first extraction).
 * Asserts the exact fields/fallbacks/color logic the inline component had.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { HeadPanel } from "~/components/orchestration/HeadPanel";
import type { Head } from "~/domain/orchestration/types";

describe("HeadPanel", () => {
  it("renders status, active task, next agent, WIP, updated by", () => {
    const head: Head = {
      status: "in_progress",
      active_task_id: "TASK-123",
      next_agent: "qa",
      wip: 2,
      wip_max: 3,
      updated_by: "dev-frontend",
    };
    render(<HeadPanel head={head} />);
    expect(screen.getByText("in_progress")).toBeTruthy();
    expect(screen.getByText("TASK-123")).toBeTruthy();
    expect(screen.getByText("qa")).toBeTruthy();
    expect(screen.getByText("2 / 3")).toBeTruthy();
    expect(screen.getByText("dev-frontend")).toBeTruthy();
  });

  it('status "done" gets the green color class', () => {
    const head: Head = { status: "done" };
    render(<HeadPanel head={head} />);
    const dd = screen.getByText("done");
    expect(dd.className).toContain("text-green-400");
  });

  it('status "in_progress" gets the blue color class', () => {
    const head: Head = { status: "in_progress" };
    render(<HeadPanel head={head} />);
    const dd = screen.getByText("in_progress");
    expect(dd.className).toContain("text-blue-400");
  });

  it("any other status falls back to slate", () => {
    const head: Head = { status: "blocked" };
    render(<HeadPanel head={head} />);
    const dd = screen.getByText("blocked");
    expect(dd.className).toContain("text-slate-300");
  });

  it("missing active_task_id/next_agent/updated_by render em-dash fallback", () => {
    const head: Head = { status: "todo" };
    render(<HeadPanel head={head} />);
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBe(3); // Active Task, Next Agent, Updated By
  });

  it("missing wip/wip_max renders 0 / ?", () => {
    const head: Head = { status: "todo" };
    render(<HeadPanel head={head} />);
    expect(screen.getByText("0 / ?")).toBeTruthy();
  });

  it("Updated At block renders only when head.updated_at is present", () => {
    const withUpdatedAt: Head = { status: "todo", updated_at: "2026-07-24T10:00:00Z" };
    const { rerender } = render(<HeadPanel head={withUpdatedAt} />);
    expect(screen.getByText("Updated At")).toBeTruthy();

    rerender(<HeadPanel head={{ status: "todo" }} />);
    expect(screen.queryByText("Updated At")).toBeNull();
  });
});
