import type { RequestHandler } from "express";
import type { MiddlewareConfigFn } from "wasp/server";

type Attempt = { count: number; resetAt: number };

export class LoginAttemptLimiter {
  private readonly attempts = new Map<string, Attempt>();

  constructor(
    private readonly maxFailures: number,
    private readonly windowMs: number,
    private readonly maxEntries = 50_000,
  ) {}

  private prune(now: number) {
    for (const [key, attempt] of this.attempts) {
      if (attempt.resetAt <= now) this.attempts.delete(key);
    }
    while (this.attempts.size >= this.maxEntries) {
      const oldestKey = this.attempts.keys().next().value;
      if (oldestKey === undefined) break;
      this.attempts.delete(oldestKey);
    }
  }

  retryAfterSeconds(key: string, now = Date.now()): number {
    const attempt = this.attempts.get(key);
    if (!attempt || attempt.resetAt <= now) {
      if (attempt) this.attempts.delete(key);
      return 0;
    }
    return attempt.count >= this.maxFailures ? Math.ceil((attempt.resetAt - now) / 1_000) : 0;
  }

  recordFailure(key: string, now = Date.now()) {
    const attempt = this.attempts.get(key);
    if (!attempt || attempt.resetAt <= now) {
      this.prune(now);
      this.attempts.set(key, { count: 1, resetAt: now + this.windowMs });
      return;
    }
    attempt.count += 1;
  }

  clear(key: string) {
    this.attempts.delete(key);
  }
}

const emailLimiter = new LoginAttemptLimiter(5, 15 * 60 * 1_000);
const ipLimiter = new LoginAttemptLimiter(20, 15 * 60 * 1_000);

const adminLoginRateLimit: RequestHandler = (req, res, next) => {
  // Express trims the mounted `/auth` prefix from req.path before global
  // middleware runs, while req.originalUrl keeps the public route intact.
  const publicPath = req.originalUrl.split("?", 1)[0];
  if (req.method !== "POST" || publicPath !== "/auth/email/login") return next();

  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const forwarded = req.headers["x-forwarded-for"];
  const ip = (Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(",")[0])?.trim() || req.socket.remoteAddress || "unknown";
  const emailKey = `email:${email || "unknown"}`;
  const ipKey = `ip:${ip}`;
  const retryAfter = Math.max(emailLimiter.retryAfterSeconds(emailKey), ipLimiter.retryAfterSeconds(ipKey));

  if (retryAfter > 0) {
    res.setHeader("Retry-After", String(retryAfter));
    res.status(429).json({ message: "登录失败次数过多，请 15 分钟后再试" });
    return;
  }

  res.once("finish", () => {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      emailLimiter.clear(emailKey);
      // Keep source-wide failures: otherwise an attacker can authenticate to
      // their own account between password sprays and reset the IP counter.
    } else if (res.statusCode === 400 || res.statusCode === 401) {
      emailLimiter.recordFailure(emailKey);
      ipLimiter.recordFailure(ipKey);
    }
  });
  next();
};

export const serverMiddlewareConfigFn: MiddlewareConfigFn = (middlewareConfig) => {
  middlewareConfig.set("adminLoginRateLimit", adminLoginRateLimit);
  return middlewareConfig;
};
