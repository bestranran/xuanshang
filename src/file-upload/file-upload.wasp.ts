import { action, job, page, query, route, type Spec } from "@wasp.sh/spec";

import { FileUploadPage } from "./FileUploadPage" with { type: "ref" };
import {
  addFileToDb,
  abortBusinessFileUpload,
  completeBusinessFileUpload,
  createFileUploadUrl,
  deleteFile,
  getAllFilesByUser,
  getBusinessFileAccessUrl,
  getBusinessUploadParts,
  getDownloadFileSignedURL,
  getStorageOverview,
  resumeBusinessFileUpload,
  startBusinessFileUpload,
  testObjectStorage,
} from "./operations" with { type: "ref" };
import { cleanupBusinessFiles } from "./cleanupJob" with { type: "ref" };

const entities = ["User", "File", "SubmissionVersion", "Submission", "TaskClaim", "UserTask", "ContestEntryVersion", "ContestEntry", "Contest"] as const;

export const fileUploadSpec: Spec = [
  route(
    "FileUploadRoute",
    "/file-upload",
    page(FileUploadPage, { authRequired: true }),
  ),
  query(getAllFilesByUser, { entities: ["User", "File"] }),
  query(getDownloadFileSignedURL, { entities: ["User", "File"] }),
  action(addFileToDb, { entities: ["User", "File"] }),
  action(createFileUploadUrl, { entities: ["User", "File"] }),
  action(deleteFile, { entities: ["User", "File"] }),
  action(startBusinessFileUpload, { entities: [...entities] }),
  action(getBusinessUploadParts, { entities: [...entities] }),
  action(resumeBusinessFileUpload, { entities: [...entities] }),
  action(completeBusinessFileUpload, { entities: [...entities] }),
  action(abortBusinessFileUpload, { entities: [...entities] }),
  query(getBusinessFileAccessUrl, { entities: [...entities] }),
  query(getStorageOverview, { entities: [...entities] }),
  action(testObjectStorage, { entities: [...entities] }),
  job(cleanupBusinessFiles, {
    executor: "PgBoss",
    schedule: { cron: "17 * * * *" },
    entities: [...entities],
  }),
];
