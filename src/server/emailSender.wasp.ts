import { type EmailSender } from "@wasp.sh/spec";

export const emailSender: EmailSender = {
  provider: "SendGrid",
  defaultFrom: {
    name: "悬赏",
    email: "no-reply@example.com",
  },
};
