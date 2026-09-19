import { HttpError } from "wasp/server";
import { emailSender } from "wasp/server/email";
import type {
  GetAnnouncement,
  GetAnnouncements,
  GetAnnouncementsForAdmin,
  GetNotificationPreferences,
  SaveAnnouncement,
  UpdateNotificationPreferences,
} from "wasp/server/operations";
import { z } from "zod";
import { parseInput, requireAdmin, requireUser } from "../server/operationUtils";

const announcementInput = z.object({
  id: z.string().uuid().optional(),
  title: z.string().trim().min(3).max(120),
  summary: z.string().trim().min(3).max(300),
  content: z.string().trim().min(10).max(30_000),
  status: z.enum(["DRAFT", "PUBLISHED", "WITHDRAWN"]),
  isPinned: z.boolean(),
  emailUsers: z.boolean().default(false),
});

export const getAnnouncements: GetAnnouncements<void, any> = async (_args, context) => {
  return context.entities.Announcement.findMany({
    where: { status: "PUBLISHED", publishedAt: { lte: new Date() } },
    include: { publisher: { select: { username: true } } },
    orderBy: [{ isPinned: "desc" }, { publishedAt: "desc" }],
  });
};

export const getAnnouncement: GetAnnouncement<{ id: string }, any> = async (raw, context) => {
  const { id } = parseInput(z.object({ id: z.string().uuid() }), raw);
  const announcement = await context.entities.Announcement.findFirst({
    where: { id, status: "PUBLISHED", publishedAt: { lte: new Date() } },
    include: { publisher: { select: { username: true } } },
  });
  if (!announcement) throw new HttpError(404);
  return announcement;
};

export const getAnnouncementsForAdmin: GetAnnouncementsForAdmin<void, any> = async (_args, context) => {
  requireAdmin(context);
  return context.entities.Announcement.findMany({ orderBy: [{ createdAt: "desc" }] });
};

export const saveAnnouncement: SaveAnnouncement<z.infer<typeof announcementInput>, any> = async (raw, context) => {
  const admin = requireAdmin(context);
  const args = parseInput(announcementInput, raw);
  const existing = args.id ? await context.entities.Announcement.findUnique({ where: { id: args.id } }) : null;
  if (args.id && !existing) throw new HttpError(404);
  const firstPublish = args.status === "PUBLISHED" && existing?.status !== "PUBLISHED";
  const data = {
    title: args.title,
    summary: args.summary,
    content: args.content,
    status: args.status,
    isPinned: args.isPinned,
    publishedAt: firstPublish ? new Date() : existing?.publishedAt,
  };
  const announcement = existing
    ? await context.entities.Announcement.update({ where: { id: existing.id }, data })
    : await context.entities.Announcement.create({ data: { ...data, publisherId: admin.id } });
  await context.entities.AdminAuditLog.create({
    data: { adminId: admin.id, action: existing ? "ANNOUNCEMENT_UPDATED" : "ANNOUNCEMENT_CREATED", targetType: "ANNOUNCEMENT", targetId: announcement.id, metadata: { status: args.status, emailUsers: args.emailUsers } },
  });
  if (firstPublish && args.emailUsers) void sendAnnouncementEmails(context, announcement);
  return announcement;
};

export const getNotificationPreferences: GetNotificationPreferences<void, any> = async (_args, context) => {
  const user = requireUser(context);
  return (await context.entities.NotificationPreference.findUnique({ where: { userId: user.id } })) ?? {
    taskEmails: true, contestEmails: true, walletEmails: true, announcementEmails: true,
  };
};

export const updateNotificationPreferences: UpdateNotificationPreferences<{
  taskEmails: boolean;
  contestEmails: boolean;
  walletEmails: boolean;
  announcementEmails: boolean;
}, any> = async (args, context) => {
  const user = requireUser(context);
  const values = parseInput(z.object({ taskEmails: z.boolean(), contestEmails: z.boolean(), walletEmails: z.boolean(), announcementEmails: z.boolean() }), args);
  return context.entities.NotificationPreference.upsert({
    where: { userId: user.id }, update: values, create: { userId: user.id, ...values },
  });
};

async function sendAnnouncementEmails(context: any, announcement: { title: string; summary: string; content: string }) {
  const recipients = await context.entities.User.findMany({
    where: { email: { not: null }, OR: [{ notificationPreference: { is: null } }, { notificationPreference: { is: { announcementEmails: true } } }] },
    select: { email: true },
  });
  await Promise.allSettled(recipients.map(({ email }: { email: string | null }) => email ? emailSender.send({
    to: email,
    subject: `平台公告：${announcement.title}`,
    text: `${announcement.summary}\n\n${announcement.content}`,
    html: `<h1>${escapeHtml(announcement.title)}</h1><p>${escapeHtml(announcement.summary)}</p><div style="white-space:pre-wrap">${escapeHtml(announcement.content)}</div>`,
  }) : Promise.resolve()));
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character] ?? character);
}
