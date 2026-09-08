import { defineEnvValidationSchema } from "wasp/env";

import * as z from "zod";
import { authEnvSchema } from "./auth/env";
import { bountyEnvSchema } from "./bounty/env";
import { fileUploadEnvSchema } from "./file-upload/env";

// Wasp merges this schema with its built-in env var validations and uses it
// to validate `process.env` at server startup. Access the validated env vars
// with `import { env } from 'wasp/server'` instead of using `process.env` directly.
// https://wasp.sh/docs/project/env-vars#custom-env-var-validations
//
// If you remove a feature (e.g. an analytics or payment provider), make sure
// to also remove its env schema import and `...schema.shape` below.
export const serverEnvValidationSchema = defineEnvValidationSchema(
  z.object({
    ...authEnvSchema.shape,
    ...bountyEnvSchema.shape,
    ...fileUploadEnvSchema.shape,
  }),
);
