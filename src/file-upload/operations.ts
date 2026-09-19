import { type File } from "wasp/entities";
import { HttpError, prisma } from "wasp/server";
import {
  type AddFileToDb,
  type AbortBusinessFileUpload,
  type CompleteBusinessFileUpload,
  type CreateFileUploadUrl,
  type DeleteFile,
  type GetBusinessFileAccessUrl,
  type GetBusinessUploadParts,
  type GetAllFilesByUser,
  type GetDownloadFileSignedURL,
  type GetStorageOverview,
  type ResumeBusinessFileUpload,
  type StartBusinessFileUpload,
  type TestObjectStorage,
} from "wasp/server/operations";

import * as z from "zod";
import { ensureArgsSchemaOrThrowHttpError } from "../server/validation";
import { requireUser } from "../server/operationUtils";
import {
  checkFileExistsInS3,
  abortMultipartUpload,
  createMultipartUpload,
  deleteFileFromS3,
  finishMultipartUpload,
  getDownloadFileSignedURLFromS3,
  getS3Key,
  getUploadFileSignedURLFromS3,
  listMultipartParts,
  signMultipartParts,
  testStorageConnection,
} from "./s3Utils";
import { ALLOWED_FILE_TYPES, classifyFile, MAX_ACTIVE_UPLOADS_PER_USER, MAX_ATTACHMENT_SIZE_BYTES, MAX_VIDEO_SIZE_BYTES, MULTIPART_CHUNK_SIZE_BYTES, maxSizeForType } from "./validation";

const createFileInputSchema = z.object({
  fileType: z.enum(ALLOWED_FILE_TYPES),
  fileName: z.string().nonempty(),
});

type CreateFileInput = z.infer<typeof createFileInputSchema>;

export const createFileUploadUrl: CreateFileUploadUrl<
  CreateFileInput,
  {
    s3UploadUrl: string;
    s3UploadFields: Record<string, string>;
    s3Key: string;
  }
> = async (rawArgs, context) => {
  const user = requireUser(context);

  const { fileType, fileName } = ensureArgsSchemaOrThrowHttpError(
    createFileInputSchema,
    rawArgs,
  );

  return await getUploadFileSignedURLFromS3({
    fileType,
    fileName,
    userId: user.id,
  });
};

const addFileToDbInputSchema = z.object({
  s3Key: z.string(),
  fileType: z.enum(ALLOWED_FILE_TYPES),
  fileName: z.string(),
});

type AddFileToDbInput = z.infer<typeof addFileToDbInputSchema>;

export const addFileToDb: AddFileToDb<AddFileToDbInput, File> = async (
  rawArgs,
  context,
) => {
  const user = requireUser(context);

  const args = ensureArgsSchemaOrThrowHttpError(
    addFileToDbInputSchema,
    rawArgs,
  );
  if (!args.s3Key.startsWith(`${user.id}/`)) {
    throw new HttpError(403, "不能登记其他用户上传的文件");
  }

  const fileExists = await checkFileExistsInS3({ s3Key: args.s3Key });
  if (!fileExists) {
    throw new HttpError(404, "未在存储服务中找到该文件。");
  }

  return context.entities.File.create({
    data: {
      name: args.fileName,
      s3Key: args.s3Key,
      type: args.fileType,
      user: { connect: { id: user.id } },
    },
  });
};

export const getAllFilesByUser: GetAllFilesByUser<void, File[]> = async (
  _args,
  context,
) => {
  const user = requireUser(context);
  return context.entities.File.findMany({
    where: {
      user: {
        id: user.id,
      },
      targetType: null,
      submissionVersionId: null,
      contestEntryVersionId: null,
    },
    orderBy: {
      createdAt: "desc",
    },
  });
};

const getDownloadFileSignedURLInputSchema = z.object({
  s3Key: z.string().nonempty(),
});

type GetDownloadFileSignedURLInput = z.infer<
  typeof getDownloadFileSignedURLInputSchema
>;

export const getDownloadFileSignedURL: GetDownloadFileSignedURL<
  GetDownloadFileSignedURLInput,
  string
