import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListPartsCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";
import * as path from "path";
import { MAX_FILE_SIZE_BYTES } from "./validation";
import { getSystemSettings } from "../server/systemSettings";

async function storage() {
  const values = await getSystemSettings(["storage.region", "storage.endpoint", "storage.accessKey", "storage.secretKey", "storage.bucket"]);
  const region = values["storage.region"], accessKeyId = values["storage.accessKey"], secretAccessKey = values["storage.secretKey"], bucket = values["storage.bucket"];
  if (!region || !accessKeyId || !secretAccessKey || !bucket) throw new Error("对象存储尚未配置，请联系管理员");
  return { bucket, client: new S3Client({ region, endpoint: values["storage.endpoint"] || undefined, forcePathStyle: Boolean(values["storage.endpoint"]), credentials: { accessKeyId, secretAccessKey } }) };
}

export async function testStorageConnection() {
  const { client, bucket } = await storage();
  const key = `_health/${randomUUID()}.txt`;
  await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: "ok", ContentType: "text/plain" }));
  await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  return true;
}

type S3Upload = {
  fileType: string;
  fileName: string;
  userId: string;
};

export const getUploadFileSignedURLFromS3 = async ({
  fileName,
  fileType,
  userId,
}: S3Upload) => {
  const s3Key = getS3Key(fileName, userId);
  const { client, bucket } = await storage();

  const { url: s3UploadUrl, fields: s3UploadFields } =
    await createPresignedPost(client, {
      Bucket: bucket,
      Key: s3Key,
      Conditions: [["content-length-range", 0, MAX_FILE_SIZE_BYTES]],
      Fields: {
        "Content-Type": fileType,
      },
      Expires: 3600,
    });

  return { s3UploadUrl, s3Key, s3UploadFields };
};

export const getDownloadFileSignedURLFromS3 = async ({
  s3Key, downloadName,
}: {
  s3Key: string;
  downloadName?: string;
}) => {
  const { client, bucket } = await storage();
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: s3Key,
    ...(downloadName ? { ResponseContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(downloadName)}` } : {}),
  });
  return await getSignedUrl(client, command, { expiresIn: 3600 });
};

export async function createMultipartUpload({ s3Key, fileType }: { s3Key: string; fileType: string }) {
  const { client, bucket } = await storage();
  const result = await client.send(new CreateMultipartUploadCommand({ Bucket: bucket, Key: s3Key, ContentType: fileType }));
  if (!result.UploadId) throw new Error("对象存储没有返回上传编号");
  return result.UploadId;
}

export async function signMultipartParts({ s3Key, uploadId, partNumbers }: { s3Key: string; uploadId: string; partNumbers: number[] }) {
  const { client, bucket } = await storage();
  return Promise.all(partNumbers.map(async (partNumber) => ({
    partNumber,
    url: await getSignedUrl(client, new UploadPartCommand({ Bucket: bucket, Key: s3Key, UploadId: uploadId, PartNumber: partNumber }), { expiresIn: 3600 }),
  })));
}

export async function listMultipartParts({ s3Key, uploadId }: { s3Key: string; uploadId: string }) {
  const { client, bucket } = await storage();
  const result = await client.send(new ListPartsCommand({ Bucket: bucket, Key: s3Key, UploadId: uploadId }));
  return (result.Parts ?? []).flatMap((part) => part.PartNumber && part.ETag ? [{ partNumber: part.PartNumber, etag: part.ETag }] : []);
}

export async function finishMultipartUpload({ s3Key, uploadId, parts }: { s3Key: string; uploadId: string; parts: Array<{ partNumber: number; etag: string }> }) {
  const { client, bucket } = await storage();
  await client.send(new CompleteMultipartUploadCommand({ Bucket: bucket, Key: s3Key, UploadId: uploadId, MultipartUpload: { Parts: parts.sort((a, b) => a.partNumber - b.partNumber).map((part) => ({ PartNumber: part.partNumber, ETag: part.etag })) } }));
  return headFileInS3({ s3Key });
}

export async function abortMultipartUpload({ s3Key, uploadId }: { s3Key: string; uploadId: string }) {
  const { client, bucket } = await storage();
  await client.send(new AbortMultipartUploadCommand({ Bucket: bucket, Key: s3Key, UploadId: uploadId }));
}

export async function headFileInS3({ s3Key }: { s3Key: string }) {
  const { client, bucket } = await storage();
  const result = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: s3Key }));
  return { sizeBytes: result.ContentLength ?? 0, contentType: result.ContentType ?? "application/octet-stream" };
}

export const deleteFileFromS3 = async ({ s3Key }: { s3Key: string }) => {
  const { client, bucket } = await storage();
  const command = new DeleteObjectCommand({
    Bucket: bucket,
    Key: s3Key,
  });
  await client.send(command);
};

export const checkFileExistsInS3 = async ({ s3Key }: { s3Key: string }) => {
  const { client, bucket } = await storage();
  const command = new HeadObjectCommand({
    Bucket: bucket,
    Key: s3Key,
  });
  try {
    await client.send(command);
    return true;
  } catch (error) {
    if (error instanceof S3ServiceException && error.name === "NotFound") {
      return false;
    }
    throw error;
  }
};

export function getS3Key(fileName: string, userId: string) {
  const ext = path.extname(fileName).slice(1);
  return `${userId}/${randomUUID()}.${ext}`;
}
