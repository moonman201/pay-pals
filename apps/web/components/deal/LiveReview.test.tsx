import { cleanPs5, type RedFlag, type ReviewProgress } from "@pay-pals/contracts";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { applyProgress, startedReview } from "@/lib/deal/live-review";
import { LiveReview } from "./LiveReview";

function flag(code: RedFlag["code"], severity: RedFlag["severity"]): RedFlag {
  return { code, severity, evidence: "what the seller wrote", explanation: `Something about ${code}.`, raisedByRule: true };
}

const apply = (events: ReviewProgress[]) => events.reduce(applyProgress, startedReview());

describe("LiveReview", () => {
  it("says the pal is still working before anything lands, never that nothing is wrong", () => {
    render(<LiveReview state={startedReview()} />);
    expect(screen.getByTestId("review-running")).toBeInTheDocument();
    expect(screen.getByTestId("live-review-line")).toHaveTextContent("Nothing has come back yet, which is not the same as nothing being wrong.");
    expect(screen.queryByTestId("live-flags")).not.toBeInTheDocument();
    expect(screen.getByTestId("live-price")).toHaveTextContent("Still running.");
    expect(screen.getByTestId("live-cert")).toHaveTextContent("Still running.");
  });

  it("says why Agree is locked", () => {
    render(<LiveReview state={startedReview()} />);
    expect(screen.getByTestId("agree-locked-line")).toHaveTextContent("Agree is locked until the review is complete");
  });

  it("shows a finding the moment it lands, with the lookups still running beside it", () => {
    render(<LiveReview state={apply([{ kind: "flag", flag: flag("URGENCY_PRESSURE", "caution") }])} />);
    expect(screen.getByTestId("live-flag")).toHaveAttribute("data-code", "URGENCY_PRESSURE");
    expect(screen.getByText("pressure to pay now")).toBeInTheDocument();
    expect(screen.getByTestId("live-price")).toHaveTextContent("Still running.");
    expect(screen.getByText("More checks are still running. This is not the verdict.")).toBeInTheDocument();
  });

  it("shows a stop as soon as it comes back, before the review is complete", () => {
    render(<LiveReview state={apply([{ kind: "flag", flag: flag("FRIENDS_AND_FAMILY_REQUEST", "stop") }])} />);
    expect(screen.getByTestId("review-running")).toHaveAttribute("data-stop", "true");
    expect(screen.getByTestId("live-review-badge")).toHaveTextContent("stop found, still checking");
    expect(screen.getByTestId("live-review-line")).toHaveTextContent("already found something that stops this deal");
    expect(screen.getByText("no override")).toBeInTheDocument();
  });

  it("lays the findings out the same way whichever order they arrived in", () => {
    const events: ReviewProgress[] = [
      { kind: "flag", flag: flag("URGENCY_PRESSURE", "caution") },
      { kind: "flag", flag: flag("FRIENDS_AND_FAMILY_REQUEST", "stop") },
      { kind: "priceCheck", priceCheck: cleanPs5.marketPrice },
    ];
    const codesFor = (order: ReviewProgress[]) => {
      const { unmount } = render(<LiveReview state={apply(order)} />);
      const codes = screen.getAllByTestId("live-flag").map((el) => el.getAttribute("data-code"));
      unmount();
      return codes;
    };
    const forward = codesFor(events);
    expect(forward).toEqual(["FRIENDS_AND_FAMILY_REQUEST", "URGENCY_PRESSURE"]);
    expect(codesFor([...events].reverse())).toEqual(forward);
    expect(codesFor([events[2]!, events[1]!, events[0]!])).toEqual(forward);
  });

  it("names the stage the pal is on", () => {
    render(<LiveReview state={apply([{ kind: "stage", stage: "checking the price" }])} />);
    expect(screen.getByTestId("working-status")).toHaveTextContent("checking the price");
  });

  it("counts photos against the card's photos, so it agrees with a stage line that names them all", () => {
    render(<LiveReview state={apply([{ kind: "photoRead", url: "/a.jpg", readable: true }])} photoTotal={3} />);
    expect(screen.getByTestId("live-photos")).toHaveTextContent("1 of 3 read so far.");
  });

  it("does not say a cert check is running on a card with no cert", () => {
    render(<LiveReview state={startedReview()} hasCert={false} />);
    expect(screen.getByTestId("live-cert")).toHaveTextContent("No cert number on the card, so there was nothing to check.");
    expect(screen.getByTestId("live-cert")).not.toHaveTextContent("Still running.");
  });

  it("can be scrolled to by id", () => {
    render(<LiveReview state={startedReview()} />);
    expect(document.getElementById("live-review")).not.toBeNull();
  });

  it("tells a lookup that answered nothing apart from one still running", () => {
    render(<LiveReview state={apply([{ kind: "certCheck", certCheck: null }])} />);
    expect(screen.getByTestId("live-cert")).toHaveTextContent("No cert number on the card, so there was nothing to check.");
    expect(screen.getByTestId("live-cert")).not.toHaveTextContent("Still running.");
  });
});