> = async (rawArgs, context) => {
  const user = requireUser(context);
  const { s3Key } = ensureArgsSchemaOrThrowHttpError(
    getDownloadFileSignedURLInputSchema,
    rawArgs,
  );
  const file = await context.entities.File.findFirst({
    where: { s3Key },
    include: { submissionVersion: { include: { submission: { include: { claim: { include: { task: true } } } } } } },
  });
  if (!file) throw new HttpError(404);
  const claim = file.submissionVersion?.submission.claim;
  const canDownload = user.isAdmin || file.userId === user.id || claim?.workerId === user.id || claim?.task.publisherId === user.id;
  if (!canDownload) throw new HttpError(403);
  return await getDownloadFileSignedURLFromS3({ s3Key });
};

const deleteFileInputSchema = z.object({
  id: z.string(),
});

type DeleteFileInput = z.infer<typeof deleteFileInputSchema>;

export const deleteFile: DeleteFile<DeleteFileInput, File> = async (
  rawArgs,
  context,
) => {
  const user = requireUser(context);

  const args = ensureArgsSchemaOrThrowHttpError(deleteFileInputSchema, rawArgs);

  const deletedFile = await context.entities.File.delete({
    where: {
      id: args.id,
      user: {
        id: user.id,
      },
      targetType: null,
      submissionVersionId: null,
      contestEntryVersionId: null,
    },
  });

  try {
    await deleteFileFromS3({ s3Key: deletedFile.s3Key });
  } catch (error) {
    console.error(
      `S3 deletion failed. Orphaned file s3Key: ${deletedFile.s3Key}`,
      error,
    );
  }

  return deletedFile;
};

const businessUploadInput = z.object({
  targetType: z.enum(["TASK", "CONTEST"]),
  targetId: z.string().uuid(),
  fileName: z.string().trim().min(1).max(240),
  fileType: z.enum(ALLOWED_FILE_TYPES),
  sizeBytes: z.number().int().positive().max(MAX_VIDEO_SIZE_BYTES),
});

async function assertCanUpload(userId: string, targetType: "TASK" | "CONTEST", targetId: string) {
  if (targetType === "TASK") {
    const task = await prisma.userTask.findUnique({ where: { id: targetId }, include: { assignedClaim: true } });
    if (!task || task.assignedClaim?.workerId !== userId || !["CLAIMED", "REVISION_REQUESTED"].includes(task.status) || task.assignedClaim.dueAt <= new Date()) throw new HttpError(403, "当前不能为该悬赏上传成果");
    return;
  }
  const contest = await prisma.contest.findUnique({ where: { id: targetId } });
  if (!contest || contest.publisherId === userId || contest.status !== "OPEN" || contest.submissionDeadline <= new Date()) throw new HttpError(403, "当前不能为该比赛上传作品");
}

export const startBusinessFileUpload: StartBusinessFileUpload<z.infer<typeof businessUploadInput>, any> = async (raw, context) => {
  const user = requireUser(context);
  const args = ensureArgsSchemaOrThrowHttpError(businessUploadInput, raw);
  if (args.sizeBytes > maxSizeForType(args.fileType)) throw new HttpError(400, classifyFile(args.fileType) === "VIDEO" ? "视频不能超过 500 MB" : "普通附件不能超过 20 MB");
  const extension = args.fileName.toLowerCase().split(".").pop();
  const extensionsByType: Record<string, string[]> = { "video/mp4": ["mp4"], "video/quicktime": ["mov"], "image/jpeg": ["jpg", "jpeg"], "image/png": ["png"], "image/webp": ["webp"], "application/pdf": ["pdf"], "text/plain": ["txt"] };
  if (!extension || !extensionsByType[args.fileType]?.includes(extension)) throw new HttpError(400, "文件扩展名与文件类型不匹配");
  await assertCanUpload(user.id, args.targetType, args.targetId);
  const activeCount = await context.entities.File.count({ where: { userId: user.id, status: "UPLOADING" } });
  if (activeCount >= MAX_ACTIVE_UPLOADS_PER_USER) throw new HttpError(409, "每位用户最多同时上传 2 个文件");
  const readyForTarget = await context.entities.File.findMany({ where: { userId: user.id, targetType: args.targetType, targetId: args.targetId, status: { in: ["UPLOADING", "READY"] } }, select: { kind: true } });
  const kind = classifyFile(args.fileType);
  if (kind === "VIDEO" && readyForTarget.filter((file) => file.kind === "VIDEO").length >= 1) throw new HttpError(409, "当前提交已经上传了 1 个视频");
  if (kind === "ATTACHMENT" && readyForTarget.filter((file) => file.kind === "ATTACHMENT").length >= 5) throw new HttpError(409, "当前提交已经上传了 5 个普通附件");
  const s3Key = getS3Key(args.fileName, `${user.id}/${args.targetType.toLowerCase()}/${args.targetId}`);
  const uploadId = await createMultipartUpload({ s3Key, fileType: args.fileType });
  try {
    const file = await context.entities.File.create({ data: { userId: user.id, name: args.fileName, type: args.fileType, sizeBytes: args.sizeBytes, kind, status: "UPLOADING", targetType: args.targetType, targetId: args.targetId, s3Key, multipartUploadId: uploadId, deleteAfter: new Date(Date.now() + 24 * 60 * 60 * 1000) } });
    return { file, chunkSizeBytes: MULTIPART_CHUNK_SIZE_BYTES, partCount: Math.ceil(args.sizeBytes / MULTIPART_CHUNK_SIZE_BYTES) };
  } catch (error) {
    await abortMultipartUpload({ s3Key, uploadId }).catch(() => undefined);
    throw error;
  }
};

