import { describe, expect, it } from "vitest";
import { handle } from "./handle";

const req = new Request("https://host/api/deals/x/evidence", { method: "POST" });

describe("handle", () => {
  it("maps an out-of-order event to a 409 with plain words, not a 500", async () => {
    const error = new Error("Event at 2026-10-08T00:00:00.000Z is before the latest event at 2026-10-27T00:00:00.000Z");
    error.name = "EventOutOfOrderError";
    const res = await handle(req, async () => {
      throw error;
    });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/already has a later event/);
    expect(body.error).not.toMatch(/2026-10/);
  });

  it("still maps the other package errors by name and hides unknown ones", async () => {
    const locked = new Error("locked");
    locked.name = "CardLockedError";
    expect((await handle(req, async () => { throw locked; })).status).toBe(409);
    const unknown = await handle(req, async () => {
      throw new Error("db connection string: postgres://user:pw@host/db");
    });
    expect(unknown.status).toBe(500);
    expect(((await unknown.json()) as { error: string }).error).not.toMatch(/postgres/);
  });
});
