import { action, page, query, route, type Spec } from "@wasp.sh/spec";
import { AnnouncementDetailsPage } from "./pages/AnnouncementDetailsPage" with { type: "ref" };
import { AnnouncementListPage } from "./pages/AnnouncementListPage" with { type: "ref" };
import {
  getAnnouncement,
  getAnnouncements,
  getAnnouncementsForAdmin,
  getNotificationPreferences,
  saveAnnouncement,
  updateNotificationPreferences,
} from "./operations" with { type: "ref" };

const entities = ["User", "Announcement", "NotificationPreference", "AdminAuditLog"] as const;

export const announcementSpec: Spec = [
  route("AnnouncementListRoute", "/announcements", page(AnnouncementListPage)),
  route("AnnouncementDetailsRoute", "/announcements/:id", page(AnnouncementDetailsPage)),
  query(getAnnouncements, { entities: [...entities] }),
  query(getAnnouncement, { entities: [...entities] }),
  query(getAnnouncementsForAdmin, { entities: [...entities] }),
  query(getNotificationPreferences, { entities: [...entities] }),
  action(saveAnnouncement, { entities: [...entities] }),
  action(updateNotificationPreferences, { entities: [...entities] }),
];
