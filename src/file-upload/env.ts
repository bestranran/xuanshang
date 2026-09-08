import * as z from "zod";

export const fileUploadEnvSchema = z.object({
  AWS_S3_REGION: z.string({
    error: "文件上传需要配置 AWS_S3_REGION",
  }),
  AWS_S3_IAM_ACCESS_KEY: z.string({
    error: "文件上传需要配置 AWS_S3_IAM_ACCESS_KEY",
  }),
  AWS_S3_IAM_SECRET_KEY: z.string({
    error: "文件上传需要配置 AWS_S3_IAM_SECRET_KEY",
  }),
  AWS_S3_FILES_BUCKET: z.string({
    error: "文件上传需要配置 AWS_S3_FILES_BUCKET",
  }),
});
