import { type File } from "wasp/entities";
import { HttpError } from "wasp/server";
import {
  type AddFileToDb,
  type CreateFileUploadUrl,
  type DeleteFile,
  type GetAllFilesByUser,
  type GetDownloadFileSignedURL,
} from "wasp/server/operations";

import * as z from "zod";
import { ensureArgsSchemaOrThrowHttpError } from "../server/validation";
import {
  checkFileExistsInS3,
  deleteFileFromS3,
  getDownloadFileSignedURLFromS3,
  getUploadFileSignedURLFromS3,
} from "./s3Utils";
import { ALLOWED_FILE_TYPES } from "./validation";

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
  if (!context.user) {
    throw new HttpError(401);
  }
  if (context.user.isBanned) throw new HttpError(403, "该账号已被封禁，当前仅可查看");

  const { fileType, fileName } = ensureArgsSchemaOrThrowHttpError(
    createFileInputSchema,
    rawArgs,
  );

  return await getUploadFileSignedURLFromS3({
    fileType,
    fileName,
    userId: context.user.id,
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
  if (!context.user) {
    throw new HttpError(401);
  }
  if (context.user.isBanned) throw new HttpError(403, "该账号已被封禁，当前仅可查看");

  const args = ensureArgsSchemaOrThrowHttpError(
    addFileToDbInputSchema,
    rawArgs,
  );
  if (!args.s3Key.startsWith(`${context.user.id}/`)) {
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
      user: { connect: { id: context.user.id } },
    },
  });
};

export const getAllFilesByUser: GetAllFilesByUser<void, File[]> = async (
  _args,
  context,
) => {
  if (!context.user) {
    throw new HttpError(401);
  }
  return context.entities.File.findMany({
    where: {
      user: {
        id: context.user.id,
      },
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
  if (!context.user) throw new HttpError(401);
  const { s3Key } = ensureArgsSchemaOrThrowHttpError(
    getDownloadFileSignedURLInputSchema,
    rawArgs,
  );
  const file = await context.entities.File.findFirst({
    where: { s3Key },
    include: { submission: { include: { task: true } } },
  });
  if (!file) throw new HttpError(404);
  const task = file.submission?.task;
  const canDownload = context.user.isAdmin || file.userId === context.user.id || task?.publisherId === context.user.id;
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
  if (!context.user) {
    throw new HttpError(401);
  }
  if (context.user.isBanned) throw new HttpError(403, "该账号已被封禁，当前仅可查看");

  const args = ensureArgsSchemaOrThrowHttpError(deleteFileInputSchema, rawArgs);

  const deletedFile = await context.entities.File.delete({
    where: {
      id: args.id,
      user: {
        id: context.user.id,
      },
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