const fileIdInput = z.object({ fileId: z.string().uuid() });
async function ownedUpload(fileId: string, userId: string) {
  const file = await prisma.file.findFirst({ where: { id: fileId, userId } });
  if (!file) throw new HttpError(404);
  return file;
}

export const getBusinessUploadParts: GetBusinessUploadParts<{ fileId: string; partNumbers: number[] }, any> = async (raw, context) => {
  const user = requireUser(context);
  const args = ensureArgsSchemaOrThrowHttpError(z.object({ fileId: z.string().uuid(), partNumbers: z.array(z.number().int().min(1).max(10_000)).min(1).max(100) }), raw);
  const file = await ownedUpload(args.fileId, user.id);
  if (file.status !== "UPLOADING" || !file.multipartUploadId) throw new HttpError(409, "上传会话已经结束");
  const maxPart = Math.ceil(file.sizeBytes / MULTIPART_CHUNK_SIZE_BYTES);
  if (args.partNumbers.some((number) => number > maxPart)) throw new HttpError(400, "分片编号无效");
  return signMultipartParts({ s3Key: file.s3Key, uploadId: file.multipartUploadId, partNumbers: [...new Set(args.partNumbers)] });
};

export const resumeBusinessFileUpload: ResumeBusinessFileUpload<{ fileId: string }, any> = async (raw, context) => {
  const user = requireUser(context);
  const { fileId } = ensureArgsSchemaOrThrowHttpError(fileIdInput, raw);
  const file = await ownedUpload(fileId, user.id);
  if (file.status !== "UPLOADING" || !file.multipartUploadId) throw new HttpError(409, "上传会话已经结束");
  return { file, chunkSizeBytes: MULTIPART_CHUNK_SIZE_BYTES, uploadedParts: await listMultipartParts({ s3Key: file.s3Key, uploadId: file.multipartUploadId }) };
};

export const completeBusinessFileUpload: CompleteBusinessFileUpload<{ fileId: string; parts: Array<{ partNumber: number; etag: string }> }, any> = async (raw, context) => {
  const user = requireUser(context);
  const args = ensureArgsSchemaOrThrowHttpError(z.object({ fileId: z.string().uuid(), parts: z.array(z.object({ partNumber: z.number().int().positive(), etag: z.string().min(1).max(200) })).min(1).max(10_000) }), raw);
  const file = await ownedUpload(args.fileId, user.id);
  if (file.status !== "UPLOADING" || !file.multipartUploadId) throw new HttpError(409, "上传会话已经结束");
  const expectedParts = Math.ceil(file.sizeBytes / MULTIPART_CHUNK_SIZE_BYTES);
  const numbers = args.parts.map((part) => part.partNumber);
  if (args.parts.length !== expectedParts || new Set(numbers).size !== expectedParts || numbers.some((number) => number < 1 || number > expectedParts)) throw new HttpError(400, "上传分片不完整");
  const head = await finishMultipartUpload({ s3Key: file.s3Key, uploadId: file.multipartUploadId, parts: args.parts });
  if (head.sizeBytes !== file.sizeBytes || head.sizeBytes > maxSizeForType(file.type)) {
    await deleteFileFromS3({ s3Key: file.s3Key }).catch(() => undefined);
    await context.entities.File.update({ where: { id: file.id }, data: { status: "ABORTED", lastDeleteError: "对象大小与声明不一致" } });
    throw new HttpError(400, "上传后的文件大小校验失败");
  }
  return context.entities.File.update({ where: { id: file.id }, data: { status: "READY", multipartUploadId: null, uploadedAt: new Date(), deleteAfter: new Date(Date.now() + 24 * 60 * 60 * 1000) } });
};

