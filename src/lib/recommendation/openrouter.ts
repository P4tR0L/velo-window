import { z } from "zod";
import type { WindowRecommendation } from "../../types.ts";
import { parseRecommendations, RECOMMENDATION_JSON_SCHEMA } from "./output-schema.ts";

export const OPENROUTER_CHAT_COMPLETIONS_URL = "https://openrouter.ai/api/v1/chat/completions";

/**
 * Model used when `OPENROUTER_MODEL` is not set: a fast, low-cost, non-reasoning instruction
 * model whose OpenRouter listing supports `json_schema` structured outputs.
 */
export const DEFAULT_RECOMMENDATION_MODEL = "openai/gpt-4.1-nano";

/** Low temperature: advice should stay close to the supplied numbers. */
const TEMPERATURE = 0.3;
const MAX_TOKENS_PER_WINDOW = 300;
const MAX_TOKENS_CAP = 2000;

export type RecommendationErrorCode = "unavailable" | "invalid-output";

/** Typed failure of the recommendation step; the message never contains the key, prompt or model output. */
export class RecommendationError extends Error {
  code: RecommendationErrorCode;

  constructor(code: RecommendationErrorCode, message: string) {
    super(message);
    this.name = "RecommendationError";
    this.code = code;
  }
}

export interface RequestRecommendationsInput {
  apiKey: string;
  model: string;
  prompt: { system: string; user: string };
  windowCount: number;
  signal: AbortSignal;
}

/** Only the parts of the chat completion that this client reads; everything else is ignored. */
const chatCompletionSchema = z.object({
  error: z.unknown().optional(),
  choices: z
    .array(
      z.object({
        error: z.unknown().optional(),
        message: z.object({ content: z.string().nullish() }).nullish(),
      }),
    )
    .optional(),
});

function unavailable(): RecommendationError {
  return new RecommendationError("unavailable", "Recommendations are currently unavailable.");
}

function invalidOutput(): RecommendationError {
  return new RecommendationError("invalid-output", "The recommendation answer was not usable.");
}

function maxTokensFor(windowCount: number): number {
  return Math.min(Math.max(windowCount, 1) * MAX_TOKENS_PER_WINDOW, MAX_TOKENS_CAP);
}

/**
 * Ask OpenRouter for one recommendation per window.
 *
 * Network errors, aborts, non-2xx answers, provider errors and missing content throw
 * `unavailable`; content that is present but fails validation throws `invalid-output`.
 */
export async function requestRecommendations(input: RequestRecommendationsInput): Promise<WindowRecommendation[]> {
  const { apiKey, model, prompt, windowCount, signal } = input;

  let body: unknown;
  try {
    const response = await fetch(OPENROUTER_CHAT_COMPLETIONS_URL, {
      method: "POST",
      signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: prompt.system },
          { role: "user", content: prompt.user },
        ],
        temperature: TEMPERATURE,
        max_tokens: maxTokensFor(windowCount),
        response_format: {
          type: "json_schema",
          json_schema: { name: "ride_recommendations", strict: true, schema: RECOMMENDATION_JSON_SCHEMA },
        },
        provider: { require_parameters: true },
      }),
    });
    if (!response.ok) throw unavailable();
    body = (await response.json()) as unknown;
  } catch (error) {
    throw error instanceof RecommendationError ? error : unavailable();
  }

  const parsed = chatCompletionSchema.safeParse(body);
  if (!parsed.success) throw unavailable();

  const { error, choices } = parsed.data;
  const choice = choices?.[0];
  if (error != null || !choice || choice.error != null) throw unavailable();

  const content = choice.message?.content;
  if (typeof content !== "string" || content.trim() === "") throw unavailable();

  const recommendations = parseRecommendations(content, windowCount);
  if (!recommendations) throw invalidOutput();
  return recommendations;
}
