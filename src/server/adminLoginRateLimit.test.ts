import { describe, expect, it } from "vitest";
import { LoginAttemptLimiter } from "./adminLoginRateLimit";

describe("LoginAttemptLimiter", () => {
  it("locks after the configured number of failures", () => {
    const limiter = new LoginAttemptLimiter(3, 60_000);
    limiter.recordFailure("email:a", 1_000);
    limiter.recordFailure("email:a", 1_001);
    expect(limiter.retryAfterSeconds("email:a", 1_002)).toBe(0);
    limiter.recordFailure("email:a", 1_003);
    expect(limiter.retryAfterSeconds("email:a", 1_004)).toBe(60);
  });

  it("clears on success and expires old windows", () => {
    const limiter = new LoginAttemptLimiter(1, 1_000);
    limiter.recordFailure("ip:a", 1_000);
    expect(limiter.retryAfterSeconds("ip:a", 1_100)).toBe(1);
    limiter.clear("ip:a");
    expect(limiter.retryAfterSeconds("ip:a", 1_100)).toBe(0);
    limiter.recordFailure("ip:a", 2_000);
    expect(limiter.retryAfterSeconds("ip:a", 3_001)).toBe(0);
  });

  it("bounds unique attacker-controlled keys and removes expired entries", () => {
    const limiter = new LoginAttemptLimiter(1, 1_000, 2);
    limiter.recordFailure("email:a", 1_000);
    limiter.recordFailure("email:b", 1_001);
    limiter.recordFailure("email:c", 1_002);

    expect(limiter.retryAfterSeconds("email:a", 1_003)).toBe(0);
    expect(limiter.retryAfterSeconds("email:b", 1_003)).toBe(1);
    expect(limiter.retryAfterSeconds("email:c", 1_003)).toBe(1);

    limiter.recordFailure("email:d", 2_002);
    expect(limiter.retryAfterSeconds("email:b", 2_002)).toBe(0);
    expect(limiter.retryAfterSeconds("email:c", 2_002)).toBe(0);
    expect(limiter.retryAfterSeconds("email:d", 2_002)).toBe(1);
  });
});
