import { describe, expect, it } from "vitest";
import { asRole, checkPage, findEvidenceLink, findFinishedLinks, parseArgs, SLOW_MS } from "./smoke-prod-checks.mjs";

const page = (over: Partial<Parameters<typeof checkPage>[0]> = {}) => ({ path: "/deals/finished/fake-slab?as=buyer", status: 200, ms: 800, body: "Blocked and more", finalPath: "/deals/x?as=buyer", ...over });

describe("parseArgs", () => {
  it("takes --base, trims the slash, and falls back to the environment", () => {
    expect(parseArgs(["--base", "https://a.example/"])).toEqual({ ok: true, base: "https://a.example" });
    expect(parseArgs(["--base=https://a.example"])).toEqual({ ok: true, base: "https://a.example" });
    expect(parseArgs([], { SMOKE_BASE_URL: "https://b.example" })).toEqual({ ok: true, base: "https://b.example" });
  });
  it("refuses a missing base and an unknown flag", () => {
    expect(parseArgs([]).ok).toBe(false);
    expect(parseArgs(["--base", "nope"]).ok).toBe(false);
    expect(parseArgs(["--fast"]).ok).toBe(false);
  });
});

describe("links", () => {
  const html = '<a href="/deals/finished/fake-slab?as=buyer">See</a><a href="/deals/finished/empty-box?as=buyer">See</a><a href="/deals/finished/unavailable">no</a>';
  it("finds the finished-deal links by scenario and ignores the unavailable page", () => {
    expect(findFinishedLinks(html)).toEqual({ "fake-slab": "/deals/finished/fake-slab?as=buyer", "empty-box": "/deals/finished/empty-box?as=buyer" });
    expect(findFinishedLinks("<p>nothing</p>")).toEqual({});
  });
  it("switches the role on a link, adding it when missing", () => {
    expect(asRole("/deals/finished/fake-slab?as=buyer", "seller")).toBe("/deals/finished/fake-slab?as=seller");
    expect(asRole("/deals/finished/fake-slab", "seller")).toBe("/deals/finished/fake-slab?as=seller");
  });
  it("finds the evidence link in a room", () => {
    const id = "6a09832c-82e3-499b-825a-1909829f42fd";
    expect(findEvidenceLink(`<a href="/deals/${id}/evidence?as=buyer">pack</a>`)).toBe(`/deals/${id}/evidence?as=buyer`);
    expect(findEvidenceLink("<p>none</p>")).toBeNull();
  });
});

describe("checkPage", () => {
  it("passes a fast 200 with every string", () => {
    expect(checkPage(page(), ["Blocked"])).toEqual([]);
  });
  it("fails a non-200, a slow page and a missing string", () => {
    expect(checkPage(page({ status: 500 }), [])[0]).toMatch(/500/);
    expect(checkPage(page({ ms: SLOW_MS + 1 }), [])[0]).toMatch(/over the 10 s limit/);
    expect(checkPage(page(), ["Reused"])).toEqual(['/deals/finished/fake-slab?as=buyer is missing "Reused"']);
  });
  it("names an unseeded deal rather than reporting missing strings", () => {
    const problems = checkPage(page({ finalPath: "/deals/finished/unavailable?scenario=fake-slab" }), ["Blocked", "x"]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/not seeded/);
  });
});