export const abortBusinessFileUpload: AbortBusinessFileUpload<{ fileId: string }, any> = async (raw, context) => {
  const user = requireUser(context);
  const { fileId } = ensureArgsSchemaOrThrowHttpError(fileIdInput, raw);
  const file = await ownedUpload(fileId, user.id);
  if (file.status === "ATTACHED") throw new HttpError(409, "已提交的成果附件不能删除");
  if (file.status === "UPLOADING" && file.multipartUploadId) await abortMultipartUpload({ s3Key: file.s3Key, uploadId: file.multipartUploadId }).catch(() => undefined);
  if (file.status === "READY") await deleteFileFromS3({ s3Key: file.s3Key }).catch(() => undefined);
  return context.entities.File.update({ where: { id: file.id }, data: { status: "ABORTED", multipartUploadId: null, deleteAfter: null } });
};

export const getBusinessFileAccessUrl: GetBusinessFileAccessUrl<{ fileId: string; download?: boolean }, any> = async (raw, context) => {
  const args = ensureArgsSchemaOrThrowHttpError(z.object({ fileId: z.string().uuid(), download: z.boolean().optional() }), raw);
  const file = await context.entities.File.findUnique({ where: { id: args.fileId }, include: { submissionVersion: { include: { submission: { include: { claim: { include: { task: true } } } } } }, contestEntryVersion: { include: { contestEntry: { include: { contest: true } } } } } });
  if (!file || file.status !== "ATTACHED") throw new HttpError(404);
  const claim = file.submissionVersion?.submission.claim;
  const task = claim?.task;
  const entry = file.contestEntryVersion?.contestEntry;
  const userId = context.user?.id;
  const allowed = Boolean(context.user?.isAdmin || file.userId === userId || claim?.workerId === userId || task?.publisherId === userId || entry?.contest.publisherId === userId || (entry && ["COOLING", "COMPLETED"].includes(entry.contest.status)));
  if (!allowed) throw new HttpError(403);
  const playable = file.kind === "VIDEO" && !args.download;
  return { url: await getDownloadFileSignedURLFromS3({ s3Key: file.s3Key, downloadName: playable ? undefined : file.name }), playable, name: file.name, type: file.type, sizeBytes: file.sizeBytes };
};

export const getStorageOverview: GetStorageOverview<void, any> = async (_raw, context) => {
  const user = requireUser(context);
  if (!user.isAdmin) throw new HttpError(403);
  const [groups, pending, failed] = await Promise.all([
    prisma.file.groupBy({ by: ["kind"], where: { status: { in: ["READY", "ATTACHED"] } }, _count: { _all: true }, _sum: { sizeBytes: true } }),
    prisma.file.count({ where: { status: { in: ["UPLOADING", "READY"] } } }),
    prisma.file.count({ where: { deleteAttempts: { gt: 0 }, status: { not: "DELETED" } } }),
  ]);
  return { groups, pending, failed, totalBytes: groups.reduce((sum: number, row: any) => sum + (row._sum.sizeBytes ?? 0), 0), totalObjects: groups.reduce((sum: number, row: any) => sum + row._count._all, 0) };
};

export const testObjectStorage: TestObjectStorage<void, { ok: true }> = async (_raw, context) => {
  const user = requireUser(context);
  if (!user.isAdmin) throw new HttpError(403);
  await testStorageConnection();
  return { ok: true };
};
