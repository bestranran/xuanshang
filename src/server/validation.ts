import { HttpError } from "wasp/server";
import * as z from "zod";

export function ensureArgsSchemaOrThrowHttpError<Schema extends z.ZodType>(
  schema: Schema,
  rawArgs: unknown,
): z.infer<Schema> {
  const parseResult = schema.safeParse(rawArgs);
  if (!parseResult.success) {
    console.error(
      // We keep the `cause` property so that errors have stack traces pointing
      // to the original schema.
      new Error(
        "操作参数验证失败：\n" +
          z.prettifyError(parseResult.error),
        { cause: parseResult.error },
      ),
    );

    throw new HttpError(400, "操作参数验证失败", {
      cause: parseResult.error,
    });
  } else {
    return parseResult.data;
  }
}
