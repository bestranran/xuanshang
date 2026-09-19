import { describe, expect, it } from "vitest";
import { formatPublicNo } from "./publicNo";

describe("formatPublicNo", () => {
  it("uses stable type prefixes and six digit padding", () => {
    expect(formatPublicNo("user", 12)).toBe("U000012");
    expect(formatPublicNo("task", 12)).toBe("B000012");
    expect(formatPublicNo("contest", 12)).toBe("C000012");
    expect(formatPublicNo("recharge", 12)).toBe("R000012");
    expect(formatPublicNo("withdrawal", 12)).toBe("W000012");
  });

  it("does not truncate values longer than six digits", () => {
    expect(formatPublicNo("user", 1_234_567)).toBe("U1234567");
  });
});
