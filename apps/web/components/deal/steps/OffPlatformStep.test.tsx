import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { OFF_PLATFORM_BUTTON, OFF_PLATFORM_WARNING, ON_YOUR_OWN } from "@/lib/deal/off-platform";
import { OffPlatformStep } from "./OffPlatformStep";

describe("OffPlatformStep", () => {
  it("shows the whole warning up front, not behind a disclosure", () => {
    render(<OffPlatformStep dealId="d" onDone={() => {}} />);
    const warning = screen.getByTestId("off-platform-warning");
    for (const line of OFF_PLATFORM_WARNING) expect(warning).toHaveTextContent(line);
    expect(warning).toHaveTextContent(ON_YOUR_OWN);
    expect(screen.queryByRole("button", { name: /show|more|details/i })).not.toBeInTheDocument();
  });

  it("asks for a deliberate confirmation before the button works", async () => {
    render(<OffPlatformStep dealId="d" onDone={() => {}} />);
    const button = screen.getByRole("button", { name: OFF_PLATFORM_BUTTON });
    expect(button).toBeDisabled();
    await userEvent.click(screen.getByTestId("off-platform-understood"));
    expect(button).toBeEnabled();
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
    await userEvent.click(screen.getByTestId("off-platform-understood"));
    await userEvent.click(screen.getByRole("button", { name: OFF_PLATFORM_BUTTON }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]![0])).toContain("/api/deals/d/off-platform");
    expect(onDone).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
