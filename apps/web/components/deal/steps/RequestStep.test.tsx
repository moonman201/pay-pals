import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const postJson = vi.fn(async (..._args: unknown[]) => ({}));
vi.mock("@/lib/client/api", () => ({
  dealApi: (id: string, action: string) => `/api/deals/${id}/${action}`,
  postJson: (...args: unknown[]) => postJson(...args),
}));

import { RequestStep } from "./RequestStep";

async function saveWith(questions: string[]) {
  render(<RequestStep dealId="d1" questions={questions} suggestions={[]} onDone={() => {}} />);
  if (questions.length === 0) await userEvent.click(screen.getByRole("button", { name: "Add a photo or note" }));
  await userEvent.type(screen.getByLabelText("Your reply"), "Added a close-up.");
  await userEvent.click(screen.getByRole("button", { name: "Save a new card version" }));
  return postJson.mock.calls[0]?.[1] as { request: { field: string; request: string } };
}

describe("RequestStep", () => {
  beforeEach(() => postJson.mockClear());

  it("passes the buyer's question through when the pal asked one", async () => {
    const body = await saveWith(["Show the label."]);
    expect(body.request.request).toBe("Show the label.");
  });

  it("passes no request text when the seller updates unprompted, not a made-up one", async () => {
    const body = await saveWith([]);
    expect(body.request.request).toBe("");
  });
});
