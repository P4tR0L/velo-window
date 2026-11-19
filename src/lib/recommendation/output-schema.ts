import { z } from "zod";
import type { WindowRecommendation } from "../../types.ts";

/** Length bounds of the model's text fields; shared by the JSON schema and the zod schema. */
export const RECOMMENDATION_LIMITS = {
  summaryMaxLength: 200,
  routeAdviceMaxLength: 400,
  styleTipsMinItems: 2,
  styleTipsMaxItems: 4,
  styleTipMaxLength: 160,
} as const;

/**
 * Strict JSON schema sent to the provider as the response format. Providers may not enforce
 * it, so every answer is validated again with `parseRecommendations`.
 */
export const RECOMMENDATION_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["recommendations"],
  properties: {
    recommendations: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["windowIndex", "summary", "routeAdvice", "styleTips"],
        properties: {
          windowIndex: { type: "integer", minimum: 0 },
          summary: { type: "string", minLength: 1, maxLength: RECOMMENDATION_LIMITS.summaryMaxLength },
          routeAdvice: { type: "string", minLength: 1, maxLength: RECOMMENDATION_LIMITS.routeAdviceMaxLength },
          styleTips: {
            type: "array",
            minItems: RECOMMENDATION_LIMITS.styleTipsMinItems,
            maxItems: RECOMMENDATION_LIMITS.styleTipsMaxItems,
            items: { type: "string", minLength: 1, maxLength: RECOMMENDATION_LIMITS.styleTipMaxLength },
          },
        },
      },
    },
  },
} as const;

const recommendationEntrySchema = z.strictObject({
  windowIndex: z.number().int().min(0),
  summary: z.string().trim().min(1).max(RECOMMENDATION_LIMITS.summaryMaxLength),
  routeAdvice: z.string().trim().min(1).max(RECOMMENDATION_LIMITS.routeAdviceMaxLength),
  styleTips: z
    .array(z.string().trim().min(1).max(RECOMMENDATION_LIMITS.styleTipMaxLength))
    .min(RECOMMENDATION_LIMITS.styleTipsMinItems)
    .max(RECOMMENDATION_LIMITS.styleTipsMaxItems),
});

const recommendationAnswerSchema = z.strictObject({
  recommendations: z.array(recommendationEntrySchema),
});

/**
 * Validate a model answer against the contract.
 *
 * All-or-nothing: returns one recommendation per window, ordered by window index, or `null`
 * for invalid JSON, a schema failure, a count different from `windowCount`, or a duplicate or
 * out-of-range index.
 */
export function parseRecommendations(content: string, windowCount: number): WindowRecommendation[] | null {
  let json: unknown;
  try {
    json = JSON.parse(content);
  } catch {
    return null;
  }

  const parsed = recommendationAnswerSchema.safeParse(json);
  if (!parsed.success) return null;

  const { recommendations } = parsed.data;
  if (recommendations.length !== windowCount) return null;

  const byIndex = new Map<number, WindowRecommendation>();
  for (const { windowIndex, summary, routeAdvice, styleTips } of recommendations) {
    if (windowIndex >= windowCount || byIndex.has(windowIndex)) return null;
    byIndex.set(windowIndex, { summary, routeAdvice, styleTips });
  }

  const ordered: WindowRecommendation[] = [];
  for (let index = 0; index < windowCount; index++) {
    const recommendation = byIndex.get(index);
    if (!recommendation) return null;
    ordered.push(recommendation);
  }
  return ordered;
}
