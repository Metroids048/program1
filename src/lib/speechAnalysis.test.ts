import { describe, expect, it } from "vitest";
import { analyzeSpeech } from "./speechAnalysis";

describe("speechAnalysis", () => {
  it("calculates pace and filler words", () => {
    const result = analyzeSpeech("嗯 我负责用户访谈，然后就推动转化率提升到 19%", 30);

    expect(result.charCount).toBeGreaterThan(10);
    expect(result.charsPerMinute).toBeGreaterThan(0);
    expect(result.fillerCount).toBeGreaterThanOrEqual(2);
    expect(result.comment).toContain("口头禅");
  });
});
