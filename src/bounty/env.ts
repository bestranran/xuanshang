import * as z from "zod";

export const bountyEnvSchema = z.object({
  EPAY_API_URL: z.url().optional(),
  EPAY_PID: z.string().min(1).optional(),
  EPAY_KEY: z.string().min(1).optional(),
  EPAY_NOTIFY_URL: z.url().optional(),
  EPAY_RETURN_URL: z.url().optional(),
  PAYOUT_TOKEN_ENCRYPTION_KEY: z.string().min(43).optional(),
});
