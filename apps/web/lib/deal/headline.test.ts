import { goHeadline } from "@pay-pals/agents";
import { describe, expect, it } from "vitest";
import { goLine, verdictName } from "./headline";

const withQuestions = (n: number) => ({ questionsForSeller: Array.from({ length: n }, (_, i) => `q${i}`) });

describe("goLine", () => {
  it("is the agents package's goHeadline, for any number of questions", () => {
    for (const n of [0, 1, 2, 5]) expect(goLine(withQuestions(n))).toBe(goHeadline(n));
  });

  it("verdictName drops the full stop so a sentence can add its own", () => {
    expect(verdictName({ overall: "go", ...withQuestions(1) })).toBe("Looks good, 1 open question");
    expect(verdictName({ overall: "stop", ...withQuestions(0) })).toBe("Stop");
  });
});
