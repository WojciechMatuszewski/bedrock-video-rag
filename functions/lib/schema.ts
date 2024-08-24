import { z } from "zod";

export const JSONParserSchema = z.string().transform((input, ctx) => {
  try {
    return JSON.parse(input);
  } catch (error) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Input must be a valid JSON string"
    });
    return z.NEVER;
  }
});
