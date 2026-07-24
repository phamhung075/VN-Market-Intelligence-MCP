/**
 * orchestration-done-task-row.test.tsx — FACTORY-FRONTEND-split-orchestration.
 * Render smoke test for DoneTaskRow, written BEFORE the component was split
 * out of dashboard.orchestration.tsx's DoneTaskGroup (TDD RED->GREEN —
 * test-first extraction).
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DoneTaskRow } from "~/components/orchestration/DoneTaskRow";
import type { TaskRow } from "~/domain/orchestration/types";

const TASK: TaskRow = {
  id: "T-1",
  title: "Done task one",
  owner: "dev-frontend",
  status: "DONE",
  zone: "apps/frontend/",
  note: "a note",
};

describe("DoneTaskRow", () => {
  it("renders id/title/owner/status/zone/note", () => {
    render(
      <DoneTaskRow task={TASK} idx={0} isOpen={false} onToggle={() => {}} />
    );
    expect(screen.getByText("T-1")).toBeTruthy();
    expect(screen.getByText("Done task one")).toBeTruthy();
    expect(screen.getByText("dev-frontend")).toBeTruthy();
    expect(screen.getByText("DONE")).toBeTruthy();
    expect(screen.getByText("apps/frontend/")).toBeTruthy();
    expect(screen.getByText("a note")).toBeTruthy();
  });

  it("clicking the row calls onToggle with the task id", () => {
    const onToggle = vi.fn();
    render(
      <DoneTaskRow task={TASK} idx={0} isOpen={false} onToggle={onToggle} />
    );
    fireEvent.click(screen.getByRole("button"));
    expect(onToggle).toHaveBeenCalledWith("T-1");
  });

  it("does NOT render a DecisionAccordion when isOpen=false", () => {
    render(
      <DoneTaskRow task={TASK} idx={0} isOpen={false} onToggle={() => {}} />
    );
    expect(screen.queryByTestId("decision-accordion-T-1")).toBeNull();
  });

  it("renders a DecisionAccordion when isOpen=true", () => {
    render(
      <DoneTaskRow task={TASK} idx={0} isOpen={true} onToggle={() => {}} />
    );
    expect(screen.getByTestId("decision-accordion-T-1")).toBeTruthy();
  });

  it("missing owner/zone render em-dash fallback", () => {
    const bare: TaskRow = { id: "T-2", title: "Bare task", status: "DONE" };
    render(
      <DoneTaskRow task={bare} idx={1} isOpen={false} onToggle={() => {}} />
    );
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBe(2);
  });
});
