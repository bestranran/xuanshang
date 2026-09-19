import { type EmailSender } from "@wasp.sh/spec";

export const emailSender: EmailSender = {
  // Wasp connects to the private deployment relay. The relay loads the real
  // upstream SMTP credentials from encrypted Admin > System Settings values.
  provider: "SMTP",
  defaultFrom: {
    name: "悬赏",
    email: "no-reply@example.com",
  },
};
