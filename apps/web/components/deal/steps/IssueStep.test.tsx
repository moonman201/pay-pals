import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { IssueStep } from "./IssueStep";

function stubFetch() {
  const calls: { url: string; body: unknown }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init?.body ?? "{}")) });
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
    }),
  );
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe("IssueStep after delivery", () => {
  it("offers the arrival mismatch, the empty box and something else, with the confirm button live at once", () => {
    render(<IssueStep dealId="d1" state="DELIVERED" preselect="arrival_mismatch" onDone={() => {}} onClose={() => {}} />);
    expect(screen.getAllByRole("radio").map((r) => r.closest("label")?.textContent?.trim())).toEqual([
      "What arrived does not match the locked card",
      "The box arrived empty",
      "Something else",
    ]);
    expect(screen.getByRole("radio", { name: "What arrived does not match the locked card" })).toBeChecked();
    expect(screen.getByRole("button", { name: "Open the issue" })).toBeEnabled();
  });

  it("one click confirms the preselected mismatch", async () => {
    const calls = stubFetch();
    const onDone = vi.fn();
    render(<IssueStep dealId="d1" state="DELIVERED" preselect="arrival_mismatch" onDone={onDone} onClose={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: "Open the issue" }));
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("/api/deals/d1/issue");
    expect(calls[0]?.body).toEqual({ reason: "arrival_mismatch", details: "" });
    expect(onDone).toHaveBeenCalled();
  });

  it("the empty box choice sends the mismatch reason with the detail line", async () => {
    const calls = stubFetch();
    render(<IssueStep dealId="d1" state="DELIVERED" preselect="arrival_mismatch" onDone={() => {}} onClose={() => {}} />);
    await userEvent.click(screen.getByRole("radio", { name: "The box arrived empty" }));
    await userEvent.click(screen.getByRole("button", { name: "Open the issue" }));
    expect(calls[0]?.body).toEqual({ reason: "arrival_mismatch", details: "The box arrived empty." });
  });
});

describe("IssueStep before delivery", () => {
  it("offers never arrived, seller stopped responding and something else", () => {
    render(<IssueStep dealId="d1" state="SHIPPED" onDone={() => {}} onClose={() => {}} />);
    expect(screen.getAllByRole("radio").map((r) => r.closest("label")?.textContent?.trim())).toEqual([
      "The item never arrived",
      "The seller stopped responding",
      "Something else",
    ]);
    expect(screen.getByRole("radio", { name: "The item never arrived" })).toBeChecked();
  });
});
