import { describe, expect, it, vi } from "vitest";

vi.mock("wasp/server", () => ({
  HttpError: class HttpError extends Error {
    statusCode: number;
    constructor(statusCode: number, message?: string) {
      super(message);
      this.statusCode = statusCode;
    }
  },
}));

import { requireAdmin } from "./operationUtils";

describe("requireAdmin", () => {
  it("rejects an anonymous caller", () => {
    expect(() => requireAdmin({})).toThrow(expect.objectContaining({ statusCode: 401 }));
  });

  it("rejects a regular or banned administrator", () => {
    expect(() => requireAdmin({ user: { id: "user", isAdmin: false, isBanned: false } })).toThrow(expect.objectContaining({ statusCode: 403 }));
    expect(() => requireAdmin({ user: { id: "admin", isAdmin: true, isBanned: true } })).toThrow(expect.objectContaining({ statusCode: 403 }));
  });

  it("returns an active administrator", () => {
    const admin = { id: "admin", isAdmin: true, isBanned: false };
    expect(requireAdmin({ user: admin })).toBe(admin);
  });
});
