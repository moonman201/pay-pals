import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { OFF_PLATFORM_BUTTON, OFF_PLATFORM_CONFIRM_BUTTON, OFF_PLATFORM_WARNING, ON_YOUR_OWN } from "@/lib/deal/off-platform";
import { OffPlatformStep } from "./OffPlatformStep";

describe("OffPlatformStep", () => {
  it("shows the whole warning up front, not behind a disclosure", () => {
    render(<OffPlatformStep dealId="d" onDone={() => {}} />);
    const warning = screen.getByTestId("off-platform-warning");
    for (const line of OFF_PLATFORM_WARNING) expect(warning).toHaveTextContent(line);
    expect(warning).toHaveTextContent(ON_YOUR_OWN);
    expect(screen.queryByRole("button", { name: /show|more|details/i })).not.toBeInTheDocument();
  });

  it("asks a second time before it records anything", async () => {
    render(<OffPlatformStep dealId="d" onDone={() => {}} />);
    expect(screen.queryByTestId("off-platform-confirm")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: OFF_PLATFORM_BUTTON }));
    const confirm = screen.getByTestId("off-platform-confirm");
    expect(confirm).toHaveTextContent("ends Pay Pals' part of the deal");
    expect(screen.getByRole("button", { name: OFF_PLATFORM_CONFIRM_BUTTON })).toBeEnabled();
  });

  it("lets the buyer back out of the second ask", async () => {
    render(<OffPlatformStep dealId="d" onDone={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: OFF_PLATFORM_BUTTON }));
    await userEvent.click(screen.getByRole("button", { name: "Not now" }));
    expect(screen.queryByTestId("off-platform-confirm")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: OFF_PLATFORM_BUTTON })).toBeInTheDocument();
  });

  it("uses no acknowledgment checkbox, which is the pattern for an overridable stop", () => {
    render(<OffPlatformStep dealId="d" onDone={() => {}} />);
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("does not dress the choice as an error", () => {
    const { container } = render(<OffPlatformStep dealId="d" onDone={() => {}} />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(container.querySelector("[class*='stop']")).toBeNull();
  });

  it("posts once and tells the room to refresh", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "d" }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const onDone = vi.fn();
    render(<OffPlatformStep dealId="d" onDone={onDone} />);
    await userEvent.click(screen.getByRole("button", { name: OFF_PLATFORM_BUTTON }));
    await userEvent.click(screen.getByRole("button", { name: OFF_PLATFORM_CONFIRM_BUTTON }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]![0])).toContain("/api/deals/d/off-platform");
    expect(onDone).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
