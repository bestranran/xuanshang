import { prisma } from "wasp/server";
import type { CleanupBusinessFiles } from "wasp/server/jobs";
import { abortMultipartUpload, deleteFileFromS3 } from "./s3Utils";

const TERMINAL_TASKS = ["COMPLETED", "CANCELLED", "REFUNDED", "CLOSED"] as const;
const TERMINAL_CONTESTS = ["COMPLETED", "CANCELLED", "REFUNDED", "CLOSED"] as const;

async function removeObject(file: { id: string; s3Key: string; multipartUploadId: string | null; status: string }) {
  try {
    if (file.status === "UPLOADING" && file.multipartUploadId) await abortMultipartUpload({ s3Key: file.s3Key, uploadId: file.multipartUploadId });
    else await deleteFileFromS3({ s3Key: file.s3Key });
    await prisma.file.update({ where: { id: file.id }, data: { status: "DELETED", multipartUploadId: null, deleteAfter: null, lastDeleteError: null } });
  } catch (error) {
    await prisma.file.update({ where: { id: file.id }, data: { deleteAttempts: { increment: 1 }, lastDeleteError: error instanceof Error ? error.message.slice(0, 1000) : "对象删除失败" } });
  }
}

export const cleanupBusinessFiles: CleanupBusinessFiles<never, void> = async () => {
  const now = new Date();
  const cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const stale = await prisma.file.findMany({ where: { status: { in: ["UPLOADING", "READY"] }, deleteAfter: { lte: now } }, take: 100 });
  for (const file of stale) await removeObject(file);

  const historical = await prisma.file.findMany({
    where: {
      status: "ATTACHED",
      OR: [
        { submissionVersion: { submission: { claim: { task: { status: { in: [...TERMINAL_TASKS] }, updatedAt: { lte: cutoff } } } } } },
        { contestEntryVersion: { contestEntry: { contest: { status: { in: [...TERMINAL_CONTESTS] }, updatedAt: { lte: cutoff } } } } },
      ],
    },
    include: { submissionVersion: true, contestEntryVersion: true },
    take: 200,
  });
  for (const file of historical) {
    let isLatest = true;
    if (file.submissionVersion) {
      const latest = await prisma.submissionVersion.aggregate({ where: { submissionId: file.submissionVersion.submissionId }, _max: { version: true } });
      isLatest = file.submissionVersion.version === latest._max.version;
    } else if (file.contestEntryVersion) {
      const latest = await prisma.contestEntryVersion.aggregate({ where: { contestEntryId: file.contestEntryVersion.contestEntryId }, _max: { version: true } });
      isLatest = file.contestEntryVersion.version === latest._max.version;
    }
    if (!isLatest) await removeObject(file);
  }
};
