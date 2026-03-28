/**
 * Standalone conversation title generator.
 *
 * Priority order:
 *   1. Anthropic claude-haiku-4 (if ANTHROPIC_API_KEY / resolvedApiKey is set)
 *   2. OpenRouter — nvidia/nemotron-3-nano-30b-a3b:free with automatic fallback
 *      to openrouter/free (OpenRouter handles the failover natively via the
 *      `models` array; first entry is attempted first, subsequent entries are
 *      tried on any error).
 *
 * Set OPENROUTER_API_KEY in your environment to enable the OpenRouter path.
 */

import Anthropic from '@anthropic-ai/sdk';

// OpenRouter model priority list — first is primary, rest are automatic fallbacks.
// OpenRouter's native fallback routes through the list on any upstream error
// (rate-limit, context exceeded, moderation, downtime, etc.).
const OPENROUTER_MODELS = [
  'nvidia/nemotron-3-nano-30b-a3b:free',
  'openrouter/free',
] as const;

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

export interface TitleGeneratorOptions {
  /** Most recent user message text (truncated externally if needed) */
  userText: string;
  /** Most recent assistant response text (truncated externally if needed) */
  assistantText?: string;
  /** Anthropic API key — used first when present */
  anthropicApiKey?: string;
  /** OpenRouter API key — used as fallback when Anthropic is unavailable */
  openRouterApiKey?: string;
}

function buildPrompt(userText: string, assistantText?: string): string {
  const context = assistantText
    ? `User: ${userText}\n\nAssistant: ${assistantText}`
    : `User: ${userText}`;

  return (
    `Generate a short, expressive title (4-7 words) that captures the essence of this conversation. ` +
    `Be vivid and specific — avoid generic phrases like "Code Review" or "Help with". ` +
    `Return ONLY the title, no quotes, punctuation, or explanation.\n\n${context}`
  );
}

/**
 * Generate a conversation title using the best available model.
 * Returns `null` if no API key is configured or all attempts fail.
 */
export async function generateConversationTitle(
  options: TitleGeneratorOptions,
): Promise<string | null> {
  const { userText, assistantText, anthropicApiKey, openRouterApiKey } = options;
  const prompt = buildPrompt(userText, assistantText);

  // ── Path A: Anthropic Haiku ────────────────────────────────────────────────
  if (anthropicApiKey) {
    try {
      const client = new Anthropic({ apiKey: anthropicApiKey });
      const res = await client.messages.create({
        model: 'claude-haiku-4-20250414',
        max_tokens: 30,
        messages: [{ role: 'user', content: prompt }],
      });
      const block = res.content[0];
      if (block?.type === 'text') {
        const title = block.text.trim().substring(0, 100);
        if (title) return title;
      }
    } catch (err) {
      console.log(
        `[TitleGenerator] Anthropic path failed, falling back to OpenRouter: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // ── Path B: OpenRouter (Nemotron → openrouter/free via native fallback) ────
  if (!openRouterApiKey) {
    console.log('[TitleGenerator] No API key available — set ANTHROPIC_API_KEY or OPENROUTER_API_KEY');
    return null;
  }

  try {
    const res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openRouterApiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://aperture.app',
        'X-Title': 'Aperture',
      },
      body: JSON.stringify({
        // OpenRouter processes this list in priority order — if the first model
        // returns any error, it automatically retries with the next entry.
        models: OPENROUTER_MODELS,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 30,
      }),
    });

    if (res.ok) {
      const data = await res.json() as {
        choices?: Array<{ message?: { content?: string } }>;
        model?: string;
      };
      const raw = data.choices?.[0]?.message?.content?.trim();
      if (raw) {
        console.log(`[TitleGenerator] Generated via ${data.model ?? 'unknown'}`);
        return raw.substring(0, 100);
      }
    } else {
      const body = await res.text().catch(() => '');
      console.log(`[TitleGenerator] OpenRouter error ${res.status}: ${body}`);
    }
  } catch (err) {
    console.log(
      `[TitleGenerator] OpenRouter request failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  return null;
}
