import { emailSender } from "wasp/server/email";

export type EmailCategory = "taskEmails" | "contestEmails" | "walletEmails";

export async function sendUserEmail(prisma: any, userId: string, category: EmailCategory, subject: string, body: string) {
  try {
    const recipient = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, notificationPreference: true } });
    if (!recipient?.email || recipient.notificationPreference?.[category] === false) return;
    await emailSender.send({
      to: recipient.email,
      subject,
      text: body,
      html: `<div style="font-family:system-ui,sans-serif;line-height:1.7"><h2>${escapeHtml(subject)}</h2><p>${escapeHtml(body)}</p></div>`,
    });
  } catch (error) {
    console.error("Failed to send user notification email", { userId, category, error });
  }
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character] ?? character);
}
