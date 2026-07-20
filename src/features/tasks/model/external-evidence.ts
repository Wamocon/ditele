import { z } from "zod";

const HttpsEvidenceUrlSchema = z
  .string()
  .trim()
  .min(1)
  .max(2048)
  .url()
  .superRefine((value, context) => {
    if (!/^https:\/\/[^/?#\s]+(?:[/?#][^\s]*)?$/i.test(value)) {
      context.addIssue({
        code: "custom",
        message: "tasks.evidence_https_url_required",
      });
      return;
    }
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      context.addIssue({
        code: "custom",
        message: "tasks.evidence_https_url_required",
      });
      return;
    }
    if (
      url.protocol !== "https:" ||
      url.hostname.length === 0 ||
      url.username.length > 0 ||
      url.password.length > 0
    ) {
      context.addIssue({
        code: "custom",
        message: "tasks.evidence_https_url_required",
      });
    }
  })
  .transform((value) => new URL(value).toString());

export const CreateExternalEvidenceInputSchema = z.object({
  attemptId: z.string().uuid().optional(),
  title: z.string().trim().min(1).max(255),
  sourceUri: HttpsEvidenceUrlSchema,
  idempotencyKey: z.string().trim().min(16).max(128),
}).strict();

export type CreateExternalEvidenceInput = z.infer<
  typeof CreateExternalEvidenceInputSchema
>;
