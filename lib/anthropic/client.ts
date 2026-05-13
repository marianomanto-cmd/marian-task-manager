import Anthropic from "@anthropic-ai/sdk";

let cached: Anthropic | null = null;

/** Single-process cached client. Throws if the env var isn't set. */
export function getAnthropicClient(): Anthropic {
  if (cached) return cached;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not configured. Email classification is disabled.",
    );
  }
  cached = new Anthropic({ apiKey });
  return cached;
}

export const CLASSIFY_MODEL = "claude-haiku-4-5-20251001";

/**
 * Per SPEC §6: Haiku 4.5 input is $1/MTok, output $5/MTok. Helpers for the
 * estimated_cost_usd column in sync_log.
 */
export const HAIKU_PRICING_USD = {
  input_per_million: 1.0,
  output_per_million: 5.0,
} as const;

export function estimateCostUsd(
  inputTokens: number,
  outputTokens: number,
): number {
  return (
    (inputTokens / 1_000_000) * HAIKU_PRICING_USD.input_per_million +
    (outputTokens / 1_000_000) * HAIKU_PRICING_USD.output_per_million
  );
}
